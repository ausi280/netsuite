import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/** One NetSuite currency with its current exchange rate (to the MXN base) - see the migration
 * 20261021000001_create_netsuite_currency_tables.js. */
export interface CurrencyRow {
  netsuite_id: string;
  name: string | null;
  symbol: string | null;
  isbasecurrency: boolean | null;
  isinactive: boolean | null;
  exchangerate: number | null;
  raw_data: string;
  /** Snapshot date for netsuite_currency_rates; not a netsuite_currencies column. */
  rate_date: string;
}

export class CurrencyRepository {
  private readonly table = 'netsuite_currencies';
  private readonly historyTable = 'netsuite_currency_rates';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: CurrencyRow[]): Promise<number> {
    const current = rows.map(({ rate_date, ...row }) => row);
    const history = rows.map((row) => ({
      currency_netsuite_id: row.netsuite_id,
      symbol: row.symbol,
      rate_date: row.rate_date,
      exchangerate: row.exchangerate,
    }));

    await upsertRows(this.db, trx, this.historyTable, history, ['currency_netsuite_id', 'rate_date']);
    return upsertRows(this.db, trx, this.table, current, 'netsuite_id');
  }
}
