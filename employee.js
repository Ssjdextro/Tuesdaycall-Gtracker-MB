import { db } from "./firebase-init.js";
import { POSITION_OPTIONS } from "./config.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// Today's date in the user's local timezone, as YYYY-MM-DD
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function prettyDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
}

const dateISO = todayISO();
$("date").value = prettyDate(dateISO);

// Fill dropdown
$("position").innerHTML =
  `<option value="" disabled selected>Select position &amp; project</option>` +
  POSITION_OPTIONS.map((o) => `<option value="${o}">${o}</option>`).join("");

function showMsg(text, type = "error") {
  const m = $("msg");
  m.textContent = text;
  m.className = `msg show ${type}`;
}

$("attForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("msg").className = "msg";

  const name = $("name").value.trim().replace(/\s+/g, " ");
  const position = $("position").value;

  if (name.length < 2) return showMsg("Please enter your full name.");
  if (!position) return showMsg("Please select your position and project.");

  // One entry per person per day: the document id is date + normalised name.
  const nameKey = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!nameKey) return showMsg("Please enter a valid name.");

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  try {
    await setDoc(doc(db, "attendance", `${dateISO}_${nameKey}`), {
      name,
      nameKey,
      position,
      date: dateISO,
      createdAt: serverTimestamp()
    });
    $("formView").classList.add("hidden");
    $("doneView").classList.remove("hidden");
    $("doneText").textContent = `${name} (${position}) marked present on ${prettyDate(dateISO)}.`;
  } catch (err) {
    console.error(err);
    if (err.code === "permission-denied") {
      showMsg("Attendance for this name is already recorded today (or submission was blocked).");
    } else {
      showMsg("Could not submit. Check your internet connection and try again.");
    }
    btn.disabled = false;
    btn.textContent = "Submit Attendance";
  }
});
