import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, BriefcaseBusiness, FileText, KeyRound, Languages, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input } from '@/components/ui/primitives';
import type { FinTaxUser } from '@/types/api';
import { portalText, usePortalLanguage } from '@/features/fintax/shared/portalLanguage';

export function FinTaxLogin({ user }: { user?: FinTaxUser }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const language = usePortalLanguage((state) => state.language);
  const setLanguage = usePortalLanguage((state) => state.setLanguage);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const queryClient = useQueryClient();
  const arabic = language === 'ar';
  const demoSignIn = (account: 'admin' | 'staff' | 'client') => {
    const demoAccounts = {
      admin: { identifier: 'admin demo', password: 'admin demo@2026' },
      staff: { identifier: 'staff demo', password: 'staff demo@2026' },
      client: { identifier: 'client demo', password: 'client demo@2026' },
    };
    setIdentifier(demoAccounts[account].identifier);
    setPassword(demoAccounts[account].password);
    signIn.reset();
  };
  const signIn = useMutation({
    mutationFn: () => api.login(identifier.trim(), password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(['fintax-user'], { user });
      void queryClient.invalidateQueries();
    },
  });
  const changePassword = useMutation({
    mutationFn: () => api.changePassword(password, newPassword),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(['fintax-user'], { user: updated });
      setPassword('');
    },
  });
  const changePasswordError = changePassword.error instanceof Error ? changePassword.error.message : changeError;
  const signInError = signIn.error instanceof ApiError
    ? (signIn.error.status === 401
      ? t('wrongCredentials')
      : signIn.error.message)
    : signIn.error instanceof Error
      ? signIn.error.message
      : null;

  return (
    <main dir={arabic ? 'rtl' : 'ltr'} lang={language} className="min-h-full overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto grid min-h-[min(720px,calc(100vh-6rem))] w-full max-w-5xl content-center items-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:gap-8">
        <section className="glass w-full rounded-2xl p-6 sm:p-9">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-cyan/10 text-cyan"><ShieldCheck className="size-6" /></div>
              <div><h1 className="text-xl font-semibold tracking-tight">{t('fintax')}</h1><p className="text-xs text-muted">{t('loadingSignIn')}</p></div>
            </div>
            <label className="inline-flex items-center gap-1.5">
              <Languages className="size-4 text-muted" />
              <span className="sr-only">{t('language')}</span>
              <select aria-label={t('language')} value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'de' | 'ar')} className="h-9 rounded-lg border hairline bg-bg/60 px-2 text-xs">
                <option value="en">{t('english')}</option><option value="de">{t('german')}</option><option value="ar">{t('arabic')}</option>
              </select>
            </label>
          </div>

          {user?.must_change_password ? (
            <form className="mt-8 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              setChangeError('');
              if (newPassword !== confirmPassword) { setChangeError(t('passwordsMismatch')); return; }
              changePassword.mutate();
            }}>
              <div><h2 className="text-lg font-semibold">{t('setNewPassword')}</h2><p className="mt-1 text-sm text-muted">{t('changeTemporaryPassword')}</p></div>
              <Field label={t('newPassword')} htmlFor="fintax-new-password">
                <Input id="fintax-new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Field label={t('confirmPassword')} htmlFor="fintax-confirm-password">
                <Input id="fintax-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </Field>
              {changePasswordError && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-sm text-bad">{changePasswordError}</p>}
              <Button type="submit" variant="primary" loading={changePassword.isPending} className="w-full">{t('changePassword')}</Button>
            </form>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); signIn.mutate(); }}>
              <div><h2 className="text-2xl font-semibold tracking-tight">{t('signInTitle')}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{t('signInDescription')}</p></div>
              <Field
                label={t('identifier')}
                htmlFor="fintax-identifier"
                hint={t('clientNumberHint')}
              >
                <Input id="fintax-identifier" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </Field>
              <Field label={t('password')} htmlFor="fintax-password">
                <Input id="fintax-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {signInError && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-sm text-bad">{signInError}</p>}
              <Button type="submit" variant="primary" loading={signIn.isPending} icon={<KeyRound className="size-4" />} className="w-full">
                {t('signInSecurely')}
              </Button>
              <Link to="/demo" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border hairline text-sm font-medium text-cyan hover:bg-cyan/5">
                <FileText className="size-4" />{t('exploreDemo')}
              </Link>
              <p className="text-center text-xs text-muted">{t('accountsCreatedPrivately')}</p>
            </form>
          )}
        </section>

        <aside className="space-y-4" aria-label={t('roleBasedAccess')}>
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan">{t('roleBasedAccess')}</p>
            <h2 className="mt-2 text-xl font-semibold">{t('roleDeterminesWorkspace')}</h2>
            <p className="mt-1 text-sm text-muted">{t('roleAccessExplanation')}</p>
          </div>
          <RoleCard
            icon={<ShieldCheck className="size-5" />}
            title={t('administrator')}
            description={t('adminDescription')}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('admin') : undefined}
            demoLabel={t('fillDemoLogin')}
          />
          <RoleCard
            icon={<BriefcaseBusiness className="size-5" />}
            title={t('staff')}
            description={t('staffDescription')}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('staff') : undefined}
            demoLabel={t('fillDemoLogin')}
          />
          <RoleCard
            icon={<Building2 className="size-5" />}
            title={t('client')}
            description={t('clientDescription')}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('client') : undefined}
            demoLabel={t('fillDemoLogin')}
          />
          {import.meta.env.DEV && <p className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-xs leading-5 text-muted">{t('localDemoWarning')}</p>}
          <div className="flex gap-3 rounded-xl border hairline bg-bg2/55 p-4">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-cyan" />
            <div>
              <p className="text-sm font-medium">{t('securityNote')}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{t('securityHelp')}</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function RoleCard({ icon, title, description, onDemoLogin, demoLabel }: { icon: ReactNode; title: string; description: string; onDemoLogin?: () => void; demoLabel?: string }) {
  return (
    <div className="glass flex gap-3 rounded-xl p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan">{icon}</span>
      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        {onDemoLogin && <button type="button" onClick={onDemoLogin} className="mt-2 text-xs font-medium text-cyan underline-offset-4 hover:underline">{demoLabel}</button>}
      </div>
    </div>
  );
}
