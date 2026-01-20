import { z } from 'zod';

// Auth validation
export const authSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
});

export const signUpSchema = authSchema.extend({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
});

// Client validation
export const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  phone: z.string().trim().regex(/^[\d\s\-\+\(\)]*$/, 'Invalid phone format').max(20).optional(),
  address: z.string().trim().max(500).optional(),
  member_id: z.string().trim().max(50).optional(),
  date_of_birth: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Note validation
export const noteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  content: z.string().trim().max(10000).optional(),
  visit_date: z.string().optional(),
});

// Calendar event validation
export const calendarEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(1000).optional(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  event_type: z.string().optional(),
});