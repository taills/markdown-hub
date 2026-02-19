import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/components/LoginPage';
import { NotesLayout } from '@/components/NotesLayout';
import { PersonalCenter } from '@/components/PersonalCenter';
import { AdminUsers } from '@/components/AdminUsers';
import { AdminLogs } from '@/components/AdminLogs';
import { PublicDocumentView } from '@/components/PublicDocumentView';
import { PublicWorkspaceView } from '@/components/PublicWorkspaceView';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="loading">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
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
      <Route path="/documents/:id/view" element={<PublicDocumentView />} />
      <Route path="/workspaces/:id/view" element={<PublicWorkspaceView />} />
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
          <RequireAuth>
            <AdminUsers />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <RequireAuth>
            <AdminLogs />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
