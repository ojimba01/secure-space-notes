import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingItem {
  id: string;
  role_type: string;
  content_type: string;
  title: string;
  description: string | null;
  icon: string | null;
  step_order: number;
}

interface EditOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: OnboardingItem | null;
  onSuccess: () => void;
}

const iconOptions = [
  'Users', 'FileText', 'Calendar', 'Upload', 'Shield', 'FolderOpen',
  'LayoutDashboard', 'UserCog', 'ArrowRightLeft', 'FileSearch', 'Settings', 'BarChart3'
];

const EditOnboardingDialog: React.FC<EditOnboardingDialogProps> = ({
  open,
  onOpenChange,
  item,
  onSuccess,
}) => {
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [icon, setIcon] = useState(item?.icon || 'Users');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description || '');
      setIcon(item.icon || 'Users');
    }
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('onboarding_content')
        .update({
          title,
          description,
          icon,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success('Help content updated');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {item?.content_type === 'step' ? 'Step' : 'Feature'}</DialogTitle>
          <DialogDescription>
            Update the help content for {item?.role_type === 'admin' ? 'administrators' : 'case managers'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue placeholder="Select an icon" />
              </SelectTrigger>
              <SelectContent>
                {iconOptions.map((iconName) => (
                  <SelectItem key={iconName} value={iconName}>
                    {iconName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditOnboardingDialog;
