import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, since this is the one
// tile that isn't driven by the generic entities API (see HrReportPage.tsx's file-level comment
// for why HR Report has no ReportEntityKey/ENTITY_REGISTRY entry).
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface HrTileProps {
  /** Active headcount from the HR data warehouse, or undefined while still loading. */
  activeCount: number | undefined;
  reduceMotion: boolean;
}

/** Admin-only dashboard tile linking to the HR Report - not part of the generic entities-driven
 * TileGrid, since HR Report has no ReportEntityKey (see HrReportPage.tsx). Visually identical to
 * a regular Tile (same styles module), shown only when the signed-in user is an admin. */
export function HrTile({ activeCount, reduceMotion }: HrTileProps) {
  const numberFormatter = new Intl.NumberFormat('es-MX');

  return (
    <MotionLink
      to="/reports/hr"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          HR
        </span>
      </div>
      <p className={styles.label}>HR Report</p>
      <p className={styles.stat}>{activeCount !== undefined ? numberFormatter.format(activeCount) : '—'}</p>
      <p className={styles.meta}>Colaboradores activos</p>
    </MotionLink>
  );
}
