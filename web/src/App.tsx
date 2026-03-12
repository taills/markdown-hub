import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { SiteTitleProvider } from '@/hooks/useSiteTitle';
import { ToastProvider } from '@/components/Toast';
import type { ReactNode } from 'react';

// Lazy load components for code splitting
const LoginPage = lazy(() => import('@/components/LoginPage').then(m => ({ default: m.LoginPage })));
const HomePage = lazy(() => import('@/components/HomePage').then(m => ({ default: m.HomePage })));
const NotesLayout = lazy(() => import('@/components/NotesLayout').then(m => ({ default: m.NotesLayout })));
const PersonalCenter = lazy(() => import('@/components/PersonalCenter').then(m => ({ default: m.PersonalCenter })));
const AdminUsers = lazy(() => import('@/components/AdminUsers').then(m => ({ default: m.AdminUsers })));
const AdminLogs = lazy(() => import('@/components/AdminLogs').then(m => ({ default: m.AdminLogs })));
const AdminSettings = lazy(() => import('@/components/AdminSettings').then(m => ({ default: m.AdminSettings })));
const PublicDocumentView = lazy(() => import('@/components/PublicDocumentView').then(m => ({ default: m.PublicDocumentView })));
const PublicWorkspaceView = lazy(() => import('@/components/PublicWorkspaceView').then(m => ({ default: m.PublicWorkspaceView })));

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="loading" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontSize: '1.2rem'
    }}>
      {t('common.loading')}
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingFallback />;
  if (!user) return <Navigate to="/login" replace />;
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/" replace />;
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingFallback />;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <Suspense fallback={<LoadingFallback />}>
              <LoginPage />
            </Suspense>
          )
        }
      />
      {/* Home route - shows public content for anonymous, notes layout for authenticated */}
      <Route
        path="/"
        element={
          user ? (
            <Navigate to="/documents" replace />
          ) : (
            <Suspense fallback={<LoadingFallback />}>
              <HomePage />
            </Suspense>
          )
        }
      />
      {/* Public home route — accessible for both anonymous and authenticated users */}
      <Route
        path="/home"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <HomePage />
          </Suspense>
        }
      />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <NotesLayout />
          </RequireAuth>
        }
      />
      <Route
        path="/documents/:id"
        element={
          <RequireAuth>
            <NotesLayout />
          </RequireAuth>
        }
      />
      {/* Public routes — accessible without login */}
      <Route
        path="/documents/:id/view"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <PublicDocumentView />
          </Suspense>
        }
      />
      <Route
        path="/workspaces/:id/view"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <PublicWorkspaceView />
          </Suspense>
        }
      />
      <Route
        path="/me"
        element={
          <RequireAuth>
            <PersonalCenter />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAdmin>
            <AdminUsers />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <RequireAdmin>
            <AdminLogs />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <RequireAdmin>
            <AdminSettings />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SiteTitleProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
            <footer className="app-footer">
              © {new Date().getFullYear()} 太乙实验室. All rights reserved.
            </footer>
          </AuthProvider>
        </ToastProvider>
      </SiteTitleProvider>
    </BrowserRouter>
  );
}
