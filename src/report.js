export function reportHtml(session, scores) {
  const rows = session.medications
    .map(
      (m) => `<tr>
      <td>${m.drugName}</td>
      <td>${m.dosageForm || m.dosageFormRoute || ""}</td>
      <td>${m.route || ""}</td>
      <td>${m.frequency}</td>
      <td>${m.prn ? "Yes" : "No"}</td>
      <td>${m.additionalInstructions}</td>
      <td>${m.validated ? "Validated" : "Not validated"}</td>
    </tr>`
    )
    .join("");

  const classic = scores?.classic?.total ?? 0;
  const abr = scores?.abbreviated?.total ?? 0;
  const delta = scores?.delta ?? 0;

  return `
  <h2>Regimen Report</h2>
  <p><strong>Disclaimer:</strong> Support tool only. Not a medical device.</p>
  <p>Classic Total: ${classic} | A-MRCI Total: ${abr} | Delta: ${delta}</p>
  <table>
    <thead><tr><th>Drug</th><th>Form</th><th>Route</th><th>Frequency</th><th>PRN</th><th>Instructions</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
