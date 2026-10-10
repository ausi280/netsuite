import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// CommissionsTile.tsx/HrTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface CobranzaCommissionsTileProps {
  reduceMotion: boolean;
}

/**
 * Dashboard entry point into the cobranza commissions report for a "self cobrador/dueño" - someone
 * with no 'partidas' entity grant (so no Partidas tile, and no "Ver comisiones de cobranza" link
 * inside it) whose Entra email matches a netsuite_employees row that's the resolved Dueño or
 * Cobrador on at least one invoice/contract. Per explicit instruction they see the full report for
 * every cobrador/dueño, not narrowed down to just their own assignments - scoped server-side only to
 * the subsidiaria(s) where they themselves have contracts - see
 * EntitiesResult.canAccessCobranzaCommissions and cobranzaCommissionsController.ts's
 * loadCobranzaCommissionsData. Mirrors CommissionsTile.tsx's equivalent self-vendedor entry point.
 */
export function CobranzaCommissionsTile({ reduceMotion }: CobranzaCommissionsTileProps) {
  return (
    <MotionLink
      to="/reports/cobranza-comisiones"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          CC
        </span>
      </div>
      <p className={styles.label}>Comisiones de Cobranza</p>
      <p className={styles.meta}>Cobranza de tu subsidiaria</p>
    </MotionLink>
  );
}
