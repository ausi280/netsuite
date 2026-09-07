import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors `customrecord_cryo_otroscontratos` ("Otros Contratos", record type id 3937). Field set
 * matches the raw sample exactly rather than being pruned down, since this is a new/unfamiliar
 * custom record.
 */
export interface OtrosContratoRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_contrato_otroscontratos: string | null;
  custrecord_cryo_dnititular2_otroscontrat: string | null;
  custrecord_cryo_especimen_otroscontratos: string | null;
  custrecord_cryo_estado_otroscontratos: string | null;
  custrecord_cryo_fecha_otroscontratos: string | null;
  custrecord_cryo_fechaprobable_otroscontr: string | null;
  custrecord_cryo_ginecologo_otroscontrato: string | null;
  custrecord_cryo_hospital_otroscontratos: string | null;
  custrecord_cryo_muestra1_otroscontratos: string | null;
  custrecord_cryo_muestra2_otroscontratos: string | null;
  custrecord_cryo_otroscontratosmarca: string | null;
  custrecord_cryo_servicio_otroscontratos: string | null;
  custrecord_cryo_subsidiaria_otroscontrat: string | null;
  custrecord_cryo_titular2_otroscontratos: string | null;
  custrecord_cryo_titular_otroscontrato: string | null;
  custrecord_cryo_vendedor_otroscontratos: string | null;
  externalid: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class OtrosContratoRepository {
  private readonly table = 'netsuite_otros_contratos';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: OtrosContratoRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
