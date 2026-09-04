import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getEntityConfig, listEntityConfigs } from './entityRegistry';
import { buildExportQuery, getEntitySummaries, getPagedRows, getRowById, getSubsidiaryOptions } from './reportingRepository';
import { getPartidaBreakdown, PARTIDA_DIMENSIONS } from './partidaAnalyticsRepository';
import type { PartidaDimension } from './partidaAnalyticsRepository';
import { buildEnrichedPartidaExportQuery, getEnrichedPartidaRows, PARTIDA_LIST_EXPORT_COLUMNS } from './partidaListRepository';
import { getPaymentsList } from './paymentsListRepository';
import { buildVendorTransactionsExportQuery, getVendorTransactionsList, VENDOR_TRANSACTIONS_EXPORT_COLUMNS } from './vendorTransactionsListRepository';
import type { UserPermissions } from './permissionsRepository';
import type { EntityConfig } from './types';
import { csvRow, formatExportValue, humanizeColumnName } from './csvExport';

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

/** GET /api/reports/entities — one summary row per entity the caller may see, in registry order. */
export async function listEntitySummaries(req: Request, res: Response): Promise<void> {
  // req.permissions is always set by buildPermissionsMiddleware for any request reaching this
  // handler; the empty-everything fallback only matters if that invariant is ever broken.
  const permissions: UserPermissions = req.permissions ?? { isAdmin: false, allowedEntities: new Set(), allowedSubsidiaries: new Set() };
  const configs = listEntityConfigs().filter((c) => isEntityAllowed(permissions, c));

  const data = await getEntitySummaries(knex, configs, subsidiaryRestrictionFor(permissions));
  res.status(200).json({ success: true, data, isAdmin: permissions.isAdmin });
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
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { page, pageSize, search, sortBy, sortDir, subsidiary, estatus, vendorId, dateFrom, dateTo } = req.query;
  const restrictSubsidiaries = subsidiaryRestrictionFor(permissions);

  // Partidas gets the parent contract's name/dueño joined in, Payments gets its JSON_VALUE-
  // extracted contract id resolved to a real name (plus that contract's own subsidiary/a date
  // range), and vendor-transactions gets the vendor name/Orden de Pago/Días Pendientes joined in -
  // none of these fit the plain generic-entity path every other entity uses.
  const result =
    entityKey === 'partidas'
      ? await getEnrichedPartidaRows(knex, { page, pageSize, search, sortBy, sortDir, subsidiary, estatus }, restrictSubsidiaries)
      : entityKey === 'payments'
        ? await getPaymentsList(knex, { page, pageSize, search, subsidiary, dateFrom, dateTo }, restrictSubsidiaries)
        : entityKey === 'vendor-transactions'
          ? await getVendorTransactionsList(knex, { page, pageSize, search, sortBy, sortDir, subsidiary, vendorId }, restrictSubsidiaries)
          : await getPagedRows(knex, config, { page, pageSize, search, sortBy, sortDir, subsidiary }, restrictSubsidiaries);

  res.status(200).json({ success: true, ...result });
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
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const row = await getRowById(knex, config, id, subsidiaryRestrictionFor(permissions));
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
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  // vendor-transactions' subsidiary is the linked vendor's own (netsuite_vendors.subsidiary), not
  // a plain column on netsuite_vendor_transactions itself - reuse the 'vendors' entity's config
  // (same table + column, and already has a working subsidiaryColumn) to get the real distinct
  // set instead of nothing.
  const optionsConfig = entityKey === 'vendor-transactions' ? getEntityConfig('vendors')! : config;
  const data = await getSubsidiaryOptions(knex, optionsConfig, subsidiaryRestrictionFor(permissions));
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
  if (!permissions || !isEntityAllowed(permissions, config)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const { search, sortBy, sortDir, subsidiary, estatus, vendorId } = req.query;
  const restrictSubsidiaries = subsidiaryRestrictionFor(permissions);
  const isPartidas = entityKey === 'partidas';
  const isVendorTransactions = entityKey === 'vendor-transactions';
  const exportColumns = isPartidas ? PARTIDA_LIST_EXPORT_COLUMNS : isVendorTransactions ? VENDOR_TRANSACTIONS_EXPORT_COLUMNS : config.listColumns;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${entityKey}.csv"`);
  // UTF-8 BOM so Excel (which otherwise guesses the system codepage) renders accented
  // characters/ñ correctly instead of mangling them.
  res.write('﻿');
  res.write(csvRow(exportColumns.map(humanizeColumnName)));

  let offset = 0;
  for (;;) {
    const query = isPartidas
      ? buildEnrichedPartidaExportQuery(knex, { search, sortBy, sortDir, subsidiary, estatus }, restrictSubsidiaries)
      : isVendorTransactions
        ? buildVendorTransactionsExportQuery(knex, { search, sortBy, sortDir, subsidiary, vendorId }, restrictSubsidiaries)
        : buildExportQuery(knex, config, { search, sortBy, sortDir, subsidiary }, restrictSubsidiaries);

    const batch = (await query.offset(offset).limit(EXPORT_BATCH_SIZE)) as Array<Record<string, unknown>>;

    for (const row of batch) {
      res.write(csvRow(exportColumns.map((column) => formatExportValue(column, row[column]))));
    }

    if (batch.length < EXPORT_BATCH_SIZE) break;
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
