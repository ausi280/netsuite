import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_fcells` ("Contratos FCells", record type id 1418). Field set matches
 * the raw sample exactly rather than being pruned down, since this is a new/unfamiliar custom
 * record. See the migration's comment for why this has no "amount" column yet.
 */
export interface FcellsContratoRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord1404: string | null;
  custrecord_cryo_courtesy_created: string | null;
  custrecord_cryo_courtesy_year: string | null;
  custrecord_cryo_cobradorfcells: string | null;
  custrecord_cryo_estatusfcells: string | null;
  custrecord_cryo_fcells_linea_negocio_mue: string | null;
  custrecord_cryo_fcells_mesenquimal: string | null;
  custrecord_cryo_fcells_pagadohasta: string | null;
  custrecord_cryo_fcells_ubicacion_muestra: string | null;
  custrecord_cryo_fcellscorreopaciente: string | null;
  custrecord_cryo_fecha_procesamiento: string | null;
  custrecord_cryo_fechaalta: string | null;
  custrecord_cryo_idexternocontrato: string | null;
  custrecord_cryo_medicotitular: string | null;
  custrecord_cryo_motivobaja: string | null;
  custrecord_cryo_muestrafcells: string | null;
  custrecord_cryo_owner_muestra: string | null;
  custrecord_cryo_pacientefcells: string | null;
  custrecord_cryo_productofcells: string | null;
  custrecord_cryo_sales_order_assigned: string | null;
  custrecord_cryo_sales_order_currency: string | null;
  custrecord_cryo_sales_order_id: string | null;
  custrecord_cryo_sales_order_subsidiary: string | null;
  custrecord_cryo_subsidiariafcells: string | null;
  custrecord_cryo_vendedorfcells: string | null;
  custrecord_cryo_year_charge_annuality: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class FcellsContratoRepository {
  private readonly table = 'netsuite_fcells_contratos';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: FcellsContratoRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
