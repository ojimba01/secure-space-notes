// Backlog: one note per 30-day cycle of an authorization, written after the fact.
//
// Cycles roll every 30 days from the 150-day start date: five cycles for the
// 150 days, a sixth when the 180-day extension is included. A cycle's note is
// dated the cycle's first day.

export const CYCLE_DAYS = 30;

export interface BacklogCycle {
  /** 1-based. */
  n: number;
  /** yyyy-mm-dd, the first day and the note date. */
  start: string;
  /** yyyy-mm-dd, the last day. */
  end: string;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function backlogCycles(start: string, withExtension: boolean): BacklogCycle[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const count = withExtension ? 6 : 5;
  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    start: addDays(start, i * CYCLE_DAYS),
    end: addDays(start, (i + 1) * CYCLE_DAYS - 1),
  }));
}
