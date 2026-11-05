import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import {
  WORK_PLAN_ACTIVITY_TYPES,
  WORK_PLAN_VISIT_TYPE,
  type WorkPlan,
  type WorkPlanActivity,
  type WorkPlanActivityInput,
  type WorkPlanCatalogOption,
} from '../api/types';
import { fetchWorkPlanPdf, searchWorkPlanCatalog, type WorkPlanTarget } from '../api/reportsApi';
import { useApiToken } from '../auth/useApiToken';
import { useCloneWorkPlan, useDeleteWorkPlanActivity, useSaveWorkPlanActivity, useSaveWorkPlanHeader, useWorkPlan } from '../hooks/useWorkPlan';
import { downloadBlob } from '../utils/downloadBlob';
import pageStyles from './CommissionsPage.module.css';
import styles from './WorkPlanPage.module.css';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEK_HEADER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const CURRENT_YEAR = new Date().getFullYear();
// Includes next year - plans are made ahead of the month.
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => CURRENT_YEAR + 1 - index);

// Same colors as the PDF (api/src-ts/reporting/salesWorkPlanPdf.ts), so screen and paper match.
const TYPE_COLORS: Record<string, string> = {
  'Visita médica': '#2563eb',
  Evento: '#d97706',
  'Curso psicoprofiláctico': '#7c3aed',
  'Plática doulas': '#db2777',
  'Capacitación enfermería': '#059669',
};
const ESPECIALIDADES = ['Ginecología', 'Materno fetal', 'Pediatría'];
const MOTIVOS = ['Presentación', 'Seguimiento'];
const REQUERIMIENTOS = [
  'Material impreso',
  'Presentación digital',
  'Kit recolección (demo)',
  'Muestras / obsequios',
  'Stand o lona',
  'Coffee break',
  'Formatos de contrato',
  'Otro',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOf(fecha: string): Date {
  return new Date(`${fecha}T12:00:00`);
}

function h12(hora: string | null): string {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'pm' : 'am'}`;
}

function money(n: number): string {
  return `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

function activityTitle(a: WorkPlanActivity): string {
  return a.tipo === WORK_PLAN_VISIT_TYPE ? a.medico_nombre || a.hospital_nombre || 'Visita' : a.evento_nombre || a.tipo;
}

function activitySubtitle(a: WorkPlanActivity): string {
  return a.tipo === WORK_PLAN_VISIT_TYPE ? [a.hospital_nombre, a.especialidad].filter(Boolean).join(' · ') : a.sede ?? '';
}

function sortActivities(list: WorkPlanActivity[]): WorkPlanActivity[] {
  return [...list].sort((a, b) => `${a.fecha}${a.hora ?? '99'}`.localeCompare(`${b.fecha}${b.hora ?? '99'}`) || a.id - b.id);
}

interface CatalogPick {
  netsuite_id: string | null;
  nombre: string;
}

interface FormState {
  /** Set while editing an existing activity. */
  id?: number;
  fecha: string;
  hora: string;
  tipo: string;
  medico: CatalogPick;
  hospital: CatalogPick;
  especialidad: string;
  motivo: string;
  evento_nombre: string;
  sede: string;
  asistentes: string;
  requerimientos: string[];
  notas: string;
}

function emptyForm(fecha: string): FormState {
  return {
    fecha,
    hora: '',
    tipo: WORK_PLAN_VISIT_TYPE,
    medico: { netsuite_id: null, nombre: '' },
    hospital: { netsuite_id: null, nombre: '' },
    especialidad: ESPECIALIDADES[0],
    motivo: MOTIVOS[0],
    evento_nombre: '',
    sede: '',
    asistentes: '',
    requerimientos: [],
    notas: '',
  };
}

function formFromActivity(a: WorkPlanActivity): FormState {
  return {
    id: a.id,
    fecha: a.fecha,
    hora: a.hora ?? '',
    tipo: a.tipo,
    medico: { netsuite_id: a.medico_netsuite_id, nombre: a.medico_nombre ?? '' },
    hospital: { netsuite_id: a.hospital_netsuite_id, nombre: a.hospital_nombre ?? '' },
    especialidad: a.especialidad ?? ESPECIALIDADES[0],
    motivo: a.motivo ?? MOTIVOS[0],
    evento_nombre: a.evento_nombre ?? '',
    sede: a.sede ?? '',
    asistentes: a.asistentes ? String(a.asistentes) : '',
    requerimientos: a.requerimientos,
    notas: a.notas ?? '',
  };
}

function formToInput(form: FormState): WorkPlanActivityInput {
  const isVisit = form.tipo === WORK_PLAN_VISIT_TYPE;
  const text = (s: string) => s.trim() || null;
  return {
    fecha: form.fecha,
    hora: form.hora || null,
    tipo: form.tipo,
    medico_netsuite_id: isVisit ? form.medico.netsuite_id : null,
    medico_nombre: isVisit ? text(form.medico.nombre) : null,
    hospital_netsuite_id: isVisit ? form.hospital.netsuite_id : null,
    hospital_nombre: isVisit ? text(form.hospital.nombre) : null,
    especialidad: isVisit ? form.especialidad : null,
    motivo: isVisit ? form.motivo : null,
    evento_nombre: isVisit ? null : text(form.evento_nombre),
    sede: isVisit ? null : text(form.sede),
    asistentes: !isVisit && Number(form.asistentes) > 0 ? Number(form.asistentes) : null,
    requerimientos: form.requerimientos,
    notas: text(form.notas),
  };
}

/**
 * Text box with NetSuite suggestions (médicos / hospitales, scoped to the vendedor's subsidiarias).
 * Picking one keeps its NetSuite id; typing freely is allowed too - a vendedor may visit someone
 * who isn't in NetSuite yet - and then only the name is saved.
 */
function CatalogInput({
  catalog,
  value,
  onChange,
  vendedor,
  placeholder,
  extraOptions,
}: {
  catalog: 'medicos' | 'hospitales';
  value: CatalogPick;
  onChange: (value: CatalogPick) => void;
  vendedor?: string;
  placeholder: string;
  /** Names already used in this plan, offered first so a repeat visit is one click. */
  extraOptions: CatalogPick[];
}) {
  const { getAccessToken } = useApiToken();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<WorkPlanCatalogOption[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const query = value.nombre.trim();

  useEffect(() => {
    if (!open || value.netsuite_id || query.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await searchWorkPlanCatalog(await getAccessToken(), catalog, query, vendedor);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, value.netsuite_id, catalog, vendedor, getAccessToken]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const lower = query.toLowerCase();
  const used = value.netsuite_id
    ? []
    : extraOptions.filter((o) => o.nombre.toLowerCase().includes(lower) && o.nombre.toLowerCase() !== lower).slice(0, 5);
  const usedNames = new Set(used.map((o) => o.nombre.toLowerCase()));
  const netsuite = query.length >= 2 && !value.netsuite_id ? results.filter((r) => !usedNames.has(r.nombre.toLowerCase())) : [];
  const options: Array<CatalogPick & { source: string }> = [
    ...used.map((o) => ({ ...o, source: 'Ya en tu plan' })),
    ...netsuite.map((o) => ({ ...o, source: 'NetSuite' })),
  ];

  function pick(option: CatalogPick) {
    onChange({ netsuite_id: option.netsuite_id, nombre: option.nombre });
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className={styles.combo} ref={boxRef}>
      <input
        className={styles.input}
        value={value.nombre}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange({ netsuite_id: null, nombre: event.target.value });
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (!open || options.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(options[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-autocomplete="list"
      />
      {value.netsuite_id ? <span className={styles.comboTag}>✓ De NetSuite</span> : null}
      {open && options.length > 0 ? (
        <ul className={styles.suggestions} role="listbox">
          {options.map((option, index) => (
            <li key={`${option.source}-${option.netsuite_id ?? option.nombre}`}>
              <button
                type="button"
                className={`${styles.suggestion} ${index === active ? styles.suggestionActive : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
              >
                {option.nombre}
                <span className={styles.suggestionMeta}> · {option.source}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Gerente-only editor for the plan's puesto and free-text objetivos (one per line). */
function HeaderEditor({ plan, target, onDone }: { plan: WorkPlan; target: WorkPlanTarget; onDone: () => void }) {
  const [puesto, setPuesto] = useState(plan.puesto ?? '');
  const [text, setText] = useState(plan.objetivos.join('\n'));
  const save = useSaveWorkPlanHeader();

  function submit() {
    const objetivos = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    save.mutate({ target, input: { puesto: puesto.trim() || null, objetivos } }, { onSuccess: onDone });
  }

  return (
    <div className={styles.form}>
      <label className={`${styles.field} ${styles.span2}`}>
        <span className={styles.label}>Puesto</span>
        <input className={styles.input} value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej. Bioespecialista" />
      </label>
      <label className={`${styles.field} ${styles.span4}`}>
        <span className={styles.label}>Objetivos (uno por renglón)</span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Realizar un mínimo 35 visitas médicas\nGenerar como mínimo 40 prospectos.'}
        />
      </label>
      <p className={`${styles.hint} ${styles.full}`}>La venta CORE y Genética se agregan solas según los niveles del vendedor.</p>
      <div className={styles.formButtons}>
        {save.isError ? <span className={styles.error}>{save.error instanceof Error ? save.error.message : 'No se pudo guardar.'}</span> : null}
        <button type="button" className={styles.secondaryButton} onClick={onDone}>
          Cancelar
        </button>
        <button type="button" className={styles.primaryButton} onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Guardando...' : 'Guardar objetivos'}
        </button>
      </div>
    </div>
  );
}

type ModalState = { kind: 'day'; fecha: string } | { kind: 'detail'; id: number } | null;

/** Vendedores' monthly plan de trabajo (visitas médicas, eventos, cursos...), downloadable as the
 * PDF they send their gerente - replaces the standalone plan.html page. A vendedor captures their
 * own; a gerente picks any vendedor and sets the plan's puesto/objetivos. */
export function WorkPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken } = useApiToken();
  const now = new Date();
  const month = Number(searchParams.get('month')) || now.getMonth() + 1;
  const year = Number(searchParams.get('year')) || now.getFullYear();
  const vendedorParam = searchParams.get('vendedor') ?? '';
  const monthPrefix = `${year}-${pad(month)}`;

  const { data: result, isLoading, isError, error, refetch } = useWorkPlan(month, year, vendedorParam);
  const plan = result?.data ?? null;
  const isGerente = result?.isGerente ?? false;
  const target: WorkPlanTarget = { month, year, vendedor: isGerente ? vendedorParam : undefined };

  const [form, setForm] = useState<FormState>(() => emptyForm(`${monthPrefix}-01`));
  const [formMessage, setFormMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [view, setView] = useState<'cal' | 'list'>('cal');
  const [modal, setModal] = useState<ModalState>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [cloneOpen, setCloneOpen] = useState(false);
  const previous = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const [cloneFrom, setCloneFrom] = useState(previous);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setModal(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal]);

  const saveActivity = useSaveWorkPlanActivity();
  const removeActivity = useDeleteWorkPlanActivity();
  const clone = useCloneWorkPlan();

  // A different month/vendedor starts a clean form on that month - derived during render (React's
  // "adjusting state when a prop changes"), not in an effect.
  const [formScope, setFormScope] = useState(`${monthPrefix}|${vendedorParam}`);
  if (formScope !== `${monthPrefix}|${vendedorParam}`) {
    setFormScope(`${monthPrefix}|${vendedorParam}`);
    setForm(emptyForm(`${monthPrefix}-01`));
    setFormMessage(null);
    setEditingHeader(false);
    setCloneMessage(null);
    setCloneFrom(previous);
  }

  const activities = useMemo(() => sortActivities(plan?.activities ?? []), [plan]);
  const byDay = useMemo(() => {
    const map = new Map<string, WorkPlanActivity[]>();
    for (const a of activities) map.set(a.fecha, [...(map.get(a.fecha) ?? []), a]);
    return map;
  }, [activities]);
  // Médicos/hospitales already in this plan, offered first in the autocomplete.
  const usedMedicos = useMemo(() => uniquePicks(activities.map((a) => ({ netsuite_id: a.medico_netsuite_id, nombre: a.medico_nombre ?? '' }))), [activities]);
  const usedHospitales = useMemo(
    () => uniquePicks(activities.map((a) => ({ netsuite_id: a.hospital_netsuite_id, nombre: a.hospital_nombre ?? '' }))),
    [activities],
  );

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  function updateForm(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function startNew(fecha: string) {
    setForm(emptyForm(fecha));
    setFormMessage(null);
    setModal(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function startEdit(activity: WorkPlanActivity, duplicate: boolean) {
    const next = formFromActivity(activity);
    if (duplicate) delete next.id;
    setForm(next);
    setFormMessage(duplicate ? { ok: true, text: 'Copia lista - cambia la fecha o lo que necesites y agrégala.' } : null);
    setModal(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submitForm() {
    const isVisit = form.tipo === WORK_PLAN_VISIT_TYPE;
    if (!form.fecha.startsWith(monthPrefix)) return setFormMessage({ ok: false, text: `La fecha debe ser de ${MONTH_NAMES[month - 1]} ${year}.` });
    if (isVisit && !form.medico.nombre.trim() && !form.hospital.nombre.trim()) return setFormMessage({ ok: false, text: 'Escribe el médico o el hospital.' });
    if (!isVisit && !form.evento_nombre.trim()) return setFormMessage({ ok: false, text: 'Escribe el nombre del evento o actividad.' });

    const editing = Boolean(form.id);
    saveActivity.mutate(
      { target, id: form.id, input: formToInput(form) },
      {
        onSuccess: () => {
          setForm(emptyForm(form.fecha));
          setFormMessage({ ok: true, text: editing ? 'Cambios guardados ✓' : 'Agregado al plan ✓' });
        },
        onError: (err) => setFormMessage({ ok: false, text: err instanceof Error ? err.message : 'No se pudo guardar.' }),
      },
    );
  }

  function handleDelete(activity: WorkPlanActivity) {
    if (!window.confirm('¿Eliminar esta actividad del plan?')) return;
    removeActivity.mutate(activity.id, {
      onSuccess: () => {
        if (form.id === activity.id) setForm(emptyForm(activity.fecha));
        setModal((byDay.get(activity.fecha)?.length ?? 0) > 1 ? { kind: 'day', fecha: activity.fecha } : null);
      },
    });
  }

  function handleClone() {
    const fromLabel = `${MONTH_NAMES[cloneFrom.month - 1]} ${cloneFrom.year}`;
    const warning = activities.length > 0 ? ` Se agregarán a las ${activities.length} actividades que ya tienes.` : '';
    if (!window.confirm(`¿Copiar las actividades de ${fromLabel} a ${MONTH_NAMES[month - 1]} ${year}? Cada una cae en el mismo día de la semana (ej. 2º martes → 2º martes).${warning}`)) return;
    clone.mutate(
      { target, from: cloneFrom },
      {
        onSuccess: ({ copied }) => {
          setCloneMessage(copied > 0 ? `Se copiaron ${copied} actividades de ${fromLabel}. Revisa fechas y ajusta lo necesario.` : `${fromLabel} no tiene actividades.`);
          if (copied > 0) setCloneOpen(false);
        },
        onError: (err) => setCloneMessage(err instanceof Error ? err.message : 'No se pudo copiar.'),
      },
    );
  }

  async function handlePdf() {
    setPdfState({ busy: true, error: null });
    try {
      const blob = await fetchWorkPlanPdf(await getAccessToken(), target);
      const name = `Plan de trabajo ${plan?.vendedor_nombre ?? ''} - ${MONTH_NAMES[month - 1]} ${year}`.normalize('NFD').replace(/[̀-ͯ]/g, '');
      downloadBlob(blob, `${name}.pdf`);
      setPdfState({ busy: false, error: null });
    } catch (err) {
      setPdfState({ busy: false, error: err instanceof Error ? err.message : 'No se pudo generar el PDF.' });
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isVisitForm = form.tipo === WORK_PLAN_VISIT_TYPE;
  const filtered = activities.filter(
    (a) =>
      (!typeFilter || a.tipo === typeFilter) &&
      (!search ||
        [a.medico_nombre, a.hospital_nombre, a.evento_nombre, a.sede, a.especialidad, a.notas].join(' ').toLowerCase().includes(search.trim().toLowerCase())),
  );
  const detailActivity = modal?.kind === 'detail' ? activities.find((a) => a.id === modal.id) : undefined;
  const ventaObjetivo = plan
    ? [plan.venta.core !== null ? `Venta CORE: ${money(plan.venta.core)}` : null, plan.venta.genetica !== null ? `Venta Genética: ${money(plan.venta.genetica)}` : null]
        .filter(Boolean)
        .join('  |  ')
    : '';

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Plan de trabajo' }]}>
      <div className={pageStyles.heading}>
        <div>
          <h1 className={pageStyles.title}>{plan ? `Plan de trabajo ${plan.vendedor_nombre}${plan.puesto ? ` - ${plan.puesto}` : ''}` : 'Plan de trabajo'}</h1>
          <p className={pageStyles.subtitle}>
            {isGerente
              ? 'Elige un vendedor para ver o capturar su plan del mes y definir sus objetivos.'
              : 'Captura tus visitas y actividades del mes. Todo se guarda al momento; cuando esté listo, descarga el PDF y envíalo a tu gerente.'}
          </p>
        </div>
        {plan ? (
          <div className={pageStyles.actions}>
            <button type="button" className={pageStyles.actionButton} onClick={() => setCloneOpen((o) => !o)}>
              Copiar de otro mes
            </button>
            <button type="button" className={pageStyles.actionButton} onClick={handlePdf} disabled={pdfState.busy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
              {pdfState.busy ? 'Generando PDF...' : 'Descargar PDF'}
            </button>
          </div>
        ) : null}
      </div>
      {pdfState.error ? <p className={pageStyles.exportError}>{pdfState.error}</p> : null}

      <div className={pageStyles.filters}>
        <select className={pageStyles.select} value={month} onChange={(e) => setParam('month', e.target.value)} aria-label="Mes">
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <select className={pageStyles.select} value={year} onChange={(e) => setParam('year', e.target.value)} aria-label="Año">
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {isGerente ? (
          <select className={pageStyles.select} value={vendedorParam} onChange={(e) => setParam('vendedor', e.target.value)} aria-label="Vendedor">
            <option value="">Elige un vendedor...</option>
            {(result?.vendedores ?? []).map((v) => (
              <option key={v.netsuite_id} value={v.netsuite_id}>
                {v.nombre}
                {v.nivel_contratos ? ` (nivel ${v.nivel_contratos})` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {cloneOpen && plan ? (
        <div className={styles.clonePanel}>
          <span>Copiar actividades de</span>
          <select
            className={pageStyles.select}
            value={cloneFrom.month}
            onChange={(e) => setCloneFrom((c) => ({ ...c, month: Number(e.target.value) }))}
            aria-label="Mes a copiar"
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            className={pageStyles.select}
            value={cloneFrom.year}
            onChange={(e) => setCloneFrom((c) => ({ ...c, year: Number(e.target.value) }))}
            aria-label="Año a copiar"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="button" className={styles.primaryButton} onClick={handleClone} disabled={clone.isPending}>
            {clone.isPending ? 'Copiando...' : `Copiar a ${MONTH_NAMES[month - 1]}`}
          </button>
        </div>
      ) : null}
      {cloneMessage ? <p className={`${styles.hint} ${styles.clonePanel}`}>{cloneMessage}</p> : null}

      {isLoading ? <LoadingState label="Cargando plan de trabajo..." /> : null}
      {isError ? <ErrorState message={error instanceof Error ? error.message : 'No se pudo cargar el plan.'} onRetry={() => refetch()} /> : null}
      {!isLoading && !isError && !plan && isGerente ? <EmptyState message="Elige un vendedor para ver su plan de trabajo." /> : null}

      {plan ? (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Objetivos del mes</h2>
              {isGerente && !editingHeader ? (
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingHeader(true)}>
                  Editar puesto y objetivos
                </button>
              ) : null}
            </div>
            {editingHeader ? (
              <HeaderEditor plan={plan} target={target} onDone={() => setEditingHeader(false)} />
            ) : (
              <div className={styles.objetivos}>
                {plan.objetivos.map((o, i) => (
                  <div className={styles.objetivo} key={o}>
                    <span className={styles.objetivoNum}>{i + 1}</span>
                    <span>{o}</span>
                  </div>
                ))}
                {ventaObjetivo ? (
                  <div className={`${styles.objetivo} ${styles.objetivoVenta}`} title="Según los niveles del vendedor (primer escalón, con IVA)">
                    <span className={styles.objetivoNum}>{plan.objetivos.length + 1}</span>
                    <span>{ventaObjetivo}</span>
                  </div>
                ) : (
                  <p className={styles.hint}>Sin nivel asignado - la venta objetivo aparece cuando la gerencia asigna los niveles.</p>
                )}
              </div>
            )}
          </section>

          <section className={styles.card} ref={formRef}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{form.id ? 'Editar actividad' : 'Agregar actividad al plan'}</h2>
            </div>
            <div className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>Fecha</span>
                <input
                  type="date"
                  className={styles.input}
                  value={form.fecha}
                  min={`${monthPrefix}-01`}
                  max={`${monthPrefix}-${pad(daysInMonth)}`}
                  onChange={(e) => updateForm({ fecha: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Hora</span>
                <input type="time" className={styles.input} value={form.hora} onChange={(e) => updateForm({ hora: e.target.value })} />
              </label>
              <label className={`${styles.field} ${styles.span2}`}>
                <span className={styles.label}>Tipo</span>
                <select className={styles.input} value={form.tipo} onChange={(e) => updateForm({ tipo: e.target.value })}>
                  {WORK_PLAN_ACTIVITY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {isVisitForm ? (
                <label className={`${styles.field} ${styles.span2}`}>
                  <span className={styles.label}>Motivo</span>
                  <select className={styles.input} value={form.motivo} onChange={(e) => updateForm({ motivo: e.target.value })}>
                    {MOTIVOS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className={`${styles.field} ${styles.span2}`}>
                  <span className={styles.label}>Asistentes esperados</span>
                  <input
                    type="number"
                    min={0}
                    className={styles.input}
                    value={form.asistentes}
                    onChange={(e) => updateForm({ asistentes: e.target.value })}
                    placeholder="0"
                  />
                </label>
              )}

              {isVisitForm ? (
                <>
                  <div className={`${styles.field} ${styles.span2}`}>
                    <span className={styles.label}>Médico</span>
                    <CatalogInput
                      catalog="medicos"
                      value={form.medico}
                      onChange={(medico) => updateForm({ medico })}
                      vendedor={target.vendedor}
                      placeholder="Busca en NetSuite o escribe"
                      extraOptions={usedMedicos}
                    />
                  </div>
                  <div className={`${styles.field} ${styles.span2}`}>
                    <span className={styles.label}>Hospital / clínica</span>
                    <CatalogInput
                      catalog="hospitales"
                      value={form.hospital}
                      onChange={(hospital) => updateForm({ hospital })}
                      vendedor={target.vendedor}
                      placeholder="Busca en NetSuite o escribe"
                      extraOptions={usedHospitales}
                    />
                  </div>
                  <label className={`${styles.field} ${styles.span2}`}>
                    <span className={styles.label}>Especialidad</span>
                    <select className={styles.input} value={form.especialidad} onChange={(e) => updateForm({ especialidad: e.target.value })}>
                      {ESPECIALIDADES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className={`${styles.field} ${styles.span3}`}>
                    <span className={styles.label}>Nombre del evento / actividad</span>
                    <input
                      className={styles.input}
                      value={form.evento_nombre}
                      onChange={(e) => updateForm({ evento_nombre: e.target.value })}
                      placeholder="Ej. Curso psicoprofiláctico"
                    />
                  </label>
                  <label className={`${styles.field} ${styles.span3}`}>
                    <span className={styles.label}>Sede / lugar</span>
                    <input className={styles.input} value={form.sede} onChange={(e) => updateForm({ sede: e.target.value })} placeholder="Lugar" />
                  </label>
                </>
              )}

              <div className={`${styles.field} ${styles.full}`}>
                <span className={styles.label}>Requerimientos</span>
                <div className={styles.chips}>
                  {REQUERIMIENTOS.map((r) => {
                    const on = form.requerimientos.includes(r);
                    return (
                      <button
                        type="button"
                        key={r}
                        className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                        aria-pressed={on}
                        onClick={() => updateForm({ requerimientos: on ? form.requerimientos.filter((x) => x !== r) : [...form.requerimientos, r] })}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className={`${styles.field} ${styles.full}`}>
                <span className={styles.label}>Notas</span>
                <input className={styles.input} value={form.notas} onChange={(e) => updateForm({ notas: e.target.value })} placeholder="Opcional" />
              </label>

              <div className={styles.formButtons}>
                {formMessage ? <span className={formMessage.ok ? styles.success : styles.error}>{formMessage.text}</span> : null}
                {form.id ? (
                  <button type="button" className={styles.secondaryButton} onClick={() => startNew(form.fecha)}>
                    Cancelar
                  </button>
                ) : null}
                <button type="button" className={styles.primaryButton} onClick={submitForm} disabled={saveActivity.isPending}>
                  {saveActivity.isPending ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Agregar al plan'}
                </button>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                Plan de {MONTH_NAMES[month - 1]} {year} · {activities.length} actividad{activities.length === 1 ? '' : 'es'}
              </h2>
              <div className={styles.tabs} role="tablist">
                <button type="button" role="tab" aria-selected={view === 'cal'} className={`${styles.tab} ${view === 'cal' ? styles.tabOn : ''}`} onClick={() => setView('cal')}>
                  Calendario
                </button>
                <button type="button" role="tab" aria-selected={view === 'list'} className={`${styles.tab} ${view === 'list' ? styles.tabOn : ''}`} onClick={() => setView('list')}>
                  Listado
                </button>
              </div>
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>Total: {activities.length}</span>
              {WORK_PLAN_ACTIVITY_TYPES.map((t) => (
                <span className={styles.legendItem} key={t}>
                  <i className={styles.dot} style={{ background: TYPE_COLORS[t] }} />
                  {t}: {activities.filter((a) => a.tipo === t).length}
                </span>
              ))}
            </div>

            {view === 'cal' ? (
              <div className={styles.calendar}>
                {WEEK_HEADER.map((d) => (
                  <div className={styles.dow} key={d}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <div className={styles.dayEmpty} key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const fecha = `${monthPrefix}-${pad(i + 1)}`;
                  const list = byDay.get(fecha) ?? [];
                  return (
                    <button
                      type="button"
                      key={fecha}
                      className={`${styles.day} ${fecha === todayStr ? styles.dayToday : ''}`}
                      onClick={() => setModal({ kind: 'day', fecha })}
                      aria-label={`${i + 1} de ${MONTH_NAMES[month - 1]}: ${list.length} actividades`}
                    >
                      <span className={styles.dayHead}>
                        {i + 1}
                        {list.length > 0 ? <span className={styles.dayCount}>{list.length}</span> : null}
                      </span>
                      {list.slice(0, 3).map((a) => (
                        <span className={styles.event} key={a.id}>
                          <i className={styles.dot} style={{ background: TYPE_COLORS[a.tipo] }} />
                          <span className={styles.eventText}>
                            {a.hora ? `${h12(a.hora).replace(':00', '')} ` : ''}
                            {activityTitle(a)}
                          </span>
                        </span>
                      ))}
                      {list.length > 3 ? <span className={styles.more}>+{list.length - 3} más</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className={styles.listBar}>
                  <input className={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar médico, hospital o evento" />
                  <select className={styles.input} style={{ maxWidth: 220 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Tipo">
                    <option value="">Todos los tipos</option>
                    {WORK_PLAN_ACTIVITY_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th>Hora</th>
                        <th>Tipo</th>
                        <th>Detalle</th>
                        <th>Req.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => {
                        const d = dateOf(a.fecha);
                        return (
                          <tr key={a.id} onClick={() => setModal({ kind: 'detail', id: a.id })}>
                            <td>
                              {DAYS_SHORT[d.getDay()]} {d.getDate()}
                            </td>
                            <td>{h12(a.hora)}</td>
                            <td>
                              <i className={styles.dot} style={{ background: TYPE_COLORS[a.tipo], marginRight: 6 }} />
                              {a.tipo}
                            </td>
                            <td>
                              <strong>{activityTitle(a)}</strong>
                              {activitySubtitle(a) ? <span className={styles.cellMuted}> · {activitySubtitle(a)}</span> : null}
                            </td>
                            <td className={styles.cellMuted}>{a.requerimientos.length > 0 ? a.requerimientos.join(', ') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 ? (
                    <p className={styles.empty}>{activities.length === 0 ? `Aún no hay actividades en ${MONTH_NAMES[month - 1]} ${year}.` : 'Sin resultados.'}</p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      {modal ? (
        <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true">
            {modal.kind === 'day' ? (
              <>
                <div className={styles.modalHead}>
                  <h3 className={styles.modalTitle}>
                    {DAYS_LONG[dateOf(modal.fecha).getDay()]} {dateOf(modal.fecha).getDate()} de {MONTH_NAMES[month - 1].toLowerCase()}
                  </h3>
                  <button type="button" className={styles.close} onClick={() => setModal(null)} aria-label="Cerrar">
                    ×
                  </button>
                </div>
                {(byDay.get(modal.fecha) ?? []).map((a) => (
                  <button type="button" className={styles.item} key={a.id} onClick={() => setModal({ kind: 'detail', id: a.id })}>
                    <i className={styles.dot} style={{ background: TYPE_COLORS[a.tipo] }} />
                    <span className={styles.itemTime}>{h12(a.hora) || '—'}</span>
                    <span className={styles.itemText}>
                      <strong>{a.tipo}</strong> · {activityTitle(a)}
                      <span className={styles.itemSub}>{activitySubtitle(a)}</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                ))}
                {(byDay.get(modal.fecha) ?? []).length === 0 ? <p className={styles.empty}>No hay actividades este día.</p> : null}
                <div className={styles.modalButtons}>
                  <button type="button" className={styles.secondaryButton} onClick={() => startNew(modal.fecha)}>
                    + Agregar actividad este día
                  </button>
                </div>
              </>
            ) : detailActivity ? (
              <>
                <div className={styles.modalHead}>
                  <button type="button" className={styles.backLink} onClick={() => setModal({ kind: 'day', fecha: detailActivity.fecha })}>
                    ‹ Volver al día
                  </button>
                  <button type="button" className={styles.close} onClick={() => setModal(null)} aria-label="Cerrar">
                    ×
                  </button>
                </div>
                <dl className={styles.detail}>
                  {detailRows(detailActivity).map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.modalButtons}>
                  <button type="button" className={styles.primaryButton} onClick={() => startEdit(detailActivity, false)}>
                    Editar
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => startEdit(detailActivity, true)}>
                    Duplicar
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => handleDelete(detailActivity)} disabled={removeActivity.isPending}>
                    Eliminar
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function uniquePicks(picks: CatalogPick[]): CatalogPick[] {
  const seen = new Map<string, CatalogPick>();
  for (const p of picks) {
    const key = p.nombre.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function detailRows(a: WorkPlanActivity): Array<[string, string]> {
  const d = dateOf(a.fecha);
  const isVisit = a.tipo === WORK_PLAN_VISIT_TYPE;
  const rows: Array<[string, string | null]> = [
    ['Fecha', `${DAYS_LONG[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}`],
    ['Hora', h12(a.hora)],
    ['Tipo', a.tipo],
    ...(isVisit
      ? ([
          ['Médico', a.medico_nombre],
          ['Hospital', a.hospital_nombre],
          ['Especialidad', a.especialidad],
          ['Motivo', a.motivo],
        ] as Array<[string, string | null]>)
      : ([
          ['Evento', a.evento_nombre],
          ['Sede', a.sede],
          ['Asistentes', a.asistentes ? String(a.asistentes) : null],
        ] as Array<[string, string | null]>)),
    ['Requerimientos', a.requerimientos.join(', ')],
    ['Notas', a.notas],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}
