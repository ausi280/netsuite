import type { NextFunction, Request, RequestHandler, Response } from 'express';
import knex from '../../db/connection';
import { PermissionsRepository } from '../permissionsRepository';
import type { UserPermissions } from '../permissionsRepository';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set after buildEntraAuthMiddleware + this middleware both run. Deny-all when the signed-in user has no row in report_user_permissions. */
    permissions?: UserPermissions;
  }
}

/**
 * Loads the signed-in user's permissions (by req.auditUser.oid, set by buildEntraAuthMiddleware
 * which must run first) and attaches them to req.permissions. Never itself blocks a request -
 * enforcement happens per-route in controller.ts, since /entities and /:entity/subsidiaries need
 * to return a *filtered* 200 rather than an outright 403.
 */
export function buildPermissionsMiddleware(): RequestHandler {
  const permissionsRepository = new PermissionsRepository(knex);

  return (req: Request, _res: Response, next: NextFunction) => {
    permissionsRepository
      .getPermissions(req.auditUser?.oid ?? null)
      .then((permissions) => {
        req.permissions = permissions;
        next();
      })
      .catch(next);
  };
}
