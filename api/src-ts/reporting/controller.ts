import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getEntityConfig, listEntityConfigs } from './entityRegistry';
import { buildExportQuery, getEntitySummaries, getPagedRows, getRowById, getSubsidiaryOptions } from './reportingRepository';
import { getPartidaBreakdown, PARTIDA_DIMENSIONS } from './partidaAnalyticsRepository';
import type { PartidaDimension } from './partidaAnalyticsRepository';
import { buildEnrichedPartidaExportQuery, getEnrichedPartidaRows, PARTIDA_LIST_EXPORT_COLUMNS } from './partidaListRepository';
import { buildPaymentsExportQuery, getPaymentsList, PAYMENTS_EXPORT_COLUMNS, PAYMENTS_EXPORT_HEADERS, selectColumns as paymentsSelectColumns } from './paymentsListRepository';
import { buildVendorTransactionsExportQuery, getVendorTransactionsList, VENDOR_TRANSACTIONS_EXPORT_COLUMNS } from './vendorTransactionsListRepository';
import { buildOtrosContratoExportQuery, getEnrichedOtrosContratoRows, OTROS_CONTRATO_EXPORT_COLUMNS } from './otrosContratoListRepository';
import { buildFcellsContratoExportQuery, getEnrichedFcellsContratoRows, FCELLS_CONTRATO_EXPORT_COLUMNS } from './fcellsContratoListRepository';
import { addContractFacturaColumns, CONTRACT_FACTURA_COLUMNS, contractListFilter } from './contractListRepository';
import { getLegacyDb } from '../db/legacyDbConnection';
import type { UserPermissions } from './permissionsRepository';
import type { EntityConfig } from './types';
import { csvRow, formatExportValue, humanizeColumnName } from './csvExport';
import { isHrAllowed } from './hrController';
import { isProspectosAllowed } from './prospectosController';
import { isCobranzaCommissionsFullAccessAllowed } from './cobranzaCommissionsController';
import { isPostventaAllowed } from './postventaController';
import { isAdministracionAllowed } from './administracionController';
import { resolveSelfVendedorId } from './commissionsRepository';
import { resolveSelfPlanVendedorId } from './salesWorkPlanRepository';
import { resolveSelfCobradorDuenoId, resolveSelfCobradorDuenoSubsidiarias } from './cobranzaCommissionsRepository';

/** Express 5's ParamsDictionary types named params as `string | string[]` to account for wildcard segments; our routes only ever use simple `:name` segments, which are always plain strings at runtime. */
export function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

/** null = unrestricted (admin); otherwise the caller's exact allow-list, enforced everywhere a subsidiaryColumn exists. */
function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

function isEntityAllowed(permissions: UserPermissions, config: EntityConfig): boolean {
  return permissions.isAdmin || permissions.allowedEntities.has(config.key);
}

interface EntityAccess {
  allowed: boolean;
  /** Only ever set for a 'payments' self cobrador/dueño (null otherwise, meaning "use
   * subsidiaryRestrictionFor(permissions) as usual") - the real subsidiaria(s) where that employee
   * has contracts (resolveSelfCobradorDuenoSubsidiarias), NOT permissions.allowedSubsidiaries -
   * that's empty for a caller with no explicit 'payments' grant at all, which would zero out every
   * query via applySubsidiaryRestriction instead of actually scoping it (same trap
   * cobranzaCommissionsController.ts's loadCobranzaCommissionsData already documents avoiding). */
  selfSubsidiarias: Set<string> | null;
}

/** Same as isEntityAllowed, but for the 'payments' entity specifically also grants VIEW access to a
 * self cobrador/dueño (resolveSelfCobradorDuenoId) - the same "no explicit grant needed to see your
 * own" default Cobranza Commissions already gets, since a cobrador/dueño reasonably needs to see the
 * payments their own contracts received, scoped to the subsidiaria(s) where they actually have
 * contracts (same as Cobranza Commissions). Charging (chargeDomiciledRoute, and the `canCharge` flag
 * listEntityRows adds to the 'payments' response) stays gated by the plain explicit 'payments' grant
 * only - a self cobrador/dueño can look, not charge. */
async function resolveEntityAccess(permissions: UserPermissions, config: EntityConfig, email: string | null): Promise<EntityAccess> {
  if (isEntityAllowed(permissions, config)) return { allowed: true, selfSubsidiarias: null };
  if (config.key !== 'payments') return { allowed: false, selfSubsidiarias: null };

  const selfId = await resolveSelfCobradorDuenoId(knex, email);
  if (!selfId) return { allowed: false, selfSubsidiarias: null };

  const subsidiarias = await resolveSelfCobradorDuenoSubsidiarias(knex, selfId);
  return { allowed: true, selfSubsidiarias: subsidiarias.size > 0 ? subsidiarias : null };
}

/** Same "can this caller reach commissions" check as isCommissionsFullAccessAllowed + the
 * self-vendedor fallback in contractReportsController.ts's loadCommissionsData - duplicated in
 * miniature here (rather than imported, to avoid a circular import with
 * contractReportsController.ts, which already imports from this file) purely to decide whether to
 * show the caller a link into that report, from the dashboard or from within the Contracts entity
 * page. Having 'contracts' alone is NOT enough on its own - 'commissions' is a second, additional
 * gate on top of it (see PermissionKey in types.ts). */
async function resolveCanAccessCommissions(permissions: UserPermissions, email: string | null): Promise<boolean> {
  if (permissions.isAdmin || (permissions.allowedEntities.has('contracts') && permissions.allowedEntities.has('commissions'))) return true;
  return Boolean(await resolveSelfVendedorId(knex, email));
}

/** Plan de trabajo: same full-access gate as commissions, or a vendedor planning their own (which
 * also covers a new vendedor with a nivel but no sales yet - see resolveSelfPlanVendedorId). */
async function resolveCanAccessWorkPlan(permissions: UserPermissions, email: string | null): Promise<boolean> {
  if (permissions.isAdmin || (permissions.allowedEntities.has('contracts') && permissions.allowedEntities.has('commissions'))) return true;
  return Boolean(await resolveSelfPlanVendedorId(knex, email));
}

/** GET /api/reports/entities — one summary row per entity the caller may see, in registry order. */
export async function listEntitySummaries(req: Request, res: Response): Promise<void> {
  // req.permissions is always set by buildPermissionsMiddleware for any request reaching this
  // handler; the empty-everything fallback only matters if that invariant is ever broken.
  const permissions: UserPermissions = req.permissions ?? { isAdmin: false, allowedEntities: new Set(), allowedSubsidiaries: new Set() };
  const email = req.auditUser?.username ?? null;

  // Resolved once and reused for both canAccessCobranzaCommissions and the 'payments' tile's own
  // view access below - same person, same request, no need for resolveEntityAccess's own lookup to
  // run a second time.
  const selfCobradorDuenoId = isCobranzaCommissionsFullAccessAllowed(permissions) ? null : await resolveSelfCobradorDuenoId(knex, email);
  const canAccessCobranzaCommissions = isCobranzaCommissionsFullAccessAllowed(permissions) || Boolean(selfCobradorDuenoId);

  const explicitConfigs = listEntityConfigs().filter((c) => isEntityAllowed(permissions, c));
  // Only added when 'payments' isn't ALREADY in explicitConfigs via a real grant - a caller with
  // both an explicit grant and self-access just uses their real grant's (differently-scoped)
  // restriction, same as resolveEntityAccess's own explicit-grant-wins ordering.
  const includeSelfPayments = Boolean(selfCobradorDuenoId) && !explicitConfigs.some((c) => c.key === 'payments');

  const [explicitData, selfPaymentsData, canAccessCommissions, canAccessWorkPlan] = await Promise.all([
    getEntitySummaries(knex, explicitConfigs, subsidiaryRestrictionFor(permissions)),
    includeSelfPayments
      ? resolveSelfCobradorDuenoSubsidiarias(knex, selfCobradorDuenoId!).then((subsidiarias) =>
          getEntitySummaries(knex, [getEntityConfig('payments')!], subsidiarias.size > 0 ? subsidiarias : null),
        )
      : Promise.resolve([]),
    resolveCanAccessCommissions(permissions, email),
    resolveCanAccessWorkPlan(permissions, email),
  ]);
  const data = [...explicitData, ...selfPaymentsData];
  res.status(200).json({
    success: true,
    data,
    isAdmin: permissions.isAdmin,
    canAccessHr: isHrAllowed(permissions),
    canAccessCommissions,
    canAccessWorkPlan,
    canAccessProspectos: isProspectosAllowed(permissions),
    canAccessCobranzaCommissions,
    canAccessPostventa: isPostventaAllowed(permissions),
    canAccessAdministracion: isAdministracionAllowed(permissions),
  });
}

/** GET /api/reports/:entity?page=&pageSize=&search=&sortBy=&sortDir=&subsidiary= */
export async function listEntityRows(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }
  const access = await resolveEntityAccess(permissions, config, req.auditUser?.username ?? null);
  if (!access.allowed) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { page, pageSize, search, sortBy, sortDir, subsidiary, estatus, vendorId, dateFrom, dateTo, saldoInicial, factura } = req.query;
  const restrictSubsidiaries = access.selfSubsidiarias ?? subsidiaryRestrictionFor(permissions);
  const isContracts = entityKey === 'contracts';

  // Partidas gets the parent contract's name/dueño joined in, Payments gets its JSON_VALUE-
  // extracted contract id resolved to a real name (plus that contract's own subsidiary/a date
  // range), vendor-transactions gets the vendor name/Orden de Pago/Días Pendientes joined in,
  // otros-contratos gets its linked "Servicio" name/price joined in, and fcells-contratos gets its
  // vendedor name joined in - none of these fit the plain generic-entity path every other entity uses.
  const result =
    entityKey === 'partidas'
      ? await getEnrichedPartidaRows(knex, { page, pageSize, search, sortBy, sortDir, subsidiary, estatus }, restrictSubsidiaries)
      : entityKey === 'payments'
        ? await getPaymentsList(knex, { page, pageSize, search, subsidiary, dateFrom, dateTo }, restrictSubsidiaries)
        : entityKey === 'vendor-transactions'
          ? await getVendorTransactionsList(knex, { page, pageSize, search, sortBy, sortDir, subsidiary, vendorId }, restrictSubsidiaries)
          : entityKey === 'otros-contratos'
            ? await getEnrichedOtrosContratoRows(knex, { page, pageSize, search, sortBy, sortDir, subsidiary, dateFrom, dateTo }, restrictSubsidiaries)
            : entityKey === 'fcells-contratos'
              ? await getEnrichedFcellsContratoRows(knex, { page, pageSize, search, sortBy, sortDir, subsidiary }, restrictSubsidiaries)
              : await getPagedRows(
                  knex,
                  config,
                  { page, pageSize, search, sortBy, sortDir, subsidiary },
                  restrictSubsidiaries,
                  isContracts ? contractListFilter({ dateFrom, dateTo, saldoInicial }) : undefined,
                );

  // Contratos' optional "factura inicial" columns (same as Reporte Contratos' checkbox).
  if (isContracts && factura === '1') await addContractFacturaColumns(knex, getLegacyDb(), result.data);

  // Only meaningful for 'payments' - whether this caller may actually charge (the "Cobrar" button/
  // chargeDomiciledRoute), as opposed to merely viewing the list (which a self cobrador/dueño may
  // now do without the explicit grant - see isEntityViewAllowed). Always true for every other
  // entity's viewer, which has no such distinction.
  const canCharge = entityKey === 'payments' ? isEntityAllowed(permissions, config) : true;

  res.status(200).json({ success: true, ...result, canCharge });
}

/** GET /api/reports/:entity/:id — full row (raw_data parsed to an object) looked up by idColumn. */
export async function getEntityRowDetail(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }
  const access = await resolveEntityAccess(permissions, config, req.auditUser?.username ?? null);
  if (!access.allowed) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const row = await getRowById(knex, config, id, access.selfSubsidiarias ?? subsidiaryRestrictionFor(permissions));
  if (!row) {
    res.status(404).json({ success: false, message: `${config.label} record not found for id ${id}` });
    return;
  }

  res.status(200).json({ success: true, data: row });
}

/** GET /api/reports/:entity/subsidiaries — distinct subsidiary ids the caller may filter by for this entity (empty array if the entity has no subsidiary column synced, or the caller isn't allowed to see any). */
export async function listSubsidiaryOptions(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }
  const access = await resolveEntityAccess(permissions, config, req.auditUser?.username ?? null);
  if (!access.allowed) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  // vendor-transactions' subsidiary is the linked vendor's own (netsuite_vendors.subsidiary), not
  // a plain column on netsuite_vendor_transactions itself - reuse the 'vendors' entity's config
  // (same table + column, and already has a working subsidiaryColumn) to get the real distinct
  // set instead of nothing.
  const optionsConfig = entityKey === 'vendor-transactions' ? getEntityConfig('vendors')! : config;
  const data = await getSubsidiaryOptions(knex, optionsConfig, access.selfSubsidiarias ?? subsidiaryRestrictionFor(permissions));
  res.status(200).json({ success: true, data });
}

const EXPORT_BATCH_SIZE = 5000;

/** GET /api/reports/:entity/export?search=&sortBy=&sortDir=&subsidiary= — the same filtered/sorted
 * rows listEntityRows would page through, streamed out as one CSV file instead of JSON pages. */
export async function exportEntityRows(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }
  const access = await resolveEntityAccess(permissions, config, req.auditUser?.username ?? null);
  if (!access.allowed) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { search, sortBy, sortDir, subsidiary, estatus, vendorId, dateFrom, dateTo, saldoInicial, factura } = req.query;
  const restrictSubsidiaries = access.selfSubsidiarias ?? subsidiaryRestrictionFor(permissions);
  const isPartidas = entityKey === 'partidas';
  const isContracts = entityKey === 'contracts';
  const withFactura = isContracts && factura === '1';
  const isVendorTransactions = entityKey === 'vendor-transactions';
  const isOtrosContratos = entityKey === 'otros-contratos';
  const isFcellsContratos = entityKey === 'fcells-contratos';
  const isPayments = entityKey === 'payments';
  const paymentsColumns = isPayments ? await paymentsSelectColumns(knex) : [];
  const exportColumns = isPartidas
    ? PARTIDA_LIST_EXPORT_COLUMNS
    : isVendorTransactions
      ? VENDOR_TRANSACTIONS_EXPORT_COLUMNS
      : isOtrosContratos
        ? OTROS_CONTRATO_EXPORT_COLUMNS
        : isFcellsContratos
          ? FCELLS_CONTRATO_EXPORT_COLUMNS
          : isPayments
            ? PAYMENTS_EXPORT_COLUMNS
            : withFactura
              ? [...config.listColumns, ...CONTRACT_FACTURA_COLUMNS]
              : config.listColumns;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${entityKey}.csv"`);
  // UTF-8 BOM so Excel (which otherwise guesses the system codepage) renders accented
  // characters/ñ correctly instead of mangling them.
  res.write('﻿');
  res.write(csvRow(exportColumns.map((column) => (isPayments ? PAYMENTS_EXPORT_HEADERS[column] : humanizeColumnName(column)))));

  let offset = 0;
  for (;;) {
    const query = isPartidas
      ? buildEnrichedPartidaExportQuery(knex, { search, sortBy, sortDir, subsidiary, estatus }, restrictSubsidiaries)
      : isVendorTransactions
        ? buildVendorTransactionsExportQuery(knex, { search, sortBy, sortDir, subsidiary, vendorId }, restrictSubsidiaries)
        : isOtrosContratos
          ? buildOtrosContratoExportQuery(knex, { search, sortBy, sortDir, subsidiary, dateFrom, dateTo }, restrictSubsidiaries)
          : isFcellsContratos
            ? buildFcellsContratoExportQuery(knex, { search, sortBy, sortDir, subsidiary }, restrictSubsidiaries)
            : isPayments
              ? buildPaymentsExportQuery(knex, { search, subsidiary, dateFrom, dateTo }, restrictSubsidiaries, paymentsColumns)
              : buildExportQuery(
                  knex,
                  config,
                  { search, sortBy, sortDir, subsidiary },
                  restrictSubsidiaries,
                  isContracts ? contractListFilter({ dateFrom, dateTo, saldoInicial }) : undefined,
                );

    // With factura columns the whole set is read at once instead of batched, so the CryoWeb
    // Docs Completos lookup runs once (a full-table read past its threshold) rather than per batch.
    const batch = (await (withFactura ? query : query.offset(offset).limit(EXPORT_BATCH_SIZE))) as Array<Record<string, unknown>>;
    if (withFactura) await addContractFacturaColumns(knex, getLegacyDb(), batch);

    for (const row of batch) {
      res.write(csvRow(exportColumns.map((column) => formatExportValue(column, row[column]))));
    }

    if (withFactura || batch.length < EXPORT_BATCH_SIZE) break;
    offset += batch.length;
  }

  res.end();
}

function isPartidaDimension(value: unknown): value is PartidaDimension {
  return typeof value === 'string' && (PARTIDA_DIMENSIONS as string[]).includes(value);
}

/**
 * GET /api/reports/:entity/analytics?dimension=month|status|subsidiary|servicetype
 * Only 'partidas' supports analytics today; other entities 400. Enforces the same
 * entity + subsidiary permission checks as every other reporting route.
 */
export async function getPartidaAnalytics(req: Request, res: Response): Promise<void> {
  const entityKey = paramString(req.params.entity);
  const config = getEntityConfig(entityKey);
  if (!config) {
    res.status(404).json({ success: false, message: `Unknown report entity: ${entityKey}` });
    return;
  }

  if (entityKey !== 'partidas') {
    res.status(400).json({ success: false, message: `Analytics are not available for '${entityKey}'.` });
    return;
  }

  const permissions = req.permissions;
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { dimension } = req.query;
  if (!isPartidaDimension(dimension)) {
    res.status(400).json({
      success: false,
      message: `Invalid dimension. Expected one of: ${PARTIDA_DIMENSIONS.join(', ')}.`,
    });
    return;
  }

  const data = await getPartidaBreakdown(knex, dimension, subsidiaryRestrictionFor(permissions));
  res.status(200).json({ success: true, dimension, data });
}
