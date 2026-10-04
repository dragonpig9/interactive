import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useL } from '../i18n';
import { FileImage } from '../ui';
import { prettyAnswer } from '../components/Player';
import { shuffle } from '../lib/templates';
import type { Activity, ActivityItem } from '../types';

/** Printable worksheet and a separate printable answer sheet. */
export default function PrintPage({ activityId }: { activityId: string }) {
  const L = useL();
  const a = useLiveQuery(() => db.activities.get(activityId), [activityId]);
  const s = useLiveQuery(() => (a ? db.students.get(a.studentId) : undefined), [a?.studentId]);
  const [answers, setAnswers] = useState(false);
  const [big, setBig] = useState(true);
  if (!a) return null;
  return (
    <div className={`print-page ${big ? 'big' : ''}`}>
      <div className="no-print row gap-s print-bar">
        <button className="btn ghost" onClick={() => history.back()}>
          ← {L('Back', '返回')}
        </button>
        <button className={`btn ${!answers ? 'primary' : ''}`} onClick={() => setAnswers(false)}>
          📄 {L('Worksheet', '工作紙')}
        </button>
        <button className={`btn ${answers ? 'primary' : ''}`} onClick={() => setAnswers(true)}>
          🔑 {L('Answer sheet', '答案紙')}
        </button>
        <label className="check">
          <input type="checkbox" checked={big} onChange={(e) => setBig(e.target.checked)} /> {L('Large print', '大字')}
        </label>
        <button className="btn primary" onClick={() => print()}>
          🖨 {L('Print', '列印')}
        </button>
        {a.generated && !a.reviewed && <span className="tag warn">⚠ {L('Not reviewed yet', '尚未審核')}</span>}
      </div>
      <header className="print-head">
        <h1>
          {a.title} {answers && `— ${L('Answer sheet', '答案')}`}
        </h1>
        <div className="row gap">
          <span>
            {L('Name', '姓名')}: {s?.name ?? '________'}
          </span>
          <span>{L('Date', '日期')}: ____________</span>
        </div>
        {!answers && <p className="print-instr">{a.instructionIcon} {a.instructions}</p>}
        {a.passage && <div className="print-passage">{a.passage}</div>}
      </header>
      <ol className="print-items">
        {a.items.map((it) => (
          <li key={it.id}>{answers ? <AnswerLine a={a} it={it} /> : <WorksheetItem a={a} it={it} />}</li>
        ))}
      </ol>
    </div>
  );
}

function AnswerLine({ a, it }: { a: Activity; it: ActivityItem }) {
  const L = useL();
  const ans = a.template === 'counting' ? String(it.count) : a.template === 'number-line' ? String(it.numberLine?.target) : prettyAnswer(it);
  return (
    <div>
      <span className="muted">{(it.prompt || it.text || '').split('\n')[0].slice(0, 60)}</span> → <strong>{ans || L('(tutor marks — no answer key)', '（由導師評分，沒有答案）')}</strong>
      {it.answerStatus === 'draft' && <em> ⚠ {L('draft, not reviewed', '草稿，未審核')}</em>}
      {it.alternatives?.length ? <span className="muted"> / {it.alternatives.join(' / ')}</span> : null}
      {it.workedSteps?.length ? <div className="small">{it.workedSteps.join(' → ')}</div> : null}
      {it.explanation && <div className="small">{it.explanation}</div>}
    </div>
  );
}

function WorksheetItem({ a, it }: { a: Activity; it: ActivityItem }) {
  const pic = it.imageFileId ? <FileImage fileId={it.imageFileId} className="print-pic" /> : it.emoji ? <span className="print-emoji">{it.emoji}</span> : null;
  switch (a.template) {
    case 'flashcards':
    case 'vocab-journey':
      return (
        <div className="print-word">
          {pic} <span className="zh-big">{it.text}</span> {it.meaning && <span>— {it.meaning}</span>} <span className="trace">{it.text}</span> <span className="line" />
        </div>
      );
    case 'dictation':
      return <div className="print-line">{'＿'.repeat(Math.max(4, [...(it.text || '')].length * 2))}</div>;
    case 'listen-choose':
    case 'picture-match':
    case 'phonics':
    case 'multiple-choice':
      return (
        <div>
          {pic} {a.template === 'listen-choose' ? '🔊' : it.prompt}
          <div className="print-choices">
            {(it.choices || []).filter(Boolean).map((c, i) => (
              <span key={i}>☐ {c}</span>
            ))}
          </div>
        </div>
      );
    case 'sentence-order':
    case 'sequencing':
      return (
        <div>
          {it.prompt}
          <div className="print-choices">
            {shuffle(it.tokens || []).map((t, i) => (
              <span key={i} className="boxed">
                {t}
              </span>
            ))}
          </div>
          <div className="print-line" />
        </div>
      );
    case 'sorting':
      return (
        <div>
          {it.prompt}
          <div className="print-choices">{(it.sortItems || []).map((x, i) => <span key={i} className="boxed">{x.text}</span>)}</div>
          <table className="print-table">
            <thead>
              <tr>{(it.categories || []).filter(Boolean).map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              <tr>{(it.categories || []).filter(Boolean).map((c) => <td key={c} style={{ height: 90 }} />)}</tr>
            </tbody>
          </table>
        </div>
      );
    case 'matching':
      return (
        <div className="print-match">
          <div>{(it.pairs || []).map((p, i) => <div key={i}>{p.left} ●</div>)}</div>
          <div>{shuffle((it.pairs || []).map((p) => p.right)).map((r, i) => <div key={i}>● {r}</div>)}</div>
        </div>
      );
    case 'counting':
      return (
        <div>
          {it.prompt} <div className="print-emoji-row">{Array.from({ length: it.count || 0 }).map(() => it.emoji).join(' ')}</div> = ____
        </div>
      );
    case 'label-diagram':
      return (
        <div>
          {it.prompt}
          <div className="diagram print">
            {pic}
            {(it.markers || []).map((m, i) => <span key={i} className="marker" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>{i + 1}</span>)}
          </div>
          {(it.markers || []).map((_, i) => <div key={i}>{i + 1}. ____________</div>)}
        </div>
      );
    default:
      return (
        <div>
          {pic} <span className="print-q">{it.prompt}</span>
          <div className="print-line" />
          {a.template === 'short-answer' && <div className="print-line" />}
        </div>
      );
  }
}
