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
 * launched manually from the Help Guide.
 */
export const TUTORIALS: Record<string, TutorialDefinition> = {
  'admin-dashboard': {
    key: 'admin-dashboard',
    label: 'Dashboard',
    summary: 'Priority cards and how to action what needs follow-up.',
    autoRunRoles: ['admin'],
    steps: [
      {
        target: '[data-tutorial="dashboard-nav"]',
        title: 'Dashboard',
        description:
          'This is your command center. It surfaces what needs follow-up so you never have to calculate deadlines by hand.',
        placement: 'right',
      },
      {
        target: '[data-tutorial="priority-cards"]',
        title: 'Priority cards',
        description:
          'Four clickable cards: billing claims due within 48 hours, overdue billing claims, HSPs needing submission, and touchpoints due within 48 hours.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="priority-cards"]',
        title: 'Open a priority item',
        description:
          'Click a card to open the first matching client in a centered modal. Use previous/next to move through matches, and Back to return.',
        placement: 'bottom',
      },
    ],
  },
  'admin-clients': {
    key: 'admin-clients',
    label: 'Clients',
    summary: 'Add clients, complete setup, and set level of need.',
    autoRunRoles: ['admin'],
    steps: [
      {
        target: '[data-tutorial="clients-nav"]',
        title: 'Clients',
        description: 'Every client and their setup status lives here.',
        placement: 'right',
      },
      {
        target: '[data-tutorial="add-client-btn"]',
        title: 'Add a client',
        description:
          'Use Add client (top right) to enter the client, case manager, and IAT approval/start date. Level of need is optional at first.',
        placement: 'left',
      },
      {
        target: '[data-tutorial="lon-filter"]',
        title: 'Level of need',
        description:
          'Filter by Low, High, or Missing level of need. The system generates HSP due dates and billing cycles automatically once setup is complete.',
        placement: 'bottom',
      },
    ],
  },
  'admin-billing': {
    key: 'admin-billing',
    label: 'Billing',
    summary: 'Billing Overview, Cycle Dates, filters, and client detail.',
    autoRunRoles: ['admin'],
    steps: [
      {
        target: '[data-tutorial="billing-overview-tab"]',
        title: 'Billing Overview',
        description:
          'One row per client showing case manager, level of need, next action, HSP status, and claim status. Click a row to open the client detail.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="billing-approval-status"]',
        title: 'Approval status',
        description:
          'Filter by approval status: Pending HSP approval, HSP approved, Pending billing approval, or Billing approved.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="billing-urgency-filters"]',
        title: 'Urgency filters',
        description:
          'Narrow to claims due within 48 hours, due this week, overdue, or denied.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="cycle-dates-tab"]',
        title: 'Cycle Dates',
        description:
          'One row per client with Cycle 1–5 columns. Each cell shows start/end dates and a status badge. Paid cells are muted unless the Paid filter is active.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="client-detail-tab"]',
        title: 'Client detail & touchpoints',
        description:
          'The client detail view shows billing setup, generated cycles, and the current touchpoint requirement history for that client.',
        placement: 'bottom',
      },
    ],
  },
  'admin-touchpoints': {
    key: 'admin-touchpoints',
    label: 'Supervisor touchpoints',
    summary: 'Oversight numbers, filters, follow-up table, and reminders.',
    autoRunRoles: ['admin'],
    steps: [
      {
        target: '[data-tutorial="touchpoints-nav"]',
        title: 'Touchpoints',
        description:
          'Supervisor oversight of touchpoint compliance across your staff, opened from the side panel.',
        placement: 'right',
      },
      {
        target: '[data-tutorial="tp-oversight-numbers"]',
        title: 'Oversight numbers',
        description:
          'At-a-glance totals for overdue, due within 48 hours, and audit-risk items across all assigned staff.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="tp-filters"]',
        title: 'Staff & client filters',
        description: 'Filter the follow-up list by staff member or client.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="tp-followup-table"]',
        title: 'Follow-up table & status',
        description:
          'Review who is behind, use the status buttons, and Send reminder to route a touchpoint reminder to the assigned staff member.',
        placement: 'top',
      },
    ],
  },
  'staff-touchpoints': {
    key: 'staff-touchpoints',
    label: 'Touchpoints',
    summary: 'Your work queue: reminders, numbers, cycles, and Add touchpoint.',
    autoRunRoles: ['staff'],
    steps: [
      {
        target: '[data-tutorial="touchpoints-nav"]',
        title: 'Touchpoints',
        description:
          'This is your primary work queue, opened from the side panel. It automatically shows what needs to be done.',
        placement: 'right',
      },
      {
        target: '[data-tutorial="supervisor-reminders"]',
        title: 'Supervisor reminders',
        description:
          'Reminders from your supervisor appear here. They clear automatically once you log the touchpoint that satisfies the requirement.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="tp-top-numbers"]',
        title: 'Top numbers',
        description:
          'Overdue, due within 48 hours, incomplete touchpoints, and completed — so you always know where you stand.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="tp-upcoming-week"]',
        title: 'Upcoming this week',
        description: 'Touchpoints scheduled in the days ahead.',
        placement: 'bottom',
      },
      {
        target: '[data-tutorial="tp-cycles"]',
        title: 'Touchpoint cycles',
        description:
          'Each card is a rolling 30-day cycle with its required touchpoints and progress. Cycles are tied to the HSP start date, not calendar months.',
        placement: 'top',
      },
      {
        target: '[data-tutorial="add-touchpoint-btn"]',
        title: 'Add a touchpoint',
        description:
          'Use Add touchpoint to log a contact. You can set the type before saving, and it prepares an NJHMIS-ready entry for later.',
        placement: 'left',
      },
    ],
  },
  'staff-calendar': {
    key: 'staff-calendar',
    label: 'Calendar',
    summary: 'View scheduled touchpoints and drag to reschedule.',
    autoRunRoles: ['staff'],
    steps: [
      {
        target: '[data-tutorial="calendar-nav"]',
        title: 'Calendar',
        description:
          'A full calendar of your upcoming auto-generated touchpoints, weekends included. Scheduled touchpoints tied to a supervisor reminder are highlighted. To reschedule, drag a touchpoint to a new day — your manual moves are preserved and won’t be overwritten.',
        placement: 'right',
      },
    ],
  },
  'staff-clients': {
    key: 'staff-clients',
    label: 'My clients',
    summary: 'See setup info and log touchpoints for your clients.',
    autoRunRoles: ['staff'],
    steps: [
      {
        target: '[data-tutorial="clients-nav"]',
        title: 'My clients',
        description:
          'You only see clients once setup is complete. Open a client to view touchpoint-relevant setup info, the cycle due date, and progress.',
        placement: 'right',
      },
      {
        target: '[data-tutorial="lon-filter"]',
        title: 'What you can do',
        description:
          'You can add touchpoints and progress notes. Setup fields like level of need, HSP status, and billing are read-only and managed by your supervisor.',
        placement: 'bottom',
      },
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
      ];
    case 'admin':
    case 'superadmin':
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
  if (route === '/admin') return 'admin-dashboard';
  if (route === '/billing') return 'admin-billing';

  if (route === '/') {
    const isStaffLike = role === 'staff';
    if (view === 'compliance') {
      return isStaffLike ? 'staff-touchpoints' : 'admin-touchpoints';
    }
    if (view === 'calendar') return 'staff-calendar';
    if (view === 'clients') {
      return isStaffLike ? 'staff-clients' : 'admin-clients';
    }
  }
  return null;
}
