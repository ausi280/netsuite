import type { RawZammadTicket } from '../http/zammadHttpClient';
import type { ZammadTicketRow } from '../repositories/zammadTicketRepository';
import { toDate, toStringOrNull } from './utils';

/** Every reference field (group, state, priority, owner, customer, organization) arrives already
 * expanded to a readable string alongside its id - confirmed live, see zammadHttpClient.ts's doc
 * comment - so no separate asset lookup is needed. `raw_data` always has the untouched original. */
export function mapZammadTicket(raw: RawZammadTicket): ZammadTicketRow {
  return {
    zammad_id: String(raw.id),
    number: toStringOrNull(raw.number),
    title: toStringOrNull(raw.title),
    type: toStringOrNull(raw.type),
    group_id: toStringOrNull(raw.group_id),
    group_name: toStringOrNull(raw.group),
    state_id: toStringOrNull(raw.state_id),
    state_name: toStringOrNull(raw.state),
    priority_id: toStringOrNull(raw.priority_id),
    priority_name: toStringOrNull(raw.priority),
    organization_id: toStringOrNull(raw.organization_id),
    organization_name: toStringOrNull(raw.organization),
    owner_id: toStringOrNull(raw.owner_id),
    owner_name: toStringOrNull(raw.owner),
    customer_id: toStringOrNull(raw.customer_id),
    customer_email: toStringOrNull(raw.customer),
    created_by: toStringOrNull(raw.created_by),
    updated_by: toStringOrNull(raw.updated_by),
    asunto: toStringOrNull(raw.asunto),
    foliocontrato: toStringOrNull(raw.foliocontrato),
    telefono: toStringOrNull(raw.telefono),
    empresa: toStringOrNull(raw.empresa),
    created_at_zammad: toDate(raw.created_at),
    updated_at_zammad: toDate(raw.updated_at),
    first_response_at_zammad: toDate(raw.first_response_at),
    close_at_zammad: toDate(raw.close_at),
    raw_data: JSON.stringify(raw),
  };
}
