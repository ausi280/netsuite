import { Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { PageTransition } from './components/common/PageTransition';
import { LoadingState } from './components/common/LoadingState';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportPage } from './pages/ReportPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { NotFoundPage } from './pages/NotFoundPage';

// recharts is a sizeable dependency only needed on this one page - lazy-loading it keeps the
// rest of the app's initial bundle lean for everyone who never opens the graphs page.
const PartidaAnalyticsPage = lazy(() =>
  import('./pages/PartidaAnalyticsPage').then((m) => ({ default: m.PartidaAnalyticsPage }))
);

export function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/login"
          element={
            <PageTransition>
              <LoginPage />
            </PageTransition>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <PageTransition>
                <DashboardPage />
              </PageTransition>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:entityKey"
          element={
            <RequireAuth>
              <PageTransition>
                <ReportPage />
              </PageTransition>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/partidas/graphs"
          element={
            <RequireAuth>
              <PageTransition>
                <Suspense fallback={<LoadingState label="Cargando gráficos..." />}>
                  <PartidaAnalyticsPage />
                </Suspense>
              </PageTransition>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <PageTransition>
                <AdminUsersPage />
              </PageTransition>
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:entityKey/:id"
          element={
            <RequireAuth>
              <PageTransition>
                <ReportDetailPage />
              </PageTransition>
            </RequireAuth>
          }
        />
        <Route
          path="*"
          element={
            <PageTransition>
              <NotFoundPage />
            </PageTransition>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}
