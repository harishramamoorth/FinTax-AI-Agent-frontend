import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock,
  ChevronRight,
  FileSearch,
  ListChecks,
  Mail,
  MessageSquareText,
  Receipt,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import type { AssistantLanguage } from '../clientAssistant';
import type { DemoCategory, DemoDocument } from '../../shared/demoWorkflow';
import type { MonthlyPeriod } from '../../shared/storage/models';
import type { ClientDemoProfile } from '../../shared/clientDemoData';
import { t3 } from '../clientPageUtils';
import { portalText, usePortalLanguage } from '../../shared/portalLanguage';

type DocumentFilter = 'all' | 'processing' | 'attention' | 'approved';
export type ClientArea = 'formation' | 'payroll' | 'accounting' | 'correspondence';

interface ClientDashboardPageProps {
  activeClient: ClientDemoProfile;
  activeClientEmail: string;
  advisorFirm?: string;
  advisorId?: string;
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
  onOpenUpload: (area?: ClientArea, category?: DemoCategory) => void;
  onSelectPeriod: (periodId: string) => void;
  onSetNotApplicable: (periodId: string, key: string, reason: string, clientId: string, state: 'missing' | 'not_applicable') => void;
  onFinishPeriod: () => void;
  onRespondToRequest: (documentId: string, response: string) => void;
  onUploadReplacement: (document: DemoDocument) => void;
  onUploadForRequest?: (document: DemoDocument) => void;
}

const attentionStatuses = ['needs_information', 'rejected', 'action_required', 'password_required'];

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 550);
      setShown(Math.round(value * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce]);

  return <>{shown}</>;
}

export default function ClientDashboardPage({
  activeClient,
  activeClientEmail,
  advisorFirm = 'FinTax Consulting',
  advisorId = '7',
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
  onFinishPeriod,
  onRespondToRequest,
  onUploadReplacement,
  onUploadForRequest,
}: ClientDashboardPageProps) {
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'open' | 'done'>('open');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const taskTouchStartX = useRef<number | null>(null);
  const portalLang = usePortalLanguage((state) => state.language);

  const processing = allDocuments.filter((document) => document.status === 'processing' || document.status === 'review');
  const attention = allDocuments.filter((document) => attentionStatuses.includes(document.status));
  const approved = allDocuments.filter((document) => document.status === 'approved');
  const activity = allDocuments
    .filter((document) => ['approved', ...attentionStatuses].includes(document.status) || Boolean(document.clientRequest))
    .sort((left, right) => Number(attentionStatuses.includes(right.status)) - Number(attentionStatuses.includes(left.status)));
  const openTasks = activeClient.tasks.filter((task) => !task.complete);
  const tasksDueThisWeek = openTasks.filter((task) => {
    const due = new Date(`${task.dueDate}T00:00:00`).getTime();
    return due <= Date.now() + 7 * 24 * 60 * 60 * 1000;
  }).length;
  const orderedTasks = [...activeClient.tasks].sort((left, right) => Number(left.complete) - Number(right.complete));

  const payrollDocs = allDocuments.filter((d) => d.category === 'payroll' || d.category === 'timesheet' || d.area === 'payroll');
  const accountingDocs = allDocuments.filter((d) => ['purchase_invoice', 'sales_invoice', 'receipt', 'bank_statement', 'cash_book'].includes(d.category) || d.area === 'accounting');
  const correspondenceDocs = allDocuments.filter((d) => ['correspondence', 'other_correspondence', 'contract', 'other'].includes(d.category) || d.area === 'correspondence');
  const formationDocs = allDocuments.filter((d) => ['company_formation', 'commercial_register', 'identity_document'].includes(d.category) || d.area === 'formation');
  const checklistCompleteCount = activePeriod?.checklist.filter((item) => item.state === 'uploaded' || item.state === 'not_applicable').length ?? 0;
  const checklistTotal = activePeriod?.checklist.length ?? 0;
  const checklistProgress = checklistTotal ? Math.round((checklistCompleteCount / checklistTotal) * 100) : 0;

  const statCards = [
    { key: 'all', label: t3(language, 'Documents', 'Dokumente', 'المستندات'), compactLabel: t3(language, 'Files', 'Belege', 'ملفات'), hint: t3(language, 'Fictional records for this company', 'Fiktive Belege für dieses Unternehmen', 'سجلات خيالية لهذه الشركة'), value: allDocuments.length, icon: ListChecks, from: '#c9a24b', to: '#c9a24b' },
    { key: 'processing', label: t3(language, 'In review', 'In Prüfung', 'قيد المراجعة'), compactLabel: t3(language, 'Review', 'Prüfung', 'مراجعة'), hint: t3(language, 'Processing or waiting for staff review', 'In Bearbeitung oder Teamprüfung', 'قيد المعالجة أو انتظار مراجعة الفريق'), value: processing.length, icon: FileSearch, from: '#c9a24b', to: '#c9a24b' },
    { key: 'attention', label: t3(language, 'Needs you', 'Ihre Aktion', 'يحتاج إجراءك'), compactLabel: t3(language, 'Action', 'Aktion', 'إجراء'), hint: t3(language, 'Requests or issues need a response', 'Anfragen oder Probleme benötigen eine Antwort', 'تحتاج الطلبات أو المشكلات إلى رد'), value: attention.length, icon: CircleAlert, from: '#c9a24b', to: '#c9a24b' },
    { key: 'approved', label: t3(language, 'Approved', 'Freigegeben', 'معتمد'), compactLabel: t3(language, 'Done', 'Fertig', 'معتمد'), hint: t3(language, 'Reviewed and approved demo records', 'Geprüfte und freigegebene Demobelege', 'سجلات تجريبية تمت مراجعتها واعتمادها'), value: approved.length, icon: CheckCircle2, from: '#c9a24b', to: '#c9a24b' },
  ] as const;

  return (
    <>
      <section aria-label="Client dashboard greeting" className="relative overflow-hidden rounded-2xl border border-[#22375d] bg-gradient-to-br from-[#0f1f3d] via-[#18345d] to-[#244b77] p-5 text-white shadow-[0_16px_38px_-24px_rgba(15,31,61,.65)] sm:rounded-3xl sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-20 size-56 rounded-full border-[28px] border-white/[.04]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#e3c36d]">
                {portalText(portalLang, 'platformProvidedBy')}
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/90">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {portalText(portalLang, 'activeClientBadge')}
              </span>
            </div>
            <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting},{' '}
              <span className="text-[#e3c36d]">{activeClient.name || activeClient.company}</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-white/75">
              {t3(language, 'Your documents and monthly tasks, all in one place.', 'Ihre Dokumente und monatlichen Aufgaben an einem Ort.', 'مستنداتك ومهامك الشهرية في مكان واحد.')}
              <span className="hidden sm:inline"> · {advisorFirm} · {t3(language, 'Advisor ID', 'Berater-ID', 'رقم المستشار')}: {advisorId}</span>
            </p>
            <p className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium text-white">
              <CalendarClock className="size-4 text-[#F0D18B]" />
              {t3(language, 'Next step:', 'Nächster Schritt:', 'الخطوة التالية:')}
              <span className="font-semibold">{t3(language, `${tasksDueThisWeek} tasks due this week`, `${tasksDueThisWeek} Aufgaben diese Woche fällig`, `${tasksDueThisWeek} مهام مستحقة هذا الأسبوع`)}</span>
            </p>
          </div>
          <button type="button" onClick={() => onOpenUpload('accounting')} className="client-main-upload-action inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0B7F99] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#096A80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <Upload className="size-4" />
            {t3(language, 'Upload a document', 'Dokument hochladen', 'رفع مستند')}
          </button>
        </div>
      </section>

      <section id="client-overview" aria-label="Document status filters" className="scroll-mt-24">
        <div className="grid grid-cols-4 gap-2 rounded-2xl border border-[#E6E0D0] bg-white p-2 shadow-sm sm:gap-3 sm:p-3">
          {statCards.map(({ key, compactLabel, label, value, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={documentFilter === key}
              aria-label={`${label}: ${value}. Filter documents by ${label}.`}
              onClick={() => {
                if (key === 'all' || key === 'processing' || key === 'attention' || key === 'approved') onDocumentFilterChange(key);
                onOpenDocuments();
              }}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F99] ${documentFilter === key ? 'bg-[#B07A2A]/10 text-[#0F1B3D]' : 'text-[#4A5468] hover:bg-[#F7F4EC]'}`}
            >
              <span className="flex items-center gap-1.5">
                <Icon className={`size-4 shrink-0 ${documentFilter === key ? 'text-[#B07A2A]' : 'text-[#4A5468]'}`} />
                <span className="text-base font-semibold leading-none text-[#0F1B3D]"><CountUp value={value} /></span>
              </span>
              <span className="w-full truncate text-[11px] font-medium">{compactLabel}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Upload categories" className="client-category-grid grid grid-cols-2 gap-2 min-[640px]:gap-3 xl:grid-cols-4">
        {[
          { area: 'formation' as const, title: t3(language, 'Company documents', 'Unternehmensunterlagen', 'مستندات الشركة'), description: t3(language, 'Setup and registration documents', 'Gründungs- und Registerunterlagen', 'مستندات التأسيس والتسجيل'), count: formationDocs.length, icon: Building2, accent: 'border-s-[#c9a24b]', iconTone: 'bg-[#f8f2e3] text-[#9a7424]' },
          { area: 'payroll' as const, title: t3(language, 'Payroll', 'Lohnabrechnung', 'الرواتب'), description: t3(language, 'Payslips and timesheets', 'Lohnabrechnungen und Stundenzettel', 'قسائم الرواتب وسجلات الدوام'), count: payrollDocs.length, icon: Users, accent: 'border-s-[#4d8c74]', iconTone: 'bg-[#eaf4ef] text-[#34725c]' },
          { area: 'accounting' as const, title: t3(language, 'Accounting', 'Buchhaltung', 'المحاسبة'), description: t3(language, 'Monthly · bank statements, invoices, cash and fuel receipts', 'Monatlich · Kontoauszüge, Rechnungen, Kassen- und Tankbelege', 'شهريًا · كشوف الحساب والفواتير والإيصالات وإيصالات الوقود'), count: accountingDocs.length, icon: Receipt, accent: 'border-s-[#5579ae]', iconTone: 'bg-[#edf2f9] text-[#3d6094]' },
          { area: 'correspondence' as const, title: t3(language, 'Correspondence', 'Korrespondenz', 'المراسلات'), description: t3(language, 'Formerly “Other” · letters from authorities, lease agreements and other documents', 'Früher „Sonstiges“ · Behördenschreiben, Mietverträge und weitere Unterlagen', 'كانت تُسمى «أخرى» · خطابات الجهات الرسمية وعقود الإيجار ومستندات أخرى'), count: correspondenceDocs.length, icon: Mail, accent: 'border-s-[#9a6d9c]', iconTone: 'bg-[#f5eef6] text-[#805585]' },
        ].map(({ area, title, description, count, icon: Icon, accent, iconTone }) => (
          <button key={area} type="button" onClick={() => onOpenUpload(area)} aria-label={`${title}: ${count} files. Upload in this category.`} className={`client-category-card flex min-h-28 min-w-0 flex-col items-stretch rounded-2xl border border-[#e8e2d2] border-s-4 ${accent} bg-white p-3 text-start shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F99] sm:min-h-40 sm:p-5`}>
            <div className="flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconTone}`}><Icon className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xs font-semibold leading-4 text-[#0f1f3d] sm:text-sm">{title}</h2>
                <p className="client-category-description mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
              </div>
            </div>
            <span className="mt-auto pt-2 text-[11px] text-slate-500">{count} {t3(language, count === 1 ? 'file' : 'files', count === 1 ? 'Datei' : 'Dateien', 'ملفات')}</span>
          </button>
        ))}
      </section>

      <section id="client-month" className="scroll-mt-24 rounded-2xl border border-[#e8e2d2] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6" aria-labelledby="client-month-title">
        <div className="client-month-header flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#5579ae]">{t3(language, 'Your monthly checklist', 'Ihre Monatsübersicht', 'قائمة مهامك الشهرية')}</p>
            <h2 id="client-month-title" className="mt-1 font-serif text-lg font-semibold text-[#0f1f3d]">
              {activePeriod ? new Date(activePeriod.year, activePeriod.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' }) : 'No month available'}
            </h2>
            <p className="mt-1 text-xs text-muted">{t3(language, 'Upload the required items below, then submit the month for review.', 'Laden Sie die erforderlichen Unterlagen hoch und senden Sie den Monat zur Prüfung.', 'ارفع المستندات المطلوبة أدناه ثم أرسل الشهر للمراجعة.')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activePeriod && (
              <Badge tone={activePeriod.status === 'completed' ? 'ok' : activePeriod.status === 'open' ? 'warn' : 'cyan'}>
                {activePeriod.status.replace(/_/g, ' ')}
              </Badge>
            )}
            <button type="button" aria-label="Choose a month" aria-haspopup="dialog" onClick={() => setPeriodPickerOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#E6E0D0] bg-white text-[#4A5468] hover:bg-[#F7F4EC]">
              <CalendarClock className="size-4" />
            </button>
          </div>
        </div>

        {activePeriod && <>
          {periodPickerOpen && <div className="client-period-picker-backdrop fixed inset-0 z-[85] flex items-end justify-center bg-[#0B1220]/45 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPeriodPickerOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="client-period-picker-title" className="client-period-picker-sheet w-full rounded-t-3xl border border-[#E6E0D0] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl">
              <div className="flex items-center justify-between gap-3"><h3 id="client-period-picker-title" className="font-serif text-lg font-semibold text-[#0F1B3D]">{t3(language, 'Choose a month', 'Monat auswählen', 'اختر شهرًا')}</h3><button type="button" aria-label="Close month picker" onClick={() => setPeriodPickerOpen(false)} className="grid size-11 place-items-center rounded-xl hover:bg-[#F7F4EC]"><X className="size-4" /></button></div>
              <ul className="mt-2 max-h-[50dvh] space-y-1 overflow-y-auto">
                {clientPeriods.map((period) => <li key={period.id}><button type="button" aria-current={period.id === activePeriod.id ? 'true' : undefined} onClick={() => { onSelectPeriod(period.id); setPeriodPickerOpen(false); }} className={`min-h-11 w-full rounded-xl px-3 text-start text-sm ${period.id === activePeriod.id ? 'bg-[#0B7F99]/10 font-semibold text-[#0F1B3D]' : 'text-[#4A5468] hover:bg-[#F7F4EC]'}`}>{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}<span className="float-end text-xs">{period.status.replace(/_/g, ' ')}</span></button></li>)}
              </ul>
            </section>
          </div>}
          <div className="sticky top-0 z-10 mt-4 rounded-xl border border-[#E6E0D0] bg-white/95 p-3.5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-[#0f1f3d]">{t3(language, `${checklistCompleteCount} of ${checklistTotal} items complete`, `${checklistCompleteCount} von ${checklistTotal} erledigt`, `${checklistCompleteCount} من ${checklistTotal} مكتملة`)}</span>
              <span className="font-semibold text-[#5579ae]">{checklistProgress}%</span>
            </div>
            <div role="progressbar" aria-label="Monthly checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={checklistProgress} className="mt-2 h-2 overflow-hidden rounded-full bg-[#dfe6ef]">
              <div className="h-full rounded-full bg-[#5579ae] transition-[width]" style={{ width: `${checklistProgress}%` }} />
            </div>
          </div>
          <ul className="client-checklist-list mt-4 divide-y divide-[#eee9df] rounded-2xl border border-[#eee9df]">
            {activePeriod.checklist.filter((item) => item.state !== 'not_applicable').map((item) => {
              const itemCategory = item.key as DemoCategory;
              const reason = item.naReason ?? '';

              const isUploaded = item.state === 'uploaded';
              const isNotApplicable = item.state === 'not_applicable';
              const badgeTone = isUploaded ? 'ok' : isNotApplicable ? 'cyan' : 'bad';
              const statusLabel = isUploaded ? t3(language, 'Added to this month', 'Für diesen Monat hochgeladen', 'تمت الإضافة لهذا الشهر') : isNotApplicable ? `${t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}${item.naReason ? `: ${item.naReason}` : ''}` : t3(language, 'Please upload this document', 'Bitte laden Sie dieses Dokument hoch', 'يرجى رفع هذا المستند');

              return (
                <li key={item.key} className="flex flex-col gap-2 px-3 py-3.5 sm:flex-row sm:items-center">
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className={`client-checklist-status-dot size-2.5 rounded-full shrink-0 ${isUploaded ? 'client-checklist-status-dot--uploaded bg-emerald-500' : isNotApplicable ? 'client-checklist-status-dot--not-needed bg-slate-400' : 'client-checklist-status-dot--pending bg-[#c66b53]'}`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-ink">{item.label} {item.required ? '· required' : '· optional'}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{statusLabel}</span>
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {!isNotApplicable && <Badge tone={badgeTone}>{isUploaded ? t3(language, 'Added', 'Erledigt', 'تم') : t3(language, 'Needed', 'Offen', 'مطلوب')}</Badge>}
                    {!periodReadOnly && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" className="min-h-11 rounded-xl text-sm" onClick={() => onOpenUpload(undefined, itemCategory)}>
                          Upload
                        </Button>
                        {item.state !== 'uploaded' && (
                          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E6E0D0] px-3 text-sm text-[#1F2A44]">
                            <input
                              type="checkbox"
                              checked={isNotApplicable}
                              aria-label={`${t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}: ${item.label}`}
                              onChange={(event) => onSetNotApplicable(activePeriod.id, item.key, event.target.checked ? (reason || 'Not needed') : '', activeClientEmail, event.target.checked ? 'not_applicable' : 'missing')}
                              className="size-4 accent-[#0B7F99]"
                            />
                            {t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {activePeriod.checklist.some((item) => item.state === 'not_applicable') && <details className="client-not-needed-accordion mt-2 rounded-xl border border-[#E6E0D0] bg-white px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-[#4A5468]">{t3(language, 'Marked not needed', 'Als nicht erforderlich markiert', 'تم تحديده كغير مطلوب')} ({activePeriod.checklist.filter((item) => item.state === 'not_applicable').length})</summary>
            <ul className="divide-y divide-[#eee9df]">
              {activePeriod.checklist.filter((item) => item.state === 'not_applicable').map((item) => <li key={item.key} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-xs font-medium text-[#1F2A44]">{item.label}<span className="block truncate text-[11px] font-normal text-[#4A5468]">{item.naReason || t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}</span></span>
                <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-[#E6E0D0] px-3 text-xs text-[#4A5468]">
                  <input type="checkbox" checked aria-label={`${t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}: ${item.label}`} onChange={() => onSetNotApplicable(activePeriod.id, item.key, '', activeClientEmail, 'missing')} className="size-4 accent-[#0B7F99]" />
                  {t3(language, 'Not needed', 'Nicht erforderlich', 'غير مطلوب')}
                </label>
              </li>)}
            </ul>
          </details>}

          {finishBlockers.length > 0 && activePeriod.status !== 'submitted' && activePeriod.status !== 'completed' && (
            <details className="client-warning-panel mt-3 rounded-xl border border-[#E6E0D0] bg-[#FAF9F6] p-3 text-sm text-[#4A5468]">
              <summary className="client-warning-title cursor-pointer font-semibold">{t3(language, `Submission is blocked (${finishBlockers.length})`, `Einreichung blockiert (${finishBlockers.length})`, `الإرسال متوقف (${finishBlockers.length})`)}</summary>
              <ul className="mt-1 list-inside list-disc">{finishBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
            </details>
          )}
          {periodReadOnly && (
            <p className="mt-3 rounded-xl bg-ok/5 p-3 text-xs text-muted">
              This month is read-only while under review with the FinTax team.
            </p>
          )}
          <div className="client-month-submit-bar mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">{activePeriod.documentIds.length} document{activePeriod.documentIds.length === 1 ? '' : 's'} in this month</span>
            {canFinishPeriod && <Button variant="primary" className="min-h-11 rounded-xl bg-[#0B7F99] text-white hover:bg-[#096A80]" onClick={onFinishPeriod}>
              {t3(language, 'Submit month for review', 'Monat zur Prüfung senden', 'أرسل الشهر للمراجعة')}
            </Button>}
          </div>
        </>}
        {quotaWarning && <p role="status" className="mt-3 rounded-lg bg-warn/10 p-2 text-xs text-ink">This browser is using over 80% of its available storage.</p>}
        {storageError && <p role="alert" className="mt-3 rounded-lg bg-bad/10 p-2 text-xs text-bad">Local storage error: {storageError}</p>}
      </section>

      <section id="client-demo-tasks" className="scroll-mt-24 rounded-2xl border border-[#e8e2d2] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6" aria-labelledby="client-tasks-title">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f7f4ec] text-[#9a7424]"><ListChecks className="size-5" /></span>
            <div className="min-w-0">
              <h2 id="client-tasks-title" className="font-serif text-lg font-semibold text-[#0f1f3d]">{t3(language, 'Your tasks', 'Ihre Aufgaben', 'مهامك')}</h2>
              <p className="text-xs text-slate-500">{t3(language, `${activeClient.tasks.filter((task) => !task.complete).length} open`, `${activeClient.tasks.filter((task) => !task.complete).length} offen`, `${activeClient.tasks.filter((task) => !task.complete).length} مفتوحة`)}</p>
            </div>
          </div>
        </div>
        <div className="client-task-segment mt-3 grid grid-cols-2 rounded-xl bg-[#F7F4EC] p-1" role="tablist" aria-label="Task status">
          {(['open', 'done'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={taskFilter === value} onClick={() => setTaskFilter(value)}
            className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${taskFilter === value ? 'bg-white text-[#0F1B3D] shadow-sm' : 'text-[#4A5468]'}`}>
            {value === 'open' ? `${t3(language, 'Open', 'Offen', 'مفتوحة')} (${openTasks.length})` : `${t3(language, 'Done', 'Erledigt', 'مكتملة')} (${activeClient.tasks.length - openTasks.length})`}
          </button>)}
        </div>
        {(taskFilter === 'open' ? openTasks : orderedTasks.filter((task) => task.complete)).length ? (
          <ul className="client-task-list mt-1 divide-y divide-[#eee9df]">
            {((tasksExpanded ? (taskFilter === 'open' ? openTasks : orderedTasks.filter((task) => task.complete)) : (taskFilter === 'open' ? openTasks : orderedTasks.filter((task) => task.complete)).slice(0, 4))).map((task) => (
              <li key={task.id} className={`client-task-row flex min-w-0 items-center gap-2 py-2 ${!task.complete && new Date(`${task.dueDate}T00:00:00`).getTime() < new Date().setHours(0, 0, 0, 0) ? 'client-task-row--overdue bg-[#C9372C]/5' : ''}`}
                onTouchStart={(event) => { taskTouchStartX.current = event.touches[0]?.clientX ?? null; }}
                onTouchEnd={(event) => {
                  const startX = taskTouchStartX.current;
                  const endX = event.changedTouches[0]?.clientX;
                  taskTouchStartX.current = null;
                  if (!task.complete && startX !== null && endX !== undefined && startX - endX > 56) onOpenUpload('accounting');
                }}>
                <button type="button" onClick={() => setSelectedTaskId(task.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-start">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${task.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {task.complete ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-sm font-medium leading-5 text-[#0f1f3d]">{task.title}</span>
                    <span className={`block truncate text-[11px] ${!task.complete && new Date(`${task.dueDate}T00:00:00`).getTime() < new Date().setHours(0, 0, 0, 0) ? 'font-semibold text-[#C9372C]' : 'text-slate-500'}`}>{t3(language, 'Due', 'Fällig', 'الموعد')}: {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(language === 'de' ? 'de-DE' : language === 'ar' ? 'ar-AE' : 'en-US', { month: 'short', day: 'numeric' })} · {task.owner}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-400" />
                </button>
                {!task.complete && <button type="button" aria-label={`${t3(language, 'Upload now', 'Jetzt hochladen', 'ارفع الآن')}: ${task.title}`} title={t3(language, 'Upload now', 'Jetzt hochladen', 'ارفع الآن')} onClick={() => onOpenUpload('accounting')} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#e8e2d2] text-[#0B7F99]"><Upload className="size-4" /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-500">{taskFilter === 'open' ? t3(language, 'No tasks right now.', 'Derzeit keine Aufgaben.', 'لا توجد مهام حاليًا.') : t3(language, 'No completed tasks yet.', 'Noch keine erledigten Aufgaben.', 'لا توجد مهام مكتملة بعد.')}</p>}
        {(taskFilter === 'open' ? openTasks : orderedTasks.filter((task) => task.complete)).length > 4 && <button type="button" className="mt-2 min-h-11 w-full text-sm font-medium text-[#0B7F99]" onClick={() => setTasksExpanded((expanded) => !expanded)}>{tasksExpanded ? t3(language, 'Show fewer', 'Weniger anzeigen', 'عرض أقل') : t3(language, 'Show all', 'Alle anzeigen', 'عرض الكل')}</button>}
      </section>

      {/* Advisor requests and document updates */}
      {activity.length > 0 && (
        <section id="client-advisor-updates" className="scroll-mt-24 overflow-hidden rounded-2xl border border-[#e8e2d2] bg-white shadow-sm sm:rounded-3xl">
          <div className="flex items-center gap-2 border-b border-[#eee9df] px-4 py-4 sm:px-6">
            <MessageSquareText className="size-4 shrink-0 text-[#9a7424]" />
            <div className="min-w-0">
              <h2 className="font-semibold">{t3(language, 'Advisor updates & requests', 'Neuigkeiten Ihrer Beratung', 'تحديثات المستشار')}</h2>
              <p className="text-xs text-muted">Upload directly against advisor requests; status will update to "pending review" for staff confirmation.</p>
            </div>
          </div>
          <ul className="divide-y divide-ink/5">
            {activity.map((item) => {
              const requestPendingReview = item.clientRequest?.status === 'pending_review';
              const requestCompleted = Boolean(item.clientRequest?.resolvedAt) && !requestPendingReview;

              return (
                <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-4 sm:px-6">
                  <span className={`mt-1 grid size-8 place-items-center rounded-lg ${item.status === 'approved' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}>
                    {item.status === 'approved' ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
                  </span>
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-medium">
                      {item.status === 'approved' ? 'Document approved' : item.status === 'rejected' || item.status === 'password_required' ? 'Replacement requested' : item.status === 'needs_information' ? 'More information requested' : 'Action required'} · {item.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {item.clientRequest?.reason ?? item.reviewHistory?.at(-1)?.details ?? item.note} · {new Date(item.clientRequest?.createdAt ?? item.reviewHistory?.at(-1)?.at ?? item.createdAt).toLocaleString()}
                    </p>

                    {item.clientRequest && (
                      <div className="mt-3 flex flex-wrap gap-2 items-center">
                        {!item.clientRequest.resolvedAt ? (
                          <>
                            <input
                              value={responses[item.id] ?? ''}
                              onChange={(event) => setResponses((current) => ({ ...current, [item.id]: event.target.value }))}
                              placeholder="Write a response or note for your advisor"
                              aria-label={`Response for ${item.name}`}
                              className="h-9 min-w-52 flex-1 rounded-full border border-ink/10 bg-white px-4 text-xs"
                            />
                            <Button
                              size="sm"
                              className="rounded-full"
                              disabled={!responses[item.id]?.trim()}
                              onClick={() => {
                                onRespondToRequest(item.id, responses[item.id].trim());
                                setResponses((current) => ({ ...current, [item.id]: '' }));
                              }}
                            >
                              Send note
                            </Button>
                            {/* Direct upload against request */}
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<Upload className="size-3.5" />}
                              className="rounded-full"
                              onClick={() => {
                                if (onUploadForRequest) onUploadForRequest(item);
                                else onUploadReplacement(item);
                              }}
                            >
                              Upload for this request
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full font-medium">
                              <Clock className="size-3" /> Pending staff confirmation
                            </span>
                            <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => onUploadReplacement(item)}>
                              Upload another version
                            </Button>
                          </div>
                        )}
                        {selectedTaskId && (() => {
                          const selectedTask = activeClient.tasks.find((task) => task.id === selectedTaskId);
                          if (!selectedTask) return null;
                          return <div className="client-task-detail-backdrop fixed inset-0 z-[60] flex items-end bg-[#0B1220]/45 sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTaskId(null); }}>
                            <section role="dialog" aria-modal="true" aria-labelledby="client-task-detail-title" className="w-full rounded-t-3xl border border-[#E6E0D0] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl">
                              <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 id="client-task-detail-title" className="font-serif text-lg font-semibold text-[#0F1B3D]">{selectedTask.title}</h2><p className="mt-2 text-sm text-[#4A5468]">{t3(language, 'Due', 'Fällig', 'الموعد')}: {new Date(`${selectedTask.dueDate}T00:00:00`).toLocaleDateString()} · {selectedTask.owner}</p></div><button type="button" aria-label="Close task details" onClick={() => setSelectedTaskId(null)} className="grid size-11 place-items-center rounded-xl hover:bg-[#F7F4EC]"><X className="size-4" /></button></div>
                              {!selectedTask.complete && <Button variant="primary" icon={<Upload className="size-4" />} className="mt-5 min-h-12 w-full rounded-xl bg-[#0B7F99] text-white" onClick={() => { setSelectedTaskId(null); onOpenUpload('accounting'); }}>{t3(language, 'Upload now', 'Jetzt hochladen', 'ارفع الآن')}</Button>}
                            </section>
                          </div>;
                        })()}
                      </div>
                    )}
                    {item.clientRequest?.response && <p className="mt-2 text-xs text-violet">Your submitted note: {item.clientRequest.response}</p>}
                  </div>
                  <Badge tone={item.status === 'approved' ? 'ok' : item.clientRequest?.status === 'pending_review' ? 'cyan' : 'warn'}>
                    {item.clientRequest?.status === 'pending_review' ? 'Pending review' : item.status === 'approved' ? 'Approved' : item.status.replace(/_/g, ' ')}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
