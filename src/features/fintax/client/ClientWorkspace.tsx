import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  BarChart3, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, FileSearch, FileText,
  FileUp, FolderOpen, Languages, ListChecks, LockKeyhole, LogOut, Menu, MoreHorizontal, Paperclip, Receipt,
  Moon, Sun, Upload, UserRound, Wallet, X,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  categoryFromDocumentText, categoryForFilename, detectDocumentLanguage, emptyDemoFields, extractDocumentFields,
  extractDocumentDetails, CLIENT_MAX_UPLOAD_BYTES, validateDemoFile,
  DEMO_CATEGORIES, type DemoCategory, type DemoDocument,
} from '../shared/demoWorkflow';
import { useDemoDocumentsStore } from '@/stores/demoDocumentsStore';
import { clientProfileFor } from '../shared/clientDemoData';
import { checklistBlockers, folderPathForCategory, isChecklistComplete } from '../shared/storage/periods';
import { currentDemoPeriodId } from '../shared/storage/seedPeriods';
import { documentsVisibleTo } from '../shared/storage/selectors';
import type { AssistantLanguage } from './clientAssistant';
import LocalizedFinTaxLogo from '../shared/LocalizedFinTaxLogo';
import ClientDocumentUploadPage, { AREA_CHECKBOXES, uploadTypeForCategory } from './pages/ClientDocumentUploadPage';
import { createClientUploadQueue, type QueuedClientUpload } from './clientUploadQueue';
import ClientDashboardPage from './pages/ClientDashboardPage';
import type { ClientDocumentFilter } from './pages/ClientDocumentHistoryPage';
import { areaOf } from './clientUi';
import { t3 } from './clientPageUtils';
import { usePortalLanguage } from '../shared/portalLanguage';

const HelpBot = lazy(() => import('../shared/HelpBot'));
const ClientDocumentHistoryPage = lazy(() => import('./pages/ClientDocumentHistoryPage'));

function validationWarnings(document: DemoDocument): string[] {
  const warnings = [...(document.validationWarnings ?? [])];
  if (['purchase_invoice', 'sales_invoice', 'receipt'].includes(document.category)) {
    const fields = document.fields;
    if (!fields.documentDate) warnings.push('Document date needs manual confirmation.');
    if (!fields.counterparty) warnings.push('Supplier or customer needs manual confirmation.');
    if (!fields.reference) warnings.push('Invoice or receipt reference was not detected.');
    const amounts = [fields.netAmount, fields.vatAmount, fields.grossAmount].map(Number);
    if (!fields.netAmount || !fields.vatAmount || !fields.grossAmount || !amounts.every(Number.isFinite)) warnings.push('Net, VAT, and gross values need review.');
    else if (Math.abs(amounts[0] + amounts[1] - amounts[2]) > 0.01) warnings.push('Net plus VAT does not equal gross total.');
  }
  if (document.category === 'bank_statement') {
    const details = document.extractedDetails ?? {};
    if (!details['Opening balance']) warnings.push('Opening balance needs manual confirmation.');
    if (!details['Closing balance']) warnings.push('Closing balance needs manual confirmation.');
    warnings.push('Transaction matching and balance reconciliation are not performed in this demo.');
  }
  if ((document.pageCount ?? 0) > 1) warnings.push('Multi-page PDF: confirm pages are in order and the file does not combine unrelated documents.');
  if (['payroll', 'timesheet', 'sick_note', 'employee_record', 'identity_document'].includes(document.category)) warnings.push('Sensitive payroll or identity details require manual staff review.');
  if (!document.detectedLanguage?.startsWith('German') && !document.detectedLanguage?.startsWith('English')) warnings.push('Language or OCR support is limited; manual review is required.');
  return [...new Set(warnings)];
}

/** Number that counts up when it changes (static when the user prefers reduced motion). */
function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{shown}</>;
}

let clientStorageHydration: Promise<void> | null = null;

export default function ClientWorkspace({
  clientEmail,
  advisorFirm = 'FinTax Consulting',
  advisorId = '7',
  onSignOut,
}: {
  clientEmail: string;
  advisorFirm?: string;
  advisorId?: string;
  onSignOut: () => void;
}) {
  const reduce = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const allDocuments = useDemoDocumentsStore((state) => state.documents);
  const addDocument = useDemoDocumentsStore((state) => state.addDocument);
  const updateDocument = useDemoDocumentsStore((state) => state.updateDocument);
  const periods = useDemoDocumentsStore((state) => state.periods);
  const storageHydrated = useDemoDocumentsStore((state) => state.storageHydrated);
  const setChecklistItem = useDemoDocumentsStore((state) => state.setChecklistItem);
  const submitPeriod = useDemoDocumentsStore((state) => state.submitPeriod);
  const storageError = useDemoDocumentsStore((state) => state.storageError);
  const quotaWarning = useDemoDocumentsStore((state) => state.quotaWarning);
  const respondToRequest = useDemoDocumentsStore((state) => state.respondToRequest);
  const activeClientEmail = clientEmail;
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const activeClient = clientProfileFor(activeClientEmail);
  const documents = documentsVisibleTo(allDocuments, 'client', activeClientEmail);
  const clientPeriods = periods
    .filter((period) => period.clientId === activeClientEmail)
    .sort((left, right) => right.year - left.year || right.month - left.month);
  const currentPeriodId = currentDemoPeriodId(activeClientEmail);
  const activePeriod = clientPeriods.find((period) => period.id === selectedPeriodId)
    ?? clientPeriods.find((period) => period.id === currentPeriodId)
    ?? clientPeriods[0];
  const activePeriodDocuments = activePeriod
    ? documents.filter((document) => activePeriod.documentIds.includes(document.id))
    : [];
  const periodReadOnly = activePeriod?.status === 'submitted' || activePeriod?.status === 'in_review' || activePeriod?.status === 'completed';
  const canFinishPeriod = Boolean(activePeriod
    && isChecklistComplete(activePeriod.checklist)
    && !activePeriodDocuments.some((document) => document.status === 'processing' || document.status === 'action_required' || document.status === 'password_required' || document.clientSaved === false)
    && !periodReadOnly);
  const finishBlockers = activePeriod ? [
    ...checklistBlockers(activePeriod.checklist).map((item) => `${item.label} is still required.`),
    ...(activePeriodDocuments.some((document) => document.status === 'processing') ? ['Wait for document processing to finish.'] : []),
    ...(activePeriodDocuments.some((document) => document.status === 'action_required' || document.status === 'password_required') ? ['Resolve document processing failures.'] : []),
    ...(activePeriodDocuments.some((document) => document.clientSaved === false && document.extractedText !== undefined) ? ['Review and save each extracted document before submitting the month.'] : []),
  ] : ['No monthly period is available for this client.'];
  const [lang, setLang] = useState<'en' | 'de' | 'ar'>(() => {
    const saved = localStorage.getItem('fintax-language');
    return saved === 'de' || saved === 'ar' ? saved : 'en';
  });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeBottomSection, setActiveBottomSection] = useState('client-overview');
  const [demoBannerVisible, setDemoBannerVisible] = useState(true);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [helpBotLoaded, setHelpBotLoaded] = useState(false);
  const [helpBotOpen, setHelpBotOpen] = useState(false);
  const [helpBotOpenSignal, setHelpBotOpenSignal] = useState(0);
  const clientPage: 'dashboard' | 'documents' = location.pathname.endsWith('/documents') ? 'documents' : 'dashboard';
  const [uploadArea, setUploadArea] = useState<'formation' | 'payroll' | 'accounting' | 'correspondence'>('accounting');
  const [uploadNote, setUploadNote] = useState('');
  const [selectedUploadTypeIds, setSelectedUploadTypeIds] = useState(['a-purchase']);
  const [queuedUploads, setQueuedUploads] = useState<QueuedClientUpload[]>([]);
  const [uploadOpen, setUploadOpen] = useState(() => location.pathname.endsWith('/upload'));
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('fintax-client-theme');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
  });
  const [systemDarkMode, setSystemDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const darkMode = themeMode === 'system' ? systemDarkMode : themeMode === 'dark';
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClientDocumentFilter>('all');
  const [documentSearch, setDocumentSearch] = useState('');
  const [debouncedDocumentSearch, setDebouncedDocumentSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState('all');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [notApplicableReasons, setNotApplicableReasons] = useState<Record<string, string>>({});
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [finishConfirmed, setFinishConfirmed] = useState(false);

  useEffect(() => {
    usePortalLanguage.getState().setLanguage(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    window.dispatchEvent(new CustomEvent('fintax-language-change', { detail: lang }));
  }, [lang]);
  const [finishError, setFinishError] = useState('');
  const [passwordDialog, setPasswordDialog] = useState<{ fileName: string; resolve: (value: string | null) => void } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const cameraPreview = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const primarySaveRef = useRef<HTMLButtonElement>(null);
  const uploadDrawerRef = useRef<HTMLElement>(null);
  const pageScrollRef = useRef<HTMLDivElement>(null);
  const headerPreviousScrollTop = useRef(0);
  const drawerTouchStartY = useRef<number | null>(null);
  const replacementFor = useRef<string | undefined>();
  const uploadControllers = useRef(new Map<string, AbortController>());
  const cancelledUploadIds = useRef(new Set<string>());

  const stopCamera = useCallback(() => {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (cameraPreview.current) cameraPreview.current.srcObject = null;
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemDarkMode(media.matches);
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = darkMode ? '#0B1220' : '#F7F4EC';
  }, [darkMode]);

  useEffect(() => {
    const scroller = pageScrollRef.current;
    if (!scroller) return;
    headerPreviousScrollTop.current = scroller.scrollTop;
    const updateHeader = () => {
      const currentTop = scroller.scrollTop;
      if (currentTop < 12 || currentTop < headerPreviousScrollTop.current - 3) setHeaderScrolled(false);
      else if (currentTop > headerPreviousScrollTop.current + 3) setHeaderScrolled(true);
      headerPreviousScrollTop.current = currentTop;
    };
    scroller.addEventListener('scroll', updateHeader, { passive: true });
    return () => scroller.removeEventListener('scroll', updateHeader);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateKeyboard = () => setKeyboardOpen(viewport.height < window.innerHeight * 0.75);
    viewport.addEventListener('resize', updateKeyboard);
    updateKeyboard();
    return () => viewport.removeEventListener('resize', updateKeyboard);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedDocumentSearch(documentSearch), 180);
    return () => window.clearTimeout(timer);
  }, [documentSearch]);

  useEffect(() => {
    const syncHelpState = (event: Event) => {
      if (event instanceof CustomEvent) setHelpBotOpen(Boolean(event.detail));
    };
    document.addEventListener('fintax-helpbot-state', syncHelpState);
    return () => document.removeEventListener('fintax-helpbot-state', syncHelpState);
  }, []);

  const openHelpGuide = () => {
    setHelpBotLoaded(true);
    setHelpBotOpenSignal((signal) => signal + 1);
  };

  const refreshDocuments = async () => {
    await useDemoDocumentsStore.getState().hydrateStorage();
    const error = useDemoDocumentsStore.getState().storageError;
    if (error) throw new Error(`Could not refresh documents: ${error}`);
  };

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
  }, [stopCamera]);

  useEffect(() => {
    if (!clientStorageHydration && !useDemoDocumentsStore.getState().storageHydrated) {
      clientStorageHydration = useDemoDocumentsStore.getState().hydrateStorage();
    }
    return useDemoDocumentsStore.getState().startStorageSync();
  }, []);

  useEffect(() => () => {
    uploadControllers.current.forEach((controller) => controller.abort());
    cameraStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraLoading(false);
        setCameraError('Live camera is unavailable in this browser. Use the device camera option or choose an image instead.');
        return;
      }
      setCameraLoading(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStream.current = stream;
        setCameraError('');
        if (cameraPreview.current) {
          cameraPreview.current.srcObject = stream;
          await cameraPreview.current.play();
        }
        setCameraLoading(false);
      } catch (error) {
        if (cancelled) return;
        setCameraLoading(false);
        setCameraError(error instanceof Error
          ? `Could not access the camera: ${error.message}. Check camera permission or use the device camera option.`
          : 'Could not access the camera. Check camera permission or use the device camera option.');
      }
    };
    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen, stopCamera]);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    setUploadOpen(location.pathname.endsWith('/upload'));
  }, [location.pathname]);

  useEffect(() => {
    if (!uploadOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !passwordDialog) {
        if (cameraOpen) closeCamera();
        else closeUpload();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [uploadOpen, passwordDialog, cameraOpen, closeCamera]);

  useEffect(() => {
    if (!uploadOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = uploadDrawerRef.current;
    const focusFirst = window.requestAnimationFrame(() => drawer?.querySelector<HTMLElement>('[data-drawer-close]')?.focus());
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapTab);
    return () => {
      window.cancelAnimationFrame(focusFirst);
      document.removeEventListener('keydown', trapTab);
      previousFocus?.focus();
    };
  }, [uploadOpen]);

  const ATTENTION = ['needs_information', 'rejected', 'action_required', 'password_required'];
  const processing = documents.filter((d) => d.status === 'processing' || d.status === 'review');
  const attention = documents.filter((d) => ATTENTION.includes(d.status));
  const approved = documents.filter((d) => d.status === 'approved');
  const activity = documents.filter((d) => ['approved', ...ATTENTION].includes(d.status));
  const documentFolders = [...new Set(documents.map((document) => document.folder ?? folderPathForCategory(
    document.category,
    Number(document.fields.documentDate.slice(0, 4)) || new Date(document.createdAt).getFullYear(),
    Number(document.fields.documentDate.slice(5, 7)) || new Date(document.createdAt).getMonth() + 1,
  )))].sort();
  const normalizedDocumentSearch = debouncedDocumentSearch.trim().toLowerCase();
  const visibleDocs = documents.filter((document) => {
    const matchesStatus = filter === 'all'
      || (filter === 'processing' && (document.status === 'processing' || document.status === 'review'))
      || (filter === 'attention' && ATTENTION.includes(document.status))
      || (filter === 'approved' && document.status === 'approved');
    const folder = document.folder ?? folderPathForCategory(
      document.category,
      Number(document.fields.documentDate.slice(0, 4)) || new Date(document.createdAt).getFullYear(),
      Number(document.fields.documentDate.slice(5, 7)) || new Date(document.createdAt).getMonth() + 1,
    );
    const searchableText = [
      document.name,
      document.category,
      folder,
      document.extractedText,
      ...Object.values(document.fields),
      ...Object.values(document.extractedDetails ?? {}),
    ].join(' ').toLowerCase();
    return matchesStatus
      && (folderFilter === 'all' || folder === folderFilter)
      && (!normalizedDocumentSearch || searchableText.includes(normalizedDocumentSearch));
  });
  const hour = new Date().getHours();
  const greeting = t3(lang, hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening', hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend', hour < 12 ? 'صباح الخير' : 'مساء الخير');
  const pageSections = [
    { id: 'client-overview', label: t3(lang, 'Overview', 'Übersicht', 'نظرة عامة'), icon: BarChart3 },
    { id: 'client-demo-tasks', label: t3(lang, 'Tasks', 'Aufgaben', 'المهام'), icon: ListChecks },
    ...(activity.length ? [{ id: 'client-advisor-updates', label: t3(lang, 'Advisor updates', 'Neuigkeiten vom Berater', 'تحديثات المستشار'), icon: CalendarClock }] : []),
    { id: 'client-upload', label: t3(lang, 'Upload documents', 'Dokumente hochladen', 'رفع المستندات'), icon: Upload },
    { id: 'client-documents', label: t3(lang, 'Document history', 'Dokumentenverlauf', 'سجل المستندات'), icon: FolderOpen },
  ];

  useEffect(() => {
    setActiveBottomSection(clientPage === 'documents' ? 'client-documents' : 'client-overview');
  }, [clientPage]);

  const goToPageSection = (sectionId: string) => {
    setActiveBottomSection(sectionId);
    if (sectionId === 'client-upload') {
      setUploadOpen(true);
      setNavigationOpen(false);
      return;
    }
    const nextPage = sectionId === 'client-documents' ? 'documents' : 'dashboard';
    const route = nextPage === 'dashboard' ? '/client/dashboard' : `/client/dashboard/${nextPage}`;
    if (location.pathname !== route) navigate(route);
    if (nextPage === 'dashboard') {
      pageScrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      window.setTimeout(() => {
        const target = document.getElementById(sectionId);
        if (target && sectionId !== 'client-overview') target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      }, 60);
    } else {
      pageScrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    }
    setNavigationOpen(false);
  };

  const openUpload = (area?: typeof uploadArea, nextCategory?: DemoCategory, typeId?: string) => {
    const nextArea = area ?? (nextCategory ? areaOf({ category: nextCategory }) : uploadArea);
    const nextTypeId = typeId ?? (nextCategory
      ? uploadTypeForCategory(nextArea, nextCategory)
      : AREA_CHECKBOXES[nextArea][0].id);
    setUploadArea(nextArea);
    setSelectedUploadTypeIds([nextTypeId]);
    setReviewTargetId(null);
    setUploadOpen(true);
    setUploadError('');
  };

  const closeUpload = () => {
    setUploadOpen(false);
    if (location.pathname.endsWith('/upload')) navigate('/client/dashboard', { replace: true });
  };

  const cancelUpload = (item: DemoDocument) => {
    const controller = uploadControllers.current.get(item.id);
    if (controller) controller.abort();
    else cancelledUploadIds.current.add(item.id);
    if (passwordDialog?.fileName === item.name) {
      passwordDialog.resolve(null);
      setPasswordDialog(null);
    }
    updateDocument(item.id, {
      status: 'action_required',
      workflowStage: 'staff_review',
      note: 'Processing was canceled. Upload the document again to retry.',
    });
    setNotice(`Processing canceled for ${item.name}.`);
  };

  const processFiles = async (uploads: QueuedClientUpload[]) => {
    setUploadError(''); setNotice('');
    setReviewTargetId(null);
    if (!useDemoDocumentsStore.getState().storageHydrated) {
      setUploadError('Browser storage is still preparing. Wait a moment, then try the upload again.');
      return;
    }
    if (useDemoDocumentsStore.getState().storageError) {
      setUploadError(`Browser storage is unavailable. Fix the storage issue before uploading: ${useDemoDocumentsStore.getState().storageError}`);
      return;
    }
    if (!activePeriod || periodReadOnly) {
      setUploadError('This month is read-only. Select an open month before uploading documents.');
      return;
    }
    const accepted: DemoDocument[] = [];
    const rejected: string[] = [];
    const processingErrors: string[] = [];
    const processedIds: string[] = [];
    let processedCount = 0;
    const targetReplacement = replacementFor.current;
    for (const queuedUpload of uploads) {
      const { file, category: uploadCategory } = queuedUpload;
      const issue = validateDemoFile(file, CLIENT_MAX_UPLOAD_BYTES);
      if (issue) { rejected.push(`${file.name}: ${issue}`); continue; }
      const existingDuplicate = documents.find((d) => d.name.toLowerCase() === file.name.toLowerCase() && d.id !== targetReplacement);
      if (existingDuplicate) {
        setNotice(`Warning: A document named "${file.name}" was already uploaded on ${new Date(existingDuplicate.createdAt).toLocaleDateString()}. Uploading will create an updated version.`);
      }
      let previousVersions = existingDuplicate?.previousVersions ? [...existingDuplicate.previousVersions] : [];
      if (existingDuplicate) {
        previousVersions.push({ id: existingDuplicate.id, name: existingDuplicate.name, uploadedAt: existingDuplicate.createdAt, sizeBytes: existingDuplicate.sizeBytes });
      }
      const id = `CLIENT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const selectedCategory = uploadCategory === 'other' ? categoryForFilename(file.name) : uploadCategory;
      const doc: DemoDocument = {
        id, name: file.name, category: selectedCategory, periodId: activePeriod.id,
        folder: folderPathForCategory(selectedCategory, activePeriod.year, activePeriod.month), mime: file.type,
        sizeBytes: file.size, createdAt: new Date().toISOString(), status: 'processing', confidence: 0,
        fields: emptyDemoFields(), sample: false, clientSaved: false, clientId: activeClientEmail, currency: activeClient.currency, workflowStage: 'received', detectedLanguage: 'Detecting locally',
        validationWarnings: [], reviewHistory: [{ at: new Date().toISOString(), action: 'Received', details: 'Added in the browser-only demo session.' }],
        file, processingProgress: 0, note: 'The original is being saved to this browser’s IndexedDB.', clientNote: uploadNote.trim() || undefined, replacementFor: targetReplacement, area: queuedUpload.area, previousVersions: previousVersions.length ? previousVersions : undefined,
      };
      if (targetReplacement) {
        const previous = useDemoDocumentsStore.getState().documents.find((e) => e.id === targetReplacement);
        if (previous?.clientRequest) {
          useDemoDocumentsStore.getState().recordReview(targetReplacement, 'Replacement uploaded', `Client uploaded ${file.name} as a replacement.`,
            { clientRequest: { ...previous.clientRequest, response: `Replacement uploaded: ${file.name}`, resolvedAt: new Date().toISOString(), status: 'pending_review' } }, activeClientEmail);
        }
      }
      addDocument(doc); accepted.push(doc);
    }
    replacementFor.current = undefined;
    if (accepted.length) {
      setActiveBottomSection('client-upload');
      setUploadNote('');
      setUploadOpen(true);
    }
    const cancelledNames: string[] = [];
    for (const doc of accepted) {
      if (cancelledUploadIds.current.delete(doc.id)) {
        updateDocument(doc.id, {
          status: 'action_required',
          workflowStage: 'staff_review',
          note: 'Processing was canceled before it started. Upload the document again to retry.',
        });
        cancelledNames.push(doc.name);
        continue;
      }
      const controller = new AbortController();
      uploadControllers.current.set(doc.id, controller);
      const stage = (workflowStage: NonNullable<DemoDocument['workflowStage']>, note: string, processingProgress: number) => updateDocument(doc.id, { workflowStage, note, processingProgress });
      try {
        stage('validation', 'Checking file type, size and readability.', 12);
        await new Promise((r) => window.setTimeout(r, 320));
        stage('classification', 'Suggesting a document category from the filename and local text.', 26);
        await new Promise((r) => window.setTimeout(r, 320));
        stage('extraction', 'Reading text locally in this browser.', 38);
        const { processLocalDocument } = await import('./processDocument');
        const reportProgress = (progress: number, stageName?: string) => updateDocument(doc.id, {
            processingProgress: Math.min(82, 38 + Math.round(progress * 0.44)),
            ...(stageName ? { note: stageName } : {}),
          });
        const process = (password?: string) => processLocalDocument(
          doc.file!,
          reportProgress,
          password,
          lang === 'ar' ? 'deu+eng+ara' : 'deu+eng',
          controller.signal,
        );
        let extraction: Awaited<ReturnType<typeof processLocalDocument>>;
        try {
          extraction = await process();
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'password_required')) throw error;
          const password = await new Promise<string | null>((resolve) => {
            setPasswordDraft('');
            setPasswordDialog({ fileName: doc.name, resolve });
          });
          if (!password) throw new Error('Password entry was cancelled. Upload an unlocked copy to continue.');
          extraction = await process(password);
        }
        const textCategory = categoryFromDocumentText(extraction.text);
        const detectedCategory = textCategory ?? (doc.category === 'other' ? categoryForFilename(doc.name) : doc.category);
        const detectedLanguage = detectDocumentLanguage(extraction.text);
        const documentFields = extractDocumentFields(detectedCategory, extraction.text, doc.name);
        const extracted: DemoDocument = {
          ...doc,
          category: detectedCategory,
          folder: folderPathForCategory(detectedCategory, activePeriod.year, activePeriod.month),
          fields: documentFields.fields,
          extractedDetails: extractDocumentDetails(detectedCategory, extraction.text),
          extractedText: extraction.text,
          ocrPages: extraction.pages,
          ocrEngine: extraction.ocrEngine,
          confidence: Math.min(1, documentFields.confidence * extraction.ocrConfidence),
          pageCount: extraction.pageCount ?? undefined,
          detectedLanguage,
          note: extraction.note,
        };
        stage('checks', 'Running simple field-presence and amount checks. These are not accounting controls.', 88);
        const warnings = validationWarnings(extracted);
        if (textCategory && doc.category !== 'other' && textCategory !== doc.category) {
          warnings.unshift(`The extracted text indicates this is a ${DEMO_CATEGORIES.find(([key]) => key === textCategory)?.[1] ?? 'different document type'}, not the selected type. The document was reclassified automatically; verify the type and extracted fields before sending.`);
        }
        await new Promise((r) => window.setTimeout(r, 320));
        stage('confidence', 'Confidence is a rule-based text-match estimate, not an AI score.', 95);
        updateDocument(doc.id, {
          status: 'review',
          category: detectedCategory,
          folder: extracted.folder,
          fields: documentFields.fields,
          extractedDetails: extracted.extractedDetails,
          extractedText: extraction.text,
          ocrPages: extraction.pages,
          ocrEngine: extraction.ocrEngine,
          confidence: Math.min(1, documentFields.confidence * extraction.ocrConfidence),
          pageCount: extraction.pageCount ?? undefined,
          detectedLanguage,
          validationWarnings: warnings,
          workflowStage: 'checks',
          processingProgress: 100,
          note: `${extraction.note} Review the extracted text and fields, then save to share with your FinTax team.`,
        });
        processedCount += 1;
        processedIds.push(doc.id);
      } catch (error) {
        if (controller.signal.aborted) {
          cancelledUploadIds.current.delete(doc.id);
          cancelledNames.push(doc.name);
          updateDocument(doc.id, {
            status: 'action_required',
            workflowStage: 'staff_review',
            validationWarnings: [],
            note: 'Processing was canceled. Upload the document again to retry.',
          });
          uploadControllers.current.delete(doc.id);
          continue;
        }
        const passwordRequired = error instanceof Error && 'code' in error && error.code === 'password_required';
        const message = error instanceof Error ? error.message : 'The file could not be read.';
        const reason = passwordRequired
          ? 'This PDF is password-protected or the password was incorrect. Please provide the correct password or upload an unlocked copy.'
          : message.includes('upload it again') ? message : `${message} Please upload the file again.`;
        processingErrors.push(`${doc.name}: ${reason}`);
        updateDocument(doc.id, { status: passwordRequired ? 'password_required' : 'action_required', workflowStage: 'staff_review', validationWarnings: [reason], clientRequest: { reason, createdAt: new Date().toISOString() }, note: message });
      }
      uploadControllers.current.delete(doc.id);
    }
    if (processedCount) {
      const latestUploadId = processedIds[processedIds.length - 1];
      setExpandedId(latestUploadId);
      setFilter('all');
      setNotice(cancelledNames.length
        ? `${cancelledNames.length} file${cancelledNames.length === 1 ? '' : 's'} canceled; remaining queued files finished processing.`
        : `${processedCount} file${processedCount === 1 ? '' : 's'} processed. Review the extracted text and save each document to share it with your team.`);
      const firstNeedsReview = accepted.find((item) => {
        const processed = useDemoDocumentsStore.getState().documents.find((current) => current.id === item.id);
        return processed?.clientSaved === false && processed.extractedText !== undefined;
      });
      setReviewTargetId(firstNeedsReview?.id ?? null);
    }
    if (rejected.length || processingErrors.length) setUploadError([...rejected, ...processingErrors].join(' '));
  };

  const saveExtractionDraft = (document: DemoDocument, extractedText: string, fields: DemoDocument['fields'], details: Record<string, string>) => {
    const currentStorageError = useDemoDocumentsStore.getState().storageError;
    if (!useDemoDocumentsStore.getState().storageHydrated || currentStorageError) {
      setUploadError(currentStorageError || 'Browser storage is still preparing. Wait a moment before saving.');
      return;
    }
    const detectedCategory = document.category === 'other'
      ? categoryFromDocumentText(extractedText) ?? categoryForFilename(document.name, extractedText)
      : document.category;
    const updatedDocument: DemoDocument = {
      ...document,
      category: detectedCategory,
      fields,
      extractedText,
      extractedDetails: details,
      workflowStage: 'staff_review',
      status: 'review',
      clientSaved: true,
      processingProgress: 100,
      note: 'Client reviewed and saved the extracted text and fields for FinTax team review.',
    };
    updateDocument(document.id, {
      category: detectedCategory,
      folder: folderPathForCategory(detectedCategory, activePeriod?.year ?? new Date().getFullYear(), activePeriod?.month ?? new Date().getMonth() + 1),
      fields,
      extractedText,
      extractedDetails: updatedDocument.extractedDetails,
      validationWarnings: validationWarnings(updatedDocument),
      detectedLanguage: detectDocumentLanguage(extractedText),
      workflowStage: 'staff_review',
      status: 'review',
      clientSaved: true,
      processingProgress: 100,
      note: updatedDocument.note,
    }, activeClientEmail);
    setNotice(`Sent to your FinTax team: ${document.name}`);
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = '';
    if (files.length) queueFiles(files);
  };
  const queueFiles = (files: FileList | File[]) => {
    const selectedTypes = AREA_CHECKBOXES[uploadArea]
      .filter((type) => selectedUploadTypeIds.includes(type.id))
      .map(({ id, category: selectedCategory }) => ({ id, category: selectedCategory }));
    const result = createClientUploadQueue(Array.from(files), uploadArea, selectedTypes);
    if (result.queued.length) {
      setQueuedUploads((current) => [...current, ...result.queued]);
      setUploadOpen(true);
      setUploadError('');
      setNotice('');
    }
    if (result.rejected.length) setUploadError(result.rejected.join(' '));
  };
  const submitQueuedUploads = () => {
    if (!queuedUploads.length) {
      fileInput.current?.click();
      return;
    }
    if (!storageHydrated || storageError || !activePeriod || periodReadOnly) {
      setUploadError(storageError
        ? `Browser storage is unavailable. Fix the storage issue before uploading: ${storageError}`
        : !activePeriod || periodReadOnly
          ? 'This month is read-only. Select an open month before uploading documents.'
          : 'Browser storage is still preparing. Wait a moment, then try the upload again.');
      return;
    }
    const uploads = queuedUploads;
    setQueuedUploads([]);
    void processFiles(uploads);
  };
  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    queueFiles(e.dataTransfer.files);
  };
  const openCamera = () => {
    setCameraLoading(true);
    setCameraError('');
    setCameraOpen(true);
  };
  const captureCameraPhoto = async () => {
    const video = cameraPreview.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is not ready yet. Wait for the preview or choose an image instead.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Could not prepare the camera image. Choose an image instead.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!image) {
      setCameraError('Could not capture the camera image. Please try again or choose an image instead.');
      return;
    }
    const file = new File([image], `fintax-camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
    closeCamera();
    queueFiles([file]);
  };
  const useDeviceCamera = () => {
    cameraInput.current?.click();
    closeCamera();
  };
  const selectReplacement = (d: DemoDocument) => {
    replacementFor.current = d.id;
    openUpload(areaOf(d), d.category);
  };

  const rise = (i = 0) => reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as const } };
  const statCards = [
    {
      key: 'all',
      label: t3(lang, 'Documents', 'Dokumente', 'المستندات'),
      compactLabel: t3(lang, 'Files', 'Belege', 'ملفات'),
      hint: t3(lang, 'Fictional records for this company', 'Fiktive Belege für dieses Unternehmen', 'سجلات خيالية لهذه الشركة'),
      value: documents.length,
      icon: FolderOpen,
      from: '#0B7F99',
      to: '#0B7F99',
    },
    {
      key: 'processing',
      label: t3(lang, 'In review', 'In Prüfung', 'قيد المراجعة'),
      compactLabel: t3(lang, 'Review', 'Prüfung', 'مراجعة'),
      hint: t3(lang, 'Processing or waiting for staff review', 'In Bearbeitung oder Teamprüfung', 'قيد المعالجة أو انتظار مراجعة الفريق'),
      value: processing.length,
      icon: FileSearch,
      from: '#2F6FDE',
      to: '#2F6FDE',
    },
    {
      key: 'attention',
      label: t3(lang, 'Needs you', 'Ihre Aktion', 'يحتاج إجراءك'),
      compactLabel: t3(lang, 'Action', 'Aktion', 'إجراء'),
      hint: t3(lang, 'Requests or issues need a response', 'Anfragen oder Probleme benötigen eine Antwort', 'تحتاج الطلبات أو المشكلات إلى رد'),
      value: attention.length,
      icon: CircleAlert,
      from: '#D98A1B',
      to: '#C9372C',
    },
    {
      key: 'approved',
      label: t3(lang, 'Approved', 'Freigegeben', 'معتمد'),
      compactLabel: t3(lang, 'Done', 'Fertig', 'معتمد'),
      hint: t3(lang, 'Reviewed and approved demo records', 'Geprüfte und freigegebene Demobelege', 'سجلات تجريبية تمت مراجعتها واعتمادها'),
      value: approved.length,
      icon: CheckCircle2,
      from: '#1F8A5B',
      to: '#1F8A5B',
    },
  ] as const;

  return (
    <div
      ref={pageScrollRef}
      data-theme={darkMode ? 'dark' : 'light'}
      data-client-portal
      className="client-portal relative h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#f7f4ec] text-[#1f2a44]"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) setDragOver(true); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDragLeave={(event) => { if (event.target === event.currentTarget) setDragOver(false); }}
      onDrop={handleDrop}
    >
      {demoBannerVisible && <div role="status" className="client-demo-banner relative z-40 flex h-7 items-center justify-center gap-1 border-b border-[#e8e2d2] bg-[#f2ecdc] px-8 text-center text-[10px] font-medium text-[#0f1f3d] sm:h-auto sm:px-4 sm:py-1.5 sm:text-xs">
        <span className="font-semibold text-[#9a7424]">DEMO:</span><span className="truncate">Fictional data, stored on this device, no real login.</span>
        <button type="button" aria-label="Dismiss demo notice" onClick={() => setDemoBannerVisible(false)} className="absolute end-1 grid size-6 place-items-center rounded text-[#4A5468] hover:bg-black/5"><X className="size-3.5" /></button>
      </div>}
      <header data-scrolled={headerScrolled} className="client-topbar sticky top-0 z-30 bg-[#f7f4ec]/95 px-2 pt-2 sm:px-4">
        <div className="client-topbar-card mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-[#e8e2d2] bg-white px-3 py-2.5 shadow-sm sm:gap-3 sm:px-5 sm:py-3">
          <button type="button" aria-label={t3(lang, 'Open page navigation', 'Seitennavigation öffnen', 'فتح تنقل الصفحة')} aria-controls="client-page-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e8e2d2] bg-white text-slate-600 transition-colors hover:text-[#9a7424]">
            <Menu className="size-4" />
          </button>
          <LocalizedFinTaxLogo language={lang} className="client-mobile-logo client-localized-logo shrink-0" />
          <div className="client-topbar-brand min-w-0 flex-1"><p className="truncate text-sm font-semibold leading-tight">{activeClient.name}</p><p className="client-topbar-subtitle max-w-36 truncate text-xs text-slate-500">{t3(lang, 'Client workspace', 'Kundenbereich', 'مساحة العميل')}</p></div>
          <button type="button" aria-label={t3(lang, 'Open account and settings', 'Konto und Einstellungen öffnen', 'فتح الحساب والإعدادات')} onClick={() => setNavigationOpen(true)}
            className="client-mobile-avatar hidden size-10 shrink-0 place-items-center rounded-full border border-[#e8e2d2] bg-white text-[#0F1B3D]">
            <UserRound className="size-[18px]" />
          </button>
          <nav aria-label="Quick client navigation" className="hidden items-center gap-0.5 rounded-full bg-slate-100/80 p-1 xl:flex">
            {pageSections.filter(({ id }) => ['client-overview', 'client-upload', 'client-documents', 'client-demo-tasks'].includes(id)).map(({ id, label }) => (
              <button key={id} type="button" onClick={() => goToPageSection(id)} className="rounded-full px-2.5 py-1.5 text-[10px] font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-900">{id === 'client-upload' ? t3(lang, 'Upload', 'Hochladen', 'رفع') : id === 'client-documents' ? t3(lang, 'Documents', 'Dokumente', 'المستندات') : label}</button>
            ))}
          </nav>
          <div className="client-header-controls flex w-full min-w-0 items-center gap-2 sm:ms-auto sm:w-auto sm:gap-2">
            <label className="client-header-control flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[#e8e2d2] bg-white px-2 sm:gap-1.5 sm:px-2.5"><Languages className="size-4 text-[#9a7424]" /><span className="sr-only">{t3(lang, 'Language', 'Sprache', 'اللغة')}</span>
              <select value={lang} onChange={(event) => {
                const next = event.target.value;
                if (next === 'en' || next === 'de' || next === 'ar') setLang(next);
              }} aria-label={t3(lang, 'Language', 'Sprache', 'اللغة')} className="h-9 max-w-[5.25rem] bg-transparent text-xs text-ink sm:max-w-[4.75rem] lg:max-w-none"><option value="en">English (EN)</option><option value="de">Deutsch (DE)</option><option value="ar">العربية (AR)</option></select></label>
            <Button size="sm" variant="outline" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} className="client-header-control size-10 shrink-0 rounded-xl border border-[#e8e2d2] bg-white p-0" onClick={() => {
              const next = darkMode ? 'light' : 'dark';
              localStorage.setItem('fintax-client-theme', next);
              setThemeMode(next);
            }} icon={darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />} />
            <Button size="sm" aria-label={t3(lang, 'Log out', 'Abmelden', 'تسجيل الخروج')} title={t3(lang, 'Log out', 'Abmelden', 'تسجيل الخروج')} className="client-header-control size-10 shrink-0 rounded-xl border border-[#e8e2d2] bg-white p-0 sm:size-auto sm:px-3" onClick={onSignOut} icon={<LogOut className="size-3.5" />}><span className="sr-only sm:not-sr-only">{t3(lang, 'Log out', 'Abmelden', 'تسجيل الخروج')}</span></Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {navigationOpen && <>
          <motion.button type="button" aria-label="Close page navigation" onClick={() => setNavigationOpen(false)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/25 backdrop-blur-[2px]" />
          <motion.aside id="client-page-navigation" aria-label="Client page navigation"
            initial={reduce ? false : { x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="client-navigation-drawer fixed inset-y-0 start-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[min(24rem,94vw)] flex-col overflow-hidden border-e border-[#e8e2d2] bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="client-navigation-header flex shrink-0 items-center gap-3 border-b border-ink/5 pb-5">
              <LocalizedFinTaxLogo language={lang} className="shrink-0" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t3(lang, 'Client workspace', 'Kundenbereich', 'مساحة العميل')}</p><p className="truncate text-xs text-muted">{activeClient.company}</p></div>
              <button type="button" aria-label={t3(lang, 'Close page navigation', 'Seitennavigation schließen', 'إغلاق تنقل الصفحة')} onClick={() => setNavigationOpen(false)}
                className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"><X className="size-4" /></button>
            </div>
            <div className="client-navigation-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="client-navigation-metrics my-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-violet/5 p-3"><p className="text-lg font-semibold">{documents.length}</p><p className="text-[10px] text-muted">{t3(lang, 'Documents', 'Dokumente', 'المستندات')}</p></div>
                <div className="rounded-xl bg-warn/5 p-3"><p className="text-lg font-semibold">{attention.length}</p><p className="text-[10px] text-muted">{t3(lang, 'Need attention', 'Benötigt Aufmerksamkeit', 'يتطلب الانتباه')}</p></div>
              </div>
              <nav aria-label={t3(lang, 'Client workspace sections', 'Bereiche des Kundenbereichs', 'أقسام مساحة العميل')} className="space-y-1">
                <p className="client-navigation-label mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">{t3(lang, 'Workspace', 'Arbeitsbereich', 'مساحة العمل')}</p>
                {pageSections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => goToPageSection(id)}
                  aria-current={activeBottomSection === id ? 'location' : undefined}
                  className={`client-navigation-link flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm text-ink transition-colors hover:bg-violet/8 hover:text-violet focus-visible:outline-violet ${activeBottomSection === id ? 'bg-violet/8 font-semibold text-violet' : ''}`}>
                  <Icon className="size-4 shrink-0 text-violet" /><span>{label}</span>
                  {id === 'client-documents' && <span className="ms-auto text-xs text-muted">{documents.length}</span>}
                  {id === 'client-demo-tasks' && <span className="ms-auto text-xs text-muted">{activeClient.tasks.filter((task) => !task.complete).length}</span>}
                </button>)}
              </nav>
              <div className="client-navigation-settings mt-4 space-y-3 border-t border-[#e8e2d2] pt-4">
                <p className="client-navigation-label col-span-full px-1 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">{t3(lang, 'Preferences', 'Einstellungen', 'التفضيلات')}</p>
                <label className="block text-xs font-medium text-[#4A5468]">{t3(lang, 'Language', 'Sprache', 'اللغة')}
                  <select value={lang} onChange={(event) => {
                    const next = event.target.value;
                    if (next === 'en' || next === 'de' || next === 'ar') setLang(next);
                  }} aria-label="Portal language" className="mt-1 h-11 w-full rounded-xl border border-[#e8e2d2] bg-white px-3 text-sm text-[#0F1B3D]"><option value="en">English</option><option value="de">Deutsch</option><option value="ar">العربية</option></select>
                </label>
                <label className="block text-xs font-medium text-[#4A5468]">{t3(lang, 'Theme', 'Darstellung', 'المظهر')}
                  <select value={themeMode} onChange={(event) => {
                    const next = event.target.value;
                    if (next === 'light' || next === 'dark' || next === 'system') {
                      localStorage.setItem('fintax-client-theme', next);
                      setThemeMode(next);
                    }
                  }} aria-label={t3(lang, 'Color theme', 'Farbschema', 'سمة الألوان')} className="mt-1 h-11 w-full rounded-xl border border-[#e8e2d2] bg-white px-3 text-sm text-[#0F1B3D]"><option value="system">{t3(lang, 'System', 'System', 'النظام')}</option><option value="light">{t3(lang, 'Light', 'Hell', 'فاتح')}</option><option value="dark">{t3(lang, 'Dark', 'Dunkel', 'داكن')}</option></select>
                </label>
              </div>
              <details className="client-navigation-about my-4 rounded-xl border border-violet/10 bg-gradient-to-br from-violet/5 to-blue/5 p-3">
                <summary className="cursor-pointer text-xs font-semibold">{t3(lang, 'About this workspace', 'Über diesen Arbeitsbereich', 'حول مساحة العمل هذه')}</summary>
                <p className="mt-2 text-[11px] leading-5 text-muted">{t3(lang, 'A browser-only FinTax demo using fictional client records. Documents and monthly periods are saved in this browser’s IndexedDB and are not sent to a server.', 'Eine reine Browser-Demo von FinTax mit fiktiven Kundendaten. Dokumente und Monatszeiträume werden in der IndexedDB dieses Browsers gespeichert und nicht an einen Server gesendet.', 'عرض FinTax تجريبي داخل المتصفح باستخدام بيانات عملاء افتراضية. تُحفظ المستندات والفترات الشهرية في قاعدة بيانات المتصفح ولا تُرسل إلى خادم.')}</p>
              </details>
            </div>
            <div className="client-navigation-footer shrink-0 border-t border-[#e8e2d2] pt-3">
              <div className="client-navigation-profile flex min-w-0 items-center gap-3 rounded-xl px-2 py-2">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#0B7F99]/10 text-sm font-semibold text-[#0B7F99]">
                  {activeClient.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{activeClient.name}</span>
                  <span className="block truncate text-xs text-muted">{activeClient.company}</span>
                </span>
              </div>
              <div className="client-navigation-actions mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => {
                  openHelpGuide();
                  setNavigationOpen(false);
                }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e8e2d2] px-3 text-sm font-medium text-[#4A5468] transition-colors hover:bg-[#F7F4EC]"><CircleAlert className="size-4" />{t3(lang, 'Help guide', 'Hilfe', 'دليل المساعدة')}</button>
                <button type="button" onClick={onSignOut} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F1B3D] px-3 text-sm font-medium text-white transition-colors hover:bg-[#1B3160]"><LogOut className="size-4" />{t3(lang, 'Log out', 'Abmelden', 'تسجيل الخروج')}</button>
              </div>
            </div>
          </motion.aside>
        </>}
      </AnimatePresence>

      <main className={`client-main relative z-10 mx-auto max-w-6xl space-y-4 px-3 pb-28 pt-4 sm:space-y-6 sm:px-6 sm:pb-20 sm:pt-6 ${clientPage === 'dashboard' ? 'client-main-dashboard' : ''}`}>
        {clientPage === 'dashboard' && <ClientDashboardPage
          advisorFirm={advisorFirm}
          advisorId={advisorId}
          onUploadForRequest={selectReplacement}
          activeClient={activeClient}
          activeClientEmail={activeClientEmail}
          documents={documents}
          clientPeriods={clientPeriods}
          activePeriod={activePeriod}
          periodReadOnly={periodReadOnly}
          canFinishPeriod={canFinishPeriod}
          finishBlockers={finishBlockers}
          language={lang}
          greeting={greeting}
          quotaWarning={quotaWarning}
          storageError={storageError}
          documentFilter={filter}
          onDocumentFilterChange={setFilter}
          onOpenDocuments={() => goToPageSection('client-documents')}
          onOpenUpload={openUpload}
          onSelectPeriod={setSelectedPeriodId}
          onSetNotApplicable={(periodId, key, reason, clientId, state) => setChecklistItem(periodId, key, state, reason, clientId)}
          onFinishPeriod={() => { setFinishError(''); setFinishConfirmed(false); setFinishDialogOpen(true); }}
          onRespondToRequest={respondToRequest}
          onUploadReplacement={selectReplacement}
        />}

        {createPortal(<Suspense fallback={null}>{helpBotLoaded && <HelpBot role="client" launcherVisible={false} openSignal={helpBotOpenSignal} />}</Suspense>, document.body)}

        {cameraOpen && createPortal(
          <div data-theme={darkMode ? 'dark' : 'light'} className="client-camera-backdrop fixed inset-0 z-[95] grid place-items-center bg-[#0B1220]/80 p-4" onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCamera();
          }}>
            <section data-theme={darkMode ? 'dark' : 'light'} role="dialog" aria-modal="true" aria-labelledby="client-camera-title" className="client-camera-dialog w-full max-w-xl rounded-2xl border border-[#27364F] bg-[#121C30] p-4 text-[#EAF0FA] shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="client-camera-title" className="font-serif text-lg font-semibold">Scan a document</h2>
                <button type="button" aria-label="Close camera" onClick={closeCamera} className="min-h-11 rounded-xl border border-[#27364F] px-3 text-sm text-[#A9B6CC] hover:bg-[#1A2740]">Close</button>
              </div>
              <video ref={cameraPreview} autoPlay muted playsInline aria-label="Live camera preview" className="mt-4 aspect-[4/3] w-full rounded-xl bg-[#0B1220] object-contain" />
              {cameraLoading && <p role="status" className="mt-3 text-sm text-[#A9B6CC]">Waiting for camera permission and preview…</p>}
              {cameraError && <p role="alert" className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-[#EAF0FA]">{cameraError}</p>}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="min-h-11 rounded-xl border-[#27364F] text-[#EAF0FA] hover:bg-[#1A2740]" onClick={useDeviceCamera}>Use device camera / choose image</Button>
                <Button variant="primary" className="min-h-11 rounded-xl bg-[#14A3C2] text-[#04222B] hover:bg-[#2BB8D6]" onClick={() => void captureCameraPhoto()} disabled={cameraLoading || Boolean(cameraError)}>Take photo</Button>
              </div>
            </section>
          </div>,
          document.body,
        )}

        {passwordDialog && <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/45 p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="pdf-password-heading" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const { resolve } = passwordDialog;
              setPasswordDialog(null);
              resolve(passwordDraft);
              setPasswordDraft('');
            }}>
            <h2 id="pdf-password-heading" className="text-lg font-semibold text-ink">Unlock this PDF</h2>
            <p className="mt-1 text-sm text-muted">{passwordDialog.fileName} is password-protected. The password is used only for this local processing attempt and is not saved.</p>
            <label htmlFor="pdf-password-input" className="mt-4 block text-xs font-medium text-ink">PDF password</label>
            <input id="pdf-password-input" type="password" autoComplete="off" autoFocus value={passwordDraft}
              onChange={(event) => setPasswordDraft(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-ink/10 bg-white px-3 text-sm text-ink" />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => {
                const { resolve } = passwordDialog;
                setPasswordDialog(null);
                resolve(null);
                setPasswordDraft('');
              }}>Cancel</Button>
              <Button type="submit" variant="primary" className="min-h-11 rounded-full" disabled={!passwordDraft}>Try password</Button>
            </div>
          </form>
        </div>}

        {finishDialogOpen && activePeriod && <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/45 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFinishDialogOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="finish-month-heading" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <h2 id="finish-month-heading" className="text-lg font-semibold text-ink">Submit this month to FinTax?</h2>
            <p className="mt-1 text-sm text-muted">You will not be able to edit uploads after submission unless staff request changes.</p>
            <div className="mt-4 rounded-xl bg-bg/70 p-3 text-xs">
              <p className="font-semibold text-ink">Documents by folder</p>
              {Object.entries(activePeriodDocuments.reduce<Record<string, number>>((summary, document) => {
                const folder = document.folder ?? '01_FiBu';
                summary[folder] = (summary[folder] ?? 0) + 1;
                return summary;
              }, {})).map(([folder, count]) => <p key={folder} className="mt-1 text-muted">{folder}: {count}</p>)}
              {activePeriodDocuments.length === 0 && <p className="mt-1 text-muted">No documents currently attached.</p>}
              <p className="mt-3 font-semibold text-ink">Not applicable reasons</p>
              {activePeriod.checklist.filter((item) => item.state === 'not_applicable').map((item) => <p key={item.key} className="mt-1 text-muted">{item.label}: {item.naReason}</p>)}
              {activePeriodDocuments.some((document) => document.validationWarnings?.length) && <p className="mt-3 text-warn">Some documents have warnings and may need staff review.</p>}
            </div>
            {finishError && <p role="alert" className="mt-3 text-xs text-bad">{finishError}</p>}
            <label className="mt-4 flex items-start gap-2 text-xs text-ink">
              <input type="checkbox" checked={finishConfirmed} onChange={(event) => setFinishConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-violet" />
              <span>I confirm all documents for {new Date(activePeriod.year, activePeriod.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })} are uploaded.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" className="min-h-11 rounded-full" onClick={() => setFinishDialogOpen(false)}>Cancel</Button>
              <Button variant="primary" className="min-h-11 rounded-full" disabled={!finishConfirmed} onClick={() => {
                const result = submitPeriod(activePeriod.id, activeClientEmail, activeClientEmail);
                if (!result.ok) {
                  setFinishError(result.blockers.join(' '));
                  return;
                }
                setFinishDialogOpen(false);
                setNotice('Month submitted to the FinTax review queue.');
              }}>Confirm submission</Button>
            </div>
          </section>
        </div>}

        <input ref={fileInput} id="client-document-upload" type="file" multiple className="sr-only" aria-label="Choose files to upload" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff,.bmp,.xlsx,.csv,.txt,.docx,application/pdf,image/*,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFiles} />
        <input ref={cameraInput} id="client-camera-upload" type="file" className="sr-only" aria-label="Scan a document with your camera" accept="image/*" capture="environment" onChange={handleFiles} />

        {clientPage === 'documents' &&                 <Suspense fallback={<div className="client-document-skeleton rounded-2xl border border-[#e8e2d2] bg-white p-4" role="status" aria-label="Loading documents"><span className="sr-only">Loading documents…</span><div className="client-skeleton-line w-2/3" /><div className="client-skeleton-line mt-4 w-full" /><div className="client-skeleton-line mt-3 w-5/6" /><div className="client-skeleton-line mt-3 w-1/2" /></div>}><ClientDocumentHistoryPage
          documents={documents}
          visibleDocuments={visibleDocs}
          documentFolders={documentFolders}
          filter={filter}
          documentSearch={documentSearch}
          folderFilter={folderFilter}
          expandedId={expandedId}
          lang={lang}
          reduceMotion={reduce}
          onFilterChange={setFilter}
          onDocumentSearchChange={setDocumentSearch}
          onFolderFilterChange={setFolderFilter}
          onExpandedIdChange={setExpandedId}
          onUploadReplacement={selectReplacement}
          onRefresh={refreshDocuments}
        /></Suspense>}
                <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-muted"><span><LockKeyhole className="me-1 inline size-3" />Demo files are not saved to a server</span><span>Use fictional sample documents only.</span></footer>
        {!uploadOpen && !navigationOpen && !cameraOpen && !keyboardOpen && !helpBotOpen && <nav aria-label="Client page navigation" className="client-bottom-nav mx-auto w-full max-w-md md:hidden">
          <ul className="workspace-bottom-dock grid grid-cols-4">
            {[
              { id: 'client-overview', label: t3(lang, 'Overview', 'Übersicht', 'نظرة عامة'), icon: BarChart3 },
              { id: 'client-demo-tasks', label: t3(lang, 'Tasks', 'Aufgaben', 'المهام'), icon: ListChecks },
              { id: 'client-upload', label: t3(lang, 'Upload', 'Hochladen', 'رفع'), icon: Upload },
              { id: 'client-documents', label: t3(lang, 'Documents', 'Dokumente', 'المستندات'), icon: FolderOpen },
            ].map(({ id, label, icon: Icon }) => {
              const isUpload = id === 'client-upload';
              const active = activeBottomSection === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-label={isUpload ? t3(lang, 'Upload a document', 'Dokument hochladen', 'رفع مستند') : t3(lang, `Go to ${label}`, `Zu ${label} wechseln`, `الانتقال إلى ${label}`)}
                    aria-current={active ? 'location' : undefined}
                    onClick={() => goToPageSection(id)}
                    className={`workspace-bottom-tab min-h-14 ${isUpload ? 'workspace-bottom-tab--featured' : ''} ${active ? 'is-active' : ''}`}
                  >
                    <span className="workspace-bottom-icon"><Icon className={isUpload ? 'size-6' : 'size-[19px]'} strokeWidth={isUpload ? 2 : 1.9} /></span>
                    <span className="workspace-bottom-label">{label}</span>
                    {id === 'client-demo-tasks' && activeClient.tasks.some((task) => !task.complete) && <span className="client-nav-badge">{activeClient.tasks.filter((task) => !task.complete).length}</span>}
                    {id === 'client-documents' && attention.length > 0 && <span className="client-nav-badge">{attention.length}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>}
        {clientPage === 'dashboard' && !uploadOpen && !navigationOpen && !cameraOpen && !keyboardOpen && !helpBotOpen && <button type="button" aria-label="Open FinTax demo guide" onClick={openHelpGuide} className="client-help-guide-button fixed z-30 grid size-10 place-items-center rounded-full bg-[#0B7F99] text-lg font-semibold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B07A2A] md:hidden">?</button>}
      </main>
      {createPortal(<AnimatePresence>
        {uploadOpen && <>
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close upload drawer"
            onClick={closeUpload}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] cursor-default bg-[#0f1b3d]/35 backdrop-blur-[2px]"
          />
          <motion.aside
            ref={uploadDrawerRef}
            data-theme={darkMode ? 'dark' : 'light'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-drawer-title"
            initial={reduce ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduce ? undefined : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="client-upload-drawer fixed inset-x-0 bottom-0 z-[81] flex h-[min(94dvh,900px)] flex-col overflow-hidden rounded-t-3xl border border-[#E6E0D0] bg-[#F7F4EC] shadow-2xl md:inset-y-0 md:start-auto md:right-0 md:h-full md:w-[min(760px,58vw)] md:rounded-none md:rounded-s-3xl"
          >
            <header onTouchStart={(event) => { drawerTouchStartY.current = event.touches[0]?.clientY ?? null; }}
              onTouchEnd={(event) => {
                const startY = drawerTouchStartY.current;
                const endY = event.changedTouches[0]?.clientY;
                drawerTouchStartY.current = null;
                if (startY !== null && endY !== undefined && endY - startY > 100) closeUpload();
              }} className="client-upload-sticky-header flex shrink-0 items-center gap-3 border-b border-[#E6E0D0] bg-white px-5 py-4 sm:px-6">
              <span className="client-upload-drag-handle" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 id="upload-drawer-title" className="font-serif text-lg font-semibold text-[#0F1B3D]">
                  {({
                    formation: t3(lang, 'Submit company documents', 'Gründungsunterlagen einreichen', 'إرسال مستندات الشركة'),
                    payroll: t3(lang, 'Submit payroll documents', 'Lohnunterlagen einreichen', 'إرسال مستندات الرواتب'),
                    accounting: t3(lang, 'Submit accounting documents', 'Buchhaltungsunterlagen einreichen', 'إرسال مستندات المحاسبة'),
                    correspondence: t3(lang, 'Submit correspondence', 'Korrespondenz einreichen', 'إرسال المراسلات'),
                  })[uploadArea]}
                </h2>
              </div>
              <button type="button" data-drawer-close aria-label="Close upload drawer" onClick={closeUpload} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-[#F8F6F1] px-3 text-xs text-[#4A5468] transition hover:bg-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-[#0B7F99]"><X className="size-3.5" />{t3(lang, 'Close', 'Schließen', 'إغلاق')}</button>
            </header>
            <div className="client-upload-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-5 py-4 sm:px-6">
              <ClientDocumentUploadPage
                activePeriodDocuments={activePeriodDocuments}
                queuedUploads={queuedUploads}
                pendingDocuments={activePeriodDocuments.filter((document) => document.clientSaved === false && document.extractedText !== undefined)}
                storageReady={storageHydrated && !storageError}
                storageError={storageError}
                selectedTypeIds={selectedUploadTypeIds}
                selectedArea={uploadArea}
                activePeriod={activePeriod}
                periods={clientPeriods}
                periodReadOnly={periodReadOnly}
                onSelectPeriod={(periodId) => {
                  setSelectedPeriodId(periodId);
                  setReviewTargetId(null);
                }}
                onAreaChange={setUploadArea}
                lang={lang}
                dragOver={dragOver}
                uploadError={uploadError}
                notice={notice}
                fileInput={fileInput}
                cameraInput={cameraInput}
                primarySaveRef={primarySaveRef}
                reviewTargetId={reviewTargetId}
                onReviewDocument={setReviewTargetId}
                onRetryUpload={(item) => {
                  const area = item.area ?? areaOf({ category: item.category });
                  setUploadArea(area);
                  setSelectedUploadTypeIds([uploadTypeForCategory(area, item.category)]);
                  setReviewTargetId(null);
                  setUploadError('');
                  setNotice('');
                  fileInput.current?.click();
                }}
                onSelectedTypeIdsChange={setSelectedUploadTypeIds}
                uploadNote={uploadNote}
                onUploadNoteChange={setUploadNote}
                onOpenCamera={openCamera}
                onSubmitFiles={submitQueuedUploads}
                onRemoveQueuedFile={(id) => setQueuedUploads((current) => current.filter((upload) => upload.id !== id))}
                onQueuedFileTypeChange={(id, typeId) => setQueuedUploads((current) => current.map((upload) => {
                  if (upload.id !== id) return upload;
                  const selectedType = AREA_CHECKBOXES[upload.area].find((type) => type.id === typeId);
                  return selectedType ? { ...upload, typeId, category: selectedType.category } : upload;
                }))}
                onDrop={handleDrop}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onCancelUpload={cancelUpload}
                onSaveDraft={saveExtractionDraft}
                onChangeDocumentType={(item, nextCategory) => {
                  const extraction = extractDocumentFields(nextCategory, item.extractedText ?? '', item.name);
                  updateDocument(item.id, {
                    category: nextCategory,
                    area: areaOf({ category: nextCategory }),
                    fields: extraction.fields,
                    extractedDetails: extractDocumentDetails(nextCategory, item.extractedText ?? ''),
                    confidence: extraction.confidence,
                  });
                }}
              />
            </div>
            <footer className="shrink-0 border-t border-[#E6E0D0] bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
              <Button
                variant="primary"
                className="min-h-12 w-full rounded-xl bg-[#0F1B3D] px-4 text-white hover:bg-[#1B3160]"
                disabled={!storageHydrated || Boolean(storageError) || periodReadOnly}
                onClick={() => {
                  if (activePeriodDocuments.some((document) => document.id === reviewTargetId && document.clientSaved === false && document.extractedText !== undefined)) {
                    primarySaveRef.current?.click();
                  } else if (queuedUploads.length) {
                    submitQueuedUploads();
                  } else {
                    fileInput.current?.click();
                  }
                }}
              >
                {t3(lang, 'Send documents', 'Unterlagen absenden', 'إرسال المستندات')} <span aria-hidden="true">→</span>
              </Button>
            </footer>
          </motion.aside>
        </>}
      </AnimatePresence>, document.body)}
    </div>
  );
}