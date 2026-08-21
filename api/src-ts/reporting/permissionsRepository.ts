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

function parseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export class PermissionsRepository {
  private readonly table = 'report_user_permissions';

  constructor(private readonly db: Knex) {}

  /** Looks up permissions by Entra oid. Returns DENY_ALL (not undefined) when no row exists - deny-by-default is the whole point. */
  async getPermissions(oid: string | null): Promise<UserPermissions> {
    if (!oid) return DENY_ALL;

    const row = await this.db<ReportUserPermissionsRow>(this.table).where({ oid }).first();
    if (!row) return DENY_ALL;

    return {
      isAdmin: Boolean(row.is_admin),
      allowedEntities: new Set(parseStringArray(row.allowed_entities) as ReportEntityKey[]),
      allowedSubsidiaries: new Set(parseStringArray(row.allowed_subsidiaries)),
    };
  }
}
