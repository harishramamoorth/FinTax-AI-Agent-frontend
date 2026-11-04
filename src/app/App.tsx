import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from './ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import FinTaxDashboard from '@/features/fintax/shared/FinTaxDashboard';
import DocumentsPage from '@/features/fintax/shared/DocumentsPage';
import ClientsPage from '@/features/fintax/shared/ClientsPage';
import RoleLoginPage from '@/features/fintax/shared/RoleLoginPage';
import ClientWorkspace from '@/features/fintax/client/ClientWorkspace';
import AdminWorkspace from '@/features/fintax/admin/AdminWorkspace';
import StaffWorkspace from '@/features/fintax/staff/StaffWorkspace';
import { type DemoRole } from '@/features/fintax/shared/demoAccounts';
import { clearDemoSession, readDemoSession, saveDemoSession, type DemoSession } from '@/features/fintax/shared/demoAuth';
import PrivacyNotice from '@/features/fintax/shared/PrivacyNotice';
import { recordPrivacyConsent } from '@/features/fintax/shared/privacyConsent';
import { portalText, usePortalLanguage } from '@/features/fintax/shared/portalLanguage';
import { useUiStore } from '@/stores/uiStore';
import { api } from '@/services/api';

const queryClient = new QueryClient();

function ThemeSync() {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f8fa' : '#04060c');
  }, [theme]);

  return null;
}

function roleHome(role: DemoRole): string {
  if (role === 'client') return '/client/dashboard';
  if (role === 'staff') return '/staff/dashboard';
  return '/admin/dashboard';
}

function roleLogin(role: DemoRole): string {
  if (role === 'client') return '/login';
  if (role === 'staff') return '/admin/staff';
  return '/admin/super-admin';
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<DemoSession | null>(() => {
    try {
      return readDemoSession();
    } catch {
      return null;
    }
  });

  const login = (nextSession: DemoSession) => {
    saveDemoSession(nextSession);
    setSession(nextSession);
    navigate(roleHome(nextSession.role), { replace: true });
  };

  const logout = () => {
    clearDemoSession();
    setSession(null);
    navigate(roleLogin(session?.role ?? 'client'), { replace: true });
  };

  const loginElement = (portal: 'client' | 'staff' | 'admin', showPortalOptions = true) => (
    session
      ? <Navigate to={roleHome(session.role)} replace />
      : (
        <RoleLoginPage
          portal={portal}
          showPortalOptions={showPortalOptions}
          onPortalSwitch={(selected) => {
            if (selected === 'client') navigate('/login');
            else if (selected === 'staff') navigate('/admin/staff');
            else navigate('/admin/super-admin');
          }}
          onLogin={login}
        />
      )
  );

  return (
    <Routes>
      <Route path="/" element={loginElement('client', false)} />
      <Route path="/login" element={loginElement('client', false)} />
      <Route path="/admin" element={loginElement('admin', true)} />
      <Route path="/admin/staff" element={loginElement('staff', true)} />
      <Route path="/admin/super-admin" element={loginElement('admin', true)} />

      <Route
        path="/client/dashboard/*"
        element={
          <ProtectedDashboard
            role="client"
            session={session}
            onSignOut={logout}
            onPrivacyAccepted={(nextSession) => {
              saveDemoSession(nextSession);
              setSession(nextSession);
            }}
          />
        }
      />
      <Route
        path="/staff/dashboard"
        element={
          <ProtectedDashboard
            role="staff"
            session={session}
            onSignOut={logout}
            onPrivacyAccepted={(nextSession) => {
              saveDemoSession(nextSession);
              setSession(nextSession);
            }}
          />
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedDashboard
            role="admin"
            session={session}
            onSignOut={logout}
            onPrivacyAccepted={(nextSession) => {
              saveDemoSession(nextSession);
              setSession(nextSession);
            }}
          />
        }
      />
      <Route path="/client/*" element={<Navigate to={session?.role === 'client' ? roleHome('client') : session ? roleHome(session.role) : '/login'} replace />} />
      <Route path="/staff/*" element={<Navigate to={session?.role === 'staff' ? roleHome('staff') : session ? roleHome(session.role) : '/admin/staff'} replace />} />
      <Route path="/admin/*" element={<Navigate to={session ? roleHome(session.role) : '/admin'} replace />} />

      <Route path="/portal" element={<AppShell />}>
        <Route index element={<FinTaxDashboard />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="clients" element={<StaffClientsPage />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Route>
      <Route path="/demo/*" element={<Navigate to={session ? roleHome(session.role) : '/login'} replace />} />
      <Route path="*" element={<Navigate to={session ? roleHome(session.role) : location.pathname.startsWith('/portal') ? '/portal' : '/'} replace />} />
    </Routes>
  );
}

function ProtectedDashboard({
  role,
  session,
  onSignOut,
  onPrivacyAccepted,
}: {
  role: DemoRole;
  session: DemoSession | null;
  onSignOut: () => void;
  onPrivacyAccepted: (session: DemoSession) => void;
}) {
  const [privacyError, setPrivacyError] = useState('');
  const language = usePortalLanguage((state) => state.language);
  const setLanguage = usePortalLanguage((state) => state.setLanguage);

  if (!session) return <Navigate to={roleLogin(role)} replace state={{ from: roleHome(role) }} />;
  if (session.role !== role) return <Navigate to={roleHome(session.role)} replace />;

  if (role === 'client' && !session.privacyAccepted) {
    return (
      <PrivacyNotice
        language={language}
        onLanguageChange={setLanguage}
        firm={session.advisorFirm ?? 'FinTax Consulting'}
        demo
        requireEveryLogin={false}
        error={privacyError}
        onAccept={() => {
          try {
            recordPrivacyConsent(`demo:${session.email}`, true, {
              firm: session.advisorFirm ?? 'FinTax Consulting',
              textVersion: '1.0.0',
            });
            onPrivacyAccepted({ ...session, privacyAccepted: true });
            setPrivacyError('');
          } catch {
            setPrivacyError(portalText(language, 'privacyStorageError'));
          }
        }}
        onDecline={onSignOut}
      />
    );
  }

  if (role === 'client') {
    return (
      <ClientWorkspace
        clientEmail={session.email}
        advisorFirm={session.advisorFirm}
        advisorId={session.advisorId}
        onSignOut={onSignOut}
      />
    );
  }
  if (role === 'staff') return <StaffWorkspace userName={session.userName} onSignOut={onSignOut} />;
  return <AdminWorkspace userName={session.userName} onSignOut={onSignOut} />;
}

function StaffClientsPage() {
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  if (account.data?.user.role === 'client') return <Navigate to="/portal" replace />;
  return <ClientsPage />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeSync />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
