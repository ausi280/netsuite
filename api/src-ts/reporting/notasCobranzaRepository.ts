import type { Knex } from 'knex';

export interface NotaCobranza {
  fecha: string | null;
  usuario: string | null;
  nota: string | null;
  urgente: boolean;
}

const TABLE = 'NotasCobranza';

/**
 * Collection-call notes from the pre-NetSuite CryoCell system, keyed by "Folio" - the legacy
 * contract number, stored on the NetSuite contract as custrecord_cryo_contratosistemaanterior
 * (confirmed by matching real Folio values against real contracts' this field). NetSuite-native
 * notes don't exist yet; this is the only note history until that's built.
 */
export async function getNotasCobranza(legacyDb: Knex, folio: string): Promise<NotaCobranza[]> {
  const rows = (await legacyDb(TABLE)
    .where('Folio', folio)
    .select('Fecha as fecha', 'Usuario as usuario', 'Nota as nota', 'Urgente as urgente')
    .orderBy('Fecha', 'desc')) as Array<{ fecha: unknown; usuario: string | null; nota: string | null; urgente: unknown }>;

  return rows.map((row) => ({
    fecha: row.fecha instanceof Date ? row.fecha.toISOString() : (row.fecha as string | null),
    usuario: row.usuario,
    nota: row.nota,
    urgente: Boolean(row.urgente),
  }));
}

export interface NotaCobranzaBulkRow {
  folio: string | null;
  fecha: string | null;
  usuario: string | null;
  nota: string | null;
  urgente: boolean;
}

/** "YYYY-MM-DD" dateTo -> the next day, so the range filter can use an exclusive `<` and still
 * include every note made anytime during dateTo itself (Fecha carries a time-of-day) - same
 * convention as paymentsListRepository.ts's nextDayIso. */
function nextDayIso(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Every NotasCobranza row across EVERY folio whose own Fecha falls within [dateFrom, dateTo]
 * ("YYYY-MM-DD") - the bulk/date-range counterpart to getNotasCobranza's single-folio lookup,
 * for the "Reporte de Notas" report (combined with NetSuite-native notes - see
 * notesReportRepository.ts's getCombinedNotesReport). Returns the raw Folio, not a resolved
 * contract name - the caller resolves Folio -> contract name against its own already-synced
 * netsuite_contracts table, since this legacy database has no notion of NetSuite contracts.
 */
export async function getNotasCobranzaReport(legacyDb: Knex, dateFrom: string, dateTo: string): Promise<NotaCobranzaBulkRow[]> {
  const rows = (await legacyDb(TABLE)
    .where('Fecha', '>=', dateFrom)
    .andWhere('Fecha', '<', nextDayIso(dateTo))
    .select('Folio as folio', 'Fecha as fecha', 'Usuario as usuario', 'Nota as nota', 'Urgente as urgente')
    .orderBy('Fecha', 'desc')) as Array<{ folio: string | null; fecha: unknown; usuario: string | null; nota: string | null; urgente: unknown }>;

  return rows.map((row) => ({
    folio: row.folio,
    fecha: row.fecha instanceof Date ? row.fecha.toISOString() : (row.fecha as string | null),
    usuario: row.usuario,
    nota: row.nota,
    urgente: Boolean(row.urgente),
  }));
}
