import { mrciClassic } from "./lib/scoring/mrciClassic.js";
import { aMrci } from "./lib/scoring/aMrci.js";

export const scoringEngines = [
  { id: "classic", label: "MRCI", run: (meds, mappings) => mrciClassic(meds, mappings.mrciClassic) },
  { id: "amrci", label: "A-MRCI", run: (meds, mappings, corrections) => aMrci(meds, mappings, corrections) }
];

export function scoreAll(medications, mappings, mode = "compare", corrections = {}) {
  const eligible = medications.filter((m) => m.validated);
  const byEngine = {};
  if (mode === "classic" || mode === "compare") {
    byEngine.classic = scoringEngines[0].run(eligible, mappings);
  }
  if (mode === "amrci" || mode === "compare") {
    byEngine.amrci = scoringEngines[1].run(eligible, mappings, corrections);
  }

  const classicTotal = byEngine.classic?.total ?? 0;
  const amrciTotal = byEngine.amrci?.total ?? 0;
  const delta = Number(Math.abs(classicTotal - amrciTotal).toFixed(2));

  return {
    mode,
    eligibleCount: eligible.length,
    byEngine,
    classic: byEngine.classic,
    amrci: byEngine.amrci,
    delta,
    comparison: buildComparison(byEngine.classic, byEngine.amrci)
  };
}

function buildComparison(classic, amrci) {
  if (!classic || !amrci) return null;
  const byMed = classic.breakdown.map((c) => {
    const a = amrci.breakdown.find((row) => row.medicationId === c.medicationId);
    return {
      medicationId: c.medicationId,
      drugName: c.drugName,
      mrci: c.total,
      aMrci: a?.total ?? 0,
      difference: Number(Math.abs(c.total - (a?.total ?? 0)).toFixed(2)),
      sectionDiff: {
        A: Number(Math.abs(c.sectionA - (a?.sectionA ?? 0)).toFixed(2)),
        B: Number(Math.abs(c.sectionB - (a?.sectionB ?? 0)).toFixed(2)),
        C: Number(Math.abs(c.sectionC - (a?.sectionC ?? 0)).toFixed(2))
      },
      mrciRule: c.explanation,
      aMrciRule: a?.explanation
    };
  });
  return byMed;
}
