import { useEffect, useState } from 'react';
import type { ContractDossier } from '../../api/types';
import { SimpleTable } from '../table/SimpleTable';
import type { SimpleColumn } from '../table/SimpleTable';
import { contractStatusLabel, partidaStatusLabel, serviceTypeLabel } from '../../config/labels';
import { subsidiaryLabel } from '../../config/subsidiaries';
import { currencyLabel } from '../../config/currencies';
import { formatCurrency, formatDate, formatCellValue } from '../../utils/format';
import { useUpdateContract } from '../../hooks/useUpdateContract';
import { useVendedorOptions } from '../../hooks/useVendedorOptions';
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
  custrecord_cryo_monedapartida: string | null;
  isinactive: string | null;
}

const SERVICE_COLUMNS: SimpleColumn<ServiceRow>[] = [
  { key: 'name', header: 'Servicio', render: (r) => formatCellValue(r.name) },
  { key: 'tipo', header: 'Tipo', render: (r) => serviceTypeLabel(r.custrecord_cryo_tipodeserv) },
  { key: 'estatus', header: 'Estatus', render: (r) => formatCellValue(r.custrecord_cryo_estatusservicio) },
  {
    key: 'costo',
    header: 'Costo Anualidad',
    render: (r) => formatCurrency(r.custrecord_cryo_costoanualidad, r.custrecord_cryo_monedaserv),
  },
  {
    key: 'procesamiento',
    header: 'Precio Procesamiento',
    render: (r) => formatCurrency(r.custrecord_cryo_precioprocesamiento, r.custrecord_cryo_monedaserv),
  },
  { key: 'moneda', header: 'Moneda', render: (r) => currencyLabel(r.custrecord_cryo_monedaserv) },
];

const ANNUITY_COLUMNS: SimpleColumn<AnnuityRow>[] = [
  { key: 'anio', header: 'Año', render: (r) => formatCellValue(r.custrecord_cryo_aniopartida) },
  { key: 'concepto', header: 'Concepto', render: (r) => formatCellValue(r.custrecord_cryo_concepto) },
  { key: 'estatus', header: 'Estatus', render: (r) => partidaStatusLabel(r.custrecord_cryo_estatuspartida) },
  {
    key: 'importe',
    header: 'Importe',
    render: (r) => formatCurrency(r.custrecord_cryo_importepartida, r.custrecord_cryo_monedapartida),
  },
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

  const [isEditing, setIsEditing] = useState(false);
  const [folioDraft, setFolioDraft] = useState('');
  const [vendedorDraft, setVendedorDraft] = useState('');

  const mutation = useUpdateContract(contract.netsuite_id);
  // Only fetched once edit mode actually opens - nobody pays for the ~500+ employee list just to
  // view a contract.
  const vendedorOptions = useVendedorOptions(isEditing);

  function startEditing() {
    setFolioDraft(contract.folio_sistema_anterior ?? '');
    setVendedorDraft(contract.vendedor_id ?? '');
    mutation.reset();
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    mutation.reset();
  }

  function handleSave() {
    mutation.mutate(
      {
        custrecord_cryo_contratosistemaanterior: folioDraft.trim() || null,
        custrecord_cryo_vendedor: vendedorDraft || null,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  // If another edit lands (e.g. re-opened after a sync refresh changed the dossier under us),
  // keep the drafts in sync with the latest server values while not actively editing.
  useEffect(() => {
    if (!isEditing) {
      setFolioDraft(contract.folio_sistema_anterior ?? '');
      setVendedorDraft(contract.vendedor_id ?? '');
    }
  }, [contract.folio_sistema_anterior, contract.vendedor_id, isEditing]);

  const fields: Array<[string, string]> = [
    ['No. Contrato', formatCellValue(contract.numero_contrato)],
    ['Estatus', contractStatusLabel(contract.estatus)],
    ['Actividad', activityLabel(contract.isinactive)],
    ['Fecha Inicio', formatDate(contract.fecha_inicio)],
    ['Subsidiaria', contract.subsidiaria_id ? subsidiaryLabel(contract.subsidiaria_id) : '—'],
    ['Moneda', currencyLabel(contract.moneda)],
    ['Tipo de Cambio', formatCellValue(contract.tipo_cambio)],
    ['Saldo Inicial', formatCurrency(contract.saldo_inicial, contract.moneda)],
    ['Total', formatCurrency(contract.total, contract.moneda)],
    ['Total Adeudos', formatCurrency(contract.total_adeudos, contract.moneda)],
    ['Total Partidas', formatCurrency(contract.total_partidas, contract.moneda)],
    ['Titular', contract.titular_nombre ?? '—'],
    ['Email Titular', contract.titular_email ?? '—'],
    ['Padres', contract.padres_nombre ?? '—'],
    ['Espécimen', contract.hijo_nombre ?? '—'],
    ['Cobrador', contract.cobrador_nombre ?? '—'],
  ];

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Sistema Anterior y Vendedor</h2>
          {!isEditing ? (
            <button type="button" className={styles.editButton} onClick={startEditing}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Editar
            </button>
          ) : null}
        </div>

        {isEditing ? (
          <div className={styles.editForm}>
            <div className={styles.editField}>
              <label className={styles.editLabel} htmlFor="folio-sistema-anterior">
                Sistema Anterior (folio)
              </label>
              <input
                id="folio-sistema-anterior"
                type="text"
                className={styles.editInput}
                value={folioDraft}
                onChange={(event) => setFolioDraft(event.target.value)}
                placeholder="Sin folio"
              />
            </div>
            <div className={styles.editField}>
              <label className={styles.editLabel} htmlFor="vendedor-select">
                Vendedor
              </label>
              <select
                id="vendedor-select"
                className={styles.editSelect}
                value={vendedorDraft}
                onChange={(event) => setVendedorDraft(event.target.value)}
                disabled={vendedorOptions.isLoading}
              >
                <option value="">Sin vendedor</option>
                {(vendedorOptions.data ?? []).map((option) => (
                  <option key={option.netsuite_id} value={option.netsuite_id}>
                    {option.entityid ?? option.netsuite_id}
                  </option>
                ))}
              </select>
              {vendedorOptions.isError ? (
                <span className={styles.errorNote}>No se pudo cargar la lista de vendedores.</span>
              ) : null}
            </div>
            <div className={styles.editActions}>
              <button type="button" className={styles.saveButton} onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando...' : 'Guardar en NetSuite'}
              </button>
              <button type="button" className={styles.cancelButton} onClick={cancelEditing} disabled={mutation.isPending}>
                Cancelar
              </button>
              {mutation.isError ? (
                <span className={styles.errorNote}>
                  {mutation.error instanceof Error ? mutation.error.message : 'No se pudo guardar.'}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={`${styles.grid} ${styles.summaryGrid}`}>
            <div className={styles.field}>
              <p className={styles.fieldLabel}>Sistema Anterior</p>
              <p className={styles.fieldValue}>{contract.folio_sistema_anterior ?? '—'}</p>
            </div>
            <div className={styles.field}>
              <p className={styles.fieldLabel}>Vendedor</p>
              <p className={styles.fieldValue}>{contract.vendedor_nombre ?? '—'}</p>
            </div>
          </div>
        )}

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
