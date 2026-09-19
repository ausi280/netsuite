/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Returns the NetSuite Notes attached to one record, given the same {record, recordtype} pair
 * the note.nl UI page uses (recordtype = the record type's internal id, e.g. 1184 for
 * customrecord1184 / Contrato; record = the specific record instance's internal id).
 *
 * Reached via the "userNotes" search join on the PARENT record (confirmed live: search.Type.NOTE
 * has no directly-filterable "attached to" field - record/entity/transaction/recordtype/topic/
 * activity are all rejected as search criteria on that type - but customrecord1184 does expose a
 * valid "userNotes" join straight to its attached Note records).
 *
 * Because the search runs FROM the parent record (not from Note itself), a contract with zero
 * notes still produces exactly one search result row - the join simply comes back with every
 * joined field empty, not a missing row. Rows with no joined note id are filtered out below so a
 * note-less contract correctly returns an empty array instead of one all-blank fake note.
 *
 * Pulls both the standard Note fields (title/note/author/notedate/direction/notetype) and this
 * account's custom Note fields (custrecord1398/custrecord_cryo_hora/custrecord_cryo_urgente,
 * discovered live) since a probe showed the standard body fields may come back empty for notes
 * created this way - better to return both and let the caller pick whichever has content.
 *
 * Call as GET (query string) or POST (JSON body) - both use the same params shape:
 *   ?record=263494&recordtype=1184
 */
define(['N/search', 'N/log'], function (search, log) {

  // Only customrecord1184 (Contrato) is wired up today. Extend this map if notes are ever needed
  // for another custom record type - the key is the recordtype internal id from note.nl's URL,
  // the value is the SuiteScript record/search type id for that same record type.
  var RECORD_TYPE_MAP = {
    '1184': 'customrecord1184',
  };

  var JOIN_ID = 'userNotes';

  var COLUMNS = [
    'title', 'note', 'author', 'notedate', 'direction', 'notetype',
    'custrecord1398', 'custrecord_cryo_hora', 'custrecord_cryo_urgente',
  ];

  function getNotes(params) {
    try {
      var recordId = params && params.record;
      var recordType = params && params.recordtype;

      if (!recordId || !recordType) {
        return JSON.stringify({
          success: false,
          error: 'Missing required parameter(s): record, recordtype',
        });
      }

      var searchType = RECORD_TYPE_MAP[String(recordType)];
      if (!searchType) {
        return JSON.stringify({
          success: false,
          error: 'Unsupported recordtype: ' + recordType,
        });
      }

      var columns = COLUMNS.map(function (name) {
        var options = { name: name, join: JOIN_ID };
        if (name === 'notedate') {
          options.sort = search.Sort.DESC;
        }
        return search.createColumn(options);
      });
      columns.unshift(search.createColumn({ name: 'internalid', join: JOIN_ID }));

      var s = search.create({
        type: searchType,
        filters: [['internalid', 'anyof', [recordId]]],
        columns: columns,
      });

      var results = [];
      s.run().each(function (result) {
        function val(name) {
          return result.getValue({ name: name, join: JOIN_ID });
        }
        function text(name) {
          return result.getText({ name: name, join: JOIN_ID }) || val(name);
        }

        var noteId = val('internalid');
        if (!noteId) {
          // No note joined to this contract at all - the join came back empty, not missing.
          return true;
        }

        results.push({
          id: noteId,
          title: val('title'),
          note: val('note'),
          author: text('author'),
          date: val('notedate'),
          direction: text('direction'),
          noteType: text('notetype'),
          // This account's custom Note fields - populated when the standard ones above aren't.
          custom: {
            custrecord1398: val('custrecord1398'),
            hora: val('custrecord_cryo_hora'),
            urgente: val('custrecord_cryo_urgente'),
          },
        });
        return true; // keep iterating - up to search's own row cap (4000 for .each())
      });

      return JSON.stringify({ success: true, data: results });
    } catch (e) {
      log.error({ title: 'get-notes RESTlet error', details: e });
      return JSON.stringify({
        success: false,
        error: (e && e.message) || String(e),
      });
    }
  }

  return {
    get: getNotes,
    post: getNotes,
  };
});
