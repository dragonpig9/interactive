import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { PHASES, SKILLS, useL } from '../i18n';
import { BufInput, go, useToast } from '../ui';
import Player from '../components/Player';
import FileViewer from '../components/FileViewer';
import Scratchpad from '../components/Scratchpad';
import { lessonSummary, markAttempt, recordAttempt } from '../lib/progress';
import type { Activity, Attempt, Lesson, Material, Student } from '../types';

export default function Teach({ lessonId }: { lessonId: string }) {
  const L = useL();
  const lesson = useLiveQuery(() => db.lessons.get(lessonId), [lessonId]);
  const student = useLiveQuery(() => (lesson ? db.students.get(lesson.studentId) : undefined), [lesson?.studentId]);
  const [idx, setIdx] = useState<number>();
  const [ending, setEnding] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [scratch, setScratch] = useState(false);

  useEffect(() => {
    if (lesson && idx === undefined) {
      setIdx(Math.min(lesson.currentStep || 0, Math.max(0, lesson.steps.length - 1)));
      if (lesson.status === 'planned') db.lessons.update(lesson.id, { status: 'in-progress', updatedAt: Date.now() });
    }
  }, [lesson, idx]);

  useEffect(() => {
    if (lesson && idx !== undefined && idx !== lesson.currentStep) db.lessons.update(lesson.id, { currentStep: idx, updatedAt: Date.now() });
  }, [idx]); // eslint-disable-line

  if (lesson === undefined || idx === undefined) return <div className="loading">…</div>;
  if (!lesson) return <p>{L('Lesson not found.', '找不到課堂。')}</p>;
  if (!student) return <div className="loading">…</div>;

  const step = lesson.steps[idx];
  const goStep = (i: number) => {
    if (i >= lesson.steps.length) return setEnding(true);
    setIdx(Math.max(0, i));
    db.lessons.update(lesson.id, { steps: lesson.steps.map((s, k) => (k === idx ? { ...s, done: true } : s)), updatedAt: Date.now() });
  };

  if (ending) return <EndLesson lesson={lesson} student={student} onBack={() => setEnding(false)} />;

  return (
    <div className={`teach-shell style-${student.style}`}>
      <div className="teach-top">
        <button className="btn ghost" onClick={() => go(`/lesson/${lesson.id}`)} title={L('Leave — progress is saved and you can resume', '離開，進度已儲存，可稍後繼續')}>
          ✕
        </button>
        <button className="btn ghost" onClick={() => setSidebar(!sidebar)}>
          ☰ {idx + 1}/{lesson.steps.length}
        </button>
        <div className="grow phase-strip">
          {lesson.steps.map((s, i) => (
            <button key={s.id} className={`phase-pip ${i === idx ? 'now' : ''} ${s.done ? 'done' : ''} phase-${s.phase}`} onClick={() => setIdx(i)} title={s.title}>
              {PHASES[s.phase][2]}
            </button>
          ))}
        </div>
        <span className="student-chip">
          {student.avatar} {student.name}
        </span>
        <button className="btn ghost" onClick={() => setScratch(!scratch)} title={L('Scratchpad', '草稿區')}>
          ✏️
        </button>
        <button className="btn ghost" onClick={() => setNotesOpen(!notesOpen)} title={L('Quick lesson notes (tutor)', '課堂速記（導師）')}>
          🗒
        </button>
        <button className="btn" onClick={() => setEnding(true)}>
          🏁 {L('End lesson', '結束課堂')}
        </button>
      </div>

      <div className="teach-main">
        {sidebar && (
          <aside className="teach-side">
            <ol>
              {lesson.steps.map((s, i) => (
                <li key={s.id} className={i === idx ? 'now' : ''}>
                  <button onClick={() => { setIdx(i); setSidebar(false); }}>
                    {s.done ? '✓' : PHASES[s.phase][2]} {s.title} {s.minutes ? <span className="muted">· {s.minutes}′</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
        <section className="teach-stage">
          <div className="step-title">
            <span className={`phase-label phase-${step.phase}`}>
              {PHASES[step.phase][2]} {L(PHASES[step.phase][0], PHASES[step.phase][1])}
            </span>
            <h2>{step.title}</h2>
          </div>
          {step.kind === 'activity' && <ActivityStep key={step.id} refId={step.refId!} student={student} lessonId={lesson.id} onNext={() => goStep(idx + 1)} />}
          {step.kind === 'material' && <MaterialStep key={step.id} refId={step.refId!} student={student} lessonId={lesson.id} />}
          {step.kind === 'note' && (
            <div className="note-step">
              <div className="big-note">{step.note || step.title}</div>
            </div>
          )}
          {scratch && <Scratchpad onClose={() => setScratch(false)} height={360} />}
        </section>
        {notesOpen && (
          <aside className="teach-notes">
            <h3>🗒 {L('Quick notes', '課堂速記')}</h3>
            <BufInput textarea rows={10} value={lesson.liveNotes} onValue={(v) => db.lessons.update(lesson.id, { liveNotes: v })} placeholder={L('Saved automatically. Included in the lesson summary.', '自動儲存，會加入課堂總結。')} />
            {lesson.tutorNotes && (
              <details>
                <summary>🔒 {L('Show my private prep notes', '顯示我的私人備註')}</summary>
                <pre className="summary">{lesson.tutorNotes}</pre>
              </details>
            )}
            <button className="btn small" onClick={() => setNotesOpen(false)}>
              {L('Hide', '隱藏')}
            </button>
          </aside>
        )}
      </div>

      <div className="teach-bottom">
        <button className="btn big" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          ◀ {L('Previous step', '上一步')}
        </button>
        <span className="muted">{lesson.steps[idx + 1] ? L('Next: ', '下一步：') + lesson.steps[idx + 1].title : L('Last step', '最後一步')}</span>
        <button className="btn big primary" onClick={() => goStep(idx + 1)}>
          {idx + 1 >= lesson.steps.length ? '🏁 ' + L('Finish', '完成') : L('Next step', '下一步') + ' ▶'}
        </button>
      </div>
    </div>
  );
}

function ActivityStep({ refId, student, lessonId, onNext }: { refId: string; student: Student; lessonId: string; onNext: () => void }) {
  const L = useL();
  const a = useLiveQuery(() => db.activities.get(refId), [refId]);
  if (a === undefined) return <div className="loading">…</div>;
  if (!a) return <div className="alert error">{L('This activity was deleted. Skip to the next step.', '此活動已被刪除，請跳到下一步。')}</div>;
  return <Player activity={a} student={student} lessonId={lessonId} onExit={onNext} />;
}

/** Synthetic activity so worksheet marks feed into progress like any other answer. */
function materialActivity(m: Material): Activity {
  return {
    id: `mat:${m.id}`,
    studentId: m.studentId,
    subjectId: m.subjectId,
    topicId: m.topicId,
    title: m.title,
    instructions: '',
    instructionIcon: '📄',
    template: 'short-answer',
    mode: 'revision',
    assesses: 'subject',
    skill: m.kind === 'dictation' ? 'spelling' : 'subject',
    support: { audio: false, hints: false, pictures: true },
    items: [],
    reviewed: true,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

function MaterialStep({ refId, student, lessonId }: { refId: string; student: Student; lessonId: string }) {
  const L = useL();
  const toast = useToast();
  const m = useLiveQuery(() => db.materials.get(refId), [refId]);
  const [fileIdx, setFileIdx] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState<Record<string, number>>({});
  if (m === undefined) return <div className="loading">…</div>;
  if (!m) return <div className="alert error">{L('This material was deleted.', '此教材已被刪除。')}</div>;
  const qItems = m.items.filter((i) => i.kind === 'question' && i.include);
  const refOf = (text: string) => text.match(/^\s*(?:Q\s*)?\(?（?(\d{1,3})/)?.[1];
  const questions = (m.answerKey.answers.length ? m.answerKey.answers.map((a) => a.ref) : qItems.map((q, i) => refOf(q.text) || String(i + 1)))
    .filter((r, i, all) => all.indexOf(r) === i)
    .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0) || a.localeCompare(b));
  const mark = async (ref: string, score: number) => {
    const act = materialActivity(m);
    const ans = m.answerKey.answers.find((a) => a.ref === ref);
    const q = qItems.find((i) => refOf(i.text) === ref);
    await recordAttempt({
      studentId: student.id,
      lessonId,
      activity: act,
      item: { id: ref, key: q ? `src:${q.id}` : `mat:${m.id}:${ref}`, prompt: q ? q.text.slice(0, 60) : `${m.title} Q${ref}`, lang: 'none', hints: [], answer: ans?.answer, answerStatus: ans ? ans.status : 'none' },
      response: L('(paper/worksheet)', '（工作紙）'),
      correct: score >= 0.5,
      score,
      markedBy: 'tutor',
      hintsUsed: 0,
      audioUsed: false,
    });
    setMarks({ ...marks, [ref]: score });
  };
  return (
    <div className="material-step">
      <div className="row gap-s">
        {m.fileIds.length > 1 &&
          m.fileIds.map((f, i) => (
            <button key={f} className={`btn small ${i === fileIdx ? 'on' : ''}`} onClick={() => setFileIdx(i)}>
              {L('File', '檔案')} {i + 1}
            </button>
          ))}
        <span className="grow" />
        <button className="btn small" onClick={() => setMarking(!marking)}>
          ✓✗ {L('Mark answers', '評分')}
        </button>
        <button className="btn small warn" onClick={() => setShowKey(true)} disabled={!m.answerKey.fileIds.length && !m.answerKey.answers.length} title={L('Tutor only', '只供導師')}>
          🔑 {L('Reveal answer key', '顯示答案')}
        </button>
      </div>
      {m.fileIds[fileIdx] ? (
        <FileViewer fileId={m.fileIds[fileIdx]} tall />
      ) : (
        <div className="card">
          <ol className="worksheet-items">
            {m.items.filter((i) => i.include && i.kind !== 'answer').map((i) => (
              <li key={i.id} className={i.lang === 'zh' ? 'zh' : ''}>
                {i.text}
              </li>
            ))}
          </ol>
        </div>
      )}
      {marking && (
        <div className="card mark-sheet">
          <h3>{L('Mark the worksheet', '批改工作紙')}</h3>
          {questions.length === 0 && <p className="muted">{L('Add answers or questions to this material to mark question by question.', '為此教材加入答案或題目，便可逐題評分。')}</p>}
          <div className="mark-grid">
            {questions.map((ref) => (
              <div key={ref} className="mark-cell">
                <strong>Q{ref}</strong>
                <button className={`btn small ok ${marks[ref] === 1 ? 'on' : ''}`} onClick={() => mark(ref, 1)}>
                  ✓
                </button>
                <button className={`btn small ${marks[ref] === 0.5 ? 'on' : ''}`} onClick={() => mark(ref, 0.5)}>
                  ½
                </button>
                <button className={`btn small bad ${marks[ref] === 0 ? 'on' : ''}`} onClick={() => mark(ref, 0)}>
                  ✗
                </button>
              </div>
            ))}
          </div>
          <button className="btn small" onClick={() => { setMarking(false); toast({ kind: 'ok', text: L('Marks saved to progress.', '分數已存入進度。') }); }}>
            {L('Done', '完成')}
          </button>
        </div>
      )}
      {showKey && (
        <div className="reveal-back">
          <div className="reveal wide">
            <h3>🔑 {L('Answer key (tutor only)', '答案（只供導師）')}</h3>
            {m.answerKey.answers.length > 0 && (
              <table className="answers">
                <tbody>
                  {m.answerKey.answers.map((a, i) => (
                    <tr key={i} className={a.status === 'draft' ? 'draft-row' : ''}>
                      <td>Q{a.ref}</td>
                      <td>
                        <strong>{a.answer}</strong>
                        {a.alternatives.length > 0 && <span className="muted"> / {a.alternatives.join(' / ')}</span>}
                      </td>
                      <td>{a.explanation}</td>
                      <td>{a.status === 'approved' ? <span className="tag ok">✓</span> : <span className="tag warn">⚠ {L('draft', '草稿')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {m.answerKey.fileIds.map((f) => (
              <FileViewer key={f} fileId={f} annotate={false} />
            ))}
            {m.answerKey.notes && <p className="muted">📝 {m.answerKey.notes}</p>}
            <button className="btn primary big" onClick={() => setShowKey(false)}>
              ↩ {L('Back to the student activity', '返回學生活動')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EndLesson({ lesson, student, onBack }: { lesson: Lesson; student: Student; onBack: () => void }) {
  const L = useL();
  const toast = useToast();
  const [sum, setSum] = useState<Awaited<ReturnType<typeof lessonSummary>>>();
  const pending = useLiveQuery(() => db.attempts.where('lessonId').equals(lesson.id).filter((a) => a.correct === null && a.note !== 'introduced').toArray(), [lesson.id]) ?? [];
  const pendingTick = pending.length;
  useEffect(() => {
    lessonSummary(lesson.id).then(setSum);
  }, [lesson.id, pendingTick]);
  const [followText, setFollowText] = useState<string>();
  const suggested = useMemo(() => (sum ? [...sum.wrong, ...sum.helped].slice(0, 10) : []), [sum]);
  useEffect(() => {
    if (sum && followText === undefined) setFollowText(suggested.join('\n'));
  }, [sum]); // eslint-disable-line

  // Group pending attempts for the same item (one per skill) into one row.
  const groups = new Map<string, Attempt[]>();
  pending.forEach((a) => groups.set(a.activityId + a.itemId + a.timestamp, [...(groups.get(a.activityId + a.itemId + a.timestamp) || []), a]));

  const summaryText = sum
    ? [
        `${lesson.title} — ${lesson.date}`,
        `${L('Answered', '作答')}: ${sum.total} · ${L('correct', '正確')}: ${sum.correct} · ${L('hints used', '提示')}: ${sum.hints}`,
        sum.independent.length ? `✓ ${L('Independently', '獨立完成')}: ${sum.independent.join('、')}` : '',
        sum.helped.length ? `🤝 ${L('With help', '需要協助')}: ${sum.helped.join('、')}` : '',
        sum.wrong.length ? `🔁 ${L('Needs revision', '需要溫習')}: ${sum.wrong.join('、')}` : '',
        sum.introduced.length ? `✨ ${L('Introduced', '新學')}: ${sum.introduced.join('、')}` : '',
        lesson.liveNotes ? `🗒 ${lesson.liveNotes}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <div className="page narrow end-lesson">
      <h1>🏁 {L('End of lesson', '課堂完結')} · {student.avatar} {student.name}</h1>
      {pending.length > 0 && (
        <div className="card">
          <h3>✍️ {L('Responses waiting for your marking', '待評分的答案')} ({groups.size})</h3>
          {[...groups.values()].map((g) => (
            <div key={g[0].id} className="list-row">
              <span className="grow">
                <strong>{g[0].label}</strong>
                <span className="block small">
                  {L('Answer', '答案')}: {g[0].response || '—'} · {g.map((a) => L(...SKILLS[a.skill])).join(', ')}
                </span>
              </span>
              <button className="btn small ok" onClick={() => g.forEach((a) => markAttempt(a.id, true, 1))}>
                ✓
              </button>
              <button className="btn small" onClick={() => g.forEach((a) => markAttempt(a.id, true, 0.5))}>
                ½
              </button>
              <button className="btn small bad" onClick={() => g.forEach((a) => markAttempt(a.id, false, 0))}>
                ✗
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h3>{L('Summary', '總結')}</h3>
        <pre className="summary">{summaryText}</pre>
      </div>
      <div className="card form">
        <h3>📌 {L('Follow-up practice list (editable)', '跟進練習清單（可修改）')}</h3>
        <textarea rows={5} value={followText ?? ''} onChange={(e) => setFollowText(e.target.value)} />
      </div>
      <div className="row gap-s end">
        <button className="btn ghost" onClick={onBack}>
          ← {L('Back to lesson', '返回課堂')}
        </button>
        <button
          className="btn primary big"
          onClick={async () => {
            const items = (followText || '').split('\n').map((s) => s.trim()).filter(Boolean);
            const existing = await db.followUps.where('studentId').equals(student.id).filter((f) => !f.done).toArray();
            await db.followUps.bulkAdd(items.filter((t) => !existing.some((e) => e.text === t)).map((text) => ({ id: uid('fu_'), studentId: student.id, text, done: false, createdAt: Date.now() })));
            await db.lessons.update(lesson.id, { status: 'done', summary: summaryText, steps: lesson.steps.map((s) => ({ ...s, done: true })), updatedAt: Date.now() });
            toast({ kind: 'ok', text: L('Lesson saved. Progress and follow-ups updated.', '課堂已儲存，進度及跟進已更新。') });
            go(`/progress`);
          }}
        >
          💾 {L('Save & close lesson', '儲存並結束課堂')}
        </button>
      </div>
    </div>
  );
}
