import axios from 'axios';
import type { Logger } from '../logger';
import type { RetryConfig } from '../config/types';
import { withRetry } from './retry';

/**
 * Zammad's /api/v1/tickets/search response, confirmed live against production with
 * `expand=true`: a PLAIN ARRAY of full ticket objects (NOT the {tickets, tickets_count, assets}
 * id+asset-bundle shape search endpoints often use) - every reference field comes back already
 * resolved to a readable string alongside its id (group_id + group, state_id + state,
 * priority_id + priority, owner_id + owner, organization_id + organization, customer_id +
 * customer as an email, created_by/updated_by as emails). asunto/foliocontrato/telefono/empresa
 * are this org's own custom ticket fields (same ones logisticaTicketController.ts/
 * zammad-relay.php's Postventa form write on create).
 */
export interface RawZammadTicket {
  id: number;
  number?: string;
  title?: string;
  type?: string;
  group_id?: number;
  group?: string;
  state_id?: number;
  state?: string;
  priority_id?: number;
  priority?: string;
  organization_id?: number | null;
  organization?: string | null;
  owner_id?: number;
  owner?: string;
  customer_id?: number;
  customer?: string;
  created_by?: string;
  updated_by?: string;
  asunto?: string;
  foliocontrato?: string;
  telefono?: string;
  empresa?: string;
  created_at?: string;
  updated_at?: string;
  /** Set once an agent first replies - confirmed live that ~62% of synced tickets have this. */
  first_response_at?: string | null;
  /** Set once the ticket reaches a closed state - confirmed live on ~87% of synced tickets. */
  close_at?: string | null;
  [key: string]: unknown;
}

export interface ZammadSearchParams {
  query: string;
  page: number;
  perPage: number;
}

export interface ZammadHttpClientConfig {
  relayUrl: string;
  relaySecret: string;
  timeoutMs?: number;
}

/**
 * This app cannot reach tickets.cryoholdco.com directly (see getZammadConfig()'s doc comment) -
 * every call goes through the PHP relay (logistica-tickets-relay/zammad-relay.php), whose GET
 * branch forwards the query string verbatim to Zammad's /api/v1/tickets/search. The relay holds
 * the real Zammad token; this client only ever sends the shared X-Relay-Secret.
 */
export class ZammadHttpClient {
  constructor(
    private readonly config: ZammadHttpClientConfig,
    private readonly retryConfig: RetryConfig,
    private readonly logger: Logger,
  ) {}

  async searchTickets(params: ZammadSearchParams): Promise<RawZammadTicket[]> {
    return withRetry(
      async () => {
        const response = await axios.get<RawZammadTicket[]>(this.config.relayUrl, {
          params: {
            query: params.query,
            page: params.page,
            per_page: params.perPage,
            sort_by: 'updated_at',
            order_by: 'asc',
            expand: true,
          },
          headers: { 'X-Relay-Secret': this.config.relaySecret },
          timeout: this.config.timeoutMs ?? 30000,
        });
        return Array.isArray(response.data) ? response.data : [];
      },
      this.retryConfig,
      this.logger,
    );
  }
}
