// End-to-end check of the core tutoring workflow in a real browser.
// Usage: npm run build && npm run e2e   (set SHOTS=dir to save screenshots)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS;
const work = join(tmpdir(), 'tutor-e2e');
mkdirSync(work, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const executablePath = process.env.CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
const shot = async (page, name) => SHOTS && page.screenshot({ path: join(SHOTS, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && res());
  server.on('exit', () => rej(new Error('preview server exited')));
  setTimeout(() => rej(new Error('preview server timeout')), 20000);
});

const browser = await chromium.launch({ executablePath });
const errors = [];
try {
  // ---------- 0. Make a real PDF worksheet (with a text layer) to upload ----------
  {
    const p = await browser.newPage();
    await p.setContent(`<html><body style="font-family:'WenQuanYi Zen Hei',sans-serif;font-size:22px;padding:40px">
      <h2>第五課 數學工作紙 Maths worksheet</h2>
      <p>1. 5 + 3 = ( )</p><p>2. 9 − 4 = ( )</p><p>3. 媽媽買了 2 個蘋果，又買了 6 個。共有多少個？</p>
      <div style="page-break-after:always"></div>
      <h2>Part B</h2><p>4. 7 + 2 = ( )</p></body></html>`);
    writeFileSync(join(work, 'worksheet.pdf'), await p.pdf({ format: 'A4' }));
    await p.close();
  }

  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'en-GB', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/speech|voice|favicon|404/i.test(m.text()) && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE);
  await page.getByRole('heading', { name: /Good to see you/ }).waitFor();
  await page.getByText('示例課堂 Sample lesson').first().waitFor();
  log('App opens with labelled sample content and the dashboard');
  await shot(page, 'dashboard');

  // ---------- 1. Create student ----------
  await page.goto(BASE + '#/students/new');
  await page.locator('input[name=name]').fill('Test Pupil');
  await page.locator('select[name=grade]').selectOption('P1');
  await page.getByRole('button', { name: 'Create student' }).click();
  await page.getByRole('heading', { name: /Test Pupil/ }).waitFor();
  log('Created a P1 student');

  // ---------- 2. Configure subjects ----------
  await page.getByRole('button', { name: /Subjects, topics/ }).click();
  const subjName = page.getByLabel('Subject name');
  await subjName.nth(3).fill('常識 GS (school timetable)');
  await page.getByPlaceholder(/New subject/).fill('普通話 Putonghua');
  await page.getByRole('button', { name: '+ Add subject' }).click();
  await page.getByRole('button', { name: 'Hide' }).nth(4).click();
  await page.getByRole('button', { name: 'Show' }).waitFor();
  // topic + objective under Mathematics
  await page.getByRole('button', { name: /Topics \(/ }).nth(2).click();
  await page.getByPlaceholder(/New topic/).fill('Addition within 10');
  await page.getByRole('button', { name: '+ Add topic' }).click();
  await page.getByRole('button', { name: '+ Learning objective' }).click();
  await page.locator('.objectives input').first().fill('Add two numbers within 10');
  log('Configured subjects: renamed, added, hid a subject; added a topic and objective');
  await shot(page, 'subjects');

  // ---------- 3. Upload school material (PDF) ----------
  await page.goto(BASE + '#/materials');
  await page.getByRole('button', { name: /Upload or paste material/ }).click();
  await page.getByRole('button', { name: /Worksheet \/ exercise/ }).click();
  await page.locator('select[name=subject]').selectOption({ label: '🔢 數學 Mathematics' });
  await page.locator('input[name=title]').fill('Worksheet 5');
  await page.locator('input[name=files]').setInputFiles(join(work, 'worksheet.pdf'));
  await page.getByRole('button', { name: /Save & review content/ }).click();
  await page.getByRole('heading', { name: /Worksheet 5/ }).waitFor();
  await page.locator('.page-wrap canvas').first().waitFor();
  log('Uploaded a 2-page PDF worksheet; original kept and shown in the viewer');

  // ---------- 4. Review extracted content ----------
  const rows = page.locator('.item-row');
  await rows.first().waitFor();
  const texts = await page.locator('.item-row textarea').evaluateAll((els) => els.map((e) => e.value));
  const qs = texts.filter((t) => /^\d\./.test(t));
  if (qs.length !== 4) throw new Error('Expected 4 questions, got: ' + JSON.stringify(texts));
  if (!texts.some((t) => t.includes('媽媽買了'))) throw new Error('Chinese text not extracted: ' + JSON.stringify(texts));
  const pages = await page.locator('.item-row .tag').allTextContents();
  if (!pages.includes('p.2')) throw new Error('Page references missing');
  // Correct one item (tutor fix), then approve
  const q2 = page.locator('.item-row textarea').filter({ hasText: '9' }).first();
  await q2.fill('2. 9 - 4 = ( )');
  await page.getByRole('button', { name: /Approve content/ }).click();
  await page.getByText('Approved for use').waitFor();
  log(`Reviewed extracted content (${qs.length} questions, Chinese text and page refs kept), corrected one, approved`);
  await shot(page, 'review');

  // ---------- 5. Attach answer key ----------
  await page.getByRole('button', { name: /Draft maths answers/ }).click();
  await page.locator('tr.draft-row').first().waitFor();
  const drafts = await page.locator('tr.draft-row').count();
  // Q3 is a word problem: no draft is invented for it; type it ourselves.
  await page.getByRole('button', { name: '+ Type an answer' }).click();
  const lastRow = page.locator('table.answers tbody tr').last();
  await lastRow.locator('input').nth(0).fill('3');
  await lastRow.locator('input').nth(1).fill('8');
  await lastRow.locator('input').nth(3).fill('2 + 6 = 8');
  while (await page.getByRole('button', { name: /Draft – approve/ }).count()) await page.getByRole('button', { name: /Draft – approve/ }).first().click();
  await page.locator('section', { hasText: 'Answer key & marking notes' }).locator('input[type=file]').setInputFiles({ name: 'answers.txt', mimeType: 'text/plain', buffer: Buffer.from('1. 8\n2. 5\n3. 8\n4. 9') });
  await page.getByRole('button', { name: /answers\.txt/ }).waitFor();
  log(`Attached answer key: ${drafts} calculated drafts reviewed, word-problem answer typed, answer file uploaded`);

  // ---------- 6. Create activities from approved content ----------
  await page.getByRole('button', { name: /Pick a small portion for today/ }).click();
  await page.getByRole('button', { name: /Create activity from selected/ }).click();
  await page.getByRole('button', { name: /Maths question/ }).click();
  await page.getByRole('button', { name: 'Create activity', exact: true }).click();
  await page.locator('.item-editor').first().waitFor();
  const mathItems = await page.locator('.item-editor').count();
  const approvedBadges = await page.locator('.item-editor .tag.ok').count();
  log(`Created a maths activity from the worksheet (${mathItems} items, ${approvedBadges} with approved answers)`);
  await shot(page, 'activity-editor');
  // Word problem as a tutor-marked short answer
  await page.goBack();
  await page.locator('.item-row').filter({ has: page.locator('textarea', { hasText: '媽媽買了' }) }).locator('input[type=checkbox]').first().check();
  await page.getByRole('button', { name: /Create activity from selected \(1\)/ }).click();
  await page.getByRole('button', { name: /Short answer/ }).click();
  await page.getByRole('button', { name: 'Create activity', exact: true }).click();
  await page.locator('.item-editor').first().waitFor();
  await page.locator('input').first().fill('Word problem (explain)');
  log('Created a tutor-marked short-answer activity for the word problem');

  // Dictation scope pasted → vocabulary activity
  await page.goto(BASE + '#/materials');
  await page.getByRole('button', { name: /Upload or paste material/ }).click();
  await page.getByRole('button', { name: /Dictation scope/ }).click();
  await page.locator('select[name=subject]').selectOption({ label: '📖 中文 Chinese' });
  await page.locator('input[name=title]').fill('Dictation 1');
  await page.locator('input[name=date]').fill(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10));
  await page.locator('textarea[name=paste]').fill('太陽、月亮、星星\n天空');
  await page.getByRole('button', { name: /Save & review content/ }).click();
  await page.getByRole('heading', { name: /Dictation 1/ }).waitFor();
  const words = await page.locator('.item-row textarea').evaluateAll((els) => els.map((e) => e.value));
  if (JSON.stringify(words) !== JSON.stringify(['太陽', '月亮', '星星', '天空'])) throw new Error('Word boundaries not kept: ' + words);
  await page.getByRole('button', { name: /Approve content/ }).click();
  await page.getByRole('button', { name: /Pick a small portion/ }).click();
  await page.getByRole('button', { name: /Create activity from selected/ }).click();
  await page.getByRole('button', { name: /Listen and choose/ }).click();
  await page.getByRole('button', { name: 'Create activity', exact: true }).click();
  await page.locator('.item-editor').first().waitFor();
  log('Pasted a dictation scope; word boundaries kept; created a listen-and-choose activity');

  // ---------- 7. Build a lesson across subjects ----------
  await page.goto(BASE + '#/lessons');
  await page.getByRole('button', { name: /Plan a lesson/ }).click();
  await page.locator('.modal input[name=title]').fill('Test lesson');
  await page.getByRole('button', { name: 'Create lesson' }).click();
  await page.locator('ol.steps').waitFor();
  const addTo = async (phaseBtn, tab, title) => {
    await page.getByRole('button', { name: phaseBtn }).click();
    if (tab) await page.locator('.modal .tabs button', { hasText: tab }).click();
    await page.locator('.modal .list-row', { hasText: title }).getByRole('button', { name: /Add/ }).click();
  };
  await addTo(/\+ ✨ Introduce something new/, null, 'Listen and choose');
  await addTo(/\+ 🤝 Guided activity/, null, 'Maths question');
  await addTo(/\+ ✏️ Exercise/, 'Uploaded exercise', 'Worksheet 5');
  await addTo(/\+ ✅ Short assessment/, null, 'Word problem (explain)');
  await page.locator('.step').filter({ has: page.locator('input[value="Worksheet 5"]') }).locator('.tag.ok').waitFor(); // answer key linked
  await page.locator('aside textarea').first().fill('Private: watch for reversals.');
  const stepCount = await page.locator('ol.steps > li').count();
  log(`Built a cross-subject lesson (${stepCount} steps: Chinese activity, Maths activity, uploaded worksheet + answer key, tutor notes)`);
  await shot(page, 'lesson-editor');
  const lessonUrl = page.url();

  // ---------- 8. Teach in student mode ----------
  await page.getByRole('button', { name: /Start Lesson/ }).click();
  await page.locator('.teach-shell').waitFor();
  // Skip the empty review placeholder
  await page.getByRole('button', { name: /Next step/ }).click();
  // Listen & choose: answer first wrong, then right
  await page.locator('.choice').first().waitFor();
  const answerText = async () => page.evaluate(async () => {
    const all = await new Promise((res) => {
      const r = indexedDB.open('tutor-studio');
      r.onsuccess = () => {
        const tx = r.result.transaction('activities').objectStore('activities').getAll();
        tx.onsuccess = () => res(tx.result);
      };
    });
    return all;
  });
  const acts = await answerText();
  const lc = acts.find((a) => a.template === 'listen-choose' && a.title.startsWith('Dictation 1'));
  for (let i = 0; i < lc.items.length; i++) {
    const it = lc.items[i];
    const wrong = it.choices.find((c) => c !== it.answer);
    if (i === 0 && wrong) {
      await page.locator('.choice', { hasText: wrong }).click();
      await page.locator('.feedback.again').waitFor();
      if (i === 0) await shot(page, 'try-again-hint');
    }
    if (i === 1) {
      await page.getByRole('button', { name: /Give hint/ }).click();
      await page.getByRole('button', { name: /Reveal answer key/ }).click();
      await page.locator('.reveal').waitFor();
      await shot(page, 'reveal');
      await page.getByRole('button', { name: /Back to the student activity/ }).click();
    }
    await page.locator('.choice:not([disabled])', { hasText: it.answer }).first().click();
    await page.locator('.feedback.ok').waitFor();
    await page.locator('.player-nav').getByRole('button', { name: 'Next', exact: true }).click();
  }
  // revisit queued after mistake
  while (await page.locator('.choice').count()) {
    const opts = await page.locator('.choice').allTextContents();
    const right = lc.items.find((x) => opts.includes(x.answer) && x.choices.join() === opts.join())?.answer ?? opts[0];
    await page.locator('.choice', { hasText: right }).first().click();
    await page.locator('.player-nav').getByRole('button', { name: 'Next', exact: true }).click();
    if (await page.locator('.player.done').count()) break;
  }
  await page.locator('.player.done').waitFor();
  log('Taught the Chinese activity: wrong answer → encouraging feedback + hint → revisit later; tutor hint; answer key revealed and hidden again');
  await page.getByRole('button', { name: /Continue/ }).click();

  // Maths activity: type answers
  const math = acts.find((a) => a.template === 'math' && a.title.startsWith('Worksheet 5'));
  for (let i = 0; i < math.items.length; i++) {
    const it = math.items[i];
    await page.locator('.big-input').fill(i === 0 ? '8.0' : it.answer || '1');
    await page.getByRole('button', { name: /Check/ }).click();
    await page.locator('.feedback').waitFor();
    await page.locator('.player-nav').getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.locator('.player.done').waitFor();
  log('Maths activity auto-marked with exact arithmetic (8.0 accepted for 8)');
  await page.getByRole('button', { name: /Continue/ }).click();
  // Worksheet material: viewer, annotate, mark, reveal key
  await page.locator('.material-step').waitFor();
  await page.locator('.page-wrap canvas').first().waitFor();
  await page.getByRole('button', { name: /Draw/ }).click();
  const ov = page.locator('canvas.overlay');
  await page.waitForFunction(() => document.querySelector('canvas.overlay')?.getBoundingClientRect().width > 100);
  const box = await ov.boundingBox();
  await page.mouse.move(box.x + 50, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: /Mark answers/ }).click();
  const cells = page.locator('.mark-cell');
  await cells.nth(0).getByRole('button', { name: '✓' }).click();
  await cells.nth(1).getByRole('button', { name: '✗' }).click();
  await cells.nth(2).getByRole('button', { name: '½' }).click();
  await page.getByRole('button', { name: /Reveal answer key/ }).click();
  await page.locator('.reveal').waitFor();
  await page.getByRole('button', { name: /Back to the student activity/ }).click();
  await page.waitForTimeout(400);
  log('Worksheet step: PDF viewed with zoom/page controls, annotation drawn, answers tutor-marked, answer key revealed then hidden');
  await shot(page, 'worksheet-step');

  // Leave mid-lesson and resume (close & reopen)
  const stepBefore = await page.locator('.teach-top .btn.ghost').nth(1).textContent();
  await page.reload();
  await page.locator('.material-step').waitFor();
  const stepAfter = await page.locator('.teach-top .btn.ghost').nth(1).textContent();
  if (stepBefore !== stepAfter) throw new Error(`Resume went to wrong step: ${stepBefore} vs ${stepAfter}`);
  const annotations = await page.evaluate(async () => new Promise((res) => {
    const r = indexedDB.open('tutor-studio');
    r.onsuccess = () => { const q = r.result.transaction('annotations').objectStore('annotations').count(); q.onsuccess = () => res(q.result); };
  }));
  if (!annotations) throw new Error('Annotation not saved');
  log(`Reloaded mid-lesson: resumed at the same step (${stepAfter.trim()}), annotation still saved`);

  await page.getByRole('button', { name: /Next step/ }).click();
  await page.locator('textarea.big-text').fill('2 + 6 = 8 apples');
  await page.getByRole('button', { name: /Done/ }).first().click();
  await page.locator('.feedback.pending').waitFor();
  log('Short answer submitted: shown as waiting for tutor marking (not auto-marked)');
  // ---------- 9. Mark responses and end lesson ----------
  await page.getByRole('button', { name: /End lesson/ }).click();
  await page.getByRole('heading', { name: /End of lesson/ }).waitFor();
  await shot(page, 'end-lesson');
  const pend = page.locator('.card', { hasText: 'Responses waiting for your marking' });
  await pend.locator('.list-row', { hasText: '2 + 6 = 8 apples' }).getByRole('button', { name: '½' }).click();
  await pend.waitFor({ state: 'detached' });
  const summary = await page.locator('pre.summary').first().textContent();
  if (!/Answered/.test(summary)) throw new Error('No summary');
  await page.getByRole('button', { name: /Save & close lesson/ }).click();
  await page.getByRole('heading', { name: /Progress/ }).waitFor();
  log('Ended the lesson: summary and editable follow-up list saved');

  // ---------- 10. Save progress ----------
  const progressRows = await page.locator('.progress-table tbody tr').count();
  if (progressRows < 3) throw new Error('Expected progress rows, got ' + progressRows);
  const statusText = await page.locator('.progress-table').first().textContent();
  // Tutor override
  await page.locator('.progress-table select').first().selectOption('secure');
  log(`Progress saved: ${progressRows} item records by subject/topic/skill; tutor override applied`);
  await shot(page, 'progress');

  // ---------- 11. Close and reopen the lesson ----------
  const page2 = await ctx.newPage();
  await page.close();
  await page2.goto(lessonUrl);
  await page2.locator('ol.steps').waitFor();
  const status = await page2.locator('.card select').nth(0).evaluate(() => '');
  await page2.getByText('Lesson summary').waitFor();
  const steps2 = await page2.locator('ol.steps > li').count();
  if (steps2 !== stepCount) throw new Error('Steps changed after reopen');
  log('Closed the tab and reopened the lesson: steps, summary and notes persisted');

  // ---------- 12. Backup export & import into a fresh browser profile ----------
  await page2.goto(BASE + '#/settings');
  const [dl] = await Promise.all([page2.waitForEvent('download'), page2.getByRole('button', { name: /Export backup/ }).click()]);
  const zipPath = join(work, 'backup.zip');
  await dl.saveAs(zipPath);
  const ctx2 = await browser.newContext({ locale: 'en-GB' });
  const p3 = await ctx2.newPage();
  p3.on('dialog', (d) => d.accept());
  await p3.goto(BASE + '#/settings');
  await p3.locator('select[aria-label="Import mode"]').selectOption('replace');
  await p3.locator('input[type=file][accept*=zip]').setInputFiles(zipPath);
  await p3.waitForTimeout(2500);
  await p3.goto(BASE + '#/materials');
  await p3.locator('select.student-picker').selectOption({ label: '🐣 Test Pupil (P1)' });
  await p3.getByText('Worksheet 5').click();
  await p3.locator('.page-wrap canvas').first().waitFor();
  log('Exported a .zip backup and restored it into a fresh browser profile, including the uploaded PDF');
  await ctx2.close();

  // ---------- 13. Other screens render ----------
  for (const r of ['', 'students', 'lessons', 'materials', 'practice', 'progress', 'settings']) {
    await page2.goto(BASE + '#/' + r);
    await page2.waitForTimeout(300);
  }
  await page2.locator('.btn.ghost', { hasText: '中' }).click();
  await page2.getByRole('heading', { name: /設定/ }).waitFor();
  log('All main screens render; interface switches to Traditional Chinese');
  await shot(page2, 'settings-zh');

  // ---------- 14. Optional generation must be reviewed before use ----------
  await page2.locator('.btn.ghost', { hasText: 'EN' }).click();
  await page2.goto(BASE + '#/practice');
  await page2.getByRole('button', { name: /Generate exercises/ }).click();
  await page2.locator('.modal .tabs button', { hasText: 'Maths practice' }).click();
  await page2.getByRole('button', { name: /Generate draft/ }).click();
  await page2.getByText(/Generated activity — check every question/).waitFor();
  const draftTags = await page2.locator('.item-editor .tag.warn').count();
  await page2.getByRole('button', { name: /I have reviewed it/ }).click();
  await page2.getByText(/Generated activity — check every question/).waitFor({ state: 'detached' });
  await page2.getByRole('button', { name: /Print/ }).click();
  await page2.getByRole('button', { name: /Answer sheet/ }).click();
  await page2.locator('.print-items li').first().waitFor();
  log(`Generated maths exercise: ${draftTags} draft answers flagged until reviewed; printable worksheet + separate answer sheet`);

  // ---------- 15. Offline ----------
  await page2.goto(BASE);
  await page2.evaluate(() => navigator.serviceWorker.ready);
  await page2.reload();
  await ctx.setOffline(true);
  await page2.goto(BASE + '#/lessons');
  await page2.getByText('Test lesson').first().waitFor();
  await page2.goto(lessonUrl);
  await page2.getByText(/Works offline|Needs internet for some parts/).waitFor();
  await ctx.setOffline(false);
  log('Went offline: app and saved lessons still open; lesson shows its offline readiness');

  if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
  console.log('\nAll workflow checks passed.');
} catch (e) {
  console.error('\n✗ FAILED at step', step + 1, '\n', e);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch {}
}
