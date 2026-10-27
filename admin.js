import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, getDocs, query, orderBy, doc, getDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let records = [];      // all attendance docs
let teamSizeSetting = null;
let computedCalls = []; // [{ n, date, entries[], pct }]

function show(view) {
  ["loginView", "loadingView", "dashView"].forEach((v) => $(v).classList.toggle("hidden", v !== view));
}
function msg(el, text, type = "error") {
  el.textContent = text;
  el.className = text ? `msg show ${type}` : "msg";
}
function prettyDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  });
}
function timeOf(ts) {
  try { return ts.toDate().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return "-"; }
}

/* ---------------- Auth ---------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) return show("loginView");
  show("loadingView");
  try {
    await loadData();
    $("adminEmail").textContent = user.email;
    show("dashView");
  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      await signOut(auth);
      show("loginView");
      msg($("loginMsg"), "Access denied. This account is not an authorised admin.");
    } else {
      show("loginView");
      msg($("loginMsg"), "Could not load data. Check your connection and Firestore setup.");
    }
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msg($("loginMsg"), "");
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) return msg($("loginMsg"), "Enter your email and password.");
  const btn = $("loginBtn");
  btn.disabled = true; btn.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const bad = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
    msg($("loginMsg"), bad.includes(err.code) ? "Incorrect email or password."
      : err.code === "auth/too-many-requests" ? "Too many attempts. Try again later."
      : "Sign in failed. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Sign in";
  }
});

$("resetBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return msg($("loginMsg"), "Type your email above first, then click Forgot password.");
  try {
    await sendPasswordResetEmail(auth, email);
    msg($("loginMsg"), "If this email is registered, a reset link has been sent.", "ok");
  } catch { msg($("loginMsg"), "Could not send reset email."); }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));
$("refreshBtn").addEventListener("click", async () => {
  try { await loadData(); } catch { alert("Refresh failed."); }
});

/* ---------------- Data ---------------- */
async function loadData() {
  const snap = await getDocs(query(collection(db, "attendance"), orderBy("date", "asc")));
  records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  try {
    const s = await getDoc(doc(db, "settings", "config"));
    teamSizeSetting = s.exists() ? Number(s.data().teamSize) || null : null;
  } catch { teamSizeSetting = null; }

  render();
}

$("teamSave").addEventListener("click", async () => {
  const v = $("teamInput").value.trim();
  const n = v === "" ? null : Math.max(1, parseInt(v, 10));
  try {
    await setDoc(doc(db, "settings", "config"), { teamSize: n });
    teamSizeSetting = n;
    render();
  } catch { alert("Could not save team size."); }
});

/* ---------------- Analytics + rendering ---------------- */
function compute() {
  const byDate = new Map();
  records.forEach((r) => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });
  const dates = [...byDate.keys()].sort();
  const uniquePeople = new Set(records.map((r) => r.nameKey)).size;
  const team = teamSizeSetting || uniquePeople || 0;

  computedCalls = dates.map((date, i) => {
    const entries = byDate.get(date).slice().sort((a, b) => a.name.localeCompare(b.name));
    return { n: i + 1, date, entries, pct: team ? Math.min(100, Math.round((entries.length / team) * 100)) : 0 };
  });
  return { team, uniquePeople };
}

function render() {
  const { team, uniquePeople } = compute();
  const calls = computedCalls;

  // stats
  $("sCalls").textContent = calls.length;
  const avg = calls.length ? Math.round(calls.reduce((a, c) => a + c.pct, 0) / calls.length) : 0;
  $("sAvg").textContent = avg + "%";
  const last = calls[calls.length - 1];
  $("sLatest").textContent = last ? last.pct + "%" : "0%";
  $("sLatestHint").textContent = last ? `Call ${last.n} · ${last.entries.length} present` : "No calls yet";
  $("sTeam").textContent = team;
  $("sTeamHint").textContent = teamSizeSetting ? "Set by admin" : `Auto (${uniquePeople} unique people)`;
  $("teamInput").value = teamSizeSetting || "";

  // chart
  $("chart").innerHTML = calls.length
    ? calls.map((c) => `
        <div class="bar-col" title="Call ${c.n}: ${c.entries.length} present (${c.pct}%)">
          <div class="bar-val">${c.pct}%</div>
          <div class="bar" style="height:${Math.max(c.pct, 2) * 1.6}px"></div>
          <div class="bar-label">Call ${c.n}</div>
        </div>`).join("")
    : `<div class="empty" style="width:100%">No attendance recorded yet.</div>`;

  renderCalls();

  // by project
  const proj = {};
  records.forEach((r) => { proj[r.position] = (proj[r.position] || 0) + 1; });
  const projRows = Object.entries(proj).sort((a, b) => b[1] - a[1]);
  $("projTable").innerHTML = projRows.length
    ? `<thead><tr><th>Position - Project</th><th>Entries</th><th>Share</th></tr></thead><tbody>` +
      projRows.map(([p, n]) => `<tr><td>${esc(p)}</td><td>${n}</td><td>${Math.round((n / records.length) * 100)}%</td></tr>`).join("") + `</tbody>`
    : `<tbody><tr><td class="empty">No data</td></tr></tbody>`;

  // by employee
  const emp = new Map();
  records.forEach((r) => {
    const e = emp.get(r.nameKey) || { name: r.name, position: r.position, count: 0 };
    e.count++; e.name = r.name; e.position = r.position;
    emp.set(r.nameKey, e);
  });
  const empRows = [...emp.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  $("empTable").innerHTML = empRows.length
    ? `<thead><tr><th>Name</th><th>Position - Project</th><th>Attended</th><th>Attendance %</th></tr></thead><tbody>` +
      empRows.map((e) => `<tr><td>${esc(e.name)}</td><td>${esc(e.position)}</td><td>${e.count} / ${calls.length}</td><td><span class="pill ${e.count / calls.length < 0.5 ? "red" : ""}">${Math.round((e.count / calls.length) * 100)}%</span></td></tr>`).join("") + `</tbody>`
    : `<tbody><tr><td class="empty">No data</td></tr></tbody>`;
}

function renderCalls() {
  const q = $("search").value.trim().toLowerCase();
  const list = computedCalls.slice().reverse(); // newest first
  const html = list.map((c) => {
    const entries = q ? c.entries.filter((r) => r.name.toLowerCase().includes(q) || r.position.toLowerCase().includes(q)) : c.entries;
    if (q && !entries.length) return "";
    return `
      <details class="call" ${q ? "open" : ""}>
        <summary>
          <div><span class="title">Call ${c.n}</span> <span class="date">&middot; ${prettyDate(c.date)}</span></div>
          <div><span class="pill">${c.entries.length} present</span> <span class="pill red">${c.pct}%</span></div>
        </summary>
        <div class="body"><div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Name</th><th>Position - Project</th><th>Time</th><th></th></tr></thead>
          <tbody>${entries.map((r, i) => `
            <tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.position)}</td><td>${timeOf(r.createdAt)}</td>
            <td><button class="btn small danger-link" data-del="${esc(r.id)}">Delete</button></td></tr>`).join("")}
          </tbody></table></div></div>
      </details>`;
  }).join("");
  $("calls").innerHTML = html || `<div class="empty">No matching records.</div>`;
}

$("search").addEventListener("input", renderCalls);

$("calls").addEventListener("click", async (e) => {
  const id = e.target.dataset?.del;
  if (!id) return;
  if (!confirm("Delete this attendance entry?")) return;
  try { await deleteDoc(doc(db, "attendance", id)); await loadData(); }
  catch { alert("Could not delete entry."); }
});

/* ---------------- CSV export ---------------- */
$("csvBtn").addEventListener("click", () => {
  const rows = [["Call", "Date", "Name", "Position - Project", "Time"]];
  computedCalls.forEach((c) => c.entries.forEach((r) => rows.push([`Call ${c.n}`, c.date, r.name, r.position, timeOf(r.createdAt)])));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "tuesday-call-attendance.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});
