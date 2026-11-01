/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Sets a contract's (customrecord1184) "pago automático" checkbox - custrecord_cryo_mx_pagoautomatico
 * - to true and "Terminación tarjeta" (custrecord_cryo_mx_terminacion_tarjeta) to "MP" (MercadoPago),
 * for the domiciliación push (api/src-ts/services/domiciliacionPushService.ts). Exists
 * because the REST Record API can't: a PATCH re-validates the whole record, and ~180k contracts have
 * no Vendedor (custrecord_cryo_vendedor, mandatory) - "Introduzca valores para: Vendedor".
 * record.submitFields with ignoreMandatoryFields writes just this one field without that check.
 * Deliberately single-purpose (no arbitrary field/record type from the caller).
 *
 * Deploy as a RESTlet (Customization > Scripting > Scripts > New, upload this file, script type
 * Restlet, then create a Script Deployment for it and grant the integration's role access), then
 * put its ids in config.json SERVICES.ERP.PAGO_AUTOMATICO_RESTLET { SCRIPT, DEPLOY }. Call with POST:
 *   .../restlet.nl?script=<scriptid>&deploy=<deployid>   body: { "contractIds": ["209902", ...] }
 * Returns { success, results: [{ id, ok, message? }] } - one entry per id, so one bad id never
 * fails the others.
 */
define(['N/record'], (record) => {
  const CONTRACT_RECORD_TYPE = 'customrecord1184';
  const MAX_IDS = 100;

  function post(body) {
    const ids = Array.isArray(body && body.contractIds) ? body.contractIds.map(String).filter((id) => /^\d+$/.test(id)) : [];
    if (ids.length === 0) {
      return JSON.stringify({ success: false, message: 'contractIds (numeric internal ids) is required.' });
    }
    if (ids.length > MAX_IDS) {
      return JSON.stringify({ success: false, message: `At most ${MAX_IDS} contractIds per call.` });
    }

    const results = ids.map((id) => {
      try {
        record.submitFields({
          type: CONTRACT_RECORD_TYPE,
          id,
          values: { custrecord_cryo_mx_pagoautomatico: true, custrecord_cryo_mx_terminacion_tarjeta: 'MP' },
          options: { enableSourcing: false, ignoreMandatoryFields: true },
        });
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, message: e.message || String(e) };
      }
    });

    return JSON.stringify({ success: results.every((r) => r.ok), results });
  }

  return { post };
});
