// Walkthroughs: the Help panel's "Show me". Each step names the page to be on,
// the control to circle, and what to say. The person presses the real control;
// the walkthrough waits for that press, then moves on (src/components/help/Walkthrough.tsx).
//
// Targets are found in the page the way a person would find them: by a
// button's words or label, never by a hidden id, so a walkthrough keeps working
// while the page changes around it.

export interface WalkStep {
  /** What the bubble says. Short, one action. */
  say: string;
  /** Page to open first, when the step starts somewhere else. */
  route?: string;
  /** The control to circle; null while it is not on screen yet. */
  target: () => Element | null;
  /** 'click': moves on when the circled control is pressed. 'next': shows a Next button. */
  advance: 'click' | 'next';
}

export interface Walkthrough {
  id: string;
  title: string;
  /** Words people use for it, for matching a question without the assistant. */
  keywords: string[];
  steps: WalkStep[];
}

/** Help's own panel and the walkthrough bubble are never what a step points at. */
const ours = (el: Element) => !!el.closest('[data-help-ui]');

const visible = (el: Element) => {
  if (ours(el)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** The first visible element matching a selector whose words start with the text. */
export function byText(selector: string, text: string | RegExp, root: ParentNode = document): Element | null {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    const words = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const ok = typeof text === 'string' ? words === text || words.startsWith(`${text} `) || words.startsWith(text) : text.test(words);
    if (ok && visible(el)) return el;
  }
  return null;
}

/** The first visible element matching a selector. */
export function first(selector: string, root: ParentNode = document): Element | null {
  for (const el of Array.from(root.querySelectorAll(selector))) if (visible(el)) return el;
  return null;
}

/** The open dialog whose title starts with the text. */
const dialogTitled = (text: string | RegExp) => {
  for (const d of Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))) {
    const title = d.querySelector('h2, [id$="-title"]');
    const words = (title?.textContent ?? '').trim();
    if ((typeof text === 'string' ? words.startsWith(text) : text.test(words)) && visible(d)) return d;
  }
  return null;
};
/** The window on top: the last open one. */
const anyDialog = () => {
  const open = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
  return open[open.length - 1] ?? null;
};

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'start-intake',
    title: 'Start an intake',
    keywords: ['intake', 'start intake', 'new client call', 'called the client', 'reached'],
    steps: [
      {
        say: 'Press Start intake on the client’s card.',
        route: '/?view=clients',
        target: () => byText('button', 'Start intake'),
        advance: 'click',
      },
      {
        say: 'Fill in the Client Intake. It saves as you go.',
        target: () => dialogTitled('Client Intake') ?? anyDialog(),
        advance: 'next',
      },
    ],
  },
  {
    id: 'close-out-client',
    title: 'Close out a client',
    keywords: ['close out', 'stop calling', 'remove', 'no longer', 'x', 'not calling', 'close case', 'awaiting'],
    steps: [
      {
        say: 'Press the X on the client’s card.',
        route: '/?view=clients',
        target: () => first('[aria-label^="Close out "]'),
        advance: 'click',
      },
      {
        say: 'Choose why you are closing them out.',
        target: () => first('[role="alertdialog"] [role="radiogroup"]'),
        advance: 'click',
      },
      {
        say: 'Press Close out.',
        target: () => byText('[role="alertdialog"] button', 'Close out'),
        advance: 'click',
      },
    ],
  },
  {
    id: 'add-touchpoint',
    title: 'Add a touchpoint',
    keywords: ['touchpoint', 'visit', 'log a visit', 'phone call', 'contact'],
    steps: [
      {
        say: 'Press Add touchpoint.',
        route: '/?view=compliance',
        target: () => byText('button', 'Add touchpoint'),
        advance: 'click',
      },
      {
        say: 'Choose the client, the date and how you met, then save.',
        target: () => anyDialog(),
        advance: 'next',
      },
    ],
  },
  {
    id: 'clinical-note',
    title: 'Write a clinical note',
    keywords: ['note', 'clinical note', 'progress note', 'write a note', 'generate'],
    steps: [
      {
        say: 'Open the client by pressing their row.',
        route: '/?view=clients',
        target: () => first('[aria-label^="Open "][role="button"]'),
        advance: 'click',
      },
      {
        say: 'Press the Touchpoints tab.',
        target: () => byText('[role="tab"]', 'Touchpoints'),
        advance: 'click',
      },
      {
        say: 'Press Clinical note.',
        target: () => byText('button', 'Clinical note'),
        advance: 'click',
      },
      {
        say: 'Answer each question, then press Generate note.',
        target: () => anyDialog(),
        advance: 'next',
      },
    ],
  },
  {
    id: 'upload-document',
    title: 'Upload a document',
    keywords: ['upload', 'document', 'file', 'scan', 'pdf', 'attach'],
    steps: [
      {
        say: 'Open the client by pressing their row.',
        route: '/?view=clients',
        target: () => first('[aria-label^="Open "][role="button"]'),
        advance: 'click',
      },
      {
        say: 'Press Upload documents.',
        target: () => byText('button', 'Upload documents'),
        advance: 'click',
      },
      {
        say: 'Drop the files here or choose them.',
        target: () => anyDialog(),
        advance: 'next',
      },
    ],
  },
];

export const walkthroughById = (id: string | null | undefined) => WALKTHROUGHS.find((w) => w.id === id) ?? null;

/** Best walkthrough for a question by its words, when the assistant is not available. */
export function matchByWords(question: string): Walkthrough | null {
  const q = ` ${question.toLowerCase()} `;
  let best: Walkthrough | null = null;
  let score = 0;
  for (const w of WALKTHROUGHS) {
    let s = 0;
    for (const k of [w.title.toLowerCase(), ...w.keywords]) if (q.includes(k.length <= 2 ? ` ${k} ` : k)) s += k.length;
    if (s > score) {
      score = s;
      best = w;
    }
  }
  return best;
}
