import { describe, expect, it } from 'vitest';
import { CLIENT_DEMO_DOCUMENTS } from '../clientDemoData';
import { createMonthlyPeriod, periodIdFor } from './periods';
import { analyzeMonth } from './analyzeMonth';
import { createSeedPeriods } from './seedPeriods';

describe('monthly analysis rules', () => {
  it('reports invoice arithmetic and low-confidence evidence with concrete actions', () => {
    const period = createMonthlyPeriod('client@fintax.demo', 2026, 10);
    const document = {
      ...CLIENT_DEMO_DOCUMENTS[0],
      id: 'mismatch',
      fields: { ...CLIENT_DEMO_DOCUMENTS[0].fields, netAmount: '100.00', vatAmount: '19.00', grossAmount: '118.00' },
      confidence: 0.3,
    };
    const result = analyzeMonth(period, [document], [], '2026-10-31T00:00:00.000Z');
    expect(result.findings.some((item) => item.title === 'Invoice total does not reconcile')).toBe(true);
    expect(result.findings.some((item) => item.title === 'Low OCR confidence' && item.recommendedSolution.length > 10)).toBe(true);
  });

  it('detects a repeated reference, amount, and counterparty as a possible duplicate', () => {
    const first = CLIENT_DEMO_DOCUMENTS[0];
    const duplicate = { ...first, id: 'duplicate-copy' };
    const period = createMonthlyPeriod(first.clientId ?? 'client@fintax.demo', 2026, 10);
    const result = analyzeMonth(period, [first, duplicate]);
    expect(result.findings.filter((item) => item.title === 'Possible duplicate invoice')).toHaveLength(1);
    expect(result.findings.find((item) => item.title === 'Possible duplicate invoice')?.documentIds).toEqual([first.id, duplicate.id]);
  });

  it('surfaces the seeded staff-review examples for the submitted client month', () => {
    const periods = createSeedPeriods();
    const period = periods.find((item) => item.id === periodIdFor('nordlicht@fintax.demo', 2026, 10));
    if (!period) throw new Error('Expected seeded Nordlicht October period.');
    const documents = CLIENT_DEMO_DOCUMENTS.filter((document) => document.clientId === 'nordlicht@fintax.demo');
    const result = analyzeMonth(period, documents, periods, '2026-10-31T00:00:00.000Z');
    const titles = result.findings.map((item) => item.title);

    expect(titles).toContain('Missing payroll documents (timesheets / sick notes)');
    expect(titles).toContain('Possible duplicate invoice');
    expect(titles).toContain('Invoice total does not reconcile');
    expect(titles).toContain('Document date is outside this month');
    expect(titles).toContain('Low OCR confidence');
    expect(titles).toContain('Opening balance differs from prior month');
    expect(titles).toContain('Upcoming correspondence deadline');
  });
});
