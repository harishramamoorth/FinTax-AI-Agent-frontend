import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/overlays';
import { api } from '@/services/api';
import { Button } from '@/components/ui/primitives';
import { FileText, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { FinTaxLogin } from './FinTaxLogin';
import { ApiError, errorMessage } from '@/services/api';
import type { FinTaxUser } from '@/types/api';
import fintaxLogo from '@/features/fintax/shared/fintax-logo.png';
import { portalText, usePortalLanguage } from '@/features/fintax/shared/portalLanguage';
import PrivacyNotice from '@/features/fintax/shared/PrivacyNotice';
import { hasPrivacyConsent, recordPrivacyConsent } from '@/features/fintax/shared/privacyConsent';

export function AppShell() {
  const queryClient = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState<{ accountId: string; accepted: boolean } | null>(null);
  const [privacyError, setPrivacyError] = useState('');
  const language = usePortalLanguage((state) => state.language);
  const setLanguage = usePortalLanguage((state) => state.setLanguage);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const account = useQuery({
    queryKey: ['fintax-user'],
    queryFn: api.me,
    staleTime: 30_000,
    retry: false,
  });
  const userId = account.data?.user.id;
  useEffect(() => {
    const user = account.data?.user;
    if (!user || user.must_change_password) {
      setPrivacyConsent(null);
      return;
    }

    const accountId = `portal:${user.id}`;
    try {
      setPrivacyConsent({ accountId, accepted: user.role !== 'client' && hasPrivacyConsent(accountId) });
      setPrivacyError('');
    } catch {
      setPrivacyConsent({ accountId, accepted: false });
      setPrivacyError(portalText(language, 'privacyStorageError'));
    }
  }, [userId, account.data?.user.must_change_password]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      setSignedOut(true);
    },
  });

  if (signedOut) {
    return <FinTaxLogin onSignedIn={() => setSignedOut(false)} />;
  }
  if (account.isLoading) {
    return <div className="min-h-full grid place-items-center text-sm text-muted">{t('loadingPortal')}</div>;
  }
  if (account.isError && account.error instanceof ApiError && account.error.status === 401) {
    return <FinTaxLogin />;
  }
  if (account.isError) {
    if (account.error instanceof ApiError && (account.error.status === 0 || account.error.status >= 500)) {
      return (
        <div role="alert" className="min-h-full grid place-items-center p-6 text-center">
          <div className="max-w-md">
            <p className="text-sm text-bad">{t('serviceError')}. Check that the FinTax service is running, then try again.</p>
            <Button className="mt-4" onClick={() => { void account.refetch(); }}>Try again</Button>
          </div>
        </div>
      );
    }
    return <div role="alert" className="min-h-full grid place-items-center p-6 text-center" lang={language}><div className="max-w-md"><p className="text-sm text-bad">{t('serviceError')}: {account.error.message}</p></div></div>;
  }
  if (!account.data) {
    return <div className="min-h-full grid place-items-center text-sm text-muted">{t('loadingPortal')}</div>;
  }
  if (account.data.user.must_change_password) {
    return <FinTaxLogin user={account.data.user} />;
  }

  const privacyAccountId = `portal:${account.data.user.id}`;
  if (privacyConsent?.accountId !== privacyAccountId || !privacyConsent.accepted) {
    return (
      <PrivacyNotice
        language={language}
        onLanguageChange={setLanguage}
        requireEveryLogin={account.data.user.role === 'client'}
        error={privacyError || (logout.error ? errorMessage(logout.error) : '')}
        declineBusy={logout.isPending}
        onAccept={() => {
          try {
            recordPrivacyConsent(privacyAccountId, account.data.user.role === 'client');
            setPrivacyConsent({ accountId: privacyAccountId, accepted: true });
            setPrivacyError('');
          } catch {
            setPrivacyError(portalText(language, 'privacyStorageError'));
          }
        }}
        onDecline={() => {
          setPrivacyError('');
          logout.mutate();
        }}
      />
    );
  }

  return (
    <div className="h-screen flex overflow-hidden" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <aside className="hidden w-64 shrink-0 flex-col p-3 sm:flex">
        <div className="glass flex h-full flex-col rounded-[1.5rem] p-4">
        <Link to="/portal" aria-label={t('consulting')} className="mb-8 flex items-center px-2 pt-2">
          <img src={fintaxLogo} alt={t('consulting')} className="brand-logo h-auto w-40 max-w-full object-contain" />
        </Link>
        <PortalNavigation user={account.data.user} />
        <div className="mt-auto border-t hairline pt-4">
          <p className="truncate px-2 text-sm font-medium">{account.data.user.company_name || account.data.user.username}</p>
          <p className="px-2 text-xs capitalize text-muted">{account.data.user.role === 'admin' ? t('administrator') : account.data.user.role === 'staff' ? t('staff') : t('client')}</p>
          <Button className="mt-3 w-full justify-start" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>
            {t('signOut')}
          </Button>
        </div>
        </div>
      </aside>
      <main id="main" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <header className="portal-topbar glass sticky top-0 z-20 mx-2 mt-2 flex min-h-14 flex-wrap items-center gap-3 rounded-2xl px-3 py-2 sm:mx-4 sm:min-h-16 sm:flex-nowrap sm:rounded-full sm:px-5 sm:py-0">
            <img src={fintaxLogo} alt={t('consulting')} className="brand-logo portal-brand h-auto w-32 object-contain sm:hidden" />
            <span className="portal-subtitle text-sm text-muted">{t('clientPortal')}</span>
            <nav aria-label="Portal navigation" className="hidden items-center gap-1 rounded-full bg-ink/5 p-1 md:flex">
              <NavLink to="/portal" end className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted hover:bg-panel/70 hover:text-ink'}`}>{t('overview')}</NavLink>
              <NavLink to="/portal/documents" className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted hover:bg-panel/70 hover:text-ink'}`}>{t('documents')}</NavLink>
              {account.data.user.role !== 'client' && <NavLink to="/portal/clients" className={({ isActive }) => `rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted hover:bg-panel/70 hover:text-ink'}`}>{t('clients')}</NavLink>}
            </nav>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <span className="sr-only">{t('language')}</span>
              <select aria-label={t('language')} value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'de' | 'ar')} className="h-8 rounded-full border hairline bg-panel px-2 text-xs text-ink">
                <option value="en">{t('english')}</option><option value="de">{t('german')}</option><option value="ar">{t('arabic')}</option>
              </select>
            </label>
            <span className="portal-identity text-xs text-muted">{account.data.user.client_number || account.data.user.email || account.data.user.username}</span>
            <nav aria-label="Mobile navigation" className="portal-mobile-nav flex w-full gap-1 overflow-x-auto rounded-full bg-ink/5 p-1 sm:hidden">
              <NavLink to="/portal" end className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted'}`}>{t('overview')}</NavLink>
              <NavLink to="/portal/documents" className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted'}`}>{t('documents')}</NavLink>
              {account.data.user.role !== 'client' && <NavLink to="/portal/clients" className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium ${isActive ? 'bg-panel text-cyan shadow-sm' : 'text-muted'}`}>{t('clients')}</NavLink>}
              <button type="button" className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium text-muted" onClick={() => logout.mutate()}>{t('signOut')}</button>
            </nav>
          </header>
          <div className="flex-1 p-5 sm:p-8">
            <Suspense fallback={<div className="py-16 text-center text-sm text-muted">{t('loadingPage')}</div>}><Outlet /></Suspense>
          </div>
          <Toaster />
        </div>
      </main>
    </div>
  );
}

function PortalNavigation({ user }: { user: FinTaxUser }) {
  const language = usePortalLanguage((state) => state.language);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const links = [
    { to: '/portal', label: t('overview'), icon: LayoutDashboard, end: true },
    { to: '/portal/documents', label: t('documents'), icon: FileText, end: false },
    ...(user.role !== 'client' ? [{ to: '/portal/clients', label: t('clients'), icon: Users, end: false }] : []),
  ];
  return (
    <nav aria-label="Main" className="space-y-1">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-cyan/10 text-cyan ring-1 ring-cyan/20' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}>
          <Icon className="size-4" />{label}
        </NavLink>
      ))}
    </nav>
  );
}
