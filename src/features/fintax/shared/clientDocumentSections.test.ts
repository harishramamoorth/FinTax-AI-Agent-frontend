import { describe, expect, it } from 'vitest';
import { CLIENT_DEMO_DOCUMENTS } from './clientDemoData';
import { documentsInClientSection } from './clientDocumentSections';

describe('client upload sections', () => {
  it('groups client uploads into the four dashboard sections', () => {
    const uploads = [
      { ...CLIENT_DEMO_DOCUMENTS[0], area: undefined, id: 'company', category: 'company_formation' as const },
      { ...CLIENT_DEMO_DOCUMENTS[0], area: undefined, id: 'payroll', category: 'payroll' as const },
      { ...CLIENT_DEMO_DOCUMENTS[0], area: undefined, id: 'accounting', category: 'bank_statement' as const },
      { ...CLIENT_DEMO_DOCUMENTS[0], area: undefined, id: 'letter', category: 'other_correspondence' as const },
    ];

    expect(documentsInClientSection(uploads, 'company').map((document) => document.id)).toEqual(['company']);
    expect(documentsInClientSection(uploads, 'payroll_uploads').map((document) => document.id)).toEqual(['payroll']);
    expect(documentsInClientSection(uploads, 'accounting_uploads').map((document) => document.id)).toEqual(['accounting']);
    expect(documentsInClientSection(uploads, 'client_correspondence').map((document) => document.id)).toEqual(['letter']);
  });

  it('includes documents by their saved client upload area even if category metadata differs', () => {
    const upload = { ...CLIENT_DEMO_DOCUMENTS[0], category: 'other' as const, area: 'formation' as const };
    expect(documentsInClientSection([upload], 'company')).toEqual([upload]);
    expect(documentsInClientSection([upload], 'client_correspondence')).toEqual([]);
  });
});
