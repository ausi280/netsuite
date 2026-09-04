import type { Request, Response } from 'express';
import axios from 'axios';
import { getEntityConfig } from './entityRegistry';
import type { UserPermissions } from './permissionsRepository';

const PAYMENTS_CONFIG = getEntityConfig('payments')!;
const PAYMENT_API_BASE_URL = 'https://payment.cryoholdco.com';

function isPaymentsAllowed(permissions?: UserPermissions): boolean {
  return Boolean(permissions?.isAdmin || permissions?.allowedEntities.has(PAYMENTS_CONFIG.key));
}

/**
 * POST /api/reports/payments/charge-domiciled — proxies straight through to the live payment
 * app's own charge endpoint (same body shape its DomModal already sends: originalPaymentId,
 * amount, reference, subsidiariaId, contractId, customerId, payer, summary). No MercadoPago/
 * NetSuite/email logic is duplicated here - this app only renders the history grid and forwards
 * the one write action to the system that actually owns it.
 */
export async function chargeDomiciledRoute(req: Request, res: Response): Promise<void> {
  if (!isPaymentsAllowed(req.permissions)) {
    res.status(403).json({ success: false, message: 'No tienes permiso para realizar esta acción.' });
    return;
  }

  try {
    const response = await axios.post(`${PAYMENT_API_BASE_URL}/payment/charge/domiciled`, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    const status = error?.response?.status || 502;
    const data = error?.response?.data || { message: error?.message || 'No se pudo contactar al servicio de pagos.' };
    res.status(status).json(data);
  }
}
