import { useEffect, useMemo, useState } from 'react';
import { useL } from '../i18n';
import { FileImage, SpeakButton, TapText, useSpeak } from '../ui';
import { shuffle } from '../lib/templates';
import type { Activity, ActivityItem } from '../types';

export type Stage = 'learn' | 'choose' | 'recall' | 'use';

export interface RProps {
  item: ActivityItem;
  activity: Activity;
  stage?: Stage;
  group?: ActivityItem[];
  answered: boolean;
  lastCorrect: boolean | null;
  submit: (resp: unknown, display: string) => void;
  support: () => void; // student used read-aloud support
  eliminated: Set<string>;
  autoPlay: boolean;
}

function Picture({ item, size = 'lg' }: { item: ActivityItem; size?: 'lg' | 'md' }) {
  if (item.imageFileId) return <FileImage fileId={item.imageFileId} className={`pic pic-${size}`} />;
  if (item.emoji) return <div className={`emoji-pic emoji-${size}`}>{item.emoji}</div>;
  return null;
}

/** Large tappable choice buttons. */
function Choices({ choices, lang, onPick, answered, picked, correct, eliminated, support, speakable = true }: { choices: string[]; lang: ActivityItem['lang']; onPick: (c: string) => void; answered: boolean; picked?: string; correct?: string; eliminated: Set<string>; support: () => void; speakable?: boolean }) {
  return (
    <div className={`choices n${choices.length}`}>
      {choices.map((c) => (
        <div key={c} className={`choice-wrap ${eliminated.has(c) ? 'gone' : ''}`}>
          <button
            className={`choice ${picked === c ? 'picked' : ''} ${answered && c === correct ? 'right' : ''} ${answered && picked === c && c !== correct ? 'wrong' : ''} ${lang === 'zh' ? 'zh' : ''}`}
            disabled={eliminated.has(c)}
            onClick={() => onPick(c)}
          >
            {c}
          </button>
          {speakable && <SpeakButton text={c} lang={lang} onUsed={support} />}
        </div>
      ))}
    </div>
  );
}

function useAutoPlay(text: string, lang: ActivityItem['lang'], audioFileId: string | undefined, on: boolean, key: string) {
  const say = useSpeak();
  useEffect(() => {
    if (on && (text || audioFileId)) {
      const t = setTimeout(() => say(text, lang, audioFileId), 350);
      return () => clearTimeout(t);
    }
  }, [key]); // eslint-disable-line
}

// ---------- language ----------

export function Flashcard({ item, autoPlay, showMeaning: forceMeaning }: RProps & { showMeaning?: boolean }) {
  const L = useL();
  const [flip, setFlip] = useState(false);
  useEffect(() => setFlip(false), [item.id]);
  useAutoPlay(item.text || item.prompt, item.lang, item.audioFileId, autoPlay, item.id);
  const meaning = flip || forceMeaning;
  return (
    <div className="flashcard">
      <Picture item={item} />
      <div className={`flash-word ${item.lang === 'zh' ? 'zh' : ''}`}>{item.text || item.prompt}</div>
      <SpeakButton big text={item.text || item.prompt} lang={item.lang} audioFileId={item.audioFileId} />
      {(item.meaning || item.example) &&
        (meaning ? (
          <div className="flash-meaning">
            {item.meaning && <div className="meaning">{item.meaning}</div>}
            {item.example && (
              <div className="example">
                <TapText text={item.example} lang={item.lang} /> <SpeakButton text={item.example} lang={item.lang} />
              </div>
            )}
          </div>
        ) : (
          <button className="btn" onClick={() => setFlip(true)}>
            💡 {L('What does it mean?', '甚麼意思？')}
          </button>
        ))}
    </div>
  );
}

export function ListenChoose(p: RProps) {
  const { item, answered, submit, eliminated, support, autoPlay } = p;
  const L = useL();
  const [picked, setPicked] = useState<string>();
  useEffect(() => setPicked(undefined), [item.id]);
  const choices = useMemo(() => item.choices?.length ? item.choices : [item.text || ''], [item]);
  useAutoPlay(item.text || item.prompt, item.lang, item.audioFileId, autoPlay, item.id);
  return (
    <div className="task">
      <div className="listen-zone">
        <SpeakButton big text={item.text || item.prompt} lang={item.lang} audioFileId={item.audioFileId} label={L('Listen again', '再聽一次')} />
      </div>
      <Choices
        choices={choices}
        lang={item.lang}
        answered={answered}
        picked={picked}
        correct={item.answer}
        eliminated={eliminated}
        support={support}
        speakable={false}
        onPick={(c) => {
          setPicked(c);
          submit(c, c);
        }}
      />
    </div>
  );
}

export function PictureMatch(p: RProps) {
  const { item, answered, submit, eliminated, support } = p;
  const [picked, setPicked] = useState<string>();
  useEffect(() => setPicked(undefined), [item.id]);
  return (
    <div className="task">
      <Picture item={item} />
      {item.prompt && item.prompt !== item.text && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={support} /></div>}
      <Choices
        choices={item.choices || []}
        lang={item.lang}
        answered={answered}
        picked={picked}
        correct={item.answer}
        eliminated={eliminated}
        support={support}
        onPick={(c) => {
          setPicked(c);
          submit(c, c);
        }}
      />
    </div>
  );
}

export function WordInSentence(p: RProps) {
  const { item, answered, submit, support, autoPlay } = p;
  const L = useL();
  const [picked, setPicked] = useState<number>();
  useEffect(() => setPicked(undefined), [item.id]);
  const tokens = item.tokens?.length ? item.tokens : (item.example || '').split('/').filter(Boolean);
  useAutoPlay(item.text || '', item.lang, item.audioFileId, autoPlay, item.id);
  if (!tokens.length) return <div className="alert">{L('This item needs an example sentence with / between words.', '此項目需要例句，並用 / 分隔詞語。')}</div>;
  return (
    <div className="task">
      <div className="listen-zone">
        <span className="muted">{L('Find', '找出')}:</span> <SpeakButton big text={item.text || ''} lang={item.lang} audioFileId={item.audioFileId} />
      </div>
      <div className={`sentence-tokens ${item.lang === 'zh' ? 'zh' : ''}`}>
        {tokens.map((t, i) => (
          <button
            key={i}
            className={`token ${picked === i ? 'picked' : ''} ${answered && t.trim() === item.answer ? 'right' : ''} ${answered && picked === i && t.trim() !== item.answer ? 'wrong' : ''}`}
            onClick={() => {
              setPicked(i);
              submit(t.trim(), t.trim());
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <SpeakButton text={tokens.join('')} lang={item.lang} onUsed={support} label={L('Read the sentence', '讀句子')} />
    </div>
  );
}

export function Phonics(p: RProps) {
  const { item, answered, submit, eliminated, support } = p;
  const L = useL();
  const say = useSpeak();
  const [picked, setPicked] = useState<string>();
  useEffect(() => setPicked(undefined), [item.id]);
  const segs = item.segments?.length ? item.segments : (item.text || '').split('');
  return (
    <div className="task">
      <Picture item={item} size="md" />
      <div className="segments">
        {segs.map((s, i) => (
          <button key={i} className="segment" onClick={() => say(s, 'en')}>
            {s}
          </button>
        ))}
        <button className="btn" onClick={() => { support(); say(item.text || '', 'en', item.audioFileId); }}>
          🔗 {L('Blend', '拼讀')}
        </button>
      </div>
      <Choices choices={item.choices || []} lang="en" answered={answered} picked={picked} correct={item.answer} eliminated={eliminated} support={support} speakable={false} onPick={(c) => { setPicked(c); submit(c, c); }} />
    </div>
  );
}

export function Dictation(p: RProps) {
  const { item, answered, submit, autoPlay } = p;
  const L = useL();
  const [v, setV] = useState('');
  useEffect(() => setV(''), [item.id]);
  useAutoPlay(item.text || item.prompt, item.lang, item.audioFileId, autoPlay, item.id);
  return (
    <div className="task">
      <div className="listen-zone">
        <SpeakButton big text={item.text || item.prompt} lang={item.lang} audioFileId={item.audioFileId} label={L('Listen', '聽')} />
      </div>
      <input className={`big-input ${item.lang === 'zh' ? 'zh' : ''}`} value={v} onChange={(e) => setV(e.target.value)} disabled={answered} autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && v.trim() && submit(v, v)} aria-label={L('Your answer', '你的答案')} />
      <div className="row gap-s center">
        <button className="btn primary big" disabled={answered || !v.trim()} onClick={() => submit(v, v)}>
          ✔ {L('Check', '檢查')}
        </button>
        <button className="btn big" disabled={answered} onClick={() => submit({ paper: true }, L('(written on paper)', '（寫在紙上）'))}>
          📄 {L('I wrote it on paper', '我寫在紙上')}
        </button>
      </div>
    </div>
  );
}

// ---------- any subject ----------

export function MultipleChoice(p: RProps) {
  const { item, answered, submit, eliminated, support, activity } = p;
  const [picked, setPicked] = useState<string>();
  useEffect(() => setPicked(undefined), [item.id]);
  return (
    <div className="task">
      <Picture item={item} size="md" />
      <div className="prompt">
        <TapText text={item.prompt} lang={item.lang} onUsed={support} /> {activity.support.audio && <SpeakButton text={item.prompt} lang={item.lang} audioFileId={item.audioFileId} onUsed={support} />}
      </div>
      <Choices choices={(item.choices || []).filter(Boolean)} lang={item.lang} answered={answered} picked={picked} correct={item.answerStatus === 'approved' ? item.answer : undefined} eliminated={eliminated} support={support} speakable={activity.support.audio} onPick={(c) => { setPicked(c); submit(c, c); }} />
    </div>
  );
}

export function GapFill(p: RProps) {
  const { item, answered, submit, support, activity, eliminated } = p;
  const L = useL();
  const [v, setV] = useState('');
  useEffect(() => setV(''), [item.id]);
  const parts = item.prompt.split(/_{2,}|＿+|\(\s*\)|（\s*）/);
  const bank = (item.choices || []).filter(Boolean);
  return (
    <div className="task">
      <Picture item={item} size="md" />
      <div className={`prompt gap-sentence ${item.lang === 'zh' ? 'zh' : ''}`}>
        {parts.map((pt, i) => (
          <span key={i}>
            <TapText text={pt} lang={item.lang} onUsed={support} />
            {i < parts.length - 1 && <span className={`gap ${v ? 'filled' : ''}`}>{v || '    '}</span>}
          </span>
        ))}
        {activity.support.audio && <SpeakButton text={item.prompt} lang={item.lang} audioFileId={item.audioFileId} onUsed={support} />}
      </div>
      {bank.length ? (
        <div className="choices">
          {bank.map((c) => (
            <div key={c} className={`choice-wrap ${eliminated.has(c) ? 'gone' : ''}`}>
              <button className={`choice ${v === c ? 'picked' : ''} ${item.lang === 'zh' ? 'zh' : ''}`} disabled={answered} onClick={() => { setV(c); submit(c, c); }}>
                {c}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <input className={`big-input ${item.lang === 'zh' ? 'zh' : ''}`} value={v} disabled={answered} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && submit(v, v)} aria-label={L('Your answer', '你的答案')} />
          <button className="btn primary big" disabled={answered || !v.trim()} onClick={() => submit(v, v)}>
            ✔ {L('Check', '檢查')}
          </button>
        </>
      )}
    </div>
  );
}

/** Ordering by tapping (and dragging) cards. Used for sentence ordering and sequencing. */
export function OrderTask(p: RProps) {
  const { item, answered, submit, support, activity } = p;
  const L = useL();
  const tokens = item.tokens || [];
  const shuffled = useMemo(() => {
    let s = shuffle(tokens.map((t, i) => ({ t, i })));
    if (s.every((x, i) => x.i === i) && tokens.length > 1) s = [...s.slice(1), s[0]];
    return s;
  }, [item.id]); // eslint-disable-line
  const [placed, setPlaced] = useState<number[]>([]); // indexes into shuffled
  const [drag, setDrag] = useState<number>();
  useEffect(() => setPlaced([]), [item.id]);
  const vertical = activity.template === 'sequencing';
  const done = placed.length === tokens.length;
  return (
    <div className="task">
      <Picture item={item} size="md" />
      {item.prompt && (
        <div className="prompt">
          <TapText text={item.prompt} lang={item.lang} onUsed={support} />
        </div>
      )}
      <div className={`order-target ${vertical ? 'vertical' : ''} ${item.lang === 'zh' ? 'zh' : ''}`}>
        {placed.map((si, pos) => (
          <button
            key={si}
            draggable={!answered}
            onDragStart={() => setDrag(pos)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag === undefined) return;
              const n = [...placed];
              const [x] = n.splice(drag, 1);
              n.splice(pos, 0, x);
              setPlaced(n);
              setDrag(undefined);
            }}
            className="token placed"
            disabled={answered}
            onClick={() => setPlaced(placed.filter((x) => x !== si))}
          >
            {vertical && <span className="num">{pos + 1}</span>}
            {shuffled[si].t}
          </button>
        ))}
        {!placed.length && <span className="muted">{L('Tap the cards in order', '按次序點選卡片')}</span>}
      </div>
      <div className={`order-source ${vertical ? 'vertical' : ''} ${item.lang === 'zh' ? 'zh' : ''}`}>
        {shuffled.map((s, si) =>
          placed.includes(si) ? null : (
            <span key={si} className="row gap-s">
              <button className="token" onClick={() => setPlaced([...placed, si])} disabled={answered}>
                {s.t}
              </button>
              {activity.support.audio && <SpeakButton text={s.t} lang={item.lang} onUsed={support} />}
            </span>
          ),
        )}
      </div>
      <button className="btn primary big" disabled={!done || answered} onClick={() => submit(placed.map((si) => shuffled[si].t), placed.map((si) => shuffled[si].t).join(vertical ? ' → ' : ' '))}>
        ✔ {L('Check', '檢查')}
      </button>
    </div>
  );
}

export function Sorting(p: RProps) {
  const { item, answered, submit, support, activity } = p;
  const L = useL();
  const cards = useMemo(() => shuffle(item.sortItems || []), [item.id]); // eslint-disable-line
  const [where, setWhere] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string>();
  useEffect(() => setWhere({}), [item.id]);
  const cats = (item.categories || []).filter(Boolean);
  const place = (card: string, cat: string) => {
    setWhere({ ...where, [card]: cat });
    setSel(undefined);
  };
  return (
    <div className="task">
      {item.prompt && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={support} /></div>}
      <div className="sort-pool">
        {cards.filter((c) => !where[c.text]).map((c) => (
          <span key={c.text} className="row gap-s">
            <button draggable onDragStart={(e) => e.dataTransfer.setData('text', c.text)} className={`token ${sel === c.text ? 'picked' : ''}`} onClick={() => setSel(c.text)} disabled={answered}>
              {c.text}
            </button>
            {activity.support.audio && <SpeakButton text={c.text} lang={item.lang} onUsed={support} />}
          </span>
        ))}
      </div>
      <div className="bins">
        {cats.map((cat) => (
          <div key={cat} className={`bin ${sel ? 'ready' : ''}`} onClick={() => sel && place(sel, cat)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => place(e.dataTransfer.getData('text'), cat)}>
            <div className="bin-title">{cat}</div>
            {cards.filter((c) => where[c.text] === cat).map((c) => (
              <button key={c.text} className={`token small ${answered ? (c.category === cat ? 'right' : 'wrong') : ''}`} onClick={(e) => { e.stopPropagation(); if (!answered) { const w = { ...where }; delete w[c.text]; setWhere(w); } }}>
                {c.text}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button className="btn primary big" disabled={answered || Object.keys(where).length < cards.length} onClick={() => submit(where, Object.entries(where).map(([k, v]) => `${k}→${v}`).join(', '))}>
        ✔ {L('Check', '檢查')}
      </button>
    </div>
  );
}

const PAIR_COLORS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fbcfe8', '#c7d2fe', '#a7f3d0'];

export function Matching(p: RProps) {
  const { item, answered, submit, support, activity } = p;
  const L = useL();
  const pairs = (item.pairs || []).filter((x) => x.left && x.right);
  const rights = useMemo(() => shuffle(pairs.map((x) => x.right)), [item.id]); // eslint-disable-line
  const [sel, setSel] = useState<string>();
  const [m, setM] = useState<Record<string, string>>({});
  useEffect(() => setM({}), [item.id]);
  const colorOf = (left: string) => PAIR_COLORS[pairs.findIndex((x) => x.left === left) % PAIR_COLORS.length];
  return (
    <div className="task">
      <Picture item={item} size="md" />
      {item.prompt && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={support} /></div>}
      <div className="match-cols">
        <div className="col gap-s">
          {pairs.map((x) => (
            <span key={x.left} className="row gap-s">
              <button className={`token ${sel === x.left ? 'picked' : ''} ${answered ? (m[x.left] === x.right ? 'right' : 'wrong') : ''}`} style={m[x.left] ? { background: colorOf(x.left) } : undefined} onClick={() => !answered && setSel(x.left)}>
                {x.left}
              </button>
              {activity.support.audio && <SpeakButton text={x.left} lang={item.lang} onUsed={support} />}
            </span>
          ))}
        </div>
        <div className="col gap-s">
          {rights.map((r) => {
            const owner = Object.keys(m).find((k) => m[k] === r);
            return (
              <span key={r} className="row gap-s">
                <button
                  className="token"
                  style={owner ? { background: colorOf(owner) } : undefined}
                  disabled={answered}
                  onClick={() => {
                    if (!sel) return;
                    const n = { ...m };
                    Object.keys(n).forEach((k) => n[k] === r && delete n[k]);
                    n[sel] = r;
                    setM(n);
                    setSel(undefined);
                  }}
                >
                  {r}
                </button>
                {activity.support.audio && <SpeakButton text={r} lang={item.lang} onUsed={support} />}
              </span>
            );
          })}
        </div>
      </div>
      <button className="btn primary big" disabled={answered || Object.keys(m).length < pairs.length} onClick={() => submit(m, Object.entries(m).map(([a, b]) => `${a}–${b}`).join(', '))}>
        ✔ {L('Check', '檢查')}
      </button>
    </div>
  );
}

export function LabelDiagram(p: RProps) {
  const { item, answered, submit, support } = p;
  const L = useL();
  const markers = item.markers || [];
  const labels = useMemo(() => shuffle(markers.map((m) => m.label)), [item.id]); // eslint-disable-line
  const [r, setR] = useState<Record<number, string>>({});
  useEffect(() => setR({}), [item.id]);
  return (
    <div className="task">
      {item.prompt && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={support} /></div>}
      <div className="diagram">
        {item.imageFileId ? <FileImage fileId={item.imageFileId} className="diagram-img" /> : <div className="emoji-pic emoji-lg">{item.emoji}</div>}
        {markers.map((m, i) => (
          <span key={i} className="marker" style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="label-rows">
        {markers.map((m, i) => (
          <label key={i} className={`row gap-s ${answered ? (r[i] === m.label ? 'right-text' : 'wrong-text') : ''}`}>
            <span className="marker static">{i + 1}</span>
            <select value={r[i] || ''} disabled={answered} onChange={(e) => setR({ ...r, [i]: e.target.value })}>
              <option value="">—</option>
              {labels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button className="btn primary big" disabled={answered || Object.keys(r).length < markers.length} onClick={() => submit(r, Object.entries(r).map(([k, v]) => `${+k + 1}:${v}`).join(', '))}>
        ✔ {L('Check', '檢查')}
      </button>
    </div>
  );
}

// ---------- maths ----------

function NumberPad({ value, set, disabled }: { value: string; set: (v: string) => void; disabled: boolean }) {
  return (
    <div className="numpad">
      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '/'].map((k) => (
        <button key={k} disabled={disabled} onClick={() => set(value + k)}>
          {k}
        </button>
      ))}
      <button disabled={disabled} onClick={() => set(value.slice(0, -1))}>
        ⌫
      </button>
      <button disabled={disabled} onClick={() => set(value.startsWith('-') ? value.slice(1) : '-' + value)}>
        ±
      </button>
    </div>
  );
}

function NumericAnswer({ answered, submit, itemId, pad }: { answered: boolean; submit: RProps['submit']; itemId: string; pad: boolean }) {
  const L = useL();
  const [v, setV] = useState('');
  useEffect(() => setV(''), [itemId]);
  return (
    <div className="numeric">
      <input className="big-input num" inputMode="decimal" value={v} disabled={answered} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && submit(v, v)} aria-label={L('Your answer', '你的答案')} />
      {pad && <NumberPad value={v} set={setV} disabled={answered} />}
      <button className="btn primary big" disabled={answered || !v.trim()} onClick={() => submit(v, v)}>
        ✔ {L('Check', '檢查')}
      </button>
    </div>
  );
}

export function Counting(p: RProps) {
  const { item, answered, submit } = p;
  const n = item.count ?? 0;
  const g = item.groupSize && item.groupSize > 1 ? item.groupSize : 0;
  const groups: number[] = [];
  if (g) {
    for (let left = n; left > 0; left -= g) groups.push(Math.min(g, left));
  } else groups.push(n);
  return (
    <div className="task">
      {item.prompt && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={p.support} /> <SpeakButton text={item.prompt} lang={item.lang} onUsed={p.support} /></div>}
      <div className="count-area">
        {groups.map((k, gi) => (
          <div key={gi} className={g ? 'count-group' : 'count-flat'}>
            {Array.from({ length: k }).map((_, i) => (
              <CountThing key={i} emoji={item.emoji || '🍎'} />
            ))}
          </div>
        ))}
      </div>
      <NumericAnswer answered={answered} submit={submit} itemId={item.id} pad />
    </div>
  );
}

function CountThing({ emoji }: { emoji: string }) {
  const [tapped, setTapped] = useState(false);
  return (
    <button className={`count-thing ${tapped ? 'tapped' : ''}`} onClick={() => setTapped(!tapped)} aria-label="item">
      {emoji}
    </button>
  );
}

export function NumberLineTask(p: RProps) {
  const { item, answered, submit } = p;
  const nl = item.numberLine || { min: 0, max: 10, step: 1, target: 5 };
  const ticks: number[] = [];
  const count = Math.round((nl.max - nl.min) / nl.step);
  for (let i = 0; i <= count && i <= 40; i++) ticks.push(+(nl.min + i * nl.step).toFixed(6));
  const x = (v: number) => 30 + ((v - nl.min) / (nl.max - nl.min)) * 640;
  const labelEvery = Math.ceil(ticks.length / 11);
  return (
    <div className="task">
      {item.prompt && <div className="prompt"><TapText text={item.prompt} lang={item.lang} onUsed={p.support} /></div>}
      <svg viewBox="0 0 700 110" className="numberline" role="img">
        <line x1={20} y1={60} x2={680} y2={60} stroke="#334" strokeWidth={3} />
        {ticks.map((t, i) => (
          <g key={t}>
            <line x1={x(t)} y1={50} x2={x(t)} y2={70} stroke="#334" strokeWidth={2} />
            {(i % labelEvery === 0 || i === ticks.length - 1) && t !== nl.target && (
              <text x={x(t)} y={92} textAnchor="middle" fontSize={18} fill="#334">
                {t}
              </text>
            )}
          </g>
        ))}
        <text x={x(nl.target)} y={30} textAnchor="middle" fontSize={30}>
          ⬇️
        </text>
        {answered && (
          <text x={x(nl.target)} y={92} textAnchor="middle" fontSize={20} fill="#2a7a4b" fontWeight="bold">
            {nl.target}
          </text>
        )}
      </svg>
      <NumericAnswer answered={answered} submit={submit} itemId={item.id} pad />
    </div>
  );
}

export function MathTask(p: RProps) {
  const { item, answered, submit, support, activity } = p;
  return (
    <div className="task">
      <Picture item={item} size="md" />
      <div className="prompt math-prompt">
        <TapText text={item.prompt} lang={item.lang} onUsed={support} /> {activity.support.audio && <SpeakButton text={item.prompt} lang={item.lang} audioFileId={item.audioFileId} onUsed={support} />}
      </div>
      <NumericAnswer answered={answered} submit={submit} itemId={item.id} pad={!/[a-z]{3,}/i.test(item.answer || '')} />
    </div>
  );
}

export function ShortAnswer(p: RProps) {
  const { item, answered, submit, support, activity } = p;
  const L = useL();
  const [v, setV] = useState('');
  useEffect(() => setV(''), [item.id]);
  return (
    <div className="task">
      <Picture item={item} size="md" />
      <div className="prompt">
        <TapText text={item.prompt} lang={item.lang} onUsed={support} /> {activity.support.audio && <SpeakButton text={item.prompt} lang={item.lang} audioFileId={item.audioFileId} onUsed={support} />}
      </div>
      <textarea className="big-text" rows={4} value={v} disabled={answered} onChange={(e) => setV(e.target.value)} aria-label={L('Your answer', '你的答案')} />
      <div className="row gap-s center">
        <button className="btn primary big" disabled={answered || !v.trim()} onClick={() => submit(v, v)}>
          ✔ {L('Done', '完成')}
        </button>
        <button className="btn big" disabled={answered} onClick={() => submit({ oral: true }, L('(answered orally / on paper)', '（口頭／紙上作答）'))}>
          🗣 {L('I said it / wrote it on paper', '我說了／寫在紙上')}
        </button>
      </div>
    </div>
  );
}

export function OralTask(p: RProps) {
  const { item, answered, submit, support } = p;
  const L = useL();
  return (
    <div className="task">
      <Picture item={item} />
      <div className="prompt">
        <TapText text={item.prompt} lang={item.lang} onUsed={support} /> <SpeakButton text={item.prompt} lang={item.lang} audioFileId={item.audioFileId} onUsed={support} />
      </div>
      <button className="btn primary big" disabled={answered} onClick={() => submit({ oral: true }, L('(oral / practical)', '（口頭／實作）'))}>
        🙋 {L("I'm done!", '我做完了！')}
      </button>
    </div>
  );
}

// ---------- vocabulary journey stages ----------

export function JourneyStage(p: RProps) {
  const { stage, item, group = [], answered, submit, eliminated, support } = p;
  const L = useL();
  const [picked, setPicked] = useState<string>();
  useEffect(() => setPicked(undefined), [item.id, stage]);
  const choices = useMemo(() => shuffle(group.map((g) => g.text || '')).slice(0, 4).concat(), [item.id, stage]); // eslint-disable-line
  const opts = choices.includes(item.text || '') ? choices : [...choices.slice(0, 3), item.text || ''].sort();
  useAutoPlay(item.text || '', item.lang, item.audioFileId, stage === 'choose' || (stage === 'learn' && p.autoPlay), item.id + stage);
  if (stage === 'learn') return <Flashcard {...p} showMeaning />;
  if (stage === 'choose')
    return (
      <div className="task">
        <div className="listen-zone">
          <SpeakButton big text={item.text || ''} lang={item.lang} audioFileId={item.audioFileId} label={L('Listen again', '再聽一次')} />
        </div>
        <Choices choices={opts} lang={item.lang} answered={answered} picked={picked} correct={item.text} eliminated={eliminated} support={support} speakable={false} onPick={(c) => { setPicked(c); submit(c, c); }} />
      </div>
    );
  if (stage === 'recall')
    return (
      <div className="task">
        <Picture item={item} />
        {item.meaning && <div className="meaning big">{item.meaning}</div>}
        {!item.imageFileId && !item.emoji && !item.meaning && <div className="muted">{L('Which word did we just learn?', '我們剛學了哪個詞語？')}</div>}
        <Choices choices={opts} lang={item.lang} answered={answered} picked={picked} correct={item.text} eliminated={eliminated} support={support} onPick={(c) => { setPicked(c); submit(c, c); }} />
      </div>
    );
  // use: example sentence with the word blanked
  const sentence = (item.example || '').replace(/\//g, '');
  const blanked = item.text ? sentence.split(item.text).join(' ＿＿ ') : sentence;
  return (
    <div className="task">
      <div className={`prompt ${item.lang === 'zh' ? 'zh' : ''}`}>{blanked}</div>
      <Choices choices={opts} lang={item.lang} answered={answered} picked={picked} correct={item.text} eliminated={eliminated} support={support} onPick={(c) => { setPicked(c); submit(c, c); }} />
    </div>
  );
}

export const RENDERERS: Record<string, (p: RProps) => React.ReactElement> = {
  flashcards: Flashcard,
  'vocab-journey': JourneyStage,
  'listen-choose': ListenChoose,
  'picture-match': PictureMatch,
  'word-in-sentence': WordInSentence,
  phonics: Phonics,
  dictation: Dictation,
  'multiple-choice': MultipleChoice,
  'gap-fill': GapFill,
  'sentence-order': OrderTask,
  sequencing: OrderTask,
  sorting: Sorting,
  matching: Matching,
  'label-diagram': LabelDiagram,
  counting: Counting,
  'number-line': NumberLineTask,
  math: MathTask,
  'short-answer': ShortAnswer,
  'oral-task': OralTask,
};
