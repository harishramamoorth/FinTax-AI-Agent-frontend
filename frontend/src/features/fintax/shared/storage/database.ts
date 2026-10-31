import type { DemoDocument } from '../demoWorkflow';
import type { DemoAuditEntry, MonthlyPeriod, StoredDocument } from './models';

const DATABASE_NAME = 'fintax-demo';
const DATABASE_VERSION = 1;
const STORE_NAMES = ['documents', 'files', 'periods', 'audit', 'metadata'] as const;
type StoreName = typeof STORE_NAMES[number];

export interface PersistedDemoSnapshot {
  documents: DemoDocument[];
  periods: MonthlyPeriod[];
  audit: DemoAuditEntry[];
  metadata: Record<string, unknown>;
}

interface DocumentRecord {
  id: string;
  document: Omit<DemoDocument, 'file'>;
  storedDocument: StoredDocument;
}

interface StoredDemoFile {
  documentId: string;
  blob: Blob;
  fileName: string;
  mime: string;
  size: number;
}

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORE_NAMES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: name === 'files' ? 'documentId' : 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
    request.onblocked = () => reject(new Error('Browser storage upgrade is blocked by another open FinTax demo tab.'));
  });
  databasePromise.catch(() => { databasePromise = undefined; });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage transaction was aborted.'));
  });
}

function storedDocumentFromDemo(document: DemoDocument): StoredDocument {
  const confidence = document.confidence;
  const fields = document.fields;
  return {
    id: document.id,
    clientId: document.clientId ?? 'unassigned-demo-client',
    periodId: document.periodId ?? '',
    folder: document.folder ?? '',
    category: document.category,
    fileName: document.name,
    mime: document.mime ?? document.file?.type ?? 'application/octet-stream',
    size: document.file?.size ?? document.sizeBytes,
    pageCount: document.pageCount,
    uploadedAt: document.createdAt,
    status: document.status,
    ocr: {
      engine: document.ocrEngine ?? 'not processed',
      language: document.detectedLanguage ?? 'not detected',
      meanConfidence: confidence,
      text: document.extractedText ?? '',
      pages: document.ocrPages ?? [],
    },
    fields,
    fieldConfidence: {
      documentDate: fields.documentDate ? confidence : undefined,
      counterparty: fields.counterparty ? confidence : undefined,
      reference: fields.reference ? confidence : undefined,
      description: fields.description ? confidence : undefined,
      netAmount: fields.netAmount ? confidence : undefined,
      vatRate: fields.vatRate ? confidence : undefined,
      vatAmount: fields.vatAmount ? confidence : undefined,
      grossAmount: fields.grossAmount ? confidence : undefined,
      debitAccount: fields.debitAccount ? confidence : undefined,
      creditAccount: fields.creditAccount ? confidence : undefined,
    },
    warnings: document.validationWarnings ?? [],
    reviewHistory: document.reviewHistory ?? [],
  };
}

export async function readDemoSnapshot(): Promise<PersistedDemoSnapshot | null> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, 'readonly');
  const done = transactionDone(transaction);
  const [documents, files, periods, audit, metadata] = await Promise.all([
    requestResult(transaction.objectStore('documents').getAll()) as Promise<DocumentRecord[]>,
    requestResult(transaction.objectStore('files').getAll()) as Promise<StoredDemoFile[]>,
    requestResult(transaction.objectStore('periods').getAll()) as Promise<MonthlyPeriod[]>,
    requestResult(transaction.objectStore('audit').getAll()) as Promise<DemoAuditEntry[]>,
    requestResult(transaction.objectStore('metadata').get('snapshot')) as Promise<{ id: string; value: Record<string, unknown> } | undefined>,
  ]);
  await done;
  if (!metadata && documents.length === 0 && periods.length === 0 && audit.length === 0) return null;
  const fileById = new Map(files.map((file) => [file.documentId, file]));
  return {
    documents: documents.map(({ document }) => {
      const file = fileById.get(document.id);
      return file ? { ...document, file: new File([file.blob], file.fileName, { type: file.mime }) } : document;
    }),
    periods,
    audit,
    metadata: metadata?.value ?? {},
  };
}

export async function writeDemoSnapshot(snapshot: PersistedDemoSnapshot): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  const done = transactionDone(transaction);
  const documentsStore = transaction.objectStore('documents');
  const filesStore = transaction.objectStore('files');

  documentsStore.clear();
  filesStore.clear();
  transaction.objectStore('periods').clear();
  transaction.objectStore('audit').clear();

  for (const document of snapshot.documents) {
    const { file, ...record } = document;
    documentsStore.put({ id: document.id, document: record, storedDocument: storedDocumentFromDemo(document) } satisfies DocumentRecord);
    if (file) {
      filesStore.put({
        documentId: document.id,
        blob: file,
        fileName: document.name,
        mime: file.type,
        size: file.size,
      } satisfies StoredDemoFile);
    }
  }
  for (const period of snapshot.periods) transaction.objectStore('periods').put(period);
  for (const entry of snapshot.audit) transaction.objectStore('audit').put(entry);
  transaction.objectStore('metadata').put({ id: 'snapshot', value: snapshot.metadata });
  await done;
}

export async function getStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  if (estimate.usage === undefined || estimate.quota === undefined || estimate.quota <= 0) return null;
  return { usage: estimate.usage, quota: estimate.quota };
}

export function createStorageChangeNotifier(onChange: () => void): () => void {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('fintax-demo-sync');
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'snapshot-updated') onChange();
    };
    return () => channel.close();
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'fintax-demo-sync' && event.newValue) onChange();
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

export function announceStorageChange(): void {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('fintax-demo-sync');
    channel.postMessage({ type: 'snapshot-updated' });
    channel.close();
    return;
  }
  try {
    localStorage.setItem('fintax-demo-sync', String(Date.now()));
  } catch (error) {
    console.error('Could not notify other FinTax demo tabs about a change.', error);
  }
}

export function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}
