import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Building2,
  BriefcaseBusiness,
  Check,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/primitives';
import fintaxLogo from './fintax-logo.png';
import { type DemoRole } from './demoAccounts';
import { authenticateDemoUser, DemoLoginError, type DemoCredentials, type LoginField } from './demoAuth';
import { isRtl, usePortalLanguage, type PortalLanguage } from './portalLanguage';

type LoginPortal = 'client' | 'staff' | 'admin';
type PortalLink = 'client' | 'staff' | 'admin';

const portalCopy: Record<LoginPortal, { title: string; eyebrow: string; description: string; heading: string; detail: string }> = {
  client: {
    title: 'Client Portal',
    eyebrow: 'CLIENT ACCESS',
    description: 'Sign in to manage your company documents and stay connected with your accounting team.',
    heading: 'Your business. In better focus.',
    detail: 'Keep your documents organized, follow requests, and stay up to date with your FinTax team.',
  },
  staff: {
    title: 'Staff Portal',
    eyebrow: 'STAFF ACCESS',
    description: 'Sign in to review client documents, manage follow-ups, and support your assigned clients.',
    heading: 'Your work. One clear flow.',
    detail: 'Review client activity, organize document workflows, and keep every follow-up moving.',
  },
  admin: {
    title: 'Admin Portal',
    eyebrow: 'ADMINISTRATOR ACCESS',
    description: 'Sign in to manage the client portfolio, team activity, and workspace administration.',
    heading: 'Your platform. In control.',
    detail: 'Get a clear view of client operations, team activity, and workspace administration.',
  },
};

const loginTranslations = {
  en: {
    portals: portalCopy,
    roleGroupClient: 'Choose client, staff, or admin login',
    roleGroupAdmin: 'Choose staff or admin login',
    client: 'Client',
    staff: 'Staff',
    admin: 'Admin',
    advisorId: 'Advisor ID',
    advisorHint: '7 = FinTax Consulting',
    clientName: 'Username / Client Name',
    username: 'Username',
    password: 'Password',
    clientDemo: 'demo: clientdemo',
    staffDemo: 'demo: staffdemo',
    adminDemo: 'demo: admindemo',
    clientPassword: 'demo: client123',
    staffPassword: 'demo: staff123',
    adminPassword: 'demo: admin123',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    signIn: 'Sign In',
    invalidClient: 'Invalid Advisor ID, username, or password. Please verify your login details.',
    invalidUsername: 'Username was not recognized.',
    invalidPassword: 'Password is incorrect.',
    loginFailure: 'Sign in could not be completed. Please try again.',
    demoNotice: 'Demo access. Fictional data stored in this browser.',
    language: 'Language selector',
    workspace: 'FinTax Workspace',
    features: ['Secure document workspace', 'Clear requests and follow-ups', 'Connected accounting team'],
    documentWorkflow: 'Document workflow',
    documentWorkflowDetail: 'Upload · organize · review',
    assistant: 'Accounting assistant',
    assistantDetail: 'Answers · insights · next steps',
    platform: 'Platform provided by FinTax Consulting',
    footer: ['Formation', 'Payroll', 'Financial accounting', 'Correspondence'],
    forgot: 'Forgot login details?',
    forgotReason: 'For security reasons, login credentials are issued directly by your assigned tax advisory firm.',
    support: 'FinTax Consulting Support',
    advisorIdShort: 'Advisor ID:',
    supportContact: 'Support Contact:',
    demoLogin: 'Demo login (Advisor ID, client name, password):',
    emailHelp: 'For account help, contact your tax advisory firm.',
    close: 'Close',
  },
  de: {
    portals: {
      client: {
        title: 'Mandantenportal',
        eyebrow: 'MANDANTENZUGANG',
        description: 'Melden Sie sich an, um Ihre Unternehmensdokumente zu verwalten und mit Ihrem Buchhaltungsteam in Kontakt zu bleiben.',
        heading: 'Ihr Unternehmen. Im Blick.',
        detail: 'Verwalten Sie Dokumente, verfolgen Sie Anfragen und bleiben Sie mit Ihrem FinTax-Team auf dem Laufenden.',
      },
      staff: {
        title: 'Mitarbeiterportal',
        eyebrow: 'MITARBEITERZUGANG',
        description: 'Melden Sie sich an, um Mandantendokumente zu prüfen, Rückfragen zu verwalten und Ihre Mandanten zu betreuen.',
        heading: 'Ihre Arbeit. Klar organisiert.',
        detail: 'Prüfen Sie Aktivitäten, organisieren Sie Dokumentenabläufe und behalten Sie alle Rückfragen im Blick.',
      },
      admin: {
        title: 'Administrationsportal',
        eyebrow: 'ADMINISTRATORZUGANG',
        description: 'Melden Sie sich an, um Mandanten, Teamaktivitäten und die Arbeitsbereichsverwaltung zu betreuen.',
        heading: 'Ihre Plattform. Unter Kontrolle.',
        detail: 'Behalten Sie Mandantenprozesse, Teamaktivitäten und die Verwaltung im Blick.',
      },
    },
    roleGroupClient: 'Anmeldebereich auswählen',
    roleGroupAdmin: 'Mitarbeiter- oder Admin-Anmeldung auswählen',
    client: 'Mandant',
    staff: 'Mitarbeiter',
    admin: 'Admin',
    advisorId: 'Berater-ID',
    advisorHint: '7 = FinTax Consulting',
    clientName: 'Benutzername / Mandantenname',
    username: 'Benutzername',
    password: 'Passwort',
    clientDemo: 'Demo: clientdemo',
    staffDemo: 'Demo: staffdemo',
    adminDemo: 'Demo: admindemo',
    clientPassword: 'Demo: client123',
    staffPassword: 'Demo: staff123',
    adminPassword: 'Demo: admin123',
    showPassword: 'Passwort anzeigen',
    hidePassword: 'Passwort verbergen',
    signIn: 'Anmelden',
    invalidClient: 'Berater-ID, Benutzername oder Passwort ist ungültig. Bitte überprüfen Sie Ihre Anmeldedaten.',
    invalidUsername: 'Benutzername wurde nicht erkannt.',
    invalidPassword: 'Das Passwort ist falsch.',
    loginFailure: 'Anmeldung nicht möglich. Bitte versuchen Sie es erneut.',
    demoNotice: 'Demo-Zugang. Fiktive Daten werden in diesem Browser gespeichert.',
    language: 'Sprachauswahl',
    workspace: 'FinTax-Arbeitsbereich',
    features: ['Sicherer Dokumentenbereich', 'Klare Anfragen und Rückmeldungen', 'Verbundenes Buchhaltungsteam'],
    documentWorkflow: 'Dokumentenablauf',
    documentWorkflowDetail: 'Hochladen · ordnen · prüfen',
    assistant: 'Buchhaltungsassistent',
    assistantDetail: 'Antworten · Einblicke · nächste Schritte',
    platform: 'Plattform von FinTax Consulting',
    footer: ['Gründung', 'Lohnabrechnung', 'Finanzbuchhaltung', 'Korrespondenz'],
    forgot: 'Anmeldedaten vergessen?',
    forgotReason: 'Aus Sicherheitsgründen erhalten Sie Ihre Zugangsdaten direkt von Ihrer zuständigen Steuerberatung.',
    support: 'FinTax Consulting Support',
    advisorIdShort: 'Berater-ID:',
    supportContact: 'Supportkontakt:',
    demoLogin: 'Demo-Zugang (Berater-ID, Mandantenname, Passwort):',
    emailHelp: 'Bei Fragen zu Ihrem Konto wenden Sie sich bitte an Ihre Steuerberatung.',
    close: 'Schließen',
  },
  ar: {
    portals: {
      client: {
        title: 'بوابة العملاء',
        eyebrow: 'دخول العميل',
        description: 'سجّل الدخول لإدارة مستندات شركتك والتواصل مع فريق المحاسبة.',
        heading: 'أعمالك. بوضوح أكبر.',
        detail: 'نظّم مستنداتك، وتابع الطلبات، وابقَ على اطلاع مع فريق FinTax.',
      },
      staff: {
        title: 'بوابة الموظفين',
        eyebrow: 'دخول الموظفين',
        description: 'سجّل الدخول لمراجعة مستندات العملاء وإدارة المتابعات ومساعدة عملائك.',
        heading: 'عملك. في مسار واضح.',
        detail: 'راجع نشاط العملاء ونظّم المستندات وتابع كل الطلبات.',
      },
      admin: {
        title: 'بوابة المسؤول',
        eyebrow: 'دخول المسؤول',
        description: 'سجّل الدخول لإدارة العملاء ونشاط الفريق وإعدادات مساحة العمل.',
        heading: 'منصتك. تحت السيطرة.',
        detail: 'تابع عمليات العملاء ونشاط الفريق وإدارة مساحة العمل.',
      },
    },
    roleGroupClient: 'اختر تسجيل دخول العميل أو الموظف أو المسؤول',
    roleGroupAdmin: 'اختر تسجيل دخول الموظف أو المسؤول',
    client: 'العميل',
    staff: 'الموظف',
    admin: 'المسؤول',
    advisorId: 'رقم المستشار',
    advisorHint: '7 = FinTax Consulting',
    clientName: 'اسم المستخدم / العميل',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    clientDemo: 'تجريبي: clientdemo',
    staffDemo: 'تجريبي: staffdemo',
    adminDemo: 'تجريبي: admindemo',
    clientPassword: 'تجريبي: client123',
    staffPassword: 'تجريبي: staff123',
    adminPassword: 'تجريبي: admin123',
    showPassword: 'إظهار كلمة المرور',
    hidePassword: 'إخفاء كلمة المرور',
    signIn: 'تسجيل الدخول',
    invalidClient: 'رقم المستشار أو اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التحقق من بيانات الدخول.',
    invalidUsername: 'لم يتم التعرف على اسم المستخدم.',
    invalidPassword: 'كلمة المرور غير صحيحة.',
    loginFailure: 'تعذر تسجيل الدخول. يرجى المحاولة مرة أخرى.',
    demoNotice: 'دخول تجريبي. تُخزَّن البيانات الوهمية في هذا المتصفح.',
    language: 'اختيار اللغة',
    workspace: 'مساحة عمل FinTax',
    features: ['مساحة مستندات آمنة', 'طلبات ومتابعات واضحة', 'فريق محاسبة متصل'],
    documentWorkflow: 'مسار المستندات',
    documentWorkflowDetail: 'رفع · تنظيم · مراجعة',
    assistant: 'مساعد المحاسبة',
    assistantDetail: 'إجابات · رؤى · خطوات تالية',
    platform: 'منصة مقدمة من FinTax Consulting',
    footer: ['تأسيس الشركات', 'الرواتب', 'المحاسبة المالية', 'المراسلات'],
    forgot: 'هل نسيت بيانات الدخول؟',
    forgotReason: 'لأسباب أمنية، تصدر شركة الاستشارات الضريبية المسؤولة عنك بيانات الدخول مباشرة.',
    support: 'دعم FinTax Consulting',
    advisorIdShort: 'رقم المستشار:',
    supportContact: 'جهة الدعم:',
    demoLogin: 'الدخول التجريبي (رقم المستشار، اسم العميل، كلمة المرور):',
    emailHelp: 'للمساعدة بشأن الحساب، يرجى التواصل مع شركة الاستشارات الضريبية.',
    close: 'إغلاق',
  },
} as const;

function LoginBrandHeader({ platform }: { platform: string }) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <header className="auth-login-header">
      <div className="auth-login-brand">
        <motion.img
          src={fintaxLogo}
          alt="FinTax Consulting"
          whileHover={reduceMotion ? undefined : { scale: 1.02 }}
          className="brand-logo h-auto w-48 max-w-full object-contain"
        />
        <div className="auth-brand-copy"><p>{platform}</p></div>
      </div>
    </header>
  );
}

function LoginField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  hint,
  icon,
  trailing,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  icon: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <label className="auth-field-label mt-4" htmlFor={id}>
      <span className="flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-muted font-normal">{hint}</span>}
      </span>
      <span className="auth-input-wrap">
        {icon}
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          required
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {trailing}
      </span>
      {error && <span id={`${id}-error`} role="alert" className="mt-1 text-xs text-bad">{error}</span>}
    </label>
  );
}

export default function RoleLoginPage({
  portal,
  showPortalOptions = true,
  onPortalSwitch,
  onLogin,
}: {
  portal: LoginPortal;
  showPortalOptions?: boolean;
  onPortalSwitch?: (portal: PortalLink) => void;
  onLogin: (session: Awaited<ReturnType<typeof authenticateDemoUser>>) => void;
}) {
  const [advisorId, setAdvisorId] = useState('7');
  const [clientName, setClientName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [formError, setFormError] = useState('');
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const language = usePortalLanguage((state) => state.language);
  const setLanguage = usePortalLanguage((state) => state.setLanguage);
  const rtl = isRtl(language);

  const reduceMotion = useReducedMotion() ?? false;
  const text = loginTranslations[language];
  const copy = text.portals[portal];
  const clientPortal = portal === 'client';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFieldErrors({});
    setFormError('');
    setSubmitting(true);

    const credentials: DemoCredentials = clientPortal
      ? { advisorId: advisorId.trim(), clientName: clientName.trim(), password }
      : { username: username.trim(), password };

    try {
      const session = await authenticateDemoUser(portal as DemoRole, credentials);
      onLogin(session);
    } catch (error) {
      if (clientPortal) {
        setFormError(text.invalidClient);
      } else if (error instanceof DemoLoginError) {
        setFieldErrors({
          [error.field]: error.field === 'username' ? text.invalidUsername : text.invalidPassword,
        });
      } else {
        setFormError(text.loginFailure);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enterTransition = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.65, ease: 'easeOut' as const },
      };

  return (
    <main
      dir={rtl ? 'rtl' : 'ltr'}
      lang={language}
      className="fintax-auth relative flex h-[100dvh] min-h-screen items-start justify-center overflow-x-clip overflow-y-auto px-3 py-4 sm:px-6 sm:py-8 md:items-center"
    >
      <div className="auth-background" aria-hidden="true">
        <motion.div
          className="auth-blob auth-blob-purple"
          animate={reduceMotion ? {} : {
            borderRadius: [
              '48% 52% 60% 40% / 45% 40% 60% 55%',
              '60% 40% 42% 58% / 55% 60% 40% 45%',
              '48% 52% 60% 40% / 45% 40% 60% 55%',
            ],
            rotate: [0, 9, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="auth-blob auth-blob-blue"
          animate={reduceMotion ? {} : { y: [0, -22, 0], x: [0, 14, 0], rotate: [0, -7, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-grid" />
      </div>

      <motion.div {...enterTransition} className="relative z-10 w-full max-w-6xl">
        <div className="auth-login-topbar mb-3 flex items-center justify-between">
          <LoginBrandHeader platform={text.platform} />
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 bg-white/80 px-2.5 py-1 text-xs shadow-sm backdrop-blur">
            <Globe2 className="size-3.5 text-cyan" />
            <span className="sr-only">{text.language}</span>
            <select
              aria-label={text.language}
              value={language}
              onChange={(e) => setLanguage(e.target.value as PortalLanguage)}
              className="cursor-pointer bg-transparent py-0.5 text-xs font-semibold text-ink outline-none"
            >
              <option value="en">EN</option>
              <option value="de">DE</option>
              <option value="ar">AR</option>
            </select>
          </label>
        </div>

        <section className="auth-card grid overflow-hidden md:grid-cols-2">
          <div className="auth-form-panel relative flex flex-col p-6 sm:p-9 lg:p-12">
            <div className="auth-small-glow" aria-hidden="true" />
            <form onSubmit={submit} className="relative z-10 flex h-full flex-col">
              <div className="auth-icon-circle">
                {clientPortal ? <UserRound size={24} /> : portal === 'staff' ? <BriefcaseBusiness size={24} /> : <ShieldCheck size={24} />}
              </div>
              <p className="mt-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-cyan">{copy.eyebrow}</p>
              <h1 className="mt-2 text-center font-serif text-3xl font-bold tracking-tight text-ink sm:text-4xl">{copy.title}</h1>
              <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-6 text-muted">{copy.description}</p>

              {showPortalOptions && (
                <div
                  className={`mt-6 grid gap-2 ${clientPortal ? 'grid-cols-3' : 'grid-cols-2'}`}
                  role="group"
                  aria-label={clientPortal ? text.roleGroupClient : text.roleGroupAdmin}
                >
                  {clientPortal && (
                    <button
                      type="button"
                      aria-current={portal === 'client' ? 'page' : undefined}
                      onClick={() => onPortalSwitch?.('client')}
                      className={`auth-role-option min-h-11 flex-row py-2 text-xs ${portal === 'client' ? 'auth-role-active' : ''}`}
                    >
                      <UserRound size={16} /> {text.client}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-current={portal === 'staff' ? 'page' : undefined}
                    onClick={() => onPortalSwitch?.('staff')}
                    className={`auth-role-option min-h-11 flex-row py-2 text-xs ${portal === 'staff' ? 'auth-role-active' : ''}`}
                  >
                    <BriefcaseBusiness size={16} /> {text.staff}
                  </button>
                  <button
                    type="button"
                    aria-current={portal === 'admin' ? 'page' : undefined}
                    onClick={() => onPortalSwitch?.('admin')}
                    className={`auth-role-option min-h-11 flex-row py-2 text-xs ${portal === 'admin' ? 'auth-role-active' : ''}`}
                  >
                    <ShieldCheck size={16} /> {text.admin}
                  </button>
                </div>
              )}

              <div className="mt-6">
                {clientPortal ? (
                  <>
                    <LoginField
                      id="advisor-id"
                      label={text.advisorId}
                      hint={text.advisorHint}
                      value={advisorId}
                      onChange={setAdvisorId}
                      error={fieldErrors.advisorId}
                      autoComplete="username"
                      icon={<Building2 size={17} />}
                    />
                    <LoginField
                      id="client-name"
                      label={text.clientName}
                      hint={text.clientDemo}
                      value={clientName}
                      onChange={setClientName}
                      error={fieldErrors.clientName}
                      autoComplete="username"
                      icon={<UserRound size={17} />}
                    />
                  </>
                ) : (
                  <LoginField
                    id="portal-username"
                    label={text.username}
                    hint={portal === 'staff' ? text.staffDemo : text.adminDemo}
                    value={username}
                    onChange={setUsername}
                    error={fieldErrors.username}
                    autoComplete="username"
                    icon={<UserRound size={17} />}
                  />
                )}

                <LoginField
                  id="portal-password"
                  label={text.password}
                  hint={clientPortal ? text.clientPassword : portal === 'staff' ? text.staffPassword : text.adminPassword}
                  value={password}
                  onChange={setPassword}
                  error={fieldErrors.password}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  icon={<LockKeyhole size={17} />}
                  trailing={(
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? text.hidePassword : text.showPassword}
                      className="auth-password-toggle"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                />
              </div>

              {formError && <p role="alert" className="mt-4 rounded-xl border border-bad/25 bg-bad/10 p-3 text-xs text-bad">{formError}</p>}

              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                icon={!submitting && <KeyRound size={16} />}
                className="mt-6 w-full justify-center"
              >
                {text.signIn}
              </Button>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(true)}
                  className="text-xs font-medium text-cyan hover:underline decoration-cyan/40 underline-offset-4"
                >
                  {text.forgot}
                </button>
              </div>

              <p className="mt-4 text-center text-[11px] leading-5 text-muted">
                {text.demoNotice}
              </p>
            </form>
          </div>

          <aside className="auth-art-panel relative isolate flex min-h-[420px] flex-col justify-between overflow-hidden p-7 text-white sm:p-10 lg:p-12">
            <div className="auth-art-blob auth-art-blob-one" />
            <div className="auth-art-blob auth-art-blob-two" />
            <div className="auth-art-ring auth-art-ring-one" />
            <div className="auth-art-ring auth-art-ring-two" />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/90">
                <span className="grid size-8 place-items-center rounded-xl border border-white/20 bg-white/10 backdrop-blur"><Building2 size={16} /></span>
                {text.workspace}
              </div>
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[9px] font-semibold tracking-widest text-white/90 backdrop-blur">
                {copy.eyebrow}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={portal}
                initial={reduceMotion ? false : { opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -10 }}
                transition={{ duration: 0.35 }}
                className="relative z-10 my-12"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">{copy.title}</p>
                <h2 className="mt-4 max-w-lg font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">{copy.heading}</h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-white/80">{copy.detail}</p>
                <div className="mt-6 space-y-3">
                  {text.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm text-white/90">
                      <span className="grid size-6 place-items-center rounded-full border border-white/25 bg-white/10"><Check size={13} /></span>
                      {feature}
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="relative z-10 grid grid-cols-2 gap-3">
              <motion.div
                animate={reduceMotion ? {} : { y: [0, -5, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className="auth-preview-card"
              >
                <span className="auth-preview-icon"><FileText size={17} /></span>
                <p className="mt-4 text-sm font-semibold">{text.documentWorkflow}</p>
                <p className="mt-1 text-[10px] leading-5 text-white/65">{text.documentWorkflowDetail}</p>
              </motion.div>
              <motion.div
                animate={reduceMotion ? {} : { y: [0, 5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="auth-preview-card"
              >
                <span className="auth-preview-icon"><MessageSquareText size={17} /></span>
                <p className="mt-4 text-sm font-semibold">{text.assistant}</p>
                <p className="mt-1 text-[10px] leading-5 text-white/65">{text.assistantDetail}</p>
              </motion.div>
            </div>

            <div className="relative z-10 mt-7 flex items-center gap-2 text-[10px] text-white/60">
              <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,255,190,.8)]" />
              {text.platform}
              <span className="ml-auto">FinTax</span>
            </div>
          </aside>
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted">
          <span>{text.footer[0]}</span><span className="text-cyan">✦</span><span>{text.footer[1]}</span><span className="text-cyan">✦</span><span>{text.footer[2]}</span><span className="text-cyan">✦</span><span>{text.footer[3]}</span>
        </footer>
      </motion.div>

      {/* Forgot Details Modal */}
      <AnimatePresence>
        {forgotModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setForgotModalOpen(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl text-ink"
            >
              <div className="flex items-center justify-between pb-3 border-b border-ink/5">
                <div className="flex items-center gap-2 font-semibold">
                  <HelpCircle className="size-5 text-cyan" />
                  <span>{text.forgot}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="rounded-lg p-1 text-muted hover:bg-ink/5 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-xs leading-relaxed text-muted">
                <p>
                  {text.forgotReason}
                </p>
                <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-3.5 text-ink">
                  <p className="font-semibold text-xs">{text.support}</p>
                  <p className="mt-1 text-[11px] text-muted">{text.advisorIdShort} <strong className="text-ink">7</strong> (FinTax Consulting)</p>
                  <p className="text-[11px] text-muted">{text.supportContact} <a href="mailto:support@fintax.demo" className="text-cyan underline">support@fintax.demo</a></p>
                  <p className="text-[11px] text-muted mt-1">{text.demoLogin} <strong>7 · clientdemo · client123</strong></p>
                  <p className="mt-1 text-[11px] text-muted">{text.emailHelp}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button variant="primary" onClick={() => setForgotModalOpen(false)}>
                  {text.close}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
