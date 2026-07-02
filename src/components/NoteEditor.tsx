import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Plus, Table, Type, Calendar } from "lucide-react";
import { DynamicTable } from "./DynamicTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NoteBlock {
  id: string;
  type: "text" | "table" | "header";
  content: any;
}

interface NoteEditorProps {
  initialContent?: string;
  readOnly?: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ initialContent = '', readOnly = false }) => {
  const { toast } = useToast();
  const [clients, setClients] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedVisitType, setSelectedVisitType] = useState<string>("");
  const [blocks, setBlocks] = useState<NoteBlock[]>([
    {
      id: "1",
      type: "header",
      content: "Presenting Issue / Reason for Visit"
    },
    {
      id: "2",
      type: "text",
      content: ""
    },
    {
      id: "3",
      type: "header",
      content: "Assessment / Observations"
    },
    {
      id: "4",
      type: "text",
      content: ""
    },
    {
      id: "5",
      type: "header",
      content: "Interventions / Actions Taken"
    },
    {
      id: "6",
      type: "text",
      content: ""
    },
    {
      id: "7",
      type: "header",
      content: "Plan / Next Steps"
    },
    {
      id: "8",
      type: "text",
      content: ""
    },
    {
      id: "9",
      type: "header",
      content: "Follow-up"
    },
    {
      id: "10",
      type: "text",
      content: ""
    }
  ]);

  const visitTypes = [
    "Initial Assessment",
    "Follow-up Visit",
    "Crisis Intervention",
    "Case Review",
    "Home Visit",
    "Phone Check-in",
    "Service Coordination",
    "Progress Review"
  ];

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .order('last_name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: "Error",
        description: "Failed to load clients",
        variant: "destructive"
      });
    }
  };

  const addBlock = (type: "text" | "table" | "header") => {
    const newBlock: NoteBlock = {
      id: Date.now().toString(),
      type,
      content: type === "table" ? { 
        headers: ["Item", "Notes", "Status"], 
        rows: [["", "", ""]] 
      } : ""
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, content: any) => {
    setBlocks(blocks.map(block => 
      block.id === id ? { ...block, content } : block
    ));
  };

  const deleteBlock = (id: string) => {
    setBlocks(blocks.filter(block => block.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Case Notes</h1>
          <p className="text-muted-foreground">HIPAA-compliant collaborative note taking</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Client Info Template */}
      <Card className="p-6 bg-medical-blue-light/20 border-medical-blue/20">
        <h2 className="text-lg font-semibold mb-4 text-medical-blue">Client Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Client</label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.last_name}, {client.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Visit Type</label>
            <Select value={selectedVisitType} onValueChange={setSelectedVisitType}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select visit type..." />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {visitTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Note Blocks */}
      <div className="space-y-4">
        {blocks.map((block) => (
          <Card key={block.id} className="p-4 bg-editor-bg border-editor-border">
            {block.type === "header" && (
              <Input
                value={block.content}
                onChange={(e) => updateBlock(block.id, e.target.value)}
                className="text-2xl font-bold border-none p-0 h-auto bg-transparent"
                placeholder="Enter heading..."
              />
            )}
            
            {block.type === "text" && (
              <Textarea
                value={block.content}
                onChange={(e) => updateBlock(block.id, e.target.value)}
                placeholder="Start typing your notes..."
                className="min-h-[120px] border-none p-0 resize-none bg-transparent"
              />
            )}
            
            {block.type === "table" && (
              <DynamicTable
                data={block.content}
                onChange={(newData) => updateBlock(block.id, newData)}
                onDelete={() => deleteBlock(block.id)}
              />
            )}
          </Card>
        ))}
      </div>

      {/* Add Block Buttons */}
      <div className="flex gap-2 justify-center pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => addBlock("text")}
          className="gap-2"
        >
          <Type className="w-4 h-4" />
          Add Text
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => addBlock("table")}
          className="gap-2"
        >
          <Table className="w-4 h-4" />
          Add Table
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => addBlock("header")}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Header
        </Button>
      </div>

      {/* Save Actions */}
      <div className="flex justify-end gap-2 pt-6 border-t">
        <Button variant="outline">Save Draft</Button>
        <Button className="bg-medical-blue hover:bg-medical-blue/90">
          Save & Encrypt
        </Button>
      </div>
    </div>
  );
};