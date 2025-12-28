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
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
        <div className="space-y-4">
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

      <section>
        <h2 className="text-2xl font-semibold mb-4">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Welcome to Clinical Notes</CardTitle>
            <CardDescription className="text-lg">
              {isAdmin 
                ? 'As an administrator, you have access to all features. Review the guides below.'
                : 'Learn how to use the system effectively with these step-by-step guides.'}
            </CardDescription>
          </CardHeader>
        </Card>

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin">Admin Guide</TabsTrigger>
              <TabsTrigger value="employee">Case Manager Guide</TabsTrigger>
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

        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={completeOnboarding} className="gap-2">
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
