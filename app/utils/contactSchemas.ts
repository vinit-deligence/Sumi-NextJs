// Zod schemas for structured output with LangChain
import { z } from "zod";

export const NoteSchemaZod = z.object({
  note: z.string().describe("Note content"),
  intent: z.enum(["add", "update", "list", "delete", "completed", "failed"]).describe("Note operation intent"),
});

export const ValidationSchemaZod = z.object({
  missing_fields: z.array(z.string()).describe("List of missing required fields"),
  invalid_fields: z.array(z.string()).describe("List of invalid fields"),
});

export const TaskInputSchemaZod = z.object({
  name: z.string().describe("Task name/description"),
  intent: z.enum(["add", "update", "list", "delete", "completed", "failed"]).describe("Task intent"),
  id: z.string().default("temp_task_1"),
  type: z.string().default("Follow Up"),
  is_completed: z.number().describe("0 or 1"),
  dueDate: z.string().describe("YYYY-MM-DD format"),
  dueDateTime: z.string().describe("ISO 8601 UTC format with Z"),
});

export const TaskPairSchemaZod = z.object({
  input: TaskInputSchemaZod,
});

export const AppointmentSchemaZod = z.object({
  title: z.string().describe("Appointment title"),
  description: z.string().default(""),
  intent: z.enum(["add", "update", "list", "delete", "completed", "failed"]).describe("Appointment intent"),
  id: z.string().default("temp_appt_1"),
  start: z.string().describe("ISO 8601 UTC datetime with Z"),
  end: z.string().describe("ISO 8601 UTC datetime with Z"),
  location: z.string().default(""),
  type: z.string().describe("Appointment type from available types"),
  appointment_type_id: z.number().default(0),
  host_user_id: z.number().nullable().default(null),
});

export const InputContactSchemaZod = z.object({
  id: z.string().default("temp_contact_1"),
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  stage: z.string().default("Lead"),
  source: z.string().default("sumiAgent"),
  intent: z.enum(["add", "update", "list"]).describe("Contact intent"),
  operation: z.string().default("list"),
  notes: z.array(NoteSchemaZod).default([]),
  tasks: z.array(TaskPairSchemaZod).default([]),
  appointments: z.array(AppointmentSchemaZod).default([]),
  validations: ValidationSchemaZod,
});

export const UpdateContactSchemaZod = z.object({
  first_name: z.string().nullable().default(null),
  last_name: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  stage: z.string().nullable().default(null),
});

export const ContactSchemaZod = z.object({
  input_contact: InputContactSchemaZod,
  update_contact: UpdateContactSchemaZod.default({}),
  approved: z.boolean().default(false),
});

export const ContactExtractionResponseZod = z.object({
  contacts: z.array(ContactSchemaZod).describe("List of extracted contacts with activities"),
  language: z.enum(["spanish", "english"]).describe("Detected language"),
  skip_to: z.string().default("").describe("Direct routing target: 'list_tasks', 'list_appointments', or empty"),
});

