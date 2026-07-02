export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          profile_id: string | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          profile_id?: string | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          profile_id?: string | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_cycles: {
        Row: {
          billed_amount: number | null
          billing_status: string
          claim_number: string | null
          client_id: string
          created_at: string
          cycle_end: string
          cycle_number: number
          cycle_start: string
          id: string
          is_auto_generated: boolean
          notes: string | null
          paid_amount: number
          paid_date: string | null
          payment_status: string
          phase: string
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          billed_amount?: number | null
          billing_status?: string
          claim_number?: string | null
          client_id: string
          created_at?: string
          cycle_end: string
          cycle_number: number
          cycle_start: string
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_status?: string
          phase?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          billed_amount?: number | null
          billing_status?: string
          claim_number?: string | null
          client_id?: string
          created_at?: string
          cycle_end?: string
          cycle_number?: number
          cycle_start?: string
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_status?: string
          phase?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_cycles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          employee_id: string
          end_time: string
          event_type: string | null
          id: string
          is_auto_generated: boolean
          note_id: string | null
          start_time: string
          title: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          employee_id: string
          end_time: string
          event_type?: string | null
          id?: string
          is_auto_generated?: boolean
          note_id?: string | null
          start_time: string
          title: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          employee_id?: string
          end_time?: string
          event_type?: string | null
          id?: string
          is_auto_generated?: boolean
          note_id?: string | null
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "client_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments_history: {
        Row: {
          client_id: string
          created_at: string
          from_employee_id: string | null
          id: string
          reason: string | null
          reassigned_by: string
          to_employee_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          from_employee_id?: string | null
          id?: string
          reason?: string | null
          reassigned_by: string
          to_employee_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          from_employee_id?: string | null
          id?: string
          reason?: string | null
          reassigned_by?: string
          to_employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_history_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_history_reassigned_by_fkey"
            columns: ["reassigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_history_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          calendar_event_id: string | null
          client_id: string
          contact_date: string
          created_at: string
          employee_id: string
          id: string
          modality: string
          notes: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          client_id: string
          contact_date?: string
          created_at?: string
          employee_id: string
          id?: string
          modality: string
          notes?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          client_id?: string
          contact_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          modality?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_files: {
        Row: {
          client_id: string
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          is_signed: boolean | null
          signature_data: Json | null
          uploaded_by: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_signed?: boolean | null
          signature_data?: Json | null
          uploaded_by: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_signed?: boolean | null
          signature_data?: Json | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_month_compliance: {
        Row: {
          activities_done: Json
          client_id: string
          created_at: string
          employee_id: string | null
          id: string
          is_new_client: boolean
          lon_tier: string
          month: string
          plan_dates: Json
          required_activities: number
          required_contacts: number
          required_in_person: number
          status: string
          summary_note: string | null
          updated_at: string
        }
        Insert: {
          activities_done?: Json
          client_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_new_client?: boolean
          lon_tier: string
          month: string
          plan_dates?: Json
          required_activities?: number
          required_contacts?: number
          required_in_person?: number
          status?: string
          summary_note?: string | null
          updated_at?: string
        }
        Update: {
          activities_done?: Json
          client_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_new_client?: boolean
          lon_tier?: string
          month?: string
          plan_dates?: Json
          required_activities?: number
          required_contacts?: number
          required_in_person?: number
          status?: string
          summary_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_month_compliance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_month_compliance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          content: string | null
          created_at: string | null
          employee_id: string
          id: string
          title: string
          updated_at: string | null
          visit_date: string | null
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          title: string
          updated_at?: string | null
          visit_date?: string | null
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          title?: string
          updated_at?: string | null
          visit_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_visit_availability: {
        Row: {
          client_id: string
          created_at: string
          end_date: string
          id: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_visit_availability_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          approval_status: string | null
          assessment_due_date: string | null
          assigned_employee_id: string | null
          auth_150_end: string | null
          auth_150_number: string | null
          auth_150_start: string | null
          auth_180_end: string | null
          auth_180_number: string | null
          auth_180_start: string | null
          auth_30_end: string | null
          auth_30_number: string | null
          auth_30_start: string | null
          closed_date: string | null
          county: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          first_name: string
          housing_stabilization_plan_date: string | null
          hsp_150_date: string | null
          hsp_180_date: string | null
          hsp_due_date: string | null
          iat_date: string | null
          id: string
          insurance: string | null
          intake_date: string | null
          last_name: string
          level_of_need: string | null
          mco_housing_manager: string | null
          member_id: string | null
          next_action_due_date: string | null
          notes: string | null
          phone: string | null
          reason_closed: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: string | null
          assessment_due_date?: string | null
          assigned_employee_id?: string | null
          auth_150_end?: string | null
          auth_150_number?: string | null
          auth_150_start?: string | null
          auth_180_end?: string | null
          auth_180_number?: string | null
          auth_180_start?: string | null
          auth_30_end?: string | null
          auth_30_number?: string | null
          auth_30_start?: string | null
          closed_date?: string | null
          county?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          housing_stabilization_plan_date?: string | null
          hsp_150_date?: string | null
          hsp_180_date?: string | null
          hsp_due_date?: string | null
          iat_date?: string | null
          id?: string
          insurance?: string | null
          intake_date?: string | null
          last_name: string
          level_of_need?: string | null
          mco_housing_manager?: string | null
          member_id?: string | null
          next_action_due_date?: string | null
          notes?: string | null
          phone?: string | null
          reason_closed?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: string | null
          assessment_due_date?: string | null
          assigned_employee_id?: string | null
          auth_150_end?: string | null
          auth_150_number?: string | null
          auth_150_start?: string | null
          auth_180_end?: string | null
          auth_180_number?: string | null
          auth_180_start?: string | null
          auth_30_end?: string | null
          auth_30_number?: string | null
          auth_30_start?: string | null
          closed_date?: string | null
          county?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          housing_stabilization_plan_date?: string | null
          hsp_150_date?: string | null
          hsp_180_date?: string | null
          hsp_due_date?: string | null
          iat_date?: string | null
          id?: string
          insurance?: string | null
          intake_date?: string | null
          last_name?: string
          level_of_need?: string | null
          mco_housing_manager?: string | null
          member_id?: string | null
          next_action_due_date?: string | null
          notes?: string | null
          phone?: string | null
          reason_closed?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_escalations: {
        Row: {
          claimed_complete: Json
          client_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          kind: string
          outstanding: Json
          period: string
          status: string
        }
        Insert: {
          claimed_complete?: Json
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          kind: string
          outstanding?: Json
          period: string
          status?: string
        }
        Update: {
          claimed_complete?: Json
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          kind?: string
          outstanding?: Json
          period?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_escalations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_escalations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      onboarding_content: {
        Row: {
          content_type: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          role_type: string
          step_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          content_type: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          role_type: string
          step_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          role_type?: string
          step_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tutorial_steps: {
        Row: {
          action_type: string | null
          created_at: string | null
          description: string
          id: string
          is_active: boolean | null
          page_route: string
          position: string
          role_type: string
          step_number: number
          target_selector: string
          title: string
          updated_at: string | null
        }
        Insert: {
          action_type?: string | null
          created_at?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          page_route?: string
          position?: string
          role_type: string
          step_number: number
          target_selector: string
          title: string
          updated_at?: string | null
        }
        Update: {
          action_type?: string | null
          created_at?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          page_route?: string
          position?: string
          role_type?: string
          step_number?: number
          target_selector?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tutorial_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          current_step: number | null
          id: string
          started_at: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          current_step?: number | null
          id?: string
          started_at?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          current_step?: number | null
          id?: string
          started_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_user: { Args: { _profile_id: string }; Returns: undefined }
      call_compliance_cron: { Args: { _job: string }; Returns: undefined }
      can_access_client_files: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      create_audit_log: {
        Args: {
          _action: Database["public"]["Enums"]["audit_action"]
          _new_data?: Json
          _old_data?: Json
          _record_id?: string
          _table_name: string
        }
        Returns: undefined
      }
      deactivate_user: { Args: { _profile_id: string }; Returns: undefined }
      get_profile_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_assigned_to_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      reassign_client: {
        Args: { _client_id: string; _new_employee_id: string; _reason?: string }
        Returns: undefined
      }
      set_employee_admin: {
        Args: { _make_admin: boolean; _profile_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "superadmin"
      audit_action:
        | "SELECT"
        | "INSERT"
        | "UPDATE"
        | "DELETE"
        | "LOGIN"
        | "LOGOUT"
        | "ACCESS"
      user_role: "admin" | "employee"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee", "superadmin"],
      audit_action: [
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "LOGIN",
        "LOGOUT",
        "ACCESS",
      ],
      user_role: ["admin", "employee"],
    },
  },
} as const
