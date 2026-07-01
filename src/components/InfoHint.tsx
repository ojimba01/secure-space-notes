import React from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Props {
  text?: string;
  items?: string[];
  className?: string;
}

// Render a small subset of markdown: **bold** segments.
const renderRich = (s: string, keyPrefix: string): React.ReactNode[] =>
  s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>,
  );

const HintBody: React.FC<{ text?: string; items?: string[] }> = ({ text, items }) => (
  <>
    {text && <div>{renderRich(text, 'text')}</div>}
    {items && items.length > 0 && (
      <ul className="list-disc pl-4 space-y-1 mt-1">
        {items.map((it, i) => <li key={i}>{renderRich(it, `item-${i}`)}</li>)}
      </ul>
    )}
  </>
);

// Hover tooltip on desktop, tap-to-reveal popover on touch screens.
export const InfoHint: React.FC<Props> = ({ text, items, className }) => {
  if (!text && (!items || items.length === 0)) return null;
  return (
    <span className={className}>
      {/* desktop: hover */}
      <span className="hidden md:inline-block align-middle">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="More info">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed"><HintBody text={text} items={items} /></TooltipContent>
        </Tooltip>
      </span>
      {/* touch: tap */}
      <span className="inline-block md:hidden align-middle">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="text-muted-foreground" aria-label="More info">
              <Info className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-w-xs text-xs leading-relaxed"><HintBody text={text} items={items} /></PopoverContent>
        </Popover>
      </span>
    </span>
  );
};
