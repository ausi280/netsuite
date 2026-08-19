import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_configservicios` ("Configuración de
 * paquetes/servicios") — the catalog
 * `customrecord_cryo_servicios.custrecord_cryo_serviciocontratado`
 * references. Field set matches the metadata-catalog field list exactly
 * rather than being pruned down, since individual rows populate a variable
 * subset of these (different package configurations use different optional
 * attributes).
 */
export interface ServicePackageRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord1: string | null;
  custrecord_cryo_articulodescuento: string | null;
  custrecord_cryo_articulopaquete: string | null;
  custrecord_cryo_artanualidad: string | null;
  custrecord_cryo_costoinscripcion: string | null;
  custrecord_cryo_costoprocesamiento: string | null;
  custrecord_cryo_descuentoimportepaquete: string | null;
  custrecord_cryo_descuentopaquete: string | null;
  custrecord_cryo_fecha_precios: string | null;
  custrecord_cryo_kit: string | null;
  custrecord_cryo_kitpaquete: string | null;
  custrecord_cryo_marcaservicio: string | null;
  custrecord_cryo_monedaservicio: string | null;
  custrecord_cryo_pe_monedaanualidad: string | null;
  custrecord_cryo_pe_seguridadtotal: string | null;
  custrecord_cryo_preciototalpaquete: string | null;
  custrecord_cryo_subsidiariapaquete: string | null;
  custrecord_cryo_tipocambio: string | null;
  custrecord_cryo_tipodeservicio: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class ServicePackageRepository {
  private readonly table = 'netsuite_service_packages';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ServicePackageRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
