import type { SyncEntityName } from '../config/types';

/**
 * The read-only reporting entities exposed at /api/reports/:entity. Kebab-case
 * to match REST path conventions; each maps to one netsuite_* table via
 * entityRegistry.ts.
 */
export type ReportEntityKey =
  | 'contracts'
  | 'customers'
  | 'family-members'
  | 'employees'
  | 'hospitals'
  | 'partidas'
  | 'services'
  | 'serial-numbers'
  | 'medicos'
  | 'medicos-colombia'
  | 'fiscal-updates'
  | 'payments'
  | 'vendors'
  | 'vendor-transactions'
  | 'otros-contratos'
  | 'fcells-contratos';

/**
 * Every key grantable via the per-user allowedEntities permission list: every ReportEntityKey
 * (each backed by ENTITY_REGISTRY, with generic list/detail/CSV routes) plus 'hr' and
 * 'prospectos', which are gated the same way but aren't generic paginated tables (see
 * hrAnalyticsRepository.ts / prospectosRepository.ts) so they have no ENTITY_REGISTRY entry of
 * their own - 'prospectos' pulls from the legacy Cryo.dbo database, not a synced netsuite_* table.
 * 'commissions' is different again: it's not a standalone grant, but an ADDITIONAL gate on top of
 * 'contracts' - having 'contracts' alone no longer shows every vendedor's commissions, it only
 * does once 'commissions' is granted too (see isCommissionsFullAccessAllowed in
 * contractReportsController.ts). A 'commissions'-only grant with no 'contracts' does nothing.
 */
export type PermissionKey = ReportEntityKey | 'hr' | 'prospectos' | 'commissions';

export interface SortConfig {
  column: string;
  dir: 'asc' | 'desc';
}

/**
 * Describes one reporting entity's read shape. `sortableColumns` and
 * `searchableColumns` are allow-lists — the only place request-supplied
 * column names are validated against, so no query-param value ever reaches
 * SQL unescaped/unchecked.
 */
export interface EntityConfig {
  key: ReportEntityKey;
  table: string;
  idColumn: string;
  /** null for entities that don't have a corresponding sync watermark row. */
  syncEntityName: SyncEntityName | null;
  label: string;
  listColumns: string[];
  sortableColumns: string[];
  searchableColumns: string[];
  defaultSort: SortConfig;
  /** Column holding the NetSuite subsidiary internal id, when this entity has one synced. */
  subsidiaryColumn?: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EntitySummary {
  key: ReportEntityKey;
  label: string;
  rowCount: number;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
}
