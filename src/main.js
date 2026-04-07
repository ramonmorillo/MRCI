import { defaultMedication, defaultSession } from "./models.js";
import { loadMappings } from "./configLoader.js";
import { saveSession, loadSession } from "./storage.js";
import { LocalHeuristicParser } from "./parsers/localHeuristicParser.js";
import { scoreAll } from "./scoring.js";
import { exportCsv, exportJson, importFromJson } from "./importExport.js";
import { reportHtml } from "./report.js";
import { t } from "./i18n.js";

const state = {
  mappings: null,
  session: loadSession() || defaultSession(),
  parser: new LocalHeuristicParser()
};

const root = document.querySelector("#app");

function downloadText(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function medRow(med, idx) {
  return `<tr>
    <td><input data-field="drugName" data-idx="${idx}" value="${med.drugName}"></td>
    <td><input data-field="dosageFormRoute" data-idx="${idx}" value="${med.dosageFormRoute}"></td>
    <td><input data-field="frequency" data-idx="${idx}" value="${med.frequency}"></td>
    <td><input type="checkbox" data-field="prn" data-idx="${idx}" ${med.prn ? "checked" : ""}></td>
    <td><input data-field="additionalInstructions" data-idx="${idx}" value="${med.additionalInstructions}"></td>
    <td><input data-field="notes" data-idx="${idx}" value="${med.notes}"></td>
    <td><input type="checkbox" data-field="validated" data-idx="${idx}" ${med.validated ? "checked" : ""}></td>
    <td><button data-action="delete-med" data-idx="${idx}">✕</button></td>
  </tr>`;
}

function breakdownRows(rows) {
  return rows
    .map(
      (row) => `<tr><td>${row.drugName}</td><td>${row.sectionA}</td><td>${row.sectionB}</td><td>${row.sectionC}</td><td>${row.total}</td><td><code>${JSON.stringify(
        row.explanation
      )}</code></td></tr>`
    )
    .join("");
}

function render() {
  const lang = state.session.language || "en";
  const scores = state.mappings
    ? scoreAll(state.session.medications, state.mappings)
    : {
        classic: { subtotalA: 0, subtotalB: 0, subtotalC: 0, total: 0, breakdown: [] },
        abbreviated: { subtotalA: 0, subtotalB: 0, subtotalC: 0, total: 0, breakdown: [] },
        delta: 0,
        eligibleCount: 0
      };

  root.innerHTML = `
  <header>
    <h1>${t(lang, "appTitle")}</h1>
    <p class="disclaimer">${t(lang, "disclaimer")}</p>
    <div class="toolbar">
      <select id="langSelect">
        <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
        <option value="es" ${lang === "es" ? "selected" : ""}>Español</option>
      </select>
      <button id="addMed">+ ${t(lang, "manual")}</button>
      <button id="exportJson">${t(lang, "exportJson")}</button>
      <button id="exportCsv">${t(lang, "exportCsv")}</button>
      <button id="print">${t(lang, "print")}</button>
      <label class="import-btn">${t(lang, "importData")}<input type="file" id="importFile" accept="application/json"></label>
    </div>
  </header>

  <section>
    <h2>${t(lang, "aiAssist")}</h2>
    <p>${t(lang, "validateNote")}</p>
    <textarea id="freeText" rows="4" placeholder="e.g., Metformin tablet BID with meals; Albuterol inhaler PRN q4h"></textarea>
    <button id="parseText">Parse Text Locally</button>
  </section>

  <section>
    <h2>Medications</h2>
    <table>
      <thead><tr><th>Drug</th><th>Form/Route</th><th>Frequency</th><th>PRN</th><th>Additional Instructions</th><th>Notes</th><th>Validated</th><th></th></tr></thead>
      <tbody>${state.session.medications.map(medRow).join("")}</tbody>
    </table>
  </section>

  <section>
    <h2>${t(lang, "scoring")}</h2>
    <p>Validated medications scored: ${scores.eligibleCount}</p>
    <div class="cards">
      <article><h3>MRCI Classic</h3><p>Total: ${scores.classic.total}</p><p>A: ${scores.classic.subtotalA} | B: ${scores.classic.subtotalB} | C: ${scores.classic.subtotalC}</p></article>
      <article><h3>A-MRCI</h3><p>Total: ${scores.abbreviated.total}</p><p>A: ${scores.abbreviated.subtotalA} | B: ${scores.abbreviated.subtotalB} | C: ${scores.abbreviated.subtotalC}</p></article>
      <article><h3>${t(lang, "comparison")}</h3><p>Delta (Classic - A-MRCI): ${scores.delta}</p></article>
    </div>
  </section>

  <section>
    <h2>Medication-level breakdown</h2>
    <h3>Classic</h3>
    <table><thead><tr><th>Drug</th><th>A</th><th>B</th><th>C</th><th>Total</th><th>Explanation</th></tr></thead><tbody>${breakdownRows(
      scores.classic.breakdown
    )}</tbody></table>
    <h3>A-MRCI</h3>
    <table><thead><tr><th>Drug</th><th>A</th><th>B</th><th>C</th><th>Total</th><th>Explanation</th></tr></thead><tbody>${breakdownRows(
      scores.abbreviated.breakdown
    )}</tbody></table>
  </section>

  <section id="printable" class="printable">${reportHtml(state.session, scores)}</section>
  `;

  wireEvents();
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
    const meds = state.parser.parse(text);
    state.session.medications.push(...meds);
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
    persist();
  };

  document.querySelectorAll("input[data-field]").forEach((el) => {
    el.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      state.session.medications[idx][field] =
        e.target.type === "checkbox" ? e.target.checked : e.target.value;
      persist();
    };
  });

  document.querySelectorAll("button[data-action='delete-med']").forEach((el) => {
    el.onclick = (e) => {
      const idx = Number(e.target.dataset.idx);
      state.session.medications.splice(idx, 1);
      persist();
    };
  });
}

function persist() {
  state.session = saveSession(state.session);
  render();
}

async function boot() {
  state.mappings = await loadMappings();
  if (!state.session.medications.length) {
    const demo = await fetch("./samples/demoRegimens.json").then((r) => r.json());
    state.session.medications = demo.regimens[0].medications;
  }
  render();
}

boot();
