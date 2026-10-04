import { uid } from '../db';
import type { Activity, ActivityItem, ExtractedItem, Lang, Skill, TemplateId } from '../types';
import { detectLang } from './speech';

export interface TemplateInfo {
  id: TemplateId;
  en: string;
  zh: string;
  icon: string;
  group: 'language' | 'math' | 'science' | 'any';
  descEn: string;
  descZh: string;
  skill: Skill;
  instructionsEn: string;
  instructionsZh: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'vocab-journey', en: 'Vocabulary journey', zh: '詞語學習旅程', icon: '🧭', group: 'language', descEn: 'See → hear → understand → choose → recall → use, in small groups.', descZh: '看 → 聽 → 明白 → 選擇 → 記起 → 運用，分小組學習。', skill: 'recognition', instructionsEn: 'Look, listen and learn the words.', instructionsZh: '看一看，聽一聽，學詞語。' },
  { id: 'flashcards', en: 'Flashcards', zh: '字卡', icon: '🃏', group: 'language', descEn: 'Large cards with picture, sound and meaning.', descZh: '大字卡，附圖片、聲音和意思。', skill: 'recognition', instructionsEn: 'Look and listen.', instructionsZh: '看一看，聽一聽。' },
  { id: 'listen-choose', en: 'Listen and choose', zh: '聽一聽，選一選', icon: '👂', group: 'language', descEn: 'Hear a word, tap the matching written word.', descZh: '聽讀音，選出正確的字詞。', skill: 'recognition', instructionsEn: 'Listen. Tap the word you hear.', instructionsZh: '聽一聽，選出你聽到的詞語。' },
  { id: 'picture-match', en: 'Picture matching', zh: '看圖配對', icon: '🖼️', group: 'language', descEn: 'See a picture, choose the word.', descZh: '看圖，選出正確的詞語。', skill: 'recognition', instructionsEn: 'Look at the picture. Tap the word.', instructionsZh: '看圖，選出正確的詞語。' },
  { id: 'word-in-sentence', en: 'Find the word in a sentence', zh: '句子中找詞語', icon: '🔎', group: 'language', descEn: 'Tap the target word inside a simple sentence. Word boundaries come from your "/" marks.', descZh: '在句子中點出目標詞語。用「/」分隔詞語。', skill: 'recognition', instructionsEn: 'Find and tap the word.', instructionsZh: '找出並點一點這個詞語。' },
  { id: 'phonics', en: 'Letter sounds & blending', zh: '英文拼音', icon: '🔤', group: 'language', descEn: 'Tap each sound, blend, then choose the word.', descZh: '逐個聽字母音，拼讀，再選出單詞。', skill: 'recognition', instructionsEn: 'Say each sound. Blend them. Choose the word.', instructionsZh: '讀出每個音，拼起來，選出單詞。' },
  { id: 'dictation', en: 'Dictation / spelling', zh: '默書／串字', icon: '✍️', group: 'language', descEn: 'Hear it, then type it or write it on paper for tutor marking.', descZh: '聽讀音，打字或在紙上寫，由導師批改。', skill: 'spelling', instructionsEn: 'Listen and write.', instructionsZh: '聽一聽，寫出來。' },
  { id: 'multiple-choice', en: 'Multiple choice', zh: '選擇題', icon: '🔘', group: 'any', descEn: 'Any subject. Question with choices.', descZh: '任何科目的選擇題。', skill: 'subject', instructionsEn: 'Choose the best answer.', instructionsZh: '選出正確答案。' },
  { id: 'gap-fill', en: 'Gap-fill', zh: '填充', icon: '⬜', group: 'any', descEn: 'Sentence with ___ ; type or choose from a word bank.', descZh: '句子留空（___），打字或從詞語庫選擇。', skill: 'comprehension', instructionsEn: 'Fill in the blank.', instructionsZh: '填上適當的詞語。' },
  { id: 'sentence-order', en: 'Sentence ordering', zh: '重組句子', icon: '🧩', group: 'language', descEn: 'Put the word cards in order. Use "/" to set the cards.', descZh: '把詞語卡排成句子。用「/」分隔詞語卡。', skill: 'comprehension', instructionsEn: 'Put the words in order.', instructionsZh: '把詞語排成句子。' },
  { id: 'sorting', en: 'Sorting & classifying', zh: '分類', icon: '🗂️', group: 'science', descEn: 'Drag items into groups (e.g. living / non-living).', descZh: '把東西拖到正確的組別（例如：生物／非生物）。', skill: 'subject', instructionsEn: 'Put each one in the right group.', instructionsZh: '把它們放進正確的組別。' },
  { id: 'sequencing', en: 'Sequencing', zh: '排序', icon: '🔢', group: 'science', descEn: 'Order events, steps or a process.', descZh: '把事件、步驟或過程排列。', skill: 'subject', instructionsEn: 'Put the steps in order.', instructionsZh: '把步驟排好次序。' },
  { id: 'matching', en: 'Matching (cause/effect, pairs)', zh: '配對（因果、詞義）', icon: '🔗', group: 'any', descEn: 'Match each left card with a right card.', descZh: '把左邊和右邊配對。', skill: 'subject', instructionsEn: 'Match the pairs.', instructionsZh: '把它們配對。' },
  { id: 'label-diagram', en: 'Label a diagram / map', zh: '標示圖表／地圖', icon: '📍', group: 'science', descEn: 'Choose the label for each numbered point on a picture.', descZh: '為圖片上每個編號位置選出名稱。', skill: 'subject', instructionsEn: 'Label the picture.', instructionsZh: '為圖片加上名稱。' },
  { id: 'counting', en: 'Counting & grouping', zh: '數一數', icon: '🍎', group: 'math', descEn: 'Count pictures, optionally in groups.', descZh: '數圖案，可分組數。', skill: 'subject', instructionsEn: 'Count. How many?', instructionsZh: '數一數，有多少個？' },
  { id: 'number-line', en: 'Number line', zh: '數線', icon: '📏', group: 'math', descEn: 'Read or place a number on a number line.', descZh: '在數線上讀出或找出數字。', skill: 'subject', instructionsEn: 'Which number is at the arrow?', instructionsZh: '箭咀指着哪個數？' },
  { id: 'math', en: 'Maths question', zh: '數學題', icon: '➗', group: 'math', descEn: 'Operations, missing numbers, word problems, fractions. Exact marking, worked steps, scratchpad.', descZh: '計算、填數、應用題、分數。準確批改，附步驟和草稿區。', skill: 'subject', instructionsEn: 'Work it out.', instructionsZh: '計一計。' },
  { id: 'short-answer', en: 'Short answer / explanation', zh: '短答／解釋', icon: '💬', group: 'any', descEn: 'Open answer marked by the tutor, with partial credit.', descZh: '開放式答案，由導師評分，可給部分分數。', skill: 'subject', instructionsEn: 'Answer the question.', instructionsZh: '回答問題。' },
  { id: 'oral-task', en: 'Oral / practical task', zh: '口頭／實作任務', icon: '🎤', group: 'any', descEn: 'Say, show or do — the tutor marks it. Good for music, art, PE, experiments.', descZh: '說出、展示或動手做，由導師評分。適合音樂、視藝、實驗等。', skill: 'subject', instructionsEn: 'Show me!', instructionsZh: '做給我看！' },
];

export const templateInfo = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)!;

export function newItem(template: TemplateId, partial: Partial<ActivityItem> = {}): ActivityItem {
  const base: ActivityItem = { id: uid('i_'), prompt: '', lang: 'none', hints: [], answerStatus: 'none', ...partial };
  switch (template) {
    case 'sorting':
      return { categories: ['', ''], sortItems: [], ...base };
    case 'matching':
      return { pairs: [{ left: '', right: '' }], ...base };
    case 'label-diagram':
      return { markers: [], ...base };
    case 'number-line':
      return { numberLine: { min: 0, max: 10, step: 1, target: 5 }, ...base };
    case 'counting':
      return { emoji: '🍎', count: 5, ...base };
    case 'multiple-choice':
      return { choices: ['', '', ''], ...base };
    default:
      return base;
  }
}

export function newActivity(studentId: string, subjectId: string, template: TemplateId, extra: Partial<Activity> = {}): Activity {
  const info = templateInfo(template);
  const now = Date.now();
  return {
    id: uid('a_'),
    studentId,
    subjectId,
    title: info.en,
    instructions: info.instructionsZh,
    instructionIcon: info.icon,
    template,
    mode: 'pre',
    assesses: info.skill === 'subject' ? 'subject' : 'reading',
    skill: info.skill,
    support: { audio: true, hints: true, pictures: true },
    items: [],
    reviewed: true,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export { shuffle };

/** Distractors from the same list, so choices are always real content from the approved scope. */
export function distractors(target: string, pool: string[], n = 2, rand = Math.random) {
  const others = shuffle(pool.filter((p) => p !== target), rand);
  // Prefer similar-length options for fairer choices.
  others.sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length));
  return others.slice(0, n);
}

/**
 * Build activity items from approved extracted words. Only uses the tutor-approved text;
 * answers come from that same approved content, so they are marked as approved.
 */
export function itemsFromWords(template: TemplateId, words: ExtractedItem[], choiceCount = 3, rand = Math.random): ActivityItem[] {
  const pool = words.map((w) => w.text);
  return words.map((w) => {
    const lang: Lang = w.lang !== 'none' ? w.lang : detectLang(w.text);
    const common: Partial<ActivityItem> = { text: w.text, lang, meaning: w.answer, key: `${lang}:${w.text}`, sourceItemId: w.id, imageFileId: w.imageFileId };
    switch (template) {
      case 'listen-choose':
      case 'picture-match':
      case 'phonics':
        return newItem(template, {
          ...common,
          prompt: template === 'picture-match' ? '' : w.text,
          choices: shuffle([w.text, ...distractors(w.text, pool, choiceCount - 1, rand)], rand),
          answer: w.text,
          answerStatus: 'approved',
          segments: template === 'phonics' && lang === 'en' ? w.text.split('') : undefined,
        });
      case 'dictation':
        return newItem(template, { ...common, prompt: w.text, answer: w.text, answerStatus: 'approved' });
      case 'flashcards':
      case 'vocab-journey':
        return newItem(template, { ...common, prompt: w.text, answer: w.text, answerStatus: 'approved' });
      default:
        return newItem(template, { ...common, prompt: w.text, answer: w.text, answerStatus: 'approved' });
    }
  });
}

/** Turn approved questions into items. Answers are attached only when the tutor's answer key has them. */
export function itemsFromQuestions(template: TemplateId, questions: ExtractedItem[], keyAnswers: { ref: string; answer: string; alternatives: string[]; explanation?: string; status: 'approved' | 'draft' | 'none' }[]): ActivityItem[] {
  return questions.map((q) => {
    const ref = q.text.match(/^\s*(?:Q\s*)?\(?（?(\d{1,3})/)?.[1];
    const key = ref ? keyAnswers.find((k) => k.ref.replace(/\D/g, '') === ref) : undefined;
    return newItem(template, {
      prompt: q.text,
      lang: q.lang,
      sourceItemId: q.id,
      imageFileId: q.imageFileId,
      answer: key?.answer,
      alternatives: key?.alternatives ?? [],
      explanation: key?.explanation,
      answerStatus: key ? key.status : 'none',
    });
  });
}

export function parseTokens(s: string): string[] {
  return s.split('/').map((t) => t.trim()).filter(Boolean);
}
