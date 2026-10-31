import { DEMO_CATEGORIES, type DemoCategory } from '../shared/demoWorkflow';
import type { AssistantLanguage } from './clientAssistant';

export const PIPELINE = [
  ['received', 'Received'], ['validation', 'File validation'], ['classification', 'Classification'], ['extraction', 'Data extraction'],
  ['checks', 'Validation checks'], ['confidence', 'Confidence'], ['staff_review', 'Staff review'],
] as const;

export const CATEGORY_GROUPS: { label: string; categories: DemoCategory[] }[] = [
  { label: 'Accounting', categories: ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'] },
  { label: 'Payroll', categories: ['payroll', 'timesheet', 'sick_note', 'employee_record'] },
  { label: 'Company records', categories: ['company_formation', 'commercial_register', 'contract'] },
  { label: 'Correspondence', categories: ['correspondence', 'other_correspondence'] },
  { label: 'Identity', categories: ['identity_document'] },
  { label: 'Other', categories: ['other'] },
];

export const categoryLabel = (category: DemoCategory) => DEMO_CATEGORIES.find(([key]) => key === category)?.[1] ?? category;
export const t3 = (language: AssistantLanguage, en: string, de: string, ar: string) => language === 'de' ? de : language === 'ar' ? ar : en;
export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
