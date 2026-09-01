/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Reads NetSuite's native "Notes" feature (the note.nl / "User Notes" sublist UI) for an
 * arbitrary record - built because SuiteQL cannot reach this data: the note record's content
 * fields (title, note, notedate, author, direction, notetype, internalonly) are all rejected by
 * SuiteQL with "NOT_EXPOSED - Not available for channel SEARCH", confirmed live against this
 * account. N/search (this script's channel) does not have that restriction - it's what the
 * note.nl UI itself is built on.
 *
 * The record<->note link fields are `record` (the parent record's internal id) and `recordtype`
 * (the parent record TYPE's internal id, NOT its script id) - confirmed via NetSuite's own
 * documented record.create() pattern for attaching a note to a custom record:
 *   record.create({ type: record.Type.NOTE })
 *     .setValue('note', text).setValue('record', id).setValue('recordtype', typeId).save();
 * customrecord1184's own table name already IS its type's internal id (1184) - NetSuite's default
 * naming when no script id was set for the record type - matching note.nl's own
 * `recordtype=1184&record=<contractId>` URL params exactly, so no CustomRecordType lookup needed.
 *
 * Two modes:
 *
 * 1. Discovery - GET ?discover=<noteInternalId>
 *    Loads one known note record directly and returns every field id NetSuite exposes on it, with
 *    its value - a sanity check that record.load/N-search really can read title/note/notedate/
 *    author on this account (only inferred from NetSuite's own docs, not yet verified here).
 *    Example: GET ?discover=90092 (a real note id confirmed to exist via SuiteQL this session).
 *
 * 2. Query - GET ?recordType=1184&recordId=<contract netsuite_id>
 *    Returns every note attached to that contract, newest first.
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

  const NOTE_COLUMNS = [
    'internalid',
    'title',
    'note',
    'notedate',
    'author',
    'direction',
    'notetype',
    'internalonly',
    'custrecord_cryo_urgente',
  ];

  function runDiscovery(noteId) {
    const noteRecord = record.load({ type: 'note', id: noteId, isDynamic: false });
    const fields = {};
    for (const fieldId of noteRecord.getFields()) {
      try {
        fields[fieldId] = noteRecord.getValue({ fieldId });
      } catch (e) {
        fields[fieldId] = `<error reading field: ${e.message}>`;
      }
    }
    return { noteId, fieldCount: Object.keys(fields).length, fields };
  }

  function runQuery(recordType, recordId) {
    const results = [];
    const searchObj = search.create({
      type: 'note',
      filters: [
        ['recordtype', 'is', recordType],
        'AND',
        ['record', 'is', recordId],
      ],
      columns: NOTE_COLUMNS,
    });

    searchObj.run().each((result) => {
      const row = {};
      for (const col of NOTE_COLUMNS) {
        row[col] = result.getValue({ name: col }) ?? result.getText({ name: col }) ?? null;
      }
      results.push(row);
      return true;
    });

    // Sort newest first - SuiteScript search doesn't guarantee order without a sort column
    // definition, simpler to sort the (small per-contract) result set here.
    results.sort((a, b) => (a.notedate < b.notedate ? 1 : a.notedate > b.notedate ? -1 : 0));

    return { recordType, recordId, count: results.length, data: results };
  }

  function get(params) {
    try {
      if (params.discover) {
        return runDiscovery(params.discover);
      }

      if (params.recordType && params.recordId) {
        return runQuery(params.recordType, params.recordId);
      }

      return {
        error: 'Provide either ?discover=<noteInternalId> or ?recordType=<id>&recordId=<id>.',
      };
    } catch (e) {
      log.error('nso_cryo_consulta_notas_rs error', e);
      return { error: e.message };
    }
  }

  return { get };
});
