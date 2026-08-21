import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { EntitySummary } from '../../api/types';
import { Tile } from './Tile';
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
}

export function TileGrid({ entities }: TileGridProps) {
  const reduceMotion = usePrefersReducedMotion();

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
    </motion.div>
  );
}
