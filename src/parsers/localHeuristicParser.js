import { BaseMedicationParser } from "./baseParser.js";

export class LocalHeuristicParser extends BaseMedicationParser {
  constructor() {
    super("local-heuristic-v1");
  }

  parse(text) {
    const lines = text
      .split(/\n|;/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line) => {
      const lower = line.toLowerCase();
      const prn = lower.includes("prn") || lower.includes("as needed");
      const frequency =
        ["daily", "bid", "tid", "qid", "q6h", "q4h", "weekly", "monthly"].find(
          (f) => lower.includes(f)
        ) ?? "";
      const dosageFormRoute =
        ["tablet", "capsule", "liquid", "inhaler", "injection", "patch", "drop"].find(
          (f) => lower.includes(f)
        ) ?? "";

      const drugName = line.split(" ").slice(0, 2).join(" ");

      return {
        id: crypto.randomUUID(),
        drugName,
        dosageFormRoute,
        frequency,
        prn,
        additionalInstructions: line,
        notes: "Parsed locally. Requires human validation.",
        source: this.name,
        validated: false
      };
    });
  }
}
