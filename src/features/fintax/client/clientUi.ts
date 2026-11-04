import { Building2, Mail, Receipt, Users } from 'lucide-react';

export type ClientArea = 'formation' | 'payroll' | 'accounting' | 'correspondence';

/** Client portal colors: teal actions, gold accents, navy text, and cream surfaces. */
export const ui = {
  page: 'bg-[#f7f4ec] text-[#0f1f3d]',
  card: 'rounded-2xl border border-[#E6E0D0] bg-white',
  heading: 'font-serif font-semibold tracking-tight text-[#0F1B3D]',
  muted: 'text-[#4A5468]',
  btn: 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c9a24b] disabled:cursor-not-allowed disabled:opacity-40',
  btnPrimary: 'bg-[#0B7F99] text-white hover:bg-[#086B80]',
  btnOutline: 'border border-[#E6E0D0] bg-white text-[#0F1B3D] hover:border-[#B07A2A]',
  btnGhost: 'text-slate-600 hover:bg-[#f7f4ec]',
  input: 'h-9 rounded-xl border border-[#E6E0D0] bg-white px-3 text-xs text-[#0F1B3D] outline-none focus:border-[#B07A2A]',
} as const;

export const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export const AREAS: { key: ClientArea; icon: typeof Building2; title: string; hint: string; hasUploadPeriod: boolean }[] = [
  { key: 'formation', icon: Building2, title: 'Formation documents', hint: 'One-time · required before activation', hasUploadPeriod: false },
  { key: 'payroll', icon: Users, title: 'Payroll documents', hint: 'Submit monthly', hasUploadPeriod: true },
  { key: 'accounting', icon: Receipt, title: 'Financial accounting', hint: 'Receipts, bank statements, invoices', hasUploadPeriod: true },
  { key: 'correspondence', icon: Mail, title: 'Correspondence', hint: 'New, replaces “Other”', hasUploadPeriod: true },
];

const CATEGORY_AREA: Record<string, ClientArea> = {
  company_formation: 'formation',
  commercial_register: 'formation',
  identity_document: 'formation',
  payroll: 'payroll',
  timesheet: 'payroll',
  employee_record: 'payroll',
  sick_note: 'payroll',
  purchase_invoice: 'accounting',
  sales_invoice: 'accounting',
  receipt: 'accounting',
  bank_statement: 'accounting',
  cash_book: 'accounting',
};

export const areaOf = (document: { area?: string; category: string }): ClientArea =>
  (document.area as ClientArea | undefined) ?? CATEGORY_AREA[document.category] ?? 'correspondence';
