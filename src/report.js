const esc = (v = "") => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function localizedWarningMessage(w, tr) {
  const map = {
    "One or more A-MRCI additional direction mappings missing": "warnings.one_or_more_missing",
    "A-MRCI dosage form not mapped": "warnings.amrci_form_unmapped",
    "A-MRCI frequency not mapped": "warnings.amrci_frequency_unmapped"
  };
  return tr(map[w] || "") || w;
}

export function reportHtml(session, scores, lang, tr) {
  const rows = (scores?.comparison || [])
    .map(
      (m) => `<tr>
      <td>${esc(m.drugName)}</td>
      <td>${m.mrci}</td>
      <td>${m.aMrci}</td>
      <td>${m.difference}</td>
      <td>A:${m.sectionDiff.A} B:${m.sectionDiff.B} C:${m.sectionDiff.C}</td>
    </tr>`
    )
    .join("");

  const warningRows = (scores?.amrci?.warnings || [])
    .map(
      (w) => `<li><strong>${esc(w.medicationName)}</strong>: ${esc(w.field)} - ${esc(localizedWarningMessage(w.message, tr))} (${esc(w.type)}; ${tr("warnings.needs_manual_review")})</li>`
    )
    .join("");

  return `
  <h2>${tr("labels.report_title")}</h2>
  <p>${tr("disclaimer")}</p>
  <p>${tr("labels.scoring_mode")}: ${session.scoringMode || "compare"}</p>
  <p>${tr("results.mrci_total")}: ${scores?.classic?.total ?? tr("labels.no_data")} | ${tr("results.amrci_total")}: ${scores?.amrci?.total ?? tr("labels.no_data")} | ${tr("results.abs_diff")}: ${scores?.delta ?? tr("labels.no_data")}</p>
  <table>
    <thead><tr><th>${tr("results.drug")}</th><th>MRCI</th><th>A-MRCI</th><th>${tr("results.abs_diff")}</th><th>${tr("results.section_diff")}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h3>${tr("labels.mapping_warnings")}</h3>
  <ul>${warningRows || `<li>${tr("labels.no_mapping_warnings")}</li>`}</ul>`;
}
