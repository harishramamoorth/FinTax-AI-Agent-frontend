import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Copy, Download, KeyRound, Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input, Panel } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import { useDemoDocumentsStore, type DemoRoleAssignment } from '@/stores/demoDocumentsStore';
import type { DemoDocument } from './demoWorkflow';
import { DEMO_CLIENTS } from './demoAccounts';
import { portalCategory, portalText, usePortalLanguage } from './portalLanguage';

function ManagedClientsPage() {
  const queryClient = useQueryClient();
  const language = usePortalLanguage((state) => state.language);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const clients = useQuery({ queryKey: ['fintax-clients'], queryFn: api.clients });
  const accounts = useQuery({
    queryKey: ['fintax-accounts'],
    queryFn: api.accounts,
    enabled: account.data?.user.role === 'admin',
  });
  const audit = useQuery({
    queryKey: ['fintax-audit'],
    queryFn: api.auditEvents,
    enabled: account.data?.user.role === 'admin',
  });
  const documents = useQuery({
    queryKey: ['fintax-documents'],
    queryFn: api.documents,
    enabled: account.data?.user.role === 'admin' || account.data?.user.role === 'staff',
    refetchInterval: 15_000,
  });
  const [role, setRole] = useState<'client' | 'staff'>('client');
  const [username, setUsername] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientNumber, setClientNumber] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string; clientNumber?: string } | null>(null);
  const [selectedAssignments, setSelectedAssignments] = useState<Record<string, string>>({});
  const [resetCredential, setResetCredential] = useState<{ username: string; password: string } | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const admin = account.data?.user.role === 'admin';
  const create = useMutation({
    mutationFn: () => api.createAccount({
      role,
      username: username.trim(),
      initial_password: initialPassword,
      email: email.trim() || undefined,
      company_name: role === 'client' ? companyName.trim() : undefined,
      client_number: role === 'client' ? clientNumber.trim() : undefined,
    }),
    onSuccess: ({ user, temporary_password }) => {
      setCreatedCredentials({
        username: user.username,
        password: temporary_password,
        clientNumber: user.client_number || undefined,
      });
      setUsername('');
      setInitialPassword('');
      setConfirmPassword('');
      setEmail('');
      setCompanyName('');
      setClientNumber('');
      void queryClient.invalidateQueries({ queryKey: ['fintax-clients'] });
      void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] });
    },
  });
  const createError = create.error instanceof ApiError ? create.error.message : create.error instanceof Error ? create.error.message : null;
  const assign = useMutation({
    mutationFn: ({ userId, clientId }: { userId: string; clientId: string }) => api.assignClient(userId, clientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['fintax-clients'] });
    },
  });
  const resetPassword = useMutation({
    mutationFn: (userId: string) => api.resetAccountPassword(userId),
    onSuccess: ({ temporary_password }, userId) => {
      const user = accounts.data?.find((entry) => entry.id === userId);
      if (user) setResetCredential({ username: user.username, password: temporary_password });
    },
  });
  const disable = useMutation({
    mutationFn: (userId: string) => api.disableAccount(userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['fintax-accounts'] }),
  });
  const copyCredentials = async () => {
    if (!createdCredentials) return;
    const text = `Username: ${createdCredentials.username}\n${createdCredentials.clientNumber ? `Client number: ${createdCredentials.clientNumber}\n` : ''}Temporary password: ${createdCredentials.password}`;
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div><p className="text-sm font-medium text-cyan">{t('consulting')}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('clients')}</h1><p className="mt-2 text-sm text-muted">{t('staffClientAccess')}</p></div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-3 border-b hairline px-5 py-4"><Users className="size-5 text-cyan" /><div><h2 className="font-semibold">{t('clientAccounts')}</h2><p className="text-xs text-muted">{clients.data?.length ?? 0} {t('accessibleClients').toLowerCase()}</p></div></div>
          {documents.isError && <p role="alert" className="border-b hairline px-5 py-3 text-sm text-bad">{t('loadDocumentsError')}</p>}
          {clients.isLoading ? <p className="p-5 text-sm text-muted">{t('loadingClients')}</p>
            : clients.isError ? <p role="alert" className="p-5 text-sm text-bad">{t('loadClientsError')}</p>
              : clients.data?.length ? <ul className="divide-y divide-line/10">{clients.data.map((client) => {
                const clientDocuments = documents.data?.filter((document) => document.client_id === client.id) ?? [];
                const receivedCount = clientDocuments.filter((document) => document.status === 'received').length;
                const attentionCount = clientDocuments.filter((document) => document.status === 'password_required' || document.status === 'duplicate').length;
                return <li key={client.id} className="px-5 py-4">
                  <button type="button" onClick={() => setSelectedClientId((current) => current === client.id ? null : client.id)} aria-expanded={selectedClientId === client.id} className="flex w-full items-center gap-3 text-left">
                    <span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Building2 className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{client.company_name}</span><span className="block text-xs text-muted">{client.client_number}{client.email ? ` · ${client.email}` : ''}</span></span>
                    <span className="flex max-w-full flex-wrap justify-end gap-1.5 sm:ml-auto">
                      <Badge tone="neutral">{clientDocuments.length} {t('documentsCount')}</Badge>
                      <Badge tone="cyan">{receivedCount} {t('receivedCount')}</Badge>
                      <Badge tone={attentionCount ? 'warn' : 'neutral'}>{attentionCount} {t('attentionCount')}</Badge>
                    </span>
                  </button>
                  {selectedClientId === client.id && <div className="mt-4 rounded-xl border hairline bg-bg/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium">{t('serverDocumentHistory')}</h3>
                      <Link to={`/documents?clientId=${encodeURIComponent(client.id)}`} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">{t('openDocumentInbox')} <span aria-hidden>→</span></Link>
                    </div>
                    {documents.isLoading
                      ? <p className="mt-2 text-xs text-muted">{t('loadingClientDocuments')}</p>
                      : documents.isError
                        ? <p role="alert" className="mt-2 text-xs text-bad">{t('clientDocumentsError')}</p>
                        : clientDocuments.length
                          ? <ul className="mt-3 space-y-3">{clientDocuments.map((document) => (
                        <li key={document.id} className="flex flex-wrap items-start justify-between gap-2 border-t hairline pt-3 text-xs">
                          <span className="min-w-0"><span className="block truncate font-medium">{document.original_filename}</span><span className="mt-1 block text-muted">{portalCategory(language, document.category)} · {new Date(document.created_at).toLocaleString()}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={document.status === 'received' ? 'cyan' : 'warn'}>{document.status.replace(/_/g, ' ')}</Badge>
                            <a href={`/api/documents/${encodeURIComponent(document.id)}/download`} download aria-label={`Download ${document.original_filename}`} className="inline-flex size-8 items-center justify-center rounded-lg border hairline text-muted hover:text-cyan"><Download className="size-3.5" /></a>
                          </span>
                        </li>
                          ))}</ul>
                          : <p className="mt-2 text-xs text-muted">{t('noClientDocuments')}</p>}
                  </div>}
                </li>;
              })}</ul> : <div className="p-8 text-center"><Users className="mx-auto size-7 text-muted" /><p className="mt-3 text-sm text-muted">{t('noAccessibleClients')}</p></div>}
        </Panel>

        <Panel className="h-fit p-5">
          <h2 className="font-semibold">{t('createAccount')}</h2>
          <p className="mt-1 text-xs text-muted">{t('createAccountHelp')}</p>
          <form className="mt-5 space-y-4" onSubmit={(event) => {
            event.preventDefault();
            setCreatedCredentials(null);
            setPasswordError('');
            if (initialPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }
            create.mutate();
          }}>
            {admin && <Field label={t('accountRole')} htmlFor="account-role"><select id="account-role" value={role} onChange={(event) => setRole(event.target.value as 'client' | 'staff')} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm"><option value="client">{t('client')}</option><option value="staff">{t('staff')}</option></select></Field>}
            <Field label={t('username')} htmlFor="account-username"><Input id="account-username" required minLength={3} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></Field>
            <Field label={t('temporaryPassword')} htmlFor="account-password"><Input id="account-password" type="password" required minLength={12} autoComplete="new-password" value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} /></Field>
            <Field label={t('confirmTemporaryPassword')} htmlFor="account-password-confirm"><Input id="account-password-confirm" type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></Field>
            <Field label={role === 'client' ? t('emailOptional') : t('staffEmail')} htmlFor="account-email"><Input id="account-email" type="email" required={role === 'staff'} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            {role === 'client' && <>
              <Field label={t('companyName')} htmlFor="client-company"><Input id="client-company" required value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></Field>
              <Field label={t('clientNumber')} htmlFor="client-number"><Input id="client-number" required value={clientNumber} onChange={(event) => setClientNumber(event.target.value)} /></Field>
            </>}
            {(passwordError || createError) && <p role="alert" className="text-sm text-bad">{passwordError || createError}</p>}
            <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={create.isPending} className="w-full">{t('submitCreateAccount')}</Button>
          </form>
          {createdCredentials && <div role="status" className="mt-4 space-y-2 rounded-lg border border-green/25 bg-green/5 p-3 text-sm">
            <p className="font-medium text-green">{t('accountCreated')}</p>
            <p>Username: <span className="font-mono">{createdCredentials.username}</span></p>
            {createdCredentials.clientNumber && <p>Client number: <span className="font-mono">{createdCredentials.clientNumber}</span></p>}
            <p className="break-all">{t('temporaryCredentials')}: <span className="font-mono">{createdCredentials.password}</span></p>
            <Button size="sm" icon={<Copy className="size-3.5" />} onClick={copyCredentials}>{t('copyCredentials')}</Button>
          </div>}
        </Panel>
      </div>

      {admin && <Panel className="overflow-hidden">
        <div className="border-b hairline px-5 py-4"><h2 className="font-semibold">{t('allAccounts')}</h2><p className="text-xs text-muted">{t('accountManagement')}</p></div>
        <ul className="divide-y divide-line/10">{accounts.data?.map((user) => <li key={user.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-sm">{user.username}</span>
          <span className="text-xs capitalize text-muted">{user.role === 'client' ? t('client') : user.role === 'staff' ? t('staff') : t('administrator')}</span>
          <span className="text-xs text-muted">{user.enabled ? t('active') : t('disabled')}</span>
          {user.role === 'staff' && <span className="flex items-center gap-2">
            <select aria-label={`${t('assignClient')} ${user.username}`} value={selectedAssignments[user.id] ?? ''} onChange={(event) => setSelectedAssignments((previous) => ({ ...previous, [user.id]: event.target.value }))} className="h-9 max-w-48 rounded-lg border hairline bg-bg/60 px-2 text-xs">
              <option value="">{t('assignClient')}</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.company_name}</option>)}
            </select>
            <Button size="sm" disabled={!selectedAssignments[user.id] || assign.isPending} loading={assign.isPending} onClick={() => {
              const clientId = selectedAssignments[user.id];
              if (clientId) assign.mutate({ userId: user.id, clientId });
            }}>{t('assign')}</Button>
            <span className="text-xs text-muted">{user.assigned_client_ids.length} {t('assigned')}</span>
          </span>}
          {user.id !== account.data?.user.id && <Button size="sm" icon={<KeyRound className="size-3.5" />} onClick={() => { setResetCredential(null); resetPassword.mutate(user.id); }} loading={resetPassword.isPending}>{t('resetPassword')}</Button>}
          {user.enabled && <Button size="sm" variant="danger" onClick={() => {
            if (window.confirm(`${t('deactivate')} ${user.username}?`)) disable.mutate(user.id);
          }} loading={disable.isPending}>{t('deactivate')}</Button>}
        </li>)}</ul>
        {resetCredential && <div role="status" className="border-t hairline p-4 text-sm"><p className="font-medium text-green">Temporary password for {resetCredential.username}: <span className="font-mono">{resetCredential.password}</span></p><p className="text-xs text-muted">This is shown once; the account must change it at next sign-in.</p></div>}
        {(assign.error || resetPassword.error || disable.error) && <p role="alert" className="border-t hairline p-4 text-sm text-bad">
          {[assign.error, resetPassword.error, disable.error].find((error) => error instanceof Error)?.message ?? t('accountActionFailed')}
        </p>}
      </Panel>}

      {admin && <Panel className="overflow-hidden">
        <div className="border-b hairline px-5 py-4"><h2 className="font-semibold">Recent audit activity</h2><p className="text-xs text-muted">Recent account and document access events.</p></div>
        {audit.isError ? <p role="alert" className="p-5 text-sm text-bad">Could not load audit events.</p>
          : audit.data?.length ? <ul className="divide-y divide-line/10">{audit.data.slice(0, 20).map((event) => <li key={event.id} className="flex flex-wrap gap-2 px-5 py-3 text-xs"><span className="font-medium">{event.action.replace(/_/g, ' ')}</span><span className="text-muted">{event.created_at ? new Date(event.created_at).toLocaleString() : ''}</span><span className="ml-auto text-muted">{event.client_id ? `Client ${event.client_id.slice(0, 8)}` : ''}</span></li>)}</ul>
            : <p className="p-5 text-sm text-muted">No audit events recorded yet.</p>}
      </Panel>}
    </div>
  );
}

export default function ClientsPage({ demoOnly = false, onOpenDocument, onManageAccounts }: {
  demoOnly?: boolean;
  onOpenDocument?: (document: DemoDocument) => void;
  onManageAccounts?: () => void;
}) {
  return demoOnly
    ? <DemoClientsPage onOpenDocument={onOpenDocument} onManageAccounts={onManageAccounts} />
    : <ManagedClientsPage />;
}

function DemoClientsPage({ onOpenDocument, onManageAccounts }: {
  onOpenDocument?: (document: DemoDocument) => void;
  onManageAccounts?: () => void;
}) {
  const documents = useDemoDocumentsStore((state) => state.documents);
  const roleAssignments = useDemoDocumentsStore((state) => state.roleAssignments);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'attention' | 'completed'>('all');
  const clientByEmail = new Map<string, {
    id: string;
    name: string;
    email: string;
    country?: string;
    demo: boolean;
  }>();
  DEMO_CLIENTS.forEach((client) => clientByEmail.set(client.email, {
    id: client.id,
    name: client.company,
    email: client.email,
    country: client.country,
    demo: true,
  }));
  roleAssignments.filter((profile) => profile.role === 'client').forEach((profile: DemoRoleAssignment) => {
    const existing = clientByEmail.get(profile.email);
    clientByEmail.set(profile.email, {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      country: existing?.country,
      demo: existing?.demo ?? false,
    });
  });
  const clients = [...clientByEmail.values()]
    .map((client) => {
      const clientDocuments = documents.filter((document) =>
        document.clientId === client.email || document.clientId === client.id,
      );
      return {
        ...client,
        documents: clientDocuments,
        pendingCount: clientDocuments.filter((document) => ['processing', 'review'].includes(document.status)).length,
        attentionCount: clientDocuments.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status)).length,
        completedCount: clientDocuments.filter((document) => document.status === 'approved').length,
        requestCount: clientDocuments.filter((document) => document.clientRequest && !document.clientRequest.resolvedAt).length,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const pendingTotal = clients.reduce((total, client) => total + client.pendingCount, 0);
  const attentionTotal = clients.reduce((total, client) => total + client.attentionCount, 0);
  const completedTotal = clients.reduce((total, client) => total + client.completedCount, 0);
  const filteredClients = clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.email} ${client.country ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' && client.pendingCount > 0)
      || (statusFilter === 'attention' && client.attentionCount > 0)
      || (statusFilter === 'completed' && client.completedCount > 0);
    return matchesQuery && matchesStatus;
  });

  return <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">Client records and document activity for this browser demo.</p>
      {onManageAccounts && <Button variant="outline" className="min-h-10" onClick={onManageAccounts}>Manage accounts <ArrowRight className="ms-2 size-4" /></Button>}
    </div>
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {[['Client accounts', clients.length, 'text-blue-700'], ['Waiting for review', pendingTotal, 'text-amber-700'], ['Needs attention', attentionTotal, 'text-rose-700']].map(([label, value, color]) => <Panel key={label} className="!rounded-2xl !border-white/80 !bg-white/85 p-2.5 shadow-[0_16px_40px_-30px_rgba(60,80,140,.4)] sm:p-4"><p className="line-clamp-2 min-h-8 text-[10px] leading-4 text-muted sm:min-h-0 sm:text-xs">{label}</p><p className={`mt-0.5 text-xl font-semibold sm:mt-1 ${color}`}>{value}</p></Panel>)}
    </div>
    <Panel className="overflow-hidden !rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]">
      <div className="border-b hairline px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="font-semibold">Client workspaces</h2><p className="mt-1 truncate text-xs text-muted">{clients.length} client accounts · {completedTotal} completed documents</p></div>
          <Badge className="shrink-0" tone="neutral">Browser demo</Badge>
        </div>
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input aria-label="Search clients" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" className="h-11 ps-9 text-sm" />
          </label>
          <label className="sr-only" htmlFor="client-status-filter">Filter clients by document status</label>
          <select id="client-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-11 w-[min(42%,11rem)] shrink-0 rounded-xl border hairline bg-white px-2 text-xs sm:w-auto sm:px-3">
            <option value="all">All clients</option><option value="pending">Waiting review</option><option value="attention">Needs attention</option><option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <ul className="space-y-2 p-2.5 sm:p-4">{filteredClients.map((client) => {
        const clientDocuments = client.documents;
        const pendingCount = client.pendingCount;
        const attentionCount = client.attentionCount;
        const completedCount = client.completedCount;
        const requestCount = client.requestCount;
        return <li key={client.id} className={`min-w-0 rounded-2xl border p-2.5 transition-colors sm:p-4 ${selectedClientId === client.id ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200/80 bg-white hover:bg-slate-50/70'}`}>
          <button type="button" aria-expanded={selectedClientId === client.id} aria-label={`${client.name}, ${clientDocuments.length} documents, ${pendingCount} pending, ${attentionCount} attention, ${completedCount} completed, ${requestCount} outstanding requests. ${selectedClientId === client.id ? 'Hide' : 'Show'} document history`} onClick={() => setSelectedClientId((current) => current === client.id ? null : client.id)} className="w-full text-left">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 sm:size-10"><Users className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{client.name}</span><span className="block truncate text-xs text-muted">{client.email} · {client.demo ? 'Sample client' : 'Managed'}</span></span>
              <ArrowRight className={`size-4 shrink-0 text-muted transition-transform ${selectedClientId === client.id ? 'rotate-90' : ''}`} aria-hidden />
            </span>
            <span className="mt-2 grid grid-cols-5 gap-1 border-t border-slate-100 pt-2 sm:hidden">
              {[[clientDocuments.length, 'Docs'], [pendingCount, 'Review'], [attentionCount, 'Attention'], [completedCount, 'Done'], [requestCount, 'Requests']].map(([count, label]) => <span key={label} className="min-w-0 text-center">
                <span className={`block text-xs font-semibold tabular-nums ${label === 'Attention' && attentionCount ? 'text-amber-700' : label === 'Review' && pendingCount ? 'text-cyan' : 'text-slate-700'}`}>{count}</span>
                <span className="block truncate text-[9px] leading-3 text-slate-500">{label}</span>
              </span>)}
            </span>
            <span className="hidden max-w-full flex-wrap justify-start gap-1.5 sm:flex sm:justify-end">
              <Badge tone="neutral">{clientDocuments.length} documents</Badge>
              <Badge tone="cyan">{pendingCount} pending</Badge>
              <Badge tone={attentionCount ? 'warn' : 'neutral'}>{attentionCount} attention</Badge>
              <Badge tone="ok">{completedCount} completed</Badge>
              <Badge tone={requestCount ? 'warn' : 'neutral'}>{requestCount} outstanding requests</Badge>
            </span>
          </button>
          {selectedClientId === client.id && <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-3 sm:p-4">
            <h3 className="text-sm font-semibold">Document history</h3>
            {clientDocuments.length
              ? <ul className="mt-3 space-y-3">{clientDocuments.map((document) => <li key={document.id} className="flex flex-wrap items-start justify-between gap-2 border-t hairline pt-3 text-xs">
                <span className="min-w-0"><span className="block truncate font-medium">{document.name}</span><span className="mt-1 block text-muted">{document.category.replace(/_/g, ' ')} · {new Date(document.createdAt).toLocaleString()}</span>
                  {document.clientRequest && <span className="mt-1 block text-amber-700">{document.clientRequest.reason} · {document.clientRequest.resolvedAt ? 'Client responded' : 'Outstanding'}</span>}
                </span>
                <span className="flex items-center gap-2"><Badge tone={document.status === 'approved' ? 'ok' : ['rejected', 'needs_information'].includes(document.status) ? 'warn' : 'cyan'}>{document.status.replace(/_/g, ' ')}</Badge>{onOpenDocument && <Button variant="outline" className="min-h-8 px-2 text-[11px]" onClick={() => onOpenDocument(document)}>Open</Button>}</span>
              </li>)}</ul>
              : <p className="mt-2 text-xs text-muted">No demo documents yet. Client records stay isolated by demo account email.</p>}
          </div>}
        </li>;
      })}{!filteredClients.length && <li className="px-4 py-10 text-center text-sm text-muted">No clients match these filters.</li>}</ul>
      <p className="hidden border-t hairline px-4 py-3 text-[11px] text-muted sm:block sm:px-5">Client data stays in this browser demo. Create and manage accounts from Manage accounts; review each client’s documents from their workspace.</p>
      <details className="border-t hairline px-3 py-1 sm:hidden"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-muted">About client records</summary><p className="pb-3 text-xs leading-5 text-muted">Client data stays in this browser demo. Create and manage accounts from Manage accounts; review each client’s documents from their workspace.</p></details>
    </Panel>
  </div>;
}
