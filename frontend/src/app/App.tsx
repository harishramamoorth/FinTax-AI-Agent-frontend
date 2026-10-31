import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ErrorBoundary } from './ErrorBoundary';
import { Toaster } from '@/components/ui/overlays';
import { AppShell } from '@/components/layout/AppShell';
import FinTaxDashboard from '@/features/fintax/shared/FinTaxDashboard';
import DocumentsPage from '@/features/fintax/shared/DocumentsPage';
import ClientsPage from '@/features/fintax/shared/ClientsPage';
import RoleLoginPage from '@/features/fintax/shared/RoleLoginPage';
import ClientWorkspace from '@/features/fintax/client/ClientWorkspace';
import AdminWorkspace from '@/features/fintax/admin/AdminWorkspace';
import StaffWorkspace from '@/features/fintax/staff/StaffWorkspace';
import HelpBot from '@/features/fintax/shared/HelpBot';
import { DEMO_ACCOUNTS, type DemoRole } from '@/features/fintax/shared/demoAccounts';
import { useUiStore } from '@/stores/uiStore';
import { useDemoDocumentsStore } from '@/stores/demoDocumentsStore';
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

function AppRoutes() {
  const apiPortalAtRoot = import.meta.env.PROD && import.meta.env.VITE_API_PORTAL_ENABLED === 'true';
  const apiPortalPath = apiPortalAtRoot ? '/' : '/portal';
  const [selectedRole, setSelectedRole] = useState<DemoRole | null>(null);
  const [navigationError, setNavigationError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const hydrateDemoStorage = useDemoDocumentsStore((state) => state.hydrateStorage);
  const startDemoStorageSync = useDemoDocumentsStore((state) => state.startStorageSync);

  useEffect(() => {
    void hydrateDemoStorage();
    return startDemoStorageSync();
  }, [hydrateDemoStorage, startDemoStorageSync]);

  const continueAsDemoUser = (role: DemoRole) => {
    if (!DEMO_ACCOUNTS.some((account) => account.role === role)) {
      setNavigationError('That demo account is not available. Please choose Admin, Staff, or Client.');
      return;
    }
    try {
      const account = DEMO_ACCOUNTS.find((item) => item.role === role);
      if (account) useDemoDocumentsStore.getState().recordPeriodAudit('login', account.email, 'Entered the browser-only demo workspace.', account.name, role);
      setSelectedRole(role);
      setNavigationError('');
      navigate(`/demo/${role}`, { state: { demoRole: role } });
    } catch {
      setNavigationError('We could not open that demo dashboard. Please select the role and try again.');
    }
  };

  const logout = () => {
    if (selectedRole) {
      const account = DEMO_ACCOUNTS.find((item) => item.role === selectedRole);
      useDemoDocumentsStore.getState().recordPeriodAudit('login', account?.email ?? 'demo-session', 'Signed out of the browser-only demo workspace.', account?.name ?? 'Demo user', selectedRole);
    }
    setSelectedRole(null);
    setNavigationError('');
    navigate('/demo', { replace: true });
  };

  const routeError = (location.state as { error?: string } | null)?.error ?? navigationError;
  const resetRoleSelection = (role: DemoRole | null) => {
    setSelectedRole(role);
    setNavigationError('');
    if (location.state) navigate('/demo', { replace: true, state: null });
  };

  const helpRole: DemoRole = location.pathname.includes('/admin') ? 'admin' : location.pathname.includes('/staff') ? 'staff' : 'client';
  const isDemoRoute = location.pathname.startsWith('/demo');

  return (
    <>
      <Routes>
        <Route path={apiPortalPath} element={<AppShell />}>
          <Route index element={<FinTaxDashboard />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="clients" element={<StaffClientsPage />} />
          <Route path="*" element={<Navigate to={apiPortalPath} replace />} />
        </Route>
        {!apiPortalAtRoot && <Route path="/" element={<Navigate to="/demo/client" replace />} />}
        <Route path="/demo" element={
          <RoleLoginPage
            error={routeError}
            onSelectRole={resetRoleSelection}
            onContinue={continueAsDemoUser}
          />
        } />
        <Route path="/demo/login" element={<Navigate to="/demo" replace />} />
        <Route path="/demo/:role/*" element={<RoleDashboard selectedRole={selectedRole} onSignOut={logout} />} />
        <Route path="/demo/*" element={<Navigate to="/demo" replace state={{ error: 'That demo page was not found. Choose a demo role to continue.' }} />} />
      </Routes>
      {isDemoRoute && <HelpBot role={helpRole} />}
      {isDemoRoute && <Toaster />}
    </>
  );
}

function StaffClientsPage() {
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  if (account.data?.user.role === 'client') return <Navigate to="/" replace />;
  return <ClientsPage />;
}

function RoleDashboard({ selectedRole, onSignOut }: { selectedRole: DemoRole | null; onSignOut: () => void }) {
  const { role } = useParams();
  const location = useLocation();
  const navigationRole = (location.state as { demoRole?: DemoRole } | null)?.demoRole;
  const activeRole = selectedRole ?? navigationRole ?? role;
  if (role !== 'admin' && role !== 'staff' && role !== 'client') {
    return <Navigate to="/demo" replace state={{ error: 'That demo role is not available. Choose Admin, Staff, or Client.' }} />;
  }
  if (activeRole !== role) {
    return <Navigate to="/demo" replace state={{ error: 'Please choose a demo role before opening a dashboard.' }} />;
  }

  const account = DEMO_ACCOUNTS.find((demoAccount) => demoAccount.role === activeRole);
  if (!account) {
    return <Navigate to="/demo" replace state={{ error: 'That demo account is not available. Please select another role.' }} />;
  }

  if (role === 'client') return <ClientWorkspace clientEmail={account.email} onSignOut={onSignOut} />;
  if (role === 'admin') return <AdminWorkspace userName={account.name} onSignOut={onSignOut} />;
  return <StaffWorkspace userName={account.name} onSignOut={onSignOut} />;
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
