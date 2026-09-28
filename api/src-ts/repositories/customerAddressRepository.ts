import type { Knex } from 'knex';
import { upsertRows } from './upsertHelper';

/**
 * Not a separate custom record - these are the native Customer "Address Book" sublist rows
 * (Customer > Address tab), each carrying this account's fiscal/billing custom fields
 * (confirmed live via NetSuite's metadata-catalog schema for `customer`, under
 * `customer-addressBook-addressBookAddress`). `custrecord_cryo_facturacion` marks a row as a
 * billing address; `custrecord_cryo_razonsocial`/`custrecord_cryo_rfc` etc carry the Mexican
 * invoicing data for it. Column set is the row-level addressbook fields plus standard address
 * fields plus the fiscal/billing custom fields - the ~35 other custom fields on this subrecord
 * (Loqate address-validation autocomplete, per-country geo fields) are generic account-wide
 * address tooling unrelated to billing and are deliberately left out, except
 * `custrecord_colonia` ("Colonia"), pulled in specifically to feed contratosReportRepository.ts's
 * "ColFac" column.
 *
 * `custrecord_cpf_rfc_direccion`/`custrecord_cpf_razon_social`/`custrecord_cpf_correo_portal_facturacion`
 * (a separate "cpf" bundle's redundant RFC/Razón Social/email fields, duplicating the `cryo_*`
 * ones above) are deliberately NOT synced - confirmed live that selecting any one of these three
 * individually, even alone with no other columns, makes NetSuite's SuiteQL engine 500
 * (`UNEXPECTED_ERROR`) on this account's real production data, while every `custrecord_cryo_*`
 * field selects fine. Sandbox doesn't reproduce this. Since the `cryo_*` fields already cover the
 * same data, excluding the broken `cpf_*` ones is a strictly-better trade rather than a real loss.
 */
export interface CustomerAddressRow {
  netsuite_id: string;
  customer_id: string | null;
  label: string | null;
  defaultbilling: string | null;
  defaultshipping: string | null;
  isresidential: string | null;
  addr1: string | null;
  addr2: string | null;
  addr3: string | null;
  addressee: string | null;
  attention: string | null;
  addrphone: string | null;
  addrtext: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  custrecord_colonia: string | null;
  override: string | null;
  lastmodifieddate: string | null;
  lastmodifieddate_dt: Date | null;
  links: string | null;
  custrecord_cryo_facturacion: string | null;
  custrecord_cryo_razonsocial: string | null;
  custrecord_cryo_rfc: string | null;
  custrecord_cryo_constanciasitfiscal: string | null;
  custrecord_cryo_usocfdi: string | null;
  custrecord_cryo_regimenfiscal: string | null;
  custrecord_cryo_clientetitular: string | null;
  raw_data: string;
}

export class CustomerAddressRepository {
  private readonly table = 'netsuite_customer_addresses';

  constructor(private readonly db: Knex) {}

  async upsertMany(trx: Knex.Transaction, rows: CustomerAddressRow[]): Promise<number> {
    return upsertRows(this.db, trx, this.table, rows, 'netsuite_id');
  }
}
