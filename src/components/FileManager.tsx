import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Download, Eye, PenTool } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// PDF Preview Dialog Component
const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

interface ClientFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size?: number;
  is_signed: boolean;
  created_at: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface FileManagerProps {
  clientId: string;
}

export const FileManager: React.FC<FileManagerProps> = ({ clientId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<ClientFile | null>(null);

  useEffect(() => {
    fetchFiles();
  }, [clientId]);

  const fetchFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('client_files')
        .select(`
          *,
          profiles:uploaded_by (
            first_name,
            last_name
          )
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setFiles(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching files",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);

    try {
      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        throw new Error('Profile not found');
      }

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${clientId}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      // Save file record to database
      const fileData = {
        client_id: clientId,
        uploaded_by: profile.id,
        file_name: file.name,
        file_path: uploadData.path,
        file_type: file.type,
        file_size: file.size,
      };

      const { error: dbError } = await supabase
        .from('client_files')
        .insert([fileData]);

      if (dbError) {
        throw dbError;
      }

      toast({
        title: "File Uploaded",
        description: "File has been uploaded successfully.",
      });

      fetchFiles();
    } catch (error: any) {
      toast({
        title: "Error uploading file",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: ClientFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('client-files')
        .download(file.file_path);

      if (error) {
        throw error;
      }

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Error downloading file",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePreview = async (file: ClientFile) => {
    if (file.file_type?.includes('pdf')) {
      setPreviewFile(file);
    } else {
      toast({
        title: "Preview unavailable",
        description: "Only PDF files can be previewed. Download the file to view it.",
      });
      handleDownload(file);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${kb.toFixed(1)} KB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Client files</h2>
        <div>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileUpload}
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          />
          <Button 
            onClick={() => document.getElementById('file-upload')?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading files...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file) => (
            <Card key={file.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-sm truncate">{file.file_name}</CardTitle>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>{formatFileSize(file.file_size)}</p>
                  <p>Uploaded: {new Date(file.created_at).toLocaleDateString()}</p>
                  {file.profiles && (
                    <p>by {file.profiles.first_name} {file.profiles.last_name}</p>
                  )}
                  {file.is_signed && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      <PenTool className="h-3 w-3" />
                      Signed
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(file)}
                    className="flex-1"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(file)}
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {files.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No files have been uploaded.
            </div>
          )}
        </div>
      )}

      {previewFile && (
        <PDFPreviewDialog 
          file={previewFile} 
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};