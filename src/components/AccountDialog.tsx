import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignatureManager } from '@/components/SignatureManager';

/**
 * The person's own account: who they are, and the two things they can change.
 *
 * Their signature lives here too. It was only reachable while filling in a
 * form, so somebody wanting to replace one had to start a form they did not
 * intend to submit.
 */
export const AccountDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [signatures, setSignatures] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .maybeSingle();
      setName(`${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim());
    })();
  }, [open, user]);

  const changePassword = async () => {
    if (password.length < 8) {
      toast({ title: 'Use at least 8 characters', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not change it', description: error.message, variant: 'destructive' });
      return;
    }
    setPassword('');
    toast({ title: 'Password changed' });
  };

  const sendRecovery = async () => {
    if (!user?.email) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not send it', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recovery email sent', description: `Check ${user.email}.` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Your account</DialogTitle>
            <DialogDescription>{name || 'Signed in'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm">{user?.email}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-password">New password</Label>
              <Input
                id="account-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={changePassword} disabled={busy || !password}>
                  Change password
                </Button>
                <Button variant="outline" onClick={sendRecovery} disabled={busy}>
                  Send a recovery email
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  setSignatures(true);
                }}
              >
                Add or change your signature
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={signatures} onOpenChange={setSignatures}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">Your signature</DialogTitle>
          <SignatureManager />
        </DialogContent>
      </Dialog>
    </>
  );
};
