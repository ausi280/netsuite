import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { EntitySummary } from '../../api/types';
import { useHrSummary } from '../../hooks/useHrSummary';
import { Tile } from './Tile';
import { HrTile } from './HrTile';
import { CommissionsTile } from './CommissionsTile';
import { ProspectosTile } from './ProspectosTile';
import styles from './TileGrid.module.css';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 },
  },
};

function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(query.matches);

    function handleChange(event: MediaQueryListEvent) {
      setPrefersReduced(event.matches);
    }

    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return prefersReduced;
}

interface TileGridProps {
  entities: EntitySummary[];
  /** Shows the HR Report tile alongside the regular entity tiles for anyone granted 'hr' (or an
   * admin) - HR Report has no ReportEntityKey/ENTITY_REGISTRY entry (see HrReportPage.tsx), so it
   * can't come back from the entities API like every other tile does. */
  canAccessHr?: boolean;
  /** Shows a dedicated "Mis comisiones" tile for a "self-vendedor" caller - someone with no
   * 'contracts' grant (so no Contracts tile of their own to find "Ver comisiones" inside) who can
   * still reach their own commissions (see EntitiesResult.canAccessCommissions). Anyone who
   * already has 'contracts' reaches commissions from within that entity's page instead, so this
   * tile is skipped whenever 'contracts' is already in `entities`. */
  canAccessCommissions?: boolean;
  /** Shows the Prospectos tile for anyone granted 'prospectos' (or an admin) - Prospectos pulls
   * from the legacy Cryo.dbo database and has no ReportEntityKey/ENTITY_REGISTRY entry (see
   * ProspectosPage.tsx), so it can't come back from the entities API like every other tile does. */
  canAccessProspectos?: boolean;
}

export function TileGrid({ entities, canAccessHr, canAccessCommissions, canAccessProspectos }: TileGridProps) {
  const reduceMotion = usePrefersReducedMotion();
  // enabled: canAccessHr so this gated request never fires (and never 403s) for anyone without it.
  const hrSummaryQuery = useHrSummary(Boolean(canAccessHr));
  const showCommissionsTile = Boolean(canAccessCommissions) && !entities.some((entity) => entity.key === 'contracts');

  return (
    <motion.div
      className={styles.grid}
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? undefined : 'hidden'}
      animate={reduceMotion ? undefined : 'visible'}
    >
      {entities.map((entity) => (
        <Tile key={entity.key} entity={entity} reduceMotion={reduceMotion} />
      ))}
      {canAccessHr ? <HrTile activeCount={hrSummaryQuery.data?.active} reduceMotion={reduceMotion} /> : null}
      {showCommissionsTile ? <CommissionsTile reduceMotion={reduceMotion} /> : null}
      {canAccessProspectos ? <ProspectosTile reduceMotion={reduceMotion} /> : null}
    </motion.div>
  );
}
