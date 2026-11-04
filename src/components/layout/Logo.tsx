import fintaxLogo from '@/features/fintax/shared/fintax-logo.png';

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <img
      src={fintaxLogo}
      alt="FinTax Consulting"
      className={`brand-logo h-auto max-w-full object-contain ${collapsed ? 'w-10' : 'w-40'}`}
    />
  );
}
