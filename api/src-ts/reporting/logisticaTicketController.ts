import type { Request, Response } from 'express';
import axios, { type AxiosResponse } from 'axios';
import multer from 'multer';
import { getZammadConfig, getZammadDirectConfig, type ZammadDirectConfig } from '../config';

// Same branching the Logística form's own UI enforces client-side (see MARCA_TIPOS in
// web/src/config/logisticaTickets.ts - keep both in sync) - re-checked here so a crafted request
// can't submit a (marca, tipoSolicitud) combination the UI would never have offered.
const MARCA_TIPOS: Record<string, string[]> = {
  CRYOHOLDCO: ['Solicitud de guía', 'Material / Regalos'],
  'CRYO CELL': ['Recolección', 'Kit para stock', 'Envío de KIT Cliente', 'Material / Regalos'],
  'NIPT/CLARIX': ['Recolección NIPT', 'Kit para stock', 'Envío de KIT Cliente'],
  BCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  BSCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  DENTCELL: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  FCELLS: ['Recolección', 'Kit para stock', 'Envío de KIT Médico'],
  'RENEW THERAPIES': ['Recolección', 'Kit para stock'],
};

// Spanish labels for every dynamic subform field the form can submit - keyed by the field name the
// frontend uses in its `campos` JSON blob. Kept generic (label lookup + fallback) rather than one
// body string per subform, same convention the original PHP prototype used.
const FIELD_LABELS: Record<string, string> = {
  id_cliente: 'Id Cliente',
  zona: 'Zona',
  // Known address picked in the form (web/src/config/logisticaDirecciones.ts), e.g. "Ingenes / Toluca".
  remitente_sede: 'Remitente - Sede',
  destinatario_sede: 'Destinatario - Sede',
  nombre_mama: 'Nombre de mamá / celular',
  nombre_papa: 'Nombre de papá o contacto / celular',
  paquete_contratado: 'Paquete contratado',
  hospital_habitacion: 'Hospital y habitación',
  ciudad: 'Ciudad',
  notas: 'Notas',
  clarix_privado: 'Clarix o Privado',
  via: 'Vía',
  nombre_cliente: 'Nombre cliente',
  direccion: 'Dirección',
  horario_recoleccion: 'Horario de recolección',
  cantidad: 'Cantidad',
  tipo_kit: 'Tipo de kit',
  domicilio_entrega: 'Domicilio de entrega',
  tubos_extra: 'Tubos extra',
  formulario: 'Formulario',
  fecha_probable_parto: 'Fecha probable de parto',
  entre_calles: 'Entre calles',
  remitente_nombre: 'Remitente - Nombre',
  remitente_telefono: 'Remitente - Teléfono',
  remitente_correo: 'Remitente - Correo',
  remitente_domicilio: 'Remitente - Domicilio',
  remitente_notas: 'Remitente - Notas',
  destinatario_nombre: 'Destinatario - Nombre',
  destinatario_telefono: 'Destinatario - Teléfono',
  destinatario_correo: 'Destinatario - Correo',
  destinatario_domicilio: 'Destinatario - Domicilio',
  destinatario_entre_calles: 'Destinatario - Entre calles',
  que_envias: '¿Qué envías?',
  medidas_peso: 'Medidas y peso',
  requiere_seguro: '¿Requiere seguro?',
  monto: 'Monto del seguro',
  urgente: 'Urgencia de envío',
  nombre_medico: 'Nombre médico',
  nombre_paciente: 'Nombre paciente',
  servicio_contratado: 'Servicio contratado',
  domicilio: 'Domicilio',
  horario_atencion: 'Horario de atención',
  telefono_contacto: 'Teléfono de contacto',
  direccion_clinica: 'Dirección clínica/consultorio',
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, same cap as the original PHP prototype.

/** Memory storage - files are small (10MB cap) and only ever base64-encoded straight into the
 * Zammad payload, never written to this server's disk. */
export const logisticaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});

// Zammad "Zona" ticket field options (select, key = display) - keep in sync with ZONAS in
// web/src/config/logisticaTickets.ts. Re-checked here so a crafted request can't send a value
// Zammad's select wouldn't accept.
const ZONAS = new Set([
  'AGS', 'CANCUN', 'CDMX', 'CDMX/Ingenes', 'CDMX/Norte', 'CDMX/Poniente', 'CDMX/Sur', 'CHIHUAHUA', 'GDL',
  'HERMOSILLO', 'LEON', 'MORELIA', 'MTY', 'MTY/Operaciones', 'PUEBLA', 'QRO', 'TIJUANA',
]);

// Sections the article body groups fields into, by field-name prefix/membership - everything else
// lands in "Detalle de la solicitud". Remitente/Destinatario render side by side.
const PAQUETE_FIELDS = new Set(['que_envias', 'medidas_peso', 'requiere_seguro', 'monto', 'urgente']);
type BodySection = 'detalle' | 'remitente' | 'destinatario' | 'paquete';

function sectionOf(key: string): BodySection {
  if (key.startsWith('remitente_')) return 'remitente';
  if (key.startsWith('destinatario_')) return 'destinatario';
  if (PAQUETE_FIELDS.has(key)) return 'paquete';
  return 'detalle';
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

const CELL = 'padding:4px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;';
const LABEL_CELL = `${CELL}color:#6b7280;white-space:nowrap;`;
const HEADING = 'margin:16px 0 6px;font-size:14px;color:#111827;';

function htmlTable(rows: Array<[string, string]>): string {
  const body = rows.map(([label, value]) => `<tr><td style="${LABEL_CELL}">${escapeHtml(label)}</td><td style="${CELL}">${escapeHtml(value)}</td></tr>`).join('');
  return `<table style="border-collapse:collapse;font-size:13px;">${body}</table>`;
}

/**
 * HTML article body (content_type text/html): a summary block, then one table per section. Inline
 * styles only - Zammad sanitizes <style> blocks out of articles. Remitente and Destinatario share a
 * two-column row so a shipment reads "from -> to" at a glance instead of 10 interleaved lines.
 */
function buildBody(auditUser: Request['auditUser'], marca: string, tipoSolicitud: string, campos: Record<string, unknown>, comentarios: string): string {
  const sections: Record<BodySection, Array<[string, string]>> = { detalle: [], remitente: [], destinatario: [], paquete: [] };

  for (const [key, rawValue] of Object.entries(campos)) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;
    const section = sectionOf(key);
    // Inside its own section, "Remitente - Nombre" reads better as just "Nombre".
    const label = (FIELD_LABELS[key] ?? key).replace(/^(Remitente|Destinatario) - /, '');
    sections[section].push([label, value]);
  }

  const parts = [
    htmlTable([
      ['Solicitante', `${auditUser?.name ?? ''} <${auditUser?.username ?? ''}>`],
      ['Marca', marca],
      ['Tipo de solicitud', tipoSolicitud],
    ]),
  ];

  if (sections.detalle.length > 0) {
    parts.push(`<h3 style="${HEADING}">Detalle de la solicitud</h3>`, htmlTable(sections.detalle));
  }

  if (sections.remitente.length > 0 || sections.destinatario.length > 0) {
    const column = (title: string, rows: Array<[string, string]>) =>
      `<td style="vertical-align:top;padding-right:24px;"><h3 style="${HEADING}">${title}</h3>${rows.length > 0 ? htmlTable(rows) : '—'}</td>`;
    parts.push(`<table style="border-collapse:collapse;"><tr>${column('📦 Remitente', sections.remitente)}${column('📍 Destinatario', sections.destinatario)}</tr></table>`);
  }

  if (sections.paquete.length > 0) {
    parts.push(`<h3 style="${HEADING}">Paquete</h3>`, htmlTable(sections.paquete));
  }

  if (comentarios.trim()) {
    parts.push(`<h3 style="${HEADING}">Comentarios adicionales</h3>`, `<p style="font-size:13px;margin:0;">${escapeHtml(comentarios.trim())}</p>`);
  }

  return parts.join('\n');
}

function fieldValue(campos: Record<string, unknown>, key: string): string {
  const value = campos[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * ZAMMAD.MODE = "direct": the same payload the relay would forward, POSTed straight to Zammad's
 * /api/v1/tickets with this app's own token (see getZammadDirectConfig). Falls back to the relay
 * only when Zammad returned no HTTP response at all (connection refused/reset/dropped - what the
 * host firewall does to this app's IP); any real Zammad response, including an error, is final so
 * a ticket Zammad may already have created is never submitted twice.
 */
async function postDirect(
  direct: ZammadDirectConfig,
  data: Record<string, unknown>,
  postViaRelay: () => Promise<AxiosResponse>,
): Promise<AxiosResponse> {
  try {
    return await axios.post(`${direct.url}/api/v1/tickets`, data, {
      headers: {
        Authorization: `Token token=${direct.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  } catch (error: any) {
    if (error?.response || !direct.fallbackToRelay) throw error;
    console.warn(`[logistica] direct Zammad call got no response (${error?.code ?? error?.message}), falling back to relay`);
    return postViaRelay();
  }
}

/**
 * POST /api/reports/logistica/ticket (multipart/form-data: marca, tipoSolicitud, campos [JSON],
 * comentarios, attachment[] files) — creates a ticket in Zammad's "Operaciones::Logística" group.
 * The requester's name/email come from the verified Entra access token (req.auditUser), never from
 * a form field - the credentials only ever call Zammad's API as this app's own service account, so
 * the article's sender/from must be set explicitly or Zammad silently attributes every ticket to
 * that shared account instead of whoever actually submitted the request (confirmed against the
 * live instance while building this).
 *
 * Open to any signed-in user (no allowedEntities gate) - unlike HR/Prospectos/Commissions, every
 * internal user is expected to be able to file a logistics request.
 */
export async function createLogisticaTicketRoute(req: Request, res: Response): Promise<void> {
  const marca = typeof req.body.marca === 'string' ? req.body.marca : '';
  const tipoSolicitud = typeof req.body.tipoSolicitud === 'string' ? req.body.tipoSolicitud : '';
  const comentarios = typeof req.body.comentarios === 'string' ? req.body.comentarios : '';

  if (!MARCA_TIPOS[marca] || !MARCA_TIPOS[marca].includes(tipoSolicitud)) {
    res.status(400).json({ success: false, message: 'Marca o tipo de solicitud inválidos.' });
    return;
  }

  let campos: Record<string, unknown> = {};
  try {
    campos = req.body.campos ? JSON.parse(req.body.campos) : {};
  } catch {
    res.status(400).json({ success: false, message: 'El detalle de la solicitud no es válido.' });
    return;
  }

  const idCliente = fieldValue(campos, 'id_cliente');
  const zona = fieldValue(campos, 'zona');
  if (zona && !ZONAS.has(zona)) {
    res.status(400).json({ success: false, message: 'Zona inválida.' });
    return;
  }

  const files = Array.isArray(req.files) ? req.files : [];
  const attachments = files.map((file) => ({
    filename: file.originalname,
    'mime-type': file.mimetype,
    data: file.buffer.toString('base64'),
  }));

  let relayConfig: ReturnType<typeof getZammadConfig>;
  let direct: ZammadDirectConfig;
  try {
    relayConfig = getZammadConfig();
    direct = getZammadDirectConfig();
  } catch (error: any) {
    console.error(`[logistica] ${error?.message}`);
    res.status(500).json({ success: false, message: 'El servicio de tickets no está configurado correctamente.' });
    return;
  }
  const { relayUrl, relaySecret, group } = relayConfig;

  const requesterName = req.auditUser?.name ?? '';
  const requesterEmail = req.auditUser?.username ?? '';
  const asunto = `${tipoSolicitud} - Logística`;

  const data: Record<string, unknown> = {
    title: `${requesterName || 'Solicitud'} - ${marca} - ${tipoSolicitud} - Solicitud de Logística`,
    group,
    customer: {
      firstname: requesterName,
      email: requesterEmail,
    },
    // Ticket-level custom fields (confirmed on live Logística tickets): Id Cliente -> foliocontrato
    // (Recolección / Envío de kit), Zona -> zona (Kit para stock / Material / Regalos).
    ...(idCliente ? { foliocontrato: idCliente } : {}),
    ...(zona ? { zona } : {}),
    article: {
      subject: asunto,
      body: buildBody(req.auditUser, marca, tipoSolicitud, campos, comentarios),
      content_type: 'text/html',
      type: 'note',
      // See the function comment above - without this the article shows up authored by the
      // service account, not by whoever actually filled out the form.
      sender: 'Customer',
      from: `${requesterName} <${requesterEmail}>`,
      internal: false,
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    priority: '1 Baja',
    priority_id: 1,
    state_id: 2,
  };

  // Goes through zammad-relay.php (see getZammadConfig's comment) instead of calling Zammad
  // directly - this app's outbound IP is rejected by Zammad's own host firewall.
  const postViaRelay = () =>
    axios.post(relayUrl, data, {
      headers: {
        'X-Relay-Secret': relaySecret,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

  try {
    const response = direct.mode === 'direct' ? await postDirect(direct, data, postViaRelay) : await postViaRelay();

    res.status(200).json({
      success: true,
      ticket: response.data?.number ?? '',
      message: `Solicitud enviada. Ticket #${response.data?.number ?? ''} creado correctamente.`,
    });
  } catch (error: any) {
    const status = error?.response?.status || 502;
    const message = error?.response?.data ? JSON.stringify(error.response.data) : error?.message || 'No se pudo contactar al servicio de tickets.';
    // Which host actually answered (direct Zammad vs zammad-relay.php) - both sit behind host-level
    // bot protection, and the error body alone doesn't say which one blocked us.
    const via = error?.config?.url ?? null;
    console.error(`[logistica] ticket creation failed (${status}) via ${via}: ${message}`);
    res.status(status).json({ success: false, message, mode: direct.mode, via });
  }
}
