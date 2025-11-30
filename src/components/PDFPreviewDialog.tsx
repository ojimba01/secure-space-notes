import React, { useState, useEffect, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PDFPreview } from '@/components/PDFPreview';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ClientFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
}

interface PDFPreviewDialogProps {
  file: ClientFile;
  onClose: () => void;
  onDownload: (file: ClientFile) => void;
}

const PDFPreviewDialog: React.FC<PDFPreviewDialogProps> = ({ file, onClose, onDownload }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const getSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('client-files')
          .createSignedUrl(file.file_path, 3600);

        if (error) throw error;
        
        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error getting signed URL:', err);
        setError(true);
      }
    };

    getSignedUrl();
  }, [file]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh]">
        <DialogHeader>
          <DialogTitle>{file.file_name}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="text-center text-destructive p-4 space-y-4">
              <p>Failed to load PDF. Please try downloading instead.</p>
              <Button onClick={() => onDownload(file)}>
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          ) : !signedUrl ? (
            <div className="text-center p-4">Loading PDF...</div>
          ) : (
            <Suspense fallback={<div className="text-center p-4">Loading PDF viewer...</div>}>
              <PDFPreview fileUrl={signedUrl} fileName={file.file_name} />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PDFPreviewDialog;