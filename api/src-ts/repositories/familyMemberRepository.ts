import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_familia` — family members linked to a
 * contract/titular via `custrecord_cryo_titular` (a NetSuite internal id,
 * not a DB foreign key). Field set matches the raw sample exactly rather
 * than being pruned down, since this is a new/unfamiliar custom record.
 */
export interface FamilyMemberRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_fnacimiento: string | null;
  custrecord_cryo_genero: string | null;
  custrecord_cryo_idfamilia: string | null;
  custrecord_cryo_main_email: string | null;
  custrecord_cryo_miembrotitular: string | null;
  custrecord_cryo_mismadireccion: string | null;
  custrecord_cryo_no_familia_colombia: string | null;
  custrecord_cryo_nombremiembro: string | null;
  custrecord_cryo_parentesco: string | null;
  custrecord_cryo_titular: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class FamilyMemberRepository {
  private readonly table = 'netsuite_family_members';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: FamilyMemberRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
