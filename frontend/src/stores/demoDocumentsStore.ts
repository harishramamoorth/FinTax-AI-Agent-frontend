import { create } from 'zustand';
import { canTransitionDocumentStatus, type DemoDocument, type DemoFields } from '@/features/fintax/shared/demoWorkflow';
import { CLIENT_DEMO_DOCUMENTS } from '@/features/fintax/shared/clientDemoData';
import { DEMO_CLIENTS } from '@/features/fintax/shared/demoAccounts';
import type { DemoAuditEntry, MonthlyPeriod } from '@/features/fintax/shared/storage/models';
import { createSeedPeriods } from '@/features/fintax/shared/storage/seedPeriods';
import { canAccessClientData, checklistBlockers, isChecklistComplete } from '@/features/fintax/shared/storage/periods';
import {
  announceStorageChange, createStorageChangeNotifier, getStorageUsage, isQuotaExceeded, readDemoSnapshot, writeDemoSnapshot,
} from '@/features/fintax/shared/storage/database';
import { toast } from './toastStore';

export interface ClientAssistantQuestion {
  id: string;
  clientId: string;
  question: string;
  answer: string;
  references: string[];
  createdAt: string;
  replies: { text: string; createdAt: string; from: string }[];
}

export interface DemoFollowUpTask {
  id: string;
  title: string;
  clientId?: string;
  documentId?: string;
  dueDate: string;
  owner: string;
  status: 'open' | 'completed';
  createdAt: string;
}

export interface DemoBankLink {
  statementId: string;
  transactionReference: string;
  accountingDocumentId: string;
  createdAt: string;
}

export interface DemoPayrollDraft {
  documentId: string;
  employee: string;
  payPeriod: string;
  grossAmount: string;
  netAmount: string;
  status: 'draft' | 'validated' | 'approved';
  validationIssues: string[];
  updatedAt: string;
}

export interface DemoAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  details: string;
}

export interface DemoWorkspaceSettings {
  exportsEnabled: boolean;
  payrollApprovalsEnabled: boolean;
}

export interface DemoRoleAssignment {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'client';
}

interface DemoDocumentsState {
  documents: DemoDocument[];
  periods: MonthlyPeriod[];
  periodAudit: DemoAuditEntry[];
  storageHydrated: boolean;
  storageError: string;
  quotaWarning: boolean;
  recordPeriodAudit(action: DemoAuditEntry['action'], targetId: string, details: string, actor: string, role: DemoAuditEntry['role']): void;
  assistantQuestions: ClientAssistantQuestion[];
  followUpTasks: DemoFollowUpTask[];
  bankLinks: DemoBankLink[];
  payrollDrafts: DemoPayrollDraft[];
  auditEvents: DemoAuditEvent[];
  settings: DemoWorkspaceSettings;
  roleAssignments: DemoRoleAssignment[];
  exports: { id: string; at: string; actor: string; documentIds: string[] }[];
  addDocument(document: DemoDocument, actor?: string): void;
  setChecklistItem(periodId: string, key: string, state: 'uploaded' | 'not_applicable', reason: string, actor: string): void;
  submitPeriod(periodId: string, clientId: string, actor: string): { ok: boolean; blockers: string[] };
  reviewMonth(periodId: string, actor: string, action: 'start_review' | 'request_changes' | 'approve', details: string, analysis?: MonthlyPeriod['analysis']): boolean;
  resolveMonthFinding(periodId: string, findingId: string, actor: string, details: string): void;
  hydrateStorage(): Promise<void>;
  startStorageSync(): () => void;
  updateDocument(id: string, update: Partial<DemoDocument>, actor?: string): void;
  updateFields(id: string, key: keyof DemoFields, value: string, actor?: string): void;
  recordReview(id: string, action: string, details: string, update: Partial<DemoDocument>, actor?: string): void;
  respondToRequest(id: string, response: string): void;
  addAssistantQuestion(question: ClientAssistantQuestion): void;
  replyToAssistantQuestion(id: string, text: string, from: string): void;
  addFollowUpTask(task: Omit<DemoFollowUpTask, 'id' | 'status' | 'createdAt'>, actor: string): void;
  toggleFollowUpTask(id: string, actor: string): void;
  linkBankRecord(statementId: string, transactionReference: string, accountingDocumentId: string, actor: string): void;
  unlinkBankRecord(statementId: string, transactionReference: string, accountingDocumentId: string, actor: string): void;
  savePayrollDraft(draft: DemoPayrollDraft, actor: string): void;
  transitionPayrollDraft(documentId: string, status: DemoPayrollDraft['status'], actor: string): boolean;
  setWorkspaceSetting(key: keyof DemoWorkspaceSettings, value: boolean, actor: string): void;
  setRoleAssignment(id: string, role: DemoRoleAssignment['role'], actor: string): void;
  recordExport(documentIds: string[], actor: string): void;
}

const recordAudit = (state: DemoDocumentsState, action: string, target: string, details: string, actor = 'Demo user'): DemoAuditEvent[] => [
  { id: `audit-${crypto.randomUUID()}`, at: new Date().toISOString(), actor, action, target, details },
  ...state.auditEvents,
].slice(0, 200);

function periodAuditEntry(
  action: DemoAuditEntry['action'],
  targetId: string,
  details: string,
  actor: string,
  role: DemoAuditEntry['role'] = 'client',
): DemoAuditEntry {
  return { id: `period-audit-${crypto.randomUUID()}`, actor, role, action, targetId, details, timestamp: new Date().toISOString() };
}

let suppressPersist = false;
let persistTimer: number | undefined;

export const useDemoDocumentsStore = create<DemoDocumentsState>((set, get) => ({
  documents: CLIENT_DEMO_DOCUMENTS,
  periods: createSeedPeriods(),
  periodAudit: [],
  storageHydrated: false,
  storageError: '',
  quotaWarning: false,
  assistantQuestions: [],
  followUpTasks: [],
  bankLinks: [],
  payrollDrafts: [],
  auditEvents: [],
  settings: { exportsEnabled: true, payrollApprovalsEnabled: true },
  roleAssignments: [
    { id: 'admin-demo', name: 'Admin Demo User', email: 'admin@fintax.demo', role: 'admin' },
    { id: 'staff-demo', name: 'Staff Demo User', email: 'staff@fintax.demo', role: 'staff' },
    { id: 'client-demo', name: 'Client Demo User', email: 'client@fintax.demo', role: 'client' },
  ],
  exports: [],
  addDocument: (document, actor) => set((state) => {
    const period = document.periodId ? state.periods.find((item) => item.id === document.periodId) : undefined;
    if (period && period.status !== 'open' && period.status !== 'changes_requested') return state;
    if (period && document.clientId !== period.clientId) return state;
    const periodClient = period && DEMO_CLIENTS.find((item) => item.email === period.clientId);
    if (period && periodClient && actor && actor !== period.clientId
      && !canAccessClientData('staff', actor, {
        id: periodClient.email,
        company: periodClient.company,
        country: periodClient.country,
        currency: periodClient.currency,
        assignedStaffIds: ['Lena M.'],
      })) return state;
    const checklistKey = document.category === 'timesheet' || document.category === 'sick_note' || document.category === 'employee_record'
      ? 'payroll'
      : document.category === 'other_correspondence' ? 'correspondence' : document.category;
    const periods = period ? state.periods.map((item) => item.id !== period.id ? item : {
      ...item,
      documentIds: item.documentIds.includes(document.id) ? item.documentIds : [...item.documentIds, document.id],
      checklist: item.checklist.map((check) => check.key === checklistKey ? { ...check, state: 'uploaded' as const, naReason: undefined } : check),
      timeline: [...item.timeline, {
        id: `timeline-${crypto.randomUUID()}`,
        at: new Date().toISOString(),
        actor: actor ?? document.clientId ?? 'Demo client',
        action: 'Document uploaded',
        details: document.name,
      }],
    }) : state.periods;
    return {
      documents: [document, ...state.documents],
      periods,
      auditEvents: recordAudit(state, document.sample ? 'Sample record added' : 'Document uploaded', document.id, document.name, actor ?? document.clientId ?? 'Demo staff'),
      periodAudit: document.periodId
        ? [periodAuditEntry('upload', document.id, document.name, actor ?? document.clientId ?? 'Demo client'), ...state.periodAudit]
        : state.periodAudit,
    };
  }),
  setChecklistItem: (periodId, key, itemState, reason, actor) => set((state) => {
    const period = state.periods.find((item) => item.id === periodId);
    if (!period || period.clientId !== actor || (period.status !== 'open' && period.status !== 'changes_requested')) return state;
    return {
      periods: state.periods.map((item) => item.id !== periodId ? item : {
        ...item,
        checklist: item.checklist.map((check) => check.key !== key ? check : {
          ...check,
          state: itemState,
          naReason: itemState === 'not_applicable' ? reason.trim() : undefined,
        }),
      }),
      periodAudit: [periodAuditEntry('field_edited', periodId, `Checklist item ${key} set to ${itemState}${reason.trim() ? `: ${reason.trim()}` : ''}.`, actor), ...state.periodAudit],
    };
  }),
  submitPeriod: (periodId, clientId, actor) => {
    const state = get();
    const period = state.periods.find((item) => item.id === periodId && item.clientId === clientId);
    if (!period) return { ok: false, blockers: ['This month does not belong to the active client.'] };
    if (actor !== clientId) return { ok: false, blockers: ['Only the owning client can submit this month.'] };
    const blockers = checklistBlockers(period.checklist).map((item) => `${item.label} is still required.`);
    const periodDocuments = state.documents.filter((document) => period.documentIds.includes(document.id));
    if (periodDocuments.some((document) => document.status === 'processing')) blockers.push('Wait for all documents to finish processing.');
    if (periodDocuments.some((document) => document.status === 'password_required' || document.status === 'action_required')) blockers.push('Resolve document processing failures before submitting.');
    if (!isChecklistComplete(period.checklist) && blockers.length === 0) blockers.push('Complete the required monthly checklist.');
    if (period.status !== 'open' && period.status !== 'changes_requested') blockers.push('This month is not open for submission.');
    if (blockers.length) return { ok: false, blockers };
    const now = new Date().toISOString();
    set((current) => ({
      periods: current.periods.map((item) => item.id !== periodId ? item : {
        ...item,
        status: 'submitted',
        submittedAt: now,
        submittedBy: actor,
        timeline: [...item.timeline, {
          id: `timeline-${crypto.randomUUID()}`,
          at: now,
          actor,
          action: 'Month submitted',
          details: `${periodDocuments.length} documents submitted for staff review.`,
        }],
      }),
      periodAudit: [periodAuditEntry('month_finished', periodId, `${periodDocuments.length} documents submitted for review.`, actor), ...current.periodAudit],
    }));
    return { ok: true, blockers: [] };
  },
  reviewMonth: (periodId, actor, action, details, analysis) => {
    let updated = false;
    set((state) => {
      const period = state.periods.find((item) => item.id === periodId);
      const client = period && DEMO_CLIENTS.find((item) => item.email === period.clientId);
      const permissionsClient = client && {
        id: client.email,
        company: client.company,
        country: client.country,
        currency: client.currency,
        assignedStaffIds: ['Lena M.'],
      };
      if (!period || !permissionsClient || !canAccessClientData('staff', actor, permissionsClient)) return state;
      if (action === 'start_review' && period.status !== 'submitted') return state;
      if ((action === 'request_changes' || action === 'approve') && !['submitted', 'in_review'].includes(period.status)) return state;
      if (action === 'approve' && (analysis ?? period.analysis)?.findings.some((item) => item.severity === 'error')) return state;
      const now = new Date().toISOString();
      const status = action === 'start_review' ? 'in_review' : action === 'request_changes' ? 'changes_requested' : 'completed';
      const auditAction: DemoAuditEntry['action'] = action === 'request_changes' ? 'changes_requested' : action === 'approve' ? 'approved' : 'review_started';
      updated = true;
      return {
        periods: state.periods.map((item) => item.id !== periodId ? item : {
          ...item,
          status,
          ...(action === 'approve' ? { completedAt: now } : {}),
          ...(analysis ? { analysis } : {}),
          timeline: [...item.timeline, {
            id: `timeline-${crypto.randomUUID()}`,
            at: now,
            actor,
            action: action === 'start_review' ? 'Review started' : action === 'request_changes' ? 'Changes requested' : 'Month approved',
            details,
          }],
        }),
        periodAudit: [periodAuditEntry(auditAction, periodId, details, actor, 'staff'), ...state.periodAudit],
      };
    });
    return updated;
  },
  resolveMonthFinding: (periodId, findingId, actor, details) => set((state) => ({
    periods: state.periods.map((period) => period.id !== periodId ? period : {
      ...period,
      resolvedFindingIds: period.resolvedFindingIds.includes(findingId) ? period.resolvedFindingIds : [...period.resolvedFindingIds, findingId],
      timeline: [...period.timeline, {
        id: `timeline-${crypto.randomUUID()}`,
        at: new Date().toISOString(),
        actor,
        action: 'Finding reviewed',
        details,
      }],
    }),
    periodAudit: [periodAuditEntry('field_edited', periodId, details, actor, 'staff'), ...state.periodAudit],
  })),
  hydrateStorage: async () => {
    try {
      const snapshot = await readDemoSnapshot();
      if (snapshot) {
        suppressPersist = true;
        set((state) => ({
          ...state,
          documents: snapshot.documents,
          periods: snapshot.periods.length ? snapshot.periods.map((period) => ({
            ...period,
            resolvedFindingIds: period.resolvedFindingIds ?? [],
          })) : state.periods,
          periodAudit: snapshot.audit,
        }));
        suppressPersist = false;
      } else {
        const state = get();
        await writeDemoSnapshot({
          documents: state.documents,
          periods: state.periods,
          audit: state.periodAudit,
          metadata: {},
        });
      }
      const usage = await getStorageUsage();
      set({ storageHydrated: true, storageError: '', quotaWarning: Boolean(usage && usage.usage / usage.quota >= 0.8) });
    } catch (error) {
      suppressPersist = false;
      const message = error instanceof Error ? error.message : 'Browser storage could not be opened.';
      set({ storageHydrated: true, storageError: message });
    }
  },
  startStorageSync: () => createStorageChangeNotifier(() => {
    const previousSubmitted = new Set(get().periods.filter((period) => period.status === 'submitted').map((period) => period.id));
    void get().hydrateStorage().then(() => {
      const newSubmission = get().periods.find((period) => period.status === 'submitted' && !previousSubmitted.has(period.id));
      if (newSubmission) {
        const periodLabel = new Date(newSubmission.year, newSubmission.month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
        toast.success('New month submission received', `${newSubmission.clientId} · ${periodLabel} is ready for staff review.`, true);
      }
    });
  }),
  updateDocument: (id, update, actor) => set((state) => {
    const current = state.documents.find((document) => document.id === id);
    if (!current || (update.status && !canTransitionDocumentStatus(current.status, update.status))) return state;
    const period = current.periodId ? state.periods.find((item) => item.id === current.periodId) : undefined;
    const actorId = actor ?? current.clientId ?? 'Demo staff';
    const client = period && DEMO_CLIENTS.find((item) => item.email === period.clientId);
    const canClientEdit = period && actorId === period.clientId && (period.status === 'open' || period.status === 'changes_requested');
    const canStaffEdit = period && client && canAccessClientData('staff', actorId, {
      id: client.email,
      company: client.company,
      country: client.country,
      currency: client.currency,
      assignedStaffIds: ['Lena M.'],
    });
    if (period && !canClientEdit && !canStaffEdit) return state;
    const statusChanged = Boolean(update.status && update.status !== current.status);
    const nextStatus = update.status ?? current.status;
    const action = statusChanged ? `Status changed: ${current.status} → ${nextStatus}` : '';
    return {
      documents: state.documents.map((document) => document.id === id
        ? {
          ...document,
          ...update,
          ...(statusChanged ? { reviewHistory: [...(document.reviewHistory ?? []), { at: new Date().toISOString(), action, details: update.note ?? 'Workflow status updated.' }] } : {}),
        }
        : document),
      ...(statusChanged ? { auditEvents: recordAudit(state, action, id, update.note ?? 'Workflow status updated.', actor ?? current.clientId ?? 'Demo staff') } : {}),
      ...(statusChanged && current.periodId ? {
        periodAudit: [
          periodAuditEntry(
            update.status === 'review' && current.status === 'processing' ? 'ocr_done' : update.status === 'approved' ? 'approved' : 'field_edited',
            id,
            update.note ?? action,
            actor ?? current.clientId ?? 'Demo staff',
            actor === current.clientId ? 'client' : 'staff',
          ),
          ...state.periodAudit,
        ],
      } : {}),
    };
  }),
  updateFields: (id, key, value, actor = 'Demo reviewer') => set((state) => {
    const current = state.documents.find((document) => document.id === id);
    if (!current) return state;
    const period = current.periodId ? state.periods.find((item) => item.id === current.periodId) : undefined;
    const client = period && DEMO_CLIENTS.find((item) => item.email === period.clientId);
    const canClientEdit = period && actor === period.clientId && (period.status === 'open' || period.status === 'changes_requested');
    const canStaffEdit = period && client && canAccessClientData('staff', actor, {
      id: client.email,
      company: client.company,
      country: client.country,
      currency: client.currency,
      assignedStaffIds: ['Lena M.'],
    });
    if (period && !canClientEdit && !canStaffEdit) return state;
    const details = `${key} updated during review. No model training occurs in this demo.`;
    return {
      documents: state.documents.map((document) => document.id === id
        ? {
          ...document,
          fields: { ...document.fields, [key]: value },
          reviewHistory: [...(document.reviewHistory ?? []), {
            at: new Date().toISOString(),
            action: 'Field corrected',
            details,
          }],
        }
        : document),
      auditEvents: recordAudit(state, 'Field corrected', id, `${key} updated during document review.`, actor),
      ...(period ? {
        periodAudit: [
          periodAuditEntry('field_edited', id, details, actor, actor === current.clientId ? 'client' : 'staff'),
          ...state.periodAudit,
        ],
      } : {}),
    };
  }),
  recordReview: (id, action, details, update, actor = 'Demo reviewer') => set((state) => {
    const current = state.documents.find((document) => document.id === id);
    if (!current || (update.status && !canTransitionDocumentStatus(current.status, update.status))) return state;
    const period = current.periodId ? state.periods.find((item) => item.id === current.periodId) : undefined;
    const client = period && DEMO_CLIENTS.find((item) => item.email === period.clientId);
    const staffCanReview = period && client && canAccessClientData('staff', actor, {
      id: client.email,
      company: client.company,
      country: client.country,
      currency: client.currency,
      assignedStaffIds: ['Lena M.'],
    });
    if (period && !staffCanReview) return state;
    return {
      documents: state.documents.map((document) => document.id === id
        ? {
          ...document,
          ...update,
          reviewHistory: [...(document.reviewHistory ?? []), { at: new Date().toISOString(), action, details }],
        }
        : document),
      auditEvents: recordAudit(state, action, id, details, actor),
      ...(current.periodId && action.toLowerCase().includes('request') ? {
        periodAudit: [periodAuditEntry('changes_requested', id, details, actor, 'staff'), ...state.periodAudit],
      } : {}),
    };
  }),
  respondToRequest: (id, response) => set((state) => {
    const document = state.documents.find((item) => item.id === id);
    if (!document?.clientRequest) return state;
    const completedTasks = state.followUpTasks.filter((task) => task.documentId === id && task.status === 'open');
    const auditState = { ...state, auditEvents: recordAudit(state, 'Client response received', id, response, 'Demo client') };
    const auditEvents = completedTasks.reduce(
      (current, task) => recordAudit({ ...state, auditEvents: current }, 'Follow-up task completed', task.id, task.title, 'Demo client'),
      auditState.auditEvents,
    );
    return {
      documents: state.documents.map((document) => document.id === id && document.clientRequest
      ? {
        ...document,
        clientRequest: { ...document.clientRequest, response, resolvedAt: new Date().toISOString() },
        reviewHistory: [...(document.reviewHistory ?? []), {
          at: new Date().toISOString(),
          action: 'Client response',
          details: response,
        }],
      }
      : document),
    followUpTasks: state.followUpTasks.map((task) => task.documentId === id && task.status === 'open' ? { ...task, status: 'completed' } : task),
    auditEvents,
    };
  }),
  addAssistantQuestion: (question) => set((state) => ({
    assistantQuestions: [question, ...state.assistantQuestions],
    auditEvents: recordAudit(state, 'Client question added', question.id, question.question, question.clientId),
  })),
  replyToAssistantQuestion: (id, text, from) => set((state) => ({
    assistantQuestions: state.assistantQuestions.map((question) => question.id === id
      ? { ...question, replies: [...question.replies, { text, from, createdAt: new Date().toISOString() }] }
      : question),
    auditEvents: recordAudit(state, 'Client question answered', id, text, from),
  })),
  addFollowUpTask: (task, actor) => set((state) => ({
    followUpTasks: [{
      ...task,
      id: `task-${crypto.randomUUID()}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    }, ...state.followUpTasks],
    auditEvents: recordAudit(state, 'Follow-up task created', task.documentId ?? task.title, task.title, actor),
  })),
  toggleFollowUpTask: (id, actor) => set((state) => {
    const task = state.followUpTasks.find((item) => item.id === id);
    if (!task) return state;
    const status = task.status === 'open' ? 'completed' : 'open';
    return {
      followUpTasks: state.followUpTasks.map((item) => item.id === id ? { ...item, status } : item),
      auditEvents: recordAudit(state, status === 'completed' ? 'Follow-up task completed' : 'Follow-up task reopened', id, task.title, actor),
    };
  }),
  linkBankRecord: (statementId, transactionReference, accountingDocumentId, actor) => set((state) => {
    if (statementId === accountingDocumentId || state.bankLinks.some((link) => link.statementId === statementId && link.transactionReference === transactionReference && link.accountingDocumentId === accountingDocumentId)) return state;
    return {
      bankLinks: [...state.bankLinks, { statementId, transactionReference, accountingDocumentId, createdAt: new Date().toISOString() }],
      auditEvents: recordAudit(state, 'Bank transaction linked', `${statementId} · ${transactionReference}`, `Linked to accounting record ${accountingDocumentId}.`, actor),
    };
  }),
  unlinkBankRecord: (statementId, transactionReference, accountingDocumentId, actor) => set((state) => ({
    bankLinks: state.bankLinks.filter((link) => link.statementId !== statementId || link.transactionReference !== transactionReference || link.accountingDocumentId !== accountingDocumentId),
    auditEvents: recordAudit(state, 'Bank transaction unlinked', `${statementId} · ${transactionReference}`, `Unlinked accounting record ${accountingDocumentId}.`, actor),
  })),
  savePayrollDraft: (draft, actor) => set((state) => {
    const previous = state.payrollDrafts.find((item) => item.documentId === draft.documentId);
    if (previous?.status === 'approved') return state;
    const payrollDrafts = previous
      ? state.payrollDrafts.map((item) => item.documentId === draft.documentId ? { ...draft, updatedAt: new Date().toISOString() } : item)
      : [{ ...draft, updatedAt: new Date().toISOString() }, ...state.payrollDrafts];
    return {
      payrollDrafts,
      auditEvents: recordAudit(state, previous ? 'Payroll draft updated' : 'Payroll draft created', draft.documentId, `Payroll draft status: ${draft.status}.`, actor),
    };
  }),
  transitionPayrollDraft: (documentId, status, actor) => {
    let transitioned = false;
    set((state) => {
      const draft = state.payrollDrafts.find((item) => item.documentId === documentId);
      const allowed = draft && (
        (draft.status === 'draft' && status === 'validated' && draft.validationIssues.length === 0)
        || (draft.status === 'validated' && status === 'approved')
      );
      if (!draft || !allowed) return state;
      transitioned = true;
      return {
        payrollDrafts: state.payrollDrafts.map((item) => item.documentId === documentId ? { ...item, status, updatedAt: new Date().toISOString() } : item),
        auditEvents: recordAudit(state, `Payroll draft ${status}`, documentId, `Payroll draft moved from ${draft.status} to ${status}.`, actor),
      };
    });
    return transitioned;
  },
  setWorkspaceSetting: (key, value, actor) => set((state) => ({
    settings: { ...state.settings, [key]: value },
    auditEvents: recordAudit(state, 'Workspace setting changed', key, `${key} set to ${value ? 'enabled' : 'disabled'}.`, actor),
  })),
  setRoleAssignment: (id, role, actor) => set((state) => {
    const assignment = state.roleAssignments.find((item) => item.id === id);
    if (!assignment || assignment.role === role) return state;
    return {
      roleAssignments: state.roleAssignments.map((item) => item.id === id ? { ...item, role } : item),
      auditEvents: recordAudit(state, 'Demo role assignment changed', id, `${assignment.role} changed to ${role}.`, actor),
    };
  }),
  recordExport: (documentIds, actor) => set((state) => ({
    exports: [{ id: `export-${crypto.randomUUID()}`, at: new Date().toISOString(), actor, documentIds }, ...state.exports],
    auditEvents: recordAudit(state, 'CSV export downloaded', 'accounting-export', `${documentIds.length} records included.`, actor),
  })),
  recordPeriodAudit: (action, targetId, details, actor, role) => set((state) => ({
    periodAudit: [periodAuditEntry(action, targetId, details, actor, role), ...state.periodAudit],
  })),
}));

useDemoDocumentsStore.subscribe((state, previousState) => {
  if (suppressPersist || !state.storageHydrated) return;
  if (state.documents === previousState.documents
    && state.periods === previousState.periods
    && state.periodAudit === previousState.periodAudit) return;

  if (persistTimer !== undefined) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void (async () => {
      try {
        await writeDemoSnapshot({
          documents: state.documents,
          periods: state.periods,
          audit: state.periodAudit,
          metadata: {},
        });
        const usage = await getStorageUsage();
        useDemoDocumentsStore.setState({
          storageError: '',
          quotaWarning: Boolean(usage && usage.usage / usage.quota >= 0.8),
        });
        announceStorageChange();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Browser storage could not save this update.';
        useDemoDocumentsStore.setState({
          storageError: message,
          quotaWarning: isQuotaExceeded(error),
        });
        console.error('Could not persist FinTax demo data in this browser.', error);
      }
    })();
  }, 120);
});
