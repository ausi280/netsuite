import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getLegacyDb } from '../db/legacyDbConnection';
import { bootstrap } from '../bootstrap';
import { paramString } from './controller';
import { getEntityConfig } from './entityRegistry';
import { getContractDossier } from './contractDossierRepository';
import { getCommissionsByVendedor, resolveSelfVendedorId } from './commissionsRepository';
import type { VendedorCommissionGroup } from './commissionsRepository';
import { buildCommissionsCsv } from './commissionsExport';
import { generateCommissionsPdf } from './commissionsPdf';
import { getNotasCobranza } from './notasCobranzaRepository';
import { getNetSuiteNotesForContract } from './netsuiteNotesRepository';
import { applySubsidiaryRestriction } from './reportingRepository';
import type { UserPermissions } from './permissionsRepository';

const CONTRACTS_CONFIG = getEntityConfig('contracts')!;

// Exported for commissionLevelsController.ts - assigning a vendedor's nivel and editing the
// commission-tier table are both part of the same commissions feature, gated by the same
// "can see contracts" permission as the commissions report itself, not a separate admin-only check.
export function isContractsAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has(CONTRACTS_CONFIG.key));
}

export function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
  return permissions.isAdmin ? null : permissions.allowedSubsidiaries;
}

/**
 * Whether this caller sees EVERY vendedor's commissions (as opposed to only their own, via the
 * separate self-vendedor path below). Having 'contracts' used to be sufficient on its own; now
 * 'commissions' is a second, additional gate on top of it - a user with 'contracts' but not
 * 'commissions' no longer sees the full grid (they fall through to the self-vendedor check
 * instead, same as anyone else without full access). A 'commissions' grant with no 'contracts'
 * does nothing - see PermissionKey in types.ts.
 */
function isCommissionsFullAccessAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || (permissions?.allowedEntities.has('contracts') && permissions?.allowedEntities.has('commissions')));
}

/** GET /api/reports/contracts/:id/dossier — rich single-contract view (resolved names, services, annuities). */
export async function getContractDossierRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const dossier = await getContractDossier(knex, id, subsidiaryRestrictionFor(permissions!));
  if (!dossier) {
    res.status(404).json({ success: false, message: `Contract record not found for id ${id}` });
    return;
  }

  res.status(200).json({ success: true, data: dossier });
}

function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface CommissionsDataResult {
  ok: true;
  data: VendedorCommissionGroup[];
  month: number;
  year: number;
  isSelfVendedor: boolean;
}

interface CommissionsDataError {
  ok: false;
  status: number;
  message: string;
}

/**
 * Shared auth + query-parsing + fetch behind getCommissionsReportRoute, getCommissionsExportRoute
 * and getCommissionsPdfRoute - every one of them must see exactly the same rows, gated the same
 * two ways: full access (isCommissionsFullAccessAllowed - 'contracts' AND 'commissions', or admin
 * - sees every vendedor, subsidiary-restricted as usual), or a "self-vendedor" - a caller without
 * full access whose Entra email matches a netsuite_employees row that has actually sold something
 * (resolveSelfVendedorId) - who sees ONLY their own commissions, unrestricted by subsidiary (a
 * self-vendedor may hold no subsidiary grants at all, so applying that restriction here would
 * zero out their own results instead of actually narrowing anything).
 */
async function loadCommissionsData(req: Request): Promise<CommissionsDataResult | CommissionsDataError> {
  const permissions = req.permissions;
  const fullAccess = isCommissionsFullAccessAllowed(permissions);
  const selfVendedorId = fullAccess ? null : await resolveSelfVendedorId(knex, req.auditUser?.username ?? null);

  if (!fullAccess && !selfVendedorId) {
    return { ok: false, status: 403, message: 'No tienes permiso para ver este reporte.' };
  }

  const month = parsePositiveInt(req.query.month);
  const year = parsePositiveInt(req.query.year);
  if (!month || month > 12 || !year || year < 2000 || year > 2100) {
    return { ok: false, status: 400, message: 'Provide a valid ?month=1-12 and ?year=YYYY.' };
  }

  const currency = typeof req.query.currency === 'string' ? req.query.currency.trim() : undefined;
  const restrictSubsidiaries = fullAccess ? subsidiaryRestrictionFor(permissions!) : null;
  const data = await getCommissionsByVendedor(knex, getLegacyDb(), month, year, restrictSubsidiaries, req.query.subsidiary, currency, selfVendedorId);
  return { ok: true, data, month, year, isSelfVendedor: Boolean(selfVendedorId) };
}

/** GET /api/reports/contracts/commissions?month=1-12&year=YYYY — new-contract salesperson commissions grid. */
export async function getCommissionsReportRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, data: result.data, month: result.month, year: result.year, isSelfVendedor: result.isSelfVendedor });
}

/** GET /api/reports/contracts/commissions/export?month=1-12&year=YYYY — the same commissions grid
 * as getCommissionsReportRoute, flattened to one CSV row per contract/otros-contrato instead of
 * nested JSON (see commissionsExport.ts). Same auth/scoping - a self-vendedor exports only their
 * own rows. */
export async function getCommissionsExportRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }

  const filename = `comisiones-${result.year}-${String(result.month).padStart(2, '0')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(buildCommissionsCsv(result.data));
}

/** GET /api/reports/contracts/commissions/pdf?month=1-12&year=YYYY — "Estado de cuenta de
 * Comisiones" PDF, one page per vendedor (see commissionsPdf.ts). Same auth/scoping as
 * getCommissionsReportRoute - a self-vendedor's PDF has exactly their own single page, since
 * loadCommissionsData already narrowed `result.data` down to just them. */
export async function getCommissionsPdfRoute(req: Request, res: Response): Promise<void> {
  const result = await loadCommissionsData(req);
  if (!result.ok) {
    res.status(result.status).json({ success: false, message: result.message });
    return;
  }

  if (result.data.length === 0) {
    res.status(404).json({ success: false, message: 'No hay comisiones para este periodo.' });
    return;
  }

  const filename = `estado-cuenta-comisiones-${result.year}-${String(result.month).padStart(2, '0')}.pdf`;
  const pdf = await generateCommissionsPdf(result.data, result.month, result.year);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(pdf);
}

/**
 * GET /api/reports/contracts/:id/notas — collection-call notes from the pre-NetSuite CryoCell
 * system (NotasCobranza), until NetSuite-native notes exist. Looks up the contract's legacy folio
 * (custrecord_cryo_contratosistemaanterior) first, enforcing the same subsidiary restriction as
 * the dossier route so this can't be used to probe a contract the caller isn't allowed to see.
 */
export async function getContractNotasRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const contractQuery = knex('netsuite_contracts')
    .where('netsuite_id', id)
    .select('custrecord_cryo_contratosistemaanterior as folio');

  const restrictSubsidiaries = subsidiaryRestrictionFor(permissions!);
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(contractQuery, 'custrecord_cryo_subsidiariacontrato', restrictSubsidiaries);
  }

  const contract = (await contractQuery.first()) as { folio: string | null } | undefined;
  if (!contract) {
    res.status(404).json({ success: false, message: `Contract record not found for id ${id}` });
    return;
  }

  if (!contract.folio) {
    res.status(200).json({ success: true, data: [], folio: null });
    return;
  }

  try {
    const data = await getNotasCobranza(getLegacyDb(), contract.folio);
    res.status(200).json({ success: true, data, folio: contract.folio });
  } catch (error) {
    console.error(`Error fetching legacy notas for contract ${id} (folio ${contract.folio}):`, error);
    res.status(502).json({ success: false, message: 'No se pudieron cargar las notas del sistema anterior.' });
  }
}

/**
 * GET /api/reports/contracts/:id/netsuite-notes — NetSuite-native Notes (the note.nl UI page),
 * via the "Get notes" RESTlet (see netsuiteNotesRepository.ts). Enforces the same subsidiary
 * restriction as the dossier route so this can't be used to probe a contract the caller isn't
 * allowed to see.
 */
export async function getContractNetSuiteNotesRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const contractQuery = knex('netsuite_contracts').where('netsuite_id', id).select('netsuite_id');

  const restrictSubsidiaries = subsidiaryRestrictionFor(permissions!);
  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(contractQuery, 'custrecord_cryo_subsidiariacontrato', restrictSubsidiaries);
  }

  const contract = await contractQuery.first();
  if (!contract) {
    res.status(404).json({ success: false, message: `Contract record not found for id ${id}` });
    return;
  }

  try {
    const data = await getNetSuiteNotesForContract(bootstrap().http, id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`Error fetching NetSuite notes for contract ${id}:`, error);
    res.status(502).json({ success: false, message: 'No se pudieron cargar las notas de NetSuite.' });
  }
}
