/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MSAL_CLIENT_ID: string | undefined;
  readonly VITE_MSAL_TENANT_ID: string | undefined;
  readonly VITE_MSAL_REDIRECT_URI: string | undefined;
  readonly VITE_MSAL_API_SCOPE: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
