import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// PostventaTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface AdministracionTileProps {
  reduceMotion: boolean;
}

/** Dashboard entry point into the Reporte Administración (see AdministracionReportPage.tsx and
 * EntitiesResult.canAccessAdministracion). */
export function AdministracionTile({ reduceMotion }: AdministracionTileProps) {
  return (
    <MotionLink
      to="/reports/administracion"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          AD
        </span>
      </div>
      <p className={styles.label}>Reporte Administración</p>
      <p className={styles.meta}>Almacenamiento y abandonos por marca</p>
    </MotionLink>
  );
}
