-- Create user roles enum
CREATE TYPE public.user_role AS ENUM ('admin', 'employee');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role user_role DEFAULT 'employee',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  date_of_birth DATE,
  case_number TEXT UNIQUE,
  status TEXT DEFAULT 'active',
  intake_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create client_notes table
CREATE TABLE public.client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  visit_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create client_files table
CREATE TABLE public.client_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  is_signed BOOLEAN DEFAULT FALSE,
  signature_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create calendar_events table
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  event_type TEXT DEFAULT 'client_visit',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE user_id = _user_id 
    AND role = 'admin'
  )
$$;

-- Create security definer function to get user profile id
CREATE OR REPLACE FUNCTION public.get_profile_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM public.profiles 
  WHERE user_id = _user_id
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for clients
CREATE POLICY "Employees can view their assigned clients" ON public.clients
  FOR SELECT USING (
    assigned_employee_id = public.get_profile_id(auth.uid()) 
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can manage all clients" ON public.clients
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "Employees can update their assigned clients" ON public.clients
  FOR UPDATE USING (assigned_employee_id = public.get_profile_id(auth.uid()));

-- RLS Policies for client_notes
CREATE POLICY "Employees can view notes for their clients" ON public.client_notes
  FOR SELECT USING (
    employee_id = public.get_profile_id(auth.uid()) 
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clients 
      WHERE id = client_id 
      AND assigned_employee_id = public.get_profile_id(auth.uid())
    )
  );

CREATE POLICY "Employees can create notes for their clients" ON public.client_notes
  FOR INSERT WITH CHECK (
    employee_id = public.get_profile_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clients 
      WHERE id = client_id 
      AND (assigned_employee_id = public.get_profile_id(auth.uid()) OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Employees can update their own notes" ON public.client_notes
  FOR UPDATE USING (employee_id = public.get_profile_id(auth.uid()) OR public.is_admin(auth.uid()));

-- RLS Policies for client_files
CREATE POLICY "Users can view files for their clients" ON public.client_files
  FOR SELECT USING (
    uploaded_by = public.get_profile_id(auth.uid()) 
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clients 
      WHERE id = client_id 
      AND assigned_employee_id = public.get_profile_id(auth.uid())
    )
  );

CREATE POLICY "Users can upload files for their clients" ON public.client_files
  FOR INSERT WITH CHECK (
    uploaded_by = public.get_profile_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clients 
      WHERE id = client_id 
      AND (assigned_employee_id = public.get_profile_id(auth.uid()) OR public.is_admin(auth.uid()))
    )
  );

-- RLS Policies for calendar_events
CREATE POLICY "Users can view their own events" ON public.calendar_events
  FOR SELECT USING (
    employee_id = public.get_profile_id(auth.uid()) 
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can create their own events" ON public.calendar_events
  FOR INSERT WITH CHECK (employee_id = public.get_profile_id(auth.uid()));

CREATE POLICY "Users can update their own events" ON public.calendar_events
  FOR UPDATE USING (
    employee_id = public.get_profile_id(auth.uid()) 
    OR public.is_admin(auth.uid())
  );

-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('client-files', 'client-files', false);

-- Storage policies for client files
CREATE POLICY "Users can view files for their clients" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-files' 
    AND (
      public.is_admin(auth.uid()) 
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Users can upload files for their clients" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'client-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    CASE 
      WHEN NEW.email LIKE '%@supportivecm.org' THEN 'employee'::user_role
      ELSE 'admin'::user_role
    END
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();