import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { MATERIAL_KINDS, SKILLS, STATUSES, useL, useUiLang } from '../i18n';
import { addDays, daysUntil, fmtDate, go, today } from '../ui';
import { useStudent } from '../App';
import { NewLesson } from './Lessons';
import { AddMaterial } from './Materials';
import { effectiveStatus } from '../lib/progress';

export default function Dashboard() {
  const L = useL();
  const { lang } = useUiLang();
  const { students, student, setActive } = useStudent();
  const [newLesson, setNewLesson] = useState(false);
  const [upload, setUpload] = useState(false);
  const t = today();
  const lessons = useLiveQuery(() => db.lessons.toArray(), []) ?? [];
  const materials = useLiveQuery(() => db.materials.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.progress.orderBy('lastSeen').reverse().limit(200).toArray(), []) ?? [];
  const followUps = useLiveQuery(() => (student ? db.followUps.where('studentId').equals(student.id).filter((f) => !f.done).toArray() : []), [student?.id]) ?? [];
  const subjects = useLiveQuery(() => db.subjects.toArray(), []) ?? [];
  const sName = (id: string) => students.find((s) => s.id === id);
  const subj = (id: string) => subjects.find((s) => s.id === id);

  const todays = lessons.filter((l) => l.date === t).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const unfinished = lessons.filter((l) => l.status === 'in-progress' && l.date !== t);
  const assessments = materials
    .filter((m) => m.assessmentDate && m.assessmentDate >= t && m.assessmentDate <= addDays(t, 30))
    .sort((a, b) => a.assessmentDate!.localeCompare(b.assessmentDate!));
  const needPrep = lessons.filter(
    (l) => l.date >= t && l.date <= addDays(t, 7) && l.status === 'planned' && (l.steps.length === 0 || l.steps.some((s) => s.kind === 'note' && !s.note && !s.refId)),
  );
  const toReview = materials.filter((m) => m.status === 'draft');
  const ready = materials.filter((m) => m.status === 'reviewed' && m.kind !== 'answerKey').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const difficulties = progress.filter((p) => effectiveStatus(p) === 'needs-revision').slice(0, 8);

  return (
    <div>
      <div className="page-head">
        <h1>
          👋 {L('Good to see you', '你好')} · {fmtDate(t, lang)}
        </h1>
        <div className="row gap-s">
          <button className="btn" onClick={() => setUpload(true)} disabled={!student}>
            ⬆ {L('Upload material', '上載教材')}
          </button>
          <button className="btn primary" onClick={() => setNewLesson(true)} disabled={!student}>
            + {L('Plan a lesson', '準備課堂')}
          </button>
        </div>
      </div>

      {students.length === 0 && (
        <div className="card center-text">
          <p>{L('Start by adding a student.', '請先新增學生。')}</p>
          <button className="btn primary" onClick={() => go('/students/new')}>
            + {L('Add student', '新增學生')}
          </button>
        </div>
      )}

      <div className="dash-grid">
        <section className="card dash-today">
          <h2>📅 {L("Today's lessons", '今日課堂')}</h2>
          {todays.length === 0 && unfinished.length === 0 && <p className="muted">{L('No lessons today.', '今日沒有課堂。')}</p>}
          {[...todays, ...unfinished].map((l) => {
            const s = sName(l.studentId);
            return (
              <div key={l.id} className="lesson-tile">
                <div className="grow">
                  <div className="small muted">
                    {l.time || ''} {s?.avatar} {s?.name} {l.date !== t && `· ${fmtDate(l.date, lang)} (${L('unfinished', '未完成')})`}
                  </div>
                  <a href={`#/lesson/${l.id}`} className="strong">
                    {l.title}
                  </a>
                  <div className="small muted">
                    {l.steps.length} {L('steps', '步驟')} · {l.steps.reduce((x, y) => x + (y.minutes || 0), 0)} {L('min', '分鐘')}
                  </div>
                </div>
                {l.status === 'done' ? (
                  <span className="tag ok">✓ {L('Done', '完成')}</span>
                ) : (
                  <button className="btn primary big" onClick={() => go(`/teach/${l.id}`)} disabled={!l.steps.length}>
                    ▶ {l.status === 'in-progress' ? L('Resume', '繼續') : L('Start Lesson', '開始上課')}
                  </button>
                )}
              </div>
            );
          })}
        </section>

        <section className="card">
          <h2>📝 {L('Upcoming dictations, tests & exams', '即將來臨的默書、測驗及考試')}</h2>
          {assessments.length === 0 && <p className="muted">{L('Nothing in the next 30 days. Add a scope with a date in Materials.', '未來30天沒有評估。可在「教材」加入有日期的範圍。')}</p>}
          <ul className="plain">
            {assessments.map((m) => {
              const d = daysUntil(m.assessmentDate!);
              const s = sName(m.studentId);
              return (
                <li key={m.id}>
                  <a href={`#/material/${m.id}`} onClick={() => setActive(m.studentId)}>
                    <span className={`tag ${d <= 3 ? 'warn' : ''}`}>{d === 0 ? L('Today', '今日') : d === 1 ? L('Tomorrow', '明天') : L(`in ${d} days`, `${d}日後`)}</span> {MATERIAL_KINDS[m.kind][2]} {m.title}{' '}
                    <span className="muted small">
                      · {s?.avatar} {s?.name} · {subj(m.subjectId)?.icon}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2>🛠 {L('Needs preparation', '需要準備')}</h2>
          {needPrep.length === 0 && toReview.length === 0 && <p className="muted">✓ {L('All caught up.', '全部準備好。')}</p>}
          <ul className="plain">
            {needPrep.map((l) => (
              <li key={l.id}>
                <a href={`#/lesson/${l.id}`}>
                  📅 {fmtDate(l.date, lang)} · {l.title} <span className="muted small">· {sName(l.studentId)?.name} · {l.steps.length ? L('empty steps to fill', '有未填步驟') : L('no steps yet', '未有步驟')}</span>
                </a>
              </li>
            ))}
            {toReview.map((m) => (
              <li key={m.id}>
                <a href={`#/material/${m.id}`} onClick={() => setActive(m.studentId)}>
                  🔍 {L('Review', '檢查')}: {m.title} <span className="muted small">· {sName(m.studentId)?.name}{m.items.some((i) => i.uncertain) ? ` · ⚠ ${m.items.filter((i) => i.uncertain).length}` : ''}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>🔁 {L('Recent difficulties', '最近的難點')}</h2>
          {difficulties.length === 0 && <p className="muted">{L('No difficulties recorded yet.', '暫時沒有難點記錄。')}</p>}
          <ul className="plain">
            {difficulties.map((p) => (
              <li key={p.id}>
                <span className="status-dot" style={{ background: STATUSES[effectiveStatus(p)][2] }} /> <strong>{p.label}</strong>{' '}
                <span className="muted small">
                  · {sName(p.studentId)?.name} · {subj(p.subjectId)?.icon} {L(...SKILLS[p.skill])}
                  {p.errors.length ? ` · ✗ ${p.errors.slice(-2).join(', ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
          {difficulties.length > 0 && (
            <button className="btn small" onClick={() => go('/practice')}>
              🔁 {L('Practise difficult items', '練習難點')}
            </button>
          )}
        </section>

        <section className="card">
          <h2>✅ {L('Materials ready to use', '可使用的教材')}</h2>
          <ul className="plain">
            {ready.map((m) => (
              <li key={m.id}>
                <a href={`#/material/${m.id}`} onClick={() => setActive(m.studentId)}>
                  {MATERIAL_KINDS[m.kind][2]} {m.title} <span className="muted small">· {sName(m.studentId)?.name} · {m.items.filter((i) => i.include && !i.usedInActivity).length} {L('unused items', '未用項目')}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {student && (
          <section className="card">
            <h2>
              📌 {L('Follow-up list', '跟進清單')} · {student.name}
            </h2>
            {followUps.length === 0 && <p className="muted">{L('Empty.', '沒有項目。')}</p>}
            <ul className="plain">
              {followUps.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <label className="check">
                    <input type="checkbox" onChange={() => db.followUps.update(f.id, { done: true })} /> {f.text}
                  </label>
                </li>
              ))}
            </ul>
            <a href="#/progress" className="small">
              {L('Open progress →', '查看進度 →')}
            </a>
          </section>
        )}
      </div>
      {newLesson && <NewLesson onClose={() => setNewLesson(false)} />}
      {upload && <AddMaterial onClose={() => setUpload(false)} />}
    </div>
  );
}
