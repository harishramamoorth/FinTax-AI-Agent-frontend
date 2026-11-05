import { describe, expect, it } from 'vitest';
import { CLIENT_DEMO_DOCUMENTS } from '../clientDemoData';
import { createMonthlyPeriod } from './periods';
import { demoClientIdentityById, documentsVisibleTo, periodsVisibleTo } from './selectors';

describe('role-aware demo selectors', () => {
  it('limits client documents to the selected client and allows assigned staff or admin', () => {
    const clientDocuments = documentsVisibleTo(CLIENT_DEMO_DOCUMENTS, 'client', 'client@fintax.demo');
    expect(clientDocuments.every((document) => document.clientId === 'client@fintax.demo')).toBe(true);
    expect(documentsVisibleTo(CLIENT_DEMO_DOCUMENTS, 'staff', 'Lena M.')).toHaveLength(CLIENT_DEMO_DOCUMENTS.length);
    expect(documentsVisibleTo(CLIENT_DEMO_DOCUMENTS, 'staff', 'Unassigned reviewer')).toHaveLength(0);
    expect(documentsVisibleTo(CLIENT_DEMO_DOCUMENTS, 'admin', 'Admin Demo User')).toHaveLength(CLIENT_DEMO_DOCUMENTS.length);
  });

  it('shows client uploads to admins immediately but keeps them out of the staff queue until saved or assigned', () => {
    const upload = { ...CLIENT_DEMO_DOCUMENTS[0], clientSaved: false };
    expect(documentsVisibleTo([upload], 'client', 'client@fintax.demo')).toEqual([upload]);
    expect(documentsVisibleTo([upload], 'staff', 'Lena M.')).toEqual([]);
    expect(documentsVisibleTo([upload], 'admin', 'Admin Demo User')).toEqual([upload]);
    expect(documentsVisibleTo([{ ...upload, assignedStaffId: 'staff-1' }], 'staff', 'staff-1', 'A different name')).toHaveLength(1);
    expect(documentsVisibleTo([{ ...upload, clientSaved: true }], 'staff', 'Lena M.')).toHaveLength(1);
  });

  it('resolves a client identity from the uploader id', () => {
    expect(demoClientIdentityById('client@fintax.demo')).toEqual({
      name: 'Muster GmbH',
      email: 'client@fintax.demo',
    });
    expect(demoClientIdentityById('unlisted@example.demo')).toBeUndefined();
  });

  it('applies the same client/staff/admin visibility to monthly periods', () => {
    const periods = [createMonthlyPeriod('client@fintax.demo', 2026, 10), createMonthlyPeriod('nordlicht@fintax.demo', 2026, 10)];
    expect(periodsVisibleTo(periods, 'client', 'client@fintax.demo')).toHaveLength(1);
    expect(periodsVisibleTo(periods, 'staff', 'Lena M.')).toHaveLength(2);
    expect(periodsVisibleTo(periods, 'staff', 'Unassigned reviewer')).toHaveLength(0);
    expect(periodsVisibleTo(periods, 'admin', 'Admin Demo User')).toHaveLength(2);
  });
});
