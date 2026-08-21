/**
 * Human-readable labels for known NetSuite subsidiary internal ids. NetSuite's `subsidiary`
 * record isn't directly queryable via SuiteQL in this account (confirmed during the sync
 * engine work), so no display-name table is synced anywhere - these come from the hardcoded
 * VALID_COMBINATIONS list in NSO_cntrts_gen_ue.js (the same script reviewed during the
 * "record has changed" investigation). Any id not in this map falls back to showing the raw
 * id, since our data genuinely has no name for it.
 */
const SUBSIDIARY_LABELS: Record<string, string> = {
  '20': 'Biocordcell Argentina',
  '7': 'Células de Cordón Umbilical',
  '5': 'Cryo-Cell de México',
  '8': 'Operadora BSCU',
  '24': 'Instituto de Criopreservación y Terapia Celular',
  '25': 'Lazo de Vida',
};

export function subsidiaryLabel(id: string): string {
  return SUBSIDIARY_LABELS[id] ?? `Subsidiaria ${id}`;
}
