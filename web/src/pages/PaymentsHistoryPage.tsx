import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { ReportToolbar } from '../components/table/ReportToolbar';
import { SimpleTable } from '../components/table/SimpleTable';
import type { SimpleColumn } from '../components/table/SimpleTable';
import { Pagination } from '../components/table/Pagination';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { usePaymentsList } from '../hooks/usePaymentsList';
import { chargeDomiciled } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { formatDateTime } from '../utils/format';
import { KNOWN_SUBSIDIARY_IDS } from '../config/subsidiaries';
import type { PaymentRow } from '../api/types';
import styles from './PaymentsHistoryPage.module.css';

const DEFAULT_PAGE_SIZE = 25;

const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function formatAmount(value: number): string {
  return mxnFormatter.format(value);
}

interface PaymentPayload {
  contractId?: string | number;
  customerId?: string | number;
  subsidiariaId?: string | number;
  domiciliar?: boolean;
  domiciliationInfo?: { mpCardId?: string };
}

function parsePayload(raw: string): PaymentPayload {
  try {
    return JSON.parse(raw) as PaymentPayload;
  } catch {
    return {};
  }
}

function canChargeDomiciled(row: PaymentRow): boolean {
  const payload = parsePayload(row.payloadRequest);
  const isSettled = row.status === 'processed' || row.status === 'approved';
  return Boolean(payload.domiciliar && payload.domiciliationInfo?.mpCardId && isSettled);
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  approved: { label: 'Aprobado', className: styles.badgeGreen },
  processed: { label: 'Aprobado', className: styles.badgeGreen },
  action_required: { label: 'Ficha pendiente', className: styles.badgeOrange },
  processing: { label: 'Ficha pendiente', className: styles.badgeOrange },
  rejected: { label: 'Rechazado', className: styles.badgeRed },
  pending: { label: 'Pendiente', className: styles.badgeYellow },
  in_process: { label: 'En Proceso', className: styles.badgeBlue },
  cancelled: { label: 'Cancelado', className: styles.badgeGray },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, className: styles.badgeGray };
  return <span className={`${styles.badge} ${config.className}`}>{config.label}</span>;
}

interface ChargeModalProps {
  row: PaymentRow;
  onClose: () => void;
}

function ChargeModal({ row, onClose }: ChargeModalProps) {
  const { getAccessToken } = useApiToken();
  const payload = parsePayload(row.payloadRequest);
  const [amount, setAmount] = useState(String(row.transaction_amount));
  const [description, setDescription] = useState(row.description ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit() {
    setIsSubmitting(true);
    setResult(null);
    try {
      const token = await getAccessToken();
      const response = await chargeDomiciled(token, {
        originalPaymentId: row.payment_id,
        amount,
        reference: row.payment_id,
        subsidiariaId: Number(payload.subsidiariaId) || 0,
        contractId: Number(payload.contractId) || 0,
        customerId: Number(payload.customerId) || 0,
        payer: { email: row.payer_email ?? '' },
        summary: { description },
      });
      const ok = response.status === 'approved' || response.status === 'processed';
      setResult({ ok, message: ok ? 'Cobro procesado correctamente.' : response.message ?? response.status_detail ?? 'El cobro no fue aprobado.' });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'No se pudo procesar el cobro.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <h2 className={styles.modalTitle}>Cobro domiciliado</h2>
        <p className={styles.modalSubtitle}>{row.contract_name ?? payload.contractId ?? row.payment_id}</p>

        <label className={styles.modalLabel}>
          Monto
          <input
            className={styles.modalInput}
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={isSubmitting}
          />
        </label>
        <label className={styles.modalLabel}>
          Descripción
          <input
            className={styles.modalInput}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
          />
        </label>

        {result ? (
          <div className={result.ok ? styles.resultSuccess : styles.resultError}>{result.message}</div>
        ) : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
            Cerrar
          </button>
          <button type="button" className={styles.chargeButton} onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Procesando...' : 'Procesar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Read-only history grid of MercadoPago payments (app_payments, owned by the sibling `payment`
 * project) plus the one write action it supports - "cobro domiciliado" - proxied through our own
 * backend to the live payment.cryoholdco.com API rather than reimplemented here. */
export function PaymentsHistoryPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [subsidiary, setSubsidiary] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [chargingRow, setChargingRow] = useState<PaymentRow | null>(null);

  const { data, isLoading, isError, error, refetch } = usePaymentsList({ page, pageSize, search, subsidiary, dateFrom, dateTo });

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleSubsidiaryChange(value: string) {
    setSubsidiary(value);
    setPage(1);
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setPage(1);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setPage(1);
  }

  function handlePageSizeChange(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPage(1);
  }

  const columns: SimpleColumn<PaymentRow>[] = [
    { key: 'created_at', header: 'Fecha', render: (r) => formatDateTime(r.created_at) },
    { key: 'contract', header: 'Contrato', render: (r) => r.contract_name ?? '—' },
    { key: 'payment_id', header: 'ID Pago', render: (r) => r.payment_id },
    { key: 'description', header: 'Descripción', render: (r) => r.description ?? '—' },
    { key: 'amount', header: 'Monto', render: (r) => formatAmount(r.transaction_amount) },
    { key: 'payer_email', header: 'Email', render: (r) => r.payer_email ?? '—' },
    { key: 'payment_method_id', header: 'Método', render: (r) => r.payment_method_id ?? '—' },
    { key: 'status', header: 'Estatus', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'action',
      header: 'Acción',
      render: (r) =>
        canChargeDomiciled(r) ? (
          <button
            type="button"
            className={styles.rowChargeButton}
            onClick={(event) => {
              event.stopPropagation();
              setChargingRow(r);
            }}
          >
            Cobrar
          </button>
        ) : (
          '—'
        ),
    },
  ];

  const numberFormatter = new Intl.NumberFormat('es-MX');
  const totalLabel = data ? `${numberFormatter.format(data.total)} registros` : '';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Pagos' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Pagos</h1>
      </div>
      <div className={styles.dateFilters}>
        <label className={styles.dateLabel}>
          Desde
          <input
            type="date"
            className={styles.dateInput}
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => handleDateFromChange(event.target.value)}
          />
        </label>
        <label className={styles.dateLabel}>
          Hasta
          <input
            type="date"
            className={styles.dateInput}
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => handleDateToChange(event.target.value)}
          />
        </label>
        {dateFrom || dateTo ? (
          <button
            type="button"
            className={styles.clearDatesButton}
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          >
            Limpiar fechas
          </button>
        ) : null}
      </div>
      <ReportToolbar
        initialSearch={search}
        onSearchChange={handleSearchChange}
        totalLabel={totalLabel}
        subsidiaryFilter={{ value: subsidiary, options: KNOWN_SUBSIDIARY_IDS, onChange: handleSubsidiaryChange }}
      />
      {isLoading ? <LoadingState label="Cargando pagos..." /> : null}
      {isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los pagos.'} onRetry={() => refetch()} />
      ) : null}
      {!isLoading && !isError && data ? (
        <>
          <SimpleTable
            columns={columns}
            rows={data.data}
            getRowKey={(row) => String(row.id)}
            emptyMessage="No hay pagos que coincidan con la búsqueda."
          />
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      ) : null}
      {chargingRow ? <ChargeModal row={chargingRow} onClose={() => setChargingRow(null)} /> : null}
    </AppShell>
  );
}
