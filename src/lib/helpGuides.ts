// The Help guide: step-by-step instructions for each task in the app.
//
// Each step's screenshot is public/help/<guide id>-<step number>.jpg, taken
// from the real app over made-up data by scripts/help-screenshots (run it
// again whenever a screen changes). Keep the ids and step counts here in step
// with the shots listed there.

export type Audience = 'everyone' | 'admins';

export interface GuideStep {
  title: string;
  text: string;
}

export interface Guide {
  id: string;
  section: string;
  title: string;
  audience: Audience;
  minutes: number;
  steps: GuideStep[];
}

export const SECTIONS = [
  'Getting started',
  'Clients',
  'Forms and documents',
  'Touchpoints',
  'Calendar',
  'Managing the team',
  'Billing',
] as const;

const s = (title: string, text: string): GuideStep => ({ title, text });

export const GUIDES: Guide[] = [
  // ---- Getting started
  {
    id: 'sign-in', section: 'Getting started', title: 'Sign in', audience: 'everyone', minutes: 1,
    steps: [
      s('Enter your details', 'Enter your work email and password, then select Sign in.'),
      s('Forgot your password?', 'Select Forgot password? on the sign-in page.'),
      s('Reset it', 'Enter your email and select Send reset instructions. Open the link in the email to choose a new password.'),
    ],
  },
  {
    id: 'find-your-way', section: 'Getting started', title: 'Find your way around', audience: 'everyone', minutes: 1,
    steps: [
      s('Use the left panel', 'Clients, Forms, My touchpoints and Calendar hold your day-to-day work. Help guide is always here.'),
      s('Open your account', 'Select the person icon at the top of the panel to change your password, add a signature or link your calendar.'),
      s('Take a tour', 'Select Start walkthrough for a short tour of the screen you are on.'),
    ],
  },
  {
    id: 'account', section: 'Getting started', title: 'Change your password or signature', audience: 'everyone', minutes: 1,
    steps: [
      s('Open your account', 'Select the person icon at the top of the left panel.'),
      s('Change your password', 'Enter a new password and select Change password.'),
      s('Save a signature', 'Select Add a signature to draw or type one. It is used when you sign forms.'),
    ],
  },
  {
    id: 'support', section: 'Getting started', title: 'Get help from support', audience: 'everyone', minutes: 2,
    steps: [
      s('Select Support', 'The Support button is in the bottom-right corner of every page.'),
      s('Describe the problem', 'Say what you were trying to do and what happened.'),
      s('Show the problem', 'Select Screenshot to circle the problem on the page, Record screen to record up to 3 minutes, or Attach file.'),
      s('Send it', 'Select Send to support. Replies appear under My requests.'),
    ],
  },

  // ---- Clients
  {
    id: 'find-client', section: 'Clients', title: 'Find a client', audience: 'everyone', minutes: 1,
    steps: [
      s('Open Clients', 'Select Clients in the left panel.'),
      s('Search', 'Type a name or member ID in the search box.'),
      s('Open the record', 'Select View Details on the client’s card.'),
    ],
  },
  {
    id: 'edit-client', section: 'Clients', title: 'Update client details', audience: 'everyone', minutes: 2,
    steps: [
      s('Open the client', 'Find the client and select View Details.'),
      s('Select Edit', 'Edit is at the top right of the record.'),
      s('Save', 'Change the details and select Update client. The change is recorded in History.'),
    ],
  },
  {
    id: 'document-edits', section: 'Clients', title: 'Accept details from documents', audience: 'everyone', minutes: 1,
    steps: [
      s('Open Document edits', 'Open the client and select the Document edits tab. It lists details found in uploaded files.'),
      s('Select the correct values', 'Tick each value to add. Each shows the current value, the new value and its source.'),
      s('Accept', 'Select Accept selected. Select Undo if you need to reverse it.'),
    ],
  },
  {
    id: 'history', section: 'Clients', title: 'See a client’s history', audience: 'admins', minutes: 1,
    steps: [
      s('Open History', 'Open the client and select the History tab.'),
      s('Read the timeline', 'Every change is listed with who made it and when: edits, documents, touchpoints and reassignments.'),
    ],
  },
  {
    id: 'close-case', section: 'Clients', title: 'Close a case', audience: 'everyone', minutes: 1,
    steps: [
      s('Select Close case', 'Open the client and select Close case.'),
      s('Enter the details', 'Select a reason and the date closed.'),
      s('Confirm', 'Select Close case. Select Undo in the message that appears if you closed it by mistake.'),
    ],
  },
  {
    id: 'reopen-case', section: 'Clients', title: 'Reopen a case', audience: 'admins', minutes: 1,
    steps: [
      s('Show closed cases', 'On Clients, set the case stage filter to Closed.'),
      s('Select Reopen', 'Open the client and select Reopen case.'),
      s('Choose the reason', 'Select Closed in error to restore the case as it was, or New referral to start a new 30-day authorization. Then select Reopen case.'),
    ],
  },
  {
    id: 'reassign', section: 'Clients', title: 'Reassign a client', audience: 'admins', minutes: 1,
    steps: [
      s('Select Reassign', 'Open the client and select Reassign.'),
      s('Choose the case manager', 'Select the new case manager, add a reason and select Reassign.'),
    ],
  },
  {
    id: 'add-client', section: 'Clients', title: 'Add a client', audience: 'admins', minutes: 3,
    steps: [
      s('Select Add new client', 'On Clients, select Add new client.'),
      s('Add the details', 'Choose the client’s intake file to fill in their details, or select Enter manually.'),
    ],
  },

  // ---- Forms and documents
  {
    id: 'upload', section: 'Forms and documents', title: 'Upload a document', audience: 'everyone', minutes: 2,
    steps: [
      s('Open the client’s Forms tab', 'Open the client and select Forms.'),
      s('Select Upload documents', 'It is at the top right of the tab.'),
      s('Choose the files', 'Drag PDFs into the box or select Choose files. Each file is read and filed on this client.'),
    ],
  },
  {
    id: 'fill-form', section: 'Forms and documents', title: 'Fill out a form', audience: 'everyone', minutes: 5,
    steps: [
      s('Open the client’s Forms tab', 'Open the client and select Forms.'),
      s('Select Begin', 'Select Begin next to the form: Client Intake, IAT, LON or HSP.'),
      s('Complete the form', 'The client’s details are already filled in. Type in the boxes, sign, tick the confirmation and select Complete form.'),
    ],
  },
  {
    id: 'drafts', section: 'Forms and documents', title: 'Save a draft', audience: 'everyone', minutes: 1,
    steps: [
      s('Save draft', 'While filling out a form, select Save draft.'),
      s('Find it later', 'Drafts are marked Draft on the client’s Forms tab. Open one to continue, then select Complete form.'),
    ],
  },
  {
    id: 'view-document', section: 'Forms and documents', title: 'View or download a document', audience: 'everyone', minutes: 1,
    steps: [
      s('Open the group', 'On the client’s Forms tab, select a row to show its documents.'),
      s('View or download', 'Select the name to view it, or the download icon to save it.'),
    ],
  },
  {
    id: 'mco-status', section: 'Forms and documents', title: 'Record an MCO response', audience: 'everyone', minutes: 1,
    steps: [
      s('Open the IAT or HSP', 'On the client’s Forms tab, open the Initial Assessment (IAT) or HSP row.'),
      s('Mark it sent', 'Select Sent to MCO after you send it.'),
      s('Record the answer', 'When the MCO replies, select Accepted by MCO or Denied by MCO.'),
    ],
  },
  {
    id: 'blank-form', section: 'Forms and documents', title: 'Start a blank form', audience: 'everyone', minutes: 3,
    steps: [
      s('Open Forms', 'Select Forms in the left panel.'),
      s('Choose the form', 'Select + on the form you need, such as a Move-in Supports Request. Select the upload icon to file one you completed elsewhere.'),
    ],
  },
  {
    id: 'case-log', section: 'Forms and documents', title: 'Complete your weekly case log', audience: 'everyone', minutes: 3,
    steps: [
      s('Open My touchpoints', 'The HMIS case log is at the bottom of My touchpoints. Each log covers Monday to Sunday.'),
      s('Check the rows', 'Rows fill in from the touchpoints you logged. Select Add row for anything missing.'),
      s('Save or view', 'Select Save draft to finish later, or View form to see the completed log.'),
    ],
  },

  // ---- Touchpoints
  {
    id: 'whats-due', section: 'Touchpoints', title: 'See what’s due', audience: 'everyone', minutes: 1,
    steps: [
      s('Open My touchpoints', 'Select My touchpoints in the left panel.'),
      s('Read the list', 'Plans due come first, then this month’s visits with their status.'),
    ],
  },
  {
    id: 'log-touchpoint', section: 'Touchpoints', title: 'Log a touchpoint', audience: 'everyone', minutes: 2,
    steps: [
      s('Select Add touchpoint', 'On My touchpoints, select Add touchpoint, or select it next to a scheduled visit.'),
      s('Enter the details', 'Select the client, date, contact method and touchpoint type, then add your notes.'),
      s('Save', 'Select Save. A matching NJHMIS progress note is prepared for you.'),
    ],
  },
  {
    id: 'reminders', section: 'Touchpoints', title: 'Respond to a reminder', audience: 'everyone', minutes: 1,
    steps: [
      s('Open Clients', 'Reminders from your manager appear when you open Clients.'),
      s('Choose an action', 'Select Complete now to log the touchpoint, This has been completed to close the reminder, or Remind me later to hide it for 4 hours. Use the arrows to move between reminders.'),
    ],
  },
  {
    id: 'reschedule', section: 'Touchpoints', title: 'Reschedule a visit', audience: 'everyone', minutes: 1,
    steps: [
      s('Find the visit', 'On My touchpoints, find the visit under This month.'),
      s('Reschedule', 'Select the calendar icon next to it and choose the new date.'),
    ],
  },

  // ---- Calendar
  {
    id: 'add-event', section: 'Calendar', title: 'Add an event', audience: 'everyone', minutes: 1,
    steps: [
      s('Select Add Event', 'Open Calendar and select Add Event.'),
      s('Enter the details', 'Add a title, type, client and time, then select Add Event.'),
    ],
  },
  {
    id: 'calendar-link', section: 'Calendar', title: 'See your calendar on your phone', audience: 'everyone', minutes: 2,
    steps: [
      s('Open your account', 'Select the person icon at the top of the left panel.'),
      s('Create your link', 'Select Create my calendar link and copy it into Google, Outlook or Apple Calendar.'),
    ],
  },

  // ---- Managing the team
  {
    id: 'team', section: 'Managing the team', title: 'Review team touchpoints', audience: 'admins', minutes: 2,
    steps: [
      s('Open Team touchpoints', 'Select Team touchpoints in the left panel.'),
      s('Choose whose cases', 'Switch between All cases and My cases at the top.'),
      s('Read the week', 'Logged this week lists every touchpoint recorded. Overdue is grouped by case manager.'),
    ],
  },
  {
    id: 'send-reminder', section: 'Managing the team', title: 'Send a touchpoint reminder', audience: 'admins', minutes: 1,
    steps: [
      s('Select Send a reminder', 'On Team touchpoints, select Send a reminder, or Remind next to an overdue client.'),
      s('Choose the case manager and clients', 'Select the case manager, tick the clients and add an optional note. Then select Send reminder.'),
    ],
  },
  {
    id: 'case-logs', section: 'Managing the team', title: 'Read weekly case logs', audience: 'admins', minutes: 1,
    steps: [
      s('Open a case manager', 'On Team touchpoints, select a name under Case managers to open this week’s log.'),
      s('Find past logs', 'Under Past case logs, choose the weeks and case managers, then select Find logs.'),
    ],
  },
  {
    id: 'staff-activity', section: 'Managing the team', title: 'Review staff activity', audience: 'admins', minutes: 2,
    steps: [
      s('Open Staff activity', 'Select Staff activity in the left panel and choose a period.'),
      s('Select a staff member', 'See their time by section and client, the tasks they completed and a timeline of every change.'),
    ],
  },
  {
    id: 'support-tickets', section: 'Managing the team', title: 'Answer support tickets', audience: 'admins', minutes: 2,
    steps: [
      s('Open Support tickets', 'Select Support tickets in the left panel. The number shows open tickets.'),
      s('Reply and update', 'Select a ticket, write a reply and set the status to In progress, Resolved or Closed.'),
    ],
  },

  // ---- Billing
  {
    id: 'file-claim', section: 'Billing', title: 'File a claim', audience: 'admins', minutes: 5,
    steps: [
      s('Open To bill', 'Select Billing. File before the deadline lists the claims closest to their last day to bill.'),
      s('Open the cycle', 'Select the client’s row to see every cycle, then select Open billing details.'),
      s('Copy into Availity', 'Copy each box from Eligibility and Benefits, then Claims and Encounters. Check orange boxes first.'),
      s('Mark it billed', 'Select Mark cycle as billed. The claim moves to Filed claims.'),
    ],
  },
  {
    id: 'record-payment', section: 'Billing', title: 'Record a payment or denial', audience: 'admins', minutes: 1,
    steps: [
      s('Open Filed claims', 'In Billing, select Filed claims, then Pending.'),
      s('Record the outcome', 'Select Mark paid, or Denied to return the cycle to To bill.'),
    ],
  },
  {
    id: 'revenue', section: 'Billing', title: 'Check revenue', audience: 'admins', minutes: 1,
    steps: [
      s('Open Revenue', 'In Billing, select Revenue.'),
      s('Read the months', 'The cards show this month’s billing, collections and pending claims. The table covers two months back and three ahead.'),
    ],
  },
  {
    id: 'workbook', section: 'Billing', title: 'Use the Workbook', audience: 'admins', minutes: 3,
    steps: [
      s('Open the Workbook', 'In Billing, select Workbook. It opens full screen.'),
      s('Edit a cell', 'Select a cell and type. Grey cells are calculated.'),
      s('Arrange columns and rows', 'Drag headings and row numbers to move them, and drag their edges to resize. The layout is shared with your team.'),
      s('Filter and export', 'Select Filter to filter each column, or Download as Excel to save every tab.'),
    ],
  },
  {
    id: 'lapsed', section: 'Billing', title: 'Follow up a lapsed authorization', audience: 'admins', minutes: 1,
    steps: [
      s('Open 2nd authorization', 'In the Workbook, select the 2nd authorization tab.'),
      s('Follow up', 'These authorizations ended over 14 days ago with no contact. Select Open client or Close case.'),
    ],
  },
];

export const shotFor = (guide: Guide, step: number) => `/help/${guide.id}-${step + 1}.jpg`;
