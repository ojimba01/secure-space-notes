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
    PostgrestVersion: "14.17"
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
          approval_state: string | null
          authorization_id: string | null
          billed_amount: number | null
          billing_status: string
          billed_source: string | null
          claim_number: string | null
          client_id: string
          created_at: string
          cycle_end: string
          cycle_number: number
          cycle_start: string
          final_deadline: string | null
          hold_reason: string | null
          id: string
          is_active: boolean
          is_auto_generated: boolean
          notes: string | null
          on_hold: boolean
          paid_amount: number
          paid_date: string | null
          payment_status: string
          phase: string
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          approval_state?: string | null
          authorization_id?: string | null
          billed_amount?: number | null
          billing_status?: string
          billed_source?: string | null
          claim_number?: string | null
          client_id: string
          created_at?: string
          cycle_end: string
          cycle_number: number
          cycle_start: string
          final_deadline?: string | null
          hold_reason?: string | null
          id?: string
          is_active?: boolean
          is_auto_generated?: boolean
          notes?: string | null
          on_hold?: boolean
          paid_amount?: number
          paid_date?: string | null
          payment_status?: string
          phase?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          approval_state?: string | null
          authorization_id?: string | null
          billed_amount?: number | null
          billing_status?: string
          billed_source?: string | null
          claim_number?: string | null
          client_id?: string
          created_at?: string
          cycle_end?: string
          cycle_number?: number
          cycle_start?: string
          final_deadline?: string | null
          hold_reason?: string | null
          id?: string
          is_active?: boolean
          is_auto_generated?: boolean
          notes?: string | null
          on_hold?: boolean
          paid_amount?: number
          paid_date?: string | null
          payment_status?: string
          phase?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_cycles_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "client_authorizations"
            referencedColumns: ["id"]
          },
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
          is_manually_adjusted: boolean
          modality: string | null
          note_id: string | null
          start_time: string
          status: string
          title: string
          touchpoint_type: string | null
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
          is_manually_adjusted?: boolean
          modality?: string | null
          note_id?: string | null
          start_time: string
          status?: string
          title: string
          touchpoint_type?: string | null
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
          is_manually_adjusted?: boolean
          modality?: string | null
          note_id?: string | null
          start_time?: string
          status?: string
          title?: string
          touchpoint_type?: string | null
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
      client_authorizations: {
        Row: {
          authorization_number: string | null
          authorization_type: string
          billing_modifier: string | null
          client_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          level_of_need: string | null
          lon_score: number | null
          mco: string | null
          notes: string | null
          received_at: string | null
          sequence_number: number
          service_type: string | null
          source_document_id: string | null
          source_document_path: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          authorization_number?: string | null
          authorization_type: string
          billing_modifier?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          level_of_need?: string | null
          lon_score?: number | null
          mco?: string | null
          notes?: string | null
          received_at?: string | null
          sequence_number?: number
          service_type?: string | null
          source_document_id?: string | null
          source_document_path?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          authorization_number?: string | null
          authorization_type?: string
          billing_modifier?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          level_of_need?: string | null
          lon_score?: number | null
          mco?: string | null
          notes?: string | null
          received_at?: string | null
          sequence_number?: number
          service_type?: string | null
          source_document_id?: string | null
          source_document_path?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_authorizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_authorizations_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "client_forms"
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
          duration_minutes: number | null
          employee_id: string
          entered_by: string | null
          id: string
          modality: string
          notes: string | null
          touchpoint_type: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          client_id: string
          contact_date?: string
          created_at?: string
          duration_minutes?: number | null
          employee_id: string
          entered_by?: string | null
          id?: string
          modality: string
          notes?: string | null
          touchpoint_type?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          client_id?: string
          contact_date?: string
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string
          entered_by?: string | null
          id?: string
          modality?: string
          notes?: string | null
          touchpoint_type?: string | null
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
          {
            foreignKeyName: "client_contacts_entered_by_fkey"
            columns: ["entered_by"]
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
      client_form_versions: {
        Row: {
          client_form_id: string
          created_at: string
          created_by: string | null
          file_hash: string | null
          file_path: string
          file_size: number | null
          id: string
          note: string | null
          source_filename: string | null
          version_number: number
          version_type: string
        }
        Insert: {
          client_form_id: string
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          note?: string | null
          source_filename?: string | null
          version_number: number
          version_type?: string
        }
        Update: {
          client_form_id?: string
          created_at?: string
          created_by?: string | null
          file_hash?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          note?: string | null
          source_filename?: string | null
          version_number?: number
          version_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_form_versions_client_form_id_fkey"
            columns: ["client_form_id"]
            isOneToOne: false
            referencedRelation: "client_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_form_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_forms: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          authorization_id: string | null
          client_id: string
          created_at: string
          due_date: string | null
          employee_id: string
          external_status: string
          field_authorization_number: string | null
          field_icd10_code: string | null
          field_medicaid_id: string | null
          field_member_dob: string | null
          field_member_id: string | null
          field_member_name: string | null
          field_notice_date: string | null
          field_service_end: string | null
          field_service_start: string | null
          field_submission_date: string | null
          field_total_charges: number | null
          fields_conflict: Json | null
          fields_extracted_at: string | null
          extracted_text: string | null
          file_hash: string | null
          file_path: string | null
          file_size: number | null
          form_type: string
          id: string
          import_batch_id: string | null
          name_matches_client: boolean | null
          ocr_applied: boolean
          page_count: number | null
          mco_response_at: string | null
          original_file_path: string | null
          processed_at: string | null
          processing_error: string | null
          processing_started_at: string | null
          processing_status: string
          review_note: string | null
          sent_to_mco_at: string | null
          signature_name: string | null
          signed_at: string | null
          signed_by: string | null
          source: string
          source_filename: string | null
          status: string
          template_version: string | null
          text_char_count: number | null
          text_search: unknown | null
          text_truncated: boolean
          title: string
          updated_at: string
          workflow_purpose: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          authorization_id?: string | null
          client_id: string
          created_at?: string
          due_date?: string | null
          employee_id: string
          external_status?: string
          field_authorization_number?: string | null
          field_icd10_code?: string | null
          field_medicaid_id?: string | null
          field_member_dob?: string | null
          field_member_id?: string | null
          field_member_name?: string | null
          field_notice_date?: string | null
          field_service_end?: string | null
          field_service_start?: string | null
          field_submission_date?: string | null
          field_total_charges?: number | null
          fields_conflict?: Json | null
          fields_extracted_at?: string | null
          extracted_text?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          form_type: string
          id?: string
          import_batch_id?: string | null
          name_matches_client?: boolean | null
          ocr_applied?: boolean
          page_count?: number | null
          mco_response_at?: string | null
          original_file_path?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          review_note?: string | null
          sent_to_mco_at?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source?: string
          source_filename?: string | null
          status?: string
          template_version?: string | null
          text_char_count?: number | null
          text_truncated?: boolean
          title: string
          updated_at?: string
          workflow_purpose?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          authorization_id?: string | null
          client_id?: string
          created_at?: string
          due_date?: string | null
          employee_id?: string
          external_status?: string
          field_authorization_number?: string | null
          field_icd10_code?: string | null
          field_medicaid_id?: string | null
          field_member_dob?: string | null
          field_member_id?: string | null
          field_member_name?: string | null
          field_notice_date?: string | null
          field_service_end?: string | null
          field_service_start?: string | null
          field_submission_date?: string | null
          field_total_charges?: number | null
          fields_conflict?: Json | null
          fields_extracted_at?: string | null
          extracted_text?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          form_type?: string
          id?: string
          import_batch_id?: string | null
          name_matches_client?: boolean | null
          ocr_applied?: boolean
          page_count?: number | null
          mco_response_at?: string | null
          original_file_path?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_status?: string
          review_note?: string | null
          sent_to_mco_at?: string | null
          signature_name?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source?: string
          source_filename?: string | null
          status?: string
          template_version?: string | null
          text_char_count?: number | null
          text_truncated?: boolean
          title?: string
          updated_at?: string
          workflow_purpose?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_forms_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "client_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "document_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_forms_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_intake_household_members: {
        Row: {
          age: number | null
          created_at: string
          id: string
          intake_id: string
          name: string
          relationship: string | null
          sort_order: number
        }
        Insert: {
          age?: number | null
          created_at?: string
          id?: string
          intake_id: string
          name: string
          relationship?: string | null
          sort_order?: number
        }
        Update: {
          age?: number | null
          created_at?: string
          id?: string
          intake_id?: string
          name?: string
          relationship?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_household_members_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "client_intakes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_intakes: {
        Row: {
          accommodation_other: string | null
          accommodations: string[]
          additional_comments: string | null
          additional_notes: string | null
          alien_number: string | null
          application_fee_amount: number | null
          applied_for_voucher: boolean | null
          bank_name: string | null
          bedrooms_needed: string | null
          benefit_monthly_amount: number | null
          benefit_type: string | null
          birth_city: string | null
          birth_country: string | null
          birth_date: string | null
          birth_state: string | null
          client_id: string
          client_signature_name: string | null
          client_signed_date: string | null
          completed_at: string | null
          completed_by: string | null
          counties_of_interest: string[]
          county_other: string | null
          created_at: string
          created_by: string | null
          currently_employed: boolean | null
          developmental_disability: boolean | null
          developmental_disability_detail: string | null
          domestic_violence_victim: boolean | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employer_name: string | null
          eviction_or_record_detail: string | null
          expense_car_insurance: number | null
          expense_car_note: number | null
          expense_internet: number | null
          expense_other: number | null
          expense_phone: number | null
          expense_utilities: number | null
          expenses_total: number | null
          gender: string | null
          has_application_fee_funds: boolean | null
          has_bank_account: boolean | null
          has_birth_certificate: boolean | null
          has_eviction_or_record: boolean | null
          has_household_members: boolean | null
          has_income_proof: boolean | null
          has_social_security_card: boolean | null
          has_transportation: boolean | null
          has_valid_id: boolean | null
          health_impact: string | null
          highest_grade: string | null
          hiv_aids: boolean | null
          homeless_duration: string | null
          homelessness_cause: string | null
          hours_per_week: number | null
          housing_for_self_only: boolean | null
          housing_status: string | null
          housing_status_other: string | null
          id: string
          in_school: boolean | null
          in_vocational_training: boolean | null
          income_monthly_amount: number | null
          income_type: string | null
          last_address: string | null
          last_address_duration: string | null
          last_hospitalization_date: string | null
          living_unsheltered: boolean | null
          living_unsheltered_detail: string | null
          marital_status: string | null
          marital_status_other: string | null
          mco_number: string | null
          medicaid_number: string | null
          medical_diagnoses: string | null
          mental_health_condition: boolean | null
          mental_health_diagnoses: string | null
          mental_health_provider: string | null
          mental_health_provider_phone: string | null
          needs_accommodation: boolean | null
          pcp_name: string | null
          pcp_phone: string | null
          pcp_practice: string | null
          physical_condition: boolean | null
          physical_condition_detail: string | null
          planned_monthly_rent: number | null
          preferred_apartment_type: string | null
          preferred_housing_type: string | null
          preferred_housing_type_other: string | null
          pregnant: string | null
          present_address: string | null
          psychiatrist_name: string | null
          psychiatrist_phone: string | null
          race: string | null
          receives_benefits: boolean | null
          school_program: string | null
          ssn: string | null
          staff_signature_name: string | null
          staff_signed_date: string | null
          status: string
          substance_use: boolean | null
          substance_use_detail: string | null
          therapy_schedule: string | null
          transportation_other: string | null
          transportation_types: string[]
          updated_at: string
          us_citizen: boolean | null
          veteran: boolean | null
          vocational_program: string | null
          voucher_county: string | null
          voucher_type_other: string | null
          voucher_types: string[]
          wage: string | null
        }
        Insert: {
          accommodation_other?: string | null
          accommodations?: string[]
          additional_comments?: string | null
          additional_notes?: string | null
          alien_number?: string | null
          application_fee_amount?: number | null
          applied_for_voucher?: boolean | null
          bank_name?: string | null
          bedrooms_needed?: string | null
          benefit_monthly_amount?: number | null
          benefit_type?: string | null
          birth_city?: string | null
          birth_country?: string | null
          birth_date?: string | null
          birth_state?: string | null
          client_id: string
          client_signature_name?: string | null
          client_signed_date?: string | null
          completed_at?: string | null
          completed_by?: string | null
          counties_of_interest?: string[]
          county_other?: string | null
          created_at?: string
          created_by?: string | null
          currently_employed?: boolean | null
          developmental_disability?: boolean | null
          developmental_disability_detail?: string | null
          domestic_violence_victim?: boolean | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employer_name?: string | null
          eviction_or_record_detail?: string | null
          expense_car_insurance?: number | null
          expense_car_note?: number | null
          expense_internet?: number | null
          expense_other?: number | null
          expense_phone?: number | null
          expense_utilities?: number | null
          expenses_total?: number | null
          gender?: string | null
          has_application_fee_funds?: boolean | null
          has_bank_account?: boolean | null
          has_birth_certificate?: boolean | null
          has_eviction_or_record?: boolean | null
          has_household_members?: boolean | null
          has_income_proof?: boolean | null
          has_social_security_card?: boolean | null
          has_transportation?: boolean | null
          has_valid_id?: boolean | null
          health_impact?: string | null
          highest_grade?: string | null
          hiv_aids?: boolean | null
          homeless_duration?: string | null
          homelessness_cause?: string | null
          hours_per_week?: number | null
          housing_for_self_only?: boolean | null
          housing_status?: string | null
          housing_status_other?: string | null
          id?: string
          in_school?: boolean | null
          in_vocational_training?: boolean | null
          income_monthly_amount?: number | null
          income_type?: string | null
          last_address?: string | null
          last_address_duration?: string | null
          last_hospitalization_date?: string | null
          living_unsheltered?: boolean | null
          living_unsheltered_detail?: string | null
          marital_status?: string | null
          marital_status_other?: string | null
          mco_number?: string | null
          medicaid_number?: string | null
          medical_diagnoses?: string | null
          mental_health_condition?: boolean | null
          mental_health_diagnoses?: string | null
          mental_health_provider?: string | null
          mental_health_provider_phone?: string | null
          needs_accommodation?: boolean | null
          pcp_name?: string | null
          pcp_phone?: string | null
          pcp_practice?: string | null
          physical_condition?: boolean | null
          physical_condition_detail?: string | null
          planned_monthly_rent?: number | null
          preferred_apartment_type?: string | null
          preferred_housing_type?: string | null
          preferred_housing_type_other?: string | null
          pregnant?: string | null
          present_address?: string | null
          psychiatrist_name?: string | null
          psychiatrist_phone?: string | null
          race?: string | null
          receives_benefits?: boolean | null
          school_program?: string | null
          ssn?: string | null
          staff_signature_name?: string | null
          staff_signed_date?: string | null
          status?: string
          substance_use?: boolean | null
          substance_use_detail?: string | null
          therapy_schedule?: string | null
          transportation_other?: string | null
          transportation_types?: string[]
          updated_at?: string
          us_citizen?: boolean | null
          veteran?: boolean | null
          vocational_program?: string | null
          voucher_county?: string | null
          voucher_type_other?: string | null
          voucher_types?: string[]
          wage?: string | null
        }
        Update: {
          accommodation_other?: string | null
          accommodations?: string[]
          additional_comments?: string | null
          additional_notes?: string | null
          alien_number?: string | null
          application_fee_amount?: number | null
          applied_for_voucher?: boolean | null
          bank_name?: string | null
          bedrooms_needed?: string | null
          benefit_monthly_amount?: number | null
          benefit_type?: string | null
          birth_city?: string | null
          birth_country?: string | null
          birth_date?: string | null
          birth_state?: string | null
          client_id?: string
          client_signature_name?: string | null
          client_signed_date?: string | null
          completed_at?: string | null
          completed_by?: string | null
          counties_of_interest?: string[]
          county_other?: string | null
          created_at?: string
          created_by?: string | null
          currently_employed?: boolean | null
          developmental_disability?: boolean | null
          developmental_disability_detail?: string | null
          domestic_violence_victim?: boolean | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employer_name?: string | null
          eviction_or_record_detail?: string | null
          expense_car_insurance?: number | null
          expense_car_note?: number | null
          expense_internet?: number | null
          expense_other?: number | null
          expense_phone?: number | null
          expense_utilities?: number | null
          expenses_total?: number | null
          gender?: string | null
          has_application_fee_funds?: boolean | null
          has_bank_account?: boolean | null
          has_birth_certificate?: boolean | null
          has_eviction_or_record?: boolean | null
          has_household_members?: boolean | null
          has_income_proof?: boolean | null
          has_social_security_card?: boolean | null
          has_transportation?: boolean | null
          has_valid_id?: boolean | null
          health_impact?: string | null
          highest_grade?: string | null
          hiv_aids?: boolean | null
          homeless_duration?: string | null
          homelessness_cause?: string | null
          hours_per_week?: number | null
          housing_for_self_only?: boolean | null
          housing_status?: string | null
          housing_status_other?: string | null
          id?: string
          in_school?: boolean | null
          in_vocational_training?: boolean | null
          income_monthly_amount?: number | null
          income_type?: string | null
          last_address?: string | null
          last_address_duration?: string | null
          last_hospitalization_date?: string | null
          living_unsheltered?: boolean | null
          living_unsheltered_detail?: string | null
          marital_status?: string | null
          marital_status_other?: string | null
          mco_number?: string | null
          medicaid_number?: string | null
          medical_diagnoses?: string | null
          mental_health_condition?: boolean | null
          mental_health_diagnoses?: string | null
          mental_health_provider?: string | null
          mental_health_provider_phone?: string | null
          needs_accommodation?: boolean | null
          pcp_name?: string | null
          pcp_phone?: string | null
          pcp_practice?: string | null
          physical_condition?: boolean | null
          physical_condition_detail?: string | null
          planned_monthly_rent?: number | null
          preferred_apartment_type?: string | null
          preferred_housing_type?: string | null
          preferred_housing_type_other?: string | null
          pregnant?: string | null
          present_address?: string | null
          psychiatrist_name?: string | null
          psychiatrist_phone?: string | null
          race?: string | null
          receives_benefits?: boolean | null
          school_program?: string | null
          ssn?: string | null
          staff_signature_name?: string | null
          staff_signed_date?: string | null
          status?: string
          substance_use?: boolean | null
          substance_use_detail?: string | null
          therapy_schedule?: string | null
          transportation_other?: string | null
          transportation_types?: string[]
          updated_at?: string
          us_citizen?: boolean | null
          veteran?: boolean | null
          vocational_program?: string | null
          voucher_county?: string | null
          voucher_type_other?: string | null
          voucher_types?: string[]
          wage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_intakes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intakes_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intakes_created_by_fkey"
            columns: ["created_by"]
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
          auth_180_approved: boolean | null
          auth_180_end: string | null
          auth_180_number: string | null
          auth_180_start: string | null
          auth_30_end: string | null
          auth_30_number: string | null
          auth_30_start: string | null
          billing_tracking_start: string
          closed_date: string | null
          continuation_authorization_status: string | null
          county: string | null
          created_at: string | null
          date_of_birth: string | null
          deleted_at: string | null
          diagnosis_code: string | null
          email: string | null
          first_name: string
          field_sources: Json | null
          housing_stabilization_plan_date: string | null
          hsp_150_date: string | null
          hsp_180_date: string | null
          hsp_due_date: string | null
          hsp_submitted: boolean | null
          iat_date: string | null
          id: string
          initial_authorization_status: string | null
          insurance: string | null
          intake_completed_at: string | null
          intake_date: string | null
          intake_status: string
          last_name: string
          level_of_need: string | null
          lon_score: number | null
          mco_housing_manager: string | null
          medicaid_id: string | null
          member_id: string | null
          next_action_due_date: string | null
          njhmis_id: string | null
          notes: string | null
          phone: string | null
          reason_closed: string | null
          referral_channel: string | null
          referral_received_date: string | null
          referral_source: string | null
          referred_by: string | null
          service_type: string | null
          status: string | null
          subscriber_relationship: string | null
          updated_at: string | null
          workflow_stage: string
          workflow_stage_updated_at: string | null
        }
        Insert: {
          address?: string | null
          approval_status?: string | null
          assessment_due_date?: string | null
          assigned_employee_id?: string | null
          auth_150_end?: string | null
          auth_150_number?: string | null
          auth_150_start?: string | null
          auth_180_approved?: boolean | null
          auth_180_end?: string | null
          auth_180_number?: string | null
          auth_180_start?: string | null
          auth_30_end?: string | null
          auth_30_number?: string | null
          auth_30_start?: string | null
          billing_tracking_start?: string
          closed_date?: string | null
          continuation_authorization_status?: string | null
          county?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          diagnosis_code?: string | null
          email?: string | null
          first_name: string
          housing_stabilization_plan_date?: string | null
          hsp_150_date?: string | null
          hsp_180_date?: string | null
          hsp_due_date?: string | null
          hsp_submitted?: boolean | null
          iat_date?: string | null
          id?: string
          initial_authorization_status?: string | null
          insurance?: string | null
          intake_completed_at?: string | null
          intake_date?: string | null
          intake_status?: string
          last_name: string
          level_of_need?: string | null
          lon_score?: number | null
          mco_housing_manager?: string | null
          medicaid_id?: string | null
          member_id?: string | null
          next_action_due_date?: string | null
          njhmis_id?: string | null
          notes?: string | null
          phone?: string | null
          reason_closed?: string | null
          referral_channel?: string | null
          referral_received_date?: string | null
          referral_source?: string | null
          referred_by?: string | null
          service_type?: string | null
          status?: string | null
          subscriber_relationship?: string | null
          updated_at?: string | null
          workflow_stage?: string
          workflow_stage_updated_at?: string | null
        }
        Update: {
          address?: string | null
          approval_status?: string | null
          assessment_due_date?: string | null
          assigned_employee_id?: string | null
          auth_150_end?: string | null
          auth_150_number?: string | null
          auth_150_start?: string | null
          auth_180_approved?: boolean | null
          auth_180_end?: string | null
          auth_180_number?: string | null
          auth_180_start?: string | null
          auth_30_end?: string | null
          auth_30_number?: string | null
          auth_30_start?: string | null
          billing_tracking_start?: string
          closed_date?: string | null
          continuation_authorization_status?: string | null
          county?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          diagnosis_code?: string | null
          email?: string | null
          first_name?: string
          field_sources?: Json | null
          housing_stabilization_plan_date?: string | null
          hsp_150_date?: string | null
          hsp_180_date?: string | null
          hsp_due_date?: string | null
          hsp_submitted?: boolean | null
          iat_date?: string | null
          id?: string
          initial_authorization_status?: string | null
          insurance?: string | null
          intake_completed_at?: string | null
          intake_date?: string | null
          intake_status?: string
          last_name?: string
          level_of_need?: string | null
          lon_score?: number | null
          mco_housing_manager?: string | null
          medicaid_id?: string | null
          member_id?: string | null
          next_action_due_date?: string | null
          njhmis_id?: string | null
          notes?: string | null
          phone?: string | null
          reason_closed?: string | null
          referral_channel?: string | null
          referral_received_date?: string | null
          referral_source?: string | null
          referred_by?: string | null
          service_type?: string | null
          status?: string | null
          subscriber_relationship?: string | null
          updated_at?: string | null
          workflow_stage?: string
          workflow_stage_updated_at?: string | null
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
      document_import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          duplicate_count: number
          failed_count: number
          id: string
          imported_count: number
          manifest_file_path: string | null
          manifest_filename: string | null
          review_count: number
          status: string
          total_files: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          failed_count?: number
          id?: string
          imported_count?: number
          manifest_file_path?: string | null
          manifest_filename?: string | null
          review_count?: number
          status?: string
          total_files?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          failed_count?: number
          id?: string
          imported_count?: number
          manifest_file_path?: string | null
          manifest_filename?: string | null
          review_count?: number
          status?: string
          total_files?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_import_items: {
        Row: {
          batch_id: string
          client_form_id: string | null
          confidence: string
          created_at: string
          detected_member_id: string | null
          file_hash: string | null
          file_size: number | null
          final_client_id: string | null
          final_form_type: string | null
          final_storage_path: string | null
          id: string
          issue_code: string | null
          match_reason: string | null
          proposed_authorization_type: string | null
          proposed_client_id: string | null
          proposed_document_date: string | null
          proposed_form_type: string | null
          proposed_mco: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          source_filename: string
          source_path: string | null
          temporary_storage_path: string | null
        }
        Insert: {
          batch_id: string
          client_form_id?: string | null
          confidence?: string
          created_at?: string
          detected_member_id?: string | null
          file_hash?: string | null
          file_size?: number | null
          final_client_id?: string | null
          final_form_type?: string | null
          final_storage_path?: string | null
          id?: string
          issue_code?: string | null
          match_reason?: string | null
          proposed_authorization_type?: string | null
          proposed_client_id?: string | null
          proposed_document_date?: string | null
          proposed_form_type?: string | null
          proposed_mco?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_filename: string
          source_path?: string | null
          temporary_storage_path?: string | null
        }
        Update: {
          batch_id?: string
          client_form_id?: string | null
          confidence?: string
          created_at?: string
          detected_member_id?: string | null
          file_hash?: string | null
          file_size?: number | null
          final_client_id?: string | null
          final_form_type?: string | null
          final_storage_path?: string | null
          id?: string
          issue_code?: string | null
          match_reason?: string | null
          proposed_authorization_type?: string | null
          proposed_client_id?: string | null
          proposed_document_date?: string | null
          proposed_form_type?: string | null
          proposed_mco?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_filename?: string
          source_path?: string | null
          temporary_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_import_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "document_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_items_client_form_id_fkey"
            columns: ["client_form_id"]
            isOneToOne: false
            referencedRelation: "client_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_items_final_client_id_fkey"
            columns: ["final_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_items_proposed_client_id_fkey"
            columns: ["proposed_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_import_items_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_registry: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          effective_date: string | null
          form_type: string
          id: string
          mco: string | null
          required: boolean
          service_type: string | null
          submission_instructions: string | null
          template_path: string | null
          template_version: string | null
          updated_at: string
          workflow_purpose: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          form_type: string
          id?: string
          mco?: string | null
          required?: boolean
          service_type?: string | null
          submission_instructions?: string | null
          template_path?: string | null
          template_version?: string | null
          updated_at?: string
          workflow_purpose: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          form_type?: string
          id?: string
          mco?: string | null
          required?: boolean
          service_type?: string | null
          submission_instructions?: string | null
          template_path?: string | null
          template_version?: string | null
          updated_at?: string
          workflow_purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_template_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      njhmis_progress_notes: {
        Row: {
          client_id: string
          contact_id: string | null
          contact_method: string | null
          created_at: string
          duration_minutes: number
          employee_id: string
          entered_by: string | null
          entry_status: string
          face_to_face: boolean
          id: string
          location: string
          note_date: string
          note_text: string | null
          note_type: string
          service_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_id?: string | null
          contact_method?: string | null
          created_at?: string
          duration_minutes?: number
          employee_id: string
          entered_by?: string | null
          entry_status?: string
          face_to_face?: boolean
          id?: string
          location: string
          note_date: string
          note_text?: string | null
          note_type?: string
          service_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_id?: string | null
          contact_method?: string | null
          created_at?: string
          duration_minutes?: number
          employee_id?: string
          entered_by?: string | null
          entry_status?: string
          face_to_face?: boolean
          id?: string
          location?: string
          note_date?: string
          note_text?: string | null
          note_type?: string
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "njhmis_progress_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "njhmis_progress_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "njhmis_progress_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "njhmis_progress_notes_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      billing_rate_for_level: { Args: { p_level: string }; Returns: number }
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
      sync_client_billing_cycles: {
        Args: { p_client_id: string }
        Returns: number
      }
      sync_client_billing_cycles_authorized: {
        Args: { p_client_id: string }
        Returns: number
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
