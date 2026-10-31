import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, MessageSquareText, Send, X } from 'lucide-react';
import type { DemoRole } from './demoAccounts';

type Language = 'en' | 'de' | 'ar';
type Destination = { path: string; screen?: string; target: string };
interface HelpMessage {
  id: string;
  role: 'guide' | 'user';
  text: string;
  destination?: Destination;
}

const translations = {
  en: {
    title: 'FinTax demo guide',
    subtitle: 'Help using this project only',
    placeholder: 'Ask how to use the demo…',
    send: 'Send',
    close: 'Close help',
    open: 'Open FinTax demo guide',
    welcome: 'Hi! I can guide you around this fictional FinTax demo. I do not read or answer questions about financial records.',
    startTour: 'Start 4-step tour',
    next: 'Next tour step',
    dismiss: 'Dismiss tour',
    refusal: 'I can only help with using this demo — try one of these:',
    takeMe: 'Take me there',
    quick: ['How do I upload?', 'How do folders work?', 'How do I finish a month?'],
  },
  de: {
    title: 'FinTax Demo-Hilfe',
    subtitle: 'Nur Hilfe zur Bedienung dieses Projekts',
    placeholder: 'Frage zur Demo stellen…',
    send: 'Senden',
    close: 'Hilfe schließen',
    open: 'FinTax Demo-Hilfe öffnen',
    welcome: 'Hallo! Ich kann Sie durch diese fiktive FinTax-Demo führen. Ich lese keine Finanzdaten und beantworte keine Fragen dazu.',
    startTour: '4-Schritte-Tour starten',
    next: 'Nächster Tour-Schritt',
    dismiss: 'Tour beenden',
    refusal: 'Ich helfe nur bei der Bedienung dieser Demo — versuchen Sie eine dieser Fragen:',
    takeMe: 'Dorthin wechseln',
    quick: ['Wie lade ich etwas hoch?', 'Wie funktionieren Ordner?', 'Wie schließe ich einen Monat ab?'],
  },
  ar: {
    title: 'مساعد عرض FinTax',
    subtitle: 'إرشادات استخدام المشروع فقط',
    placeholder: 'اسأل عن استخدام العرض…',
    send: 'إرسال',
    close: 'إغلاق المساعدة',
    open: 'فتح مساعد FinTax',
    welcome: 'مرحباً! يمكنني إرشادك في هذا العرض الوهمي لـ FinTax. لا أقرأ السجلات المالية ولا أجيب عن أسئلة بياناتها.',
    startTour: 'ابدأ الجولة ذات الخطوات الأربع',
    next: 'الخطوة التالية',
    dismiss: 'إنهاء الجولة',
    refusal: 'يمكنني المساعدة في استخدام هذا العرض فقط — جرّب أحد الخيارات:',
    takeMe: 'انتقل إلى الصفحة',
    quick: ['كيف أرفع مستنداً؟', 'كيف تعمل المجلدات؟', 'كيف أنهي الشهر؟'],
  },
} as const;

const TOUR_STEPS: Record<Language, string[]> = {
  en: [
    'Step 1 of 4: The client dashboard shows the selected month, checklist, staff requests, and deadlines.',
    'Step 2 of 4: Open Upload to choose a category, select a month, and add PDFs or supported photos.',
    'Step 3 of 4: Documents are stored only in this browser. OCR is a local helper and must be checked against the original.',
    'Step 4 of 4: Finish month sends the checklist and documents to the demo staff review queue.',
  ],
  de: [
    'Schritt 1 von 4: Das Client-Dashboard zeigt Monat, Checkliste, Rückfragen und Fristen.',
    'Schritt 2 von 4: Unter Upload wählen Sie Kategorie und Monat und fügen PDFs oder unterstützte Fotos hinzu.',
    'Schritt 3 von 4: Dokumente bleiben in diesem Browser. OCR ist eine lokale Hilfe und muss mit dem Original verglichen werden.',
    'Schritt 4 von 4: „Monat abschließen“ sendet Checkliste und Dokumente in die Demo-Prüfung.',
  ],
  ar: [
    'الخطوة 1 من 4: تعرض لوحة العميل الشهر المحدد والقائمة والطلبات والمواعيد.',
    'الخطوة 2 من 4: افتح الرفع لاختيار الفئة والشهر وإضافة PDF أو الصور المدعومة.',
    'الخطوة 3 من 4: تُحفظ الملفات في هذا المتصفح فقط. OCR أداة محلية ويجب التحقق من نتائجها.',
    'الخطوة 4 من 4: يؤدي إنهاء الشهر إلى إرسال الملفات والقائمة إلى مراجعة فريق العرض.',
  ],
};

function guideAnswer(question: string, role: DemoRole, language: Language): { text: string; destination?: Destination } {
  const value = question.toLowerCase();
  const phrases = language === 'de' ? {
    upload: /upload|hochlad|foto|kamera|scan/,
    folders: /ordner|dokument|datei|suchen/,
    finish: /monat|abschlie|einreich/,
    review: /prüfung|review|team|staff|admin|finding|befund/,
    ocr: /ocr|text|erkennung|sprache/,
    login: /anmeld|rolle|login|konto/,
    language: /sprache|arab|deutsch|englisch/,
  } : language === 'ar' ? {
    upload: /رفع|تحميل|كاميرا|مسح/,
    folders: /مجلد|مستند|ملف|بحث/,
    finish: /شهر|إنهاء|إرسال/,
    review: /مراجعة|فريق|موظف|مسؤول/,
    ocr: /ocr|نص|قراءة|لغة/,
    login: /دخول|تسجيل|حساب|دور/,
    language: /لغة|عربي|ألماني|إنجليزي/,
  } : {
    upload: /upload|attach|camera|scan|photo|file/,
    folders: /folder|document|search|download/,
    finish: /finish|submit|month|checklist/,
    review: /review|staff|admin|finding|approval|request/,
    ocr: /ocr|text|recogn|language|arabic/,
    login: /login|role|account|sign in/,
    language: /language|arabic|german|english|voice/,
  };

  if (phrases.upload.test(value)) return {
    text: language === 'de'
      ? '1. Öffnen Sie Upload. 2. Wählen Sie Dokumenttyp und Monat. 3. Wählen Sie eine Datei oder ein Foto. Die lokale Texterkennung kann fehlerhaft sein.'
      : language === 'ar'
        ? '١. افتح الرفع. ٢. اختر نوع المستند والشهر. ٣. اختر ملفاً أو صورة. قد تخطئ قراءة النص المحلية.'
        : '1. Open Upload. 2. Choose a document type and month. 3. Pick a file or photo. Local text recognition can be inaccurate.',
    destination: { path: '/demo/client/upload', target: 'client-upload' },
  };
  if (phrases.folders.test(value)) return {
    text: language === 'de'
      ? 'Dokumente werden je Client, Jahr und Monat organisiert: FiBu, LoBu, Schriftverkehr oder Agenda. Öffnen Sie Dokumente, um Namen und erkannten Text zu durchsuchen.'
      : language === 'ar'
        ? 'تُنظّم المستندات حسب العميل والسنة والشهر ضمن FiBu وLoBu والمراسلات وAgenda. افتح المستندات للبحث في الأسماء والنصوص المقروءة.'
        : 'Documents are grouped by client, year, and month under FiBu, LoBu, correspondence, or Agenda. Open Documents to search names and extracted text.',
    destination: { path: '/demo/client/documents', target: 'client-documents' },
  };
  if (phrases.finish.test(value)) return {
    text: language === 'de'
      ? 'Alle Pflichtpunkte müssen hochgeladen oder mit einem Grund als nicht zutreffend markiert sein. Nach der Bestätigung ist der Monat schreibgeschützt und erscheint in der Staff-Prüfung.'
      : language === 'ar'
        ? 'يجب رفع جميع العناصر المطلوبة أو تحديد عدم انطباقها مع سبب. بعد التأكيد يصبح الشهر للقراءة فقط ويظهر في مراجعة الفريق.'
        : 'Required checklist items must be uploaded or marked not applicable with a reason. After confirmation the month becomes read-only and appears in staff review.',
    destination: { path: '/demo/client', target: 'client-month' },
  };
  if (phrases.review.test(value)) {
    if (role === 'client') return {
      text: language === 'de' ? 'Das FinTax-Team prüft eingereichte Monate, kann Rückfragen senden und den Monat nach der Prüfung freigeben.' : language === 'ar' ? 'يراجع فريق FinTax الأشهر المرسلة، وقد يطلب توضيحات ثم يعتمد الشهر بعد المراجعة.' : 'FinTax staff review submitted months, may request clarification, and can approve the month after review.',
      destination: { path: '/demo/client', target: 'client-demo-tasks' },
    };
    return {
      text: language === 'de'
        ? 'Öffnen Sie „Month submissions“, starten Sie die Prüfung und prüfen Sie Belege und deterministische Hinweise. Admins können diese Ansicht nur lesen.'
        : language === 'ar'
          ? 'افتح «إرسالات الأشهر» وابدأ المراجعة وافحص المستندات والتنبيهات المحددة. يمكن للمسؤول عرض الصفحة فقط.'
          : 'Open Month submissions, start review, and check documents and deterministic findings. Admins can inspect this view read-only.',
      destination: { path: `/demo/${role}`, screen: 'submissions', target: 'month-submissions' },
    };
  }
  if (phrases.ocr.test(value)) return {
    text: language === 'de'
      ? 'PDF-Text wird lokal gelesen; Scans und unterstützte Bilder verwenden Tesseract OCR. Scans sind auf 10 Seiten je PDF begrenzt. Handschrift, Fotos und Arabisch können ungenau sein.'
      : language === 'ar'
        ? 'تُقرأ نصوص PDF محلياً وتستخدم الصور المدعومة Tesseract OCR. يقتصر المسح على 10 صفحات لكل PDF. قد تكون الكتابة اليدوية والصور والعربية غير دقيقة.'
        : 'PDF text is read locally; scans and supported images use Tesseract OCR. Scanned PDFs are limited to 10 OCR pages. Handwriting, photos, and Arabic can be inaccurate.',
  };
  if (phrases.login.test(value)) return {
    text: language === 'de'
      ? 'Wählen Sie auf der Startseite Client, Staff oder Admin und verwenden Sie „Continue as Demo User“. Die Demo nutzt fiktive Profile und keine echten Konten.'
      : language === 'ar'
        ? 'في صفحة البداية اختر Client أو Staff أو Admin ثم «Continue as Demo User». يستخدم العرض ملفات وهمية وليس حسابات حقيقية.'
        : 'On the start page choose Client, Staff, or Admin and select Continue as Demo User. The demo uses fictional profiles, not real accounts.',
  };
  if (phrases.language.test(value)) return {
    text: language === 'de'
      ? 'Die Client-Oberfläche bietet Englisch, Deutsch und Arabisch. Arabische Sprache kann zusätzliches OCR-Sprachmodell laden; Spracheingabe hängt vom Browser ab.'
      : language === 'ar'
        ? 'تدعم واجهة العميل الإنجليزية والألمانية والعربية. قد تُحمّل العربية بيانات OCR إضافية، ويعتمد الإدخال الصوتي على المتصفح.'
        : 'The client interface supports English, German, and Arabic. Arabic may load additional OCR data; voice input depends on browser support.',
  };
  return {
    text: translations[language].refusal,
  };
}

export default function HelpBot({ role }: { role: DemoRole }) {
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('fintax-language');
    return saved === 'de' || saved === 'ar' ? saved : 'en';
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const text = translations[language];
  const rtl = language === 'ar';

  useEffect(() => {
    const syncLanguage = (event: Event) => {
      const selected = event instanceof CustomEvent ? event.detail : localStorage.getItem('fintax-language');
      if (selected === 'en' || selected === 'de' || selected === 'ar') setLanguage(selected);
    };
    window.addEventListener('storage', syncLanguage);
    window.addEventListener('fintax-language-change', syncLanguage);
    return () => {
      window.removeEventListener('storage', syncLanguage);
      window.removeEventListener('fintax-language-change', syncLanguage);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement | HTMLInputElement>('button, input')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const controls = panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    const outsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target) && !launcherRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outsideClick);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.removeEventListener('pointerdown', outsideClick);
    };
  }, [open]);

  const openGuide = () => {
    setOpen(true);
    if (!localStorage.getItem('fintax-helpbot-seen-v1')) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'guide', text: text.welcome }]);
      localStorage.setItem('fintax-helpbot-seen-v1', 'true');
    }
  };

  const send = (question: string) => {
    const userText = question.trim();
    if (!userText) return;
    const answer = guideAnswer(userText, role, language);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text: userText },
      { id: crypto.randomUUID(), role: 'guide', ...answer },
    ]);
    setDraft('');
  };

  const startTour = () => {
    setTourStep(0);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'guide', text: TOUR_STEPS[language][0] }]);
  };

  const nextTourStep = () => {
    if (tourStep === null) return;
    const next = tourStep + 1;
    if (next >= TOUR_STEPS[language].length) {
      setTourStep(null);
      return;
    }
    setTourStep(next);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'guide', text: TOUR_STEPS[language][next] }]);
  };

  const navigateTo = (destination: Destination) => {
    window.dispatchEvent(new CustomEvent('fintax-navigate-workspace', { detail: destination.screen }));
    window.history.pushState(null, '', destination.path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.setTimeout(() => {
      const target = document.getElementById(destination.target);
      target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      target?.classList.add('helpbot-highlight');
      window.setTimeout(() => target?.classList.remove('helpbot-highlight'), 2200);
    }, 350);
    setOpen(false);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(draft);
  };

  const quickReplies = role === 'client'
    ? text.quick
    : role === 'staff'
      ? language === 'de' ? ['Monatsprüfung öffnen', 'Dokument prüfen', 'Rückfrage senden'] : language === 'ar' ? ['مراجعة الشهر', 'فحص المستند', 'إرسال طلب'] : ['Review a submitted month', 'Check a document', 'Request clarification']
      : language === 'de' ? ['Monatsübersicht öffnen', 'Admin-Ansicht', 'Demo-Rollen'] : language === 'ar' ? ['عرض الأشهر', 'عرض المسؤول', 'أدوار العرض'] : ['View month submissions', 'Admin read-only view', 'Demo roles'];

  return <>
    <button ref={launcherRef} type="button" aria-label={text.open} aria-expanded={open} onClick={openGuide}
      className="helpbot-launcher fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-[70] grid size-14 place-items-center rounded-full bg-gradient-to-br from-violet to-blue text-white shadow-xl shadow-violet/35 transition-transform hover:scale-105 focus-visible:outline-white sm:bottom-6">
      <MessageSquareText className="size-6" />
      {!localStorage.getItem('fintax-helpbot-seen-v1') && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-amber-400" />}
      <span className="sr-only">{text.open}</span>
    </button>
    <AnimatePresence>
      {open && <>
        <div className="fixed inset-0 z-[69] bg-black/10 md:bg-transparent" aria-hidden onClick={() => setOpen(false)} />
        <motion.section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="helpbot-title" dir={rtl ? 'rtl' : 'ltr'}
          initial={reducedMotion ? false : { opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
          className="fixed inset-x-0 bottom-0 z-[71] flex h-[min(92dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-white/80 bg-white shadow-2xl md:inset-x-auto md:bottom-24 md:right-5 md:h-[560px] md:w-[380px] md:rounded-3xl">
          <header className="flex items-center gap-3 border-b border-ink/10 bg-gradient-to-r from-violet/5 to-blue/5 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet to-blue text-white"><MessageSquareText className="size-4" /></span>
            <div className="min-w-0 flex-1"><h2 id="helpbot-title" className="truncate text-sm font-semibold text-ink">{text.title}</h2><p className="text-[10px] text-muted">{text.subtitle}</p></div>
            <label className="sr-only" htmlFor="helpbot-language">Help language</label>
            <select id="helpbot-language" value={language} onChange={(event) => {
              const next = event.target.value as Language;
              setLanguage(next);
              localStorage.setItem('fintax-language', next);
              document.documentElement.lang = next;
              document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
              window.dispatchEvent(new CustomEvent('fintax-language-change', { detail: next }));
            }} className="min-h-10 rounded-lg border border-ink/10 bg-white px-2 text-xs text-ink">
              <option value="en">EN</option><option value="de">DE</option><option value="ar">AR</option>
            </select>
            <button type="button" aria-label={text.close} onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full text-muted hover:bg-ink/5"><X className="size-4" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-label="Help conversation">
            {!messages.length && <div className="rounded-2xl bg-violet/5 p-3 text-xs leading-5 text-ink">{text.welcome}</div>}
            {messages.map((message) => <div key={message.id} className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-xs leading-5 ${message.role === 'user' ? 'ms-auto bg-violet text-white' : 'me-auto bg-bg/70 text-ink'}`}>
              <p>{message.text}</p>
              {message.destination && <button type="button" onClick={() => navigateTo(message.destination!)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-violet px-3 text-[11px] font-medium text-white hover:bg-blue">{text.takeMe}<ArrowRight className="size-3.5" /></button>}
            </div>)}
            {tourStep === null && <button type="button" onClick={startTour} className="rounded-full border border-violet/20 px-3 py-2 text-[11px] font-medium text-violet">{text.startTour}</button>}
            {tourStep !== null && <div className="flex gap-2"><button type="button" onClick={nextTourStep} className="rounded-full bg-violet px-3 py-2 text-[11px] font-medium text-white">{text.next}</button><button type="button" onClick={() => setTourStep(null)} className="rounded-full border border-ink/10 px-3 py-2 text-[11px] text-muted">{text.dismiss}</button></div>}
            <div className="flex flex-wrap gap-2">{quickReplies.map((reply) => <button key={reply} type="button" onClick={() => send(reply)} className="min-h-9 rounded-full border border-ink/10 bg-white px-3 text-[10px] text-ink hover:border-violet/30 hover:bg-violet/5">{reply}</button>)}</div>
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-ink/10 p-3">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.placeholder} aria-label={text.placeholder}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-ink/10 bg-white px-4 text-xs text-ink" />
            <button type="submit" disabled={!draft.trim()} aria-label={text.send} className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet to-blue text-white disabled:opacity-40"><Send className="size-4" /></button>
          </form>
        </motion.section>
      </>}
    </AnimatePresence>
  </>;
}
