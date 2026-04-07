export function appendMedication(list = [], medication) {
  return [...list, { ...medication }];
}

export function removeMedicationAt(list = [], index = -1) {
  return list.filter((_, idx) => idx !== index);
}

export function duplicateMedicationAt(list = [], index = -1, createId = () => crypto.randomUUID()) {
  if (index < 0 || index >= list.length) return [...list];
  const clone = { ...list[index], id: createId(), validated: false };
  return [...list.slice(0, index + 1), clone, ...list.slice(index + 1)];
}
