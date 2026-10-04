import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useL } from '../i18n';
import { SpeakButton, useSpeak } from '../ui';
import { RENDERERS, type Stage } from './Renderers';
import Scratchpad from './Scratchpad';
import { canAutoMark, diffChars, markItem } from '../lib/marking';
import { hintLevelFor, itemKey, markAttempt, recordAttempt } from '../lib/progress';
import { templateInfo } from '../lib/templates';
import type { Activity, ActivityItem, Student } from '../types';

interface Step {
  item: ActivityItem;
  stage?: Stage;
  group?: ActivityItem[];
  revisit?: boolean;
}

interface StepState {
  answered: boolean;
  tries: number;
  correct: boolean | null;
  hintsShown: number;
  eliminated: Set<string>;
  audioUsed: boolean;
  attemptIds: string[];
  response?: string;
  tutorScore?: number;
  recorded: boolean;
}

const PRAISE: [string, string][] = [
  ['Great job!', '做得好！'],
  ['Well done!', '好叻呀！'],
  ['Excellent!', '非常好！'],
  ['You got it!', '答對了！'],
  ['Super!', '真棒！'],
];
const TRY_AGAIN: [string, string][] = [
  ["Nice try! Let's look again.", '差一點！再試一次。'],
  ['Almost! Try once more.', '就快對了！再試吓。'],
  ["That's OK — mistakes help us learn.", '不要緊，錯了也是學習。'],
];

/** Fill in answers the tutor set implicitly (counting count, number line target). */
export function effectiveItem(a: Activity, it: ActivityItem): ActivityItem {
  if (a.template === 'counting' && !it.answer && it.count != null) return { ...it, answer: String(it.count), answerStatus: 'approved' };
  if (a.template === 'number-line' && !it.answer && it.numberLine) return { ...it, answer: String(it.numberLine.target), answerStatus: 'approved' };
  if (a.template === 'word-in-sentence' && !it.tokens?.length && it.example) return { ...it, tokens: it.example.split('/').map((t) => t.trim()).filter(Boolean), answer: it.answer || it.text };
  return it;
}

export function buildSteps(a: Activity, groupSize: number): Step[] {
  const items = a.items.map((i) => effectiveItem(a, i));
  if (a.template !== 'vocab-journey') return items.map((item) => ({ item }));
  const steps: Step[] = [];
  const size = Math.max(2, groupSize);
  for (let g = 0; g < items.length; g += size) {
    const group = items.slice(g, g + size);
    const pool = items.length >= 3 ? (group.length >= 3 ? group : items.slice(Math.max(0, g - 3), g + size)) : items;
    group.forEach((item) => steps.push({ item, stage: 'learn', group: pool }));
    [...group].reverse().forEach((item) => steps.push({ item, stage: 'choose', group: pool }));
    group.forEach((item) => steps.push({ item, stage: 'recall', group: pool }));
    group.filter((i) => i.example && i.text && i.example.replace(/\//g, '').includes(i.text)).forEach((item) => steps.push({ item, stage: 'use', group: pool }));
  }
  return steps;
}

const STAGE_LABEL: Record<Stage, [string, string, string]> = {
  learn: ['See · Hear · Understand', '看 · 聽 · 明白', '👀'],
  choose: ['Listen and choose', '聽一聽，選一選', '👂'],
  recall: ['Remember it', '記起來', '🧠'],
  use: ['Use it in a sentence', '放進句子', '✍️'],
};

export default function Player({
  activity,
  student,
  lessonId,
  tutor = true,
  onFinish,
  onExit,
}: {
  activity: Activity;
  student: Student;
  lessonId?: string;
  tutor?: boolean;
  onFinish?: () => void;
  onExit?: () => void;
}) {
  const L = useL();
  const say = useSpeak();
  const steps = useMemo(() => buildSteps(activity, student.reading.groupSize), [activity.id, activity.updatedAt]); // eslint-disable-line
  const [queue, setQueue] = useState<Step[]>(steps);
  const [pos, setPos] = useState(0);
  const [states, setStates] = useState<Record<number, StepState>>({});
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'again' | 'pending' | 'shown'; text: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [scratch, setScratch] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(true);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const exposures = useRef(new Set<string>());

  useEffect(() => {
    setQueue(steps);
    setPos(0);
    setStates({});
    setDone(false);
    setFeedback(null);
  }, [steps]);

  useEffect(() => {
    if (!student.timerEnabled || done) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [student.timerEnabled, done]);

  const step = queue[pos];
  const st: StepState = states[pos] ?? { answered: false, tries: 0, correct: null, hintsShown: 0, eliminated: new Set(), audioUsed: false, attemptIds: [], recorded: false };
  const setSt = (patch: Partial<StepState>) => setStates((s) => ({ ...s, [pos]: { ...st, ...s[pos], ...patch } }));

  const progress = useLiveQuery(
    () => (step ? db.progress.get(`${student.id}|${activity.skill === 'subject' ? 'subject' : activity.skill}|${itemKey(activity, step.item)}`) : undefined),
    [step?.item.id, activity.id],
  );
  const hintLevel = activity.mode === 'assessment' ? 0 : hintLevelFor(progress, student.reading.defaultHintLevel);

  const isFlash = activity.template === 'flashcards' || step?.stage === 'learn';
  const autoPlay = !!step && (activity.template === 'flashcards' ? activity.mode === 'pre' : true) && activity.support.audio;

  // Read instructions aloud automatically for students who need it.
  useEffect(() => {
    if (student.reading.autoSpeak && activity.support.audio && pos === 0 && activity.instructions) {
      const t = setTimeout(() => say(activity.instructions, /[㐀-鿿]/.test(activity.instructions) ? 'zh' : 'en'), 200);
      return () => clearTimeout(t);
    }
  }, [activity.id]); // eslint-disable-line

  useEffect(() => {
    setFeedback(null);
    setReveal(false);
  }, [pos]);

  if (!step && !done)
    return (
      <div className="player empty">
        {L('This activity has no items yet.', '此活動尚未有題目。')}
        {onExit && (
          <button className="btn" onClick={onExit}>
            {L('Back', '返回')}
          </button>
        )}
      </div>
    );

  const hints = step ? buildHints(activity, step, L) : [];

  const giveHint = (byTutor: boolean) => {
    const h = hints[st.hintsShown];
    if (!h) return;
    const eliminated = new Set(st.eliminated);
    if (h.eliminate) eliminated.add(h.eliminate);
    setSt({ hintsShown: st.hintsShown + 1, eliminated });
    if (h.speak) say(h.speak, step.item.lang, step.item.audioFileId);
    if (!byTutor && h.text) say(h.text, step.item.lang);
  };

  const record = async (response: string, correct: boolean | null, score: number | null, markedBy: 'auto' | 'tutor' | 'pending', hintsUsed = st.hintsShown, audio = st.audioUsed) => {
    const ids = await recordAttempt({
      studentId: student.id,
      lessonId,
      activity,
      item: step.item,
      response,
      correct,
      score,
      markedBy,
      hintsUsed,
      audioUsed: audio,
    });
    return ids;
  };

  const submit = async (resp: unknown, display: string) => {
    if (st.answered) return;
    const it = step.item;
    const tries = st.tries + 1;
    const tutorMarked = typeof resp === 'object' && resp !== null && ('oral' in resp || 'paper' in resp);
    if (tutorMarked || !canAutoMark(activity.template, it)) {
      const ids = st.recorded ? st.attemptIds : await record(display, null, null, 'pending');
      setSt({ answered: true, tries, attemptIds: ids, response: display, recorded: true });
      setFeedback({ kind: 'pending', text: L('Thank you! Your tutor will check this one.', '謝謝！老師會幫你檢查。') });
      return;
    }
    const r = markItem(activity.template, it, resp);
    let ids = st.attemptIds;
    if (!st.recorded) ids = await record(display, r.correct, r.score, 'auto');
    if (r.correct) {
      setSt({ answered: true, tries, correct: st.recorded ? st.correct : true, attemptIds: ids, response: display, recorded: true });
      const [en, zh] = PRAISE[Math.floor(Math.random() * PRAISE.length)];
      setFeedback({ kind: 'ok', text: `${zh} ${en}` });
      return;
    }
    // Wrong: give a useful hint, allow one more try, and revisit the item later.
    if (!st.recorded && !step.revisit && !isFlash) setQueue((q) => [...q, { ...step, revisit: true }]);
    if (tries >= 2) {
      setSt({ answered: true, tries, correct: false, attemptIds: ids, response: display, recorded: true });
      setFeedback({ kind: 'shown', text: L(`The answer is: ${prettyAnswer(it)}. We'll practise it again soon.`, `答案是：${prettyAnswer(it)}。我們稍後再練習。`) });
      return;
    }
    const [en, zh] = TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)];
    setFeedback({ kind: 'again', text: `${zh} ${en}` });
    const next = hints[st.hintsShown];
    const eliminated = new Set(st.eliminated);
    if (activity.support.hints && hintLevel >= 1 && next) {
      if (next.eliminate) eliminated.add(next.eliminate);
      setSt({ tries, attemptIds: ids, correct: false, recorded: true, hintsShown: st.hintsShown + 1, eliminated, response: display });
    } else setSt({ tries, attemptIds: ids, correct: false, recorded: true, response: display });
  };

  const goNext = async () => {
    if (isFlash && !exposures.current.has(step.item.id + (step.stage || ''))) {
      exposures.current.add(step.item.id + (step.stage || ''));
      if (!st.recorded) {
        await recordAttempt({ studentId: student.id, lessonId, activity, item: step.item, response: '', correct: null, score: null, markedBy: 'tutor', hintsUsed: 0, audioUsed: true, introducedOnly: true });
      }
    }
    if (pos + 1 >= queue.length) {
      setDone(true);
      onFinish?.();
    } else setPos(pos + 1);
  };

  /** Tutor marks the current step: oral answer, paper answer, open response or override of auto-marking. */
  const tutorMark = async (score: number) => {
    const correct = score >= 0.5;
    if (st.recorded && st.attemptIds.length) {
      for (const id of st.attemptIds) await markAttempt(id, correct, score);
      setSt({ answered: true, correct, tutorScore: score });
    } else {
      const ids = await record(isFlash ? L('(read aloud)', '（朗讀）') : L('(oral)', '（口答）'), correct, score, 'tutor');
      setSt({ answered: true, correct, tutorScore: score, attemptIds: ids, recorded: true });
    }
    setFeedback(
      correct
        ? { kind: 'ok', text: score < 1 ? L('Good effort — partly right!', '不錯，部分正確！') : `${PRAISE[0][1]} ${PRAISE[0][0]}` }
        : { kind: 'again', text: L("Not yet — we'll come back to it.", '未掌握，我們稍後再練習。') },
    );
    if (!correct && !step.revisit && !queue.slice(pos + 1).some((s) => s.item.id === step.item.id && s.stage === step.stage)) setQueue((q) => [...q, { ...step, revisit: true }]);
  };

  if (done) {
    const finished = Object.values(states);
    const right = finished.filter((s) => s.correct).length;
    return (
      <div className={`player done ${student.style}`}>
        <div className="celebrate">{student.style === 'playful' ? '🌟🎉🌟' : '✅'}</div>
        <h2>{L('All done! Well done!', '完成了！做得好！')}</h2>
        {student.scoringEnabled && (
          <p className="stars">
            {'⭐'.repeat(Math.min(10, right))} {right}
          </p>
        )}
        <div className="row gap-s center">
          <button className="btn" onClick={() => { setQueue(steps); setPos(0); setStates({}); setDone(false); }}>
            🔁 {L('Do it again', '再做一次')}
          </button>
          {onExit && (
            <button className="btn primary" onClick={onExit}>
              {L('Continue', '繼續')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const Renderer = RENDERERS[activity.template];
  const canStudentHint = activity.support.hints && hints.length > st.hintsShown && !st.answered && (hintLevel >= 2 || (hintLevel >= 1 && st.tries > 0));
  const visibleHints = hints.slice(0, st.hintsShown).filter((h) => h.text);
  const instructionLang = /[㐀-鿿]/.test(activity.instructions) ? 'zh' : 'en';

  return (
    <div className={`player ${student.style} ${student.reading.largeText ? 'large' : ''}`}>
      <div className="player-top">
        <div className="instruction">
          {student.reading.showIcons && <span className="instr-icon">{step.stage ? STAGE_LABEL[step.stage][2] : activity.instructionIcon}</span>}
          <span className={instructionLang === 'zh' ? 'zh' : ''}>{step.stage ? L(STAGE_LABEL[step.stage][0], STAGE_LABEL[step.stage][1]) : activity.instructions}</span>
          {activity.support.audio && <SpeakButton text={step.stage ? STAGE_LABEL[step.stage][1] : activity.instructions} lang={step.stage ? 'zh' : instructionLang} />}
        </div>
        <div className="player-meta">
          {step.revisit && <span className="tag">🔁 {L('Again', '再試')}</span>}
          {student.timerEnabled && <span className="tag">⏱ {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}
          {student.scoringEnabled && <span className="tag">⭐ {Object.values(states).filter((s) => s.correct).length}</span>}
          <span className="dots" aria-label={`${pos + 1} / ${queue.length}`}>
            {pos + 1} / {queue.length}
          </span>
        </div>
      </div>

      {activity.passage && (
        <details className="passage" open>
          <summary>{L('Reading passage', '閱讀篇章')}</summary>
          <div className={/[㐀-鿿]/.test(activity.passage) ? 'zh' : ''}>{activity.passage}</div>
          <SpeakButton text={activity.passage} onUsed={() => setSt({ audioUsed: true })} label={L('Read aloud', '朗讀')} />
        </details>
      )}

      <div className="stage" key={pos}>
        <Renderer
          item={step.item}
          activity={activity}
          stage={step.stage}
          group={step.group}
          answered={st.answered}
          lastCorrect={st.correct}
          submit={submit}
          support={() => setSt({ audioUsed: true })}
          eliminated={st.eliminated}
          autoPlay={autoPlay}
        />
      </div>

      {visibleHints.length > 0 && (
        <div className="hints">
          {visibleHints.map((h, i) => (
            <div key={i} className="hint">
              💡 {h.text}
            </div>
          ))}
        </div>
      )}
      {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
      {st.answered && activity.template === 'dictation' && st.response && step.item.answer && feedback?.kind !== 'pending' && (
        <div className="diff">
          {diffChars(st.response, step.item.answer).map((d, i) => (
            <span key={i} className={d.ok ? 'ok' : 'bad'} title={d.got}>
              {d.ch}
            </span>
          ))}
        </div>
      )}

      <div className="player-nav">
        <button className="btn big" disabled={pos === 0} onClick={() => setPos(pos - 1)} aria-label={L('Previous', '上一題')}>
          ◀
        </button>
        {canStudentHint && (
          <button className="btn big hint-btn" onClick={() => { giveHint(false); }}>
            💡 {L('Hint', '提示')}
          </button>
        )}
        {['math', 'counting', 'number-line', 'short-answer'].includes(activity.template) && (
          <button className="btn big" onClick={() => setScratch(!scratch)}>
            ✏️ {L('Scratchpad', '草稿')}
          </button>
        )}
        <button className={`btn big ${st.answered || isFlash ? 'primary' : ''}`} onClick={goNext} aria-label={L('Next', '下一題')}>
          {pos + 1 >= queue.length ? L('Finish', '完成') : '▶'}
        </button>
      </div>
      {scratch && <Scratchpad onClose={() => setScratch(false)} />}

      {tutor && (
        <div className={`tutor-bar ${tutorOpen ? 'open' : ''}`}>
          <button className="tutor-toggle" onClick={() => setTutorOpen(!tutorOpen)}>
            🧑‍🏫 {L('Tutor', '導師')} {tutorOpen ? '▾' : '▸'}
          </button>
          {tutorOpen && (
            <div className="tutor-tools">
              <button className="btn small" disabled={!hints[st.hintsShown]} onClick={() => giveHint(true)} title={L('Hints given are recorded', '提供的提示會被記錄')}>
                💡 {L('Give hint', '給提示')} ({st.hintsShown}/{hints.length})
              </button>
              <span className="sep" />
              <span className="small muted">{L('Mark', '評分')}:</span>
              <button className="btn small ok" onClick={() => tutorMark(1)}>
                ✓ {isFlash ? L('Read it', '讀對') : L('Correct', '正確')}
              </button>
              <button className="btn small" onClick={() => tutorMark(0.5)}>
                ½ {L('Partly', '部分')}
              </button>
              <button className="btn small bad" onClick={() => tutorMark(0)}>
                ✗ {L('Not yet', '未掌握')}
              </button>
              {st.tutorScore != null && <span className="tag">{L('marked', '已評')} {st.tutorScore}</span>}
              <span className="sep" />
              <button className="btn small warn" onClick={() => setReveal(true)}>
                🔑 {L('Reveal answer key', '顯示答案')}
              </button>
              <span className="small muted">
                {L('Help level', '提示程度')}: {hintLevel} · {st.audioUsed ? '🔊 ' + L('audio used', '用了聲音') : ''} {st.hintsShown ? `💡×${st.hintsShown}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {reveal && (
        <div className="reveal-back">
          <div className="reveal">
            <h3>🔑 {L('Answer key (tutor only)', '答案（只供導師）')}</h3>
            <AnswerStatusBadge item={step.item} template={activity.template} />
            <div className="reveal-answer">{prettyAnswer(step.item) || L('No answer key for this item.', '此題沒有答案。')}</div>
            {!!step.item.alternatives?.length && (
              <div>
                {L('Also accept', '亦接受')}: {step.item.alternatives.join(' / ')}
              </div>
            )}
            {step.item.workedSteps?.length ? (
              <ol className="worked">
                {step.item.workedSteps.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ol>
            ) : null}
            {step.item.explanation && <p>💬 {step.item.explanation}</p>}
            {step.item.markingNotes && <p className="muted">📝 {step.item.markingNotes}</p>}
            {st.response && (
              <p>
                {L('Student answered', '學生答')}: <strong>{st.response}</strong>
              </p>
            )}
            <button className="btn primary big" onClick={() => setReveal(false)}>
              ↩ {L('Back to the student activity', '返回學生活動')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AnswerStatusBadge({ item, template }: { item: ActivityItem; template: Activity['template'] }) {
  const L = useL();
  if (['short-answer', 'oral-task'].includes(template) && item.answerStatus !== 'approved')
    return <span className="tag">{L('Tutor-marked — use your judgement', '由導師判斷評分')}</span>;
  if (item.answerStatus === 'approved') return <span className="tag ok">✓ {L('Tutor-approved answer', '導師已批核答案')}</span>;
  if (item.answerStatus === 'draft') return <span className="tag warn">⚠ {L('Unreviewed draft — not used for marking', '未審核草稿－不用作批改')}</span>;
  return <span className="tag todo">{L('No answer key — mark manually', '沒有答案－請人手評分')}</span>;
}

export function prettyAnswer(it: ActivityItem): string {
  if (it.sortItems?.length) return it.sortItems.map((s) => `${s.text} → ${s.category}`).join('; ');
  if (it.pairs?.length) return it.pairs.map((p) => `${p.left} – ${p.right}`).join('; ');
  if (it.markers?.length) return it.markers.map((m, i) => `${i + 1}. ${m.label}`).join('; ');
  if (it.tokens?.length && !it.answer) return it.tokens.join(' ');
  if (it.answerStatus === 'none') return '';
  return it.answer || '';
}

interface Hint {
  text?: string;
  eliminate?: string;
  speak?: string;
}

function buildHints(a: Activity, step: Step, L: (en: string, zh: string) => string): Hint[] {
  const it = step.item;
  const hints: Hint[] = it.hints.filter(Boolean).map((text) => ({ text }));
  const ans = it.answer || it.text || '';
  const wrong = (it.choices || step.group?.map((g) => g.text || '') || []).filter((c) => c && c !== ans);
  const info = templateInfo(a.template);
  if (['listen-choose', 'picture-match', 'multiple-choice', 'phonics', 'vocab-journey', 'gap-fill'].includes(a.template)) {
    if (wrong.length) hints.push({ eliminate: wrong[0], text: L('One wrong answer is gone.', '已刪去一個錯誤答案。') });
    if (it.meaning && step.stage !== 'learn') hints.push({ text: it.meaning });
    if (it.lang !== 'none' && it.text && info.group === 'language') hints.push({ text: L('Listen to the word again.', '再聽一次讀音。'), speak: it.text });
    if (wrong.length > 1) hints.push({ eliminate: wrong[1], text: L('Another wrong answer is gone.', '再刪去一個錯誤答案。') });
  }
  if (['dictation', 'gap-fill'].includes(a.template) && ans && it.answerStatus === 'approved') {
    hints.push({ text: L(`It starts with "${[...ans][0]}"`, `第一個字是「${[...ans][0]}」`) });
    if ([...ans].length > 2) hints.push({ text: L(`It has ${[...ans].length} letters/characters.`, `共有 ${[...ans].length} 個字母／字。`) });
  }
  if (['math', 'counting', 'number-line'].includes(a.template)) {
    it.workedSteps?.slice(0, -1).forEach((w) => hints.push({ text: w }));
    if (a.template === 'counting') hints.push({ text: L('Tap each one as you count it.', '數一個，點一個。') });
  }
  if (['sentence-order', 'sequencing'].includes(a.template) && it.tokens?.length) hints.push({ text: L(`It starts with "${it.tokens[0]}"`, `第一個是「${it.tokens[0]}」`) });
  if (a.template === 'word-in-sentence' && it.text) hints.push({ text: L(`Look for: ${it.text}`, `找：${it.text}`) });
  return hints;
}
