import { createContext, useContext } from 'react';
import type { UiLang } from './types';

/** Inline bilingual strings: L('Dashboard', '主頁'). Keeps both languages next to each other. */
export type LFn = (en: string, zh: string) => string;

export const UiLangContext = createContext<{ lang: UiLang; setLang: (l: UiLang) => void }>({
  lang: 'zh',
  setLang: () => {},
});

export function useUiLang() {
  return useContext(UiLangContext);
}

export function useL(): LFn {
  const { lang } = useContext(UiLangContext);
  return (en, zh) => (lang === 'zh' ? zh : en);
}

export const PHASES: Record<string, [string, string, string]> = {
  review: ['Quick review', '快速溫習', '🔁'],
  new: ['Introduce something new', '學習新內容', '✨'],
  guided: ['Guided activity', '引導練習', '🤝'],
  exercise: ['Exercise', '練習', '✏️'],
  assessment: ['Short assessment', '小測', '✅'],
  recap: ['Recap', '總結', '🌈'],
};

export const MODES: Record<string, [string, string]> = {
  pre: ['Pre-learning', '預習'],
  revision: ['Revision', '溫習'],
  assessment: ['Assessment', '評估'],
};

export const SKILLS: Record<string, [string, string]> = {
  recognition: ['Reading recognition', '認讀'],
  comprehension: ['Comprehension', '理解'],
  subject: ['Subject understanding', '學科理解'],
  spelling: ['Spelling / dictation', '默書／串字'],
};

export const STATUSES: Record<string, [string, string, string]> = {
  introduced: ['Introduced', '已介紹', '#8aa4c8'],
  'with-help': ['Practised with help', '在協助下練習', '#e0a43a'],
  independent: ['Answered independently', '能獨立作答', '#3a9d6b'],
  'needs-revision': ['Needs revision', '需要溫習', '#d0574a'],
  secure: ['Secure (tutor-marked)', '已掌握（導師確認）', '#2a7a9b'],
};

export const MATERIAL_KINDS: Record<string, [string, string, string]> = {
  dictation: ['Dictation scope', '默書範圍', '📝'],
  test: ['Test scope', '測驗範圍', '📋'],
  exam: ['Exam scope', '考試範圍', '🎓'],
  worksheet: ['Worksheet / exercise', '工作紙／練習', '📄'],
  notes: ['School notes', '學校筆記', '📒'],
  vocab: ['Vocabulary list', '詞語表', '🔤'],
  answerKey: ['Answer key', '答案', '🔑'],
  picture: ['Pictures / diagrams', '圖片／圖表', '🖼️'],
};
