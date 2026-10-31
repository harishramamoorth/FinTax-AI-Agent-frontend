import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { processLocalDocument } from './processDocument';

describe('local document processing', () => {
  it('stops immediately when the upload has already been canceled', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(processLocalDocument(
      new File([], 'canceled.png', { type: 'image/png' }),
      () => undefined,
      undefined,
      undefined,
      controller.signal,
    )).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('extracts shared and inline XLSX cell text before upload', async () => {
    const workbook = zipSync({
      'xl/workbook.xml': new TextEncoder().encode('<workbook/>'),
      'xl/sharedStrings.xml': new TextEncoder().encode('<sst><si><t>Invoice</t></si><si><t>Amount &amp; VAT</t></si></sst>'),
      'xl/worksheets/sheet1.xml': new TextEncoder().encode(
        '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Reference</t></is></c></row><row><c r="A2" t="s"><v>1</v></c><c r="B2"><v>119.00</v></c></row></sheetData></worksheet>',
      ),
    });
    const file = new File([workbook], 'invoice.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await processLocalDocument(file, () => undefined);

    expect(result.text).toBe('Invoice\tReference\nAmount & VAT\t119.00');
    expect(result.ocrEngine).toBe('XLSX cell extraction');
  });

  it('extracts quoted CSV cells without losing embedded delimiters', async () => {
    const file = new File(['Name,Description\r\n"FinTax GmbH","Invoice, October"'], 'records.csv', { type: 'text/csv' });

    const result = await processLocalDocument(file, () => undefined);

    expect(result.text).toBe('Name\tDescription\nFinTax GmbH\tInvoice, October');
  });
});
