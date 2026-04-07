# MRCI Local-First Web App

Static browser app for regimen complexity scoring with:
- **mrciClassic**: transparent implementation aligned to the original multi-section MRCI concept (George et al., 2004).
- **aMrci**: configurable implementation inspired by 2024 automation-oriented abbreviated logic; **requires local validation before clinical/research use**.

## Features
- No backend, static files only (GitHub Pages friendly)
- Local session storage
- Manual medication entry
- AI-assisted local heuristic text parsing (always requires human validation)
- Section A/B/C subtotals, total scores, per-medication breakdown, and explanation keys
- Engine comparison with delta
- Configurable mapping JSON files in `/config`
- Import/export JSON and CSV
- Printable, PDF-friendly report layout
- Bilingual UI (English/Spanish)
- Demo regimens in `/samples`
- Unit tests covering PRN, alternating dose, food instructions, inhalers, injectables, frequency intensity, ambiguity fallback

## Run
Serve with any static server, e.g.:

```bash
python -m http.server 5173
```

Open `http://localhost:5173`.

## Test
```bash
npm test
```

## GitHub Pages
This repository is static; deploy root as Pages source (or publish `/` folder content).
