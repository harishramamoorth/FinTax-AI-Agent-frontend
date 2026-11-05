import fintaxLogo from './fintax-logo.png';
import type { PortalLanguage } from './portalLanguage';

export default function LocalizedFinTaxLogo({
  language,
  className = '',
}: {
  language: PortalLanguage;
  className?: string;
}) {
  const consulting = language === 'de' ? 'Beratung' : language === 'ar' ? 'استشارات' : 'Consulting';

  return (
    <span
      role="img"
      aria-label={`FinTax ${consulting}`}
      className={`fintax-localized-logo ${className}`}
      dir="ltr"
    >
      <span className="fintax-localized-logo-mark" aria-hidden="true">
        <img src={fintaxLogo} alt="" />
      </span>
      <span className="fintax-localized-logo-name" aria-hidden="true">
        <span>FinTax</span>
        <span dir={language === 'ar' ? 'rtl' : 'ltr'}>{consulting}</span>
      </span>
    </span>
  );
}
