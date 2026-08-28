import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { BulkDocumentImport } from '@/components/admin/BulkDocumentImport';
import { ImportHistory } from '@/components/admin/ImportHistory';
import { TemplateRegistry } from '@/components/admin/TemplateRegistry';
import { TouchpointSettings } from '@/components/admin/TouchpointSettings';

/**
 * Operational utilities for Admin/Superadmin only. Staff never reach this
 * route — the router guards it and the sidebar entry is hidden for them.
 */
const AdvancedToolsPage: React.FC = () => {
  const navigate = useNavigate();
  const [importsKey, setImportsKey] = useState(0);

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

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">Bulk document import</TabsTrigger>
          <TabsTrigger value="history">Import history</TabsTrigger>
          <TabsTrigger value="templates">Template management</TabsTrigger>
          <TabsTrigger value="touchpoints">Touchpoint settings</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="pt-4">
          <BulkDocumentImport onImported={() => setImportsKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <ImportHistory refreshKey={importsKey} />
        </TabsContent>

        <TabsContent value="templates" className="pt-4">
          <TemplateRegistry />
        </TabsContent>

        <TabsContent value="touchpoints" className="pt-4">
          <TouchpointSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedToolsPage;
