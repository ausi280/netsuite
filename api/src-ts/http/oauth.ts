import * as crypto from 'crypto';

// oauth-1.0a has no published type definitions; treat as untyped, same as
// the legacy JS implementation this ports (api/src/services/netsuiteService.js:16-25,34-35).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuth = require('oauth-1.0a');

export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  tokenSecret: string;
  realm: string;
}

export interface SignedRequest {
  url: string;
  method: 'GET' | 'POST';
}

/**
 * Ports the existing OAuth 1.0a TBA signing from netsuiteService.js, including
 * the manual realm-splice into the Authorization header (oauth-1.0a has no
 * native support for NetSuite's required `realm` param).
 */
export class NetSuiteOAuthSigner {
  private readonly oauth: any;
  private readonly token: { key: string; secret: string };
  private readonly realm: string;

  constructor(creds: OAuthCredentials) {
    this.realm = creds.realm;
    this.token = { key: creds.accessToken, secret: creds.tokenSecret };
    this.oauth = new OAuth({
      consumer: { key: creds.consumerKey, secret: creds.consumerSecret },
      signature_method: 'HMAC-SHA256',
      hash_function(base: string, key: string) {
        return crypto.createHmac('sha256', key).update(base).digest('base64');
      },
    });
  }

  sign(request: SignedRequest): Record<string, string> {
    const headers = this.oauth.toHeader(this.oauth.authorize(request, this.token));
    headers.Authorization = `OAuth realm="${this.realm}", ${headers.Authorization.replace('OAuth ', '')}`;
    return headers;
  }

  /** NetSuite account-specific hostname segment, e.g. `1234567_SB1` -> `1234567-sb1`. */
  get accountRealmHost(): string {
    return this.realm.replace('_', '-').toLowerCase();
  }
}
