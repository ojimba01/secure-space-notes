import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, History } from 'lucide-react';
import { fetchFormVersions, VERSION_TYPE_LABEL, type FormVersion } from '@/lib/formVersions';
import { formDownloadName } from '@/lib/formAutofill';

interface Props {
  clientFormId: string;
  formType: string;
  clientFirstName?: string;
  clientLastName?: string;
}

/**
 * Every file this form has ever pointed at, newest first. Prior versions stay
 * downloadable forever — sent-to-MCO snapshots included.
 */
export const FormVersionHistory: React.FC<Props> = ({
  clientFormId,
  formType,
  clientFirstName,
  clientLastName,
}) => {
  const { toast } = useToast();
  const [versions, setVersions] = useState<FormVersion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setVersions(await fetchFormVersions(clientFormId));
      } catch (err: any) {
        toast({
          title: 'Could not load version history',
          description: err.message,
          variant: 'destructive',
        });
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFormId]);

  const download = async (v: FormVersion) => {
    try {
      const { data, error } = await supabase.storage.from('client-files').download(v.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = formDownloadName(clientFirstName, clientLastName, formType, v.created_at);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  if (!loaded || versions.length === 0) return null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        Version history
      </div>
      <div className="space-y-1">
        {versions.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium shrink-0">v{v.version_number}</span>
              <Badge variant="secondary" className="shrink-0">
                {VERSION_TYPE_LABEL[v.version_type] ?? v.version_type}
              </Badge>
              <span className="text-muted-foreground truncate">
                {new Date(v.created_at).toLocaleString()}
                {v.source_filename ? ` — ${v.source_filename}` : ''}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => download(v)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};
