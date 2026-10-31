import { describe, expect, it } from 'vitest';
import { createMonthlyChecklist, createMonthlyPeriod, folderPathForCategory, isChecklistComplete, canAccessClientData } from './periods';

describe('monthly period storage helpers', () => {
  it('creates folder paths by document group and month', () => {
    expect(folderPathForCategory('bank_statement', 2026, 3)).toBe('01_FiBu\\2026\\03');
    expect(folderPathForCategory('payroll', 2026, 10)).toBe('02_LoBu\\2026\\10');
    expect(folderPathForCategory('correspondence', 2026, 10)).toBe('00_Schriftverkehr\\2026\\10');
    expect(folderPathForCategory('contract', 2026, 10)).toBe('00_Schriftverkehr\\Gesellschaft');
  });

  it('requires an explicit reason before a required checklist item can be marked not applicable', () => {
    const checklist = createMonthlyChecklist().map((item) => ({
      ...item,
      state: 'not_applicable' as const,
      naReason: 'No activity in this category.',
    }));
    expect(isChecklistComplete(checklist)).toBe(true);
    expect(isChecklistComplete(checklist.map((item) => item.key === 'payroll' ? { ...item, naReason: '' } : item))).toBe(false);
    expect(createMonthlyPeriod('client-a', 2026, 10).status).toBe('open');
  });

  it('limits client and staff access to their own or assigned client records', () => {
    const client = { id: 'client-a', company: 'A GmbH', country: 'Germany', currency: 'EUR', assignedStaffIds: ['staff-a'] };
    expect(canAccessClientData('client', 'client-a', client)).toBe(true);
    expect(canAccessClientData('client', 'client-b', client)).toBe(false);
    expect(canAccessClientData('staff', 'staff-a', client)).toBe(true);
    expect(canAccessClientData('staff', 'staff-b', client)).toBe(false);
    expect(canAccessClientData('admin', 'admin-a', client)).toBe(true);
  });
});
