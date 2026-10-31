import type { DemoCategory } from '../demoWorkflow';
import type { ChecklistItem, Client, MonthlyPeriod, PeriodStatus } from './models';

export const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'state'>[] = [
  { key: 'bank_statement', label: 'Bank statement(s)', required: true },
  { key: 'purchase_invoice', label: 'Purchase invoices', required: true },
  { key: 'sales_invoice', label: 'Sales invoices', required: true },
  { key: 'receipt', label: 'Receipts', required: true },
  { key: 'cash_book', label: 'Cash book', required: true },
  { key: 'payroll', label: 'Payroll documents (timesheets / sick notes)', required: true },
  { key: 'correspondence', label: 'Tax-office letters', required: false },
];

export function createMonthlyChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map((item) => ({ ...item, state: 'missing' }));
}

export function folderPathForCategory(category: DemoCategory, year: number, month: number): string {
  const period = `${year}\\${String(month).padStart(2, '0')}`;
  if (['payroll', 'timesheet', 'sick_note', 'employee_record'].includes(category)) return `02_LoBu\\${period}`;
  if (['company_formation', 'commercial_register', 'contract', 'identity_document'].includes(category)) return '00_Schriftverkehr\\Gesellschaft';
  if (['correspondence', 'other_correspondence'].includes(category)) return `00_Schriftverkehr\\${period}`;
  return `01_FiBu\\${period}`;
}

export function periodIdFor(clientId: string, year: number, month: number): string {
  return `${clientId}:${year}-${String(month).padStart(2, '0')}`;
}

export function createMonthlyPeriod(clientId: string, year: number, month: number, status: PeriodStatus = 'open'): MonthlyPeriod {
  return {
    id: periodIdFor(clientId, year, month),
    clientId,
    year,
    month,
    status,
    checklist: createMonthlyChecklist(),
    documentIds: [],
    resolvedFindingIds: [],
    staffNotes: [],
    timeline: [],
  };
}

export function isChecklistComplete(checklist: ChecklistItem[]): boolean {
  return checklist.every((item) => !item.required
    || item.state === 'uploaded'
    || (item.state === 'not_applicable' && Boolean(item.naReason?.trim())));
}

export function checklistBlockers(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist.filter((item) => item.required
    && item.state !== 'uploaded'
    && !(item.state === 'not_applicable' && Boolean(item.naReason?.trim())));
}

export function canAccessClientData(
  role: 'client' | 'staff' | 'admin',
  actorId: string,
  client: Client,
): boolean {
  if (role === 'admin') return true;
  if (role === 'client') return actorId === client.id;
  return client.assignedStaffIds.includes(actorId);
}
