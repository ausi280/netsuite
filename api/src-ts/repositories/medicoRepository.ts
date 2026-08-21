import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_medicos` ("Médicos"). Field set matches the raw
 * sample exactly rather than being pruned down, since this is a new/
 * unfamiliar custom record.
 */
export interface MedicoRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_ciudadmedico: string | null;
  custrecord_cryo_correomedico: string | null;
  custrecord_cryo_cuit: string | null;
  custrecord_cryo_generomedico: string | null;
  custrecord_cryo_marca_medicos: string | null;
  custrecord_cryo_subsidiariamedico: string | null;
  custrecord_cryo_telefonomedico: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class MedicoRepository {
  private readonly table = 'netsuite_medicos';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: MedicoRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
