import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { EntitySummary } from '../../api/types';
import { useHrSummary } from '../../hooks/useHrSummary';
import { Tile } from './Tile';
import { HrTile } from './HrTile';
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
}

export function TileGrid({ entities, canAccessHr }: TileGridProps) {
  const reduceMotion = usePrefersReducedMotion();
  // enabled: canAccessHr so this gated request never fires (and never 403s) for anyone without it.
  const hrSummaryQuery = useHrSummary(Boolean(canAccessHr));

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
    </motion.div>
  );
}
