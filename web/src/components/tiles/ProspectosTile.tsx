import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

// Same shape as Tile.tsx's tileVariants - duplicated rather than shared, same convention as
// HrTile.tsx/CommissionsTile.tsx, since this tile isn't driven by the generic entities API either.
const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

interface ProspectosTileProps {
  reduceMotion: boolean;
}

/** Dashboard tile linking to the Prospectos (CRM lead-funnel) report - not part of the generic
 * entities-driven TileGrid, since Prospectos pulls from the legacy Cryo.dbo database and has no
 * ReportEntityKey/ENTITY_REGISTRY entry (see ProspectosPage.tsx). Shown only when the signed-in
 * user is granted 'prospectos' (or is an admin) - see EntitiesResult.canAccessProspectos. */
export function ProspectosTile({ reduceMotion }: ProspectosTileProps) {
  return (
    <MotionLink
      to="/reports/prospectos"
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          PR
        </span>
      </div>
      <p className={styles.label}>Prospectos</p>
      <p className={styles.meta}>Embudo de prospectos capturados</p>
    </MotionLink>
  );
}
