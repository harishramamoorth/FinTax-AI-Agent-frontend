import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Globe2, LockKeyhole, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { isRtl, portalText, type PortalLanguage } from './portalLanguage';
import fintaxLogo from './fintax-logo.png';

export default function PrivacyNotice({
  language = 'en',
  onLanguageChange,
  demo = false,
  firm = 'FinTax Consulting',
  error,
  declineBusy = false,
  onAccept,
  onDecline,
}: {
  language?: PortalLanguage;
  onLanguageChange?: (language: PortalLanguage) => void;
  demo?: boolean;
  firm?: string;
  requireEveryLogin?: boolean;
  error?: string;
  declineBusy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const t = (key: Parameters<typeof portalText>[1]) => portalText(language, key);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accepted) onAccept();
  };

  return (
    <main
      lang={language}
      dir={isRtl(language) ? 'rtl' : 'ltr'}
      className="min-h-screen bg-bg px-4 py-6 text-ink sm:px-6 sm:py-8"
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[620px] flex-col">
        {onLanguageChange && (
          <div className="mb-3 flex justify-end">
            <label className="inline-flex items-center gap-2 rounded-lg border hairline bg-panel px-3 py-1.5 text-sm font-medium text-ink shadow-sm">
              <Globe2 className="size-4 text-cyan" aria-hidden="true" />
              <span className="sr-only">{t('language')}</span>
              <select
                aria-label={t('language')}
                value={language}
                onChange={(event) => onLanguageChange(event.target.value as PortalLanguage)}
                className="cursor-pointer bg-transparent py-1 text-ink outline-none"
              >
                <option value="en">EN</option>
                <option value="de">DE</option>
                <option value="ar">AR</option>
              </select>
            </label>
          </div>
        )}

        <section className="glass my-auto w-full rounded-2xl p-6 sm:p-9 shadow-lg">
          <div className="mb-6 flex justify-center sm:justify-start">
            <img
              src={fintaxLogo}
              alt="FinTax Consulting"
              className="brand-logo h-auto w-44 max-w-full object-contain"
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border hairline bg-cyan/10 text-cyan">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {t('privacyTitle')}
              </h1>
              <p className="text-xs text-muted mt-0.5">{firm} · Portal Client Access</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold">{t('legalPlaceholderNotice')}</span>
              <p className="mt-0.5 leading-relaxed text-[11px] opacity-90">
                This notice is configured specifically for {firm}. Your one-time consent (date, time, text version 1.0.0) will be recorded.
              </p>
            </div>
          </div>

          <p className="mt-5 text-base leading-7 text-muted">
            {t('privacyDescription')}
          </p>

          <button
            type="button"
            aria-expanded={showDetails}
            aria-controls="privacy-details"
            onClick={() => setShowDetails((visible) => !visible)}
            className="mt-4 text-left text-sm font-semibold text-cyan underline decoration-cyan/50 underline-offset-4 hover:text-blue focus-visible:rounded-sm"
          >
            {t(showDetails ? 'privacyHideDetails' : 'privacyReadDetails')}
          </button>

          {showDetails && (
            <div id="privacy-details" className="mt-3 space-y-2 rounded-xl border hairline bg-ink/5 p-4 text-sm leading-6 text-muted">
              <p>{t('documentsStoredPrivately')}</p>
              <p>{t('uploadVisibleToTeam')}</p>
              <p>{t('privacyTimestamp')}</p>
              <p>{t('extractionInfo')}</p>
            </div>
          )}

          {demo && (
            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm leading-6 text-warn">
              {t('privacyDemoWarning')}
            </p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border hairline bg-ink/5 p-4 text-sm leading-6 text-ink transition-colors hover:border-cyan/50">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="peer sr-only"
              />
              <span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border hairline bg-panel text-bg transition-colors peer-checked:border-cyan peer-checked:bg-cyan peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan">
                <Check className={`size-4 ${accepted ? 'opacity-100' : 'opacity-0'}`} />
              </span>
              <span>{t('privacyConsentLabel')}</span>
            </label>
            {error && (
              <p role="alert" className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={!accepted || declineBusy}
              variant="primary"
              className="min-h-12 w-full rounded-xl text-sm"
            >
              {t('privacyAgree')}
            </Button>
          </form>

          <button
            type="button"
            disabled={declineBusy}
            onClick={onDecline}
            className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-muted hover:text-ink disabled:cursor-wait"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {declineBusy ? t('privacySigningOut') : t('privacyReturnToLogin')}
          </button>
        </section>
      </div>
    </main>
  );
}
