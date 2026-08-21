import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MsalProvider } from '@azure/msal-react';

// Self-hosted brand fonts (bundled from node_modules by Vite - no external font CDN at runtime).
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';

import './styles/tokens.css';
import './styles/global.css';

import { createMsalInstance } from './auth/msalConfig';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const msalInstance = createMsalInstance();

function Root() {
  const tree = (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  );

  // When the Entra ID App Registration isn't configured yet (blank client/tenant id), skip
  // MsalProvider entirely rather than constructing PublicClientApplication with an invalid
  // config. msal-react's hooks fall back to a safe stubbed context (unauthenticated) in this
  // case, so RequireAuth/LoginPage still render correctly instead of crashing.
  if (!msalInstance) {
    return tree;
  }

  return <MsalProvider instance={msalInstance}>{tree}</MsalProvider>;
}

async function bootstrap() {
  // msal-browser v3+/msal-react v2+ require the client to be explicitly initialized (and any
  // pending redirect response processed) before loginRedirect/acquireTokenSilent/etc. can be
  // called - skipping this makes loginRedirect() throw silently, which looks like a no-op click.
  if (msalInstance) {
    await msalInstance.initialize();
    await msalInstance.handleRedirectPromise().catch((error) => {
      console.error('[MSAL] handleRedirectPromise failed', error);
    });
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
}

bootstrap();
