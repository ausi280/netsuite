import type { Request, Response } from 'express';
import knex from '../db/connection';
import { paramString } from './controller';
import { getEntityConfig } from './entityRegistry';
import { getContractDossier } from './contractDossierRepository';
import { getNewContractCommissions } from './commissionsRepository';
import type { UserPermissions } from './permissionsRepository';

const CONTRACTS_CONFIG = getEntityConfig('contracts')!;

function isContractsAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has(CONTRACTS_CONFIG.key));
}

function subsidiaryRestrictionFor(permissions: UserPermissions): Set<string> | null {
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

  const subsidiary = typeof req.query.subsidiary === 'string' ? req.query.subsidiary.trim() : undefined;
  const data = await getNewContractCommissions(knex, month, year, subsidiaryRestrictionFor(permissions!), subsidiary);
  res.status(200).json({ success: true, data, month, year });
}
