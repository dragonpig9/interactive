import type { ExtractedItem, ItemKind, MaterialKind } from '../types';
import { uid } from '../db';
import { detectLang } from './speech';

/**
 * Content extraction from uploaded school materials.
 * Everything extracted is shown to the tutor for review before use. Unreadable content is flagged,
 * never filled in.
 */

export interface PageText {
  page?: number;
  text: string;
  confidence?: number; // OCR confidence 0-100
  noTextLayer?: boolean;
}

export interface ExtractionOutcome {
  pages: PageText[];
  method: string;
  warnings: string[];
}

// The legacy build supports older Safari/Chrome versions that tutors' laptops may still run.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const BASE = import.meta.env.BASE_URL;

export async function openPdf(data: ArrayBuffer | Blob) {
  const pdfjs = await getPdfjs();
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  return pdfjs.getDocument({
    data: new Uint8Array(buf),
    cMapUrl: `${BASE}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
    wasmUrl: `${BASE}pdfjs/wasm/`,
  }).promise;
}

export async function extractPdf(blob: Blob): Promise<ExtractionOutcome> {
  const doc = await openPdf(blob);
  const pages: PageText[] = [];
  const warnings: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines using y positions so questions stay on separate lines.
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      if (!('str' in it)) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    const text = rows
      .map((r) =>
        r.parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.s)
          .join('')
          .replace(/\s{3,}/g, '   ')
          .trim(),
      )
      .filter(Boolean)
      .join('\n');
    if (!text.trim()) {
      pages.push({ page: p, text: '', noTextLayer: true });
      warnings.push(`Page ${p}: no text layer (probably a scan). Type the content, try OCR, or snapshot it as a picture.`);
    } else pages.push({ page: p, text });
  }
  return { pages, method: 'PDF text layer', warnings };
}

export async function extractDocx(blob: Blob): Promise<ExtractionOutcome> {
  const mammoth = await import('mammoth');
  const res = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
  const warnings = res.messages.map((m) => m.message);
  warnings.push('DOCX: text extracted. Pictures, equations and tables may not be preserved; keep the original open alongside.');
  return { pages: [{ text: res.value }], method: 'DOCX text', warnings };
}

export async function extractText(blob: Blob): Promise<ExtractionOutcome> {
  const text = await blob.text();
  return { pages: [{ text }], method: 'Plain text', warnings: [] };
}

/** Optional OCR — needs internet the first time (loads the OCR engine and language data from a CDN). */
export async function ocrImage(blob: Blob, onProgress?: (p: number) => void): Promise<ExtractionOutcome> {
  if (!navigator.onLine) throw new Error('OCR needs an internet connection to download the recognition engine.');
  const url = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';
  const Tesseract = (await import(/* @vite-ignore */ url)).default;
  const worker = await Tesseract.createWorker(['chi_tra', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => m.status === 'recognizing text' && onProgress?.(m.progress),
  });
  const { data } = await worker.recognize(blob);
  await worker.terminate();
  const lines: string[] = [];
  const lowConf: string[] = [];
  for (const line of data.lines || []) {
    const t = line.text.trim();
    if (!t) continue;
    lines.push(line.confidence < 80 ? `⚠ ${t}` : t);
    if (line.confidence < 80) lowConf.push(t);
  }
  return {
    pages: [{ text: lines.join('\n') || data.text, confidence: data.confidence }],
    method: 'OCR (automatic, please check carefully)',
    warnings: [`OCR confidence ${Math.round(data.confidence)}%. Lines marked ⚠ were hard to read.`],
  };
}

export async function extractFile(blob: Blob, name: string): Promise<ExtractionOutcome> {
  const lower = name.toLowerCase();
  const type = blob.type;
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return extractPdf(blob);
  if (lower.endsWith('.docx')) return extractDocx(blob);
  if (type.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.csv')) return extractText(blob);
  if (type.startsWith('image/')) {
    return {
      pages: [{ text: '', noTextLayer: true }],
      method: 'Image',
      warnings: ['Pictures are kept as they are. Type or paste the words, or try OCR (needs internet) and check the result.'],
    };
  }
  if (lower.endsWith('.doc')) throw new UnsupportedError('Old Word .doc files are not supported. Save as .docx or PDF and upload again.');
  throw new UnsupportedError(`This file type (${name}) is not supported. Use PDF, JPG, PNG, TXT or DOCX.`);
}

export class UnsupportedError extends Error {}

// ---------- Text → items ----------

const Q_NUM = /^\s*(?:Q\s*)?(?:\(?\d{1,3}[.)、．]|\(\d{1,3}\)|（\d{1,3}）|[一二三四五六七八九十]+[、.．]|[a-hA-H][.)]\s)/;
const HEADING = /^(?:第.{1,4}[課單元章]|unit\s*\d+|lesson\s*\d+|chapter\s*\d+|part\s+[a-z0-9]+|section\s+[a-z0-9]+|[一二三四五六七八九十]+、.{0,12}$)/i;

export function stripNumber(s: string) {
  return s.replace(Q_NUM, '').trim();
}

export function uncertainReason(s: string): string | undefined {
  if (s.includes('⚠')) return 'Low OCR confidence';
  if (/[�-]/.test(s)) return 'Contains unreadable characters';
  const letters = s.replace(/[\s\d\p{P}\p{S}]/gu, '').length;
  if (s.length >= 4 && letters / s.length < 0.25 && !/[\d+\-×÷=]/.test(s)) return 'Mostly symbols — check against the original';
  if (/(.)\1{5,}/.test(s) && !/[_.\-]{5,}/.test(s)) return 'Repeated characters — may be misread';
  return undefined;
}

/** Split a vocabulary/dictation line while preserving the tutor's word boundaries. */
export function splitVocabLine(line: string): { text: string; meaning?: string }[] {
  const body = stripNumber(line);
  if (!body) return [];
  // "apple - 蘋果" / "apple: 蘋果" / "apple 蘋果" → word with meaning
  const pair = body.match(/^([A-Za-z][A-Za-z' -]*?)\s*(?:[-–:=：]\s*|\s+)([㐀-鿿].*)$/);
  if (pair) return [{ text: pair[1].trim(), meaning: pair[2].trim() }];
  const zhPair = body.match(/^([㐀-鿿]+)\s*[-–:=：]\s*(.+)$/);
  if (zhPair) return [{ text: zhPair[1].trim(), meaning: zhPair[2].trim() }];
  const parts = body
    .split(/\s*[、，,；;\t|]\s*|\s{2,}|\s\/\s/)
    .flatMap((p) => (/^[㐀-鿿\s]+$/.test(p) ? p.split(/\s+/) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((text) => ({ text }));
}

export function textToItems(pages: PageText[], kind: MaterialKind): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const isVocab = kind === 'vocab' || kind === 'dictation';
  const isKey = kind === 'answerKey';
  for (const pg of pages) {
    if (pg.noTextLayer) {
      items.push({
        id: uid('x_'),
        kind: 'diagram',
        text: '',
        page: pg.page,
        uncertain: true,
        uncertainReason: 'No readable text on this page — type it in, or snapshot the page as a picture.',
        lang: 'none',
        include: false,
      });
      continue;
    }
    const lines = pg.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let current: ExtractedItem | null = null;
    for (const raw of lines) {
      const reason = uncertainReason(raw);
      const line = raw.replace(/^⚠\s*/, '');
      const push = (k: ItemKind, text: string, extra: Partial<ExtractedItem> = {}) => {
        const it: ExtractedItem = {
          id: uid('x_'),
          kind: k,
          text,
          page: pg.page,
          uncertain: !!reason,
          uncertainReason: reason,
          lang: detectLang(text),
          include: !reason && k !== 'heading',
          ...extra,
        };
        items.push(it);
        return it;
      };
      if (HEADING.test(line) && line.length < 30) {
        push('heading', line);
        current = null;
        continue;
      }
      if (isVocab) {
        for (const w of splitVocabLine(line)) push('word', w.text, w.meaning ? { answer: w.meaning } : {});
        continue;
      }
      if (isKey) {
        const m = line.match(/^\s*(?:Q\s*)?\(?(\d{1,3}|[a-h])[.)、．:：)]?\)?\s*(.+)$/i);
        if (m) push('answer', m[2].trim(), { answer: m[2].trim(), text: `${m[1]}`, });
        else push('text', line);
        continue;
      }
      if (Q_NUM.test(line)) {
        current = push('question', line);
      } else if (current && current.kind === 'question' && !reason) {
        current.text += '\n' + line;
      } else {
        push('text', line);
        current = null;
      }
    }
  }
  return items;
}

/** Answer-key items arrive as kind 'answer' with the question number in `text`; convert to typed answers. */
export function answersFromKeyItems(items: ExtractedItem[]) {
  return items
    .filter((i) => i.kind === 'answer' && i.include)
    .map((i) => ({ ref: i.text, answer: i.answer || '', alternatives: [], status: 'approved' as const }));
}

// ---------- Page rendering (for viewer and picture snapshots) ----------

export async function renderPdfPage(blob: Blob, pageNo: number, scale = 1.5): Promise<Blob> {
  const doc = await openPdf(blob);
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}
