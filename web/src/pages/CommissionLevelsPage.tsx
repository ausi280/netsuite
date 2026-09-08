import { useMemo, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  useCommissionTiers,
  useDeleteCommissionTier,
  useEmployeeLevels,
  useUpdateEmployeeLevel,
  useUpsertCommissionTier,
} from '../hooks/useCommissionLevels';
import type { CommissionLevelTier, EmployeeLevel } from '../api/types';
import styles from './CommissionLevelsPage.module.css';

interface TierFormState {
  nivel: string;
  min_amount: string;
  percentage: string;
}

const EMPTY_TIER_FORM: TierFormState = { nivel: '', min_amount: '', percentage: '' };

function TierRow({ tier, onDeleted }: { tier: CommissionLevelTier; onDeleted: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<TierFormState>({
    nivel: tier.nivel,
    min_amount: String(tier.min_amount),
    percentage: String(tier.percentage),
  });
  const upsert = useUpsertCommissionTier();
  const remove = useDeleteCommissionTier();

  function handleSave() {
    upsert.mutate(
      { id: tier.id, nivel: form.nivel.trim(), min_amount: Number(form.min_amount), percentage: Number(form.percentage) },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleDelete() {
    remove.mutate(tier.id, { onSuccess: onDeleted });
  }

  if (isEditing) {
    return (
      <tr>
        <td>
          <input
            className={styles.inlineInput}
            type="number"
            step="0.01"
            value={form.min_amount}
            onChange={(event) => setForm((prev) => ({ ...prev, min_amount: event.target.value }))}
          />
        </td>
        <td>
          <input
            className={styles.inlineInput}
            type="number"
            step="0.01"
            value={form.percentage}
            onChange={(event) => setForm((prev) => ({ ...prev, percentage: event.target.value }))}
          />
        </td>
        <td className={styles.actionsCell}>
          <button type="button" className={styles.linkButton} onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button type="button" className={styles.linkButtonMuted} onClick={() => setIsEditing(false)} disabled={upsert.isPending}>
            Cancelar
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{tier.min_amount}</td>
      <td>{tier.percentage}%</td>
      <td className={styles.actionsCell}>
        <button type="button" className={styles.linkButton} onClick={() => setIsEditing(true)}>
          Editar
        </button>
        <button type="button" className={styles.linkButtonDanger} onClick={handleDelete} disabled={remove.isPending}>
          {remove.isPending ? 'Eliminando...' : 'Eliminar'}
        </button>
      </td>
    </tr>
  );
}

function AddTierForm({ nivel, onAdded }: { nivel: string; onAdded: () => void }) {
  const [minAmount, setMinAmount] = useState('');
  const [percentage, setPercentage] = useState('');
  const upsert = useUpsertCommissionTier();

  function handleSubmit() {
    if (minAmount === '' || percentage === '') return;
    upsert.mutate(
      { nivel, min_amount: Number(minAmount), percentage: Number(percentage) },
      {
        onSuccess: () => {
          setMinAmount('');
          setPercentage('');
          onAdded();
        },
      },
    );
  }

  return (
    <tr>
      <td>
        <input
          className={styles.inlineInput}
          type="number"
          step="0.01"
          placeholder="Monto mínimo"
          value={minAmount}
          onChange={(event) => setMinAmount(event.target.value)}
        />
      </td>
      <td>
        <input
          className={styles.inlineInput}
          type="number"
          step="0.01"
          placeholder="%"
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
        />
      </td>
      <td className={styles.actionsCell}>
        <button type="button" className={styles.linkButton} onClick={handleSubmit} disabled={upsert.isPending || minAmount === '' || percentage === ''}>
          {upsert.isPending ? 'Agregando...' : '+ Agregar tier'}
        </button>
        {upsert.isError ? <span className={styles.errorNote}>{upsert.error instanceof Error ? upsert.error.message : 'Error'}</span> : null}
      </td>
    </tr>
  );
}

function NewLevelForm() {
  const [form, setForm] = useState<TierFormState>(EMPTY_TIER_FORM);
  const upsert = useUpsertCommissionTier();

  function handleSubmit() {
    if (!form.nivel.trim() || form.min_amount === '' || form.percentage === '') return;
    upsert.mutate(
      { nivel: form.nivel.trim(), min_amount: Number(form.min_amount), percentage: Number(form.percentage) },
      { onSuccess: () => setForm(EMPTY_TIER_FORM) },
    );
  }

  return (
    <div className={styles.newLevelForm}>
      <input
        className={styles.textInput}
        type="text"
        placeholder="Nivel (ej. D)"
        value={form.nivel}
        onChange={(event) => setForm((prev) => ({ ...prev, nivel: event.target.value }))}
      />
      <input
        className={styles.textInput}
        type="number"
        step="0.01"
        placeholder="Monto mínimo"
        value={form.min_amount}
        onChange={(event) => setForm((prev) => ({ ...prev, min_amount: event.target.value }))}
      />
      <input
        className={styles.textInput}
        type="number"
        step="0.01"
        placeholder="%"
        value={form.percentage}
        onChange={(event) => setForm((prev) => ({ ...prev, percentage: event.target.value }))}
      />
      <button
        type="button"
        className={styles.primaryButton}
        onClick={handleSubmit}
        disabled={upsert.isPending || !form.nivel.trim() || form.min_amount === '' || form.percentage === ''}
      >
        {upsert.isPending ? 'Creando...' : '+ Nuevo nivel'}
      </button>
      {upsert.isError ? <span className={styles.errorNote}>{upsert.error instanceof Error ? upsert.error.message : 'Error'}</span> : null}
    </div>
  );
}

function EmployeeLevelRow({ employee }: { employee: EmployeeLevel }) {
  const [nivelContratos, setNivelContratos] = useState(employee.nivel_contratos ?? '');
  const [nivelOtrosContratos, setNivelOtrosContratos] = useState(employee.nivel_otros_contratos ?? '');
  const mutation = useUpdateEmployeeLevel();
  const isDirty =
    nivelContratos.trim() !== (employee.nivel_contratos ?? '') || nivelOtrosContratos.trim() !== (employee.nivel_otros_contratos ?? '');

  function handleSave() {
    mutation.mutate({
      employeeId: employee.netsuite_id,
      input: { nivel_contratos: nivelContratos.trim() || null, nivel_otros_contratos: nivelOtrosContratos.trim() || null },
    });
  }

  return (
    <tr>
      <td>{employee.entityid ?? employee.netsuite_id}</td>
      <td>{employee.email ?? '—'}</td>
      <td>
        <input
          className={styles.inlineInput}
          type="text"
          value={nivelContratos}
          onChange={(event) => setNivelContratos(event.target.value)}
          placeholder="—"
        />
      </td>
      <td>
        <input
          className={styles.inlineInput}
          type="text"
          value={nivelOtrosContratos}
          onChange={(event) => setNivelOtrosContratos(event.target.value)}
          placeholder="—"
        />
      </td>
      <td className={styles.actionsCell}>
        <button type="button" className={styles.linkButton} onClick={handleSave} disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </td>
    </tr>
  );
}

/** Admin config for the commissions report: each salesperson's nivel (A/B/C/...) and each nivel's
 * tiered commission-rate table (min_amount -> percentage). Both are app-owned config, not synced
 * NetSuite data - see employee_details/commission_level_tiers migrations for why. */
export function CommissionLevelsPage() {
  const { data: tiers, isLoading: tiersLoading, isError: tiersIsError, error: tiersError, refetch: refetchTiers } = useCommissionTiers();
  const { data: employees, isLoading: employeesLoading, isError: employeesIsError, error: employeesError, refetch: refetchEmployees } = useEmployeeLevels();

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const tiersByNivel = useMemo(() => {
    const groups = new Map<string, CommissionLevelTier[]>();
    for (const tier of tiers ?? []) {
      const list = groups.get(tier.nivel) ?? [];
      list.push(tier);
      groups.set(tier.nivel, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.min_amount - b.min_amount);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tiers]);

  const filteredEmployees = useMemo(() => {
    const term = employeeSearch.trim().toLowerCase();
    return (employees ?? []).filter((employee) => {
      if (!showInactive && employee.isinactive) return false;
      if (!term) return true;
      return (employee.entityid ?? '').toLowerCase().includes(term) || (employee.email ?? '').toLowerCase().includes(term);
    });
  }, [employees, employeeSearch, showInactive]);

  return (
    <AppShell
      breadcrumbs={[
        { label: 'Reportes', to: '/' },
        { label: 'Contratos', to: '/reports/contracts' },
        { label: 'Comisiones', to: '/reports/contracts/commissions' },
        { label: 'Niveles' },
      ]}
    >
      <div className={styles.heading}>
        <h1 className={styles.title}>Niveles de comisión</h1>
        <p className={styles.subtitle}>
          Configura el porcentaje de comisión por nivel y monto de venta, y asigna a cada vendedor un nivel de
          Contratos y un nivel de Otros Contratos - son independientes, sus ventas no se suman entre sí.
        </p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tabla de niveles</h2>
        {tiersLoading ? <LoadingState label="Cargando niveles..." /> : null}
        {tiersIsError ? (
          <ErrorState message={tiersError instanceof Error ? tiersError.message : 'No se pudieron cargar los niveles.'} onRetry={() => refetchTiers()} />
        ) : null}
        {!tiersLoading && !tiersIsError ? (
          <div className={styles.levelGrid}>
            {tiersByNivel.map(([nivel, nivelTiers]) => (
              <div key={nivel} className={styles.levelCard}>
                <h3 className={styles.levelName}>Nivel {nivel}</h3>
                <table className={styles.tierTable}>
                  <thead>
                    <tr>
                      <th>Monto mínimo</th>
                      <th>% Comisión</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {nivelTiers.map((tier) => (
                      <TierRow key={tier.id} tier={tier} onDeleted={() => {}} />
                    ))}
                    <AddTierForm nivel={nivel} onAdded={() => {}} />
                  </tbody>
                </table>
              </div>
            ))}
            <div className={styles.levelCard}>
              <h3 className={styles.levelName}>Agregar nivel nuevo</h3>
              <NewLevelForm />
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Asignar nivel a vendedores</h2>
        {employeesLoading ? <LoadingState label="Cargando vendedores..." /> : null}
        {employeesIsError ? (
          <ErrorState
            message={employeesError instanceof Error ? employeesError.message : 'No se pudieron cargar los vendedores.'}
            onRetry={() => refetchEmployees()}
          />
        ) : null}
        {!employeesLoading && !employeesIsError ? (
          <>
            <div className={styles.employeeFilters}>
              <input
                className={styles.textInput}
                type="search"
                placeholder="Buscar vendedor..."
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
              />
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
                Mostrar inactivos
              </label>
            </div>
            <table className={styles.employeeTable}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Nivel Contratos</th>
                  <th>Nivel Otros Contratos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <EmployeeLevelRow key={employee.netsuite_id} employee={employee} />
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
