const STORAGE_KEY = 'fintax-privacy-consent-v1';

export interface PrivacyConsentRecord {
  accountId: string;
  acceptedAt: string;
  date: string;
  time: string;
  textVersion: string;
  firm: string;
  legalReviewPending: boolean;
}

function consentKey(accountId: string): string {
  return `${STORAGE_KEY}:${encodeURIComponent(accountId)}`;
}

function readAcceptedAt(accountId: string): string | null {
  const acceptedAt = localStorage.getItem(consentKey(accountId));
  return acceptedAt && Number.isFinite(Date.parse(acceptedAt)) ? acceptedAt : null;
}

export function hasPrivacyConsent(accountId: string): boolean {
  return readAcceptedAt(accountId) !== null;
}

export function recordPrivacyConsent(
  accountId: string,
  refresh = false,
  metadata?: { firm?: string; textVersion?: string }
): string {
  const existing = readAcceptedAt(accountId);
  if (existing && !refresh) return existing;

  const now = new Date();
  const acceptedAt = now.toISOString();
  localStorage.setItem(consentKey(accountId), acceptedAt);

  const record: PrivacyConsentRecord = {
    accountId,
    acceptedAt,
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().split(' ')[0],
    textVersion: metadata?.textVersion ?? '1.0.0',
    firm: metadata?.firm ?? 'FinTax Consulting',
    legalReviewPending: true,
  };
  try {
    localStorage.setItem(`${consentKey(accountId)}:meta`, JSON.stringify(record));
  } catch {
    // Ignore storage errors on meta
  }

  return acceptedAt;
}

export function getPrivacyConsentRecord(accountId: string): PrivacyConsentRecord | null {
  try {
    const raw = localStorage.getItem(`${consentKey(accountId)}:meta`);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}
