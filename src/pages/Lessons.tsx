import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db';
import { useL, useUiLang } from '../i18n';
import { Empty, Field, Modal, SampleTag, fmtDate, go, today } from '../ui';
import { NeedStudent, useStudent } from '../App';
import type { Lesson, LessonStep } from '../types';

export function blankLesson(studentId: string, date = today()): Lesson {
  const now = Date.now();
  return {
    id: uid('l_'),
    studentId,
    date,
    title: '',
    objectives: [],
    scopeIds: [],
    topicIds: [],
    steps: [],
    tutorNotes: '',
    liveNotes: '',
    status: 'planned',
    currentStep: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function duplicateLesson(l: Lesson, date = today()) {
  const copy: Lesson = {
    ...l,
    id: uid('l_'),
    date,
    title: l.title + ' (copy)',
    status: 'planned',
    currentStep: 0,
    liveNotes: '',
    summary: undefined,
    isSample: false,
    steps: l.steps.map((s): LessonStep => ({ ...s, id: uid('st_'), done: false })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.lessons.add(copy);
  return copy;
}

export default function Lessons() {
  const L = useL();
  const { lang } = useUiLang();
  const { student } = useStudent();
  const [creating, setCreating] = useState(false);
  const lessons = useLiveQuery(() => (student ? db.lessons.where('studentId').equals(student.id).sortBy('date') : []), [student?.id]) ?? [];
  if (!student) return <NeedStudent />;
  const t = today();
  const upcoming = lessons.filter((l) => l.date >= t && l.status !== 'done');
  const unfinished = lessons.filter((l) => l.date < t && l.status !== 'done');
  const past = lessons.filter((l) => l.status === 'done').reverse();
  const Row = ({ l }: { l: Lesson }) => (
    <div className="list-row">
      <span className="date-badge">{fmtDate(l.date, lang)}</span>
      <a className="grow" href={`#/lesson/${l.id}`}>
        <strong>{l.title || L('Lesson', '課堂')}</strong> {l.isSample && <SampleTag />}
        <span className="muted small block">
          {l.steps.length} {L('steps', '步驟')} · {l.steps.reduce((s, x) => s + (x.minutes || 0), 0)} {L('min', '分鐘')}
          {l.status === 'in-progress' && ` · ${L('in progress', '進行中')} (${l.currentStep + 1}/${l.steps.length})`}
        </span>
      </a>
      <button className="btn small ghost" onClick={async () => go(`/lesson/${(await duplicateLesson(l)).id}`)}>
        ⧉ {L('Duplicate', '複製')}
      </button>
      {l.status !== 'done' && (
        <button className="btn small primary" onClick={() => go(`/teach/${l.id}`)} disabled={!l.steps.length}>
          ▶ {l.status === 'in-progress' ? L('Resume', '繼續') : L('Start', '開始')}
        </button>
      )}
    </div>
  );
  return (
    <div>
      <div className="page-head">
        <h1>
          {L('Lessons', '課堂')} · {student.name}
        </h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + {L('Plan a lesson', '準備課堂')}
        </button>
      </div>
      {lessons.length === 0 && <Empty icon="📅">{L('No lessons yet. Plan one to combine activities and worksheets from different subjects.', '尚未有課堂。準備一節課，把不同科目的活動和工作紙組合起來。')}</Empty>}
      {unfinished.length > 0 && (
        <>
          <h2>⏸ {L('Unfinished', '未完成')}</h2>
          <div className="list">{unfinished.map((l) => <Row key={l.id} l={l} />)}</div>
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <h2>📅 {L('Upcoming', '即將進行')}</h2>
          <div className="list">{upcoming.map((l) => <Row key={l.id} l={l} />)}</div>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2>✅ {L('Completed', '已完成')}</h2>
          <div className="list">{past.map((l) => <Row key={l.id} l={l} />)}</div>
        </>
      )}
      {creating && <NewLesson onClose={() => setCreating(false)} />}
    </div>
  );
}

export function NewLesson({ onClose }: { onClose: () => void }) {
  const L = useL();
  const { student } = useStudent();
  const [date, setDate] = useState(today());
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [withSeq, setWithSeq] = useState(true);
  if (!student) return null;
  return (
    <Modal title={L('Plan a lesson', '準備課堂')} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const l = blankLesson(student.id, date);
          l.title = title.trim() || L(`Lesson ${date}`, `${date} 課堂`);
          l.time = time || undefined;
          if (withSeq) {
            const seq: [LessonStep['phase'], string, string, number][] = [
              ['review', 'Quick review', '快速溫習', 5],
              ['new', 'Introduce something new', '學習新內容', 10],
              ['guided', 'Guided activity', '引導練習', 10],
              ['exercise', 'Exercise', '練習', 15],
              ['assessment', 'Short assessment', '小測', 5],
              ['recap', 'Recap', '總結', 5],
            ];
            l.steps = seq.map(([phase, en, zh, minutes]) => ({ id: uid('st_'), phase, kind: 'note', title: L(en, zh), minutes, note: '' }));
          }
          await db.lessons.add(l);
          onClose();
          go(`/lesson/${l.id}`);
        }}
      >
        <Field label={L('Title', '標題')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('e.g. Dictation 3 + fractions', '例如：默書三＋分數')} name="title" autoFocus />
        </Field>
        <div className="row gap">
          <Field label={L('Date', '日期')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required name="date" />
          </Field>
          <Field label={L('Time (optional)', '時間（可選）')}>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={withSeq} onChange={(e) => setWithSeq(e.target.checked)} />
          {L('Start with the suggested sequence (review → new → guided → exercise → assessment → recap)', '使用建議次序（溫習 → 新內容 → 引導 → 練習 → 小測 → 總結）')}
        </label>
        <div className="row end gap-s">
          <button type="button" className="btn ghost" onClick={onClose}>
            {L('Cancel', '取消')}
          </button>
          <button className="btn primary">{L('Create lesson', '建立課堂')}</button>
        </div>
      </form>
    </Modal>
  );
}
