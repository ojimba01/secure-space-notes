-- Create table for onboarding content (editable by admins)
CREATE TABLE public.onboarding_content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_type text NOT NULL CHECK (role_type IN ('admin', 'employee')),
    content_type text NOT NULL CHECK (content_type IN ('step', 'feature')),
    title text NOT NULL,
    description text,
    icon text,
    step_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(role_type, content_type, step_order)
);

-- Create table to track user onboarding completion
CREATE TABLE public.user_onboarding (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    completed_at timestamp with time zone DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.onboarding_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- RLS policies for onboarding_content
CREATE POLICY "Anyone authenticated can view onboarding content"
ON public.onboarding_content
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert onboarding content"
ON public.onboarding_content
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update onboarding content"
ON public.onboarding_content
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete onboarding content"
ON public.onboarding_content
FOR DELETE
USING (is_admin(auth.uid()));

-- RLS policies for user_onboarding
CREATE POLICY "Users can view their own onboarding status"
ON public.user_onboarding
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own onboarding status"
ON public.user_onboarding
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Insert default onboarding content for employees
INSERT INTO public.onboarding_content (role_type, content_type, title, description, icon, step_order) VALUES
-- Employee Steps
('employee', 'step', 'View Your Assigned Clients', 'Navigate to the Clients tab to see all clients assigned to you. Click on any client to view their full details.', 'Users', 1),
('employee', 'step', 'Create Case Notes', 'Document your client interactions by creating detailed notes. Use the Notes section in each client profile.', 'FileText', 2),
('employee', 'step', 'Schedule Appointments', 'Use the Calendar to schedule visits, follow-ups, and other events with your clients.', 'Calendar', 3),
('employee', 'step', 'Upload Documents', 'Store important client documents securely using the Files section in each client profile.', 'Upload', 4),
-- Employee Features
('employee', 'feature', 'Client Management', 'View and manage your assigned clients, track their progress, and maintain comprehensive records.', 'Users', 1),
('employee', 'feature', 'Secure Notes', 'Create HIPAA-compliant case notes with structured templates for consistent documentation.', 'Shield', 2),
('employee', 'feature', 'Calendar Integration', 'Schedule and track appointments, home visits, and follow-up meetings.', 'Calendar', 3),
('employee', 'feature', 'Document Storage', 'Securely upload and manage client documents with digital signatures.', 'FolderOpen', 4);

-- Insert default onboarding content for admins
INSERT INTO public.onboarding_content (role_type, content_type, title, description, icon, step_order) VALUES
-- Admin Steps
('admin', 'step', 'Access Admin Dashboard', 'Navigate to the Admin Dashboard to view system statistics and manage all employees.', 'LayoutDashboard', 1),
('admin', 'step', 'Manage Employee Accounts', 'Activate or deactivate employee accounts from the Admin Dashboard.', 'UserCog', 2),
('admin', 'step', 'Reassign Clients', 'Transfer clients between case managers as needed using the Reassign feature.', 'ArrowRightLeft', 3),
('admin', 'step', 'Review Audit Logs', 'Monitor system activity and maintain compliance through the Audit Logs section.', 'FileSearch', 4),
('admin', 'step', 'Edit Onboarding Content', 'Customize onboarding guides for both admins and case managers.', 'Settings', 5),
-- Admin Features
('admin', 'feature', 'Employee Management', 'Activate, deactivate, and manage all employee accounts in the system.', 'Users', 1),
('admin', 'feature', 'System Overview', 'View comprehensive statistics on clients, notes, events, and employees.', 'BarChart3', 2),
('admin', 'feature', 'Audit Trail', 'Full audit logging for compliance and security monitoring.', 'Shield', 3),
('admin', 'feature', 'Client Reassignment', 'Seamlessly transfer clients between case managers with full history tracking.', 'ArrowRightLeft', 4),
('admin', 'feature', 'Content Management', 'Edit onboarding content for all user roles.', 'Settings', 5);