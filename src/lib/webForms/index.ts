import { CLIENT_INTAKE_WEB_FORM } from './clientIntake';
import { INITIAL_ASSESSMENT_WEB_FORM } from './initialAssessment';
import { LEVEL_OF_NEED_WEB_FORM } from './levelOfNeed';
import { HOUSING_STABILIZATION_PLAN_WEB_FORM } from './housingStabilizationPlan';
import type { WebFormSchema } from './types';

/** Forms that open as a web form, by form type. The rest open as the PDF. */
export const WEB_FORMS: Record<string, WebFormSchema> = {
  'Client Intake': CLIENT_INTAKE_WEB_FORM,
  'Initial Assessment (IAT)': INITIAL_ASSESSMENT_WEB_FORM,
  'Level of Need (LON)': LEVEL_OF_NEED_WEB_FORM,
  'Housing Stabilization Plan (HSP)': HOUSING_STABILIZATION_PLAN_WEB_FORM,
};
