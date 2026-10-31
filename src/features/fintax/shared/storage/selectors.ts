import type { DemoDocument } from '../demoWorkflow';
import { DEMO_CLIENTS } from '../demoAccounts';
import type { Client, MonthlyPeriod } from './models';
import { canAccessClientData } from './periods';

export function demoClientById(clientId: string): Client | undefined {
  const account = DEMO_CLIENTS.find((client) => client.email === clientId || client.id === clientId);
  if (!account) return undefined;
  return {
    id: account.email,
    company: account.company,
    country: account.country,
    currency: account.currency,
    assignedStaffIds: ['Lena M.'],
  };
}

export function documentsVisibleTo(
  documents: DemoDocument[],
  role: 'client' | 'staff' | 'admin',
  actorId: string,
): DemoDocument[] {
  return documents.filter((document) => {
    if (role !== 'client' && document.clientSaved === false) return false;
    if (!document.clientId) return role !== 'client';
    const client = demoClientById(document.clientId);
    return client ? canAccessClientData(role, actorId, client) : role === 'admin';
  });
}

export function periodsVisibleTo(
  periods: MonthlyPeriod[],
  role: 'client' | 'staff' | 'admin',
  actorId: string,
): MonthlyPeriod[] {
  return periods.filter((period) => {
    const client = demoClientById(period.clientId);
    return client ? canAccessClientData(role, actorId, client) : role === 'admin';
  });
}
