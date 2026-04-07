export const i18n = {
  en: {
    appTitle: "Medication Regimen Complexity Calculator",
    disclaimer:
      "Support tool only. Not a medical device and does not replace clinical judgment.",
    manual: "Manual Entry",
    aiAssist: "AI-Assisted Parse",
    validateNote: "All AI-parsed medications must be manually validated before scoring.",
    scoring: "Scoring",
    comparison: "Comparison",
    print: "Print",
    exportJson: "Export JSON",
    exportCsv: "Export CSV",
    importData: "Import"
  },
  es: {
    appTitle: "Calculadora de Complejidad del Régimen de Medicación",
    disclaimer:
      "Herramienta de apoyo. No es un dispositivo médico y no reemplaza el juicio clínico.",
    manual: "Entrada Manual",
    aiAssist: "Análisis Asistido por IA",
    validateNote: "Todo medicamento analizado por IA debe validarse manualmente antes del cálculo.",
    scoring: "Puntuación",
    comparison: "Comparación",
    print: "Imprimir",
    exportJson: "Exportar JSON",
    exportCsv: "Exportar CSV",
    importData: "Importar"
  }
};

export const t = (lang, key) => i18n[lang]?.[key] ?? i18n.en[key] ?? key;
