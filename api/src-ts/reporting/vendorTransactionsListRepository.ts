import type { Knex } from 'knex';
import { applySubsidiaryRestriction, clampPage, clampPageSize } from './reportingRepository';
import type { Paginated } from './types';

type SortDir = 'asc' | 'desc';

/**
 * Vendor "Transacciones" grid (VendBill/VendPymt rows from netsuite_vendor_transactions),
 * enriched with the vendor's name, the linked payment's "Orden de Pago" (via
 * netsuite_vendor_bill_payments - NetSuite's own NextTransactionLink, linktype='Payment'), and a
 * computed "Días Pendientes". A dedicated repository rather than a generic-config entity, same
 * reasoning as partidaListRepository/paymentsListRepository: none of this is a plain column.
 *
 * Días Pendientes: for a bill with a linked payment, the days between the bill's date and the
 * payment's date (how long it took to get paid); for a still-open bill, the days between its due
 * date (falling back to its own date) and today (how overdue/pending it currently is); null for
 * payment rows themselves, and for paid bills with no due date concept to speak of.
 *
 * A bill with more than one linked payment (a partial-payment scenario) surfaces as one row per
 * link - this is a deliberate simplification, not a bug: each row still shows the bill's own
 * columns plus that specific payment's tranid/date.
 */

const TABLE = 'netsuite_vendor_transactions as T';
const SUBSIDIARY_COLUMN = 'V.subsidiary';

const DIAS_PENDIENTES_EXPR = `CASE
    WHEN PAY.netsuite_id IS NOT NULL THEN DATEDIFF(day, T.trandate, PAY.trandate)
    WHEN T.type = 'VendBill' THEN DATEDIFF(day, COALESCE(T.duedate, T.trandate), GETDATE())
    ELSE NULL
  END`;

/** knex only parses plain "table.column as alias" strings - a computed SQL expression (COALESCE,
 * CASE) must go through db.raw(), so this is built per-call rather than as a module-level const. */
function selectColumns(db: Knex): Array<string | Knex.Raw> {
  return [
    'T.netsuite_id',
    'T.tranid',
    'T.type',
    'T.status',
    'T.trandate',
    'T.duedate',
    'T.currency',
    'T.total',
    'T.foreigntotal',
    'V.netsuite_id as vendor_id',
    db.raw('COALESCE(V.companyname, V.entityid) as vendor_name'),
    'PAY.tranid as orden_pago',
    db.raw(`${DIAS_PENDIENTES_EXPR} as dias_pendientes`),
  ];
}

const SORTABLE_COLUMNS: Record<string, string> = {
  trandate: 'T.trandate',
  duedate: 'T.duedate',
  total: 'T.total',
  vendor_name: 'V.companyname',
  dias_pendientes: 'dias_pendientes',
};
const DEFAULT_SORT_COLUMN = 'T.trandate';
const DEFAULT_SORT_DIR: SortDir = 'desc';

function resolveSort(sortBy: unknown, sortDir: unknown): { column: string; dir: SortDir } {
  const column = typeof sortBy === 'string' && SORTABLE_COLUMNS[sortBy] ? SORTABLE_COLUMNS[sortBy] : DEFAULT_SORT_COLUMN;
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_SORT_DIR;
  return { column, dir };
}

function buildBaseQuery(
  db: Knex,
  search: string,
  vendorId: string,
  subsidiary: string,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const qb = db(TABLE)
    .leftJoin('netsuite_vendors as V', 'V.netsuite_id', 'T.entity_id')
    .leftJoin('netsuite_vendor_bill_payments as LINK', function (this: Knex.JoinClause) {
      this.on('LINK.previousdoc', '=', 'T.netsuite_id').andOnVal('T.type', '=', 'VendBill');
    })
    .leftJoin('netsuite_vendor_transactions as PAY', 'PAY.netsuite_id', 'LINK.nextdoc');

  if (vendorId) {
    qb.andWhere('T.entity_id', vendorId);
  }

  if (search) {
    qb.where((builder) => {
      builder
        .orWhere('T.tranid', 'like', `%${search}%`)
        .orWhere('PAY.tranid', 'like', `%${search}%`)
        .orWhere('V.companyname', 'like', `%${search}%`)
        .orWhere('V.entityid', 'like', `%${search}%`);
    });
  }

  if (restrictSubsidiaries !== null) {
    applySubsidiaryRestriction(qb, SUBSIDIARY_COLUMN, restrictSubsidiaries);
  }
  if (subsidiary) {
    qb.andWhereRaw(`(',' + REPLACE(CAST(?? AS NVARCHAR(MAX)), ' ', '') + ',') LIKE ?`, [SUBSIDIARY_COLUMN, `%,${subsidiary},%`]);
  }

  return qb;
}

export interface VendorTransactionsListParams {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  sortBy?: unknown;
  sortDir?: unknown;
  subsidiary?: unknown;
  /** Narrows to one vendor's transactions - the per-vendor "Transacciones" drill-down view. */
  vendorId?: unknown;
}

export async function getVendorTransactionsList(
  db: Knex,
  params: VendorTransactionsListParams,
  restrictSubsidiaries: Set<string> | null,
): Promise<Paginated<Record<string, unknown>>> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const { column, dir } = resolveSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';
  const vendorId = typeof params.vendorId === 'string' ? params.vendorId.trim() : '';

  const [rows, countRow] = await Promise.all([
    buildBaseQuery(db, search, vendorId, subsidiary, restrictSubsidiaries)
      .select(selectColumns(db))
      .orderBy(column, dir)
      .orderBy('T.netsuite_id', 'asc')
      .offset((page - 1) * pageSize)
      .limit(pageSize),
    buildBaseQuery(db, search, vendorId, subsidiary, restrictSubsidiaries).count({ count: 'T.netsuite_id' }).first(),
  ]);

  const total = Number((countRow as { count: number | string } | undefined)?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return { data: rows as Record<string, unknown>[], page, pageSize, total, totalPages };
}

/** Same enrichment, unpaginated, for CSV export - mirrors buildEnrichedPartidaExportQuery. */
export function buildVendorTransactionsExportQuery(
  db: Knex,
  params: Pick<VendorTransactionsListParams, 'search' | 'sortBy' | 'sortDir' | 'subsidiary' | 'vendorId'>,
  restrictSubsidiaries: Set<string> | null,
): Knex.QueryBuilder {
  const { column, dir } = resolveSort(params.sortBy, params.sortDir);
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const subsidiary = typeof params.subsidiary === 'string' ? params.subsidiary.trim() : '';
  const vendorId = typeof params.vendorId === 'string' ? params.vendorId.trim() : '';

  return buildBaseQuery(db, search, vendorId, subsidiary, restrictSubsidiaries)
    .select(selectColumns(db))
    .orderBy(column, dir)
    .orderBy('T.netsuite_id', 'asc');
}

export const VENDOR_TRANSACTIONS_EXPORT_COLUMNS = [
  'netsuite_id',
  'vendor_name',
  'tranid',
  'type',
  'status',
  'trandate',
  'duedate',
  'currency',
  'total',
  'orden_pago',
  'dias_pendientes',
];
