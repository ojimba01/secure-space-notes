import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, ScanText, History, Layers, List, Settings2 } from 'lucide-react';
import { PageShell } from '@/components/PageShell';

const TOOLS = [
  ['import', 'Bulk document import', Upload],
  ['clientfields', 'Client details from documents', FileText],
  ['reading', 'Reading documents', ScanText],
  ['history', 'Import history', History],
  ['templates', 'Template management', Layers],
  ['allforms', 'Every form filed', List],
  ['touchpoints', 'Touchpoint settings', Settings2],
] as const;
import { BulkDocumentImport } from '@/components/admin/BulkDocumentImport';
import { ImportHistory } from '@/components/admin/ImportHistory';
import { TemplateRegistry } from '@/components/admin/TemplateRegistry';
import { TouchpointSettings } from '@/components/admin/TouchpointSettings';
import { DocumentReading } from '@/components/admin/DocumentReading';
import { ClientFieldImport } from '@/components/admin/ClientFieldImport';
import { FormsHub } from '@/components/forms/FormsHub';

/**
 * Operational utilities for Admin/Superadmin only. Staff never reach this
 * route — the router guards it and the sidebar entry is hidden for them.
 */
const TABS = ['import', 'clientfields', 'reading', 'history', 'templates', 'touchpoints'] as const;

const AdvancedToolsPage: React.FC = () => {
  const [importsKey, setImportsKey] = useState(0);
  // The sidebar names a specific tool, so it opens on that tool rather than
  // landing everyone on Bulk document import and leaving them to find it.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.includes(requested as (typeof TABS)[number]) ? requested! : 'import';

  return (
    <PageShell>
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 md:px-9 md:py-8">
      <h1 className="animate-rise text-2xl md:text-[32px] font-semibold tracking-tight text-foreground">Advanced Tools</h1>

      <Tabs
        value={tab}
        onValueChange={(v) => setParams({ tab: v }, { replace: true })}
        orientation="vertical"
        className="flex flex-col gap-6 lg:flex-row lg:items-start"
      >
        {/* The tools down the left on a wide screen, scrolling across on a narrow one. */}
        <TabsList className="h-auto w-full shrink-0 justify-start gap-0.5 overflow-x-auto bg-transparent p-0 lg:sticky lg:top-6 lg:w-[250px] lg:flex-col lg:items-stretch">
          {TOOLS.map(([value, label, Icon]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="group justify-start gap-2.5 rounded-lg px-3 py-2.5 text-sm font-normal text-foreground/75 hover:bg-muted hover:text-foreground data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon className="wiggle-on-hover h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1">

        <TabsContent value="import" className="mt-0">
          <BulkDocumentImport onImported={() => setImportsKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="clientfields" className="mt-0">
          <ClientFieldImport />
        </TabsContent>

        <TabsContent value="reading" className="mt-0">
          <DocumentReading />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <ImportHistory refreshKey={importsKey} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplateRegistry />
        </TabsContent>

        <TabsContent value="allforms" className="mt-0">
          <FormsHub view="archive" />
        </TabsContent>

        <TabsContent value="touchpoints" className="mt-0">
          <TouchpointSettings />
        </TabsContent>
        </div>
      </Tabs>
    </div>
    </PageShell>
  );
};

export default AdvancedToolsPage;
