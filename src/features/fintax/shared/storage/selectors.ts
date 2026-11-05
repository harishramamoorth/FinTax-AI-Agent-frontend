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

export function demoClientIdentityById(clientId?: string): { name: string; email: string } | undefined {
  if (!clientId) return undefined;
  const account = DEMO_CLIENTS.find((client) => client.email === clientId || client.id === clientId);
  return account ? { name: account.name, email: account.email } : undefined;
}

export function documentsVisibleTo(
  documents: DemoDocument[],
  role: 'client' | 'staff' | 'admin',
  actorId: string,
  actorName = actorId,
): DemoDocument[] {
  return documents.filter((document) => {
    if (!document.clientId) return role !== 'client';
    if (role === 'admin') return true;
    if (role === 'staff' && document.clientSaved === false && !document.assignedStaffId) return false;
    if (role === 'staff' && document.assignedStaffId) return document.assignedStaffId === actorId || document.assignedStaffId === actorName;
    const client = demoClientById(document.clientId);
    return client ? canAccessClientData(role, actorName, client) : false;
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
