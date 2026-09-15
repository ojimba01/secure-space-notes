// A form field that grows while you write in it.
//
// pdf.js renders a multi-line PDF field as a <textarea> sized to the box drawn
// on the page. That box is whatever the printed form allows, which is often
// less than someone has to say about a member's diagnoses — so past the last
// visible line the answer scrolls out of sight while it is being typed.
//
// While a box is focused it is allowed to grow past the page instead: tall
// enough for everything in it, laid over the rest of the form, with an opaque
// background so it stays readable. Blurring puts it back to the size the PDF
// draws, which is the size it is saved at. Nothing here changes the answer —
// only how much of it you can see at once.

/** Breathing room under the last line, in CSS pixels. */
const SLACK = 6;

const GROWN_CLASS = 'pdf-field-grown';

/**
 * Over every field on the page. pdf.js stacks the fields by giving each one a
 * rising z-index of its own, inline — which no stylesheet can outrank — so a
 * box that has grown over its neighbours has to be lifted the same way, or the
 * questions below it draw straight through the answer.
 */
const GROWN_Z_INDEX = '100000';

/**
 * Let every multi-line field inside `root` grow to its content while focused.
 * Safe to call again on the same element — already-wired boxes are skipped —
 * so it can hang off each annotation layer render.
 */
export function wireAutoGrowFields(root: HTMLElement | null | undefined): void {
  if (!root) return;

  for (const area of root.querySelectorAll<HTMLTextAreaElement>('.annotationLayer textarea')) {
    if (area.dataset.autoGrow) continue;
    area.dataset.autoGrow = 'on';

    // pdf.js sizes the <section> wrapper and stretches the textarea to it, so
    // the wrapper is what has to grow. Its own height is a calc() in page
    // units, which is also what a zoom re-render recomputes — keep the string
    // and put it back verbatim rather than trying to recompute it.
    const box = area.closest<HTMLElement>('section');
    if (!box) continue;
    const drawnHeight = box.style.height;
    const drawnZIndex = box.style.zIndex;

    const shrink = () => {
      box.style.height = drawnHeight;
      box.style.zIndex = drawnZIndex;
      box.classList.remove(GROWN_CLASS);
    };

    const fit = () => {
      if (document.activeElement !== area) return;
      // Measure against the drawn size, so the box tracks the text down again
      // when it is deleted rather than only ever growing.
      shrink();
      const overflow = area.scrollHeight - area.clientHeight;
      if (overflow <= 0) return;
      box.style.height = `${box.getBoundingClientRect().height + overflow + SLACK}px`;
      box.style.zIndex = GROWN_Z_INDEX;
      box.classList.add(GROWN_CLASS);
    };

    area.addEventListener('focus', fit);
    area.addEventListener('input', fit);
    area.addEventListener('blur', shrink);
  }
}
