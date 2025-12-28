-- Create table for tutorial steps (editable by admins)
CREATE TABLE public.tutorial_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_type text NOT NULL CHECK (role_type IN ('admin', 'employee')),
    step_number integer NOT NULL,
    target_selector text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    position text NOT NULL DEFAULT 'bottom' CHECK (position IN ('top', 'bottom', 'left', 'right')),
    page_route text NOT NULL DEFAULT '/',
    action_type text CHECK (action_type IN ('click', 'navigate', 'observe')),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(role_type, step_number)
);

-- Create table to track user tutorial progress
CREATE TABLE public.user_tutorial_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_step integer DEFAULT 0,
    completed boolean DEFAULT false,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.tutorial_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tutorial_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for tutorial_steps
CREATE POLICY "Anyone authenticated can view tutorial steps"
ON public.tutorial_steps
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert tutorial steps"
ON public.tutorial_steps
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update tutorial steps"
ON public.tutorial_steps
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete tutorial steps"
ON public.tutorial_steps
FOR DELETE
USING (is_admin(auth.uid()));

-- RLS policies for user_tutorial_progress
CREATE POLICY "Users can view their own tutorial progress"
ON public.user_tutorial_progress
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tutorial progress"
ON public.user_tutorial_progress
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tutorial progress"
ON public.user_tutorial_progress
FOR UPDATE
USING (auth.uid() = user_id);

-- Insert default tutorial steps for case managers (employees)
INSERT INTO public.tutorial_steps (role_type, step_number, target_selector, title, description, position, page_route, action_type) VALUES
('employee', 1, '[data-tutorial="clients-nav"]', 'View Your Clients', 'Click here to see all clients assigned to you. This is your main workspace.', 'right', '/', 'click'),
('employee', 2, '[data-tutorial="new-note-btn"]', 'Create New Notes', 'Click this button to start documenting a client interaction or visit.', 'right', '/', 'click'),
('employee', 3, '[data-tutorial="calendar-nav"]', 'Manage Your Calendar', 'Access your calendar to schedule appointments and track upcoming visits.', 'right', '/', 'click'),
('employee', 4, '[data-tutorial="search-notes"]', 'Search Notes', 'Use this search bar to quickly find notes by title or content.', 'bottom', '/', 'observe'),
('employee', 5, '[data-tutorial="recent-notes"]', 'Recent Notes', 'Your most recent notes appear here for quick access.', 'right', '/', 'observe');

-- Insert default tutorial steps for admins
INSERT INTO public.tutorial_steps (role_type, step_number, target_selector, title, description, position, page_route, action_type) VALUES
('admin', 1, '[data-tutorial="clients-nav"]', 'Manage All Clients', 'View and manage clients across all case managers. As admin, you can see everyone.', 'right', '/', 'click'),
('admin', 2, '[data-tutorial="admin-nav"]', 'Admin Dashboard', 'Access the admin dashboard to manage employees and view system statistics.', 'right', '/', 'click'),
('admin', 3, '[data-tutorial="audit-nav"]', 'Audit Logs', 'Review all system activity for compliance and security monitoring.', 'right', '/', 'click'),
('admin', 4, '[data-tutorial="new-note-btn"]', 'Create Notes', 'You can also create notes for any client in the system.', 'right', '/', 'observe'),
('admin', 5, '[data-tutorial="onboarding-nav"]', 'Edit Onboarding', 'Access and edit onboarding content for all users from here.', 'right', '/', 'observe');