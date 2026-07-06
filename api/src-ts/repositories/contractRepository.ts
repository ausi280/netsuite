import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Mirrors the legacy `netsuite_records` table (customrecord1184), including
 * every custom field the legacy syncAndSaveData() maps
 * (netsuiteService.js:180-228), plus the new `lastmodifieddate_dt` column
 * used for incremental-sync watermark comparisons. This table is
 * intentionally shared with the legacy JS writer — both use `netsuite_id`
 * as the upsert key and write a compatible column set.
 */
export interface ContractRow {
  netsuite_id: string;
  name: string | null;
  created: string | null;
  lastmodified: string | null;
  lastmodifieddate_dt: Date | null;
  custrecord_cryo_contratosistemaanterior: string | null;
  custrecord_cryo_numerocontrato: string | null;
  custrecord_nso_token: string | null;
  links: string | null;
  custrecord_cryo_actualizar_fecha: string | null;
  custrecord_cryo_aniosanticipados: string | null;
  custrecord_cryo_articulobonif: string | null;
  custrecord_cryo_cesarea: string | null;
  custrecord_cryo_duenio: string | null;
  custrecord_cryo_envio_exitoso: string | null;
  custrecord_cryo_especimen: string | null;
  custrecord_cryo_estatus: string | null;
  custrecord_cryo_fecha_ini_ultima_a: string | null;
  custrecord_cryo_fechanacimiento: string | null;
  custrecord_cryo_fechaprocesamientoi: string | null;
  custrecord_cryo_finicio: string | null;
  custrecord_cryo_fnacimientoconf: string | null;
  custrecord_cryo_garantia_completa: string | null;
  custrecord_cryo_garantiafallecimiento: string | null;
  custrecord_cryo_mensaje_email_mostrado: string | null;
  custrecord_cryo_mesnac_letra: string | null;
  custrecord_cryo_mesnacimiento: string | null;
  custrecord_cryo_moneda: string | null;
  custrecord_cryo_numerofamilia: string | null;
  custrecord_cryo_padres: string | null;
  custrecord_cryo_primera_vez_part: string | null;
  custrecord_cryo_procesadosi: string | null;
  custrecord_cryo_saldo_inicial: string | null;
  custrecord_cryo_servicio: string | null;
  custrecord_cryo_solicitaaprobacion: string | null;
  custrecord_cryo_subsidiariacontrato: string | null;
  custrecord_cryo_titular_deudor: string | null;
  custrecord_cryo_titularcontrato: string | null;
  custrecord_cryo_ubicacion: string | null;
  custrecord_cryo_vendedor: string | null;
  custrecord_nso_cc_marca_contrato_mx: string | null;
  custrecordcryo_tipocambiocontrato: string | null;
  isinactive: string | null;
  lastmodifiedby: string | null;
  owner: string | null;
  recordid: string | null;
  scriptid: string | null;
  raw_data: string;
}

export class ContractRepository {
  private readonly table = 'netsuite_records';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: ContractRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
