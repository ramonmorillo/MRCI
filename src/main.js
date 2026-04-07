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
import { scoreAll, scoringEngines } from "./scoring.js";
import { exportCsv, exportJson, importFromJson } from "./importExport.js";
import { reportHtml } from "./report.js";
import { t } from "./i18n.js";

const ROUTE_OPTIONS = ["oral", "inhaled", "subcutaneous", "intravenous", "topical", "ophthalmic", "otic", "other"];

const state = {
  mappings: null,
  session: loadSession() || defaultSession(),
  parser: new LocalHeuristicParser(),
  validation: [],
  scored: null
};

const root = document.querySelector("#app");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadText(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function formOptions() {
  const aliases = state.mappings?.dosageForms?.aliases || {};
  const values = [...new Set(Object.keys(aliases))].sort();
  return values;
}

function frequencyOptions() {
  const aliases = state.mappings?.frequencies?.aliases || {};
  const values = [...new Set(Object.keys(aliases))].sort();
  return values;
}

function directionOptions() {
  const keywords = Object.keys(state.mappings?.additionalDirections?.keywords || {});
  return keywords.sort().map((k) => `<option value="${k}">${k}</option>`).join("");
}

function splitInstructions(raw = "") {
  return raw
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

function toScorableMedication(med) {
  return {
    ...med,
    dosageFormRoute: med.dosageForm || med.dosageFormRoute || "",
    additionalInstructions: med.additionalInstructions || ""
  };
}

function validateMedications() {
  const seen = new Set();
  return state.session.medications.flatMap((med, idx) => {
    const issues = [];
    if (!med.drugName?.trim()) issues.push({ idx, field: "drugName", msg: "Drug name required" });
    if (!med.dosageForm?.trim() && !med.dosageFormRoute?.trim()) {
      issues.push({ idx, field: "dosageForm", msg: "Dosage form required" });
    }
    if (!med.frequency?.trim()) issues.push({ idx, field: "frequency", msg: "Frequency required" });

    const dedupeKey = `${(med.drugName || "").toLowerCase()}|${(med.dosageForm || med.dosageFormRoute || "").toLowerCase()}|${(med.frequency || "").toLowerCase()}`;
    if (seen.has(dedupeKey) && med.drugName?.trim()) {
      issues.push({ idx, field: "drugName", msg: "Possible duplicate medication" });
    }
    seen.add(dedupeKey);

    if (med.prn && !med.frequency?.trim()) {
      issues.push({ idx, field: "frequency", msg: "PRN requires a baseline frequency context" });
    }
    return issues;
  });
}

function medRow(med, idx, validationMap) {
  const selectedDirections = splitInstructions(med.additionalInstructions);
  const invalid = (field) => (validationMap[`${idx}:${field}`] ? "invalid" : "");

  return `<tr>
    <td><input class="${invalid("drugName")}" data-field="drugName" data-idx="${idx}" value="${escapeHtml(med.drugName)}"></td>
    <td><select class="${invalid("dosageForm")}" data-field="dosageForm" data-idx="${idx}">${[
      '<option value="">Select…</option>',
      ...formOptions().map(
        (value) => `<option value="${value}" ${med.dosageForm === value ? "selected" : ""}>${value}</option>`
      )
    ].join("")}</select></td>
    <td><select data-field="route" data-idx="${idx}">${['<option value="">Select…</option>', ...ROUTE_OPTIONS.map((r) => `<option value="${r}" ${med.route === r ? "selected" : ""}>${r}</option>`)].join("")}</select></td>
    <td><select class="${invalid("frequency")}" data-field="frequency" data-idx="${idx}">${[
      '<option value="">Select…</option>',
      ...frequencyOptions().map(
        (value) => `<option value="${value}" ${med.frequency === value ? "selected" : ""}>${value}</option>`
      )
    ].join("")}</select></td>
    <td><input type="checkbox" data-field="prn" data-idx="${idx}" ${med.prn ? "checked" : ""}></td>
    <td>
      <select multiple data-field="additionalInstructionsMulti" data-idx="${idx}" aria-label="Additional instructions">${directionOptions()}</select>
      <small>Ctrl/Cmd+click for multiple</small>
    </td>
    <td><input data-field="notes" data-idx="${idx}" value="${escapeHtml(med.notes)}"></td>
    <td><input type="checkbox" data-field="validated" data-idx="${idx}" ${med.validated ? "checked" : ""}></td>
    <td class="actions">
      <button data-action="duplicate-med" data-idx="${idx}" title="Duplicate row">⧉</button>
      <button data-action="delete-med" data-idx="${idx}" title="Delete row">✕</button>
    </td>
  </tr>
  <tr class="hint-row"><td colspan="9">Selected directions: ${escapeHtml(selectedDirections.join("; ") || "none")}</td></tr>`;
}

function renderReview(validationIssues) {
  const hasErrors = validationIssues.some((i) => !i.msg.includes("duplicate"));
  const rows = state.session.medications
    .map(
      (m, idx) => `<tr>
      <td>${idx + 1}</td>
      <td contenteditable="true" data-review-field="drugName" data-idx="${idx}">${escapeHtml(m.drugName)}</td>
      <td contenteditable="true" data-review-field="dosageForm" data-idx="${idx}">${escapeHtml(m.dosageForm || m.dosageFormRoute)}</td>
      <td contenteditable="true" data-review-field="frequency" data-idx="${idx}">${escapeHtml(m.frequency)}</td>
      <td>${m.prn ? "Yes" : "No"}</td>
      <td>${escapeHtml(m.additionalInstructions)}</td>
      <td>${m.validated ? "Validated" : "Pending"}</td>
    </tr>`
    )
    .join("");

  const issueList = validationIssues.length
    ? `<ul class="issues">${validationIssues.map((i) => `<li>Row ${i.idx + 1}: ${i.msg}</li>`).join("")}</ul>`
    : "<p class='ok'>No validation issues detected.</p>";

  return `
    <h2>b) Review & validation</h2>
    ${issueList}
    <table>
      <thead><tr><th>#</th><th>Drug</th><th>Form</th><th>Frequency</th><th>PRN</th><th>Directions</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="toolbar">
      <button id="runCalc" ${hasErrors ? "disabled" : ""}>Calculate scores</button>
      <span>${hasErrors ? "Resolve required fields before calculation." : "Ready for scoring."}</span>
    </div>`;
}

function engineCard(label, score) {
  if (!score) return "";
  return `<article><h3>${label}</h3><p>Total: ${score.total}</p><p>A: ${score.subtotalA} | B: ${score.subtotalB} | C: ${score.subtotalC}</p></article>`;
}

function breakdownRows(rows) {
  return rows
    .map(
      (row) => `<tr><td>${escapeHtml(row.drugName)}</td><td>${row.sectionA}</td><td>${row.sectionB}</td><td>${row.sectionC}</td><td>${row.total}</td><td><details><summary>Explain score</summary><pre>${escapeHtml(
        JSON.stringify(row.explanation, null, 2)
      )}</pre></details></td></tr>`
    )
    .join("");
}

function renderResults(scores) {
  if (!scores) return "<h2>c) Results</h2><p>Run validation and calculate to see results.</p>";
  const scorable = state.session.medications.map(toScorableMedication);

  return `
  <h2>c) Results</h2>
  <p>Validated medications scored: ${scores.eligibleCount}</p>
  <div class="cards">
    ${scoringEngines.map((engine) => engineCard(engine.label, scores.byEngine[engine.id])).join("")}
    <article><h3>Comparison</h3><p>Delta (Classic - A-MRCI): ${scores.delta}</p></article>
  </div>
  <h3>Medication-level breakdown</h3>
  ${scoringEngines
    .map(
      (engine) => `<h4>${engine.label}</h4><table><thead><tr><th>Drug</th><th>A</th><th>B</th><th>C</th><th>Total</th><th>Traceability</th></tr></thead><tbody>${breakdownRows(
        scores.byEngine[engine.id].breakdown
      )}</tbody></table>`
    )
    .join("")}
  <section id="printable" class="printable">${reportHtml({ ...state.session, medications: scorable }, scores)}</section>`;
}

function render() {
  if (!state.mappings) {
    root.innerHTML = "<p>Loading mappings...</p>";
    return;
  }

  state.validation = validateMedications();
  const validationMap = Object.fromEntries(state.validation.map((v) => [`${v.idx}:${v.field}`, true]));
  const lang = state.session.language || "en";
  const snapshots = listSnapshots();

  root.innerHTML = `
  <header>
    <h1>${t(lang, "appTitle")}</h1>
    <p class="disclaimer">${t(lang, "disclaimer")}</p>
    <div class="toolbar">
      <select id="langSelect">
        <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
        <option value="es" ${lang === "es" ? "selected" : ""}>Español</option>
      </select>
      <button id="saveSnapshot">Save session</button>
      <select id="snapshotSelect"><option value="">Load previous session…</option>${snapshots
        .map((s) => `<option value="${s.id}">${escapeHtml(s.label)} (${new Date(s.createdAt).toLocaleString()})</option>`)
        .join("")}</select>
      <button id="resetSession">Reset</button>
      <button id="exportJson">${t(lang, "exportJson")}</button>
      <button id="exportCsv">${t(lang, "exportCsv")}</button>
      <button id="print">${t(lang, "print")}</button>
      <label class="import-btn">${t(lang, "importData")}<input type="file" id="importFile" accept="application/json"></label>
    </div>
  </header>

  <section>
    <h2>a) Input</h2>
    <p>${t(lang, "validateNote")}</p>
    <textarea id="freeText" rows="3" placeholder="e.g., Metformin tablet BID with meals; Albuterol inhaler PRN q4h"></textarea>
    <div class="toolbar"><button id="parseText">Parse Text Locally</button><button id="addMed">Add medication</button></div>
    <table>
      <thead><tr><th>Drug</th><th>Dosage form</th><th>Route</th><th>Frequency</th><th>PRN</th><th>Additional instructions</th><th>Notes</th><th>Validated</th><th>Row actions</th></tr></thead>
      <tbody>${state.session.medications.map((m, i) => medRow(m, i, validationMap)).join("")}</tbody>
    </table>
  </section>

  <section>${renderReview(state.validation)}</section>
  <section>${renderResults(state.scored)}</section>
  `;

  document.querySelectorAll("select[data-field='additionalInstructionsMulti']").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const selected = new Set(splitInstructions(state.session.medications[idx].additionalInstructions));
    Array.from(el.options).forEach((opt) => {
      opt.selected = selected.has(opt.value);
    });
  });

  wireEvents();
}

function persist({ rerender = true } = {}) {
  state.session = saveSession(state.session);
  if (rerender) render();
}

function wireEvents() {
  document.querySelector("#langSelect").onchange = (e) => {
    state.session.language = e.target.value;
    persist();
  };

  document.querySelector("#addMed").onclick = () => {
    state.session.medications.push(defaultMedication());
    persist();
  };

  document.querySelector("#parseText").onclick = () => {
    const text = document.querySelector("#freeText").value;
    const meds = state.parser.parse(text).map((m) => ({ ...defaultMedication(), ...m, dosageForm: m.dosageFormRoute || "" }));
    state.session.medications.push(...meds);
    persist();
  };

  document.querySelector("#saveSnapshot").onclick = () => {
    const label = window.prompt("Session label", state.session.regimenLabel || "Clinical review");
    if (label !== null) {
      saveSnapshot(state.session, label);
      render();
    }
  };

  document.querySelector("#snapshotSelect").onchange = (e) => {
    const selected = loadSnapshot(e.target.value);
    if (!selected) return;
    state.session = selected.session;
    state.scored = null;
    persist();
  };

  document.querySelector("#resetSession").onclick = () => {
    state.session = defaultSession();
    state.scored = null;
    resetStorage();
    persist();
  };

  document.querySelector("#exportJson").onclick = () =>
    downloadText("mrci-session.json", exportJson(state.session), "application/json");

  document.querySelector("#exportCsv").onclick = () =>
    downloadText("mrci-medications.csv", exportCsv(state.session.medications), "text/csv");

  document.querySelector("#print").onclick = () => window.print();

  document.querySelector("#importFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    state.session = importFromJson(text);
    state.scored = null;
    persist();
  };

  document.querySelectorAll("[data-field]").forEach((el) => {
    el.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      if (field === "additionalInstructionsMulti") {
        const values = Array.from(e.target.selectedOptions).map((opt) => opt.value);
        state.session.medications[idx].additionalInstructions = values.join("; ");
      } else {
        state.session.medications[idx][field] =
          e.target.type === "checkbox" ? e.target.checked : e.target.value;
      }
      state.session.medications[idx].dosageFormRoute = state.session.medications[idx].dosageForm || "";
      state.scored = null;
      persist();
    };
  });

  document.querySelectorAll("[data-review-field]").forEach((el) => {
    el.onblur = (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.reviewField;
      state.session.medications[idx][field] = e.target.textContent.trim();
      if (field === "dosageForm") state.session.medications[idx].dosageFormRoute = e.target.textContent.trim();
      state.scored = null;
      persist({ rerender: false });
    };
  });

  document.querySelectorAll("button[data-action='delete-med']").forEach((el) => {
    el.onclick = (e) => {
      const idx = Number(e.target.dataset.idx);
      state.session.medications.splice(idx, 1);
      state.scored = null;
      persist();
    };
  });

  document.querySelectorAll("button[data-action='duplicate-med']").forEach((el) => {
    el.onclick = (e) => {
      const idx = Number(e.target.dataset.idx);
      const med = state.session.medications[idx];
      state.session.medications.splice(idx + 1, 0, { ...med, id: crypto.randomUUID(), validated: false });
      state.scored = null;
      persist();
    };
  });

  const runCalc = document.querySelector("#runCalc");
  if (runCalc) {
    runCalc.onclick = () => {
      state.validation = validateMedications();
      if (state.validation.some((i) => i.msg.includes("required"))) {
        render();
        return;
      }
      const normalized = state.session.medications.map(toScorableMedication);
      state.scored = scoreAll(normalized, state.mappings);
      persist();
    };
  }
}

async function boot() {
  state.mappings = await loadMappings();
  if (!state.session.medications?.length) {
    const demo = await fetch("./samples/demoRegimens.json").then((r) => r.json());
    state.session.medications = demo.regimens[0].medications.map((m) => ({
      ...defaultMedication(),
      ...m,
      dosageForm: m.dosageFormRoute || "",
      route: m.route || ""
    }));
  }
  render();
}

boot();
