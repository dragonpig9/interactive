import JSZip from 'jszip';
import { db, TABLES } from '../db';
import type { StoredFile } from '../types';

export const BACKUP_FORMAT = 'tutor-studio-backup';
export const BACKUP_VERSION = 1;

/** Build a .zip backup with all records plus every uploaded file and recording. */
export async function exportBackup(onProgress?: (msg: string) => void): Promise<Blob> {
  const zip = new JSZip();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    if (t === 'files') continue;
    data[t] = await db.table(t).toArray();
  }
  const files = await db.files.toArray();
  data.files = files.map(({ blob: _b, ...meta }) => meta);
  zip.file('data.json', JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }, null, 1));
  let i = 0;
  for (const f of files) {
    zip.file(`files/${f.id}`, f.blob);
    if (++i % 10 === 0) onProgress?.(`Packing files ${i}/${files.length}`);
  }
  onProgress?.('Compressing…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
}

export interface ImportReport {
  records: number;
  files: number;
  missingFiles: string[];
}

export async function importBackup(blob: Blob, mode: 'merge' | 'replace'): Promise<ImportReport> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(blob);
  } catch {
    throw new Error('This is not a Tutor Studio backup (.zip) file.');
  }
  const json = await zip.file('data.json')?.async('string');
  if (!json) throw new Error('The backup is missing data.json.');
  const parsed = JSON.parse(json);
  if (parsed.format !== BACKUP_FORMAT) throw new Error('This zip file was not made by Tutor Studio.');
  const data = parsed.data as Record<string, unknown[]>;
  const fileMetas = (data.files || []) as Omit<StoredFile, 'blob'>[];
  const files: StoredFile[] = [];
  const missingFiles: string[] = [];
  for (const meta of fileMetas) {
    const entry = zip.file(`files/${meta.id}`);
    if (!entry) {
      missingFiles.push(meta.name);
      continue;
    }
    const buf = await entry.async('blob');
    files.push({ ...meta, blob: new Blob([buf], { type: meta.type }) });
  }
  let records = 0;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') for (const t of TABLES) await db.table(t).clear();
    for (const t of TABLES) {
      if (t === 'files') continue;
      const rows = data[t] || [];
      await db.table(t).bulkPut(rows);
      records += rows.length;
    }
    await db.files.bulkPut(files);
  });
  return { records, files: files.length, missingFiles };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function storageInfo() {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  return { usage: est?.usage ?? 0, quota: est?.quota ?? 0, persisted };
}

export async function requestPersist() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
