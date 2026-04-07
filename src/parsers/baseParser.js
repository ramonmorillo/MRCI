export class BaseMedicationParser {
  constructor(name) {
    this.name = name;
  }

  parse(_text) {
    throw new Error("Not implemented");
  }
}
