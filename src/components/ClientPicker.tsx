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

/** Everything this needs. Any client-shaped row satisfies it. */
export interface PickableClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  member_id?: string | null;
}

interface Props {
  clients: PickableClient[];
  value: string | null;
  onChange: (clientId: string) => void;
  className?: string;
}

/**
 * Choose a client by typing part of their name or member ID.
 *
 * A plain dropdown of 176 names is unusable, whether a review screen asks the
 * question 145 times in a row or somebody is filling in one form. Member ID is
 * searchable too, because that is what a document carries and what the person
 * reading it off has in front of them.
 *
 * Names read and sort first name first. Staff know their clients by first
 * name, and a list sorted one way while displayed the other is unsearchable by
 * eye.
 */
export const ClientPicker: React.FC<Props> = ({ clients, value, onChange, className }) => {
  const [open, setOpen] = useState(false);

  const ordered = useMemo(
    () =>
      [...clients].sort((a, b) =>
        `${a.first_name ?? ''} ${a.last_name ?? ''}`.localeCompare(
          `${b.first_name ?? ''} ${b.last_name ?? ''}`,
        ),
      ),
    [clients],
  );
  const selected = useMemo(() => clients.find((c) => c.id === value), [clients, value]);
  const label = selected
    ? `${selected.first_name ?? ''} ${selected.last_name ?? ''}`.trim()
    : 'Select a client';

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
              {ordered.map((c) => (
                <CommandItem
                  key={c.id}
                  // Searched against, so it carries everything worth typing.
                  value={`${c.first_name ?? ''} ${c.last_name ?? ''} ${c.member_id ?? ''}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${c.id === value ? 'opacity-100' : 'opacity-0'}`}
                  />
                  <span className="truncate">
                    {c.first_name} {c.last_name}
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
