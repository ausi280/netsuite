import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { UnauthorizedError } from 'express-jwt';
import { buildEntraAuthMiddleware } from './auth/entraAuth';
import { buildPermissionsMiddleware } from './auth/permissionsMiddleware';
import { exportEntityRows, getEntityRowDetail, getPartidaAnalytics, listEntitySummaries, listEntityRows, listSubsidiaryOptions } from './controller';
import { listUsers, updateUserPermissions } from './adminController';
import {
  getCommissionsExportRoute,
  getCommissionsPdfRoute,
  getCommissionsReportRoute,
  getContractDossierRoute,
  getContractNetSuiteNotesRoute,
  getContractNotasRoute,
} from './contractReportsController';
import { listVendedorOptionsRoute, updateContractRoute } from './contractEditController';
import {
  deleteCommissionTierRoute,
  listCommissionTiersRoute,
  listEmployeeLevelsRoute,
  updateEmployeeLevelRoute,
  upsertCommissionTierRoute,
} from './commissionLevelsController';
import { chargeDomiciledRoute } from './paymentsChargeController';
import { getHrAnalyticsRoute, getHrSummaryRoute } from './hrController';
import { exportProspectosRoute, listProspectosRoute } from './prospectosController';
import { exportCuentasRoute, listCuentasRoute } from './cuentasController';

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
  // Must be registered before /:entity/:id, or that route would swallow "commissions"/"vendedores" as an id value.
  router.get('/contracts/commissions', getCommissionsReportRoute);
  router.get('/contracts/commissions/export', getCommissionsExportRoute);
  router.get('/contracts/commissions/pdf', getCommissionsPdfRoute);
  router.get('/contracts/vendedores', listVendedorOptionsRoute);
  router.get('/contracts/:id/dossier', getContractDossierRoute);
  router.get('/contracts/:id/notas', getContractNotasRoute);
  router.get('/contracts/:id/netsuite-notes', getContractNetSuiteNotesRoute);
  // PATCH on a distinct HTTP method from every GET route above, so no ordering concern here -
  // edits custrecord_cryo_contratosistemaanterior and/or custrecord_cryo_vendedor and pushes them
  // to NetSuite (see contractEditController.ts).
  router.patch('/contracts/:id', updateContractRoute);
  // Must be registered before /:entity/:id, or that route would swallow "charge-domiciled" as an id value.
  router.post('/payments/charge-domiciled', chargeDomiciledRoute);
  // Must be registered before /:entity/:id, or that route would swallow "commission-levels" as an id value.
  router.get('/commission-levels/employees', listEmployeeLevelsRoute);
  router.patch('/commission-levels/employees/:id', updateEmployeeLevelRoute);
  router.get('/commission-levels/tiers', listCommissionTiersRoute);
  router.post('/commission-levels/tiers', upsertCommissionTierRoute);
  router.delete('/commission-levels/tiers/:id', deleteCommissionTierRoute);
  // HR Report is a bespoke, admin-only, cross-database feature (Peopleforce/Sesame HR data
  // warehouse) - not part of the generic entity registry, so these must be registered before
  // /:entity/analytics, or that route would swallow "hr" as an entity key and 404 (it isn't a
  // registered ReportEntityKey).
  router.get('/hr/summary', getHrSummaryRoute);
  router.get('/hr/analytics', getHrAnalyticsRoute);
  // Prospectos (legacy Cryo.dbo CRM lead funnel) is likewise bespoke, not a generic ENTITY_REGISTRY
  // entity - must be registered before /:entity/export, or that route would swallow "prospectos" as
  // an entity key and 404 (it isn't a registered ReportEntityKey).
  router.get('/prospectos', listProspectosRoute);
  router.get('/prospectos/export', exportProspectosRoute);
  // Cuentas (per-contract account/collections detail, reached from the Partidas report) is
  // likewise bespoke, not a generic ENTITY_REGISTRY entity - must be registered before
  // /:entity/export, or that route would swallow "cuentas" as an entity key and 404.
  router.get('/cuentas', listCuentasRoute);
  router.get('/cuentas/export', exportCuentasRoute);
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
