// Takes every Help guide screenshot from the real app over made-up data.
//
//   1. npx vite --config scripts/help-screenshots/vite.config.ts   (leave it running)
//   2. node scripts/help-screenshots/capture.mjs [guide-id ...]
//
// Writes public/help/<guide>-<step>.jpg. Each shot opens the app as the case
// manager (staff) or the administrator (admin), gets to the right screen, and
// rings the thing to select in red. Step numbers match src/lib/helpGuides.ts.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../public/help');
const BASE = process.env.HELP_BASE ?? 'http://localhost:5198';
const PW = process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const tab = (p, name) => p.getByRole('tab', { name, exact: true });
const btn = (p, name, exact = false) => p.getByRole('button', { name, exact }).first();
const text = (p, t) => p.getByText(t, { exact: true }).first();
const nav = (p, name) => p.getByRole('button', { name, exact: true }).first();
const dialog = (p) => p.getByRole('dialog').last();
const wait = (p, ms = 700) => p.waitForTimeout(ms);
const billing = async (p) => {
  await p.goto(`${BASE}/billing`);
  await p.waitForSelector('tbody tr', { timeout: 15000 });
  await wait(p, 600);
};
const billingDetails = async (p) => {
  await billing(p);
  await p.locator('tbody tr').first().click();
  await wait(p);
  await btn(p, 'Open billing details').click();
  await wait(p, 1800);
};

async function openClient(p, id, tabName) {
  await p.goto(`${BASE}/?view=clients&client=${id}`);
  await wait(p, 2200);
  if (tabName) {
    await tab(p, tabName).click();
    await wait(p);
  }
}

async function closedClient(p) {
  await p.goto(`${BASE}/?view=clients`);
  await wait(p, 2000);
  await text(p, 'All case stages').click();
  await wait(p, 400);
  await p.getByRole('option', { name: 'Closed' }).click();
  await wait(p, 800);
  await btn(p, 'View Details').click();
  await wait(p, 1500);
}

// guide id -> one entry per step: { as, go(page), target(page) -> locator, label }
const SHOTS = {
  'sign-in': [
    { as: 'signedout', go: (p) => p.goto(`${BASE}/auth`), target: (p) => p.getByRole('button', { name: 'Sign in', exact: true }).last(), label: 'Sign in' },
    { as: 'signedout', go: (p) => p.goto(`${BASE}/auth`), target: (p) => text(p, 'Forgot password?'), label: 'Forgot password?' },
    { as: 'signedout', go: async (p) => { await p.goto(`${BASE}/auth`); await wait(p, 1500); await text(p, 'Forgot password?').click(); }, target: (p) => btn(p, 'Send reset instructions'), label: 'Send reset instructions' },
  ],
  'find-your-way': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => p.getByRole('button', { name: 'Clients', exact: true }).first().locator('xpath=..'), label: 'Your work' },
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => p.locator('[aria-label="Your account"]').last(), label: 'Your account' },
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'Start walkthrough'), label: 'Start walkthrough' },
  ],
  account: [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => p.locator('[aria-label="Your account"]').last(), label: 'Your account' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await p.locator('[aria-label="Your account"]').last().click(); }, target: (p) => btn(p, 'Change password'), label: 'Change password' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await p.locator('[aria-label="Your account"]').last().click(); }, target: (p) => btn(p, 'Add a signature'), label: 'Add a signature' },
  ],
  support: [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'Support', true), label: 'Support' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await btn(p, 'Support', true).click(); }, target: (p) => p.locator('textarea').last(), label: 'Describe the problem' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await btn(p, 'Support', true).click(); }, target: (p) => btn(p, 'Screenshot'), label: 'Screenshot' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await btn(p, 'Support', true).click(); await p.locator('textarea').last().fill('The Upload documents button does nothing on Dana Whitfield’s Forms tab.'); }, target: (p) => btn(p, 'Send to support'), label: 'Send to support' },
  ],

  'find-client': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => nav(p, 'Clients'), label: 'Clients' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await p.getByPlaceholder(/Search by name/).fill('Dana'); }, target: (p) => p.getByPlaceholder(/Search by name/), label: 'Search' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await p.getByPlaceholder(/Search by name/).fill('Dana'); }, target: (p) => btn(p, 'View Details'), label: 'View Details' },
  ],
  'edit-client': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'View Details'), label: 'View Details' },
    { as: 'staff', go: (p) => openClient(p, 'c-1'), target: (p) => btn(p, 'Edit', true), label: 'Edit' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1'); await btn(p, 'Edit', true).click(); await wait(p); }, target: (p) => btn(p, 'Update client'), label: 'Update client' },
  ],
  'document-edits': [
    { as: 'staff', go: (p) => openClient(p, 'c-1'), target: (p) => tab(p, 'Document edits'), label: 'Document edits' },
    { as: 'staff', go: (p) => openClient(p, 'c-1', 'Document edits'), target: (p) => p.getByRole('checkbox').first().locator('xpath=..'), label: 'Tick the correct value' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1', 'Document edits'); await p.getByRole('checkbox').first().click(); }, target: (p) => btn(p, /Accept/), label: 'Accept selected' },
  ],
  history: [
    { as: 'admin', go: (p) => openClient(p, 'c-1'), target: (p) => tab(p, 'History'), label: 'History' },
    { as: 'admin', go: (p) => openClient(p, 'c-1', 'History'), target: (p) => text(p, 'Case history').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), label: 'Every change, with who and when' },
  ],
  'close-case': [
    { as: 'staff', go: (p) => openClient(p, 'c-2'), target: (p) => btn(p, 'Close case', true), label: 'Close case' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-2'); await btn(p, 'Close case', true).click(); await wait(p); }, target: (p) => dialog(p).getByRole('combobox').first(), label: 'Select a reason' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-2'); await btn(p, 'Close case', true).click(); await wait(p); }, target: (p) => dialog(p).getByRole('button', { name: 'Close case', exact: true }), label: 'Close case' },
  ],
  'reopen-case': [
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await text(p, 'All case stages').click(); await wait(p, 500); }, target: (p) => p.getByRole('option', { name: 'Closed' }), label: 'Closed' },
    { as: 'admin', go: closedClient, target: (p) => btn(p, /Reopen/), label: 'Reopen case' },
    { as: 'admin', go: async (p) => { await closedClient(p); await btn(p, /Reopen/).click(); await wait(p, 1200); }, target: (p) => dialog(p).getByRole('radio', { name: /Closed in error/ }), label: 'Closed in error' },
  ],
  reassign: [
    { as: 'admin', go: (p) => openClient(p, 'c-1'), target: (p) => btn(p, 'Reassign', true), label: 'Reassign' },
    { as: 'admin', go: async (p) => { await openClient(p, 'c-1'); await btn(p, 'Reassign', true).click(); await wait(p, 1000); }, target: (p) => dialog(p).getByRole('combobox').first(), label: 'Select the case manager' },
  ],
  'add-client': [
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'Add new client'), label: 'Add new client' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/?view=clients`); await wait(p, 2000); await btn(p, 'Add new client').click(); await wait(p, 900); }, target: (p) => dialog(p).getByRole('button', { name: 'Enter manually' }), label: 'Enter manually' },
  ],

  upload: [
    { as: 'staff', go: (p) => openClient(p, 'c-1'), target: (p) => tab(p, 'Forms'), label: 'Forms' },
    { as: 'staff', go: (p) => openClient(p, 'c-1', 'Forms'), target: (p) => btn(p, 'Upload documents'), label: 'Upload documents' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1', 'Forms'); await btn(p, 'Upload documents').click(); await wait(p); }, target: (p) => btn(p, 'Choose files'), label: 'Choose files' },
  ],
  'fill-form': [
    { as: 'staff', go: (p) => openClient(p, 'c-2'), target: (p) => tab(p, 'Forms'), label: 'Forms' },
    { as: 'staff', go: (p) => openClient(p, 'c-2', 'Forms'), target: (p) => btn(p, 'Begin', true), label: 'Begin' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-2', 'Forms'); await btn(p, 'Begin', true).click(); await wait(p, 4000); }, target: (p) => btn(p, 'Complete form'), label: 'Complete form' },
  ],
  drafts: [
    { as: 'staff', go: async (p) => { await openClient(p, 'c-2', 'Forms'); await btn(p, 'Begin', true).click(); await wait(p, 4000); }, target: (p) => btn(p, 'Save draft'), label: 'Save draft' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1', 'Forms'); await text(p, 'Housing Stabilization Plan (HSP)').click(); await wait(p); }, target: (p) => text(p, 'Draft'), label: 'Draft' },
  ],
  'view-document': [
    { as: 'staff', go: (p) => openClient(p, 'c-1', 'Forms'), target: (p) => text(p, 'Initial Assessment (IAT)').locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]'), label: 'Show documents' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1', 'Forms'); await text(p, 'Initial Assessment (IAT)').click(); await wait(p); }, target: (p) => p.getByTitle('Download').first(), label: 'Download' },
  ],
  'mco-status': [
    { as: 'staff', go: (p) => openClient(p, 'c-1', 'Forms'), target: (p) => text(p, 'Housing Stabilization Plan (HSP)').locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]'), label: 'Open the row' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-2', 'Forms'); await text(p, 'Initial Assessment (IAT)').click(); await wait(p); }, target: (p) => btn(p, 'Sent to MCO'), label: 'Sent to MCO' },
    { as: 'staff', go: async (p) => { await openClient(p, 'c-1', 'Forms'); await text(p, 'Initial Assessment (IAT)').click(); await wait(p); }, target: (p) => text(p, 'Accepted by MCO'), label: 'MCO response' },
  ],
  'blank-form': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => nav(p, 'Forms'), label: 'Forms' },
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=forms`), target: (p) => text(p, 'Horizon Move-in Supports Request').locator('xpath=ancestor::div[contains(@class,"rounded")][1]').getByRole('button').first(), label: 'Start the form' },
  ],
  'case-log': [
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await text(p, 'HMIS case log').scrollIntoViewIfNeeded(); }, target: (p) => text(p, 'HMIS case log'), label: 'HMIS case log' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await text(p, 'HMIS case log').scrollIntoViewIfNeeded(); }, target: (p) => btn(p, 'Add row'), label: 'Add row' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await text(p, 'HMIS case log').scrollIntoViewIfNeeded(); }, target: (p) => btn(p, 'Save draft'), label: 'Save draft' },
  ],

  'whats-due': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => nav(p, 'My touchpoints'), label: 'My touchpoints' },
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => text(p, 'This month').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), label: 'This month’s visits' },
  ],
  'log-touchpoint': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => btn(p, 'Add touchpoint'), label: 'Add touchpoint' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await btn(p, 'Add touchpoint').click(); await wait(p, 900); }, target: (p) => dialog(p).getByRole('combobox').first(), label: 'Select the client' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await btn(p, 'Add touchpoint').click(); await wait(p, 900); }, target: (p) => dialog(p).getByRole('button', { name: /^Save/ }).last(), label: 'Save' },
  ],
  reminders: [
    { as: 'staff', reminders: true, go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'Next reminder'), label: 'Next reminder' },
    { as: 'staff', reminders: true, go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => btn(p, 'Complete now'), label: 'Complete now' },
  ],
  reschedule: [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => text(p, 'This month').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), label: 'This month' },
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => p.getByTitle(/Reschedule/).first(), label: 'Reschedule' },
  ],

  'add-event': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=calendar`), target: (p) => btn(p, 'Add Event'), label: 'Add Event' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=calendar`); await wait(p, 2000); await btn(p, 'Add Event').click(); await wait(p, 900); }, target: (p) => dialog(p).getByRole('button', { name: 'Add Event' }), label: 'Add Event' },
  ],
  'calendar-link': [
    { as: 'staff', go: (p) => p.goto(`${BASE}/?view=calendar`), target: (p) => p.locator('[aria-label="Your account"]').last(), label: 'Your account' },
    { as: 'staff', go: async (p) => { await p.goto(`${BASE}/?view=calendar`); await wait(p, 2000); await p.locator('[aria-label="Your account"]').last().click(); }, target: (p) => btn(p, 'Create my calendar link'), label: 'Create my calendar link' },
  ],

  team: [
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => nav(p, 'Team touchpoints'), label: 'Team touchpoints' },
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => p.locator('button:visible', { hasText: /^All cases$/ }).first(), label: 'All cases or My cases' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await text(p, 'Logged this week').scrollIntoViewIfNeeded(); }, target: (p) => text(p, 'Logged this week'), label: 'Logged this week' },
  ],
  'send-reminder': [
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => btn(p, 'Send a reminder'), label: 'Send a reminder' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await btn(p, 'Send a reminder').click(); await wait(p, 800); }, target: (p) => dialog(p).getByRole('combobox').first(), label: 'Select a case manager' },
  ],
  'case-logs': [
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/?view=compliance`); await wait(p, 2200); await btn(p, /Taylor Brooks\s*\d+ clients?/).scrollIntoViewIfNeeded(); }, target: (p) => btn(p, /Taylor Brooks\s*\d+ clients?/), label: 'Open the log' },
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=compliance`), target: (p) => btn(p, 'Find logs'), label: 'Find logs' },
  ],
  'staff-activity': [
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => nav(p, 'Staff activity'), label: 'Staff activity' },
    { as: 'admin', go: (p) => p.goto(`${BASE}/staff-activity`), target: (p) => p.locator('tbody tr').first(), label: 'Select a staff member' },
  ],
  'support-tickets': [
    { as: 'admin', go: (p) => p.goto(`${BASE}/?view=clients`), target: (p) => nav(p, 'Support tickets'), label: 'Support tickets' },
    { as: 'admin', go: (p) => p.goto(`${BASE}/support-tickets`), target: (p) => p.getByRole('combobox').first(), label: 'Filter by status' },
  ],

  'file-claim': [
    { as: 'admin', go: billing, target: (p) => text(p, 'File before the deadline').locator('xpath=ancestor::button[1]'), label: 'File before the deadline' },
    { as: 'admin', go: async (p) => { await billing(p); await p.locator('tbody tr').first().click(); await wait(p); }, target: (p) => btn(p, 'Open billing details'), label: 'Open billing details' },
    { as: 'admin', go: billingDetails, target: (p) => dialog(p).getByRole('button', { name: 'Claims and Encounters' }), label: 'Claims and Encounters' },
    { as: 'admin', go: async (p) => { await billingDetails(p); await dialog(p).getByRole('button', { name: 'Claims and Encounters' }).click(); await wait(p, 800); }, target: (p) => dialog(p).getByRole('button', { name: /^Mark cycle \d+ as billed$/ }), label: 'Mark as billed' },
  ],
  'record-payment': [
    { as: 'admin', go: (p) => p.goto(`${BASE}/billing`), target: (p) => btn(p, /Filed claims/), label: 'Filed claims' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, /Filed claims/).click(); await wait(p); await btn(p, /Pending \(/).click(); await wait(p); }, target: (p) => btn(p, 'Mark paid'), label: 'Mark paid' },
  ],
  revenue: [
    { as: 'admin', go: (p) => p.goto(`${BASE}/billing`), target: (p) => btn(p, /Revenue/), label: 'Revenue' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, /Revenue/).click(); await wait(p); }, target: (p) => text(p, 'By month').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), label: 'By month' },
  ],
  workbook: [
    { as: 'admin', go: (p) => p.goto(`${BASE}/billing`), target: (p) => btn(p, 'Workbook', true), label: 'Workbook' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, 'Workbook', true).click(); await wait(p, 2000); }, target: (p) => p.locator('tbody tr').nth(1).locator('td').nth(3), label: 'Select a cell to edit' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, 'Workbook', true).click(); await wait(p, 2000); }, target: (p) => p.locator('thead th').nth(2), label: 'Drag to move, drag the edge to resize' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, 'Workbook', true).click(); await wait(p, 2000); }, target: (p) => btn(p, 'Download as Excel'), label: 'Download as Excel' },
  ],
  lapsed: [
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, 'Workbook', true).click(); await wait(p, 2000); }, target: (p) => p.getByRole('tab', { name: /2nd authorization/ }), label: '2nd authorization' },
    { as: 'admin', go: async (p) => { await p.goto(`${BASE}/billing`); await wait(p, 2200); await btn(p, 'Workbook', true).click(); await wait(p, 2000); await p.getByRole('tab', { name: /2nd authorization/ }).click(); await wait(p); }, target: (p) => btn(p, 'Open client'), label: 'Open client' },
  ],
};

/** Ring the target in red, with a label, above everything else on the page. */
async function ring(p, locator, label) {
  await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await wait(p, 300);
  const box = await locator.boundingBox({ timeout: 5000 });
  if (!box) throw new Error('target has no box');
  await p.evaluate(({ box, label }) => {
    const pad = 6;
    const ringEl = document.createElement('div');
    Object.assign(ringEl.style, {
      position: 'fixed', left: `${box.x - pad}px`, top: `${box.y - pad}px`,
      width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`,
      border: '3px solid #dc2626', borderRadius: '10px', boxShadow: '0 0 0 6px rgba(220,38,38,.18)',
      zIndex: 2147483646, pointerEvents: 'none',
    });
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, {
      position: 'fixed', zIndex: 2147483647, background: '#dc2626', color: '#fff',
      font: '600 13px/1.2 system-ui, sans-serif', padding: '5px 9px', borderRadius: '6px', whiteSpace: 'nowrap',
      boxShadow: '0 2px 6px rgba(0,0,0,.25)',
    });
    document.body.append(ringEl, tag);
    const { width: w, height: h } = tag.getBoundingClientRect();
    const gap = pad + 10;
    const midY = box.y + box.height / 2 - h / 2;
    // Beside the target where there is room, so the label covers nothing it
    // points at; otherwise below it, or above it at the bottom of the screen.
    if (box.x + box.width + gap + w < window.innerWidth - 8) {
      tag.style.left = `${box.x + box.width + gap}px`;
      tag.style.top = `${midY}px`;
    } else if (box.x - gap - w > 8) {
      tag.style.left = `${box.x - gap - w}px`;
      tag.style.top = `${midY}px`;
    } else {
      const below = box.y + box.height + gap + h < window.innerHeight - 8;
      tag.style.top = below ? `${box.y + box.height + gap}px` : `${box.y - gap - h}px`;
      tag.style.left = `${Math.min(Math.max(8, box.x + box.width / 2 - w / 2), window.innerWidth - w - 8)}px`;
    }
  }, { box, label });
}

const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const failures = [];

for (const [id, steps] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(id)) continue;
  for (let i = 0; i < steps.length; i++) {
    const shot = steps[i];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await ctx.newPage();
    p.setDefaultTimeout(8000);
    // The first page load decides who is signed in (see mock/supabase.ts).
    const q = shot.as === 'signedout' ? 'signedout' : `as=${shot.as}${shot.reminders ? '' : '&reminders=0'}`;
    await p.goto(`${BASE}/?${q}`);
    await wait(p, 300);
    try {
      await shot.go(p);
      await wait(p, 2000);
      await ring(p, shot.target(p), shot.label);
      await p.screenshot({ path: path.join(OUT, `${id}-${i + 1}.jpg`), type: 'jpeg', quality: 78 });
      process.stdout.write('.');
    } catch (e) {
      failures.push(`${id}-${i + 1}: ${e.message.split('\n')[0]}`);
      process.stdout.write('x');
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${failures.length ? failures.join('\n') : 'All shots taken.'}`);
