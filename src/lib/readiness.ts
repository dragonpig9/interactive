import { db } from '../db';
import type { Lesson } from '../types';
import { audioAvailability } from './speech';

export interface Issue {
  level: 'error' | 'warn' | 'info';
  en: string;
  zh: string;
}

export interface Readiness {
  ready: boolean; // can be taught
  offline: boolean; // everything needed is stored locally
  issues: Issue[];
}

/** Check that a lesson's materials exist locally and whether audio will work without internet. */
export async function checkLesson(l: Lesson): Promise<Readiness> {
  const issues: Issue[] = [];
  let offline = true;
  let ready = l.steps.length > 0;
  if (!l.steps.length) issues.push({ level: 'error', en: 'No steps yet.', zh: '尚未有步驟。' });
  const audioNeeded: { text: string; lang: 'zh' | 'en'; audioFileId?: string }[] = [];
  for (const s of l.steps) {
    if (s.kind === 'activity') {
      const a = s.refId ? await db.activities.get(s.refId) : undefined;
      if (!a) {
        ready = false;
        issues.push({ level: 'error', en: `"${s.title}": activity was deleted.`, zh: `「${s.title}」：活動已被刪除。` });
        continue;
      }
      if (a.generated && !a.reviewed) issues.push({ level: 'error', en: `"${a.title}" has not been reviewed yet.`, zh: `「${a.title}」尚未審核。` });
      if (!a.items.length) issues.push({ level: 'warn', en: `"${a.title}" has no items.`, zh: `「${a.title}」沒有題目。` });
      const drafts = a.items.filter((i) => i.answerStatus === 'draft').length;
      if (drafts) issues.push({ level: 'warn', en: `"${a.title}": ${drafts} unreviewed draft answer(s) — these will need manual marking.`, zh: `「${a.title}」：${drafts} 個未審核草稿答案，需要人手評分。` });
      for (const it of a.items) {
        for (const f of [it.imageFileId, it.audioFileId]) {
          if (f && !(await db.files.get(f))) {
            offline = false;
            issues.push({ level: 'warn', en: `"${a.title}": a picture or recording is missing.`, zh: `「${a.title}」：缺少圖片或錄音。` });
          }
        }
        if (a.support.audio && it.lang !== 'none') {
          const text = it.text || it.prompt;
          if (text && text.length < 60) audioNeeded.push({ text, lang: it.lang as 'zh' | 'en', audioFileId: it.audioFileId });
        }
      }
    } else if (s.kind === 'material') {
      const m = s.refId ? await db.materials.get(s.refId) : undefined;
      if (!m) {
        issues.push({ level: 'error', en: `"${s.title}": material was deleted.`, zh: `「${s.title}」：教材已被刪除。` });
        continue;
      }
      for (const f of [...m.fileIds, ...m.answerKey.fileIds]) {
        if (!(await db.files.get(f))) {
          offline = false;
          issues.push({ level: 'error', en: `"${m.title}": an uploaded file is missing.`, zh: `「${m.title}」：缺少上載檔案。` });
        }
      }
      if (!m.answerKey.fileIds.length && !m.answerKey.answers.length) issues.push({ level: 'info', en: `"${m.title}" has no answer key attached.`, zh: `「${m.title}」未附答案。` });
    }
  }
  // Audio check (sampled to stay quick).
  const counts = { recording: 0, 'local-voice': 0, 'online-voice': 0, none: 0 };
  for (const a of audioNeeded.slice(0, 40)) counts[await audioAvailability(a.text, a.lang, a.audioFileId)]++;
  if (counts.none) issues.push({ level: 'warn', en: `${counts.none} word(s) have no audio: no matching voice on this device and no tutor recording. Record them with 🎙 in the activity editor.`, zh: `${counts.none} 個詞語沒有聲音：此裝置沒有合適語音，亦未錄音。請在活動編輯中用 🎙 錄音。` });
  if (counts['online-voice']) {
    offline = false;
    issues.push({ level: 'info', en: `${counts['online-voice']} item(s) use an online voice — they need internet. Record them for offline use.`, zh: `${counts['online-voice']} 個項目使用網上語音，需要網絡。錄音後可離線使用。` });
  }
  return { ready, offline, issues };
}
