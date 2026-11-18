import { CLIENT_INTAKE_WEB_FORM } from './clientIntake';
import type { WebFormSchema } from './types';

/** Forms that open as a web form, by form type. The rest open as the PDF. */
export const WEB_FORMS: Record<string, WebFormSchema> = {
  'Client Intake': CLIENT_INTAKE_WEB_FORM,
};
