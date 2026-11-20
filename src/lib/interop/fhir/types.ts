// Minimal FHIR R4 resource shapes used by the mapping layer (subset; not a complete FHIR model).
export interface Coding { system?: string | undefined; code?: string | undefined; display?: string | undefined }
export interface CodeableConcept { coding?: Coding[] | undefined; text?: string | undefined }
export interface Reference { reference?: string | undefined; display?: string | undefined }
export interface Extension { url: string; valueString?: string | undefined; valueDecimal?: number | undefined }
export interface Quantity { value: number; unit?: string | undefined }

interface Base<T extends string> { resourceType: T; id?: string | undefined; extension?: Extension[] | undefined }

export interface FhirPatient extends Base<"Patient"> {
  identifier?: { system?: string; value: string; type?: CodeableConcept }[] | undefined;
  name?: { text: string }[] | undefined;
  gender?: "male" | "female" | "unknown" | undefined;
  birthDate?: string | undefined;
  telecom?: { system: "phone" | "email"; value: string }[] | undefined;
  communication?: { language: CodeableConcept }[] | undefined;
}
export interface FhirCondition extends Base<"Condition"> {
  subject: Reference; code: CodeableConcept; recordedDate?: string | undefined;
  verificationStatus: CodeableConcept; category?: CodeableConcept[] | undefined;
}
export interface FhirMedicationStatement extends Base<"MedicationStatement"> {
  subject: Reference; status: "active" | "unknown" | "entered-in-error"; medicationCodeableConcept: CodeableConcept;
}
export interface FhirObservation extends Base<"Observation"> {
  status: "preliminary" | "final" | "amended" | "entered-in-error" | "unknown";
  category?: CodeableConcept[] | undefined; code: CodeableConcept; subject: Reference;
  effectiveDateTime?: string | undefined; valueQuantity?: Quantity | undefined; valueString?: string | undefined;
  dataAbsentReason?: CodeableConcept | undefined;
}
export interface FhirProcedure extends Base<"Procedure"> {
  status: "completed" | "unknown" | "entered-in-error"; subject: Reference; code: CodeableConcept; performedDateTime?: string | undefined;
}
export interface FhirDocumentReference extends Base<"DocumentReference"> {
  status: "current"; subject: Reference; type?: CodeableConcept | undefined; date?: string | undefined;
  author?: Reference[] | undefined; description?: string | undefined;
  content: { attachment: { contentType: string; title?: string; data?: string } }[];
}
export interface FhirPractitioner extends Base<"Practitioner"> {
  name: { text: string }[]; identifier?: { system?: string; value: string }[] | undefined;
}
export interface FhirEncounter extends Base<"Encounter"> {
  status: "finished" | "in-progress" | "planned" | "unknown"; class: Coding; subject: Reference;
  period?: { start?: string } | undefined; participant?: { individual: Reference }[] | undefined;
}
export interface FhirAllergyIntolerance extends Base<"AllergyIntolerance"> { patient: Reference; code?: CodeableConcept | undefined }

export type FhirResource =
  | FhirPatient | FhirCondition | FhirMedicationStatement | FhirObservation | FhirProcedure
  | FhirDocumentReference | FhirPractitioner | FhirEncounter | FhirAllergyIntolerance;
export type FhirResourceType = FhirResource["resourceType"];

export interface FhirBundle { resourceType: "Bundle"; type: "collection"; entry: { resource: FhirResource }[] }
