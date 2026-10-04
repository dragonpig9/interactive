import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { MODES, useL } from '../i18n';
import { Empty, Field, Modal, SampleTag, go, useToast } from '../ui';
import { NeedStudent, useStudent } from '../App';
import { TEMPLATES, newActivity, newItem, templateInfo } from '../lib/templates';
import { buildDifficultPractice } from '../lib/practice';
import { MATH_KINDS, RESOURCE_SITES, generateFromScope, generateMath, type Difficulty, type MathKind } from '../lib/generator';
import type { TemplateId } from '../types';

export default function Practice() {
  const L = useL();
  const toast = useToast();
  const { student, subjects } = useStudent();
  const [subject, setSubject] = useState('');
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resources, setResources] = useState(false);
  const acts = useLiveQuery(() => (student ? db.activities.where('studentId').equals(student.id).reverse().sortBy('updatedAt') : []), [student?.id]) ?? [];
  if (!student) return <NeedStudent />;
  const shown = acts.filter((a) => !subject || a.subjectId === subject);
  return (
    <div>
      <div className="page-head">
        <h1>
          {L('Practice', '練習')} · {student.name}
        </h1>
        <div className="row gap-s wrap">
          <button
            className="btn"
            onClick={async () => {
              const made = await buildDifficultPractice(student.id, subject || undefined);
              if (!made.length) return toast({ kind: 'info', text: L('Nothing difficult recorded yet — great!', '暫時沒有難點記錄！') });
              go(`/play/${made[0].id}`);
            }}
          >
            🔁 {L('Practise difficult items', '練習難點')}
          </button>
          <button className="btn" onClick={() => setGenerating(true)}>
            ✨ {L('Generate exercises', '生成練習')}
          </button>
          <button className="btn ghost" onClick={() => setResources(true)}>
            🌐 {L('Find external exercises', '搜尋外部練習')}
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + {L('New activity from template', '用範本建立活動')}
          </button>
        </div>
      </div>
      <select value={subject} onChange={(e) => setSubject(e.target.value)} className="mb" aria-label={L('Subject', '科目')}>
        <option value="">{L('All subjects', '所有科目')}</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon} {s.name}
          </option>
        ))}
      </select>
      {shown.length === 0 && <Empty icon="🎯">{L('No activities yet.', '尚未有活動。')}</Empty>}
      <div className="cards">
        {shown.map((a) => {
          const s = subjects.find((x) => x.id === a.subjectId);
          const t = templateInfo(a.template);
          return (
            <div key={a.id} className="card activity-card" style={{ borderTopColor: s?.color }}>
              <div className="row gap-s">
                <span className="big-icon">{t.icon}</span>
                <div className="grow">
                  <strong>{a.title}</strong> {a.isSample && <SampleTag />}
                  <div className="small muted">
                    {s?.icon} {s?.name} · {L(t.en, t.zh)} · {a.items.length} {L('items', '題')} · {L(...MODES[a.mode])}
                  </div>
                </div>
              </div>
              {a.generated && !a.reviewed && <span className="tag warn">⚠ {L('Generated — review before use', '自動生成，使用前請審核')}</span>}
              <div className="row gap-s end">
                <button className="btn small ghost" onClick={() => go(`/activity/${a.id}`)}>
                  ✏️ {L('Edit', '編輯')}
                </button>
                <button className="btn small" onClick={() => go(`/print/${a.id}`)}>
                  🖨
                </button>
                <button className="btn small primary" onClick={() => go(`/play/${a.id}`)} disabled={a.generated && !a.reviewed}>
                  ▶ {L('Play', '開始')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {creating && <NewActivity onClose={() => setCreating(false)} />}
      {generating && <Generate onClose={() => setGenerating(false)} />}
      {resources && <Resources onClose={() => setResources(false)} />}
    </div>
  );
}

function NewActivity({ onClose }: { onClose: () => void }) {
  const L = useL();
  const { student, subjects } = useStudent();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [group, setGroup] = useState<'all' | 'language' | 'math' | 'science' | 'any'>('all');
  if (!student) return null;
  const create = async (t: TemplateId) => {
    const a = newActivity(student.id, subjectId, t);
    a.title = L(templateInfo(t).en, templateInfo(t).zh);
    a.items = [newItem(t)];
    await db.activities.add(a);
    onClose();
    go(`/activity/${a.id}`);
  };
  return (
    <Modal title={L('Choose a template', '選擇範本')} onClose={onClose} wide>
      <div className="row gap-s wrap mb">
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label={L('Subject', '科目')}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
        {(['all', 'language', 'math', 'science', 'any'] as const).map((g) => (
          <button key={g} className={`chip ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
            {{ all: L('All', '全部'), language: L('Languages', '語文'), math: L('Maths', '數學'), science: L('Science / GS', '科學／常識'), any: L('Any subject', '任何科目') }[g]}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {TEMPLATES.filter((t) => group === 'all' || t.group === group).map((t) => (
          <button key={t.id} className="template-card" onClick={() => create(t.id)}>
            <span className="big-icon">{t.icon}</span>
            <strong>{L(t.en, t.zh)}</strong>
            <span className="small muted">{L(t.descEn, t.descZh)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function Generate({ onClose }: { onClose: () => void }) {
  const L = useL();
  const toast = useToast();
  const { student, subjects } = useStudent();
  const [source, setSource] = useState<'scope' | 'math'>('scope');
  const [matId, setMatId] = useState('');
  const [template, setTemplate] = useState<TemplateId>('listen-choose');
  const [kind, setKind] = useState<MathKind>('add-sub');
  const [d, setD] = useState<Difficulty>(1);
  const [count, setCount] = useState(6);
  const [subjectId, setSubjectId] = useState(subjects.find((s) => /數學|math/i.test(s.name))?.id ?? subjects[0]?.id ?? '');
  const mats = useLiveQuery(() => (student ? db.materials.where('studentId').equals(student.id).filter((m) => m.status === 'reviewed' && m.kind !== 'answerKey').toArray() : []), [student?.id]) ?? [];
  if (!student) return null;
  const go2 = async () => {
    let a;
    if (source === 'math') a = generateMath(student.id, subjectId, kind, d, count);
    else {
      const m = mats.find((x) => x.id === matId);
      if (!m) return toast({ kind: 'error', text: L('Choose an approved scope.', '請選擇已批核的範圍。') });
      a = generateFromScope(m, template, d, count);
      if (!a.items.length) return toast({ kind: 'error', text: L('That scope has no approved words or questions to use.', '該範圍沒有已批核的詞語或題目。') });
    }
    await db.activities.add(a);
    onClose();
    go(`/activity/${a.id}`);
  };
  return (
    <Modal title={L('Generate exercises', '生成練習')} onClose={onClose}>
      <p className="muted small">
        {L('Generated questions are drafts: you review and edit them before they can be added to a lesson. Language exercises only use approved scope content. Maths answers are calculated exactly.', '生成的題目是草稿，須經你審核及修改，才可加入課堂。語文練習只會使用已批核的範圍內容；數學答案以準確方法計算。')}
      </p>
      <div className="tabs">
        <button className={source === 'scope' ? 'on' : ''} onClick={() => setSource('scope')}>
          📚 {L('From an approved scope', '根據已批核範圍')}
        </button>
        <button className={source === 'math' ? 'on' : ''} onClick={() => setSource('math')}>
          🔢 {L('Maths practice', '數學練習')}
        </button>
      </div>
      <div className="form">
        {source === 'scope' ? (
          <>
            <Field label={L('Scope', '範圍')}>
              <select value={matId} onChange={(e) => setMatId(e.target.value)}>
                <option value="">—</option>
                {mats.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={L('Exercise type', '練習類型')}>
              <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
                {(['listen-choose', 'picture-match', 'dictation', 'short-answer', 'multiple-choice'] as TemplateId[]).map((t) => (
                  <option key={t} value={t}>
                    {templateInfo(t).icon} {L(templateInfo(t).en, templateInfo(t).zh)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label={L('Subject', '科目')}>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={L('Topic', '課題')}>
              <select value={kind} onChange={(e) => setKind(e.target.value as MathKind)}>
                {Object.entries(MATH_KINDS).map(([k, [en, zh]]) => (
                  <option key={k} value={k}>
                    {L(en, zh)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="row gap">
          <Field label={L('Difficulty', '難度')}>
            <select value={d} onChange={(e) => setD(+e.target.value as Difficulty)}>
              <option value={1}>{L('1 – gentle', '1 – 淺')}</option>
              <option value={2}>{L('2 – standard', '2 – 中')}</option>
              <option value={3}>{L('3 – challenge', '3 – 深')}</option>
            </select>
          </Field>
          <Field label={L('Number of questions', '題目數量')}>
            <input type="number" min={1} max={40} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, +e.target.value || 1)))} />
          </Field>
        </div>
        <div className="row end gap-s">
          <button className="btn ghost" onClick={onClose}>
            {L('Cancel', '取消')}
          </button>
          <button className="btn primary" onClick={go2}>
            ✨ {L('Generate draft', '生成草稿')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Resources({ onClose }: { onClose: () => void }) {
  const L = useL();
  const [q, setQ] = useState('');
  const online = navigator.onLine;
  return (
    <Modal title={L('Find external exercises', '搜尋外部練習')} onClose={onClose} wide>
      <div className="alert">
        🌐 {L('This opens real websites in a new tab and needs internet. The app does not search for you or summarise results — check the level, language and any payment or registration on each site.', '此功能會在新分頁開啟真實網站，需要網絡。程式不會代你搜尋或總結結果，請自行在網站上核對程度、語言及是否需要付費或登記。')}
        {!online && <strong> {L('You are offline now.', '你目前離線。')}</strong>}
      </div>
      <Field label={L('Search words (e.g. "P1 中文 量詞 工作紙", "fractions year 5")', '搜尋字詞（例如：「小一 量詞 工作紙」）')}>
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <table className="answers">
        <thead>
          <tr>
            <th>{L('Source', '來源')}</th>
            <th>{L('Level', '程度')}</th>
            <th>{L('Language', '語言')}</th>
            <th>{L('Cost / registration', '收費／登記')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {RESOURCE_SITES.map((r) => (
            <tr key={r.url}>
              <td>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.name}
                </a>
              </td>
              <td>{r.level}</td>
              <td>{r.lang}</td>
              <td className="small">{r.cost}</td>
              <td>
                <a className={`btn small ${!q ? 'disabled' : ''}`} href={q ? r.search + encodeURIComponent(q) : undefined} target="_blank" rel="noreferrer">
                  🔍 {L('Search site', '搜尋此網站')}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{L('Site details were correct when this app was written; sites can change their terms.', '網站資料以本程式編寫時為準，網站條款可能有變。')}</p>
    </Modal>
  );
}
