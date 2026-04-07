import { mrciClassic } from "./engines/mrciClassic.js";
import { aMrci } from "./engines/aMrci.js";

export function scoreAll(medications, mappings) {
  const eligible = medications.filter((m) => m.validated);
  const classic = mrciClassic(eligible, mappings);
  const abbreviated = aMrci(eligible, mappings);
  return {
    eligibleCount: eligible.length,
    classic,
    abbreviated,
    delta: Number((classic.total - abbreviated.total).toFixed(2))
  };
}
