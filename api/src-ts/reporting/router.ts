import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { UnauthorizedError } from 'express-jwt';
import { buildEntraAuthMiddleware } from './auth/entraAuth';
import { buildPermissionsMiddleware } from './auth/permissionsMiddleware';
import { exportEntityRows, getEntityRowDetail, getPartidaAnalytics, listEntitySummaries, listEntityRows, listSubsidiaryOptions } from './controller';
import { listUsers, updateUserPermissions } from './adminController';
import { getCommissionsReportRoute, getContractDossierRoute, getContractNotasRoute } from './contractReportsController';
import { chargeDomiciledRoute } from './paymentsChargeController';

/**
 * Assembles the read-only reporting API router: Entra ID access-token auth
 * on every route, the endpoints described in the reporting API contract
 * (entity summaries, subsidiary filter options, paged rows, single-row detail),
 * and a JSON-error translator for express-jwt's UnauthorizedError so callers
 * always get `{ success: false, message }` instead of express-jwt's default
 * HTML error page.
 *
 * Building this (via buildEntraAuthMiddleware -> getAzureAdConfig) throws if
 * AZURE_AD.TENANT_ID/CLIENT_ID aren't configured yet; server.js wraps the
 * call to this function in a try/catch so that's non-fatal to the rest of
 * the app.
 */
export function buildReportingRouter(): Router {
  const router = Router();

  router.use(buildEntraAuthMiddleware());
  // Runs after auth so req.auditUser.oid is available; loads req.permissions (deny-all if the
  // signed-in user has no report_user_permissions row) for the route handlers below to enforce.
  router.use(buildPermissionsMiddleware());

  router.get('/entities', listEntitySummaries);
  // Must be registered before /:entity/:id, or that route would swallow "admin" as an entity key
  // and "users" as an id value.
  router.get('/admin/users', listUsers);
  router.patch('/admin/users/:oid', updateUserPermissions);
  // Must be registered before /:entity/:id, or that route would swallow "commissions" as an id value.
  router.get('/contracts/commissions', getCommissionsReportRoute);
  router.get('/contracts/:id/dossier', getContractDossierRoute);
  router.get('/contracts/:id/notas', getContractNotasRoute);
  // Must be registered before /:entity/:id, or that route would swallow "charge-domiciled" as an id value.
  router.post('/payments/charge-domiciled', chargeDomiciledRoute);
  // Must be registered before /:entity/:id, or that route would swallow "subsidiaries"/"analytics"/"export" as an id value.
  router.get('/:entity/subsidiaries', listSubsidiaryOptions);
  router.get('/:entity/analytics', getPartidaAnalytics);
  router.get('/:entity/export', exportEntityRows);
  router.get('/:entity/:id', getEntityRowDetail);
  router.get('/:entity', listEntityRows);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message || 'Invalid or missing access token.' });
      return;
    }
    next(err);
  });

  return router;
}
