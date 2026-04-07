export const MEDICATION_SPLIT_PATTERN = /\n+|[;•]+/g;

export const MULTI_MED_SEPARATOR = /\s(?:,| and | y |\+)\s/gi;

export const STRENGTH_PATTERN = /\b(\d+(?:[.,]\d+)?)\s?(mg|mcg|g|ml|units?|iu|%)\b/i;

export const ROUTE_KEYWORDS = {
  oral: ["oral", "po", "by mouth", "boca"],
  inhaled: ["inh", "inhal", "puff", "neb", "inhaled"],
  subcutaneous: ["subcut", "sc", "sq"],
  intravenous: ["iv", "intravenous"],
  topical: ["topical", "skin", "apply", "aplicar"],
  ophthalmic: ["ophthalmic", "eye", "ojo"],
  otic: ["otic", "ear", "oido", "ears"]
};

export const DOSAGE_FORM_KEYWORDS = {
  tablet: ["tablet", "tab", "tabs", "comprimido"],
  capsule: ["capsule", "cap", "caps", "capsula"],
  liquid: ["solution", "syrup", "liquid", "suspension", "jarabe"],
  inhaler: ["inhaler", "puff", "mdi", "dpi", "nebulizer"],
  injection: ["inject", "injection", "pen", "vial", "ampule"],
  patch: ["patch", "transdermal", "parche"],
  drop: ["drop", "drops", "gtt", "gota", "gotas"]
};

export const FREQUENCY_PATTERNS = [
  { key: "daily", regex: /\b(daily|every day|qd|od|once daily|cada dia|diario)\b/i },
  { key: "bid", regex: /\b(bid|twice daily|2x daily|cada 12h|q12h)\b/i },
  { key: "tid", regex: /\b(tid|three times daily|3x daily|cada 8h|q8h)\b/i },
  { key: "qid", regex: /\b(qid|four times daily|4x daily|cada 6h|q6h)\b/i },
  { key: "weekly", regex: /\b(weekly|once weekly|semanal|cada semana)\b/i },
  { key: "monthly", regex: /\b(monthly|once monthly|mensual|cada mes)\b/i },
  { key: "at night", regex: /\b(at night|nightly|hs|bedtime|por la noche)\b/i },
  { key: "before meals", regex: /\b(before meals|ac|antes de comidas?)\b/i },
  { key: "with meals", regex: /\b(with meals?|with food|con comida|con alimentos?)\b/i },
  { key: "as directed", regex: /\b(as directed|segun indicaciones?)\b/i }
];

export const PRN_PATTERN = /\b(prn|as needed|si necesario|segun necesidad)\b/i;

export const ADDITIONAL_DIRECTION_PATTERNS = [
  /\b(with food|con comida|with meals?)\b/i,
  /\b(before meals|antes de comidas?)\b/i,
  /\b(at night|por la noche|bedtime|hs)\b/i,
  /\b(as directed|segun indicaciones?)\b/i,
  /\b(alternate(?:\s+\w+)? doses?|alternate days?)\b/i,
  /\btaper|decrease by|reduce by|\d+-\d+-\d+\b/i
];

export const TAPER_PATTERN = /\b(taper|decrease|reduce|for \d+ days? then|x\s*\d+\s*days?)\b/i;
export const ALTERNATING_DOSE_PATTERN = /\balternate|every other\b/i;
export const AMBIGUOUS_FREQUENCY_PATTERN = /\b(as directed|when needed|occasionally|sometimes)\b/i;
