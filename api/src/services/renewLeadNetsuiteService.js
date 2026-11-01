const netsuiteService = require('./netsuiteService');
const { splitFullName } = require('./leadNetsuiteService');

/**
 * Pushes Renew Therapies' Meta lead-ads contacts (the "Renew Form Meta" Google Sheet) into NetSuite
 * as leads - NetSuite only, no legacy SQL Server insert (unlike the CryoCell sheet flow).
 *
 * Every id below was confirmed live (2026-10-20) against Renew's existing leads, e.g. customer
 * 158525: subsidiary 10 "RENEW THERAPIES", entry form 741 "CRYO MX | Cliente Potencial Renew",
 * entitystatus 7 "Cliente potencial (lead)", custentity_nso_lead_marca 10 "RENEW".
 */
const SUBSIDIARY_ID = '10';
const CUSTOM_FORM_ID = '741';
const LEAD_ENTITY_STATUS_ID = '7';
// custentity_nso_lead_marca list ids, confirmed live 2026-10-22 (10 "RENEW", 5 "FCELLS") - every Meta lead
// sheet reuses form 741 / subsidiary 10 and only sets a different marca.
const MARCA_IDS = { RENEW: '10', FCELLS: '5' };
// "Categoría" is mandatory on form 741 - 3 "CLIENTE", same as every existing Renew lead.
const CATEGORY_ID = '3';
// Sales rep: employee 159771 "TAPIA ZEPEDA, ALDO ALEJANDRO" (alejandro.tapia@cryoholdco.com), per
// explicit instruction - NOT 157980 (his @renewtherapies.com record, on the older imported leads).
const SALES_REP_ID = '159771';

/** Meta's `platform` column -> custentity_cryo_canalingreso (27 FACEBOOK, 17 INSTAGRAM). */
const CANAL_BY_PLATFORM = { fb: '27', ig: '17' };

function escapeSuiteQlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

/** Meta answers come snake_cased ("rejuvenecimiento_y_bienestar_facial") - back to plain text. */
function humanize(value) {
  return value ? String(value).replace(/_/g, ' ').trim() : '';
}

/** "p:+525532355280" -> "5532355280" (same normalization as the CryoCell sheet flow). */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/^p:\s*/i, '').replace(/^\+52/, '').replace(/\D/g, '');
  return digits || null;
}

/** "l:1596113502083039" -> "META-1596113502083039" - NetSuite externalId, so a lead can never be
 * created twice for the same Meta lead even if its sheet row loses its status. */
function toExternalId(metaLeadId) {
  const id = String(metaLeadId || '').replace(/^l:/, '').trim();
  return id ? `META-${id}` : null;
}

/** Existing Renew customer for this lead: same Meta lead (externalId), else phone, else email. */
async function findExistingRenewCustomerId({ externalId, phone, email }) {
  const lookups = [];
  if (externalId) lookups.push(`externalid = '${escapeSuiteQlLiteral(externalId)}'`);
  // NetSuite stores phones formatted ("993 233 3006") - compare digits only.
  if (phone) lookups.push(`REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+52', '') = '${escapeSuiteQlLiteral(phone)}'`);
  if (email) lookups.push(`LOWER(email) = '${escapeSuiteQlLiteral(String(email).toLowerCase())}'`);

  for (const condition of lookups) {
    const rows = await netsuiteService.runSuiteQL(`SELECT id FROM customer WHERE subsidiary = ${SUBSIDIARY_ID} AND ${condition}`);
    if (rows.length) return rows[0].id;
  }
  return null;
}

// NetSuite rejects firstName/lastName longer than this ("El campo lastname contenía más del número
// máximo ( 32 ) de caracteres") - Meta lets people type anything, e.g. a whole bio as their name.
const NAME_MAX_LENGTH = 32;

function clipName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX_LENGTH).trim();
}

/** FCELLS' form gives first_name/last_name separately - use them as-is; Renew's single
 * nombre_completo gets split. Both clipped to NAME_MAX_LENGTH. */
function resolveName(lead) {
  const split = lead.firstName || lead.lastName ? { firstName: lead.firstName, lastName: lead.lastName } : splitFullName(lead.fullName);
  return {
    firstName: clipName(split.firstName),
    lastName: clipName(split.lastName) || splitFullName('').lastName,
  };
}

/**
 * Creates (or, if it already exists, updates the contact fields of) one Renew lead.
 * `lead` = { marcaId (defaults to RENEW), metaLeadId, createdTime, fullName or firstName/lastName, email, phone, platform, campaignName, interes,
 * tratamientoPrevio, disposicion }. Returns { id, created }.
 */
async function upsertRenewLeadInNetsuite(lead) {
  const phone = normalizePhone(lead.phone);
  const email = lead.email ? String(lead.email).trim() : null;
  const externalId = toExternalId(lead.metaLeadId);
  const { firstName, lastName } = resolveName(lead);

  const observaciones = [
    lead.tratamientoPrevio ? `¿Tratamiento regenerativo previo?: ${humanize(lead.tratamientoPrevio)}` : null,
    lead.disposicion ? `Disposición a iniciar: ${humanize(lead.disposicion)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const contactFields = {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: email || undefined,
    phone: phone || undefined,
  };

  const existingId = await findExistingRenewCustomerId({ externalId, phone, email });
  if (existingId) {
    await netsuiteService.updateRecord('customer', existingId, contactFields);
    return { id: existingId, created: false };
  }

  const canal = CANAL_BY_PLATFORM[String(lead.platform || '').toLowerCase()];
  // The call center's lead lists ("Nombre del lead" column) show companyname - every hand-made
  // Renew lead is company-type with the person's name there, so a lead created without it shows
  // "- None -". Set on create only, so an update never overwrites a name someone typed by hand.
  const companyName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 83) || undefined;
  const createdDate = lead.createdTime ? String(lead.createdTime).slice(0, 10) : undefined;

  const createBody = {
    customForm: { id: CUSTOM_FORM_ID },
    subsidiary: { id: SUBSIDIARY_ID },
    isPerson: true,
    entityStatus: { id: LEAD_ENTITY_STATUS_ID },
    category: { id: CATEGORY_ID },
    salesRep: { id: SALES_REP_ID },
    externalId: externalId || undefined,
    companyName,
    custentity_nso_lead_marca: { id: lead.marcaId || MARCA_IDS.RENEW },
    custentity_cryo_canalingreso: canal ? { id: canal } : undefined,
    custentity_cryo_campana: lead.campaignName || undefined,
    custentity_cryo_padecimiento: humanize(lead.interes) || undefined,
    custentity_cryo_observfunnel: observaciones || undefined,
    custentity_nso_lead_interaccion: createdDate,
    ...contactFields,
  };

  try {
    const newId = await netsuiteService.createRecord('customer', createBody);
    return { id: newId, created: true };
  } catch (error) {
    // The customer ID (entityid) defaults to "First Last" and must be unique account-wide, so a
    // namesake in any subsidiary (e.g. "Patricia Alfaro", a BIOCELLS customer) blocks the create.
    // Retry once with the phone (or Meta lead id) appended - same idea as leadNetsuiteService's buildEntityId.
    if (!/Ya existe un registro de cliente con este ID|unique customer ID/i.test(String(error.message))) throw error;
    const suffix = phone || (externalId ? externalId.replace(/^META-/, '') : String(Date.now()));
    const entityId = `${[firstName, lastName].filter(Boolean).join(' ')} - ${suffix}`;
    const newId = await netsuiteService.createRecord('customer', { ...createBody, entityId });
    return { id: newId, created: true };
  }
}

module.exports = {
  upsertRenewLeadInNetsuite,
  MARCA_IDS,
  findExistingRenewCustomerId,
  normalizePhone,
};
