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
import { createDebouncedSearch, filterAndRankCimaResults, highlightMatch } from "./lib/integrations/cimaSearchController.js";
import { appendMedication, removeMedicationAt, duplicateMedicationAt } from "./lib/medicationEntry/workflow.js";

const ROUTE_OPTIONS = [
  { key: "oral", label_en: "Oral", label_es: "Oral" },
  { key: "inhaled", label_en: "Inhaled", label_es: "Inhalada" },
  { key: "subcutaneous", label_en: "Subcutaneous", label_es: "Subcutánea" },
  { key: "intravenous", label_en: "Intravenous", label_es: "Intravenosa" },
  { key: "topical", label_en: "Topical", label_es: "Tópica" },
  { key: "ophthalmic", label_en: "Ophthalmic", label_es: "Oftálmica" },
  { key: "otic", label_en: "Otic", label_es: "Ótica" },
  { key: "other", label_en: "Other", label_es: "Otra" }
];
const RESULTS_TABS = ["summary", "by-medication", "calculation", "warnings"];
const STEPS = ["input", "validation", "results", "comparison", "report"];
const DOSAGE_FORM_LABELS = {
  tablet: { label_en: "Tablet", label_es: "Comprimido", key: "tablet" },
  capsule: { label_en: "Capsule", label_es: "Cápsula", key: "capsule" },
  pill: { label_en: "Pill", label_es: "Píldora", key: "pill" },
  liquid: { label_en: "Liquid", label_es: "Líquido", key: "liquid" },
  solution: { label_en: "Solution", label_es: "Solución", key: "solution" },
  suspension: { label_en: "Suspension", label_es: "Suspensión", key: "suspension" },
  inhaler: { label_en: "Inhaler", label_es: "Inhalador", key: "inhaler" },
  nebulizer: { label_en: "Nebulizer", label_es: "Nebulizador", key: "nebulizer" },
  injection: { label_en: "Injection", label_es: "Inyección", key: "injection" },
  injectable: { label_en: "Injectable", label_es: "Inyectable", key: "injectable" },
  patch: { label_en: "Patch", label_es: "Parche", key: "patch" },
  drop: { label_en: "Drop", label_es: "Gotas", key: "drop" },
  "eye drop": { label_en: "Eye drop", label_es: "Gotas oftálmicas", key: "eye_drop" },
  "ear drop": { label_en: "Ear drop", label_es: "Gotas óticas", key: "ear_drop" },
  pen: { label_en: "Pen device", label_es: "Dispositivo tipo pluma", key: "pen" },
  pump: { label_en: "Pump", label_es: "Bomba", key: "pump" }
};
const FREQUENCY_LABELS = {
  daily: { key: "daily", label_en: "Daily", label_es: "Diaria" },
  "once daily": { key: "once_daily", label_en: "Once daily", label_es: "Una vez al día" },
  "every day": { key: "every_day", label_en: "Every day", label_es: "Cada día" },
  bid: { key: "bid", label_en: "Twice daily (BID)", label_es: "Dos veces al día (BID)" },
  "twice daily": { key: "twice_daily", label_en: "Twice daily", label_es: "Dos veces al día" },
  tid: { key: "tid", label_en: "Three times daily (TID)", label_es: "Tres veces al día (TID)" },
  "three times daily": { key: "three_times_daily", label_en: "Three times daily", label_es: "Tres veces al día" },
  qid: { key: "qid", label_en: "Four times daily (QID)", label_es: "Cuatro veces al día (QID)" },
  "four times daily": { key: "four_times_daily", label_en: "Four times daily", label_es: "Cuatro veces al día" },
  q6h: { key: "q6h", label_en: "Every 6 hours", label_es: "Cada 6 horas" },
  "every 6 hours": { key: "every_6_hours", label_en: "Every 6 hours", label_es: "Cada 6 horas" },
  q4h: { key: "q4h", label_en: "Every 4 hours", label_es: "Cada 4 horas" },
  "every 4 hours": { key: "every_4_hours", label_en: "Every 4 hours", label_es: "Cada 4 horas" },
  weekly: { key: "weekly", label_en: "Weekly", label_es: "Semanal" },
  monthly: { key: "monthly", label_en: "Monthly", label_es: "Mensual" }
};
const DIRECTION_LABELS = {
  "with food": { key: "with_food", label_en: "With food", label_es: "Con comida" },
  "take with meals": { key: "with_meals", label_en: "Take with meals", label_es: "Tomar con las comidas" },
  "empty stomach": { key: "empty_stomach", label_en: "Empty stomach", label_es: "En ayunas" },
  "before breakfast": { key: "before_breakfast", label_en: "Before breakfast", label_es: "Antes del desayuno" },
  "at bedtime": { key: "at_bedtime", label_en: "At bedtime", label_es: "Al acostarse" },
  alternate: { key: "alternate", label_en: "Alternating schedule", label_es: "Pauta alternante" },
  taper: { key: "taper", label_en: "Taper", label_es: "Descenso progresivo" },
  "rinse mouth": { key: "rinse_mouth", label_en: "Rinse mouth", label_es: "Enjuagar la boca" },
  "shake well": { key: "shake_well", label_en: "Shake well", label_es: "Agitar bien" },
  monitor: { key: "monitor", label_en: "Monitoring required", label_es: "Requiere monitorización" }
};

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
    type: "smart",
    status: "idle",
    error: "",
    results: [],
    selectedResultId: "",
    minQueryLength: 3
  },
  entryMedication: defaultMedication(),
  editingMedicationIdx: null
};
if (!state.session.outputLayer) state.session.outputLayer = state.session.debugMode ? "technical" : "clinical";

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
    "A-MRCI frequency not mapped": "warnings.amrci_frequency_unmapped",
    "A-MRCI score uses approximation mappings and requires local validation": "warnings.amrci_approximate",
    "Field inferred from available row data": "warnings.inferred_field",
    "MRCI dosage form not mapped": "warnings.mrci_form_unmapped",
    "MRCI frequency not mapped": "warnings.mrci_frequency_unmapped",
    approximate: "warnings.approximate",
    inferred: "warnings.inferred"
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

function humanizeFormKey(key = "") {
  const map = {
    tablet_or_capsule_or_pill: "clinical.form.tablet_or_capsule_or_pill",
    liquid_or_solution_or_suspension: "clinical.form.liquid_or_solution_or_suspension",
    inhaler_or_nebulizer: "clinical.form.inhaler_or_nebulizer",
    injection: "clinical.form.injection",
    topical_patch: "clinical.form.topical_patch",
    eye_or_ear_drop: "clinical.form.eye_or_ear_drop",
    subcutaneous_device: "clinical.form.subcutaneous_device",
    complex_device: "clinical.form.complex_device",
    oral_simple: "clinical.form.oral_simple",
    oral_liquid: "clinical.form.oral_liquid",
    inhaled: "clinical.form.inhaled",
    injectable: "clinical.form.injectable",
    topical_or_transdermal: "clinical.form.topical_or_transdermal",
    ophthalmic_otologic: "clinical.form.ophthalmic_otologic",
    device_complex: "clinical.form.device_complex",
    unknown: "clinical.form.unknown"
  };
  return tr(map[key] || "") || key || tr("labels.missing");
}

function humanizeFrequencyKey(key = "") {
  const map = {
    once_daily: "clinical.frequency.once_daily",
    twice_daily: "clinical.frequency.twice_daily",
    three_times_daily: "clinical.frequency.three_times_daily",
    four_times_daily: "clinical.frequency.four_times_daily",
    every_6_hours: "clinical.frequency.every_6_hours",
    every_4_hours: "clinical.frequency.every_4_hours",
    weekly: "clinical.frequency.weekly",
    monthly: "clinical.frequency.monthly",
    daily_or_less: "clinical.frequency.daily_or_less",
    three_plus_daily: "clinical.frequency.three_plus_daily",
    weekly_or_monthly: "clinical.frequency.weekly_or_monthly",
    unknown: "clinical.frequency.unknown"
  };
  return tr(map[key] || "") || key || tr("labels.missing");
}

function humanizeDirectionKeys(keys = []) {
  if (!keys.length) return tr("clinical.direction.none");
  const map = {
    with_food: "clinical.direction.with_food",
    without_food: "clinical.direction.without_food",
    split_or_crush_or_mix: "clinical.direction.split_or_crush_or_mix",
    taper_or_variable_schedule: "clinical.direction.taper_or_variable_schedule",
    specific_time_of_day: "clinical.direction.specific_time_of_day",
    inhaler_technique: "clinical.direction.inhaler_technique",
    monitoring_or_special_instruction: "clinical.direction.monitoring_or_special_instruction",
    food_related: "clinical.direction.food_related",
    special_handling: "clinical.direction.special_handling",
    variable_schedule: "clinical.direction.variable_schedule",
    device_technique: "clinical.direction.device_technique",
    none: "clinical.direction.none"
  };
  return keys.map((k) => tr(map[k] || "") || k).join(", ");
}

function interpretationBand(value = 0, lowCutoff = 1, highCutoff = 3) {
  if (value <= lowCutoff) return tr("clinical.interpretation.low");
  if (value >= highCutoff) return tr("clinical.interpretation.high");
  return tr("clinical.interpretation.moderate");
}

function describeComplexityNarrative(medication) {
  const statements = [
    tr("clinical.interpretation.form", { level: interpretationBand(medication.sectionDiff?.A || 0, 0.5, 2) }),
    tr("clinical.interpretation.frequency", { level: interpretationBand(medication.sectionDiff?.B || 0, 0.5, 2) }),
    tr("clinical.interpretation.instructions", { level: interpretationBand(medication.sectionDiff?.C || 0, 0.5, 1.5) })
  ];
  return statements.join(" ");
}

function clinicianExplanation(medication) {
  const mrciRule = medication.mrciRule || {};
  const amrciRule = medication.aMrciRule || {};
  const formLabel = humanizeFormKey(mrciRule.formKey);
  const frequencyLabel = humanizeFrequencyKey(mrciRule.freqKey);
  const instructionsLabel = humanizeDirectionKeys(mrciRule.dirKeys || []);
  const prnLabel = mrciRule.prn ? tr("labels.yes") : tr("labels.no");
  const routeLabel = medication.route || tr("labels.missing");
  const narrative = describeComplexityNarrative(medication);
  const aForm = humanizeFormKey(amrciRule.formKey);
  const aFrequency = humanizeFrequencyKey(amrciRule.freqKey);
  const aSpecialHandling = humanizeDirectionKeys(amrciRule.dirKeys || []);

  return `<article class="medication-card">
    <header>
      <h4>${esc(medication.drugName || tr("labels.missing"))}</h4>
      <p>${esc(formLabel)} · ${esc(routeLabel)} · ${esc(frequencyLabel)}</p>
    </header>
    <div class="clinical-meta">
      <span><strong>${tr("results.prn")}:</strong> ${esc(prnLabel)}</span>
      <span><strong>${tr("results.additional_instructions")}:</strong> ${esc(instructionsLabel)}</span>
    </div>
    <p class="clinical-narrative">${narrative}</p>
    <div class="info-soft">
      <strong>${tr("clinical.amrci_explanation")}:</strong>
      ${tr("clinical.amrci_clinical_summary", {
        form: aForm,
        frequency: aFrequency,
        handling: aSpecialHandling
      })}
    </div>
    <p class="warning-soft">${tr("clinical.amrci_warning")}</p>
  </article>`;
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

function optionLabel(option) {
  return state.session.language === "es" ? option.label_es : option.label_en;
}

function localizedOptions(values = [], catalog = {}) {
  return values.map((key) => {
    const option = catalog[key] || { key, label_en: key, label_es: key };
    return `<option value="${key}">${esc(optionLabel(option))}</option>`;
  }).join("");
}

function medicationEntryForm(validationMap) {
  const med = state.entryMedication;
  const invalid = (field) => (validationMap[`entry:${field}`] ? "invalid" : "");
  const formValues = optionsFromAliases(state.mappings?.mrciClassic?.dosageForms?.aliases);
  const freqValues = optionsFromAliases(state.mappings?.mrciClassic?.frequencies?.aliases);
  const directionValues = Object.keys(state.mappings?.mrciClassic?.additionalDirections?.keywords || {}).sort();
  const actionLabel = state.editingMedicationIdx === null ? tr("buttons.add") : tr("buttons.save_changes");
  return `<section class="card entry-form">
    <h3>${tr("labels.medication_entry")}</h3>
    <div class="entry-grid">
      <label>${tr("results.drug")}<input class="${invalid("drugName")}" data-entry-field="drugName" value="${esc(med.drugName || "")}"></label>
      <label>${tr("results.strength")}<input data-entry-field="strength" value="${esc(med.strength || "")}" placeholder="10 mg"></label>
      <label>${tr("results.dosage_form")}<select data-entry-field="dosageForm"><option value="">—</option>${localizedOptions(formValues, DOSAGE_FORM_LABELS)}</select></label>
      <label>${tr("results.route")}<select data-entry-field="route"><option value="">—</option>${ROUTE_OPTIONS.map((r) => `<option value="${r.key}">${optionLabel(r)}</option>`).join("")}</select></label>
      <label>${tr("results.frequency")}<select data-entry-field="frequency"><option value="">—</option>${localizedOptions(freqValues, FREQUENCY_LABELS)}</select></label>
      <label class="inline">${tr("results.prn")}<input type="checkbox" data-entry-field="prn" ${med.prn ? "checked" : ""}></label>
      <label>${tr("results.additional_instructions")}<select multiple data-entry-field="additionalInstructionsMulti">${localizedOptions(directionValues, DIRECTION_LABELS)}</select></label>
      <label>${tr("results.notes")}<input data-entry-field="notes" value="${esc(med.notes || "")}"></label>
      <label class="inline">${tr("results.validated")}<input type="checkbox" data-entry-field="validated" ${med.validated ? "checked" : ""}></label>
    </div>
    <details><summary>${tr("labels.technical_details")}</summary>
      <div class="entry-grid">
        <label>${tr("labels.cn_label")}<input data-entry-field="cimaNationalCode" value="${esc(med.cimaNationalCode || "")}"></label>
        <label>${tr("labels.reg_label")}<input data-entry-field="cimaRegistrationNumber" value="${esc(med.cimaRegistrationNumber || "")}"></label>
      </div>
    </details>
    <div class="toolbar"><button id="addMedicationBtn" class="primary-cta">${actionLabel}</button>${state.editingMedicationIdx !== null ? `<button id="cancelEditMedication" class="ghost">${tr("buttons.cancel")}</button>` : ""}</div>
  </section>`;
}

function regimenPanel() {
  return `<section class="card regimen-panel">
    <h3>${tr("labels.regimen_list")}</h3>
    <p><strong>${tr("labels.regimen_count", { count: state.session.medications.length })}</strong></p>
    <table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.dosage_form")}</th><th>${tr("results.frequency")}</th><th>${tr("results.prn")}</th><th>${tr("results.additional_instructions")}</th><th>${tr("labels.row_actions")}</th></tr></thead>
    <tbody>${state.session.medications.map((med, idx) => `<tr><td>${esc(med.drugName || tr("labels.missing"))}</td><td>${esc((DOSAGE_FORM_LABELS[med.dosageForm]?.[state.session.language === "es" ? "label_es" : "label_en"]) || med.dosageForm || "—")}</td><td>${esc((FREQUENCY_LABELS[med.frequency]?.[state.session.language === "es" ? "label_es" : "label_en"]) || med.frequency || "—")}</td><td>${med.prn ? tr("labels.yes") : tr("labels.no")}</td><td>${esc(splitInstructions(med.additionalInstructions).join("; ") || "—")}</td><td class="actions"><button data-action="edit-med" data-idx="${idx}">${tr("buttons.edit")}</button><button data-action="duplicate-med" data-idx="${idx}">${tr("buttons.duplicate")}</button><button class="ghost" data-action="delete-med" data-idx="${idx}">${tr("buttons.delete")}</button><button class="ghost" data-action="move-up-med" data-idx="${idx}">↑</button><button class="ghost" data-action="move-down-med" data-idx="${idx}">↓</button></td></tr>`).join("")}</tbody></table>
  </section>`;
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
  const results = state.cima.results.map((item, idx) => `<button class="cima-result ${item.id === state.cima.selectedResultId ? "active" : ""}" data-action="select-cima-result" data-result-idx="${idx}">
    <strong>${highlightMatch(esc(item.name || tr("labels.missing")), state.cima.query)}</strong>
    <small>${tr("labels.form_short")}: ${highlightMatch(esc(item.form || tr("labels.missing")), state.cima.query)} | ${tr("results.route")}: ${esc(item.route || tr("labels.missing"))} | CN: ${highlightMatch(esc(item.nationalCode || "—"), state.cima.query)} | ${tr("labels.reg_short")}: ${highlightMatch(esc(item.registrationNumber || "—"), state.cima.query)}</small>
    <small>${tr("labels.active_ingredients")}: ${highlightMatch(esc(item.activeIngredients || tr("labels.missing")), state.cima.query)}</small>
  </button>`).join("");

  return `<section class="cima-panel card">
    <h3>${tr("labels.cima_lookup")}</h3>
    <p class="note">${tr("labels.cima_warning")}</p>
    <div class="toolbar cima-toolbar">
      <label>${tr("labels.cima_search_type")}
        <select id="cimaSearchType">
          <option value="smart" ${state.cima.type === "smart" ? "selected" : ""}>${tr("labels.search_smart")}</option>
          <option value="name" ${state.cima.type === "name" ? "selected" : ""}>${tr("labels.search_brand")}</option>
          <option value="ingredient" ${state.cima.type === "ingredient" ? "selected" : ""}>${tr("labels.search_ingredient")}</option>
        </select>
      </label>
      <label>${tr("labels.search")}
        <input id="cimaQuery" value="${esc(state.cima.query)}" placeholder="${tr("labels.cima_placeholder")}">
      </label>
    </div>
    ${state.cima.status === "idle" && state.cima.query.trim().length > 0 && state.cima.query.trim().length < state.cima.minQueryLength ? `<p>${tr("labels.cima_min_chars", { count: state.cima.minQueryLength })}</p>` : ""}
    ${state.cima.status === "loading" ? `<p>${tr("labels.cima_searching")}</p>` : ""}
    ${state.cima.error ? `<p class="issues">${esc(state.cima.error)}</p>` : ""}
    ${state.cima.status === "success" && !state.cima.error && state.cima.query && !state.cima.results.length ? `<p>${tr("labels.no_cima_results")}</p>` : ""}
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
  return `<div class="score-grid">
    <article class="score-card primary"><h3>${tr("results.mrci_total")}</h3><p class="hero">${c?.total ?? tr("labels.no_data")}</p><p>${tr("results.section_a")}: ${c?.subtotalA ?? "-"} · ${tr("results.section_b")}: ${c?.subtotalB ?? "-"} · ${tr("results.section_c")}: ${c?.subtotalC ?? "-"}</p></article>
    <article class="score-card accent"><h3>${tr("results.amrci_total")}</h3><p class="hero">${a?.total ?? tr("labels.no_data")}</p><p>${tr("results.section_a")}: ${a?.subtotalA ?? "-"} · ${tr("results.section_b")}: ${a?.subtotalB ?? "-"} · ${tr("results.section_c")}: ${a?.subtotalC ?? "-"}</p></article>
    <article class="score-card delta"><h3>${tr("results.abs_diff")}</h3><p class="hero">${scores.delta}</p><p>${tr("labels.section_breakdown")}</p></article>
  </div>${comparisonBars(scores)}`;
}
function byMedicationTab(scores) {
  if (!scores.comparison) return `<p>${tr("labels.comparison_required_med")}</p>`;
  if (state.session.outputLayer === "technical") {
    return `<table><thead><tr><th>${tr("results.drug")}</th><th>MRCI</th><th>A-MRCI</th><th>${tr("results.abs_diff")}</th><th>${tr("labels.technical_trace")}</th></tr></thead><tbody>${scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.mrci}</td><td>${m.aMrci}</td><td>${m.difference}</td><td><details><summary>${tr("labels.technical_trace")}</summary><pre>${esc(JSON.stringify({ normalizedMedication: m.medication, mrciRule: m.mrciRule, aMrciRule: m.aMrciRule, sectionDiff: m.sectionDiff }, null, 2))}</pre></details></td></tr>`).join("")}</tbody></table>`;
  }
  return `<div class="medication-stack">${scores.comparison.map((m) => clinicianExplanation(m)).join("")}</div>`;
}
function bySectionTab(scores) {
  if (!scores.comparison) return `<p>${tr("labels.comparison_required_section")}</p>`;
  const rows = scores.comparison.map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.sectionDiff.A}</td><td>${m.sectionDiff.B}</td><td>${m.sectionDiff.C}</td></tr>`).join("");
  if (state.session.outputLayer === "technical") {
    return `<table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.section_a")}</th><th>${tr("results.section_b")}</th><th>${tr("results.section_c")}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  return `<section class="card section-overview"><h3>${tr("labels.section_breakdown")}</h3><table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.section_a")}</th><th>${tr("results.section_b")}</th><th>${tr("results.section_c")}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function warningsTab(scores) {
  const warnings = [...(scores.classic?.warnings || []), ...(scores.amrci?.warnings || [])];
  if (!warnings.length) return `<p>${tr("labels.no_warnings")}</p>`;
  return `<table><thead><tr><th>${tr("results.drug")}</th><th>${tr("results.type")}</th><th>${tr("results.field")}</th><th>${tr("results.message")}</th>${state.session.outputLayer === "technical" ? `<th>${tr("labels.manual_correction")}</th>` : ""}</tr></thead><tbody>${warnings.map((w, i) => `<tr><td>${esc(w.medicationName)}</td><td>${w.type === "unmapped" ? tr("warnings.unmapped") : esc(translateDynamicText(w.type))}</td><td>${esc(translateFieldName(w.field))}</td><td>${esc(translateDynamicText(w.message))}<br><strong>${tr("warnings.needs_manual_review")}</strong></td>${state.session.outputLayer === "technical" ? `<td><input placeholder="oral_simple" data-fix-med="${w.medicationId}" data-fix-field="${w.field}" data-fix-row="${i}"></td>` : ""}</tr>`).join("")}</tbody></table>${state.session.outputLayer === "technical" ? `<button id="applyCorrections">${tr("buttons.apply_corrections")}</button>` : ""}`;
}
function renderResults(scores) {
  if (!scores) return `<h2>${tr("nav.results")}</h2><p>${tr("labels.run_to_see_results")}</p>`;
  const tabs = RESULTS_TABS.map((tab) => `<button class="tab-btn ${state.resultsTab === tab ? "active" : ""}" data-tab="${tab}">${tab === "by-medication" ? tr("labels.by_medication") : tab === "calculation" ? tr("labels.how_calculated") : tab === "warnings" ? tr("labels.mapping_warnings") : tr("labels.summary")}</button>`).join("");
  const tabBody = state.resultsTab === "summary" ? summaryTab(scores) : state.resultsTab === "by-medication" ? byMedicationTab(scores) : state.resultsTab === "calculation" ? bySectionTab(scores) : warningsTab(scores);
  return `<h2>${tr("nav.results")}</h2>
  <p>${tr("labels.validated_count")}: ${scores.eligibleCount}</p>
  <div class="results-layout">
    <section class="result-block">${summaryTab(scores)}</section>
    <section class="result-block">
      <div class="toolbar">${tabs}</div>
      ${tabBody}
    </section>
  </div>`;
}

function sectionVisible(step) {
  return state.activeStep === step ? "" : "hidden";
}

function render() {
  if (!state.mappings) return void (root.innerHTML = `<p>${tr("labels.loading")}</p>`);
  document.title = tr("app_title");
  state.validation = validateMedications();
  const validationMap = Object.fromEntries(state.validation.map((v) => [`${v.idx}:${v.field}`, true]));
  if (!state.entryMedication?.id) state.entryMedication = defaultMedication();
  if (!state.entryMedication.drugName?.trim() && state.entryMedication.frequency === "") {
    state.validation.forEach((v) => {
      if (v.idx === state.editingMedicationIdx) validationMap[`entry:${v.field}`] = true;
    });
  }
  const lang = state.session.language || "en";
  const blockingAiReview = state.session.inputMode === "ai" && state.session.lastParseResult && !state.parseUi.confirmed;

  root.innerHTML = `<header class="topbar hero-header">
  <div class="hero-copy">
    <p class="eyebrow">MRCI / A-MRCI</p>
    <h1>${tr("app_title")}</h1>
    <p>${tr("labels.hero_subtitle")}</p>
    <p class="disclaimer">${tr("disclaimer")}</p>
  </div>
  <div class="toolbar toolbar-top">
    <label class="compact-control">${tr("labels.language")} <select id="langSelect"><option value="en" ${lang === "en" ? "selected" : ""}>EN</option><option value="es" ${lang === "es" ? "selected" : ""}>ES</option></select></label>
    <div class="view-toggle-wrap">
      <p>${tr("labels.output_layer")}</p>
      <div class="segmented">
        <button data-output-layer="clinical" class="${(state.session.outputLayer || "clinical") === "clinical" ? "active" : ""}">${tr("labels.clinical_view")}</button>
        <button data-output-layer="technical" class="${state.session.outputLayer === "technical" ? "active" : ""}">${tr("labels.technical_view")}</button>
      </div>
      <small>${tr("tooltips.technical_view")}</small>
    </div>
    <div class="header-actions">
      <button id="toggleHelp" class="ghost">${tr("nav.help")}</button>
      <button id="resetSession" class="ghost">${tr("nav.reset")}</button>
    </div>
  </div>
  </header>

  <nav class="stepper">${STEPS.map((s) => `<button class="step ${state.activeStep === s ? "active" : ""}" data-step="${s}">${tr(`nav.${s}`)}</button>`).join("")}</nav>

  <section class="section-shell ${sectionVisible("input")}"><h2 class="section-heading">${tr("nav.input")}</h2>
    <div class="toolbar stacked controls-grid">
      <label>${tr("labels.scoring_mode")}
      <select id="scoreMode"><option value="classic" ${state.session.scoringMode === "classic" ? "selected" : ""}>${tr("modes.classic")}</option><option value="amrci" ${state.session.scoringMode === "amrci" ? "selected" : ""}>${tr("modes.amrci")}</option><option value="compare" ${state.session.scoringMode === "compare" ? "selected" : ""}>${tr("modes.compare")}</option></select></label>
      <label>${tr("labels.input_mode")}
      <select id="inputMode"><option value="manual" ${state.session.inputMode === "manual" ? "selected" : ""}>${tr("labels.manual_entry")}</option><option value="ai" ${state.session.inputMode === "ai" ? "selected" : ""}>${tr("labels.ai_assist")}</option></select></label>
      <button id="saveSnapshot">${tr("buttons.save")}</button><select id="snapshotSelect"><option value="">${tr("labels.load_session")}</option>${listSnapshots().map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
      <button id="exportJson">${tr("buttons.export_json")}</button><button id="exportCsv">${tr("buttons.export_csv")}</button><button id="print">${tr("buttons.print_report")}</button><label class="import-btn">${tr("buttons.import")}<input type="file" id="importFile" accept="application/json"></label>
    </div>
    ${state.session.inputMode === "ai" ? `<p class="note">${tr("labels.reviewed_required")}</p><div class="split-view"><div><h3>${tr("labels.free_text")}</h3><textarea id="freeText" rows="12" placeholder="...">${esc(state.session.rawInputText || "")}</textarea><button id="parseText">${tr("buttons.parse")}</button></div><div><h3>${tr("labels.extraction_preview")}</h3>${parseReviewPane()}</div></div>` : `<p>${tr("labels.manual_workflow_active")}</p>`}
    <div class="entry-layout">${cimaSearchPanel()}${medicationEntryForm(validationMap)}${regimenPanel()}</div></section>

  <section class="section-shell ${sectionVisible("validation")}"><h2 class="section-heading">${tr("nav.validation")}</h2>${state.validation.length ? `<ul class='issues'>${state.validation.map((i) => `<li>${i.msg} (#${i.idx + 1})</li>`).join("")}</ul>` : `<p class='ok'>${tr("labels.no_validation_issues")}</p>`}
  ${blockingAiReview ? `<p class='issues'>${tr("labels.ai_review_blocking")}</p>` : ""}
  <button id="runCalc" ${(state.validation.length || blockingAiReview) ? "disabled" : ""}>${tr("buttons.calculate")}</button></section>

  <section class="section-shell ${sectionVisible("results")}">${renderResults(state.scored)}</section>

  <section class="section-shell ${sectionVisible("comparison")}"><h2 class="section-heading">${tr("nav.comparison")}</h2>${state.scored ? bySectionTab(state.scored) + byMedicationTab(state.scored) : `<p>${tr("labels.run_to_see_results")}</p>`}</section>
  <section class="section-shell ${sectionVisible("report")}"><h2 class="section-heading">${tr("nav.report")}</h2><p>${tr("labels.report_ready_hint")}</p><div class="toolbar"><button id="reportPrintBtn">${tr("buttons.print_report")}</button><button id="reportDownloadBtn">${tr("buttons.download_report")}</button></div><section id="printable" class="printable">${reportHtml(state.session, state.scored, state.session.language, tr, state.session.outputLayer || "clinical")}</section></section>
  ${state.showHelp ? `<dialog open class="help-dialog"><h3>${tr("nav.help")}</h3><p>${tr("labels.help_body")}</p><button id="closeHelp">OK</button></dialog>` : ""}`;

  document.querySelectorAll("select[data-entry-field='additionalInstructionsMulti']").forEach((el) => {
    const selected = new Set(splitInstructions(state.entryMedication.additionalInstructions));
    Array.from(el.options).forEach((opt) => {
      opt.selected = selected.has(opt.value);
    });
  });
  document.querySelectorAll("[data-entry-field='dosageForm']").forEach((el) => { el.value = state.entryMedication.dosageForm || ""; });
  document.querySelectorAll("[data-entry-field='frequency']").forEach((el) => { el.value = state.entryMedication.frequency || ""; });
  document.querySelectorAll("[data-entry-field='route']").forEach((el) => { el.value = state.entryMedication.route || ""; });

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

const cimaSearchRunner = createDebouncedSearch({
  minLength: state.cima.minQueryLength,
  waitMs: 300,
  searchFn: async (query) => {
    const apiResults = state.cima.type === "smart"
      ? [
        ...(await searchMedications(query, { type: "name" })),
        ...(await searchMedications(query, { type: "ingredient" }))
      ].filter((item, idx, arr) => arr.findIndex((other) => other.id === item.id) === idx)
      : await searchMedications(query, { type: state.cima.type });
    const enriched = await Promise.all(
      apiResults.slice(0, 24).map(async (item) => {
        const presentations = await getPresentationDetail({ registrationNumber: item.registrationNumber });
        return { ...item, nationalCode: item.nationalCode || presentations[0]?.nationalCode || "" };
      })
    );
    return filterAndRankCimaResults(enriched, query).slice(0, 12);
  },
  onState: (nextState) => {
    state.cima.status = nextState.type;
    state.cima.error = "";
    if (nextState.type === "success" || nextState.type === "idle") {
      state.cima.results = nextState.results || [];
      state.cima.selectedResultId = state.cima.results[0]?.id || "";
    }
    if (nextState.type === "loading") state.cima.results = [];
    if (nextState.type === "error") {
      state.cima.results = [];
      state.cima.error = tr("errors.cima_failed");
    }
    render();
  }
});

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

    state.entryMedication = applyCimaSelectionToMedication({ ...state.entryMedication }, cimaData);
    state.editingMedicationIdx = null;
    state.scored = null;
    state.cima.selectedResultId = selected.id || "";
    persist();
  } catch (error) {
    state.cima.error = tr("errors.cima_failed");
    console.error(error);
    render();
  }
}

function wireEvents() {
  const cimaSearchType = document.querySelector("#cimaSearchType");
  if (cimaSearchType) cimaSearchType.onchange = (e) => { state.cima.type = e.target.value; cimaSearchRunner.run(state.cima.query); };
  const cimaQuery = document.querySelector("#cimaQuery");
  if (cimaQuery) cimaQuery.oninput = (e) => { state.cima.query = e.target.value; cimaSearchRunner.run(state.cima.query); };
  document.querySelectorAll("[data-action='select-cima-result']").forEach((el) => {
    el.onclick = async (e) => {
      const idx = Number(e.currentTarget.dataset.resultIdx);
      await importCimaResult(idx);
    };
  });

  document.querySelector("#langSelect").onchange = (e) => { state.session.language = e.target.value; persist(); };
  document.querySelectorAll("[data-output-layer]").forEach((el) => {
    el.onclick = (e) => {
      state.session.outputLayer = e.currentTarget.dataset.outputLayer;
      persist();
    };
  });
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
  const addMedicationBtn = document.querySelector("#addMedicationBtn");
  if (addMedicationBtn) {
    addMedicationBtn.onclick = () => {
      const nextMed = { ...state.entryMedication, id: state.entryMedication.id || crypto.randomUUID(), dosageFormRoute: state.entryMedication.dosageForm || "" };
      if (state.editingMedicationIdx === null) state.session.medications = appendMedication(state.session.medications, nextMed);
      else state.session.medications[state.editingMedicationIdx] = nextMed;
      state.entryMedication = defaultMedication();
      state.editingMedicationIdx = null;
      state.scored = null;
      persist();
    };
  }
  const cancelEditMedication = document.querySelector("#cancelEditMedication");
  if (cancelEditMedication) cancelEditMedication.onclick = () => { state.editingMedicationIdx = null; state.entryMedication = defaultMedication(); render(); };

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
  document.querySelector("#print").onclick = () => { state.activeStep = "report"; render(); setTimeout(() => window.print(), 0); };
  const reportPrintBtn = document.querySelector("#reportPrintBtn");
  if (reportPrintBtn) reportPrintBtn.onclick = () => window.print();
  const reportDownloadBtn = document.querySelector("#reportDownloadBtn");
  if (reportDownloadBtn) reportDownloadBtn.onclick = () => window.print();
  document.querySelector("#importFile").onchange = async (e) => { const file = e.target.files[0]; if (file) { state.session = importFromJson(await file.text()); state.scored = null; persist(); } };

  document.querySelectorAll("[data-entry-field]").forEach((el) => {
    el.onchange = (e) => {
      const field = e.target.dataset.entryField;
      state.entryMedication[field === "additionalInstructionsMulti" ? "additionalInstructions" : field] =
        field === "additionalInstructionsMulti" ? Array.from(e.target.selectedOptions).map((opt) => opt.value).join("; ") : e.target.type === "checkbox" ? e.target.checked : e.target.value;
      state.entryMedication.dosageFormRoute = state.entryMedication.dosageForm || "";
      state.entryMedication.manuallyCorrected = true;
      state.scored = null;
      persist();
    };
  });

  document.querySelectorAll("button[data-action='edit-med']").forEach((el) => el.onclick = (e) => {
    const idx = Number(e.target.dataset.idx);
    state.entryMedication = { ...state.session.medications[idx] };
    state.editingMedicationIdx = idx;
    render();
  });
  document.querySelectorAll("button[data-action='delete-med']").forEach((el) => el.onclick = (e) => { state.session.medications = removeMedicationAt(state.session.medications, Number(e.target.dataset.idx)); state.scored = null; persist(); });
  document.querySelectorAll("button[data-action='duplicate-med']").forEach((el) => el.onclick = (e) => { state.session.medications = duplicateMedicationAt(state.session.medications, Number(e.target.dataset.idx)); state.scored = null; persist(); });
  document.querySelectorAll("button[data-action='move-up-med']").forEach((el) => el.onclick = (e) => {
    const idx = Number(e.target.dataset.idx);
    if (idx <= 0) return;
    const [item] = state.session.medications.splice(idx, 1);
    state.session.medications.splice(idx - 1, 0, item);
    persist();
  });
  document.querySelectorAll("button[data-action='move-down-med']").forEach((el) => el.onclick = (e) => {
    const idx = Number(e.target.dataset.idx);
    if (idx >= state.session.medications.length - 1) return;
    const [item] = state.session.medications.splice(idx, 1);
    state.session.medications.splice(idx + 1, 0, item);
    persist();
  });
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
