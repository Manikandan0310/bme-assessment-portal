/* ============================================================
   Online Assessment Portal — client logic
   No server: STUDENTS / QUESTIONS come from data/*.js (generated
   by admin.html from your CSVs and committed to the repo).
   ============================================================ */

const FACE_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

const state = {
  student: null,          // {username, name}
  answers: {},            // {questionIndex: "A"|"B"|"C"|"D"}
  current: 0,
  violations: 0,
  violationLog: [],
  startedAt: null,
  faceMissingSince: null,
  camStream: null,
  detectTimer: null,
  clockTimer: null,
  modelsReady: false
};

const $ = (id) => document.getElementById(id);
const views = {
  login: $("view-login"),
  instructions: $("view-instructions"),
  test: $("view-test"),
  result: $("view-result")
};
function showView(name){
  Object.values(views).forEach(v => v.style.display = "none");
  views[name].style.display = "";
}

/* ---------------- clock in header ---------------- */
setInterval(() => {
  $("clockLine").textContent = new Date().toLocaleString();
}, 1000);

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ---------------- LOGIN ---------------- */
$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const u = $("username").value.trim();
  const p = $("password").value;
  const match = (window.STUDENTS || []).find(s => s.username === u && s.password === p);
  if (!match){
    $("loginError").classList.add("show");
    return;
  }
  $("loginError").classList.remove("show");
  state.student = { username: match.username, name: match.name || match.username };
  $("instrName").textContent = state.student.name;
  $("qCountLabel").textContent = (window.QUESTIONS || []).length;
  showView("instructions");
});

/* ---------------- INSTRUCTIONS / CAMERA START ---------------- */
$("camConsent").addEventListener("change", (e) => {
  $("startBtn").disabled = !e.target.checked;
});

$("startBtn").addEventListener("click", async () => {
  $("camError").classList.remove("show");
  $("startBtn").disabled = true;
  $("startBtn").textContent = "Requesting camera…";
  try{
    state.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320 }, audio: false });
    $("camVideo").srcObject = state.camStream;
    $("startBtn").textContent = "Loading proctoring model…";
    await loadFaceModels();
    beginTest();
  }catch(err){
    console.error(err);
    $("camError").classList.add("show");
    $("startBtn").disabled = false;
    $("startBtn").textContent = "Enable camera & start test";
  }
});

async function loadFaceModels(){
  if (state.modelsReady) return;
  try{
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
    state.modelsReady = true;
  }catch(err){
    // Face-detection model failed to load (e.g. offline / CDN blocked).
    // Proceed without AI detection rather than blocking the test —
    // the camera preview still runs, just without auto red/green flagging.
    console.warn("Face model unavailable, proctoring will run in preview-only mode.", err);
    state.modelsReady = false;
  }
}

/* ---------------- TEST FLOW ---------------- */
function beginTest(){
  state.startedAt = Date.now();
  state.current = 0;
  state.answers = {};
  state.violations = 0;
  state.violationLog = [];
  $("topName").textContent = state.student.name;
  showView("test");
  renderQuestion();
  startProctoring();
  startClock();
  window.addEventListener("visibilitychange", onVisibilityChange);
}

function startClock(){
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(() => {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("elapsed").textContent = `${mm}:${ss}`;
  }, 1000);
}

function onVisibilityChange(){
  if (document.hidden){
    logViolation("Left the browser tab/window");
  }
}

function renderQuestion(){
  const Q = window.QUESTIONS || [];
  const q = Q[state.current];
  $("qIndex").textContent = `QUESTION ${state.current + 1} OF ${Q.length}`;
  $("qText").textContent = q.q;
  $("qAnsweredFlag").textContent = state.answers[state.current] ? "Answered" : "Not answered";

  const box = $("qOptions");
  box.innerHTML = "";
  Object.entries(q.options).forEach(([letter, text]) => {
    const row = document.createElement("label");
    row.className = "opt" + (state.answers[state.current] === letter ? " selected" : "");
    row.innerHTML = `<span class="letter">${letter}</span><span class="txt">${escapeHtml(text)}</span>
      <input type="radio" name="opt" value="${letter}" ${state.answers[state.current] === letter ? "checked" : ""}>`;
    row.addEventListener("click", () => {
      state.answers[state.current] = letter;
      renderQuestion();
    });
    box.appendChild(row);
  });

  $("prevBtn").disabled = state.current === 0;
  const isLast = state.current === Q.length - 1;
  $("nextBtn").style.display = isLast ? "none" : "";
  $("submitBtn").style.display = isLast ? "" : "none";

  const pct = ((state.current + 1) / Q.length) * 100;
  $("progFill").style.height = pct + "%";
  $("progCount").textContent = `${state.current + 1} / ${Q.length}`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

$("prevBtn").addEventListener("click", () => { if (state.current > 0){ state.current--; renderQuestion(); } });
$("nextBtn").addEventListener("click", () => {
  const Q = window.QUESTIONS || [];
  if (state.current < Q.length - 1){ state.current++; renderQuestion(); }
});
$("submitBtn").addEventListener("click", submitTest);

/* ---------------- PROCTORING (face-api tiny detector) ---------------- */
function startProctoring(){
  const frame = $("camFrame");
  const status = $("camStatus");
  const warn = $("camWarn");
  clearInterval(state.detectTimer);

  if (!state.modelsReady){
    status.textContent = "PREVIEW ONLY";
    warn.classList.remove("show");
    return; // camera still shown, just no automated flagging
  }

  state.detectTimer = setInterval(async () => {
    const video = $("camVideo");
    if (!video || video.readyState < 2) return;
    try{
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
      if (detections.length === 0){
        setFrameAlert(true);
        if (!state.faceMissingSince){
          state.faceMissingSince = Date.now();
        } else if (Date.now() - state.faceMissingSince > 2500){
          logViolation("Face not visible in frame");
          state.faceMissingSince = Date.now(); // avoid re-logging every tick
        }
      } else if (detections.length > 1){
        setFrameAlert(true);
        logViolation("Multiple faces detected");
        state.faceMissingSince = null;
      } else {
        setFrameAlert(false);
        state.faceMissingSince = null;
      }
    }catch(err){
      console.warn("detection tick failed", err);
    }
  }, 900);
}

function setFrameAlert(on){
  const frame = $("camFrame");
  const status = $("camStatus");
  const warn = $("camWarn");
  frame.classList.toggle("alert", on);
  status.classList.toggle("alert", on);
  status.textContent = on ? "FACE NOT DETECTED" : "FACE OK";
  warn.classList.toggle("show", on);
}

function logViolation(reason){
  state.violations++;
  state.violationLog.push({ t: new Date().toISOString(), reason });
  $("violationCount").textContent = state.violations;
  toast(`Warning ${state.violations}: ${reason}`);
}

/* ---------------- SUBMIT & SCORE ---------------- */
function submitTest(){
  clearInterval(state.detectTimer);
  clearInterval(state.clockTimer);
  window.removeEventListener("visibilitychange", onVisibilityChange);
  if (state.camStream) state.camStream.getTracks().forEach(t => t.stop());

  const Q = window.QUESTIONS || [];
  let correct = 0;
  Q.forEach((q, i) => { if (state.answers[i] === q.correct) correct++; });

  state.lastResult = {
    username: state.student.username,
    name: state.student.name,
    correct, total: Q.length,
    violations: state.violations,
    submittedAt: new Date().toISOString(),
    elapsedSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    answers: state.answers
  };

  $("resultScore").textContent = `${correct} / ${Q.length}`;
  $("resultName").textContent = state.student.name;
  $("resultCorrect").textContent = correct;
  $("resultViolations").textContent = state.violations;
  showView("result");
  downloadResultCsv();
}

function downloadResultCsv(){
  const r = state.lastResult;
  const Q = window.QUESTIONS || [];
  const header = ["username","name","score","total","violations","submitted_at","elapsed_seconds",
    ...Q.map((_, i) => `q${i+1}`)];
  const row = [r.username, r.name, r.correct, r.total, r.violations, r.submittedAt, r.elapsedSeconds,
    ...Q.map((_, i) => r.answers[i] || "")];
  const csv = header.join(",") + "\n" + row.map(csvCell).join(",");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `result_${r.username}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function csvCell(v){
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

$("downloadAgainBtn").addEventListener("click", downloadResultCsv);
