import { db, uid } from '../db';
import type { Grade, Student } from '../types';

export const GRADES: Grade[] = ['K', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Other'];

export const DEFAULT_SUBJECTS: [string, string, string][] = [
  ['中文 Chinese', '📖', '#e76f51'],
  ['英文 English', '🔤', '#2a9d8f'],
  ['數學 Mathematics', '🔢', '#e9a23b'],
  ['常識 General Studies', '🌏', '#6a994e'],
  ['科學 Science', '🔬', '#3d7ea6'],
  ['人文 Humanities', '🏛️', '#9c6644'],
  ['電腦 Computer Studies', '💻', '#5a67d8'],
  ['音樂 Music', '🎵', '#c75b9b'],
  ['視藝 Visual Arts', '🎨', '#d1495b'],
];

export function defaultSubjectsFor(grade: Grade): string[] {
  if (grade.startsWith('S')) return ['中文 Chinese', '英文 English', '數學 Mathematics', '科學 Science', '人文 Humanities'];
  return ['中文 Chinese', '英文 English', '數學 Mathematics', '常識 General Studies'];
}

export function newStudent(name: string, grade: Grade): Student {
  const young = ['K', 'P1', 'P2', 'P3'].includes(grade);
  return {
    id: uid('s_'),
    name,
    grade,
    learningNeeds: '',
    avatar: young ? '🐣' : '🦉',
    style: young ? 'playful' : 'mature',
    reading: { largeText: young, autoSpeak: young, showIcons: true, defaultHintLevel: young ? 2 : 1, groupSize: young ? 4 : 8 },
    timerEnabled: false,
    scoringEnabled: false,
    createdAt: Date.now(),
  };
}

export async function addSubjects(studentId: string, names: string[]) {
  const existing = await db.subjects.where('studentId').equals(studentId).count();
  await db.subjects.bulkAdd(
    names.map((n, i) => {
      const d = DEFAULT_SUBJECTS.find((x) => x[0] === n);
      return { id: uid('sub_'), studentId, name: n, icon: d?.[1] ?? '📘', color: d?.[2] ?? '#607d8b', hidden: false, order: existing + i };
    }),
  );
}

