import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, FileText, Calendar, Upload, Shield, FolderOpen,
  LayoutDashboard, UserCog, ArrowRightLeft, FileSearch, Settings, BarChart3
} from 'lucide-react';

interface OnboardingItem {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  step_order: number;
}

interface OnboardingContentProps {
  steps: OnboardingItem[];
  features: OnboardingItem[];
  roleLabel: string;
}

const iconMap: Record<string, React.ElementType> = {
  Users,
  FileText,
  Calendar,
  Upload,
  Shield,
  FolderOpen,
  LayoutDashboard,
  UserCog,
  ArrowRightLeft,
  FileSearch,
  Settings,
  BarChart3,
};

const OnboardingContent: React.FC<OnboardingContentProps> = ({ steps, features, roleLabel }) => {
  const getIcon = (iconName: string | null) => {
    if (!iconName) return Users;
    return iconMap[iconName] || Users;
  };

  return (
    <div className="space-y-8">
      {/* Steps Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Getting started</h2>
        <div className="space-y-4">
          {steps.map((step, index) => {
            const IconComponent = getIcon(step.icon);
            return (
              <Card key={step.id} className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      {index + 1}
                    </div>
                    <IconComponent className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pl-14">
                  <CardDescription className="text-base">{step.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Features Section */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Key features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => {
            const IconComponent = getIcon(feature.icon);
            return (
              <Card key={feature.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default OnboardingContent;
