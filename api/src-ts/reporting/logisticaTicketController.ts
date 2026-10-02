import type { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { getZammadConfig } from '../config';

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

function buildBody(auditUser: Request['auditUser'], marca: string, tipoSolicitud: string, campos: Record<string, unknown>, comentarios: string): string {
  const lines = [
    `Solicitante: ${auditUser?.name ?? ''} <${auditUser?.username ?? ''}>`,
    `Marca: ${marca}`,
    `Tipo de solicitud: ${tipoSolicitud}`,
    '',
  ];

  for (const [key, rawValue] of Object.entries(campos)) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;
    const label = FIELD_LABELS[key] ?? key;
    lines.push(`${label}: ${value}`);
  }

  if (comentarios.trim()) {
    lines.push('', `Comentarios adicionales: ${comentarios.trim()}`);
  }

  return lines.join('\n');
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

  const files = Array.isArray(req.files) ? req.files : [];
  const attachments = files.map((file) => ({
    filename: file.originalname,
    'mime-type': file.mimetype,
    data: file.buffer.toString('base64'),
  }));

  const { relayUrl, relaySecret, group } = getZammadConfig();

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
    article: {
      subject: asunto,
      body: buildBody(req.auditUser, marca, tipoSolicitud, campos, comentarios),
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

  try {
    // Goes through zammad-relay.php (see getZammadConfig's comment) instead of calling Zammad
    // directly - this app's outbound IP is rejected by Zammad's own host firewall.
    const response = await axios.post(relayUrl, data, {
      headers: {
        'X-Relay-Secret': relaySecret,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    res.status(200).json({
      success: true,
      ticket: response.data?.number ?? '',
      message: `Solicitud enviada. Ticket #${response.data?.number ?? ''} creado correctamente.`,
    });
  } catch (error: any) {
    const status = error?.response?.status || 502;
    const message = error?.response?.data ? JSON.stringify(error.response.data) : error?.message || 'No se pudo contactar al servicio de tickets.';
    res.status(status).json({ success: false, message });
  }
}
