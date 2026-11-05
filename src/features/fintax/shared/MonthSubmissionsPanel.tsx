import { useMemo, useState } from 'react';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { useDemoDocumentsStore, type DemoRoleAssignment } from '@/stores/demoDocumentsStore';
import { DEMO_CLIENTS } from './demoAccounts';
import { analyzeMonth } from './storage/analyzeMonth';
import { documentsVisibleTo, periodsVisibleTo } from './storage/selectors';
import { accountingCsv, canTransitionDocumentStatus, type DemoDocument, type DemoFields } from './demoWorkflow';
import type { MonthAnalysisFinding, MonthlyPeriod } from './storage/models';

type ReviewerRole = 'staff' | 'admin';
type EditableField = keyof DemoFields;

const editableFields: EditableField[] = ['documentDate', 'reference', 'counterparty', 'netAmount', 'vatRate', 'vatAmount', 'grossAmount', 'description'];

export default function MonthSubmissionsPanel({ role, userName, onOpenDocument }: {
  role: ReviewerRole;
  userName: string;
  onOpenDocument: (document: DemoDocument) => void;
}) {
  const allPeriods = useDemoDocumentsStore((state) => state.periods);
  const allDocuments = useDemoDocumentsStore((state) => state.documents);
  const roleAssignments = useDemoDocumentsStore((state) => state.roleAssignments);
  const periods = useMemo(() => periodsVisibleTo(allPeriods, role, userName), [allPeriods, role, userName]);
  const documents = useMemo(() => documentsVisibleTo(allDocuments, role, userName), [allDocuments, role, userName]);
  const reviewMonth = useDemoDocumentsStore((state) => state.reviewMonth);
  const resolveMonthFinding = useDemoDocumentsStore((state) => state.resolveMonthFinding);
  const updateFields = useDemoDocumentsStore((state) => state.updateFields);
  const recordReview = useDemoDocumentsStore((state) => state.recordReview);
  const addFollowUpTask = useDemoDocumentsStore((state) => state.addFollowUpTask);
  const recordExport = useDemoDocumentsStore((state) => state.recordExport);
  const exportsEnabled = useDemoDocumentsStore((state) => state.settings.exportsEnabled);
  const [selectedId, setSelectedId] = useState('');
  const [periodView, setPeriodView] = useState<'monthly' | 'yearly'>('monthly');
  const [mobilePane, setMobilePane] = useState<'periods' | 'review'>('periods');
  const [yearFilter, setYearFilter] = useState('all');
  const [expandedYearClient, setExpandedYearClient] = useState('');
  const [requestText, setRequestText] = useState('');
  const [notice, setNotice] = useState('');

  const visiblePeriods = useMemo(() => periods
    .filter((period) => role === 'admin' || ['submitted', 'in_review', 'changes_requested', 'completed'].includes(period.status))
    .sort((left, right) => right.year - left.year || right.month - left.month || (right.submittedAt ?? '').localeCompare(left.submittedAt ?? '')), [periods, role]);
  const years = [...new Set(visiblePeriods.map((period) => period.year))].sort((left, right) => right - left);
  const filteredPeriods = yearFilter === 'all'
    ? visiblePeriods
    : visiblePeriods.filter((period) => period.year === Number(yearFilter));
  const selected = filteredPeriods.find((period) => period.id === selectedId) ?? filteredPeriods[0];
  const selectedDocuments = selected ? documents.filter((document) =>
    selected.documentIds.includes(document.id) || document.periodId === selected.id,
  ) : [];
  const analyzedPeriod = selected ? {
    ...selected,
    documentIds: [...new Set([...selected.documentIds, ...selectedDocuments.map((document) => document.id)])],
  } : undefined;
  const clientProfile = selected
    ? DEMO_CLIENTS.find((item) => item.email === selected.clientId || item.id === selected.clientId)
      ?? roleAssignments.find((item: DemoRoleAssignment) => item.role === 'client' && (item.email === selected.clientId || item.id === selected.clientId))
    : undefined;
  const client = clientProfile ? {
    company: 'company' in clientProfile ? clientProfile.company : clientProfile.name,
    currency: 'currency' in clientProfile ? clientProfile.currency : 'EUR',
  } : selected ? { company: selected.clientId, currency: 'EUR' } : undefined;
  const analysis = analyzedPeriod ? analyzeMonth(analyzedPeriod, documents, periods) : undefined;
  const annualSummaries = useMemo(() => {
    const groups = new Map<string, { key: string; clientId: string; year: number; periods: MonthlyPeriod[]; documentIds: Set<string> }>();
    filteredPeriods.forEach((period) => {
      const key = `${period.clientId}:${period.year}`;
      const group = groups.get(key) ?? { key, clientId: period.clientId, year: period.year, periods: [], documentIds: new Set<string>() };
      group.periods.push(period);
      documents.filter((document) => period.documentIds.includes(document.id) || document.periodId === period.id)
        .forEach((document) => group.documentIds.add(document.id));
      groups.set(key, group);
    });
    return [...groups.values()].map((group) => {
      const account = DEMO_CLIENTS.find((item) => item.email === group.clientId || item.id === group.clientId);
      const profile = roleAssignments.find((item: DemoRoleAssignment) => item.role === 'client' && (item.email === group.clientId || item.id === group.clientId));
      const completedMonths = group.periods.filter((period) => period.status === 'completed').length;
      const activeMonths = group.periods.filter((period) => ['submitted', 'in_review', 'changes_requested'].includes(period.status)).length;
      const openMonths = group.periods.filter((period) => period.status === 'open').length;
      return {
        ...group,
        clientName: account?.company ?? profile?.name ?? group.clientId,
        completedMonths,
        activeMonths,
        openMonths,
        latestActivity: group.periods.reduce<string | undefined>((latest, period) => {
          const activity = period.submittedAt ?? period.completedAt;
          return activity && (!latest || activity > latest) ? activity : latest;
        }, undefined),
      };
    }).sort((left, right) => right.year - left.year || left.clientName.localeCompare(right.clientName));
  }, [documents, filteredPeriods, roleAssignments]);
  const annualDocumentCount = annualSummaries.reduce((total, item) => total + item.documentIds.size, 0);
  const annualMonthCount = annualSummaries.reduce((total, item) => total + item.periods.length, 0);
  const annualClientCount = new Set(annualSummaries.map((item) => item.clientId)).size;
  const errors = analysis?.findings.filter((finding) => finding.severity === 'error') ?? [];
  const readOnly = role === 'admin';

  const markFindingReviewed = (finding: MonthAnalysisFinding) => {
    if (!selected) return;
    const document = documents.find((item) => item.id === finding.documentIds[0]);
    if (document) recordReview(document.id, 'Finding reviewed', 'Staff reviewed and accepted this finding with a note.', {}, userName);
    resolveMonthFinding(selected.id, finding.id, userName, `Finding reviewed: ${finding.title}.`);
    setNotice('Finding marked as reviewed.');
  };

  const requestClientInfo = (finding: MonthAnalysisFinding) => {
    if (!selected) return;
    const reason = requestText.trim() || finding.recommendedSolution;
    const document = documents.find((item) => item.id === finding.documentIds[0]);
    if (document) {
      const requestStatus = canTransitionDocumentStatus(document.status, 'needs_information') ? 'needs_information' as const : document.status;
      recordReview(document.id, 'Information requested', reason, {
        ...(requestStatus !== document.status ? { status: requestStatus } : {}),
        note: reason,
        clientRequest: { reason, createdAt: new Date().toISOString() },
      }, userName);
    }
    addFollowUpTask({
      title: `Client clarification: ${finding.title}`,
      clientId: selected.clientId,
      documentId: document?.id,
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      owner: userName,
    }, userName);
    reviewMonth(selected.id, userName, 'request_changes', reason, analysis);
    setRequestText('');
    setNotice('The request and follow-up task are visible in the client workspace.');
  };

  const applyAction = (finding: MonthAnalysisFinding) => {
    if (!selected || readOnly) return;
    const document = documents.find((item) => item.id === finding.documentIds[0]);
    if (finding.suggestedAction === 'request_document' || finding.suggestedAction === 'create_task') {
      requestClientInfo(finding);
      return;
    }
    if (finding.suggestedAction === 'merge_duplicate') {
      const duplicate = documents.find((item) => item.id === finding.documentIds[1]);
      if (duplicate) recordReview(duplicate.id, 'Possible duplicate reviewed', 'Staff compared this record with the matching reference and amount.', {}, userName);
      resolveMonthFinding(selected.id, finding.id, userName, `Duplicate review recorded for ${finding.documentIds.join(', ')}.`);
      setNotice('Duplicate comparison recorded in the review history.');
      return;
    }
    if (finding.suggestedAction === 'mark_reviewed' || !document) {
      markFindingReviewed(finding);
      return;
    }
    setNotice(`Review ${document.name} and correct the field shown in the finding before resolving it.`);
  };

  const startReview = () => {
    if (!selected || readOnly) return;
    const started = reviewMonth(selected.id, userName, 'start_review', 'Staff opened the submitted month for review.', analysis);
    setNotice(started ? 'Month review started.' : 'This month could not be opened for review by this demo staff account.');
  };

  const requestChanges = () => {
    if (!selected || !analysis) return;
    const message = requestText.trim() || 'Please review the findings and provide the requested documents or clarifications.';
    const requested = reviewMonth(selected.id, userName, 'request_changes', message, analysis);
    setNotice(requested ? 'Month returned to the client with a request for changes.' : 'This month cannot be returned from its current status.');
    if (requested) setRequestText('');
  };

  const approve = () => {
    if (!selected || !analysis) return;
    const approved = reviewMonth(selected.id, userName, 'approve', 'Staff approved the month after reviewing the deterministic findings.', analysis);
    setNotice(approved ? 'Month approved. A placeholder Agenda export can now be prepared.' : 'Approval is blocked while error-level findings remain.');
  };

  const exportAgendaPlaceholder = () => {
    if (!selected || !client) return;
    if (!exportsEnabled) {
      setNotice('Agenda exports are disabled in Administration settings.');
      return;
    }
    const exportable = selectedDocuments.filter((document) => document.status === 'approved'
      && ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(document.category));
    if (!exportable.length) {
      setNotice('No approved accounting documents are available for this month’s placeholder export.');
      return;
    }
    const month = String(selected.month).padStart(2, '0');
    const fileName = `Agenda-placeholder-${selected.year}-${month}.csv`;
    const blob = new Blob([`\uFEFF${accountingCsv(exportable)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordExport(exportable.map((document) => document.id), userName);
    setNotice(`${fileName} downloaded. Intended placement: 03_Agenda\\${selected.year}\\${month}; this is a placeholder, not a live Agenda export.`);
  };

  const downloadMonthlyReport = () => {
    if (!selected || !client || selected.status !== 'completed' || !analysis) return;
    const report = [
      'FINTAX MONTHLY REVIEW REPORT',
      `Client: ${client.company}`,
      `Period: ${new Date(selected.year, selected.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}`,
      `Status: ${selected.status}`,
      `Submitted: ${selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : 'Not recorded'}`,
      `Completed: ${selected.completedAt ? new Date(selected.completedAt).toLocaleString() : 'Not recorded'}`,
      `Prepared by: ${userName}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `DOCUMENTS (${selectedDocuments.length})`,
      ...selectedDocuments.map((document) => [
        `- ${document.name} | ${document.category.replace(/_/g, ' ')} | ${document.status.replace(/_/g, ' ')}`,
        `  Date: ${document.fields.documentDate || 'Not detected'} | Counterparty: ${document.fields.counterparty || 'Not detected'} | Reference: ${document.fields.reference || 'Not detected'}`,
        `  Net: ${document.fields.netAmount || '—'} | VAT: ${document.fields.vatAmount || '—'} | Gross: ${document.fields.grossAmount || '—'} ${document.currency ?? client.currency}`,
        ...(document.validationWarnings?.length ? [`  Review notes: ${document.validationWarnings.join('; ')}`] : []),
      ].join('\n')),
      '',
      `MONTHLY FINDINGS (${analysis.findings.length})`,
      ...(analysis.findings.length
        ? analysis.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.title}\n  Evidence: ${finding.evidence}\n  Recommendation: ${finding.recommendedSolution}`)
        : ['No findings from the current deterministic checks.']),
      '',
      'This report is generated from the browser-only demo workspace. Verify all values against original documents.',
    ].join('\n');
    const month = String(selected.month).padStart(2, '0');
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `FinTax-monthly-report-${selected.year}-${month}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Completed monthly review report downloaded.');
  };

  return <div id="month-submissions" className="space-y-5">
    {role === 'admin' && <>
      <details className="overflow-hidden rounded-2xl border hairline bg-white/80 xl:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-xs font-semibold [&::-webkit-details-marker]:hidden">
          <span>Portfolio overview</span>
          <span className="text-[10px] font-normal text-muted">{DEMO_CLIENTS.length} clients · {annualMonthCount} periods</span>
        </summary>
        <div className="border-t hairline"><PortfolioOverview periods={periods} documents={documents} /></div>
      </details>
      <div className="hidden xl:block"><PortfolioOverview periods={periods} documents={documents} /></div>
    </>}
    <Panel className="p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div>
          <h2 className="text-sm font-semibold sm:text-base">Client submissions</h2>
          <p className="mt-1 text-[10px] text-muted sm:text-xs">Browse periods, then open a month to review its files.</p>
        </div>
        <label className="flex items-center gap-2 text-[10px] font-medium text-muted sm:text-xs">Year
          <select aria-label="Filter submissions by year" value={yearFilter} onChange={(event) => {
            setYearFilter(event.target.value);
            setSelectedId('');
            setExpandedYearClient('');
            setMobilePane('periods');
          }} className="h-10 rounded-xl border hairline bg-white px-2 text-xs text-ink sm:px-3">
            <option value="all">All years</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
        <PeriodMetric label={yearFilter === 'all' ? 'Reporting periods' : `Periods in ${yearFilter}`} value={annualMonthCount} />
        <PeriodMetric label="Client documents" value={annualDocumentCount} />
        <PeriodMetric label="Clients reporting" value={annualClientCount} />
      </div>
      <div className="mt-3 flex rounded-xl bg-bg2/70 p-1 sm:mt-4" role="tablist" aria-label="Submission time view">
        {(['monthly', 'yearly'] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={periodView === view} onClick={() => { setPeriodView(view); setMobilePane('periods'); }} className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-medium transition-colors ${periodView === view ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
          {view === 'monthly' ? 'Monthly view' : 'Yearly view'}
        </button>)}
      </div>
    </Panel>
    {periodView === 'monthly' && selected && <div className="grid grid-cols-2 gap-1 rounded-xl border hairline bg-bg/60 p-1 xl:hidden" role="tablist" aria-label="Monthly submission sections">
      <button type="button" role="tab" aria-selected={mobilePane === 'periods'} onClick={() => setMobilePane('periods')} className={`min-h-11 rounded-lg px-2 text-xs font-medium ${mobilePane === 'periods' ? 'bg-white text-blue-700 shadow-sm' : 'text-muted'}`}>Periods · {filteredPeriods.length}</button>
      <button type="button" role="tab" aria-selected={mobilePane === 'review'} onClick={() => setMobilePane('review')} className={`min-h-11 rounded-lg px-2 text-xs font-medium ${mobilePane === 'review' ? 'bg-white text-blue-700 shadow-sm' : 'text-muted'}`}>Selected month</button>
    </div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,.75fr)_minmax(0,1.5fr)]">
    <Panel className={`overflow-hidden ${mobilePane === 'periods' ? '' : 'hidden xl:block'}`}>
      <div className="border-b hairline px-3 py-3 sm:px-4 sm:py-4">
        <h2 className="text-sm font-semibold sm:text-base">{periodView === 'monthly' ? 'Monthly submissions' : 'Yearly client activity'}</h2>
        <p className="mt-1 text-[10px] text-muted sm:text-xs">{periodView === 'monthly'
          ? role === 'admin' ? 'Open a month to inspect its complete document set.' : 'Submitted months assigned to the demo review queue.'
          : 'Annual totals by client. Expand a client to open any submitted month.'}</p>
      </div>
      {periodView === 'monthly' && filteredPeriods.length
        ? <ul className="divide-y divide-line/10">{filteredPeriods.map((period) => {
          const itemClient = DEMO_CLIENTS.find((entry) => entry.email === period.clientId || entry.id === period.clientId)
            ?? roleAssignments.find((entry) => entry.role === 'client' && (entry.email === period.clientId || entry.id === period.clientId));
          const itemClientName = itemClient
            ? 'company' in itemClient ? itemClient.company : itemClient.name
            : period.clientId;
          const periodDocumentCount = documents.filter((document) =>
            period.documentIds.includes(document.id) || document.periodId === period.id,
          ).length;
          const active = selected?.id === period.id;
          return <li key={period.id}>
            <button type="button" aria-current={active ? 'true' : undefined}
              className={`flex min-h-14 w-full items-center px-3 py-2.5 text-left transition-colors sm:px-4 sm:py-3 ${active ? 'bg-cyan/5' : 'hover:bg-bg2/60'}`}
              onClick={() => { setSelectedId(period.id); setMobilePane('review'); }}>
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0"><span className="block truncate text-xs font-semibold">{itemClientName}</span>
                  <span className="mt-1 block truncate text-[10px] text-muted sm:text-[11px]">{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' })} · {periodDocumentCount} documents</span>
                  {period.submittedAt && <span className="mt-1 hidden text-[10px] text-muted sm:block">Submitted {new Date(period.submittedAt).toLocaleString()}</span>}
                </span>
                <Badge className="shrink-0 text-[10px]" tone={period.status === 'completed' ? 'ok' : period.status === 'changes_requested' ? 'warn' : 'cyan'}>{period.status.replace(/_/g, ' ')}</Badge>
              </span>
            </button>
          </li>;
        })}</ul>
        : periodView === 'yearly' && annualSummaries.length
          ? <ul className="divide-y divide-line/10">{annualSummaries.map((summary) => {
            const expanded = expandedYearClient === summary.key;
            const periodsInYear = [...summary.periods].sort((left, right) => right.month - left.month);
            return <li key={summary.key}>
              <button type="button" aria-expanded={expanded} onClick={() => setExpandedYearClient((current) => current === summary.key ? '' : summary.key)} className="flex min-h-14 w-full items-center px-3 py-2.5 text-left transition-colors hover:bg-bg2/60 sm:px-4 sm:py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{summary.clientName}</span>
                    <span className="mt-1 block truncate text-[10px] text-muted sm:text-[11px]">{summary.year} · {summary.documentIds.size} documents · {summary.periods.length} month{summary.periods.length === 1 ? '' : 's'}</span>
                    <span className="mt-1 hidden text-[10px] text-muted sm:block">{summary.completedMonths} completed · {summary.activeMonths} in review · {summary.openMonths} open</span>
                  </span>
                  <Badge className="shrink-0 text-[10px]" tone={summary.activeMonths ? 'cyan' : summary.openMonths ? 'neutral' : 'ok'}>{summary.activeMonths ? 'In progress' : summary.openMonths ? 'Open' : 'Complete'}</Badge>
                </span>
              </button>
              {expanded && <ul className="border-t hairline bg-bg2/30 px-3 py-2">{periodsInYear.map((period) => <li key={period.id}>
                <button type="button" onClick={() => { setSelectedId(period.id); setPeriodView('monthly'); setMobilePane('review'); }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs hover:bg-white">
                  <span>{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'long' })}<span className="ms-2 text-[10px] text-muted">{documents.filter((document) => period.documentIds.includes(document.id) || document.periodId === period.id).length} docs</span></span>
                  <Badge tone={period.status === 'completed' ? 'ok' : period.status === 'changes_requested' ? 'warn' : 'cyan'}>{period.status.replace(/_/g, ' ')}</Badge>
                </button>
              </li>)}</ul>}
            </li>;
          })}</ul>
          : <div className="p-5 text-sm text-muted">{periodView === 'yearly' ? 'No annual client activity is available for this year.' : 'No month submissions are available for this year.'}</div>}
    </Panel>

    {periodView === 'monthly' && selected && client && analysis ? <div className={`space-y-3 sm:space-y-5 ${mobilePane === 'review' ? '' : 'hidden xl:block'}`}>
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-medium uppercase tracking-wide text-cyan">{client.company} · {client.currency}</p>
            <h2 className="mt-1 text-lg font-semibold">{new Date(selected.year, selected.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h2>
            <p className="mt-1 text-[10px] text-muted sm:text-xs">{selectedDocuments.length} documents · {analysis.findings.length} open findings</p></div>
          {!readOnly && selected.status === 'submitted' && <Button variant="primary" className="min-h-10 w-full rounded-full sm:w-auto" onClick={startReview}>Start review</Button>}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{selectedDocuments.map((document) => <div key={document.id} className="min-w-0 rounded-xl border hairline p-3">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-xs font-medium" title={document.name}>{document.name}</p><Button variant="outline" className="min-h-8 shrink-0 px-2 text-[10px]" onClick={() => onOpenDocument(document)}>Open file</Button></div>
          <p className="mt-1 text-[11px] text-muted">{document.category.replace(/_/g, ' ')} · {document.status.replace(/_/g, ' ')} · {Math.round(document.confidence * 100)}% confidence</p>
          <p className="mt-1 text-[10px] text-muted">{document.mime || document.name.split('.').pop()?.toUpperCase() || 'File'} · {new Date(document.createdAt).toLocaleString()}</p>
          {document.clientNote && <p className="mt-2 line-clamp-2 text-[11px] text-muted">Client note: {document.clientNote}</p>}
          {document.extractedText && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-cyan">OCR text</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-muted">{document.extractedText}</pre></details>}
        </div>)}</div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b hairline px-4 py-4"><h2 className="font-semibold">Findings &amp; recommended solutions</h2>
          <p className="mt-1 text-xs text-muted">Evidence comes from extracted text and fields. Verify every item against the original.</p></div>
        {analysis.findings.length
          ? <ul className="divide-y divide-line/10">{analysis.findings.map((finding) => <li key={finding.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={finding.severity === 'error' ? 'bad' : finding.severity === 'warning' ? 'warn' : 'neutral'}>{finding.severity}</Badge>
              <h3 className="text-sm font-semibold">{finding.title}</h3>
            </div>
            <p className="mt-2 text-xs text-muted">{finding.evidence}</p>
            <p className="mt-2 rounded-lg bg-bg2/70 p-2 text-xs"><span className="font-semibold">Suggested solution: </span>{finding.recommendedSolution}</p>
            {!readOnly && <div className="mt-3 flex flex-wrap items-center gap-2">
              {finding.suggestedAction === 'fix_field' && finding.documentIds[0] && <FixFieldForm
                finding={finding}
                document={documents.find((item) => item.id === finding.documentIds[0])}
                onSave={(key, value) => {
                  updateFields(finding.documentIds[0], key, value, userName);
                  setNotice(`${key} updated. The monthly findings have been recalculated.`);
                }}
              />}
              <Button variant="outline" size="sm" className="min-h-10 rounded-full" onClick={() => applyAction(finding)}>
                {finding.suggestedAction === 'request_document' ? 'Request document / clarification'
                  : finding.suggestedAction === 'merge_duplicate' ? 'Record duplicate review'
                    : finding.suggestedAction === 'create_task' ? 'Create task' : 'Mark reviewed'}
              </Button>
            </div>}
          </li>)}</ul>
          : <p className="p-5 text-sm text-ok">No open findings from the current deterministic checks.</p>}
      </Panel>

      {!readOnly && <Panel className="p-4 sm:p-5">
        <label htmlFor="month-review-message" className="block text-xs font-medium">Message to client / review note</label>
        <textarea id="month-review-message" value={requestText} onChange={(event) => setRequestText(event.target.value)} rows={3}
          placeholder="Describe what the client should clarify or upload..." className="mt-2 w-full rounded-xl border hairline bg-white p-3 text-sm" />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" className="min-h-10 rounded-full" onClick={requestChanges} disabled={!['submitted', 'in_review'].includes(selected.status)}>Return to client</Button>
          <Button variant="primary" className="min-h-10 rounded-full" onClick={approve} disabled={!['submitted', 'in_review'].includes(selected.status) || errors.length > 0}>Approve month</Button>
        </div>
        {errors.length > 0 && <p className="mt-2 text-right text-xs text-bad">Approval blocked: resolve {errors.length} error-level finding{errors.length === 1 ? '' : 's'} first.</p>}
      </Panel>}
      {selected.status === 'completed' && <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h3 className="text-sm font-semibold">Completed monthly report</h3><p className="mt-1 text-xs text-muted">Available to staff and admin after the monthly review is completed.</p></div>
        <Button variant="primary" className="min-h-10 rounded-full" onClick={downloadMonthlyReport}>Download monthly report</Button>
      </Panel>}
      {!readOnly && selected.status === 'completed' && <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h3 className="text-sm font-semibold">Accounting export</h3><p className="mt-1 text-xs text-muted">Placeholder download for the intended 03_Agenda folder. No Agenda integration is connected.</p></div>
        <Button variant="outline" className="min-h-10 rounded-full" onClick={exportAgendaPlaceholder} disabled={!exportsEnabled}>Download Agenda placeholder CSV</Button>
      </Panel>}
      {notice && <p role="status" className="rounded-xl bg-cyan/5 p-3 text-xs text-muted">{notice}</p>}
      <Panel className="p-4"><h3 className="text-sm font-semibold">Month timeline</h3><ol className="mt-3 space-y-2">{selected.timeline.map((event) => <li key={event.id} className="border-s-2 border-cyan/20 ps-3 text-xs">
        <p className="font-medium">{event.action}</p><p className="mt-0.5 text-muted">{event.details} · {new Date(event.at).toLocaleString()} · {event.actor}</p></li>)}</ol>
      </Panel>
    </div> : periodView === 'yearly'
      ? <Panel className="hidden min-h-60 place-items-center p-6 text-center xl:grid">
        <div><h2 className="font-semibold">Yearly client activity</h2><p className="mt-2 max-w-md text-sm text-muted">Expand a client on the left to see each submitted month. Open a month to inspect or open its documents.</p></div>
      </Panel>
      : <Panel className="grid min-h-60 place-items-center p-6 text-sm text-muted">Choose a submitted month to inspect its documents and findings.</Panel>}
    </div>
  </div>;
}

function PortfolioOverview({ periods, documents }: { periods: MonthlyPeriod[]; documents: DemoDocument[] }) {
  const monthById = new Map(periods.map((period) => [period.id, period]));
  const months = [...monthById.values()].sort((left, right) => left.year - right.year || left.month - right.month).slice(-4);
  const activeCount = periods.filter((period) => ['submitted', 'in_review', 'changes_requested'].includes(period.status)).length;
  const findingCount = periods.reduce((count, period) => count + analyzeMonth(period, documents, periods).findings.length, 0);

  return <Panel className="overflow-hidden">
    <div className="border-b hairline px-4 py-4 sm:px-5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-cyan">Admin portfolio · fictional data</p>
      <h2 className="mt-1 font-semibold">Monthly workload and assignment matrix</h2>
      <p className="mt-1 text-xs text-muted">Status heatmap across demo client periods; every client is assigned to Lena M. in this prototype.</p>
    </div>
    <div className="grid grid-cols-3 gap-2 border-b p-3 sm:gap-3 sm:p-4">
      <PortfolioMetric label="Demo clients" value={DEMO_CLIENTS.length} />
      <PortfolioMetric label="Active submissions" value={activeCount} />
      <PortfolioMetric label="Open analysis findings" value={findingCount} />
    </div>
    <ul className="divide-y divide-line/10 md:hidden">
      {DEMO_CLIENTS.map((client) => <li key={client.email} className="px-3 py-3">
        <p className="truncate text-xs font-semibold">{client.company}<span className="ml-2 text-[10px] font-normal text-muted">Lena M. · staff</span></p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {months.map((month) => {
            const period = periods.find((item) => item.clientId === client.email && item.year === month.year && item.month === month.month);
            const status = period?.status ?? 'not started';
            const tone = status === 'completed' ? 'bg-ok/10 text-ok' : status === 'submitted' || status === 'in_review' ? 'bg-cyan/10 text-cyan' : status === 'changes_requested' ? 'bg-warn/10 text-warn' : 'bg-bg2 text-muted';
            return <span key={month.id} className={`shrink-0 rounded-lg px-2 py-1 text-[9px] ${tone}`}><span className="font-semibold">{new Date(month.year, month.month - 1, 1).toLocaleDateString('en', { month: 'short', year: '2-digit' })}</span><span className="ml-1">{status.replace(/_/g, ' ')}</span></span>;
          })}
        </div>
      </li>)}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-bg2/60 text-[10px] uppercase tracking-wide text-muted"><tr>
          <th className="px-4 py-3 font-medium">Client / assigned staff</th>
          {months.map((period) => <th key={period.id} className="px-3 py-3 font-medium">{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'short', year: '2-digit' })}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-line/10">{DEMO_CLIENTS.map((client) => <tr key={client.email}>
          <th scope="row" className="px-4 py-3 font-medium"><span className="block">{client.company}</span><span className="mt-1 block text-[10px] font-normal text-muted">Lena M. · staff</span></th>
          {months.map((month) => {
            const period = periods.find((item) => item.clientId === client.email && item.year === month.year && item.month === month.month);
            const status = period?.status ?? 'not started';
            const tone = status === 'completed' ? 'bg-ok/10 text-ok' : status === 'submitted' || status === 'in_review' ? 'bg-cyan/10 text-cyan' : status === 'changes_requested' ? 'bg-warn/10 text-warn' : 'bg-bg2 text-muted';
            return <td key={month.id} className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] ${tone}`}>{status.replace(/_/g, ' ')}</span></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </Panel>;
}

function PortfolioMetric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-xl border hairline bg-bg2/35 p-2 sm:p-3"><p className="text-[9px] leading-3 text-muted sm:text-[10px]">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{value}</p></div>;
}

function PeriodMetric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-xl border hairline bg-bg2/35 p-2 sm:p-3">
    <p className="text-[9px] leading-3 text-muted sm:text-[10px]">{label}</p>
    <p className="mt-1 text-base font-semibold tabular-nums sm:text-lg">{value}</p>
  </div>;
}

function FixFieldForm({ finding, document, onSave }: {
  finding: MonthAnalysisFinding;
  document: { fields: DemoFields } | undefined;
  onSave: (key: EditableField, value: string) => void;
}) {
  const [field, setField] = useState<EditableField>('grossAmount');
  const [value, setValue] = useState(document?.fields.grossAmount ?? '');
  if (!document) return null;
  return <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
    event.preventDefault();
    onSave(field, value);
    setValue('');
  }}>
    <label className="sr-only" htmlFor={`fix-field-${finding.id}`}>Field to correct</label>
    <select id={`fix-field-${finding.id}`} value={field} onChange={(event) => {
      const next = event.target.value as EditableField;
      setField(next);
      setValue(document.fields[next]);
    }} className="min-h-10 rounded-xl border hairline bg-white px-2 text-xs">
      {editableFields.map((key) => <option key={key} value={key}>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</option>)}
    </select>
    <input value={value} onChange={(event) => setValue(event.target.value)} aria-label={`Correct ${field}`}
      className="min-h-10 w-32 rounded-xl border hairline bg-white px-2 text-xs" />
    <Button size="sm" variant="outline" className="min-h-10 rounded-full" type="submit">Save field</Button>
  </form>;
}
