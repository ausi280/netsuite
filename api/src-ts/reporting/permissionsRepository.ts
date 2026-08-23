import type { Knex } from 'knex';
import type { ReportEntityKey } from './types';

export interface ReportUserPermissionsRow {
  id: number;
  oid: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  allowed_entities: string;
  allowed_subsidiaries: string;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Shape returned by the admin "list users" endpoint - human-facing, arrays not sets. */
export interface ReportUserSummary {
  oid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  allowedEntities: string[];
  allowedSubsidiaries: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissionUpdate {
  isAdmin: boolean;
  allowedEntities: string[];
  allowedSubsidiaries: string[];
}

/** Resolved, ready-to-use permission set for one request - never exposes the raw JSON columns. */
export interface UserPermissions {
  isAdmin: boolean;
  allowedEntities: Set<ReportEntityKey>;
  allowedSubsidiaries: Set<string>;
}

/** Denies everything - the correct result for both "no row for this oid" and any parse failure. */
const DENY_ALL: UserPermissions = {
  isAdmin: false,
  allowedEntities: new Set(),
  allowedSubsidiaries: new Set(),
};

// SQL Server's unique-constraint-violation error number (report_user_permissions.oid is UNIQUE) -
// used to swallow the harmless race where two of a brand-new user's first requests both try to
// insert their row at once.
const SQL_SERVER_UNIQUE_VIOLATION = 2627;

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toPermissions(row: ReportUserPermissionsRow): UserPermissions {
  return {
    isAdmin: Boolean(row.is_admin),
    allowedEntities: new Set(parseStringArray(row.allowed_entities) as ReportEntityKey[]),
    allowedSubsidiaries: new Set(parseStringArray(row.allowed_subsidiaries)),
  };
}

export class PermissionsRepository {
  private readonly table = 'report_user_permissions';

  constructor(private readonly db: Knex) {}

  /** Looks up permissions by Entra oid. Returns DENY_ALL (not undefined) when no row exists - deny-by-default is the whole point. */
  async getPermissions(oid: string | null): Promise<UserPermissions> {
    if (!oid) return DENY_ALL;

    const row = await this.db<ReportUserPermissionsRow>(this.table).where({ oid }).first();
    return row ? toPermissions(row) : DENY_ALL;
  }

  /**
   * Resolves permissions for a signed-in user, auto-provisioning a deny-by-default row (email +
   * display name captured for the admin to recognize them by) the first time this oid is ever
   * seen. Lets "who's trying to get in" be answered by looking at the table, instead of the
   * admin having to go hunt down someone's Object ID before they can grant access.
   */
  async resolvePermissions(oid: string | null, email: string | null, displayName: string | null): Promise<UserPermissions> {
    if (!oid) return DENY_ALL;

    const existing = await this.db<ReportUserPermissionsRow>(this.table).where({ oid }).first();
    if (existing) return toPermissions(existing);

    try {
      await this.db(this.table).insert({
        oid,
        email,
        display_name: displayName,
        is_admin: false,
        allowed_entities: '[]',
        allowed_subsidiaries: '[]',
      });
    } catch (error) {
      // Another concurrent request for this same brand-new user already inserted the row -
      // harmless, fall through to DENY_ALL below exactly as if we'd found it first.
      if ((error as { number?: number }).number !== SQL_SERVER_UNIQUE_VIOLATION) {
        throw error;
      }
    }

    return DENY_ALL;
  }

  /** Every registered user (anyone who has ever logged in), for the admin "manage users" screen. */
  async listUsers(): Promise<ReportUserSummary[]> {
    const rows = await this.db<ReportUserPermissionsRow>(this.table).orderBy('email');

    return rows.map((row) => ({
      oid: row.oid,
      email: row.email,
      displayName: row.display_name,
      isAdmin: Boolean(row.is_admin),
      allowedEntities: parseStringArray(row.allowed_entities),
      allowedSubsidiaries: parseStringArray(row.allowed_subsidiaries),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  /** Returns false if no row exists for this oid (caller should 404), true once the update lands. */
  async updateUserPermissions(oid: string, update: UserPermissionUpdate): Promise<boolean> {
    const affected = await this.db(this.table)
      .where({ oid })
      .update({
        is_admin: update.isAdmin,
        allowed_entities: JSON.stringify(update.allowedEntities),
        allowed_subsidiaries: JSON.stringify(update.allowedSubsidiaries),
        updated_at: new Date(),
      });
    return affected > 0;
  }
}
