import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Pencil, CheckCircle, Users, FileText, Calendar, Upload, Shield, 
  FolderOpen, LayoutDashboard, UserCog, ArrowRightLeft, FileSearch, 
  Settings, BarChart3 
} from 'lucide-react';
import OnboardingContent from '@/components/OnboardingContent';
import EditOnboardingDialog from '@/components/EditOnboardingDialog';
import { toast } from 'sonner';

interface OnboardingItem {
  id: string;
  role_type: string;
  content_type: string;
  title: string;
  description: string | null;
  icon: string | null;
  step_order: number;
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

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<OnboardingItem[]>([]);
  const [editingItem, setEditingItem] = useState<OnboardingItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('employee');

  useEffect(() => {
    if (user) {
      checkAdminStatus();
      fetchContent();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!data);
      setActiveTab(data ? 'admin' : 'employee');
    } catch (error) {
      setIsAdmin(false);
    }
  };

  const fetchContent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('onboarding_content')
        .select('*')
        .order('step_order', { ascending: true });

      if (error) throw error;
      setContent(data || []);
    } catch (error) {
      console.error('Error fetching onboarding content:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('user_onboarding')
        .insert({ user_id: user.id });

      if (error && error.code !== '23505') throw error;
      
      toast.success("Welcome! Let's get started.");
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete onboarding');
    }
  };

  const handleEdit = (item: OnboardingItem) => {
    setEditingItem(item);
    setEditDialogOpen(true);
  };

  const getContentByRole = (roleType: string) => {
    const roleContent = content.filter((c) => c.role_type === roleType);
    return {
      steps: roleContent.filter((c) => c.content_type === 'step'),
      features: roleContent.filter((c) => c.content_type === 'feature'),
    };
  };

  const getIcon = (iconName: string | null) => {
    if (!iconName) return Users;
    return iconMap[iconName] || Users;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const employeeContent = getContentByRole('employee');
  const adminContent = getContentByRole('admin');

  const renderEditableContent = (steps: OnboardingItem[], features: OnboardingItem[]) => (
    <div className="space-y-6 md:space-y-8">
      <section>
        <h2 className="text-xl md:text-2xl font-semibold mb-3 md:mb-4">Getting Started</h2>
        <div className="space-y-3 md:space-y-4">
          {steps.map((step, index) => {
            const IconComponent = getIcon(step.icon);
            return (
              <Card key={step.id} className="border-l-4 border-l-primary relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleEdit(step)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <CardHeader className="pb-2 p-3 md:p-6 md:pb-2">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary text-primary-foreground text-xs md:text-sm font-bold shrink-0">
                      {index + 1}
                    </div>
                    <IconComponent className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" />
                    <CardTitle className="text-base md:text-lg">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pl-10 md:pl-14 p-3 pt-0 md:p-6 md:pt-0">
                  <CardDescription className="text-sm md:text-base">{step.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xl md:text-2xl font-semibold mb-3 md:mb-4">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {features.map((feature) => {
            const IconComponent = getIcon(feature.icon);
            return (
              <Card key={feature.id} className="hover:shadow-lg transition-shadow relative group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleEdit(feature)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <CardHeader className="p-3 md:p-6">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 shrink-0">
                      <IconComponent className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    </div>
                    <CardTitle className="text-base md:text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <CardDescription className="text-sm md:text-base">{feature.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-3 md:p-6 pt-16 md:pt-6">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-4 md:mb-6">
          <CardHeader className="text-center p-4 md:p-6">
            <CardTitle className="text-xl md:text-3xl">Welcome to Case Notes</CardTitle>
            <CardDescription className="text-sm md:text-lg">
              {isAdmin 
                ? 'As an administrator, you have access to all features. Review the guides below.'
                : 'Learn how to use the system effectively with these step-by-step guides.'}
            </CardDescription>
          </CardHeader>
        </Card>

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin">Administrator guide</TabsTrigger>
              <TabsTrigger value="employee">Case manager guide</TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="space-y-6">
              <div className="flex justify-end">
                <p className="text-sm text-muted-foreground">Click the edit icon on any item to modify</p>
              </div>
              {renderEditableContent(adminContent.steps, adminContent.features)}
            </TabsContent>

            <TabsContent value="employee" className="space-y-6">
              <div className="flex justify-end">
                <p className="text-sm text-muted-foreground">Click the edit icon on any item to modify</p>
              </div>
              {renderEditableContent(employeeContent.steps, employeeContent.features)}
            </TabsContent>
          </Tabs>
        ) : (
          <OnboardingContent
            steps={employeeContent.steps}
            features={employeeContent.features}
            roleLabel="Case Manager"
          />
        )}

        <div className="mt-6 md:mt-8 flex justify-center">
          <Button size="lg" onClick={completeOnboarding} className="gap-2 w-full md:w-auto">
            <CheckCircle className="h-5 w-5" />
            Get Started
          </Button>
        </div>

        <EditOnboardingDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          item={editingItem}
          onSuccess={fetchContent}
        />
      </div>
    </div>
  );
};

export default Onboarding;
