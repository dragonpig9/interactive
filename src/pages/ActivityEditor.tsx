import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveFile } from '../db';
import { MODES, SKILLS, useL } from '../i18n';
import { Field, FileImage, Modal, RecordButton, SampleTag, SpeakButton, go, useLiveDoc, useToast } from '../ui';
import { useStudent } from '../App';
import { TEMPLATES, newItem, parseTokens, templateInfo } from '../lib/templates';
import { draftAnswerFor } from '../lib/math';
import { detectLang } from '../lib/speech';
import { AnswerStatusBadge } from '../components/Player';
import type { Activity, ActivityItem, AnswerStatus, Lang, TemplateId } from '../types';

export default function ActivityEditor({ id }: { id: string }) {
  const L = useL();
  const toast = useToast();
  const [a, patchA] = useLiveDoc(db.activities, id);
  const { subjects } = useStudent();
  const topics = useLiveQuery(() => (a ? db.topics.where('subjectId').equals(a.subjectId).toArray() : []), [a?.subjectId]) ?? [];
  const [preview, setPreview] = useState(false);
  if (!a) return null;
  const info = templateInfo(a.template);
  const save = (patch: Partial<Activity>) => patchA(patch);
  const setItem = (iid: string, patch: Partial<ActivityItem>) => patchA((cur) => ({ items: cur.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }));
  const topic = topics.find((t) => t.id === a.topicId);
  const unapproved = a.items.filter((i) => i.answerStatus === 'draft').length;

  return (
    <div>
      <div className="page-head">
        <h1>
          {info.icon} {a.title} {a.isSample && <SampleTag />}
        </h1>
        <div className="row gap-s">
          <button className="btn ghost" onClick={() => history.back()}>
            ← {L('Back', '返回')}
          </button>
          <button className="btn" onClick={() => go(`/print/${a.id}`)}>
            🖨 {L('Print', '列印')}
          </button>
          <button className="btn" onClick={async () => {
            const copy = { ...a, id: crypto.randomUUID(), title: a.title + L(' (copy)', '（副本）'), isSample: false, createdAt: Date.now(), updatedAt: Date.now() };
            await db.activities.add(copy);
            go(`/activity/${copy.id}`);
          }}>
            ⧉ {L('Duplicate', '複製')}
          </button>
          <button className="btn primary" onClick={() => go(`/play/${a.id}`)}>
            ▶ {L('Try it', '試做')}
          </button>
        </div>
      </div>

      {a.generated && !a.reviewed && (
        <div className="alert warn">
          ⚠ {L('Generated activity — check every question and answer, then mark it reviewed before adding it to a lesson.', '自動生成的活動：請檢查每條題目和答案，然後標記為已審核，才可加入課堂。')}
          <button className="btn small primary" onClick={() => save({ reviewed: true, items: a.items.map((i) => ({ ...i, answerStatus: i.answerStatus === 'draft' ? 'approved' : i.answerStatus })) })}>
            ✓ {L('I have reviewed it', '我已審核')}
          </button>
        </div>
      )}

      <div className="card form">
        <div className="grid4">
          <Field label={L('Title', '標題')}>
            <input value={a.title} onChange={(e) => save({ title: e.target.value })} />
          </Field>
          <Field label={L('Subject', '科目')}>
            <select value={a.subjectId} onChange={(e) => save({ subjectId: e.target.value, topicId: undefined, objectiveId: undefined })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Topic', '課題')}>
            <select value={a.topicId || ''} onChange={(e) => save({ topicId: e.target.value || undefined, objectiveId: undefined })}>
              <option value="">—</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Learning objective', '學習目標')}>
            <select value={a.objectiveId || ''} onChange={(e) => save({ objectiveId: e.target.value || undefined })} disabled={!topic}>
              <option value="">—</option>
              {topic?.objectives.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.text}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Template', '範本')}>
            <select value={a.template} onChange={(e) => save({ template: e.target.value as TemplateId })}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {L(t.en, t.zh)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Mode', '模式')}>
            <select value={a.mode} onChange={(e) => save({ mode: e.target.value as Activity['mode'] })}>
              {Object.entries(MODES).map(([k, [en, zh]]) => (
                <option key={k} value={k}>
                  {L(en, zh)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('This activity assesses', '此活動評估')}>
            <select value={a.assesses} onChange={(e) => save({ assesses: e.target.value as Activity['assesses'] })}>
              <option value="reading">{L('Reading', '閱讀能力')}</option>
              <option value="subject">{L('Subject knowledge', '學科知識')}</option>
              <option value="both">{L('Both', '兩者')}</option>
            </select>
          </Field>
          <Field label={L('Progress area', '進度範疇')}>
            <select value={a.skill} onChange={(e) => save({ skill: e.target.value as Activity['skill'] })}>
              {Object.entries(SKILLS).map(([k, [en, zh]]) => (
                <option key={k} value={k}>
                  {L(en, zh)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row gap wrap">
          <Field label={L('Instruction for the student (keep it short)', '給學生的指示（簡短）')}>
            <div className="row gap-s">
              <input className="icon-input" value={a.instructionIcon} onChange={(e) => save({ instructionIcon: e.target.value })} aria-label="icon" />
              <input className="grow" value={a.instructions} onChange={(e) => save({ instructions: e.target.value })} />
              <SpeakButton text={a.instructions} />
              <RecordButton text={a.instructions} lang={detectLang(a.instructions)} />
            </div>
          </Field>
        </div>
        <div className="row gap wrap">
          <label className="check">
            <input type="checkbox" checked={a.support.audio} onChange={(e) => save({ support: { ...a.support, audio: e.target.checked } })} />
            🔊 {L('Read-aloud support allowed', '容許朗讀支援')}
          </label>
          <label className="check">
            <input type="checkbox" checked={a.support.hints} onChange={(e) => save({ support: { ...a.support, hints: e.target.checked } })} />
            💡 {L('Student can ask for hints', '學生可要求提示')}
          </label>
          <label className="check">
            <input type="checkbox" checked={a.support.pictures} onChange={(e) => save({ support: { ...a.support, pictures: e.target.checked } })} />
            🖼 {L('Show pictures', '顯示圖片')}
          </label>
        </div>
        <p className="muted small">
          {a.mode === 'assessment'
            ? L('Assessment mode: hints are only given by you, and every use of audio or hints is recorded so supported answers are kept separate from independent ones.', '評估模式：只有導師可給提示；所有聲音和提示的使用都會記錄，以分開有協助及獨立的答案。')
            : L('Audio and hint use is always recorded, so supported answers are distinguishable from independent answers.', '聲音和提示的使用都會記錄，以分辨有協助及獨立的答案。')}
        </p>
        <Field label={L('Reading passage (optional, shown above every question)', '閱讀篇章（可選，每題上方顯示）')}>
          <textarea rows={a.passage ? 4 : 1} value={a.passage || ''} onChange={(e) => save({ passage: e.target.value || undefined })} />
        </Field>
      </div>

      <div className="row gap-s mt">
        <h2 className="grow">
          {L('Items', '題目')} ({a.items.length}) {unapproved > 0 && <span className="tag warn">⚠ {unapproved} {L('draft answers', '草稿答案')}</span>}
        </h2>
        <button className="btn ghost small" onClick={() => setPreview(true)}>
          👁 {L('Template help', '範本說明')}
        </button>
      </div>
      <ol className="item-editors">
        {a.items.map((it, idx) => (
          <li key={it.id} className="card item-editor">
            <div className="row gap-s">
              <strong>#{idx + 1}</strong>
              <AnswerStatusBadge item={it} template={a.template} />
              <span className="grow" />
              <button className="icon-btn" disabled={idx === 0} onClick={() => { const items = [...a.items]; [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; save({ items }); }}>
                ↑
              </button>
              <button className="icon-btn" disabled={idx === a.items.length - 1} onClick={() => { const items = [...a.items]; [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; save({ items }); }}>
                ↓
              </button>
              <button className="icon-btn" onClick={() => save({ items: [...a.items.slice(0, idx + 1), { ...it, id: crypto.randomUUID() }, ...a.items.slice(idx + 1)] })} title={L('Duplicate', '複製')}>
                ⧉
              </button>
              <button className="icon-btn" onClick={() => save({ items: a.items.filter((x) => x.id !== it.id) })} title={L('Delete', '刪除')}>
                🗑
              </button>
            </div>
            <ItemFields a={a} it={it} set={(p) => setItem(it.id, p)} />
          </li>
        ))}
      </ol>
      <button className="btn primary" onClick={() => save({ items: [...a.items, newItem(a.template, { lang: a.items[a.items.length - 1]?.lang ?? 'none' })] })}>
        + {L('Add item', '新增題目')}
      </button>
      <button
        className="btn danger small right"
        onClick={async () => {
          if (!confirm(L('Delete this activity? Progress already recorded is kept.', '刪除此活動？已記錄的進度會保留。'))) return;
          await db.activities.delete(a.id);
          toast({ kind: 'ok', text: L('Activity deleted.', '已刪除活動。') });
          go('/practice');
        }}
      >
        {L('Delete activity', '刪除活動')}
      </button>
      {preview && (
        <Modal title={L(info.en, info.zh)} onClose={() => setPreview(false)}>
          <p>{L(info.descEn, info.descZh)}</p>
          <TemplateHelp t={a.template} />
        </Modal>
      )}
    </div>
  );
}

function TemplateHelp({ t }: { t: TemplateId }) {
  const L = useL();
  const tips: Partial<Record<TemplateId, [string, string]>> = {
    'word-in-sentence': ['Write the example sentence with / between words, e.g. 我/喜歡/吃/蘋果. The target word must be one of the parts.', '例句用 / 分隔詞語，例如：我/喜歡/吃/蘋果。目標詞語必須是其中一部分。'],
    'sentence-order': ['Type the correct sentence with / between cards: I / like / red / apples.', '用 / 分隔詞語卡輸入正確句子：我/喜歡/紅色的/蘋果。'],
    sequencing: ['Type the steps in the correct order, one per line.', '按正確次序輸入步驟，每行一個。'],
    sorting: ['Name the groups, then add each card and its correct group.', '輸入組別名稱，再加入每張卡片及正確組別。'],
    'label-diagram': ['Add a picture, then click on it to place numbered labels.', '加入圖片，然後點擊圖片放置編號標籤。'],
    math: ['Type the exact answer (e.g. 3/4, 1 1/2, 0.75). Equivalent forms are accepted automatically. Add worked steps for hints and the answer key.', '輸入準確答案（如 3/4、1 1/2、0.75），等值答案會自動接受。可加入步驟作提示及答案。'],
    phonics: ['Segments: separate sounds with /, e.g. c/a/t or sh/i/p. Record your own letter sounds with 🎙 for the best results.', '音節用 / 分隔，如 c/a/t、sh/i/p。建議用 🎙 錄下字母音。'],
  };
  const tip = tips[t];
  return tip ? <p className="muted">{L(...tip)}</p> : null;
}

function LangSelect({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <select className="small-select" value={value} onChange={(e) => onChange(e.target.value as Lang)} aria-label="language">
      <option value="zh">中 (粵)</option>
      <option value="en">EN</option>
      <option value="none">—</option>
    </select>
  );
}

function ItemFields({ a, it, set }: { a: Activity; it: ActivityItem; set: (p: Partial<ActivityItem>) => void }) {
  const L = useL();
  const t = a.template;
  const vocab = ['flashcards', 'vocab-journey', 'listen-choose', 'picture-match', 'word-in-sentence', 'phonics', 'dictation'].includes(t);
  const setAnswer = (answer: string, status: AnswerStatus = 'approved') => set({ answer, answerStatus: answer.trim() ? status : 'none' });

  return (
    <div className="form">
      {vocab ? (
        <div className="row gap-s wrap">
          <Field label={L('Word / phrase / character', '字／詞語／短語')}>
            <div className="row gap-s">
              <input className={`grow ${it.lang === 'zh' ? 'zh' : ''}`} value={it.text || ''} onChange={(e) => set({ text: e.target.value, answer: e.target.value, answerStatus: e.target.value ? 'approved' : 'none', prompt: e.target.value, lang: it.lang === 'none' ? detectLang(e.target.value) : it.lang, key: undefined })} />
              <LangSelect value={it.lang} onChange={(lang) => set({ lang })} />
              <SpeakButton text={it.text || ''} lang={it.lang} audioFileId={it.audioFileId} />
              <RecordButton text={it.text || ''} lang={it.lang} />
            </div>
          </Field>
          <Field label={L('Meaning (optional)', '意思（可選）')}>
            <input value={it.meaning || ''} onChange={(e) => set({ meaning: e.target.value })} />
          </Field>
          <Field label={L('Example sentence (use / for word boundaries)', '例句（用 / 分詞）')}>
            <input className={it.lang === 'zh' ? 'zh' : ''} value={it.example || ''} onChange={(e) => set({ example: e.target.value, tokens: t === 'word-in-sentence' ? parseTokens(e.target.value) : it.tokens, answerStatus: t === 'word-in-sentence' ? (parseTokens(e.target.value).includes((it.text || '').trim()) ? 'approved' : 'none') : it.answerStatus })} />
          </Field>
        </div>
      ) : (
        <Field label={L('Question / instruction', '題目／指示')}>
          <div className="row gap-s">
            <textarea className={`grow ${it.lang === 'zh' ? 'zh' : ''}`} rows={2} value={it.prompt} onChange={(e) => set({ prompt: e.target.value, lang: it.lang === 'none' ? detectLang(e.target.value) : it.lang })} />
            <div className="col gap-s">
              <LangSelect value={it.lang} onChange={(lang) => set({ lang })} />
              <SpeakButton text={it.prompt} lang={it.lang} audioFileId={it.audioFileId} />
              <RecordButton text={it.prompt} lang={it.lang} />
            </div>
          </div>
        </Field>
      )}

      <PictureField it={it} set={set} />

      {(t === 'listen-choose' || t === 'picture-match' || t === 'phonics' || t === 'multiple-choice' || t === 'gap-fill') && (
        <Field label={t === 'gap-fill' ? L('Word bank (optional — leave empty for typing)', '詞語庫（可選，留空即打字作答）') : L('Choices (one per line; include the correct one)', '選項（每行一個，須包括正確答案）')}>
          <textarea rows={3} className={it.lang === 'zh' ? 'zh' : ''} value={(it.choices || []).join('\n')} onChange={(e) => set({ choices: e.target.value.split('\n') })} />
        </Field>
      )}
      {t === 'phonics' && (
        <Field label={L('Sound segments (separate with /)', '音節（用 / 分隔）')}>
          <input value={(it.segments || []).join('/')} onChange={(e) => set({ segments: parseTokens(e.target.value) })} />
        </Field>
      )}
      {(t === 'sentence-order' || t === 'sequencing') && (
        <Field label={t === 'sequencing' ? L('Steps in the correct order (one per line)', '正確次序的步驟（每行一個）') : L('Correct sentence, cards separated by /', '正確句子，用 / 分隔詞語卡')}>
          <textarea
            rows={t === 'sequencing' ? 4 : 2}
            className={it.lang === 'zh' ? 'zh' : ''}
            value={t === 'sequencing' ? (it.tokens || []).join('\n') : (it.tokens || []).join(' / ')}
            onChange={(e) => {
              const tokens = t === 'sequencing' ? e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) : parseTokens(e.target.value);
              set({ tokens, answerStatus: tokens.length > 1 ? 'approved' : 'none' });
            }}
          />
        </Field>
      )}
      {t === 'sorting' && <SortingFields it={it} set={set} />}
      {t === 'matching' && <MatchingFields it={it} set={set} />}
      {t === 'label-diagram' && <LabelFields it={it} set={set} />}
      {t === 'counting' && (
        <div className="row gap-s">
          <Field label={L('Picture (emoji)', '圖案（表情符號）')}>
            <input className="icon-input" value={it.emoji || ''} onChange={(e) => set({ emoji: e.target.value })} />
          </Field>
          <Field label={L('How many', '數量')}>
            <input type="number" min={0} max={100} value={it.count ?? 0} onChange={(e) => set({ count: +e.target.value, answer: e.target.value, answerStatus: 'approved' })} />
          </Field>
          <Field label={L('Group in', '每組')}>
            <input type="number" min={0} max={20} value={it.groupSize ?? 0} onChange={(e) => set({ groupSize: +e.target.value })} />
          </Field>
        </div>
      )}
      {t === 'number-line' && (
        <div className="row gap-s">
          {(['min', 'max', 'step', 'target'] as const).map((k) => (
            <Field key={k} label={{ min: L('Start', '起點'), max: L('End', '終點'), step: L('Step', '間距'), target: L('Arrow at', '箭咀位置') }[k]}>
              <input type="number" step="any" value={it.numberLine?.[k] ?? 0} onChange={(e) => { const nl = { ...(it.numberLine || { min: 0, max: 10, step: 1, target: 5 }), [k]: +e.target.value }; set({ numberLine: nl, answer: String(nl.target), answerStatus: 'approved' }); }} />
            </Field>
          ))}
        </div>
      )}

      {!vocab && !['sorting', 'matching', 'label-diagram', 'sentence-order', 'sequencing', 'counting', 'number-line'].includes(t) && (
        <div className="row gap-s wrap">
          <Field label={t === 'short-answer' || t === 'oral-task' ? L('Model answer (optional)', '參考答案（可選）') : L('Answer', '答案')}>
            <div className="row gap-s">
              <input className={it.answerStatus === 'draft' ? 'draft-input' : ''} value={it.answer || ''} onChange={(e) => setAnswer(e.target.value)} />
              {it.answerStatus === 'draft' && (
                <button className="btn small" onClick={() => set({ answerStatus: 'approved' })}>
                  ✓ {L('Approve', '批核')}
                </button>
              )}
              {t === 'math' && (
                <button
                  className="btn small ghost"
                  title={L('Calculated exactly from the question. Saved as a draft for you to check.', '根據題目準確計算，存為草稿待檢查。')}
                  onClick={() => {
                    const d = draftAnswerFor(it.prompt);
                    if (d) set({ answer: d, answerStatus: 'draft' });
                    else alert(L('This question is not plain arithmetic, so no answer was calculated. Please type it.', '此題不是純計算題，沒有計算答案，請自行輸入。'));
                  }}
                >
                  🧮 {L('Calculate draft', '計算草稿')}
                </button>
              )}
            </div>
          </Field>
          <Field label={L('Also accept (separate with |)', '亦接受（用 | 分隔）')}>
            <input value={(it.alternatives || []).join(' | ')} onChange={(e) => set({ alternatives: e.target.value.split('|').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
        </div>
      )}

      <details>
        <summary>
          {L('Hints, worked steps, explanation & marking notes', '提示、步驟、解釋及評分備註')} {it.hints.length ? `(${it.hints.length})` : ''}
        </summary>
        <Field label={L('Hints, easiest last (one per line)', '提示（每行一個）')}>
          <textarea rows={2} value={it.hints.join('\n')} onChange={(e) => set({ hints: e.target.value.split('\n') })} />
        </Field>
        {['math', 'counting', 'number-line', 'short-answer'].includes(t) && (
          <Field label={L('Worked steps (one per line)', '計算步驟（每行一個）')}>
            <textarea rows={3} value={(it.workedSteps || []).join('\n')} onChange={(e) => set({ workedSteps: e.target.value.split('\n').filter((x) => x.trim()) })} />
          </Field>
        )}
        <Field label={L('Explanation (shown with the answer key)', '解釋（與答案一同顯示）')}>
          <input value={it.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />
        </Field>
        <Field label={L('Marking notes (private)', '評分備註（私人）')}>
          <input value={it.markingNotes || ''} onChange={(e) => set({ markingNotes: e.target.value })} />
        </Field>
      </details>
    </div>
  );
}

function PictureField({ it, set }: { it: ActivityItem; set: (p: Partial<ActivityItem>) => void }) {
  const L = useL();
  const toast = useToast();
  return (
    <div className="row gap-s picture-field">
      <span className="small muted">{L('Picture', '圖片')}:</span>
      <input className="icon-input" placeholder="🙂" value={it.emoji || ''} onChange={(e) => set({ emoji: e.target.value })} aria-label="emoji" />
      {it.imageFileId && <FileImage fileId={it.imageFileId} className="thumb" />}
      <label className="btn small ghost">
        📷 {it.imageFileId ? L('Change', '更換') : L('Upload', '上載')}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              set({ imageFileId: await saveFile(f, f.name) });
            } catch (err) {
              toast({ kind: 'error', text: (err as Error).message });
            }
          }}
        />
      </label>
      {it.imageFileId && (
        <button className="btn small ghost" onClick={() => set({ imageFileId: undefined })}>
          ✕
        </button>
      )}
    </div>
  );
}

function SortingFields({ it, set }: { it: ActivityItem; set: (p: Partial<ActivityItem>) => void }) {
  const L = useL();
  const cats = it.categories || [];
  const items = it.sortItems || [];
  return (
    <>
      <Field label={L('Groups (one per line)', '組別（每行一個）')}>
        <textarea rows={2} value={cats.join('\n')} onChange={(e) => set({ categories: e.target.value.split('\n') })} />
      </Field>
      <table className="mini">
        <tbody>
          {items.map((s, i) => (
            <tr key={i}>
              <td>
                <input value={s.text} onChange={(e) => set({ sortItems: items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </td>
              <td>
                <select value={s.category} onChange={(e) => set({ sortItems: items.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })}>
                  <option value="">—</option>
                  {cats.filter(Boolean).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </td>
              <td>
                <button className="icon-btn" onClick={() => set({ sortItems: items.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small ghost" onClick={() => set({ sortItems: [...items, { text: '', category: '' }], answerStatus: 'approved' })}>
        + {L('Card', '卡片')}
      </button>
    </>
  );
}

function MatchingFields({ it, set }: { it: ActivityItem; set: (p: Partial<ActivityItem>) => void }) {
  const L = useL();
  const pairs = it.pairs || [];
  return (
    <>
      <table className="mini">
        <tbody>
          {pairs.map((p, i) => (
            <tr key={i}>
              <td>
                <input value={p.left} placeholder={L('Left (e.g. cause)', '左（例如：原因）')} onChange={(e) => set({ pairs: pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)), answerStatus: 'approved' })} />
              </td>
              <td>↔</td>
              <td>
                <input value={p.right} placeholder={L('Right (e.g. effect)', '右（例如：結果）')} onChange={(e) => set({ pairs: pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)), answerStatus: 'approved' })} />
              </td>
              <td>
                <button className="icon-btn" onClick={() => set({ pairs: pairs.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small ghost" onClick={() => set({ pairs: [...pairs, { left: '', right: '' }] })}>
        + {L('Pair', '配對')}
      </button>
    </>
  );
}

function LabelFields({ it, set }: { it: ActivityItem; set: (p: Partial<ActivityItem>) => void }) {
  const L = useL();
  const markers = it.markers || [];
  return (
    <>
      <p className="small muted">{L('Click on the picture to add a numbered point.', '點擊圖片加入編號位置。')}</p>
      <div
        className="diagram editable"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          set({ markers: [...markers, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, label: '' }], answerStatus: 'approved' });
        }}
      >
        {it.imageFileId ? <FileImage fileId={it.imageFileId} className="diagram-img" /> : <div className="emoji-pic emoji-lg">{it.emoji || '🖼️'}</div>}
        {markers.map((m, i) => (
          <span key={i} className="marker" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
            {i + 1}
          </span>
        ))}
      </div>
      {markers.map((m, i) => (
        <div key={i} className="row gap-s">
          <span className="marker static">{i + 1}</span>
          <input value={m.label} placeholder={L('Label', '名稱')} onChange={(e) => set({ markers: markers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          <button className="icon-btn" onClick={() => set({ markers: markers.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
    </>
  );
}
