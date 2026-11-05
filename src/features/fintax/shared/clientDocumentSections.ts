import type { DemoCategory, DemoDocument } from './demoWorkflow';

export const CLIENT_DOCUMENT_SECTIONS = [
  {
    id: 'company',
    label: 'Company documents',
    description: 'Setup and registration documents',
    area: 'formation',
    categories: ['company_formation', 'commercial_register', 'identity_document', 'contract'] as DemoCategory[],
  },
  {
    id: 'payroll_uploads',
    label: 'Payroll',
    description: 'Payslips and timesheets',
    area: 'payroll',
    categories: ['payroll', 'timesheet', 'sick_note', 'employee_record'] as DemoCategory[],
  },
  {
    id: 'accounting_uploads',
    label: 'Accounting',
    description: 'Monthly · bank statements, invoices, cash and fuel receipts',
    area: 'accounting',
    categories: ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'] as DemoCategory[],
  },
  {
    id: 'client_correspondence',
    label: 'Correspondence',
    description: 'Formerly “Other” · letters',
    area: 'correspondence',
    categories: ['correspondence', 'other_correspondence', 'other'] as DemoCategory[],
  },
] as const;

export type ClientDocumentSectionId = typeof CLIENT_DOCUMENT_SECTIONS[number]['id'];

export function documentsInClientSection(
  documents: DemoDocument[],
  sectionId: ClientDocumentSectionId,
): DemoDocument[] {
  const section = CLIENT_DOCUMENT_SECTIONS.find((item) => item.id === sectionId);
  if (!section) return [];
  return documents.filter((document) => document.area
    ? document.area === section.area
    : section.categories.includes(document.category));
}
