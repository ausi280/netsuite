import { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import chartStyles from '../components/charts/charts.module.css';
import { useEntities } from '../hooks/useEntities';
import { usePricing, useUpdatePricingDiscount } from '../hooks/usePricing';
import type { PricingRow } from '../api/types';
import styles from './AdminPricingPage.module.css';

const MAX_DISCOUNT = 50;
const MAX_NOTAS = 1000;

/** One editable row - keyed by its saved discount/notas, so a refetch with new values remounts it with fresh local state. */
function PricingDiscountRow({ row }: { row: PricingRow }) {
  const [value, setValue] = useState(row.discount === null ? '' : String(row.discount));
  const [notas, setNotas] = useState(row.notas ?? '');
  const [justSaved, setJustSaved] = useState(false);
  const mutation = useUpdatePricingDiscount();

  const parsed = value.trim() === '' ? NaN : Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_DISCOUNT;
  const isDirty = valid && (parsed !== row.discount || notas.trim() !== (row.notas ?? ''));

  function handleSave() {
    setJustSaved(false);
    mutation.mutate({ id: row.id, discount: parsed, notas }, { onSuccess: () => setJustSaved(true) });
  }

  return (
    <tr>
      <td>{row.years} años</td>
      <td>
        <span className={styles.inputWrap}>
          <input
            type="number"
            className={`${styles.input} ${valid ? '' : styles.inputInvalid}`}
            min={0}
            max={MAX_DISCOUNT}
            step={0.01}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setJustSaved(false);
            }}
            aria-label={`Descuento ${row.years} años`}
          />
          %
        </span>
      </td>
      <td>
        <textarea
          className={styles.notas}
          rows={2}
          maxLength={MAX_NOTAS}
          value={notas}
          placeholder="Sin notas"
          onChange={(event) => {
            setNotas(event.target.value);
            setJustSaved(false);
          }}
          aria-label={`Notas ${row.years} años`}
        />
      </td>
      <td>
        <span className={styles.actions}>
          <button type="button" className={styles.saveButton} onClick={handleSave} disabled={!isDirty || mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          {!valid ? <span className={styles.errorNote}>Entre 0 y {MAX_DISCOUNT}%</span> : null}
          {valid && justSaved && !isDirty ? <span className={styles.savedNote}>Guardado ✓</span> : null}
          {mutation.isError ? (
            <span className={styles.errorNote}>{mutation.error instanceof Error ? mutation.error.message : 'No se pudo guardar.'}</span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

/** Super-admin-only screen (backend 403s anyone else) - app_pricing's discount per number of years. */
export function AdminPricingPage() {
  const { data: entities, isLoading: entitiesLoading } = useEntities();
  const isAdmin = Boolean(entities?.isAdmin);
  const { data: rows, isLoading, isError, error, refetch } = usePricing(isAdmin);

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Descuentos por años' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Descuentos por años</h1>
        <p className={styles.subtitle}>Descuento aplicado según los años contratados. Solo se puede modificar el descuento (de 0 a {MAX_DISCOUNT}%) y las notas.</p>
      </div>
      {entitiesLoading || (isAdmin && isLoading) ? <LoadingState label="Cargando descuentos..." /> : null}
      {!entitiesLoading && !isAdmin ? <EmptyState message="Solo un super administrador puede ver esta pantalla." /> : null}
      {isAdmin && isError ? (
        <ErrorState message={error instanceof Error ? error.message : 'No se pudieron cargar los descuentos.'} onRetry={() => refetch()} />
      ) : null}
      {isAdmin && rows ? (
        rows.length > 0 ? (
          <section className={`${chartStyles.chartCard} ${styles.card}`}>
            <table className={chartStyles.table}>
              <thead>
                <tr>
                  <th>Años</th>
                  <th>Descuento</th>
                  <th>Notas</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PricingDiscountRow key={`${row.id}:${row.discount}:${row.notas ?? ''}`} row={row} />
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <EmptyState message="No hay precios configurados." />
        )
      ) : null}
    </AppShell>
  );
}
