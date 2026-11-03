// The floating white bar across the top of a page: its title on the left,
// the page's own buttons and the help guide on the right. It stays in view
// while the page scrolls under it.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: React.ReactNode;
  /** The page's own buttons. */
  children?: React.ReactNode;
}

export const PageBar: React.FC<Props> = ({ title, children }) => {
  const navigate = useNavigate();
  return (
    <div className="sticky top-3 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-sm backdrop-blur md:px-6">
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-primary md:text-2xl">{title}</h1>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {children}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-primary"
          onClick={() => navigate('/onboarding')}
          title="Help guide"
          aria-label="Help guide"
        >
          <CircleHelp className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
