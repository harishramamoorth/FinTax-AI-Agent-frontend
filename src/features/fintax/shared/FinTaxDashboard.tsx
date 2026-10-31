import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, FileText, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';
import { Panel } from '@/components/ui/primitives';
import { portalText, usePortalLanguage } from './portalLanguage';

export default function FinTaxDashboard() {
  const language = usePortalLanguage((state) => state.language);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const user = account.data?.user;
  const client = useQuery({
    queryKey: ['fintax-client-home'],
    queryFn: api.clientHome,
    enabled: user?.role === 'client',
  });
  const clients = useQuery({
    queryKey: ['fintax-clients'],
    queryFn: api.clients,
    enabled: user?.role === 'admin' || user?.role === 'staff',
  });
  const documents = useQuery({
    queryKey: ['fintax-documents'],
    queryFn: api.documents,
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <p className="text-sm font-medium text-cyan">FinTax Consulting</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {t('welcome')}, {user?.role === 'client' ? client.data?.company_name || user.company_name || user.username : user?.username}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {user?.role === 'client'
            ? t('secureClientWorkspace')
            : user?.role === 'admin'
              ? t('adminWorkspace')
              : t('staffWorkspace')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {user?.role !== 'client' && (
          <Panel className="p-5">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Building2 className="size-5" /></span><span className="text-sm text-muted">{t('accessibleClients')}</span></div>
            <p className="mt-5 text-3xl font-semibold">{clients.data?.length ?? '—'}</p>
            <Link to="/clients" className="mt-4 inline-flex items-center gap-1 text-sm text-cyan">{t('openClientList')} <ArrowRight className="size-4" /></Link>
          </Panel>
        )}
        <Panel className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-green/10 text-green"><ShieldCheck className="size-5" /></span><span className="text-sm text-muted">{t('accountSecurity')}</span></div>
          <p className="mt-5 text-lg font-semibold">{t('privateSignIn')}</p>
          <p className="mt-2 text-sm text-muted">{t('protectedSession')}</p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-5" /></span><span className="text-sm text-muted">{t('documentWorkspace')}</span></div>
          <p className="mt-5 text-3xl font-semibold">{documents.isError ? '—' : documents.data?.length ?? '…'}</p>
          <p className="mt-2 text-sm text-muted">
            {documents.isError
              ? t('loadDocumentsError')
              : user?.role === 'client'
                ? t('uploadVisibleToTeam')
                : user?.role === 'admin'
                  ? t('allClientUploads')
                  : t('assignedClientUploads')}
          </p>
          <Link to="/documents" className="mt-4 inline-flex items-center gap-1 text-sm text-cyan">{t('openSharedInbox')} <ArrowRight className="size-4" /></Link>
        </Panel>
      </div>

      {user?.role !== 'client' && (
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b hairline px-5 py-4">
            <div><h2 className="font-semibold">{t('clientAccounts')}</h2><p className="mt-1 text-xs text-muted">{t('staffClientAccess')}</p></div>
            <Link to="/clients" className="text-sm text-cyan">{t('manageClients')}</Link>
          </div>
          {clients.isLoading ? <p className="p-5 text-sm text-muted">{t('loadingClients')}</p>
            : clients.isError ? <p role="alert" className="p-5 text-sm text-bad">{t('loadClientsError')}</p>
              : clients.data?.length ? <ul className="divide-y divide-line/10">{clients.data.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3.5"><Building2 className="size-4 text-muted" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.company_name}</span><span className="text-xs text-muted">{item.client_number}</span></li>
              ))}</ul>
                : <div className="p-6 text-center"><Users className="mx-auto size-6 text-muted" /><p className="mt-2 text-sm text-muted">{t('noClientAccounts')}</p><Link className="mt-3 inline-block text-sm text-cyan" to="/clients">{t('createClientAccount')}</Link></div>}
        </Panel>
      )}
    </div>
  );
}
