import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// HrTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface CommissionsTileProps {
  reduceMotion: boolean;
}

/**
 * Dashboard entry point into the commissions report for a "self-vendedor" - someone with no
 * 'contracts' entity grant (so no Contracts tile, and no "Ver comisiones" link inside it) whose
 * Entra email matches a netsuite_employees row that has sold something as vendedor. They're
 * scoped server-side to their own commissions only - see EntitiesResult.canAccessCommissions.
 */
export function CommissionsTile({ reduceMotion }: CommissionsTileProps) {
  return (
    <MotionLink
      to="/reports/contracts/commissions"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          $
        </span>
      </div>
      <p className={styles.label}>Mis comisiones</p>
      <p className={styles.meta}>Contratos nuevos donde eres el vendedor</p>
    </MotionLink>
  );
}
