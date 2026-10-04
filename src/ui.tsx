import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Table } from 'dexie';
import { useL } from './i18n';
import { Recorder, recordingSupported, saveClip, speak } from './lib/speech';
import type { Lang } from './types';

// ---------- routing ----------
export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
}
export function query(): URLSearchParams {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}
export function go(path: string) {
  location.hash = path.startsWith('#') ? path : '#' + path;
}

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: 'info' | 'error' | 'ok'; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.filter((y) => y.text !== t.text), { ...t, id }].slice(-3));
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === 'error' ? 9000 : 4000);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button className="btn small" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" aria-label="close" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal ----------
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- audio ----------
const warnedNoVoice = new Set<string>();

export function useSpeak() {
  const toast = useToast();
  const L = useL();
  return async (text: string, lang?: Lang, audioFileId?: string) => {
    const r = await speak(text, lang, audioFileId);
    const warnKey = r.ok ? '' : `${r.reason}|${lang ?? ''}`;
    // Warn once per language per session, not on every word.
    if (!r.ok && !warnedNoVoice.has(warnKey)) {
      warnedNoVoice.add(warnKey);
      toast({
        kind: 'error',
        text:
          r.reason === 'no-voice'
            ? L(
                `No ${lang === 'zh' ? 'Cantonese' : 'English'} voice on this device. Record your own audio for this item (🎙), or install a voice in system settings.`,
                `此裝置沒有${lang === 'zh' ? '粵語' : '英語'}語音。請為此項目錄音（🎙），或在系統設定安裝語音。`,
              )
            : L('Audio could not play on this browser.', '此瀏覽器無法播放聲音。'),
      });
    }
    return r.ok;
  };
}

export function SpeakButton({ text, lang, audioFileId, onUsed, big, label }: { text: string; lang?: Lang; audioFileId?: string; onUsed?: () => void; big?: boolean; label?: string }) {
  const say = useSpeak();
  const L = useL();
  if (!text && !audioFileId) return null;
  return (
    <button
      type="button"
      className={`speak-btn ${big ? 'big' : ''}`}
      aria-label={L('Listen', '聽一聽') + ': ' + text}
      title={L('Listen', '聽一聽')}
      onClick={(e) => {
        e.stopPropagation();
        onUsed?.();
        say(text, lang, audioFileId);
      }}
    >
      🔊{label ? <span>{label}</span> : null}
    </button>
  );
}

/** Text where each word/character group can be tapped to hear it. "/" marks the tutor's word boundaries. */
export function TapText({ text, lang, onUsed, className }: { text: string; lang?: Lang; onUsed?: () => void; className?: string }) {
  const say = useSpeak();
  const hasSlash = text.includes('/');
  const parts = hasSlash ? text.split('/') : text.split(/(\s+|[，。！？、,.!?])/);
  return (
    <span className={`tap-text ${className || ''}`}>
      {parts.map((p, i) =>
        p.trim() && !/^[，。！？、,.!?]$/.test(p) ? (
          <span
            key={i}
            className="tap-word"
            role="button"
            tabIndex={0}
            onClick={() => {
              onUsed?.();
              say(p.trim(), lang);
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function RecordButton({ text, lang, onSaved }: { text: string; lang: Lang; onSaved?: (fileId: string) => void }) {
  const L = useL();
  const toast = useToast();
  const rec = useRef<Recorder | null>(null);
  const [on, setOn] = useState(false);
  const has = useLiveQuery(() => db.audioClips.get(`${lang}|${text.trim()}`), [text, lang]);
  if (!recordingSupported()) return null;
  return (
    <button
      type="button"
      className={`icon-btn rec ${on ? 'recording' : ''}`}
      title={on ? L('Stop recording', '停止錄音') : has ? L('Re-record your voice', '重新錄音') : L('Record your voice', '錄下你的聲音')}
      onClick={async () => {
        if (!text.trim()) return toast({ kind: 'error', text: L('Type the word first.', '請先輸入文字。') });
        try {
          if (!on) {
            rec.current = new Recorder();
            await rec.current.start();
            setOn(true);
          } else {
            const blob = await rec.current!.stop();
            setOn(false);
            const id = await saveClip(text, lang, blob);
            onSaved?.(id);
            toast({ kind: 'ok', text: L('Recording saved — it will be used everywhere this word appears.', '錄音已儲存，此詞語出現時都會使用。') });
          }
        } catch (e) {
          setOn(false);
          toast({ kind: 'error', text: L('Microphone not available: ', '無法使用咪高峰：') + (e as Error).message });
        }
      }}
    >
      {on ? '⏹' : has ? '🎙✓' : '🎙'}
    </button>
  );
}

// ---------- files ----------
export function useFileUrl(fileId?: string) {
  const file = useLiveQuery(() => (fileId ? db.files.get(fileId) : undefined), [fileId]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return setUrl(undefined);
    const u = URL.createObjectURL(file.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return { url, file };
}

export function FileImage({ fileId, alt, className }: { fileId?: string; alt?: string; className?: string }) {
  const { url } = useFileUrl(fileId);
  if (!url) return null;
  return <img src={url} alt={alt || ''} className={className} />;
}

// ---------- small bits ----------
export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function SampleTag() {
  const L = useL();
  return <span className="tag sample">{L('Sample', '示例')}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function fmtDate(d?: string, lang: 'zh' | 'en' = 'en') {
  if (!d) return '';
  const dt = new Date(d + 'T00:00');
  return dt.toLocaleDateString(lang === 'zh' ? 'zh-HK' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(date: string) {
  return Math.round((new Date(date + 'T00:00').getTime() - new Date(today() + 'T00:00').getTime()) / 86400000);
}

export function useConfirm() {
  return (msg: string) => window.confirm(msg);
}

// ---------- editing records without lag ----------
/**
 * Load one record and edit it with synchronous local state. Writes are queued in order, so typing
 * quickly never loses characters and rapid clicks never overwrite each other with stale data.
 */
export function useLiveDoc<T extends { id: string }>(table: Table<T, string>, id: string | undefined) {
  const remote = useLiveQuery(() => (id ? table.get(id) : undefined), [id]);
  const [local, setLocal] = useState<T | undefined>();
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (pending.current === 0) {
      setLocal(remote);
      latest.current = remote;
    }
  }, [remote]);
  useEffect(() => {
    setLocal(undefined);
    latest.current = undefined;
  }, [id]);
  const patch = (p: Partial<T> | ((cur: T) => Partial<T>)) => {
    const cur = latest.current ?? remote;
    if (!cur) return;
    const next = { ...cur, ...(typeof p === 'function' ? p(cur) : p), updatedAt: Date.now() } as T;
    latest.current = next;
    setLocal(next);
    pending.current++;
    queue.current = queue.current
      .then(() => table.put(next))
      .catch((e) => console.error('save failed', e))
      .finally(() => pending.current--);
  };
  return [local ?? remote, patch] as const;
}

/** Text input that keeps its own state while typing and saves each change. */
export function BufInput({ value, onValue, textarea, ...rest }: { value: string; onValue: (v: string) => void; textarea?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const props = {
    ...rest,
    value: v,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setV(value);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setV(e.target.value);
      onValue(e.target.value);
    },
  };
  return textarea ? <textarea {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} /> : <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} />;
}
