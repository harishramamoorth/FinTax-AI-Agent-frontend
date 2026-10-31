import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, CalendarClock, CheckCircle2, CircleAlert, FileSearch, ListChecks, MessageSquareText, Upload } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import type { AssistantLanguage } from '../clientAssistant';
import type { DemoCategory, DemoDocument } from '../../shared/demoWorkflow';
import type { MonthlyPeriod } from '../../shared/storage/models';
import type { ClientDemoProfile } from '../../shared/clientDemoData';
import { t3 } from '../clientPageUtils';
import StatFlow from '../../shared/StatFlow';

type DocumentFilter = 'all' | 'processing' | 'attention' | 'approved';

interface ClientDashboardPageProps {
  activeClient: ClientDemoProfile;
  activeClientEmail: string;
  documents: DemoDocument[];
  clientPeriods: MonthlyPeriod[];
  activePeriod?: MonthlyPeriod;
  periodReadOnly: boolean;
  canFinishPeriod: boolean;
  finishBlockers: string[];
  language: AssistantLanguage;
  greeting: string;
  quotaWarning: boolean;
  storageError: string | null;
  documentFilter: DocumentFilter;
  onDocumentFilterChange: (filter: DocumentFilter) => void;
  onOpenDocuments: () => void;
  onOpenUpload: () => void;
  onSelectPeriod: (periodId: string) => void;
  onSetNotApplicable: (periodId: string, key: string, reason: string, clientId: string) => void;
  onSetUploadCategory: (category: DemoCategory) => void;
  onFinishPeriod: () => void;
  onRespondToRequest: (documentId: string, response: string) => void;
  onUploadReplacement: (document: DemoDocument) => void;
}

const attentionStatuses = ['needs_information', 'rejected', 'action_required', 'password_required'];

export default function ClientDashboardPage({
  activeClient,
  activeClientEmail,
  documents: allDocuments,
  clientPeriods,
  activePeriod,
  periodReadOnly,
  canFinishPeriod,
  finishBlockers,
  language,
  greeting,
  quotaWarning,
  storageError,
  documentFilter,
  onDocumentFilterChange,
  onOpenDocuments,
  onOpenUpload,
  onSelectPeriod,
  onSetNotApplicable,
  onSetUploadCategory,
  onFinishPeriod,
  onRespondToRequest,
  onUploadReplacement,
}: ClientDashboardPageProps) {
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [notApplicableReasons, setNotApplicableReasons] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});
  const processing = allDocuments.filter((document) => document.status === 'processing' || document.status === 'review');
  const attention = allDocuments.filter((document) => attentionStatuses.includes(document.status));
  const approved = allDocuments.filter((document) => document.status === 'approved');
  const activity = allDocuments.filter((document) => ['approved', ...attentionStatuses].includes(document.status));

  const statCards = [
    { key: 'all', label: t3(language, 'Documents', 'Dokumente', 'المستندات'), compactLabel: t3(language, 'Files', 'Belege', 'ملفات'), hint: t3(language, 'Fictional records for this company', 'Fiktive Belege für dieses Unternehmen', 'سجلات خيالية لهذه الشركة'), value: allDocuments.length, icon: ListChecks, from: '#7c3aed', to: '#3b82f6' },
    { key: 'processing', label: t3(language, 'In review', 'In Prüfung', 'قيد المراجعة'), compactLabel: t3(language, 'Review', 'Prüfung', 'مراجعة'), hint: t3(language, 'Processing or waiting for staff review', 'In Bearbeitung oder Teamprüfung', 'قيد المعالجة أو انتظار مراجعة الفريق'), value: processing.length, icon: FileSearch, from: '#3b82f6', to: '#06b6d4' },
    { key: 'attention', label: t3(language, 'Needs you', 'Ihre Aktion', 'يحتاج إجراءك'), compactLabel: t3(language, 'Action', 'Aktion', 'إجراء'), hint: t3(language, 'Requests or issues need a response', 'Anfragen oder Probleme benötigen eine Antwort', 'تحتاج الطلبات أو المشكلات إلى رد'), value: attention.length, icon: CircleAlert, from: '#d97706', to: '#db2777' },
    { key: 'approved', label: t3(language, 'Approved', 'Freigegeben', 'معتمد'), compactLabel: t3(language, 'Done', 'Fertig', 'معتمد'), hint: t3(language, 'Reviewed and approved demo records', 'Geprüfte und freigegebene Demobelege', 'سجلات تجريبية تمت مراجعتها واعتمادها'), value: approved.length, icon: CheckCircle2, from: '#059669', to: '#06b6d4' },
  ] as const;

  return (
    <>
      <section aria-label="Client dashboard greeting" className="rounded-3xl border border-white/80 bg-gradient-to-br from-white/85 via-[#f1eeff]/80 to-[#eaf2ff]/80 p-5 shadow-[0_24px_70px_-44px_rgba(110,80,220,.45)] sm:rounded-[2rem] sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted sm:text-[11px]">Turn paperwork into progress</p>
        <h1 className="mt-2 text-[clamp(2rem,7vw,3.8rem)] font-semibold leading-[1.08] tracking-tight text-ink">
          {greeting}.<br />How can I help you <span className="bg-gradient-to-r from-violet via-blue to-magenta bg-clip-text text-transparent">today?</span>
        </h1>
        <p className="mt-3 text-sm text-muted">{activeClient.company} · Fictional demo data stored in this browser only.</p>
      </section>

      <section id="client-month" className="scroll-mt-24 rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm sm:p-6" aria-labelledby="client-month-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-violet">Monthly close</p>
            <h2 id="client-month-title" className="mt-1 text-lg font-semibold text-ink">
              {activePeriod ? new Date(activePeriod.year, activePeriod.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' }) : 'No month available'}
            </h2>
            <p className="mt-1 text-xs text-muted">Documents and checklist are stored in this browser’s IndexedDB.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="client-month-select">Choose a month</label>
            <select id="client-month-select" value={activePeriod?.id ?? ''} onChange={(event) => onSelectPeriod(event.target.value)} className="min-h-10 rounded-xl border border-ink/10 bg-white px-3 text-xs text-ink">
              {clientPeriods.map((period) => <option key={period.id} value={period.id}>{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</option>)}
            </select>
            {activePeriod && <Badge tone={activePeriod.status === 'completed' ? 'ok' : activePeriod.status === 'open' ? 'warn' : 'cyan'}>{activePeriod.status.replace(/_/g, ' ')}</Badge>}
          </div>
        </div>

        {activePeriod && <>
          <ul className="mt-4 divide-y divide-ink/5 rounded-2xl border border-ink/5">
            {activePeriod.checklist.map((item) => {
              const itemCategory = item.key as DemoCategory;
              const reason = notApplicableReasons[item.key] ?? item.naReason ?? '';
              return <li key={item.key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-ink">{item.label}{item.required ? ' · required' : ' · optional'}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">{item.state === 'uploaded' ? 'Uploaded' : item.state === 'not_applicable' ? `Not applicable${item.naReason ? `: ${item.naReason}` : ''}` : 'Missing'}</span>
                </span>
                {!periodReadOnly && <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="min-h-10 rounded-full" onClick={() => { onSetUploadCategory(itemCategory); onOpenUpload(); }}>Upload</Button>
                  {item.state !== 'uploaded' && <div className="flex items-center gap-1">
                    <input value={reason} onChange={(event) => setNotApplicableReasons((current) => ({ ...current, [item.key]: event.target.value }))} aria-label={`Reason ${item.label} is not applicable`} placeholder="Reason" className="h-10 w-32 rounded-xl border border-ink/10 bg-white px-2 text-xs" />
                    <Button size="sm" variant="ghost" className="min-h-10 rounded-full" disabled={!reason.trim()} onClick={() => onSetNotApplicable(activePeriod.id, item.key, reason, activeClientEmail)}>Not applicable</Button>
                  </div>}
                </div>}
              </li>;
            })}
          </ul>

          {finishBlockers.length > 0 && activePeriod.status !== 'submitted' && activePeriod.status !== 'completed' && <div className="mt-3 rounded-xl bg-warn/5 p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Still needed before you can finish this month</p>
            <ul className="mt-1 list-inside list-disc">{finishBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </div>}
          {periodReadOnly && <p className="mt-3 rounded-xl bg-ok/5 p-3 text-xs text-muted">This month is read-only while it is with the FinTax team. You can still view and download its documents.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">{activePeriod.documentIds.length} document{activePeriod.documentIds.length === 1 ? '' : 's'} in this month</span>
            <Button variant="primary" className="min-h-11 rounded-full" disabled={!canFinishPeriod} onClick={onFinishPeriod}>Finish month</Button>
          </div>
        </>}
        {quotaWarning && <p role="status" className="mt-3 rounded-lg bg-warn/10 p-2 text-xs text-ink">This browser is using over 80% of its available storage. Download important originals and free browser space before adding more files.</p>}
        {storageError && <p role="alert" className="mt-3 rounded-lg bg-bad/10 p-2 text-xs text-bad">Local storage error: {storageError}</p>}
      </section>

      <section id="client-overview" aria-label="Overview" className="scroll-mt-24">
        <StatFlow items={statCards.map((item) => ({ ...item }))} activeKey={documentFilter} onSelect={(key) => {
          if (key === 'all' || key === 'processing' || key === 'attention' || key === 'approved') onDocumentFilterChange(key);
          onOpenDocuments();
        }} />
      </section>

      <section className="grid scroll-mt-24 gap-4 lg:grid-cols-3" aria-label="Next steps">
        <motion.div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="size-4 text-warn" />{t3(language, 'Missing documents', 'Fehlende Unterlagen', 'مستندات ناقصة')}</p>
          <ul className="mt-3 space-y-2">{activeClient.missingDocuments.length ? activeClient.missingDocuments.map((missing) => <li key={missing} className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs"><span className="size-1.5 rounded-full bg-warn" />{missing}</li>) : <li className="text-xs text-muted">{t3(language, 'Nothing missing — great!', 'Nichts fehlt — super!', 'لا شيء ناقص — ممتاز!')}</li>}</ul>
          <Button size="sm" variant="primary" className="mt-4 rounded-full" icon={<Upload className="size-3.5" />} onClick={onOpenUpload}>{t3(language, 'Upload now', 'Jetzt hochladen', 'ارفع الآن')}</Button>
        </motion.div>
        <motion.div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5 lg:col-span-2" id="client-demo-tasks">
          <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-violet" />{t3(language, 'Your tasks', 'Ihre Aufgaben', 'مهامك')}</p>
            <button type="button" onClick={() => setTasksExpanded((expanded) => !expanded)} aria-expanded={tasksExpanded} className="flex items-center gap-1 text-xs text-violet">{tasksExpanded ? t3(language, 'Less', 'Weniger', 'أقل') : t3(language, 'All', 'Alle', 'الكل')}</button></div>
          <ul className="mt-3 space-y-2">{activeClient.tasks.slice(0, tasksExpanded ? undefined : 2).map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-bg/60 px-3 py-2.5 text-xs">
              <CalendarClock className="size-4 text-violet" /><span className="min-w-40 flex-1 font-medium">{task.title}</span><span className="text-muted">{task.dueDate} · {task.owner}</span><Badge tone={task.complete ? 'ok' : 'warn'}>{task.complete ? 'Complete' : 'Open'}</Badge>
            </li>
          ))}</ul>
        </motion.div>
      </section>

      {activity.length > 0 && <section id="client-advisor-updates" className="scroll-mt-24 overflow-hidden rounded-3xl border border-white bg-white/80 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 border-b border-ink/5 px-3 py-4 sm:px-5"><MessageSquareText className="size-4 shrink-0 text-violet" /><div className="min-w-0"><h2 className="font-semibold">{t3(language, 'Advisor updates', 'Neuigkeiten Ihrer Beratung', 'تحديثات المستشار')}</h2><p className="text-xs text-muted">Demo notifications for this client account only</p></div></div>
        <ul className="divide-y divide-ink/5">{activity.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-3 px-3 py-4 sm:px-5">
            <span className={`mt-1 grid size-8 place-items-center rounded-lg ${item.status === 'approved' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>{item.status === 'approved' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span>
            <div className="min-w-48 flex-1"><p className="text-sm font-medium">{item.status === 'approved' ? 'Document approved' : item.status === 'rejected' || item.status === 'password_required' ? 'Replacement requested' : item.status === 'needs_information' ? 'More information requested' : 'Action required'} · {item.name}</p>
              <p className="mt-1 text-xs text-muted">{item.clientRequest?.reason ?? item.reviewHistory?.at(-1)?.details ?? item.note} · {new Date(item.clientRequest?.createdAt ?? item.reviewHistory?.at(-1)?.at ?? item.createdAt).toLocaleString()}</p>
              {item.clientRequest && !item.clientRequest.resolvedAt && <div className="mt-3 flex flex-wrap gap-2">
                <input value={responses[item.id] ?? ''} onChange={(event) => setResponses((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Write a response for your advisor" aria-label={`Response for ${item.name}`} className="h-9 min-w-52 flex-1 rounded-full border border-ink/10 bg-white px-4 text-xs" />
                <Button size="sm" className="rounded-full" disabled={!responses[item.id]?.trim()} onClick={() => { onRespondToRequest(item.id, responses[item.id].trim()); setResponses((current) => ({ ...current, [item.id]: '' })); }}>Send response</Button>
                <Button size="sm" className="rounded-full" onClick={() => onUploadReplacement(item)}>Upload replacement</Button>
              </div>}
              {item.clientRequest?.response && <p className="mt-2 text-xs text-violet">Your response: {item.clientRequest.response}</p>}
            </div>
            <Badge tone={item.status === 'approved' ? 'ok' : 'warn'}>{item.status === 'approved' ? 'Approved' : item.status.replace(/_/g, ' ')}</Badge>
          </li>
        ))}</ul>
      </section>}
    </>
  );
}
