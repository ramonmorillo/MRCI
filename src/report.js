const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function localizedWarningMessage(w, tr) {
  const map = {
    "One or more A-MRCI additional direction mappings missing": "warnings.one_or_more_missing",
    "A-MRCI dosage form not mapped": "warnings.amrci_form_unmapped",
    "A-MRCI frequency not mapped": "warnings.amrci_frequency_unmapped",
    "A-MRCI score uses approximation mappings and requires local validation": "warnings.amrci_approximate",
    "Field inferred from available row data": "warnings.inferred_field",
    "MRCI dosage form not mapped": "warnings.mrci_form_unmapped",
    "MRCI frequency not mapped": "warnings.mrci_frequency_unmapped"
  };
  return tr(map[w] || "") || w;
}

export function reportHtml(session, scores, lang, tr) {
  const printDate = new Date().toLocaleDateString(lang === "es" ? "es-ES" : "en-US");
  const modeLabel = session.scoringMode === "classic" ? tr("modes.classic") : session.scoringMode === "amrci" ? tr("modes.amrci") : tr("modes.compare");
  const regimenRows = (session?.medications || [])
    .map((med) => `<tr><td>${esc(med.drugName)}</td><td>${esc(med.dosageForm || med.dosageFormRoute || "")}</td><td>${esc(med.frequency || "")}</td><td>${med.validated ? tr("labels.yes") : tr("labels.no")}</td></tr>`)
    .join("");

  const rows = (scores?.comparison || [])
    .map((m) => `<tr><td>${esc(m.drugName)}</td><td>${m.mrci}</td><td>${m.aMrci}</td><td>${m.difference}</td><td>A:${m.sectionDiff.A} B:${m.sectionDiff.B} C:${m.sectionDiff.C}</td></tr>`)
    .join("");

  const warningRows = ([...(scores?.classic?.warnings || []), ...(scores?.amrci?.warnings || [])])
    .map((w) => `<li><strong>${esc(w.medicationName)}</strong>: ${esc(w.field)} - ${esc(localizedWarningMessage(w.message, tr))} (${esc(w.type)}; ${tr("warnings.needs_manual_review")})</li>`)
    .join("");

  return `
  <h2>${tr("labels.report_title")}</h2>
  <p><strong>${tr("labels.date")}:</strong> ${printDate}</p>
  <p><strong>${tr("labels.scoring_mode")}:</strong> ${modeLabel}</p>
  <h3>${tr("labels.regimen_summary")}</h3>
  <table>
    <thead><tr><th>${tr("results.drug")}</th><th>${tr("results.dosage_form")}</th><th>${tr("results.frequency")}</th><th>${tr("results.validated")}</th></tr></thead>
    <tbody>${regimenRows || `<tr><td colspan="4">${tr("labels.no_data")}</td></tr>`}</tbody>
  </table>
  <h3>${tr("labels.section_breakdown")}</h3>
  <p>${tr("results.mrci_total")}: ${scores?.classic?.total ?? tr("labels.no_data")} (A:${scores?.classic?.subtotalA ?? "-"} B:${scores?.classic?.subtotalB ?? "-"} C:${scores?.classic?.subtotalC ?? "-"})</p>
  <p>${tr("results.amrci_total")}: ${scores?.amrci?.total ?? tr("labels.no_data")} (A:${scores?.amrci?.subtotalA ?? "-"} B:${scores?.amrci?.subtotalB ?? "-"} C:${scores?.amrci?.subtotalC ?? "-"})</p>
  <p>${tr("results.abs_diff")}: ${scores?.delta ?? tr("labels.no_data")}</p>
  <table>
    <thead><tr><th>${tr("results.drug")}</th><th>MRCI</th><th>A-MRCI</th><th>${tr("results.abs_diff")}</th><th>${tr("results.section_diff")}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${tr("labels.no_data")}</td></tr>`}</tbody>
  </table>
  <h3>${tr("labels.mapping_warnings")}</h3>
  <ul>${warningRows || `<li>${tr("labels.no_mapping_warnings")}</li>`}</ul>
  <p>${tr("disclaimer")}</p>`;
}
