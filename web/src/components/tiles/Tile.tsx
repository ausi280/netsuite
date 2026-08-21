import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { EntitySummary } from '../../api/types';
import { formatRelativeTime } from '../../utils/format';
import styles from './Tile.module.css';

const MotionLink = motion.create(Link);

const tileVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  },
};

function monogramFor(label: string): string {
  const letters = label.replace(/[^\p{L}\p{N}]/gu, ' ').trim();
  if (!letters) return '?';
  const words = letters.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface TileProps {
  entity: EntitySummary;
  reduceMotion: boolean;
}

export function Tile({ entity, reduceMotion }: TileProps) {
  const numberFormatter = new Intl.NumberFormat('es-MX');

  return (
    <MotionLink
      to={`/reports/${entity.key}`}
      className={styles.tile}
      variants={reduceMotion ? undefined : tileVariants}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
    >
      <div className={styles.topRow}>
        <span className={styles.monogram} aria-hidden="true">
          {monogramFor(entity.label)}
        </span>
      </div>
      <p className={styles.label}>{entity.label}</p>
      <p className={styles.stat}>{numberFormatter.format(entity.rowCount)}</p>
      <p className={styles.meta}>Última sincronización: {formatRelativeTime(entity.lastSyncedAt)}</p>
    </MotionLink>
  );
}
