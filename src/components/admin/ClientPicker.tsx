import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { MatchClient } from '@/lib/bulkImport';

interface Props {
  clients: MatchClient[];
  value: string | null;
  onChange: (clientId: string) => void;
  className?: string;
}

/**
 * Choose a client by typing part of their name or member ID.
 *
 * A plain dropdown of 176 names is unusable when a review screen asks the
 * question 145 times in a row. Member ID is searchable too, because that is
 * what the document itself carries and what a reviewer is reading off it.
 */
export const ClientPicker: React.FC<Props> = ({ clients, value, onChange, className }) => {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => clients.find((c) => c.id === value), [clients, value]);
  const label = selected ? `${selected.last_name}, ${selected.first_name}` : 'Select a client';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`justify-between font-normal ${className ?? 'w-[200px]'}`}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Type a name or member ID" />
          <CommandList>
            <CommandEmpty>No client matches that.</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  // Searched against, so it carries everything worth typing.
                  value={`${c.last_name}, ${c.first_name} ${c.member_id ?? ''}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${c.id === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <span className="truncate">
                    {c.last_name}, {c.first_name}
                    {c.member_id && (
                      <span className="text-muted-foreground"> · {c.member_id}</span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
