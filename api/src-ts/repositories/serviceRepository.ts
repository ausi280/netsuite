import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_servicios` — services contracted under a
 * contract, linked via `custrecord_cryo_idcontrato` (a NetSuite internal
 * id, not a DB foreign key).
 */
export interface ServiceRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_costo_anual_auto: string | null;
  custrecord_cryo_costoanualidad: string | null;
  custrecord_cryo_estatusservicio: string | null;
  custrecord_cryo_estatusservicio_copia: string | null;
  custrecord_cryo_fecha_procesoserv: string | null;
  custrecord_cryo_idcontrato: string | null;
  custrecord_cryo_monedaserv: string | null;
  custrecord_cryo_precioprocesamiento: string | null;
  custrecord_cryo_serviciocontratado: string | null;
  custrecord_cryo_statuspagoserv: string | null;
  custrecord_cryo_tipodeserv: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class ServiceRepository {
  private readonly table = 'netsuite_services';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ServiceRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
