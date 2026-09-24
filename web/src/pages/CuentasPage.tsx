import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { ReportToolbar } from '../components/table/ReportToolbar';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useCuentas } from '../hooks/useCuentas';
import { fetchCuentasExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatCurrency, formatDate } from '../utils/format';
import { KNOWN_SUBSIDIARY_IDS } from '../config/subsidiaries';
import type { CuentaRow } from '../api/types';
import styles from './CuentasPage.module.css';

const DEFAULT_PAGE_SIZE = 25;

function yesNo(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'Sí' : 'No';
}

/**
 * "Cuentas" - per-contract account/collections detail, reached from the Partidas report. Built
 * from NetSuite plus, only for contracts with a legacy folio match, the pre-NetSuite Cryo.dbo
 * system - see api/src-ts/reporting/cuentasRepository.ts for exactly which column comes from
 * where. A handful of columns from the original reference export have no confirmed source in
 * either system yet (see the banner below) and always render as "N/D" rather than a misleading
 * blank.
 */
export function CuentasPage() {
  const { getAccessToken } = useApiToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [subsidiary, setSubsidiary] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useCuentas(page, pageSize, search, subsidiary);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleSubsidiaryChange(ids: string[]) {
    setSubsidiary(ids);
    setPage(1);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  async function handleExport() {
    setIsExporting(true);
    setExportError(null);
    try {
      const token = await getAccessToken();
      const blob = await fetchCuentasExportCsv(token, { search, subsidiary });
      downloadBlob(blob, 'cuentas.csv');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  const columns: SimpleColumn<CuentaRow>[] = [
    { key: 'contrato', header: 'Contrato', render: (r) => r.contrato || '—' },
    { key: 'folio_sistema_anterior', header: 'N° contrato sistema anterior', render: (r) => r.folio_sistema_anterior || '—' },
    { key: 'titular_nombre', header: 'Titular contrato', render: (r) => r.titular_nombre || '—' },
    { key: 'fecha_nacimiento_confirmada', header: 'Fecha nacimiento confirmada', render: (r) => formatDate(r.fecha_nacimiento_confirmada) },
    { key: 'titular_email', header: 'Correo electrónico', render: (r) => r.titular_email || '—' },
    { key: 'titular_telefono', header: 'Teléfono', render: (r) => r.titular_telefono || '—' },
    { key: 'titular2_nombre', header: 'Titular 2', render: (r) => r.titular2_nombre || '—' },
    { key: 'titular2_email', header: 'Correo Electrónico (Titular 2)', render: (r) => r.titular2_email || '—' },
    { key: 'titular2_telefono', header: 'Teléfono celular (Titular 2)', render: (r) => r.titular2_telefono || '—' },
    { key: 'numero_anos', header: 'Numero de años', render: (r) => (r.numero_anos !== null ? String(r.numero_anos) : '—') },
    { key: 'adeudo_total', header: 'Adeudo total', render: (r) => (r.adeudo_total !== null ? formatCurrency(r.adeudo_total, null) : '—') },
    { key: 'interes', header: 'Interés', render: (r) => (r.interes !== null ? formatCurrency(r.interes, null) : '—') },
    { key: 'costo_anualidad', header: 'Costo de anualidad', render: (r) => (r.costo_anualidad !== null ? formatCurrency(r.costo_anualidad, null) : '—') },
    { key: 'tipo_servicio', header: 'Tipo de Servicio', render: (r) => r.tipo_servicio || '—' },
    { key: 'nombre_hijo', header: 'Nombre Hijo', render: (r) => r.nombre_hijo || '—' },
    { key: 'referencia_cie', header: 'Referencia CIE NUEVA', render: (r) => r.referencia_cie || '—' },
    { key: 'referencia_sap', header: 'Referencia SAP', render: () => 'N/D' },
    { key: 'zona', header: 'Zona (Franquicia/Asociado)', render: (r) => r.zona || '—' },
    { key: 'mes_nacimiento', header: 'Mes Nacimiento', render: (r) => (r.mes_nacimiento !== null ? String(r.mes_nacimiento) : '—') },
    { key: 'fp_scu', header: 'FP SCU', render: (r) => formatDate(r.fp_scu) },
    { key: 'fp_tcu', header: 'FP TCU', render: (r) => formatDate(r.fp_tcu) },
    { key: 'fp_dx', header: 'FP DX', render: () => 'N/D' },
    { key: 'fp_adn', header: 'FP ADN', render: (r) => formatDate(r.fp_adn) },
    { key: 'pago_automatico', header: 'Pago Automático', render: (r) => yesNo(r.pago_automatico) },
    { key: 'estatus_cliente', header: 'Estatus Cliente', render: (r) => r.estatus_cliente || '—' },
    { key: 'estatus_cobranza', header: 'Estatus Cobranza', render: (r) => r.estatus_cobranza || '—' },
    { key: 'metal', header: 'Metal', render: (r) => r.metal || '—' },
    { key: 'tel_casa1', header: 'Tel Casa 1', render: () => 'N/D' },
    { key: 'tel_casa2', header: 'Tel Casa 2', render: () => 'N/D' },
    { key: 'cel_mama', header: 'Cel Mamá', render: () => 'N/D' },
    { key: 'cel_papa', header: 'Cel Papá', render: () => 'N/D' },
    { key: 'tel_oficina_madre', header: 'Tel Oficina Madre', render: () => 'N/D' },
    { key: 'tel_oficina_padre', header: 'Tel Oficina Padre', render: () => 'N/D' },
    { key: 'tel_pariente1', header: 'Tel Pariente 1', render: () => 'N/D' },
    { key: 'tel_pariente2', header: 'Tel Pariente 2', render: () => 'N/D' },
    { key: 'super_promo', header: 'SuperPromo', render: () => 'N/D' },
    {
      key: 'link_pago',
      header: 'Link Pago',
      render: (r) =>
        r.link_pago ? (
          <a href={r.link_pago} target="_blank" rel="noreferrer">
            Abrir
          </a>
        ) : (
          '—'
        ),
    },
    { key: 'token_sat', header: 'TokenSAT', render: () => 'N/D' },
    { key: 'pagado_hasta_scu', header: 'Pagado Hasta SCU', render: (r) => r.pagado_hasta_scu || '—' },
    { key: 'pagado_hasta_tcu', header: 'Pagado Hasta TCU', render: (r) => r.pagado_hasta_tcu || '—' },
    { key: 'pagado_hasta_dx', header: 'Pagado Hasta DX', render: () => 'N/D' },
    { key: 'pagado_hasta_adn', header: 'Pagado Hasta ADN', render: (r) => r.pagado_hasta_adn || '—' },
    { key: 'dueno', header: 'Dueño', render: (r) => r.dueno || '—' },
    { key: 'no_molestar', header: 'No Molestar', render: (r) => yesNo(r.no_molestar) },
  ];

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const totalLabel = data ? `${numberFormatter.format(data.total)} registros` : '';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Partidas', to: '/reports/partidas' }, { label: 'Cuentas' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Cuentas</h1>
        <p className={styles.subtitle}>Detalle de cuenta por contrato: titulares, adeudo, cobranza y contacto.</p>
      </div>
      {data && data.unavailableColumns.length > 0 ? (
        <div className={styles.unavailableBanner}>
          <strong>Columnas sin fuente de datos confirmada (se muestran como "N/D"):</strong> {data.unavailableColumns.map((c) => c.label).join(', ')}.
        </div>
      ) : null}
      {exportError ? <p className={styles.subtitle}>{exportError}</p> : null}
      <ReportToolbar
        initialSearch={search}
        onSearchChange={handleSearchChange}
        totalLabel={totalLabel}
        subsidiaryFilter={{ value: subsidiary, options: KNOWN_SUBSIDIARY_IDS, onChange: handleSubsidiaryChange }}
        onExport={handleExport}
        isExporting={isExporting}
      />
      {isLoading ? <LoadingState label="Cargando cuentas..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar las cuentas.'} onRetry={() => refetch()} />
      ) : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <>
            <SimpleTable columns={columns} rows={data.data} getRowKey={(row) => row.netsuite_id} emptyMessage="No hay cuentas que coincidan con la búsqueda." />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        ) : (
          <EmptyState message="No hay cuentas que coincidan con la búsqueda." />
        )
      ) : null}
    </AppShell>
  );
}
