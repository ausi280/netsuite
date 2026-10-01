import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// HrTile.tsx/ProspectosTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface LogisticaTileProps {
  reduceMotion: boolean;
}

/** Dashboard tile linking to the Logística ticket form - shown to every signed-in user (no
 * allowedEntities gate, unlike HR/Prospectos/Commissions), since every internal user is expected
 * to be able to file a logistics request. */
export function LogisticaTile({ reduceMotion }: LogisticaTileProps) {
  return (
    <MotionLink
      to="/reports/logistica"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          LG
        </span>
      </div>
      <p className={styles.label}>Logística</p>
      <p className={styles.meta}>Recolección, kits, envíos y guías</p>
    </MotionLink>
  );
}
