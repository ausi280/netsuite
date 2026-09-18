import type { NetSuiteHttpClient } from '../http/netsuiteHttpClient';

/**
 * NetSuite-native Notes (the note.nl UI page), reached through a SuiteScript RESTlet
 * ("Get notes.js", customscript6384/customdeploy1) rather than SuiteQL - live testing found
 * search.Type.NOTE's own "attached to" fields (record/entity/transaction/recordtype/topic/
 * activity) are all rejected as SuiteQL/N-search filter criteria in this account (NOT_EXPOSED for
 * the external SEARCH channel), so the only reachable path is a join ("userNotes") off the
 * PARENT record, which only N/search running inside NetSuite itself can use.
 */
const NOTES_RESTLET = { script: '6384', deploy: '1' };

/** recordtype internal id (from note.nl's URL) the RESTlet currently supports - see RECORD_TYPE_MAP in the script itself. */
const CONTRACT_RECORD_TYPE = '1184';

export interface NetSuiteNote {
  id: string;
  title: string | null;
  note: string | null;
  author: string | null;
  date: string | null;
  direction: string | null;
  noteType: string | null;
  urgente: boolean;
}

interface RestletNoteRow {
  id: string;
  title: string | null;
  note: string | null;
  author: string | null;
  date: string | null;
  direction: string | null;
  noteType: string | null;
  custom?: { urgente?: boolean | string | null };
}

interface RestletResponse {
  success: boolean;
  data?: RestletNoteRow[];
  error?: string;
}

// NetSuite's account-locale format, e.g. "14/09/2026 9:58 PM" - not directly parseable by
// `new Date(...)` (ambiguous with MM/DD/YYYY), so it's converted to ISO here rather than pushing
// this parsing onto the frontend's generic formatDateTime.
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

export async function getNetSuiteNotesForContract(http: NetSuiteHttpClient, contractId: string): Promise<NetSuiteNote[]> {
  const result = await http.callRestlet<RestletResponse>(NOTES_RESTLET.script, NOTES_RESTLET.deploy, {
    record: contractId,
    recordtype: CONTRACT_RECORD_TYPE,
  });

  if (!result.success) {
    throw new Error(result.error || 'Unknown error calling the NetSuite notes RESTlet.');
  }

  return (result.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    note: row.note,
    author: row.author,
    date: parseNetSuiteDateTime(row.date),
    direction: row.direction,
    noteType: row.noteType,
    urgente: row.custom?.urgente === true || row.custom?.urgente === 'T',
  }));
}
