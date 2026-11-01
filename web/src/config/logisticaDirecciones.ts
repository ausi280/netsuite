/**
 * Known pickup/delivery addresses for the Logística form's Remitente / Destinatario cards - picking
 * one fills that card's Nombre / Teléfono / Correo / Domicilio (all still editable afterwards).
 * Transcribed from Logística's own "Grupo / Sede" address sheet (2026-10-23). Blank contacto /
 * correo / teléfono = the sheet has none; the requester fills those in by hand.
 */
export interface DireccionConocida {
  grupo: string;
  sede: string;
  direccion: string;
  contacto?: string;
  correo?: string;
  telefono?: string;
}

export const DIRECCIONES_CONOCIDAS: DireccionConocida[] = [
  { grupo: 'Ingenes', sede: 'Santa Fe', direccion: 'Carretera México-Toluca 5420, Oficina 602, Col. El Yaqui, C.P. 05320, Ciudad de México.', contacto: 'Sara Maria', correo: 'solea@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Toluca', direccion: 'Av. Ignacio Comonfort No. 1300, Torre Zero Providencia, 4.º piso, local 401, Col. La Providencia, C.P. 52177, Metepec, Estado de México.', contacto: 'Marcia Tello', correo: 'mtello@ingenes.com', telefono: '+52 1 722 905 6375' },
  { grupo: 'Ingenes', sede: 'Monterrey', direccion: 'Av. Revolución 2703, Piso 8, Col. Ladrillera, C.P. 64830, Monterrey, Nuevo León.', contacto: 'Fatima Denise', correo: 'fadenise@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Guadalajara', direccion: 'Mar del Sur 2014, Locales L-102 y L-103, Col. Country Club, C.P. 44610, Guadalajara, Jalisco.', contacto: 'Ale Mejia', correo: 'amejia@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Morelia', direccion: 'Av. Acueducto 1178, Piso 2, Col. Chapultepec Norte, C.P. 58260, Morelia, Michoacán.', contacto: 'Aide Margarita Sánchez', correo: 'masanchez@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Aguascalientes', direccion: 'Prolongación General Ignacio Zaragoza #4200, interior L-3201, Col. Trojes de Alonso, C.P. 20116, Aguascalientes, Aguascalientes.', contacto: 'Nora Reyna', correo: 'admisionags@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Mérida', direccion: 'Calle 20 #235, Piso 8, Local 812, Col. Altabrisa, C.P. 97130, Mérida, Yucatán.', contacto: 'Erik Helmes', correo: 'administracionmrd@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Querétaro', direccion: 'Av. Paseo Monte Miranda #5, Piso 9, Col. Distrito Piamonte, C.P. 76240, El Marqués, Querétaro.', contacto: 'Angel Rodríguez', correo: 'administrativoqro@ingenes.com' },
  { grupo: 'Ingenes', sede: 'León', direccion: 'Blvd. Juan Alonso de Torres Pte. 1445, Valle del Campestre, C.P. 37295, León de los Aldama, Guanajuato.', contacto: 'Viridiana Martínez', correo: 'administrativoleon@ingenes.com', telefono: '+52 1 477 648 0315' },
  { grupo: 'Ingenes', sede: 'Puebla', direccion: 'Lateral Sur Vía Atlixcáyotl 6514, Piso 3, Col. San Bernardino Tlaxcalancingo, C.P. 72820, San Andrés Cholula, Puebla.', contacto: 'Jessica Rios', correo: 'jrios@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Veracruz', direccion: 'Blvd. Adolfo Ruiz Cortines 2202, Lote 7 y 8, Local A, Fracc. Costa de Oro, C.P. 94299, Boca del Río, Veracruz.', contacto: 'Berenice López', correo: 'administrativover@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Tijuana', direccion: 'Diego Rivera 2311, Piso 10, Col. Zona Urbana Río Tijuana, C.P. 22010, Tijuana, Baja California.', contacto: 'Miriam Rios', correo: 'mgrios@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Mexicali', direccion: 'Calle Álvaro Obregón #1257, Piso 1, Col. Segunda Sección, C.P. 21100, Mexicali, Baja California.', contacto: 'Diana Zamora', correo: 'dzamora@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Mazatlán', direccion: 'Av. Reforma 2007-B, Laguna Plaza & Business Center, Piso 10, Local 10-A, Col. Flamingos, C.P. 82149, Mazatlán, Sinaloa.', contacto: 'Tania Paloma', correo: 'tprodriguez@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Cancún', direccion: 'Av. Bonampak Lote 4, C2, Mz 1, Locales 306 y 307, Cancún Centro, C.P. 77500, Benito Juárez, Quintana Roo.', contacto: 'Verónica González', correo: 'vgaleman@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Chihuahua', direccion: 'Paseo Vistas del Sol 6801, Azenzo Torre Corporativa, Piso 12, Col. Villas del Sol, C.P. 31124, Chihuahua, Chihuahua.', contacto: 'Celina Gisela', correo: 'cghernandez@ingenes.com' },
  { grupo: 'Ingenes', sede: 'Hermosillo', direccion: 'Blvd. Paseo Río Sonora Nte. 70, Vado Prime Center, Locales L21, L22 y L23, Col. Río Sonora Hermosillo XXI, C.P. 83270, Hermosillo, Sonora.', contacto: 'Arely Montaño', correo: 'amontano@ingenes.com' },
  { grupo: 'Oficina', sede: 'Renew Therapies', direccion: 'Av. Ejército Nacional Mexicano 836, Piso 7, Col. Polanco II Secc., C.P. 11530, Miguel Hidalgo, Ciudad de México.', contacto: 'Dra. Mercedes Serrano', correo: 'mercedes.serrano@cryoholdco.com', telefono: '56 3636 0002' },
  { grupo: 'Oficina', sede: 'Work Polanco', direccion: 'Periférico Blvd. Manuel Ávila Camacho 201, Piso 3, Col. Polanco I Secc., C.P. 11560, Miguel Hidalgo, Ciudad de México.' },
  { grupo: 'Oficina', sede: 'Laboratorio', direccion: 'Aztecas 295, esq. Coras, Fracc. Monraz, C.P. 44670, Guadalajara, Jalisco.', telefono: '33 3648 2250' },
  { grupo: 'Oficina', sede: 'Monterrey', direccion: 'Av. Constitucion 1881 Pte., Planta Baja local 1, CP 64060, Mty, NL' },
];

/** Stable key/label for a known address - "Ingenes / Santa Fe". */
export function direccionKey(d: DireccionConocida): string {
  return `${d.grupo} / ${d.sede}`;
}

/** Grupos in sheet order, for the picker's <optgroup>s. */
export const DIRECCION_GRUPOS = [...new Set(DIRECCIONES_CONOCIDAS.map((d) => d.grupo))];
