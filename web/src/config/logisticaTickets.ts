export type Marca = 'CRYOHOLDCO' | 'CRYO CELL' | 'NIPT/CLARIX' | 'BCU' | 'BSCU' | 'DENTCELL';

export const MARCAS: Marca[] = ['CRYOHOLDCO', 'CRYO CELL', 'NIPT/CLARIX', 'BCU', 'BSCU', 'DENTCELL'];

// Which "tipo de solicitud" options each marca offers - CRYO CELL gets an extra "Material /
// Regalos" option the other collection brands don't, NIPT/CLARIX's flow is worded/shaped
// differently throughout, and CRYOHOLDCO (the corporate brand, no sample collection of its own)
// only ever deals in courier guides and gift shipments.
export const MARCA_TIPOS: Record<Marca, string[]> = {
  CRYOHOLDCO: ['Solicitud de guía', 'Material / Regalos'],
  'CRYO CELL': ['Recolección', 'Kit para stock', 'Envío de KIT Cliente', 'Material / Regalos'],
  'NIPT/CLARIX': ['Recolección NIPT', 'Kit para stock', 'Envío de KIT Cliente'],
  BCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  BSCU: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
  DENTCELL: ['Recolección', 'Kit para stock', 'Envío de KIT Cliente'],
};

export type SubformKey =
  | 'recoleccion'
  | 'recoleccion_nipt'
  | 'kit_stock'
  | 'kit_stock_nipt'
  | 'envio_kit'
  | 'envio_kit_nipt'
  | 'material_regalos'
  | 'solicitud_guia';

/** Resolves which subform to show for a (marca, tipoSolicitud) pair - "Kit para stock" and "Envío
 * de KIT Cliente" read the same on every brand but need different fields for NIPT/CLARIX. */
export function resolveSubformKey(marca: string, tipo: string): SubformKey | null {
  const nipt = marca === 'NIPT/CLARIX';

  if (tipo === 'Recolección NIPT') return 'recoleccion_nipt';
  if (tipo === 'Recolección') return 'recoleccion';
  if (tipo === 'Kit para stock') return nipt ? 'kit_stock_nipt' : 'kit_stock';
  if (tipo === 'Envío de KIT Cliente') return nipt ? 'envio_kit_nipt' : 'envio_kit';
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
}

export interface SubformConfig {
  title: string;
  fields: CampoConfig[];
  /** Shown as a plain note instead of a field - e.g. NIPT's "attach the photo below" hint. */
  note?: string;
}

const PAQUETE_ENVIO_FIELDS: CampoConfig[] = [
  { name: 'que_envias', label: '¿Qué envías?', type: 'select', options: ['Caja', 'Sobre'], required: true },
  { name: 'medidas_peso', label: 'Medidas y peso', type: 'text', required: true, dependsOn: { field: 'que_envias', value: 'Caja' } },
  { name: 'requiere_seguro', label: '¿Requiere seguro?', type: 'select', options: ['Si', 'No'], required: true },
  { name: 'monto', label: 'Monto del seguro', type: 'number', required: true, dependsOn: { field: 'requiere_seguro', value: 'Si' } },
  { name: 'urgente', label: 'Urgente', type: 'select', options: ['Día siguiente', '3 a 5 días'], required: true },
];

export const SUBFORMS: Record<SubformKey, SubformConfig> = {
  recoleccion: {
    title: 'Datos de recolección',
    fields: [
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
      { name: 'clarix_privado', label: 'Clarix o Privado', type: 'select', options: ['Clarix', 'Privado'], required: true },
      { name: 'ciudad', label: 'Ciudad', type: 'text', required: true },
      { name: 'via', label: 'Vía', type: 'text', required: true },
      { name: 'nombre_cliente', label: 'Nombre cliente', type: 'text', required: true },
      { name: 'direccion', label: 'Dirección', type: 'text', required: true },
      { name: 'horario_recoleccion', label: 'Horario de recolección', type: 'text', required: true },
    ],
    note: 'La foto (opcional) se puede adjuntar en la sección de "Adjuntos" al final del formulario.',
  },
  kit_stock: {
    title: 'Kit para stock',
    fields: [
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'tipo_kit', label: 'Tipo de kit', type: 'text', required: true },
      { name: 'domicilio_entrega', label: 'Domicilio de entrega', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  kit_stock_nipt: {
    title: 'Kit para stock (Clarix / NIPT)',
    fields: [
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'tubos_extra', label: 'Tubos extra', type: 'text' },
      { name: 'formulario', label: 'Formulario', type: 'text' },
      { name: 'direccion', label: 'Dirección', type: 'text', required: true },
    ],
  },
  envio_kit: {
    title: 'Envío de kit a cliente',
    fields: [
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
      { name: 'nombre_mama', label: 'Nombre de mamá y celular', type: 'text', required: true },
      { name: 'domicilio_entrega', label: 'Domicilio de entrega', type: 'text', required: true },
      { name: 'entre_calles', label: 'Entre calles', type: 'text', required: true },
      { name: 'notas', label: 'Notas', type: 'textarea' },
    ],
  },
  material_regalos: {
    title: 'Material / Regalos',
    fields: [
      { name: 'remitente_nombre', label: 'Remitente - Nombre', type: 'text', required: true },
      { name: 'remitente_telefono', label: 'Remitente - Teléfono', type: 'text', required: true },
      { name: 'remitente_correo', label: 'Remitente - Correo', type: 'text' },
      { name: 'remitente_domicilio', label: 'Remitente - Domicilio', type: 'text', required: true },
      { name: 'remitente_notas', label: 'Remitente - Notas', type: 'textarea' },
      { name: 'destinatario_nombre', label: 'Destinatario - Nombre', type: 'text', required: true },
      { name: 'destinatario_telefono', label: 'Destinatario - Teléfono', type: 'text', required: true },
      { name: 'destinatario_correo', label: 'Destinatario - Correo', type: 'text' },
      { name: 'destinatario_domicilio', label: 'Destinatario - Domicilio', type: 'text', required: true },
      { name: 'destinatario_entre_calles', label: 'Destinatario - Entre calles', type: 'text', required: true },
      ...PAQUETE_ENVIO_FIELDS,
    ],
  },
  solicitud_guia: {
    title: 'Solicitud de guía',
    fields: [
      { name: 'remitente_nombre', label: 'Remitente - Nombre', type: 'text', required: true },
      { name: 'remitente_telefono', label: 'Remitente - Teléfono', type: 'text', required: true },
      { name: 'remitente_correo', label: 'Remitente - Correo', type: 'text' },
      { name: 'remitente_domicilio', label: 'Remitente - Domicilio', type: 'text', required: true },
      { name: 'destinatario_nombre', label: 'Destinatario - Nombre', type: 'text', required: true },
      { name: 'destinatario_telefono', label: 'Destinatario - Teléfono', type: 'text', required: true },
      { name: 'destinatario_correo', label: 'Destinatario - Correo', type: 'text' },
      { name: 'destinatario_domicilio', label: 'Destinatario - Domicilio', type: 'text', required: true },
      { name: 'destinatario_entre_calles', label: 'Destinatario - Entre calles', type: 'text', required: true },
      ...PAQUETE_ENVIO_FIELDS,
    ],
  },
};
