import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPrivacyConsent, recordPrivacyConsent } from './privacyConsent';

describe('privacy consent', () => {
  const values = new Map<string, string>();

  afterEach(() => {
    values.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('records acceptance once per account with a timestamp', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    expect(hasPrivacyConsent('portal:user-1')).toBe(false);
    const acceptedAt = recordPrivacyConsent('portal:user-1');

    expect(Number.isFinite(Date.parse(acceptedAt))).toBe(true);
    expect(hasPrivacyConsent('portal:user-1')).toBe(true);
    expect(hasPrivacyConsent('portal:user-2')).toBe(false);
    expect(recordPrivacyConsent('portal:user-1')).toBe(acceptedAt);
  });

  it('refreshes the saved timestamp when consent is required again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    const firstAcceptedAt = recordPrivacyConsent('portal:user-1');
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    expect(recordPrivacyConsent('portal:user-1', true)).not.toBe(firstAcceptedAt);
    expect(values.get('fintax-privacy-consent-v1:portal%3Auser-1')).toBe('2026-01-02T00:00:00.000Z');
  });

  it('does not continue when browser storage cannot save acceptance', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage is unavailable');
      },
    });

    expect(() => recordPrivacyConsent('portal:user-1')).toThrow('Storage is unavailable');
  });
});
