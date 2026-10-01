import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useMsal } from '@azure/msal-react';
import { AppShell } from '../components/layout/AppShell';
import { MARCAS, MARCA_TIPOS, SUBFORMS, resolveSubformKey } from '../config/logisticaTickets';
import type { CampoConfig, Marca } from '../config/logisticaTickets';
import { useSubmitLogisticaTicket } from '../hooks/useLogisticaTicket';
import styles from './LogisticaTicketPage.module.css';

function isFieldVisible(field: CampoConfig, campos: Record<string, string>): boolean {
  if (!field.dependsOn) return true;
  return campos[field.dependsOn.field] === field.dependsOn.value;
}

export function LogisticaTicketPage() {
  const { accounts } = useMsal();
  const account = accounts[0];

  const [marca, setMarca] = useState<Marca | ''>('');
  const [tipoSolicitud, setTipoSolicitud] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [comentarios, setComentarios] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const mutation = useSubmitLogisticaTicket();

  const tipos = marca ? MARCA_TIPOS[marca] : [];
  const subformKey = marca && tipoSolicitud ? resolveSubformKey(marca, tipoSolicitud) : null;
  const subform = subformKey ? SUBFORMS[subformKey] : null;
  const visibleFields = subform ? subform.fields.filter((field) => isFieldVisible(field, campos)) : [];

  function handleMarcaChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value as Marca | '';
    setMarca(value);
    setTipoSolicitud('');
    setCampos({});
  }

  function handleTipoChange(event: ChangeEvent<HTMLSelectElement>) {
    setTipoSolicitud(event.target.value);
    setCampos({});
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

            {visibleFields.map((field) => (
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
            ))}

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
