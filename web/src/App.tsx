import { AnimatePresence } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { PageTransition } from './components/common/PageTransition';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportPage } from './pages/ReportPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';

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
