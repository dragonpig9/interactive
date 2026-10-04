import { db, saveFile, uid } from '../db';
import type { ExtractedItem, Material, MaterialKind } from '../types';
import { extractFile, textToItems, UnsupportedError, type PageText } from './extract';

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.docx,application/pdf,image/*,text/plain';
export const MAX_FILE = 80 * 1024 * 1024;

export interface FileProblem {
  name: string;
  message: string;
  kept: boolean;
  serious?: boolean; // contents could not be read at all
}

/** Store uploads and run extraction. Failures never lose the original file when it could be stored. */
export async function ingestFiles(files: File[], kind: MaterialKind, onStatus?: (s: string) => void) {
  const fileIds: string[] = [];
  const items: ExtractedItem[] = [];
  const problems: FileProblem[] = [];
  const methods: string[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE) {
      problems.push({ name: f.name, message: 'File is larger than 80 MB. Split it or reduce its size, then try again.', kept: false });
      continue;
    }
    let fileId: string;
    try {
      onStatus?.(`Saving ${f.name}…`);
      fileId = await saveFile(f, f.name);
      fileIds.push(fileId);
    } catch (e) {
      problems.push({ name: f.name, message: (e as Error).message, kept: false });
      continue;
    }
    try {
      onStatus?.(`Reading ${f.name}…`);
      const out = await extractFile(f, f.name);
      methods.push(out.method);
      const its = textToItems(out.pages, kind);
      // Images: keep the picture itself as a usable item.
      if (f.type.startsWith('image/')) {
        its.length = 0;
        its.push({ id: uid('x_'), kind: 'diagram', text: f.name.replace(/\.[^.]+$/, ''), uncertain: false, lang: 'none', include: kind === 'picture', imageFileId: fileId });
      }
      its.forEach((i) => (i.text = i.text || ''));
      items.push(...its.map((i) => ({ ...i, uncertainReason: i.uncertainReason })));
      out.warnings.forEach((w) => problems.push({ name: f.name, message: w, kept: true }));
    } catch (e) {
      const unsupported = e instanceof UnsupportedError;
      problems.push({
        name: f.name,
        serious: true,
        message: unsupported ? (e as Error).message : `Could not read the contents (${(e as Error).message}). The original file is kept — you can view it and type the content yourself.`,
        kept: true,
      });
    }
  }
  return { fileIds, items, problems, methods };
}

export function itemsFromPaste(text: string, kind: MaterialKind): ExtractedItem[] {
  if (!text.trim()) return [];
  const pages: PageText[] = [{ text }];
  return textToItems(pages, kind);
}

export function blankMaterial(studentId: string, subjectId: string, kind: MaterialKind): Material {
  const now = Date.now();
  return {
    id: uid('m_'),
    studentId,
    subjectId,
    kind,
    title: '',
    fileIds: [],
    pastedText: '',
    notes: '',
    extraction: { status: 'none' },
    items: [],
    status: 'draft',
    answerKey: { fileIds: [], answers: [], notes: '' },
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveMaterial(m: Material) {
  await db.materials.put({ ...m, updatedAt: Date.now() });
}
