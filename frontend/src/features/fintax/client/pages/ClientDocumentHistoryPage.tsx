import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Button, ProgressBar } from '@/components/ui/primitives';
import { ChevronDown, FileText } from 'lucide-react';
import type { AssistantLanguage } from '../clientAssistant';
import type { DemoDocument } from '../../shared/demoWorkflow';
import { categoryLabel, formatBytes, PIPELINE, t3 } from '../clientPageUtils';

export type ClientDocumentFilter = 'all' | 'processing' | 'attention' | 'approved';

interface ClientDocumentHistoryPageProps {
  documents: DemoDocument[];
  visibleDocuments: DemoDocument[];
  documentFolders: string[];
  filter: ClientDocumentFilter;
  documentSearch: string;
  folderFilter: string;
  expandedId: string | null;
  lang: AssistantLanguage;
  reduceMotion: boolean | null;
  onFilterChange: (filter: ClientDocumentFilter) => void;
  onDocumentSearchChange: (search: string) => void;
  onFolderFilterChange: (folder: string) => void;
  onExpandedIdChange: (id: string | null) => void;
}

export default function ClientDocumentHistoryPage({
  documents,
  visibleDocuments,
  documentFolders,
  filter,
  documentSearch,
  folderFilter,
  expandedId,
  lang,
  reduceMotion,
  onFilterChange,
  onDocumentSearchChange,
  onFolderFilterChange,
  onExpandedIdChange,
}: ClientDocumentHistoryPageProps) {
  return (
    <section id="client-documents" className="scroll-mt-24 overflow-hidden rounded-3xl border border-white bg-white/80 shadow-sm backdrop-blur" aria-label="Your documents">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 px-3 py-4 sm:px-5">
        <div><h2 className="font-semibold">{t3(lang, 'Your documents', 'Ihre Dokumente', 'مستنداتك')}</h2><p className="mt-1 text-xs text-muted">Original files and document data are saved in this browser’s IndexedDB only.</p></div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="min-w-40 flex-1 sm:flex-none">
            <span className="sr-only">Search document names, fields, and OCR text</span>
            <input value={documentSearch} onChange={(event) => onDocumentSearchChange(event.target.value)} placeholder="Search documents or OCR text"
              className="h-9 w-full rounded-full border border-ink/10 bg-white px-3 text-[11px] outline-none focus:border-violet/40 sm:w-52" />
          </label>
          <label>
            <span className="sr-only">Filter by document folder</span>
            <select value={folderFilter} onChange={(event) => onFolderFilterChange(event.target.value)} className="h-9 max-w-48 rounded-full border border-ink/10 bg-white px-3 text-[11px]">
              <option value="all">All folders</option>
              {documentFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter documents">{(['all', 'processing', 'attention', 'approved'] as const).map((value) => (
            <button key={value} role="tab" aria-selected={filter === value} onClick={() => onFilterChange(value)} className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${filter === value ? 'bg-violet text-white shadow-md shadow-violet/30' : 'bg-ink/5 text-muted hover:text-ink'}`}>{{ all: 'All', processing: 'In review', attention: 'Needs you', approved: 'Approved' }[value]}</button>))}</div>
        </div>
      </div>
      {visibleDocuments.length === 0
        ? <div className="px-5 py-14 text-center"><FileText className="mx-auto size-8 text-muted" /><p className="mt-3 text-sm font-medium">{documents.length ? 'No documents in this view' : 'No documents added yet'}</p><p className="mt-1 text-xs text-muted">Choose fictional sample files to preview the processing workflow.</p></div>
        : <ul key={filter} className="divide-y divide-ink/5"><AnimatePresence initial={false}>{visibleDocuments.map((item) => {
          const active = expandedId === item.id;
          const stageIndex = Math.max(0, PIPELINE.findIndex(([stage]) => stage === item.workflowStage));
          return (
            <motion.li key={item.id} layout initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} id={`client-demo-document-${item.id}`} className="px-5 py-4">
              <button type="button" aria-expanded={active} onClick={() => onExpandedIdChange(active ? null : item.id)} className="flex w-full flex-wrap items-center gap-3 text-start">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><FileText className="size-4" /></span>
                <span className="min-w-40 flex-1"><span className="block truncate text-sm font-medium">{item.name}</span><span className="mt-0.5 block text-[11px] text-muted">{categoryLabel(item.category)} · {formatBytes(item.sizeBytes)}{item.pageCount ? ` · ${item.pageCount} pages` : ''}</span></span>
                {item.status === 'processing' && <span className="w-28"><ProgressBar value={item.processingProgress ?? 0} active /></span>}
                <Badge tone={item.status === 'approved' ? 'ok' : item.status === 'review' ? 'warn' : item.status === 'processing' ? 'cyan' : 'bad'}>{item.status === 'review' ? 'Staff review' : item.status === 'needs_information' ? 'Needs information' : item.status.replace(/_/g, ' ')}</Badge>
                <span className="text-xs text-muted num">{Math.round(item.confidence * 100)}%</span>
                <ChevronDown className={`size-4 text-muted transition-transform ${active ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>{active && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                  <div className="mt-4 space-y-4 rounded-2xl border border-ink/5 bg-bg/50 p-4">
                    <div><div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-medium">Workflow pipeline</span><span className="text-muted">{item.workflowStage?.replace(/_/g, ' ') ?? 'received'}</span></div><ProgressBar value={item.processingProgress ?? (item.status === 'approved' ? 100 : 95)} active={item.status === 'processing'} />
                      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{PIPELINE.map(([stage, label], index) => <li key={stage} className={`rounded-lg border px-2.5 py-2 text-[10px] ${index <= stageIndex ? 'border-violet/20 bg-violet/5 text-ink' : 'border-ink/5 text-muted'}`}><span className="me-1 text-violet">{index < stageIndex || item.status === 'approved' ? '✓' : index === stageIndex ? '•' : '○'}</span>{label}</li>)}</ol></div>
                    <div className="grid gap-3 text-xs sm:grid-cols-3"><p><span className="text-muted">Language:</span> {item.detectedLanguage ?? 'Not detected'}</p><p><span className="text-muted">Pages:</span> {item.pageCount ?? (item.name.toLowerCase().endsWith('.pdf') ? 'Checking / unknown' : 'Not applicable')}</p><p><span className="text-muted">OCR engine:</span> {item.ocrEngine ?? 'Not processed yet'}</p></div>
                    {item.status !== 'processing' && <p role="status" className="rounded-lg bg-ok/5 p-2 text-[11px] text-ink">Original saved ✓ · Text read {item.extractedText ? '✓' : '—'} · Fields extracted {Object.values(item.fields).some(Boolean) ? '✓' : '—'} · Checks done ✓</p>}
                    {(item.file || item.extractedText) && <div className="flex flex-wrap gap-2">
                      {item.file && <Button size="sm" variant="outline" className="min-h-10 rounded-full" onClick={() => {
                        const url = URL.createObjectURL(item.file!);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = item.name;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      }}>Download original</Button>}
                      {item.extractedText && <Button size="sm" variant="outline" className="min-h-10 rounded-full" onClick={() => {
                        const blob = new Blob([item.extractedText ?? ''], { type: 'text/plain;charset=utf-8' });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `${item.name}.txt`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      }}>Download text (.txt)</Button>}
                    </div>}
                    {item.ocrPages?.some((page) => page.confidence > 0) && <p className="text-[11px] text-muted">Mean OCR confidence: {Math.round(item.ocrPages.reduce((sum, page) => sum + page.confidence, 0) / item.ocrPages.length * 100)}%. Handwriting, low-quality images, and Arabic text may be inaccurate; staff review is recommended.</p>}
                    {Object.entries(item.fields).some(([, value]) => Boolean(value)) && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(item.fields).filter(([, value]) => Boolean(value)).map(([key, value]) => <p key={key} className="rounded-lg bg-white p-2 text-[11px] shadow-sm"><span className="block text-muted">{key.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{value}</span></p>)}</div>}
                    {item.extractedDetails && Object.entries(item.extractedDetails).map(([key, value]) => <p key={key} className="whitespace-pre-line rounded-lg bg-white p-2 text-[11px] shadow-sm"><span className="font-medium text-muted">{key}: </span>{value}</p>)}
                    {item.validationWarnings?.length ? <div className="rounded-xl border border-warn/20 bg-warn/5 p-3 text-[11px]"><p className="font-semibold text-warn">Manual review / validation warnings</p><ul className="mt-1 list-inside list-disc text-muted">{item.validationWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
                    {item.note && <p className="text-[11px] text-muted">{item.note}</p>}
                    {item.reviewHistory?.length ? <details><summary className="cursor-pointer text-[11px] text-violet">Review history</summary><ul className="mt-2 space-y-1 text-[10px] text-muted">{item.reviewHistory.map((event, index) => <li key={`${event.at}-${index}`}>{new Date(event.at).toLocaleString()} · {event.action}: {event.details}</li>)}</ul></details> : null}
                  </div>
                </motion.div>)}</AnimatePresence>
            </motion.li>);
        })}</AnimatePresence></ul>}
    </section>
  );
}
