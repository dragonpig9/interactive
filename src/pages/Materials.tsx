import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { MATERIAL_KINDS, useL, useUiLang } from '../i18n';
import { Empty, Field, Modal, SampleTag, daysUntil, fmtDate, go, useToast } from '../ui';
import { NeedStudent, useStudent } from '../App';
import type { Material, MaterialKind } from '../types';
import { ACCEPT, blankMaterial, ingestFiles, itemsFromPaste, saveMaterial } from '../lib/materials';

export default function Materials() {
  const L = useL();
  const { lang } = useUiLang();
  const { student, subjects, allSubjects } = useStudent();
  const [subjectFilter, setSubjectFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const mats = useLiveQuery(() => (student ? db.materials.where('studentId').equals(student.id).reverse().sortBy('updatedAt') : []), [student?.id]) ?? [];
  if (!student) return <NeedStudent />;
  const shown = mats.filter((m) => (!subjectFilter || m.subjectId === subjectFilter) && (!kindFilter || m.kind === kindFilter));
  const subj = (id: string) => allSubjects.find((s) => s.id === id);
  return (
    <div>
      <div className="page-head">
        <h1>
          {L('Materials', '教材')} · {student.name}
        </h1>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + {L('Upload or paste material', '上載或貼上教材')}
        </button>
      </div>
      <p className="muted">
        {L('Upload dictation scopes, test scopes, worksheets, notes, vocabulary lists, answer keys and pictures. Everything is reviewed before use.', '上載默書範圍、測驗範圍、工作紙、筆記、詞語表、答案和圖片。所有內容使用前都會先檢查。')}
      </p>
      <div className="row gap-s wrap filters">
        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label={L('Subject', '科目')}>
          <option value="">{L('All subjects', '所有科目')}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.name}
            </option>
          ))}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} aria-label={L('Type', '類別')}>
          <option value="">{L('All types', '所有類別')}</option>
          {Object.entries(MATERIAL_KINDS).map(([k, [en, zh, icon]]) => (
            <option key={k} value={k}>
              {icon} {L(en, zh)}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 && <Empty icon="📚">{L('No materials yet. Upload a school worksheet or paste a dictation list.', '尚未有教材。上載工作紙或貼上默書詞語。')}</Empty>}
      <div className="list">
        {shown.map((m) => {
          const s = subj(m.subjectId);
          const k = MATERIAL_KINDS[m.kind];
          const flagged = m.items.filter((i) => i.uncertain).length;
          return (
            <a key={m.id} className="list-row" href={`#/material/${m.id}`}>
              <span className="kind-icon" style={{ background: s?.color }}>
                {k[2]}
              </span>
              <span className="grow">
                <strong>{m.title || L('(untitled)', '（未命名）')}</strong> {m.isSample && <SampleTag />}
                <span className="muted small block">
                  {s?.icon} {s?.name} · {L(k[0], k[1])} · {m.items.length} {L('items', '項')} · {m.fileIds.length} {L('files', '檔案')}
                </span>
              </span>
              {m.assessmentDate && (
                <span className={`tag ${daysUntil(m.assessmentDate) <= 3 && daysUntil(m.assessmentDate) >= 0 ? 'warn' : ''}`}>📅 {fmtDate(m.assessmentDate, lang)}</span>
              )}
              {flagged > 0 && m.status !== 'reviewed' && <span className="tag warn">⚠ {flagged}</span>}
              <span className={`tag ${m.status === 'reviewed' ? 'ok' : 'todo'}`}>{m.status === 'reviewed' ? L('Approved', '已批核') : L('Needs review', '待檢查')}</span>
            </a>
          );
        })}
      </div>
      {adding && <AddMaterial onClose={() => setAdding(false)} />}
    </div>
  );
}

export function AddMaterial({ onClose, defaultKind, onCreated }: { onClose: () => void; defaultKind?: MaterialKind; onCreated?: (m: Material) => void }) {
  const L = useL();
  const toast = useToast();
  const { student, subjects } = useStudent();
  const [kind, setKind] = useState<MaterialKind>(defaultKind ?? 'dictation');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const topics = useLiveQuery(() => db.topics.where('subjectId').equals(subjectId || '-').toArray(), [subjectId]) ?? [];
  if (!student) return null;
  const submit = async () => {
    if (!subjectId) return toast({ kind: 'error', text: L('Choose a subject.', '請選擇科目。') });
    if (!files.length && !text.trim()) return toast({ kind: 'error', text: L('Add a file or paste some text.', '請加入檔案或貼上文字。') });
    setBusy(L('Saving…', '儲存中…'));
    try {
      const m = blankMaterial(student.id, subjectId, kind);
      m.title = title.trim() || files[0]?.name.replace(/\.[^.]+$/, '') || MATERIAL_KINDS[kind][1];
      m.topicId = topicId || undefined;
      m.assessmentDate = date || undefined;
      m.notes = notes;
      m.pastedText = text;
      const res = await ingestFiles(files, kind, setBusy);
      m.fileIds = res.fileIds;
      m.items = [...itemsFromPaste(text, kind), ...res.items];
      const failed = res.problems.filter((p) => !p.kept);
      m.extraction = {
        status: failed.length ? (res.fileIds.length || text ? 'partial' : 'failed') : res.problems.some((p) => p.serious) ? 'partial' : 'done',
        method: [...new Set(res.methods)].join(', ') || (text ? 'Pasted text' : ''),
        message: res.problems.map((p) => `${p.name}: ${p.message}`).join('\n'),
      };
      if (!m.fileIds.length && !m.items.length) {
        setBusy('');
        return toast({ kind: 'error', text: L('Nothing could be saved: ', '無法儲存：') + failed.map((p) => `${p.name} – ${p.message}`).join('; ') });
      }
      await saveMaterial(m);
      if (failed.length) toast({ kind: 'error', text: failed.map((p) => `${p.name}: ${p.message}`).join('\n') });
      onClose();
      if (onCreated) onCreated(m);
      else go(`/material/${m.id}`);
    } catch (e) {
      toast({ kind: 'error', text: (e as Error).message });
      setBusy('');
    }
  };
  return (
    <Modal title={L('Add material', '新增教材')} onClose={onClose} wide>
      <div className="form">
        <div className="chips">
          {Object.entries(MATERIAL_KINDS).map(([k, [en, zh, icon]]) => (
            <button key={k} type="button" className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k as MaterialKind)}>
              {icon} {L(en, zh)}
            </button>
          ))}
        </div>
        <div className="grid3">
          <Field label={L('Subject', '科目')}>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} name="subject">
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Topic (optional)', '課題（可選）')}>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">—</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('Assessment date (optional)', '評估日期（可選）')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} name="date" />
          </Field>
        </div>
        <Field label={L('Title', '標題')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L('e.g. Dictation 3 / 默書三', '例如：默書三')} name="title" />
        </Field>
        <Field label={L('Files (PDF, JPG, PNG, TXT, DOCX)', '檔案（PDF、JPG、PNG、TXT、DOCX）')} hint={L('Originals are kept and can be opened in lessons.', '原檔會保留，可在課堂中開啟。')}>
          <input type="file" multiple accept={ACCEPT} onChange={(e) => setFiles([...(e.target.files || [])])} name="files" />
        </Field>
        <Field
          label={L('Or paste / type content', '或貼上／輸入內容')}
          hint={
            kind === 'vocab' || kind === 'dictation'
              ? L('One word or phrase per line, or separate with 、 or commas. Your word boundaries are kept. "apple - 蘋果" adds a meaning.', '每行一個詞語，或以「、」或逗號分隔。會保留你的分詞。「apple - 蘋果」可加入意思。')
              : kind === 'answerKey'
                ? L('One answer per line: "1. B", "2) 25".', '每行一個答案：「1. B」、「2) 25」。')
                : L('Numbered questions ("1.", "(2)", "一、") become separate items.', '有編號的題目（「1.」、「(2)」、「一、」）會分成獨立項目。')
          }
        >
          <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} name="paste" />
        </Field>
        <Field label={L('Notes', '備註')}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="row end gap-s">
          {busy && <span className="muted">{busy}</span>}
          <button className="btn ghost" onClick={onClose}>
            {L('Cancel', '取消')}
          </button>
          <button className="btn primary" disabled={!!busy} onClick={submit}>
            {L('Save & review content', '儲存並檢查內容')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
