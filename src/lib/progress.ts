import { db, uid } from '../db';
import type { Activity, ActivityItem, Attempt, ProgressRecord, ProgressStatus, Skill } from '../types';

export function itemKey(activity: Activity, item: ActivityItem): string {
  if (item.key) return item.key;
  if (item.text && ['flashcards', 'vocab-journey', 'listen-choose', 'picture-match', 'word-in-sentence', 'dictation', 'phonics'].includes(activity.template)) {
    return `${item.lang}:${item.text.trim()}`;
  }
  // Questions that came from an uploaded worksheet share one record, whether answered on screen or on paper.
  if (item.sourceItemId) return `src:${item.sourceItemId}`;
  return `${activity.id}:${item.id}`;
}

export function itemLabel(item: ActivityItem): string {
  return (item.text || item.prompt || item.answer || '').split('\n')[0].slice(0, 80);
}

/** Skills an attempt counts towards. Reading recognition and subject understanding are kept separate. */
export function skillsFor(activity: Activity): Skill[] {
  if (activity.assesses === 'both') return Array.from(new Set<Skill>(['recognition', activity.skill === 'recognition' ? 'subject' : activity.skill]));
  if (activity.assesses === 'reading') return [activity.skill === 'subject' ? 'recognition' : activity.skill];
  return [activity.skill === 'recognition' ? 'subject' : activity.skill];
}

export function isIndependent(skill: Skill, hintsUsed: number, audioUsed: boolean) {
  if (hintsUsed > 0) return false;
  // Hearing the word read aloud is support for reading/spelling skills, not for subject understanding.
  if (audioUsed && (skill === 'recognition' || skill === 'comprehension')) return false;
  return true;
}

export function effectiveStatus(p: ProgressRecord): ProgressStatus {
  return p.override ?? p.status;
}

export interface AttemptInput {
  studentId: string;
  lessonId?: string;
  activity: Activity;
  item: ActivityItem;
  response: string;
  correct: boolean | null;
  score: number | null;
  markedBy: Attempt['markedBy'];
  hintsUsed: number;
  audioUsed: boolean;
  note?: string;
  introducedOnly?: boolean; // flashcard / "see and hear" exposure
}

/** Record one attempt and update progress records for each relevant skill. Returns the attempt ids. */
export async function recordAttempt(a: AttemptInput): Promise<string[]> {
  const key = itemKey(a.activity, a.item);
  const label = itemLabel(a.item);
  const ids: string[] = [];
  for (const skill of skillsFor(a.activity)) {
    const independent = isIndependent(skill, a.hintsUsed, a.audioUsed);
    const att: Attempt = {
      id: uid('at_'),
      studentId: a.studentId,
      lessonId: a.lessonId,
      activityId: a.activity.id,
      itemId: a.item.id,
      itemKey: key,
      label,
      subjectId: a.activity.subjectId,
      topicId: a.activity.topicId,
      objectiveId: a.activity.objectiveId,
      skill,
      mode: a.activity.mode,
      response: a.response,
      correct: a.introducedOnly ? null : a.correct,
      score: a.introducedOnly ? null : a.score,
      markedBy: a.introducedOnly ? 'tutor' : a.markedBy,
      hintsUsed: a.hintsUsed,
      audioUsed: a.audioUsed,
      independent,
      note: a.introducedOnly ? 'introduced' : a.note,
      timestamp: Date.now(),
    };
    await db.attempts.put(att);
    ids.push(att.id);
    await applyToProgress(att, !!a.introducedOnly);
  }
  return ids;
}

export function nextStatus(prev: ProgressRecord | undefined, att: Attempt, introducedOnly: boolean): Partial<ProgressRecord> {
  const base: Partial<ProgressRecord> = {
    attempts: (prev?.attempts ?? 0) + (introducedOnly ? 0 : 1),
    correct: prev?.correct ?? 0,
    helped: prev?.helped ?? 0,
    streak: prev?.streak ?? 0,
    errors: prev?.errors ?? [],
  };
  if (introducedOnly) return { ...base, status: prev?.status ?? 'introduced' };
  if (att.correct === null) return { ...base, status: prev?.status ?? 'introduced' }; // waiting for marking
  if (att.correct) {
    base.correct! += 1;
    if (att.independent) {
      base.streak! += 1;
      return { ...base, status: 'independent' };
    }
    base.helped! += 1;
    base.streak = 0;
    return { ...base, status: prev?.status === 'independent' && prev.streak >= 2 ? 'independent' : 'with-help' };
  }
  base.streak = 0;
  // Placeholders like "(oral)" or "(written on paper)" are not useful as common errors.
  if (att.response && !/^[(（]/.test(att.response) && !base.errors!.includes(att.response)) base.errors = [...base.errors!, att.response].slice(-8);
  return { ...base, status: 'needs-revision' };
}

async function applyToProgress(att: Attempt, introducedOnly: boolean) {
  const id = `${att.studentId}|${att.skill}|${att.itemKey}`;
  const prev = await db.progress.get(id);
  const upd = nextStatus(prev, att, introducedOnly);
  await db.progress.put({
    id,
    studentId: att.studentId,
    itemKey: att.itemKey,
    label: att.label,
    subjectId: att.subjectId,
    topicId: att.topicId,
    objectiveId: att.objectiveId,
    skill: att.skill,
    status: upd.status!,
    override: prev?.override,
    attempts: upd.attempts!,
    correct: upd.correct!,
    helped: upd.helped!,
    streak: upd.streak!,
    errors: upd.errors!,
    notes: prev?.notes ?? '',
    lastSeen: att.timestamp,
  });
}

/** Tutor marks a pending attempt (oral, short answer, dictation on paper...). */
export async function markAttempt(attemptId: string, correct: boolean, score: number, note?: string) {
  const att = await db.attempts.get(attemptId);
  if (!att) return;
  const updated: Attempt = { ...att, correct, score, markedBy: 'tutor', note: note ?? att.note };
  await db.attempts.put(updated);
  await applyToProgress(updated, false);
}

/**
 * How much help to offer automatically for an item: hints fade as the student improves.
 * 2 = offer hints straight away, 1 = after a mistake, 0 = only when the tutor gives one.
 */
export function hintLevelFor(p: ProgressRecord | undefined, studentDefault: number): number {
  if (!p) return studentDefault;
  const s = effectiveStatus(p);
  if (s === 'secure' || (s === 'independent' && p.streak >= 2)) return 0;
  if (s === 'independent') return Math.min(1, studentDefault);
  if (s === 'with-help') return Math.max(1, studentDefault - 1);
  return Math.max(studentDefault, 2);
}

/** Difficult items: needs revision first, then with-help, most recent first. */
export async function difficultItems(studentId: string, subjectId?: string, limit = 20) {
  const all = await db.progress.where('studentId').equals(studentId).toArray();
  const rank: Record<ProgressStatus, number> = { 'needs-revision': 0, 'with-help': 1, introduced: 2, independent: 3, secure: 4 };
  return all
    .filter((p) => (!subjectId || p.subjectId === subjectId) && ['needs-revision', 'with-help'].includes(effectiveStatus(p)))
    .sort((a, b) => rank[effectiveStatus(a)] - rank[effectiveStatus(b)] || b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

export async function lessonSummary(lessonId: string) {
  const atts = await db.attempts.where('lessonId').equals(lessonId).toArray();
  const marked = atts.filter((a) => a.correct !== null && a.note !== 'introduced');
  const byKey = new Map<string, Attempt[]>();
  for (const a of marked) byKey.set(a.itemKey + a.skill, [...(byKey.get(a.itemKey + a.skill) || []), a]);
  const independent = new Set<string>();
  const helped = new Set<string>();
  const wrong = new Set<string>();
  for (const list of byKey.values()) {
    const last = list[list.length - 1];
    if (!last.correct) wrong.add(last.label);
    else if (last.independent) independent.add(last.label);
    else helped.add(last.label);
  }
  return {
    total: marked.length,
    correct: marked.filter((a) => a.correct).length,
    pending: atts.filter((a) => a.correct === null && a.note !== 'introduced').length,
    hints: atts.reduce((s, a) => s + a.hintsUsed, 0),
    independent: [...independent],
    helped: [...helped],
    wrong: [...wrong],
    introduced: [...new Set(atts.filter((a) => a.note === 'introduced').map((a) => a.label))],
  };
}
