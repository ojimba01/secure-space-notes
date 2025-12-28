import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ChevronLeft, ChevronRight, SkipForward, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TutorialStep {
  id: string;
  role_type: string;
  step_number: number;
  target_selector: string;
  title: string;
  description: string;
  position: string;
  page_route: string;
  action_type: string | null;
}

interface TutorialOverlayProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete, onSkip }) => {
  const { user } = useAuth();
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkAdminAndFetchSteps();
    }
  }, [user]);

  const checkAdminAndFetchSteps = async () => {
    if (!user) return;
    
    try {
      // Check admin status
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      // Fetch steps for user's role
      const { data: stepsData, error } = await supabase
        .from('tutorial_steps')
        .select('*')
        .eq('role_type', adminStatus ? 'admin' : 'employee')
        .eq('is_active', true)
        .order('step_number', { ascending: true });

      if (error) throw error;
      setSteps(stepsData || []);
    } catch (error) {
      console.error('Error fetching tutorial steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateTargetPosition = useCallback(() => {
    if (steps.length === 0 || currentStepIndex >= steps.length) return;
    
    const currentStep = steps[currentStepIndex];
    const targetElement = document.querySelector(currentStep.target_selector);
    
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [steps, currentStepIndex]);

  useEffect(() => {
    updateTargetPosition();
    
    // Update position on scroll/resize
    window.addEventListener('scroll', updateTargetPosition, true);
    window.addEventListener('resize', updateTargetPosition);
    
    return () => {
      window.removeEventListener('scroll', updateTargetPosition, true);
      window.removeEventListener('resize', updateTargetPosition);
    };
  }, [updateTargetPosition]);

  const handleNext = async () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      await completeTutorial();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const completeTutorial = async () => {
    if (!user) return;
    
    try {
      // Upsert tutorial progress
      const { error } = await supabase
        .from('user_tutorial_progress')
        .upsert({
          user_id: user.id,
          current_step: steps.length,
          completed: true,
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      onComplete();
    } catch (error) {
      console.error('Error completing tutorial:', error);
      onComplete();
    }
  };

  const handleSkip = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('user_tutorial_progress')
        .upsert({
          user_id: user.id,
          current_step: 0,
          completed: true,
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Error skipping tutorial:', error);
    }
    onSkip();
  };

  if (loading || steps.length === 0) {
    return null;
  }

  const currentStep = steps[currentStepIndex];

  const getTooltipPosition = () => {
    if (!targetRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    switch (currentStep.position) {
      case 'top':
        return {
          top: targetRect.top - tooltipHeight - padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      case 'bottom':
        return {
          top: targetRect.bottom + padding,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.left - tooltipWidth - padding,
        };
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.right + padding,
        };
      default:
        return {
          top: targetRect.bottom + padding,
          left: targetRect.left,
        };
    }
  };

  const tooltipPosition = getTooltipPosition();

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with hole for target element */}
      <div className="absolute inset-0 bg-black/60" />
      
      {/* Highlight around target */}
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-lg shadow-primary/50 pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          }}
        />
      )}

      {/* Tooltip Card */}
      <Card
        className="absolute w-80 shadow-2xl border-primary/20"
        style={tooltipPosition}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {currentStepIndex + 1}
              </span>
              <CardTitle className="text-lg">{currentStep.title}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSkip}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription className="text-sm">{currentStep.description}</CardDescription>
          
          {/* Progress indicator */}
          <div className="flex items-center gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  idx <= currentStepIndex ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            
            <span className="text-xs text-muted-foreground">
              {currentStepIndex + 1} of {steps.length}
            </span>
            
            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1"
            >
              {currentStepIndex === steps.length - 1 ? (
                <>
                  Finish
                  <SkipForward className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
};

export default TutorialOverlay;
