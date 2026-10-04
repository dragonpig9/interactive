import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveFile, uid } from '../db';
import { MATERIAL_KINDS, useL } from '../i18n';
import { Field, Modal, SampleTag, SpeakButton, go, useLiveDoc, useToast } from '../ui';
import { useStudent } from '../App';
import FileViewer from '../components/FileViewer';
import type { ExtractedItem, ItemKind, Lang, Material, MaterialKind, TemplateId, TypedAnswer } from '../types';
import { ACCEPT, ingestFiles, itemsFromPaste } from '../lib/materials';
import { answersFromKeyItems, ocrImage, renderPdfPage, textToItems } from '../lib/extract';
import { draftAnswerFor } from '../lib/math';
import { TEMPLATES, itemsFromQuestions, itemsFromWords, newActivity, templateInfo } from '../lib/templates';
import { detectLang } from '../lib/speech';

export default function MaterialReview({ id }: { id: string }) {
  const L = useL();
  const toast = useToast();
  const [m, patchM] = useLiveDoc(db.materials, id);
  const { subjects } = useStudent();
  const topics = useLiveQuery(() => (m ? db.topics.where('subjectId').equals(m.subjectId).toArray() : []), [m?.subjectId]) ?? [];
  const [fileIdx, setFileIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [makeActivity, setMakeActivity] = useState(false);
  const [ocrBusy, setOcrBusy] = useState('');
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  if (!m) return null;

  const update = (patch: Partial<Material>) => patchM(patch);
  const setItems = (items: ExtractedItem[]) => update({ items });
  const setItem = (iid: string, patch: Partial<ExtractedItem>) => patchM((cur) => ({ items: cur.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) }));
  const flaggedIncluded = m.items.filter((i) => i.include && i.uncertain);
  const allFiles = m.fileIds;
  const currentFile = allFiles[fileIdx];

  const addPicture = async (blob: Blob, pg: number) => {
    const fid = await saveFile(blob, `${m.title}-p${pg}.png`, 'crop');
    await setItems([...m.items, { id: uid('x_'), kind: 'diagram', text: L(`Picture from page ${pg}`, `第 ${pg} 頁圖片`), page: pg, uncertain: false, lang: 'none', include: true, imageFileId: fid }]);
    toast({ kind: 'ok', text: L('Picture saved as an item. Give it a name or caption.', '圖片已存為項目，請加上名稱。') });
  };

  const runOcr = async () => {
    const f = await db.files.get(currentFile);
    if (!f) return;
    setOcrBusy(L('Starting OCR…', '開始文字辨識…'));
    try {
      let blob: Blob = f.blob;
      if (f.type === 'application/pdf') blob = await renderPdfPage(f.blob, page, 2.5);
      const out = await ocrImage(blob, (p) => setOcrBusy(`OCR ${Math.round(p * 100)}%`));
      const its = textToItems(out.pages.map((p) => ({ ...p, page })), m.kind).map((i) => ({ ...i, uncertain: true, uncertainReason: i.uncertainReason || 'Read by OCR — check against the original', include: false }));
      await setItems([...m.items, ...its]);
      toast({ kind: 'ok', text: out.warnings.join(' ') + ' ' + L('All OCR lines are flagged for checking.', '所有辨識結果已標記待檢查。') });
    } catch (e) {
      toast({ kind: 'error', text: L('OCR failed: ', '文字辨識失敗：') + (e as Error).message + ' ' + L('You can still type the content yourself.', '你仍可自行輸入內容。') });
    }
    setOcrBusy('');
  };

  const approve = async () => {
    if (flaggedIncluded.length) {
      return toast({ kind: 'error', text: L(`${flaggedIncluded.length} flagged item(s) are still marked "use". Check them against the original and press ✓ Checked, or untick them.`, `仍有 ${flaggedIncluded.length} 個標記項目被選用。請對照原檔後按「✓ 已檢查」，或取消選用。`) });
    }
    await update({ status: 'reviewed' });
    toast({ kind: 'ok', text: L('Content approved. You can now create activities from it.', '內容已批核，可以用來建立活動。') });
  };

  const visibleItems = showOnlyFlagged ? m.items.filter((i) => i.uncertain) : m.items;
  const usable = m.items.filter((i) => i.include && !i.uncertain);

  return (
    <div>
      <div className="page-head">
        <h1>
          {MATERIAL_KINDS[m.kind][2]} {m.title} {m.isSample && <SampleTag />}
        </h1>
        <div className="row gap-s">
          <button className="btn ghost" onClick={() => go('/materials')}>
            ← {L('Materials', '教材')}
          </button>
          <button
            className="btn danger small"
            onClick={async () => {
              if (!confirm(L('Delete this material and its uploaded files?', '刪除此教材及其上載檔案？'))) return;
              await db.files.bulkDelete([...m.fileIds, ...m.answerKey.fileIds]);
              await db.materials.delete(m.id);
              go('/materials');
            }}
          >
            {L('Delete', '刪除')}
          </button>
        </div>
      </div>

      <div className="card form">
        <div className="grid4">
          <Field label={L('Title', '標題')}>
            <input value={m.title} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label={L('Type', '類別')}>
            <select value={m.kind} onChange={(e) => update({ kind: e.target.value as MaterialKind })}>
              {Object.entries(MATERIAL_KINDS).map(([k, [en, zh, icon]]) => (
                <option key={k} value={k}>
                  {icon} {L(en, zh)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Subject', '科目')}>
            <select value={m.subjectId} onChange={(e) => update({ subjectId: e.target.value, topicId: undefined })}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Topic', '課題')}>
            <select value={m.topicId || ''} onChange={(e) => update({ topicId: e.target.value || undefined })}>
              <option value="">—</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Assessment date', '評估日期')}>
            <input type="date" value={m.assessmentDate || ''} onChange={(e) => update({ assessmentDate: e.target.value || undefined })} />
          </Field>
          <Field label={L('Notes / scope details', '備註／範圍詳情')}>
            <input value={m.notes} onChange={(e) => update({ notes: e.target.value })} />
          </Field>
        </div>
        {m.extraction.message && (
          <details className="alert" open={m.extraction.status !== 'done'}>
            <summary>
              {m.extraction.status === 'failed' ? '❌' : m.extraction.status === 'partial' ? '⚠️' : 'ℹ️'} {L('Reading report', '讀取報告')} {m.extraction.method && `(${m.extraction.method})`}
            </summary>
            <pre className="small">{m.extraction.message}</pre>
          </details>
        )}
      </div>

      <div className="review-grid">
        <section className="card">
          <div className="row gap-s wrap">
            <h3 className="grow">{L('Original', '原檔')}</h3>
            {allFiles.length > 1 &&
              allFiles.map((f, i) => (
                <button key={f} className={`btn small ${i === fileIdx ? 'on' : ''}`} onClick={() => setFileIdx(i)}>
                  {i + 1}
                </button>
              ))}
            <AddFilesButton material={m} />
          </div>
          {currentFile ? (
            <>
              <FileViewer fileId={currentFile} onCrop={addPicture} onPageChange={setPage} />
              <div className="row gap-s mt">
                <button className="btn small" disabled={!!ocrBusy} onClick={runOcr} title={L('Needs internet. Results are always flagged for checking.', '需要網絡。結果會標記待檢查。')}>
                  🔍 {L('Try OCR on this page (internet)', '文字辨識此頁（需網絡）')}
                </button>
                {ocrBusy && <span className="muted">{ocrBusy}</span>}
              </div>
            </>
          ) : (
            <p className="muted">{L('No file uploaded — content was typed or pasted.', '沒有上載檔案，內容為輸入或貼上。')}</p>
          )}
          {m.pastedText && (
            <details>
              <summary>{L('Pasted text', '貼上的文字')}</summary>
              <pre className="text-view">{m.pastedText}</pre>
            </details>
          )}
        </section>

        <section className="card">
          <div className="row gap-s wrap">
            <h3 className="grow">
              {L('Extracted content', '擷取內容')} ({m.items.length})
            </h3>
            <label className="check small">
              <input type="checkbox" checked={showOnlyFlagged} onChange={(e) => setShowOnlyFlagged(e.target.checked)} />
              {L('Only flagged', '只顯示標記')} ({m.items.filter((i) => i.uncertain).length})
            </label>
          </div>
          <p className="muted small">
            {L('Correct anything that was misread. ⚠ items could not be read reliably — check them against the original. Nothing unreadable is filled in for you.', '請修正讀錯的內容。⚠ 項目未能可靠讀取，請對照原檔。程式不會自行填補讀不到的內容。')}
          </p>
          <ul className="items-edit">
            {visibleItems.map((it) => (
              <ItemRow
                key={it.id}
                it={it}
                selected={selected.has(it.id)}
                onSelect={(v) => {
                  const s = new Set(selected);
                  if (v) s.add(it.id);
                  else s.delete(it.id);
                  setSelected(s);
                }}
                onChange={(p) => setItem(it.id, p)}
                onDelete={() => setItems(m.items.filter((x) => x.id !== it.id))}
              />
            ))}
          </ul>
          <AddItems material={m} onAdd={(its) => setItems([...m.items, ...its])} />
          <hr />
          <div className="row gap-s wrap">
            {m.status === 'reviewed' ? (
              <span className="tag ok">✓ {L('Approved for use', '已批核使用')}</span>
            ) : (
              <button className="btn primary" onClick={approve}>
                ✓ {L('Approve content', '批核內容')}
              </button>
            )}
            {m.status === 'reviewed' && (
              <button className="btn ghost small" onClick={() => update({ status: 'draft' })}>
                {L('Back to draft', '改回草稿')}
              </button>
            )}
            <span className="grow" />
            <button
              className="btn small ghost"
              onClick={() => setSelected(new Set(usable.filter((i) => !i.usedInActivity && i.kind !== 'heading').slice(0, 6).map((i) => i.id)))}
            >
              {L('Pick a small portion for today', '選取今天的一小部分')}
            </button>
            <button
              className="btn primary"
              disabled={m.status !== 'reviewed' || selected.size === 0}
              title={m.status !== 'reviewed' ? L('Approve the content first', '請先批核內容') : ''}
              onClick={() => setMakeActivity(true)}
            >
              🎯 {L('Create activity from selected', '用所選項目建立活動')} ({selected.size})
            </button>
          </div>
        </section>
      </div>

      <AnswerKeyPanel m={m} update={update} />

      {makeActivity && (
        <MakeActivity
          m={m}
          items={m.items.filter((i) => selected.has(i.id) && i.include && !i.uncertain)}
          skipped={m.items.filter((i) => selected.has(i.id) && (!i.include || i.uncertain)).length}
          onClose={() => setMakeActivity(false)}
        />
      )}
    </div>
  );
}

const KINDS: [ItemKind, string, string][] = [
  ['word', 'Word / phrase', '字詞'],
  ['question', 'Question', '題目'],
  ['text', 'Text', '文字'],
  ['heading', 'Heading', '標題'],
  ['diagram', 'Picture', '圖片'],
  ['answer', 'Answer', '答案'],
];

function ItemRow({ it, selected, onSelect, onChange, onDelete }: { it: ExtractedItem; selected: boolean; onSelect: (v: boolean) => void; onChange: (p: Partial<ExtractedItem>) => void; onDelete: () => void }) {
  const L = useL();
  return (
    <li className={`item-row ${it.uncertain ? 'flagged' : ''} ${!it.include ? 'excluded' : ''}`}>
      <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={L('Select', '選取')} disabled={it.kind === 'heading'} />
      <div className="grow col gap-s">
        <div className="row gap-s">
          <select value={it.kind} onChange={(e) => onChange({ kind: e.target.value as ItemKind })} className="small-select">
            {KINDS.map(([k, en, zh]) => (
              <option key={k} value={k}>
                {L(en, zh)}
              </option>
            ))}
          </select>
          <select value={it.lang} onChange={(e) => onChange({ lang: e.target.value as Lang })} className="small-select" aria-label="language">
            <option value="zh">中</option>
            <option value="en">EN</option>
            <option value="none">—</option>
          </select>
          {it.page && <span className="tag">p.{it.page}</span>}
          {it.usedInActivity && <span className="tag">{L('used', '已使用')}</span>}
          <span className="grow" />
          {it.text && it.lang !== 'none' && <SpeakButton text={it.text} lang={it.lang} />}
          <label className="check small">
            <input type="checkbox" checked={it.include} onChange={(e) => onChange({ include: e.target.checked })} />
            {L('use', '使用')}
          </label>
          <button className="icon-btn" onClick={onDelete} aria-label={L('Delete', '刪除')}>
            🗑
          </button>
        </div>
        {it.imageFileId && <ItemPicture fileId={it.imageFileId} />}
        <textarea
          rows={Math.min(5, Math.max(1, it.text.split('\n').length))}
          value={it.text}
          placeholder={it.kind === 'diagram' ? L('Caption / name', '名稱') : L('Type the content', '輸入內容')}
          onChange={(e) => onChange({ text: e.target.value, lang: it.lang === 'none' ? detectLang(e.target.value) : it.lang })}
          className={it.lang === 'zh' ? 'zh' : ''}
        />
        {(it.kind === 'word' || it.kind === 'question' || it.kind === 'answer') && (
          <input
            value={it.answer || ''}
            placeholder={it.kind === 'word' ? L('Meaning / translation (optional)', '意思／翻譯（可選）') : L('Answer from the answer key (optional)', '答案（可選）')}
            onChange={(e) => onChange({ answer: e.target.value })}
          />
        )}
        {it.uncertain && (
          <div className="row gap-s flag-note">
            <span>⚠ {it.uncertainReason || L('Uncertain', '不確定')}</span>
            <button className="btn small" onClick={() => onChange({ uncertain: false, include: true })}>
              ✓ {L('Checked', '已檢查')}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ItemPicture({ fileId }: { fileId: string }) {
  const f = useLiveQuery(() => db.files.get(fileId), [fileId]);
  const url = useMemo(() => (f ? URL.createObjectURL(f.blob) : ''), [f]);
  return url ? <img src={url} className="item-pic" alt="" /> : null;
}

function AddItems({ material, onAdd }: { material: Material; onAdd: (its: ExtractedItem[]) => void }) {
  const L = useL();
  const [text, setText] = useState('');
  return (
    <details className="mt">
      <summary>+ {L('Add or paste more items', '新增或貼上更多項目')}</summary>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={L('One per line', '每行一項')} />
      <button
        className="btn small mt"
        onClick={() => {
          onAdd(itemsFromPaste(text, material.kind));
          setText('');
        }}
      >
        {L('Add', '加入')}
      </button>
    </details>
  );
}

function AddFilesButton({ material }: { material: Material }) {
  const L = useL();
  const toast = useToast();
  return (
    <label className="btn small ghost">
      + {L('Add file', '加入檔案')}
      <input
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={async (e) => {
          const files = [...(e.target.files || [])];
          const res = await ingestFiles(files, material.kind);
          await db.materials.update(material.id, { fileIds: [...material.fileIds, ...res.fileIds], items: [...material.items, ...res.items], status: 'draft', updatedAt: Date.now() });
          res.problems.forEach((p) => toast({ kind: p.kept ? 'info' : 'error', text: `${p.name}: ${p.message}` }));
          e.target.value = '';
        }}
      />
    </label>
  );
}

// ---------- Answer key ----------

function AnswerKeyPanel({ m, update }: { m: Material; update: (p: Partial<Material>) => void }) {
  const L = useL();
  const toast = useToast();
  const keyMaterials = useLiveQuery(() => db.materials.where('studentId').equals(m.studentId).filter((x) => x.kind === 'answerKey' && x.id !== m.id).toArray(), [m.studentId]) ?? [];
  const ak = m.answerKey;
  const setAnswers = (answers: TypedAnswer[]) => update({ answerKey: { ...ak, answers } });
  const questions = m.items.filter((i) => i.kind === 'question' && i.include);
  if (m.kind === 'answerKey' || m.kind === 'picture') return null;
  return (
    <section className="card mt">
      <h3>🔑 {L('Answer key & marking notes', '答案及評分備註')}</h3>
      <p className="muted small">
        {L('Answers you type or approve are used for automatic marking. Draft answers are clearly labelled and never used for marking until you approve them.', '你輸入或批核的答案會用於自動批改。草稿答案會清楚標示，批核前不會用於批改。')}
      </p>
      <div className="row gap-s wrap">
        <label className="btn small">
          📎 {L('Upload answer key file', '上載答案檔案')}
          <input
            type="file"
            accept={ACCEPT}
            hidden
            multiple
            onChange={async (e) => {
              const files = [...(e.target.files || [])];
              const res = await ingestFiles(files, 'answerKey');
              const parsed = answersFromKeyItems(res.items).map((a) => ({ ...a, status: 'draft' as const }));
              // Never overwrite answers the tutor already has; report differences instead.
              const fresh = parsed.filter((p) => !ak.answers.some((x) => x.ref === p.ref));
              const differ = parsed.filter((p) => ak.answers.some((x) => x.ref === p.ref && x.answer.trim() !== p.answer.trim())).map((p) => p.ref);
              update({ answerKey: { ...ak, fileIds: [...ak.fileIds, ...res.fileIds], answers: [...ak.answers, ...fresh] } });
              res.problems.filter((p) => !p.kept).forEach((p) => toast({ kind: 'error', text: `${p.name}: ${p.message}` }));
              toast({
                kind: differ.length ? 'error' : 'info',
                text:
                  (fresh.length ? L(`${fresh.length} new answers read from the file — check and approve them.`, `從檔案讀到 ${fresh.length} 個新答案，請檢查並批核。`) : L('Answer key file attached.', '已附上答案檔案。')) +
                  (differ.length ? L(` The file disagrees with your answers for Q${differ.join(', Q')} — please check.`, ` 檔案與你的答案不同：第 ${differ.join('、')} 題，請檢查。`) : ''),
              });
              e.target.value = '';
            }}
          />
        </label>
        {keyMaterials.length > 0 && (
          <select
            onChange={async (e) => {
              const km = keyMaterials.find((k) => k.id === e.target.value);
              if (!km) return;
              const parsed = answersFromKeyItems(km.items).map((a) => ({ ...a, status: km.status === 'reviewed' ? ('approved' as const) : ('draft' as const) }));
              await update({ answerKey: { ...ak, fileIds: [...new Set([...ak.fileIds, ...km.fileIds])], answers: [...ak.answers, ...parsed] } });
              e.target.value = '';
            }}
            defaultValue=""
          >
            <option value="">{L('Link an uploaded answer key…', '連結已上載的答案…')}</option>
            {keyMaterials.map((k) => (
              <option key={k.id} value={k.id}>
                {k.title}
              </option>
            ))}
          </select>
        )}
        <button className="btn small ghost" onClick={() => setAnswers([...ak.answers, { ref: String(ak.answers.length + 1), answer: '', alternatives: [], status: 'approved' }])}>
          + {L('Type an answer', '輸入答案')}
        </button>
        {questions.length > 0 && (
          <button
            className="btn small ghost"
            title={L('Calculates answers only for plain arithmetic questions. Results are drafts for you to check.', '只為純計算題計算答案，結果為草稿，需要檢查。')}
            onClick={() => {
              const add: TypedAnswer[] = [];
              for (const q of questions) {
                const ref = q.text.match(/^\s*\(?（?(\d{1,3})/)?.[1];
                if (!ref || ak.answers.some((a) => a.ref === ref)) continue;
                const d = draftAnswerFor(q.text.replace(/^\s*\(?（?\d{1,3}[.)）、．]?\s*/, ''));
                if (d) add.push({ ref, answer: d, alternatives: [], status: 'draft', explanation: L('Calculated draft', '計算草稿') });
              }
              setAnswers([...ak.answers, ...add]);
              toast({ kind: 'info', text: add.length ? L(`${add.length} draft answers calculated. Review them before use.`, `已計算 ${add.length} 個草稿答案，使用前請檢查。`) : L('No plain arithmetic questions found — type the answers yourself.', '找不到純計算題，請自行輸入答案。') });
            }}
          >
            🧮 {L('Draft maths answers', '計算數學草稿答案')}
          </button>
        )}
      </div>
      {ak.fileIds.length > 0 && (
        <div className="row gap-s wrap mt">
          {ak.fileIds.map((f) => (
            <KeyFileLink key={f} fileId={f} />
          ))}
        </div>
      )}
      {ak.answers.length > 0 && (
        <table className="answers mt">
          <thead>
            <tr>
              <th>{L('Q', '題')}</th>
              <th>{L('Answer', '答案')}</th>
              <th>{L('Also accept', '其他可接受答案')}</th>
              <th>{L('Explanation / marking note', '解釋／評分備註')}</th>
              <th>{L('Status', '狀態')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ak.answers.map((a, i) => {
              const set = (p: Partial<TypedAnswer>) => setAnswers(ak.answers.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <tr key={i} className={a.status === 'draft' ? 'draft-row' : ''}>
                  <td>
                    <input className="xs" value={a.ref} onChange={(e) => set({ ref: e.target.value })} />
                  </td>
                  <td>
                    <input value={a.answer} onChange={(e) => set({ answer: e.target.value })} />
                  </td>
                  <td>
                    <input value={a.alternatives.join(' | ')} placeholder="a | b" onChange={(e) => set({ alternatives: e.target.value.split('|').map((s) => s.trim()).filter(Boolean) })} />
                  </td>
                  <td>
                    <input value={a.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />
                  </td>
                  <td>
                    {a.status === 'approved' ? (
                      <span className="tag ok">✓ {L('Approved', '已批核')}</span>
                    ) : (
                      <button className="btn small" onClick={() => set({ status: 'approved' })}>
                        ⚠ {L('Draft – approve', '草稿－批核')}
                      </button>
                    )}
                  </td>
                  <td>
                    <button className="icon-btn" onClick={() => setAnswers(ak.answers.filter((_, j) => j !== i))}>
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Field label={L('Marking notes (private)', '評分備註（私人）')}>
        <textarea rows={2} value={ak.notes} onChange={(e) => update({ answerKey: { ...ak, notes: e.target.value } })} />
      </Field>
    </section>
  );
}

function KeyFileLink({ fileId }: { fileId: string }) {
  const f = useLiveQuery(() => db.files.get(fileId), [fileId]);
  const [open, setOpen] = useState(false);
  if (!f) return null;
  return (
    <>
      <button className="btn small ghost" onClick={() => setOpen(true)}>
        🔑 {f.name}
      </button>
      {open && (
        <Modal title={f.name} onClose={() => setOpen(false)} wide>
          <FileViewer fileId={fileId} />
        </Modal>
      )}
    </>
  );
}

// ---------- Create activity from approved selection ----------

function MakeActivity({ m, items, skipped, onClose }: { m: Material; items: ExtractedItem[]; skipped: number; onClose: () => void }) {
  const L = useL();
  const words = items.filter((i) => i.kind === 'word' || i.kind === 'diagram');
  const questions = items.filter((i) => i.kind === 'question' || i.kind === 'text');
  const isVocab = words.length >= questions.length;
  const suggested: TemplateId[] = isVocab
    ? ['vocab-journey', 'flashcards', 'listen-choose', 'picture-match', 'dictation', 'word-in-sentence', 'phonics']
    : ['short-answer', 'multiple-choice', 'math', 'gap-fill', 'oral-task'];
  const [template, setTemplate] = useState<TemplateId>(suggested[0]);
  const [title, setTitle] = useState(m.title);
  const create = async () => {
    const info = templateInfo(template);
    const a = newActivity(m.studentId, m.subjectId, template, {
      title: `${title} · ${L(info.en, info.zh)}`,
      topicId: m.topicId,
      sourceMaterialId: m.id,
      mode: m.kind === 'dictation' || m.kind === 'test' || m.kind === 'exam' ? 'revision' : 'pre',
    });
    const answers = m.answerKey.answers.map((x) => ({ ...x }));
    a.items = isVocab || ['flashcards', 'vocab-journey', 'listen-choose', 'picture-match', 'dictation', 'word-in-sentence', 'phonics'].includes(template) ? itemsFromWords(template, items) : itemsFromQuestions(template, items, answers);
    if (template === 'word-in-sentence') a.items.forEach((it) => (it.answerStatus = it.example ? 'approved' : 'none'));
    await db.activities.add(a);
    await db.materials.update(m.id, { items: m.items.map((i) => (items.some((x) => x.id === i.id) ? { ...i, usedInActivity: true } : i)), updatedAt: Date.now() });
    onClose();
    go(`/activity/${a.id}`);
  };
  return (
    <Modal title={L('Create an activity', '建立活動')} onClose={onClose} wide>
      <p>
        {L(`${items.length} approved items selected.`, `已選取 ${items.length} 個已批核項目。`)}
        {skipped > 0 && <span className="warn-text"> {L(`${skipped} unchecked/excluded item(s) were left out.`, `${skipped} 個未檢查／未選用項目已略過。`)}</span>}
      </p>
      <Field label={L('Title', '標題')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="template-grid">
        {TEMPLATES.filter((t) => suggested.includes(t.id)).map((t) => (
          <button key={t.id} className={`template-card ${template === t.id ? 'on' : ''}`} onClick={() => setTemplate(t.id)}>
            <span className="big-icon">{t.icon}</span>
            <strong>{L(t.en, t.zh)}</strong>
            <span className="small muted">{L(t.descEn, t.descZh)}</span>
          </button>
        ))}
      </div>
      <p className="muted small">{L('You can edit every question, choice, hint and answer on the next screen.', '下一頁可以修改每條題目、選項、提示和答案。')}</p>
      <div className="row end gap-s">
        <button className="btn ghost" onClick={onClose}>
          {L('Cancel', '取消')}
        </button>
        <button className="btn primary" onClick={create} disabled={!items.length}>
          {L('Create activity', '建立活動')}
        </button>
      </div>
    </Modal>
  );
}
