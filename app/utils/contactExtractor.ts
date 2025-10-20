// Contact extraction utility converted from Python with LangChain.js
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { ContactExtractionResponse } from "../types/contact";
import { ContactExtractionResponseZod } from "./contactSchemas";

// Message history storage (in-memory)
// In production, use Redis or database-backed storage
const messageHistories: Record<string, InMemoryChatMessageHistory> = {};

// Function to get or create message history for a session
function getMessageHistory(sessionId: string): InMemoryChatMessageHistory {
  if (!messageHistories[sessionId]) {
    messageHistories[sessionId] = new InMemoryChatMessageHistory();
  }
  return messageHistories[sessionId];
}

/**
 * Clear chat history for a specific session
 * Useful for starting fresh conversations
 */
export function clearChatHistory(sessionId: string): void {
  if (messageHistories[sessionId]) {
    delete messageHistories[sessionId];
    console.log(`🗑️ Cleared chat history for session: ${sessionId}`);
  }
}

/**
 * Get all active session IDs
 * Useful for monitoring and cleanup
 */
export function getActiveSessions(): string[] {
  return Object.keys(messageHistories);
}

/**
 * Get UTC offset for a timezone
 */
function getUtcOffset(timezoneStr: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezoneStr,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((part) => part.type === "timeZoneName");
    return offsetPart?.value || "UTC+0";
  } catch (error) {
    console.error(`Error getting UTC offset for ${timezoneStr}:`, error);
    return "UTC+0";
  }
}

/**
 * Extract contact information from query using LLM
 * Converted from Python _extract_contacts_with_llm function
 */
export async function extractContactsWithLLM(
  query: string,
  userTimezone: string = "UTC",
  userId: string = "unknown"
): Promise<ContactExtractionResponse> {
  // Get timezone information
  const userTimezoneOffset = getUtcOffset(userTimezone);
  const currentDatetimeUtc = new Date().toISOString();

  console.log(`🕐 User timezone: ${userTimezone} (${userTimezoneOffset})`);

  // Available appointment types (simplified - in production, fetch from your system)
  const availableAppointmentTypes = [
    "Buyer Consultation",
    "Listing",
    "Showing",
  ];
  const appointmentTypesStr = availableAppointmentTypes.join(", ");

  // Available stages (simplified - in production, fetch from your CRM)
  const availableStages = [
    "Lead",
    "Prospect",
    "Client",
    "Under Contract",
    "Closed Won",
    "Trash",
  ];
  const availableStagesStr = availableStages.join(", ");

  // Create the extraction prompt (converted from Python)
  const prompt = `
You are a CRM extraction agent. Understand the user's current message dynamically, use chat history to determine context, and extract exactly what is needed.

Behavior:
- Analyze EVERY query dynamically to understand what the user is saying
- Use conversation history to determine if contacts/people mentioned are NEW or EXISTING
- For NEW contacts: intent="add", leave update_contact empty
- For EXISTING contacts: intent="update" or "list", populate update_contact if info is being changed
- Extract activities (tasks, appointments, notes) based on what's mentioned in the current query
- Maintain context from previous messages to understand references and relationships

CONTEXT RULES (use conversation history if available):
1. Query="yes/ok/sure" + Previous message asked "Would you like" → extract ONLY the approval and set approved: true
2. Query=ONLY phone/email/location (NO other details) + Previous message asked for it → extract ONLY that new field and merge with previous context; preserve other previously extracted fields; set approved: true
3. Query=COMPLETE REQUEST (has action+details) → extract ALL from current message; ignore history except for pronoun/name resolution
4. Pronouns (he/she/they) → use the most recent applicable contact name from conversation history

DYNAMIC EXAMPLES:
- Query: "Add John Smith" → NEW contact "John Smith", intent:"add", leave update_contact empty
- Query: "Update John's phone to 555-1234" → EXISTING contact "John", intent:"update", fill update_contact with phone
- Query: "Schedule meeting with John tomorrow" → EXISTING contact "John", intent:"list", leave update_contact empty, extract appointment
- Query: "Just left showing at 123 Vista Way with the Nguyens. They loved it!" → NEW contact "Nguyen", intent:"add", leave update_contact empty
- Query: "Call Sarah about the offer" → EXISTING contact "Sarah", intent:"list", leave update_contact empty, extract task
- Query: "Sarah's email is sarah@email.com" → EXISTING contact "Sarah", intent:"update", fill update_contact with email

STEP 1: ROUTING DETECTION
Analyze the query type for optimal routing:

1. PERSONAL TASK QUERIES (skip_to: "list_tasks"):
   - User asking about their own EXISTING tasks/todos
   - Questions about VIEWING/RETRIEVING the user's own work or assignments
   - Personal productivity LISTING queries
   - Examples: "What tasks do I have overdue?", "Do I have any tasks due today?", "My incomplete tasks", "Show me my upcoming tasks", "List my completed tasks"

2. PERSONAL CALENDAR QUERIES (skip_to: "list_appointments"):
   - User asking about their own EXISTING schedule/calendar
   - Questions about the user's own appointments or availability
   - Personal time management VIEWING/RETRIEVAL queries
   - Examples: "What's on my calendar for tomorrow", "Do I have any meetings today", "Am I free on Monday", "My schedule for next week", "Show me my appointments"

3. CONTACT-BASED QUERIES (skip_to: ""):
   - Creating tasks or reminders related to specific contacts/people
   - Creating/scheduling appointments WITH other people/contacts
   - Contact management (add, update, delete contacts)
   - Examples: "Remind me to call John tomorrow", "Schedule appointment with Sarah", "Add John Smith", "Update contact info"

STEP 2: CONTACT EXTRACTION (only if skip_to is empty)
If this is a contact-based query, extract ALL contacts and activities:

CRITICAL: Extract EVERY appointment, task, and note mentioned in the query. If user says "Schedule showing Saturday at 10am AND another one Friday at 2pm" = TWO separate appointments.

1. Language Detection
Analyze the ENTIRE query carefully:
- Spanish indicators: ñ, á, é, í, ó, ú, ¿, ¡, or Spanish words (agregar, añadir, llamar, cita, mañana, para, con)
- English indicators: English words/grammar (add, create, schedule, appointment, tomorrow, for, with, at)
- Mixed queries: use dominant language (>50% of words)
- Ambiguous words ("no", "si"): use context
- Output: "language": "spanish" or "english"

Preserve original wording in text fields.

2. Time & UTC Conversion
User timezone: ${userTimezone} (${userTimezoneOffset})
Current UTC time: ${currentDatetimeUtc}

CRITICAL: ALL datetime outputs must be in UTC format ending with 'Z'
- User is in ${userTimezoneOffset} timezone
- Convert user local times to UTC by applying the offset
- If user says "2pm" and is in ${userTimezoneOffset}, calculate the UTC equivalent
- Format: YYYY-MM-DDTHH:MM:SSZ (always end with Z)
- If only date provided: add T00:00:00Z
- If only one datetime: use for start time, system will auto-calculate end (30min default, 1hr for presentations)

3. Entities & Intents
Contacts: people only (no titles like Mr./Dr., no "family").
Tasks: Complete action verb + details as ONE task (e.g., "prepare CMA for 1234 Ocean View Drive").
Notes: Standalone preferences/background (budget, interests). NOT part of action items.
Appointments: scheduled live interactions (meetings, showings, consultations). Always an event at a specific datetime.

Appointment titles: "Property Showing"/"Showing at [address]", "Buyer Consultation", "Client Meeting". NEVER empty.

Intents
add: add/create/new/save/register/schedule/book/set up
update: update/change/modify/edit/fix/reschedule/move
delete: remove/cancel/clear/erase/eliminate
list: find/search/show/display/lookup

CRITICAL: Task vs Note Classification
✅ TASK: "Create task to prepare CMA for 1234 Ocean View Drive" → ONE task with full description
✅ TASK: "Schedule call" → Task to make a phone call (not appointment)
❌ WRONG: Don't split into appointment or task + note. Keep action + details together.
✅ NOTE: "Client prefers properties under $500K" → Standalone background info
✅ NOTE: "Interested in downtown area" → Preference not tied to specific action

DYNAMIC CONTACT ANALYSIS:
For EVERY query, analyze the conversation history to determine:

1. CONTACT STATUS DETECTION:
   - Check if person/contact mentioned in current query was mentioned before in chat history
   - If NEVER mentioned before → NEW contact → intent:"add", leave update_contact empty
   - If mentioned before → EXISTING contact → determine intent based on what's being changed

2. INTENT DETERMINATION FOR EXISTING CONTACTS:
   - If contact info is being changed (name, phone, email, stage) → intent:"update", fill update_contact
   - If only activities are being added (tasks, appointments, notes) → intent:"list", leave update_contact empty
   - If just referencing existing contact → intent:"list", leave update_contact empty

3. DYNAMIC EXTRACTION:
   - Extract what the user is actually saying in the current query
   - Use chat history to understand context and relationships
   - Don't assume - analyze each query individually

Available stages: ${availableStagesStr}
Extract stage if found in query, else "Lead". Use EXACT stage names from available stages list.
Common mappings: "lost/dead" → "Trash", "sold/closed/won" → "Closed Won", "client/customer" → "Client".

AVAILABLE APPOINTMENT TYPES: ${appointmentTypesStr}

CRITICAL TYPE DETECTION:
IF query contains "showing" OR "tour" OR "viewing" OR "walkthrough" → type MUST be "Showing"
IF query contains "listing presentation" OR "CMA" OR "seller meeting" → type MUST be "Listing"
OTHERWISE use "Buyer Consultation"

Type Selection Rules:
- "showing"/"tour"/"viewing"/"walkthrough"/"open house" → "Showing"
- "listing presentation"/"seller meeting"/"CMA"/"market analysis" → "Listing"  
- "buyer consultation"/"consultation"/"buyer meeting" → "Buyer Consultation"
- Use EXACT type name from available types list: ${appointmentTypesStr}

4. Multi-Items Extraction
EXTRACT ALL appointments, tasks, and notes from the query.
Multiple appointments: "another one", "second one", "also schedule" = separate appointment objects.
Each appointment = separate object with its own title, time, location.
Separate contact objects per person.

CRITICAL: 
- If current query has complete details (action + specifics) → extract ALL from current query
- If current query is ONLY yes/no OR ONLY phone/email/location → use history to merge
- NEVER return 'N/A' values if actual data exists in current query

Only include appointments/tasks/notes arrays if they are EXPLICITLY mentioned in the query.
- If query has NO appointments mentioned → appointments: []
- If query has NO tasks mentioned → tasks: []  
- If query has NO notes mentioned → notes: []

5. Classification
Appointment = scheduled meeting/showing with specific datetime where both parties attend.
Task = action requests (calls, emails, follow-ups). "Schedule call" = task, not appointment.
Note = preferences/background/interests (capture ALL preference details).

6. Hygiene
phone: digits only.
Split names; no titles/articles.
location: actual address only, strip "their home", "my office", etc.
Keep complete task descriptions together - don't split action verb from its details.
For add intents → no update block
For update/delete/list → operation:"list".

7. Auto-Approve: approved: true when query is approval response (yes/ok/sure) OR standalone phone/email follow-up. Otherwise false.

Apply context rules if conversation history is available: approval responses and phone/email follow-ups get approved: true.

Extract contacts, tasks, appointments, and notes from the user's query. Return structured JSON output.

RESPONSE FORMAT (JSON):
{
  "contacts": [
    {
      "input_contact": {
        "id": "temp_contact_1",
        "first_name": "",
        "last_name": "",
        "phone": "",
        "email": "",
        "stage": "Lead",
        "source": "sumiAgent",
        "intent": "add|update|list",
        "operation": "add|update|list",
        "notes": [{"note": "", "intent": "add"}],
        "tasks": [{"input": {"name": "", "intent": "add", "id": "temp_task_1", "type": "Follow Up", "is_completed": 0, "dueDate": "", "dueDateTime": ""}}],
        "appointments": [{"title": "", "description": "", "intent": "add", "id": "temp_appt_1", "start": "", "end": "", "location": "", "type": "", "appointment_type_id": 0, "host_user_id": null}],
        "validations": {"missing_fields": [], "invalid_fields": []}
      },
      "update_contact": {},
      "approved": false
    }
  ],
  "language": "english|spanish",
  "skip_to": ""
}
`;

  try {
    console.log(`\n=== NEW EXTRACTION REQUEST ===`);
    console.log(`💬 User ID: ${userId}`);
    console.log(`📝 Query: "${query}"`);

    // Get chat history manually
    const currentHistory = getMessageHistory(userId);
    const historyMessages = await currentHistory.getMessages();
    console.log(`📚 History before invoke: ${historyMessages.length} messages`);
    if (historyMessages.length > 0) {
      console.log(`📜 Last messages:`, historyMessages.slice(-2).map(m => ({
        type: m._getType(),
        content: typeof m.content === 'string' ? m.content.substring(0, 100) : m.content
      })));
    }

    // Initialize LangChain LLM with structured output
    const llm = new ChatOpenAI({
      modelName: "gpt-4o", // or "gpt-4-turbo" for better accuracy
      temperature: 0.1, // Low temperature for consistent extraction
      apiKey: process.env.OPENAI_API_KEY,
    }).withStructuredOutput(ContactExtractionResponseZod);

    // Build messages array with history
    const messages: any[] = [
      ["system", prompt],
      ...historyMessages, // Add existing history
      ["human", `Extract contact information from this query: ${query}`],
    ];

    console.log(`📤 Invoking LLM with ${messages.length} messages`);
    
    // Invoke LLM directly with history
    const parsedData = await llm.invoke(messages) as ContactExtractionResponse;

    // Manually save to history - add user message and assistant response
    await currentHistory.addUserMessage(query);
    await currentHistory.addAIMessage(JSON.stringify(parsedData));

    // Check history after saving
    const updatedHistory = await currentHistory.getMessages();
    console.log(`📚 History after invoke: ${updatedHistory.length} messages`);
    if (updatedHistory.length > historyMessages.length) {
      console.log(`✅ New messages added to history!`);
    } else {
      console.log(`⚠️ WARNING: No new messages added to history!`);
    }
    
    console.log(
      `✅ Extracted ${parsedData.contacts.length} contacts, language=${parsedData.language}, skip_to=${parsedData.skip_to}`
    );

    // Post-processing: validate and set defaults
    parsedData.contacts.forEach((contact, idx) => {
      // Ensure approved field exists
      if (contact.approved === undefined) {
        contact.approved = false;
      }

      const inputContact = contact.input_contact;

      // Validate contact intent
      if (!["add", "update", "list"].includes(inputContact.intent)) {
        inputContact.intent = "list";
      }

      // Set operation based on intent
      if (inputContact.intent === "add") {
        inputContact.operation = "add";
      } else if (inputContact.intent === "update") {
        inputContact.operation = "update";
      } else {
        inputContact.operation = "list";
      }

      // Ensure validations exist
      if (!inputContact.validations) {
        inputContact.validations = {
          missing_fields: [],
          invalid_fields: [],
        };
      }

      // Log appointments for debugging
      if (inputContact.appointments && inputContact.appointments.length > 0) {
        console.log(
          `🔍 Contact ${idx + 1} has ${inputContact.appointments.length} appointment(s):`
        );
        inputContact.appointments.forEach((appt, apptIdx) => {
          console.log(
            `   Appointment ${apptIdx + 1}: title='${appt.title}', type='${appt.type}', start='${appt.start}', end='${appt.end}'`
          );
        });
      }
    });

    return parsedData;
  } catch (error) {
    console.error("❌ Error extracting contact info:", error);

    // Return default empty structure on error
    return {
      contacts: [
        {
          input_contact: {
            id: "temp_1",
            first_name: "",
            last_name: "",
            phone: "",
            email: "",
            stage: "Lead",
            source: "sumiAgent",
            intent: "list",
            operation: "list",
            notes: [],
            tasks: [],
            appointments: [],
            validations: {
              missing_fields: [],
              invalid_fields: [],
            },
          },
          update_contact: {},
          approved: false,
        },
      ],
      language: "english",
      skip_to: "",
    };
  }
}

