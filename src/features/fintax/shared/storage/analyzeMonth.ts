import type { DemoDocument } from '../demoWorkflow';
import type { MonthlyPeriod, MonthAnalysis, MonthAnalysisFinding } from './models';

function finding(
  severity: MonthAnalysisFinding['severity'],
  documentIds: string[],
  title: string,
  evidence: string,
  recommendedSolution: string,
  suggestedAction: MonthAnalysisFinding['suggestedAction'],
): MonthAnalysisFinding {
  return {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${documentIds.join('-') || 'period'}`,
    severity,
    documentIds,
    title,
    evidence,
    recommendedSolution,
    suggestedAction,
  };
}

function amountFromText(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const amount = value.match(/-?[\d.,]+/)?.[0];
  if (!amount) return undefined;
  const decimalSeparator = amount.lastIndexOf(',') > amount.lastIndexOf('.') ? ',' : '.';
  const normalized = amount
    .replace(/[.,]/g, (separator, index) => separator === decimalSeparator && index === amount.lastIndexOf(decimalSeparator) ? '.' : '')
    .replace(/(?!^)-/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function analyzeMonth(
  period: MonthlyPeriod,
  documents: DemoDocument[],
  previousPeriods: MonthlyPeriod[] = [],
  analyzedAt = new Date().toISOString(),
): MonthAnalysis {
  const findings: MonthAnalysisFinding[] = [];
  const periodDocuments = period.documentIds.length
    ? documents.filter((document) => period.documentIds.includes(document.id))
    : documents;
  for (const item of period.checklist) {
    if (item.required && (item.state === 'missing' || (item.state === 'not_applicable' && !item.naReason?.trim()))) {
      findings.push(finding('error', [], `Missing ${item.label.toLowerCase()}`, 'The required checklist item is not uploaded or marked not applicable with a reason.', `Request the missing ${item.label.toLowerCase()} from the client, or ask them to provide a clear reason if it does not apply.`, 'request_document'));
    }
  }

  for (const document of periodDocuments) {
    const date = document.fields.documentDate;
    if (date && (Number(date.slice(0, 4)) !== period.year || Number(date.slice(5, 7)) !== period.month)) {
      findings.push(finding('warning', [document.id], 'Document date is outside this month', `Extracted date: ${date}; period: ${period.year}-${String(period.month).padStart(2, '0')}.`, 'Confirm the date against the original. If correct, move this document to the matching month before approval.', 'fix_field'));
    }

    if (['purchase_invoice', 'sales_invoice', 'receipt'].includes(document.category)) {
      const net = Number(document.fields.netAmount);
      const vat = Number(document.fields.vatAmount);
      const gross = Number(document.fields.grossAmount);
      if ([net, vat, gross].every(Number.isFinite) && Math.abs(net + vat - gross) > 0.01) {
        findings.push(finding('error', [document.id], 'Invoice total does not reconcile', `Net ${net.toFixed(2)} + VAT ${vat.toFixed(2)} = ${(net + vat).toFixed(2)}, but gross is ${gross.toFixed(2)}.`, 'Compare the original invoice and correct the net, VAT, or gross field before approving this month.', 'fix_field'));
      }
    }

    if (document.confidence < 0.5) {
      findings.push(finding('warning', [document.id], 'Low OCR confidence', `Local extraction confidence: ${Math.round(document.confidence * 100)}%.`, 'Ask the client for a clearer scan or photo, then review the extracted fields against the original.', 'request_document'));
    }

    if (document.category === 'correspondence') {
      const correspondenceText = [
        document.fields.description,
        ...Object.values(document.extractedDetails ?? {}),
      ].join(' ');
      const deadline = correspondenceText.match(/(?:due|by|deadline(?:\s+is)?)\s+(20\d{2}-\d{2}-\d{2})/i)?.[1];
      if (deadline) {
        const daysUntilDeadline = (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${analyzedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
        if (daysUntilDeadline >= 0 && daysUntilDeadline <= 14) {
          findings.push(finding('warning', [document.id], 'Upcoming correspondence deadline', `Reply due ${deadline} (${daysUntilDeadline} day${daysUntilDeadline === 1 ? '' : 's'} from analysis).`, 'Create a tracked task and prepare the requested response before the deadline.', 'create_task'));
        }
      }
    }
  }

  const documentKeys = new Map<string, DemoDocument>();
  for (const document of periodDocuments) {
    const reference = document.fields.reference.trim().toLowerCase();
    const amount = document.fields.grossAmount.trim();
    const counterparty = document.fields.counterparty.trim().toLowerCase();
    if (!reference || !amount || !counterparty) continue;
    const key = `${reference}|${amount}|${counterparty}`;
    const duplicate = documentKeys.get(key);
    if (duplicate) {
      findings.push(finding('warning', [duplicate.id, document.id], 'Possible duplicate invoice', `Both records contain reference ${document.fields.reference}, gross amount ${amount}, and counterparty ${document.fields.counterparty}.`, 'Compare the originals and keep one record; mark the other as a duplicate after confirming.', 'merge_duplicate'));
    } else {
      documentKeys.set(key, document);
    }
  }

  const bankStatement = periodDocuments.find((document) => document.category === 'bank_statement');
  const previous = previousPeriods
    .filter((item) => item.clientId === period.clientId && item.status === 'completed')
    .sort((left, right) => right.year - left.year || right.month - left.month)[0];
  if (bankStatement && previous) {
    const previousDocument = documents.find((document) => previous.documentIds.includes(document.id)
      && document.category === 'bank_statement');
    const priorClosing = amountFromText(previousDocument?.extractedDetails?.['Closing balance']);
    const currentOpening = amountFromText(bankStatement.extractedDetails?.['Opening balance']);
    if (priorClosing !== undefined && currentOpening !== undefined && Math.abs(priorClosing - currentOpening) > 0.01) {
      findings.push(finding('warning', [bankStatement.id], 'Opening balance differs from prior month', `Previous closing balance: ${priorClosing.toFixed(2)}; current opening balance: ${currentOpening.toFixed(2)}.`, 'Compare both statement originals and correct the opening balance or investigate the missing balance movement.', 'fix_field'));
    }
  }

  const resolved = new Set(period.resolvedFindingIds ?? []);
  return { analyzedAt, findings: findings.filter((item) => !resolved.has(item.id)) };
}
