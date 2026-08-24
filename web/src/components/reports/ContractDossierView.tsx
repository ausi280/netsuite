import type { ContractDossier } from '../../api/types';
import { SimpleTable } from '../table/SimpleTable';
import type { SimpleColumn } from '../table/SimpleTable';
import { contractStatusLabel, partidaStatusLabel, serviceTypeLabel } from '../../config/labels';
import { subsidiaryLabel } from '../../config/subsidiaries';
import { formatCurrency, formatDate, formatCellValue } from '../../utils/format';
import styles from './ContractDossierView.module.css';

interface ContractDossierViewProps {
  dossier: ContractDossier;
}

function activityLabel(isinactive: unknown): string {
  return isinactive === 'T' || isinactive === true ? 'Inactivo' : 'Activo';
}

interface ServiceRow {
  netsuite_id: string;
  name: string | null;
  custrecord_cryo_tipodeserv: string | null;
  custrecord_cryo_estatusservicio: string | null;
  custrecord_cryo_costoanualidad: string | null;
  custrecord_cryo_precioprocesamiento: string | null;
  custrecord_cryo_monedaserv: string | null;
}

interface AnnuityRow {
  netsuite_id: string;
  custrecord_cryo_aniopartida: string | null;
  custrecord_cryo_concepto: string | null;
  custrecord_cryo_estatuspartida: string | null;
  custrecord_cryo_importepartida: string | null;
  custrecord_cryo_fechapartida: string | null;
  custrecord_cryo_fechalimitepago: string | null;
  custrecord_cryo_iniciovigencia: string | null;
  custrecord_cryo_finvigencia: string | null;
  isinactive: string | null;
}

const SERVICE_COLUMNS: SimpleColumn<ServiceRow>[] = [
  { key: 'name', header: 'Servicio', render: (r) => formatCellValue(r.name) },
  { key: 'tipo', header: 'Tipo', render: (r) => serviceTypeLabel(r.custrecord_cryo_tipodeserv) },
  { key: 'estatus', header: 'Estatus', render: (r) => formatCellValue(r.custrecord_cryo_estatusservicio) },
  { key: 'costo', header: 'Costo Anualidad', render: (r) => formatCurrency(r.custrecord_cryo_costoanualidad) },
  { key: 'procesamiento', header: 'Precio Procesamiento', render: (r) => formatCurrency(r.custrecord_cryo_precioprocesamiento) },
  { key: 'moneda', header: 'Moneda', render: (r) => formatCellValue(r.custrecord_cryo_monedaserv) },
];

const ANNUITY_COLUMNS: SimpleColumn<AnnuityRow>[] = [
  { key: 'anio', header: 'Año', render: (r) => formatCellValue(r.custrecord_cryo_aniopartida) },
  { key: 'concepto', header: 'Concepto', render: (r) => formatCellValue(r.custrecord_cryo_concepto) },
  { key: 'estatus', header: 'Estatus', render: (r) => partidaStatusLabel(r.custrecord_cryo_estatuspartida) },
  { key: 'importe', header: 'Importe', render: (r) => formatCurrency(r.custrecord_cryo_importepartida) },
  { key: 'fecha', header: 'Fecha', render: (r) => formatDate(r.custrecord_cryo_fechapartida) },
  { key: 'limite', header: 'Fecha Límite Pago', render: (r) => formatDate(r.custrecord_cryo_fechalimitepago) },
  {
    key: 'vigencia',
    header: 'Vigencia',
    render: (r) => `${formatDate(r.custrecord_cryo_iniciovigencia)} – ${formatDate(r.custrecord_cryo_finvigencia)}`,
  },
  { key: 'activo', header: 'Activo', render: (r) => activityLabel(r.isinactive) },
];

export function ContractDossierView({ dossier }: ContractDossierViewProps) {
  const { contract, services, annuities } = dossier;

  const fields: Array<[string, string]> = [
    ['No. Contrato', formatCellValue(contract.numero_contrato)],
    ['Estatus', contractStatusLabel(contract.estatus)],
    ['Actividad', activityLabel(contract.isinactive)],
    ['Fecha Inicio', formatDate(contract.fecha_inicio)],
    ['Subsidiaria', contract.subsidiaria_id ? subsidiaryLabel(contract.subsidiaria_id) : '—'],
    ['Moneda', formatCellValue(contract.moneda)],
    ['Tipo de Cambio', formatCellValue(contract.tipo_cambio)],
    ['Saldo Inicial', formatCurrency(contract.saldo_inicial)],
    ['Total', formatCurrency(contract.total)],
    ['Total Adeudos', formatCurrency(contract.total_adeudos)],
    ['Total Partidas', formatCurrency(contract.total_partidas)],
    ['Titular', contract.titular_nombre ?? '—'],
    ['Email Titular', contract.titular_email ?? '—'],
    ['Padres', contract.padres_nombre ?? '—'],
    ['Espécimen', contract.hijo_nombre ?? '—'],
    ['Vendedor', contract.vendedor_nombre ?? '—'],
    ['Cobrador', contract.cobrador_nombre ?? '—'],
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.grid}>
          {fields.map(([label, value]) => (
            <div className={styles.field} key={label}>
              <p className={styles.fieldLabel}>{label}</p>
              <p className={styles.fieldValue}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Servicios ({services.length})</h2>
        <SimpleTable
          columns={SERVICE_COLUMNS}
          rows={services as unknown as ServiceRow[]}
          getRowKey={(row) => row.netsuite_id}
          emptyMessage="Este contrato no tiene servicios activos."
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Anualidades / Partidas ({annuities.length})</h2>
        <SimpleTable
          columns={ANNUITY_COLUMNS}
          rows={annuities as unknown as AnnuityRow[]}
          getRowKey={(row) => row.netsuite_id}
          emptyMessage="Este contrato no tiene partidas registradas."
        />
      </section>
    </div>
  );
}
