import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFields, type DemoDocument } from '../features/fintax/shared/demoWorkflow';
import { createMonthlyPeriod } from '../features/fintax/shared/storage/periods';
import type { MonthAnalysis } from '../features/fintax/shared/storage/models';
import { documentsVisibleTo } from '../features/fintax/shared/storage/selectors';
import { useDemoDocumentsStore } from './demoDocumentsStore';

const makeDocument = (): DemoDocument => ({
  id: 'CLIENT-TEST01',
  name: 'invoice-demo.pdf',
  category: 'purchase_invoice',
  sizeBytes: 100,
  createdAt: '2026-10-23T00:00:00.000Z',
  status: 'review',
  confidence: 0.6,
  fields: sampleFields('purchase_invoice', 'CLIENT-TEST01'),
  sample: false,
  clientId: 'client-a@example.demo',
  workflowStage: 'staff_review',
  reviewHistory: [],
});

describe('shared demo document store', () => {
  beforeEach(() => useDemoDocumentsStore.setState({
    documents: [],
    periods: [],
    periodAudit: [],
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
  }));

  it('shares uploaded documents and propagates staff approval', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Approved', 'Reviewed in demo.', {
      status: 'approved',
      workflowStage: 'completed',
    });

    const [document] = useDemoDocumentsStore.getState().documents;
    expect(document.status).toBe('approved');
    expect(document.workflowStage).toBe('completed');
    expect(document.reviewHistory?.at(-1)?.action).toBe('Approved');
  });

  it('stores client information requests and responses in review history', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().addFollowUpTask({
      title: 'Follow up on invoice',
      clientId: 'client-a@example.demo',
      documentId: 'CLIENT-TEST01',
      dueDate: '2026-10-30',
      owner: 'Demo reviewer',
    }, 'Demo reviewer');
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Information requested', 'Please send a clearer invoice.', {
      status: 'needs_information',
      clientRequest: { reason: 'Please send a clearer invoice.', createdAt: '2026-10-23T01:00:00.000Z' },
    });
    useDemoDocumentsStore.getState().respondToRequest('CLIENT-TEST01', 'Replacement uploaded.');

    const [document] = useDemoDocumentsStore.getState().documents;
    expect(document.clientRequest?.response).toBe('Replacement uploaded.');
    expect(document.clientRequest?.resolvedAt).toBeTruthy();
    expect(document.clientRequest?.status).toBe('pending_review');
    expect(document.status).toBe('review');
    expect(document.workflowStage).toBe('staff_review');
    expect(document.updatedAt).toBeTruthy();
    expect(document.reviewHistory?.map((event) => event.action)).toEqual(['Information requested', 'Client response']);
    expect(useDemoDocumentsStore.getState().followUpTasks[0].status).toBe('completed');
  });

  it('lets a client replacement return a period-linked clarification to staff review', () => {
    const period = createMonthlyPeriod('client@fintax.demo', 2026, 10);
    useDemoDocumentsStore.setState({
      documents: [{
        ...makeDocument(),
        id: 'CLIENT-REPLACEMENT',
        clientId: period.clientId,
        periodId: period.id,
        status: 'needs_information',
        clientRequest: { reason: 'Please upload a clearer copy.', createdAt: '2026-10-23T01:00:00.000Z' },
      }],
      periods: [period],
    });

    useDemoDocumentsStore.getState().recordReview('CLIENT-REPLACEMENT', 'Replacement uploaded', 'Client uploaded a clearer invoice.', {
      clientRequest: {
        reason: 'Please upload a clearer copy.',
        createdAt: '2026-10-23T01:00:00.000Z',
        response: 'Replacement uploaded: invoice-new.pdf',
        resolvedAt: new Date().toISOString(),
        status: 'pending_review',
      },
    }, period.clientId);

    expect(useDemoDocumentsStore.getState().documents[0]).toMatchObject({
      status: 'review',
      workflowStage: 'staff_review',
      clientRequest: { status: 'pending_review', response: 'Replacement uploaded: invoice-new.pdf' },
    });
  });

  it('marks a client request resolved after its response is approved', () => {
    useDemoDocumentsStore.setState({
      documents: [{
        ...makeDocument(),
        status: 'review',
        clientRequest: { reason: 'Please confirm this amount.', createdAt: '2026-10-23T01:00:00.000Z', response: 'Confirmed.', status: 'pending_review' },
      }],
    });
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Approved', 'Response approved.', { status: 'approved' });

    expect(useDemoDocumentsStore.getState().documents[0].clientRequest?.status).toBe('resolved');
  });

  it('allows admins to manage period-linked documents while preserving staff assignment checks', () => {
    const period = createMonthlyPeriod('client@fintax.demo', 2026, 10);
    useDemoDocumentsStore.setState({
      documents: [{ ...makeDocument(), id: 'CLIENT-PERIOD01', clientId: period.clientId, periodId: period.id }],
      periods: [period],
      roleAssignments: [
        ...useDemoDocumentsStore.getState().roleAssignments,
        { id: 'admin-alex', name: 'Alex Morgan', email: 'admin@fintax.demo', role: 'admin' },
      ],
    });

    useDemoDocumentsStore.getState().updateDocument('CLIENT-PERIOD01', { assignedStaffId: 'staff-demo' }, 'Alex Morgan');
    useDemoDocumentsStore.getState().recordReview('CLIENT-PERIOD01', 'Approved', 'Reviewed by admin.', {
      status: 'approved',
      workflowStage: 'completed',
    }, 'Alex Morgan');

    expect(useDemoDocumentsStore.getState().documents[0]).toMatchObject({
      assignedStaffId: 'staff-demo',
      status: 'approved',
      workflowStage: 'completed',
    });
  });

  it('lets the specifically assigned staff login edit and review a period document', () => {
    const period = createMonthlyPeriod('client@fintax.demo', 2026, 10);
    useDemoDocumentsStore.setState({
      documents: [{
        ...makeDocument(),
        id: 'CLIENT-ASSIGNED01',
        clientId: period.clientId,
        periodId: period.id,
        assignedStaffId: 'staff-taylor',
      }],
      periods: [period],
      roleAssignments: [
        ...useDemoDocumentsStore.getState().roleAssignments,
        { id: 'staff-taylor', name: 'Taylor Staff', email: 'taylor@fintax.demo', role: 'staff' },
      ],
    });

    useDemoDocumentsStore.getState().updateFields('CLIENT-ASSIGNED01', 'counterparty', 'Corrected supplier', 'staff-taylor');
    useDemoDocumentsStore.getState().recordReview('CLIENT-ASSIGNED01', 'Approved', 'Reviewed by assigned staff.', {
      status: 'approved',
      workflowStage: 'completed',
    }, 'staff-taylor');

    expect(useDemoDocumentsStore.getState().documents[0]).toMatchObject({
      fields: { counterparty: 'Corrected supplier' },
      status: 'approved',
      workflowStage: 'completed',
    });
  });

  it('keeps client ownership attached to each record for per-client filtering', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().addDocument({
      ...makeDocument(),
      id: 'CLIENT-TEST02',
      clientId: 'client-b@example.demo',
    });

    const clientA = useDemoDocumentsStore.getState().documents.filter((document) => document.clientId === 'client-a@example.demo');
    expect(clientA.map((document) => document.id)).toEqual(['CLIENT-TEST01']);
  });

  it('shares client questions with staff replies while keeping the owning client attached', () => {
    const question = {
      id: 'question-1',
      clientId: 'client-a@example.demo',
      question: 'Please clarify this bank transaction.',
      answer: 'I can send this to your accountant.',
      references: ['CLIENT-TEST01 · invoice-demo.pdf'],
      createdAt: '2026-10-23T02:00:00.000Z',
      replies: [],
    };
    useDemoDocumentsStore.getState().addAssistantQuestion(question);
    useDemoDocumentsStore.getState().replyToAssistantQuestion(question.id, 'Please check the transfer reference.', 'Demo accountant');

    const [stored] = useDemoDocumentsStore.getState().assistantQuestions;
    expect(stored.clientId).toBe('client-a@example.demo');
    expect(stored.replies[0].text).toBe('Please check the transfer reference.');
    expect(useDemoDocumentsStore.getState().assistantQuestions.filter((entry) => entry.clientId === 'client-b@example.demo')).toEqual([]);
  });

  it('records linked bank documents and allows links to be removed', () => {
    const store = useDemoDocumentsStore.getState();
    store.linkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    store.linkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    expect(useDemoDocumentsStore.getState().bankLinks).toHaveLength(1);

    useDemoDocumentsStore.getState().unlinkBankRecord('BANK-1', 'Transaction 1', 'INVOICE-1', 'Demo staff');
    expect(useDemoDocumentsStore.getState().bankLinks).toHaveLength(0);
  });

  it('requires payroll drafts to move from draft through validation before approval', () => {
    useDemoDocumentsStore.getState().savePayrollDraft({
      documentId: 'PAY-1',
      employee: 'Sample employee',
      payPeriod: '2026-10-01',
      grossAmount: '2000.00',
      netAmount: '1500.00',
      status: 'draft',
      validationIssues: [],
      updatedAt: '2026-10-23T00:00:00.000Z',
    }, 'Demo reviewer');

    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'approved', 'Demo reviewer')).toBe(false);
    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'validated', 'Demo reviewer')).toBe(true);
    expect(useDemoDocumentsStore.getState().transitionPayrollDraft('PAY-1', 'approved', 'Demo reviewer')).toBe(true);
    expect(useDemoDocumentsStore.getState().payrollDrafts[0].status).toBe('approved');
  });

  it('rejects invalid document status transitions and retains audit events', () => {
    useDemoDocumentsStore.getState().addDocument({ ...makeDocument(), status: 'approved' });
    useDemoDocumentsStore.getState().recordReview('CLIENT-TEST01', 'Reopened', 'Not allowed.', { status: 'review' });

    expect(useDemoDocumentsStore.getState().documents[0].status).toBe('approved');
    expect(useDemoDocumentsStore.getState().auditEvents.some((event) => event.action === 'Reopened')).toBe(false);
  });

  it('records administration changes and successful exports in the session audit', () => {
    const store = useDemoDocumentsStore.getState();
    store.setWorkspaceSetting('exportsEnabled', false, 'Admin Demo User');
    store.setRoleAssignment('staff-demo', 'admin', 'Admin Demo User');
    store.recordExport(['INVOICE-1', 'RECEIPT-1'], 'Staff Demo User');

    const state = useDemoDocumentsStore.getState();
    expect(state.settings.exportsEnabled).toBe(false);
    expect(state.roleAssignments.find((assignment) => assignment.id === 'staff-demo')?.role).toBe('admin');
    expect(state.exports[0].documentIds).toEqual(['INVOICE-1', 'RECEIPT-1']);
    expect(state.auditEvents.map((event) => event.action)).toEqual([
      'CSV export downloaded',
      'Demo role assignment changed',
      'Workspace setting changed',
    ]);
  });

  it('records document assignments in review and audit history', () => {
    useDemoDocumentsStore.getState().addDocument(makeDocument());
    useDemoDocumentsStore.getState().updateDocument('CLIENT-TEST01', { assignedStaffId: 'staff-demo' }, 'Alex Morgan');

    const document = useDemoDocumentsStore.getState().documents[0];
    expect(document.assignedStaffId).toBe('staff-demo');
    expect(document.reviewHistory?.at(-1)).toMatchObject({
      action: 'Document assignment changed',
      details: 'Assigned to staff-demo.',
    });
    expect(useDemoDocumentsStore.getState().auditEvents[0]).toMatchObject({
      action: 'Document assignment changed',
      target: 'CLIENT-TEST01',
    });
    const historyLength = document.reviewHistory?.length ?? 0;
    const auditLength = useDemoDocumentsStore.getState().auditEvents.length;
    useDemoDocumentsStore.getState().updateDocument('CLIENT-TEST01', { confidence: 0.8 }, 'Lena M.');
    expect(useDemoDocumentsStore.getState().documents[0].assignedStaffId).toBe('staff-demo');
    expect(useDemoDocumentsStore.getState().documents[0].reviewHistory).toHaveLength(historyLength);
    expect(useDemoDocumentsStore.getState().auditEvents).toHaveLength(auditLength);
  });

  it('routes a client upload from the admin queue to only its assigned staff member', () => {
    const document = { ...makeDocument(), id: 'CLIENT-ROUTED01', clientId: 'client@fintax.demo', clientSaved: true };
    useDemoDocumentsStore.setState({
      roleAssignments: [
        ...useDemoDocumentsStore.getState().roleAssignments,
        { id: 'staff-taylor', name: 'Taylor Staff', email: 'taylor@fintax.demo', role: 'staff' },
      ],
    });
    useDemoDocumentsStore.getState().addDocument(document, document.clientId);

    expect(documentsVisibleTo(useDemoDocumentsStore.getState().documents, 'client', document.clientId)).toContainEqual(document);
    expect(documentsVisibleTo(useDemoDocumentsStore.getState().documents, 'admin', 'Alex Morgan')).toContainEqual(document);

    useDemoDocumentsStore.getState().updateDocument(document.id, { assignedStaffId: 'staff-taylor' }, 'Alex Morgan');
    const routedDocuments = useDemoDocumentsStore.getState().documents;

    expect(documentsVisibleTo(routedDocuments, 'client', document.clientId)).toContainEqual(
      expect.objectContaining({ id: document.id, assignedStaffId: 'staff-taylor' }),
    );
    expect(documentsVisibleTo(routedDocuments, 'admin', 'Alex Morgan')).toContainEqual(
      expect.objectContaining({ id: document.id, assignedStaffId: 'staff-taylor' }),
    );
    expect(documentsVisibleTo(routedDocuments, 'staff', 'staff-taylor', 'Taylor Staff')).toContainEqual(
      expect.objectContaining({ id: document.id, assignedStaffId: 'staff-taylor' }),
    );
    expect(documentsVisibleTo(routedDocuments, 'staff', 'staff-demo', 'Lena M.')).not.toContainEqual(
      expect.objectContaining({ id: document.id }),
    );
  });

  it('manages session-only demo profiles without treating them as authenticated accounts', () => {
    const store = useDemoDocumentsStore.getState();
    expect(store.createDemoProfile({ name: 'Taylor Staff', email: 'taylor@example.demo', role: 'staff' }, 'Alex Morgan')).toBe(true);
    const created = useDemoDocumentsStore.getState().roleAssignments.find((profile) => profile.email === 'taylor@example.demo');
    expect(created).toMatchObject({ name: 'Taylor Staff', role: 'staff', active: true });
    expect(created?.createdAt).toBeTruthy();
    expect(useDemoDocumentsStore.getState().createDemoProfile({ name: 'Duplicate', email: 'TAYLOR@example.demo', role: 'client' }, 'Alex Morgan')).toBe(false);
    expect(useDemoDocumentsStore.getState().updateDemoProfile(created!.id, { name: 'Taylor Edited', email: 'taylor@example.demo' }, 'Alex Morgan')).toBe(true);
    expect(useDemoDocumentsStore.getState().toggleDemoProfile(created!.id, 'Alex Morgan')).toBe(true);
    expect(useDemoDocumentsStore.getState().roleAssignments.find((profile) => profile.id === created!.id)?.active).toBe(false);
    expect(useDemoDocumentsStore.getState().deleteDemoProfile(created!.id, 'Alex Morgan')).toBe(true);
  });

  it('gates month submission on required checklist completion and records the submitted state', () => {
    const period = createMonthlyPeriod('client-a@example.demo', 2026, 10);
    useDemoDocumentsStore.setState({ periods: [period], documents: [] });
    const store = useDemoDocumentsStore.getState();
    expect(store.submitPeriod(period.id, period.clientId, period.clientId).ok).toBe(false);

    useDemoDocumentsStore.setState({
      periods: [{
        ...period,
        checklist: period.checklist.map((item) => ({ ...item, state: 'uploaded' })),
      }],
    });
    expect(useDemoDocumentsStore.getState().submitPeriod(period.id, period.clientId, period.clientId).ok).toBe(true);
    expect(useDemoDocumentsStore.getState().periods[0].status).toBe('submitted');
    expect(useDemoDocumentsStore.getState().periodAudit[0].action).toBe('month_finished');
  });

  it('requires client extraction review to be saved before monthly submission', () => {
    const period = createMonthlyPeriod('client@fintax.demo', 2026, 10);
    const readyPeriod = {
      ...period,
      checklist: period.checklist.map((item) => ({ ...item, state: 'uploaded' as const })),
      documentIds: ['CLIENT-TEST01'],
    };
    const upload = {
      ...makeDocument(),
      clientId: period.clientId,
      periodId: period.id,
      clientSaved: false,
    };
    useDemoDocumentsStore.setState({ periods: [readyPeriod], documents: [upload] });

    expect(useDemoDocumentsStore.getState().submitPeriod(period.id, period.clientId, period.clientId)).toMatchObject({
      ok: false,
      blockers: ['Review and save every uploaded document before submitting the month.'],
    });

    useDemoDocumentsStore.getState().updateDocument(upload.id, { clientSaved: true }, period.clientId);
    expect(useDemoDocumentsStore.getState().submitPeriod(period.id, period.clientId, period.clientId).ok).toBe(true);
  });

  it('requires assigned staff and blocks approval while error findings remain', () => {
    const period = { ...createMonthlyPeriod('client@fintax.demo', 2026, 10, 'submitted'), submittedAt: '2026-10-22T09:00:00.000Z' };
    const analysis: MonthAnalysis = {
      analyzedAt: '2026-10-31T00:00:00.000Z',
      findings: [{
        id: 'error-1',
        severity: 'error',
        documentIds: [],
        title: 'Missing statement',
        evidence: 'Required item absent.',
        recommendedSolution: 'Request it.',
        suggestedAction: 'request_document',
      }],
    };
    useDemoDocumentsStore.setState({ periods: [period], documents: [] });
    expect(useDemoDocumentsStore.getState().reviewMonth(period.id, 'Unassigned reviewer', 'start_review', 'Opening review.', analysis)).toBe(false);
    expect(useDemoDocumentsStore.getState().reviewMonth(period.id, 'Lena M.', 'start_review', 'Opening review.', analysis)).toBe(true);
    expect(useDemoDocumentsStore.getState().reviewMonth(period.id, 'Lena M.', 'approve', 'Approve.', analysis)).toBe(false);
    expect(useDemoDocumentsStore.getState().reviewMonth(period.id, 'Lena M.', 'request_changes', 'Please add the statement.', analysis)).toBe(true);
    expect(useDemoDocumentsStore.getState().periods[0].status).toBe('changes_requested');
  });

});
