import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_arg_hospitales` ("Hospitales"). Field set
 * matches the raw sample exactly rather than being pruned down, since this
 * is a new/unfamiliar custom record.
 */
export interface HospitalRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_hospitales_subsidiria: string | null;
  custrecord_cryo_provinciaarg: string | null;
  custrecord_cryo_direccionhospital: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class HospitalRepository {
  private readonly table = 'netsuite_hospitals';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: HospitalRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
