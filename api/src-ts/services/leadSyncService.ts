import { BaseSyncService, RawNetSuiteRecord } from './baseSyncService';
import { SuiteQlQueryBuilder } from '../suiteql/queryBuilder';
import { mapLead } from '../mappers/leadMapper';
import { parseNetSuiteDate } from '../mappers/utils';
import type { LeadRow } from '../repositories/leadRepository';
import type { SyncEntityName } from '../config/types';

/**
 * NetSuite leads -> netsuite_leads: every customer record that entered as a lead (dategrosslead
 * set - confirmed live it's populated on every lead/prospect, including ones later converted to
 * Cliente or closed as Perdido), all subsidiaries. Argentina's (subsidiary 20) feed the Reporte de
 * Marketing's Argentina view - see argentinaMarketingRepository.ts.
 *
 * List fields come back twice: the raw internal id and BUILTIN.DF's display text, since the
 * report classifies by id but shows the text. Same lastmodifieddate watermark as CustomerSync.
 */
export class LeadSyncService extends BaseSyncService<RawNetSuiteRecord, LeadRow> {
  readonly entityName: SyncEntityName = 'lead';

  protected buildQuery(watermark: Date | null, tieBreakId?: string | null): string {
    return SuiteQlQueryBuilder.from('customer')
      .select(
        'id', 'entityid', 'subsidiary', 'stage', 'isinactive', 'datecreated', 'lastmodifieddate', 'dategrosslead', 'dateconversion',
        'entitystatus', 'BUILTIN.DF(entitystatus) AS entitystatus_nombre',
        'custentity_cryo_canalingreso', 'BUILTIN.DF(custentity_cryo_canalingreso) AS canalingreso_nombre',
        'custentity_cryo_col_estadolead', 'BUILTIN.DF(custentity_cryo_col_estadolead) AS estadolead_nombre',
        'custentity_cryo_motivoperdida', 'BUILTIN.DF(custentity_cryo_motivoperdida) AS motivoperdida_nombre',
        'custentity_nso_lead_marca', 'BUILTIN.DF(custentity_nso_lead_marca) AS marca_nombre',
        'custentity_cryo_campana',
      )
      .where('dategrosslead IS NOT NULL')
      .whereWatermark('lastmodifieddate', watermark, tieBreakId)
      .orderBy('lastmodifieddate', 'ASC')
      .build();
  }

  protected mapRow(raw: RawNetSuiteRecord): LeadRow {
    return mapLead(raw);
  }

  protected extractTimestamp(raw: RawNetSuiteRecord): Date | null {
    return parseNetSuiteDate(raw.lastmodifieddate);
  }
}
