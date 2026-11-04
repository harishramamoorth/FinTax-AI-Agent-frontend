import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Button, ProgressBar } from '@/components/ui/primitives';
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileText,
  History,
  ShieldCheck,
} from 'lucide-react';
import type { AssistantLanguage } from '../clientAssistant';
import type { DemoDocument } from '../../shared/demoWorkflow';
import { categoryLabel, formatBytes, PIPELINE, t3 } from '../clientPageUtils';
import { portalText, usePortalLanguage } from '../../shared/portalLanguage';

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
  onUploadReplacement?: (document: DemoDocument) => void;
  onRefresh?: () => Promise<void>;
}

export function maskSensitive(key: string, value: string, show: boolean): string {
  if (!value || show) return value;
  const k = key.toLowerCase();
  if (k.includes('iban')) {
    const clean = value.replace(/\s+/g, '');
    if (clean.length > 8) {
      return `${clean.slice(0, 4)} •••• •••• •••• ${clean.slice(-4)}`;
    }
    return '•••• •••• ••••';
  }
  if (k.includes('tax') || k.includes('steuer') || k.includes('passport') || k.includes('idnumber') || k.includes('social')) {
    if (value.length > 4) {
      return `••••••••${value.slice(-4)}`;
    }
    return '••••••••';
  }
  return value;
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
  onUploadReplacement,
  onRefresh,
}: ClientDocumentHistoryPageProps) {
  const [showSensitive, setShowSensitive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');
  const touchStartY = useRef<number | null>(null);
  const portalLang = usePortalLanguage((state) => state.language);
  const refresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    setRefreshStatus('Refreshing documents…');
    try {
      await onRefresh();
      setRefreshStatus('Documents are up to date.');
    } catch (error) {
      setRefreshStatus(error instanceof Error ? error.message : 'Could not refresh documents.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section id="client-documents" onTouchStart={(event) => { touchStartY.current = event.touches[0]?.clientY ?? null; }} onTouchEnd={(event) => {
      const start = touchStartY.current;
      const end = event.changedTouches[0]?.clientY;
      touchStartY.current = null;
      const pageScroller = document.querySelector<HTMLElement>('[data-client-portal]');
      if (start !== null && end !== undefined && end - start > 70 && pageScroller?.scrollTop === 0) void refresh();
    }} className="scroll-mt-24 overflow-hidden rounded-2xl border border-[#e8e2d2] bg-white shadow-sm sm:rounded-3xl" aria-label="Your documents">
      {refreshStatus && <p role="status" className="border-b border-[#eee9df] px-4 py-2 text-xs text-[#4A5468]">{refreshStatus}</p>}
      <div className="flex flex-col gap-3 border-b border-[#eee9df] px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-serif text-lg font-semibold text-[#0f1f3d]">{t3(lang, 'Your documents & files', 'Ihre Dokumente', 'مستنداتك')}</h2>
          <p className="mt-1 text-xs text-muted">
            Original files and records are stored in this browser's IndexedDB. Sensitive numbers (IBANs, Tax IDs) are masked by default.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {/* Sensitive masking toggle */}
          <button
            type="button"
            onClick={() => setShowSensitive((show) => !show)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#e8e2d2] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f1f3d] shadow-sm transition-colors hover:border-[#c9a24b]"
          >
            {showSensitive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            <span>{showSensitive ? portalText(portalLang, 'hideSensitive') : portalText(portalLang, 'showSensitive')}</span>
          </button>

          <label className="min-w-36 flex-1 sm:flex-none">
            <span className="sr-only">Search document names, fields, and OCR text</span>
            <input
              value={documentSearch}
              onChange={(event) => onDocumentSearchChange(event.target.value)}
              placeholder="Search documents or text"
              className="h-10 w-full rounded-xl border border-[#e8e2d2] bg-white px-3 text-sm outline-none focus:border-[#c9a24b] sm:w-48"
            />
          </label>

          <label>
            <span className="sr-only">Filter by document folder</span>
            <select
              value={folderFilter}
              onChange={(event) => onFolderFilterChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-[#e8e2d2] bg-white px-3 text-sm font-medium sm:w-auto"
            >
              <option value="all">All folders</option>
              {documentFolders.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
          </label>

          <div className="client-document-filter-chips flex flex-wrap gap-1" role="tablist" aria-label="Filter documents">
            {(['all', 'processing', 'attention', 'approved'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => onFilterChange(value)}
                className={`min-h-10 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${filter === value ? 'bg-[#0f1f3d] text-white' : 'bg-[#f7f4ec] text-slate-600 hover:text-[#0f1f3d]'}`}
              >
                {{ all: 'All', processing: 'In review', attention: 'Needs you', approved: 'Approved' }[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visibleDocuments.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <FileText className="mx-auto size-8 text-muted" />
          <p className="mt-3 text-sm font-medium">{documents.length ? 'No documents match this filter' : 'No documents added yet'}</p>
          <p className="mt-1 text-xs text-muted">Upload sample documents from the four workspace areas.</p>
        </div>
      ) : (
        <ul key={filter} className="client-document-list divide-y divide-ink/5">
          <AnimatePresence initial={false}>
            {visibleDocuments.map((item) => {
              const active = expandedId === item.id;
              const stageIndex = Math.max(0, PIPELINE.findIndex(([stage]) => stage === item.workflowStage));

              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  id={`client-demo-document-${item.id}`}
                  className="px-5 py-4"
                >
                  <button
                    type="button"
                    aria-expanded={active}
                    onClick={() => onExpandedIdChange(active ? null : item.id)}
                    className="flex w-full flex-wrap items-center gap-3 text-start"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf2f9] text-[#5579ae]">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-40 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {categoryLabel(item.category)} · {formatBytes(item.sizeBytes)}
                        {item.pageCount ? ` · ${item.pageCount} pages` : ''}
                        {item.previousVersions?.length ? ` · ${item.previousVersions.length + 1} versions` : ''}
                      </span>
                    </span>
                    {item.status === 'processing' && <span className="w-28"><ProgressBar value={item.processingProgress ?? 0} active /></span>}
                    <Badge tone={item.status === 'approved' ? 'ok' : item.status === 'review' ? 'warn' : item.status === 'processing' ? 'cyan' : 'bad'}>
                      {item.status === 'review' ? 'Staff review' : item.status === 'needs_information' ? 'Needs information' : item.status.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted font-mono">{Math.round(item.confidence * 100)}%</span>
                    <ChevronDown className={`size-4 text-muted transition-transform ${active ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-4 rounded-2xl border border-ink/5 bg-bg/50 p-4">
                          {/* Staff Final Approval Banner */}
                          <div className="flex items-center gap-2 rounded-xl border border-[#5579ae]/20 bg-[#edf2f9] p-3 text-xs text-[#0f1f3d]">
                            <ShieldCheck className="size-4 shrink-0 text-[#5579ae]" />
                            <span>Staff perform final review and approval. Automated extraction is provisional.</span>
                          </div>

                          {/* Version history if document was replaced */}
                          {item.previousVersions && item.previousVersions.length > 0 && (
                            <div className="rounded-xl border border-ink/10 bg-white p-3 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-ink">
                                <History className="size-3.5 text-[#9a7424]" />
                                <span>Version History ({item.previousVersions.length + 1} total)</span>
                              </div>
                              <ul className="mt-2 space-y-1.5 text-[11px]">
                                <li className="flex items-center justify-between text-ink font-semibold">
                                  <span>v{item.previousVersions.length + 1} (Current): {item.name}</span>
                                  <span className="text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
                                </li>
                                {item.previousVersions.map((prev, idx) => (
                                  <li key={prev.id || idx} className="flex items-center justify-between text-muted">
                                    <span>v{idx + 1}: {prev.name} ({formatBytes(prev.sizeBytes)})</span>
                                    <span>Uploaded on {new Date(prev.uploadedAt).toLocaleDateString()}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div>
                            <div className="mb-2 flex items-center justify-between text-[11px]">
                              <span className="font-medium">Workflow pipeline</span>
                              <span className="text-muted">{item.workflowStage?.replace(/_/g, ' ') ?? 'received'}</span>
                            </div>
                            <ProgressBar value={item.processingProgress ?? (item.status === 'approved' ? 100 : 95)} active={item.status === 'processing'} />
                            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              {PIPELINE.map(([stage, label], index) => (
                                <li key={stage} className={`rounded-lg border px-2.5 py-2 text-[10px] ${index <= stageIndex ? 'border-[#5579ae]/20 bg-[#edf2f9] text-[#0f1f3d]' : 'border-ink/5 text-muted'}`}>
                                  <span className="me-1 text-[#5579ae]">{index < stageIndex || item.status === 'approved' ? '✓' : index === stageIndex ? '•' : '○'}</span>
                                  {label}
                                </li>
                              ))}
                            </ol>
                          </div>

                          <div className="grid gap-3 text-xs sm:grid-cols-3">
                            <p><span className="text-muted">Language:</span> {item.detectedLanguage ?? 'Not detected'}</p>
                            <p><span className="text-muted">Pages:</span> {item.pageCount ?? '1'}</p>
                            <p><span className="text-muted">OCR confidence:</span> {Math.round(item.confidence * 100)}%</p>
                          </div>

                          {/* Action controls */}
                          <div className="flex flex-wrap gap-2">
                            {item.file && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-9 rounded-full text-xs"
                                icon={<Download className="size-3" />}
                                onClick={() => {
                                  const url = URL.createObjectURL(item.file!);
                                  const anchor = document.createElement('a');
                                  anchor.href = url;
                                  anchor.download = item.name;
                                  anchor.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                Download original
                              </Button>
                            )}
                            {item.extractedText && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-9 rounded-full text-xs"
                                onClick={() => {
                                  const blob = new Blob([item.extractedText ?? ''], { type: 'text/plain;charset=utf-8' });
                                  const url = URL.createObjectURL(blob);
                                  const anchor = document.createElement('a');
                                  anchor.href = url;
                                  anchor.download = `${item.name}.txt`;
                                  anchor.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                Download text (.txt)
                              </Button>
                            )}
                            {onUploadReplacement && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="min-h-9 rounded-full text-xs"
                                onClick={() => onUploadReplacement(item)}
                              >
                                Upload new replacement version
                              </Button>
                            )}
                          </div>

                          {/* Extracted fields with sensitive data masking */}
                          {Object.entries(item.fields).some(([, value]) => Boolean(value)) && (
                            <div>
                              <p className="text-xs font-semibold mb-2">Extracted document fields</p>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {Object.entries(item.fields)
                                  .filter(([, value]) => Boolean(value))
                                  .map(([key, value]) => (
                                    <p key={key} className="rounded-lg bg-white p-2.5 text-[11px] shadow-sm border border-ink/5">
                                      <span className="block text-muted text-[10px] uppercase tracking-wide">{key.replace(/([A-Z])/g, ' $1')}</span>
                                      <span className="font-semibold text-ink">{maskSensitive(key, value, showSensitive)}</span>
                                    </p>
                                  ))}
                              </div>
                            </div>
                          )}

                          {item.validationWarnings?.length ? (
                            <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-[11px]">
                              <p className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="size-3.5" /> Validation warnings
                              </p>
                              <ul className="mt-1 list-inside list-disc text-muted space-y-0.5">
                                {item.validationWarnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {(item.clientNote || item.reviewHistory?.length) ? (
                            <div className="space-y-2">
                              {item.clientNote && <p className="rounded-xl border border-[#e8e2d2] bg-[#faf9f6] p-3 text-xs text-[#0f1f3d]"><span className="font-semibold">{t3(lang, 'Your note', 'Ihre Notiz', 'ملاحظتك')}:</span> {item.clientNote}</p>}
                              {item.reviewHistory?.length ? (
                                <details className="text-[11px]">
                                  <summary className="cursor-pointer font-medium text-[#0f1f3d]">Review history</summary>
                                  <ul className="mt-2 space-y-1 text-[10px] text-muted">
                                    {item.reviewHistory.map((event, index) => (
                                      <li key={`${event.at}-${index}`}>
                                        {new Date(event.at).toLocaleString()} · {event.action}: {event.details}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
