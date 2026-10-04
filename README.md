# Tutor Studio 導師教室

A browser app for a private tutor in Hong Kong: prepare lessons from school materials, teach on one laptop shared with the student, mark answers and track progress. Traditional Chinese is read aloud in Cantonese and English in English. The interface switches between 繁體中文 and English (button in the top bar).

Everything is stored in the browser on your computer (IndexedDB), including uploaded files and recordings. Nothing is sent to a server.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # open the address it prints, e.g. http://localhost:5173
```

To use it every day without a terminal, build once and host the `dist/` folder anywhere that serves static files:

```bash
npm run build      # creates dist/
npm run preview    # serves dist/ at http://localhost:4173
```

You can also publish it free on GitHub Pages: in the repository settings enable Pages with source "GitHub Actions", then run the **Deploy to GitHub Pages** workflow from the Actions tab. Each person who opens it keeps their own data in their own browser.

Open it once while online. After that the app opens and saved lessons work offline. In Chrome or Edge you can also choose **Install** in the address bar so it opens like a normal program.

Use Chrome, Edge or Safari in a normal window (private/incognito windows do not keep data).

## Prepare a lesson

1. **Students** → **Add student**. Choose the grade (P1 gets a playful student screen with large text and spoken instructions; P5/S1 get a more mature screen). Under **Subjects, topics & objectives** rename, add, reorder or hide subjects to match the school timetable, and add topics and learning objectives.
2. **Materials** → **Upload or paste material**. Choose the type (dictation scope, test/exam scope, worksheet, notes, vocabulary list, answer key, pictures), subject, optional topic and assessment date. Upload PDF, JPG, PNG, TXT or DOCX, or paste/type the content.
3. Review the extracted content next to the original. Fix anything misread. Items marked ⚠ could not be read reliably and cannot be used until you press **✓ Checked**. Use **✂️ Save picture** to keep a diagram from the page. Press **Approve content**.
4. Add the answer key under **Answer key & marking notes**: upload the school's answer file, type answers (with alternatives), or press **Draft maths answers** for plain arithmetic. Drafts are labelled and never used for marking until you approve them.
5. Tick the items for today (or **Pick a small portion for today**) and press **Create activity from selected**. Choose a template, then edit questions, choices, pictures, hints, worked steps and audio. Press 🎙 next to any word to record your own voice; the recording is reused everywhere that word appears.
6. **Lessons** → **Plan a lesson**. It starts with the sequence quick review → new → guided → exercise → assessment → recap. Add interactive activities, uploaded worksheets (their answer keys come with them) and tutor-led steps from any subject, reorder them and set minutes. **Add suggested review** puts the student's difficult items at the start. The **Lesson readiness** card shows anything missing and whether the lesson works offline.
7. Press **Start Lesson**. Every step opens in order. The student sees one task at a time; the tutor bar under each activity gives hints, marks oral/paper answers (✓, ½, ✗) and reveals the answer key in a separate panel that you close to go back. Worksheets open with page controls, zoom and a pen. **End lesson** lets you mark open answers, review the summary and edit the follow-up list. If you leave mid-lesson, **Resume** continues where you stopped.

Progress (Introduced, Practised with help, Answered independently, Needs revision, Secure) is kept separately for reading recognition, comprehension, subject understanding and spelling/dictation. Answers given after hearing the words read aloud, or after a hint, are recorded as supported. You can override any result on the **Progress** page.

## Back up your materials

**⚙️ Settings → Export backup (.zip)** downloads one file containing every student, lesson, activity, progress record, upload, recording and annotation. Keep it on a cloud drive or USB stick, especially before clearing browser data or changing computer.

To restore, choose **Import: merge** (adds to what is there) or **Import: replace everything**, then **Import backup**. The Settings page also shows how much space is used and lets you ask the browser to protect the data from automatic clean-up.

## What needs internet

- **OCR** (reading text from photos or scanned PDFs): downloads the recognition engine the first time. Results are always flagged for checking.
- **Online voices** (marked 🌐 in Settings). Record your own audio for offline use.
- **Find external exercises**: opens real websites (EDB, HKEdCity, Khan Academy, CUHK Cantonese dictionary, Oxford Owl) in a new tab.

Everything else works offline.

## Sample content

On first run the app adds two clearly labelled sample students (示例 Sample): a P1 pupil with Chinese and English vocabulary, maths, General Studies and a ready lesson for today, and an S1 pupil with algebra, science, humanities and reading comprehension. Remove them in **Settings → Remove sample content**.

## Development

```bash
npm test           # unit tests (marking, exact maths, extraction, progress rules)
npm run build
npm run e2e        # end-to-end check of the full tutoring workflow in Chromium
```

Built with React, TypeScript, Vite, Dexie (IndexedDB), pdf.js, mammoth (DOCX) and JSZip.
