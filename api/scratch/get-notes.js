/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Two modes:
 *  1. Single-record (unchanged from the original version): {record, recordtype} - returns notes
 *     attached to one record, via the same userNotes join as always. Used by the per-contract
 *     Notes tab (see netsuiteNotesRepository.ts) - nothing about this path changed.
 *  2. Bulk/date-range (new): {dateFrom, dateTo, recordtype?, startPage?} (no record) - returns
 *     notes across EVERY record of that type whose own notedate falls within [dateFrom, dateTo]
 *     ("YYYY-MM-DD", converted to the account's locale format internally), for the "Reporte de
 *     Notas" report. Paginated across MULTIPLE RESTlet calls (via startPage/nextStartPage)
 *     instead of trying to fetch everything in one execution, since a wide date range across
 *     ~220k contracts could otherwise exceed a single call's governance/time budget - each call
 *     only fetches up to BULK_PAGES_PER_CALL pages (5,000 notes) and tells the caller where to
 *     resume. Each result row also carries the parent record's own internal id + name (recordId/
 *     recordName), so the caller can tell which contract a note belongs to.
 *
 * Reached via the "userNotes" search join on the PARENT record (confirmed live: search.Type.NOTE
 * has no directly-filterable "attached to" field - record/entity/transaction/recordtype/topic/
 * activity are all rejected as search criteria on that type - but customrecord1184 does expose a
 * valid "userNotes" join straight to its attached Note records).
 *
 * Because the search runs FROM the parent record (not from Note itself), a contract with zero
 * notes still produces exactly one search result row - the join simply comes back with every
 * joined field empty, not a missing row. Rows with no joined note id are filtered out below so a
 * note-less contract correctly returns an empty array instead of one all-blank fake note. In bulk
 * mode this is moot anyway, since the date-range filter on the joined field already requires a
 * real joined note to match.
 *
 * Pulls both the standard Note fields (title/note/author/notedate/direction/notetype) and this
 * account's custom Note fields (custrecord1398/custrecord_cryo_hora/custrecord_cryo_urgente,
 * discovered live) since a probe showed the standard body fields may come back empty for notes
 * created this way - better to return both and let the caller pick whichever has content.
 *
 * Call as GET (query string) or POST (JSON body):
 *   Single-record: ?record=263494&recordtype=1184
 *   Bulk:          ?dateFrom=2026-01-01&dateTo=2026-09-25&recordtype=1184&startPage=0
 */
define(['N/search', 'N/log', 'N/format'], function (search, log, format) {

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

  var BULK_PAGE_SIZE = 1000;
  var BULK_PAGES_PER_CALL = 5; // 5,000 notes per RESTlet call - see file header.

  function buildNoteColumns() {
    var columns = COLUMNS.map(function (name) {
      var options = { name: name, join: JOIN_ID };
      if (name === 'notedate') {
        options.sort = search.Sort.DESC;
      }
      return search.createColumn(options);
    });
    columns.unshift(search.createColumn({ name: 'internalid', join: JOIN_ID }));
    return columns;
  }

  function noteRowFromResult(result) {
    function val(name) {
      return result.getValue({ name: name, join: JOIN_ID });
    }
    function text(name) {
      return result.getText({ name: name, join: JOIN_ID }) || val(name);
    }

    var noteId = val('internalid');
    if (!noteId) return null; // join came back empty, not missing - see file header

    return {
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
    };
  }

  // 'YYYY-MM-DD' -> this account's locale date format, for use as a search filter value -
  // avoids assuming the account's date locale (verified DD/MM/YYYY throughout this account, but
  // built this way regardless so it never depends on that assumption holding).
  function toAccountDate(isoDate) {
    var parts = isoDate.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return format.format({ type: format.Type.DATE, value: d });
  }

  function getNotesForRecord(searchType, recordId) {
    var s = search.create({
      type: searchType,
      filters: [['internalid', 'anyof', [recordId]]],
      columns: buildNoteColumns(),
    });

    var results = [];
    s.run().each(function (result) {
      var row = noteRowFromResult(result);
      if (row) results.push(row);
      return true; // keep iterating - up to search's own row cap (4000 for .each())
    });

    return results;
  }

  function getNotesBulk(searchType, dateFrom, dateTo, startPage) {
    var filters = [
      search.createFilter({
        name: 'notedate',
        join: JOIN_ID,
        operator: search.Operator.WITHIN,
        values: [toAccountDate(dateFrom), toAccountDate(dateTo)],
      }),
    ];

    var columns = buildNoteColumns();
    columns.unshift(search.createColumn({ name: 'name' }));
    columns.unshift(search.createColumn({ name: 'internalid' }));

    var s = search.create({ type: searchType, filters: filters, columns: columns });
    var pagedData = s.runPaged({ pageSize: BULK_PAGE_SIZE });

    var totalPages = pagedData.pageRanges.length;
    var endPage = Math.min(startPage + BULK_PAGES_PER_CALL, totalPages);

    var results = [];
    for (var i = startPage; i < endPage; i++) {
      var page = pagedData.fetch({ index: pagedData.pageRanges[i].index });
      page.data.forEach(function (result) {
        var row = noteRowFromResult(result);
        if (!row) return;
        row.recordId = result.getValue({ name: 'internalid' });
        row.recordName = result.getValue({ name: 'name' });
        results.push(row);
      });
    }

    return {
      results: results,
      nextStartPage: endPage < totalPages ? endPage : null,
      totalPages: totalPages,
    };
  }

  function getNotes(params) {
    try {
      var recordType = (params && params.recordtype) || '1184';
      var searchType = RECORD_TYPE_MAP[String(recordType)];
      if (!searchType) {
        return JSON.stringify({ success: false, error: 'Unsupported recordtype: ' + recordType });
      }

      var recordId = params && params.record;
      if (recordId) {
        return JSON.stringify({ success: true, data: getNotesForRecord(searchType, recordId) });
      }

      var dateFrom = params && params.dateFrom;
      var dateTo = params && params.dateTo;
      if (dateFrom && dateTo) {
        var startPage = (params && parseInt(params.startPage, 10)) || 0;
        var bulk = getNotesBulk(searchType, dateFrom, dateTo, startPage);
        return JSON.stringify({
          success: true,
          data: bulk.results,
          nextStartPage: bulk.nextStartPage,
          totalPages: bulk.totalPages,
        });
      }

      return JSON.stringify({
        success: false,
        error: 'Provide either {record, recordtype} or {dateFrom, dateTo} ("YYYY-MM-DD").',
      });
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
