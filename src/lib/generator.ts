import { uid } from '../db';
import type { Activity, ActivityItem, ExtractedItem, Material, TemplateId } from '../types';
import { Frac, rng } from './math';
import { distractors, itemsFromQuestions, newActivity, newItem, shuffle } from './templates';

/**
 * Optional exercise generation. Everything generated is marked `generated` and must be reviewed
 * by the tutor before it can be added to a lesson. Language items only reuse approved scope content;
 * maths answers are computed exactly.
 */

export type Difficulty = 1 | 2 | 3;

export const MATH_KINDS = {
  'add-sub': ['Addition & subtraction', '加減法'],
  'mul-div': ['Multiplication & division', '乘除法'],
  'missing': ['Missing numbers', '填上缺少的數'],
  'fractions': ['Fractions', '分數'],
  'decimals': ['Decimals', '小數'],
  'negatives': ['Directed (negative) numbers', '有向數'],
  'equations': ['Simple equations', '簡易方程'],
  'money': ['Money (HK$)', '貨幣（港元）'],
  'time': ['Time (hours & minutes)', '時間'],
} as const;
export type MathKind = keyof typeof MATH_KINDS;

const ri = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export function genMathItem(kind: MathKind, d: Difficulty, r: () => number): ActivityItem {
  const lim = [10, 20, 100, 1000][d];
  let prompt = '';
  let ans: Frac;
  const steps: string[] = [];
  switch (kind) {
    case 'add-sub': {
      const a = ri(r, 0, lim);
      const b = ri(r, 0, lim);
      if (r() < 0.5 || a + b <= lim) {
        const [x, y] = a + b > lim * 1.2 ? [Math.floor(a / 2), Math.floor(b / 2)] : [a, b];
        prompt = `${x} + ${y} = ?`;
        ans = Frac.of(x + y);
        steps.push(`${x} + ${y} = ${x + y}`);
      } else {
        const [x, y] = a >= b ? [a, b] : [b, a];
        prompt = `${x} − ${y} = ?`;
        ans = Frac.of(x - y);
        steps.push(`${x} − ${y} = ${x - y}`);
      }
      break;
    }
    case 'mul-div': {
      const a = ri(r, 2, d === 1 ? 5 : d === 2 ? 10 : 12);
      const b = ri(r, 2, d === 3 ? 25 : 10);
      if (r() < 0.5) {
        prompt = `${a} × ${b} = ?`;
        ans = Frac.of(a * b);
      } else {
        prompt = `${a * b} ÷ ${a} = ?`;
        ans = Frac.of(b);
      }
      steps.push(`${a} × ${b} = ${a * b}`);
      break;
    }
    case 'missing': {
      const a = ri(r, 0, lim / 2);
      const b = ri(r, 1, lim / 2);
      prompt = r() < 0.5 ? `${a} + ( ) = ${a + b}` : `( ) − ${b} = ${a}`;
      ans = prompt.startsWith('(') ? Frac.of(a + b) : Frac.of(b);
      steps.push(prompt.startsWith('(') ? `${a} + ${b} = ${a + b}` : `${a + b} − ${a} = ${b}`);
      break;
    }
    case 'fractions': {
      const den = ri(r, 2, d === 1 ? 6 : 12);
      const den2 = d === 1 ? den : ri(r, 2, 10);
      const n1 = ri(r, 1, den - 1 || 1);
      const n2 = ri(r, 1, den2 - 1 || 1);
      const f1 = new Frac(BigInt(n1), BigInt(den));
      const f2 = new Frac(BigInt(n2), BigInt(den2));
      const op = d === 3 && r() < 0.5 ? '×' : r() < 0.6 ? '+' : '−';
      if (op === '−' && f1.sub(f2).n < 0n) {
        prompt = `${n2}/${den2} − ${n1}/${den} = ?`;
        ans = f2.sub(f1);
      } else {
        prompt = `${n1}/${den} ${op} ${n2}/${den2} = ?`;
        ans = op === '+' ? f1.add(f2) : op === '×' ? f1.mul(f2) : f1.sub(f2);
      }
      if (den !== den2 && op !== '×') steps.push(`Use a common denominator: ${BigInt(den) * BigInt(den2) / gcdN(den, den2)}`);
      steps.push(`= ${ans.toString()}${ans.isInt() ? '' : ` (= ${ans.toMixed()})`}`);
      break;
    }
    case 'decimals': {
      const a = ri(r, 1, lim * 10) / 10;
      const b = ri(r, 1, lim * 10) / (d === 3 ? 100 : 10);
      const add = r() < 0.5;
      const fa = Frac.of(a);
      const fb = Frac.of(b);
      prompt = add ? `${a} + ${b} = ?` : `${Math.max(a, b)} − ${Math.min(a, b)} = ?`;
      ans = add ? fa.add(fb) : (fa.sub(fb).n < 0n ? fb.sub(fa) : fa.sub(fb));
      steps.push('Line up the decimal points.');
      break;
    }
    case 'negatives': {
      const a = ri(r, -lim / 2, lim / 2);
      const b = ri(r, -lim / 2, lim / 2);
      const ops = ['+', '−', '×'];
      const op = ops[ri(r, 0, d === 1 ? 1 : 2)];
      const show = (x: number) => (x < 0 ? `(${x})` : `${x}`);
      prompt = `${show(a)} ${op} ${show(b)} = ?`;
      ans = Frac.of(op === '+' ? a + b : op === '−' ? a - b : a * b);
      steps.push(op === '−' ? `Subtracting ${show(b)} is the same as adding ${show(-b)}.` : op === '×' ? 'Same signs → positive; different signs → negative.' : 'Think of moving along a number line.');
      break;
    }
    case 'equations': {
      const x = ri(r, -10, 15);
      const a = d === 1 ? 1 : ri(r, 2, 9);
      const b = ri(r, -20, 20);
      const c = a * x + b;
      prompt = `${a === 1 ? '' : a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}. x = ?`;
      ans = Frac.of(x);
      steps.push(`${a === 1 ? '' : a}x = ${c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${c - b}`);
      if (a !== 1) steps.push(`x = ${c - b} ÷ ${a} = ${x}`);
      break;
    }
    case 'money': {
      const price = ri(r, 1, d === 1 ? 10 : 50) + (d >= 2 ? ri(r, 0, 9) / 10 : 0);
      const paid = Math.ceil(price / 10) * 10 + (d === 3 ? 50 : 0);
      prompt = `Pay $${paid} for a $${price.toFixed(d >= 2 ? 1 : 0)} toy. Change = $?`;
      ans = Frac.of(paid).sub(Frac.of(+price.toFixed(1)));
      steps.push(`$${paid} − $${price.toFixed(1)}`);
      break;
    }
    case 'time': {
      const h = ri(r, 1, 11);
      const m = d === 1 ? 0 : ri(r, 0, 11) * 5;
      const add = d === 1 ? 1 : ri(r, 10, 90);
      const total = h * 60 + m + (d === 1 ? 60 : add);
      const hh = Math.floor(total / 60) % 12 || 12;
      const mm = total % 60;
      prompt = d === 1 ? `${h}:00 + 1 hour = ? (hour)` : `${h}:${String(m).padStart(2, '0')} + ${add} minutes = ?:?? (minutes part only)`;
      ans = Frac.of(d === 1 ? hh : mm);
      steps.push(`${hh}:${String(mm).padStart(2, '0')}`);
      break;
    }
  }
  const answer = ans!.isInt() ? ans!.toString() : ans!.toDecimal() && kind === 'decimals' ? ans!.toDecimal()! : ans!.toString();
  const alts = [ans!.toMixed(), ans!.toDecimal() || ''].filter((x) => x && x !== answer);
  return newItem('math', { prompt, lang: 'none', answer, alternatives: alts, answerStatus: 'draft', workedSteps: steps, explanation: 'Calculated exactly by the app — check before use.' });
}

function gcdN(a: number, b: number): bigint {
  let x = BigInt(a);
  let y = BigInt(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function generateMath(studentId: string, subjectId: string, kind: MathKind, d: Difficulty, count: number, seed = Date.now()): Activity {
  const r = rng(seed);
  const items: ActivityItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; items.length < count && i < count * 10; i++) {
    const it = genMathItem(kind, d, r);
    if (seen.has(it.prompt)) continue;
    seen.add(it.prompt);
    items.push(it);
  }
  return newActivity(studentId, subjectId, 'math', {
    title: `${MATH_KINDS[kind][1]} ${MATH_KINDS[kind][0]} · L${d}`,
    instructions: '計一計。Work it out.',
    items,
    generated: true,
    reviewed: false,
    mode: 'revision',
  });
}

/** Language exercises from an approved scope. Choices are always other words from the same scope. */
export function generateFromScope(m: Material, template: TemplateId, d: Difficulty, count: number, seed = Date.now()): Activity {
  const r = rng(seed);
  const usable = m.items.filter((i) => i.include && !i.uncertain);
  const words = usable.filter((i) => i.kind === 'word');
  const questions = usable.filter((i) => i.kind === 'question');
  const a = newActivity(m.studentId, m.subjectId, template, { title: `${m.title} · ${template}`, topicId: m.topicId, sourceMaterialId: m.id, generated: true, reviewed: false, mode: 'revision' });
  if (words.length && ['listen-choose', 'picture-match', 'dictation', 'flashcards', 'gap-fill', 'sentence-order'].includes(template)) {
    const pick = shuffle(words, r).slice(0, count);
    const pool = words.map((w) => w.text);
    a.items = pick.map((w: ExtractedItem) => {
      const key = `${w.lang}:${w.text}`;
      if (template === 'dictation') return newItem('dictation', { text: w.text, prompt: w.text, lang: w.lang, answer: w.text, answerStatus: 'approved', key });
      return newItem(template, {
        text: w.text,
        prompt: template === 'picture-match' ? '' : w.text,
        lang: w.lang,
        meaning: w.answer,
        imageFileId: w.imageFileId,
        choices: shuffle([w.text, ...distractors(w.text, pool, d + 1, r)], r),
        answer: w.text,
        answerStatus: 'approved',
        key,
      });
    });
  } else {
    a.items = itemsFromQuestions(template, shuffle(questions, r).slice(0, count), m.answerKey.answers);
  }
  a.items.forEach((i) => (i.id = uid('i_')));
  return a;
}

/** Genuine starting points for finding more exercises. Searches open on the real sites (internet needed). */
export const RESOURCE_SITES = [
  { name: 'Education Bureau (EDB) – learning & teaching resources', url: 'https://www.edb.gov.hk', search: 'https://www.google.com/search?q=site%3Aedb.gov.hk+', lang: '中 / EN', level: 'P1–S6 (HK curriculum)', cost: 'Free' },
  { name: 'Hong Kong Education City (HKEdCity)', url: 'https://www.hkedcity.net', search: 'https://www.google.com/search?q=site%3Ahkedcity.net+', lang: '中 / EN', level: 'Primary & secondary', cost: 'Some content needs a free account; some is paid — check each item' },
  { name: 'Khan Academy', url: 'https://www.khanacademy.org', search: 'https://www.google.com/search?q=site%3Akhanacademy.org+', lang: 'EN (some 中文)', level: 'Primary maths → secondary', cost: 'Free; account optional' },
  { name: 'CUHK 粵語審音配詞字庫 (Cantonese pronunciation dictionary)', url: 'https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/', search: 'https://www.google.com/search?q=site%3Ahumanum.arts.cuhk.edu.hk+', lang: '中 (粵)', level: 'Reference for characters', cost: 'Free' },
  { name: 'Oxford Owl (English reading & phonics)', url: 'https://www.oxfordowl.co.uk', search: 'https://www.google.com/search?q=site%3Aoxfordowl.co.uk+', lang: 'EN', level: 'Early years → P6', cost: 'Free account needed for e-books' },
];
