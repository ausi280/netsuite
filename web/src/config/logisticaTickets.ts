export type Marca = 'CRYOHOLDCO' | 'CRYO CELL' | 'NIPT/CLARIX' | 'BCU' | 'BSCU' | 'DENTCELL' | 'FCELLS' | 'RENEW THERAPIES';

export const MARCAS: Marca[] = ['CRYOHOLDCO', 'CRYO CELL', 'NIPT/CLARIX', 'BCU', 'BSCU', 'DENTCELL', 'FCELLS', 'RENEW THERAPIES'];

// Which "tipo de solicitud" options each marca offers - CRYO CELL gets an extra "Material /
// Regalos" option the other collection brands don't, NIPT/CLARIX's flow is worded/shaped
// differently throughout, CRYOHOLDCO (the corporate brand, no sample collection of its own) only
// ever deals in courier guides and gift shipments, FCELLS's collection flow is médico/paciente-
// oriented rather than mamá/papá (hence its own "Envío de KIT Médico" wording, not "... Cliente"),
// and RENEW THERAPIES has no envío-de-kit-a-cliente flow at all (added 2026-10-01, per explicit
// instruction - both were missing from the original brand list).
export const MARCA_TIPOS: Record<Marca, string[]> = {
  CRYOHOLDCO: ['Solicitud de guía', 'Material / Regalos'],
  'CRYO CELL': ['Recolección', 'Kit para stock', 'Envío de KIT Cliente', 'Material / Regalos'],
  'NIPT/CLARIX': ['Recolección NIPT', 'Kit para stock', 'Envío de KIT Cliente'],
  BCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  BSCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  DENTCELL: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  FCELLS: ['Recolección', 'Kit para stock', 'Envío de KIT Médico'],
  'RENEW THERAPIES': ['Recolección', 'Kit para stock'],
};

export type SubformKey =
  | 'recoleccion'
  | 'recoleccion_nipt'
  | 'recoleccion_medico'
  | 'kit_stock'
  | 'kit_stock_nipt'
  | 'envio_kit'
  | 'envio_kit_nipt'
  | 'envio_kit_medico'
  | 'material_regalos'
  | 'solicitud_guia';

/** Resolves which subform to show for a (marca, tipoSolicitud) pair - "Kit para stock" reads the
 * same on every brand but needs different fields for NIPT/CLARIX; "Recolección" reads the same on
 * every brand but needs different (médico/paciente) fields for FCELLS/RENEW THERAPIES. "Envío de
 * KIT Médico" is its own distinctly-worded tipo (only FCELLS offers it), so it maps directly with
 * no extra marca check needed. */
export function resolveSubformKey(marca: string, tipo: string): SubformKey | null {
  const nipt = marca === 'NIPT/CLARIX';
  const medico = marca === 'FCELLS' || marca === 'RENEW THERAPIES';

  if (tipo === 'Recolección NIPT') return 'recoleccion_nipt';
  if (tipo === 'Recolección') return medico ? 'recoleccion_medico' : 'recoleccion';
  if (tipo === 'Kit para stock') return nipt ? 'kit_stock_nipt' : 'kit_stock';
  if (tipo === 'Envío de KIT Cliente') return nipt ? 'envio_kit_nipt' : 'envio_kit';
  if (tipo === 'Envío de KIT Médico') return 'envio_kit_medico';
  if (tipo === 'Material / Regalos') return 'material_regalos';
  if (tipo === 'Solicitud de guía') return 'solicitud_guia';

  return null;
}

export interface CampoConfig {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'date';
  options?: string[];
  required?: boolean;
  /** Only rendered/validated once another field in the same subform has this value - the "¿Qué
   * envías?" -> Medidas y peso and "¿Requiere seguro?" -> Monto reveals. */
  dependsOn?: { field: string; value: string };
  /** Groups consecutive fields under a titled block - Remitente / Destinatario render side by side. */
  section?: 'remitente' | 'destinatario' | 'paquete';
}

export interface SubformConfig {
  title: string;
  fields: CampoConfig[];
  /** Shown as a plain note instead of a field - e.g. NIPT's "attach the photo below" hint. */
  note?: string;
}

// Zammad's "Zona" ticket field options (key = display) - keep in sync with ZONAS in
// api/src-ts/reporting/logisticaTicketController.ts, which rejects anything else.
export const ZONAS = [
  'AGS', 'CANCUN', 'CDMX', 'CDMX/Ingenes', 'CDMX/Norte', 'CDMX/Poniente', 'CDMX/Sur', 'CHIHUAHUA', 'GDL',
  'HERMOSILLO', 'LEON', 'MORELIA', 'MTY', 'MTY/Operaciones', 'PUEBLA', 'QRO', 'TIJUANA', 'OTRO',
];

/** Recolección / Envío de kit - syncs to the ticket's foliocontrato field. Free text for now. */
const ID_CLIENTE_FIELD: CampoConfig = { name: 'id_cliente', label: 'Id Cliente', type: 'text' };
/** Kit para stock / Material / Regalos - syncs to the ticket's zona field. */
const ZONA_FIELD: CampoConfig = { name: 'zona', label: 'Zona', type: 'select', options: ZONAS, required: true };

const REMITENTE_FIELDS: CampoConfig[] = [
  { name: 'remitente_nombre', label: 'Nombre', type: 'text', required: true, section: 'remitente' },
  { name: 'remitente_telefono', label: 'Teléfono', type: 'text', required: true, section: 'remitente' },
  { name: 'remitente_correo', label: 'Correo', type: 'text', section: 'remitente' },
  { name: 'remitente_domicilio', label: 'Domicilio', type: 'text', required: true, section: 'remitente' },
];

const DESTINATARIO_FIELDS: CampoConfig[] = [
  { name: 'destinatario_nombre', label: 'Nombre', type: 'text', required: true, section: 'destinatario' },
  { name: 'destinatario_telefono', label: 'Teléfono', type: 'text', required: true, section: 'destinatario' },
  { name: 'destinatario_correo', label: 'Correo', type: 'text', section: 'destinatario' },
  { name: 'destinatario_domicilio', label: 'Domicilio', type: 'text', required: true, section: 'destinatario' },
  { name: 'destinatario_entre_calles', label: 'Entre calles', type: 'text', required: true, section: 'destinatario' },
];

const PAQUETE_ENVIO_FIELDS: CampoConfig[] = [
  { name: 'que_envias', label: '¿Qué envías?', type: 'select', options: ['Caja', 'Sobre'], required: true, section: 'paquete' },
  { name: 'medidas_peso', label: 'Medidas y peso', type: 'text', required: true, dependsOn: { field: 'que_envias', value: 'Caja' }, section: 'paquete' },
  { name: 'requiere_seguro', label: '¿Requiere seguro?', type: 'select', options: ['Si', 'No'], required: true, section: 'paquete' },
  { name: 'monto', label: 'Monto del seguro', type: 'number', required: true, dependsOn: { field: 'requiere_seguro', value: 'Si' }, section: 'paquete' },
  { name: 'urgente', label: 'Urgente', type: 'select', options: ['Día siguiente', '3 a 5 días'], required: true, section: 'paquete' },
];

export const SUBFORMS: Record<SubformKey, SubformConfig> = {
  recoleccion: {
    title: 'Datos de recolección',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'nombre_mama', label: 'Nombre de mamá y celular', type: 'text', required: true },
      { name: 'nombre_papa', label: 'Nombre de papá o contacto y celular', type: 'text' },
      { name: 'paquete_contratado', label: 'Paquete contratado', type: 'text', required: true },
      { name: 'hospital_habitacion', label: 'Hospital y habitación', type: 'text', required: true },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  recoleccion_nipt: {
    title: 'Datos de recolección NIPT',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'clarix_privado', label: 'Clarix o Privado', type: 'select', options: ['Clarix', 'Privado'], required: true },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: true },
      { name: 'via', label: 'Vía', type: 'text', required: true },
      { name: 'nombre_cliente', label: 'Nombre cliente', type: 'text', required: true },
      { name: 'direccion', label: 'Dirección', type: 'text', required: true },
      { name: 'horario_recoleccion', label: 'Horario de recolección', type: 'text', required: true },
    ],
    note: 'La foto (opcional) se puede adjuntar en la sección de "Adjuntos" al final del formulario.',
  },
  recoleccion_medico: {
    title: 'Datos de recolección',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'nombre_medico', label: 'Nombre Médico', type: 'text', required: true },
      { name: 'nombre_paciente', label: 'Nombre Paciente', type: 'text', required: true },
      { name: 'servicio_contratado', label: 'Servicio contratado', type: 'text', required: true },
      { name: 'domicilio', label: 'Domicilio', type: 'text', required: true },
      { name: 'horario_atencion', label: 'Horario de atención', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  kit_stock: {
    title: 'Kit para stock',
    fields: [
      ZONA_FIELD,
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'tipo_kit', label: 'Tipo de kit', type: 'text', required: true },
      { name: 'domicilio_entrega', label: 'Domicilio de entrega', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  kit_stock_nipt: {
    title: 'Kit para stock (Clarix / NIPT)',
    fields: [
      ZONA_FIELD,
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'tubos_extra', label: 'Tubos extra', type: 'text' },
      { name: 'formulario', label: 'Formulario', type: 'text' },
      { name: 'direccion', label: 'Dirección', type: 'text', required: true },
    ],
  },
  envio_kit: {
    title: 'Envío de kit a cliente',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'nombre_mama', label: 'Nombre de mamá y celular', type: 'text', required: true },
      { name: 'nombre_papa', label: 'Nombre de papá o contacto y celular', type: 'text' },
      { name: 'paquete_contratado', label: 'Paquete contratado', type: 'text', required: true },
      { name: 'fecha_probable_parto', label: 'Fecha probable de parto', type: 'date', required: true },
      { name: 'domicilio_entrega', label: 'Domicilio de entrega', type: 'text', required: true },
      { name: 'entre_calles', label: 'Entre calles', type: 'text', required: true },
    ],
  },
  envio_kit_nipt: {
    title: 'Envío de kit a cliente (Clarix / NIPT)',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'nombre_mama', label: 'Nombre de mamá y celular', type: 'text', required: true },
      { name: 'domicilio_entrega', label: 'Domicilio de entrega', type: 'text', required: true },
      { name: 'entre_calles', label: 'Entre calles', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  envio_kit_medico: {
    title: 'Envío de kit al médico',
    fields: [
      ID_CLIENTE_FIELD,
      { name: 'nombre_medico', label: 'Nombre de médico', type: 'text', required: true },
      { name: 'telefono_contacto', label: 'Teléfono de contacto', type: 'text', required: true },
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'tipo_kit', label: 'Tipo de Kit', type: 'text', required: true },
      { name: 'direccion_clinica', label: 'Dirección clínica/consultorio', type: 'text', required: true },
      { name: 'horario_atencion', label: 'Horario de atención', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  material_regalos: {
    title: 'Material / Regalos',
    fields: [
      ZONA_FIELD,
      ...REMITENTE_FIELDS,
      { name: 'remitente_notas', label: 'Notas', type: 'textarea', section: 'remitente' },
      ...DESTINATARIO_FIELDS,
      ...PAQUETE_ENVIO_FIELDS,
    ],
  },
  solicitud_guia: {
    title: 'Solicitud de guía',
    fields: [
      ...REMITENTE_FIELDS,
      ...DESTINATARIO_FIELDS,
      ...PAQUETE_ENVIO_FIELDS,
    ],
  },
};
