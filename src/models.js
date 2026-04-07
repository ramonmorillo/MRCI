export const defaultMedication = () => ({
  id: crypto.randomUUID(),
  drugName: "",
  dosageFormRoute: "",
  frequency: "",
  prn: false,
  additionalInstructions: "",
  notes: "",
  source: "manual",
  validated: false
});

export const defaultSession = () => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  language: "en",
  patientLabel: "",
  regimenLabel: "",
  medications: []
});
