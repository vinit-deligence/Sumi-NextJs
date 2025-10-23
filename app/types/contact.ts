// TypeScript interfaces converted from Python Pydantic schemas

export type Intent = "add" | "update" | "list" | "delete" | "completed" | "failed";

export interface NoteSchema {
  note: string;
  intent: Intent;
}

export interface ValidationSchema {
  missing_fields: string[];
  invalid_fields: string[];
}

export interface TaskInputSchema {
  name: string;
  intent: Intent;
  id: string;
  type: string;
  is_completed: number; // 0 or 1
  dueDate: string; // YYYY-MM-DD format
  dueDateTime: string; // ISO 8601 UTC format with Z
}

export interface TaskPairSchema {
  input: TaskInputSchema;
}

export interface AppointmentSchema {
  title: string;
  description: string;
  intent: Intent;
  id: string;
  start: string; // ISO 8601 UTC datetime with Z
  end: string; // ISO 8601 UTC datetime with Z
  location: string;
  type: string;
  appointment_type_id: number;
  host_user_id?: number | null;
}

export interface InputContactSchema {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  stage: string;
  source: string;
  intent: "add" | "update" | "list" | "delete";
  operation: string;
  notes: NoteSchema[];
  tasks: TaskPairSchema[];
  appointments: AppointmentSchema[];
  validations: ValidationSchema;
}

export interface UpdateContactSchema {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  stage?: string | null;
}

export interface ContactSchema {
  input_contact: InputContactSchema;
  update_contact: UpdateContactSchema;
  approved: boolean;
}

export interface ContactExtractionResponse {
  contacts: ContactSchema[];
  language: "spanish" | "english";
  skip_to: string; // 'list_tasks', 'list_appointments', or empty
}

