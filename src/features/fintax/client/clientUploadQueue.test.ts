import { describe, expect, it } from 'vitest';
import { createClientUploadQueue } from './clientUploadQueue';

const file = (name: string, type = 'application/pdf', size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe('client upload queue', () => {
  it('assigns each file to a selected type inferred from its name', () => {
    const result = createClientUploadQueue(
      [file('payroll-january.pdf'), file('Kontoauszug-2026.pdf'), file('unknown.pdf')],
      'accounting',
      [
        { id: 'a-bank', category: 'bank_statement' },
        { id: 'a-invoice', category: 'purchase_invoice' },
        { id: 'p-payroll', category: 'payroll' },
      ],
      (() => {
        let nextId = 0;
        return () => `upload-${++nextId}`;
      })(),
    );

    expect(result.rejected).toEqual([]);
    expect(result.queued.map(({ typeId, category, area }) => ({ typeId, category, area }))).toEqual([
      { typeId: 'p-payroll', category: 'payroll', area: 'accounting' },
      { typeId: 'a-bank', category: 'bank_statement', area: 'accounting' },
      { typeId: 'a-bank', category: 'bank_statement', area: 'accounting' },
    ]);
  });

  it('uses the first selected type when a filename does not identify a selected category', () => {
    const result = createClientUploadQueue(
      [file('scanned-document.pdf')],
      'formation',
      [
        { id: 'f-register', category: 'commercial_register' },
        { id: 'f-id', category: 'identity_document' },
      ],
      () => 'upload-1',
    );

    expect(result.queued[0]).toMatchObject({
      id: 'upload-1',
      area: 'formation',
      typeId: 'f-register',
      category: 'commercial_register',
    });
  });

  it('rejects invalid files without losing valid files from the same selection', () => {
    const result = createClientUploadQueue(
      [
        file('invoice.pdf'),
        file('empty.pdf', 'application/pdf', 0),
        file('notes.exe', 'application/octet-stream'),
      ],
      'accounting',
      [{ id: 'a-invoice', category: 'purchase_invoice' }],
      () => 'upload-1',
    );

    expect(result.queued).toHaveLength(1);
    expect(result.queued[0].file.name).toBe('invoice.pdf');
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0]).toContain('empty.pdf');
    expect(result.rejected[1]).toContain('notes.exe');
  });

  it('rejects files when no document type is selected', () => {
    const result = createClientUploadQueue([file('scan.pdf')], 'correspondence', []);

    expect(result.queued).toEqual([]);
    expect(result.rejected).toEqual(['scan.pdf: Choose a document type before adding files.']);
  });
});
