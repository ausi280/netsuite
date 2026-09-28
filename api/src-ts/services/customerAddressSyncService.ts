import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapCustomerAddress } from '../mappers/customerAddressMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { CustomerAddressRow } from '../repositories/customerAddressRepository';
import type { SyncEntityName } from '../config/types';

// Address book rows aren't their own SuiteQL-queryable table - they're reached by joining
// addressbook entries (CustomerAddressbook, already customer-scoped by its own table name/design -
// no separate join to `customer` needed) to the address subrecord itself
// (CustomerAddressbookEntityAddress, confirmed live - the plain "address" record name doesn't
// exist for SuiteQL). `addr.nkey` is the address subrecord's own internal id, unique per
// addressbook row account-wide (a new instance is created every time an address is added to any
// customer's address book, never shared across customers), so it doubles as this entity's
// `netsuite_id` with no need for a composite key.
//
// A `customer c INNER JOIN customeraddressbook ab ON ab.entity = c.id` variant was tried first -
// it's redundant (customeraddressbook.entity is already only ever a customer id here) and, at this
// account's real production scale (~310k customers / ~340k address rows), that extra join made
// NetSuite's query planner fail outright with a generic 500 (`UNEXPECTED_ERROR`) for the full,
// unbounded query - confirmed live by timing bounded `c.id` ranges (32s for 50k customers, scaling
// non-linearly) versus the joinless version below.
const FROM_CLAUSE = 'customeraddressbook ab INNER JOIN customeraddressbookentityaddress addr ON addr.nkey = ab.addressbookaddress';

export class CustomerAddressSyncService extends BaseSyncService<RawNetSuiteRecord, CustomerAddressRow> {
  readonly entityName: SyncEntityName = 'customerAddress';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from(FROM_CLAUSE, 'addr.nkey')
      .select(
        'addr.nkey AS id', 'ab.entity AS customer_id', 'ab.label', 'ab.defaultbilling', 'ab.defaultshipping',
        'ab.isresidential', 'addr.addr1', 'addr.addr2', 'addr.addr3', 'addr.addressee', 'addr.attention',
        'addr.addrphone', 'addr.addrtext', 'addr.city', 'addr.state', 'addr.zip', 'addr.country',
        'addr.custrecord_colonia', 'addr.override',
        'addr.lastmodifieddate', 'addr.custrecord_cryo_facturacion', 'addr.custrecord_cryo_razonsocial',
        'addr.custrecord_cryo_rfc', 'addr.custrecord_cryo_constanciasitfiscal',
        'addr.custrecord_cryo_usocfdi', 'addr.custrecord_cryo_regimenfiscal', 'addr.custrecord_cryo_clientetitular',
      )
      .whereWatermark('addr.lastmodifieddate', watermark, tieBreakId)
      .orderBy('addr.lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): CustomerAddressRow {
    return mapCustomerAddress(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
