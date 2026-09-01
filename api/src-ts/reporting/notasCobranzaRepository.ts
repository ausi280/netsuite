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
