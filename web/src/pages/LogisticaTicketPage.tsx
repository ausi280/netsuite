import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useMsal } from '@azure/msal-react';
import { AppShell } from '../components/layout/AppShell';
import { MARCAS, MARCA_TIPOS, SUBFORMS, resolveSubformKey } from '../config/logisticaTickets';
import type { CampoConfig, Marca } from '../config/logisticaTickets';
import { DIRECCIONES_CONOCIDAS, DIRECCION_GRUPOS, direccionKey } from '../config/logisticaDirecciones';
import { useSubmitLogisticaTicket } from '../hooks/useLogisticaTicket';
import styles from './LogisticaTicketPage.module.css';

function isFieldVisible(field: CampoConfig, campos: Record<string, string>): boolean {
  if (!field.dependsOn) return true;
  return campos[field.dependsOn.field] === field.dependsOn.value;
}

type ShipSection = 'remitente' | 'destinatario';

export function LogisticaTicketPage() {
  const { accounts } = useMsal();
  const account = accounts[0];

  const [marca, setMarca] = useState<Marca | ''>('');
  const [tipoSolicitud, setTipoSolicitud] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [comentarios, setComentarios] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // Known address ("Grupo / Sede") picked per card - '' = typed by hand. Sent as <section>_sede.
  const [sedes, setSedes] = useState<Record<ShipSection, string>>({ remitente: '', destinatario: '' });

  const mutation = useSubmitLogisticaTicket();

  const tipos = marca ? MARCA_TIPOS[marca] : [];
  const subformKey = marca && tipoSolicitud ? resolveSubformKey(marca, tipoSolicitud) : null;
  const subform = subformKey ? SUBFORMS[subformKey] : null;
  const visibleFields = subform ? subform.fields.filter((field) => isFieldVisible(field, campos)) : [];
  const remitenteFields = visibleFields.filter((field) => field.section === 'remitente');
  const destinatarioFields = visibleFields.filter((field) => field.section === 'destinatario');
  const paqueteFields = visibleFields.filter((field) => field.section === 'paquete');

  function renderField(field: CampoConfig) {
    return (
      <div className={styles.field} key={field.name}>
        <label className={styles.label} htmlFor={field.name}>
          {field.label}
        </label>
        {field.type === 'textarea' ? (
          <textarea
            id={field.name}
            className={styles.textarea}
            rows={3}
            required={field.required}
            value={campos[field.name] ?? ''}
            onChange={(e) => handleCampoChange(field.name, e.target.value)}
          />
        ) : field.type === 'select' ? (
          <select
            id={field.name}
            className={styles.select}
            required={field.required}
            value={campos[field.name] ?? ''}
            onChange={(e) => handleCampoChange(field.name, e.target.value)}
          >
            <option value="">Seleccione...</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={field.name}
            className={styles.input}
            type={field.type}
            required={field.required}
            value={campos[field.name] ?? ''}
            onChange={(e) => handleCampoChange(field.name, e.target.value)}
          />
        )}
      </div>
    );
  }

  function handleMarcaChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value as Marca | '';
    setMarca(value);
    setTipoSolicitud('');
    setCampos({});
    setSedes({ remitente: '', destinatario: '' });
  }

  function handleTipoChange(event: ChangeEvent<HTMLSelectElement>) {
    setTipoSolicitud(event.target.value);
    setCampos({});
    setSedes({ remitente: '', destinatario: '' });
  }

  /** Picking a known address fills that card's contact fields (left editable); fields the sheet
   * has no value for are cleared rather than keeping a previous sede's data. "Escribir manualmente"
   * leaves whatever is typed as-is. */
  function handleSedeChange(section: ShipSection, key: string) {
    setSedes((prev) => ({ ...prev, [section]: key }));
    const direccion = DIRECCIONES_CONOCIDAS.find((d) => direccionKey(d) === key);
    if (!direccion) return;
    setCampos((prev) => ({
      ...prev,
      [`${section}_nombre`]: direccion.contacto ?? `${direccion.grupo} ${direccion.sede}`,
      [`${section}_telefono`]: direccion.telefono ?? '',
      [`${section}_correo`]: direccion.correo ?? '',
      [`${section}_domicilio`]: direccion.direccion,
    }));
  }

  function renderSedePicker(section: ShipSection) {
    const id = `${section}_sede`;
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          Dirección conocida (Grupo / Sede)
        </label>
        <select id={id} className={styles.select} value={sedes[section]} onChange={(e) => handleSedeChange(section, e.target.value)}>
          <option value="">Escribir manualmente</option>
          {DIRECCION_GRUPOS.map((grupo) => (
            <optgroup key={grupo} label={grupo}>
              {DIRECCIONES_CONOCIDAS.filter((d) => d.grupo === grupo).map((d) => (
                <option key={direccionKey(d)} value={direccionKey(d)}>
                  {direccionKey(d)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    );
  }

  function handleCampoChange(name: string, value: string) {
    setCampos((prev) => ({ ...prev, [name]: value }));
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files ? Array.from(event.target.files) : []);
  }

  function resetForm() {
    setMarca('');
    setTipoSolicitud('');
    setCampos({});
    setSedes({ remitente: '', destinatario: '' });
    setComentarios('');
    setFiles([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!marca || !tipoSolicitud) return;

    // Only the fields the requester actually sees for this marca/tipo - conditional fields (like
    // Medidas y peso when "¿Qué envías?" isn't "Caja") are excluded entirely rather than sent
    // empty/stale, same guarantee the standalone prototype's disabled-input trick gave.
    const visibleCampos: Record<string, string> = {};
    for (const field of visibleFields) {
      if (campos[field.name]) visibleCampos[field.name] = campos[field.name];
    }
    // Which known address each card came from, so the ticket shows "Sede: Ingenes / Toluca".
    if (remitenteFields.length > 0 && sedes.remitente) visibleCampos.remitente_sede = sedes.remitente;
    if (destinatarioFields.length > 0 && sedes.destinatario) visibleCampos.destinatario_sede = sedes.destinatario;

    const formData = new FormData();
    formData.append('marca', marca);
    formData.append('tipoSolicitud', tipoSolicitud);
    formData.append('campos', JSON.stringify(visibleCampos));
    formData.append('comentarios', comentarios);
    files.forEach((file) => formData.append('attachment', file));

    mutation.mutate(formData, { onSuccess: resetForm });
  }

  return (
    <AppShell breadcrumbs={[{ label: 'Reportes', to: '/' }, { label: 'Logística' }]}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Logística</h1>
        <p className={styles.subtitle}>Solicitudes de recolección, kits, envíos y guías.</p>
      </div>

      {account ? (
        <p className={styles.requesterNote}>
          Solicitando como <strong>{account.name || account.username}</strong> ({account.username})
        </p>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="marca">
            Marca
          </label>
          <select id="marca" className={styles.select} value={marca} onChange={handleMarcaChange} required>
            <option value="">Seleccione una opción...</option>
            {MARCAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="tipoSolicitud">
            Tipo de solicitud
          </label>
          <select id="tipoSolicitud" className={styles.select} value={tipoSolicitud} onChange={handleTipoChange} required disabled={!marca}>
            <option value="">{marca ? 'Seleccione una opción...' : 'Seleccione primero una marca...'}</option>
            {tipos.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </div>

        {subform ? (
          <div className={styles.subform}>
            <h2 className={styles.subformTitle}>{subform.title}</h2>

            {visibleFields.filter((field) => !field.section).map(renderField)}

            {remitenteFields.length > 0 || destinatarioFields.length > 0 ? (
              <div className={styles.shipGrid}>
                <fieldset className={styles.sectionCard}>
                  <legend className={styles.sectionTitle}>Remitente</legend>
                  {renderSedePicker('remitente')}
                  {remitenteFields.map(renderField)}
                </fieldset>
                <fieldset className={styles.sectionCard}>
                  <legend className={styles.sectionTitle}>Destinatario</legend>
                  {renderSedePicker('destinatario')}
                  {destinatarioFields.map(renderField)}
                </fieldset>
              </div>
            ) : null}

            {paqueteFields.length > 0 ? (
              <fieldset className={styles.sectionCard}>
                <legend className={styles.sectionTitle}>Paquete</legend>
                {paqueteFields.map(renderField)}
              </fieldset>
            ) : null}

            {subform.note ? <p className={styles.hint}>{subform.note}</p> : null}
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="comentarios">
            Comentarios adicionales (opcional)
          </label>
          <textarea
            id="comentarios"
            className={styles.textarea}
            rows={3}
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="attachment">
            Adjuntos
          </label>
          <div className={styles.fileBox}>
            <input
              id="attachment"
              className={styles.fileInput}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              onChange={handleFilesChange}
            />
            <p className={styles.hint}>Puedes seleccionar uno o varios archivos.</p>
            {files.map((file) => (
              <div className={styles.fileRow} key={file.name}>
                {file.name} <small>({Math.round(file.size / 1024)} KB)</small>
              </div>
            ))}
          </div>
        </div>

        {mutation.isSuccess ? <p className={styles.successBanner}>{mutation.data.message}</p> : null}
        {mutation.isError ? (
          <p className={styles.errorBanner}>{mutation.error instanceof Error ? mutation.error.message : 'No se pudo enviar la solicitud.'}</p>
        ) : null}

        <div className={styles.submitRow}>
          <button type="submit" className={styles.submitButton} disabled={mutation.isPending}>
            {mutation.isPending ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
