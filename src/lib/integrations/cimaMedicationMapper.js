export function buildMedicationFromCima(medicationDetail = {}, presentation = {}, notes = []) {
  const form = medicationDetail.formaFarmaceutica?.nombre || medicationDetail.formaFarmaceuticaSimplificada?.nombre || "";
  const route = medicationDetail.viasAdministracion?.map((v) => v.nombre).filter(Boolean).join(", ") || "";
  return {
    drugName: medicationDetail.nombre || presentation.name || "",
    dosageForm: form,
    route,
    cimaPresentation: presentation.name || "",
    cimaNationalCode: presentation.nationalCode || "",
    cimaRegistrationNumber: medicationDetail.nregistro || "",
    cimaActiveIngredients: medicationDetail.pactivos || "",
    cimaDose: medicationDetail.dosis || "",
    cimaSupplyIssue: Boolean(presentation.supplyIssue),
    cimaSafetyNotes: notes
  };
}

export function applyCimaSelectionToMedication(medication, cimaData) {
  return {
    ...medication,
    ...cimaData,
    dosageFormRoute: cimaData.dosageForm || medication.dosageFormRoute || "",
    source: "cima",
    sourceEvidence: `CIMA: ${cimaData.cimaRegistrationNumber || cimaData.cimaNationalCode || cimaData.drugName}`,
    manuallyCorrected: medication.manuallyCorrected || false
  };
}
