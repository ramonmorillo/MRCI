import { mrciClassic } from "./engines/mrciClassic.js";
import { aMrci } from "./engines/aMrci.js";

export const scoringEngines = [
  { id: "classic", label: "MRCI Classic", run: mrciClassic },
  { id: "abbreviated", label: "A-MRCI", run: aMrci }
];

export function scoreAll(medications, mappings, engines = scoringEngines) {
  const eligible = medications.filter((m) => m.validated);
  const byEngine = Object.fromEntries(
    engines.map((engine) => [engine.id, engine.run(eligible, mappings)])
  );

  return {
    eligibleCount: eligible.length,
    byEngine,
    classic: byEngine.classic,
    abbreviated: byEngine.abbreviated,
    delta: Number(((byEngine.classic?.total ?? 0) - (byEngine.abbreviated?.total ?? 0)).toFixed(2))
  };
}
