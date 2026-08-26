import { translateToFhir as hl7ToFhir } from "@interop-gateway/format-hl7v2";
import { translateToFhir as cdaToFhirFn } from "@interop-gateway/format-cda";
import type { Direction, Format } from "./types.js";

export interface Sample {
  readonly label: string;
  readonly format: Format;
  readonly direction: Direction;
  readonly content: string;
}

// SYNTHETIC DATA ONLY — NOT REAL PHI
const SAMPLE_ADT_A01 = [
  "MSH|^~\\&|HIS|HOSP|ADT|HOSP|20240101120000||ADT^A01|MSG001|P|2.5",
  "EVN|A01|20240101120000||01|7802^Rivera^Carlos^^RN|20240101115500|HOSP",
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^A||19800515|M|||123 Main St^^Springfield^IL^62701^USA||5559876543^PRN^PH",
  "PV1|1|I|ICU^101^A^^^HOSP||||1234^Smith^Jane^M^MD|5678^Johnson^Mary^R^MD",
].join("\r");

// SYNTHETIC DATA ONLY — NOT REAL PHI
const SAMPLE_CDA_CCD = `<?xml version="1.0" encoding="UTF-8"?>
<!-- SYNTHETIC DATA ONLY — NOT REAL PHI -->
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of episode note"/>
  <effectiveTime value="20240110090000-0500"/>
  <confidentialityCode code="N"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.19.5" extension="MRN-99000123"/>
      <patient>
        <name><given>Jamie</given><family>Synthfield</family></name>
        <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
        <birthTime value="19850604"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1" displayName="Allergies"/>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20200301"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="7980" codeSystem="2.16.840.1.113883.6.88" displayName="Penicillin"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
      <component>
        <section>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problems"/>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
                  <effectiveTime><low value="20220115"/></effectiveTime>
                  <value xsi:type="CD" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" code="44054006" codeSystem="2.16.840.1.113883.6.96" displayName="Type 2 diabetes mellitus"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
      <component>
        <section>
          <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="Medications"/>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16"/>
              <statusCode code="active"/>
              <doseQuantity value="10" unit="mg"/>
              <consumable>
                <manufacturedProduct>
                  <manufacturedMaterial>
                    <code code="197361" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>
`;

// Generated from the constants above at module load, rather than hand-duplicated, so
// they can never drift out of sync with what the format packages actually produce.
const hl7Bundle = hl7ToFhir(SAMPLE_ADT_A01).translated;
const cdaBundle = JSON.stringify(cdaToFhirFn(SAMPLE_CDA_CCD).bundle, null, 2);

export const SAMPLES: Sample[] = [
  {
    label: "ADT^A01 admit message",
    format: "hl7v2",
    direction: "toFhir",
    content: SAMPLE_ADT_A01,
  },
  {
    label: "FHIR Bundle (roundtrip of the ADT^A01 above)",
    format: "hl7v2",
    direction: "fromFhir",
    content: hl7Bundle,
  },
  {
    label: "Synthetic CCD (Allergies, Problems, Medications)",
    format: "cda",
    direction: "toFhir",
    content: SAMPLE_CDA_CCD,
  },
  {
    label: "FHIR Bundle (roundtrip of the CCD above)",
    format: "cda",
    direction: "fromFhir",
    content: cdaBundle,
  },
];
