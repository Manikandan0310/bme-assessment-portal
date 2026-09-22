# Online Assessment Portal

A static, GitHub-Pages-hosted MCQ test platform with webcam proctoring.

## What's inside
```
index.html          Student flow: login → instructions → proctored test → result
admin.html           Faculty tool: CSV → data files, and result CSVs → rank list
css/style.css
js/app.js             Student-side logic (login, proctoring, scoring, CSV export)
js/admin.js           Admin-side logic (CSV parsing, file generation)
data/students-data.js Login list the site actually reads (edit via admin.html)
data/questions-data.js Question bank the site actually reads (edit via admin.html)
data/sample-*.csv     Example CSVs in the exact column format admin.html expects
```

## Deploying
1. Push this folder to a GitHub repo.
2. Settings → Pages → deploy from the `main` branch, root folder.
3. Your site is live at `https://<username>.github.io/<repo>/`.

## Updating students or questions
GitHub Pages only serves files — there's no server to accept a live upload. So:
1. Open `admin.html` **locally** (just double-click it, or serve the folder).
2. Upload your CSV (see `data/sample-students.csv` / `data/sample-questions.csv` for the exact columns).
3. Click **Download students-data.js** / **questions-data.js**.
4. Replace the matching file in `data/` and commit + push. The live site updates immediately.

## Collecting results / building the rank list
Each student's browser auto-downloads `result_<username>.csv` the moment they submit — it never goes anywhere else, because there's no server to send it to. So:
1. Have students email you that file, or drop it into a shared folder (Drive/Classroom/etc.) right after the test.
2. Open `admin.html` → **3. Build the rank list** → select all the result files at once.
3. Download `rank_list.csv` — sorted by score, tie-broken by faster completion time.

## Proctoring
- The right-side circular preview uses `getUserMedia` for the live camera feed.
- Face presence is checked ~every second with [face-api.js](https://github.com/vladmandic/face-api)'s tiny face detector (loaded from a CDN, no install needed). No face for >2.5s → red ring + warning + a logged violation. More than one face → also flagged (possible second person).
- Switching tabs or minimizing the window is logged as a violation too.
- If the face-detection model can't load (offline network, CDN blocked), the camera preview still runs but the ring stays neutral — the test isn't blocked, you just lose automatic flagging for that session.

## Important limitation — please read before using this for graded/high-stakes exams
This is a **fully static site**: there is no backend, database, or server-side scoring. That has one real consequence:

**The correct answers live in the browser** (inside `questions-data.js`, loaded into the page). A student who opens their browser's developer tools during the test can see the answer key. There's no way to fully prevent this without a real backend that scores answers server-side and never ships the key to the client.

For low/medium-stakes quizzes, practice tests, or classes where this risk is acceptable, this platform works well as-is. If you need tamper-proof scoring for a high-stakes exam, the next step up would be adding a small backend (e.g., a free-tier service like Supabase, Firebase, or a Google Apps Script Web App) that stores the answer key server-side and only returns a score — happy to help wire that up if you want to go that route later.

## Customizing
- Colors/typography: `css/style.css` (top of file has the palette as CSS variables).
- Number of questions, question text: `data/questions-data.js` or re-upload via `admin.html`.
- Proctoring sensitivity (how long a missing face is tolerated before flagging, detection frequency): the `2500` (ms) and `900` (ms) values near the top of the proctoring section in `js/app.js`.
