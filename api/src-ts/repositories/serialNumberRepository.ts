import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/** Mirrors NetSuite's `inventorynumber` record, scoped to item 2394 ("KIT DE RECOLECCION - SCU Y TCU"). */
export interface SerialNumberRow {
  netsuite_id: string;
  item_netsuite_id: string | null;
  item_subsidiary_id: string | null;
  inventory_number: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  raw_data: string;
}

export class SerialNumberRepository {
  private readonly table = 'netsuite_serial_numbers';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: SerialNumberRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
