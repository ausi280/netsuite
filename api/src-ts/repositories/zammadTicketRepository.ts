import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

export interface ZammadTicketRow {
  zammad_id: string;
  number: string | null;
  title: string | null;
  type: string | null;
  group_id: string | null;
  group_name: string | null;
  state_id: string | null;
  state_name: string | null;
  priority_id: string | null;
  priority_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  created_by: string | null;
  updated_by: string | null;
  asunto: string | null;
  foliocontrato: string | null;
  telefono: string | null;
  empresa: string | null;
  created_at_zammad: Date | null;
  updated_at_zammad: Date | null;
  first_response_at_zammad: Date | null;
  close_at_zammad: Date | null;
  raw_data: string;
}

export class ZammadTicketRepository {
  private readonly table = 'zammad_tickets';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ZammadTicketRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'zammad_id');
  }
}
