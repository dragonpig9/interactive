import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteStudent, uid } from '../db';
import { useL } from '../i18n';
import { BufInput, Empty, Field, SampleTag, go, useLiveDoc, useToast } from '../ui';
import { useStudent } from '../App';
import type { Grade, Student, Subject, Topic } from '../types';
import { GRADES, DEFAULT_SUBJECTS, addSubjects, defaultSubjectsFor, newStudent } from '../lib/students';


export default function Students({ id }: { id?: string }) {
  if (id === 'new') return <NewStudent />;
  if (id) return <StudentEditor id={id} />;
  return <StudentList />;
}

function StudentList() {
  const L = useL();
  const { students, setActive } = useStudent();
  return (
    <div>
      <div className="page-head">
        <h1>{L('Students', '學生')}</h1>
        <button className="btn primary" onClick={() => go('/students/new')}>
          + {L('Add student', '新增學生')}
        </button>
      </div>
      {students.length === 0 && <Empty icon="👧">{L('No students yet.', '尚未有學生。')}</Empty>}
      <div className="cards">
        {students.map((s) => (
          <div key={s.id} className="card student-card">
            <div className="avatar">{s.avatar}</div>
            <div className="grow">
              <h3>
                {s.name} {s.isSample && <SampleTag />}
              </h3>
              <div className="muted">
                {s.grade} · {s.style === 'playful' ? L('Playful style', '活潑風格') : L('Mature style', '成熟風格')}
              </div>
              {s.learningNeeds && <p className="small">{s.learningNeeds}</p>}
            </div>
            <div className="col gap-s">
              <button className="btn small" onClick={() => go(`/students/${s.id}`)}>
                {L('Edit', '編輯')}
              </button>
              <button
                className="btn small ghost"
                onClick={() => {
                  setActive(s.id);
                  go('/');
                }}
              >
                {L('Work with', '選擇')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewStudent() {
  const L = useL();
  const { setActive } = useStudent();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<Grade>('P1');
  const [subs, setSubs] = useState<string[]>(defaultSubjectsFor('P1'));
  useEffect(() => setSubs(defaultSubjectsFor(grade)), [grade]);
  return (
    <div className="narrow">
      <h1>{L('Add a student', '新增學生')}</h1>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const s = newStudent(name.trim(), grade);
          await db.students.add(s);
          await addSubjects(s.id, subs);
          setActive(s.id);
          go(`/students/${s.id}`);
        }}
      >
        <Field label={L('Name', '姓名')}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required name="name" />
        </Field>
        <Field label={L('Grade', '年級')}>
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)} name="grade">
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend>{L('Subjects (you can change these any time)', '科目（之後可隨時更改）')}</legend>
          <div className="chips">
            {DEFAULT_SUBJECTS.map(([n, icon]) => (
              <label key={n} className={`chip ${subs.includes(n) ? 'on' : ''}`}>
                <input type="checkbox" checked={subs.includes(n)} onChange={(e) => setSubs(e.target.checked ? [...subs, n] : subs.filter((x) => x !== n))} />
                {icon} {n}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row end">
          <button type="button" className="btn ghost" onClick={() => history.back()}>
            {L('Cancel', '取消')}
          </button>
          <button className="btn primary" type="submit">
            {L('Create student', '建立學生')}
          </button>
        </div>
      </form>
    </div>
  );
}

const AVATARS = ['🐣', '🐼', '🦊', '🐯', '🐨', '🐸', '🦄', '🚀', '⚽', '🦉', '📘', '🌟', '🎧', '🧠'];

function StudentEditor({ id }: { id: string }) {
  const L = useL();
  const toast = useToast();
  const [s, patchS] = useLiveDoc(db.students, id);
  const [tab, setTab] = useState<'profile' | 'subjects'>('profile');
  if (!s) return null;
  const save = (patch: Partial<Student>) => patchS(patch);
  return (
    <div>
      <div className="page-head">
        <h1>
          {s.avatar} {s.name} {s.isSample && <SampleTag />}
        </h1>
        <button className="btn ghost" onClick={() => go('/students')}>
          ← {L('All students', '所有學生')}
        </button>
      </div>
      <div className="tabs">
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>
          {L('Profile & reading support', '資料及閱讀支援')}
        </button>
        <button className={tab === 'subjects' ? 'on' : ''} onClick={() => setTab('subjects')}>
          {L('Subjects, topics & objectives', '科目、課題及學習目標')}
        </button>
      </div>
      {tab === 'profile' ? (
        <div className="grid2">
          <div className="card form">
            <Field label={L('Name', '姓名')}>
              <input value={s.name} onChange={(e) => save({ name: e.target.value })} />
            </Field>
            <div className="row gap">
              <Field label={L('Grade', '年級')}>
                <select value={s.grade} onChange={(e) => save({ grade: e.target.value as Grade })}>
                  {GRADES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label={L('School (optional)', '學校（可選）')}>
                <input value={s.school || ''} onChange={(e) => save({ school: e.target.value })} />
              </Field>
            </div>
            <Field label={L('Avatar', '頭像')}>
              <div className="chips">
                {AVATARS.map((a) => (
                  <button key={a} type="button" className={`chip ${s.avatar === a ? 'on' : ''}`} onClick={() => save({ avatar: a })}>
                    {a}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={L('Student screen style', '學生畫面風格')}>
              <select value={s.style} onChange={(e) => save({ style: e.target.value as Student['style'] })}>
                <option value="playful">{L('Playful (younger pupils)', '活潑（低年級）')}</option>
                <option value="mature">{L('Mature (P5 / secondary)', '成熟（高小／中學）')}</option>
              </select>
            </Field>
            <Field label={L('Learning needs & notes', '學習需要及備註')}>
              <textarea rows={4} value={s.learningNeeds} onChange={(e) => save({ learningNeeds: e.target.value })} />
            </Field>
          </div>
          <div className="card form">
            <h3>{L('Reading support', '閱讀支援')}</h3>
            <label className="check">
              <input type="checkbox" checked={s.reading.largeText} onChange={(e) => save({ reading: { ...s.reading, largeText: e.target.checked } })} />
              {L('Extra-large text', '特大字體')}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.reading.autoSpeak} onChange={(e) => save({ reading: { ...s.reading, autoSpeak: e.target.checked } })} />
              {L('Read instructions aloud automatically', '自動讀出指示')}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.reading.showIcons} onChange={(e) => save({ reading: { ...s.reading, showIcons: e.target.checked } })} />
              {L('Show picture icons with instructions', '指示附圖示')}
            </label>
            <Field label={L('Starting hint level', '提示程度')} hint={L('Hints fade automatically as items become secure.', '學生掌握後，提示會自動減少。')}>
              <select value={s.reading.defaultHintLevel} onChange={(e) => save({ reading: { ...s.reading, defaultHintLevel: +e.target.value } })}>
                <option value={0}>{L('0 – only when I give one', '0 – 只在導師提供時')}</option>
                <option value={1}>{L('1 – after a mistake', '1 – 答錯後')}</option>
                <option value={2}>{L('2 – offer hints straight away', '2 – 立即提供')}</option>
              </select>
            </Field>
            <Field label={L('Vocabulary group size', '每組詞語數量')}>
              <input type="number" min={2} max={12} value={s.reading.groupSize} onChange={(e) => save({ reading: { ...s.reading, groupSize: Math.max(2, +e.target.value || 4) } })} />
            </Field>
            <h3>{L('Motivation', '鼓勵設定')}</h3>
            <label className="check">
              <input type="checkbox" checked={s.timerEnabled} onChange={(e) => save({ timerEnabled: e.target.checked })} />
              {L('Show a timer in activities', '活動中顯示計時器')}
            </label>
            <label className="check">
              <input type="checkbox" checked={s.scoringEnabled} onChange={(e) => save({ scoringEnabled: e.target.checked })} />
              {L('Show stars / score', '顯示星星／分數')}
            </label>
            <hr />
            <button
              className="btn danger small"
              onClick={async () => {
                if (!confirm(L(`Delete ${s.name} and ALL their materials, lessons and progress? This cannot be undone. Export a backup first if unsure.`, `刪除 ${s.name} 及其所有教材、課堂和進度？此操作無法復原。如不確定，請先匯出備份。`))) return;
                await deleteStudent(s.id);
                toast({ kind: 'ok', text: L('Student deleted.', '已刪除學生。') });
                go('/students');
              }}
            >
              {L('Delete student', '刪除學生')}
            </button>
          </div>
        </div>
      ) : (
        <SubjectManager studentId={id} />
      )}
    </div>
  );
}

function SubjectManager({ studentId }: { studentId: string }) {
  const L = useL();
  const subjects = useLiveQuery(() => db.subjects.where('studentId').equals(studentId).sortBy('order'), [studentId]) ?? [];
  const topics = useLiveQuery(() => db.topics.where('studentId').equals(studentId).toArray(), [studentId]) ?? [];
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState<string>();
  const move = async (s: Subject, dir: -1 | 1) => {
    const idx = subjects.findIndex((x) => x.id === s.id);
    const other = subjects[idx + dir];
    if (!other) return;
    await db.subjects.update(s.id, { order: other.order });
    await db.subjects.update(other.id, { order: s.order });
  };
  return (
    <div className="card">
      <p className="muted">
        {L('Match the school timetable: add, rename, reorder or hide subjects. Hidden subjects keep their materials and progress.', '按學校時間表調整：新增、改名、排序或隱藏科目。隱藏的科目會保留教材及進度。')}
      </p>
      <ul className="subject-list">
        {subjects.map((s, i) => (
          <li key={s.id} className={s.hidden ? 'hidden-subject' : ''}>
            <div className="row gap-s">
              <BufInput className="icon-input" value={s.icon} onValue={(v) => db.subjects.update(s.id, { icon: v })} aria-label="icon" />
              <BufInput className="grow" value={s.name} onValue={(v) => db.subjects.update(s.id, { name: v })} aria-label={L('Subject name', '科目名稱')} />
              <input type="color" value={s.color} onChange={(e) => db.subjects.update(s.id, { color: e.target.value })} aria-label="colour" />
              <button className="icon-btn" disabled={i === 0} onClick={() => move(s, -1)} aria-label="up">
                ↑
              </button>
              <button className="icon-btn" disabled={i === subjects.length - 1} onClick={() => move(s, 1)} aria-label="down">
                ↓
              </button>
              <button className="btn small ghost" onClick={() => db.subjects.update(s.id, { hidden: !s.hidden })}>
                {s.hidden ? L('Show', '顯示') : L('Hide', '隱藏')}
              </button>
              <button className="btn small" onClick={() => setOpen(open === s.id ? undefined : s.id)}>
                {L('Topics', '課題')} ({topics.filter((t) => t.subjectId === s.id).length})
              </button>
            </div>
            {open === s.id && <TopicEditor studentId={studentId} subject={s} topics={topics.filter((t) => t.subjectId === s.id)} />}
          </li>
        ))}
      </ul>
      <form
        className="row gap-s"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          await addSubjects(studentId, [newName.trim()]);
          setNewName('');
        }}
      >
        <input className="grow" placeholder={L('New subject, e.g. 普通話 Putonghua, STEM, PE', '新科目，例如：普通話、STEM、體育')} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn primary">+ {L('Add subject', '新增科目')}</button>
      </form>
      <div className="chips mt">
        {DEFAULT_SUBJECTS.filter(([n]) => !subjects.some((s) => s.name === n)).map(([n, icon]) => (
          <button key={n} className="chip" onClick={() => addSubjects(studentId, [n])}>
            + {icon} {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TopicEditor({ studentId, subject, topics }: { studentId: string; subject: Subject; topics: Topic[] }) {
  const L = useL();
  const [title, setTitle] = useState('');
  return (
    <div className="topic-editor">
      {topics.map((t) => (
        <div key={t.id} className="topic">
          <div className="row gap-s">
            <BufInput className="grow strong" value={t.title} onValue={(v) => db.topics.update(t.id, { title: v })} aria-label={L('Topic', '課題')} />
            <button
              className="icon-btn"
              title={L('Delete topic', '刪除課題')}
              onClick={() => confirm(L('Delete this topic? Activities and materials stay, but lose this topic link.', '刪除此課題？活動和教材會保留。')) && db.topics.delete(t.id)}
            >
              🗑
            </button>
          </div>
          <ul className="objectives">
            {t.objectives.map((o, i) => (
              <li key={o.id} className="row gap-s">
                <span>🎯</span>
                <BufInput
                  className="grow"
                  value={o.text}
                  onValue={(v) =>
                    db.topics.where('id').equals(t.id).modify((tt) => {
                      tt.objectives = tt.objectives.map((x) => (x.id === o.id ? { ...x, text: v } : x));
                    })
                  }
                />
                <button className="icon-btn" onClick={() => db.topics.update(t.id, { objectives: t.objectives.filter((x) => x.id !== o.id) })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button className="btn small ghost" onClick={() => db.topics.update(t.id, { objectives: [...t.objectives, { id: uid('o_'), text: '' }] })}>
            + {L('Learning objective', '學習目標')}
          </button>
        </div>
      ))}
      <form
        className="row gap-s"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await db.topics.add({ id: uid('t_'), studentId, subjectId: subject.id, title: title.trim(), objectives: [], order: topics.length });
          setTitle('');
        }}
      >
        <input className="grow" placeholder={L('New topic, e.g. 第三課 我的家 / Unit 2 Animals', '新課題，例如：第三課 我的家')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small">+ {L('Add topic', '新增課題')}</button>
      </form>
    </div>
  );
}
