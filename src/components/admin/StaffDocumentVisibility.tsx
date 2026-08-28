import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { DOCUMENT_TYPES } from '@/lib/documentRecognition';
import { loadHiddenFormTypes, setHiddenFormTypes } from '@/lib/documentVisibility';

/**
 * Which document types a case manager cannot see on their own clients.
 *
 * Ticking a type here hides it in the database, not just on the screen — the
 * row and the file both become unreadable to anyone who is not an admin. That
 * is the point: a rule enforced only in a component is not a rule.
 */
export const StaffDocumentVisibility: React.FC = () => {
  const { toast } = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    loadHiddenFormTypes()
      .then((types) => {
        if (!live) return;
        setHidden(new Set(types));
        setSaved(new Set(types));
      })
      .catch((err: Error) =>
        toast({ title: 'Could not read the hidden types', description: err.message, variant: 'destructive' }),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [toast]);

  const dirty = useMemo(() => {
    if (hidden.size !== saved.size) return true;
    for (const t of hidden) if (!saved.has(t)) return true;
    return false;
  }, [hidden, saved]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return DOCUMENT_TYPES.filter((t) => !q || t.toLowerCase().includes(q));
  }, [filter]);

  const toggle = (type: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await setHiddenFormTypes([...hidden]);
      setSaved(new Set(hidden));
      toast({
        title: hidden.size
          ? `${hidden.size} type${hidden.size === 1 ? '' : 's'} hidden from staff`
          : 'Staff can see every document type',
      });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What staff can see on their own clients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A case manager sees the documents on the clients assigned to them, whoever filed
          them. Tick a type here to keep it out of their view. Administrators always see
          everything, and staff always see a document they filed themselves.
        </p>

        <Input
          placeholder="Find a document type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {shown.map((type) => (
              <label key={type} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={hidden.has(type)}
                  onCheckedChange={() => toggle(type)}
                  className="mt-0.5"
                />
                <span>{type}</span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="text-sm text-muted-foreground">No document type matches that.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {hidden.size === 0
              ? 'Nothing is hidden.'
              : `${hidden.size} of ${DOCUMENT_TYPES.length} types hidden.`}
            {dirty && ' Not saved yet.'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
