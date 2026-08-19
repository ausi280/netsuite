import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customlist_cryo_tiposervicio` ("Tipo de Servicio") — the catalog
 * `customrecord_cryo_servicios.custrecord_cryo_tipodeserv` references.
 */
export interface ServiceTypeRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  isinactive: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class ServiceTypeRepository {
  private readonly table = 'netsuite_service_types';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ServiceTypeRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
