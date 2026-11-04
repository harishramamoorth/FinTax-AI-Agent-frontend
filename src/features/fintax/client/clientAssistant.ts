import type { DemoDocument } from '../shared/demoWorkflow';
import type { ClientDemoProfile, DemoTask } from '../shared/clientDemoData';

export type AssistantLanguage = 'en' | 'de' | 'ar' | 'fa';
export type AssistantAction = { type: 'view_document'; documentId: string; label: string }
  | { type: 'upload'; label: string }
  | { type: 'view_tasks'; label: string }
  | { type: 'ask_accountant'; label: string };

export interface AssistantAnswer {
  answer: string;
  references: string[];
  actions: AssistantAction[];
}

const text = (language: AssistantLanguage, en: string, de: string, ar: string, fa?: string) => {
  if (language === 'de') return de;
  if (language === 'ar') return ar;
  if (language === 'fa') return fa ?? en;
  return en;
};

const money = (value: number, currency: string, language: AssistantLanguage) =>
  new Intl.NumberFormat(language === 'de' ? 'de-DE' : language === 'ar' ? 'ar-AE' : language === 'fa' ? 'fa-IR' : 'en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

const parseAmount = (value: string) => {
  const number = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const inCurrentPeriod = (document: DemoDocument, profile: ClientDemoProfile) => {
  const [monthName, year] = profile.period.split(' ');
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthName) + 1;
  const documentDate = document.fields.documentDate || document.createdAt;
  return month > 0 && documentDate.startsWith(`${year}-${String(month).padStart(2, '0')}`);
};

export function answerClientQuestion(
  question: string,
  language: AssistantLanguage,
  profile: ClientDemoProfile,
  documents: DemoDocument[],
  tasks: DemoTask[],
): AssistantAnswer {
  const normalized = question.toLowerCase();
  const sources: string[] = [];
  const actions: AssistantAction[] = [];
  const reference = (document: DemoDocument) => `${document.id} · ${document.name}`;
  const action = (type: AssistantAction['type'], label: string, documentId?: string): AssistantAction => (
    type === 'view_document' ? { type, label, documentId: documentId ?? '' } : { type, label }
  );
  const invoiceDocs = documents.filter((document) => ['sales_invoice', 'purchase_invoice'].includes(document.category));
  const periodInvoices = invoiceDocs.filter((document) => inCurrentPeriod(document, profile));
  const bankDocs = documents.filter((document) => document.category === 'bank_statement')
    .sort((left, right) => right.fields.documentDate.localeCompare(left.fields.documentDate) || right.createdAt.localeCompare(left.createdAt));
  const payrollDocs = documents.filter((document) => document.category === 'payroll');
  const letters = documents.filter((document) => document.category === 'correspondence' || document.category === 'other_correspondence');
  let answer: string;
  let needsAccountant = false;

  // Requirement: Do not let it state legal or tax conclusions
  const asksLegalOrTaxConclusion = /can i deduct|is this deductible|tax exemption|is it tax free|legal deadline|tax liability conclusion|steuerrechtlich absetzbar|kann ich absetzen|steuerbefreit|rechtsberatung|نصيحة ضريبية|استشارة قانونية|آیا مالیات معاف است|مشاوره مالیاتی/.test(normalized);

  const wantsUnpaid = /unpaid|outstanding invoice|open invoice|unbezahlt|offen(e|e rechnung)?|غير مدفوع|پرداخت نشده/.test(normalized);
  const wantsBank = /bank|statement|transaction|kontoauszug|transaktion|auszug|بنك|كشف|بانک|صورتحساب/.test(normalized);
  const wantsPayroll = /payroll|payslip|salary|lohn|gehalt|personal|gehaltsabrechnung|رواتب|حقوق/.test(normalized);
  const wantsMissing = /missing|missing document|what documents|fehlen|fehlend|unterlagen|مستندات|ناقص|مدارک/.test(normalized);
  const wantsLetter = /tax.office|finanzamt|letter|authority|bescheid|brief|steuer|steuerbehörde|خطاب|ضريبة|اداره مالیات|نامه/.test(normalized);
  const wantsTasks = /task|to.do|complete|todo|aufgabe|erledigen|مهمة|وظیفه|کار/.test(normalized);
  const wantsApproval = /approv|status|review|freigabe|genehmig|prüf|موافقة|حالة|وضعیت|تایید/.test(normalized);
  const wantsVat = /vat|mwst|ust|value.added|tax total|mehrwertsteuer|umsatzsteuer|ضريبة القيمة|مالیات بر ارزش افزوده/.test(normalized);
  const asksAccountant = /ask my accountant|ask accountant|clarify|please ask|frage.*steuerberater|accountant.*frage|buchhalter.*fragen|clarify.*transaction|اسأل.*محاسب|از حسابدار بپرس/.test(normalized);
  const wantsFinance = /financial|summary|finance|revenue|expense|finanziell|übersicht|umsatz|ausgabe|ملخص مالي|خلاصه مالی/.test(normalized);

  if (asksLegalOrTaxConclusion) {
    answer = text(language,
      `I cannot provide legal or tax advice or draw binding legal conclusions. As an AI assistant, I only answer factual questions based on ${profile.company}'s sample records. Please consult your licensed tax advisor directly.`,
      `Ich kann keine steuerliche oder rechtliche Beratung erbringen oder verbindliche Schlüsse ziehen. Als Assistent beantworte ich Fragen ausschließlich auf Basis der vorliegenden Belege von ${profile.company}. Bitte wenden Sie sich direkt an Ihre Kanzlei.`,
      `لا يمكنني تقديم استشارات قانونية أو ضريبية أو استخلاص نتائج ملزمة. كوني مساعداً، أجيب فقط استناداً إلى سجلات ${profile.company}. يرجى استشارة مستشارك المالي مباشرة.`,
      `من نمی‌توانم مشاوره حقوقی یا مالیاتی ارائه دهم یا نتایج قانونی قطعی اعلام نمایم. من صرفاً بر اساس مدارک نمونه ${profile.company} پاسخ می‌دهم. لطفاً مستقیماً با مشاور مالیاتی خود مشورت کنید.`);
    needsAccountant = true;
    actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب', 'ارسال پرسش به حسابدار')));
  } else if (asksAccountant) {
    const selectedBank = bankDocs[0];
    if (selectedBank) sources.push(reference(selectedBank));
    answer = text(language,
      `I can send this question to your accountant for clarification. This will create a demo correspondence item for ${profile.company}.`,
      `Ich kann diese Frage zur Klärung an Ihre Buchhaltung senden. Dadurch wird ein Demo-Korrespondenzeintrag für ${profile.company} erstellt.`,
      `يمكنني إرسال هذا السؤال إلى محاسبك للتوضيح. سيُنشئ ذلك مراسلة تجريبية لشركة ${profile.company}.`,
      `می‌توانم این پرسش را جهت شفاف‌سازی برای حسابدار شما ارسال نمایم تا یک مکاتبه ثبت شود.`);
    needsAccountant = true;
    actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب', 'ارسال پرسش به حسابدار')));
  } else if (wantsMissing) {
    const attention = documents.filter((document) => ['needs_information', 'action_required', 'password_required', 'rejected'].includes(document.status));
    const missing = [...profile.missingDocuments, ...attention.map((document) => `${document.name}: ${document.note ?? document.status}`)];
    answer = missing.length
      ? text(language,
        `For ${profile.company}, the demo checklist shows: ${missing.join('; ')}. These are fictional checklist items, not an authoritative accounting assessment.`,
        `Für ${profile.company} zeigt die Demo-Checkliste: ${missing.join('; ')}. Dies sind fiktive Checklistenpunkte, keine verbindliche Buchhaltungsprüfung.`,
        `لشركة ${profile.company}، تعرض قائمة التحقق التجريبية: ${missing.join('؛ ')}. هذه بيانات خيالية وليست مراجعة محاسبية معتمدة.`,
        `برای ${profile.company}، موارد ناقص شامل: ${missing.join('؛ ')} می‌باشد.`)
      : text(language, `I don't see a missing-document item in the available demo records for ${profile.company}.`, `In den verfügbaren Demodaten für ${profile.company} ist kein fehlendes Dokument vermerkt.`, `لا يظهر مستند مفقود في سجلات العرض المتاحة لـ ${profile.company}.`, `مدرک ناقصی در داده‌های ${profile.company} ثبت نشده است.`);
    needsAccountant = true;
    actions.push(action('upload', text(language, 'Upload missing document', 'Fehlendes Dokument hochladen', 'رفع المستند الناقص', 'بارگذاری مدرک ناقص')));
  } else if (wantsPayroll) {
    const payrollDoc = payrollDocs.find((document) => (document.extractedDetails?.['Pay period'] ?? profile.payroll.month).toLowerCase().includes('september'));
    const period = payrollDoc?.extractedDetails?.['Pay period'] ?? profile.payroll.month;
    const gross = parseAmount(payrollDoc?.extractedDetails?.['Gross payroll'] ?? '') ?? profile.payroll.gross;
    const net = parseAmount(payrollDoc?.extractedDetails?.['Net payroll'] ?? '') ?? profile.payroll.net;
    const deductions = parseAmount(payrollDoc?.extractedDetails?.['Deductions'] ?? '') ?? profile.payroll.deductions;
    if (payrollDoc) sources.push(reference(payrollDoc));
    answer = text(language,
      `${period} demo payroll for ${profile.company}: ${profile.payroll.employees} employees; gross ${money(gross, profile.currency, language)}, deductions ${money(deductions, profile.currency, language)}, net ${money(net, profile.currency, language)}. These figures come from the fictional payroll summary.`,
      `Demo-Gehaltsabrechnung ${period} für ${profile.company}: ${profile.payroll.employees} Mitarbeiter; brutto ${money(gross, profile.currency, language)}, Abzüge ${money(deductions, profile.currency, language)}, netto ${money(net, profile.currency, language)}. Diese Werte stammen aus der fiktiven Lohnübersicht.`,
      `كشف رواتب ${period} التجريبي لشركة ${profile.company}: ${profile.payroll.employees} موظفين؛ الإجمالي ${money(gross, profile.currency, language)}، الخصومات ${money(deductions, profile.currency, language)}، الصافي ${money(net, profile.currency, language)}. هذه الأرقام مأخوذة من ملخص الرواتب الخيالي.`,
      `حقوق و دستمزد ${period} برای ${profile.company}: ${profile.payroll.employees} کارمند؛ ناخالص ${money(gross, profile.currency, language)}، کسورات ${money(deductions, profile.currency, language)}، خالص ${money(net, profile.currency, language)}.`);
    if (payrollDoc) actions.push(action('view_document', text(language, 'View payroll document', 'Lohnnachweis ansehen', 'عرض مستند الراتب', 'مشاهده سند حقوق'), payrollDoc.id));
  } else if (wantsBank) {
    const bank = bankDocs[0];
    if (bank) {
      sources.push(reference(bank));
      const details = bank.extractedDetails ?? {};
      const transactions = Object.entries(details).filter(([key]) => key.startsWith('Transaction ')).map(([, value]) => value);
      answer = text(language,
        `Latest available bank statement for ${profile.company}: opening balance ${details['Opening balance'] ?? 'not provided'}, closing balance ${details['Closing balance'] ?? 'not provided'}. ${transactions.length ? `Listed transactions: ${transactions.join('; ')}.` : 'No transaction lines are available.'} The demo does not reconcile balances or match payments automatically.`,
        `Neuester verfügbarer Kontoauszug für ${profile.company}: Anfangssaldo ${details['Opening balance'] ?? 'nicht angegeben'}, Endsaldo ${details['Closing balance'] ?? 'nicht angegeben'}. ${transactions.length ? `Aufgeführte Umsätze: ${transactions.join('; ')}.` : 'Keine Umsatzzeilen verfügbar.'} Die Demo gleicht Salden nicht ab und ordnet Zahlungen nicht automatisch zu.`,
        `أحدث كشف حساب متاح لشركة ${profile.company}: الرصيد الافتتاحي ${details['Opening balance'] ?? 'غير متوفر'}، والختامي ${details['Closing balance'] ?? 'غير متوفر'}. ${transactions.length ? `المعاملات المسجلة: ${transactions.join('؛ ')}.` : 'لا توجد تفاصيل معاملات.'} لا تقوم النسخة التجريبية بمطابقة الأرصدة تلقائياً.`,
        `آخرین صورتحساب موجود برای ${profile.company}: مانده افتتاحیه ${details['Opening balance'] ?? 'نامشخص'}، مانده پایانی ${details['Closing balance'] ?? 'نامشخص'}.`
      );
      actions.push(action('view_document', text(language, 'View statement', 'Kontoauszug ansehen', 'عرض كشف الحساب', 'مشاهده صورتحساب'), bank.id));
    } else {
      answer = text(language,
        `No bank statement is available in ${profile.company}'s current demo records, so I can't summarize its transactions.`,
        `In den aktuellen Demodaten von ${profile.company} ist kein Kontoauszug vorhanden; ich kann die Umsätze daher nicht zusammenfassen.`,
        `لا يوجد كشف حساب في سجلات العرض الحالية لشركة ${profile.company}، لذلك لا يمكنني تلخيص المعاملات.`,
        `هیچ صورتحساب بانکی در مدارک موجود برای ${profile.company} در دسترس نیست.`
      );
      needsAccountant = true;
      actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب', 'ارسال پرسش به حسابدار')));
    }
  } else if (wantsLetter) {
    const letter = [...letters].sort((left, right) => right.fields.documentDate.localeCompare(left.fields.documentDate) || right.createdAt.localeCompare(left.createdAt))[0];
    if (letter) {
      sources.push(reference(letter));
      answer = text(language,
        `${letter.fields.counterparty ?? 'Tax authority'} letter ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}dated ${letter.fields.documentDate || 'date not detected'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'The letter details are not available.'} This is a plain-language summary of fictional demo metadata, not tax advice.`,
        `Schreiben von ${letter.fields.counterparty ?? 'der Steuerbehörde'} ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}vom ${letter.fields.documentDate || 'Datum nicht erkannt'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'Schreibendetails sind nicht verfügbar.'} Dies ist eine vereinfachte Zusammenfassung fiktiver Demodaten, keine Steuerberatung.`,
        `خطاب ${letter.fields.counterparty ?? 'السلطة الضريبية'} ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}بتاريخ ${letter.fields.documentDate || 'تاريخ غير محدد'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'تفاصيل الخطاب غير متاحة.'} هذا ملخص مبسط لبيانات تجريبية خيالية وليس استشارة ضريبية.`,
        `نامه ${letter.fields.counterparty ?? 'اداره مالیات'} ${letter.fields.reference ? `(${letter.fields.reference}) ` : ''}مورخ ${letter.fields.documentDate || 'تاریخ مشخص نیست'}: ${letter.extractedDetails?.['Letter summary'] ?? letter.fields.description ?? 'جزئیات نامه در دسترس نیست.'} این یک خلاصه ساده از اطلاعات فرضی آزمایشی است، نه مشاوره مالیاتی.`
      );
      actions.push(action('view_document', text(language, 'View letter', 'Schreiben ansehen', 'عرض الخطاب', 'مشاهده نامه'), letter.id));
    } else {
      answer = text(language,
        `No tax-office letter is available in ${profile.company}'s demo records.`,
        `In den Demodaten von ${profile.company} ist kein Schreiben der Steuerbehörde vorhanden.`,
        `لا يوجد خطاب من السلطة الضريبية في سجلات العرض الخاصة بـ ${profile.company}.`,
        `هیچ نامه‌ای از اداره مالیات در سوابق آزمایشی ${profile.company} موجود نیست.`
      );
      needsAccountant = true;
    }
  } else if (wantsTasks) {
    const openTasks = tasks.filter((task) => !task.complete);
    answer = openTasks.length
      ? text(language,
        `Open tasks for ${profile.company}: ${openTasks.map((task) => `${task.title} (due ${task.dueDate}, ${task.owner})`).join('; ')}.`,
        `Offene Aufgaben für ${profile.company}: ${openTasks.map((task) => `${task.title} (fällig am ${task.dueDate}, ${task.owner})`).join('; ')}.`,
        `المهام المفتوحة لشركة ${profile.company}: ${openTasks.map((task) => `${task.title} (تستحق في ${task.dueDate}، ${task.owner})`).join('؛ ')}.`,
        `وظایف جاری برای ${profile.company}: ${openTasks.map((task) => `${task.title} (سررسید ${task.dueDate})`).join('؛ ')}.`)
      : text(language, `All demo tasks for ${profile.company} are marked complete.`, `Alle Demo-Aufgaben für ${profile.company} sind erledigt.`, `جميع المهام التجريبية لشركة ${profile.company} مكتملة.`, `تمامی وظایف انجام شده‌اند.`);
    actions.push(action('view_tasks', text(language, 'View tasks', 'Aufgaben ansehen', 'عرض المهام', 'مشاهده وظایف')));
  } else if (wantsUnpaid) {
    const unpaid = invoiceDocs.filter((document) => document.paymentStatus === 'unpaid' || (!document.paymentStatus && document.status !== 'approved'));
    if (unpaid.length) {
      const sum = unpaid.reduce((total, document) => total + (parseAmount(document.fields.grossAmount) ?? 0), 0);
      sources.push(...unpaid.map(reference));
      answer = text(language,
        `Found ${unpaid.length} open/unpaid invoice record${unpaid.length === 1 ? '' : 's'} for ${profile.company} totalling ${money(sum, profile.currency, language)}: ${unpaid.map((document) => `${document.id} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join(', ')}. This reflects demo document flags, not a verified bank reconciliation.`,
        `${unpaid.length} offene/unbezahlte Rechnungsbelege für ${profile.company} mit insgesamt ${money(sum, profile.currency, language)} gefunden: ${unpaid.map((document) => `${document.id} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join(', ')}. Dies spiegelt Demo-Dokumentdaten wider, keinen abgestimmten Bankstand.`,
        `تم العثور على ${unpaid.length} فاتورة غير مدفوعة لشركة ${profile.company} بإجمالي ${money(sum, profile.currency, language)}: ${unpaid.map((document) => `${document.id} (${money(parseAmount(document.fields.grossAmount) ?? 0, profile.currency, language)})`).join('، ')}.`,
        `تعداد ${unpaid.length} فاکتور پرداخت‌نشده برای ${profile.company} به مبلغ کل ${money(sum, profile.currency, language)} یافت شد.`);
      actions.push(action('view_document', text(language, 'View unpaid invoices', 'Offene Rechnungen ansehen', 'عرض الفواتير غير المدفوعة', 'مشاهده فاکتورهای باز'), unpaid[0].id));
    } else {
      answer = text(language, `All recorded invoices for ${profile.company} appear paid or approved in this demo.`, `Alle erfassten Rechnungen für ${profile.company} sind in dieser Demo als bezahlt oder freigegeben markiert.`, `جميع الفواتير المسجلة لشركة ${profile.company} مدفوعة أو معتمدة.`, `تمام فاکتورهای ثبت‌شده پرداخت‌شده می‌باشند.`);
    }
  } else if (wantsVat) {
    const invoiceRecords = invoiceDocs.filter((document) => parseAmount(document.fields.vatAmount) !== null);
    const vatTotal = invoiceRecords.reduce((sum, document) => sum + (parseAmount(document.fields.vatAmount) ?? 0), 0);
    sources.push(...invoiceRecords.map(reference));
    answer = invoiceRecords.length
      ? text(language, `The VAT amounts on ${invoiceRecords.length} available October invoice record${invoiceRecords.length === 1 ? '' : 's'} total ${money(vatTotal, profile.currency, language)} for ${profile.company}. This adds recorded invoice VAT amounts regardless of approval status; it is not a filed tax return or a verified liability.`, `Die ausgewiesenen Umsatzsteuerbeträge aus ${invoiceRecords.length} verfügbaren Oktober-Rechnungsbelegen ergeben ${money(vatTotal, profile.currency, language)} für ${profile.company}. Berücksichtigt werden erfasste Rechnungsbeträge unabhängig vom Freigabestatus; dies ist weder eine Steuererklärung noch eine bestätigte Steuerschuld.`, `تبلغ مبالغ ضريبة القيمة المضافة المسجلة في ${invoiceRecords.length} فاتورة متاحة لشهر أكتوبر ${money(vatTotal, profile.currency, language)} لشركة ${profile.company}. هذا مجموع المبالغ المدونة بغض النظر عن حالة الموافقة، وليس إقراراً ضريبياً أو التزاماً مؤكداً.`, `مجموع مبالغ مالیات بر ارزش افزوده در فاکتورهای موجود ماه اکتبر معادل ${money(vatTotal, profile.currency, language)} می‌باشد.`)
      : text(language, `No invoice VAT amounts are available for ${profile.company}, so I can't calculate a total.`, `Für ${profile.company} sind keine Umsatzsteuerbeträge aus Rechnungen verfügbar; eine Summe kann ich nicht berechnen.`, `لا تتوفر مبالغ ضريبة فواتير لشركة ${profile.company}، لذلك لا يمكن حساب الإجمالي.`, `هیچ مبلغ مالیات بر ارزش افزوده‌ای برای ${profile.company} در دسترس نیست.`);
  } else if (wantsApproval) {
    const approved = documents.filter((document) => document.status === 'approved');
    const pending = documents.filter((document) => ['review', 'processing', 'needs_information', 'action_required', 'password_required'].includes(document.status));
    answer = text(language,
      `${profile.company} has ${approved.length} approved document${approved.length === 1 ? '' : 's'} and ${pending.length} still pending review or action. ${approved.length ? `Approved: ${approved.map((document) => document.id).join(', ')}.` : 'No documents have been approved yet.'}`,
      `Bei ${profile.company} sind ${approved.length} Dokument${approved.length === 1 ? '' : 'e'} freigegeben und ${pending.length} warten noch auf Prüfung oder Bearbeitung. ${approved.length ? `Freigegeben: ${approved.map((document) => document.id).join(', ')}.` : 'Bisher wurde kein Dokument freigegeben.'}`,
      `لدى ${profile.company} عدد ${approved.length} مستندات معتمدة و${pending.length} قيد المراجعة أو الإجراء. ${approved.length ? `المعتمد: ${approved.map((document) => document.id).join('، ')}.` : 'لم تتم الموافقة على أي مستند بعد.'}`,
      `${profile.company} دارای ${approved.length} سند تأییدشده و ${pending.length} سند در انتظار بررسی می‌باشد.`);
    sources.push(...approved.map(reference), ...pending.map(reference));
    if (pending[0]) actions.push(action('view_document', text(language, 'View pending document', 'Offenes Dokument ansehen', 'عرض المستند المعلق', 'مشاهده سند در انتظار'), pending[0].id));
  } else if (wantsFinance) {
    const sales = periodInvoices.filter((document) => document.category === 'sales_invoice');
    const purchases = periodInvoices.filter((document) => document.category === 'purchase_invoice');
    const totals = (records: DemoDocument[], key: 'netAmount' | 'vatAmount' | 'grossAmount') => records.reduce((sum, document) => sum + (parseAmount(document.fields[key]) ?? 0), 0);
    const known = [...sales, ...purchases];
    sources.push(...known.map(reference));
    answer = known.length
      ? text(language,
        `${profile.company} · ${profile.period}, based on ${known.length} available invoice records: sales ${money(totals(sales, 'grossAmount'), profile.currency, language)} gross and purchases ${money(totals(purchases, 'grossAmount'), profile.currency, language)} gross. Recorded sales VAT: ${money(totals(sales, 'vatAmount'), profile.currency, language)}; purchase VAT: ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. This is a document-based demo summary, not a complete P&L or reconciled balance.`,
        `${profile.company} · ${profile.period}, basierend auf ${known.length} verfügbaren Rechnungen: Umsätze ${money(totals(sales, 'grossAmount'), profile.currency, language)} brutto und Ausgaben ${money(totals(purchases, 'grossAmount'), profile.currency, language)} brutto. Erfasste Umsatzsteuer: ${money(totals(sales, 'vatAmount'), profile.currency, language)}; Vorsteuer: ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. Dies ist eine Dokumentübersicht, keine vollständige GuV oder abgestimmte Bilanz.`,
        `${profile.company} · ${profile.period}، استناداً إلى ${known.length} سجلات فواتير متاحة: المبيعات الإجمالية ${money(totals(sales, 'grossAmount'), profile.currency, language)} والمشتريات الإجمالية ${money(totals(purchases, 'grossAmount'), profile.currency, language)}. ضريبة المبيعات المسجلة ${money(totals(sales, 'vatAmount'), profile.currency, language)}؛ وضريبة المشتريات ${money(totals(purchases, 'vatAmount'), profile.currency, language)}. هذا ملخص تجريبي للمستندات وليس قائمة دخل كاملة أو رصيداً مطابقاً.`,
        `${profile.company} · ${profile.period}: فروش ناخالص ${money(totals(sales, 'grossAmount'), profile.currency, language)} و خرید ناخالص ${money(totals(purchases, 'grossAmount'), profile.currency, language)}.`)
      : text(language, `There are no invoice records for ${profile.company} in the current demo period, so I can't calculate a financial summary.`, `Für ${profile.company} liegen im aktuellen Demozeitraum keine Rechnungen vor; eine Finanzübersicht kann ich nicht berechnen.`, `لا توجد فواتير لشركة ${profile.company} في الفترة التجريبية الحالية، لذلك لا يمكن حساب ملخص مالي.`, `هیچ فاکتوری برای ${profile.company} در دوره جاری ثبت نشده است.`);
  } else {
    answer = text(language,
      `I couldn't find enough context in ${profile.company}'s demo records to answer that reliably. I can use the available invoices, bank statement, payroll, tax letter, missing-document checklist, and tasks. You can ask me to send a question to your accountant.`,
      `In den Demodaten von ${profile.company} finde ich nicht genügend Informationen für eine verlässliche Antwort. Verfügbar sind Rechnungen, Kontoauszug, Gehaltsübersicht, Steuerbrief, Checkliste fehlender Unterlagen und Aufgaben. Ich kann auch eine Frage an Ihre Buchhaltung senden.`,
      `لم أجد معلومات كافية في سجلات ${profile.company} التجريبية للإجابة بدقة. يمكنني استخدام الفواتير وكشف الحساب والرواتب والخطاب الضريبي وقائمة المستندات والمهام. يمكنك طلب إرسال سؤال إلى محاسبك.`,
      `اطلاعات کافی در سوابق آزمایشی ${profile.company} یافت نشد. می‌توانید از من بخواهید سؤالتان را برای حسابدارتان ارسال کنم.`);
    needsAccountant = true;
  }

  // Requirement: Clearly state that answers are from sample data and are not tax advice
  const disclaimer = text(
    language,
    '\n\n⚠️ Note: Answers are based on sample records and do not constitute legal or tax advice.',
    '\n\n⚠️ Hinweis: Antworten basieren auf Beispieldaten und stellen keine steuerliche oder rechtliche Beratung dar.',
    '\n\n⚠️ ملاحظة: الإجابات مستندة إلى بيانات تجريبية ولا تشكل استشارة قانونية أو ضريبية.',
    '\n\n⚠️ توجه: پاسخ‌ها بر مبنای داده‌های فرضی بوده و به منزله مشاوره حقوقی یا مالیاتی نمی‌باشند.'
  );

  answer = `${answer}${disclaimer}`;

  if (needsAccountant && !actions.some((item) => item.type === 'ask_accountant')) {
    actions.push(action('ask_accountant', text(language, 'Send question to accountant', 'Frage an Buchhaltung senden', 'إرسال السؤال للمحاسب', 'ارسال پرسش به حسابدار')));
  }
  return { answer, references: [...new Set(sources)], actions };
}
