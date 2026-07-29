const netsuiteService = require('./netsuiteService');

/**
 * Pushes leads (currently: Google Sheets) into NetSuite as Customer records
 * on the "CRYO MX | Cliente potencial 2.0" entry form (internal ID 874),
 * subsidiary 5. Runs alongside the existing SQL Server insert, not instead
 * of it.
 */

const CUSTOM_FORM_ID = '874';
const SUBSIDIARY_ID = '5';
const LEAD_STATUS_NAME = 'Cliente potencial (lead)';
// custentity_nso_lead_marca (Marca de interés) is mandatory on this form but
// has no source column in the Google Sheet — CryoCell matches the "Empresa=1"
// convention already used for this MX lead flow elsewhere in the codebase.
const DEFAULT_BRAND_NAME = 'CryoCell';
// custentity_cryo_ginecologo (Ginecólogo) is mandatory but its list
// (customlist_cryo_ginecologos) only has 3 real doctor names, no
// "unassigned" placeholder. Confirmed default for unassigned Google Sheets
// leads: id 1, "Dr. Daniel Hernández Flores" — reassign manually in NetSuite
// once a real doctor is known.
const DEFAULT_GINECOLOGO_ID = '1';

let cachedEntityStatusId = null;

function escapeSuiteQlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

async function resolveLeadEntityStatusId() {
  if (cachedEntityStatusId) {
    return cachedEntityStatusId;
  }

  const rows = await netsuiteService.runSuiteQL(`
    SELECT "key" FROM entitystatus
    WHERE entitytype = 'LEAD' AND name = '${escapeSuiteQlLiteral(LEAD_STATUS_NAME)}'
  `);

  if (!rows.length) {
    throw new Error(`Could not resolve NetSuite entity status "${LEAD_STATUS_NAME}" — check the exact list value name.`);
  }

  cachedEntityStatusId = rows[0].key;
  return cachedEntityStatusId;
}

/**
 * Finds an existing customer in the target subsidiary by phone first,
 * falling back to email.
 */
async function findExistingCustomerId({ phone, email }) {
  if (phone) {
    const rows = await netsuiteService.runSuiteQL(`
      SELECT id FROM customer
      WHERE subsidiary = ${SUBSIDIARY_ID}
        AND (phone = '${escapeSuiteQlLiteral(phone)}' OR mobilephone = '${escapeSuiteQlLiteral(phone)}')
    `);
    if (rows.length) {
      return rows[0].id;
    }
  }

  if (email) {
    const rows = await netsuiteService.runSuiteQL(`
      SELECT id FROM customer
      WHERE subsidiary = ${SUBSIDIARY_ID}
        AND email = '${escapeSuiteQlLiteral(email)}'
    `);
    if (rows.length) {
      return rows[0].id;
    }
  }

  return null;
}

function buildEntityId(lead) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  return name || lead.email || lead.phone || `lead-${Date.now()}`;
}

// NetSuite requires lastName (labeled "Apellidos") whenever isPerson=true,
// but the Google Sheet's "full_name" column holds the entire name and the
// separate "Last Name" column is usually empty — so lastName often arrives
// blank. Splits on the first token; everything after it becomes the last
// name. Falls back to a placeholder for single-word names, or when what's
// left after the first token has no actual letters in it (stray emoji/symbols).
const NO_LAST_NAME_PLACEHOLDER = 'No Apellido Provided';
const HAS_LETTER = /\p{L}/u;

function splitFullName(fullName) {
  const trimmed = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { firstName: '', lastName: NO_LAST_NAME_PLACEHOLDER };
  }
  const [firstName, ...rest] = trimmed.split(' ');
  const lastName = rest.join(' ').trim();
  return {
    firstName,
    lastName: lastName && HAS_LETTER.test(lastName) ? lastName : NO_LAST_NAME_PLACEHOLDER,
  };
}

// Only splits full_name into first/last when the sheet didn't already give
// us a distinct last name — a real, separately-provided last name always wins.
function resolveContactName(lead) {
  if (lead.lastName && String(lead.lastName).trim()) {
    return { firstName: lead.firstName || '', lastName: String(lead.lastName).trim() };
  }
  return splitFullName(lead.firstName);
}

// custentity_nso_lead_gestacion is a list field with entries like "10 semanas",
// not a raw number — this maps the sheet's plain week count to that format.
function toWeeksPregnantRef(weeksPregnant) {
  if (weeksPregnant === undefined || weeksPregnant === null || weeksPregnant === '') {
    return undefined;
  }
  const weeks = String(weeksPregnant).match(/\d+/);
  return weeks ? { refName: `${weeks[0]} semanas` } : undefined;
}

const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const SPANISH_MONTH_ALIASES = { setiembre: 8 };

function stripAccents(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function resolveSpanishMonthIndex(token) {
  const normalized = stripAccents(token.toLowerCase());
  if (SPANISH_MONTH_ALIASES[normalized] !== undefined) {
    return SPANISH_MONTH_ALIASES[normalized];
  }
  if (normalized.length < 3) {
    return -1;
  }
  return SPANISH_MONTHS.findIndex((month) => month.startsWith(normalized));
}

function toIsoDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The sheet's due-date column is free text, entered by hand — real values
 * seen in production include "28 Noviembre 2026", "28 de agosto de 2026",
 * "4de agosto" (no space), "20 de noviembre" (no year), "30/10/2016",
 * and non-dates like "Ya nació" or a bare "1". Returns a Date or null.
 */
function parseSpanishDueDate(raw) {
  if (!raw) {
    return null;
  }
  const trimmed = String(raw).trim();

  const numeric = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (numeric) {
    const [, day, month, year] = numeric;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  const textual = trimmed.match(/^(\d{1,2})\s*(?:de\s*)?([a-zA-Záéíóúñ]+)(?:\s*(?:de\s*)?(\d{4}))?$/i);
  if (textual) {
    const [, dayStr, monthToken, yearStr] = textual;
    const monthIndex = resolveSpanishMonthIndex(monthToken);
    if (monthIndex >= 0) {
      const day = Number(dayStr);
      if (yearStr) {
        const date = new Date(Number(yearStr), monthIndex, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      } else {
        // No year given — assume the next upcoming occurrence, since this is
        // meant to be a future due date.
        const now = new Date();
        const thisYear = new Date(now.getFullYear(), monthIndex, day);
        const date = thisYear < now ? new Date(now.getFullYear() + 1, monthIndex, day) : thisYear;
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  return null;
}

/**
 * Never throws and never returns a value NetSuite would reject — falls back
 * to today + 30 days for anything unparseable ("Ya nació", a bare "1",
 * blank cells, typos), per explicit instruction: a bad due-date value must
 * never crash the sync.
 */
function resolveDueDateIso(raw) {
  const parsed = parseSpanishDueDate(raw);
  if (parsed) {
    return toIsoDateString(parsed);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 30);
  return toIsoDateString(fallback);
}

/**
 * lead: { firstName, lastName, email, phone, weeksPregnant, dueDate }
 *
 * Note: custentity_cryo_ciudad and custentity_nso_lead_potencial are
 * intentionally not mapped yet — both are list/record fields (not free text)
 * and neither is actually mandatory on this form (see form XML). ciudad's
 * underlying list (customlist1758) currently only has Colombian cities, so
 * there's no valid Mexican value to send; add the mapping once MX cities
 * exist in that list (or a different field is used for MX).
 *
 * Returns { id, created: boolean }.
 */
async function upsertLeadInNetsuite(lead) {
  const existingId = await findExistingCustomerId({ phone: lead.phone, email: lead.email });
  const { firstName, lastName } = resolveContactName(lead);

  // Standard (non-custom) multi-word fields use camelCase property names in
  // the REST Record API's JSON schema (firstName, entityId, mobilePhone,
  // entityStatus, isPerson...) — NOT the lowercase SuiteScript field IDs.
  // Custom fields (custentity_*) keep their script ID as-is either way.
  const contactFields = {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: lead.email || undefined,
    phone: lead.phone || undefined,
    custentity_nso_lead_gestacion: toWeeksPregnantRef(lead.weeksPregnant),
    custentity_nso_lead_parto: resolveDueDateIso(lead.dueDate),
    custentity_cryo_asistente_doctor: lead.doctorAssistant || 'N/A',
  };

  if (existingId) {
    await netsuiteService.updateRecord('customer', existingId, contactFields);
    return { id: existingId, created: false };
  }

  const entityStatusId = await resolveLeadEntityStatusId();

  const createBody = {
    customForm: { id: CUSTOM_FORM_ID },
    subsidiary: { id: SUBSIDIARY_ID },
    isPerson: true,
    entityStatus: { id: entityStatusId },
    entityId: buildEntityId({ firstName, lastName, email: lead.email, phone: lead.phone }),
    custentity_nso_lead_marca: { refName: DEFAULT_BRAND_NAME },
    custentity_cryo_ginecologo: { id: DEFAULT_GINECOLOGO_ID },
    ...contactFields,
  };

  const newId = await netsuiteService.createRecord('customer', createBody);
  return { id: newId, created: true };
}

module.exports = {
  upsertLeadInNetsuite,
  findExistingCustomerId,
  resolveLeadEntityStatusId,
};
