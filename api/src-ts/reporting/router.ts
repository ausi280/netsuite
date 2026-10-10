import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { UnauthorizedError } from 'express-jwt';
import { MulterError } from 'multer';
import { buildEntraAuthMiddleware } from './auth/entraAuth';
import { buildPermissionsMiddleware } from './auth/permissionsMiddleware';
import { exportEntityRows, getEntityRowDetail, getPartidaAnalytics, listEntitySummaries, listEntityRows, listSubsidiaryOptions } from './controller';
import { listUsers, updateUserPermissions } from './adminController';
import {
  getCommissionsExportRoute,
  getCommissionsPdfRoute,
  getCommissionsReportRoute,
  getContractDossierRoute,
  getEstadoCuentaPdfRoute,
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
import { createLogisticaTicketRoute, logisticaUpload } from './logisticaTicketController';
import { exportProspectosRoute, listProspectosRoute } from './prospectosController';
import { getMarketingReportRoute } from './marketingController';
import { getComercialReportRoute } from './comercialController';
import {
  exportTareasVencidasRoute,
  getTareasVencidasByMonthRoute,
  listTareaVencidaVendedoresRoute,
  listTareasVencidasRoute,
} from './tareasVencidasController';
import { exportCuentasRoute, listCuentasRoute } from './cuentasController';
import { exportCobranzaCommissionsRoute, getCobranzaCommissionsRoute } from './cobranzaCommissionsController';
import { exportNotesReportRoute, listNotesReportRoute } from './notesReportController';
import { exportContratosReportRoute, listContratosReportRoute } from './contratosReportController';
import {
  exportPostventaRoute,
  getPostventaByAsuntoRoute,
  getPostventaByMonthRoute,
  getPostventaResueltosByMonthRoute,
  getPostventaSummaryRoute,
  listPostventaOwnersRoute,
  listPostventaTicketsRoute,
} from './postventaController';
import { getZammadTicketsByMonthRoute } from './zammadTicketsAnalyticsController';
import {
  exportReembolsosRoute,
  getReembolsosByCausaRoute,
  getReembolsosByMonthRoute,
  getReembolsosCerradosByMonthRoute,
  listReembolsoEmpresasRoute,
  listReembolsosRoute,
} from './reembolsosController';

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
  router.get('/contracts/:id/estado-cuenta', getEstadoCuentaPdfRoute);
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
  // Logística ticket form (Zammad) - open to any signed-in user, no allowedEntities gate. Must be
  // registered before /:entity/export, or that route would swallow "logistica" as an entity key.
  router.post('/logistica/ticket', logisticaUpload.array('attachment', 10), createLogisticaTicketRoute);
  // Prospectos (legacy Cryo.dbo CRM lead funnel) is likewise bespoke, not a generic ENTITY_REGISTRY
  // entity - must be registered before /:entity/export, or that route would swallow "prospectos" as
  // an entity key and 404 (it isn't a registered ReportEntityKey).
  router.get('/prospectos', listProspectosRoute);
  router.get('/prospectos/export', exportProspectosRoute);
  // Reporte de Marketing (sales-by-month online/offline split + prospecto qualification funnel,
  // built on the same Prospecto data as /prospectos) - likewise bespoke, must be registered before
  // /:entity/export, or that route would swallow "marketing" as an entity key and 404.
  router.get('/marketing', getMarketingReportRoute);
  // Comercial (tareas-per-prospecto distribution, global and per vendedor) - built on the same
  // Prospecto data as /prospectos - likewise bespoke, must be registered before /:entity/export,
  // or that route would swallow "comercial" as an entity key and 404.
  router.get('/comercial', getComercialReportRoute);
  // Tareas Vencidas (overdue, never-properly-closed Tarea rows - FechaInicial < today AND
  // (FechaCierre IS NULL OR FechaCierre < FechaInicial)) - a Comercial sub-report, same Prospecto/
  // Lead/Vendedor join. Must be registered before /:entity/:id, or that route would swallow
  // "comercial" as an entity key and "tareas-vencidas" as an id value.
  router.get('/comercial/tareas-vencidas', listTareasVencidasRoute);
  router.get('/comercial/tareas-vencidas/vendedores', listTareaVencidaVendedoresRoute);
  router.get('/comercial/tareas-vencidas/export', exportTareasVencidasRoute);
  router.get('/comercial/tareas-vencidas/by-month', getTareasVencidasByMonthRoute);
  // Cuentas (per-contract account/collections detail, reached from the Partidas report) is
  // likewise bespoke, not a generic ENTITY_REGISTRY entity - must be registered before
  // /:entity/export, or that route would swallow "cuentas" as an entity key and 404.
  router.get('/cuentas', listCuentasRoute);
  router.get('/cuentas/export', exportCuentasRoute);
  // Cobranza Commissions (which partidas got paid this month, grouped by contract/año - reached
  // from the Partidas report) is likewise bespoke, not a generic ENTITY_REGISTRY entity - must be
  // registered before /:entity/export, or that route would swallow "cobranza-comisiones" as an
  // entity key and 404.
  router.get('/cobranza-comisiones', getCobranzaCommissionsRoute);
  router.get('/cobranza-comisiones/export', exportCobranzaCommissionsRoute);
  // Reporte de Notas (NetSuite-native Notes across every contract, date-filtered) is likewise
  // bespoke, not a generic ENTITY_REGISTRY entity - must be registered before /:entity/export, or
  // that route would swallow "notas" as an entity key and 404.
  router.get('/notas', listNotesReportRoute);
  router.get('/notas/export', exportNotesReportRoute);
  // Reporte Contratos (wide per-contract export mirroring a legacy reference spreadsheet) is
  // likewise bespoke, not a generic ENTITY_REGISTRY entity - must be registered before
  // /:entity/export, or that route would swallow "contratos-report" as an entity key and 404.
  router.get('/contratos-report', listContratosReportRoute);
  router.get('/contratos-report/export', exportContratosReportRoute);
  // Postventa status tiles (zammad_tickets, "Postventa" group only) is likewise bespoke, not a
  // generic ENTITY_REGISTRY entity - must be registered before /:entity/export, or that route
  // would swallow "postventa" as an entity key and 404.
  router.get('/postventa/summary', getPostventaSummaryRoute);
  router.get('/postventa/owners', listPostventaOwnersRoute);
  router.get('/postventa/by-month', getPostventaByMonthRoute);
  router.get('/postventa/by-asunto', getPostventaByAsuntoRoute);
  router.get('/postventa/resueltos-by-month', getPostventaResueltosByMonthRoute);
  // Reembolsos (Cryo.dbo.ControlReembolsos cash-refund workflow) lives under the Postventa page
  // too, same 'postventa' grant - must be registered before /:entity/:id, or that route would
  // swallow "postventa" as an entity key and "reembolsos" as an id value.
  router.get('/postventa/reembolsos/empresas', listReembolsoEmpresasRoute);
  router.get('/postventa/reembolsos/by-month', getReembolsosByMonthRoute);
  router.get('/postventa/reembolsos/by-causa', getReembolsosByCausaRoute);
  router.get('/postventa/reembolsos/cerrados-by-month', getReembolsosCerradosByMonthRoute);
  router.get('/postventa/reembolsos/export', exportReembolsosRoute);
  router.get('/postventa/reembolsos', listReembolsosRoute);
  router.get('/postventa/tickets', listPostventaTicketsRoute);
  router.get('/postventa/export', exportPostventaRoute);
  // Zammad Tickets by-month chart (all groups - the generic entity's own "Ver gráficos" view, see
  // ReportPage.tsx) - must be registered before /:entity/:id, or that route would swallow
  // "zammad-tickets" as an entity key and "by-month" as an id value.
  router.get('/zammad-tickets/by-month', getZammadTicketsByMonthRoute);
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
    if (err instanceof MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Cada archivo adjunto debe pesar 10 MB o menos.' : err.message;
      res.status(400).json({ success: false, message });
      return;
    }
    next(err);
  });

  return router;
}
