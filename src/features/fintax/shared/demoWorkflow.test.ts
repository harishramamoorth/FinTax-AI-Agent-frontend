import { describe, expect, it } from 'vitest';
import {
  accountingCsv, canTransitionDocumentStatus, categoryFromDocumentText, categoryForFilename, CLIENT_MAX_UPLOAD_BYTES, emptyDemoFields, extractDemoFields, extractDocumentDetails, extractDocumentFields, sampleFields, validateDemoFields, validateDemoFile,
  type DemoDocument,
} from './demoWorkflow';

describe('demo document workflow', () => {
  it('accepts supported documents up to the demo upload limit', () => {
    expect(validateDemoFile({ name: 'scan.pdf', size: 1024, type: 'application/pdf' })).toBeNull();
    expect(validateDemoFile({ name: 'receipt.heic', size: 1024, type: 'image/heic' })).toBeNull();
    expect(validateDemoFile({ name: 'ledger.xlsx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBeNull();
    expect(validateDemoFile({ name: 'notes.csv', size: 1024, type: 'text/csv' })).toBeNull();
    expect(validateDemoFile({ name: 'letter.docx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBeNull();
    expect(validateDemoFile({ name: 'memo.txt', size: 1024, type: 'text/plain' })).toBeNull();
    expect(validateDemoFile({ name: 'large.pdf', size: 50 * 1024 * 1024 + 1, type: 'application/pdf' })).toContain('50 MB');
    expect(validateDemoFile({ name: 'client-large.pdf', size: CLIENT_MAX_UPLOAD_BYTES + 1, type: 'application/pdf' }, CLIENT_MAX_UPLOAD_BYTES)).toContain('20 MB');
    expect(validateDemoFile({ name: 'script.exe', size: 1024, type: 'application/octet-stream' })).toContain('Choose a PDF');
  });

  it('classifies common English and German document filenames', () => {
    expect(categoryForFilename('kontoauszug_mai.pdf')).toBe('bank_statement');
    expect(categoryForFilename('purchase_invoice_42.pdf')).toBe('purchase_invoice');
    expect(categoryForFilename('finanzamt_brief.pdf')).toBe('correspondence');
    expect(categoryForFilename('Mietvertrag.pdf')).toBe('other_correspondence');
    expect(categoryForFilename('Lease_Agreement.pdf')).toBe('other_correspondence');
    expect(categoryForFilename('Demo_Gesellschaftsvertrag_Musterwerk_Digital_GmbH.pdf')).toBe('contract');
    expect(categoryForFilename('photo-001.png')).toBe('other');
    expect(categoryForFilename('scan.pdf', 'Kontoauszug October')).toBe('bank_statement');
    expect(categoryForFilename('fintax-demo-invoice.pdf')).toBe('other');
    expect(categoryForFilename('invoice.pdf', 'Tax amount 19%')).toBe('other');
  });

  it('detects a mismatched document type from extracted English and German text', () => {
    expect(categoryFromDocumentText('BANK STATEMENT\nOpening balance: EUR 1,200\nClosing balance: EUR 1,450')).toBe('bank_statement');
    expect(categoryFromDocumentText('Lohnabrechnung\nBrutto / Netto\nMitarbeiter: Ada Example')).toBe('payroll');
    expect(categoryFromDocumentText('Outgoing invoice\nInvoice No: INV-2026-14\nVAT amount: EUR 19.00')).toBe('sales_invoice');
    expect(categoryFromDocumentText('A document with no clear document-type markers')).toBeNull();
  });

  it('extracts labeled values from locally parsed invoice text', () => {
    const result = extractDemoFields([
      'Muster GmbH',
      'Invoice date: 18.10.2026',
      'Invoice No: INV-1234',
      'Net amount: 1.234,56 EUR',
      'VAT: 234,56 EUR',
      'Gross amount: 1.469,12 EUR',
    ].join('\n'));
    expect(result.fields.documentDate).toBe('2026-10-18');
    expect(result.fields.counterparty).toBe('Muster GmbH');
    expect(result.fields.reference).toBe('INV-1234');
    expect(result.fields.netAmount).toBe('1234.56');
    expect(result.fields.vatAmount).toBe('234.56');
    expect(result.fields.grossAmount).toBe('1469.12');
    expect(result.fields.debitAccount).toBe('');
    expect(result.confidence).toBeGreaterThan(0);
    const vatRateOnly = extractDemoFields('VAT rate: 19%');
    expect(vatRateOnly.fields.vatRate).toBe('19');
    expect(vatRateOnly.fields.vatAmount).toBe('');
  });

  it('extracts legal-document details without mistaking the contract title for the company', () => {
    const text = [
      'Gesellschaftsvertrag',
      'Musterwerk Digital GmbH',
      'HRB 123456',
      'Gründungsdatum: 04.03.2024',
      '§ 3 Share capital and contributions',
    ].join('\n');

    const result = extractDocumentFields('contract', text, 'Demo_Gesellschaftsvertrag_Musterwerk_Digital_GmbH.pdf');
    const details = extractDocumentDetails('contract', text);

    expect(result.fields.counterparty).toBe('Musterwerk Digital GmbH');
    expect(result.fields.reference).toBe('HRB 123456');
    expect(result.fields.documentDate).toBe('04.03.2024');
    expect(result.fields.description).toBe('Gesellschaftsvertrag');
    expect(details['Organization / counterparty (candidate)']).toBe('Musterwerk Digital GmbH');
    expect(details['Reference (candidate)']).toBe('HRB 123456');
  });

  it('extracts type-specific company, register, identity, and bank review details', () => {
    const company = extractDocumentDetails('company_formation', [
      'Company name: Muster GmbH',
      'Registered office: Berlin',
      'Share capital: EUR 25,000',
      'Shareholders: Ada Example',
      'Managing director: Max Example',
      'Formation date: 04.03.2024',
    ].join('\n'));
    expect(company['Company name']).toBe('Muster GmbH');
    expect(company['Registered office']).toBe('Berlin');
    expect(company['Share capital']).toBe('EUR 25,000');
    expect(company.Shareholders).toBe('Ada Example');
    expect(company['Managing director']).toBe('Max Example');

    const register = extractDocumentDetails('commercial_register', 'HRB 123456\nRegistergericht: Amtsgericht Berlin\nCompany: Muster GmbH\nEintragungsdatum: 04.03.2024');
    expect(register['HRB number']).toBe('HRB 123456');
    expect(register.Court).toBe('Amtsgericht Berlin');
    expect(register.Company).toBe('Muster GmbH');

    const identity = extractDocumentDetails('identity_document', 'Name: Ada Example\nPassport number: X1234567\nExpiry date: 04.03.2030');
    expect(identity.Name).toBe('Ada Example');
    expect(identity['Document number']).toBe('X1234567');
    expect(identity['Expiry date']).toBe('04.03.2030');

    const bank = extractDocumentDetails('bank_statement', 'Statement period: January 2026\nOpening balance: 100.00\nClosing balance: 140.00');
    expect(bank['Statement period']).toBe('January 2026');
    expect(bank['Opening balance']).toBe('100.00');
    expect(bank['Closing balance']).toBe('140.00');
  });

  it('checks required fields and amount arithmetic before approval', () => {
    const fields = sampleFields('purchase_invoice', 'demo-12345');
    expect(validateDemoFields(fields)).toEqual([]);
    expect(validateDemoFields(emptyDemoFields())).toContain('Enter net, tax, and gross amounts.');
    expect(validateDemoFields({ ...fields, grossAmount: '120.00' })).toContain('Net amount plus VAT does not equal the gross amount.');
    expect(validateDemoFields({ ...fields, debitAccount: '12' })).toContain('Enter a 4–6 digit debit account.');
  });

  it('allows only defined document status transitions', () => {
    expect(canTransitionDocumentStatus('processing', 'review')).toBe(true);
    expect(canTransitionDocumentStatus('review', 'needs_information')).toBe(true);
    expect(canTransitionDocumentStatus('needs_information', 'review')).toBe(true);
    expect(canTransitionDocumentStatus('approved', 'review')).toBe(false);
    expect(canTransitionDocumentStatus('processing', 'approved')).toBe(false);
  });

  it('exports only approved accounting records and escapes CSV values', () => {
    const approved: DemoDocument = {
      id: 'demo-12345', name: 'invoice,"sample".pdf', category: 'purchase_invoice', sizeBytes: 100,
      createdAt: '2026-10-22T10:00:00.000Z', status: 'approved', confidence: 0.9,
      fields: { ...sampleFields('purchase_invoice', 'demo-12345'), counterparty: 'Vendor "A"' }, sample: true,
    };
    const pending: DemoDocument = { ...approved, id: 'demo-67890', status: 'review' };
    const payroll: DemoDocument = { ...approved, id: 'demo-payroll', category: 'payroll' };
    const csv = accountingCsv([approved, pending, payroll]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"invoice,""sample"".pdf"');
    expect(csv).toContain('"Vendor ""A"""');
    expect(csv).not.toContain('demo-67890');
  });
});
