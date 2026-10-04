import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { MATERIAL_KINDS, PHASES, useL } from '../i18n';
import { Field, Modal, SampleTag, go, useLiveDoc, useToast } from '../ui';
import { useStudent } from '../App';
import { duplicateLesson } from './Lessons';
import { checkLesson, type Readiness } from '../lib/readiness';
import { buildDifficultPractice } from '../lib/practice';
import { templateInfo } from '../lib/templates';
import type { Lesson, LessonStep, Phase } from '../types';

const PHASE_ORDER: Phase[] = ['review', 'new', 'guided', 'exercise', 'assessment', 'recap'];

export default function LessonEditor({ id }: { id: string }) {
  const L = useL();
  const toast = useToast();
  const [l, patchL] = useLiveDoc(db.lessons, id);
  const { allSubjects } = useStudent();
  const activities = useLiveQuery(() => (l ? db.activities.where('studentId').equals(l.studentId).toArray() : []), [l?.studentId]) ?? [];
  const materials = useLiveQuery(() => (l ? db.materials.where('studentId').equals(l.studentId).toArray() : []), [l?.studentId]) ?? [];
  const topics = useLiveQuery(() => (l ? db.topics.where('studentId').equals(l.studentId).toArray() : []), [l?.studentId]) ?? [];
  const [adding, setAdding] = useState<Phase | null>(null);
  const [ready, setReady] = useState<Readiness>();
  useEffect(() => {
    if (l) checkLesson(l).then(setReady);
  }, [l?.updatedAt]); // eslint-disable-line
  if (!l) return null;

  const save = (patch: Partial<Lesson>) => patchL(patch);
  const setSteps = (steps: LessonStep[]) => save({ steps });
  const move = (i: number, d: -1 | 1) => {
    const s = [...l.steps];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    setSteps(s);
  };
  const addStep = (step: Omit<LessonStep, 'id'>) => {
    const steps = [...l.steps];
    // Fill an empty placeholder in the same phase first, else insert after the phase's last step.
    const ph = steps.findIndex((s) => s.phase === step.phase && s.kind === 'note' && !s.note && !s.refId);
    const ns = { ...step, id: uid('st_') };
    if (ph >= 0) steps[ph] = { ...ns, minutes: step.minutes ?? steps[ph].minutes };
    else {
      const lastIdx = steps.map((s) => PHASE_ORDER.indexOf(s.phase)).reduce((acc, p, i) => (p <= PHASE_ORDER.indexOf(step.phase) ? i : acc), -1);
      steps.splice(lastIdx + 1, 0, ns);
    }
    setSteps(steps);
  };
  const total = l.steps.reduce((s, x) => s + (x.minutes || 0), 0);
  const subjOf = (sid?: string) => allSubjects.find((s) => s.id === sid);
  const lessonSubjects = new Set(
    l.steps.map((s) => (s.kind === 'activity' ? activities.find((a) => a.id === s.refId)?.subjectId : s.kind === 'material' ? materials.find((m) => m.id === s.refId)?.subjectId : undefined)).filter(Boolean),
  );

  return (
    <div>
      <div className="page-head">
        <h1>
          📅 {l.title || L('Lesson', '課堂')} {l.isSample && <SampleTag />}
        </h1>
        <div className="row gap-s">
          <button className="btn ghost" onClick={() => go('/lessons')}>
            ← {L('Lessons', '課堂')}
          </button>
          <button className="btn" onClick={async () => go(`/lesson/${(await duplicateLesson(l)).id}`)}>
            ⧉ {L('Duplicate', '複製')}
          </button>
          <button className="btn primary big" disabled={!l.steps.length} onClick={() => go(`/teach/${l.id}`)}>
            ▶ {l.status === 'in-progress' ? L('Resume lesson', '繼續課堂') : L('Start Lesson', '開始上課')}
          </button>
        </div>
      </div>

      <div className="grid-lesson">
        <div>
          <div className="card form">
            <div className="grid3">
              <Field label={L('Title', '標題')}>
                <input value={l.title} onChange={(e) => save({ title: e.target.value })} />
              </Field>
              <Field label={L('Date', '日期')}>
                <input type="date" value={l.date} onChange={(e) => save({ date: e.target.value })} />
              </Field>
              <Field label={L('Status', '狀態')}>
                <select value={l.status} onChange={(e) => save({ status: e.target.value as Lesson['status'] })}>
                  <option value="planned">{L('Planned', '已計劃')}</option>
                  <option value="in-progress">{L('In progress', '進行中')}</option>
                  <option value="done">{L('Done', '已完成')}</option>
                </select>
              </Field>
            </div>
            <Field label={L('Learning objectives (one per line)', '學習目標（每行一個）')}>
              <textarea rows={3} value={l.objectives.join('\n')} onChange={(e) => save({ objectives: e.target.value.split('\n') })} />
            </Field>
            {topics.some((t) => t.objectives.length) && (
              <details>
                <summary>{L('Add objectives from topics', '從課題加入學習目標')}</summary>
                <div className="chips">
                  {topics.flatMap((t) =>
                    t.objectives
                      .filter((o) => o.text && !l.objectives.includes(o.text))
                      .map((o) => (
                        <button key={o.id} className="chip" onClick={() => save({ objectives: [...l.objectives.filter(Boolean), o.text], topicIds: [...new Set([...l.topicIds, t.id])] })}>
                          {subjOf(t.subjectId)?.icon} {o.text}
                        </button>
                      )),
                  )}
                </div>
              </details>
            )}
            <Field label={L('Scopes for this lesson', '本課範圍')}>
              <div className="chips">
                {materials
                  .filter((m) => ['dictation', 'test', 'exam', 'vocab', 'worksheet', 'notes'].includes(m.kind))
                  .map((m) => (
                    <label key={m.id} className={`chip ${l.scopeIds.includes(m.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={l.scopeIds.includes(m.id)} onChange={(e) => save({ scopeIds: e.target.checked ? [...l.scopeIds, m.id] : l.scopeIds.filter((x) => x !== m.id) })} />
                      {MATERIAL_KINDS[m.kind][2]} {m.title}
                    </label>
                  ))}
              </div>
            </Field>
          </div>

          <div className="row gap-s mt">
            <h2 className="grow">
              {L('Teaching order', '教學次序')} · {total} {L('min', '分鐘')} {lessonSubjects.size > 1 && <span className="tag">{lessonSubjects.size} {L('subjects', '科目')}</span>}
            </h2>
            <button
              className="btn small"
              onClick={async () => {
                const acts = await buildDifficultPractice(l.studentId);
                if (!acts.length) return toast({ kind: 'info', text: L('No difficult items recorded yet.', '暫時未有難點記錄。') });
                const steps = [...l.steps];
                acts.forEach((a, i) => steps.splice(i, 0, { id: uid('st_'), phase: 'review', kind: 'activity', refId: a.id, title: a.title, minutes: 5 }));
                setSteps(steps);
                toast({ kind: 'ok', text: L('Added a review of difficult items at the start.', '已在開頭加入難點溫習。') });
              }}
            >
              🔁 {L('Add suggested review', '加入建議溫習')}
            </button>
          </div>
          <ol className="steps">
            {l.steps.map((s, i) => {
              const a = s.kind === 'activity' ? activities.find((x) => x.id === s.refId) : undefined;
              const m = s.kind === 'material' ? materials.find((x) => x.id === s.refId) : undefined;
              const subj = subjOf(a?.subjectId || m?.subjectId);
              return (
                <li key={s.id} className={`step phase-${s.phase}`}>
                  <div className="step-phase">
                    <select value={s.phase} onChange={(e) => setSteps(l.steps.map((x) => (x.id === s.id ? { ...x, phase: e.target.value as Phase } : x)))} aria-label={L('Phase', '階段')}>
                      {PHASE_ORDER.map((p) => (
                        <option key={p} value={p}>
                          {PHASES[p][2]} {L(PHASES[p][0], PHASES[p][1])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="step-body grow">
                    <div className="row gap-s">
                      {subj && <span className="subj-dot" style={{ background: subj.color }} title={subj.name}>{subj.icon}</span>}
                      <span>{s.kind === 'activity' ? templateInfo(a?.template ?? 'flashcards').icon : s.kind === 'material' ? MATERIAL_KINDS[m?.kind ?? 'worksheet'][2] : '📝'}</span>
                      <input className="grow strong" value={s.title} onChange={(e) => setSteps(l.steps.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} />
                      {a && a.generated && !a.reviewed && <span className="tag warn">⚠ {L('needs review', '待審核')}</span>}
                      {m && (m.answerKey.fileIds.length > 0 || m.answerKey.answers.length > 0) && <span className="tag ok">🔑</span>}
                    </div>
                    {s.kind === 'note' && <input className="small-input" placeholder={L('Note / what to do (or add an activity to this phase)', '備註／要做甚麼（或加入活動）')} value={s.note || ''} onChange={(e) => setSteps(l.steps.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)))} />}
                    {a && <span className="small muted">{a.items.length} {L('items', '題')} · {L(templateInfo(a.template).en, templateInfo(a.template).zh)}</span>}
                    {s.kind !== 'note' && !a && !m && <span className="warn-text small">{L('Missing — it was deleted.', '已被刪除。')}</span>}
                  </div>
                  <input className="minutes" type="number" min={0} value={s.minutes ?? ''} placeholder="min" onChange={(e) => setSteps(l.steps.map((x) => (x.id === s.id ? { ...x, minutes: e.target.value ? +e.target.value : undefined } : x)))} aria-label={L('Minutes', '分鐘')} />
                  <div className="col">
                    <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="up">
                      ↑
                    </button>
                    <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === l.steps.length - 1} aria-label="down">
                      ↓
                    </button>
                  </div>
                  <div className="col">
                    {a && (
                      <button className="icon-btn" onClick={() => go(`/activity/${a.id}`)} title={L('Edit', '編輯')}>
                        ✏️
                      </button>
                    )}
                    {m && (
                      <button className="icon-btn" onClick={() => go(`/material/${m.id}`)} title={L('Open', '開啟')}>
                        ✏️
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => setSteps(l.steps.filter((x) => x.id !== s.id))} aria-label={L('Remove', '移除')}>
                      🗑
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="row gap-s wrap">
            {PHASE_ORDER.map((p) => (
              <button key={p} className="btn small" onClick={() => setAdding(p)}>
                + {PHASES[p][2]} {L(PHASES[p][0], PHASES[p][1])}
              </button>
            ))}
          </div>
        </div>

        <aside>
          <div className="card">
            <h3>{L('Lesson readiness', '課堂準備狀況')}</h3>
            {ready ? (
              <>
                <div className="row gap-s">
                  <span className={`tag ${ready.ready && !ready.issues.some((i) => i.level === 'error') ? 'ok' : 'todo'}`}>
                    {ready.ready && !ready.issues.some((i) => i.level === 'error') ? '✓ ' + L('Ready to teach', '可以上課') : L('Needs preparation', '需要準備')}
                  </span>
                  <span className={`tag ${ready.offline ? 'ok' : 'warn'}`}>{ready.offline ? '✈️ ' + L('Works offline', '可離線使用') : '🌐 ' + L('Needs internet for some parts', '部分需要網絡')}</span>
                </div>
                <ul className="issues">
                  {ready.issues.map((i, k) => (
                    <li key={k} className={i.level}>
                      {L(i.en, i.zh)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              '…'
            )}
          </div>
          <div className="card form mt">
            <h3>🔒 {L('Private tutor notes', '導師私人備註')}</h3>
            <textarea rows={6} value={l.tutorNotes} onChange={(e) => save({ tutorNotes: e.target.value })} placeholder={L('Not shown in student mode.', '學生模式不會顯示。')} />
            {l.summary && (
              <>
                <h3>{L('Lesson summary', '課堂總結')}</h3>
                <pre className="summary">{l.summary}</pre>
              </>
            )}
          </div>
        </aside>
      </div>

      {adding && <AddStep phase={adding} lesson={l} onAdd={(s) => { addStep(s); setAdding(null); }} onClose={() => setAdding(null)} />}
    </div>
  );
}

function AddStep({ phase, lesson, onAdd, onClose }: { phase: Phase; lesson: Lesson; onAdd: (s: Omit<LessonStep, 'id'>) => void; onClose: () => void }) {
  const L = useL();
  const { subjects } = useStudent();
  const [tab, setTab] = useState<'activity' | 'material' | 'note'>(phase === 'exercise' ? 'material' : 'activity');
  const [subject, setSubject] = useState('');
  const [note, setNote] = useState('');
  const acts = useLiveQuery(() => db.activities.where('studentId').equals(lesson.studentId).reverse().sortBy('updatedAt'), [lesson.studentId]) ?? [];
  const mats = useLiveQuery(() => db.materials.where('studentId').equals(lesson.studentId).reverse().sortBy('updatedAt'), [lesson.studentId]) ?? [];
  const inScope = (sid: string) => !subject || sid === subject;
  const defaultMin: Record<Phase, number> = { review: 5, new: 10, guided: 10, exercise: 15, assessment: 5, recap: 5 };
  return (
    <Modal title={`${PHASES[phase][2]} ${L(PHASES[phase][0], PHASES[phase][1])}`} onClose={onClose} wide>
      <div className="tabs">
        <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
          🎯 {L('Interactive activity', '互動活動')}
        </button>
        <button className={tab === 'material' ? 'on' : ''} onClick={() => setTab('material')}>
          📄 {L('Uploaded exercise / worksheet', '上載的練習／工作紙')}
        </button>
        <button className={tab === 'note' ? 'on' : ''} onClick={() => setTab('note')}>
          📝 {L('Tutor-led step', '導師帶領環節')}
        </button>
      </div>
      {tab !== 'note' && (
        <select value={subject} onChange={(e) => setSubject(e.target.value)} className="mb">
          <option value="">{L('All subjects', '所有科目')}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
      )}
      {tab === 'activity' && (
        <div className="list">
          {acts.filter((a) => inScope(a.subjectId)).map((a) => {
            const blocked = a.generated && !a.reviewed;
            const s = subjects.find((x) => x.id === a.subjectId);
            return (
              <div key={a.id} className="list-row">
                <span>{templateInfo(a.template).icon}</span>
                <span className="grow">
                  <strong>{a.title}</strong>
                  <span className="small muted block">
                    {s?.icon} {s?.name} · {a.items.length} {L('items', '題')}
                  </span>
                </span>
                {blocked ? (
                  <button className="btn small" onClick={() => go(`/activity/${a.id}`)}>
                    ⚠ {L('Review first', '請先審核')}
                  </button>
                ) : (
                  <button className="btn small primary" onClick={() => onAdd({ phase, kind: 'activity', refId: a.id, title: a.title, minutes: defaultMin[phase] })}>
                    + {L('Add', '加入')}
                  </button>
                )}
              </div>
            );
          })}
          {!acts.length && <p className="muted">{L('No activities yet — create them from Materials or Practice.', '尚未有活動，可在「教材」或「練習」建立。')}</p>}
        </div>
      )}
      {tab === 'material' && (
        <div className="list">
          {mats.filter((m) => inScope(m.subjectId) && m.kind !== 'answerKey').map((m) => {
            const s = subjects.find((x) => x.id === m.subjectId);
            return (
              <div key={m.id} className="list-row">
                <span>{MATERIAL_KINDS[m.kind][2]}</span>
                <span className="grow">
                  <strong>{m.title}</strong>
                  <span className="small muted block">
                    {s?.icon} {s?.name} · {m.fileIds.length} {L('files', '檔案')} · {m.answerKey.fileIds.length || m.answerKey.answers.length ? '🔑 ' + L('answer key linked', '已連結答案') : L('no answer key', '未有答案')}
                  </span>
                </span>
                <button className="btn small primary" onClick={() => onAdd({ phase, kind: 'material', refId: m.id, title: m.title, minutes: defaultMin[phase] })}>
                  + {L('Add', '加入')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'note' && (
        <div className="form">
          <Field label={L('What will you do?', '這環節做甚麼？')}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('e.g. Talk about the picture, read aloud together', '例如：討論圖片、一起朗讀')} />
          </Field>
          <button className="btn primary" onClick={() => onAdd({ phase, kind: 'note', title: note || L(PHASES[phase][0], PHASES[phase][1]), note, minutes: defaultMin[phase] })}>
            + {L('Add', '加入')}
          </button>
        </div>
      )}
    </Modal>
  );
}
