import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { SKILLS, STATUSES, useL, useUiLang } from '../i18n';
import { BufInput, Empty, fmtDate, go, useToast } from '../ui';
import { NeedStudent, useStudent } from '../App';
import { effectiveStatus } from '../lib/progress';
import { buildDifficultPractice } from '../lib/practice';
import type { ProgressRecord, ProgressStatus, Skill } from '../types';

const ORDER: ProgressStatus[] = ['needs-revision', 'with-help', 'introduced', 'independent', 'secure'];

export default function Progress() {
  const L = useL();
  const { lang } = useUiLang();
  const toast = useToast();
  const { student, allSubjects } = useStudent();
  const [subject, setSubject] = useState('');
  const [skill, setSkill] = useState<Skill | ''>('');
  const [status, setStatus] = useState<ProgressStatus | ''>('');
  const [newFollow, setNewFollow] = useState('');
  const recs = useLiveQuery(() => (student ? db.progress.where('studentId').equals(student.id).toArray() : []), [student?.id]) ?? [];
  const topics = useLiveQuery(() => (student ? db.topics.where('studentId').equals(student.id).toArray() : []), [student?.id]) ?? [];
  const follow = useLiveQuery(() => (student ? db.followUps.where('studentId').equals(student.id).toArray() : []), [student?.id]) ?? [];
  const lessons = useLiveQuery(() => (student ? db.lessons.where('studentId').equals(student.id).filter((l) => l.status === 'done').reverse().sortBy('date') : []), [student?.id]) ?? [];
  if (!student) return <NeedStudent />;

  const filtered = recs.filter((r) => (!subject || r.subjectId === subject) && (!skill || r.skill === skill) && (!status || effectiveStatus(r) === status));
  const bySubject = new Map<string, ProgressRecord[]>();
  filtered.forEach((r) => bySubject.set(r.subjectId, [...(bySubject.get(r.subjectId) || []), r]));
  const topicTitle = (id?: string) => topics.find((t) => t.id === id)?.title;
  const objText = (tid?: string, oid?: string) => topics.find((t) => t.id === tid)?.objectives.find((o) => o.id === oid)?.text;

  return (
    <div>
      <div className="page-head">
        <h1>
          📈 {L('Progress', '進度')} · {student.avatar} {student.name}
        </h1>
        <button
          className="btn primary"
          onClick={async () => {
            const made = await buildDifficultPractice(student.id, subject || undefined);
            if (!made.length) return toast({ kind: 'info', text: L('No difficult items to practise.', '沒有難點需要練習。') });
            go(`/play/${made[0].id}`);
          }}
        >
          🔁 {L('Practise difficult items', '練習難點')}
        </button>
      </div>

      <div className="skill-cards">
        {(Object.keys(SKILLS) as Skill[]).map((sk) => {
          const list = recs.filter((r) => r.skill === sk && (!subject || r.subjectId === subject));
          return (
            <button key={sk} className={`card skill-card ${skill === sk ? 'on' : ''}`} onClick={() => setSkill(skill === sk ? '' : sk)}>
              <strong>{L(...SKILLS[sk])}</strong>
              <div className="stack-bar">
                {ORDER.map((st) => {
                  const n = list.filter((r) => effectiveStatus(r) === st).length;
                  return n ? <span key={st} style={{ flex: n, background: STATUSES[st][2] }} title={`${L(STATUSES[st][0], STATUSES[st][1])}: ${n}`} /> : null;
                })}
                {!list.length && <span className="empty-bar" />}
              </div>
              <span className="small muted">
                {list.length} {L('items', '項')} · {list.filter((r) => ['independent', 'secure'].includes(effectiveStatus(r))).length} {L('secure/independent', '已掌握／獨立')}
              </span>
            </button>
          );
        })}
      </div>

      <div className="legend">
        {ORDER.map((st) => (
          <button key={st} className={`chip ${status === st ? 'on' : ''}`} onClick={() => setStatus(status === st ? '' : st)}>
            <span className="status-dot" style={{ background: STATUSES[st][2] }} /> {L(STATUSES[st][0], STATUSES[st][1])}
          </button>
        ))}
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={L('Subject', '科目')}>
          <option value="">{L('All subjects', '所有科目')}</option>
          {allSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid-lesson">
        <div>
          {filtered.length === 0 && <Empty icon="📈">{L('No progress recorded for this filter yet.', '此篩選暫時沒有進度記錄。')}</Empty>}
          {[...bySubject.entries()].map(([sid, list]) => {
            const s = allSubjects.find((x) => x.id === sid);
            const groups = new Map<string, ProgressRecord[]>();
            list.forEach((r) => {
              const k = `${topicTitle(r.topicId) || L('No topic', '未分課題')}${r.objectiveId ? ' › ' + (objText(r.topicId, r.objectiveId) || '') : ''}`;
              groups.set(k, [...(groups.get(k) || []), r]);
            });
            return (
              <section key={sid} className="card mb">
                <h2 style={{ color: s?.color }}>
                  {s?.icon} {s?.name || L('Worksheets', '工作紙')}
                </h2>
                {[...groups.entries()].map(([g, rows]) => (
                  <div key={g}>
                    <h4 className="muted">{g}</h4>
                    <table className="progress-table">
                      <thead>
                        <tr>
                          <th>{L('Item', '項目')}</th>
                          <th>{L('Area', '範疇')}</th>
                          <th>{L('Status', '狀態')}</th>
                          <th title={L('correct / attempts (with help)', '正確／嘗試（協助）')}>✓/#</th>
                          <th>{L('Common errors', '常見錯誤')}</th>
                          <th>{L('Last', '最近')}</th>
                          <th>{L('Note', '備註')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows
                          .sort((a, b) => ORDER.indexOf(effectiveStatus(a)) - ORDER.indexOf(effectiveStatus(b)))
                          .map((r) => (
                            <tr key={r.id}>
                              <td className="strong">{r.label}</td>
                              <td className="small">{L(...SKILLS[r.skill])}</td>
                              <td>
                                <select
                                  value={r.override ?? ''}
                                  onChange={(e) => db.progress.update(r.id, { override: (e.target.value || undefined) as ProgressStatus | undefined })}
                                  style={{ borderColor: STATUSES[effectiveStatus(r)][2] }}
                                  title={L('Override the recorded result', '修改記錄結果')}
                                >
                                  <option value="">
                                    {L('Auto', '自動')}: {L(STATUSES[r.status][0], STATUSES[r.status][1])}
                                  </option>
                                  {ORDER.map((st) => (
                                    <option key={st} value={st}>
                                      ✎ {L(STATUSES[st][0], STATUSES[st][1])}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="small">
                                {r.correct}/{r.attempts} {r.helped ? `(${r.helped}🤝)` : ''}
                              </td>
                              <td className="small">{r.errors.slice(-3).join(', ')}</td>
                              <td className="small">{new Date(r.lastSeen).toLocaleDateString(lang === 'zh' ? 'zh-HK' : 'en-GB')}</td>
                              <td>
                                <BufInput className="small-input" value={r.notes} onValue={(v) => db.progress.update(r.id, { notes: v })} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
        <aside>
          <div className="card">
            <h3>📌 {L('Follow-up practice list', '跟進練習清單')}</h3>
            <ul className="plain">
              {follow
                .filter((f) => !f.done)
                .map((f) => (
                  <li key={f.id} className="row gap-s">
                    <input type="checkbox" onChange={() => db.followUps.update(f.id, { done: true })} aria-label={L('Done', '完成')} />
                    <BufInput className="grow small-input" value={f.text} onValue={(v) => db.followUps.update(f.id, { text: v })} />
                    <button className="icon-btn" onClick={() => db.followUps.delete(f.id)}>
                      ×
                    </button>
                  </li>
                ))}
            </ul>
            <form
              className="row gap-s"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newFollow.trim()) return;
                await db.followUps.add({ id: uid('fu_'), studentId: student.id, text: newFollow.trim(), done: false, createdAt: Date.now() });
                setNewFollow('');
              }}
            >
              <input className="grow" value={newFollow} onChange={(e) => setNewFollow(e.target.value)} placeholder={L('Add item…', '加入項目…')} />
              <button className="btn small">+</button>
            </form>
            {follow.some((f) => f.done) && (
              <details className="mt">
                <summary className="small">{L('Done', '已完成')} ({follow.filter((f) => f.done).length})</summary>
                <ul className="plain small muted">
                  {follow.filter((f) => f.done).map((f) => (
                    <li key={f.id}>
                      <button className="icon-btn" onClick={() => db.followUps.update(f.id, { done: false })}>↺</button> {f.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="card mt">
            <h3>🧾 {L('Lesson summaries', '課堂總結')}</h3>
            {lessons.length === 0 && <p className="muted small">{L('Finished lessons appear here.', '完成的課堂會在此顯示。')}</p>}
            {lessons.slice(0, 6).map((l) => (
              <details key={l.id}>
                <summary>
                  {fmtDate(l.date, lang)} · {l.title}
                </summary>
                <pre className="summary">{l.summary}</pre>
              </details>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
