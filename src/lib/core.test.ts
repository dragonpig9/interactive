import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Frac, draftAnswerFor, evaluate, parseNumber } from './math';
import { markItem, numberMatches, textMatches } from './marking';
import { splitVocabLine, textToItems, uncertainReason } from './extract';
import { nextStatus, isIndependent, hintLevelFor } from './progress';
import { genMathItem } from './generator';
import { rng } from './math';
import type { ActivityItem, Attempt, ProgressRecord } from '../types';

describe('exact maths', () => {
  it('parses numbers, fractions, mixed numbers and percentages', () => {
    expect(parseNumber('3/4')!.eq(new Frac(3n, 4n))).toBe(true);
    expect(parseNumber('1 1/2')!.eq(new Frac(3n, 2n))).toBe(true);
    expect(parseNumber('1又1/2')!.eq(new Frac(3n, 2n))).toBe(true);
    expect(parseNumber('0.75')!.eq(new Frac(3n, 4n))).toBe(true);
    expect(parseNumber('７')!.eq(Frac.of(7))).toBe(true);
    expect(parseNumber('50%')!.eq(new Frac(1n, 2n))).toBe(true);
    expect(parseNumber('abc')).toBeNull();
  });
  it('evaluates arithmetic exactly', () => {
    expect(evaluate('0.1 + 0.2')!.eq(new Frac(3n, 10n))).toBe(true);
    expect(evaluate('12 ÷ 3 × 2')!.eq(Frac.of(8))).toBe(true);
    expect(evaluate('(2+3)*4')!.eq(Frac.of(20))).toBe(true);
    expect(evaluate('5 / 0')).toBeNull();
    expect(evaluate('x + 1')).toBeNull();
  });
  it('drafts answers only for plain arithmetic', () => {
    expect(draftAnswerFor('3 + 4 = ( )')).toBe('7');
    expect(draftAnswerFor('2/3 + 1/4 = ?')).toBe('11/12');
    expect(draftAnswerFor('What colour is the sky?')).toBeNull();
  });
  it('generates maths with correct answers', () => {
    const r = rng(42);
    for (let i = 0; i < 50; i++) {
      const it = genMathItem('add-sub', 2, r);
      const expr = it.prompt.replace('= ?', '').replace('−', '-');
      expect(evaluate(expr)!.toString()).toBe(it.answer);
      expect(it.answerStatus).toBe('draft');
    }
  });
});

describe('marking', () => {
  const item = (p: Partial<ActivityItem>): ActivityItem => ({ id: 'i', prompt: '', lang: 'none', hints: [], answerStatus: 'approved', ...p });
  it('accepts equivalent numeric answers', () => {
    expect(numberMatches('0.5', '1/2')).toBe(true);
    expect(numberMatches('2/4', '1/2')).toBe(true);
    expect(numberMatches('3', '1/2')).toBe(false);
  });
  it('normalises text and alternatives', () => {
    expect(textMatches(' Cat. ', 'cat')).toBe(true);
    expect(textMatches('媽媽。', '媽媽')).toBe(true);
    expect(textMatches('x = 5', '5', ['x = 5'])).toBe(true);
  });
  it('never auto-marks without an approved answer', () => {
    expect(markItem('math', item({ answer: '7', answerStatus: 'draft' }), '7').correct).toBeNull();
    expect(markItem('math', item({ answerStatus: 'none' }), '7').correct).toBeNull();
    expect(markItem('short-answer', item({ answer: 'x' }), 'x').correct).toBeNull();
  });
  it('gives partial credit for sorting and ordering', () => {
    const r = markItem('sorting', item({ sortItems: [{ text: 'a', category: 'X' }, { text: 'b', category: 'Y' }] }), { a: 'X', b: 'X' });
    expect(r.score).toBe(0.5);
    expect(markItem('sentence-order', item({ tokens: ['I', 'like', 'cats'] }), ['I', 'like', 'cats']).correct).toBe(true);
  });
});

describe('extraction', () => {
  it('keeps the tutor word boundaries', () => {
    expect(splitVocabLine('爸爸、媽媽、哥哥').map((x) => x.text)).toEqual(['爸爸', '媽媽', '哥哥']);
    expect(splitVocabLine('我的家 好朋友').map((x) => x.text)).toEqual(['我的家', '好朋友']);
    expect(splitVocabLine('apple - 蘋果')).toEqual([{ text: 'apple', meaning: '蘋果' }]);
    expect(splitVocabLine('ice cream, hot dog').map((x) => x.text)).toEqual(['ice cream', 'hot dog']);
  });
  it('splits numbered questions and flags unreadable text', () => {
    const items = textToItems([{ page: 2, text: '1. 3 + 4 = ( )\n2. 6 + 3 = ( )\ncontinued line\n3. ab�cd' }], 'worksheet');
    expect(items.filter((i) => i.kind === 'question')).toHaveLength(3);
    expect(items[1].text).toContain('continued line');
    expect(items[2].uncertain).toBe(true);
    expect(items[2].include).toBe(false);
    expect(items[0].page).toBe(2);
    expect(uncertainReason('正常的句子')).toBeUndefined();
  });
  it('marks scanned pages instead of inventing content', () => {
    const items = textToItems([{ page: 1, text: '', noTextLayer: true }], 'worksheet');
    expect(items[0].text).toBe('');
    expect(items[0].uncertain).toBe(true);
  });
});

describe('progress rules', () => {
  const att = (p: Partial<Attempt>): Attempt => ({ id: 'a', studentId: 's', activityId: 'x', itemId: 'i', itemKey: 'k', label: 'k', subjectId: 'sub', skill: 'recognition', mode: 'revision', response: 'r', correct: true, score: 1, markedBy: 'auto', hintsUsed: 0, audioUsed: false, independent: true, timestamp: 1, ...p });
  it('separates supported from independent answers', () => {
    expect(isIndependent('recognition', 0, true)).toBe(false);
    expect(isIndependent('subject', 0, true)).toBe(true);
    expect(isIndependent('subject', 1, false)).toBe(false);
    expect(nextStatus(undefined, att({ independent: false }), false).status).toBe('with-help');
    expect(nextStatus(undefined, att({}), false).status).toBe('independent');
    expect(nextStatus(undefined, att({ correct: false, response: 'X' }), false)).toMatchObject({ status: 'needs-revision', errors: ['X'] });
  });
  it('fades hints as items become secure', () => {
    const p = (status: ProgressRecord['status'], streak = 0, override?: ProgressRecord['status']) => ({ status, streak, override }) as ProgressRecord;
    expect(hintLevelFor(p('needs-revision'), 1)).toBe(2);
    expect(hintLevelFor(p('independent', 3), 2)).toBe(0);
    expect(hintLevelFor(p('needs-revision', 0, 'secure'), 2)).toBe(0);
  });
});
