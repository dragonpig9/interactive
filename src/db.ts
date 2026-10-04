import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Annotation,
  Attempt,
  AudioClip,
  FollowUp,
  Lesson,
  Material,
  ProgressRecord,
  Setting,
  StoredFile,
  Student,
  Subject,
  Topic,
} from './types';

export class TutorDB extends Dexie {
  students!: Table<Student, string>;
  subjects!: Table<Subject, string>;
  topics!: Table<Topic, string>;
  files!: Table<StoredFile, string>;
  materials!: Table<Material, string>;
  activities!: Table<Activity, string>;
  lessons!: Table<Lesson, string>;
  attempts!: Table<Attempt, string>;
  progress!: Table<ProgressRecord, string>;
  followUps!: Table<FollowUp, string>;
  annotations!: Table<Annotation, string>;
  audioClips!: Table<AudioClip, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'tutor-studio') {
    super(name);
    this.version(1).stores({
      students: 'id, name',
      subjects: 'id, studentId, order',
      topics: 'id, studentId, subjectId',
      files: 'id',
      materials: 'id, studentId, subjectId, kind, assessmentDate, updatedAt',
      activities: 'id, studentId, subjectId, topicId, template, updatedAt',
      lessons: 'id, studentId, date, status',
      attempts: 'id, studentId, lessonId, activityId, itemKey, timestamp',
      progress: 'id, studentId, subjectId, status, lastSeen',
      followUps: 'id, studentId, done',
      annotations: 'id, fileId',
      audioClips: 'id',
      settings: 'key',
    });
  }
}

export const db = new TutorDB();

export const TABLES = [
  'students',
  'subjects',
  'topics',
  'files',
  'materials',
  'activities',
  'lessons',
  'attempts',
  'progress',
  'followUps',
  'annotations',
  'audioClips',
  'settings',
] as const;

export function uid(prefix = ''): string {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + rnd[0].toString(36) + rnd[1].toString(36).slice(0, 4);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return s ? (s.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

/** Store an uploaded/recorded blob. Throws a readable error on quota problems. */
export async function saveFile(
  blob: Blob,
  name: string,
  origin: StoredFile['origin'] = 'upload',
): Promise<string> {
  const id = uid('f_');
  try {
    await db.files.put({ id, name, type: blob.type || guessType(name), size: blob.size, blob, createdAt: Date.now(), origin });
  } catch (e) {
    throw new StorageError(e);
  }
  return id;
}

export function guessType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  };
  return map[ext] || 'application/octet-stream';
}

export class StorageError extends Error {
  constructor(cause: unknown) {
    const name = (cause as { name?: string })?.name || '';
    const quota = name === 'QuotaExceededError' || /quota/i.test(String(cause));
    super(
      quota
        ? 'Browser storage is full. Export a backup, then delete old uploads or recordings to free space.'
        : 'Could not save to browser storage: ' + String((cause as Error)?.message || cause),
    );
    this.name = quota ? 'QuotaExceededError' : 'StorageError';
  }
}

/** Delete a student and everything that belongs to them. */
export async function deleteStudent(studentId: string) {
  await db.transaction('rw', [db.students, db.subjects, db.topics, db.materials, db.activities, db.lessons, db.attempts, db.progress, db.followUps, db.files], async () => {
    const mats = await db.materials.where('studentId').equals(studentId).toArray();
    const acts = await db.activities.where('studentId').equals(studentId).toArray();
    const fileIds = new Set<string>();
    mats.forEach((m) => {
      m.fileIds.forEach((f) => fileIds.add(f));
      m.answerKey.fileIds.forEach((f) => fileIds.add(f));
      m.items.forEach((i) => i.imageFileId && fileIds.add(i.imageFileId));
    });
    acts.forEach((a) => a.items.forEach((i) => {
      if (i.imageFileId) fileIds.add(i.imageFileId);
      if (i.audioFileId) fileIds.add(i.audioFileId);
    }));
    await db.files.bulkDelete([...fileIds]);
    await db.students.delete(studentId);
    for (const t of [db.subjects, db.topics, db.materials, db.activities, db.lessons, db.attempts, db.progress, db.followUps] as Table<{ studentId: string }, string>[]) {
      await t.where('studentId').equals(studentId).delete();
    }
  });
}
