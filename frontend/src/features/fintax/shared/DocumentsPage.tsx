import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, LockKeyhole, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input, Panel } from '@/components/ui/primitives';
import type { FinTaxDocument } from '@/types/api';
import type { LocalDocumentExtraction, OcrLanguage } from '../client/processDocument';
import { portalCategory, portalExtractionNote, portalText, usePortalLanguage } from './portalLanguage';

const CATEGORIES = [
  ['company_formation', 'Company formation'],
  ['accounting', 'Accounting / FiBu'],
  ['bank_statement', 'Bank statement'],
  ['purchase_invoice', 'Purchase invoice'],
  ['sales_invoice', 'Sales invoice'],
  ['receipt', 'Receipt'],
  ['cash_book', 'Cash book'],
  ['payroll', 'Payroll'],
  ['employee_record', 'Employee record'],
  ['correspondence', 'Correspondence'],
  ['identity_document', 'Identity document'],
  ['contract', 'Contract'],
  ['other', 'Other'],
];

const formatSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const language = usePortalLanguage((state) => state.language);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  const [searchParams, setSearchParams] = useSearchParams();
  const account = useQuery({ queryKey: ['fintax-user'], queryFn: api.me, staleTime: 30_000 });
  const documents = useQuery({ queryKey: ['fintax-documents'], queryFn: api.documents, refetchInterval: 15_000 });
  const clients = useQuery({
    queryKey: ['fintax-clients'],
    queryFn: api.clients,
    enabled: account.data?.user.role === 'admin' || account.data?.user.role === 'staff',
  });
  const clientFilter = searchParams.get('clientId') ?? '';
  const [category, setCategory] = useState('accounting');
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('eng+deu+ara');
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState('');
  const upload = useMutation({
    mutationFn: ({ selectedFile, extraction }: { selectedFile: File; extraction: LocalDocumentExtraction | null }) => api.uploadDocument(
      selectedFile,
      category,
      account.data?.user.role === 'client' ? undefined : clientId,
      extraction ? {
        text: extraction.text,
        note: extraction.note,
        language: extraction.ocrEngine === 'Tesseract.js' ? ocrLanguage : '',
        confidence: extraction.ocrConfidence,
      } : undefined,
    ),
    onSuccess: () => {
      setFile(null);
      setExtractionProgress('');
      const input = document.getElementById('document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      void queryClient.invalidateQueries({ queryKey: ['fintax-documents'] });
    },
    onError: (error) => setUploadError(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Upload failed'),
  });
  const role = account.data?.user.role;
  const selectedClient = clients.data?.find((client) => client.id === clientFilter);
  const visibleDocuments = documents.data?.filter((item) => !clientFilter || item.client_id === clientFilter) ?? [];
  const prettyCategory = (value: string) => portalCategory(language, value);
  const processAndUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError('');
    if (!file) { setUploadError(t('chooseDocument')); return; }
    if (file.size > 50 * 1024 * 1024) { setUploadError(t('maximumUpload')); return; }
    if (role !== 'client' && !clientId) { setUploadError(t('chooseClient')); return; }
    setExtracting(true);
    setExtractionProgress(t('extracting'));
    try {
      const legacyExcel = file.name.toLowerCase().endsWith('.xls');
      let extraction: LocalDocumentExtraction | null = null;
      if (!legacyExcel) {
        const { processLocalDocument } = await import('../client/processDocument');
        extraction = await processLocalDocument(
          file,
          (_progress, stage) => setExtractionProgress(stage || t('processingDocument')),
          undefined,
          ocrLanguage,
        );
      }
      await upload.mutateAsync({ selectedFile: file, extraction });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('extractionFailed'));
    } finally {
      setExtracting(false);
      setExtractionProgress('');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div><p className="text-sm font-medium text-cyan">{t('consulting')}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('documents')}</h1><p className="mt-2 text-sm text-muted">{t('documentsStoredPrivately')}</p></div>

      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan/10 text-cyan"><Upload className="size-5" /></span><div><h2 className="font-semibold">{t('uploadDocument')}</h2><p className="mt-1 text-xs text-muted">{t('supportedFiles')}</p></div></div>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void processAndUpload(event)}>
          {role !== 'client' && <Field label={t('clientAccount')} htmlFor="document-client">
            <select id="document-client" required value={clientId} onChange={(event) => setClientId(event.target.value)} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm">
              <option value="">{t('selectClient')}</option>{clients.data?.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.client_number}</option>)}
            </select>
          </Field>}
          <Field label={t('documentCategory')} htmlFor="document-category">
            <select id="document-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm">
              {CATEGORIES.map(([key]) => <option key={key} value={key}>{portalCategory(language, key)}</option>)}
            </select>
          </Field>
          <Field label={t('chooseFile')} htmlFor="document-file">
            <Input id="document-file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,.xlsx,.xls,.csv,.txt,.docx,application/pdf,image/jpeg,image/png,image/webp,image/tiff,image/bmp,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="py-2" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <Field label={t('extractionLanguage')} htmlFor="ocr-language">
            <select id="ocr-language" value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value as OcrLanguage)} className="h-10 w-full rounded-lg border hairline bg-bg/60 px-3 text-sm">
              <option value="eng+deu+ara">{t('multilingualOcr')}</option>
              <option value="eng">{t('textEnglish')}</option>
              <option value="deu">{t('textGerman')}</option>
              <option value="ara">{t('textArabic')}</option>
            </select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="primary" icon={<Upload className="size-4" />} loading={upload.isPending || extracting} className="w-full">{t('uploadOriginal')}</Button></div>
        </form>
        {(extracting || upload.isPending) && <p role="status" aria-live="polite" className="mt-3 text-sm text-cyan">{extractionProgress || t('processingDocument')}</p>}
        {uploadError && <p role="alert" className="mt-3 text-sm text-bad">{uploadError}</p>}
        {upload.isSuccess && <p role="status" className={`mt-3 text-sm ${upload.data.status === 'duplicate' ? 'text-warn' : 'text-green'}`}>
          {upload.data.status === 'duplicate' ? t('duplicateUpload') : t('uploadReceived')}
        </p>}
        <p className="mt-4 flex items-start gap-2 text-xs text-muted"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />{t('extractionInfo')} {t('noTranslation')}</p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b hairline px-5 py-4">
          <FileText className="size-5 text-cyan" />
          <div className="min-w-0 flex-1"><h2 className="font-semibold">Shared document inbox</h2><p className="text-xs text-muted">
            {role === 'client'
              ? t('clientInboxHint')
              : role === 'admin'
                ? t('adminInboxHint')
                : t('staffInboxHint')}
            {' '}{t('inboxRefresh')}
          </p></div>
          {(role === 'admin' || role === 'staff') && <label className="w-full sm:w-auto">
            <span className="sr-only">{t('filterClient')}</span>
            <select
              aria-label={t('filterClient')}
              value={clientFilter}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value) next.set('clientId', event.target.value);
                else next.delete('clientId');
                setSearchParams(next, { replace: true });
              }}
              className="h-9 w-full rounded-lg border hairline bg-bg/60 px-3 text-xs sm:w-64"
            >
              <option value="">{t('allAccessibleClients')}</option>
              {clients.data?.map((client) => <option key={client.id} value={client.id}>{client.company_name} · {client.client_number}</option>)}
            </select>
          </label>}
          {role !== 'client' && <Link to="/clients" className="text-xs text-cyan hover:underline">{t('clientAccountsLink')}</Link>}
        </div>
        {(role === 'admin' || role === 'staff') && clients.isError && <p role="alert" className="border-b hairline px-5 py-3 text-sm text-bad">{t('loadClientsError')}</p>}
        {documents.isLoading ? <p className="p-5 text-sm text-muted">{t('loadingDocuments')}</p>
          : documents.isError ? <p role="alert" className="p-5 text-sm text-bad">{t('loadDocumentsError')}</p>
            : visibleDocuments.length ? <ul className="divide-y divide-line/10">{visibleDocuments.map((item) => <DocumentRow
              key={item.id}
              item={item}
              category={prettyCategory(item.category)}
              clientName={role === 'client' ? account.data?.user.company_name ?? undefined : clients.data?.find((client) => client.id === item.client_id)?.company_name}
              language={language}
            />)}</ul>
              : <p className="p-8 text-center text-sm text-muted">{clientFilter ? `${t('noFilteredDocuments')} ${selectedClient?.company_name ?? ''}` : t('noDocuments')}</p>}
      </Panel>
    </div>
  );
}

function DocumentRow({ item, category, clientName, language }: { item: FinTaxDocument; category: string; clientName?: string; language: 'en' | 'de' | 'ar' }) {
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-4">
      <span className="grid size-9 place-items-center rounded-lg bg-violet/10 text-violet"><FileText className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.original_filename}</span><span className="block text-xs text-muted">{category} · {formatSize(item.size_bytes)}{item.page_count ? ` · ${item.page_count} ${t('pages')}` : ''}{clientName ? ` · ${clientName}` : ''}{item.ocr_confidence !== null ? ` · ${Math.round(item.ocr_confidence * 100)}%` : ''}</span></span>
      <span className={`text-xs ${item.status === 'received' ? 'text-green' : 'text-warn'}`}>{item.status === 'password_required' ? t('passwordHandling') : item.status === 'duplicate' ? t('possibleDuplicate') : t('received')}</span>
      <a href={`/api/documents/${encodeURIComponent(item.id)}/download`} className="inline-flex h-9 items-center gap-2 rounded-lg border hairline px-3 text-sm hover:border-cyan/40" download><Download className="size-4" />{t('downloadOriginal')}</a>
      <details className="basis-full rounded-lg border hairline bg-bg/30 p-3">
        <summary className="cursor-pointer text-xs font-medium text-cyan">{t('extractedText')}</summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-ink" dir="auto">{item.extracted_text || t('noTextFound')}</pre>
        {item.extraction_note && <p className="mt-2 text-[10px] text-muted">{portalExtractionNote(language, item.extraction_note)}</p>}
        {item.ocr_languages && <p className="mt-2 text-[10px] text-muted"><span>{t('recognizedLanguages')}:</span> {item.ocr_languages}</p>}
      </details>
    </li>
  );
}
