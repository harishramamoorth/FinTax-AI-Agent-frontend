import { CLIENT_DEMO_DOCUMENTS } from '../clientDemoData';
import { DEMO_CLIENTS } from '../demoAccounts';
import type { DemoCategory } from '../demoWorkflow';
import type { MonthlyPeriod, PeriodStatus } from './models';
import { createMonthlyPeriod, periodIdFor } from './periods';

const MONTHS = [7, 8, 9];

function seedCurrentPeriod(clientId: string, month: number, status: PeriodStatus): MonthlyPeriod {
  const period = createMonthlyPeriod(clientId, 2026, month, status);
  const documents = CLIENT_DEMO_DOCUMENTS.filter((document) => document.clientId === clientId
    && document.periodId === period.id);
  const uploadedCategories = new Set<DemoCategory>(documents.map((document) => document.category));
  period.documentIds = documents.map((document) => document.id);
  period.checklist = period.checklist.map((item) => {
    if (uploadedCategories.has(item.key as DemoCategory)) return { ...item, state: 'uploaded' as const };
    if (!item.required) return item;
    if (status === 'submitted' && item.key === 'payroll') return { ...item, state: 'missing' as const };
    return {
      ...item,
      state: 'not_applicable',
      naReason: item.key === 'payroll' ? 'No payroll changes for this client this month.' : 'No documents in this category this month.',
    };
  });
  period.timeline = [{
    id: `${period.id}:created`,
    at: '2026-10-01T08:00:00.000Z',
    actor: 'FinTax demo',
    action: status === 'open' ? 'Month opened' : status === 'submitted' ? 'Month submitted' : 'Month completed',
    details: 'Fictional seed period for the browser-only demo.',
  }];
  if (status === 'submitted') {
    period.submittedAt = '2026-10-22T09:00:00.000Z';
    period.submittedBy = clientId;
  }
  if (status === 'completed') period.completedAt = '2026-10-24T11:30:00.000Z';
  return period;
}

export function createSeedPeriods(): MonthlyPeriod[] {
  const history = DEMO_CLIENTS.flatMap((client) => MONTHS.map((month) => {
    const period = createMonthlyPeriod(client.email, 2026, month, 'completed');
    const documents = CLIENT_DEMO_DOCUMENTS.filter((document) => document.clientId === client.email
      && document.periodId === period.id);
    const uploadedCategories = new Set(documents.map((document) => document.category));
    period.documentIds = documents.map((document) => document.id);
    period.checklist = period.checklist.map((item) => {
      if (uploadedCategories.has(item.key as DemoCategory)) return { ...item, state: 'uploaded' as const };
      return { ...item, state: 'not_applicable' as const, naReason: 'Historical demo period seeded as complete.' };
    });
    period.completedAt = `2026-${String(month).padStart(2, '0')}-28T12:00:00.000Z`;
    period.timeline = [{
      id: `${period.id}:seed`,
      at: period.completedAt,
      actor: 'FinTax demo',
      action: 'Month completed',
      details: 'Fictional completed month for demo history.',
    }];
    return period;
  }));
  return [
    ...history,
    seedCurrentPeriod(DEMO_CLIENTS[0].email, 10, 'open'),
    seedCurrentPeriod(DEMO_CLIENTS[1].email, 10, 'submitted'),
    seedCurrentPeriod(DEMO_CLIENTS[2].email, 10, 'completed'),
  ];
}

export function currentDemoPeriodId(clientId: string, now = new Date()): string {
  return periodIdFor(clientId, now.getFullYear(), now.getMonth() + 1);
}
