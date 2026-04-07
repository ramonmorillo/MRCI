export function exportJson(session) {
  return JSON.stringify(session, null, 2);
}

export function exportCsv(medications) {
  const headers = [
    "drugName",
    "dosageFormRoute",
    "frequency",
    "prn",
    "additionalInstructions",
    "notes",
    "validated"
  ];
  const rows = medications.map((m) =>
    headers
      .map((h) => `"${String(m[h] ?? "").replaceAll('"', '""')}"`)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function importFromJson(text) {
  return JSON.parse(text);
}
