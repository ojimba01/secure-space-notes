// Asking the Help assistant (supabase/functions/help-assistant). When it is not
// switched on or does not answer, the question is matched to a walkthrough by
// its words instead, so Help always answers.
import { supabase } from '@/integrations/supabase/client';
import { WALKTHROUGHS, matchByWords, walkthroughById, type Walkthrough } from '@/lib/help/walkthroughs';

export interface HelpAnswer {
  text: string;
  walkthrough: Walkthrough | null;
}

export async function askHelp(question: string): Promise<HelpAnswer> {
  const tasks = WALKTHROUGHS.map((w) => ({ id: w.id, title: w.title, steps: w.steps.map((s) => s.say) }));
  try {
    const { data, error } = await supabase.functions.invoke('help-assistant', { body: { question, tasks } });
    if (!error && data?.answer) {
      return { text: String(data.answer), walkthrough: walkthroughById(data.walkthrough) };
    }
  } catch {
    // Falls through to matching by words.
  }
  const w = matchByWords(question);
  return w
    ? { text: `I can show you how to ${w.title.toLowerCase()}. It takes ${w.steps.length} steps.`, walkthrough: w }
    : { text: 'I can’t show that one yet. Pick a task below, or contact support.', walkthrough: null };
}
