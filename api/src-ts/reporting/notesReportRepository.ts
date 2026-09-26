import type { Knex } from 'knex';
import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';
import { getNotasCobranzaReport } from './notasCobranzaRepository';

/**
 * "Reporte de Notas" - combines two entirely separate note histories, tagged by `sistema` so the
 * caller can tell which one each row came from (confirmed by the user - values are literally
 * "Sistema Anterior" / "NetSuite"):
 *  - "NetSuite": NetSuite-native Notes attached to a Contrato, across EVERY contract at once
 *    (unlike netsuiteNotesRepository.ts's per-contract lookup for the dossier's Notes tab) - the
 *    bulk/date-range mode of the same RESTlet (see api/scratch/get-notes.js). Not backed by our
 *    synced SQL tables at all - Notes were confirmed live to reject SuiteQL/N-search filtering on
 *    their own "attached to" fields in this account, so this always calls NetSuite directly.
 *  - "Sistema Anterior": collection-call notes from the pre-NetSuite CryoCell system
 *    (NotasCobranza, see notasCobranzaRepository.ts), keyed by "Folio" - resolved here to the same
 *    Contrato name the NetSuite side uses, via each folio's matching netsuite_contracts row
 *    (custrecord_cryo_contratosistemaanterior). Has no "título" field, unlike NetSuite notes.
 *
 * Every row also carries `folio_sistema_anterior` (confirmed by the user) regardless of which
 * system it came from - for a "Sistema Anterior" row that's simply its own Folio; for a
 * "NetSuite" row it's the contract's own custrecord_cryo_contratosistemaanterior, resolved here
 * the same way the legacy side resolves Folio -> Contrato (via netsuite_contracts), just in the
 * opposite direction.
 */
const NOTES_RESTLET = { script: '6384', deploy: '1' };

/** recordtype internal id (from note.nl's URL) the RESTlet currently supports - see RECORD_TYPE_MAP in the script itself. */
const CONTRACT_RECORD_TYPE = '1184';

// Safety cap on how many RESTlet calls one report request will make (5,000 notes per call - see
// api/scratch/get-notes.js's BULK_PAGES_PER_CALL) - a caller asking for an implausibly wide date
// range gets a truncated result plus a flag, rather than this looping indefinitely.
const MAX_CALLS = 200;

export type NotesReportSistema = 'Sistema Anterior' | 'NetSuite';

export interface NotesReportRow {
  contrato: string | null;
  folio_sistema_anterior: string | null;
  fecha_creacion: string | null;
  usuario: string | null;
  titulo: string | null;
  nota: string | null;
  sistema: NotesReportSistema;
}

interface BulkRestletNoteRow {
  title: string | null;
  note: string | null;
  author: string | null;
  date: string | null;
  recordId: string;
  recordName: string | null;
}

interface BulkRestletResponse {
  success: boolean;
  data?: BulkRestletNoteRow[];
  nextStartPage?: number | null;
  totalPages?: number;
  error?: string;
}

// NetSuite's account-locale format, e.g. "14/09/2026 9:58 PM" - not directly parseable by
// `new Date(...)` (ambiguous with MM/DD/YYYY). Same parsing as netsuiteNotesRepository.ts, kept
// separate rather than shared - these are both small, single-purpose repositories with no shared-
// code path today (same convention as csvExport.ts's own duplicated label maps).
const NETSUITE_DATETIME = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

function parseNetSuiteDateTime(value: string | null): string | null {
  if (!value) return null;
  const match = NETSUITE_DATETIME.exec(value.trim());
  if (!match) return null;

  const [, day, month, year, hour, minute, meridiem] = match;
  let hour24 = Number(hour) % 12;
  if (meridiem.toUpperCase() === 'PM') hour24 += 12;

  const date = new Date(Number(year), Number(month) - 1, Number(day), hour24, Number(minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A NetSuite note row before its contract's folio_sistema_anterior has been resolved. */
interface NetSuiteNoteWithRecordId extends NotesReportRow {
  recordId: string;
}

interface NetSuiteNotesResult {
  rows: NetSuiteNoteWithRecordId[];
  truncated: boolean;
}

/**
 * `dateFrom`/`dateTo` are "YYYY-MM-DD". Loops the RESTlet's bulk mode across as many calls as
 * needed (via startPage/nextStartPage) since a wide date range across ~220k contracts can exceed
 * a single call's governance/time budget.
 */
async function getNetSuiteNotesReport(http: NetSuiteHttpClient, dateFrom: string, dateTo: string): Promise<NetSuiteNotesResult> {
  const rows: NetSuiteNoteWithRecordId[] = [];
  let startPage = 0;

  for (let call = 0; call < MAX_CALLS; call++) {
    const result = await http.callRestlet<BulkRestletResponse>(NOTES_RESTLET.script, NOTES_RESTLET.deploy, {
      dateFrom,
      dateTo,
      recordtype: CONTRACT_RECORD_TYPE,
      startPage: String(startPage),
    });

    if (!result.success) {
      throw new Error(result.error || 'Unknown error calling the NetSuite notes RESTlet.');
    }

    for (const row of result.data ?? []) {
      rows.push({
        contrato: row.recordName,
        folio_sistema_anterior: null, // resolved afterwards - see resolveContratoFolios
        fecha_creacion: parseNetSuiteDateTime(row.date),
        usuario: row.author,
        titulo: row.title,
        nota: row.note,
        sistema: 'NetSuite',
        recordId: row.recordId,
      });
    }

    if (result.nextStartPage === null || result.nextStartPage === undefined) {
      return { rows, truncated: false };
    }
    startPage = result.nextStartPage;
  }

  return { rows, truncated: true };
}

// SQL Server (mssql/tedious) caps a single query at 2100 bound parameters, and each `whereIn`
// value is its own parameter - a wide date range can pull in thousands of distinct contracts, so
// these lookups must be chunked well under that limit.
const SQL_SERVER_WHERE_IN_CHUNK_SIZE = 2000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Resolves each distinct legacy Folio to its matching NetSuite contract's own `name` (e.g.
 * "MX-CC-2026-115451-1"), so legacy-system rows show the same "Contrato" identifier the NetSuite
 * side uses instead of the raw Folio. A folio with no matching contract (never migrated, or a
 * data-entry mismatch) falls back to the raw folio rather than showing a blank Contrato. */
async function resolveFolioToContratoName(db: Knex, folios: string[]): Promise<Map<string, string>> {
  const distinctFolios = [...new Set(folios.filter((f): f is string => Boolean(f)))];
  if (distinctFolios.length === 0) return new Map();

  const map = new Map<string, string>();
  for (const batch of chunk(distinctFolios, SQL_SERVER_WHERE_IN_CHUNK_SIZE)) {
    const rows = await db('netsuite_contracts')
      .whereIn('custrecord_cryo_contratosistemaanterior', batch)
      .select('custrecord_cryo_contratosistemaanterior as folio', 'name');

    for (const row of rows as Array<{ folio: string | null; name: string | null }>) {
      if (row.folio && row.name) map.set(row.folio, row.name);
    }
  }
  return map;
}

/** The opposite direction of resolveFolioToContratoName - each distinct contract internal id
 * (NetSuite notes' recordId) to that contract's own custrecord_cryo_contratosistemaanterior, for
 * folio_sistema_anterior on "NetSuite"-sourced rows. */
async function resolveContratoFolios(db: Knex, recordIds: string[]): Promise<Map<string, string | null>> {
  const distinctIds = [...new Set(recordIds.filter((id): id is string => Boolean(id)))];
  if (distinctIds.length === 0) return new Map();

  const map = new Map<string, string | null>();
  for (const batch of chunk(distinctIds, SQL_SERVER_WHERE_IN_CHUNK_SIZE)) {
    const rows = await db('netsuite_contracts')
      .whereIn('netsuite_id', batch)
      .select('netsuite_id', 'custrecord_cryo_contratosistemaanterior as folio');

    for (const row of rows as Array<{ netsuite_id: string; folio: string | null }>) {
      map.set(row.netsuite_id, row.folio);
    }
  }
  return map;
}

export interface NotesReportResult {
  data: NotesReportRow[];
  truncated: boolean;
}

/**
 * Combined "Reporte de Notas" - NetSuite-native notes ("NetSuite") plus legacy CryoCell
 * NotasCobranza ("Sistema Anterior"), both filtered to the same [dateFrom, dateTo] ("YYYY-MM-DD")
 * range, merged and sorted by fecha_creacion descending. `truncated` reflects only the NetSuite
 * side's safety cap - the legacy query is a single unpaginated SQL query with no analogous limit.
 */
export async function getCombinedNotesReport(
  http: NetSuiteHttpClient,
  db: Knex,
  legacyDb: Knex,
  dateFrom: string,
  dateTo: string,
): Promise<NotesReportResult> {
  const [netsuiteResult, legacyRows] = await Promise.all([
    getNetSuiteNotesReport(http, dateFrom, dateTo),
    getNotasCobranzaReport(legacyDb, dateFrom, dateTo),
  ]);

  const [folioToContrato, recordIdToFolio] = await Promise.all([
    resolveFolioToContratoName(
      db,
      legacyRows.map((row) => row.folio).filter((f): f is string => Boolean(f)),
    ),
    resolveContratoFolios(
      db,
      netsuiteResult.rows.map((row) => row.recordId),
    ),
  ]);

  const netsuiteMapped: NotesReportRow[] = netsuiteResult.rows.map(({ recordId, ...row }) => ({
    ...row,
    folio_sistema_anterior: recordIdToFolio.get(recordId) ?? null,
  }));

  const legacyMapped: NotesReportRow[] = legacyRows.map((row) => ({
    contrato: (row.folio && folioToContrato.get(row.folio)) || row.folio,
    folio_sistema_anterior: row.folio,
    fecha_creacion: row.fecha,
    usuario: row.usuario,
    titulo: null,
    nota: row.nota,
    sistema: 'Sistema Anterior',
  }));

  const combined = [...netsuiteMapped, ...legacyMapped].sort((a, b) => {
    const aTime = a.fecha_creacion ? Date.parse(a.fecha_creacion) : 0;
    const bTime = b.fecha_creacion ? Date.parse(b.fecha_creacion) : 0;
    return bTime - aTime;
  });

  return { data: combined, truncated: netsuiteResult.truncated };
}
