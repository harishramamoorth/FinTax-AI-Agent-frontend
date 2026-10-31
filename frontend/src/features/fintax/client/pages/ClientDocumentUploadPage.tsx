import { useEffect, useRef, useState, type DragEvent, type MutableRefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, FileUp, ListChecks, Paperclip } from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui/primitives';
import type { AssistantLanguage } from '../clientAssistant';
import type { DemoCategory, DemoDocument } from '../../shared/demoWorkflow';
import { CATEGORY_GROUPS, categoryLabel, PIPELINE, t3 } from '../clientPageUtils';
import { MAX_DEMO_FILE_BYTES } from '../../shared/demoWorkflow';

const MAX_PDF_PAGES = 200;

interface ClientDocumentUploadPageProps {
  activePeriodDocuments: DemoDocument[];
  category: DemoCategory;
  lang: AssistantLanguage;
  reduceMotion: boolean | null;
  dragOver: boolean;
  uploadError: string;
  fileInput: MutableRefObject<HTMLInputElement | null>;
  cameraInput: MutableRefObject<HTMLInputElement | null>;
  onCategoryChange: (category: DemoCategory) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onCancelUpload: (document: DemoDocument) => void;
}

export default function ClientDocumentUploadPage({
  activePeriodDocuments,
  category,
  lang,
  reduceMotion,
  dragOver,
  uploadError,
  fileInput,
  cameraInput,
  onCategoryChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onCancelUpload,
}: ClientDocumentUploadPageProps) {
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !categoryMenuRef.current?.contains(event.target)) {
        setCategoryMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoryMenuOpen(false);
        categoryTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [categoryMenuOpen]);

  return (
    <>
      <section id="client-upload" className="grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]" aria-label="Upload documents">
        <motion.div onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); onDragOver(); }} onDragLeave={onDragLeave}
          className={`relative overflow-hidden rounded-3xl border-2 border-dashed p-4 text-center backdrop-blur transition-colors sm:p-9 ${dragOver ? 'border-violet bg-violet/10' : 'border-violet/30 bg-white/70'}`}>
          <motion.span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet to-blue text-white shadow-lg shadow-violet/30" animate={reduceMotion ? undefined : { y: dragOver ? -8 : [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}><FileUp className="size-7" /></motion.span>
          <h2 className="mt-4 text-lg font-semibold">{t3(lang, 'Drop your documents here', 'Dokumente hier ablegen', 'أسقط مستنداتك هنا')}</h2>
          <p className="mt-1 text-sm text-muted">{t3(lang, 'or choose multiple files from your device', 'oder mehrere Dateien auswählen', 'أو اختر عدة ملفات من جهازك')}</p>
          <div className="mx-auto mt-4 max-w-sm text-start">
            <label id="client-document-category-label" className="text-xs font-medium">Document type (optional)</label>
            <div ref={categoryMenuRef} className="relative mt-1">
              <button ref={categoryTriggerRef} id="client-document-category" type="button" aria-labelledby="client-document-category-label"
                aria-haspopup="listbox" aria-expanded={categoryMenuOpen} onClick={() => setCategoryMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setCategoryMenuOpen(true);
                  }
                }}
                className="flex h-10 w-full items-center justify-between rounded-xl border border-ink/10 bg-white px-4 text-start text-sm shadow-sm transition-colors hover:border-violet/35 focus-visible:outline-violet">
                <span>{categoryLabel(category)}</span>
                <ChevronDown className={`size-4 text-muted transition-transform ${categoryMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {categoryMenuOpen && <motion.div role="listbox" aria-labelledby="client-document-category-label"
                  initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.99 }}
                  transition={{ duration: 0.14 }} className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-2 text-start shadow-[0_18px_48px_-18px_rgba(31,28,55,.35)]">
                  {CATEGORY_GROUPS.map((group) => <div key={group.label} className="py-1">
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted">{group.label}</p>
                    {group.categories.map((item) => <button key={item} type="button" role="option" aria-selected={category === item}
                      onClick={() => { onCategoryChange(item); setCategoryMenuOpen(false); categoryTriggerRef.current?.focus(); }}
                      className={`flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-sm transition-colors ${category === item ? 'bg-violet/10 font-medium text-violet' : 'text-ink hover:bg-violet/5'}`}>
                      <span>{categoryLabel(item)}</span>{category === item && <CheckCircle2 className="size-4" />}
                    </button>)}
                  </div>)}
                </motion.div>}
              </AnimatePresence>
            </div>
            <p className="mt-1.5 text-[10px] text-muted">{category === 'other' ? 'We will suggest a type from the file name.' : `New files will be labeled ${categoryLabel(category)}.`}</p>
          </div>
          <Button className="mt-5 rounded-full px-6" variant="primary" icon={<Paperclip className="size-4" />} onClick={() => fileInput.current?.click()}>Choose files</Button>
          <Button className="mt-3 rounded-full px-6" variant="outline" icon={<FileUp className="size-4" />} onClick={() => cameraInput.current?.click()}>Scan with camera</Button>
          <p className="mt-4 text-[11px] leading-5 text-muted">PDF, phone photos, scans and screenshots · up to {MAX_DEMO_FILE_BYTES / 1024 / 1024} MB each · PDFs up to {MAX_PDF_PAGES} pages</p>
          {uploadError && <p role="alert" className="mt-3 text-xs text-bad">{uploadError}</p>}
        </motion.div>
        <motion.div className="rounded-3xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
          <p className="flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-violet" />Processing in this demo</p>
          <ol className="mt-4 space-y-2.5 text-xs text-muted">{PIPELINE.map(([, label], index) => <motion.li key={label} initial={reduceMotion ? false : { opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-violet/10 text-[10px] text-violet">{index + 1}</span>{label}</motion.li>)}</ol>
          <div className="mt-4 rounded-xl border border-warn/20 bg-warn/5 p-3 text-[11px] leading-5 text-muted">PDF text and image OCR are processed locally. Scanned PDFs are limited to 10 OCR pages; handwriting and low-quality photos may be inaccurate and need staff review. No AI model or server upload is connected. Use fictional samples only.</div>
        </motion.div>
        {activePeriodDocuments.some((item) => item.status === 'processing') && <div className="rounded-3xl border border-violet/10 bg-white/85 p-4 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Upload queue</h3><span className="text-[11px] text-muted">{activePeriodDocuments.filter((item) => item.status === 'processing').length} processing</span></div>
          <ul className="mt-3 divide-y divide-ink/5">{activePeriodDocuments.filter((item) => item.status === 'processing').map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="min-w-40 flex-1 truncate text-xs font-medium">{item.name}<span className="mt-1 block text-[10px] font-normal text-muted">{item.workflowStage?.replace(/_/g, ' ') ?? 'queued'} · {item.note}</span></span>
            <span className="w-28"><ProgressBar value={item.processingProgress ?? 0} active /></span>
            <Button size="sm" variant="outline" className="min-h-10 rounded-full" onClick={() => onCancelUpload(item)}>Cancel</Button>
          </li>)}</ul>
        </div>}
      </section>
    </>
  );
}
