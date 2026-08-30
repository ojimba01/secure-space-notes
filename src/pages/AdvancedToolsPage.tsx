import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { BulkDocumentImport } from '@/components/admin/BulkDocumentImport';
import { ImportHistory } from '@/components/admin/ImportHistory';
import { TemplateRegistry } from '@/components/admin/TemplateRegistry';
import { TouchpointSettings } from '@/components/admin/TouchpointSettings';
import { DocumentReading } from '@/components/admin/DocumentReading';
import { ClientFieldImport } from '@/components/admin/ClientFieldImport';
import { StaffDocumentVisibility } from '@/components/admin/StaffDocumentVisibility';
import { FormsHub } from '@/components/forms/FormsHub';

/**
 * Operational utilities for Admin/Superadmin only. Staff never reach this
 * route — the router guards it and the sidebar entry is hidden for them.
 */
const TABS = ['import', 'clientfields', 'reading', 'history', 'templates', 'touchpoints'] as const;

const AdvancedToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [importsKey, setImportsKey] = useState(0);
  // The sidebar names a specific tool, so it opens on that tool rather than
  // landing everyone on Bulk document import and leaving them to find it.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.includes(requested as (typeof TABS)[number]) ? requested! : 'import';

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Advanced Tools</h1>
        <p className="text-sm text-muted-foreground">
          Data migration, template administration and the settings that decide how touchpoints are
          chased. Client documents are uploaded here, inside the app's secure storage — never
          through an outside chat or shared drive.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="import">Bulk document import</TabsTrigger>
          <TabsTrigger value="clientfields">Client details from documents</TabsTrigger>
          <TabsTrigger value="reading">Reading documents</TabsTrigger>
          <TabsTrigger value="history">Import history</TabsTrigger>
          <TabsTrigger value="templates">Template management</TabsTrigger>
          <TabsTrigger value="allforms">Every form filed</TabsTrigger>
          <TabsTrigger value="visibility">Document visibility</TabsTrigger>
          <TabsTrigger value="touchpoints">Touchpoint settings</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="pt-4">
          <BulkDocumentImport onImported={() => setImportsKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="clientfields" className="pt-4">
          <ClientFieldImport />
        </TabsContent>

        <TabsContent value="reading" className="pt-4">
          <DocumentReading />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <ImportHistory refreshKey={importsKey} />
        </TabsContent>

        <TabsContent value="templates" className="pt-4">
          <TemplateRegistry />
        </TabsContent>

        <TabsContent value="allforms" className="pt-4">
          <FormsHub view="archive" />
        </TabsContent>

        <TabsContent value="visibility" className="pt-4">
          <StaffDocumentVisibility />
        </TabsContent>

        <TabsContent value="touchpoints" className="pt-4">
          <TouchpointSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedToolsPage;
