import type { ActivityItem, TemplateId } from '../types';
import { normaliseDigits, parseNumber } from './math';

/**
 * Automatic marking rules. Only items with a tutor-approved answer are auto-marked.
 * Anything else returns `null` so the tutor marks it — we never invent a definitive answer.
 */

export const TUTOR_MARKED: TemplateId[] = ['short-answer', 'oral-task'];

export function normaliseText(s: string): string {
  return normaliseDigits(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, ' ')
    .replace(/[.,!?;:'"“”‘’。，！？；：、「」『』（）()]/g, '')
    .trim();
}

export function textMatches(response: string, answer: string, alternatives: string[] = []) {
  const r = normaliseText(response);
  if (!r) return false;
  return [answer, ...alternatives].some((a) => normaliseText(a) === r);
}

export function numberMatches(response: string, answer: string, alternatives: string[] = []) {
  const r = parseNumber(response);
  if (!r) return textMatches(response, answer, alternatives);
  return [answer, ...alternatives].some((a) => {
    const f = parseNumber(a);
    return f ? f.eq(r) : normaliseText(a) === normaliseText(response);
  });
}

export interface MarkResult {
  correct: boolean | null;
  score: number | null;
  detail?: string;
}

/** Can this item be auto-marked at all? */
export function canAutoMark(template: TemplateId, item: ActivityItem): boolean {
  if (TUTOR_MARKED.includes(template)) return false;
  if (template === 'flashcards') return false;
  if (item.answerStatus !== 'approved') return false;
  switch (template) {
    case 'sorting':
      return !!item.sortItems?.length;
    case 'matching':
      return !!item.pairs?.length;
    case 'label-diagram':
      return !!item.markers?.length;
    case 'sentence-order':
    case 'sequencing':
      return !!item.tokens?.length;
    default:
      return !!(item.answer ?? '').toString().trim();
  }
}

export function markItem(template: TemplateId, item: ActivityItem, response: unknown): MarkResult {
  if (!canAutoMark(template, item)) return { correct: null, score: null };
  switch (template) {
    case 'sentence-order':
    case 'sequencing': {
      const resp = response as string[];
      const target = item.tokens!;
      const right = resp.filter((t, i) => t === target[i]).length;
      const score = right / target.length;
      return { correct: score === 1, score };
    }
    case 'sorting': {
      const resp = response as Record<string, string>;
      const items = item.sortItems!;
      const right = items.filter((s) => resp[s.text] === s.category).length;
      return { correct: right === items.length, score: right / items.length };
    }
    case 'matching': {
      const resp = response as Record<string, string>;
      const pairs = item.pairs!;
      const right = pairs.filter((p) => resp[p.left] === p.right).length;
      return { correct: right === pairs.length, score: right / pairs.length };
    }
    case 'label-diagram': {
      const resp = response as Record<number, string>;
      const markers = item.markers!;
      const right = markers.filter((m, i) => resp[i] === m.label).length;
      return { correct: right === markers.length, score: right / markers.length };
    }
    case 'counting':
    case 'number-line':
    case 'math': {
      const ok = numberMatches(String(response ?? ''), item.answer!, item.alternatives);
      return { correct: ok, score: ok ? 1 : 0 };
    }
    default: {
      const ok = textMatches(String(response ?? ''), item.answer!, item.alternatives);
      return { correct: ok, score: ok ? 1 : 0 };
    }
  }
}

/** Short dictation: give per-character feedback so the tutor sees which part was wrong. */
export function diffChars(response: string, answer: string) {
  const r = [...response.trim()];
  const a = [...answer.trim()];
  return a.map((ch, i) => ({ ch, ok: r[i] === ch, got: r[i] ?? '' }));
}
