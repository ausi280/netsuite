import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_pe_servicios` - a small Peru service-package price catalog.
 * `custrecord_cryo_otroscontratos.custrecord_cryo_servicio_otroscontratos` references this table.
 */
export interface PeServicioRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_idinternoarticulo: string | null;
  custrecord_cryo_monedaprecio: string | null;
  custrecord_cryo_pe_articulo: string | null;
  custrecord_cryo_pe_subsidiaria: string | null;
  custrecord_cryo_precioservicio: number | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class PeServicioRepository {
  private readonly table = 'netsuite_pe_servicios';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: PeServicioRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
