import { db, saveFile } from '../db';
import type { Lang } from '../types';

/**
 * Audio playback for reading support.
 * Order of preference: tutor recording for the item → tutor recording in the shared clip library
 * (same text + language) → browser speech synthesis with a matching voice.
 * Cantonese uses zh-HK voices; English uses en-* voices.
 */

export type SpeakResult = { ok: true; source: 'recording' | 'tts' } | { ok: false; reason: 'no-voice' | 'no-tts' | 'error' };

let voicesCache: SpeechSynthesisVoice[] = [];

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Load voices once; later calls return immediately (some browsers report none until "voiceschanged"). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!ttsSupported()) return Promise.resolve([]);
  const v = speechSynthesis.getVoices();
  if (v.length) {
    voicesCache = v;
    return Promise.resolve(v);
  }
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const done = () => {
        voicesCache = speechSynthesis.getVoices();
        resolve(voicesCache);
      };
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);
    });
    speechSynthesis.addEventListener('voiceschanged', () => (voicesCache = speechSynthesis.getVoices()));
  }
  return voicesPromise;
}

const prefs: { zh?: string; en?: string; rate: number } = { rate: 0.85 };

export function setVoicePrefs(p: { zh?: string; en?: string; rate?: number }) {
  Object.assign(prefs, p);
}

export function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const voices = voicesCache.length ? voicesCache : ttsSupported() ? speechSynthesis.getVoices() : [];
  if (lang === 'zh') {
    if (prefs.zh) {
      const v = voices.find((x) => x.voiceURI === prefs.zh);
      if (v) return v;
    }
    // Cantonese only — Mandarin voices would teach the wrong pronunciation.
    return (
      voices.find((v) => /zh[-_]HK/i.test(v.lang) || /yue/i.test(v.lang)) ||
      voices.find((v) => /cantonese|粵|廣東/i.test(v.name))
    );
  }
  if (prefs.en) {
    const v = voices.find((x) => x.voiceURI === prefs.en);
    if (v) return v;
  }
  return voices.find((v) => /en[-_]GB/i.test(v.lang)) || voices.find((v) => /en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
}

export function cantoneseVoices() {
  return voicesCache.filter((v) => /zh[-_]HK/i.test(v.lang) || /yue/i.test(v.lang) || /cantonese/i.test(v.name));
}
export function englishVoices() {
  return voicesCache.filter((v) => /^en/i.test(v.lang));
}

/** Guess whether a string is Chinese or English. */
export function detectLang(text: string): Lang {
  if (/[㐀-鿿]/.test(text)) return 'zh';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'none';
}

let currentAudio: HTMLAudioElement | null = null;

export function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (ttsSupported()) speechSynthesis.cancel();
}

export async function playFile(fileId: string): Promise<boolean> {
  const f = await db.files.get(fileId);
  if (!f) return false;
  stopAudio();
  const url = URL.createObjectURL(f.blob);
  const a = new Audio(url);
  currentAudio = a;
  a.onended = () => URL.revokeObjectURL(url);
  try {
    await a.play();
    return true;
  } catch {
    return false;
  }
}

export function clipId(lang: Lang, text: string) {
  return `${lang}|${text.trim()}`;
}

export async function speak(text: string, lang?: Lang, audioFileId?: string): Promise<SpeakResult> {
  const clean = text.replace(/\//g, '').replace(/_{2,}/g, ', ').trim();
  if (!clean && !audioFileId) return { ok: false, reason: 'error' };
  const l = lang && lang !== 'none' ? lang : detectLang(clean) === 'zh' ? 'zh' : 'en';
  if (audioFileId && (await playFile(audioFileId))) return { ok: true, source: 'recording' };
  const clip = await db.audioClips.get(clipId(l, clean));
  if (clip && (await playFile(clip.fileId))) return { ok: true, source: 'recording' };
  if (!ttsSupported()) return { ok: false, reason: 'no-tts' };
  await loadVoices();
  const voice = pickVoice(l);
  if (!voice) return { ok: false, reason: 'no-voice' };
  stopAudio();
  const u = new SpeechSynthesisUtterance(clean);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = prefs.rate;
  speechSynthesis.speak(u);
  return { ok: true, source: 'tts' };
}

/** Does this text have a playable source without network? */
export async function audioAvailability(text: string, lang: Lang, audioFileId?: string): Promise<'recording' | 'local-voice' | 'online-voice' | 'none'> {
  if (audioFileId && (await db.files.get(audioFileId))) return 'recording';
  if (await db.audioClips.get(clipId(lang, text))) return 'recording';
  await loadVoices();
  const v = pickVoice(lang === 'none' ? detectLang(text) : lang);
  if (!v) return 'none';
  return v.localService ? 'local-voice' : 'online-voice';
}

// ---------- Recording ----------

export function recordingSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export class Recorder {
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.rec = new MediaRecorder(this.stream);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(new Blob());
      this.rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: this.rec?.mimeType || 'audio/webm' }));
      };
      this.rec.stop();
    });
  }
}

/** Save a recording into the shared clip library so the same word is reused everywhere. */
export async function saveClip(text: string, lang: Lang, blob: Blob) {
  const fileId = await saveFile(blob, `${text}.webm`, 'recording');
  const id = clipId(lang, text);
  const old = await db.audioClips.get(id);
  if (old) await db.files.delete(old.fileId);
  await db.audioClips.put({ id, lang, text: text.trim(), fileId });
  return fileId;
}
