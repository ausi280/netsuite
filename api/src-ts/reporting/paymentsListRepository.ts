import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize } from './reportingRepository';
import type { Paginated } from './types';

/**
 * Read-only view of app_payments (a MercadoPago payment-gateway audit log written by the separate
 * `payment` project, sharing this same SQL Server database) - a dedicated repository rather than a
 * generic-config entity, since "Contrato" isn't a plain column: it's JSON_VALUE(payloadRequest,
 * '$.contractId'), and this also resolves that id to the real contract name via a join, which the
 * original payments page never did (it just showed the raw NetSuite internal id).
 *
 * Subsidiary comes from the joined contract's own custrecord_cryo_subsidiariacontrato, not from
 * payloadRequest's own `subsidiariaId` - the contract record is the authoritative source (the
 * payload's copy is only what the client happened to send at charge time), and reusing it means
 * this filters/restricts exactly like every other subsidiary-aware entity (contracts, partidas).
 *
 * No write path lives here - the one action this grid needs ("cobro domiciliado") is proxied
 * straight through to the live payment API (see contractReportsController-style proxy controller),
 * not reimplemented against MercadoPago/NetSuite/email directly.
 */

const TABLE = 'app_payments as P';
const CONTRACT_ID_EXPR = `JSON_VALUE(P.payloadRequest, '$.contractId')`;
const SUBSIDIARY_COLUMN = 'CONTRACT.custrecord_cryo_subsidiariacontrato';

const SELECT_COLUMNS = [
  'P.id',
  'P.payment_id',
  'P.transaction_amount',
  'P.payer_email',
  'P.payment_method_id',
  'P.installments',
  'P.description',
  'P.status',
  'P.status_detail',
  'P.payloadRequest',
  'P.created_at',
  'CONTRACT.name as contract_name',
  'CONTRACT.custrecord_cryo_subsidiariacontrato as subsidiary_id',
];

/** Turns a "YYYY-MM-DD" dateTo into the next day, so the range filter can use an exclusive `<`
 * and still include every payment made anytime during dateTo itself (created_at carries a time-of-day). */
function nextDayIso(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildBaseQuery(
  db: Knex,
  search: string,
  subsidiary: string,
  dateFrom: string,
  dateTo: string,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const qb = db(TABLE).leftJoin('netsuite_contracts as CONTRACT', function (this: Knex.JoinClause) {
    this.on(db.raw(`CONTRACT.netsuite_id = ${CONTRACT_ID_EXPR}`));
  });

  if (search) {
    qb.where((builder) => {
      builder
        .orWhereRaw(`${CONTRACT_ID_EXPR} LIKE ?`, [`%${search}%`])
        .orWhere('P.payer_email', 'like', `%${search}%`)
        .orWhere('P.payment_id', 'like', `%${search}%`)
        .orWhere('P.description', 'like', `%${search}%`);
    });
  }

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary) {
    qb.andWhereRaw(`(',' + REPLACE(CAST(?? AS NVARCHAR(MAX)), ' ', '') + ',') LIKE ?`, [SUBSIDIARY_COLUMN, `%,${subsidiary},%`]);
  }
  if (dateFrom) {
    qb.andWhere('P.created_at', '>=', dateFrom);
  }
  if (dateTo) {
    qb.andWhere('P.created_at', '<', nextDayIso(dateTo));
  }

  return qb;
}

export interface PaymentsListParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  subsidiary?: unknown;
  /** Both "YYYY-MM-DD" - filters on P.created_at, inclusive of the entire dateTo day. */
  dateFrom?: unknown;
  dateTo?: unknown;
}

export async function getPaymentsList(
  db: Knex,
  params: PaymentsListParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';
  const dateFrom = typeof params.dateFrom === 'string' ? params.dateFrom.trim() : '';
  const dateTo = typeof params.dateTo === 'string' ? params.dateTo.trim() : '';

  const [rows, countRow] = await Promise.all([
    buildBaseQuery(db, search, subsidiary, dateFrom, dateTo, restrictSubsidiaries)
      .select(SELECT_COLUMNS)
      .orderBy('P.created_at', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildBaseQuery(db, search, subsidiary, dateFrom, dateTo, restrictSubsidiaries).count({ count: 'P.id' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows as Record<string, unknown>[], page, pageSize, total, totalPages };
}
