import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { ReportToolbar } from '../components/table/ReportToolbar';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { useContratosReport } from '../hooks/useContratosReport';
import { fetchContratosReportExportCsv } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { downloadBlob } from '../utils/downloadBlob';
import { formatCurrency, formatDate } from '../utils/format';
import { KNOWN_SUBSIDIARY_IDS } from '../config/subsidiaries';
import type { ContratoReportRow } from '../api/types';
import styles from './ContratosReportPage.module.css';

const DEFAULT_PAGE_SIZE = 25;

function yesNo(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'Sí' : 'No';
}

function siOrDash(value: boolean): string {
  return value ? 'SI' : '—';
}

/**
 * "Reporte Contratos" - a wide, one-row-per-contract export mirroring a legacy reference
 * spreadsheet's exact column set, sourced entirely from NetSuite - see
 * api/src-ts/reporting/contratosReportRepository.ts for exactly which column comes from where. A
 * handful of columns from the original reference export have no confirmed source in NetSuite
 * (checked against the full customrecord1184 field list, not merely unchecked) and always render
 * as "N/D" rather than a misleading blank - see the banner below.
 */
export function ContratosReportPage() {
  const { getAccessToken } = useApiToken();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [subsidiary, setSubsidiary] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useContratosReport(page, pageSize, search, subsidiary);

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
      const blob = await fetchContratosReportExportCsv(token, { search, subsidiary });
      downloadBlob(blob, 'reporte-contratos.csv');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el CSV.');
    } finally {
      setIsExporting(false);
    }
  }

  const columns: SimpleColumn<ContratoReportRow>[] = [
    { key: 'contrato', header: 'N° contrato', render: (r) => r.contrato || '—' },
    { key: 'folio_sistema_anterior', header: 'N° contrato sistema anterior', render: (r) => r.folio_sistema_anterior || '—' },
    { key: 'fecha_alta', header: 'Fecha de alta', render: (r) => formatDate(r.fecha_alta) },
    { key: 'estado_contrato', header: 'Estado contrato', render: (r) => r.estado_contrato || '—' },
    { key: 'titular_contrato', header: 'Titular contrato', render: (r) => r.titular_contrato || '—' },
    { key: 'especimen', header: 'Espécimen', render: (r) => r.especimen || '—' },
    { key: 'titular2', header: 'Titular 2', render: (r) => r.titular2 || '—' },
    { key: 'fecha_nacimiento', header: 'Fecha de nacimiento', render: (r) => formatDate(r.fecha_nacimiento) },
    { key: 'fecha_procesamiento', header: 'Fecha de procesamiento', render: (r) => formatDate(r.fecha_procesamiento) },
    { key: 'vendedor', header: 'Vendedor', render: (r) => r.vendedor || '—' },
    { key: 'cobrador_dueno', header: 'Cobrador dueño', render: (r) => r.cobrador_dueno || '—' },
    { key: 'scu', header: 'SCU', render: (r) => siOrDash(r.scu) },
    { key: 'estado_sangre', header: 'ESTADO SANGRE', render: (r) => r.estado_sangre || '—' },
    { key: 'costo_anualidad_sangre', header: 'COSTO ANUALIDAD SANGRE', render: (r) => (r.costo_anualidad_sangre !== null ? formatCurrency(r.costo_anualidad_sangre, null) : '—') },
    { key: 'pagado_hasta_sangre', header: 'PAGADO HASTA (SANGRE)', render: (r) => r.pagado_hasta_sangre || '—' },
    { key: 'tcu', header: 'TCU', render: (r) => siOrDash(r.tcu) },
    { key: 'estado_tejido', header: 'ESTADO TEJIDO', render: (r) => r.estado_tejido || '—' },
    { key: 'costo_anualidad_tejido', header: 'COSTO ANUALIDAD TEJIDO', render: (r) => (r.costo_anualidad_tejido !== null ? formatCurrency(r.costo_anualidad_tejido, null) : '—') },
    { key: 'pagado_hasta_tejido', header: 'PAGADO HASTA (TEJIDO)', render: (r) => r.pagado_hasta_tejido || '—' },
    { key: 'medico', header: 'Médico', render: (r) => r.medico || '—' },
    { key: 'telefono_titular', header: 'Telefono titular', render: (r) => r.telefono_titular || '—' },
    { key: 'correo_titular', header: 'Correo electronico titular', render: (r) => r.correo_titular || '—' },
    { key: 'zona', header: 'Zona', render: (r) => r.zona || '—' },
    { key: 'subsidiaria', header: 'SUBSIDIARIA', render: (r) => r.subsidiaria || '—' },
    { key: 'costo_dx', header: 'Costo DX', render: () => 'N/D' },
    { key: 'costo_adn', header: 'Costo ADN', render: (r) => (r.costo_adn !== null ? formatCurrency(r.costo_adn, null) : '—') },
    { key: 'costo_placenta', header: 'Costo Placenta', render: (r) => (r.costo_placenta !== null ? formatCurrency(r.costo_placenta, null) : '—') },
    { key: 'mes_nacimiento', header: 'Mes Nacimiento', render: (r) => (r.mes_nacimiento !== null ? String(r.mes_nacimiento) : '—') },
    { key: 'telefono_1', header: 'Teléfono 1', render: (r) => r.telefono_1 || '—' },
    { key: 'telefono_2', header: 'Teléfono 2', render: (r) => r.telefono_2 || '—' },
    { key: 'telefono_3', header: 'Teléfono 3', render: (r) => r.telefono_3 || '—' },
    { key: 'telefono_4', header: 'Teléfono 4', render: (r) => r.telefono_4 || '—' },
    { key: 'telefono_5', header: 'Teléfono 5', render: (r) => r.telefono_5 || '—' },
    { key: 'telefono_6', header: 'Teléfono 6', render: (r) => r.telefono_6 || '—' },
    { key: 'telefono_7', header: 'Teléfono 7', render: (r) => r.telefono_7 || '—' },
    { key: 'telefono_8', header: 'Teléfono 8', render: (r) => r.telefono_8 || '—' },
    { key: 'telefono_9', header: 'Teléfono 9', render: (r) => r.telefono_9 || '—' },
    { key: 'telefono_10', header: 'Teléfono 10', render: (r) => r.telefono_10 || '—' },
    { key: 'correo_titular2', header: 'Correo electronico titular 2', render: (r) => r.correo_titular2 || '—' },
    { key: 'zona_franquicia', header: 'Zona - Franquicia', render: (r) => r.zona_franquicia || '—' },
    { key: 'tipo', header: 'Tipo', render: () => 'N/D' },
    { key: 'razon_social', header: 'RazonSocial', render: () => 'N/D' },
    { key: 'rfc_fac', header: 'RFCFac', render: () => 'N/D' },
    { key: 'dir_fac', header: 'DirFac', render: () => 'N/D' },
    { key: 'col_fac', header: 'ColFac', render: () => 'N/D' },
    { key: 'cp_fac', header: 'CPFac', render: () => 'N/D' },
    { key: 'pais_fac', header: 'PaisFac', render: () => 'N/D' },
    { key: 'estado_fac', header: 'EstadoFac', render: () => 'N/D' },
    { key: 'ciudades_fac', header: 'CiudadesFac', render: () => 'N/D' },
    { key: 'usocfdi', header: 'usocfdi', render: () => 'N/D' },
    { key: 'regimen_fiscal', header: 'RegimenFiscal', render: () => 'N/D' },
    { key: 'referencia_cie', header: 'Referencia CIE NUEVA', render: (r) => r.referencia_cie || '—' },
    { key: 'referencia_sap', header: 'Referencia SAP', render: (r) => r.referencia_sap || '—' },
    { key: 'zona_franquicia_asociado', header: 'Zona( FRANQUICIA/ASOCIADO)', render: (r) => r.zona_franquicia_asociado || '—' },
    { key: 'token', header: 'Token', render: (r) => r.token || '—' },
    { key: 'fecha_venta', header: 'Fecha Venta', render: () => 'N/D' },
    { key: 'estatus_cliente', header: 'EstatusCliente', render: (r) => r.estatus_cliente || '—' },
    { key: 'estatus_cobranza', header: 'EstatusCobranza', render: (r) => r.estatus_cobranza || '—' },
    { key: 'metal', header: 'METAL', render: (r) => r.metal || '—' },
    { key: 'pago_automatico', header: 'Pago Automático', render: (r) => yesNo(r.pago_automatico) },
  ];

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const totalLabel = data ? `${numberFormatter.format(data.total)} registros` : '';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Contracts', to: '/reports/contracts' }, { label: 'Reporte Contratos' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Reporte Contratos</h1>
        <p className={styles.subtitle}>Detalle amplio por contrato: titulares, servicios, contacto y clasificadores.</p>
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
      {isLoading ? <LoadingState label="Cargando contratos..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el reporte de contratos.'} onRetry={() => refetch()} />
      ) : null}
      {!isLoading && !isError && data ? (
        data.data.length > 0 ? (
          <>
            <SimpleTable columns={columns} rows={data.data} getRowKey={(row) => row.netsuite_id} emptyMessage="No hay contratos que coincidan con la búsqueda." />
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
          <EmptyState message="No hay contratos que coincidan con la búsqueda." />
        )
      ) : null}
    </AppShell>
  );
}
