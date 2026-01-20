import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Plus, Calendar, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { NoteEditor } from '@/components/NoteEditor';
import { noteSchema } from '@/lib/validationSchemas';
import { z } from 'zod';

type NoteFormData = z.infer<typeof noteSchema>;

interface ClientNote {
  id: string;
  title: string;
  content?: string;
  visit_date: string;
  created_at: string;
  employee_id: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface NotesSectionProps {
  clientId: string;
}

export const NotesSection: React.FC<NotesSectionProps> = ({ clientId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<ClientNote | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      title: '',
      content: '',
      visit_date: new Date().toISOString().slice(0, 16),
    },
  });

  useEffect(() => {
    fetchNotes();
  }, [clientId]);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('client_notes')
        .select(`
          *,
          profiles:employee_id (
            first_name,
            last_name
          )
        `)
        .eq('client_id', clientId)
        .order('visit_date', { ascending: false });

      if (error) {
        throw error;
      }

      setNotes(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching notes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (data: NoteFormData) => {
    setIsSubmitting(true);
    
    try {
      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const noteData = {
        client_id: clientId,
        employee_id: profile?.id,
        title: data.title,
        content: data.content || '',
        visit_date: data.visit_date || new Date().toISOString(),
      };

      const { error } = await supabase
        .from('client_notes')
        .insert([noteData]);

      if (error) {
        throw error;
      }

      toast({
        title: "Note Added",
        description: "Client note has been added successfully.",
      });

      fetchNotes();
      setShowAddDialog(false);
      form.reset({
        title: '',
        content: '',
        visit_date: new Date().toISOString().slice(0, 16),
      });
    } catch (error: any) {
      toast({
        title: "Error adding note",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedNote) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setSelectedNote(null)}>
            ← Back to Notes
          </Button>
          <h2 className="text-xl font-semibold">{selectedNote.title}</h2>
        </div>
        <NoteEditor 
          initialContent={selectedNote.content || ''} 
          readOnly={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Client Notes</h2>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Client Note</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAddNote)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={200} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="visit_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visit Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local" 
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} maxLength={10000} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Note'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading notes...</div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{note.title}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedNote(note)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(note.visit_date).toLocaleDateString()}
                  </div>
                  {note.profiles && (
                    <span>
                      by {note.profiles.first_name} {note.profiles.last_name}
                    </span>
                  )}
                </div>
              </CardHeader>
              {note.content && (
                <CardContent>
                  <p className="text-sm line-clamp-3">{note.content}</p>
                </CardContent>
              )}
            </Card>
          ))}
          {notes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No notes found. Add your first note to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
};