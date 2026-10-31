import { useMemo, useState } from 'react';
import { Badge, Button, Panel } from '@/components/ui/primitives';
import { useDemoDocumentsStore } from '@/stores/demoDocumentsStore';
import { DEMO_CLIENTS } from './demoAccounts';
import { analyzeMonth } from './storage/analyzeMonth';
import { documentsVisibleTo, periodsVisibleTo } from './storage/selectors';
import { accountingCsv, canTransitionDocumentStatus, type DemoDocument, type DemoFields } from './demoWorkflow';
import type { MonthAnalysisFinding, MonthlyPeriod } from './storage/models';

type ReviewerRole = 'staff' | 'admin';
type EditableField = keyof DemoFields;

const editableFields: EditableField[] = ['documentDate', 'reference', 'counterparty', 'netAmount', 'vatRate', 'vatAmount', 'grossAmount', 'description'];

export default function MonthSubmissionsPanel({ role, userName }: { role: ReviewerRole; userName: string }) {
  const allPeriods = useDemoDocumentsStore((state) => state.periods);
  const allDocuments = useDemoDocumentsStore((state) => state.documents);
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
  const [requestText, setRequestText] = useState('');
  const [notice, setNotice] = useState('');

  const visiblePeriods = useMemo(() => periods
    .filter((period) => role === 'admin' || ['submitted', 'in_review', 'changes_requested', 'completed'].includes(period.status))
    .sort((left, right) => (right.submittedAt ?? '').localeCompare(left.submittedAt ?? '')), [periods, role]);
  const selected = visiblePeriods.find((period) => period.id === selectedId) ?? visiblePeriods[0];
  const client = selected && DEMO_CLIENTS.find((item) => item.email === selected.clientId);
  const analysis = selected ? analyzeMonth(selected, documents, periods) : undefined;
  const selectedDocuments = selected ? documents.filter((document) => selected.documentIds.includes(document.id)) : [];
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

  return <div id="month-submissions" className="space-y-5">
    {role === 'admin' && <PortfolioOverview periods={periods} documents={documents} />}
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,.75fr)_minmax(0,1.5fr)]">
    <Panel className="overflow-hidden">
      <div className="border-b hairline px-4 py-4">
        <h2 className="font-semibold">Month submissions</h2>
        <p className="mt-1 text-xs text-muted">{role === 'admin' ? 'Read-only period overview.' : 'Submitted months assigned to the demo review queue.'}</p>
      </div>
      {visiblePeriods.length
        ? <ul className="divide-y divide-line/10">{visiblePeriods.map((period) => {
          const itemClient = DEMO_CLIENTS.find((entry) => entry.email === period.clientId);
          const active = selected?.id === period.id;
          return <li key={period.id}>
            <button type="button" aria-current={active ? 'true' : undefined} onClick={() => setSelectedId(period.id)}
              className={`w-full px-4 py-3 text-left transition-colors ${active ? 'bg-cyan/5' : 'hover:bg-bg2/60'}`}>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0"><span className="block truncate text-xs font-semibold">{itemClient?.company ?? period.clientId}</span>
                  <span className="mt-1 block text-[11px] text-muted">{new Date(period.year, period.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })} · {period.documentIds.length} documents</span>
                  {period.submittedAt && <span className="mt-1 block text-[10px] text-muted">Submitted {new Date(period.submittedAt).toLocaleString()}</span>}
                </span>
                <Badge tone={period.status === 'completed' ? 'ok' : period.status === 'changes_requested' ? 'warn' : 'cyan'}>{period.status.replace(/_/g, ' ')}</Badge>
              </span>
            </button>
          </li>;
        })}</ul>
        : <div className="p-5 text-sm text-muted">No month submissions are waiting for review.</div>}
    </Panel>

    {selected && client && analysis ? <div className="space-y-5">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-medium uppercase tracking-wide text-cyan">{client.company} · {client.currency}</p>
            <h2 className="mt-1 text-lg font-semibold">{new Date(selected.year, selected.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h2>
            <p className="mt-1 text-xs text-muted">{selectedDocuments.length} documents · {analysis.findings.length} open findings · analysis uses deterministic rules</p></div>
          {!readOnly && selected.status === 'submitted' && <Button variant="primary" className="min-h-10 rounded-full" onClick={startReview}>Start review</Button>}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{selectedDocuments.map((document) => <div key={document.id} className="rounded-xl border hairline p-3">
          <p className="truncate text-xs font-medium">{document.name}</p>
          <p className="mt-1 text-[11px] text-muted">{document.category.replace(/_/g, ' ')} · {document.status.replace(/_/g, ' ')} · {Math.round(document.confidence * 100)}% confidence</p>
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
      {!readOnly && selected.status === 'completed' && <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><h3 className="text-sm font-semibold">Accounting export</h3><p className="mt-1 text-xs text-muted">Placeholder download for the intended 03_Agenda folder. No Agenda integration is connected.</p></div>
        <Button variant="outline" className="min-h-10 rounded-full" onClick={exportAgendaPlaceholder} disabled={!exportsEnabled}>Download Agenda placeholder CSV</Button>
      </Panel>}
      {notice && <p role="status" className="rounded-xl bg-cyan/5 p-3 text-xs text-muted">{notice}</p>}
      <Panel className="p-4"><h3 className="text-sm font-semibold">Month timeline</h3><ol className="mt-3 space-y-2">{selected.timeline.map((event) => <li key={event.id} className="border-s-2 border-cyan/20 ps-3 text-xs">
        <p className="font-medium">{event.action}</p><p className="mt-0.5 text-muted">{event.details} · {new Date(event.at).toLocaleString()} · {event.actor}</p></li>)}</ol>
      </Panel>
    </div> : <Panel className="grid min-h-60 place-items-center p-6 text-sm text-muted">Choose a submitted month to inspect its documents and findings.</Panel>}
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
    <div className="grid gap-3 border-b hairline p-4 sm:grid-cols-3">
      <PortfolioMetric label="Demo clients" value={DEMO_CLIENTS.length} />
      <PortfolioMetric label="Active submissions" value={activeCount} />
      <PortfolioMetric label="Open analysis findings" value={findingCount} />
    </div>
    <div className="overflow-x-auto">
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
  return <div className="rounded-xl border hairline bg-bg2/35 p-3"><p className="text-[10px] text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
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
