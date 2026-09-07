import type { Knex } from 'knex';

/** The tiered commission-rate table each nivel (A/B/C/...) resolves against - purely app-owned
 * config, edited by an admin, not synced NetSuite data. */

const TABLE = 'commission_level_tiers';

export interface CommissionLevelTierRow {
  id: number;
  nivel: string;
  min_amount: number;
  percentage: number;
}

/** All tiers across every nivel, ordered so each nivel's own tiers are ascending by threshold. */
export async function getAllLevelTiers(db: Knex): Promise<CommissionLevelTierRow[]> {
  const rows = await db<CommissionLevelTierRow>(TABLE).select('id', 'nivel', 'min_amount', 'percentage').orderBy('nivel').orderBy('min_amount');
  return rows.map((row) => ({ ...row, min_amount: Number(row.min_amount), percentage: Number(row.percentage) }));
}

export interface UpsertTierInput {
  /** Omit to insert a new tier; provide to edit an existing one. */
  id?: number;
  nivel: string;
  min_amount: number;
  percentage: number;
}

export async function upsertLevelTier(db: Knex, input: UpsertTierInput): Promise<void> {
  if (input.id) {
    await db(TABLE).where({ id: input.id }).update({
      nivel: input.nivel,
      min_amount: input.min_amount,
      percentage: input.percentage,
      updated_at: new Date(),
    });
  } else {
    await db(TABLE).insert({ nivel: input.nivel, min_amount: input.min_amount, percentage: input.percentage });
  }
}

export async function deleteLevelTier(db: Knex, id: number): Promise<void> {
  await db(TABLE).where({ id }).delete();
}

/**
 * The applicable rate is the highest-threshold tier for this nivel whose min_amount is <= amount
 * (i.e. the last one an ascending walk hasn't stepped past yet) - null if the nivel has no tiers
 * at all, or amount falls below every tier's min_amount (no 0-and-up tier configured).
 */
export function resolveCommissionPercentage(tiers: CommissionLevelTierRow[], nivel: string | null, amount: number | null): number | null {
  if (!nivel || amount === null) return null;

  let matched: CommissionLevelTierRow | null = null;
  for (const tier of tiers) {
    if (tier.nivel !== nivel) continue;
    if (tier.min_amount > amount) continue;
    if (!matched || tier.min_amount > matched.min_amount) {
      matched = tier;
    }
  }
  return matched ? matched.percentage : null;
}
