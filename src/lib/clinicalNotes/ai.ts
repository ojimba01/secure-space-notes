// Optional AI wording for clinical notes (supabase/functions/clinical-note-wording).
//
// The note is always written from the selections first. When AI wording is
// switched on, Claude rewords that draft; anything that fails, is declined, or
// adds a detail that was not selected falls back to the draft as written.
import { supabase } from '@/integrations/supabase/client';

let availability: Promise<boolean> | null = null;

/** Whether AI wording is switched on (the ANTHROPIC_API_KEY secret is set). Asked once. */
export function aiWordingAvailable(): Promise<boolean> {
  availability ??= supabase.functions
    .invoke('clinical-note-wording', { body: { probe: true } })
    .then(({ data, error }) => !error && data?.available === true)
    .catch(() => false);
  return availability;
}

export interface AiWording {
  note: string;
  model: string;
}

/** Reworded note, or null to keep the draft wording. */
export async function rewordWithAi(draft: string, facts: string[], previous?: string): Promise<AiWording | null> {
  try {
    const { data, error } = await supabase.functions.invoke('clinical-note-wording', {
      body: { draft, facts, previous },
    });
    if (error || !data?.note) return null;
    return { note: String(data.note), model: String(data.model ?? 'claude') };
  } catch {
    return null;
  }
}
