import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SignatureManager } from '@/components/SignatureManager';

/** Your signature, from anywhere in the app. */
export const SignatureDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
      <DialogTitle className="sr-only">Your signature</DialogTitle>
      <SignatureManager />
    </DialogContent>
  </Dialog>
);
