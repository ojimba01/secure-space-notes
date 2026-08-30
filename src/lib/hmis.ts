/**
 * The HMIS intake screen, field by field, in the order the real form asks.
 *
 * Same idea as the Availity screens: the order and the labels match what is on
 * the other site, so somebody filling it in reads down one column and types
 * across. What the app knows is carried here; what it cannot know is left for
 * a person, marked as such.
 *
 * Generated from the agency's fillable HMIS PDF - 157 fields, of which these
 * 95 take typed answers. The checkbox groups (gender, race and ethnicity,
 * income sources, benefits) are answered in HMIS itself and are not listed:
 * the app holds none of them, and a list of 62 empty boxes helps nobody.
 */

/** Where a value comes from, which decides how the box is shown. */
export type HmisSource =
  | 'intakeDate'
  | 'caseManager'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'dob'
  | 'street'
  | 'county'
  | 'email'
  | 'phone'
  | 'medicaid';

export interface HmisField {
  /** Page of the HMIS form, so the screen can be walked alongside it. */
  page: number;
  /** The PDF's own field name, kept so the mapping can be checked. */
  name: string;
  label: string;
  /** Set when the client record can answer it. */
  from?: HmisSource;
}

export const HMIS_FIELDS: HmisField[] = [
  { page: 1, name: "Intake_Date_Project_Start_Date_", label: "Intake Date Project Start Date", from: "intakeDate" },
  { page: 1, name: "Enrollment_CoC", label: "Enrollment CoC" },
  { page: 1, name: "Primary_Worker", label: "Primary Worker", from: "caseManager" },
  { page: 1, name: "First_Name", label: "First Name", from: "firstName" },
  { page: 1, name: "Middle_Name", label: "Middle Name", from: "middleName" },
  { page: 1, name: "Last_Name", label: "Last Name", from: "lastName" },
  { page: 1, name: "Suffix", label: "Suffix" },
  { page: 1, name: "Name_Data_Quality", label: "Name Data Quality" },
  { page: 1, name: "Alias", label: "Alias" },
  { page: 1, name: "Social_Security__", label: "Social Security" },
  { page: 1, name: "SSN_Data_Quality", label: "SSN Data Quality" },
  { page: 1, name: "Sex__HMIS__", label: "Sex HMIS" },
  { page: 1, name: "Birthdate", label: "Birthdate", from: "dob" },
  { page: 1, name: "Birthdate_Data_Quality_", label: "Birthdate Data Quality" },
  { page: 1, name: "Additional_Race_and_Ethnicity_Detail_", label: "Additional Race and Ethnicity Detail" },
  { page: 1, name: "Street_Address", label: "Street Address", from: "street" },
  { page: 1, name: "City__State_Zip", label: "City State Zip" },
  { page: 1, name: "Residence_County_", label: "Residence County", from: "county" },
  { page: 1, name: "Email_Address", label: "Email Address", from: "email" },
  { page: 1, name: "Phone", label: "Phone" },
  { page: 1, name: "Home_Phone", label: "Home Phone" },
  { page: 1, name: "Cell_Phone", label: "Cell Phone", from: "phone" },
  { page: 1, name: "Veteran_Status", label: "Veteran Status" },
  { page: 2, name: "Type_of_Residence_", label: "Type of Residence" },
  { page: 2, name: "Rental_Subsidy_Type_", label: "Rental Subsidy Type" },
  { page: 2, name: "Length_of_Stay_in_Prior_Living_Situation_", label: "Length of Stay in Prior Living Situation" },
  { page: 2, name: "Did_you_stay_less_than_7_nights__", label: "Did you stay less than 7 nights" },
  { page: 2, name: "Has_the_client_been_placed_into_Permanent_Housing__", label: "Has the client been placed into Permanent Housing" },
  { page: 2, name: "Income_from_Any_Source_", label: "Income from Any Source" },
  { page: 2, name: "Monthly_Income_Sources__amt_Earned_Income__i_e__employment_i", label: "Monthly Income Sources amt Earned Income i e employment i" },
  { page: 2, name: "Monthly_Income_Sources__amt_Unemployment_Insurance_", label: "Monthly Income Sources amt Unemployment Insurance" },
  { page: 2, name: "Monthly_Income_Sources__amt_Supplemental_Security_Income__SS", label: "Monthly Income Sources amt Supplemental Security Income SS" },
  { page: 2, name: "Monthly_Income_Sources__amt_Social_Security_Disability_Insur", label: "Monthly Income Sources amt Social Security Disability Insur" },
  { page: 2, name: "Monthly_Income_Sources__amt_VA_Service_Connected_Disability_", label: "Monthly Income Sources amt VA Service Connected Disability" },
  { page: 2, name: "Monthly_Income_Sources__amt_VA_Non_Service_Connected_Disabil", label: "Monthly Income Sources amt VA Non Service Connected Disabil" },
  { page: 2, name: "Monthly_Income_Sources__amt_Private_disability_insurance_", label: "Monthly Income Sources amt Private disability insurance" },
  { page: 2, name: "Monthly_Income_Sources__amt_Worker_s_compensation_", label: "Monthly Income Sources amt Worker s compensation" },
  { page: 2, name: "Monthly_Income_Sources__amt_Temporary_Assistance_for_Needy_F", label: "Monthly Income Sources amt Temporary Assistance for Needy F" },
  { page: 2, name: "Monthly_Income_Sources__amt_General_Public_Assistance_", label: "Monthly Income Sources amt General Public Assistance" },
  { page: 2, name: "Monthly_Income_Sources__amt_Retirement_Income_from_Social_Se", label: "Monthly Income Sources amt Retirement Income from Social Se" },
  { page: 2, name: "Monthly_Income_Sources__amt_Pension_or_retirement_income_fro", label: "Monthly Income Sources amt Pension or retirement income fro" },
  { page: 2, name: "Monthly_Income_Sources__amt_Child_support_", label: "Monthly Income Sources amt Child support" },
  { page: 2, name: "Monthly_Income_Sources__amt_Alimony_or_other_spousal_support", label: "Monthly Income Sources amt Alimony or other spousal support" },
  { page: 2, name: "Monthly_Income_Sources__amt_Other_", label: "Monthly Income Sources amt Other" },
  { page: 2, name: "Non_Cash_Benefits_from_Any_Source_", label: "Non Cash Benefits from Any Source" },
  { page: 2, name: "Covered_by_Health_Insurance_", label: "Covered by Health Insurance" },
  { page: 2, name: "MEDICAID_", label: "MEDICAID", from: "medicaid" },
  { page: 2, name: "MEDICARE_", label: "MEDICARE" },
  { page: 2, name: "State_Children_s_Health_Insurance_Program_", label: "State Children s Health Insurance Program" },
  { page: 2, name: "Veteran_s_Health_Administration__VHA__", label: "Veteran s Health Administration VHA" },
  { page: 3, name: "Employer_Provided_Health_Insurance_", label: "Employer Provided Health Insurance" },
  { page: 3, name: "Health_Insurance_obtained_through_COBRA_", label: "Health Insurance obtained through COBRA" },
  { page: 3, name: "Private_Pay_Health_Insurance_", label: "Private Pay Health Insurance" },
  { page: 3, name: "State_Health_Insurance_for_Adults_", label: "State Health Insurance for Adults" },
  { page: 3, name: "Indian_Health_Services_", label: "Indian Health Services" },
  { page: 3, name: "Other_", label: "Other" },
  { page: 3, name: "Physical_Disability_", label: "Physical Disability" },
  { page: 3, name: "Expected_to_be_of_long_continued_and_indefinite_duration_and", label: "Expected to be of long continued and indefinite duration and" },
  { page: 3, name: "Developmental_Disability_", label: "Developmental Disability" },
  { page: 3, name: "Chronic_Health_Condition_", label: "Chronic Health Condition" },
  { page: 3, name: "Expected_to_be_of_long_continued_and_indefinite_duration_and_2", label: "Expected to be of long continued and indefinite duration and 2" },
  { page: 3, name: "HIV_AIDS_", label: "HIV AIDS" },
  { page: 3, name: "Mental_Health_Disorder_", label: "Mental Health Disorder" },
  { page: 3, name: "_If_client_has_a_mental_health_disorder__Expected_to_be_of_l", label: "If client has a mental health disorder Expected to be of l" },
  { page: 3, name: "Substance_Use_Disorder_", label: "Substance Use Disorder" },
  { page: 3, name: "_If_client_has_a_substance_use_disorder__Expected_to_be_of_l", label: "If client has a substance use disorder Expected to be of l" },
  { page: 3, name: "Information_Date_", label: "Information Date" },
  { page: 3, name: "Survivor_of_Domestic_Violence_", label: "Survivor of Domestic Violence" },
  { page: 3, name: "Last_Grade_Completed", label: "Last Grade Completed" },
  { page: 3, name: "Currently_Pregnant", label: "Currently Pregnant" },
  { page: 3, name: "Due_Date", label: "Due Date" },
  { page: 3, name: "Individual_Family_Type", label: "Individual Family Type" },
  { page: 3, name: "Household_Size", label: "Household Size" },
  { page: 4, name: "Homeless_Cause", label: "Homeless Cause" },
  { page: 4, name: "Zip_Code_of_Last_Permanent_Address", label: "Zip Code of Last Permanent Address" },
  { page: 4, name: "Zip_Code_Data_Quality", label: "Zip Code Data Quality" },
  { page: 4, name: "Date_Left_Last_Permanent_Address", label: "Date Left Last Permanent Address" },
  { page: 4, name: "City_Town_of_Last_Permanent_Address", label: "City Town of Last Permanent Address" },
  { page: 4, name: "County_of_Last_Permanent_Address", label: "County of Last Permanent Address" },
  { page: 4, name: "Birth_Place", label: "Birth Place" },
  { page: 4, name: "Citizen", label: "Citizen" },
  { page: 4, name: "Alien_Registration", label: "Alien Registration" },
  { page: 4, name: "Primary_Language", label: "Primary Language" },
  { page: 4, name: "Duration_of_Active_Duty__months_", label: "Duration of Active Duty months" },
  { page: 4, name: "Served_in_a_war_zone", label: "Served in a war zone" },
  { page: 4, name: "Name_of_war_zone", label: "Name of war zone" },
  { page: 4, name: "Number_of_months_in_war_zone", label: "Number of months in war zone" },
  { page: 4, name: "Received_hostile_or_friendly_fire", label: "Received hostile or friendly fire" },
  { page: 4, name: "Current_Student", label: "Current Student" },
  { page: 4, name: "Received_vocational_training_or_apprenticeship_certificate", label: "Received vocational training or apprenticeship certificate" },
  { page: 4, name: "Marital_Status", label: "Marital Status" },
  { page: 4, name: "HA__", label: "HA" },
  { page: 4, name: "Managed_Care_Organization__MCO_", label: "Managed Care Organization MCO" },
  { page: 4, name: "Medicaid_ID", label: "Medicaid ID" },
  { page: 4, name: "MCO_Enrollment_ID", label: "MCO Enrollment ID" },];

export interface HmisClient {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  address: string | null;
  county: string | null;
  email: string | null;
  phone: string | null;
  intake_date: string | null;
  medicaid_id: string | null;
}

const usDate = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
};

/** What the app can put in each box. Empty means a person answers it. */
export function hmisValue(
  field: HmisField,
  client: HmisClient,
  caseManager: string | null,
): string {
  switch (field.from) {
    case 'intakeDate':
      return usDate(client.intake_date);
    case 'caseManager':
      return caseManager ?? '';
    case 'firstName':
      return client.first_name ?? '';
    case 'middleName':
      return '';
    case 'lastName':
      return client.last_name ?? '';
    case 'dob':
      return usDate(client.date_of_birth);
    case 'street':
      return client.address ?? '';
    case 'county':
      return client.county ?? '';
    case 'email':
      return client.email ?? '';
    case 'phone':
      return client.phone ?? '';
    // HMIS asks whether Medicaid covers them, not for the number. Holding a
    // Medicaid ID is the answer to that question.
    case 'medicaid':
      return client.medicaid_id ? 'Yes' : '';
    default:
      return '';
  }
}
