import { CLIENT_INTAKE_WEB_FORM } from './clientIntake';
import { INITIAL_ASSESSMENT_WEB_FORM } from './initialAssessment';
import { LEVEL_OF_NEED_WEB_FORM } from './levelOfNeed';
import { HOUSING_STABILIZATION_PLAN_WEB_FORM } from './housingStabilizationPlan';
import { AETNA_PRIOR_AUTHORIZATION_WEB_FORM } from './aetnaPriorAuthorization';
import { WELLPOINT_SUPPORT_SERVICES_WEB_FORM } from './wellpointSupportServices';
import { schemaFields, type WebFormSchema } from './types';

/**
 * Forms that open as a web form, by form type. The rest open as the PDF.
 * A type several MCOs' forms share lists a web form for each; the one whose
 * boxes are on the PDF opened is used (webFormFor).
 */
export const WEB_FORMS: Record<string, WebFormSchema[]> = {
  'Client Intake': [CLIENT_INTAKE_WEB_FORM],
  'Initial Assessment (IAT)': [INITIAL_ASSESSMENT_WEB_FORM],
  'Level of Need (LON)': [LEVEL_OF_NEED_WEB_FORM],
  'Housing Stabilization Plan (HSP)': [HOUSING_STABILIZATION_PLAN_WEB_FORM],
  'Prior Authorization Request': [AETNA_PRIOR_AUTHORIZATION_WEB_FORM, WELLPOINT_SUPPORT_SERVICES_WEB_FORM],
};

/**
 * The web form for a PDF, from the names of the boxes on it: the listed web
 * form with nearly all of its boxes there, or null (another MCO's form, or a
 * scanned copy), which opens as the PDF.
 */
export function webFormFor(formType: string, boxNames: Iterable<string>): WebFormSchema | null {
  const names = new Set(boxNames);
  let best: WebFormSchema | null = null;
  let bestShare = 0;
  for (const schema of WEB_FORMS[formType] ?? []) {
    const fields = schemaFields(schema);
    const share = fields.filter((f) => names.has(f)).length / Math.max(fields.length, 1);
    if (share > bestShare) {
      best = schema;
      bestShare = share;
    }
  }
  return bestShare >= 0.8 ? best : null;
}
