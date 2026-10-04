import { db, saveFile, uid } from './db';
import { addSubjects, newStudent } from './lib/students';
import { blankMaterial } from './lib/materials';
import { itemsFromPaste } from './lib/materials';
import { newActivity, newItem } from './lib/templates';
import type { Activity, ActivityItem, Lesson, LessonStep, Subject, TemplateId } from './types';
import { addDays, today } from './ui';

/**
 * Clearly-labelled sample content: a P1 pupil (Chinese, English, Maths, General Studies) and an S1 pupil
 * (advanced Maths, Science, Humanities). Everything is marked isSample and can be removed in Settings.
 */
export async function seedSamples() {
  await seedP1();
  await seedS1();
}

async function subjectsOf(studentId: string): Promise<Record<string, Subject>> {
  const subs = await db.subjects.where('studentId').equals(studentId).toArray();
  const by: Record<string, Subject> = {};
  for (const s of subs) by[s.name.split(' ')[1] || s.name] = s;
  return by;
}

async function topic(studentId: string, subjectId: string, title: string, objectives: string[]) {
  const t = { id: uid('t_'), studentId, subjectId, title, objectives: objectives.map((text) => ({ id: uid('o_'), text })), order: 0 };
  await db.topics.add(t);
  return t;
}

function act(studentId: string, subjectId: string, template: TemplateId, extra: Partial<Activity>, items: Partial<ActivityItem>[]): Activity {
  const a = newActivity(studentId, subjectId, template, { isSample: true, ...extra });
  a.items = items.map((i) => newItem(template, { answerStatus: 'approved', ...i }));
  return a;
}

const step = (phase: LessonStep['phase'], kind: LessonStep['kind'], title: string, minutes: number, refId?: string, note?: string): LessonStep => ({ id: uid('st_'), phase, kind, title, minutes, refId, note });

/** Draw a simple worksheet as a PNG so the sample shows the file viewer, zoom and annotation. */
async function worksheetImage(lines: string[], title: string): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1240;
  c.height = 1754;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#222';
  g.font = 'bold 56px sans-serif';
  g.fillText(title, 90, 150);
  g.font = '34px sans-serif';
  g.fillText('姓名 Name: ____________      日期 Date: ________', 90, 230);
  g.font = '64px sans-serif';
  lines.forEach((l, i) => g.fillText(l, 120, 400 + i * 190));
  g.strokeStyle = '#999';
  g.strokeRect(60, 60, c.width - 120, c.height - 120);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** A simple plant-cell diagram drawn at first run, so the sample needs no downloaded images. */
async function plantCellImage(): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 420;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 640, 420);
  g.fillStyle = '#cfe8b4';
  g.strokeStyle = '#4f7a28';
  g.lineWidth = 14;
  g.beginPath();
  if (g.roundRect) g.roundRect(30, 30, 580, 360, 30);
  else g.rect(30, 30, 580, 360);
  g.fill();
  g.stroke();
  g.fillStyle = '#e5f2fb';
  g.strokeStyle = '#7aa6c2';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(400, 290, 150, 70, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#b28dc9';
  g.beginPath();
  g.arc(300, 175, 48, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7d4f9a';
  g.beginPath();
  g.arc(300, 175, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3f8f3a';
  for (const [x, y] of [[160, 92], [470, 90], [120, 300], [520, 170], [190, 200]]) {
    g.beginPath();
    g.ellipse(x, y, 30, 15, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

async function seedP1() {
  const s = newStudent('示例 Sample · 小明 Siu Ming', 'P1');
  s.isSample = true;
  s.avatar = '🐣';
  s.learningNeeds = 'Sample profile. Finds it hard to recognise Chinese characters and English words; needs instructions read aloud. 認字困難，需要朗讀支援。';
  await db.students.add(s);
  await addSubjects(s.id, ['中文 Chinese', '英文 English', '數學 Mathematics', '常識 General Studies']);
  const sub = await subjectsOf(s.id);
  const tZh = await topic(s.id, sub.Chinese.id, '第三課 我的家', ['認讀家庭成員詞語', '用詞語說簡單句子']);
  const tEn = await topic(s.id, sub.English.id, 'Unit 2 Animals', ['Recognise animal words', 'Blend CVC words']);
  const tMa = await topic(s.id, sub.Mathematics.id, '10以內的加法 Addition within 10', ['Count objects to 10', 'Add within 10']);
  const tGs = await topic(s.id, sub['General'].id, '生物與非生物 Living things', ['Sort living and non-living things', 'Order a life cycle']);

  // Chinese dictation scope — pasted text, reviewed, dated in 3 days.
  const dict = blankMaterial(s.id, sub.Chinese.id, 'dictation');
  Object.assign(dict, {
    title: '示例：默書（三）我的家',
    topicId: tZh.id,
    assessmentDate: addDays(today(), 3),
    pastedText: '爸爸、媽媽、哥哥、姐姐、弟弟、妹妹\n我的家',
    notes: 'Sample dictation scope. 默書範圍示例。',
    status: 'reviewed',
    isSample: true,
    extraction: { status: 'done', method: 'Pasted text' },
  });
  dict.items = itemsFromPaste(dict.pastedText, 'dictation');
  await db.materials.add(dict);

  const fam: [string, string, string][] = [
    ['爸爸', '👨', '我/愛/爸爸。'],
    ['媽媽', '👩', '媽媽/在/煮飯。'],
    ['哥哥', '👦', '哥哥/在/踢球。'],
    ['姐姐', '👧', '姐姐/在/唱歌。'],
    ['弟弟', '👶', '弟弟/在/睡覺。'],
    ['妹妹', '👧🏻', '妹妹/在/畫畫。'],
  ];
  const journey = act(s.id, sub.Chinese.id, 'vocab-journey', { title: '示例：家庭成員詞語旅程', topicId: tZh.id, objectiveId: tZh.objectives[0].id, instructions: '看一看，聽一聽，學詞語。', sourceMaterialId: dict.id, mode: 'pre' },
    fam.map(([text, emoji, example]) => ({ text, prompt: text, emoji, example, lang: 'zh', answer: text, key: `zh:${text}` })));
  const listen = act(s.id, sub.Chinese.id, 'listen-choose', { title: '示例：聽一聽，選詞語', topicId: tZh.id, instructions: '聽一聽，選出你聽到的詞語。', mode: 'revision' },
    fam.slice(0, 4).map(([text], i) => ({ text, prompt: text, lang: 'zh', answer: text, key: `zh:${text}`, choices: [text, fam[(i + 1) % 6][0], fam[(i + 2) % 6][0]].sort() })));
  const findWord = act(s.id, sub.Chinese.id, 'word-in-sentence', { title: '示例：句子中找詞語', topicId: tZh.id, objectiveId: tZh.objectives[1].id, instructions: '聽一聽，在句子中找出這個詞語。' },
    fam.slice(0, 3).map(([text, emoji, example]) => ({ text, emoji, example, tokens: example.split('/'), lang: 'zh', answer: text, key: `zh:${text}` })));
  const dictation = act(s.id, sub.Chinese.id, 'dictation', { title: '示例：小默書', topicId: tZh.id, instructions: '聽一聽，寫出來。', skill: 'spelling', mode: 'assessment', support: { audio: true, hints: false, pictures: false } },
    fam.slice(0, 4).map(([text]) => ({ text, prompt: text, lang: 'zh', answer: text, key: `zh:${text}` })));

  // English
  const eng = blankMaterial(s.id, sub.English.id, 'vocab');
  Object.assign(eng, { title: 'Sample: Unit 2 animal words', topicId: tEn.id, pastedText: 'cat - 貓\ndog - 狗\npig - 豬\nfish - 魚\nhen - 母雞', status: 'reviewed', isSample: true, extraction: { status: 'done', method: 'Pasted text' } });
  eng.items = itemsFromPaste(eng.pastedText, 'vocab');
  await db.materials.add(eng);
  const animals: [string, string, string, string][] = [
    ['cat', '貓', '🐱', 'The/cat/is/big.'],
    ['dog', '狗', '🐶', 'I/like/my/dog.'],
    ['pig', '豬', '🐷', 'The/pig/is/pink.'],
    ['fish', '魚', '🐟', 'A/fish/can/swim.'],
    ['hen', '母雞', '🐔', 'The/hen/is/red.'],
  ];
  const cards = act(s.id, sub.English.id, 'flashcards', { title: 'Sample: Animal flashcards', topicId: tEn.id, objectiveId: tEn.objectives[0].id, instructions: 'Look and listen.', mode: 'pre' },
    animals.map(([text, meaning, emoji, example]) => ({ text, prompt: text, meaning, emoji, example, lang: 'en', answer: text, key: `en:${text}` })));
  const picMatch = act(s.id, sub.English.id, 'picture-match', { title: 'Sample: Picture matching', topicId: tEn.id, objectiveId: tEn.objectives[0].id, instructions: 'Look at the picture. Tap the word.', mode: 'revision' },
    animals.map(([text, meaning, emoji], i) => ({ text, meaning, emoji, lang: 'en', answer: text, key: `en:${text}`, choices: [text, animals[(i + 1) % 5][0], animals[(i + 3) % 5][0]].sort() })));
  const phon = act(s.id, sub.English.id, 'phonics', { title: 'Sample: Sound it out (CVC)', topicId: tEn.id, objectiveId: tEn.objectives[1].id, instructions: 'Say each sound. Blend them. Choose the word.' },
    [['cat', '🐱', ['cot', 'cut']], ['pig', '🐷', ['peg', 'pin']], ['hen', '🐔', ['ten', 'hat']]].map(([text, emoji, others]) => ({ text: text as string, emoji: emoji as string, segments: (text as string).split(''), choices: [text as string, ...(others as string[])].sort(), lang: 'en', answer: text as string, key: `en:${text}` })));
  const order = act(s.id, sub.English.id, 'sentence-order', { title: 'Sample: Make a sentence', topicId: tEn.id, instructions: 'Put the words in order.', skill: 'comprehension' },
    [{ tokens: ['I', 'like', 'my', 'dog.'], emoji: '🐶', lang: 'en' }, { tokens: ['The', 'cat', 'is', 'big.'], emoji: '🐱', lang: 'en' }]);

  // Maths
  const counting = act(s.id, sub.Mathematics.id, 'counting', { title: '示例：數一數 Count', topicId: tMa.id, objectiveId: tMa.objectives[0].id, instructions: '數一數，有多少個？' },
    [{ emoji: '🍎', count: 5, answer: '5', prompt: '有多少個蘋果？' }, { emoji: '⭐', count: 8, groupSize: 5, answer: '8', prompt: '有多少粒星？' }, { emoji: '🐟', count: 7, groupSize: 5, answer: '7', prompt: '有多少條魚？' }]);
  const adding = act(s.id, sub.Mathematics.id, 'math', { title: '示例：10以內加法', topicId: tMa.id, objectiveId: tMa.objectives[1].id, instructions: '計一計。' },
    [
      { prompt: '3 + 4 = ?', answer: '7', workedSteps: ['由 3 開始，再數 4：4、5、6、7', '3 + 4 = 7'] },
      { prompt: '5 + 2 = ?', answer: '7', workedSteps: ['由 5 開始，再數 2：6、7', '5 + 2 = 7'] },
      { prompt: '媽媽有 6 個橙，爸爸給她 3 個。她現在有多少個橙？', lang: 'zh', emoji: '🍊', answer: '9', workedSteps: ['6 + 3', '= 9'], explanation: '6 + 3 = 9 個橙' },
    ]);
  const nline = act(s.id, sub.Mathematics.id, 'number-line', { title: '示例：數線', topicId: tMa.id, instructions: '箭咀指着哪個數？' },
    [{ numberLine: { min: 0, max: 10, step: 1, target: 6 }, answer: '6' }, { numberLine: { min: 0, max: 10, step: 1, target: 3 }, answer: '3' }]);

  // Maths worksheet upload with typed answer key (sample "uploaded" file drawn as an image).
  const ws = blankMaterial(s.id, sub.Mathematics.id, 'worksheet');
  ws.title = '示例：加法工作紙 Addition worksheet';
  ws.topicId = tMa.id;
  ws.isSample = true;
  ws.status = 'reviewed';
  ws.pastedText = '1. 3 + 4 = (   )\n2. 5 + 2 = (   )\n3. 6 + 3 = (   )\n4. 8 + 1 = (   )';
  ws.items = itemsFromPaste(ws.pastedText, 'worksheet');
  ws.extraction = { status: 'done', method: 'Sample image + typed text' };
  const img = await worksheetImage(['1.   3 + 4 = (     )', '2.   5 + 2 = (     )', '3.   6 + 3 = (     )', '4.   8 + 1 = (     )'], '加法工作紙 Addition');
  if (img) ws.fileIds = [await saveFile(img, 'sample-addition-worksheet.png')];
  ws.answerKey = { fileIds: [], notes: 'Accept answers written in the brackets.', answers: [['1', '7'], ['2', '7'], ['3', '9'], ['4', '9']].map(([ref, answer]) => ({ ref, answer, alternatives: [], status: 'approved' as const })) };
  await db.materials.add(ws);

  // General Studies
  const sorting = act(s.id, sub['General'].id, 'sorting', { title: '示例：生物與非生物', topicId: tGs.id, objectiveId: tGs.objectives[0].id, instructions: '把它們放進正確的組別。', assesses: 'subject' },
    [{ prompt: '哪些是生物？哪些是非生物？', lang: 'zh', categories: ['生物 🌱', '非生物 🪨'], sortItems: [{ text: '🐶 狗', category: '生物 🌱' }, { text: '🌳 樹', category: '生物 🌱' }, { text: '🪨 石頭', category: '非生物 🪨' }, { text: '🚗 汽車', category: '非生物 🪨' }, { text: '🐦 雀鳥', category: '生物 🌱' }] }]);
  const seq = act(s.id, sub['General'].id, 'sequencing', { title: '示例：蝴蝶的生命周期', topicId: tGs.id, objectiveId: tGs.objectives[1].id, instructions: '把步驟排好次序。' },
    [{ prompt: '蝴蝶是怎樣長大的？', lang: 'zh', tokens: ['🥚 卵', '🐛 幼蟲', '🫘 蛹', '🦋 蝴蝶'] }]);

  const acts = [journey, listen, findWord, dictation, cards, picMatch, phon, order, counting, adding, nline, sorting, seq];
  await db.activities.bulkAdd(acts);

  const lesson: Lesson = {
    id: uid('l_'),
    studentId: s.id,
    date: today(),
    time: '16:30',
    title: '示例課堂 Sample lesson: 我的家 + animals + adding',
    objectives: ['認讀家庭成員詞語', 'Recognise animal words', 'Add within 10'],
    scopeIds: [dict.id, eng.id],
    topicIds: [tZh.id, tEn.id, tMa.id],
    steps: [
      step('review', 'activity', cards.title, 5, cards.id),
      step('new', 'activity', journey.title, 12, journey.id),
      step('guided', 'activity', counting.title, 8, counting.id),
      step('exercise', 'material', ws.title, 10, ws.id),
      step('assessment', 'activity', dictation.title, 5, dictation.id),
      step('recap', 'note', '總結 Recap', 3, undefined, '說說今天學了哪些家人的稱呼。Which animal words do you remember?'),
    ],
    tutorNotes: 'Sample private note: praise effort; keep dictation to 4 words today.',
    liveNotes: '',
    status: 'planned',
    currentStep: 0,
    isSample: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.lessons.add(lesson);
  // A prepared lesson for next week (duplicated structure, to show reuse).
  await db.lessons.add({ ...lesson, id: uid('l_'), date: addDays(today(), 7), title: '示例：下星期 Next week (needs preparation)', steps: [step('review', 'note', '快速溫習 Quick review', 5), step('new', 'note', '學習新內容 Introduce something new', 10)], status: 'planned' });
}

async function seedS1() {
  const s = newStudent('示例 Sample · Jason (S1)', 'S1');
  s.isSample = true;
  s.avatar = '🚀';
  s.learningNeeds = 'Sample advanced profile: confident reader; works on algebra, science vocabulary and explaining reasoning.';
  await db.students.add(s);
  await addSubjects(s.id, ['中文 Chinese', '英文 English', '數學 Mathematics', '科學 Science', '人文 Humanities']);
  const sub = await subjectsOf(s.id);
  const tMa = await topic(s.id, sub.Mathematics.id, 'Directed numbers & simple equations 有向數及方程', ['Calculate with negative numbers', 'Solve one-step and two-step equations']);
  const tSc = await topic(s.id, sub.Science.id, 'Cells 細胞', ['Name the parts of a plant cell', 'Explain the function of each part']);
  const tHu = await topic(s.id, sub.Humanities.id, 'Water cycle 水循環', ['Order the stages of the water cycle', 'Link causes and effects']);

  const algebra = act(s.id, sub.Mathematics.id, 'math', { title: 'Sample: Directed numbers & equations', topicId: tMa.id, objectiveId: tMa.objectives[1].id, instructions: 'Work it out. Show your steps on the scratchpad.', mode: 'revision', assesses: 'subject' },
    [
      { prompt: '(−7) + 12 = ?', answer: '5', workedSteps: ['Start at −7 and move 12 to the right.', '= 5'] },
      { prompt: '(−3) × (−4) = ?', answer: '12', workedSteps: ['Same signs → positive.', '3 × 4 = 12'] },
      { prompt: '3x + 5 = 20. x = ?', answer: '5', workedSteps: ['3x = 20 − 5 = 15', 'x = 15 ÷ 3 = 5'] },
      { prompt: '2/3 + 1/4 = ?', answer: '11/12', alternatives: [], workedSteps: ['Common denominator 12: 8/12 + 3/12', '= 11/12'] },
    ]);
  const explain = act(s.id, sub.Mathematics.id, 'short-answer', { title: 'Sample: Explain your reasoning', topicId: tMa.id, instructions: 'Explain in full sentences.', mode: 'assessment' },
    [{ prompt: 'Why is (−2) × (−5) positive? Explain using a pattern.', lang: 'en', answerStatus: 'none', markingNotes: 'Look for a pattern such as 2×(−5)=−10, 1×(−5)=−5, 0×(−5)=0 … each step +5. Partial credit for a correct rule without reasoning.' }]);
  const cellImg = await plantCellImage();
  const cellFile = cellImg ? await saveFile(cellImg, 'sample-plant-cell.png', 'upload') : undefined;
  const cell = act(s.id, sub.Science.id, 'label-diagram', { title: 'Sample: Label a plant cell', topicId: tSc.id, objectiveId: tSc.objectives[0].id, instructions: 'Choose the label for each numbered part.' },
    [{ prompt: 'Plant cell 植物細胞', imageFileId: cellFile, emoji: cellFile ? undefined : '🟩', markers: [{ x: 0.06, y: 0.5, label: 'Cell wall 細胞壁' }, { x: 0.47, y: 0.42, label: 'Nucleus 細胞核' }, { x: 0.25, y: 0.22, label: 'Chloroplast 葉綠體' }, { x: 0.62, y: 0.7, label: 'Vacuole 液泡' }] }]);
  const cellMc = act(s.id, sub.Science.id, 'multiple-choice', { title: 'Sample: Cell parts quiz', topicId: tSc.id, objectiveId: tSc.objectives[1].id, instructions: 'Choose the best answer.', mode: 'assessment' },
    [
      { prompt: 'Which part controls the activities of the cell?', lang: 'en', choices: ['Nucleus', 'Cell wall', 'Vacuole'], answer: 'Nucleus', explanation: 'The nucleus contains genetic material and controls cell activities.' },
      { prompt: 'Where does photosynthesis take place?', lang: 'en', choices: ['Chloroplast', 'Cell membrane', 'Nucleus'], answer: 'Chloroplast' },
    ]);
  const water = act(s.id, sub.Humanities.id, 'sequencing', { title: 'Sample: The water cycle', topicId: tHu.id, objectiveId: tHu.objectives[0].id, instructions: 'Put the stages in order.' },
    [{ prompt: 'Start with water in the sea.', lang: 'en', tokens: ['Evaporation 蒸發', 'Condensation 凝結', 'Precipitation 降水', 'Collection 匯集'] }]);
  const cause = act(s.id, sub.Humanities.id, 'matching', { title: 'Sample: Causes and effects', topicId: tHu.id, objectiveId: tHu.objectives[1].id, instructions: 'Match each cause with its effect.' },
    [{ prompt: '', lang: 'en', pairs: [{ left: 'Heavy rain for days', right: 'Flooding' }, { left: 'No rain for months', right: 'Drought' }, { left: 'Cutting down forests', right: 'Soil erosion' }] }]);
  const read = act(s.id, sub.English.id, 'multiple-choice', { title: 'Sample: Reading comprehension', instructions: 'Read the passage and answer.', skill: 'comprehension', assesses: 'both', passage: 'Hong Kong has a wet season from May to September. During this time, typhoons may bring strong winds and heavy rain. Schools may close when the Black Rainstorm Signal is issued.' },
    [
      { prompt: 'When is the wet season in Hong Kong?', lang: 'en', choices: ['May to September', 'October to April', 'All year'], answer: 'May to September' },
      { prompt: 'What may happen when the Black Rainstorm Signal is issued?', lang: 'en', choices: ['Schools may close', 'It becomes sunny', 'Typhoons stop'], answer: 'Schools may close' },
    ]);
  await db.activities.bulkAdd([algebra, explain, cell, cellMc, water, cause, read]);

  const test = blankMaterial(s.id, sub.Mathematics.id, 'test');
  Object.assign(test, { title: 'Sample: Uniform test scope — Ch.1–2', topicId: tMa.id, assessmentDate: addDays(today(), 10), isSample: true, status: 'reviewed', pastedText: 'Ch.1 Directed numbers\nCh.2 Introduction to algebra\n1. Simplify 3a + 2a − a\n2. Solve 4x − 7 = 13', extraction: { status: 'done', method: 'Pasted text' } });
  test.items = itemsFromPaste(test.pastedText, 'test');
  test.answerKey = { fileIds: [], notes: '', answers: [{ ref: '1', answer: '4a', alternatives: [], status: 'approved' }, { ref: '2', answer: '5', alternatives: ['x = 5', 'x=5'], status: 'approved' }] };
  await db.materials.add(test);

  await db.lessons.add({
    id: uid('l_'),
    studentId: s.id,
    date: addDays(today(), 2),
    time: '18:00',
    title: 'Sample: Algebra + cells + water cycle',
    objectives: ['Solve two-step equations', 'Name parts of a plant cell'],
    scopeIds: [test.id],
    topicIds: [tMa.id, tSc.id, tHu.id],
    steps: [
      step('review', 'activity', water.title, 5, water.id),
      step('new', 'activity', algebra.title, 15, algebra.id),
      step('guided', 'activity', cell.title, 10, cell.id),
      step('exercise', 'activity', cause.title, 8, cause.id),
      step('assessment', 'activity', cellMc.title, 5, cellMc.id),
      step('recap', 'activity', explain.title, 5, explain.id),
    ],
    tutorNotes: 'Sample: test on Ch.1–2 in 10 days.',
    liveNotes: '',
    status: 'planned',
    currentStep: 0,
    isSample: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
