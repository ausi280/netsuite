import type { Request, Response } from 'express';
import knex from '../db/connection';
import { getLegacyDb } from '../db/legacyDbConnection';
import { paramString } from './controller';
import { getEntityConfig } from './entityRegistry';
import { getContractDossier } from './contractDossierRepository';
import { getCommissionsByVendedor } from './commissionsRepository';
import { getNotasCobranza } from './notasCobranzaRepository';
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

/** GET /api/reports/contracts/commissions?month=1-12&year=YYYY — new-contract salesperson commissions grid. */
export async function getCommissionsReportRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const month = parsePositiveInt(req.query.month);
  const year = parsePositiveInt(req.query.year);
  if (!month || month > 12 || !year || year < 2000 || year > 2100) {
    res.status(400).json({ success: false, message: 'Provide a valid ?month=1-12 and ?year=YYYY.' });
    return;
  }

  const currency = typeof req.query.currency === 'string' ? req.query.currency.trim() : undefined;
  const data = await getCommissionsByVendedor(knex, month, year, subsidiaryRestrictionFor(permissions!), req.query.subsidiary, currency);
  res.status(200).json({ success: true, data, month, year });
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
