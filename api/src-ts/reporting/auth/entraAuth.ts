import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { getAzureAdConfig } from '../../config';

/** Minimal shape of the claims we care about off a validated Entra ID access token. */
interface DecodedAccessToken {
  oid?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Populated after a successful token validation; absent otherwise. */
    auditUser?: { oid: string | null; username: string | null };
    /** Set by express-jwt (requestProperty default) to the decoded token payload. */
    auth?: DecodedAccessToken;
  }
}

/**
 * Builds the Entra ID (Azure AD) access-token validation middleware.
 *
 * Deliberately NOT built/invoked at module load time — getAzureAdConfig()
 * throws if AZURE_AD.TENANT_ID/CLIENT_ID are missing, which is the expected
 * state until the Entra ID app registration is completed. server.js wraps
 * `buildReportingRouter()` (which calls this) in a try/catch, so that
 * failure is non-fatal to the rest of the app.
 */
export function buildEntraAuthMiddleware(): RequestHandler {
  const { tenantId, clientId } = getAzureAdConfig();

  const validateJwt = expressjwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    }),
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    // The App Registration's "Expose an API" Application ID URI was set up as the bare
    // client-id GUID (not the `api://<clientId>` form), so that's what Entra actually puts
    // in the access token's `aud` claim - matching that here rather than assuming the URI form.
    audience: clientId,
    algorithms: ['RS256'],
  });

  return (req: Request, res: Response, next: NextFunction) => {
    validateJwt(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }

      if (req.auth) {
        req.auditUser = {
          oid: req.auth.oid ?? null,
          username: req.auth.preferred_username ?? null,
        };
      }

      next();
    });
  };
}
