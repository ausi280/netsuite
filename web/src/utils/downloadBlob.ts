/** Triggers a browser "Save As" for an already-fetched Blob - used for authenticated file
 * downloads (a plain <a href> can't carry an Authorization header, so the file has to be
 * fetched first and handed to the browser as an object URL). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
