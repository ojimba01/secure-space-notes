import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, BookOpen } from 'lucide-react';
import { tutorialsForRole } from '@/lib/tutorials';
import type { AppRole } from '@/hooks/useRole';

interface HelpGuideProps {
  open: boolean;
  role: AppRole;
  onOpenChange: (open: boolean) => void;
  onStart: (key: string) => void;
}

export const HelpGuide: React.FC<HelpGuideProps> = ({
  open,
  role,
  onOpenChange,
  onStart,
}) => {
  const tutorials = tutorialsForRole(role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Help Guide
          </DialogTitle>
          <DialogDescription>
            Launch a guided walkthrough for any part of the app. Each one highlights
            the real controls on the page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {tutorials.map((t) => (
            <Card
              key={t.key}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.summary}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1 shrink-0"
                onClick={() => onStart(t.key)}
              >
                <Play className="h-3.5 w-3.5" />
                Start
              </Button>
            </Card>
          ))}
          {tutorials.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No walkthroughs available for your role yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
