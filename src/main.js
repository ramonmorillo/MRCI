import { defaultMedication, defaultSession } from "./models.js";
import { loadMappings } from "./configLoader.js";
import {
  saveSession,
  loadSession,
  saveSnapshot,
  listSnapshots,
  loadSnapshot,
  resetStorage
} from "./storage.js";
import { LocalHeuristicParser } from "./parsers/localHeuristicParser.js";
import { scoreAll } from "./scoring.js";
import { exportCsv, exportJson, importFromJson } from "./importExport.js";
import { reportHtml } from "./report.js";
import { t } from "./i18n.js";

const ROUTE_OPTIONS = ["oral", "inhaled", "subcutaneous", "intravenous", "topical", "ophthalmic", "otic", "other"];
const RESULTS_TABS = ["summary", "by-medication", "by-section", "warnings"];

const state = {
  mappings: null,
  session: { ...defaultSession(), ...(loadSession() || {}) },
  parser: new LocalHeuristicParser(),
  validation: [],
  scored: null,
  resultsTab: "summary"
};

const root = document.querySelector("#app");

const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const splitInstructions = (raw = "") => raw.split(";").map((v) => v.trim()).filter(Boolean);

function downloadText(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function optionsFromAliases(aliasMap = {}) {
  return [...new Set(Object.keys(aliasMap))].sort();
}

function validateMedications() {
  return state.session.medications.flatMap((med, idx) => {
    const issues = [];
    if (!med.drugName?.trim()) issues.push({ idx, field: "drugName", msg: "Drug name required" });
    if (!(med.dosageForm || med.dosageFormRoute)?.trim()) issues.push({ idx, field: "dosageForm", msg: "Dosage form required" });
    if (!med.frequency?.trim()) issues.push({ idx, field: "frequency", msg: "Frequency required" });
    return issues;
  });
}

function medRow(med, idx, validationMap) {
  const directionOptions = Object.keys(state.mappings?.mrciClassic?.additionalDirections?.keywords || {})
    .sort().map((k) => `<option value="${k}">${k}</option>`).join("");
  const selectedDirections = splitInstructions(med.additionalInstructions);
  const invalid = (field) => (validationMap[`${idx}:${field}`] ? "invalid" : "");

  return `<tr>
<td><input class="${invalid("drugName")}" data-field="drugName" data-idx="${idx}" value="${esc(med.drugName)}"></td>
<td><select class="${invalid("dosageForm")}" data-field="dosageForm" data-idx="${idx}"><option value="">Select…</option>${optionsFromAliases(state.mappings?.mrciClassic?.dosageForms?.aliases).map((v) => `<option value="${v}" ${med.dosageForm === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
<td><select data-field="route" data-idx="${idx}"><option value="">Select…</option>${ROUTE_OPTIONS.map((r) => `<option value="${r}" ${med.route === r ? "selected" : ""}>${r}</option>`).join("")}</select></td>
<td><select class="${invalid("frequency")}" data-field="frequency" data-idx="${idx}"><option value="">Select…</option>${optionsFromAliases(state.mappings?.mrciClassic?.frequencies?.aliases).map((v) => `<option value="${v}" ${med.frequency === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
<td><input type="checkbox" data-field="prn" data-idx="${idx}" ${med.prn ? "checked" : ""}></td>
<td><select multiple data-field="additionalInstructionsMulti" data-idx="${idx}">${directionOptions}</select><small>Ctrl/Cmd+click for multiple</small></td>
<td><input data-field="notes" data-idx="${idx}" value="${esc(med.notes)}"></td>
<td><input type="checkbox" data-field="validated" data-idx="${idx}" ${med.validated ? "checked" : ""}></td>
<td class="actions"><button data-action="duplicate-med" data-idx="${idx}">⧉</button><button data-action="delete-med" data-idx="${idx}">✕</button></td>
</tr><tr class="hint-row"><td colspan="9">Selected directions: ${esc(selectedDirections.join("; ") || "none")}</td></tr>`;
}

function summaryTab(scores) {
  const c = scores.classic;
  const a = scores.amrci;
  return `<div class="cards">
  <article><h3>MRCI Total</h3><p>${c?.total ?? "N/A"}</p><p>A:${c?.subtotalA ?? "-"} B:${c?.subtotalB ?? "-"} C:${c?.subtotalC ?? "-"}</p></article>
  <article><h3>A-MRCI Total</h3><p>${a?.total ?? "N/A"}</p><p>A:${a?.subtotalA ?? "-"} B:${a?.subtotalB ?? "-"} C:${a?.subtotalC ?? "-"}</p></article>
  <article><h3>Absolute Difference</h3><p>${scores.delta}</p></article>
</div>`;
}

function byMedicationTab(scores) {
  if (!scores.comparison) return "<p>Comparison mode required for medication-level deltas.</p>";
  return `<table><thead><tr><th>Drug</th><th>MRCI</th><th>A-MRCI</th><th>Abs Diff</th><th>Why differs</th></tr></thead><tbody>${scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.mrci}</td><td>${m.aMrci}</td><td>${m.difference}</td><td><details><summary>Rules applied</summary><pre>${esc(JSON.stringify({ mrci: m.mrciRule, aMrci: m.aMrciRule }, null, 2))}</pre></details></td></tr>`).join("")}</tbody></table>`;
}

function bySectionTab(scores) {
  if (!scores.comparison) return "<p>Comparison mode required for section-level deltas.</p>";
  return `<table><thead><tr><th>Drug</th><th>Section A diff</th><th>Section B diff</th><th>Section C diff</th></tr></thead><tbody>${scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.sectionDiff.A}</td><td>${m.sectionDiff.B}</td><td>${m.sectionDiff.C}</td></tr>`).join("")}</tbody></table>`;
}

function warningsTab(scores) {
  const warnings = scores.amrci?.warnings || [];
  if (!warnings.length) return "<p>No mapping warnings detected.</p>";
  return `<table><thead><tr><th>Drug</th><th>Type</th><th>Field</th><th>Message</th><th>Manual correction</th></tr></thead><tbody>${warnings.map((w, i) => `<tr><td>${esc(w.medicationName)}</td><td>${w.type}</td><td>${w.field}</td><td>${esc(w.message)}<br><strong>needs manual review</strong></td><td><input placeholder="e.g. oral_simple" data-fix-med="${w.medicationId}" data-fix-field="${w.field}" data-fix-row="${i}"></td></tr>`).join("")}</tbody></table><button id="applyCorrections">Apply corrections + recalculate</button>`;
}

function renderResults(scores) {
  if (!scores) return "<h2>c) Results</h2><p>Run validation and calculate to see results.</p>";
  const tabs = RESULTS_TABS.map((tab) => `<button class="tab-btn ${state.resultsTab === tab ? "active" : ""}" data-tab="${tab}">${tab === "by-medication" ? "By medication" : tab === "by-section" ? "By section" : tab === "warnings" ? "Mapping warnings" : "Summary"}</button>`).join("");
  const tabBody = state.resultsTab === "summary" ? summaryTab(scores) : state.resultsTab === "by-medication" ? byMedicationTab(scores) : state.resultsTab === "by-section" ? bySectionTab(scores) : warningsTab(scores);
  return `<h2>c) Results</h2><p>Validated medications scored: ${scores.eligibleCount}</p><div class="toolbar">${tabs}</div>${tabBody}<section id="printable" class="printable">${reportHtml(state.session, scores)}</section>`;
}

function render() {
  if (!state.mappings) return void (root.innerHTML = "<p>Loading mappings...</p>");
  state.validation = validateMedications();
  const validationMap = Object.fromEntries(state.validation.map((v) => [`${v.idx}:${v.field}`, true]));
  const lang = state.session.language || "en";

  root.innerHTML = `<header><h1>${t(lang, "appTitle")}</h1><p class="disclaimer">${t(lang, "disclaimer")}</p>
  <div class="toolbar"><select id="langSelect"><option value="en" ${lang === "en" ? "selected" : ""}>English</option><option value="es" ${lang === "es" ? "selected" : ""}>Español</option></select>
  <select id="scoreMode"><option value="classic" ${state.session.scoringMode === "classic" ? "selected" : ""}>MRCI only</option><option value="amrci" ${state.session.scoringMode === "amrci" ? "selected" : ""}>A-MRCI only</option><option value="compare" ${state.session.scoringMode === "compare" ? "selected" : ""}>Compare both</option></select>
  <button id="saveSnapshot">Save session</button><select id="snapshotSelect"><option value="">Load previous session…</option>${listSnapshots().map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
  <button id="resetSession">Reset</button><button id="exportJson">${t(lang, "exportJson")}</button><button id="exportCsv">${t(lang, "exportCsv")}</button><button id="print">${t(lang, "print")}</button><label class="import-btn">${t(lang, "importData")}<input type="file" id="importFile" accept="application/json"></label></div></header>
  <section><h2>a) Input</h2><textarea id="freeText" rows="3"></textarea><div class="toolbar"><button id="parseText">Parse Text Locally</button><button id="addMed">Add medication</button></div>
  <table><thead><tr><th>Drug</th><th>Dosage form</th><th>Route</th><th>Frequency</th><th>PRN</th><th>Additional instructions</th><th>Notes</th><th>Validated</th><th>Row actions</th></tr></thead><tbody>${state.session.medications.map((m, i) => medRow(m, i, validationMap)).join("")}</tbody></table></section>
  <section><h2>b) Review & validation</h2>${state.validation.length ? `<ul class='issues'>${state.validation.map((i) => `<li>Row ${i.idx + 1}: ${i.msg}</li>`).join("")}</ul>` : "<p class='ok'>No validation issues detected.</p>"}<button id="runCalc" ${state.validation.length ? "disabled" : ""}>Calculate scores</button></section>
  <section>${renderResults(state.scored)}</section>`;

  document.querySelectorAll("select[data-field='additionalInstructionsMulti']").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const selected = new Set(splitInstructions(state.session.medications[idx].additionalInstructions));
    Array.from(el.options).forEach((opt) => { opt.selected = selected.has(opt.value); });
  });

  wireEvents();
}

function persist({ rerender = true } = {}) {
  state.session = saveSession(state.session);
  if (rerender) render();
}

function wireEvents() {
  document.querySelector("#langSelect").onchange = (e) => { state.session.language = e.target.value; persist(); };
  document.querySelector("#scoreMode").onchange = (e) => { state.session.scoringMode = e.target.value; state.scored = null; persist(); };
  document.querySelector("#addMed").onclick = () => { state.session.medications.push(defaultMedication()); persist(); };
  document.querySelector("#parseText").onclick = () => { const meds = state.parser.parse(document.querySelector("#freeText").value).map((m) => ({ ...defaultMedication(), ...m, dosageForm: m.dosageFormRoute || "" })); state.session.medications.push(...meds); persist(); };
  document.querySelector("#saveSnapshot").onclick = () => { const label = window.prompt("Session label", "Clinical review"); if (label !== null) { saveSnapshot(state.session, label); render(); } };
  document.querySelector("#snapshotSelect").onchange = (e) => { const selected = loadSnapshot(e.target.value); if (selected) { state.session = selected.session; state.scored = null; persist(); } };
  document.querySelector("#resetSession").onclick = () => { state.session = defaultSession(); state.scored = null; resetStorage(); persist(); };
  document.querySelector("#exportJson").onclick = () => downloadText("mrci-session.json", exportJson(state.session, state.scored), "application/json");
  document.querySelector("#exportCsv").onclick = () => downloadText("mrci-medications.csv", exportCsv(state.session.medications, state.scored, state.session.scoringMode), "text/csv");
  document.querySelector("#print").onclick = () => window.print();
  document.querySelector("#importFile").onchange = async (e) => { const file = e.target.files[0]; if (file) { state.session = importFromJson(await file.text()); state.scored = null; persist(); } };

  document.querySelectorAll("[data-field]").forEach((el) => {
    el.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      state.session.medications[idx][field === "additionalInstructionsMulti" ? "additionalInstructions" : field] =
        field === "additionalInstructionsMulti" ? Array.from(e.target.selectedOptions).map((opt) => opt.value).join("; ") : e.target.type === "checkbox" ? e.target.checked : e.target.value;
      state.session.medications[idx].dosageFormRoute = state.session.medications[idx].dosageForm || "";
      state.scored = null;
      persist();
    };
  });

  document.querySelectorAll("button[data-action='delete-med']").forEach((el) => el.onclick = (e) => { state.session.medications.splice(Number(e.target.dataset.idx), 1); state.scored = null; persist(); });
  document.querySelectorAll("button[data-action='duplicate-med']").forEach((el) => el.onclick = (e) => { const idx = Number(e.target.dataset.idx); const med = state.session.medications[idx]; state.session.medications.splice(idx + 1, 0, { ...med, id: crypto.randomUUID(), validated: false }); state.scored = null; persist(); });
  document.querySelector("#runCalc").onclick = () => { state.validation = validateMedications(); if (state.validation.length) return render(); state.scored = scoreAll(state.session.medications.map((m) => ({ ...m, dosageFormRoute: m.dosageForm || m.dosageFormRoute || "" })), state.mappings, state.session.scoringMode, state.session.aMrciCorrections || {}); persist(); };

  document.querySelectorAll("[data-tab]").forEach((el) => el.onclick = (e) => { state.resultsTab = e.target.dataset.tab; render(); });
  const apply = document.querySelector("#applyCorrections");
  if (apply) {
    apply.onclick = () => {
      const corrections = {};
      document.querySelectorAll("[data-fix-med]").forEach((el) => {
        if (!el.value.trim()) return;
        const medId = el.dataset.fixMed;
        const field = el.dataset.fixField;
        corrections[medId] ||= { dirMap: {} };
        if (field.includes("dosage")) corrections[medId].formKey = el.value.trim();
        else if (field.includes("frequency")) corrections[medId].freqKey = el.value.trim();
      });
      state.session.aMrciCorrections = { ...(state.session.aMrciCorrections || {}), ...corrections };
      state.scored = scoreAll(state.session.medications.map((m) => ({ ...m, dosageFormRoute: m.dosageForm || m.dosageFormRoute || "" })), state.mappings, state.session.scoringMode, state.session.aMrciCorrections);
      persist();
    };
  }
}

async function boot() {
  state.mappings = await loadMappings();
  if (!state.session.medications?.length) {
    const demo = await fetch("./samples/demoRegimens.json").then((r) => r.json());
    state.session.medications = demo.regimens[0].medications.map((m) => ({ ...defaultMedication(), ...m, dosageForm: m.dosageFormRoute || "", route: m.route || "" }));
  }
  render();
}

boot();
