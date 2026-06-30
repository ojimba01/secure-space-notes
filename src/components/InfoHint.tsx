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
  className?: string;
}

// Hover tooltip on desktop, tap-to-reveal popover on touch screens.
export const InfoHint: React.FC<Props> = ({ text, className }) => {
  if (!text) return null;
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
          <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
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
          <PopoverContent className="max-w-xs text-xs leading-relaxed">{text}</PopoverContent>
        </Popover>
      </span>
    </span>
  );
};
