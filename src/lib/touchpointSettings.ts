// The "start today" floor for touchpoint work.
//
// Cycles are anchored to each client's HSP approval / authorization start date,
// so switching the app on mid-cycle would otherwise hand staff a queue full of
// touchpoints they never had a chance to make. The go-live date is the floor:
// nothing that closed before it drives staff urgency.
//
// The stored value is either an explicit YYYY-MM-DD chosen by an admin, or null.
// Null means "the day the agency installed this" — read from the setting row's
// own updated_at, so the floor stays put instead of sliding with the calendar.
import { supabase } from '@/integrations/supabase/client';
import { todayAgency } from '@/lib/compliance';

export const GO_LIVE_KEY = 'touchpoint_go_live_date';
export const SHOW_HISTORICAL_KEY = 'show_historical_touchpoints';

export interface TouchpointSettings {
  /** YYYY-MM-DD. Cycles that began before this are reference-only. */
  goLiveDate: string;
  /** True when an admin has deliberately chosen the date above. */
  goLiveIsExplicit: boolean;
  /** Admin opt-in to listing cycles that closed before go-live. */
  showHistorical: boolean;
}

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

let cached: TouchpointSettings | null = null;
let inFlight: Promise<TouchpointSettings> | null = null;

async function fetchSettings(): Promise<TouchpointSettings> {
  const fallback: TouchpointSettings = {
    goLiveDate: todayAgency(),
    goLiveIsExplicit: false,
    showHistorical: false,
  };

  const { data, error } = await supabase
    .from('compliance_settings')
    .select('key, value, updated_at')
    .in('key', [GO_LIVE_KEY, SHOW_HISTORICAL_KEY]);

  if (error || !data) return fallback;

  const goLiveRow = data.find((r) => r.key === GO_LIVE_KEY);
  const historicalRow = data.find((r) => r.key === SHOW_HISTORICAL_KEY);

  let goLiveDate = fallback.goLiveDate;
  let goLiveIsExplicit = false;
  if (goLiveRow) {
    if (isDate(goLiveRow.value)) {
      goLiveDate = goLiveRow.value;
      goLiveIsExplicit = true;
    } else if (goLiveRow.updated_at) {
      // Null value: the floor is the day this setting first landed.
      goLiveDate = goLiveRow.updated_at.slice(0, 10);
    }
  }

  return {
    goLiveDate,
    goLiveIsExplicit,
    showHistorical: historicalRow?.value === true,
  };
}

/** Cached for the page session — the value changes about once, at setup. */
export async function loadTouchpointSettings(): Promise<TouchpointSettings> {
  if (cached) return cached;
  inFlight ||= fetchSettings().then((s) => {
    cached = s;
    inFlight = null;
    return s;
  });
  return inFlight;
}

/** The go-live date alone, for callers that only need the floor. */
export async function goLiveDate(): Promise<string> {
  return (await loadTouchpointSettings()).goLiveDate;
}

/** Admin-only. Pass null to fall back to the install date. */
export async function setGoLiveDate(date: string | null): Promise<void> {
  await supabase
    .from('compliance_settings')
    .update({ value: (date ?? null) as never })
    .eq('key', GO_LIVE_KEY);
  cached = null;
}

/** Admin-only. */
export async function setShowHistorical(show: boolean): Promise<void> {
  await supabase
    .from('compliance_settings')
    .update({ value: show as never })
    .eq('key', SHOW_HISTORICAL_KEY);
  cached = null;
}

export function clearTouchpointSettingsCache(): void {
  cached = null;
  inFlight = null;
}
