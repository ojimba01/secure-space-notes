import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useViewAs } from '@/components/ViewAsProvider';
import { noteSchema } from '@/lib/validationSchemas';
import { z } from 'zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type NoteFormData = z.infer<typeof noteSchema>;

interface HubNote {
  id: string;
  title: string;
  content: string | null;
  visit_date: string | null;
  created_at: string | null;
  client_id: string;
  employee_id: string;
  profiles?: { first_name: string; last_name: string } | null;
}

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  member_id: string | null;
}

interface ClientGroup {
  client: ClientRow;
  notes: HubNote[];
}

interface NotesHubProps {
  selectedNoteId?: string | null;
  onClearSelected?: () => void;
}

export const NotesHub: React.FC<NotesHubProps> = ({ selectedNoteId, onClearSelected }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isViewingAs, viewAsEmployeeId, guardWrite } = useViewAs();
  const [notes, setNotes] = useState<HubNote[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedNote, setSelectedNote] = useState<HubNote | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: { title: '', content: '', visit_date: new Date().toISOString().slice(0, 16) },
  });
  const [addClientId, setAddClientId] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [isViewingAs, viewAsEmployeeId]);

  useEffect(() => {
    if (selectedNoteId && notes.length > 0) {
      const note = notes.find((n) => n.id === selectedNoteId);
      if (note) {
        setSelectedNote(note);
        onClearSelected?.();
      }
    }
  }, [selectedNoteId, notes]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [notesRes, clientsRes] = await Promise.all([
        supabase
          .from('client_notes')
          .select(`*, profiles:employee_id (first_name, last_name)`)
          .order('visit_date', { ascending: false }),
        supabase
          .from('clients')
          .select('id, first_name, last_name, member_id')
          .order('last_name', { ascending: true }),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (clientsRes.error) throw clientsRes.error;

      let notesData = (notesRes.data as HubNote[]) || [];
      let clientsData = (clientsRes.data as ClientRow[]) || [];
      if (isViewingAs && viewAsEmployeeId) {
        notesData = notesData.filter((n) => n.employee_id === viewAsEmployeeId);
      }
      setNotes(notesData);
      setClients(clientsData);
    } catch (error: any) {
      toast({ title: 'Error loading notes', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const groups: ClientGroup[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byClient = new Map<string, HubNote[]>();
    for (const note of notes) {
      const arr = byClient.get(note.client_id) || [];
      arr.push(note);
      byClient.set(note.client_id, arr);
    }

    const result: ClientGroup[] = [];
    for (const client of clients) {
      const clientNotes = byClient.get(client.id) || [];
      if (clientNotes.length === 0) continue;

      if (term) {
        const clientMatch =
          `${client.first_name} ${client.last_name}`.toLowerCase().includes(term) ||
          (client.member_id || '').toLowerCase().includes(term);
        const matchingNotes = clientNotes.filter(
          (n) =>
            n.title.toLowerCase().includes(term) ||
            (n.content || '').toLowerCase().includes(term)
        );
        if (clientMatch) {
          result.push({ client, notes: clientNotes });
        } else if (matchingNotes.length > 0) {
          result.push({ client, notes: matchingNotes });
        }
      } else {
        result.push({ client, notes: clientNotes });
      }
    }
    return result;
  }, [notes, clients, search]);

  const toggle = (clientId: string) =>
    setExpanded((prev) => ({ ...prev, [clientId]: !prev[clientId] }));

  const handleAddNote = async (data: NoteFormData) => {
    if (guardWrite()) return;
    if (!addClientId) {
      toast({ title: 'Select a client', description: 'Please choose a client for this note.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const { error } = await supabase.from('client_notes').insert([
        {
          client_id: addClientId,
          employee_id: profile?.id,
          title: data.title,
          content: data.content || '',
          visit_date: data.visit_date || new Date().toISOString(),
        },
      ]);
      if (error) throw error;

      toast({ title: 'Note added', description: 'The note has been created.' });
      setShowAddDialog(false);
      setAddClientId('');
      form.reset({ title: '', content: '', visit_date: new Date().toISOString().slice(0, 16) });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error adding note', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedNote) {
    return (
      <NoteDetail
        note={selectedNote}
        clientName={clientLabel(clients.find((c) => c.id === selectedNote.client_id))}
        onBack={() => setSelectedNote(null)}
        onSaved={() => {
          setSelectedNote(null);
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="p-3 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl md:text-3xl font-bold">Clinical Notes</h1>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-medical-blue hover:bg-medical-blue/90">
          <Plus className="h-4 w-4" />
          New Note
        </Button>
      </div>
      <p className="text-muted-foreground mb-6">Browse all notes grouped by client</p>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by client, title, or content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading notes...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search ? 'No notes match your search.' : 'No notes yet. Create your first note.'}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ client, notes: clientNotes }) => {
            const isOpen = !!expanded[client.id];
            return (
              <Card key={client.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(client.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-medical-blue-light/30 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-medical-blue" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {client.last_name}, {client.first_name}
                    </p>
                    {client.member_id && (
                      <p className="text-sm text-muted-foreground truncate">Member ID: {client.member_id}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{clientNotes.length}</Badge>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {clientNotes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setSelectedNote(note)}
                        className="w-full text-left rounded-lg border border-border p-3 hover:border-medical-blue/50 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium">{note.title}</p>
                          <div className="text-right text-xs text-muted-foreground shrink-0">
                            <p>{formatDate(note.visit_date || note.created_at)}</p>
                            {note.profiles && (
                              <p>
                                {note.profiles.first_name} {note.profiles.last_name}
                              </p>
                            )}
                          </div>
                        </div>
                        {note.content && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{note.content}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add note dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Note</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddNote)} className="space-y-4">
              <div className="space-y-2">
                <FormLabel>Client</FormLabel>
                <Select value={addClientId} onValueChange={setAddClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.last_name}, {c.first_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                      <Input type="datetime-local" {...field} />
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
                      <Textarea {...field} rows={5} maxLength={10000} />
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
  );
};

function clientLabel(client?: ClientRow) {
  if (!client) return '';
  return `${client.last_name}, ${client.first_name}`;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface NoteDetailProps {
  note: HubNote;
  clientName: string;
  onBack: () => void;
  onSaved: () => void;
}

const NoteDetail: React.FC<NoteDetailProps> = ({ note, clientName, onBack, onSaved }) => {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      title: note.title,
      content: note.content || '',
      visit_date: note.visit_date ? new Date(note.visit_date).toISOString().slice(0, 16) : '',
    },
  });

  const handleSave = async (data: NoteFormData) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('client_notes')
        .update({
          title: data.title,
          content: data.content || '',
          visit_date: data.visit_date || null,
        })
        .eq('id', note.id);
      if (error) throw error;
      toast({ title: 'Note saved', description: 'Your changes have been saved.' });
      onSaved();
    } catch (error: any) {
      toast({ title: 'Error saving note', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('client_notes').delete().eq('id', note.id);
      if (error) throw error;
      toast({ title: 'Note deleted', description: 'The note has been removed.' });
      onSaved();
    } catch (error: any) {
      toast({ title: 'Error deleting note', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-3 md:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="gap-2 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back to Notes
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-medical-blue" />
            {clientName}
          </CardTitle>
          {note.profiles && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(note.visit_date || note.created_at)} · {note.profiles.first_name}{' '}
              {note.profiles.last_name}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
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
                      <Input type="datetime-local" {...field} />
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
                      <Textarea {...field} rows={12} maxLength={10000} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-between gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" className="gap-2 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. The note will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onBack}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSaving} className="bg-medical-blue hover:bg-medical-blue/90">
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};
