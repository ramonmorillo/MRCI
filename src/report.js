export function reportHtml(session, scores) {
  const rows = session.medications
    .map(
      (m) => `<tr>
      <td>${m.drugName}</td>
      <td>${m.dosageFormRoute}</td>
      <td>${m.frequency}</td>
      <td>${m.prn ? "Yes" : "No"}</td>
      <td>${m.additionalInstructions}</td>
      <td>${m.validated ? "Validated" : "Not validated"}</td>
    </tr>`
    )
    .join("");

  return `
  <h2>Regimen Report</h2>
  <p><strong>Disclaimer:</strong> Support tool only. Not a medical device.</p>
  <p>Classic Total: ${scores.classic.total} | A-MRCI Total: ${scores.abbreviated.total} | Delta: ${scores.delta}</p>
  <table>
    <thead><tr><th>Drug</th><th>Form/Route</th><th>Frequency</th><th>PRN</th><th>Instructions</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
