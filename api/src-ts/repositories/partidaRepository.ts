import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_partidas` ("PARTIDAS"). Field set matches the
 * raw sample exactly rather than being pruned down, since this is a new/
 * unfamiliar custom record.
 */
export interface PartidaRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord1401: string | null;
  custrecord_cryo_aniopartida: string | null;
  custrecord_cryo_articulopartida: string | null;
  custrecord_cryo_concepto: string | null;
  custrecord_cryo_estatuspartida: string | null;
  custrecord_cryo_fechalimitepago: string | null;
  custrecord_cryo_fechapartida: string | null;
  custrecord_cryo_finvigencia: string | null;
  custrecord_cryo_importepartida: string | null;
  custrecord_cryo_iniciovigencia: string | null;
  custrecord_cryo_interes: string | null;
  custrecord_cryo_linea_anticipo: string | null;
  custrecord_cryo_linea_anticipo_ini: string | null;
  custrecord_cryo_linea_procesamiento: string | null;
  custrecord_cryo_linea_saldo_inicial_mr: string | null;
  custrecord_cryo_monedapartida: string | null;
  custrecord_cryo_numcontrato: string | null;
  custrecord_cryo_servtipo: string | null;
  custrecord_cryo_statusservicio: string | null;
  custrecord_cryo_subsidiaria_partida: string | null;
  custrecord_cryo_titular_partida: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class PartidaRepository {
  private readonly table = 'netsuite_partidas';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: PartidaRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
