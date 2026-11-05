import { useEffect, useState, type DragEvent, type MutableRefObject, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Camera,
  Download,
  FileUp,
  Info,
  RotateCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui/primitives';
import type { AssistantLanguage } from '../clientAssistant';
import { categoryFromDocumentText, categoryForFilename, DEMO_CATEGORIES, extractDocumentDetails, extractDocumentFields, type DemoCategory, type DemoDocument, type DemoFields } from '../../shared/demoWorkflow';
import { formatBytes, t3 } from '../clientPageUtils';
import { CLIENT_MAX_UPLOAD_BYTES } from '../../shared/demoWorkflow';
import { portalText, usePortalLanguage } from '../../shared/portalLanguage';
import { AREAS, cx, type ClientArea } from '../clientUi';
import type { QueuedClientUpload } from '../clientUploadQueue';
import type { MonthlyPeriod } from '../../shared/storage/models';

export type { ClientArea };

interface ClientDocumentUploadPageProps {
  activePeriodDocuments: DemoDocument[];
  queuedUploads: QueuedClientUpload[];
  pendingDocuments: DemoDocument[];
  reviewTargetId?: string | null;
  storageReady: boolean;
  storageError: string;
  selectedTypeIds: string[];
  selectedArea?: ClientArea;
  activePeriod?: MonthlyPeriod;
  periods: MonthlyPeriod[];
  periodReadOnly: boolean;
  onSelectPeriod: (periodId: string) => void;
  uploadNote: string;
  onUploadNoteChange: (note: string) => void;
  lang: AssistantLanguage;
  dragOver: boolean;
  uploadError: string;
  notice: string;
  fileInput: MutableRefObject<HTMLInputElement | null>;
  cameraInput: MutableRefObject<HTMLInputElement | null>;
  primarySaveRef?: RefObject<HTMLButtonElement>;
  onReviewDocument?: (documentId: string) => void;
  onRetryUpload: (document: DemoDocument) => void;
  onSelectedTypeIdsChange: (typeIds: string[]) => void;
  onAreaChange?: (area: ClientArea) => void;
  onOpenCamera: () => void;
  onSubmitFiles: () => void;
  onRemoveQueuedFile: (id: string) => void;
  onQueuedFileTypeChange: (id: string, typeId: string) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onCancelUpload: (document: DemoDocument) => void;
  onSaveDraft: (document: DemoDocument, text: string, fields: DemoFields, details: Record<string, string>) => void;
  onChangeDocumentType: (document: DemoDocument, category: DemoCategory) => void;
}

type UploadType = { id: string; label: [string, string, string]; category: DemoCategory };

export const AREA_CHECKBOXES: Record<ClientArea, UploadType[]> = {
  formation: [
    { id: 'f-id', label: ['ID card / Passport', 'Personalausweis / Reisepass', 'بطاقة الهوية / جواز السفر'], category: 'identity_document' },
    { id: 'f-license', label: ['Business registration', 'Gewerbeanmeldung', 'تسجيل النشاط التجاري'], category: 'company_formation' },
    { id: 'f-register', label: ['Commercial register extract', 'Handelsregisterauszug', 'مستخرج السجل التجاري'], category: 'commercial_register' },
    { id: 'f-articles', label: ['Articles of association', 'Gesellschaftsvertrag', 'عقد تأسيس الشركة'], category: 'company_formation' },
    { id: 'f-tax-number', label: ['Tax number', 'Steuernummer', 'الرقم الضريبي'], category: 'other' },
    { id: 'f-iban', label: ['Bank details (IBAN)', 'Bankverbindung (IBAN)', 'بيانات البنك (IBAN)'], category: 'other' },
    { id: 'f-social-security', label: ['Social security documents', 'Sozialversicherungsnachweise', 'مستندات الضمان الاجتماعي'], category: 'payroll' },
    { id: 'f-other', label: ['Other', 'Sonstiges', 'أخرى'], category: 'other' },
  ],
  payroll: [
    { id: 'p-slips', label: ['Payroll documents', 'Lohnunterlagen', 'مستندات الرواتب'], category: 'payroll' },
    { id: 'p-sick', label: ['Sick notes', 'Krankmeldungen', 'إشعارات المرض'], category: 'sick_note' },
    { id: 'p-hours', label: ['Timesheets', 'Stundennachweise', 'سجلات ساعات العمل'], category: 'timesheet' },
    { id: 'p-newhire', label: ['New employees', 'Neueinstellungen', 'موظفون جدد'], category: 'employee_record' },
    { id: 'p-leavers', label: ['Departures', 'Austritte', 'مغادرة الموظفين'], category: 'employee_record' },
    { id: 'p-leave', label: ['Leave / time off', 'Urlaub / Freistellung', 'إجازة / إعفاء من العمل'], category: 'payroll' },
    { id: 'p-other', label: ['Other', 'Sonstiges', 'أخرى'], category: 'other' },
  ],
  accounting: [
    { id: 'a-bank', label: ['Bank statements', 'Kontoauszüge', 'كشوف الحساب البنكي'], category: 'bank_statement' },
    { id: 'a-purchase', label: ['Incoming invoices', 'Eingangsrechnungen', 'فواتير واردة'], category: 'purchase_invoice' },
    { id: 'a-sales', label: ['Outgoing invoices', 'Ausgangsrechnungen', 'فواتير صادرة'], category: 'sales_invoice' },
    { id: 'a-cash', label: ['Cash receipts', 'Kassenbelege', 'إيصالات نقدية'], category: 'receipt' },
    { id: 'a-hospitality', label: ['Business meal receipts', 'Bewirtungsbelege', 'إيصالات ضيافة العمل'], category: 'receipt' },
    { id: 'a-fuel', label: ['Fuel receipts', 'Tankbelege', 'إيصالات الوقود'], category: 'receipt' },
    { id: 'a-other', label: ['Other', 'Sonstiges', 'أخرى'], category: 'other' },
  ],
  correspondence: [
    { id: 'c-authority', label: ['Letters from authorities', 'Behördenschreiben', 'خطابات الجهات الرسمية'], category: 'correspondence' },
    { id: 'c-contract', label: ['Contracts / lease agreements', 'Verträge / Mietverträge', 'العقود / عقود الإيجار'], category: 'contract' },
    { id: 'c-other', label: ['Other documents', 'Sonstige Unterlagen', 'مستندات أخرى'], category: 'other_correspondence' },
  ],
};

export function uploadTypeForCategory(area: ClientArea, category: DemoCategory): string {
  return AREA_CHECKBOXES[area].find((item) => item.category === category)?.id
    ?? AREA_CHECKBOXES[area][0].id;
}

function ExtractedDocumentReview({ item, storageReady, onSave, onChangeType, primarySaveRef, lang }: {
  item: DemoDocument;
  storageReady: boolean;
  onSave: (document: DemoDocument, text: string, fields: DemoFields, details: Record<string, string>) => void;
  onChangeType: (document: DemoDocument, category: DemoCategory) => void;
  primarySaveRef?: RefObject<HTMLButtonElement>;
  lang: AssistantLanguage;
}) {
  const [text, setText] = useState(item.extractedText ?? '');
  const [fields, setFields] = useState(item.fields);
  const [details, setDetails] = useState(item.extractedDetails ?? {});
  const portalLang = usePortalLanguage((state) => state.language);
  const fieldKeys: (keyof DemoFields)[] = item.category === 'bank_statement'
    ? ['documentDate', 'counterparty', 'description', 'reference']
    : item.category === 'identity_document'
      ? ['counterparty', 'reference', 'documentDate']
      : item.category === 'correspondence' || item.category === 'other_correspondence'
        ? ['documentDate', 'counterparty', 'reference', 'description']
      : item.category === 'commercial_register' || item.category === 'company_formation' || item.category === 'contract'
        ? ['counterparty', 'reference', 'documentDate']
        : ['documentDate', 'counterparty', 'reference', 'description', 'netAmount', 'vatRate', 'vatAmount', 'grossAmount'];
  const detectedCategory = categoryFromDocumentText(text) ?? categoryForFilename(item.name, text);
  const isCompatibleFormationType = [detectedCategory, item.category].every((value) => value === 'company_formation' || value === 'contract');
  const hasTypeMismatch = detectedCategory !== 'other' && detectedCategory !== item.category && !isCompatibleFormationType;
  const detectedFieldCount = fieldKeys.filter((key) => fields[key].trim()).length;
  useEffect(() => {
    setFields(item.fields);
    setDetails(item.extractedDetails ?? extractDocumentDetails(item.category, text));
  }, [item.category, item.fields, item.extractedDetails]);
  const reextractFields = () => {
    setFields(extractDocumentFields(item.category, text, item.name).fields);
    setDetails(extractDocumentDetails(item.category, text));
  };

  return (
    <article id={`client-extracted-review-${item.id}`} className="scroll-mt-24 space-y-4 rounded-3xl border border-[#e8e2d2] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{item.name}</h3>
          <p className="mt-1 text-xs text-muted">
            {item.ocrEngine ?? 'Local text extraction'} · {item.pageCount ? `${item.pageCount} pages` : 'Document'} ·{' '}
            <span className="font-semibold text-ink">{detectedFieldCount} {detectedFieldCount === 1 ? 'field' : 'fields'} found automatically</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${item.confidence >= 0.65 ? 'bg-[#1F8A5B]/10 text-[#176b46]' : 'bg-[#D98A1B]/10 text-[#8A5600]'}`}>
            {item.confidence >= 0.65 ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {item.confidence >= 0.65 ? 'Ready to review' : 'Some details need a check'}
          </span>
          {item.file && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-10 rounded-full"
              icon={<Download className="size-3.5" />}
              onClick={() => {
                const url = URL.createObjectURL(item.file!);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = item.name;
                anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Download original
            </Button>
          )}
        </div>
      </div>

      {hasTypeMismatch && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D98A1B]/40 bg-[#D98A1B]/10 p-3 text-sm text-[#664000]">
          <span>{t3(lang, `This looks like a ${DEMO_CATEGORIES.find(([key]) => key === detectedCategory)?.[1] ?? 'different document'} rather than the selected type.`, `Dies sieht nach einem anderen Dokumenttyp aus.`, `يبدو أن هذا مستند من نوع مختلف عن المحدد.`)}</span>
          <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => onChangeType(item, detectedCategory)}>
            {t3(lang, 'Change type', 'Typ ändern', 'تغيير النوع')}
          </Button>
        </div>
      )}

      {/* Staff final approval notice */}
      <div className="flex items-center gap-2 rounded-xl border border-[#5579ae]/20 bg-[#edf2f9] p-3 text-xs text-[#0f1f3d]">
        <ShieldCheck className="size-4 shrink-0 text-[#5579ae]" />
        <span>{portalText(portalLang, 'staffFinalApproval')}</span>
      </div>

      {/* Farsi OCR notice if applicable */}
      {lang === 'fa' && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
          <Info className="size-4 shrink-0" />
          <span>{portalText(portalLang, 'farsiOcrUnavailable')}</span>
        </div>
      )}

      {item.note && <p className="rounded-xl bg-[#f3f6fa] p-3 text-xs leading-5 text-muted">{item.note}</p>}

      {!text.trim() ? (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          We could not read text from this file. Check that it is clear and upright, try a higher-quality scan, or enter the document details manually below.
        </div>
      ) : (
        <section className="rounded-xl border border-[#E6E0D0] bg-[#FAF9F6] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[#0F1B3D]">{t3(lang, 'Review extracted results', 'Ausgelesene Ergebnisse prüfen', 'راجع النتائج المستخرجة')}</h4>
            <span className="text-xs text-[#4A5468]">{Object.values(details).filter((value) => value.trim()).length} candidate details · please verify</span>
          </div>
          {Object.keys(details).length ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.entries(details).map(([label, value]) => (
                <label key={label} className="min-w-0 text-sm font-medium text-[#1F2A44]">
                  {label}
                  <input value={value} onChange={(event) => setDetails((current) => ({ ...current, [label]: event.target.value }))} className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-[#0B7F99] ${value.trim() ? item.confidence >= 0.65 ? 'border-[#1F8A5B]/50 bg-[#1F8A5B]/5' : 'border-[#D98A1B]/50 bg-[#D98A1B]/5' : 'border-[#E6E0D0] bg-white'}`} />
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-5 text-[#4A5468]">No extra details could be identified. You can enter the key details below.</p>
          )}
        </section>
      )}

      {/* Failed validation checks */}
      {item.validationWarnings?.length ? (
        <div role="status" className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-xs">
          <p className="font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-rose-600" /> Validation checks flagged for review
          </p>
          <ul className="mt-1 list-inside list-disc text-muted space-y-0.5">
            {item.validationWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rounded-xl border border-[#E6E0D0] bg-white p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#1F2A44]">{t3(lang, 'Show extracted text', 'Ausgelesenen Text anzeigen', 'عرض النص المستخرج')}</summary>
        <label className="flex flex-wrap items-center justify-between gap-1 text-sm font-semibold text-[#1F2A44]" htmlFor={`ocr-text-${item.id}`}>
          <span>{t3(lang, 'Text read from your file · edit if needed', 'Ausgelesener Text · bei Bedarf bearbeiten', 'النص المستخرج · عدّله عند الحاجة')}</span>
          <span className="font-normal text-[#4A5468]">{text.length.toLocaleString()} characters{item.pageCount ? ` · ${item.pageCount} pages` : ''}</span>
        </label>
        <textarea
          id={`ocr-text-${item.id}`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setDetails(extractDocumentDetails(item.category, event.target.value));
          }}
          rows={8}
          className="mt-2 max-h-80 w-full rounded-xl border border-[#E6E0D0] bg-white p-3 font-mono text-sm leading-5 outline-none focus:border-[#0B7F99]"
          spellCheck
        />
      </details>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[#0f1f3d]">Check these details before sharing</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">{detectedFieldCount} of {fieldKeys.length} fields filled from the document. Please check each one.</p>
        </div>
        <Button size="sm" variant="outline" className="min-h-9 rounded-full text-xs" icon={<RotateCw className="size-3" />} onClick={reextractFields}>
          Re-read details
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fieldKeys.map((key) => (
        <label key={key} className="block text-sm font-medium text-[#1F2A44]">
          {({ documentDate: item.category === 'bank_statement' ? 'Statement period / date' : item.category === 'identity_document' ? 'Expiry date / issue date' : 'Document date', counterparty: item.category === 'identity_document' ? 'Name' : 'Company / other party', reference: item.category === 'identity_document' ? 'Document number' : item.category === 'commercial_register' ? 'HRB number' : 'Invoice / reference number', description: item.category === 'bank_statement' ? 'Bank / transaction summary' : 'Document type / description', netAmount: 'Net amount', vatRate: 'VAT rate', vatAmount: 'VAT amount', grossAmount: 'Gross amount', debitAccount: 'Debit account', creditAccount: 'Credit account' })[key]}
            <input
              value={fields[key]}
              onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
            className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-[#0B7F99] ${fields[key].trim() ? item.confidence >= 0.65 ? 'border-[#1F8A5B]/50 bg-[#1F8A5B]/5' : 'border-[#D98A1B]/50 bg-[#D98A1B]/5' : 'border-[#E6E0D0] bg-white'}`}
            />
            {fields[key].trim() && <span className={`mt-1 inline-flex items-center gap-1 text-xs ${item.confidence >= 0.65 ? 'text-[#1F8A5B]' : 'text-[#8A5600]'}`}>
              {item.confidence >= 0.65 ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {item.confidence >= 0.65 ? 'Confident match' : 'Please verify'}
            </span>}
          </label>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[#E6E0D0] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-5 text-[#4A5468]">Saving shares the original and your corrections with your FinTax team for final review.</p>
      <Button ref={primarySaveRef} variant="primary" className="min-h-11 rounded-xl bg-[#0B7F99] text-white hover:bg-[#096A80]" disabled={!storageReady} icon={<Save className="size-4" />} onClick={() => onSave(item, text, fields, details)}>
          Save and send for review
        </Button>
      </div>
    </article>
  );
}

export default function ClientDocumentUploadPage({
  activePeriodDocuments,
  queuedUploads,
  pendingDocuments,
  reviewTargetId,
  storageReady,
  storageError,
  selectedTypeIds: selectedTypeIdsProp,
  selectedArea: initialArea = 'accounting',
  activePeriod,
  periods,
  periodReadOnly,
  onSelectPeriod,
  uploadNote,
  onUploadNoteChange,
  lang,
  dragOver,
  uploadError,
  notice,
  fileInput,
  cameraInput,
  primarySaveRef,
  onReviewDocument,
  onRetryUpload,
  onSelectedTypeIdsChange,
  onAreaChange,
  onOpenCamera,
  onSubmitFiles,
  onRemoveQueuedFile,
  onQueuedFileTypeChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onCancelUpload,
  onSaveDraft,
  onChangeDocumentType,
}: ClientDocumentUploadPageProps) {
  const [activeArea, setActiveArea] = useState<ClientArea>(initialArea);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>(selectedTypeIdsProp);
  const [queueOpen, setQueueOpen] = useState(false);
  const portalLang = usePortalLanguage((state) => state.language);
  const reduceMotion = useReducedMotion();
  const activeAreaConfig = AREAS.find((item) => item.key === activeArea) ?? AREAS[0];
  const periodYears = [...new Set(periods.filter((period) => !activePeriod || period.month === activePeriod.month).map((period) => period.year))].sort((a, b) => b - a);
  const periodMonths = [...new Set(periods.filter((period) => !activePeriod || period.year === activePeriod.year).map((period) => period.month))].sort((a, b) => a - b);
  const monthLabel = (month: number) => new Date(2026, month - 1, 1).toLocaleDateString(
    lang === 'de' ? 'de-DE' : lang === 'ar' ? 'ar-AE' : 'en-US',
    { month: 'long' },
  );
  const selectAvailablePeriod = (year: number, month: number) => {
    const exactPeriod = periods.find((period) => period.year === year && period.month === month);
    if (exactPeriod) onSelectPeriod(exactPeriod.id);
  };

  useEffect(() => {
    setActiveArea(initialArea);
  }, [initialArea]);

  useEffect(() => {
    setSelectedTypeIds(selectedTypeIdsProp);
  }, [selectedTypeIdsProp]);

  const switchArea = (area: ClientArea) => {
    setActiveArea(area);
    if (onAreaChange) onAreaChange(area);
    const firstType = AREA_CHECKBOXES[area][0];
    const typeIds = firstType ? [firstType.id] : [];
    setSelectedTypeIds(typeIds);
    onSelectedTypeIdsChange(typeIds);
  };

  const toggleType = (item: UploadType) => {
    const currentTypes = AREA_CHECKBOXES[activeArea].filter((type) => selectedTypeIds.includes(type.id));
    const nextTypes = currentTypes.some((type) => type.id === item.id)
      ? currentTypes.filter((type) => type.id !== item.id)
      : [...currentTypes, item];
    if (!nextTypes.length) return;
    const typeIds = nextTypes.map((type) => type.id);
    setSelectedTypeIds(typeIds);
    onSelectedTypeIdsChange(typeIds);
  };
  const typeLabel = (item: UploadType) => t3(lang, ...item.label);

  const uploadDisabled = !storageReady || periodReadOnly;
  const areaTitle = (area: ClientArea) => ({
    formation: t3(lang, 'Formation', 'Gründung', 'تأسيس'),
    payroll: t3(lang, 'Payroll', 'Lohnabrechnung', 'الرواتب'),
    accounting: t3(lang, 'Accounting', 'Buchhaltung', 'المحاسبة'),
    correspondence: t3(lang, 'Correspondence', 'Korrespondenz', 'المراسلات'),
  })[area];
  const areaDescription = (area: ClientArea) => ({
    formation: t3(lang, 'One-time company documents', 'Einmalige Unternehmensunterlagen', 'مستندات الشركة لمرة واحدة'),
    payroll: t3(lang, 'Payroll, sick notes and staff changes', 'Lohnunterlagen, Krankmeldungen und Personaländerungen', 'الرواتب والإجازات المرضية وتغييرات الموظفين'),
    accounting: t3(lang, 'Statements, invoices and receipts', 'Kontoauszüge, Rechnungen und Belege', 'كشوف الحسابات والفواتير والإيصالات'),
    correspondence: t3(lang, 'Letters, contracts and other documents', 'Briefe, Verträge und sonstige Unterlagen', 'الخطابات والعقود والمستندات الأخرى'),
  })[area];

  const scrollToReview = (id: string) => {
    const review = document.getElementById(`client-extracted-review-${id}`);
    const scrollArea = review?.closest<HTMLElement>('.client-upload-scroll');
    if (!review || !scrollArea) return;
    const top = scrollArea.scrollTop + review.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top - 12;
    scrollArea.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    if (!reviewTargetId) return;
    const timer = window.setTimeout(() => scrollToReview(reviewTargetId), 120);
    return () => window.clearTimeout(timer);
  }, [reviewTargetId, reduceMotion]);

  useEffect(() => {
    if (activePeriodDocuments.length) setQueueOpen(true);
  }, [activePeriodDocuments.length]);

  useEffect(() => {
    if (reviewTargetId) setQueueOpen(true);
  }, [reviewTargetId]);

  const selectedPendingDocument = pendingDocuments.find((item) => item.id === reviewTargetId);

  return (
    <>
      {notice && <p role="status" className="rounded-xl border border-ok/20 bg-ok/5 p-3 text-sm text-ink">{notice}</p>}

      {uploadError && (
        <div role="alert" className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-rose-600" />
          <span className="min-w-0 break-words">{uploadError}</span>
        </div>
      )}

      {storageError
        ? <p role="alert" className="rounded-xl border border-bad/20 bg-bad/5 p-3 text-sm text-bad">Browser storage error: {storageError}. Uploading and saving are disabled until storage is available.</p>
        : !storageReady && <p role="status" className="rounded-xl border border-warn/20 bg-warn/5 p-3 text-sm text-muted">Preparing browser storage. Controls will be available when ready.</p>}

      <section className="space-y-4">
        <fieldset className="rounded-xl border border-[#E6E0D0] bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[.12em] text-[#4A5468]">
            {t3(lang, 'Choose a document area', 'Dokumentenbereich auswählen', 'اختر قسم المستندات')}
          </legend>
          <div role="group" aria-label={t3(lang, 'Choose an upload area', 'Upload-Bereich auswählen', 'اختر قسم الرفع')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {AREAS.map(({ key, icon: AreaIcon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={activeArea === key}
                onClick={() => switchArea(key)}
                className={cx(
                  'flex min-h-[76px] min-w-0 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F99]',
                  activeArea === key
                    ? 'border-[#B07A2A] bg-[#B07A2A]/10 text-[#1F2A44]'
                    : 'border-[#E6E0D0] bg-white text-[#4A5468] hover:border-[#B07A2A]',
                )}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold leading-5">
                  <AreaIcon className="size-4 shrink-0 text-[#0B7F99]" aria-hidden="true" />
                  <span className="min-w-0 break-words">{areaTitle(key)}</span>
                </span>
                <span className="min-w-0 break-words text-[11px] leading-4 text-[#4A5468]">{areaDescription(key)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {activeAreaConfig.hasUploadPeriod && activePeriod && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-[#E6E0D0] bg-white p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[.12em] text-[#4A5468]">{t3(lang, 'Upload period', 'Abrechnungszeitraum', 'فترة الرفع')}</legend>
              <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#4A5468]">{t3(lang, 'Month', 'Monat', 'الشهر')}
                <select value={activePeriod.month} onChange={(event) => selectAvailablePeriod(activePeriod.year, Number(event.target.value))} className="mt-1.5 h-11 w-full rounded-xl border border-[#E6E0D0] bg-[#F8F6F1] px-3 text-sm font-normal normal-case tracking-normal text-[#1F2A44]">
                  {periodMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
                </select>
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#4A5468]">{t3(lang, 'Year', 'Jahr', 'السنة')}
                <select value={activePeriod.year} onChange={(event) => selectAvailablePeriod(Number(event.target.value), activePeriod.month)} className="mt-1.5 h-11 w-full rounded-xl border border-[#E6E0D0] bg-[#F8F6F1] px-3 text-sm font-normal normal-case tracking-normal text-[#1F2A44]">
                  {periodYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
          </fieldset>
        )}

        <fieldset className="rounded-xl border border-[#E6E0D0] bg-white p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[.12em] text-[#4A5468]">{t3(lang, 'Type of documents', 'Art der Unterlagen', 'نوع المستند')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AREA_CHECKBOXES[activeArea].map((item) => (
                <label key={item.id} className={cx('flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-sm leading-5 transition-colors hover:border-[#B07A2A] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0B7F99]', selectedTypeIds.includes(item.id) ? 'border-[#B07A2A] bg-[#B07A2A]/5 text-[#1F2A44]' : 'border-[#E6E0D0] text-[#4A5468]')}>
                  <input type="checkbox" name="upload-document-type" value={item.id} checked={selectedTypeIds.includes(item.id)} onChange={() => toggleType(item)} className="sr-only" />
                  <span aria-hidden="true" className={cx('grid size-4 shrink-0 place-items-center rounded border', selectedTypeIds.includes(item.id) ? 'border-[#0B7F99] bg-[#0B7F99] text-white' : 'border-[#9AA0A6] bg-white')}>
                    {selectedTypeIds.includes(item.id) && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 break-words">{typeLabel(item)}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#4A5468]">{t3(lang, 'Choose all document types in this batch. You can set the type for each file below.', 'Wählen Sie alle Dokumentarten für diesen Upload. Den Typ können Sie unten je Datei festlegen.', 'اختر جميع أنواع المستندات في هذه الدفعة. يمكنك تحديد نوع كل ملف أدناه.')}</p>
        </fieldset>

        <section id="client-upload" className="scroll-mt-24 space-y-4" aria-label={t3(lang, 'Upload form', 'Upload-Formular', 'نموذج الرفع')}>
          <motion.div
            onDrop={onDrop}
            onDragOver={(event) => { event.preventDefault(); onDragOver(); }}
            onDragLeave={onDragLeave}
            onClick={(event) => {
              if (uploadDisabled || (event.target as HTMLElement).closest('.client-camera-action')) return;
              fileInput.current?.click();
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || uploadDisabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInput.current?.click();
              }
            }}
            role="group"
            tabIndex={uploadDisabled ? -1 : 0}
            className={cx(
              'relative min-w-0 overflow-hidden rounded-xl border-2 border-dashed bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7F99]',
              dragOver ? 'border-[#0B7F99] bg-[#0B7F99]/5 upload-drop-active' : 'border-[#eee5d7]',
              !uploadDisabled && 'cursor-pointer',
            )}
            aria-label={t3(lang, 'Add files: choose files or drop them here', 'Dateien hinzufügen: auswählen oder hier ablegen', 'أضف ملفات: اخترها أو أفلتها هنا')}
          >
            {periodReadOnly && (
              <p role="status" className="mx-auto mt-3 max-w-lg rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t3(lang, 'This month is read-only. Choose an open month from the overview before uploading.', 'Dieser Monat ist schreibgeschützt. Wählen Sie vor dem Hochladen in der Übersicht einen offenen Monat aus.', 'هذا الشهر للقراءة فقط. اختر شهرًا مفتوحًا من النظرة العامة قبل الرفع.')}
              </p>
            )}

            <div className="flex min-h-[140px] flex-col items-center justify-center p-4 text-center sm:min-h-[142px] sm:p-6">
              <div className="mx-auto grid size-9 place-items-center rounded-md bg-[#4C9AFF] text-white shadow-sm">
                <FileUp className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm font-semibold text-[#0f1f3d]">{dragOver
                ? t3(lang, 'Drop files to add them', 'Dateien hier ablegen', 'أفلت الملفات لإضافتها')
                : <><span className="rounded px-1 text-[#0F1B3D] underline decoration-[#B07A2A] underline-offset-2">{t3(lang, 'Choose files', 'Dateien auswählen', 'اختر الملفات')}</span><span className="font-normal text-[#4A5468]"> {t3(lang, 'or drop them here', 'oder hier ablegen', 'أو أفلتها هنا')}</span></>}</p>
              <p className="mt-1 text-xs text-slate-500">{t3(lang, 'PDF, photos, Word, Excel, CSV or text · up to', 'PDF, Fotos, Word, Excel, CSV oder Text · bis zu', 'PDF أو صور أو Word أو Excel أو CSV أو نص · حتى')} {CLIENT_MAX_UPLOAD_BYTES / 1024 / 1024} MB {t3(lang, 'per file', 'pro Datei', 'لكل ملف')}</p>
              <button type="button" aria-label={t3(lang, 'Take photo', 'Foto aufnehmen', 'التقط صورة')} title={t3(lang, 'Take photo', 'Foto aufnehmen', 'التقط صورة')} disabled={uploadDisabled} onClick={(event) => { event.stopPropagation(); onOpenCamera(); }} className="client-camera-action absolute end-2 top-2 z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#E6E0D0] bg-white px-3 text-[#4A5468] hover:border-[#B07A2A] focus-visible:outline-2 focus-visible:outline-[#0B7F99]">
                <Camera className="size-4" /><span>{t3(lang, 'Take photo', 'Foto aufnehmen', 'التقط صورة')}</span>
              </button>
            </div>
          </motion.div>

          {queuedUploads.length > 0 && (
            <section aria-label={t3(lang, 'Files ready to upload', 'Dateien zum Hochladen', 'الملفات الجاهزة للرفع')} className="rounded-xl border border-[#E6E0D0] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#1F2A44]">{t3(lang, 'Files to send', 'Dateien zum Senden', 'ملفات للإرسال')}</h3>
                <span className="rounded-full bg-[#0B7F99]/10 px-2.5 py-1 text-xs font-semibold text-[#0B7F99]">{queuedUploads.length}</span>
              </div>
              <ul className="mt-2 divide-y divide-[#E6E0D0]">
                {queuedUploads.map((upload) => (
                  <li key={upload.id} className="grid min-w-0 grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.8fr)_auto]">
                    <span className="min-w-0">
                      <span className="block break-all text-sm font-medium text-[#1F2A44]">{upload.file.name}</span>
                      <span className="text-xs text-[#4A5468]">{formatBytes(upload.file.size)}</span>
                    </span>
                    <label className="text-xs font-medium text-[#4A5468]">
                      {t3(lang, 'Document type', 'Dokumentenart', 'نوع المستند')}
                      <select value={upload.typeId} onChange={(event) => onQueuedFileTypeChange(upload.id, event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#E6E0D0] bg-[#F8F6F1] px-2 text-sm text-[#1F2A44]">
                        {AREA_CHECKBOXES[upload.area].map((item) => <option key={item.id} value={item.id}>{typeLabel(item)}</option>)}
                      </select>
                    </label>
                    <button type="button" aria-label={`${t3(lang, 'Remove', 'Entfernen', 'إزالة')} ${upload.file.name}`} onClick={() => onRemoveQueuedFile(upload.id)} className="min-h-11 justify-self-end rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-[#0B7F99] sm:col-start-3 sm:row-start-1">
                      {t3(lang, 'Remove', 'Entfernen', 'إزالة')}
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="primary" className="mt-2 min-h-11 w-full rounded-xl bg-[#0F1B3D] text-white hover:bg-[#1B3160]" disabled={uploadDisabled} onClick={onSubmitFiles}>
                {t3(lang, 'Upload and process files', 'Dateien hochladen und verarbeiten', 'رفع الملفات ومعالجتها')} <span aria-hidden="true">→</span>
              </Button>
            </section>
          )}

          <div className="rounded-xl border border-[#E6E0D0] bg-white p-3">
            <label className="block text-start text-xs font-semibold text-[#1F2A44]">
            {t3(lang, 'Note (optional)', 'Notiz (optional)', 'ملاحظة (اختياري)')}
            <textarea
              rows={3}
              value={uploadNote}
              onChange={(event) => onUploadNoteChange(event.target.value)}
              placeholder={t3(lang, 'e.g. Please note the attached leave request…', 'z. B. Urlaubsantrag liegt bei, bitte beachten…', 'مثال: يرجى ملاحظة طلب الإجازة المرفق…')}
              className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-[#e8e2d2] bg-[#faf9f6] p-3 text-sm font-normal normal-case tracking-normal text-[#0f1f3d] outline-none placeholder:text-slate-400 focus:border-[#c9a24b]"
            />
            </label>
          </div>

          {activePeriodDocuments.length > 0 && (
            <details
              open={queueOpen}
              onToggle={(event) => setQueueOpen(event.currentTarget.open)}
              className="rounded-xl border border-[#E6E0D0] bg-white px-3"
            >
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#0F1B3D]">
                {t3(lang, 'Your files', 'Ihre Dateien', 'ملفاتك')} <span className="ms-2 text-xs font-normal text-[#4A5468]">({activePeriodDocuments.length})</span>
              </summary>
              <ul className="mt-2 divide-y divide-[#E6E0D0]">
                {activePeriodDocuments.map((item) => {
                  const isReading = item.status === 'processing';
                  const isReady = item.clientSaved === false && item.extractedText !== undefined;
                  const isSent = item.clientSaved === true;
                  const hasActionRequired = item.status === 'action_required' || item.status === 'password_required';
                  const hasFailed = item.status === 'password_required'
                    || (item.status === 'action_required'
                      && (Boolean(item.validationWarnings?.length) || item.note?.includes('Processing was canceled') === true));
                  return (
                    <li key={item.id} id={`client-upload-queue-${item.id}`} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${isSent ? 'bg-[#1F8A5B]/10 text-[#1F8A5B]' : hasFailed ? 'bg-rose-500/10 text-rose-700' : hasActionRequired ? 'bg-amber-500/10 text-amber-700' : isReady ? 'bg-[#D98A1B]/10 text-[#8A5600]' : 'bg-[#0B7F99]/10 text-[#0B7F99]'}`}>
                        {isSent ? <CheckCircle2 className="client-send-success size-5" /> : hasActionRequired ? <AlertTriangle className="size-5" /> : isReady ? <FileUp className="size-5" /> : <ProgressBar value={item.processingProgress ?? 0} active />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium text-[#1F2A44]">{item.name}</span>
                        <span className="mt-0.5 block text-sm text-[#4A5468]" aria-live="polite">
                          {isSent ? t3(lang, 'Sent', 'Gesendet', 'تم الإرسال') : hasFailed ? t3(lang, 'Could not read this file. Upload it again.', 'Datei konnte nicht gelesen werden. Bitte erneut hochladen.', 'تعذرت قراءة الملف. يرجى رفعه مرة أخرى.') : hasActionRequired ? t3(lang, 'Needs your attention', 'Ihre Aufmerksamkeit ist erforderlich', 'يتطلب انتباهك') : isReady ? t3(lang, 'Ready to review', 'Bereit zur Prüfung', 'جاهز للمراجعة') : t3(lang, 'Reading', 'Wird gelesen', 'جارٍ القراءة')}
                        </span>
                        {hasActionRequired && item.note && <span className="mt-1 block break-words text-xs text-rose-700">{item.note}</span>}
                        {isReading && <span className="mt-2 block max-w-xs"><ProgressBar value={item.processingProgress ?? 0} active /></span>}
                      </span>
                      {hasFailed && (
                        <Button size="sm" variant="outline" className="min-h-11 rounded-xl" disabled={!storageReady || periodReadOnly} onClick={() => onRetryUpload(item)}>
                          <RotateCw className="me-1 size-3.5" />{t3(lang, 'Upload again', 'Erneut hochladen', 'إعادة الرفع')}
                        </Button>
                      )}
                      {isReading && item.extractedText === undefined && (
                        <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => onCancelUpload(item)}>
                          {t3(lang, 'Cancel', 'Abbrechen', 'إلغاء')}
                        </Button>
                      )}
                      {isReady && (
                        <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => onReviewDocument?.(item.id)}>
                          {t3(lang, 'Review', 'Prüfen', 'مراجعة')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          {/* Extracted Review */}
          {selectedPendingDocument && (
            <section id="client-extracted-review" className="scroll-mt-24 space-y-4" aria-label="Review extracted documents">
              <div>
                <h2 className="font-serif text-lg font-semibold text-[#0f1f3d]">Review your uploaded document</h2>
                <p className="mt-1 text-sm text-muted">
                  Check the text and details found in your file. Correct anything that is wrong, then send it to your FinTax team.
                </p>
              </div>
              {[selectedPendingDocument].map((item) => (
                <ExtractedDocumentReview
                  key={item.id}
                  item={item}
                  storageReady={storageReady}
                  onSave={onSaveDraft}
                  onChangeType={onChangeDocumentType}
                  primarySaveRef={primarySaveRef}
                  lang={lang}
                />
              ))}
            </section>
          )}
        </section>
      </section>
    </>
  );
}
