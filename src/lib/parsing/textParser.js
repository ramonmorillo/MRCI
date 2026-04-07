import {
  ADDITIONAL_DIRECTION_PATTERNS,
  ALTERNATING_DOSE_PATTERN,
  AMBIGUOUS_FREQUENCY_PATTERN,
  FREQUENCY_PATTERNS,
  MEDICATION_SPLIT_PATTERN,
  MULTI_MED_SEPARATOR,
  PRN_PATTERN,
  STRENGTH_PATTERN,
  TAPER_PATTERN
} from "./patterns.js";
import { cleanDrugName, normalizeDosageForm, normalizeRoute } from "./normalizers.js";
import { confidenceFromEvidence, makeField } from "./confidence.js";

function splitMedicationUnits(text = "") {
  return text
    .split(MEDICATION_SPLIT_PATTERN)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return [];
      return trimmed.split(MULTI_MED_SEPARATOR).map((piece) => piece.trim()).filter(Boolean);
    });
}

function detectFrequency(text) {
  const match = FREQUENCY_PATTERNS.find(({ regex }) => regex.test(text));
  return match ? { value: match.key, evidence: text.match(match.regex)?.[0] || "" } : { value: "", evidence: "" };
}

function detectAdditionalDirections(text) {
  const found = ADDITIONAL_DIRECTION_PATTERNS
    .map((pattern) => text.match(pattern)?.[0])
    .filter(Boolean);
  return [...new Set(found)].join("; ");
}

function extractDrugName(text) {
  const withoutLeadingDose = text.replace(/^\d+\s?(tab|tablet|caps?|puffs?|ml)\s+/i, "");
  const base = withoutLeadingDose
    .replace(STRENGTH_PATTERN, "")
    .replace(/\b(tab(?:let)?s?|caps?(?:ule)?s?|solution|syrup|inject(?:ion)?|inhaler|patch|drops?)\b/gi, "")
    .replace(/\b(oral|po|iv|sc|subcut|topical|ophthalmic|otic|daily|bid|tid|qid|q\d+h|prn)\b/gi, "")
    .trim();
  return cleanDrugName(base.split(/\s+/).slice(0, 4).join(" "));
}

function buildCandidate(segment, rawIndex) {
  const strengthMatch = segment.match(STRENGTH_PATTERN);
  const strength = strengthMatch ? `${strengthMatch[1]} ${strengthMatch[2]}` : "";
  const frequency = detectFrequency(segment);
  const dosageForm = normalizeDosageForm(segment);
  const route = normalizeRoute(segment);
  const prn = PRN_PATTERN.test(segment);
  const additionalDirections = detectAdditionalDirections(segment);
  const drugName = extractDrugName(segment);

  const flags = [];
  if (TAPER_PATTERN.test(segment)) flags.push("tapering-regimen");
  if (ALTERNATING_DOSE_PATTERN.test(segment)) flags.push("alternating-dose");
  if (AMBIGUOUS_FREQUENCY_PATTERN.test(segment) || !frequency.value) flags.push("ambiguous-frequency");
  if (!dosageForm) flags.push("unknown-dosage-form");
  if (!drugName) flags.push("missing-drug-name");

  const fieldFlags = (fieldName) => flags.filter((flag) =>
    (fieldName === "frequency" && flag.includes("frequency")) ||
    (fieldName === "dosageForm" && flag.includes("dosage-form")) ||
    (fieldName === "drugName" && flag.includes("drug-name"))
  );

  const fields = {
    drugName: makeField(drugName, confidenceFromEvidence(drugName, drugName, drugName.split(" ").length > 0), drugName || segment, fieldFlags("drugName")),
    strength: makeField(strength, confidenceFromEvidence(strength, strengthMatch?.[0], true), strengthMatch?.[0] || "", []),
    dosageForm: makeField(dosageForm, confidenceFromEvidence(dosageForm, dosageForm, Boolean(dosageForm)), dosageForm || segment, fieldFlags("dosageForm")),
    route: makeField(route, confidenceFromEvidence(route, route, Boolean(route)), route || "", []),
    frequency: makeField(frequency.value, confidenceFromEvidence(frequency.value, frequency.evidence, Boolean(frequency.evidence)), frequency.evidence || segment, fieldFlags("frequency")),
    prn: makeField(prn ? "yes" : "no", prn ? "high" : "medium", prn ? segment.match(PRN_PATTERN)?.[0] || "" : "not explicitly stated", prn ? [] : ["assumed-not-prn"]),
    additionalDirections: makeField(additionalDirections, additionalDirections ? "medium" : "low", additionalDirections || "", additionalDirections ? [] : ["needs-manual-review"]),
    notes: makeField("", "low", segment, ["needs-manual-review"]),
    evidence: makeField(segment, "high", segment, [])
  };

  const lowConfidenceFields = Object.entries(fields)
    .filter(([, value]) => value.confidence === "low" || value.needsManualReview)
    .map(([key]) => key);

  return {
    candidateId: `cand-${rawIndex}-${crypto.randomUUID()}`,
    sourceText: segment,
    fields,
    flags,
    lowConfidenceFields,
    needsManualReview: lowConfidenceFields.length > 0
  };
}

export function parseMedicationText(rawText = "") {
  const segments = splitMedicationUnits(rawText);
  const candidates = segments.map((segment, idx) => buildCandidate(segment, idx));
  const duplicateKeys = new Set();
  const seen = new Map();

  candidates.forEach((candidate) => {
    const key = `${candidate.fields.drugName.value.toLowerCase()}|${candidate.fields.strength.value.toLowerCase()}|${candidate.fields.frequency.value.toLowerCase()}`;
    if (!candidate.fields.drugName.value) return;
    if (seen.has(key)) {
      duplicateKeys.add(key);
      candidate.flags.push("possible-duplicate");
      candidate.needsManualReview = true;
    } else {
      seen.set(key, candidate.candidateId);
    }
  });

  return {
    parserVersion: "rule-based-local-v1",
    rawText,
    candidates,
    summary: {
      totalCandidates: candidates.length,
      manualReviewRequired: candidates.some((c) => c.needsManualReview),
      duplicatesDetected: duplicateKeys.size
    }
  };
}
