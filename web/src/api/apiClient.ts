// Single fetch wrapper used by every call into the reporting API.
// Base is relative ('/api') by default so it works through the Vite dev proxy (see
// vite.config.ts) and same-origin if this app is ever served by Express itself. When the
// frontend is deployed separately from the API (e.g. a static host on its own domain, with
// the API staying on Azure), set VITE_API_BASE_URL to the API's absolute origin instead.
const BASE_PATH = `${(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '')}/api`;

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Access token to attach as `Authorization: Bearer <token>`. */
  token: string | null;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${BASE_PATH}${path}`, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. an unexpected HTML error page) - fall through to the status check below.
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Request failed with status ${response.status}`;
    throw new ApiClientError(message, response.status);
  }

  if (body && typeof body === 'object' && 'success' in body && (body as { success: unknown }).success === false) {
    const message = (body as { message?: string }).message ?? 'Request failed';
    throw new ApiClientError(message, response.status);
  }

  return body as T;
}
