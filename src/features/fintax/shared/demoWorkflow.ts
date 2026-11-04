export const DEMO_CATEGORIES = [
  ['bank_statement', 'Bank statement'],
  ['purchase_invoice', 'Purchase invoice'],
  ['sales_invoice', 'Sales invoice'],
  ['receipt', 'Receipt'],
  ['cash_book', 'Cash book / cash receipt'],
  ['payroll', 'Payroll / payslip'],
  ['timesheet', 'Timesheet'],
  ['sick_note', 'Sick note'],
  ['employee_record', 'Employee record'],
  ['company_formation', 'Company formation'],
  ['commercial_register', 'Commercial register extract'],
  ['contract', 'Contract'],
  ['correspondence', 'Tax-office correspondence'],
  ['other_correspondence', 'Other correspondence'],
  ['identity_document', 'ID document'],
  ['other', 'Other'],
] as const;

export type DemoCategory = typeof DEMO_CATEGORIES[number][0];

export interface DemoFields {
  documentDate: string;
  counterparty: string;
  reference: string;
  description: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  grossAmount: string;
  debitAccount: string;
  creditAccount: string;
}

export interface DemoDocument {
  id: string;
  name: string;
  category: DemoCategory;
  area?: 'formation' | 'payroll' | 'accounting' | 'correspondence';
  previousVersions?: { id: string; name: string; uploadedAt: string; sizeBytes: number }[];
  periodId?: string;
  folder?: string;
  mime?: string;
  sizeBytes: number;
  createdAt: string;
  status: 'processing' | 'review' | 'approved' | 'password_required' | 'action_required' | 'needs_information' | 'rejected';
  confidence: number;
  fields: DemoFields;
  sample: boolean;
  clientSaved?: boolean;
  clientId?: string;
  paymentStatus?: 'paid' | 'unpaid' | 'unknown';
  currency?: string;
  replacementFor?: string;
  workflowStage?: 'received' | 'validation' | 'classification' | 'extraction' | 'checks' | 'confidence' | 'staff_review' | 'completed';
  detectedLanguage?: string;
  ocrEngine?: string;
  ocrPages?: { page: number; confidence: number; text: string }[];
  validationWarnings?: string[];
  extractedDetails?: Record<string, string>;
  reviewHistory?: { at: string; action: string; details: string }[];
  clientRequest?: { reason: string; createdAt: string; response?: string; resolvedAt?: string; status?: 'pending_review' };
  note?: string;
  clientNote?: string;
  file?: File;
  extractedText?: string;
  pageCount?: number;
  processingProgress?: number;
}

const DOCUMENT_STATUS_TRANSITIONS: Record<DemoDocument['status'], readonly DemoDocument['status'][]> = {
  processing: ['review', 'password_required', 'action_required'],
  review: ['approved', 'needs_information', 'action_required', 'rejected'],
  approved: [],
  password_required: ['review', 'action_required'],
  action_required: ['review', 'needs_information', 'rejected'],
  needs_information: ['review', 'action_required', 'rejected'],
  rejected: ['review'],
};

export function canTransitionDocumentStatus(from: DemoDocument['status'], to: DemoDocument['status']): boolean {
  return from === to || DOCUMENT_STATUS_TRANSITIONS[from].includes(to);
}

const acceptedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'tif', 'tiff', 'bmp', 'xlsx', 'csv', 'txt', 'docx']);
const acceptedTypes = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'image/tiff', 'image/bmp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
export const MAX_DEMO_FILE_BYTES = 50 * 1024 * 1024;
export const CLIENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function validateDemoFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
  maxFileBytes = MAX_DEMO_FILE_BYTES,
): string | null {
  if (file.size === 0) return 'This file is empty.';
  if (file.size > maxFileBytes) return `Files must be ${maxFileBytes / 1024 / 1024} MB or smaller.`;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const supportedType = acceptedTypes.has(file.type.toLowerCase());
  if (!acceptedExtensions.has(extension) && !supportedType) {
    return 'Choose a PDF, common photo/scan (JPEG, PNG, WebP, HEIC, TIFF, BMP), XLSX, CSV, TXT, or DOCX file.';
  }
  return null;
}

export function categoryForFilename(name: string, text = ''): DemoCategory {
  const value = `${name} ${text}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(?:bank|statement|kontoauszug)\b/.test(value)) return 'bank_statement';
  if (/\b(?:purchase|eingang|supplier|vendor)\b/.test(value)) return 'purchase_invoice';
  if (/\b(?:sales|ausgang|customer)\b/.test(value)) return 'sales_invoice';
  if (/\b(?:receipt|beleg|quittung)\b/.test(value)) return 'receipt';
  if (/\b(?:cash ?book|kassenbuch)\b/.test(value)) return 'cash_book';
  if (/\b(?:payroll|payslip|salary|lohn|gehalt)\b/.test(value)) return 'payroll';
  if (/\b(?:timesheet|time sheet|arbeitszeit)\b/.test(value)) return 'timesheet';
  if (/\b(?:sick note|sick leave|krankmeldung|arbeitsunfähigkeit)\b/.test(value)) return 'sick_note';
  if (/\b(?:employee|staff|mitarbeiter)\b/.test(value)) return 'employee_record';
  if (/\b(?:commercial register|handelsregister|register extract)\b/.test(value)) return 'commercial_register';
  if (/\b(?:company formation|formation|gründung)\b/.test(value)) return 'company_formation';
  if (/\b(?:lease|rental|mietvertrag)\b/.test(value)) return 'other_correspondence';
  if (/\b(?:contract|vertrag|gesellschaftsvertrag|articles of association|partnership deed)\b/.test(value)) return 'contract';
  if (/\b(?:tax office|finanzamt)\b/.test(value)) return 'correspondence';
  if (/\b(?:correspondence|letter|brief)\b/.test(value)) return 'other_correspondence';
  if (/\b(?:passport|identity|emirates|ausweis|id card)\b/.test(value)) return 'identity_document';
  return 'other';
}

export function sampleFields(category: DemoCategory, id: string): DemoFields {
  const isBank = category === 'bank_statement';
  const gross = isBank || category === 'payroll' ? '1240.00' : '119.00';
  const net = isBank || category === 'payroll' ? gross : '100.00';
  const vat = isBank || category === 'payroll' ? '0.00' : '19.00';
  return {
    documentDate: '2026-10-18',
    counterparty: isBank ? 'Rheinland Bank AG' : 'Muster GmbH',
    reference: `DEMO-${id.slice(-5).toUpperCase()}`,
    description: isBank ? 'Incoming transfer · sample data' : 'Office supplies · sample data',
    netAmount: net,
    vatRate: isBank || category === 'payroll' ? '0' : '19',
    vatAmount: vat,
    grossAmount: gross,
    debitAccount: isBank ? '1200' : '4930',
    creditAccount: isBank ? '8400' : '1200',
  };
}

export function emptyDemoFields(): DemoFields {
  return {
    documentDate: '',
    counterparty: '',
    reference: '',
    description: '',
    netAmount: '',
    vatRate: '',
    vatAmount: '',
    grossAmount: '',
    debitAccount: '',
    creditAccount: '',
  };
}

function amountFromText(text: string, labels: string): string {
  const match = text.match(new RegExp(`(?:${labels})\\s*[:#]?\\s*(?:(?:EUR|€)\\s*)?(-?\\d[\\d\\s.,]*\\d|-?\\d)\\s*(?:EUR|€)?(?![\\d.,]|\\s*%)`, 'i'));
  if (!match) return '';
  const raw = match[1].replace(/\s/g, '');
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  const decimalSeparator = comma > dot ? ',' : dot > comma ? '.' : '';
  let normalized = raw;
  if (decimalSeparator) {
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.split(groupingSeparator).join('').replace(decimalSeparator, '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
}

export function extractDemoFields(text: string): { fields: DemoFields; confidence: number } {
  const dateMatch = text.match(/(?:invoice\s*date|document\s*date|rechnungsdatum|belegdatum|datum|date)\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
  let documentDate = '';
  if (dateMatch) {
    const value = dateMatch[1];
    if (/^\d{4}-/.test(value)) documentDate = value;
    else {
      const [day, month, year] = value.split(/[./]/);
      const fullYear = year.length === 2 ? `20${year}` : year;
      documentDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  const referenceMatch = text.match(/(?:invoice\s*(?:no\.?|number)|rechnungsnummer|rechnung(?:s-?nr\.?)|beleg(?:nummer|nr\.?)|reference|referenz)\s*[:#]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const legalEntityLine = lines.find((line) => line.length <= 120
    && /\b(?:GmbH\s*&\s*Co\.?\s*KG|GmbH|AG|UG(?:\s*\(haftungsbeschränkt\))?|KG|OHG|GbR|e\.?\s*K\.?)\b/i.test(line)
    && !/^(?:gesellschaftsvertrag|articles? of association|partnership deed)\b/i.test(line));
  const counterpartyLine = legalEntityLine ?? lines.find((line) =>
    line.length >= 3 && line.length <= 100
    && !/^(?:invoice|rechnung|date|datum|total|summe|brutto|netto|vat|mwst|ust|gesellschaftsvertrag|articles? of association|partnership deed|§|\d+\s*\.?)/i.test(line),
  ) ?? '';
  const netAmount = amountFromText(text, 'net(?: amount)?|netto(?:betrag)?');
  const vatAmount = amountFromText(text, 'vat(?: amount)?|mwst(?:\\.?betrag)?|ust(?:\\.?betrag)?|tax amount');
  const grossAmount = amountFromText(text, 'gross(?: amount)?|brutto(?:betrag)?|total(?: amount)?|invoice total|amount due|summe');
  const rateMatch = text.match(/(?:vat|mwst|ust|tax)\s*(?:rate|satz)?\s*[:#]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  const valueCount = [documentDate, referenceMatch?.[1], counterpartyLine, netAmount, vatAmount, grossAmount].filter(Boolean).length;
  return {
    fields: {
      documentDate,
      counterparty: counterpartyLine,
      reference: referenceMatch?.[1] ?? '',
      description: '',
      netAmount,
      vatRate: rateMatch?.[1].replace(',', '.') ?? '',
      vatAmount,
      grossAmount,
      debitAccount: '',
      creditAccount: '',
    },
    confidence: valueCount === 0 ? 0 : Math.min(0.85, 0.25 + valueCount * 0.1),
  };
}

function firstLabeledValue(text: string, labels: string): string {
  const match = text.match(new RegExp(`(?:^|[\\r\\n])\\s*(?:${labels})(?=\\s|[:#-]|$)\\s*(?:[:#]|[-–])?\\s*([^\\r\\n]{1,120})`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function legalEntityFromText(text: string): string {
  const entityPattern = /\b(?:GmbH\s*&\s*Co\.?\s*KG|GmbH|AG|UG(?:\s*\(haftungsbeschränkt\))?|KG|OHG|GbR|e\.?\s*K\.?)\b/i;
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length <= 120 && entityPattern.test(line)
      && !/^(?:gesellschaftsvertrag|articles? of association|partnership deed)\b/i.test(line))
    ?? '';
}

export function extractDocumentFields(category: DemoCategory, text: string, fileName = ''): { fields: DemoFields; confidence: number } {
  const extracted = extractDemoFields(text);
  const fields = { ...extracted.fields };
  if (category === 'company_formation' || category === 'commercial_register' || category === 'contract') {
    const fileTitle = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const legalEntity = legalEntityFromText(text)
      || (/\b(?:GmbH|AG|UG|KG|OHG|GbR|e\.?\s*K\.?)\b/i.test(fileTitle) ? fileTitle : '');
    const reference = text.match(/\b(?:HRB|HRA)\s*\d{2,}(?:\s+[A-Z]\d+)?\b/i)?.[0]
      ?? firstLabeledValue(text, 'register number|registration number|handelsregisternummer|reference|referenz|aktenzeichen');
    const effectiveDate = firstLabeledValue(text, 'effective date|formation date|date of formation|contract date|vertragsbeginn|gründungsdatum|datum der gründung');
    const title = text.split(/\r?\n/).map((line) => line.trim()).find((line) =>
      /gesellschaftsvertrag|articles of association|partnership deed|shareholders agreement|gesellschaftsgründung/i.test(line),
    ) ?? '';

    fields.counterparty = legalEntity || fields.counterparty;
    fields.reference = reference || fields.reference;
    fields.documentDate = effectiveDate || fields.documentDate;
    fields.description = title || fields.description;
  }

  const valuesToCount = category === 'company_formation' || category === 'commercial_register' || category === 'contract'
    ? [fields.counterparty, fields.reference, fields.documentDate, fields.description]
    : [fields.documentDate, fields.counterparty, fields.reference, fields.netAmount, fields.vatAmount, fields.grossAmount];
  const valueCount = valuesToCount.filter(Boolean).length;
  return {
    fields,
    confidence: valueCount ? Math.min(0.85, 0.25 + valueCount * 0.1) : 0,
  };
}

export function detectDocumentLanguage(text: string): string {
  if (!text.trim()) return 'Not detected · manual review needed';
  if (/[\u0600-\u06ff]/.test(text)) return 'Arabic script detected · manual review needed';
  if (/\b(?:rechnung|rechnungsdatum|kontoauszug|finanzamt|umsatzsteuer|bruttobetrag)\b|[äöüß]/i.test(text)) return 'German (heuristic)';
  if (/[a-z]/i.test(text)) return 'English/Latin text (heuristic)';
  return 'Unknown · manual review needed';
}

export function extractDocumentDetails(category: DemoCategory, text: string): Record<string, string> {
  if (!text.trim()) return {};
  const labeledValue = (labels: string) => firstLabeledValue(text, labels);
  if (category === 'bank_statement') {
    const transactions = text.split(/\r?\n/).map((line) => {
      const date = line.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/)?.[0];
      const amountMatches = [...line.matchAll(/-?\d[\d.,]*/g)];
      if (!date || !amountMatches.length) return null;
      const finalAmount = amountMatches[amountMatches.length - 1][0];
      const amountIndex = amountMatches[amountMatches.length - 1].index ?? line.length;
      const description = line.slice(line.indexOf(date) + date.length, amountIndex).replace(/[|;]/g, ' ').trim();
      const amount = Number(finalAmount.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
      return {
        date,
        description: description || 'Description not detected',
        debit: Number.isFinite(amount) && amount < 0 ? Math.abs(amount).toFixed(2) : '',
        credit: Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '',
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 5);
    return {
      'Statement period': labeledValue('statement period|statement date|period|abrechnungszeitraum|zeitraum'),
      'Opening balance': labeledValue('opening balance|anfangssaldo|anfangsbestand'),
      'Closing balance': labeledValue('closing balance|end balance|schlusssaldo|endsaldo'),
      ...Object.fromEntries(transactions.map((transaction, index) => [
        `Transaction ${index + 1}`,
        `${transaction.date} · ${transaction.description} · Debit: ${transaction.debit || '—'} · Credit: ${transaction.credit || '—'}`,
      ])),
      'Transaction rows': transactions.length ? `${transactions.length} candidate rows parsed using text patterns; verify sign and columns against statement.` : 'No transaction rows reliably recognized; review the statement manually.',
    };
  }
  if (category === 'payroll' || category === 'timesheet' || category === 'sick_note' || category === 'employee_record') {
    return {
      Employee: labeledValue('employee|employee name|mitarbeiter|name'),
      'Pay period': labeledValue('pay period|payroll period|abrechnungszeitraum|zeitraum'),
      'Net amount (candidate)': labeledValue('net pay|net salary|nettoverdienst|auszahlungsbetrag'),
      'Gross amount (candidate)': labeledValue('gross pay|gross salary|bruttoverdienst|bruttogehalt'),
    };
  }
  if (category === 'company_formation') {
    return {
      'Company name': labeledValue('company name|company|firma|gesellschaft') || legalEntityFromText(text),
      'Registered office': labeledValue('registered office|registered address|registered seat|geschäftssitz|sitz der gesellschaft|sitz'),
      'Share capital': labeledValue('share capital|capital stock|stammkapital|grundkapital'),
      Shareholders: labeledValue('shareholders|shareholder|gesellschafter|gesellschafterin'),
      'Managing director': labeledValue('managing director|geschäftsführer|geschäftsführerin|director'),
      Date: labeledValue('effective date|formation date|date of formation|contract date|gründungsdatum|datum der gründung|date|datum'),
    };
  }
  if (category === 'commercial_register') {
    const reference = text.match(/\b(?:HRB|HRA)\s*\d{2,}(?:\s+[A-Z]\d+)?\b/i)?.[0]
      ?? labeledValue('register number|registration number|handelsregisternummer|reference|referenz|aktenzeichen');
    return {
      'HRB number': reference,
      Court: labeledValue('registration court|register court|court|registergericht|amtsgericht'),
      Company: labeledValue('company name|company|firma|gesellschaft') || legalEntityFromText(text),
      Date: labeledValue('registration date|date|eintragungsdatum|datum'),
    };
  }
  if (category === 'contract') {
    const reference = text.match(/\b(?:HRB|HRA)\s*\d{2,}(?:\s+[A-Z]\d+)?\b/i)?.[0]
      ?? labeledValue('reference|referenz|aktenzeichen');
    return {
      'Organization / counterparty (candidate)': legalEntityFromText(text) || labeledValue('company name|company|firma|gesellschaft|party|vertragspartei'),
      'Reference (candidate)': reference,
      'Effective date (candidate)': labeledValue('effective date|formation date|date of formation|contract date|vertragsbeginn|gründungsdatum|datum der gründung'),
    };
  }
  if (category === 'correspondence' || category === 'other_correspondence') {
    return {
      Sender: labeledValue('from|sender|absender|von'),
      Subject: labeledValue('subject|betreff'),
      'Reference / case number': labeledValue('reference|case number|aktenzeichen|steuernummer'),
      Deadline: labeledValue('deadline|due date|frist|antwort bis'),
    };
  }
  if (category === 'identity_document') {
    return {
      Name: labeledValue('name|full name|holder|cardholder|inhaber|vorname und nachname'),
      'Document number': labeledValue('document number|document no|passport number|passport no|id number|ausweisnummer|passnummer'),
      'Expiry date': labeledValue('expiry date|expiration date|valid until|gültig bis|ablaufdatum'),
    };
  }
  return {};
}

export function validateDemoFields(fields: DemoFields): string[] {
  const issues: string[] = [];
  if (!fields.documentDate || Number.isNaN(Date.parse(fields.documentDate))) issues.push('Enter a valid document date.');
  if (!fields.counterparty.trim()) issues.push('Enter a supplier, customer, or bank.');
  if (!fields.reference.trim()) issues.push('Enter a document or transaction reference.');
  if (!fields.netAmount.trim() || !fields.vatAmount.trim() || !fields.grossAmount.trim()) {
    issues.push('Enter net, tax, and gross amounts.');
  }
  const net = Number(fields.netAmount);
  const vat = Number(fields.vatAmount);
  const gross = Number(fields.grossAmount);
  if (![net, vat, gross].every(Number.isFinite)) {
    issues.push('Net, tax, and gross amounts must be valid numbers.');
  } else if (Math.abs(net + vat - gross) > 0.01) {
    issues.push('Net amount plus VAT does not equal the gross amount.');
  }
  if (!/^\d{4,6}$/.test(fields.debitAccount)) issues.push('Enter a 4–6 digit debit account.');
  if (!/^\d{4,6}$/.test(fields.creditAccount)) issues.push('Enter a 4–6 digit credit account.');
  return issues;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function accountingCsv(documents: DemoDocument[]): string {
  const header = [
    'Date', 'Document', 'Counterparty', 'Description', 'DebitAccount',
    'CreditAccount', 'NetAmount', 'VATRate', 'VATAmount', 'GrossAmount', 'Currency',
  ];
  const rows = documents
    .filter((document) => document.status === 'approved')
    .filter((document) => ['bank_statement', 'purchase_invoice', 'sales_invoice', 'receipt', 'cash_book'].includes(document.category))
    .map(({ name, fields, currency }) => [
      fields.documentDate, name, fields.counterparty, fields.description, fields.debitAccount,
      fields.creditAccount, fields.netAmount, fields.vatRate, fields.vatAmount, fields.grossAmount, currency ?? 'EUR',
    ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
