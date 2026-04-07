import { defaultMedication, defaultSession } from "./models.js";
import { loadMappings } from "./configLoader.js";
import { saveSession, loadSession, saveSnapshot, listSnapshots, loadSnapshot, resetStorage } from "./storage.js";
import { scoreAll } from "./scoring.js";
import { exportCsv, exportJson, importFromJson } from "./importExport.js";
import { reportHtml } from "./report.js";
import { t } from "./i18n.js";
import { parseMedicationText } from "./lib/parsing/textParser.js";
import { searchMedications, getMedicationDetail, getPresentationDetail, getSafetyNotes, getSupplyIssues } from "./lib/integrations/cimaApi.js";
import { buildMedicationFromCima, applyCimaSelectionToMedication } from "./lib/integrations/cimaMedicationMapper.js";

const ROUTE_OPTIONS = ["oral", "inhaled", "subcutaneous", "intravenous", "topical", "ophthalmic", "otic", "other"];
const RESULTS_TABS = ["summary", "by-medication", "by-section", "warnings"];
const STEPS = ["input", "validation", "results", "comparison"];

const state = {
  mappings: null,
  session: { ...defaultSession(), ...(loadSession() || {}) },
  validation: [],
  scored: null,
  resultsTab: "summary",
  activeStep: "input",
  parseUi: { confirmed: false },
  showHelp: false,
  cima: {
    query: "",
    type: "name",
    loading: false,
    error: "",
    results: [],
    selectedIdx: 0
  }
};

const root = document.querySelector("#app");
const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const splitInstructions = (raw = "") => raw.split(";").map((v) => v.trim()).filter(Boolean);
const tr = (key, vars = {}) => t(state.session.language || "en", key, vars);

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

function translateDynamicText(value = "") {
  const k = {
    "missing-drug-name": "warnings.missing_drug_name",
    "unknown-dosage-form": "warnings.unknown_dosage_form",
    "ambiguous-frequency": "warnings.ambiguous_frequency",
    "tapering-regimen": "warnings.tapering_regimen",
    "alternating-dose": "warnings.alternating_dose",
    "possible-duplicate": "warnings.possible_duplicate",
    "assumed-not-prn": "warnings.assumed_not_prn",
    "One or more A-MRCI additional direction mappings missing": "warnings.one_or_more_missing",
    "A-MRCI dosage form not mapped": "warnings.amrci_form_unmapped",
    "A-MRCI frequency not mapped": "warnings.amrci_frequency_unmapped"
  };
  return tr(k[value] || "") || value;
}

function translateFieldName(value = "") {
  const fieldMap = {
    drugName: "results.drug",
    dosageForm: "results.dosage_form",
    "dosage form/route": "results.dosage_form",
    frequency: "results.frequency",
    "additional directions": "results.additional_instructions",
    strength: "results.strength",
    route: "results.route",
    notes: "results.notes",
    validated: "results.validated",
    prn: "results.prn"
  };
  return tr(fieldMap[value] || "") || value;
}

function validateMedications() {
  return state.session.medications.flatMap((med, idx) => {
    const issues = [];
    if (!med.drugName?.trim()) issues.push({ idx, field: "drugName", msg: tr("errors.drug_required") });
    if (!(med.dosageForm || med.dosageFormRoute)?.trim()) issues.push({ idx, field: "dosageForm", msg: tr("errors.dosage_required") });
    if (!med.frequency?.trim()) issues.push({ idx, field: "frequency", msg: tr("errors.frequency_required") });
    return issues;
  });
}

function medRow(med, idx, validationMap) {
  const directionOptions = Object.keys(state.mappings?.mrciClassic?.additionalDirections?.keywords || {}).sort().map((k) => `<option value="${k}">${k}</option>`).join("");
  const selectedDirections = splitInstructions(med.additionalInstructions);
  const invalid = (field) => (validationMap[`${idx}:${field}`] ? "invalid" : "");
  const lowConfidence = (field) => (med.confidence?.[field]?.confidence === "low" ? "uncertain" : "");
  const validationClass = med.validated ? "valid-row" : "";

  return `<tr class="${validationClass}">
<td><input class="${invalid("drugName")} ${lowConfidence("drugName")}" data-field="drugName" data-idx="${idx}" value="${esc(med.drugName)}"></td>
<td><input class="${lowConfidence("strength")}" data-field="strength" data-idx="${idx}" value="${esc(med.strength || "")}" placeholder="10 mg"></td>
<td><select title="${tr("tooltips.dosage_form")}" class="${invalid("dosageForm")} ${lowConfidence("dosageForm")}" data-field="dosageForm" data-idx="${idx}"><option value="">—</option>${optionsFromAliases(state.mappings?.mrciClassic?.dosageForms?.aliases).map((v) => `<option value="${v}" ${med.dosageForm === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
<td><select data-field="route" data-idx="${idx}"><option value="">—</option>${ROUTE_OPTIONS.map((r) => `<option value="${r}" ${med.route === r ? "selected" : ""}>${r}</option>`).join("")}</select></td>
<td><select title="${tr("tooltips.frequency")}" class="${invalid("frequency")} ${lowConfidence("frequency")}" data-field="frequency" data-idx="${idx}"><option value="">—</option>${optionsFromAliases(state.mappings?.mrciClassic?.frequencies?.aliases).map((v) => `<option value="${v}" ${med.frequency === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
<td><input type="checkbox" data-field="prn" data-idx="${idx}" ${med.prn ? "checked" : ""}></td>
<td><select title="${tr("tooltips.instructions")}" multiple data-field="additionalInstructionsMulti" data-idx="${idx}">${directionOptions}</select><small>${tr("labels.ctrl_multi")}</small></td>
<td><input data-field="notes" data-idx="${idx}" value="${esc(med.notes)}"></td>
<td><input data-field="cimaNationalCode" data-idx="${idx}" value="${esc(med.cimaNationalCode || "")}" placeholder="847123"></td>
<td><input data-field="cimaRegistrationNumber" data-idx="${idx}" value="${esc(med.cimaRegistrationNumber || "")}" placeholder="51347"></td>
<td><input type="checkbox" data-field="validated" data-idx="${idx}" ${med.validated ? "checked" : ""}></td>
<td class="actions"><button data-action="duplicate-med" data-idx="${idx}">${tr("buttons.duplicate")}</button><button class="ghost" data-action="delete-med" data-idx="${idx}">${tr("buttons.delete")}</button></td>
</tr><tr class="hint-row"><td colspan="12">${tr("labels.evidence")}: ${esc(med.sourceEvidence || tr("labels.manual_entry"))} | ${tr("labels.selected_directions")}: ${esc(selectedDirections.join("; ") || tr("labels.none"))} ${med.extractionFlags?.length ? `| ${tr("parsing.flags")}: ${esc(med.extractionFlags.map(translateDynamicText).join(", "))}` : ""}
<details><summary>${tr("labels.cima_info")}</summary><div>${tr("labels.presentation")}: <input data-field="cimaPresentation" data-idx="${idx}" value="${esc(med.cimaPresentation || "")}"></div><div>${tr("labels.active_ingredients")}: <input data-field="cimaActiveIngredients" data-idx="${idx}" value="${esc(med.cimaActiveIngredients || "")}"></div><div>${tr("results.strength")}: <input data-field="cimaDose" data-idx="${idx}" value="${esc(med.cimaDose || "")}"></div><div>${tr("labels.supply_issue")}: ${med.cimaSupplyIssue ? tr("labels.yes") : tr("labels.no")}</div>${med.cimaProductUrl ? `<div><a href="${esc(med.cimaProductUrl)}" target="_blank" rel="noreferrer">${tr("labels.official_info_link")}</a></div>` : ""}${(med.cimaSafetyNotes || []).length ? `<ul>${med.cimaSafetyNotes.slice(0, 3).map((n) => `<li>${esc(n.asunto || n.ref || n.num || "")}</li>`).join("")}</ul>` : `<div>${tr("labels.no_safety_notes")}</div>`}</details>
</td></tr>`;
}

function parseReviewPane() {
  const parseResult = state.session.lastParseResult;
  if (!parseResult) return `<p>${tr("labels.no_parsed_rows")}</p>`;
  const rows = parseResult.candidates.map((c) => `<tr><td>${esc(c.fields.drugName.value || tr("labels.missing"))}</td><td>${esc(c.fields.frequency.value || tr("labels.missing"))}</td><td>${esc(c.lowConfidenceFields.map(translateFieldName).join(", ") || tr("labels.none"))}</td><td>${esc(c.flags.map(translateDynamicText).join(", ") || tr("labels.none"))}</td><td>${esc(c.sourceText)}</td></tr>`).join("");
  return `<p><strong>${tr("labels.parser")}:</strong> ${parseResult.parserVersion} | ${tr("labels.total_candidates")}: ${parseResult.summary.totalCandidates}</p>
  <table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.frequency")}</th><th>${tr("parsing.low_confidence_fields")}</th><th>${tr("parsing.flags")}</th><th>${tr("parsing.source_text")}</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="toolbar"><button id="addParsedRows">${tr("buttons.add_parsed")}</button><button id="confirmReviewed" ${state.parseUi.confirmed ? "disabled" : ""}>${tr("buttons.confirm_review")}</button></div>`;
}

function cimaSearchPanel() {
  const rowOptions = state.session.medications.map((med, idx) => `<option value="${idx}" ${idx === state.cima.selectedIdx ? "selected" : ""}>#${idx + 1} ${esc(med.drugName || tr("labels.new_medication"))}</option>`).join("");
  const results = state.cima.results.map((item, idx) => `<button class="cima-result ${idx === 0 ? "active" : ""}" data-action="select-cima-result" data-result-idx="${idx}">
    <strong>${esc(item.name || tr("labels.missing"))}</strong>
    <small>${tr("labels.form_short")}: ${esc(item.form || tr("labels.missing"))} | ${tr("results.route")}: ${esc(item.route || tr("labels.missing"))} | CN: ${esc(item.nationalCode || "—")} | ${tr("labels.reg_short")}: ${esc(item.registrationNumber || "—")}</small>
  </button>`).join("");

  return `<section class="cima-panel">
    <h3>${tr("labels.cima_lookup")}</h3>
    <p class="note">${tr("labels.cima_warning")}</p>
    <div class="toolbar cima-toolbar">
      <label>${tr("labels.cima_search_type")}
        <select id="cimaSearchType">
          <option value="name" ${state.cima.type === "name" ? "selected" : ""}>${tr("labels.search_brand")}</option>
          <option value="ingredient" ${state.cima.type === "ingredient" ? "selected" : ""}>${tr("labels.search_ingredient")}</option>
          <option value="nationalCode" ${state.cima.type === "nationalCode" ? "selected" : ""}>${tr("labels.search_cn")}</option>
          <option value="registration" ${state.cima.type === "registration" ? "selected" : ""}>${tr("labels.search_registration")}</option>
        </select>
      </label>
      <label>${tr("labels.search")}
        <input id="cimaQuery" value="${esc(state.cima.query)}" placeholder="${tr("labels.cima_placeholder")}">
      </label>
      <button id="cimaSearchBtn">${tr("buttons.search_cima")}</button>
      <label>${tr("labels.apply_to_row")}
        <select id="cimaApplyRow">${rowOptions}<option value="-1">+ ${tr("buttons.add")}</option></select>
      </label>
    </div>
    ${state.cima.loading ? `<p>${tr("labels.loading")}</p>` : ""}
    ${state.cima.error ? `<p class="issues">${esc(state.cima.error)}</p>` : ""}
    ${!state.cima.loading && !state.cima.error && state.cima.query && !state.cima.results.length ? `<p>${tr("labels.no_cima_results")}</p>` : ""}
    <div class="cima-results">${results}</div>
  </section>`;
}

function comparisonBars(scores) {
  const c = scores.classic?.total || 0;
  const a = scores.amrci?.total || 0;
  const max = Math.max(c, a, 1);
  const cPct = (c / max) * 100;
  const aPct = (a / max) * 100;
  return `<div class="bars"><div><span>MRCI</span><div class="bar"><i style="width:${cPct}%"></i></div><strong>${c}</strong></div><div><span>A-MRCI</span><div class="bar"><i style="width:${aPct}%"></i></div><strong>${a}</strong></div></div>`;
}

function summaryTab(scores) {
  const c = scores.classic;
  const a = scores.amrci;
  return `<div class="cards"><article><h3>${tr("results.mrci_total")}</h3><p class="hero">${c?.total ?? tr("labels.no_data")}</p><p>${tr("results.section_a")}:${c?.subtotalA ?? "-"} ${tr("results.section_b")}:${c?.subtotalB ?? "-"} ${tr("results.section_c")}:${c?.subtotalC ?? "-"}</p></article><article><h3>${tr("results.amrci_total")}</h3><p class="hero">${a?.total ?? tr("labels.no_data")}</p><p>${tr("results.section_a")}:${a?.subtotalA ?? "-"} ${tr("results.section_b")}:${a?.subtotalB ?? "-"} ${tr("results.section_c")}:${a?.subtotalC ?? "-"}</p></article><article><h3>${tr("results.abs_diff")}</h3><p class="hero">${scores.delta}</p></article></div>${comparisonBars(scores)}`;
}
function byMedicationTab(scores) {
  if (!scores.comparison) return `<p>${tr("labels.comparison_required_med")}</p>`;
  return `<table><thead><tr><th>${tr("results.drug")}</th><th>MRCI</th><th>A-MRCI</th><th>${tr("results.abs_diff")}</th><th>${tr("labels.why_score")}</th></tr></thead><tbody>${scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.mrci}</td><td>${m.aMrci}</td><td>${m.difference}</td><td><details><summary>${tr("labels.score_explanation")}</summary><p>${tr("results.total")}: ${m.mrci} / ${m.aMrci}</p><pre>${esc(JSON.stringify({ mrci: m.mrciRule, aMrci: m.aMrciRule }, null, 2))}</pre></details></td></tr>`).join("")}</tbody></table>`;
}
function bySectionTab(scores) { if (!scores.comparison) return `<p>${tr("labels.comparison_required_section")}</p>`; return `<table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.section_a")}</th><th>${tr("results.section_b")}</th><th>${tr("results.section_c")}</th></tr></thead><tbody>${scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.sectionDiff.A}</td><td>${m.sectionDiff.B}</td><td>${m.sectionDiff.C}</td></tr>`).join("")}</tbody></table>`; }
function warningsTab(scores) {
  const warnings = scores.amrci?.warnings || [];
  if (!warnings.length) return `<p>${tr("labels.no_warnings")}</p>`;
  return `<table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.type")}</th><th>${tr("results.field")}</th><th>${tr("results.message")}</th><th>${tr("labels.manual_correction")}</th></tr></thead><tbody>${warnings.map((w, i) => `<tr><td>${esc(w.medicationName)}</td><td>${w.type === "unmapped" ? tr("warnings.unmapped") : esc(w.type)}</td><td>${esc(translateFieldName(w.field))}</td><td>${esc(translateDynamicText(w.message))}<br><strong>${tr("warnings.needs_manual_review")}</strong></td><td><input placeholder="oral_simple" data-fix-med="${w.medicationId}" data-fix-field="${w.field}" data-fix-row="${i}"></td></tr>`).join("")}</tbody></table><button id="applyCorrections">${tr("buttons.apply_corrections")}</button>`;
}
function renderResults(scores) {
  if (!scores) return `<h2>${tr("nav.results")}</h2><p>${tr("labels.run_to_see_results")}</p>`;
  const tabs = RESULTS_TABS.map((tab) => `<button class="tab-btn ${state.resultsTab === tab ? "active" : ""}" data-tab="${tab}">${tab === "by-medication" ? tr("labels.by_medication") : tab === "by-section" ? tr("labels.by_section") : tab === "warnings" ? tr("labels.mapping_warnings") : tr("labels.summary")}</button>`).join("");
  const tabBody = state.resultsTab === "summary" ? summaryTab(scores) : state.resultsTab === "by-medication" ? byMedicationTab(scores) : state.resultsTab === "by-section" ? bySectionTab(scores) : warningsTab(scores);
  return `<h2>${tr("nav.results")}</h2><p>${tr("labels.validated_count")}: ${scores.eligibleCount}</p><div class="toolbar">${tabs}</div>${tabBody}<section id="printable" class="printable">${reportHtml(state.session, scores, state.session.language, tr)}</section>`;
}

function sectionVisible(step) {
  return state.activeStep === step ? "" : "hidden";
}

function render() {
  if (!state.mappings) return void (root.innerHTML = `<p>${tr("labels.loading")}</p>`);
  document.title = tr("app_title");
  state.validation = validateMedications();
  const validationMap = Object.fromEntries(state.validation.map((v) => [`${v.idx}:${v.field}`, true]));
  const lang = state.session.language || "en";
  const blockingAiReview = state.session.inputMode === "ai" && state.session.lastParseResult && !state.parseUi.confirmed;

  root.innerHTML = `<header class="topbar"><div><h1>${tr("app_title")}</h1><p class="disclaimer">${tr("disclaimer")}</p></div>
  <div class="toolbar toolbar-top"><label>${tr("labels.language")} <select id="langSelect"><option value="en" ${lang === "en" ? "selected" : ""}>EN</option><option value="es" ${lang === "es" ? "selected" : ""}>ES</option></select></label>
  <button id="toggleHelp" class="ghost">${tr("nav.help")}</button><button id="resetSession" class="ghost">${tr("nav.reset")}</button></div></header>

  <nav class="stepper">${STEPS.map((s) => `<button class="step ${state.activeStep === s ? "active" : ""}" data-step="${s}">${tr(`nav.${s}`)}</button>`).join("")}</nav>

  <section class="${sectionVisible("input")}"><h2>${tr("nav.input")}</h2>
    <div class="toolbar stacked">
      <label>${tr("labels.scoring_mode")}
      <select id="scoreMode"><option value="classic" ${state.session.scoringMode === "classic" ? "selected" : ""}>${tr("modes.classic")}</option><option value="amrci" ${state.session.scoringMode === "amrci" ? "selected" : ""}>${tr("modes.amrci")}</option><option value="compare" ${state.session.scoringMode === "compare" ? "selected" : ""}>${tr("modes.compare")}</option></select></label>
      <label>${tr("labels.input_mode")}
      <select id="inputMode"><option value="manual" ${state.session.inputMode === "manual" ? "selected" : ""}>${tr("labels.manual_entry")}</option><option value="ai" ${state.session.inputMode === "ai" ? "selected" : ""}>${tr("labels.ai_assist")}</option></select></label>
      <button id="addMed">${tr("buttons.add")}</button>
      <button id="saveSnapshot">${tr("buttons.save")}</button><select id="snapshotSelect"><option value="">${tr("labels.load_session")}</option>${listSnapshots().map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
      <button id="exportJson">${tr("buttons.export_json")}</button><button id="exportCsv">${tr("buttons.export_csv")}</button><button id="print">${tr("buttons.print")}</button><label class="import-btn">${tr("buttons.import")}<input type="file" id="importFile" accept="application/json"></label>
    </div>
    ${state.session.inputMode === "ai" ? `<p class="note">${tr("labels.reviewed_required")}</p><div class="split-view"><div><h3>${tr("labels.free_text")}</h3><textarea id="freeText" rows="12" placeholder="...">${esc(state.session.rawInputText || "")}</textarea><button id="parseText">${tr("buttons.parse")}</button></div><div><h3>${tr("labels.extraction_preview")}</h3>${parseReviewPane()}</div></div>` : `<p>${tr("labels.manual_workflow_active")}</p>`}
    ${cimaSearchPanel()}
    <table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.strength")}</th><th title="${tr("tooltips.dosage_form")}">${tr("results.dosage_form")}</th><th>${tr("results.route")}</th><th title="${tr("tooltips.frequency")}">${tr("results.frequency")}</th><th>${tr("results.prn")}</th><th title="${tr("tooltips.instructions")}">${tr("results.additional_instructions")}</th><th>${tr("results.notes")}</th><th>CN</th><th>${tr("labels.reg_short")}</th><th>${tr("results.validated")}</th><th>${tr("labels.row_actions")}</th></tr></thead><tbody>${state.session.medications.map((m, i) => medRow(m, i, validationMap)).join("")}</tbody></table></section>

  <section class="${sectionVisible("validation")}"><h2>${tr("nav.validation")}</h2>${state.validation.length ? `<ul class='issues'>${state.validation.map((i) => `<li>${i.msg} (#${i.idx + 1})</li>`).join("")}</ul>` : `<p class='ok'>${tr("labels.no_validation_issues")}</p>`}
  ${blockingAiReview ? `<p class='issues'>${tr("labels.ai_review_blocking")}</p>` : ""}
  <button id="runCalc" ${(state.validation.length || blockingAiReview) ? "disabled" : ""}>${tr("buttons.calculate")}</button></section>

  <section class="${sectionVisible("results")}">${renderResults(state.scored)}</section>

  <section class="${sectionVisible("comparison")}">${state.scored ? bySectionTab(state.scored) + byMedicationTab(state.scored) : `<p>${tr("labels.run_to_see_results")}</p>`}</section>
  ${state.showHelp ? `<dialog open class="help-dialog"><h3>${tr("nav.help")}</h3><p>${tr("labels.help_body")}</p><button id="closeHelp">OK</button></dialog>` : ""}`;

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

function parsedToMedication(candidate) {
  return {
    ...defaultMedication(),
    drugName: candidate.fields.drugName.value,
    strength: candidate.fields.strength.value,
    dosageForm: candidate.fields.dosageForm.value,
    route: candidate.fields.route.value,
    dosageFormRoute: candidate.fields.dosageForm.value,
    frequency: candidate.fields.frequency.value,
    prn: candidate.fields.prn.value === "yes",
    additionalInstructions: candidate.fields.additionalDirections.value,
    notes: candidate.fields.notes.evidence ? `${tr("labels.notes_review_needed")}: ${candidate.fields.notes.evidence}` : tr("labels.notes_review_needed"),
    source: "rule-based-local-v1",
    sourceEvidence: candidate.sourceText,
    confidence: candidate.fields,
    extractionFlags: candidate.flags,
    validated: false
  };
}

async function runCimaSearch() {
  state.cima.loading = true;
  state.cima.error = "";
  state.cima.results = [];
  render();
  try {
    const results = await searchMedications(state.cima.query, { type: state.cima.type });
    const enriched = await Promise.all(results.slice(0, 12).map(async (item) => {
      const presentations = await getPresentationDetail({ registrationNumber: item.registrationNumber });
      return { ...item, nationalCode: presentations[0]?.nationalCode || "" };
    }));
    state.cima.results = enriched;
  } catch (error) {
    state.cima.error = tr("errors.cima_failed");
    console.error(error);
  } finally {
    state.cima.loading = false;
    render();
  }
}

async function importCimaResult(resultIdx) {
  const selected = state.cima.results[resultIdx];
  if (!selected) return;
  try {
    const medicationDetail = await getMedicationDetail({ registrationNumber: selected.registrationNumber, nationalCode: selected.nationalCode });
    const presentations = await getPresentationDetail({ registrationNumber: selected.registrationNumber, nationalCode: selected.nationalCode });
    const presentation = presentations[0] || {};
    const notes = await getSafetyNotes(selected.registrationNumber);
    const supply = selected.nationalCode ? await getSupplyIssues(selected.nationalCode) : [];
    const cimaData = buildMedicationFromCima(medicationDetail, { ...presentation, supplyIssue: Boolean(supply?.length) }, notes);
    cimaData.cimaProductUrl = `https://cima.aemps.es/cima/publico/detalle.html?nregistro=${encodeURIComponent(cimaData.cimaRegistrationNumber || selected.registrationNumber)}`;

    const applyRow = Number(document.querySelector("#cimaApplyRow")?.value ?? state.cima.selectedIdx);
    if (applyRow >= 0 && state.session.medications[applyRow]) {
      state.session.medications[applyRow] = applyCimaSelectionToMedication(state.session.medications[applyRow], cimaData);
    } else {
      const created = applyCimaSelectionToMedication(defaultMedication(), cimaData);
      state.session.medications.push(created);
    }
    state.scored = null;
    persist();
  } catch (error) {
    state.cima.error = tr("errors.cima_failed");
    console.error(error);
    render();
  }
}

function wireEvents() {
  const cimaSearchType = document.querySelector("#cimaSearchType");
  if (cimaSearchType) cimaSearchType.onchange = (e) => { state.cima.type = e.target.value; };
  const cimaQuery = document.querySelector("#cimaQuery");
  if (cimaQuery) cimaQuery.oninput = (e) => { state.cima.query = e.target.value; };
  const cimaApplyRow = document.querySelector("#cimaApplyRow");
  if (cimaApplyRow) cimaApplyRow.onchange = (e) => { state.cima.selectedIdx = Number(e.target.value) || 0; };
  const cimaSearchBtn = document.querySelector("#cimaSearchBtn");
  if (cimaSearchBtn) cimaSearchBtn.onclick = () => runCimaSearch();
  document.querySelectorAll("[data-action='select-cima-result']").forEach((el) => {
    el.onclick = async (e) => {
      const idx = Number(e.currentTarget.dataset.resultIdx);
      await importCimaResult(idx);
    };
  });

  document.querySelector("#langSelect").onchange = (e) => { state.session.language = e.target.value; persist(); };
  document.querySelector("#toggleHelp").onclick = () => { state.showHelp = true; render(); };
  const closeHelp = document.querySelector("#closeHelp");
  if (closeHelp) closeHelp.onclick = () => { state.showHelp = false; render(); };
  document.querySelectorAll("[data-step]").forEach((el) => el.onclick = (e) => { state.activeStep = e.target.dataset.step; render(); });
  document.querySelector("#scoreMode").onchange = (e) => { state.session.scoringMode = e.target.value; state.scored = null; persist(); };
  document.querySelector("#inputMode").onchange = (e) => {
    state.session.inputMode = e.target.value;
    if (state.session.inputMode === "manual") state.parseUi.confirmed = false;
    persist();
  };
  document.querySelector("#addMed").onclick = () => { state.session.medications.push(defaultMedication()); persist(); };

  const parseBtn = document.querySelector("#parseText");
  if (parseBtn) {
    parseBtn.onclick = () => {
      const raw = document.querySelector("#freeText").value;
      state.session.rawInputText = raw;
      state.session.lastParseResult = parseMedicationText(raw);
      state.parseUi.confirmed = false;
      state.scored = null;
      persist();
    };
  }

  const addParsed = document.querySelector("#addParsedRows");
  if (addParsed) {
    addParsed.onclick = () => {
      const candidates = state.session.lastParseResult?.candidates || [];
      state.session.medications.push(...candidates.map(parsedToMedication));
      state.scored = null;
      persist();
    };
  }

  const confirmReviewed = document.querySelector("#confirmReviewed");
  if (confirmReviewed) {
    confirmReviewed.onclick = () => {
      state.parseUi.confirmed = true;
      state.session.manualCorrectionsLog.push({ at: new Date().toISOString(), action: "review-confirmed", candidateCount: state.session.lastParseResult?.candidates?.length || 0 });
      persist();
    };
  }

  document.querySelector("#saveSnapshot").onclick = () => {
    const label = window.prompt(tr("labels.session_label_prompt"), tr("labels.session_label_default"));
    if (label !== null) {
      saveSnapshot(state.session, label);
      render();
    }
  };
  document.querySelector("#snapshotSelect").onchange = (e) => { const selected = loadSnapshot(e.target.value); if (selected) { state.session = selected.session; state.scored = null; persist(); } };
  document.querySelector("#resetSession").onclick = () => { state.session = defaultSession(); state.scored = null; resetStorage(); persist(); };
  document.querySelector("#exportJson").onclick = () => downloadText("mrci-session.json", exportJson(state.session, state.scored), "application/json");
  document.querySelector("#exportCsv").onclick = () => downloadText("mrci-medications.csv", exportCsv(state.session.medications, state.scored, state.session.scoringMode, state.session), "text/csv");
  document.querySelector("#print").onclick = () => window.print();
  document.querySelector("#importFile").onchange = async (e) => { const file = e.target.files[0]; if (file) { state.session = importFromJson(await file.text()); state.scored = null; persist(); } };

  document.querySelectorAll("[data-field]").forEach((el) => {
    el.onchange = (e) => {
      const idx = Number(e.target.dataset.idx);
      const field = e.target.dataset.field;
      state.session.medications[idx][field === "additionalInstructionsMulti" ? "additionalInstructions" : field] =
        field === "additionalInstructionsMulti" ? Array.from(e.target.selectedOptions).map((opt) => opt.value).join("; ") : e.target.type === "checkbox" ? e.target.checked : e.target.value;
      state.session.medications[idx].dosageFormRoute = state.session.medications[idx].dosageForm || "";
      state.session.medications[idx].manuallyCorrected = true;
      state.session.manualCorrectionsLog.push({ at: new Date().toISOString(), action: "field-edited", medicationId: state.session.medications[idx].id, field });
      state.scored = null;
      persist();
    };
  });

  document.querySelectorAll("button[data-action='delete-med']").forEach((el) => el.onclick = (e) => { state.session.medications.splice(Number(e.target.dataset.idx), 1); state.scored = null; persist(); });
  document.querySelectorAll("button[data-action='duplicate-med']").forEach((el) => el.onclick = (e) => { const idx = Number(e.target.dataset.idx); const med = state.session.medications[idx]; state.session.medications.splice(idx + 1, 0, { ...med, id: crypto.randomUUID(), validated: false }); state.scored = null; persist(); });
  document.querySelector("#runCalc").onclick = () => {
    state.validation = validateMedications();
    const blockingAiReview = state.session.inputMode === "ai" && state.session.lastParseResult && !state.parseUi.confirmed;
    if (state.validation.length || blockingAiReview) return render();
    state.session.lastValidatedRegimen = state.session.medications.map((m) => ({ ...m }));
    state.scored = scoreAll(state.session.medications.map((m) => ({ ...m, dosageFormRoute: m.dosageForm || m.dosageFormRoute || "" })), state.mappings, state.session.scoringMode, state.session.aMrciCorrections || {});
    state.activeStep = "results";
    persist();
  };

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
