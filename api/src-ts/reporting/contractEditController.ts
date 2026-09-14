import type { Request, Response } from 'express';
import knex from '../db/connection';
import { bootstrap } from '../bootstrap';
import { paramString } from './controller';
import { isContractsAllowed, subsidiaryRestrictionFor } from './contractReportsController';
import { getContractSubsidiary, listVendedorOptions, updateContractFields } from './contractEditRepository';
import type { ContractEditableFields } from './contractEditRepository';

/** GET /api/reports/contracts/vendedores — every employee (id + name), for the "Vendedor" edit field's picker. */
export async function listVendedorOptionsRoute(req: Request, res: Response): Promise<void> {
  if (!isContractsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const data = await listVendedorOptions(knex);
  res.status(200).json({ success: true, data });
}

// Only these two body keys are ever forwarded to NetSuite - anything else in the request body is
// silently ignored, so this can't become an accidental generic "write any field" endpoint.
function parseEditableFields(body: unknown): ContractEditableFields {
  const fields: ContractEditableFields = {};
  if (!body || typeof body !== 'object') return fields;

  const raw = body as Record<string, unknown>;
  if ('custrecord_cryo_contratosistemaanterior' in raw) {
    const value = raw.custrecord_cryo_contratosistemaanterior;
    fields.folioSistemaAnterior = typeof value === 'string' ? value.trim() || null : null;
  }
  if ('custrecord_cryo_vendedor' in raw) {
    const value = raw.custrecord_cryo_vendedor;
    fields.vendedorId = typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  return fields;
}

/** PATCH /api/reports/contracts/:id — edits custrecord_cryo_contratosistemaanterior and/or
 * custrecord_cryo_vendedor, writing to NetSuite first (the source of truth) and then mirroring the
 * change into the local netsuite_contracts row. Gated the same way reads are: the 'contracts'
 * permission plus the caller's subsidiary allow-list (an edit is not a higher-trust action than
 * viewing the same contract already is). */
export async function updateContractRoute(req: Request, res: Response): Promise<void> {
  const permissions = req.permissions;
  if (!isContractsAllowed(permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para ver este reporte.' });
    return;
  }

  const id = paramString(req.params.id);
  const contract = await getContractSubsidiary(knex, id);
  if (!contract) {
    res.status(404).json({ success: false, message: `Contract record not found for id ${id}` });
    return;
  }

  const restrictSubsidiaries = subsidiaryRestrictionFor(permissions!);
  if (restrictSubsidiaries !== null && (!contract.subsidiaria_id || !restrictSubsidiaries.has(contract.subsidiaria_id))) {
    res.status(403).json({ success: false, message: 'No tienes permiso para editar contratos de esta subsidiaria.' });
    return;
  }

  const fields = parseEditableFields(req.body);
  if (Object.keys(fields).length === 0) {
    res.status(400).json({
      success: false,
      message: 'Provide at least one of custrecord_cryo_contratosistemaanterior or custrecord_cryo_vendedor.',
    });
    return;
  }

  try {
    await updateContractFields(knex, bootstrap().http, id, fields);
  } catch (error) {
    console.error(`Error updating contract ${id} in NetSuite:`, error);
    res.status(502).json({
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo actualizar el contrato en NetSuite.',
    });
    return;
  }

  res.status(200).json({ success: true, data: { netsuite_id: id, ...fields } });
}
