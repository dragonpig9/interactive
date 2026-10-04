// Core data model for Tutor Studio. Everything is stored locally in IndexedDB.

export type Lang = 'zh' | 'en' | 'none';
export type UiLang = 'zh' | 'en';
export type Grade = 'K' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'Other';

export interface ReadingSupport {
  largeText: boolean;
  autoSpeak: boolean; // read instructions/questions aloud automatically
  showIcons: boolean;
  defaultHintLevel: number; // 0 = no hints offered automatically, 1..3
  groupSize: number; // vocabulary group size
}

export interface Student {
  id: string;
  name: string;
  grade: Grade;
  school?: string;
  learningNeeds: string;
  avatar: string; // emoji
  style: 'playful' | 'mature';
  reading: ReadingSupport;
  timerEnabled: boolean;
  scoringEnabled: boolean;
  isSample?: boolean;
  createdAt: number;
}

export interface Subject {
  id: string;
  studentId: string;
  name: string;
  icon: string;
  color: string;
  hidden: boolean;
  order: number;
}

export interface Objective {
  id: string;
  text: string;
}

export interface Topic {
  id: string;
  studentId: string;
  subjectId: string;
  title: string;
  objectives: Objective[];
  order: number;
  notes?: string;
}

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
  origin: 'upload' | 'recording' | 'crop' | 'render';
}

export type MaterialKind =
  | 'dictation'
  | 'test'
  | 'exam'
  | 'worksheet'
  | 'notes'
  | 'vocab'
  | 'answerKey'
  | 'picture';

export type ItemKind = 'word' | 'question' | 'text' | 'diagram' | 'heading' | 'answer';

export interface ExtractedItem {
  id: string;
  kind: ItemKind;
  text: string;
  answer?: string;
  page?: number;
  uncertain: boolean;
  uncertainReason?: string;
  lang: Lang;
  include: boolean; // tutor decides whether this item is usable
  imageFileId?: string; // diagram snapshot
  usedInActivity?: boolean; // already used for a lesson
}

export type ReviewStatus = 'draft' | 'reviewed';

export interface TypedAnswer {
  ref: string; // question number or label
  answer: string;
  alternatives: string[];
  explanation?: string;
  status: AnswerStatus;
}

export interface Material {
  id: string;
  studentId: string;
  subjectId: string;
  topicId?: string;
  kind: MaterialKind;
  title: string;
  assessmentDate?: string; // YYYY-MM-DD
  fileIds: string[];
  pastedText: string;
  notes: string;
  extraction: {
    status: 'none' | 'done' | 'failed' | 'partial';
    message?: string;
    method?: string;
  };
  items: ExtractedItem[];
  status: ReviewStatus;
  answerKey: {
    fileIds: string[];
    answers: TypedAnswer[];
    notes: string;
  };
  isSample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AnswerStatus = 'approved' | 'draft' | 'none';

export type TemplateId =
  | 'flashcards'
  | 'vocab-journey'
  | 'listen-choose'
  | 'picture-match'
  | 'word-in-sentence'
  | 'phonics'
  | 'dictation'
  | 'multiple-choice'
  | 'gap-fill'
  | 'sentence-order'
  | 'sorting'
  | 'sequencing'
  | 'matching'
  | 'label-diagram'
  | 'counting'
  | 'number-line'
  | 'math'
  | 'short-answer'
  | 'oral-task';

export type Skill = 'recognition' | 'comprehension' | 'subject' | 'spelling';
export type Mode = 'pre' | 'revision' | 'assessment';

export interface Marker {
  x: number; // 0..1
  y: number;
  label: string;
}

export interface ActivityItem {
  id: string;
  prompt: string; // question/instruction for this item
  text?: string; // the target word/phrase/answer text for vocab-type templates
  lang: Lang;
  meaning?: string;
  example?: string; // example sentence; '/' marks word boundaries
  emoji?: string;
  imageFileId?: string;
  audioFileId?: string; // tutor recording for this item
  choices?: string[];
  answer?: string;
  alternatives?: string[];
  answerStatus: AnswerStatus;
  tokens?: string[]; // for sentence order / word-in-sentence; preserves boundaries
  categories?: string[];
  sortItems?: { text: string; category: string }[];
  pairs?: { left: string; right: string }[];
  markers?: Marker[];
  count?: number;
  groupSize?: number;
  numberLine?: { min: number; max: number; step: number; target: number };
  segments?: string[]; // phonics segments
  workedSteps?: string[];
  explanation?: string;
  markingNotes?: string;
  hints: string[];
  points?: number;
  key?: string; // progress key (vocab item etc.)
  sourceItemId?: string;
}

export interface Activity {
  id: string;
  studentId: string;
  subjectId: string;
  topicId?: string;
  objectiveId?: string;
  title: string;
  instructions: string;
  instructionIcon: string;
  template: TemplateId;
  mode: Mode;
  assesses: 'reading' | 'subject' | 'both';
  skill: Skill;
  support: { audio: boolean; hints: boolean; pictures: boolean };
  passage?: string;
  items: ActivityItem[];
  sourceMaterialId?: string;
  generated?: boolean; // created by generator; must be reviewed
  reviewed: boolean;
  isSample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type Phase = 'review' | 'new' | 'guided' | 'exercise' | 'assessment' | 'recap';

export interface LessonStep {
  id: string;
  phase: Phase;
  kind: 'activity' | 'material' | 'note';
  refId?: string;
  title: string;
  minutes?: number;
  note?: string;
  done?: boolean;
}

export interface Lesson {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  time?: string;
  title: string;
  objectives: string[];
  scopeIds: string[]; // selected scopes/materials
  topicIds: string[];
  steps: LessonStep[];
  tutorNotes: string; // private
  liveNotes: string; // quick notes during lesson
  status: 'planned' | 'in-progress' | 'done';
  currentStep: number;
  summary?: string;
  isSample?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Attempt {
  id: string;
  studentId: string;
  lessonId?: string;
  activityId: string;
  itemId: string;
  itemKey: string;
  label: string;
  subjectId: string;
  topicId?: string;
  objectiveId?: string;
  skill: Skill;
  mode: Mode;
  response: string;
  correct: boolean | null; // null = waiting for tutor marking
  score: number | null; // 0..1
  markedBy: 'auto' | 'tutor' | 'pending';
  hintsUsed: number;
  audioUsed: boolean;
  independent: boolean;
  note?: string;
  timestamp: number;
}

export type ProgressStatus = 'introduced' | 'with-help' | 'independent' | 'needs-revision' | 'secure';

export interface ProgressRecord {
  id: string; // studentId|skill|itemKey
  studentId: string;
  itemKey: string;
  label: string;
  subjectId: string;
  topicId?: string;
  objectiveId?: string;
  skill: Skill;
  status: ProgressStatus;
  override?: ProgressStatus;
  attempts: number;
  correct: number;
  helped: number;
  streak: number; // independent correct streak
  errors: string[];
  notes: string;
  lastSeen: number;
}

export interface FollowUp {
  id: string;
  studentId: string;
  text: string;
  itemKey?: string;
  subjectId?: string;
  done: boolean;
  createdAt: number;
}

export interface Annotation {
  id: string; // fileId|page
  fileId: string;
  page: number;
  strokes: Stroke[];
  updatedAt: number;
}

export interface Stroke {
  color: string;
  width: number;
  points: [number, number][]; // normalised 0..1
}

export interface AudioClip {
  id: string; // lang|text
  lang: Lang;
  text: string;
  fileId: string;
}

export interface Setting {
  key: string;
  value: unknown;
}
