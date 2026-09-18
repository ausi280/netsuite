/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Returns NetSuite's native Notes attached to any record (standard entity, transaction, or
 * custom record - e.g. a contract, customrecord1184). SuiteQL/REST can't reach the note
 * body/title/author fields - NetSuite marks them NOT_EXPOSED for the SEARCH channel - so this
 * runs inside NetSuite instead: N/search finds the matching note ids (search IS allowed to
 * return internalid/date), then N/record.load reads each note's real fields (the record
 * channel isn't restricted the same way).
 *
 * Deploy as a RESTlet (Customization > Scripting > Scripts > New, upload this file, script
 * type Restlet, then create a Script Deployment for it and grant the integration's role
 * access). Call with GET:
 *   .../restlet.nl?script=<scriptid>&deploy=<deployid>&record=<id>&recordtype=<id>
 *
 * record     - internal id of the record the notes are attached to (required)
 * recordtype - internal id of that record's type, e.g. 1184 for a contract (required)
 */
define(['N/search', 'N/record'], (search, record) => {

  function get(params) {
    const recordId = params.record;
    const recordType = params.recordtype;

    if (!recordId || !recordType) {
      return { success: false, message: 'Missing required params: record, recordtype' };
    }

    const noteIds = [];
    search
      .create({
        type: search.Type.NOTE,
        filters: [
          ['record', 'anyof', recordId],
          'AND',
          ['recordtype', 'anyof', recordType],
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'date', sort: search.Sort.DESC }),
        ],
      })
      .run()
      .each((result) => {
        noteIds.push(result.getValue({ name: 'internalid' }));
        return true;
      });

    const notes = noteIds.map((id) => {
      const noteRecord = record.load({ type: record.Type.NOTE, id });
      return {
        id,
        title: noteRecord.getValue({ fieldId: 'title' }),
        note: noteRecord.getValue({ fieldId: 'note' }),
        author: noteRecord.getValue({ fieldId: 'author' }),
        authorText: noteRecord.getText({ fieldId: 'author' }),
        direction: noteRecord.getValue({ fieldId: 'direction' }),
        directionText: noteRecord.getText({ fieldId: 'direction' }),
        notetype: noteRecord.getValue({ fieldId: 'notetype' }),
        notetypeText: noteRecord.getText({ fieldId: 'notetype' }),
        date: noteRecord.getValue({ fieldId: 'date' }),
      };
    });

    return { success: true, data: notes };
  }

  return { get };
});
