import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import tesseractWorkerUrl from 'tesseract.js/src/worker-script/browser/index.js?worker&url';
import tesseractCoreUrl from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import { emptyDemoFields, extractDemoFields, type DemoFields } from '../shared/demoWorkflow';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPage {
  page: number;
  confidence: number;
  text: string;
}

export interface LocalDocumentExtraction {
  fields: DemoFields;
  confidence: number;
  pageCount: number | null;
  text: string;
  pages: ExtractedPage[];
  note: string;
  ocrEngine: string;
  language: string;
}

export class DocumentProcessingError extends Error {
  constructor(message: string, public readonly code: 'password_required' | 'invalid_pdf' | 'too_many_pages' | 'unsupported_image' | 'ocr_failed') {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}

const PAGE_LIMIT = 200;
const OCR_PAGE_LIMIT = 10;
const TEXT_LIMIT = 250_000;

type ProgressCallback = (progress: number, stage?: string) => void;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Document processing was canceled.', 'AbortError');
}

async function createOcrWorker(language: 'deu+eng' | 'deu+eng+ara', onProgress: ProgressCallback) {
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker(language, OEM.LSTM_ONLY, {
    corePath: tesseractCoreUrl,
    workerPath: tesseractWorkerUrl,
    workerBlobURL: false,
    langPath: '/tessdata',
    gzip: false,
    logger: ({ status, progress }) => {
      if (typeof progress === 'number') onProgress(Math.round(progress * 100), status);
    },
  });
}

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  if (/\.heic$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif') {
    throw new DocumentProcessingError('HEIC/HEIF images are not supported in this browser demo. Please convert the photo to JPEG or PNG and upload it again.', 'unsupported_image');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new DocumentProcessingError('This image format cannot be decoded by the browser. Convert TIFF/BMP to JPEG or PNG and try again.', 'unsupported_image');
  }
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new DocumentProcessingError('The browser could not prepare this image for local OCR.', 'ocr_failed');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grayscale = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (grayscale - 128) * 1.25 + 128));
    pixels.data[index] = contrasted;
    pixels.data[index + 1] = contrasted;
    pixels.data[index + 2] = contrasted;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function processLocalDocument(
  file: File,
  onProgress: ProgressCallback,
  password?: string,
  language: 'deu+eng' | 'deu+eng+ara' = 'deu+eng',
  signal?: AbortSignal,
): Promise<LocalDocumentExtraction> {
  throwIfAborted(signal);
  const pageResults: ExtractedPage[] = [];
  let pageCount: number | null = 1;
  let worker: Awaited<ReturnType<typeof createOcrWorker>> | undefined;
  let terminateWorker: (() => void) | undefined;
  const ocrPages: { page: number; image: HTMLCanvasElement }[] = [];

  if (isPdf(file)) {
    const data = new Uint8Array(await file.arrayBuffer());
    throwIfAborted(signal);
    const loadingTask = pdfjs.getDocument({ data, password, isEvalSupported: false, useWorkerFetch: false });
    let pdf: pdfjs.PDFDocumentProxy;
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      await loadingTask.destroy();
      if (signal?.aborted) throw new DOMException('Document processing was canceled.', 'AbortError');
      if (error instanceof Error && error.name === 'PasswordException') {
        throw new DocumentProcessingError('This PDF needs a password or the password was incorrect.', 'password_required');
      }
      throw new DocumentProcessingError('The PDF could not be read. Check that it is a valid, uncorrupted PDF.', 'invalid_pdf');
    }
    pageCount = pdf.numPages;
    if (pdf.numPages > PAGE_LIMIT) {
      await pdf.destroy();
      throw new DocumentProcessingError(`This PDF has ${pdf.numPages} pages; this demo accepts a maximum of ${PAGE_LIMIT}.`, 'too_many_pages');
    }
    if (pdf.numPages < 1) {
      await pdf.destroy();
      throw new DocumentProcessingError('The PDF contains no pages.', 'invalid_pdf');
    }

    try {
      let extractedLength = 0;
      let ocrPageCount = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        throwIfAborted(signal);
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
        if (text.length < 20 && ocrPageCount < OCR_PAGE_LIMIT) {
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new DocumentProcessingError('The browser could not render a scanned PDF page for OCR.', 'ocr_failed');
          await page.render({ canvasContext: context, viewport }).promise;
          ocrPages.push({ page: pageNumber, image: canvas });
          ocrPageCount += 1;
        } else {
          pageResults.push({ page: pageNumber, confidence: text ? 1 : 0, text });
        }
        extractedLength += text.length;
        onProgress(Math.round((pageNumber / pdf.numPages) * 20), 'Reading PDF text');
        if (extractedLength >= TEXT_LIMIT) break;
      }
    } finally {
      await pdf.destroy();
    }
  } else {
    if (!/^image\/(jpeg|png|webp|tiff|bmp)$/i.test(file.type) && !/\.(jpe?g|png|webp|tiff?|bmp)$/i.test(file.name)) {
      throw new DocumentProcessingError('Choose a PDF, JPEG, PNG, WebP, TIFF, or BMP file for local processing.', 'unsupported_image');
    }
    ocrPages.push({ page: 1, image: await preprocessImage(file) });
    throwIfAborted(signal);
  }

  try {
    if (ocrPages.length) {
      throwIfAborted(signal);
      onProgress(20, `Preparing OCR for ${ocrPages.length} page${ocrPages.length === 1 ? '' : 's'}`);
      worker = await createOcrWorker(language, onProgress);
      terminateWorker = () => { void worker?.terminate(); };
      signal?.addEventListener('abort', terminateWorker, { once: true });
      for (let index = 0; index < ocrPages.length; index += 1) {
        throwIfAborted(signal);
        const page = ocrPages[index];
        onProgress(20 + Math.round((index / ocrPages.length) * 70), `Reading page ${page.page}`);
        const result = await worker.recognize(page.image);
        throwIfAborted(signal);
        pageResults.push({
          page: page.page,
          confidence: Math.max(0, Math.min(1, result.data.confidence / 100)),
          text: result.data.text.trim(),
        });
      }
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Document processing was canceled.', 'AbortError');
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError('Local OCR could not finish. Check that the selected language data is installed under /tessdata, then try again.', 'ocr_failed');
  } finally {
    if (terminateWorker) signal?.removeEventListener('abort', terminateWorker);
    await worker?.terminate();
  }

  throwIfAborted(signal);
  pageResults.sort((left, right) => left.page - right.page);
  const text = pageResults.map((page) => page.text).join('\n').slice(0, TEXT_LIMIT).trim();
  const extraction = text ? extractDemoFields(text) : { fields: emptyDemoFields(), confidence: 0 };
  const ocrPageResults = pageResults.filter((page) => ocrPages.some((ocrPage) => ocrPage.page === page.page));
  const meanOcrConfidence = ocrPageResults.length
    ? ocrPageResults.reduce((total, page) => total + page.confidence, 0) / ocrPageResults.length
    : 1;
  const note = !text
    ? 'No readable text was found. Review the original and enter the fields manually.'
    : `Text was read locally with ${ocrPages.length ? 'Tesseract OCR' : 'the PDF text layer'}. Verify every extracted field against the original${pageCount && pageCount > OCR_PAGE_LIMIT && ocrPages.length === OCR_PAGE_LIMIT ? `; OCR is capped at ${OCR_PAGE_LIMIT} scanned pages per PDF` : ''}${language.includes('ara') ? '. Arabic OCR language data was requested and may be inaccurate' : ''}.`;

  onProgress(100, 'Extraction complete');
  return {
    ...extraction,
    confidence: Math.max(0, Math.min(1, extraction.confidence * meanOcrConfidence)),
    pageCount,
    text,
    pages: pageResults,
    note,
    ocrEngine: ocrPages.length ? 'Tesseract.js' : 'PDF text layer',
    language: language.includes('ara') ? 'German, English, Arabic' : 'German, English',
  };
}
