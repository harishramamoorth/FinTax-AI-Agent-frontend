import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Banknote, Building2, CalendarDays,
  Check, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, Clock3, FileClock, MoreHorizontal,
  FileSpreadsheet, FileText, FileUp, Filter, LayoutDashboard, Link2, LockKeyhole, Menu, MessageSquareText,
  Pencil, Plus, Power, Search, Settings2, ShieldCheck, Trash2, Upload, Users, Wallet, X, LogOut,
} from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Panel, Skeleton } from '@/components/ui/primitives';
import {
  accountingCsv, canTransitionDocumentStatus, categoryForFilename, categoryFromDocumentText, DEMO_CATEGORIES,
  detectDocumentLanguage, emptyDemoFields, extractDocumentDetails, extractDocumentFields, MAX_DEMO_FILE_BYTES, sampleFields,
  validateDemoFields, validateDemoFile,
  type DemoCategory, type DemoDocument, type DemoFields,
} from './demoWorkflow';
import { DEMO_CLIENTS, type DemoRole } from './demoAccounts';
import ClientsPage from './ClientsPage';
import { useDemoDocumentsStore, type ClientAssistantQuestion, type DemoAuditEvent, type DemoFollowUpTask, type DemoPayrollDraft, type DemoRoleAssignment, type DemoWorkspaceSettings } from '@/stores/demoDocumentsStore';
import StatFlow from './StatFlow';
import { BottomBar, CountUp, DocCards, NavDrawer, PALETTE, type NavEntry } from './WorkspaceChrome';
import { FlowDiagram, PulseHero, StaffWorkflow } from './PulseUI';
import MonthSubmissionsPanel from './MonthSubmissionsPanel';
import { demoClientIdentityById, documentsVisibleTo } from './storage/selectors';
import { CLIENT_DOCUMENT_SECTIONS, documentsInClientSection, type ClientDocumentSectionId } from './clientDocumentSections';
import fintaxLogo from './fintax-logo.png';

type Screen = 'overview' | 'documents' | 'uploads' | 'review' | 'submissions' | 'banking' | 'correspondence' | 'payroll' | 'tasks' | 'exports' | 'clients' | 'admin';

const SAMPLE_DOCUMENTS: DemoDocument[] = [
  {
    id: 'FT-INV-1048', name: 'purchase_invoice_office.pdf', category: 'purchase_invoice', sizeBytes: 482_100,
    createdAt: '2026-10-22T09:12:00.000Z', status: 'approved', confidence: 0.98, fields: {
      ...sampleFields('purchase_invoice', 'FT-INV-1048'), documentDate: '2026-10-18',
      counterparty: 'Muster Bürobedarf GmbH', reference: 'RE-2026-1048',
      description: 'Office equipment', netAmount: '100.00', vatRate: '19', vatAmount: '19.00', grossAmount: '119.00',
    }, sample: true,
  },
  {
    id: 'FT-BANK-2201', name: 'kontoauszug_oktober.pdf', category: 'bank_statement', sizeBytes: 1_240_300,
    createdAt: '2026-10-22T08:43:00.000Z', status: 'review', confidence: 0.74, fields: {
      ...sampleFields('bank_statement', 'FT-BANK-2201'), documentDate: '2026-10-20',
      counterparty: 'Rheinland Bank AG', reference: 'TX-883014', description: 'Incoming transfer · verify amount',
      netAmount: '1240.00', vatRate: '0', vatAmount: '0.00', grossAmount: '1240.00',
    }, sample: true, note: 'Transaction reference and balance need a staff check.',
    extractedDetails: {
      'Transaction 1': '2026-10-20 · Incoming transfer · Credit: 1240.00',
      'Transaction rows': 'One synthetic transaction candidate. Confirm direction and amount against the original.',
    },
  },
  {
    id: 'FT-REC-0310', name: 'receipt_hardware-store.jpg', category: 'receipt', sizeBytes: 2_830_000,
    createdAt: '2026-10-21T14:20:00.000Z', status: 'review', confidence: 0.68, fields: {
      ...sampleFields('receipt', 'FT-REC-0310'), documentDate: '2026-10-19',
      counterparty: 'Muster Baumarkt', reference: 'K-0310', description: 'Hardware supplies',
      netAmount: '100.00', vatRate: '19', vatAmount: '19.00', grossAmount: '119.00',
    }, sample: true, note: 'Low-confidence date recognition; confirm against the original.',
  },
  {
    id: 'FT-SALES-672', name: 'sales_invoice_client-672.pdf', category: 'sales_invoice', sizeBytes: 608_000,
    createdAt: '2026-10-21T11:05:00.000Z', status: 'approved', confidence: 0.96, fields: {
      ...sampleFields('sales_invoice', 'FT-SALES-672'), documentDate: '2026-10-17',
      counterparty: 'Alpen Technik AG', reference: 'INV-672', description: 'Consulting services',
      netAmount: '1000.00', vatRate: '19', vatAmount: '190.00', grossAmount: '1190.00',
    }, sample: true,
  },
  {
    id: 'FT-PAY-091', name: 'payslip_october_sample.pdf', category: 'payroll', sizeBytes: 345_000,
    createdAt: '2026-10-20T16:00:00.000Z', status: 'approved', confidence: 0.94,
    fields: { ...sampleFields('payroll', 'FT-PAY-091'), counterparty: 'Employee · Sample 01', reference: 'PAY-2026-10' },
    sample: true,
  },
  {
    id: 'FT-COR-008', name: 'finanzamt_letter.pdf', category: 'correspondence', sizeBytes: 754_000,
    createdAt: '2026-10-20T10:30:00.000Z', status: 'action_required', confidence: 0.91,
    fields: { ...sampleFields('correspondence', 'FT-COR-008'), counterparty: 'Finanzamt München', reference: 'FA-2026-008', description: 'Reply deadline · 28 October' },
    sample: true, note: 'Deadline: 28 October 2026 · assigned to Lena M.',
  },
];

const NAV: NavEntry<Screen>[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'workspace' },
  { id: 'uploads', label: 'Client uploads', icon: FileUp, group: 'workspace' },
  { id: 'review', label: 'Review queue', icon: ClipboardCheck, group: 'workspace' },
  { id: 'clients', label: 'Clients', icon: Users, group: 'workspace' },
  { id: 'documents', label: 'Document register', icon: FileText, group: 'manage' },
  { id: 'submissions', label: 'Month submissions', icon: FileClock, group: 'manage' },
  { id: 'banking', label: 'Bank tracking', icon: Banknote, group: 'manage' },
  { id: 'correspondence', label: 'Correspondence', icon: MessageSquareText, group: 'manage' },
  { id: 'payroll', label: 'Payroll', icon: Wallet, group: 'manage' },
  { id: 'tasks', label: 'Tasks & reminders', icon: CalendarDays, group: 'manage' },
  { id: 'exports', label: 'Exports', icon: FileSpreadsheet, group: 'manage' },
  { id: 'admin', label: 'Administration', icon: Settings2, group: 'manage' },
];

const labelFor = (category: DemoCategory) => DEMO_CATEGORIES.find(([key]) => key === category)?.[1] ?? category;
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const formatAmount = (value: string) => Number(value || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function TeamWorkspace({ role, userName, onSignOut }: { role: DemoRole; userName: string; onSignOut: () => void }) {
  const roleLabel = role === 'admin' ? 'Admin' : 'Staff';
  const [screen, setScreen] = useState<Screen>(role === 'admin' ? 'overview' : 'uploads');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [adminSidebarCollapsed, setAdminSidebarCollapsed] = useState(false);
  const reduce = useReducedMotion();
  const allDocuments = useDemoDocumentsStore((state) => state.documents);
  const staffProfile = useDemoDocumentsStore((state) => state.roleAssignments.find((assignment) => assignment.role === 'staff' && (assignment.name === userName || assignment.loginName === userName)));
  const sharedDocuments = useMemo(() => documentsVisibleTo(
    allDocuments,
    role,
    role === 'staff' ? staffProfile?.id ?? userName : userName,
    userName,
  ), [allDocuments, role, staffProfile?.id, userName]);
  const assistantQuestions = useDemoDocumentsStore((state) => state.assistantQuestions);
  const followUpTasks = useDemoDocumentsStore((state) => state.followUpTasks);
  const bankLinks = useDemoDocumentsStore((state) => state.bankLinks);
  const payrollDrafts = useDemoDocumentsStore((state) => state.payrollDrafts);
  const auditEvents = useDemoDocumentsStore((state) => state.auditEvents);
  const settings = useDemoDocumentsStore((state) => state.settings);
  const roleAssignments = useDemoDocumentsStore((state) => state.roleAssignments);
  const exportHistory = useDemoDocumentsStore((state) => state.exports);
  const hydrateSharedStorage = useDemoDocumentsStore((state) => state.hydrateStorage);
  const startSharedStorageSync = useDemoDocumentsStore((state) => state.startStorageSync);
  const addSharedDocument = useDemoDocumentsStore((state) => state.addDocument);
  const replyToAssistantQuestion = useDemoDocumentsStore((state) => state.replyToAssistantQuestion);
  const updateSharedDocument = useDemoDocumentsStore((state) => state.updateDocument);
  const updateSharedFields = useDemoDocumentsStore((state) => state.updateFields);
  const recordSharedReview = useDemoDocumentsStore((state) => state.recordReview);
  const addFollowUpTask = useDemoDocumentsStore((state) => state.addFollowUpTask);
  const toggleFollowUpTask = useDemoDocumentsStore((state) => state.toggleFollowUpTask);
  const linkBankRecord = useDemoDocumentsStore((state) => state.linkBankRecord);
  const unlinkBankRecord = useDemoDocumentsStore((state) => state.unlinkBankRecord);
  const savePayrollDraft = useDemoDocumentsStore((state) => state.savePayrollDraft);
  const transitionPayrollDraft = useDemoDocumentsStore((state) => state.transitionPayrollDraft);
  const setWorkspaceSetting = useDemoDocumentsStore((state) => state.setWorkspaceSetting);
  const createDemoProfile = useDemoDocumentsStore((state) => state.createDemoProfile);
  const updateDemoProfile = useDemoDocumentsStore((state) => state.updateDemoProfile);
  const toggleDemoProfile = useDemoDocumentsStore((state) => state.toggleDemoProfile);
  const deleteDemoProfile = useDemoDocumentsStore((state) => state.deleteDemoProfile);
  const recordExport = useDemoDocumentsStore((state) => state.recordExport);
  const storageHydrated = useDemoDocumentsStore((state) => state.storageHydrated);
  const storageError = useDemoDocumentsStore((state) => state.storageError);
  const documents = sharedDocuments;
  const [selectedId, setSelectedId] = useState('FT-BANK-2201');
  const [search, setSearch] = useState('');
  const [uploadCategory, setUploadCategory] = useState<DemoCategory>('other');
  const [uploadError, setUploadError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [passwordDialog, setPasswordDialog] = useState<{ fileName: string; resolve: (value: string | null) => void } | null>(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    let stopSync: (() => void) | undefined;
    void hydrateSharedStorage().then(() => {
      if (disposed) return;
      const current = useDemoDocumentsStore.getState();
      if (current.storageError) setNotice(`Shared browser storage could not be loaded: ${current.storageError}`);
      stopSync = startSharedStorageSync(role === 'admin' ? (document) => {
        const client = demoClientIdentityById(document.clientId);
        setSelectedId(document.id);
        setNotice(`New client upload: ${client?.name ?? 'Unknown client'} · ${document.name}`);
      } : undefined);
      const existing = new Set(current.documents.map((document) => document.id));
      SAMPLE_DOCUMENTS.filter((document) => !existing.has(document.id))
        .forEach((document) => addSharedDocument(document, 'Fictional sample data'));
      if (current.followUpTasks.length === 0) {
        addFollowUpTask({
          title: 'Reply to fictional Finanzamt letter',
          clientId: 'client@fintax.demo',
          documentId: 'FT-COR-008',
          dueDate: '2026-10-28',
          owner: 'Lena M.',
        }, 'Fictional sample data');
        addFollowUpTask({
          title: 'Review synthetic bank transaction',
          clientId: 'client@fintax.demo',
          documentId: 'FT-BANK-2201',
          dueDate: '2026-10-25',
          owner: 'Jonas K.',
        }, 'Fictional sample data');
      }
    });
    return () => {
      disposed = true;
      stopSync?.();
    };
  }, [addFollowUpTask, addSharedDocument, hydrateSharedStorage, role, startSharedStorageSync]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selected = documents.find((item) => item.id === selectedId) ?? null;
  const reviewDocuments = documents
    .filter((item) => !item.sample && ['processing', 'review', 'action_required', 'password_required', 'needs_information', 'rejected'].includes(item.status))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const openClientQuestions = assistantQuestions.filter((question) => question.replies.length === 0).length;
  const approvedCount = documents.filter((item) => item.status === 'approved').length;
  const attentionCount = documents.filter((item) => ['action_required', 'needs_information', 'password_required', 'rejected'].includes(item.status)).length;
  const filteredDocuments = useMemo(() => documents.filter((item) => {
    const query = search.trim().toLowerCase();
    const client = demoClientIdentityById(item.clientId);
    const assignee = roleAssignments.find((assignment) => assignment.id === item.assignedStaffId || assignment.name === item.assignedStaffId)?.name;
    return !query || `${item.name} ${labelFor(item.category)} ${item.fields.counterparty} ${client?.name ?? ''} ${client?.email ?? ''} ${assignee ?? ''}`.toLowerCase().includes(query);
  }), [documents, roleAssignments, search]);
  const navigateTo = (nextScreen: Screen) => {
    if (nextScreen === 'review') setSelectedId(reviewDocuments[0]?.id ?? '');
    setScreen(nextScreen);
  };
  const openDocumentReview = (document: DemoDocument) => {
    setSelectedId(document.id);
    setScreen('review');
  };

  useEffect(() => {
    const handleHelpNavigation = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const item = NAV.find((entry) => entry.id === event.detail);
      if (item) setScreen(item.id);
    };
    window.addEventListener('fintax-navigate-workspace', handleHelpNavigation);
    return () => window.removeEventListener('fintax-navigate-workspace', handleHelpNavigation);
  }, []);

  const processFiles = async (files: FileList | File[]) => {
    setUploadError('');
    setNotice('');
    const next: DemoDocument[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      const issue = validateDemoFile(file);
      if (issue) {
        problems.push(`${file.name}: ${issue}`);
        continue;
      }
      const id = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const detectedCategory = categoryForFilename(file.name);
      const category = uploadCategory !== 'other' ? uploadCategory : detectedCategory;
      next.push({
        id, name: file.name, category, sizeBytes: file.size, createdAt: new Date().toISOString(),
        status: 'processing', confidence: 0, fields: emptyDemoFields(), sample: false,
        file, processingProgress: 0, note: 'Reading the document locally in this browser.',
      });
    }
    if (next.length) {
      next.forEach((document) => addSharedDocument(document, userName));
      setSelectedId(next[0].id);
      setScreen('documents');
      setBusyIds((current) => [...current, ...next.map((item) => item.id)]);
      for (const item of next) {
        try {
          const { processLocalDocument } = await import('../client/processDocument');
          const process = (password?: string) => processLocalDocument(item.file!, (progress) => {
            updateSharedDocument(item.id, { processingProgress: progress }, userName);
          }, password);
          let extraction: Awaited<ReturnType<typeof processLocalDocument>>;
          let password: string | undefined;
          while (true) {
            try {
              extraction = await process(password);
              break;
            } catch (error) {
              const passwordRequired = error instanceof Error && 'code' in error && error.code === 'password_required';
              if (!passwordRequired) throw error;
              password = await new Promise<string | null>((resolve) => {
                setPasswordDraft('');
                setPasswordDialog({ fileName: item.name, resolve });
              }) ?? undefined;
              if (!password) throw error;
            }
          }
          const textCategory = categoryFromDocumentText(extraction.text);
          const category = textCategory ?? (item.category === 'other'
            ? categoryForFilename(item.name, extraction.text)
            : item.category);
          const extractedFields = extractDocumentFields(category, extraction.text, item.name);
          const warnings = textCategory && item.category !== 'other' && textCategory !== item.category
            ? [`The extracted text indicates ${labelFor(textCategory)}, not the selected type. The document was reclassified automatically; verify the type and extracted fields before approval.`]
            : [];
          const mismatchNote = warnings.length ? `${warnings[0]} ${extraction.note ?? ''}`.trim() : extraction.note;
          updateSharedDocument(item.id, {
            status: 'review',
            category,
            confidence: Math.min(1, extractedFields.confidence * extraction.ocrConfidence),
            fields: extractedFields.fields,
            extractedDetails: extractDocumentDetails(category, extraction.text),
            extractedText: extraction.text,
            detectedLanguage: detectDocumentLanguage(extraction.text),
            ocrPages: extraction.pages,
            ocrEngine: extraction.ocrEngine,
            pageCount: extraction.pageCount ?? undefined,
            processingProgress: 100,
            validationWarnings: warnings,
            note: mismatchNote,
          }, userName);
        } catch (error) {
          const passwordRequired = error instanceof Error && 'code' in error && error.code === 'password_required';
          updateSharedDocument(item.id, {
            status: passwordRequired ? 'password_required' : 'action_required',
            note: error instanceof Error ? error.message : 'Document processing failed.',
          }, userName);
        } finally {
          setBusyIds((current) => current.filter((id) => id !== item.id));
        }
      }
      setNotice(`${next.length} file${next.length === 1 ? '' : 's'} processed locally in this browser. Review every field before approval.`);
    }
    if (problems.length) setUploadError(problems.join(' '));
  };

  const updateSelected = (id: string, key: keyof DemoFields, value: string) => {
    const document = documents.find((item) => item.id === id);
    if (!document) return;
    if (document.clientId) {
      updateSharedFields(document.id, key, value, userName);
      return;
    }
    updateSharedFields(document.id, key, value);
  };

  const approveSelected = (id: string) => {
    const document = documents.find((item) => item.id === id);
    if (!document) return;
    if (!canTransitionDocumentStatus(document.status, 'approved')) {
      setNotice(`A ${document.status.replace(/_/g, ' ')} document cannot be approved from its current status.`);
      return;
    }
    const issues = validateDemoFields(document.fields);
    if (issues.length) {
      setNotice(`Please fix the ${issues.length} validation issue${issues.length === 1 ? '' : 's'} before approving.`);
      return;
    }
    recordSharedReview(document.id, 'Approved', 'Staff approved the validated demo fields.', {
      status: 'approved',
      workflowStage: 'completed',
      note: 'Validated and approved by demo reviewer.',
    }, userName);
    setNotice(document.clientId ? `${document.name} approved. The client can see the update in their demo workspace.` : `${document.name} approved. It is now eligible for the accounting CSV preview.`);
  };

  const requestCorrection = (id: string, requestReason = '') => {
    const document = documents.find((item) => item.id === id);
    if (!document) return;
    const reason = requestReason.trim() || 'Please provide a clearer copy or additional information so the advisor can complete the review.';
    const status = document.clientId ? 'needs_information' : 'action_required';
    if (!canTransitionDocumentStatus(document.status, status)) {
      setNotice(`A clarification cannot be requested from the ${document.status.replace(/_/g, ' ')} state.`);
      return;
    }
    recordSharedReview(document.id, 'Information requested', reason, {
      status,
      note: reason,
      clientRequest: { reason, createdAt: new Date().toISOString() },
    }, userName);
    addFollowUpTask({
      title: `Follow up: ${document.name}`,
      clientId: document.clientId,
      documentId: document.id,
      dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      owner: userName,
    }, userName);
    setNotice(document.clientId ? 'Clarification request and linked follow-up task are visible in the client demo workspace.' : 'Clarification recorded and a linked follow-up task was created.');
  };

  const rejectSelected = (id: string) => {
    const document = documents.find((item) => item.id === id);
    if (!document?.clientId) return;
    const reason = 'This document could not be accepted. Please upload a clearer or corrected copy.';
    recordSharedReview(document.id, 'Replacement requested', reason, {
      status: 'rejected',
      note: reason,
      clientRequest: { reason, createdAt: new Date().toISOString() },
    }, userName);
    setNotice('A replacement request is now visible in the client demo dashboard.');
  };

  const downloadCsv = (exportDocuments: DemoDocument[]) => {
    if (!settings.exportsEnabled) {
      setNotice('CSV exports are disabled in Administration settings.');
      return;
    }
    const exportable = exportDocuments.filter((item) => item.status === 'approved' && ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(item.category));
    if (!exportable.length) {
      setNotice('There are no approved accounting records in the selected export.');
      return;
    }
    const blob = new Blob([`\uFEFF${accountingCsv(exportable)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fintax-demo-accounting-export.csv';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordExport(exportable.map((document) => document.id), userName);
    setNotice(`${exportable.length} approved accounting record${exportable.length === 1 ? '' : 's'} exported. Review account mapping with your Agenda setup before live use.`);
  };

  const createPayrollDraft = (document: DemoDocument) => {
    const existing = payrollDrafts.find((draft) => draft.documentId === document.id);
    if (existing) return;
    savePayrollDraft({
      documentId: document.id,
      employee: document.fields.counterparty,
      payPeriod: document.fields.documentDate,
      grossAmount: document.fields.grossAmount,
      netAmount: document.fields.netAmount,
      status: 'draft',
      validationIssues: [],
      updatedAt: new Date().toISOString(),
    }, userName);
    setNotice(`Payroll draft created from ${document.name}; values remain subject to staff verification.`);
  };

  const validatePayrollDraft = (draft: DemoPayrollDraft) => {
    const document = documents.find((item) => item.id === draft.documentId);
    if (!document) {
      setNotice('The source payroll document is no longer available.');
      return;
    }
    if (draft.status === 'approved') {
      setNotice('An approved payroll draft cannot be validated again.');
      return;
    }
    const issues = validateDemoFields(document.fields);
    savePayrollDraft({
      ...draft,
      employee: document.fields.counterparty,
      payPeriod: document.fields.documentDate,
      grossAmount: document.fields.grossAmount,
      netAmount: document.fields.netAmount,
      status: 'draft',
      validationIssues: issues,
      updatedAt: new Date().toISOString(),
    }, userName);
    if (issues.length) {
      setNotice(`Payroll draft has ${issues.length} validation issue${issues.length === 1 ? '' : 's'}; correct the source document before validation.`);
      return;
    }
    if (transitionPayrollDraft(document.id, 'validated', userName)) {
      setNotice('Payroll draft passed required-field, amount, and account checks. It is ready for approval.');
    }
  };

  const approvePayrollDraft = (draft: DemoPayrollDraft) => {
    if (!settings.payrollApprovalsEnabled) {
      setNotice('Payroll approvals are disabled in Administration settings.');
      return;
    }
    if (transitionPayrollDraft(draft.documentId, 'approved', userName)) {
      recordSharedReview(draft.documentId, 'Payroll draft approved', 'Validated payroll draft approved in the browser-only demo.', {}, userName);
      setNotice('Payroll draft approved for demo bookkeeping review. No payment was initiated.');
    } else {
      setNotice('Validate the payroll draft before approving it.');
    }
  };

  const returnDocumentToReview = (id: string) => {
    const document = documents.find((item) => item.id === id);
    if (!document || !canTransitionDocumentStatus(document.status, 'review')) {
      setNotice('This document cannot return to review from its current status.');
      return;
    }
    recordSharedReview(id, 'Returned to staff review', 'Document moved back to the active review queue.', {
      status: 'review',
      workflowStage: 'staff_review',
      note: 'Returned to staff review.',
    }, userName);
    setNotice('Document returned to the active review queue.');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) processFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    processFiles(event.dataTransfer.files);
  };

  return (
    <div
      data-theme={role === 'admin' ? 'light' : undefined}
      className={`h-screen h-dvh overflow-x-hidden overflow-y-auto bg-bg text-ink ${role === 'admin' && screen === 'overview' ? 'admin-mobile-overview-shell' : ''}`}
      style={role === 'admin' ? { background: 'radial-gradient(1100px 520px at 50% -8%, #ffffff 0%, rgba(255,255,255,0) 70%), linear-gradient(#e8eef8, #eef2f9)' } : undefined}
    >
      <header className={`workspace-topbar sticky top-0 z-20 ${role === 'admin' ? 'border-0 bg-transparent px-2 pt-2 sm:px-4' : 'border-b hairline bg-bg2/95'}`}>
        <div className={`workspace-topbar-card mx-auto flex max-w-[1500px] items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3 ${role === 'admin' ? 'flex-wrap rounded-[1.4rem] border border-white/90 bg-white/90 shadow-[0_18px_45px_-34px_rgba(30,41,59,.45)] backdrop-blur-xl' : ''}`}>
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-xl border hairline lg:hidden" aria-label="Open navigation" aria-controls="demo-mobile-navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu className="size-4" /></button>
          <img src={fintaxLogo} alt="FinTax Consulting" className="brand-logo h-auto w-36 shrink-0 object-contain" />
          <div className="workspace-topbar-brand min-w-0 flex-1"><p className="truncate font-semibold leading-tight">Client operations workspace</p></div>
          {role === 'admin' && <nav aria-label="Quick workspace navigation" className="hidden items-center gap-0.5 rounded-full bg-slate-100/80 p-1 xl:flex">
            {(['overview', 'uploads', 'review', 'clients'] as Screen[]).map((item) => (
              <button key={item} type="button" onClick={() => navigateTo(item)} aria-current={screen === item ? 'page' : undefined} className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${screen === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}>{item === 'review' ? 'Review queue' : item === 'clients' ? 'Clients' : item === 'uploads' ? 'Client uploads' : 'Overview'}</button>
            ))}
          </nav>}
          <Badge tone="warn" className="hidden lg:inline-flex">INTERACTIVE DEMO</Badge>
          <div className="ml-auto hidden items-center gap-2 text-xs text-muted md:flex"><span className="size-2 rounded-full bg-green" /> Browser-only · IndexedDB</div>
          <div className="workspace-topbar-user hidden items-center gap-3 border-l hairline pl-4 sm:flex"><div className="grid size-8 place-items-center rounded-full bg-violet/10 text-violet"><Users className="size-4" /></div><div><p className="text-xs font-medium">{userName}</p><p className="text-[11px] text-muted">{roleLabel} Demo User</p></div></div>
          <Button size="sm" aria-label="Log out" title="Log out" className="size-10 shrink-0 p-0 sm:size-auto sm:px-3" onClick={onSignOut} icon={<LogOut className="size-3.5" />}><span className="sr-only sm:not-sr-only">Logout</span></Button>
        </div>
      </header>

      <div className={`workspace-layout mx-auto grid max-w-[1500px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:gap-8 lg:py-7 ${role === 'admin' ? (adminSidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[248px_minmax(0,1fr)]') : 'lg:grid-cols-[220px_minmax(0,1fr)]'} ${role === 'admin' && screen === 'overview' ? 'admin-mobile-overview-layout' : ''}`}>
        {role === 'admin' ? (
          <AdminSidebar
            screen={screen}
            userName={userName}
            reviewCount={reviewDocuments.length}
            questionCount={openClientQuestions}
            collapsed={adminSidebarCollapsed}
            onToggleCollapsed={() => setAdminSidebarCollapsed((value) => !value)}
            onNavigate={navigateTo}
            onSignOut={onSignOut}
          />
        ) : (
          <aside id="demo-navigation" className="hidden h-fit rounded-xl border hairline bg-bg2/50 p-2 lg:sticky lg:top-[88px] lg:block">
            <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">Workspace</p>
            <nav aria-label="Demo workspace" className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {NAV.filter((item) => item.group === 'workspace').map((item) => <NavButton key={item.id} item={item} active={screen === item.id} onClick={() => navigateTo(item.id)} count={item.id === 'review' ? reviewDocuments.length : item.id === 'uploads' ? documents.filter((document) => !document.sample && Boolean(document.clientId)).length : undefined} />)}
            </nav>
            <details className="mt-4 border-t hairline pt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-xs font-medium text-muted hover:bg-ink/5 [&::-webkit-details-marker]:hidden"><Settings2 className="size-4" />More workspace tools<ChevronRight className="ml-auto size-3.5" /></summary>
              <nav aria-label="Manage demo workspace" className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                {NAV.filter((item) => item.group === 'manage' && item.id !== 'admin').map((item) => <NavButton key={item.id} item={item} active={screen === item.id} onClick={() => navigateTo(item.id)} count={item.id === 'correspondence' ? openClientQuestions : undefined} />)}
              </nav>
            </details>
            <div className="mt-5 rounded-lg border border-cyan/15 bg-cyan/5 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold"><LockKeyhole className="size-3.5 text-cyan" />Private demo mode</div>
              <p className="mt-1.5 text-[11px] leading-4 text-muted">Monthly documents and periods persist in this browser’s IndexedDB. Other workspace actions remain session-only; nothing is sent to a server.</p>
            </div>
          </aside>
        )}

        <main className={`min-w-0 space-y-5 ${screen === 'exports' ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]'} sm:space-y-6 lg:pb-12 ${role === 'admin' && screen === 'overview' ? 'admin-mobile-overview-main' : ''}`}>
          <div className={`flex flex-wrap items-start justify-between gap-4 ${role === 'admin' && screen === 'overview' ? 'sr-only' : ''}`}>
            <div><p className="text-xs font-medium uppercase tracking-[.14em] text-cyan">FinTax · {roleLabel} demo workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{screen === 'overview' ? `${roleLabel} Dashboard` : screenTitle(screen)}</h1><p className="mt-1.5 max-w-2xl text-sm text-muted">{screenDescription(screen, role)}</p></div>
            <Badge tone="warn" className="sm:hidden">DEMO · browser-only storage</Badge>
          </div>

          {notice && <div role="status" className="demo-enter flex items-start gap-2 rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2.5 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan" /><span className="min-w-0 flex-1">{notice}</span><button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X className="size-4 text-muted" /></button></div>}

          <motion.div key={screen} className="space-y-5 sm:space-y-6" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {screen === 'overview' && <Overview role={role === 'admin' ? 'admin' : 'staff'} userName={userName} documents={documents} tasks={followUpTasks} roleAssignments={roleAssignments} reviewCount={reviewDocuments.length} approvedCount={approvedCount} attentionCount={attentionCount} openQuestions={openClientQuestions} onNavigate={navigateTo} onOpenDocument={(item) => { setSelectedId(item.id); setScreen('review'); }} />}
          {screen === 'documents' && <DocumentsPanel
            adminStyle={role === 'admin'}
            documents={filteredDocuments} search={search} onSearch={setSearch} onDrop={handleDrop}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)} dragOver={dragOver}
            category={uploadCategory} onCategoryChange={setUploadCategory}
            onBrowse={() => fileInput.current?.click()}
            uploadError={uploadError} selectedId={selectedId}
            onSelect={(document) => { setSelectedId(document.id); setScreen('review'); }}
            staffUsers={roleAssignments.filter((assignment) => assignment.role === 'staff' && assignment.active !== false)}
            clientProfiles={roleAssignments.filter((assignment) => assignment.role === 'client')}
            onAssign={(documentId, staffId) => {
              updateSharedDocument(documentId, { assignedStaffId: staffId || undefined }, userName);
              const document = documents.find((item) => item.id === documentId);
              setNotice(staffId
                ? `${document?.name ?? 'Document'} assigned to ${staffId}.`
                : `${document?.name ?? 'Document'} is unassigned.`);
            }}
            onDownload={(document) => {
              if (!document.file) {
                setNotice('The original file is not available in this browser session.');
                return;
              }
              const url = URL.createObjectURL(document.file);
              const link = window.document.createElement('a');
              link.href = url;
              link.download = document.name;
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            busyIds={busyIds}
          />}
          {screen === 'review' && <ReviewPanel
            adminStyle={role === 'admin'}
            documents={reviewDocuments} selected={selected}
            onSelect={setSelectedId} onUpdate={updateSelected} onApprove={approveSelected}
            onRequestCorrection={requestCorrection} onReject={rejectSelected} onNavigate={navigateTo} onReturnToReview={returnDocumentToReview}
          />}
          {screen === 'uploads' && <ClientUploadsPanel
            documents={documents.filter((document) => !document.sample && Boolean(document.clientId))}
            adminStyle={role === 'admin'}
            staffUsers={roleAssignments.filter((assignment) => assignment.role === 'staff' && assignment.active !== false)}
            clientProfiles={roleAssignments.filter((assignment) => assignment.role === 'client')}
            followUpTasks={followUpTasks}
            loading={!storageHydrated}
            error={storageError}
            onOpenReview={openDocumentReview}
            onAssign={(documentId, staffId) => {
              updateSharedDocument(documentId, { assignedStaffId: staffId || undefined }, userName);
              const document = documents.find((item) => item.id === documentId);
              const staffName = roleAssignments.find((assignment) => assignment.id === staffId || assignment.name === staffId)?.name;
              setNotice(staffId ? `${document?.name ?? 'Document'} assigned to ${staffName ?? staffId}.` : `${document?.name ?? 'Document'} is unassigned.`);
            }}
          />}
          {screen === 'submissions' && <MonthSubmissionsPanel
            role={role === 'admin' ? 'admin' : 'staff'}
            userName={userName}
            onOpenDocument={openDocumentReview}
          />}
          {screen === 'banking' && <BankingPanel adminStyle={role === 'admin'} documents={documents} bankLinks={bankLinks} onLink={(statementId, transactionReference, accountingDocumentId) => linkBankRecord(statementId, transactionReference, accountingDocumentId, userName)} onUnlink={(statementId, transactionReference, accountingDocumentId) => unlinkBankRecord(statementId, transactionReference, accountingDocumentId, userName)} />}
          {screen === 'correspondence' && <CorrespondenceWorkspace adminStyle={role === 'admin'} documents={documents} questions={assistantQuestions} userName={userName} onOpen={(id) => { setSelectedId(id); setScreen('review'); }} onCreateFollowUp={(document) => { addFollowUpTask({ title: `Follow up: ${document.name}`, clientId: document.clientId, documentId: document.id, dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), owner: userName }, userName); setNotice(`Follow-up task linked to ${document.name} was created.`); }} onReply={replyToAssistantQuestion} />}
          {screen === 'payroll' && <PayrollPanel adminStyle={role === 'admin'} documents={documents} drafts={payrollDrafts} approvalsEnabled={settings.payrollApprovalsEnabled} onCreateDraft={createPayrollDraft} onValidate={validatePayrollDraft} onApprove={approvePayrollDraft} />}
          {screen === 'tasks' && <TasksPanel adminStyle={role === 'admin'} tasks={followUpTasks} documents={documents} userName={userName} onCreate={(task) => addFollowUpTask(task, userName)} onToggle={(id) => toggleFollowUpTask(id, userName)} onOpenDocument={(id) => { setSelectedId(id); setScreen('review'); }} />}
          {screen === 'exports' && <ExportsPanel adminStyle={role === 'admin'} documents={documents} exportsEnabled={settings.exportsEnabled} exportHistory={exportHistory} onExport={downloadCsv} />}
          {screen === 'clients' && role === 'admin' && <ClientsPage
            demoOnly
            onOpenDocument={openDocumentReview}
            onManageAccounts={() => navigateTo('admin')}
          />}
          {screen === 'admin' && <AdminPanel
            adminStyle={role === 'admin'}
            settings={settings}
            roleAssignments={roleAssignments}
            auditEvents={auditEvents}
            onSettingChange={(key, value) => setWorkspaceSetting(key, value, userName)}
            onCreateProfile={(profile) => createDemoProfile(profile, userName)}
            onUpdateProfile={(id, profile) => updateDemoProfile(id, profile, userName)}
            onToggleProfile={(id) => toggleDemoProfile(id, userName)}
            onDeleteProfile={(id) => deleteDemoProfile(id, userName)}
          />}
          </motion.div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t hairline pt-4 text-[11px] text-muted">
            <span>FinTax prototype · documents and monthly periods use browser IndexedDB; other demo actions are session-only</span>
            <span>Sample workflow only · do not upload real personal, payroll, or identity documents</span>
          </footer>
        </main>
      </div>
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={NAV.filter((item) => role === 'admin' || item.id !== 'admin')}
        screen={screen}
        onSelect={(id) => { navigateTo(id); setDrawerOpen(false); }}
        counts={{ review: reviewDocuments.length, uploads: documents.filter((document) => !document.sample && Boolean(document.clientId)).length }}
        userName={userName}
        roleLabel={roleLabel}
        onSignOut={onSignOut}
      />
      <BottomBar role={role === 'admin' ? 'admin' : 'staff'} screen={screen} onSelect={navigateTo} reviewCount={reviewDocuments.length} onMore={() => setDrawerOpen(true)} />
      {passwordDialog && <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/45 p-4">
        <form role="dialog" aria-modal="true" aria-labelledby="team-pdf-password-heading" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const { resolve } = passwordDialog;
            setPasswordDialog(null);
            resolve(passwordDraft);
            setPasswordDraft('');
          }}>
          <h2 id="team-pdf-password-heading" className="text-lg font-semibold text-ink">Unlock this PDF</h2>
          <p className="mt-1 text-sm text-muted">{passwordDialog.fileName} is password-protected. The password is used only for this local processing attempt and is not saved.</p>
          <label htmlFor="team-pdf-password-input" className="mt-4 block text-xs font-medium text-ink">PDF password</label>
          <input id="team-pdf-password-input" type="password" autoComplete="off" autoFocus value={passwordDraft}
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
      <input ref={fileInput} type="file" multiple className="sr-only" aria-label="Choose documents to upload" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff,.bmp,.xlsx,.csv,.txt,.docx,application/pdf,image/*,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFileChange} />
    </div>
  );
}

function NavButton({ item, active, onClick, count }: { item: typeof NAV[number]; active: boolean; onClick: () => void; count?: number }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors lg:text-[13px] ${active ? 'bg-cyan/10 text-ink ring-1 ring-cyan/20' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}>
    <Icon className={`size-4 shrink-0 ${active ? 'text-cyan' : ''}`} /><span className="truncate">{item.label}</span>{count ? <span className="ml-auto rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">{count}</span> : null}
  </button>;
}

function AdminSidebar({ screen, userName, reviewCount, questionCount, collapsed, onToggleCollapsed, onNavigate, onSignOut }: {
  screen: Screen;
  userName: string;
  reviewCount: number;
  questionCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (screen: Screen) => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState('');
  const [manageExpanded, setManageExpanded] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (item: typeof NAV[number]) => collapsed || item.label.toLowerCase().includes(normalizedQuery);
  const workspaceItems = NAV.filter((item) => item.group === 'workspace' && matches(item));
  const manageItems = NAV.filter((item) => item.group === 'manage' && matches(item));
  const renderItems = (items: typeof NAV, label: string) => (
    <nav aria-label={label} className="grid gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = screen === item.id;
        const count = item.id === 'review' ? reviewCount : item.id === 'correspondence' ? questionCount : 0;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-label={collapsed ? item.label : undefined}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={`group relative flex min-h-10 w-full items-center gap-3 rounded-xl text-left text-[13px] transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${active ? 'bg-[#eeebf7] font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            {active && <span aria-hidden className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-violet-600" />}
            <Icon className={`size-4 shrink-0 ${active ? 'text-violet-700' : 'text-slate-500 group-hover:text-slate-700'}`} />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
            {count > 0 && (
              <span className={`${collapsed ? 'absolute -end-1 -top-1' : 'ml-auto'} grid min-w-5 place-items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <aside id="demo-navigation" className={`sticky top-[76px] hidden h-[calc(100dvh-96px)] min-h-[460px] flex-col rounded-[1.35rem] border border-white/90 bg-white/85 p-2.5 shadow-[0_20px_55px_-38px_rgba(30,41,59,.4)] backdrop-blur-xl lg:flex ${collapsed ? 'items-center' : ''}`}>
      <div className={`flex items-center ${collapsed ? 'min-h-[72px] flex-col justify-center gap-1' : 'min-h-11 gap-2 px-1'}`}>
        <img src={fintaxLogo} alt="FinTax Consulting" className={`brand-logo h-auto max-w-full object-contain ${collapsed ? 'w-10' : 'w-36 flex-1'}`} />
        <button type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
          <ChevronRight className={`size-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {!collapsed && (
        <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 text-slate-400 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
          <Search className="size-3.5 shrink-0" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages" aria-label="Search workspace pages" className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-[10px] text-slate-500 hover:text-slate-900">Clear</button>}
        </label>
      )}

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5">
        {(workspaceItems.length > 0 || collapsed) && (
          <section>
            {!collapsed && <h2 className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[.12em] text-slate-400">Workspace</h2>}
            {renderItems(workspaceItems, 'Workspace')}
          </section>
        )}
        {manageItems.length > 0 && <>
          <button type="button" aria-expanded={manageExpanded || Boolean(query)} onClick={() => setManageExpanded((value) => !value)} className={`flex min-h-10 w-full items-center gap-3 rounded-xl text-left text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${collapsed ? 'justify-center px-0' : 'px-3'}`} title={collapsed ? 'Manage' : undefined}>
            <Settings2 className="size-4 shrink-0" />
            {!collapsed && <><span className="flex-1">Manage</span><ChevronRight className={`size-3.5 transition-transform ${manageExpanded || query ? 'rotate-90' : ''}`} /></>}
            {collapsed && <span className="sr-only">Manage</span>}
          </button>
          {(manageExpanded || Boolean(query)) && renderItems(manageItems, 'Manage workspace')}
        </>}
        {!collapsed && query && workspaceItems.length === 0 && manageItems.length === 0 && <p className="px-2 py-4 text-xs text-slate-500">No pages match “{query}”.</p>}
      </div>

      {!collapsed && <div className="my-2 border-t border-slate-200/80" />}
      <details className={`group relative ${collapsed ? 'w-full' : ''}`}>
        <summary className={`flex min-h-12 cursor-pointer list-none items-center rounded-xl transition hover:bg-slate-100 [&::-webkit-details-marker]:hidden ${collapsed ? 'justify-center' : 'gap-2 px-1.5'}`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700"><Users className="size-4" /></span>
          {!collapsed && <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-slate-800">{userName}</span>
              <span className="block text-[10px] text-slate-500">Admin demo workspace</span>
            </span>
            <ChevronRight className="size-3.5 rotate-90 text-slate-400 transition group-open:-rotate-90" />
          </>}
          {collapsed && <span className="sr-only">{userName} account menu</span>}
        </summary>
        <div className={`absolute bottom-full z-20 mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ${collapsed ? 'start-full ms-2 w-52' : 'inset-x-0'}`}>
          <div className="border-b border-slate-100 px-2 pb-2 pt-1">
            <p className="truncate text-xs font-medium text-slate-800">{userName}</p>
            <p className="text-[10px] text-slate-500">Admin demo workspace</p>
          </div>
          <button type="button" onClick={() => onNavigate('clients')} className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Users className="size-3.5" />Client workspaces</button>
          <button type="button" onClick={() => onNavigate('admin')} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Settings2 className="size-3.5" />Administration</button>
          <button type="button" onClick={onSignOut} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-700"><LogOut className="size-3.5" />Sign out</button>
        </div>
      </details>
    </aside>
  );
}

function Overview({ role, userName, documents, tasks, roleAssignments, reviewCount, approvedCount, attentionCount, openQuestions, onNavigate, onOpenDocument }: { role: Exclude<DemoRole, 'client'>; userName: string; documents: DemoDocument[]; tasks: DemoFollowUpTask[]; roleAssignments: DemoRoleAssignment[]; reviewCount: number; approvedCount: number; attentionCount: number; openQuestions: number; onNavigate: (screen: Screen) => void; onOpenDocument: (document: DemoDocument) => void }) {
  const [adminPanel, setAdminPanel] = useState<'summary' | 'workflow' | 'clients' | 'recent'>('summary');
  const recent = documents.slice(0, 4);
  const clientCounts = DEMO_CLIENTS.map((client) => ({
    ...client,
    count: documents.filter((document) => document.clientId === client.email).length,
    open: documents.filter((document) => document.clientId === client.email && ['review', 'action_required', 'needs_information', 'password_required', 'rejected'].includes(document.status)).length,
  }));
  const upcomingTasks = tasks.filter((task) => {
    const daysUntilDue = (Date.parse(`${task.dueDate}T23:59:59`) - Date.now()) / 86_400_000;
    return task.owner === userName && task.status === 'open' && daysUntilDue >= 0 && daysUntilDue <= 7;
  }).length;
  const processingCount = documents.filter((document) => document.status === 'processing').length;
  const exportReadyCount = documents.filter((document) => document.status === 'approved'
    && ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(document.category)).length;
  const stats = role === 'admin' ? [
    { label: 'Demo clients', value: clientCounts.length, note: 'Fictional client workspaces', icon: Users, color: 'text-cyan', action: 'clients' as Screen, actionLabel: 'Open clients' },
    { label: 'Demo staff', value: roleAssignments.filter((assignment) => assignment.role === 'staff').length, note: 'Directory profiles only', icon: ClipboardCheck, color: 'text-cyan', action: 'admin' as Screen, actionLabel: 'Manage demo profiles' },
    { label: 'Client uploads', value: documents.filter((document) => Boolean(document.clientId) && !document.sample).length, note: 'Visible in shared browser storage', icon: FileText, color: 'text-cyan', action: 'documents' as Screen, actionLabel: 'Open documents' },
    { label: 'Pending reviews', value: documents.filter((document) => document.status === 'review').length, note: 'Awaiting staff review', icon: FileClock, color: 'text-warn', action: 'review' as Screen, actionLabel: 'Review documents' },
    { label: 'In processing', value: processingCount, note: 'OCR and intake work', icon: Clock3, color: 'text-violet', action: 'documents' as Screen, actionLabel: 'Track intake' },
    { label: 'Completed', value: approvedCount, note: 'Approved demo records', icon: BadgeCheck, color: 'text-green', action: 'exports' as Screen, actionLabel: 'Open exports' },
  ] : [
    { label: 'Assigned documents', value: documents.length, note: 'Visible in your demo queue', icon: FileText, color: 'text-cyan', action: 'documents' as Screen, actionLabel: 'Open assignments' },
    { label: 'Pending reviews', value: documents.filter((document) => document.status === 'review').length, note: 'Waiting for review', icon: FileClock, color: 'text-warn', action: 'review' as Screen, actionLabel: 'Review documents' },
    { label: 'In progress', value: processingCount, note: 'Being processed', icon: Clock3, color: 'text-violet', action: 'documents' as Screen, actionLabel: 'Open documents' },
    { label: 'Completed', value: approvedCount, note: 'Approved demo records', icon: BadgeCheck, color: 'text-green', action: 'exports' as Screen, actionLabel: 'Open exports' },
    { label: 'Recently updated', value: documents.filter((document) => {
      const age = Date.now() - Date.parse(document.updatedAt ?? document.createdAt);
      return age >= 0 && age <= 7 * 86_400_000;
    }).length, note: 'Updated in the last 7 days', icon: CircleAlert, color: 'text-cyan', action: 'documents' as Screen, actionLabel: 'See recent updates' },
  ];
  return <>
    {role === 'admin' && (
      <nav className="admin-mobile-overview-tabs" aria-label="Admin overview sections">
        {([
          ['summary', 'Summary'],
          ['workflow', 'Workflow'],
          ['clients', 'Clients'],
          ['recent', 'Recent'],
        ] as const).map(([panel, label]) => (
          <button
            key={panel}
            type="button"
            onClick={() => setAdminPanel(panel)}
            aria-pressed={adminPanel === panel}
            className={adminPanel === panel ? 'is-active' : ''}
          >
            {label}
          </button>
        ))}
      </nav>
    )}
    {role === 'admin' && (
      <div className={`admin-mobile-overview-panel admin-mobile-summary ${adminPanel === 'summary' ? 'is-selected' : ''}`}>
        <PulseHero
          badge="FinTax · Admin demo workspace"
          description={screenDescription('overview', role)}
          reviewCount={reviewCount}
          onIntake={() => onNavigate('documents')}
          onReview={() => onNavigate('review')}
        />
      </div>
    )}
    <section aria-label="Key figures" className={`px-1 pt-1 ${role === 'admin' ? `admin-mobile-overview-panel admin-mobile-summary ${adminPanel === 'summary' ? 'is-selected' : ''}` : 'staff-metrics'}`}>
      <StatFlow
        surface="panel"
        activeKey=""
        onSelect={(key) => onNavigate(stats[Number(key)].action)}
        items={stats.map((stat, index) => ({
          key: String(index),
          label: stat.label,
          compactLabel: stat.label,
          hint: stat.note,
          value: <CountUp value={stat.value} />,
          icon: stat.icon,
          from: PALETTE[index][0],
          to: PALETTE[index][1],
          actionLabel: stat.actionLabel,
        }))}
        variant={role === 'admin' ? 'sidebar' : 'staffTiles'}
      />
    </section>

    <div className={`grid gap-5 ${role === 'admin' ? 'xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]' : ''}`}>
      <div className={role === 'admin' ? `admin-mobile-overview-panel admin-mobile-workflow ${adminPanel === 'workflow' ? 'is-selected' : ''}` : ''}>
      <Panel className={role === 'admin' ? 'admin-mobile-workflow-card overflow-hidden !rounded-3xl !border-white/80 !bg-white/80 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)] backdrop-blur' : 'staff-workflow-panel overflow-hidden'}>
        <div className={`staff-workflow-heading flex items-center justify-between border-b hairline ${role === 'admin' ? 'px-5 py-4' : ''}`}><div><h2 className="font-semibold">Document workflow</h2><p className="mt-1 text-xs text-muted">Monthly client files move from upload to accounting export. Counts include samples and browser uploads.</p></div></div>
        {role === 'admin' ? (
          <div className="p-2 sm:p-4">
            <FlowDiagram
              counts={{
                upload: documents.filter((document) => Boolean(document.clientId)).length,
                extract: processingCount,
                validate: documents.filter((document) => ['action_required', 'needs_information', 'password_required', 'rejected'].includes(document.status)).length,
                review: documents.filter((document) => document.status === 'review').length,
                export: exportReadyCount,
              }}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          <StaffWorkflow
            counts={{
              upload: documents.filter((document) => Boolean(document.clientId)).length,
              extract: processingCount,
              validate: documents.filter((document) => ['action_required', 'needs_information', 'password_required', 'rejected'].includes(document.status)).length,
              review: documents.filter((document) => document.status === 'review').length,
              export: exportReadyCount,
            }}
            reviewCount={reviewCount}
            onNavigate={onNavigate}
          />
        )}
      </Panel>
      </div>
      {role === 'admin' ? <div className={`admin-mobile-overview-panel admin-mobile-portfolio ${adminPanel === 'clients' ? 'is-selected' : ''}`}><Panel className="overflow-hidden !rounded-3xl !border-white/80 !bg-white/80 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)] backdrop-blur">
        <div className="border-b hairline px-5 py-4"><p className="text-[11px] font-medium uppercase tracking-wide text-cyan">System overview</p><h2 className="mt-1 font-semibold">Client portfolio</h2><p className="mt-1 text-xs text-muted">Current workflow status across fictional demo accounts.</p></div>
        <ul className="divide-y divide-line/10">{clientCounts.map((client) => <li key={client.id} className="flex items-center gap-3 px-5 py-3"><span className="grid size-8 place-items-center rounded-lg bg-cyan/8 text-cyan"><Building2 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{client.company}</span><span className="block text-[11px] text-muted">{client.count} documents · {client.open} open items</span></span><Badge tone={client.open ? 'warn' : 'ok'}>{client.open ? 'In progress' : 'Clear'}</Badge></li>)}</ul>
        <button type="button" onClick={() => onNavigate('clients')} className="w-full border-t hairline px-5 py-3 text-left text-xs font-medium text-cyan hover:bg-cyan/5">Open client management <ArrowRight className="ml-1 inline size-3.5" /></button>
      </Panel></div> : <Panel className="p-5">
        <div className="flex items-center gap-2"><ClipboardCheck className="size-4 text-cyan" /><h2 className="font-semibold">My operations queue</h2></div>
        <p className="mt-1 text-xs text-muted">{userName} · permitted demo client assignments</p>
        <div className="mt-4 space-y-2">{[
          { label: 'Documents to review', value: reviewCount, screen: 'review' as Screen },
          { label: 'Client questions', value: openQuestions, screen: 'correspondence' as Screen },
          { label: 'Upcoming client tasks', value: upcomingTasks, screen: 'tasks' as Screen },
        ].map((item) => <button key={item.label} type="button" onClick={() => onNavigate(item.screen)} className="flex w-full items-center justify-between rounded-lg border hairline px-3 py-2.5 text-left text-xs hover:border-cyan/35 hover:bg-cyan/5"><span>{item.label}</span><span className="font-semibold tabular-nums">{item.value}<ChevronRight className="ml-2 inline size-3.5 text-muted" /></span></button>)}</div>
        <div className="mt-4 border-t hairline pt-3"><p className="text-[11px] font-medium">Assigned demo clients</p><ul className="mt-2 space-y-2">{clientCounts.map((client) => <li key={client.id} className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate">{client.company}</span><span className="shrink-0 text-muted">{client.open} open</span></li>)}</ul></div>
        <div className="mt-4 rounded-lg bg-bg2/70 p-3"><p className="text-[11px] font-medium">Demo processing limits</p><p className="mt-1 text-[11px] leading-4 text-muted">Documents and monthly periods use browser IndexedDB. PDF text and supported scanned pages are processed locally; OCR needs manual verification and no connected AI is configured.</p></div>
      </Panel>}
    </div>

    <div className={role === 'admin' ? `admin-mobile-overview-panel admin-mobile-recent ${adminPanel === 'recent' ? 'is-selected' : ''}` : ''}><Panel className={role === 'admin' ? 'overflow-hidden !rounded-3xl !border-white/80 !bg-white/80 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)] backdrop-blur' : 'overflow-hidden'}>
      <div className="flex items-center justify-between border-b hairline px-5 py-4"><div><h2 className="font-semibold">Recent documents</h2><p className="mt-1 text-xs text-muted">Latest records in this browser demo; open a file to inspect its details.</p></div><button type="button" className="text-xs font-medium text-cyan" onClick={() => onNavigate('documents')}>View all <ArrowRight className="ml-1 inline size-3.5" /></button></div>
      {role === 'admin' && <ul className="admin-mobile-recent-list divide-y divide-line/10">
        {recent.map((item) => <li key={item.id}>
          <button type="button" onClick={() => onOpenDocument(item)} className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan/8 text-cyan"><FileText className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{item.name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">{labelFor(item.category)} · {new Date(item.createdAt).toLocaleDateString()}</span>
            </span>
            <DocStatus status={item.status} />
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </button>
        </li>)}
      </ul>}
      <div className={role === 'admin' ? 'admin-mobile-recent-table' : ''}><DocumentTable documents={recent} onSelect={onOpenDocument} /></div>
    </Panel></div>
  </>;
}

function DocumentsPanel({ adminStyle, documents, search, onSearch, onDrop, onDragOver, onDragLeave, dragOver, category, onCategoryChange, onBrowse, uploadError, selectedId, onSelect, staffUsers, clientProfiles, onAssign, onDownload, busyIds }: {
  adminStyle: boolean;
  documents: DemoDocument[]; search: string; onSearch: (value: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void; onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void; dragOver: boolean; category: DemoCategory;
  onCategoryChange: (category: DemoCategory) => void; onBrowse: () => void;
  uploadError: string;
  selectedId: string; onSelect: (document: DemoDocument) => void; busyIds: string[];
  staffUsers: DemoRoleAssignment[];
  clientProfiles: DemoRoleAssignment[];
  onAssign: (documentId: string, staffId: string) => void;
  onDownload: (document: DemoDocument) => void;
}) {
  const uploadPanel = <Panel className={`overflow-hidden p-3 sm:p-6 ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/80 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)] backdrop-blur' : ''}`}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5 sm:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cyan/10 text-cyan"><FileUp className="size-5" /></span>
            <div className="min-w-0">
              <h2 className="font-semibold">Add documents</h2>
              <p className="mt-0.5 text-xs text-muted">Choose files or drag them into the upload area.</p>
            </div>
          </div>
          <Badge className="hidden sm:inline-flex" tone="neutral">Up to {MAX_DEMO_FILE_BYTES / 1024 / 1024} MB per file</Badge>
        </div>

        <div
          className={`rounded-2xl border-2 border-dashed px-3 py-4 text-center transition-colors sm:px-6 sm:py-8 ${dragOver ? 'border-cyan bg-cyan/10 ring-4 ring-cyan/10' : 'border-line/25 bg-bg/35 hover:border-cyan/50 hover:bg-cyan/[.025]'}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragLeave();
          }}
        >
          <span className={`mx-auto grid size-10 place-items-center rounded-2xl transition-colors sm:size-12 ${dragOver ? 'bg-cyan text-white' : 'bg-cyan/10 text-cyan'}`}>
            <FileUp className="size-5" />
          </span>
          <h3 className="mt-2 text-sm font-semibold">{dragOver ? 'Drop files to add them' : 'Choose files from your device'}</h3>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted">
            PDFs, invoices, statements, receipts, payslips, photos, scans, and screenshots.
          </p>
          <div className="mt-3 hidden flex-wrap justify-center gap-1.5 sm:flex" aria-label="Supported file formats">
            {['PDF · up to 200 pages', 'JPG', 'PNG', 'WebP', 'HEIC', 'TIFF', 'BMP'].map((format) => (
              <span key={format} className="rounded-full border hairline bg-bg2/70 px-2.5 py-1 text-[10px] font-medium text-muted">{format}</span>
            ))}
          </div>
          <Button className="mt-3 min-h-11 w-full px-5 sm:mt-4 sm:w-auto" icon={<Upload className="size-4" />} onClick={onBrowse}>Browse files</Button>
          <p className="mt-2 text-[10px] text-muted">Select multiple files · up to {MAX_DEMO_FILE_BYTES / 1024 / 1024} MB each</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.8fr)] sm:items-end">
          <label className="block text-xs font-medium">
            Document section
            <select value={category} onChange={(event) => onCategoryChange(event.target.value as DemoCategory)} className="mt-1.5 block h-11 w-full rounded-xl border hairline bg-bg/60 px-3 text-base sm:text-sm">
              {DEMO_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <p className="hidden text-[10px] leading-4 text-muted sm:block sm:pb-1">
            Files remain in this browser demo. PDF text and supported image/scanned-PDF OCR are processed locally; review every extracted value. No cloud AI or server upload is used.
          </p>
        </div>
        <details className="mt-3 rounded-xl bg-bg/40 p-3 text-[10px] text-muted sm:hidden">
          <summary className="cursor-pointer font-medium">Supported formats and privacy</summary>
          <p className="mt-2 leading-4">PDF · JPG · PNG · WebP · HEIC · TIFF · BMP. Files stay in this browser demo. PDF text and supported image/scanned-PDF OCR are processed locally; review every extracted value. Nothing is sent to a server.</p>
        </details>
        {uploadError && <p role="alert" className="mt-3 rounded-xl border border-bad/20 bg-bad/5 px-3 py-2 text-xs text-bad">{uploadError}</p>}
      </div>
    </Panel>;
  const registerPanel = <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b hairline px-3 py-3 sm:gap-3 sm:px-5 sm:py-4"><div className="min-w-0 flex-1"><h2 className="font-semibold">Document register</h2><p className="mt-1 text-[11px] text-muted sm:text-xs">{documents.length} document{documents.length === 1 ? '' : 's'} in this session</p></div>
        <label className="relative min-w-0 basis-full sm:flex-1 sm:basis-48 sm:max-w-64"><span className="sr-only">Search files or category</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search files or category" className="h-11 w-full rounded-lg border hairline bg-bg/60 pl-9 pr-3 text-base sm:h-9 sm:text-xs" /></label>
        <Badge className="hidden sm:inline-flex"><Filter className="size-3" /> All clients</Badge>
      </div>
      <DocumentTable documents={documents} selectedId={selectedId} busyIds={busyIds} onSelect={onSelect} />
      {documents.length === 0 && <p className="p-8 text-center text-sm text-muted">No matching documents. Add files above or clear your search.</p>}
    </Panel>;
  return <div className="flex flex-col gap-5">
    <div className="order-2 md:order-1">
      <div className="md:hidden">
        <details className="overflow-hidden rounded-2xl border hairline bg-white/80">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan/10 text-cyan"><FileUp className="size-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">Add documents</span><span className="block truncate text-[10px] text-muted">Upload files to this browser register</span></span></span>
            <span className="shrink-0 rounded-lg bg-cyan/10 px-3 py-2 text-[11px] font-semibold text-cyan">Add files</span>
          </summary>
          <div className="border-t hairline p-3">{uploadPanel}</div>
        </details>
      </div>
      <div className="hidden md:block">{uploadPanel}</div>
    </div>
    <div className="order-1 md:order-2">{registerPanel}</div>
    {adminStyle && <>
      <div className="md:hidden order-3">
        <details className="overflow-hidden rounded-2xl border hairline bg-white/80">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-xs font-semibold [&::-webkit-details-marker]:hidden"><span>Client document activity</span><span className="text-[10px] font-normal text-muted">{documents.filter((document) => Boolean(document.clientId)).length} uploads</span></summary>
          <div className="border-t hairline"><AdminDocumentQueue documents={documents} staffUsers={staffUsers} clientProfiles={clientProfiles} onAssign={onAssign} onDownload={onDownload} onReview={onSelect} /></div>
        </details>
      </div>
      <div className="hidden md:block order-3"><AdminDocumentQueue documents={documents} staffUsers={staffUsers} clientProfiles={clientProfiles} onAssign={onAssign} onDownload={onDownload} onReview={onSelect} /></div>
    </>}
  </div>;
}

function AdminDocumentQueue({ documents, staffUsers, clientProfiles, onAssign, onDownload, onReview }: {
  documents: DemoDocument[];
  staffUsers: DemoRoleAssignment[];
  clientProfiles: DemoRoleAssignment[];
  onAssign: (documentId: string, staffId: string) => void;
  onDownload: (document: DemoDocument) => void;
  onReview: (document: DemoDocument) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | DemoDocument['status']>('all');
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const clientDocuments = documents.filter((document) => Boolean(document.clientId));
  const filtered = clientDocuments.filter((document) => statusFilter === 'all' || document.status === statusFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => setPage(0), [statusFilter, clientDocuments.length]);
  return <Panel className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-4 py-4 sm:px-5">
      <div><h2 className="font-semibold">Client document activity</h2><p className="mt-1 text-xs text-muted">New client uploads sync from this browser’s shared IndexedDB.</p></div>
      <label className="text-xs font-medium">Status
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="ml-2 h-10 rounded-xl border hairline bg-bg/50 px-3 text-sm">
          <option value="all">All statuses</option>
          <option value="processing">Processing</option>
          <option value="review">Pending review</option>
          <option value="approved">Completed</option>
          <option value="action_required">Action required</option>
          <option value="needs_information">Needs information</option>
          <option value="password_required">Password needed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
    </div>
    {pageRows.length ? <div className="divide-y divide-line/10">
      {pageRows.map((document) => {
        const clientProfile = clientProfiles.find((profile) => profile.email === document.clientId);
        const client = clientProfile
          ? { name: clientProfile.name, email: clientProfile.email }
          : demoClientIdentityById(document.clientId);
        const staffName = staffUsers.find((staff) => staff.email === document.assignedStaffId || staff.id === document.assignedStaffId || staff.name === document.assignedStaffId)?.name
          ?? document.assignedStaffId;
        return <article key={document.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b hairline p-3 last:border-0 sm:p-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(180px,.8fr)_auto] xl:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={document.name}>{document.name}</p>
            <p className="mt-1 truncate text-[11px] text-muted">{client?.name ?? 'Unassigned client'} · {client?.email ?? document.clientId ?? 'No client account'}</p>
            <p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{new Date(document.createdAt).toLocaleString()} · {document.mime || document.file?.type || 'File type unknown'} · {formatBytes(document.sizeBytes)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 xl:flex-row xl:items-center">
            <Badge className="hidden sm:inline-flex" tone="neutral">{labelFor(document.category)}</Badge>
            <DocStatus status={document.status} />
          </div>
          <label className="col-span-2 min-w-0 text-[11px] font-medium xl:col-span-1 xl:text-xs">Assigned staff
            <select value={document.assignedStaffId ?? ''} onChange={(event) => onAssign(document.id, event.target.value)} className="mt-1 h-10 w-full rounded-xl border hairline bg-bg/50 px-2 text-xs sm:px-3 sm:text-sm">
              <option value="">Unassigned</option>
              {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
            <span className="sr-only">Current assignee: {staffName ?? 'Unassigned'}</span>
          </label>
          <div className="col-span-2 flex gap-2 xl:col-span-1 xl:justify-end">
            <Button size="sm" className="min-w-0 flex-1 xl:flex-none" onClick={() => onReview(document)}>Preview / review</Button>
            <Button size="sm" className="min-w-0 flex-1 xl:flex-none" variant="outline" disabled={!document.file} onClick={() => onDownload(document)}>Download</Button>
          </div>
        </article>;
      })}
    </div> : <EmptyPanel text={clientDocuments.length ? 'No client uploads match this status.' : 'Client uploads will appear here when the client and admin workspaces share browser storage.'} />}
    <div className="flex items-center justify-between gap-3 border-t hairline px-4 py-3 text-xs text-muted sm:px-5">
      <span>{filtered.length} document{filtered.length === 1 ? '' : 's'} · Page {page + 1} of {pageCount}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
      </div>
    </div>
  </Panel>;
}

function DocumentTable({ documents, selectedId, busyIds = [], onSelect }: { documents: DemoDocument[]; selectedId?: string; busyIds?: string[]; onSelect?: (document: DemoDocument) => void }) {
  return <>
  <div className="md:hidden">
    {documents.length > 0 && <ul className="divide-y divide-line/10">{documents.map((item) => <li key={item.id}>
      <button type="button" onClick={() => onSelect?.(item)} className={`grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left transition-colors active:bg-ink/5 ${selectedId === item.id ? 'bg-cyan/[.04]' : ''}`}>
        <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mt-1 block truncate text-[10px] text-muted">{labelFor(item.category)} · {formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString()}</span></span>
        <span className="row-span-2 flex max-w-[108px] flex-col items-end gap-1"><DocStatus status={busyIds.includes(item.id) ? 'processing' : item.status} /><span className="text-[10px] text-muted">{item.confidence > 0 ? `${Math.round(item.confidence * 100)}% confidence` : 'Review details'}</span></span>
        <span className="min-w-0 truncate text-[9px] text-muted">{item.id}{item.pageCount ? ` · ${item.pageCount} pages` : ''}</span>
      </button>
    </li>)}</ul>}
  </div>
  <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-bg/40 text-muted"><tr><th className="px-5 py-3 font-medium">Document</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Confidence</th><th className="px-4 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr></thead>
    <tbody className="divide-y divide-line/10">{documents.map((item) => <tr key={item.id} className={`hover:bg-ink/[.025] ${selectedId === item.id ? 'bg-cyan/[.04]' : ''}`}>
      <td className="px-5 py-3.5"><button type="button" className="flex items-center gap-2.5 text-left" onClick={() => onSelect?.(item)}><span className="grid size-8 place-items-center rounded-lg bg-violet/10 text-violet"><FileText className="size-4" /></span><span><span className="block max-w-52 truncate font-medium">{item.name}</span><span className="mt-0.5 block text-[10px] text-muted">{formatBytes(item.sizeBytes)} · {item.id}</span></span></button></td>
      <td className="px-4 py-3.5 text-muted">{labelFor(item.category)}</td><td className="px-4 py-3.5 text-muted">{new Date(item.createdAt).toLocaleDateString()}{item.pageCount ? ` · ${item.pageCount} pg` : ''}</td>
      <td className="px-4 py-3.5">{item.confidence ? `${Math.round(item.confidence * 100)}%` : '—'}</td>
      <td className="px-4 py-3.5"><span className="flex flex-col items-start gap-1"><DocStatus status={busyIds.includes(item.id) ? 'processing' : item.status} />{busyIds.includes(item.id) && item.processingProgress ? <span className="text-[10px] text-muted">{item.processingProgress}%</span> : null}</span></td>
      <td className="px-5 py-3.5 text-right"><button type="button" onClick={() => onSelect?.(item)} className="inline-flex items-center gap-1 text-cyan">Review <ChevronRight className="size-3.5" /></button></td>
    </tr>)}</tbody>
  </table></div>
  </>;
}

function ClientUploadsPanel({
  documents, adminStyle, staffUsers, clientProfiles, followUpTasks, loading, error, onOpenReview, onAssign,
}: {
  documents: DemoDocument[];
  adminStyle: boolean;
  staffUsers: DemoRoleAssignment[];
  clientProfiles: DemoRoleAssignment[];
  followUpTasks: DemoFollowUpTask[];
  loading: boolean;
  error: string;
  onOpenReview: (document: DemoDocument) => void;
  onAssign: (documentId: string, staffId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [page, setPage] = useState(0);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterCloseRef = useRef<HTMLButtonElement>(null);
  const filterWasOpen = useRef(false);
  const pageSize = 10;
  const query = searchParams.get('uploadsQ') ?? '';
  const requestedClientId = searchParams.get('uploadsClient') ?? 'all';
  const requestedSection = searchParams.get('uploadsCategory') ?? 'all';
  const requestedStatus = searchParams.get('uploadsStatus') ?? 'all';
  const sectionId: ClientDocumentSectionId | 'all' = CLIENT_DOCUMENT_SECTIONS.some((section) => section.id === requestedSection)
    ? requestedSection as ClientDocumentSectionId
    : 'all';
  const statusFilter: UploadStatusFilter = ['all', 'pending', 'processing', 'review', 'attention', 'completed'].includes(requestedStatus)
    ? requestedStatus as UploadStatusFilter
    : 'all';
  const updateUploadParam = (key: string, value: string, replace = false) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace });
  };
  const clearFilters = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      ['uploadsQ', 'uploadsClient', 'uploadsCategory', 'uploadsStatus'].forEach((key) => next.delete(key));
      return next;
    });
    setPage(0);
    setFilterSheetOpen(false);
  };
  const hasActiveFilters = Boolean(query || requestedClientId !== 'all' || sectionId !== 'all' || statusFilter !== 'all');
  const clients = new Map<string, { name: string; email: string }>();
  documents.forEach((document) => {
    if (!document.clientId) return;
    const identity = demoClientIdentityById(document.clientId)
      ?? clientProfiles.find((profile) => profile.email === document.clientId);
    clients.set(document.clientId, identity
      ? { name: identity.name, email: identity.email }
      : { name: document.clientId, email: document.clientId });
  });
  if (adminStyle) {
    [...DEMO_CLIENTS.map((client) => ({ name: client.name, email: client.email })), ...clientProfiles.map((profile) => ({ name: profile.name, email: profile.email }))]
      .forEach((client) => clients.set(client.email, client));
  }
  const clientRows = [...clients.entries()]
    .map(([clientId, client]) => {
      const clientDocuments = documents.filter((document) => document.clientId === clientId);
      const openTasks = followUpTasks.filter((task) =>
        task.clientId === clientId
        && task.status === 'open'
        && (!task.documentId || clientDocuments.some((document) => document.id === task.documentId)),
      );
      return {
        clientId,
        ...client,
        documents: clientDocuments,
        openTasks,
        waiting: clientDocuments.filter((item) => item.status !== 'approved').length,
        completed: clientDocuments.filter((item) => item.status === 'approved').length,
        latestUpload: clientDocuments.reduce<DemoDocument | undefined>((latest, item) =>
          !latest || Date.parse(item.createdAt) > Date.parse(latest.createdAt) ? item : latest, undefined),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedClientId = clientRows.some((client) => client.clientId === requestedClientId) ? requestedClientId : 'all';
  const selectedClient = clientRows.find((client) => client.clientId === selectedClientId);
  const trackedDocuments = selectedClientId === 'all' ? documents : selectedClient?.documents ?? [];
  const processingCount = trackedDocuments.filter((item) => item.status === 'processing').length;
  const reviewCount = trackedDocuments.filter((item) => ['review', 'needs_information', 'action_required', 'password_required', 'rejected'].includes(item.status)).length;
  const completedCount = trackedDocuments.filter((item) => item.status === 'approved').length;
  const bySection = (section: ClientDocumentSectionId | 'all') => section === 'all'
    ? trackedDocuments
    : documentsInClientSection(trackedDocuments, section);
  const visibleDocuments = bySection(sectionId).filter((item) => {
    const client = item.clientId
      ? demoClientIdentityById(item.clientId) ?? clientProfiles.find((profile) => profile.email === item.clientId)
      : undefined;
    const matchesQuery = `${item.name} ${item.clientId ?? ''} ${client?.name ?? ''} ${client?.email ?? ''} ${labelFor(item.category)} ${item.fields.counterparty} ${item.fields.reference}`
      .toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' && ['processing', 'review', 'needs_information', 'action_required', 'password_required', 'rejected'].includes(item.status))
      || (statusFilter === 'processing' && item.status === 'processing')
      || (statusFilter === 'review' && item.status === 'review')
      || (statusFilter === 'attention' && ['needs_information', 'action_required', 'password_required', 'rejected'].includes(item.status))
      || (statusFilter === 'completed' && item.status === 'approved');
    return matchesQuery && matchesStatus;
  });
  const priority = (status: DemoDocument['status']) => status === 'rejected'
    ? 0
    : ['needs_information', 'action_required', 'password_required'].includes(status)
      ? 1
      : status === 'processing'
        ? 2
        : status === 'review'
          ? 3
          : 4;
  const sortedDocuments = [...visibleDocuments].sort((left, right) =>
    priority(left.status) - priority(right.status) || Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
  const pageCount = Math.max(1, Math.ceil(sortedDocuments.length / pageSize));
  const pageRows = sortedDocuments.slice(page * pageSize, (page + 1) * pageSize);
  const sectionCounts = [{ id: 'all' as const, label: 'All uploads', count: trackedDocuments.length },
    ...CLIENT_DOCUMENT_SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      count: documentsInClientSection(trackedDocuments, section.id).length,
    }))];
  const panelClass = adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : '';

  useEffect(() => {
    setPage(0);
  }, [query, selectedClientId, sectionId, statusFilter]);

  useEffect(() => {
    if (!filterSheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterSheetOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [filterSheetOpen]);

  useEffect(() => {
    if (filterSheetOpen) {
      filterWasOpen.current = true;
      filterCloseRef.current?.focus();
    } else if (filterWasOpen.current) {
      filterWasOpen.current = false;
      filterTriggerRef.current?.focus();
    }
  }, [filterSheetOpen]);

  if (error) {
    return <Panel className={panelClass}><ErrorState message={`Shared browser storage could not be loaded: ${error}`} /></Panel>;
  }

  if (loading) {
    return <div className="mx-auto w-full max-w-[1280px] space-y-4" aria-label="Loading client uploads">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>;
  }

  return <div className="mx-auto w-full max-w-[1280px] space-y-4 sm:space-y-5">
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <UploadMetric adminStyle={adminStyle} title="Documents received" value={trackedDocuments.length} caption="All client files" icon={FileText} active={statusFilter === 'all'} onClick={() => updateUploadParam('uploadsStatus', 'all')} />
      <UploadMetric adminStyle={adminStyle} title="Awaiting review" value={reviewCount + processingCount} caption="Needs a next step" icon={ClipboardCheck} active={statusFilter === 'pending'} onClick={() => updateUploadParam('uploadsStatus', 'pending')} />
      <UploadMetric adminStyle={adminStyle} title="Completed" value={completedCount} caption="Approved documents" icon={CheckCircle2} active={statusFilter === 'completed'} onClick={() => updateUploadParam('uploadsStatus', 'completed')} />
    </div>
    <Panel className={`overflow-hidden ${panelClass}`}>
      <div className="flex flex-col items-stretch justify-between gap-3 border-b hairline px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
        <div><h2 className="text-base font-semibold">Track individual clients</h2><p className="mt-1 text-sm text-muted">Select a client to see their uploads, progress, and open follow-ups.</p></div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink/80">Client
          <select aria-label="Select client to track" value={selectedClientId} onChange={(event) => updateUploadParam('uploadsClient', event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border hairline bg-bg2 px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan sm:max-w-[min(60vw,280px)]">
            <option value="all">All clients</option>
            {clientRows.map((client) => <option key={client.clientId} value={client.clientId}>{client.name} · {client.email}</option>)}
          </select>
        </label>
      </div>
      <div className="hidden gap-2 p-3 md:grid md:grid-cols-2 md:p-4 xl:grid-cols-3" aria-label="Client accounts">
        {clientRows.map((client) => <button key={client.clientId} type="button" aria-pressed={selectedClientId === client.clientId} onClick={() => updateUploadParam('uploadsClient', selectedClientId === client.clientId ? 'all' : client.clientId)} className={`min-h-[88px] min-w-[230px] snap-start rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan sm:min-w-0 ${selectedClientId === client.clientId ? 'border-cyan bg-cyan/5 ring-1 ring-cyan/25' : 'border-line/20 bg-bg2 hover:bg-ink/5'}`}>
          <span className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-cyan" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{client.name}</span><span className="mt-0.5 block truncate text-xs text-muted">{client.email}</span></span>{selectedClientId === client.clientId ? <CheckCircle2 aria-label="Selected client" className="size-4 shrink-0 text-cyan" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}</span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"><span>{client.documents.length} files</span><span>{client.waiting} open</span><span>{client.openTasks.length} follow-ups</span></span>
        </button>)}
        {!clientRows.length && <p className="col-span-full px-3 py-5 text-center text-sm text-muted">Client records will appear here when uploads or client profiles are available to this account.</p>}
      </div>
    </Panel>
    {selectedClient && <Panel className={`overflow-hidden ${panelClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b hairline px-4 py-4 sm:px-5">
        <div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Client tracking</p><h2 className="mt-1 truncate font-semibold">{selectedClient.name}</h2><p className="mt-1 truncate text-xs text-muted">{selectedClient.email}</p></div>
        <Badge tone={selectedClient.waiting ? 'warn' : 'ok'}>{selectedClient.waiting ? `${selectedClient.waiting} open items` : 'Up to date'}</Badge>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.8fr)] sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CLIENT_DOCUMENT_SECTIONS.map((section) => <button key={section.id} type="button" onClick={() => updateUploadParam('uploadsCategory', section.id)} className={`rounded-xl border p-3 text-left hover:bg-ink/5 ${sectionId === section.id ? 'border-cyan/30 bg-cyan/10' : 'border-line/15'}`}>
            <span className="block truncate text-[10px] text-muted">{section.label}</span>
            <span className="mt-1 block text-lg font-semibold">{documentsInClientSection(selectedClient.documents, section.id).length}</span>
          </button>)}
        </div>
        <div className="rounded-xl border border-line/15 bg-bg2/70 p-3">
          <h3 className="text-xs font-semibold">Client follow-up</h3>
          {selectedClient.openTasks.length ? <ul className="mt-2 space-y-2">{selectedClient.openTasks.slice(0, 4).map((task) => <li key={task.id} className="flex items-start justify-between gap-2 text-[11px]"><span className="min-w-0">{task.title}<span className="mt-0.5 block text-[10px] text-muted">{task.owner} · due {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString()}</span></span>{task.documentId && <button type="button" onClick={() => { const document = selectedClient.documents.find((item) => item.id === task.documentId); if (document) onOpenReview(document); }} className="shrink-0 text-blue-700 hover:underline">Open</button>}</li>)}</ul>
            : <p className="mt-2 text-[11px] text-muted">No open follow-up tasks.</p>}
          {selectedClient.latestUpload && <p className="mt-3 border-t border-line/10 pt-2 text-[10px] text-muted">Latest upload: {selectedClient.latestUpload.name} · {new Date(selectedClient.latestUpload.createdAt).toLocaleString()}</p>}
        </div>
      </div>
    </Panel>}
    <Panel className={`overflow-hidden ${panelClass}`}>
      <div className="border-b hairline px-4 py-3.5 sm:px-5">
        <h2 className="text-base font-semibold">Client uploads</h2><p className="mt-1 text-sm text-muted">One place to triage, assign, and review client-submitted documents.</p>
      </div>
      <div className="sticky top-[60px] z-20 border-b hairline bg-bg2/95 px-3 py-3 backdrop-blur sm:px-4 lg:static lg:px-5">
        <div className="flex items-center gap-2 lg:gap-3">
          <label className="relative block min-w-0 flex-1 lg:max-w-64">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input aria-label="Search client uploads" value={query} onChange={(event) => updateUploadParam('uploadsQ', event.target.value, true)} placeholder="Client, file, reference" className="h-11 ps-9 text-sm placeholder:text-muted focus-visible:ring-2 focus-visible:ring-cyan/30" />
          </label>
          <label className="sr-only" htmlFor="client-upload-status-filter">Filter uploads by status</label>
          <select id="client-upload-status-filter" value={statusFilter} onChange={(event) => updateUploadParam('uploadsStatus', event.target.value)} className="hidden h-11 min-w-40 rounded-xl border hairline bg-bg2 px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan lg:block">
            <option value="all">All statuses</option><option value="pending">Awaiting next step</option><option value="processing">Processing</option><option value="review">Ready for review</option><option value="attention">Needs attention</option><option value="completed">Completed</option>
          </select>
          <button ref={filterTriggerRef} type="button" onClick={() => setFilterSheetOpen(true)} aria-label={`Open upload filters${hasActiveFilters ? ', filters active' : ''}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border hairline bg-bg2 px-3 text-sm font-medium text-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan lg:hidden">
            <Filter className="size-4" />Filters{hasActiveFilters ? <span className="size-2 rounded-full bg-cyan" /> : null}
          </button>
          <div className="hidden min-w-0 flex-1 items-center gap-2 overflow-x-auto lg:flex" role="tablist" aria-label="Filter uploads by client section">
            <UploadCategoryChips sections={sectionCounts} selected={sectionId} onSelect={(value) => updateUploadParam('uploadsCategory', value)} />
          </div>
          {hasActiveFilters && <button type="button" onClick={clearFilters} className="hidden min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-cyan hover:bg-cyan/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan lg:inline-flex lg:items-center">Clear filters</button>}
        </div>
        {filterSheetOpen && createPortal(<div className="fixed inset-0 z-[80] flex items-end bg-slate-950/40 lg:hidden" role="presentation" onClick={() => setFilterSheetOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="upload-filter-heading" className="w-full rounded-t-2xl bg-bg2 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] text-ink shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 id="upload-filter-heading" className="text-base font-semibold">Filters</h3><button ref={filterCloseRef} type="button" aria-label="Close filters" onClick={() => setFilterSheetOpen(false)} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-cyan"><X className="size-5" /></button></div>
            <label className="mt-3 block text-sm font-medium text-ink/80" htmlFor="mobile-upload-status-filter">Status</label>
            <select id="mobile-upload-status-filter" value={statusFilter} onChange={(event) => updateUploadParam('uploadsStatus', event.target.value)} className="mt-1 h-11 w-full rounded-xl border hairline bg-bg2 px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-cyan">
              <option value="all">All statuses</option><option value="pending">Awaiting next step</option><option value="processing">Processing</option><option value="review">Ready for review</option><option value="attention">Needs attention</option><option value="completed">Completed</option>
            </select>
            <p className="mt-4 text-sm font-medium text-ink/80">Category</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Filter uploads by client section">
              <UploadCategoryChips sections={sectionCounts} selected={sectionId} onSelect={(value) => updateUploadParam('uploadsCategory', value)} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="min-h-11 flex-1" variant="primary" onClick={() => setFilterSheetOpen(false)}>Show {visibleDocuments.length} uploads</Button>
              {hasActiveFilters && <Button className="min-h-11" onClick={clearFilters}>Clear</Button>}
            </div>
          </section>
        </div>, document.body)}
      </div>
      {pageRows.length ? <>
        <ul className="grid gap-2 p-3 md:hidden">
        {pageRows.map((item) => {
          const client = item.clientId
            ? demoClientIdentityById(item.clientId) ?? clientProfiles.find((profile) => profile.email === item.clientId)
            : undefined;
          const assignedStaff = staffUsers.find((staff) =>
            staff.id === item.assignedStaffId || staff.name === item.assignedStaffId || staff.loginName === item.assignedStaffId,
          );
          const assignmentValue = assignedStaff?.id ?? '';
          return <li key={item.id} className="min-w-0 rounded-xl border hairline bg-bg2 p-3 shadow-sm">
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-cyan" />
              <p className="min-w-0 flex-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-ink" title={item.name}>{item.name}</p>
            </div>
            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
              <UploadStatus document={item} />
              <UploadMoreActions item={item} onOpenReview={onOpenReview} onTrackClient={(clientId) => updateUploadParam('uploadsClient', clientId)} />
            </div>
            <p className="mt-2 truncate text-sm font-medium text-ink">{client?.name ?? 'Client not identified'} <span className="font-normal text-muted">· {client?.email ?? item.clientId ?? 'No client account'}</span></p>
            <p className="mt-1 text-xs leading-5 text-muted">{labelFor(item.category)} · {(item.name.split('.').pop() ?? 'file').toUpperCase()} · {new Date(item.createdAt).toLocaleDateString()} · {formatBytes(item.sizeBytes)}</p>
            {item.fields.reference && <p className="mt-1 text-xs text-muted">Ref: <span className="font-medium text-ink">{item.fields.reference}</span></p>}
            {(item.fields.counterparty || item.fields.grossAmount) && <p className="mt-1 truncate text-xs text-muted">{[item.fields.counterparty, item.fields.grossAmount && `${item.fields.grossAmount} ${item.currency ?? 'EUR'}`].filter(Boolean).join(' · ')}</p>}
            {item.clientNote && <p className="mt-1 line-clamp-2 text-xs text-muted"><span className="font-medium">Client note:</span> {item.clientNote}</p>}
            {item.clientRequest?.status === 'pending_review' && <p className="mt-1 text-xs font-medium text-violet-700">Client replied — follow-up needed</p>}
            <div className="mt-3 grid min-w-0 gap-2 border-t hairline pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan/10 text-xs font-semibold text-cyan">{(assignedStaff?.name ?? 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                {adminStyle ? <label className="sr-only" htmlFor={`upload-assignee-${item.id}`}>Assigned staff for {item.name}</label> : <span className="min-w-0 flex-1 truncate text-sm text-ink/80">{assignedStaff?.name ?? 'Team queue'}</span>}
                {adminStyle ? <select id={`upload-assignee-${item.id}`} aria-label={`Assign ${item.name} to staff`} value={assignmentValue} onChange={(event) => onAssign(item.id, event.target.value)} className="h-11 min-w-0 flex-1 rounded-lg border hairline bg-bg2 px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-cyan">
                  <option value="">Unassigned</option>{staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                </select> : null}
              </div>
              <Button className="min-h-11 w-full px-3" variant={adminStyle ? 'primary' : 'outline'} onClick={() => onOpenReview(item)}>
                {item.status === 'approved' ? 'View details' : item.status === 'processing' ? 'View progress' : 'Process document'}
              </Button>
            </div>
          </li>;
        })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] table-fixed text-left text-sm lg:min-w-[980px]">
            <colgroup><col className="w-[30%]" /><col className="hidden w-[15%] lg:table-column" /><col className="w-[16%]" /><col className="w-[19%]" /><col className="w-[20%]" /></colgroup>
            <thead className="sticky top-[72px] z-10 bg-bg/95 text-xs font-semibold uppercase tracking-wide text-muted shadow-[0_1px_0_rgba(15,23,42,.08)]">
              <tr><th scope="col" className="px-4 py-3">File</th><th scope="col" className="hidden px-3 py-3 lg:table-cell">Category</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Assigned to</th><th scope="col" className="px-3 py-3 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-line/20">
              {pageRows.map((item) => {
                const client = item.clientId ? demoClientIdentityById(item.clientId) ?? clientProfiles.find((profile) => profile.email === item.clientId) : undefined;
                const assignedStaff = staffUsers.find((staff) => staff.id === item.assignedStaffId || staff.name === item.assignedStaffId || staff.loginName === item.assignedStaffId);
                return <tr key={item.id} className="transition-colors hover:bg-ink/[.035] focus-within:bg-cyan/[.035]">
                  <td className="px-4 py-3.5">
                    <p className="truncate text-sm font-semibold text-ink" title={item.name}>{item.name}</p>
                    <p className="mt-0.5 truncate text-sm text-ink/80">{client?.name ?? 'Client not identified'} · {client?.email ?? item.clientId ?? 'No client account'}</p>
                    <p className="mt-1 truncate text-xs text-muted">{(item.name.split('.').pop() ?? 'file').toUpperCase()} · {new Date(item.createdAt).toLocaleDateString()} · {formatBytes(item.sizeBytes)}{item.fields.reference ? ` · Ref ${item.fields.reference}` : ''}</p>
                  </td>
                  <td className="hidden px-3 py-3.5 text-sm text-ink/80 lg:table-cell">{labelFor(item.category)}</td>
                  <td className="px-3 py-3.5"><UploadStatus document={item} /></td>
                  <td className="px-3 py-3.5">
                    {adminStyle ? <select aria-label={`Assign ${item.name} to staff`} value={assignedStaff?.id ?? ''} onChange={(event) => onAssign(item.id, event.target.value)} className="h-11 w-full min-w-0 rounded-lg border hairline bg-bg2 px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-cyan">
                      <option value="">Unassigned</option>{staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                    </select> : <span className="text-sm text-ink/80">{assignedStaff?.name ?? 'Team queue'}</span>}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button className="min-h-11 px-2" size="sm" variant={adminStyle ? 'primary' : 'outline'} onClick={() => onOpenReview(item)}>{item.status === 'approved' ? 'View details' : item.status === 'processing' ? 'View progress' : 'Process document'}</Button>
                      <UploadMoreActions item={item} onOpenReview={onOpenReview} onTrackClient={(clientId) => updateUploadParam('uploadsClient', clientId)} />
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </> : <div className="px-4 py-8 sm:px-6">
        <EmptyState
          icon={<FileText className="size-6" />}
          title={trackedDocuments.length === 0 ? selectedClient ? 'No uploads for this client yet' : 'No client uploads yet' : 'No matching uploads'}
          body={trackedDocuments.length === 0 ? 'When this client uploads a file, it will appear here with status, assignment, and processing actions.' : 'Change the client, section, status, or search text to find the upload.'}
          action={hasActiveFilters ? <Button className="min-h-11" onClick={clearFilters}>Clear filters</Button> : undefined}
        />
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline px-4 py-3 text-xs text-muted sm:px-5">
        <span>Showing {sortedDocuments.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, sortedDocuments.length)} of {sortedDocuments.length}{selectedClient ? ` · Tracking ${selectedClient.name}` : ''}</span>
        {pageCount > 1 && <div className="flex gap-2">
          <Button className="min-h-11" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
          <Button className="min-h-11" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
        </div>}
        {pageCount === 1 && <span className="sr-only">Client uploads are stored in this browser demo; this is not a shared server inbox.</span>}
      </div>
    </Panel>
  </div>;
}

type UploadStatusFilter = 'all' | 'pending' | 'processing' | 'review' | 'attention' | 'completed';

function UploadCategoryChips({
  sections, selected, onSelect,
}: {
  sections: { id: ClientDocumentSectionId | 'all'; label: string; count: number }[];
  selected: ClientDocumentSectionId | 'all';
  onSelect: (id: ClientDocumentSectionId | 'all') => void;
}) {
  return <>{sections.map((section) => <button key={section.id} type="button" role="tab" aria-selected={selected === section.id} onClick={() => onSelect(section.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan ${selected === section.id ? 'border-cyan/30 bg-cyan/10 text-cyan' : 'border-line/20 bg-bg2 text-ink/80 hover:bg-ink/5'}`}>
    {section.label}<span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-xs tabular-nums">{section.count}</span>
  </button>)}</>;
}

function UploadMetric({
  adminStyle, title, value, caption, icon: Icon, active, onClick,
}: {
  adminStyle: boolean;
  title: string;
  value: number;
  caption: string;
  icon: typeof FileText;
  active: boolean;
  onClick: () => void;
}) {
  return <button type="button" aria-label={`${title}: ${value}. ${caption}`} aria-pressed={active} onClick={onClick} className={`min-w-0 rounded-xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan sm:p-4 ${active ? 'border-cyan/40 bg-cyan/[.045]' : 'border-line/20 bg-bg2'} ${adminStyle ? 'shadow-[0_12px_30px_-24px_rgba(60,80,140,.5)]' : ''}`}>
    <span className="flex items-center justify-between gap-1"><span className="line-clamp-2 text-xs font-medium leading-4 text-ink/80 sm:text-sm">{title}</span><span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan sm:grid"><Icon className="size-4" /></span></span>
    <span className="mt-1 block text-xl font-semibold leading-6 tabular-nums text-ink sm:text-2xl sm:leading-7">{value}</span>
    <span className="mt-0.5 hidden text-xs text-muted sm:block">{caption}</span>
  </button>;
}

function UploadStatus({ document }: { document: DemoDocument }) {
  const status: Record<DemoDocument['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'cyan'; Icon: typeof CheckCircle2 }> = {
    processing: { label: 'Processing locally', tone: 'cyan', Icon: Clock3 },
    review: { label: 'Awaiting review', tone: 'warn', Icon: FileClock },
    approved: { label: 'Completed', tone: 'ok', Icon: CheckCircle2 },
    password_required: { label: 'Password needed', tone: 'bad', Icon: CircleAlert },
    action_required: { label: 'Action required', tone: 'warn', Icon: CircleAlert },
    needs_information: { label: 'Needs information', tone: 'warn', Icon: CircleAlert },
    rejected: { label: 'Rejected', tone: 'bad', Icon: CircleAlert },
  };
  const value = status[document.status];
  const progress = Math.max(0, Math.min(100, document.processingProgress ?? 0));
  return <span className="inline-flex max-w-full flex-col items-start gap-1">
    <Badge tone={value.tone} className="max-w-full text-xs"><value.Icon className="size-3.5 shrink-0" />{value.label}</Badge>
    {document.status === 'processing' && document.processingProgress != null && <span className="flex w-full min-w-20 items-center gap-1.5">
      <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-cyan/15" role="progressbar" aria-label={`Processing ${document.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="block h-full rounded-full bg-cyan" style={{ width: `${progress}%` }} /></span>
      <span className="text-xs font-medium tabular-nums text-muted">{progress}%</span>
    </span>}
  </span>;
}

function UploadMoreActions({
  item, onOpenReview, onTrackClient,
}: {
  item: DemoDocument;
  onOpenReview: (document: DemoDocument) => void;
  onTrackClient: (clientId: string) => void;
}) {
  return <details className="group relative">
    <summary aria-label={`More actions for ${item.name}`} className="grid size-11 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan [&::-webkit-details-marker]:hidden">
      <MoreHorizontal className="size-5" />
    </summary>
    <div className="absolute end-0 top-full z-30 min-w-44 rounded-xl border hairline bg-bg2 p-1.5 shadow-xl">
      <button type="button" onClick={() => onOpenReview(item)} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-ink/80 hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-cyan">Open document review</button>
      {item.clientId && <button type="button" onClick={() => onTrackClient(item.clientId!)} className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-ink/80 hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-cyan">Track this client</button>}
    </div>
  </details>;
}

function ReviewPanel({ adminStyle, documents, selected, onSelect, onUpdate, onApprove, onRequestCorrection, onReject, onNavigate, onReturnToReview }: {
  adminStyle: boolean;
  documents: DemoDocument[]; selected: DemoDocument | null;
  onSelect: (id: string) => void; onUpdate: (id: string, key: keyof DemoFields, value: string) => void;
  onApprove: (id: string) => void; onRequestCorrection: (id: string, reason?: string) => void; onReject: (id: string) => void; onNavigate: (screen: Screen) => void;
  onReturnToReview: (id: string) => void;
}) {
  const [requestReason, setRequestReason] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const current = selected ?? documents[0] ?? null;
  const issues = current ? validateDemoFields(current.fields) : [];
  const originalUrl = useMemo(() => current?.file ? URL.createObjectURL(current.file) : null, [current?.file]);
  const lowConfidenceCount = documents.filter((item) => item.confidence < 0.8).length;
  const clientResponseCount = documents.filter((item) => item.clientRequest?.status === 'pending_review').length;
  const queueDocuments = documents.filter((item) => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return true;
    const client = demoClientIdentityById(item.clientId);
    return `${item.name} ${item.clientId ?? ''} ${client?.name ?? ''} ${client?.email ?? ''} ${item.clientRequest?.response ?? ''} ${item.note ?? ''}`
      .toLowerCase().includes(query);
  });
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }, [originalUrl]);
  return <div className="space-y-4">
    {adminStyle && <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {[
        { label: 'Waiting for review', value: documents.length, icon: ClipboardCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Client replies', value: clientResponseCount, icon: MessageSquareText, color: 'text-violet-600', bg: 'bg-violet-50' },
        { label: 'Low confidence', value: lowConfidenceCount, icon: CircleAlert, color: 'text-amber-600', bg: 'bg-amber-50' },
      ].map(({ label, value, icon: Icon, color, bg }) => <Panel key={label} className="!rounded-2xl !border-white/80 !bg-white/85 p-2.5 shadow-[0_16px_40px_-30px_rgba(60,80,140,.4)] sm:p-4">
        <div className="flex min-w-0 items-center gap-2.5"><span className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${bg} ${color}`}><Icon className="size-4" /></span><span className="min-w-0"><span className="block text-[10px] leading-4 text-muted sm:text-xs">{label}</span><span className="mt-0.5 block truncate text-base font-semibold text-ink sm:text-lg">{value}</span></span></div>
      </Panel>)}
    </div>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)] xl:gap-5">
    <Panel className={`min-w-0 h-fit overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/85 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}>
      <div className="border-b hairline px-4 py-4"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Review queue</h2><Badge tone={documents.length ? 'warn' : 'ok'}>{documents.length} open</Badge></div><p className="mt-1 text-xs text-muted">Select a document to verify its details.</p><div className="relative mt-3"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search documents or clients" aria-label="Search review queue" className="min-h-11 ps-9" /></div></div>
      {queueDocuments.length ? <ul className="divide-y divide-line/10 xl:max-h-[440px] xl:overflow-y-auto">{queueDocuments.map((item) => {
        const client = demoClientIdentityById(item.clientId);
        return <li key={item.id}>
          <button type="button" onClick={() => onSelect(item.id)} aria-current={current?.id === item.id ? 'true' : undefined} className={`relative grid min-h-[68px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-ink/5 sm:px-4 ${current?.id === item.id ? (adminStyle ? 'bg-blue-50/80' : 'bg-cyan/5') : ''}`}>
            {current?.id === item.id && adminStyle && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-blue-600" />}
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan"><FileText className="size-4" /></span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{item.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted">{client?.name ?? item.clientId ?? 'Client not identified'} · {labelFor(item.category)}</span>
              </span>
            </span>
            <span className="flex min-w-0 flex-col items-end gap-1">
              <DocStatus status={item.status} />
              <span className={`text-[10px] font-semibold tabular-nums ${item.confidence < 0.8 ? 'text-amber-700' : 'text-emerald-700'}`}>{Math.round(item.confidence * 100)}% confidence</span>
            </span>
          </button>
        </li>;
      })}</ul>
        : <div className="p-5 text-center"><CheckCircle2 className="mx-auto size-6 text-green" /><p className="mt-2 text-xs text-muted">No client uploads are waiting for review.</p><Button size="sm" className="mt-3" onClick={() => onNavigate('uploads')}>View client uploads</Button></div>}
      <details className="border-t hairline p-3 sm:p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium [&::-webkit-details-marker]:hidden"><ShieldCheck className="size-4 text-cyan" />Review checklist</summary><p className="mt-2 pl-6 text-[11px] leading-4 text-muted">Verify the original, check extracted values and resolve every validation warning before approval.</p></details>
    </Panel>
    {current ? <Panel className={`min-w-0 overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)] backdrop-blur' : ''}`}>
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b hairline px-4 py-4 sm:px-5 ${adminStyle ? 'bg-white/70' : ''}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="max-w-full truncate font-semibold">{current.name}</h2><Badge tone={current.sample ? 'violet' : 'warn'}>{current.sample ? 'SAMPLE' : 'DEMO DATA'}</Badge></div><p className="mt-1 text-xs text-muted">{labelFor(current.category)} · {formatBytes(current.sizeBytes)} · Confidence {Math.round(current.confidence * 100)}%</p>{current.clientId && <p className="mt-1 text-[11px] text-muted">Uploaded by {demoClientIdentityById(current.clientId)?.name ?? current.clientId} · {demoClientIdentityById(current.clientId)?.email ?? current.clientId} · {new Date(current.createdAt).toLocaleString()}</p>}{current.detectedLanguage && <p className="mt-1 text-[11px] text-muted">Language: {current.detectedLanguage} · {current.pageCount ? `${current.pageCount} pages` : 'Page count not available'}</p>}</div><DocStatus status={current.status} /></div>
      {adminStyle && <div className="grid grid-cols-3 border-b hairline bg-slate-50/70 px-3 py-3 text-center sm:px-5">{[['01', 'Verify document'], ['02', 'Check extracted fields'], ['03', 'Choose an action']].map(([step, label], index) => <div key={step} className={`flex items-center justify-center gap-1.5 text-[9px] sm:gap-2 sm:text-[11px] ${index === 0 ? 'font-semibold text-blue-700' : 'text-slate-500'}`}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[9px] ${index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{step}</span><span className="hidden sm:inline">{label}</span></div>)}</div>}
      <div className="grid gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-4 lg:hidden"><OriginalPreview document={current} url={originalUrl} /></div>
          <div className={`mb-4 rounded-xl border p-3 text-xs leading-5 ${adminStyle ? 'border-amber-200 bg-amber-50/80 text-amber-900' : 'border-warn/20 bg-warn/5 text-muted'}`}><CircleAlert className={`mr-1.5 inline size-4 align-[-3px] ${adminStyle ? 'text-amber-600' : 'text-warn'}`} />{current.sample ? 'Illustrative sample values for this walkthrough.' : current.extractedText ? current.note : current.note ?? 'No extracted text is available.'} Verify every value against the original before approval.</div>
          {current.clientNote && <div className="mb-4 rounded-xl border border-[#e8e2d2] bg-[#faf9f6] p-3 text-xs leading-5 text-[#0f1f3d]"><p className="font-semibold">Client note</p><p className="mt-1">{current.clientNote}</p></div>}
          {current.clientRequest?.response && <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-xs leading-5 text-violet-950"><p className="font-semibold">Client response · pending staff review</p><p className="mt-1">{current.clientRequest.response}</p></div>}
          <section className={`rounded-2xl border p-3 sm:p-4 ${adminStyle ? 'border-slate-200/80 bg-white' : 'hairline bg-bg/20'}`}>
            <div className="mb-3 flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-lg ${adminStyle ? 'bg-blue-50 text-blue-700' : 'bg-cyan/10 text-cyan'}`}><FileText className="size-3.5" /></span><div><h3 className="text-xs font-semibold">Extracted document details</h3><p className="text-[10px] text-muted">Edit any value that does not match the original.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ReviewField label="Document date" value={current.fields.documentDate} onChange={(value) => onUpdate(current.id, 'documentDate', value)} type="date" />
            <ReviewField label="Supplier / customer / bank" value={current.fields.counterparty} onChange={(value) => onUpdate(current.id, 'counterparty', value)} />
            <ReviewField label="Document / transaction reference" value={current.fields.reference} onChange={(value) => onUpdate(current.id, 'reference', value)} />
            <ReviewField label="Description" value={current.fields.description} onChange={(value) => onUpdate(current.id, 'description', value)} />
            <ReviewField label="Net amount (€)" value={current.fields.netAmount} onChange={(value) => onUpdate(current.id, 'netAmount', value)} type="number" />
            <ReviewField label="VAT rate (%)" value={current.fields.vatRate} onChange={(value) => onUpdate(current.id, 'vatRate', value)} type="number" />
            <ReviewField label="VAT amount (€)" value={current.fields.vatAmount} onChange={(value) => onUpdate(current.id, 'vatAmount', value)} type="number" />
            <ReviewField label="Gross amount (€)" value={current.fields.grossAmount} onChange={(value) => onUpdate(current.id, 'grossAmount', value)} type="number" />
            <ReviewField label="SKR03 debit account" value={current.fields.debitAccount} onChange={(value) => onUpdate(current.id, 'debitAccount', value)} />
            <ReviewField label="SKR03 credit account" value={current.fields.creditAccount} onChange={(value) => onUpdate(current.id, 'creditAccount', value)} />
          </div>
          {(issues.length > 0 || current.validationWarnings?.length) && <div role="alert" className="mt-4 rounded-lg border border-warn/20 bg-warn/5 p-3"><p className="text-xs font-semibold text-warn">Validation checks · manual review</p><ul className="mt-1 list-inside list-disc text-[11px] text-muted">{[...issues, ...(current.validationWarnings ?? [])].map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}</ul></div>}
          </section>
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="hidden lg:block"><OriginalPreview document={current} url={originalUrl} /></div>
          <div className={`rounded-xl border p-4 ${adminStyle ? 'border-slate-200/80 bg-white' : 'hairline bg-bg/40'}`}><h3 className="text-xs font-semibold">Automatic checks</h3><CheckLine ok={issues.length === 0} label="Required fields present" /><CheckLine ok={!issues.some((issue) => issue.includes('gross amount'))} label="Net + VAT = gross" /><CheckLine ok={current.status !== 'action_required'} label="No open correction request" /><p className="mt-3 text-[10px] leading-4 text-muted">Real duplicate, balance, date and tax checks require the processing service.</p></div>
          <div className={`space-y-2 rounded-xl border p-3 ${adminStyle ? 'border-slate-200/80 bg-slate-50/80' : 'hairline bg-bg/30'}`}>
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Review decision</p>
          <Button variant="primary" className={`min-h-11 w-full ${adminStyle ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`} icon={<Check className="size-4" />} onClick={() => onApprove(current.id)} disabled={current.status !== 'review'}>Approve reviewed data</Button>
          {current.status !== 'review' && canTransitionDocumentStatus(current.status, 'review') && <Button className="min-h-11 w-full" onClick={() => onReturnToReview(current.id)}>Return to staff review</Button>}
          {current.clientId && <Button className="min-h-11 w-full" variant="danger" onClick={() => onReject(current.id)}>Reject & request replacement</Button>}
          {current.clientId && <label className="block space-y-1.5 text-xs font-medium">Request reason for client<textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} placeholder="Explain which details or a clearer copy are needed" className="min-h-24 w-full rounded-lg border hairline bg-bg/60 px-3 py-2 text-base sm:text-xs" /></label>}
          <Button className="min-h-11 w-full whitespace-normal py-2" icon={<MessageSquareText className="size-4 shrink-0" />} onClick={() => onRequestCorrection(current.id, requestReason)} disabled={!canTransitionDocumentStatus(current.status, current.clientId ? 'needs_information' : 'action_required')}>Request information / clearer file</Button>
          </div>
          {current.reviewHistory && current.reviewHistory.length > 0 && <details className="rounded-lg border hairline p-3"><summary className="cursor-pointer text-xs font-medium">Review history ({current.reviewHistory.length})</summary><ul className="mt-2 space-y-2 text-[10px] text-muted">{current.reviewHistory.map((event, index) => <li key={`${event.at}-${index}`}>{new Date(event.at).toLocaleString()} · {event.action}: {event.details}</li>)}</ul></details>}
          <p className="text-center text-[10px] leading-4 text-muted">Approval only changes this in-memory demo record.</p>
        </aside>
      </div>
    </Panel> : queueDocuments.length > 0 ? <Panel className="grid min-h-32 place-items-center p-4 text-center sm:min-h-64 sm:p-6"><div><ClipboardCheck className="mx-auto size-7 text-muted" /><p className="mt-2 text-sm font-medium">Select a document to review</p><p className="mt-1 text-xs text-muted">Choose a document from the queue.</p></div></Panel> : null}
    </div>
  </div>;
}

function OriginalPreview({ document, url }: { document: DemoDocument; url: string | null }) {
  const fileType = document.file?.type || document.mime || '';
  const extension = document.name.split('.').pop()?.toLowerCase() ?? '';
  const formatLabel = fileType ? fileType.split('/').pop()?.toUpperCase() : extension.toUpperCase();
  const isPdf = fileType === 'application/pdf' || extension === 'pdf';
  const isImage = (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(extension))
    && !['heic', 'heif', 'tif', 'tiff'].includes(extension);
  const isText = ['text/plain', 'text/csv', 'application/csv'].includes(fileType)
    || ['txt', 'csv'].includes(extension);
  return <div className="overflow-hidden rounded-lg border hairline bg-bg/40">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b hairline px-3 py-2"><h3 className="text-xs font-semibold">Original document{formatLabel ? <span className="ml-1.5 font-normal text-muted">· {formatLabel}</span> : null}</h3>{url && <span className="flex items-center gap-3"><a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-cyan">Open in new tab</a><a href={url} download={document.name} className="text-[10px] text-cyan">Download</a></span>}</div>
    {url && isPdf ? <iframe title={`Original PDF: ${document.name}`} src={`${url}#toolbar=1&navpanes=0`} className="h-[28rem] w-full bg-white sm:h-[36rem]" />
      : url && isImage ? <img src={url} alt={`Original document ${document.name}`} className="max-h-72 w-full object-contain" />
        : url && isText && document.extractedText
          ? <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words bg-white p-3 text-[11px] leading-5 text-ink">{document.extractedText}</pre>
          : <p className="p-4 text-[11px] leading-4 text-muted">{document.sample
            ? 'The sample original is not attached; all sample values are fictional.'
            : !url
              ? 'The original file is not available in this browser storage. Ask the client to upload the file again.'
              : document.extractedText
                ? 'This file format cannot be rendered as an image here. Review the locally extracted text below or open/download the original.'
                : 'This file format cannot be previewed in the browser. Open or download the original to inspect it.'}</p>}
    {document.extractedText && (!url || !isText) && <details className="border-t hairline"><summary className="cursor-pointer px-3 py-2 text-[11px] text-cyan">Show locally extracted document text</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t hairline p-3 text-[10px] text-muted">{document.extractedText}</pre></details>}
  </div>;
}

function ReviewField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const id = useId();
  return <Field label={label} htmlFor={id}><Input id={id} type={type} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 text-base sm:h-10 sm:text-sm" /></Field>;
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return <p className="mt-2 flex items-center gap-2 text-[11px]"><span className={ok ? 'text-green' : 'text-warn'}>{ok ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}</span><span className="text-muted">{label}</span></p>;
}

function BankingPanel({ adminStyle, documents, bankLinks, onLink, onUnlink }: {
  adminStyle: boolean;
  documents: DemoDocument[];
  bankLinks: { statementId: string; transactionReference: string; accountingDocumentId: string; createdAt: string }[];
  onLink: (statementId: string, transactionReference: string, accountingDocumentId: string) => void;
  onUnlink: (statementId: string, transactionReference: string, accountingDocumentId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [selectedRecords, setSelectedRecords] = useState<Record<string, string>>({});
  const bankDocuments = documents.filter((item) => item.category === 'bank_statement');
  const accountingDocuments = documents.filter((item) => ['purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(item.category));
  const linkedStatementIds = new Set(bankLinks.map((link) => link.statementId));
  const matchedCount = bankDocuments.filter((item) => linkedStatementIds.has(item.id)).length;
  const visibleDocuments = bankDocuments.filter((item) => {
    const matchesText = `${item.name} ${item.fields.counterparty} ${item.fields.reference}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = matchFilter === 'all' || (matchFilter === 'linked' ? linkedStatementIds.has(item.id) : !linkedStatementIds.has(item.id));
    return matchesText && matchesStatus;
  });
  const panelClass = adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : '';
  return <div className="space-y-5">
    <div className="grid grid-cols-3 gap-2 sm:hidden">
      {[
        ['Statements', bankDocuments.length],
        ['Linked', matchedCount],
        ['To link', Math.max(0, bankDocuments.length - matchedCount)],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border hairline bg-white/80 px-2.5 py-2"><p className="truncate text-[10px] text-muted">{label}</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p></div>)}
    </div>
    <div className="hidden grid-cols-3 gap-3 sm:grid"><Metric adminStyle={adminStyle} title="Statements received" value={bankDocuments.length} icon={FileText} /><Metric adminStyle={adminStyle} title="Linked statements" value={matchedCount} icon={CheckCircle2} /><Metric adminStyle={adminStyle} title="Needs linking" value={Math.max(0, bankDocuments.length - matchedCount)} icon={CircleAlert} /></div>
    <Panel className={`overflow-hidden ${panelClass}`}>
      <div className="grid gap-3 border-b hairline px-3 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:px-5 sm:py-4">
        <div><h2 className="text-sm font-semibold sm:text-base">Statement-to-record links</h2><p className="mt-1 text-[10px] text-muted sm:text-xs">Associate a statement with invoice or receipt records for staff follow-up.</p></div>
        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 sm:flex sm:w-auto">
          <label className="relative min-w-0 sm:w-56"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search bank statements" placeholder="Search statements" className="h-11 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-sm sm:h-10 sm:text-xs" /></label>
          <select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as typeof matchFilter)} aria-label="Filter by record-link status" className="h-11 w-full rounded-xl border hairline bg-bg/50 px-2 text-xs sm:h-10 sm:w-auto"><option value="all">All</option><option value="linked">Linked</option><option value="unlinked">Unlinked</option></select>
        </div>
      </div>
      {bankDocuments.length ? visibleDocuments.length ? <div className="divide-y divide-line/10">{visibleDocuments.map((item) => {
        const links = bankLinks.filter((link) => link.statementId === item.id);
        const transactions = Object.entries(item.extractedDetails ?? {}).filter(([key]) => /^Transaction \d+/i.test(key));
        const renderTransaction = ([transactionReference, description]: [string, string], compact: boolean) => {
            const transactionLinks = links.filter((link) => link.transactionReference === transactionReference);
            const selectionKey = `${item.id}::${transactionReference}`;
            return <div key={`${compact ? 'mobile-' : 'desktop-'}${transactionReference}`} className={`space-y-2 rounded-xl border hairline bg-bg/30 p-3 ${compact ? '' : 'sm:ml-12'}`}><div><p className="text-[11px] font-semibold">{transactionReference}</p><p className="mt-1 break-words text-[11px] text-muted">{description}</p></div>
              {transactionLinks.map((link) => {
                const linkedDocument = documents.find((document) => document.id === link.accountingDocumentId);
                return <div key={link.accountingDocumentId} className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-muted"><Link2 className="mr-1 inline size-3.5 text-blue-600" />{linkedDocument?.name ?? link.accountingDocumentId} · {linkedDocument ? formatAmount(linkedDocument.fields.grossAmount) : 'Record unavailable'}</span><button type="button" onClick={() => onUnlink(item.id, transactionReference, link.accountingDocumentId)} className="min-h-10 shrink-0 px-2 text-rose-700 hover:underline">Remove link</button></div>;
              })}
              <div className="flex flex-col gap-2 sm:flex-row"><select value={selectedRecords[selectionKey] ?? ''} onChange={(event) => setSelectedRecords((current) => ({ ...current, [selectionKey]: event.target.value }))} aria-label={`Choose accounting record for ${transactionReference}`} className="h-11 min-w-0 flex-1 rounded-xl border hairline bg-bg/50 px-3 text-sm sm:h-10 sm:text-xs"><option value="">Choose invoice, receipt, or cash record</option>{accountingDocuments.filter((record) => !transactionLinks.some((link) => link.accountingDocumentId === record.id)).map((record) => <option key={record.id} value={record.id}>{record.name} · {record.fields.counterparty} · {formatAmount(record.fields.grossAmount)}</option>)}</select><Button size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto" disabled={!selectedRecords[selectionKey]} icon={<Link2 className="size-3.5" />} onClick={() => { const id = selectedRecords[selectionKey]; if (!id) return; onLink(item.id, transactionReference, id); setSelectedRecords((current) => ({ ...current, [selectionKey]: '' })); }}>Link record</Button></div>
            </div>;
        };
        return <div key={item.id} className={`space-y-3 border-b hairline px-3 py-3 transition-colors last:border-0 sm:px-5 sm:py-4 ${adminStyle ? 'hover:bg-slate-50/80' : 'hover:bg-ink/[.025]'}`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><div className="flex min-w-0 items-center gap-2 sm:gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-xl sm:size-9 ${adminStyle ? 'bg-blue-50 text-blue-700' : 'bg-cyan/10 text-cyan'}`}><Banknote className="size-4" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.fields.counterparty} · {item.fields.reference}</p><p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{item.name} · {item.fields.documentDate} · {formatAmount(item.fields.grossAmount)}</p></div></div><Badge className="w-fit whitespace-nowrap text-[10px]" tone={links.length ? 'ok' : 'warn'}>{links.length ? `${links.length} linked` : 'Not linked'}</Badge></div>
          {transactions.length > 0 && <div className="md:hidden">
            <details className="rounded-xl border hairline bg-bg/25">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-[11px] font-medium"><span>{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</span><span className="text-[10px] text-muted">Tap to link records</span></summary>
              <div className="space-y-2 border-t hairline p-2">{transactions.map((transaction) => renderTransaction(transaction, true))}</div>
            </details>
          </div>}
          {transactions.length > 0 && <div className="hidden space-y-2 md:block">{transactions.map((transaction) => renderTransaction(transaction, false))}</div>}
          {transactions.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 sm:ml-12">No transaction rows were reliably extracted. Review the original statement; transaction-level linking is unavailable for this file.</p>}
        </div>;
      })}</div> : <EmptyPanel text="No statements match those filters. Clear the search or choose All." /> : <EmptyPanel text="Upload a bank statement to link it to invoice or receipt records." />}
      <p className="border-t hairline px-3 py-3 text-[10px] leading-4 text-muted sm:px-5">A document link is not a bank reconciliation or payment confirmation. No bank feed or credentials are connected.</p>
    </Panel>
  </div>;
}

function CorrespondenceWorkspace({ adminStyle, documents, questions, userName, onOpen, onCreateFollowUp, onReply }: {
  adminStyle: boolean;
  documents: DemoDocument[];
  questions: ClientAssistantQuestion[];
  userName: string;
  onOpen: (id: string) => void;
  onCreateFollowUp: (document: DemoDocument) => void;
  onReply: (id: string, text: string, from: string) => void;
}) {
  const [section, setSection] = useState<'letters' | 'inbox'>('letters');
  const awaitingCount = questions.filter((item) => item.replies.length === 0).length;
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-1 rounded-xl border hairline bg-bg/60 p-1 md:hidden" role="tablist" aria-label="Correspondence sections">
      {([
        ['letters', 'Letters'],
        ['inbox', `Client inbox · ${awaitingCount}`],
      ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`min-h-11 rounded-lg px-2 text-[11px] font-medium transition-colors ${section === id ? 'bg-white text-blue-700 shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>)}
    </div>
    <div className={section === 'letters' ? '' : 'hidden md:block'}>
      <CorrespondencePanel adminStyle={adminStyle} documents={documents} onOpen={onOpen} onCreateFollowUp={onCreateFollowUp} />
    </div>
    <div className={section === 'inbox' ? '' : 'hidden md:block'}>
      <ClientAssistantInbox adminStyle={adminStyle} questions={questions} userName={userName} onReply={onReply} />
    </div>
  </div>;
}

function CorrespondencePanel({ adminStyle, documents, onOpen, onCreateFollowUp }: { adminStyle: boolean; documents: DemoDocument[]; onOpen: (id: string) => void; onCreateFollowUp: (document: DemoDocument) => void }) {
  const [search, setSearch] = useState('');
  const letters = documents.filter((item) => item.category === 'correspondence');
  const visibleLetters = letters.filter((item) => `${item.name} ${item.fields.counterparty} ${item.note ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pendingCount = letters.filter((item) => item.status !== 'approved').length;
  return <Panel className={`overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}><div className="grid gap-3 border-b hairline px-3 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:px-5 sm:py-4"><div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-semibold sm:text-base">Tax-office & client correspondence</h2><p className="mt-1 text-[10px] text-muted sm:text-xs">Deadlines and action owners from the demo register</p></div><Badge className="shrink-0 text-[10px]" tone={pendingCount ? 'warn' : 'ok'}>{pendingCount} open</Badge></div><div className="flex w-full items-center gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-56"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search correspondence" placeholder="Search letters" className="h-11 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-sm sm:h-10 sm:text-xs" /></label><span className="shrink-0 text-[10px] text-muted">{visibleLetters.length} shown</span></div></div>
    {visibleLetters.map((item) => <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b hairline px-3 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-3 sm:px-5 sm:py-4 ${adminStyle ? 'hover:bg-slate-50/80' : ''}`}><div className="flex min-w-0 items-center gap-2 sm:gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet sm:size-9"><MessageSquareText className="size-4" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{item.fields.counterparty || item.name}</p><p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{item.name} · {item.fields.reference || item.note || 'No reference recorded'}</p><p className="mt-0.5 truncate text-[9px] text-muted">{item.note ?? 'No extracted follow-up details'}</p></div></div><Badge className="w-fit whitespace-nowrap text-[10px]" tone={item.status === 'approved' ? 'ok' : 'warn'}>{item.status === 'approved' ? 'Resolved' : item.status === 'needs_information' ? 'Awaiting client' : 'Follow-up'}</Badge><div className="col-span-2 flex gap-2 sm:col-span-1"><Button size="sm" className="min-h-10 min-w-0 flex-1 px-2 sm:min-h-9 sm:flex-none" onClick={() => onCreateFollowUp(item)} icon={<Plus className="size-3.5" />}>Create task</Button><Button size="sm" className="min-h-10 min-w-0 flex-1 px-2 sm:min-h-9 sm:flex-none" onClick={() => onOpen(item.id)}>Open review</Button></div></div>)}
    {letters.length > 0 && visibleLetters.length === 0 && <EmptyPanel text="No letters match this search." />}
    {!letters.length && <EmptyPanel text="No correspondence has been added." />}
  </Panel>;
}

function ClientAssistantInbox({ adminStyle, questions, userName, onReply }: {
  adminStyle: boolean;
  questions: ClientAssistantQuestion[];
  userName: string;
  onReply: (id: string, text: string, from: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'awaiting' | 'replied'>('all');
  const [search, setSearch] = useState('');
  const visibleQuestions = questions.filter((question) => {
    const hasReply = question.replies.length > 0;
    const matchesFilter = filter === 'all' || (filter === 'awaiting' ? !hasReply : hasReply);
    const matchesSearch = `${question.question} ${question.clientId}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });
  return <Panel className={`overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}>
    <div className="space-y-3 border-b hairline px-3 py-3 sm:px-5 sm:py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><MessageSquareText className="size-4 text-cyan" /><h2 className="text-sm font-semibold sm:text-base">Client assistant questions</h2></div><p className="mt-1 text-[10px] text-muted sm:text-xs">Replies appear in their client chat · demo messages stay in this browser.</p></div><Badge className="text-[10px]" tone={questions.some((item) => item.replies.length === 0) ? 'warn' : 'ok'}>{questions.filter((item) => item.replies.length === 0).length} awaiting</Badge></div>
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center"><div className="flex rounded-full bg-bg/70 p-1">{(['all', 'awaiting', 'replied'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-9 rounded-full px-3 text-[10px] font-medium capitalize ${filter === value ? 'bg-white text-blue-700 shadow-sm' : 'text-muted'}`}>{value}</button>)}</div><label className="relative min-w-0 flex-1 sm:max-w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search client questions" placeholder="Search questions" className="h-11 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-sm sm:h-9 sm:text-xs" /></label></div></div>
    {questions.length ? visibleQuestions.length ? <ul className="divide-y divide-line/10">{visibleQuestions.map((item) => {
      const client = DEMO_CLIENTS.find((entry) => entry.email === item.clientId);
      return <li key={item.id} className={`space-y-3 p-3 sm:p-5 ${adminStyle ? 'transition-colors hover:bg-slate-50/60' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="truncate text-xs font-semibold">{client?.company ?? 'Demo client'} <span className="font-normal text-muted">· {item.clientId}</span></p><p className="mt-2 text-sm">{item.question}</p><p className="mt-1 text-[10px] text-muted sm:text-[11px]">{new Date(item.createdAt).toLocaleString()}</p></div>
          <Badge className="shrink-0 text-[10px]" tone={item.replies.length ? 'ok' : 'warn'}>{item.replies.length ? 'Replied' : 'Awaiting reply'}</Badge>
        </div>
        {item.references.length > 0 && <p className="text-[11px] text-muted">Context references: {item.references.join('; ')}</p>}
        {item.replies.map((reply, index) => <p key={`${reply.createdAt}-${index}`} className="rounded-lg border border-green/15 bg-green/5 p-3 text-xs"><span className="font-medium text-green">{reply.from}:</span> {reply.text} <span className="text-muted">· {new Date(reply.createdAt).toLocaleString()}</span></p>)}
        <form className="flex flex-wrap gap-2" onSubmit={(event) => {
          event.preventDefault();
          const reply = drafts[item.id]?.trim();
          if (!reply) return;
          onReply(item.id, reply, userName);
          setDrafts((current) => ({ ...current, [item.id]: '' }));
        }}>
          <input value={drafts[item.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Reply to ${client?.company ?? item.clientId}`} placeholder="Write a reply visible in the client's chat" className="h-11 min-w-0 flex-1 basis-full rounded-lg border hairline bg-bg/60 px-3 text-base sm:h-10 sm:basis-48 sm:text-xs" />
          <Button type="submit" size="sm" className="min-h-11 w-full sm:min-h-9 sm:w-auto" disabled={!drafts[item.id]?.trim()}>Send demo reply</Button>
        </form>
      </li>;
    })}</ul> : <EmptyPanel text="No questions match this inbox view." /> : <EmptyPanel text="No client questions have been sent to the team in this browser session." />}
  </Panel>;
}

function PayrollPanel({ adminStyle, documents, drafts, approvalsEnabled, onCreateDraft, onValidate, onApprove }: {
  adminStyle: boolean;
  documents: DemoDocument[];
  drafts: DemoPayrollDraft[];
  approvalsEnabled: boolean;
  onCreateDraft: (document: DemoDocument) => void;
  onValidate: (draft: DemoPayrollDraft) => void;
  onApprove: (draft: DemoPayrollDraft) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'review'>('all');
  const payroll = documents.filter((item) => item.category === 'payroll' || item.category === 'employee_record');
  const visiblePayroll = payroll.filter((item) => {
    const matchesSearch = `${item.name} ${item.fields.counterparty} ${labelFor(item.category)}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'ready' ? item.status === 'approved' : item.status !== 'approved');
    return matchesSearch && matchesStatus;
  });
  const approvedCount = drafts.filter((draft) => draft.status === 'approved').length;
  const validatedCount = drafts.filter((draft) => draft.status === 'validated').length;
  return <div className="space-y-5"><div className={`rounded-2xl border p-4 text-xs leading-5 ${adminStyle ? 'border-amber-200 bg-amber-50/80 text-amber-900' : 'border-warn/20 bg-warn/5 text-muted'}`}><LockKeyhole className={`mr-1.5 inline size-4 align-[-3px] ${adminStyle ? 'text-amber-600' : 'text-warn'}`} />Payroll and employee records are highly sensitive. Use dummy records only in this demo; no access controls are enforced here.</div>
    <div className="grid grid-cols-3 gap-2 sm:gap-3"><Metric adminStyle={adminStyle} title="Payroll records" value={payroll.length} icon={FileText} /><Metric adminStyle={adminStyle} title="Validated drafts" value={validatedCount} icon={ClipboardCheck} /><Metric adminStyle={adminStyle} title="Approved drafts" value={approvedCount} icon={CheckCircle2} /></div>
    <Panel className={`overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-4 py-4 sm:px-5"><div><h2 className="font-semibold">Payroll documents</h2><p className="mt-1 text-xs text-muted">Payslips, timesheets, sick notes and employee records · fictional documents only</p></div><div className="flex w-full gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-52"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search payroll records" placeholder="Search records" className="h-10 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-xs" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter payroll status" className="h-10 rounded-xl border hairline bg-bg/50 px-2 text-xs"><option value="all">All status</option><option value="ready">Ready</option><option value="review">Needs review</option></select></div></div>
      {visiblePayroll.map((item) => {
        const draft = drafts.find((candidate) => candidate.documentId === item.id);
        return <div key={item.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b hairline px-3 py-3 last:border-0 sm:px-5 sm:py-4 ${adminStyle ? 'hover:bg-slate-50/80' : ''}`}><div className="flex min-w-0 items-center gap-2 sm:gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-green/10 text-green sm:size-9"><Wallet className="size-4" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mt-1 block truncate text-[10px] text-muted sm:text-[11px]">{labelFor(item.category)} · {item.fields.counterparty} · {item.fields.documentDate}</span></span></div><Badge className="w-fit whitespace-nowrap text-[10px]" tone={draft?.status === 'approved' ? 'ok' : draft?.status === 'validated' ? 'cyan' : 'warn'}>{draft ? `Draft ${draft.status}` : 'No draft'}</Badge><div className="col-span-2 flex gap-2 sm:col-span-1">{!draft ? <Button size="sm" className="flex-1 sm:flex-none" onClick={() => onCreateDraft(item)}>Create draft</Button> : <><Button size="sm" className="min-w-0 flex-1 px-2 sm:flex-none" disabled={draft.status === 'approved'} onClick={() => onValidate(draft)}>Validate draft</Button><Button size="sm" className="min-w-0 flex-1 px-2 sm:flex-none" variant="primary" disabled={!approvalsEnabled || draft.status !== 'validated'} onClick={() => onApprove(draft)}>Approve draft</Button></>}</div>
          {draft && <div className="grid gap-2 rounded-xl bg-bg/50 p-3 text-[11px] sm:grid-cols-4"><p><span className="text-muted">Employee:</span> {draft.employee || 'Not detected'}</p><p><span className="text-muted">Pay period:</span> {draft.payPeriod || 'Not detected'}</p><p><span className="text-muted">Gross:</span> {formatAmount(draft.grossAmount)}</p><p><span className="text-muted">Net:</span> {formatAmount(draft.netAmount)}</p>{draft.validationIssues.length > 0 && <ul role="alert" className="list-inside list-disc text-rose-700 sm:col-span-4">{draft.validationIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</div>}
          <p className="text-[10px] text-muted">Source: {new Date(item.createdAt).toLocaleDateString()} · approval is a bookkeeping review only; no salary payment is made.</p>
        </div>;
      })}
      {!payroll.length && <EmptyPanel text="Upload payroll or employee records to start a demo register." />}
      {payroll.length > 0 && visiblePayroll.length === 0 && <EmptyPanel text="No payroll records match those filters." />}
    </Panel>
  </div>;
}

function TasksPanel({ adminStyle, tasks, documents, userName, onCreate, onToggle, onOpenDocument }: {
  adminStyle: boolean;
  tasks: DemoFollowUpTask[];
  documents: DemoDocument[];
  userName: string;
  onCreate: (task: Omit<DemoFollowUpTask, 'id' | 'status' | 'createdAt'>) => void;
  onToggle: (id: string) => void;
  onOpenDocument: (id: string) => void;
}) {
  const [view, setView] = useState<'all' | 'open' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const visibleTasks = tasks.filter((task) => {
    const matchesView = view === 'all' || (view === 'completed' ? task.status === 'completed' : task.status === 'open');
    const linkedDocument = documents.find((document) => document.id === task.documentId);
    const matchesSearch = `${task.title} ${task.owner} ${task.clientId ?? ''} ${linkedDocument?.name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesView && matchesSearch;
  });
  const submit = (event: ChangeEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !dueDate) {
      setError('Add a task title and due date.');
      return;
    }
    onCreate({
      title: title.trim(),
      clientId: documents.find((document) => document.id === documentId)?.clientId,
      documentId: documentId || undefined,
      dueDate,
      owner: userName,
    });
    setTitle('');
    setDocumentId('');
    setError('');
  };
  return <div className="space-y-5">
    <Panel className={`p-4 sm:p-5 ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}>
      <h2 className="font-semibold">Create a follow-up</h2><p className="mt-1 text-xs text-muted">Tasks can be linked to an existing document or clarification.</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)_150px_auto] sm:items-end">
        <Field label="Task title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Confirm invoice reference" /></Field>
        <Field label="Link document"><select value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="h-11 w-full rounded-lg border hairline bg-bg2 px-3 text-sm"><option value="">No linked document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select></Field>
        <Field label="Due date"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />}>Add task</Button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </Panel>
    <Panel className={`overflow-hidden ${adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : ''}`}><div className="space-y-3 border-b hairline px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Tasks & reminders</h2><p className="mt-1 text-xs text-muted">Shared session tasks; clarification responses complete linked follow-ups.</p></div><Badge tone={tasks.some((task) => task.status === 'open') ? 'warn' : 'ok'}>{tasks.filter((task) => task.status === 'open').length} open</Badge></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-full bg-bg/70 p-1">{(['all', 'open', 'completed'] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`rounded-full px-3 py-1.5 text-[10px] font-medium capitalize ${view === item ? 'bg-white text-blue-700 shadow-sm' : 'text-muted'}`}>{item}</button>)}</div><label className="relative min-w-0 flex-1 sm:max-w-56"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search tasks" placeholder="Search tasks" className="h-9 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-xs" /></label></div></div>
      {visibleTasks.length ? <ul className="divide-y divide-line/10">{visibleTasks.map((task) => {
        const linkedDocument = documents.find((document) => document.id === task.documentId);
        const isComplete = task.status === 'completed';
        return <li key={task.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_120px_auto] sm:gap-3 sm:px-5 sm:py-4 ${adminStyle ? 'transition-colors hover:bg-slate-50/80' : ''}`}><button type="button" aria-label={`${isComplete ? 'Reopen' : 'Complete'} ${task.title}`} onClick={() => onToggle(task.id)} className={`grid size-10 shrink-0 place-items-center rounded-xl border ${isComplete ? 'border-green bg-green text-bg' : 'hairline hover:border-cyan/50'}`}>{isComplete && <Check className="size-3.5" />}</button><div className="min-w-0"><p className={`truncate text-xs font-semibold ${isComplete ? 'text-muted line-through' : ''}`}>{task.title}</p><p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{task.clientId ?? 'Workspace'} · Due {task.dueDate} · {task.owner}{linkedDocument ? ` · ${linkedDocument.name}` : ''}</p></div><Badge className="w-fit whitespace-nowrap text-[10px]" tone={isComplete ? 'ok' : 'warn'}>{isComplete ? 'Done' : 'Open'}</Badge>{linkedDocument && <Button size="sm" className="col-span-3 w-full sm:col-span-1 sm:w-auto" onClick={() => onOpenDocument(linkedDocument.id)}>Open document</Button>}</li>;
      })}</ul> : <EmptyPanel text="No tasks match this view. Create a task or change the filters." />}
    </Panel>
  </div>;
}

function ExportsPanel({ adminStyle, documents, exportsEnabled, exportHistory, onExport }: {
  adminStyle: boolean;
  documents: DemoDocument[];
  exportsEnabled: boolean;
  exportHistory: { id: string; at: string; actor: string; documentIds: string[] }[];
  onExport: (documents: DemoDocument[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'bank_statement' | 'purchase_invoice' | 'sales_invoice' | 'receipt' | 'cash_book'>('all');
  const [mobileSection, setMobileSection] = useState<'preview' | 'guidance' | 'history'>('preview');
  const accountingCategories = ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'];
  const exportable = documents.filter((item) => item.status === 'approved' && accountingCategories.includes(item.category));
  const visibleRows = exportable.filter((item) => {
    const matchesCategory = category === 'all' || item.category === category;
    const matchesSearch = `${item.name} ${item.fields.counterparty} ${item.fields.reference}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });
  const panelClass = adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : '';
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="grid grid-cols-3 gap-1 rounded-xl border hairline bg-bg/60 p-1 md:hidden" role="tablist" aria-label="Export sections">
      {([
        ['preview', `Preview · ${visibleRows.length}`],
        ['guidance', 'Guidance'],
        ['history', `History · ${exportHistory.length}`],
      ] as const).map(([section, label]) => <button key={section} type="button" role="tab" aria-selected={mobileSection === section} onClick={() => setMobileSection(section)} className={`min-h-10 rounded-lg px-1 text-[10px] font-medium transition-colors ${mobileSection === section ? 'bg-white text-blue-700 shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>)}
    </div>
    <Panel className={`overflow-hidden ${panelClass} ${mobileSection === 'preview' ? '' : 'hidden md:block'}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-3 py-3 sm:px-5 sm:py-4"><div className="flex min-w-0 items-center gap-2 sm:gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-green/10 text-green sm:size-9"><FileSpreadsheet className="size-5" /></span><div className="min-w-0"><h2 className="text-sm font-semibold sm:text-base">Accounting export preview</h2><p className="mt-1 text-[10px] text-muted sm:text-xs">Generic CSV columns with example SKR03 account fields</p></div></div><Badge className="text-[10px]" tone="neutral">{visibleRows.length} shown · {exportable.length} eligible</Badge></div>
      <div className="grid gap-2 border-b hairline px-3 py-3 sm:flex sm:px-5"><label className="relative min-w-0 sm:max-w-64 sm:flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search export records" placeholder="Search records" className="h-11 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-sm sm:h-10 sm:text-xs" /></label><label className="sr-only" htmlFor="export-category">Filter export category</label><select id="export-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="h-11 w-full rounded-xl border hairline bg-bg/50 px-3 text-sm sm:h-10 sm:w-auto sm:text-xs"><option value="all">All categories</option><option value="bank_statement">Bank statement</option><option value="purchase_invoice">Purchase invoice</option><option value="sales_invoice">Sales invoice</option><option value="receipt">Receipt</option><option value="cash_book">Cash book</option></select></div>
      <div className="divide-y divide-line/10 md:hidden">{visibleRows.map((item) => <details key={item.id} className="px-3 py-2"><summary className="grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.fields.counterparty || item.name}</span><span className="mt-1 block truncate text-[10px] text-muted">{item.fields.documentDate || 'Date not detected'} · {item.fields.reference || item.name}</span><span className="mt-0.5 block truncate text-[9px] text-muted">{item.name}</span></span><span className="text-right text-xs font-semibold">{formatAmount(item.fields.grossAmount)}<span className="mt-1 block text-[10px] font-normal text-muted">Gross · tap for details</span></span></summary><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-bg/50 p-3 text-[11px]"><div><dt className="text-muted">Debit account</dt><dd className="break-words">{item.fields.debitAccount}</dd></div><div><dt className="text-muted">Credit account</dt><dd className="break-words">{item.fields.creditAccount}</dd></div><div><dt className="text-muted">Net</dt><dd>{formatAmount(item.fields.netAmount)}</dd></div><div><dt className="text-muted">VAT</dt><dd>{item.fields.vatRate}% · {formatAmount(item.fields.vatAmount)}</dd></div></dl></details>)}{visibleRows.length === 0 && <EmptyPanel text={exportable.length ? 'No eligible records match those filters.' : 'No approved accounting records are eligible for export yet.'} />}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-[11px]"><thead className="bg-bg/40 text-muted"><tr>{['Date', 'Counterparty', 'Reference', 'Debit', 'Credit', 'Net', 'VAT', 'Gross'].map((value) => <th key={value} className="px-3 py-3 font-medium">{value}</th>)}</tr></thead><tbody className="divide-y divide-line/10">{visibleRows.map((item) => <tr key={item.id}><td className="px-3 py-3">{item.fields.documentDate}</td><td className="px-3 py-3">{item.fields.counterparty}</td><td className="px-3 py-3">{item.fields.reference}</td><td className="px-3 py-3">{item.fields.debitAccount}</td><td className="px-3 py-3">{item.fields.creditAccount}</td><td className="px-3 py-3">{formatAmount(item.fields.netAmount)}</td><td className="px-3 py-3">{item.fields.vatRate}%</td><td className="px-3 py-3">{formatAmount(item.fields.grossAmount)}</td></tr>)}</tbody></table>{visibleRows.length === 0 && <EmptyPanel text={exportable.length ? 'No eligible records match those filters.' : 'No approved accounting records are eligible for export yet.'} />}</div>
      <div className="hidden flex-wrap items-center justify-between gap-3 border-t hairline px-4 py-4 sm:px-5 md:flex"><p className="text-xs text-muted">{visibleRows.length} approved accounting row{visibleRows.length === 1 ? '' : 's'} selected · {exportable.length} eligible total</p><Button variant="primary" disabled={visibleRows.length === 0 || !exportsEnabled} icon={<ArrowDownToLine className="size-4" />} onClick={() => onExport(visibleRows)}>Download selected CSV</Button></div>
    </Panel>
    <div className={`space-y-5 ${mobileSection === 'guidance' ? '' : 'hidden md:block'}`}>
      <Panel className={`h-fit p-4 sm:p-5 ${panelClass}`}><h2 className="font-semibold">Before using a live export</h2><ul className="mt-3 space-y-3 text-xs text-muted sm:mt-4"><li className="flex gap-2"><Check className="size-4 shrink-0 text-green" />Only approved accounting records from the shared demo state can be selected.</li><li className="flex gap-2"><CircleAlert className="size-4 shrink-0 text-warn" />This is a generic demo CSV, not a certified Agenda SKR03 import file.</li><li className="flex gap-2"><Settings2 className="size-4 shrink-0 text-cyan" />Confirm tax codes, account mapping, encoding and column order with the accounting system.</li></ul><div className="mt-4 rounded-xl bg-bg/50 p-3 text-[11px] leading-4 text-muted">No export is sent to a third party. The file downloads directly from this browser.{!exportsEnabled && <span className="mt-2 block font-semibold text-rose-700">Downloads disabled in Administration.</span>}</div></Panel>
    </div>
    <div className={`space-y-5 ${mobileSection === 'history' ? '' : 'hidden md:block'}`}>
      <Panel className={`overflow-hidden ${panelClass}`}><div className="border-b hairline px-4 py-3"><h2 className="text-sm font-semibold">Recent session exports</h2><p className="mt-1 text-[11px] text-muted">Successful CSV download actions logged in this browser session.</p></div>{exportHistory.length ? <ul className="divide-y divide-line/10">{exportHistory.slice(0, 5).map((item) => <li key={item.id} className="px-4 py-3"><p className="text-xs font-medium">{item.documentIds.length} records · {item.actor}</p><p className="mt-1 text-[10px] text-muted">{new Date(item.at).toLocaleString()}</p></li>)}</ul> : <EmptyPanel text="No CSV downloads recorded yet." />}</Panel>
    </div>
    <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border hairline bg-white/95 p-2 shadow-lg backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5"><span className="text-[10px] text-muted">{visibleRows.length} selected · {exportable.length} eligible</span>{!exportsEnabled && <span className="text-[10px] font-medium text-rose-700">Downloads disabled</span>}</div>
      <Button className="min-h-11 w-full" variant="primary" disabled={visibleRows.length === 0 || !exportsEnabled} icon={<ArrowDownToLine className="size-4" />} onClick={() => onExport(visibleRows)}>Download CSV</Button>
    </div>
  </div>;
}

function AdminPanel({ adminStyle, settings, roleAssignments, auditEvents, onSettingChange, onCreateProfile, onUpdateProfile, onToggleProfile, onDeleteProfile }: {
  adminStyle: boolean;
  settings: DemoWorkspaceSettings;
  roleAssignments: DemoRoleAssignment[];
  auditEvents: DemoAuditEvent[];
  onSettingChange: (key: keyof DemoWorkspaceSettings, value: boolean) => void;
  onCreateProfile: (profile: Pick<DemoRoleAssignment, 'name' | 'email' | 'role'>) => boolean;
  onUpdateProfile: (id: string, profile: Pick<DemoRoleAssignment, 'name' | 'email'>) => boolean;
  onToggleProfile: (id: string) => boolean;
  onDeleteProfile: (id: string) => boolean;
}) {
  const [adminSection, setAdminSection] = useState<'clients' | 'staff' | 'settings' | 'audit'>('clients');
  const panelClass = adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : '';
  const settingOptions: { key: keyof DemoWorkspaceSettings; title: string; description: string; value: boolean }[] = [
    { key: 'exportsEnabled', title: 'Accounting CSV exports', description: 'Allow staff to download selected, approved accounting records.', value: settings.exportsEnabled },
    { key: 'payrollApprovalsEnabled', title: 'Payroll draft approvals', description: 'Allow validated payroll drafts to be approved in this demo.', value: settings.payrollApprovalsEnabled },
  ];
  return <div className="space-y-5">
    <details className={`rounded-2xl border p-3 text-xs leading-5 ${adminStyle ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-warn/20 bg-warn/5 text-muted'}`}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-medium"><CircleAlert className={`size-4 shrink-0 ${adminStyle ? 'text-amber-600' : 'text-warn'}`} />Demo-only administration · no sign-in or access control</summary>
      <p className="pt-2">This is a browser-only demo directory, not account provisioning. Profiles cannot sign in, reset passwords, or control authorization; updates and audit events clear when the app session resets.</p>
    </details>
    <div className="grid grid-cols-4 gap-1 rounded-xl border hairline bg-bg/60 p-1 md:hidden" role="tablist" aria-label="Administration sections">
      {([
        ['clients', 'Clients'],
        ['staff', 'Staff'],
        ['settings', 'Settings'],
        ['audit', 'Audit'],
      ] as const).map(([section, label]) => <button key={section} type="button" role="tab" aria-selected={adminSection === section} onClick={() => setAdminSection(section)} className={`min-h-10 rounded-lg px-1 text-[11px] font-medium transition-colors ${adminSection === section ? 'bg-white text-blue-700 shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>)}
    </div>
    <div className={adminSection === 'clients' ? '' : 'hidden md:block'}>
    <DemoProfileDirectory
      title="Client management"
      profileRole="client"
      profiles={roleAssignments.filter((profile) => profile.role === 'client')}
      adminStyle={adminStyle}
      onCreate={onCreateProfile}
      onUpdate={onUpdateProfile}
      onToggle={onToggleProfile}
      onDelete={onDeleteProfile}
    />
    </div>
    <div className={adminSection === 'staff' ? '' : 'hidden md:block'}>
    <DemoProfileDirectory
      title="Staff management"
      profileRole="staff"
      profiles={roleAssignments.filter((profile) => profile.role === 'staff')}
      adminStyle={adminStyle}
      onCreate={onCreateProfile}
      onUpdate={onUpdateProfile}
      onToggle={onToggleProfile}
      onDelete={onDeleteProfile}
    />
    </div>
    <div className={adminSection === 'settings' ? '' : 'hidden md:block'}>
    <Panel className={`overflow-hidden ${panelClass}`}><div className="border-b hairline px-4 py-4 sm:px-5"><h2 className="font-semibold">Workspace settings</h2><p className="mt-1 text-xs text-muted">These switches are applied to demo export and payroll actions.</p></div>
      <div className="divide-y divide-line/10">{settingOptions.map((setting) => <label key={setting.key} className="flex min-h-16 cursor-pointer items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4"><span className="min-w-0"><span className="block text-xs font-semibold">{setting.title}</span><span className="mt-1 block text-[11px] text-muted">{setting.description}</span></span><input type="checkbox" checked={setting.value} onChange={(event) => onSettingChange(setting.key, event.target.checked)} aria-label={setting.title} className="size-5 shrink-0 accent-blue-600" /></label>)}</div>
    </Panel>
    </div>
    <div className={adminSection === 'audit' ? '' : 'hidden md:block'}>
    <Panel className={`overflow-hidden ${panelClass}`}><div className="flex items-center justify-between gap-3 border-b hairline px-4 py-4 sm:px-5"><div><h2 className="font-semibold">Session audit history</h2><p className="mt-1 text-xs text-muted">Document, review, task, role, setting and export events.</p></div><Badge tone="neutral">{auditEvents.length} events</Badge></div>
      {auditEvents.length ? <ol className="max-h-[520px] divide-y divide-line/10 overflow-y-auto">{auditEvents.slice(0, 50).map((event) => <li key={event.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-3 sm:grid-cols-[150px_minmax(0,1fr)_160px] sm:gap-3 sm:px-5"><span className="min-w-0"><span className="block truncate text-xs font-semibold">{event.action}</span><span className="mt-1 block truncate text-[10px] text-muted sm:text-[11px]">{event.target} · {event.details}</span></span><time className="text-right text-[10px] text-muted">{new Date(event.at).toLocaleDateString()}</time><span className="col-span-2 text-[10px] text-muted sm:col-span-1">{event.actor}</span></li>)}</ol> : <EmptyPanel text="No audit events have been recorded in this session yet." />}
    </Panel>
    </div>
  </div>;
}

function DemoProfileDirectory({ title, profileRole, profiles, adminStyle, onCreate, onUpdate, onToggle, onDelete }: {
  title: string;
  profileRole: 'client' | 'staff';
  profiles: DemoRoleAssignment[];
  adminStyle: boolean;
  onCreate: (profile: Pick<DemoRoleAssignment, 'name' | 'email' | 'role'>) => boolean;
  onUpdate: (id: string, profile: Pick<DemoRoleAssignment, 'name' | 'email'>) => boolean;
  onToggle: (id: string) => boolean;
  onDelete: (id: string) => boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [message, setMessage] = useState('');
  const pageSize = 5;
  const visible = profiles.filter((profile) => {
    const matchesText = `${profile.name} ${profile.email}`.toLowerCase().includes(query.trim().toLowerCase());
    const active = profile.active !== false;
    return matchesText && (statusFilter === 'all' || (statusFilter === 'active' ? active : !active));
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const rows = visible.slice(page * pageSize, (page + 1) * pageSize);
  const panelClass = adminStyle ? '!rounded-3xl !border-white/80 !bg-white/90 shadow-[0_24px_60px_-34px_rgba(60,80,140,.35)]' : '';
  const createProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = onCreate({ name: name.trim(), email: email.trim(), role: profileRole });
    setMessage(created ? 'Demo profile added to this session.' : 'That email is already in the demo directory.');
    if (created) { setName(''); setEmail(''); setPage(Math.floor(visible.length / pageSize)); }
  };
  const saveEdit = (profile: DemoRoleAssignment) => {
    const updated = onUpdate(profile.id, { name: editName.trim(), email: editEmail.trim() });
    setMessage(updated ? 'Demo profile updated.' : 'Email is already in use, or this profile could not be updated.');
    if (updated) setEditingId('');
  };
  const removeProfile = (profile: DemoRoleAssignment) => {
    if (!window.confirm(`Remove ${profile.name} from this demo directory?`)) return;
    const removed = onDelete(profile.id);
    setMessage(removed ? 'Demo profile removed.' : 'This profile is linked to documents and cannot be removed yet.');
  };
  useEffect(() => setPage(0), [query, statusFilter, profiles.length]);

  return <Panel className={`overflow-hidden ${panelClass}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-4 py-4 sm:px-5">
      <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">{profiles.length} demo profile{profiles.length === 1 ? '' : 's'} · not login accounts</p></div>
      <label className="text-xs font-medium">Directory status
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="ml-2 h-10 rounded-xl border hairline bg-bg/50 px-3 text-sm">
          <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </label>
    </div>
    <details className="border-b hairline bg-bg/25">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-semibold sm:px-5">
        <span className="flex items-center gap-2"><Plus className="size-4 text-blue-600" />Add demo profile</span>
        <span className="text-[10px] font-normal text-muted">Name and email</span>
      </summary>
      <form onSubmit={createProfile} className="grid gap-3 px-4 pb-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:px-5">
        <Field label={profileRole === 'client' ? 'Client name / company' : 'Staff name'}><Input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder={profileRole === 'client' ? 'Company name' : 'Staff name'} /></Field>
        <Field label="Email / username"><Input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></Field>
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />}>Add demo profile</Button>
      </form>
    </details>
    <div className="flex flex-wrap items-center gap-3 border-b hairline px-4 py-3 sm:px-5">
      <label className="relative min-w-0 flex-1 sm:max-w-80"><span className="sr-only">Search {title.toLowerCase()}</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="h-10 w-full rounded-xl border hairline bg-bg/50 pl-9 pr-3 text-sm" /></label>
      <span className="text-xs text-muted">{visible.length} match{visible.length === 1 ? '' : 'es'}</span>
    </div>
    {rows.length ? <ul className="divide-y divide-line/10">{rows.map((profile) => <li key={profile.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3 sm:px-5 sm:py-4">
      {editingId === profile.id ? <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input required value={editName} onChange={(event) => setEditName(event.target.value)} /></Field>
        <Field label="Email"><Input required type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} /></Field>
      </div> : <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{profile.name}</p><Badge tone={profile.active === false ? 'neutral' : 'ok'}>{profile.active === false ? 'Inactive' : 'Active'}</Badge><Badge tone="neutral">{profileRole === 'staff' ? 'Staff' : 'Client'}</Badge></div>
        <p className="mt-1 truncate text-xs text-muted">{profile.email}</p>
        <p className="mt-1 hidden text-[10px] text-muted sm:block">Created {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'Demo baseline'}</p>
      </div>}
      <div className="col-span-1 flex min-w-0 items-center justify-end gap-1 sm:gap-2">
        {editingId === profile.id ? <>
          <Button size="sm" className="px-2 sm:px-3" variant="primary" onClick={() => saveEdit(profile)}>Save</Button>
          <Button size="sm" className="px-2 sm:px-3" variant="outline" onClick={() => setEditingId('')}>Cancel</Button>
        </> : <>
          <button type="button" title="Edit profile" aria-label={`Edit ${profile.name}`} onClick={() => { setEditingId(profile.id); setEditName(profile.name); setEditEmail(profile.email); }} className="grid size-9 shrink-0 place-items-center rounded-lg border hairline text-muted hover:bg-bg/70 hover:text-ink"><Pencil className="size-4" /></button>
          <button type="button" title={profile.active === false ? 'Activate profile' : 'Deactivate profile'} aria-label={`${profile.active === false ? 'Activate' : 'Deactivate'} ${profile.name}`} onClick={() => {
            const changed = onToggle(profile.id);
            setMessage(changed ? `Demo directory profile ${profile.active === false ? 'activated' : 'deactivated'}. Sign-in access is unchanged.` : 'This demo profile could not be changed.');
          }} className="grid size-9 shrink-0 place-items-center rounded-lg border hairline text-muted hover:bg-bg/70 hover:text-ink"><Power className="size-4" /></button>
          <button type="button" title="Delete profile" aria-label={`Delete ${profile.name}`} onClick={() => removeProfile(profile)} className="grid size-9 shrink-0 place-items-center rounded-lg border hairline text-rose-700 hover:bg-rose-50"><Trash2 className="size-4" /></button>
        </>}
      </div>
    </li>)}</ul> : <EmptyPanel text={profiles.length ? 'No profiles match these filters.' : `No ${profileRole} profiles yet. Add a demo directory entry above.`} />}
    <div className="flex items-center justify-between gap-3 border-t hairline px-4 py-3 text-xs text-muted sm:px-5">
      <span>Page {page + 1} of {pageCount}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
      </div>
    </div>
    {message && <p role="status" className="border-t hairline px-4 py-3 text-xs text-muted sm:px-5">{message}</p>}
  </Panel>;
}

function Metric({ adminStyle = false, title, value, icon: Icon }: { adminStyle?: boolean; title: string; value: number; icon: typeof FileText }) {
  return <Panel className={`p-4 ${adminStyle ? '!rounded-2xl !border-white/80 !bg-white/85 shadow-[0_16px_40px_-30px_rgba(60,80,140,.4)]' : ''}`}><div className="flex items-center justify-between"><span className="text-xs text-muted">{title}</span><Icon className={`size-4 ${adminStyle ? 'text-blue-600' : 'text-cyan'}`} /></div><p className="mt-3 text-2xl font-semibold">{value}</p></Panel>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="p-8 text-center"><FileText className="mx-auto size-6 text-muted" /><p className="mt-2 text-xs text-muted">{text}</p></div>;
}

function DocStatus({ status }: { status: DemoDocument['status'] | 'processing' }) {
  const values: Record<typeof status, { label: string; tone: 'ok' | 'warn' | 'bad' | 'cyan' }> = {
    processing: { label: 'Processing locally', tone: 'cyan' },
    review: { label: 'Needs review', tone: 'warn' },
    approved: { label: 'Approved', tone: 'ok' },
    password_required: { label: 'Password needed', tone: 'bad' },
    action_required: { label: 'Action required', tone: 'warn' },
    needs_information: { label: 'Needs information', tone: 'warn' },
    rejected: { label: 'Rejected', tone: 'bad' },
  };
  return <Badge tone={values[status].tone}>{values[status].label}</Badge>;
}

function screenTitle(screen: Screen) {
  return NAV.find((item) => item.id === screen)?.label ?? 'Overview';
}

function screenDescription(screen: Screen, role: DemoRole) {
  if (screen === 'overview' && role === 'staff') return 'Prioritize client questions, documents awaiting review, and upcoming work.';
  if (screen === 'overview' && role === 'admin') return 'Monitor demo-wide client activity, workflow status, and unresolved items.';
  const descriptions: Record<Screen, string> = {
    overview: 'A role-specific view of the FinTax demo workspace.',
    uploads: 'Triage real client uploads by type and status, assign a reviewer, then open the document to process its extracted details.',
    documents: 'Add documents to the browser’s shared IndexedDB queue; no files are sent to a backend.',
    review: 'Inspect illustrative extracted fields, resolve validation checks, then approve or request a corrected file.',
    submissions: role === 'admin'
      ? 'Read submitted monthly periods, deterministic findings, and review timelines.'
      : 'Review submitted monthly periods, findings, and client follow-up requests.',
    banking: 'Review statement samples and mark transaction matches for the demo.',
    correspondence: 'Track tax-office letters, owners and reply deadlines.',
    payroll: 'Organize payslips and employee records with a sensitive-data warning.',
    tasks: 'Manage recurring checklists and client reminders.',
    exports: 'Preview approved records and download a generic CSV for mapping discussions.',
    clients: 'Review fictional client document counts, workflow status, and outstanding information requests.',
    admin: 'Review target operations controls and what remains unconfigured for production.',
  };
  return descriptions[screen];
}
