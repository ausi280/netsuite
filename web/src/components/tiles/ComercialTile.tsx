import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// ProspectosTile.tsx/HrTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface ComercialTileProps {
  reduceMotion: boolean;
}

/** Dashboard tile linking to the Comercial report (tareas-per-prospecto distribution) - not part
 * of the generic entities-driven TileGrid, since it pulls from the legacy Cryo.dbo database and
 * has no ReportEntityKey/ENTITY_REGISTRY entry (see ComercialReportPage.tsx). Shown only when the
 * signed-in user is granted 'prospectos' (or is an admin) - same gate as Prospectos/Marketing,
 * since this is built on the exact same underlying data. */
export function ComercialTile({ reduceMotion }: ComercialTileProps) {
  return (
    <MotionLink
      to="/reports/comercial"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          CO
        </span>
      </div>
      <p className={styles.label}>Comercial</p>
      <p className={styles.meta}>Tareas por prospecto, global y por vendedor</p>
    </MotionLink>
  );
}
