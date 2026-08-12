const netsuiteService = require('./netsuiteService');

const PARTIDAS_TYPE = 'customrecord_cryo_partidas';

// NetSuite returns/accepts dates for this account as DD/MM/YYYY.
function parseNsDate(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDmy(date) {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

function addDaysUtc(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function lastDayOfMonthUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/**
 * Replicates NSO_cntrts_gen_ue.js's confirmedDateProcess(): that UE only runs
 * this logic when runtime.executionContext === USER_INTERFACE, so REST API
 * writes to custrecord_cryo_fnacimientoconf never trigger it. This mirrors
 * its exact algorithm so partida (annuity installment) dates stay in sync
 * with the confirmed birth date when updated via this API instead of the UI.
 *
 * Shifts every partida tied to the contract by the same number of days the
 * confirmed birth date moved relative to the "processing line" partida (or,
 * if there is none, relative to the previous confirmed birth date), then
 * returns the new custrecord_cryo_fecha_ini_ultima_a anchor (the latest
 * shifted start date). Returns null when nothing should change.
 */
async function shiftAnnuityDates(contractId, newConfIso, oldConfStr) {
  const partidas = await netsuiteService.runSuiteQL(
    `SELECT id, custrecord_cryo_linea_procesamiento, custrecord_cryo_iniciovigencia, custrecord_cryo_finvigencia, custrecord_cryo_concepto FROM ${PARTIDAS_TYPE} WHERE custrecord_cryo_numcontrato = ${Number(contractId)} AND isinactive = 'F'`,
  );

  if (partidas.length === 0) return null;

  const processingLine = partidas.find((p) => p.custrecord_cryo_linea_procesamiento === 'T');
  const partStartDate = processingLine
    ? parseNsDate(processingLine.custrecord_cryo_iniciovigencia)
    : parseNsDate(oldConfStr);
  if (!partStartDate) return null;

  const newConf = new Date(`${newConfIso}T00:00:00Z`);
  const diffInDays = Math.round((newConf.getTime() - partStartDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffInDays === 0) return null;

  let lastDate = null;

  for (const partida of partidas) {
    const currStart = parseNsDate(partida.custrecord_cryo_iniciovigencia);
    const currEnd = parseNsDate(partida.custrecord_cryo_finvigencia);
    if (!currStart || !currEnd) continue;

    const newStart = addDaysUtc(currStart, diffInDays);
    const newEnd = addDaysUtc(currEnd, diffInDays);
    const paymentDeadline = lastDayOfMonthUtc(newStart);

    if (!lastDate || newStart.getTime() > lastDate.getTime()) lastDate = newStart;

    const dateRange = `${formatDmy(currStart)}-${formatDmy(currEnd)}`;
    const dateRange2 = `${formatDmy(currStart)} ${formatDmy(currEnd)}`;
    const concept = partida.custrecord_cryo_concepto || '';
    const idx = concept.indexOf(dateRange);
    const idx2 = concept.indexOf(dateRange2);
    const newConcept = idx !== -1 || idx2 !== -1
      ? concept.substring(0, idx !== -1 ? idx : idx2) + `${formatDmy(newStart)}-${formatDmy(newEnd)}`
      : concept;

    await netsuiteService.updateRecord(PARTIDAS_TYPE, partida.id, {
      custrecord_cryo_aniopartida: newStart.getUTCFullYear(),
      custrecord_cryo_iniciovigencia: formatIsoDate(newStart),
      custrecord_cryo_finvigencia: formatIsoDate(newEnd),
      custrecord_cryo_fechalimitepago: formatIsoDate(paymentDeadline),
      custrecord_cryo_concepto: newConcept,
    });
  }

  return lastDate ? formatIsoDate(lastDate) : null;
}

module.exports = { shiftAnnuityDates, parseNsDate };
