import type { DemoCategory, DemoDocument, DemoFields } from '../demoWorkflow';

export interface Client {
  id: string;
  company: string;
  country: string;
  currency: string;
  assignedStaffIds: string[];
}

export type PeriodStatus = 'open' | 'submitted' | 'in_review' | 'changes_requested' | 'completed';

export interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  state: 'missing' | 'uploaded' | 'not_applicable';
  naReason?: string;
}

export interface TimelineEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  details: string;
}

export interface StaffNote {
  id: string;
  at: string;
  actor: string;
  text: string;
}

export interface MonthAnalysisFinding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  documentIds: string[];
  title: string;
  evidence: string;
  recommendedSolution: string;
  suggestedAction: 'fix_field' | 'request_document' | 'mark_reviewed' | 'merge_duplicate' | 'create_task';
}

export interface MonthAnalysis {
  analyzedAt: string;
  findings: MonthAnalysisFinding[];
}

export interface MonthlyPeriod {
  id: string;
  clientId: string;
  year: number;
  month: number;
  status: PeriodStatus;
  submittedAt?: string;
  submittedBy?: string;
  completedAt?: string;
  checklist: ChecklistItem[];
  documentIds: string[];
  resolvedFindingIds: string[];
  staffNotes: StaffNote[];
  timeline: TimelineEvent[];
  analysis?: MonthAnalysis;
}

export interface StoredDocument {
  id: string;
  clientId: string;
  periodId: string;
  folder: string;
  category: DemoCategory;
  fileName: string;
  mime: string;
  size: number;
  pageCount?: number;
  uploadedAt: string;
  status: DemoDocument['status'];
  ocr: {
    engine: string;
    language: string;
    meanConfidence: number;
    text: string;
    pages: { page: number; confidence: number; text: string }[];
  };
  fields: DemoFields;
  fieldConfidence: Partial<Record<keyof DemoFields, number>>;
  warnings: string[];
  reviewHistory: NonNullable<DemoDocument['reviewHistory']>;
}

export interface DemoAuditEntry {
  id: string;
  actor: string;
  role: 'client' | 'staff' | 'admin' | 'system';
  action: 'login' | 'upload' | 'ocr_done' | 'field_edited' | 'month_finished' | 'review_started' | 'changes_requested' | 'approved';
  timestamp: string;
  targetId: string;
  details: string;
}

export interface StoredDemoFile {
  documentId: string;
  blob: Blob;
  fileName: string;
  mime: string;
  size: number;
}
