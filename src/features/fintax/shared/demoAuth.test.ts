import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateDemoUser,
  clearDemoSession,
  DemoLoginError,
  readDemoSession,
  saveDemoSession,
} from './demoAuth';

describe('demo role authentication', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates each supplied demo account for its own role', async () => {
    await expect(authenticateDemoUser('client', {
      advisorId: '1', clientName: 'clientdemo', password: 'client123',
    })).resolves.toMatchObject({ role: 'client', advisorId: '1' });
    await expect(authenticateDemoUser('staff', { username: 'staffdemo', password: 'staff123' }))
      .resolves.toMatchObject({ role: 'staff' });
    await expect(authenticateDemoUser('admin', { username: 'admindemo', password: 'admin123' }))
      .resolves.toMatchObject({ role: 'admin' });
  });

  it('rejects invalid client identifiers and credentials on their respective fields', async () => {
    await expect(authenticateDemoUser('client', {
      advisorId: 'wrong', clientName: 'clientdemo', password: 'client123',
    })).rejects.toMatchObject({ field: 'advisorId' });
    await expect(authenticateDemoUser('client', {
      advisorId: '1', clientName: 'wrong', password: 'client123',
    })).rejects.toMatchObject({ field: 'clientName' });
    await expect(authenticateDemoUser('client', {
      advisorId: '1', clientName: 'clientdemo', password: 'wrong',
    })).rejects.toBeInstanceOf(DemoLoginError);
  });

  it('rejects credentials that do not match the selected staff or admin portal', async () => {
    await expect(authenticateDemoUser('staff', { username: 'admindemo', password: 'admin123' }))
      .rejects.toMatchObject({ field: 'username' });
    await expect(authenticateDemoUser('admin', { username: 'admindemo', password: 'wrong' }))
      .rejects.toMatchObject({ field: 'password' });
  });

  it('persists and clears an authenticated session for route guards', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const session = { role: 'staff' as const, userName: 'Lena M.', email: 'lena@fintax.demo' };

    saveDemoSession(session);
    expect(readDemoSession()).toEqual(session);
    clearDemoSession();
    expect(readDemoSession()).toBeNull();
  });
});
