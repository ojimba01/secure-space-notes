// Help guide: step-by-step instructions for each task, with a screenshot of
// every step and the thing to select ringed in red.
//
// The guides and their text live in src/lib/helpGuides.ts; the screenshots are
// taken from the real app over made-up data by scripts/help-screenshots.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, LifeBuoy, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { GUIDES, SECTIONS, shotFor, type Guide } from '@/lib/helpGuides';
import { PageShell } from '@/components/PageShell';

type Filter = 'all' | 'everyone' | 'admins';

export default function HelpGuide() {
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const { isSuperadmin } = useIsSuperadmin();
  const admin = isAdmin;
  // Superadmins can switch between the case manager and admin guides, to see
  // what each group sees.
  const canFilter = isSuperadmin && !isViewingAs;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Case managers see the guides for their own work; admins also see the admin
  // guides. Listed in section order, so Getting started comes last.
  const available = useMemo(
    () =>
      GUIDES.filter((g) => admin || g.audience === 'everyone').sort(
        (a, b) => SECTIONS.indexOf(a.section as (typeof SECTIONS)[number]) - SECTIONS.indexOf(b.section as (typeof SECTIONS)[number]),
      ),
    [admin],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter(
      (g) =>
        (!canFilter || filter === 'all' || g.audience === filter) &&
        (!q || `${g.title} ${g.section} ${g.steps.map((s) => `${s.title} ${s.text}`).join(' ')}`.toLowerCase().includes(q)),
    );
  }, [available, canFilter, filter, query]);

  const current: Guide = available.find((g) => g.id === params.get('guide')) ?? available[0];
  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('guide', id);
    setParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const index = available.indexOf(current);
  const nextGuide = available[index + 1];

  return (
    <PageShell>
      <div className="mx-auto max-w-[1200px] space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">Help guide</h1>
              <p className="text-sm text-muted-foreground">Step-by-step instructions for your work in Clinical Notes.</p>
            </div>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="bg-white pl-9"
              placeholder="Search guides"
              aria-label="Search guides"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {canFilter && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show guides for">
            {([
              ['all', 'All guides'],
              ['everyone', 'Case managers'],
              ['admins', 'Admins'],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                className="rounded-full"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <Card className="overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            {SECTIONS.map((section) => {
              const guides = shown.filter((g) => g.section === section);
              if (!guides.length) return null;
              return (
                <div key={section} className="border-t first:border-t-0">
                  <h2 className="px-4 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section}
                  </h2>
                  {guides.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => open(g.id)}
                      aria-current={g.id === current?.id}
                      className={`flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50 ${
                        g.id === current?.id ? 'bg-primary/10 font-semibold text-primary' : ''
                      }`}
                    >
                      <span className="flex-1">{g.title}</span>
                      {g.audience === 'admins' && (
                        <span className="rounded border px-1.5 text-[11px] font-semibold text-muted-foreground">Admin</span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
            {shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No guides match.</p>}
          </Card>

          {current && (
            <Card className="min-w-0">
              <header className="space-y-1.5 border-b px-5 py-5 md:px-6">
                <p className="text-sm text-muted-foreground">{current.section}</p>
                <h2 className="text-2xl font-bold">{current.title}</h2>
                <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{current.audience === 'admins' ? 'For admins' : 'For everyone'}</span>
                  <span>{current.steps.length} steps</span>
                  <span>About {current.minutes} minute{current.minutes === 1 ? '' : 's'}</span>
                </p>
              </header>

              <ol className="divide-y px-5 md:px-6">
                {current.steps.map((step, i) => (
                  <li key={i} className="space-y-3 py-5">
                    <div className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="font-semibold">{step.title}</h3>
                        <p className="text-sm text-muted-foreground">{step.text}</p>
                      </div>
                    </div>
                    <img
                      src={shotFor(current, i)}
                      alt={`${step.title}: ${step.text}`}
                      loading="lazy"
                      className="w-full max-w-[860px] rounded-lg border shadow-sm md:ml-10 md:w-[calc(100%-2.5rem)]"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                  </li>
                ))}
              </ol>

              <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t bg-muted/40 px-5 py-4 md:px-6">
                <span className="text-sm text-muted-foreground">Still need help?</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => window.dispatchEvent(new Event('open-support'))}>
                    <LifeBuoy className="mr-1.5 h-4 w-4" />
                    Contact support
                  </Button>
                  {nextGuide && (
                    <Button onClick={() => open(nextGuide.id)}>
                      Next: {nextGuide.title}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </footer>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
