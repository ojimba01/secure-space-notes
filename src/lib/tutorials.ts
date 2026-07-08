import type { AppRole } from '@/hooks/useRole';

export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TutorialStep {
  /** CSS selector for the element to highlight. If missing/not found, the card centers. */
  target?: string;
  title: string;
  description: string;
  /** Preferred placement; the overlay falls back to whichever side has room. */
  placement?: TutorialPlacement;
}

export interface TutorialDefinition {
  key: string;
  label: string;
  /** Short description shown in the Help Guide list. */
  summary: string;
  /** Roles that may auto-run this tutorial on first use. Superadmin never auto-runs. */
  autoRunRoles: AppRole[];
  steps: TutorialStep[];
}

/**
 * All tutorials are defined in code (not the DB) so content stays versioned with
 * the UI. Each is keyed so completion can be tracked per-page in localStorage and
 * launched manually from the Help Guide. Copy matches the approved v27 scripts.
 */
export const TUTORIALS: Record<string, TutorialDefinition> = {
  'admin-dashboard': {
    key: 'admin-dashboard',
    label: 'Dashboard',
    summary: 'Review priority billing, HSP, and touchpoint follow-up.',
    autoRunRoles: ['admin'],
    steps: [
      { target: '[data-tutorial="dashboard-nav"]', title: 'Dashboard', description: 'Start here for priority billing, HSP, and touchpoint follow-up.', placement: 'right' },
      { target: '[data-tutorial="priority-cards"]', title: 'Priority cards', description: 'Each card shows work that needs attention now.', placement: 'bottom' },
      { target: '[data-tutorial="priority-billing-48"]', title: 'Billing due soon', description: 'This card opens billing claims due within 48 hours.', placement: 'bottom' },
      { target: '[data-tutorial="priority-billing-overdue"]', title: 'Overdue billing', description: 'This card opens billing claims past their cycle due date.', placement: 'bottom' },
      { target: '[data-tutorial="priority-hsp"]', title: 'HSP submissions', description: 'This card opens clients whose HSP needs submission or setup follow-up.', placement: 'bottom' },
      { target: '[data-tutorial="priority-touchpoints"]', title: 'Touchpoints due', description: 'This card opens clients whose touchpoint cycle is ending soon.', placement: 'bottom' },
      { target: '[data-tutorial="priority-modal"]', title: 'Review items', description: 'Use Previous and Next to move through matching items.', placement: 'top' },
      { target: '[data-tutorial="priority-modal-back"]', title: 'Back', description: 'Use Back to return to the Dashboard.', placement: 'top' },
    ],
  },
  'admin-clients': {
    key: 'admin-clients',
    label: 'Clients',
    summary: 'Add clients and complete setup.',
    autoRunRoles: ['admin'],
    steps: [
      { target: '[data-tutorial="clients-nav"]', title: 'Clients', description: 'Add clients, complete setup, and keep HSP information current.', placement: 'right' },
      { target: '[data-tutorial="add-client-btn"]', title: 'Add Client', description: 'Start a new client record after IAT approval or start information is available.', placement: 'left' },
      { target: '[data-tutorial="add-client-modal"]', title: 'Client setup', description: 'Enter the case manager, IAT approval date, LoN if known, and HSP approval start date if already approved.', placement: 'auto' },
      { target: '[data-tutorial="hsp-status-field"]', title: 'HSP status', description: 'HSP status controls whether the client is waiting for submission or approval.', placement: 'auto' },
      { target: '[data-tutorial="lon-field"]', title: 'LoN', description: 'LoN is required before billing cycles and touchpoint requirements can be generated.', placement: 'auto' },
      { target: '[data-tutorial="hsp-start-field"]', title: 'Approval start date', description: 'This date anchors billing cycles and touchpoint cycles.', placement: 'auto' },
      { target: '[data-tutorial="client-table"]', title: 'Client list', description: 'Use the list to review setup status, assignment, and current follow-up needs.', placement: 'top' },
      { target: '[data-tutorial="client-row"]', title: 'Open client', description: 'Open a client to update setup details or review related work.', placement: 'top' },
      { target: '[data-tutorial="setup-status-filter"]', title: 'Staff visibility', description: 'Staff only see clients after HSP submission, HSP approval start date, and LoN are complete.', placement: 'bottom' },
    ],
  },
  'admin-billing': {
    key: 'admin-billing',
    label: 'Billing',
    summary: 'Review claim status and billing cycles.',
    autoRunRoles: ['admin'],
    steps: [
      { target: '[data-tutorial="billing-nav"]', title: 'Billing', description: 'Use Billing to review claim status and 30-day billing cycles.', placement: 'right' },
      { target: '[data-tutorial="billing-overview-tab"]', title: 'Billing Overview', description: 'This view shows one row per client with the next billing action.', placement: 'bottom' },
      { target: '[data-tutorial="billing-approval-status"]', title: 'Approval status', description: 'Use this filter to separate Pending HSP approval from Pending billing approval.', placement: 'bottom' },
      { target: '[data-tutorial="billing-urgency-filters"]', title: 'Billing filters', description: 'Use these filters to find claims due soon, overdue claims, and denied claims.', placement: 'bottom' },
      { target: '[data-tutorial="billing-overview-table"]', title: 'Client rows', description: 'Open a row to review Client Billing and claim actions.', placement: 'top' },
      { target: '[data-tutorial="cycle-dates-tab"]', title: 'Cycle Dates', description: 'This view shows one row per client with Cycle 1 through Cycle 5.', placement: 'bottom' },
      { target: '[data-tutorial="cycle-cell"]', title: 'Cycle cells', description: 'Each cell shows the cycle dates and any status that needs attention.', placement: 'top' },
      { target: '[data-tutorial="regenerate-cycles-btn"]', title: 'Regenerate cycles', description: 'Use this when cycles are missing or dates need to be rebuilt.', placement: 'left' },
      { target: '[data-tutorial="client-detail-tab"]', title: 'Client Billing', description: 'Review billing setup, cycle dates, claim status, and touchpoint history.', placement: 'bottom' },
      { target: '[data-tutorial="claim-actions"]', title: 'Claim actions', description: 'Mark claims submitted, paid, or denied without changing other cycle history.', placement: 'top' },
      { target: '[data-tutorial="cycle-dates-tab"]', title: 'Cycle logic', description: 'Billing cycles start from the HSP approval start date, not calendar months.', placement: 'bottom' },
    ],
  },
  'admin-touchpoints': {
    key: 'admin-touchpoints',
    label: 'Touchpoints',
    summary: 'Check staff follow-through and send reminders.',
    autoRunRoles: ['admin'],
    steps: [
      { target: '[data-tutorial="touchpoints-nav"]', title: 'Touchpoints', description: 'Use this page to check staff follow-through and send reminders.', placement: 'right' },
      { target: '[data-tutorial="tp-oversight-numbers"]', title: 'Status cards', description: 'Click a card to filter by overdue, due soon, incomplete, or missing information.', placement: 'bottom' },
      { target: '[data-tutorial="tp-staff-filter"]', title: 'Staff filter', description: 'Filter by assigned staff to focus follow-up.', placement: 'bottom' },
      { target: '[data-tutorial="tp-search"]', title: 'Search', description: 'Search by client or staff member.', placement: 'bottom' },
      { target: '[data-tutorial="tp-filters"]', title: 'Status filters', description: 'Use these filters to narrow the follow-up list.', placement: 'bottom' },
      { target: '[data-tutorial="tp-followup-table"]', title: 'Follow-up table', description: 'Review cycle due date, required touchpoints, status, and assigned staff.', placement: 'top' },
      { target: '[data-tutorial="tp-send-reminder"]', title: 'Send reminder', description: 'Send a touchpoint reminder to the assigned staff member.', placement: 'top' },
      { target: '[data-tutorial="tp-reminder-modal"]', title: 'Reminder message', description: 'Choose a template or edit the message before sending.', placement: 'auto' },
    ],
  },
  'superadmin-dashboard': {
    key: 'superadmin-dashboard',
    label: 'Dashboard',
    summary: 'Review agency-wide priority work.',
    autoRunRoles: [],
    steps: [
      { target: '[data-tutorial="dashboard-nav"]', title: 'Dashboard', description: 'Review agency-wide priority work across billing, HSP, and touchpoints.', placement: 'right' },
      { target: '[data-tutorial="priority-cards"]', title: 'Priority cards', description: 'Each card opens matching follow-up items across staff.', placement: 'bottom' },
      { target: '[data-tutorial="staff-overview"]', title: 'Staff overview', description: 'Use this table to compare workload and follow-up needs by staff member.', placement: 'top' },
      { target: '[data-tutorial="priority-modal"]', title: 'Review items', description: 'Move through matching items without leaving the Dashboard.', placement: 'top' },
      { target: '[data-tutorial="advanced-tools-nav"]', title: 'Advanced tools', description: 'Use Advanced tools for staff workflow preview and future import features.', placement: 'right' },
    ],
  },
  'superadmin-advanced': {
    key: 'superadmin-advanced',
    label: 'Advanced tools',
    summary: 'Preview staff workflows and future imports.',
    autoRunRoles: [],
    steps: [
      { target: '[data-tutorial="advanced-tools-nav"]', title: 'Advanced tools', description: 'Use this area for supervisor-only tools and future workflows.', placement: 'right' },
      { target: '[data-tutorial="staff-preview"]', title: 'Staff preview', description: 'Preview the staff experience without changing staff permissions.', placement: 'auto' },
      { target: '[data-tutorial="phase2-tools"]', title: 'Phase 2 tools', description: 'Referral email import, Excel import, and NJHMIS queue are future workflows.', placement: 'auto' },
      { target: '[data-tutorial="compliance-note"]', title: 'Compliance review', description: 'Do not activate integrations until compliance and authorization are complete.', placement: 'auto' },
    ],
  },
  'staff-touchpoints': {
    key: 'staff-touchpoints',
    label: 'Touchpoints',
    summary: 'Review reminders, due dates, and assigned touchpoints.',
    autoRunRoles: ['staff'],
    steps: [
      { target: '[data-tutorial="touchpoints-nav"]', title: 'Touchpoints', description: 'This is your work queue for assigned touchpoints.', placement: 'right' },
      { target: '[data-tutorial="supervisor-reminders"]', title: 'Supervisor reminders', description: 'Reminders show which clients need follow-up.', placement: 'bottom' },
      { target: '[data-tutorial="reminder-item"]', title: 'Open reminder', description: 'Open a reminder to see the client’s touchpoint status. Click the highlighted reminder.', placement: 'bottom' },
      { target: '[data-tutorial="staff-client-modal"]', title: 'Client touchpoints', description: 'Review cycle due date, required touchpoints, and recent notes.', placement: 'auto' },
      { target: '[data-tutorial="add-touchpoint-btn"]', title: 'Add touchpoint', description: 'Add the contact after you complete the touchpoint. Click Add touchpoint.', placement: 'left' },
      { target: '[data-tutorial="touchpoint-type-field"]', title: 'Touchpoint type', description: 'The type is prefilled when possible, but you can change it.', placement: 'auto' },
      { target: '[data-tutorial="touchpoint-details"]', title: 'Touchpoint details', description: 'Enter the date, contact method, duration, type, and note.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-section"]', title: 'NJHMIS-ready entry', description: 'Case Notes prepares the NJHMIS-ready entry without submitting it.', placement: 'auto' },
      { target: '[data-tutorial="touchpoint-save"]', title: 'Save touchpoint', description: 'Saving updates the touchpoint count and related reminder.', placement: 'auto' },
      { target: '[data-tutorial="tp-top-numbers"]', title: 'Top numbers', description: 'See what is overdue, due soon, incomplete, and completed.', placement: 'bottom' },
      { target: '[data-tutorial="tp-upcoming-week"]', title: 'Upcoming', description: 'Review scheduled touchpoints coming up soon.', placement: 'bottom' },
      { target: '[data-tutorial="tp-cycles"]', title: 'Touchpoint cycles', description: 'Each card shows the current cycle, due date, and requirements.', placement: 'top' },
    ],
  },
  'staff-calendar': {
    key: 'staff-calendar',
    label: 'Calendar',
    summary: 'View and reschedule touchpoints.',
    autoRunRoles: ['staff'],
    steps: [
      { target: '[data-tutorial="calendar-nav"]', title: 'Calendar', description: 'View scheduled touchpoints by date.', placement: 'right' },
      { target: '[data-tutorial="calendar-grid"]', title: 'Calendar view', description: 'Touchpoints appear on the date they are scheduled.', placement: 'auto' },
      { target: '[data-tutorial="calendar-grid"]', title: 'Weekends', description: 'Weekends are included because touchpoints can happen on weekends.', placement: 'auto' },
      { target: '[data-tutorial="calendar-event"]', title: 'Touchpoint event', description: 'Open an event to add or update the touchpoint details.', placement: 'auto' },
      { target: '[data-tutorial="calendar-event"]', title: 'Reschedule', description: 'Drag a touchpoint to a new date when needed. Drag the highlighted event.', placement: 'auto' },
      { target: '[data-tutorial="calendar-event"]', title: 'Manual moves', description: 'Manual moves are preserved during schedule updates.', placement: 'auto' },
      { target: '[data-tutorial="calendar-event"]', title: 'Reminder highlight', description: 'Reminders highlight the relevant touchpoint instead of creating duplicate work.', placement: 'auto' },
    ],
  },
  'staff-clients': {
    key: 'staff-clients',
    label: 'My clients',
    summary: 'Review assigned clients and recent notes.',
    autoRunRoles: ['staff'],
    steps: [
      { target: '[data-tutorial="clients-nav"]', title: 'My clients', description: 'Review the clients currently assigned to you.', placement: 'right' },
      { target: '[data-tutorial="client-table"]', title: 'Assigned clients', description: 'You only see clients whose setup is complete.', placement: 'top' },
      { target: '[data-tutorial="client-row"]', title: 'Client card', description: 'Each card shows touchpoint status and current cycle information.', placement: 'top' },
      { target: '[data-tutorial="client-row"]', title: 'Open client', description: 'Open a client to review touchpoint status and recent notes.', placement: 'top' },
      { target: '[data-tutorial="staff-client-setup"]', title: 'Read-only setup', description: 'LoN, HSP dates, authorization, and billing are managed by admin.', placement: 'auto' },
      { target: '[data-tutorial="add-touchpoint-btn"]', title: 'Add touchpoint', description: 'Add touchpoints from the client view when contact is complete.', placement: 'left' },
    ],
  },
  'staff-notes': {
    key: 'staff-notes',
    label: 'Notes',
    summary: 'Add housing case notes.',
    autoRunRoles: [],
    steps: [
      { target: '[data-tutorial="notes-nav"]', title: 'Notes', description: 'Use Housing Case Notes to document client support.', placement: 'right' },
      { target: '[data-tutorial="add-note-btn"]', title: 'Add note', description: 'Add a note when you need to document support outside a touchpoint.', placement: 'left' },
      { target: '[data-tutorial="recent-notes"]', title: 'Recent notes', description: 'Recent notes help inform future touchpoint type labels.', placement: 'top' },
      { target: '[data-tutorial="notes-security"]', title: 'Secure notes', description: 'Keep notes clear, professional, and HIPAA compliant.', placement: 'auto' },
    ],
  },
  'add-touchpoint': {
    key: 'add-touchpoint',
    label: 'Add touchpoint',
    summary: 'Record a client contact and prepare an NJHMIS-ready entry.',
    autoRunRoles: [],
    steps: [
      { target: '[data-tutorial="add-touchpoint-title"]', title: 'Add touchpoint', description: 'Record the client contact once.', placement: 'auto' },
      { target: '[data-tutorial="touchpoint-details"]', title: 'Touchpoint details', description: 'This section captures the Case Notes touchpoint record.', placement: 'auto' },
      { target: '[data-tutorial="tp-date-field"]', title: 'Date', description: 'Use the date the contact happened.', placement: 'auto' },
      { target: '[data-tutorial="tp-method-field"]', title: 'Contact method', description: 'Choose how the contact happened.', placement: 'auto' },
      { target: '[data-tutorial="touchpoint-type-field"]', title: 'Touchpoint type', description: 'Choose the best match for the support provided.', placement: 'auto' },
      { target: '[data-tutorial="tp-duration-field"]', title: 'Duration', description: 'Enter the time spent on the touchpoint.', placement: 'auto' },
      { target: '[data-tutorial="tp-note-field"]', title: 'Note', description: 'Write a concise case-management note using CM language.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-section"]', title: 'NJHMIS-ready entry', description: 'This section prepares the information needed for later NJHMIS entry.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-service-type"]', title: 'Service Type', description: 'Choose the service category that matches the support provided.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-location"]', title: 'Location', description: 'Choose where the service took place.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-face-to-face"]', title: 'Face-to-Face?', description: 'This syncs from contact method. In person sets this to Yes.', placement: 'auto' },
      { target: '[data-tutorial="njhmis-progress-note-type"]', title: 'Progress Note Type', description: 'General Chart Note is selected unless the agency uses another type.', placement: 'auto' },
      { target: '[data-tutorial="touchpoint-save"]', title: 'Save', description: 'Saving does not submit to NJHMIS.', placement: 'auto' },
    ],
  },
};

/** Tutorials a given role can see/launch in the Help Guide. */
export function tutorialsForRole(role: AppRole): TutorialDefinition[] {
  switch (role) {
    case 'staff':
      return [
        TUTORIALS['staff-touchpoints'],
        TUTORIALS['staff-calendar'],
        TUTORIALS['staff-clients'],
        TUTORIALS['staff-notes'],
      ];
    case 'superadmin':
      return [
        TUTORIALS['superadmin-dashboard'],
        TUTORIALS['admin-clients'],
        TUTORIALS['admin-billing'],
        TUTORIALS['admin-touchpoints'],
        TUTORIALS['superadmin-advanced'],
      ];
    case 'admin':
      return [
        TUTORIALS['admin-dashboard'],
        TUTORIALS['admin-clients'],
        TUTORIALS['admin-billing'],
        TUTORIALS['admin-touchpoints'],
      ];
    default:
      return [];
  }
}

/**
 * Maps the current in-app location to the tutorial key that should auto-run.
 * `view` is the Index tab (compliance/clients/notes/calendar); `route` is the
 * pathname for standalone pages.
 */
export function resolveTutorialKey(
  role: AppRole,
  route: string,
  view?: string,
): string | null {
  if (route === '/admin') {
    return role === 'superadmin' ? 'superadmin-dashboard' : 'admin-dashboard';
  }
  if (route === '/billing') return 'admin-billing';

  if (route === '/') {
    const isStaffLike = role === 'staff';
    if (view === 'compliance') {
      return isStaffLike ? 'staff-touchpoints' : 'admin-touchpoints';
    }
    if (view === 'calendar') return 'staff-calendar';
    if (view === 'notes') return isStaffLike ? 'staff-notes' : null;
    if (view === 'clients') {
      return isStaffLike ? 'staff-clients' : 'admin-clients';
    }
  }
  return null;
}
