export function exportJson(session, scored = null) {
  return JSON.stringify(
    {
      ...session,
      exportMeta: {
        scoringMode: session.scoringMode || "compare",
        generatedAt: new Date().toISOString()
      },
      parsingAuditTrail: {
        inputMode: session.inputMode,
        rawInputText: session.rawInputText || "",
        extractedStructuredData: session.lastParseResult?.candidates || [],
        confidenceFlags: (session.lastParseResult?.candidates || []).map((candidate) => ({
          candidateId: candidate.candidateId,
          lowConfidenceFields: candidate.lowConfidenceFields,
          flags: candidate.flags
        })),
        manualCorrections: session.manualCorrectionsLog || [],
        finalValidatedRegimen: (session.lastValidatedRegimen || session.medications || []).filter((med) => med.validated)
      },
      scores: scored
    },
    null,
    2
  );
}

export function exportCsv(medications, scored = null, mode = "compare", session = {}) {
  const headers = [
    "drugName",
    "strength",
    "dosageForm",
    "route",
    "dosageFormRoute",
    "frequency",
    "prn",
    "additionalInstructions",
    "sourceEvidence",
    "extractionFlags",
    "manuallyCorrected",
    "validated",
    "mrciTotal",
    "aMrciTotal",
    "difference",
    "mappingWarnings"
  ];

  const cmp = Object.fromEntries((scored?.comparison || []).map((r) => [r.medicationId, r]));
  const warningsByMed = (scored?.amrci?.warnings || []).reduce((acc, w) => {
    acc[w.medicationId] = [...(acc[w.medicationId] || []), `${w.field}: ${w.message}`];
    return acc;
  }, {});

  const rows = medications.map((m) => {
    const c = cmp[m.id] || {};
    return headers
      .map((h) => {
        const value =
          h === "mrciTotal"
            ? c.mrci ?? ""
            : h === "aMrciTotal"
              ? c.aMrci ?? ""
              : h === "difference"
                ? c.difference ?? ""
                : h === "mappingWarnings"
                  ? (warningsByMed[m.id] || []).join(" | ")
                  : h === "dosageFormRoute"
                    ? m.dosageForm || m.dosageFormRoute || ""
                    : h === "validated"
                      ? m.validated
                        ? "true"
                        : "false"
                      : h === "prn"
                        ? m.prn
                          ? "true"
                          : "false"
                        : h === "manuallyCorrected"
                          ? m.manuallyCorrected
                            ? "true"
                            : "false"
                          : h === "extractionFlags"
                            ? (m.extractionFlags || []).join("|")
                            : h === "scoringMode"
                              ? mode
                              : m[h] ?? "";
        return `"${String(value).replaceAll('"', '""')}"`;
      })
      .join(",");
  });

  const summaryRows = scored
    ? [
        `"scoringMode","${mode}"`,
        `"inputMode","${session.inputMode || "manual"}"`,
        `"mrciTotal","${scored.classic?.total ?? ""}"`,
        `"aMrciTotal","${scored.amrci?.total ?? ""}"`,
        `"absoluteDifference","${scored.delta ?? ""}"`
      ]
    : [];

  return [headers.join(","), ...rows, ...summaryRows].join("\n");
}

export function importFromJson(text) {
  return JSON.parse(text);
}
