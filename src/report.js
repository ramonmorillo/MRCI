export function reportHtml(session, scores) {
  const rows = (scores?.comparison || [])
    .map(
      (m) => `<tr>
      <td>${m.drugName}</td>
      <td>${m.mrci}</td>
      <td>${m.aMrci}</td>
      <td>${m.difference}</td>
      <td>A:${m.sectionDiff.A} B:${m.sectionDiff.B} C:${m.sectionDiff.C}</td>
    </tr>`
    )
    .join("");

  const warningRows = (scores?.amrci?.warnings || [])
    .map(
      (w) => `<li><strong>${w.medicationName}</strong>: ${w.field} - ${w.message} (${w.type}; needs manual review)</li>`
    )
    .join("");

  return `
  <h2>Printable Comparison Report</h2>
  <p><strong>Disclaimer:</strong> Support tool only. Not a medical device.</p>
  <p>Scoring mode: ${session.scoringMode || "compare"}</p>
  <p>MRCI Total: ${scores?.classic?.total ?? "N/A"} | A-MRCI Total: ${scores?.amrci?.total ?? "N/A"} | Absolute Difference: ${scores?.delta ?? "N/A"}</p>
  <table>
    <thead><tr><th>Drug</th><th>MRCI</th><th>A-MRCI</th><th>Abs Diff</th><th>Section Diff</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h3>Mapping warnings</h3>
  <ul>${warningRows || "<li>No mapping warnings.</li>"}</ul>`;
}
