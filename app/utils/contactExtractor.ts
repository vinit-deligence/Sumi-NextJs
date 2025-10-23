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

  // Get chat history for context
  const currentHistory = getMessageHistory(userId);
  const historyMessages = await currentHistory.getMessages();
  const chatHistoryContent = historyMessages
    .filter(msg => msg._getType() === 'human')
    .map(msg => typeof msg.content === 'string' ? msg.content : '')
    .join('\n');

  // Create the extraction prompt (converted from Python)
  const prompt = `
You are a CRM extraction agent. Understand the user's current message dynamically, use chat history to determine context, and extract exactly what is needed.

CHAT HISTORY CONTEXT:
${chatHistoryContent ? `Previous conversations:\n${chatHistoryContent}\n` : 'No previous conversations.'}

CRITICAL: You MUST use the chat history context above to understand existing contacts and their information.

CRITICAL DELETE INTENT DETECTION - CHECK FIRST:
- If query contains "cancel" → intent MUST be "delete"
- If query contains "delete" → intent MUST be "delete"  
- If query contains "remove" → intent MUST be "delete"
- These words ALWAYS mean delete intent, regardless of other words in the query

CRITICAL CHAT HISTORY RULE - MUST FOLLOW FIRST:
- If user mentions ANY activity (task, appointment, note) but NO specific contact name → use the MOST RECENT contact from chat history
- If user says "Create task", "Add task", "Schedule call", "Prepare CMA" without mentioning contact name → use the MOST RECENT contact from history
- NEVER create a new contact with empty name/phone/email when there's a contact in history
- ALWAYS preserve contact information from chat history unless explicitly changed

STEP 0: INTENT DETECTION - MUST BE DONE FIRST
BEFORE doing anything else, analyze the query for intent keywords:

1. DELETE INTENT (intent:"delete") - HIGHEST PRIORITY:
   - Keywords: "cancel", "delete", "remove", "clear", "erase", "eliminate"
   - Examples: "cancel last task", "delete appointment", "remove contact"
   - CRITICAL: If query contains ANY of these words → intent:"delete" (ALWAYS)
   - CRITICAL: "cancel" and "delete" are the strongest delete indicators
   - CRITICAL: This intent takes priority over all other intents

2. UPDATE INTENT (intent:"update"):
   - Keywords: "update", "change", "modify", "edit", "fix"
   - Examples: "update phone", "change email", "modify appointment"
   - CRITICAL: If query contains ANY of these words → intent:"update" (ALWAYS)

3. ADD INTENT (intent:"add"):
   - Keywords: "add", "create", "new", "schedule", "book", "set up"
   - Examples: "add task", "create appointment", "schedule call"
   - CRITICAL: If query contains ANY of these words → intent:"add" (ALWAYS)

4. LIST INTENT (intent:"list"):
   - Keywords: "show", "list", "find", "display", "get", "check"
   - Examples: "show appointments", "list contacts", "find tasks"
   - CRITICAL: If query contains ANY of these words → intent:"list" (ALWAYS)

Behavior:
- Analyze EVERY query dynamically to understand what the user is saying
- Use conversation history to determine if contacts/people mentioned are NEW or EXISTING
- For NEW contacts: intent="add", leave update_contact empty
- For EXISTING contacts: intent="update" or "list", populate update_contact if info is being changed
- Extract activities (tasks, appointments, notes) based on what's mentioned in the current query
- Maintain context from previous messages to understand references and relationships
- CRITICAL: When user says "last one", "last task", "last appointment" → this means the MOST RECENT activity from chat history
- CRITICAL: "Last one" refers to the most recently added item, NOT the first one in the list

CONTEXT RULES (use conversation history if available):
1. Query="yes/ok/sure" + Previous message asked "Would you like" → extract ONLY the approval and set approved: true
2. Query=ONLY phone/email/location (NO other details) + Previous message asked for it → extract ONLY that new field and merge with previous context; preserve other previously extracted fields; set approved: true
3. Query=COMPLETE REQUEST (has action+details) → extract ALL from current message; ignore history except for pronoun/name resolution
4. Pronouns (he/she/they) → use the most recent applicable contact name from conversation history

DYNAMIC EXAMPLES:
- Query: "Add John Smith" → NEW contact "John Smith", intent:"add", leave update_contact empty
- Query: "Update John's phone to 555-1234" → EXISTING contact "John", intent:"update", fill update_contact with phone
- Query: "Schedule meeting with John tomorrow" → EXISTING contact "John", intent:"add", leave update_contact empty, extract appointment
- Query: "Just left showing at 123 Vista Way with the Nguyens. They loved it!" → NEW contact "Nguyen", intent:"add", leave update_contact empty
- Query: "Call Sarah about the offer" → EXISTING contact "Sarah", intent:"add", leave update_contact empty, extract task
- Query: "Sarah's email is sarah@email.com" → EXISTING contact "Sarah", intent:"update", fill update_contact with email
- Query: "Schedule another showing for the Zillow lead next week" → EXISTING contact from Zillow, intent:"add", extract appointment
- Query: "Update Frank's phone to 555-1234" → EXISTING contact "Frank", intent:"update", fill update_contact
- Query: "Call the 858-555-2222 number" → EXISTING contact by phone, intent:"add", extract task
- Query: "Schedule call for tomorrow" → EXISTING contact (most recent from history), intent:"add", extract task
- Query: "Add task to prepare CMA" → EXISTING contact (most recent from history), intent:"add", extract task
- Query: "Schedule appointment next week" → EXISTING contact (most recent from history), intent:"add", extract appointment
- Query: "Send email reminder" → EXISTING contact (most recent from history), intent:"add", extract task
- Query: "Create task to prepare CMA for 1234 Ocean View Drive by Monday" → EXISTING contact (most recent from history), intent:"add", extract task
- Query: "Send comps to Sarah Williams by end of day Friday" → EXISTING contact "Sarah Williams" from history, intent:"add", extract task
- Query: "Call Frank" → EXISTING contact "Frank Peterson", phone: "858-555-2222", email: "frank@email.com" (from history), intent:"add", extract task
- Query: "Schedule showing with the 858-555-2222 number" → EXISTING contact by phone, use EXACT name/email from history, intent:"add", extract appointment
- Query: "Send email to john@email.com" → EXISTING contact by email, use EXACT name/phone from history, intent:"add", extract task
- Query: "Cancel the appointment" → EXISTING contact, intent:"delete", extract appointment to delete
- Query: "Delete the task" → EXISTING contact, intent:"delete", extract task to delete
- Query: "Remove the contact" → EXISTING contact, intent:"delete", extract contact to delete
- Query: "Cancel last task" → EXISTING contact, intent:"delete", extract MOST RECENT task for deletion
- Query: "Delete last appointment" → EXISTING contact, intent:"delete", extract MOST RECENT appointment for deletion
- Query: "Remove last one" → EXISTING contact, intent:"delete", extract MOST RECENT activity for deletion
- Query: "Update Frank's phone to 555-1234" → EXISTING contact "Frank", intent:"update", fill update_contact
- Query: "Show me Frank's appointments" → EXISTING contact "Frank", intent:"list", leave update_contact empty
- Query: "Find all tasks for John" → EXISTING contact "John", intent:"list", leave update_contact empty

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

Intents - CRITICAL: Always detect intent correctly based on keywords:

ADD INTENT (intent:"add"):
- Keywords: add, create, new, save, register, schedule, book, set up, plan, arrange
- Examples: "Schedule call", "Add task", "Create appointment", "Book showing"

UPDATE INTENT (intent:"update"):  
- Keywords: update, change, modify, edit, fix, reschedule, move, adjust
- Examples: "Update phone", "Change email", "Modify appointment", "Fix address"

DELETE INTENT (intent:"delete"):
- Keywords: delete, remove, cancel, clear, erase, eliminate, drop, stop
- Examples: "Cancel appointment", "Delete task", "Remove contact", "Clear schedule"

LIST INTENT (intent:"list"):
- Keywords: find, search, show, display, lookup, view, get, retrieve, check
- Examples: "Show appointments", "Find contact", "Get schedule", "Check tasks"

CRITICAL INTENT DETECTION RULES - MUST FOLLOW THESE RULES:
1. FIRST: Check for DELETE keywords: "cancel", "delete", "remove", "clear", "erase", "eliminate"
   - If ANY of these words appear → intent:"delete" (ALWAYS)
2. SECOND: Check for UPDATE keywords: "update", "change", "modify", "edit", "fix"
   - If ANY of these words appear → intent:"update" (ALWAYS)
3. THIRD: Check for ADD keywords: "add", "create", "new", "schedule", "book", "set up"
   - If ANY of these words appear → intent:"add" (ALWAYS)
4. FOURTH: Check for LIST keywords: "show", "list", "find", "display", "get", "check"
   - If ANY of these words appear → intent:"list" (ALWAYS)

CRITICAL EXAMPLES:
- "cancel last task" → intent:"delete" (contains "cancel")
- "delete the appointment" → intent:"delete" (contains "delete")
- "remove contact" → intent:"delete" (contains "remove")
- "update phone" → intent:"update" (contains "update")
- "schedule call" → intent:"add" (contains "schedule")
- "show appointments" → intent:"list" (contains "show")

CHAT HISTORY EXAMPLES:
- Previous: "Met Sarah Williams... phone 619-555-1234" → Contact: Sarah Williams
- Current: "Create task to prepare CMA" → Use Sarah Williams from history, intent:"add"
- Result: Sarah Williams with new task, NOT new empty contact

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
   - Look for: exact name matches, phone number matches, email matches, or pronoun references (he/she/they)
   - If NEVER mentioned before → NEW contact → intent:"add", leave update_contact empty
   - If mentioned before → EXISTING contact → determine intent based on what's being changed
   - Use fuzzy matching for names (Frank = Frank Peterson, John = John Smith)

2. INTENT DETERMINATION FOR EXISTING CONTACTS:
   - CRITICAL: Analyze the query keywords to determine intent:
   - If query contains "cancel", "delete", "remove" → intent:"delete", leave update_contact empty
   - If query contains "update", "change", "modify" → intent:"update", fill update_contact
   - If query contains "add", "create", "schedule" → intent:"add", leave update_contact empty
   - If query contains "show", "list", "find" → intent:"list", leave update_contact empty
   - CRITICAL: Intent is determined by ACTION keywords, not by contact status

3. DYNAMIC EXTRACTION:
   - Extract what the user is actually saying in the current query
   - Use chat history to understand context and relationships
   - Don't assume - analyze each query individually
   - CRITICAL: When user says "another", "also", "also schedule", "the lead", "the client" → this refers to EXISTING contact from history
- CRITICAL: When user mentions phone numbers, emails, or partial names → check if they match existing contacts in history
- CRITICAL: When user says "Zillow lead", "the buyer", "the seller" → this refers to EXISTING contact from history
- CRITICAL: When user says "last one", "last task", "last appointment" → this refers to the MOST RECENT activity from chat history
- CRITICAL: "Last one" means the most recently added task/appointment/note, NOT the first one
- CRITICAL: For "cancel last task" → find the MOST RECENT task from chat history and mark it for deletion
- CRITICAL: For "delete last appointment" → find the MOST RECENT appointment from chat history and mark it for deletion

4. PERSISTENT CONTACT CONTEXT - CRITICAL RULES:
   - CRITICAL: If contact exists in chat history, ALWAYS use the EXACT SAME name, phone, email from history
   - CRITICAL: NEVER change contact info unless user explicitly provides NEW information
- CRITICAL: If user says "Schedule call" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
- CRITICAL: If user says "Add task" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
- CRITICAL: If user says "Schedule appointment" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
- CRITICAL: If user says "Create task" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
- CRITICAL: If user says "Prepare CMA" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
- CRITICAL: If user says "Send comps" without mentioning contact name → use MOST RECENT contact's name, phone, email from history
   - CRITICAL: Preserve ALL contact details (first_name, last_name, phone, email, stage, source) from history
   - CRITICAL: Only extract NEW activities (tasks, appointments, notes) for existing contacts
   - CRITICAL: If user mentions "Frank" and Frank exists in history → use Frank's EXACT name, phone, email from history
   - CRITICAL: If user mentions phone "858-555-2222" and this phone exists in history → use the EXACT name, email from that contact
   - CRITICAL: If user mentions email "john@email.com" and this email exists in history → use the EXACT name, phone from that contact

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
- CRITICAL: For EXISTING contacts, ALWAYS preserve first_name, last_name, phone, email, stage, source from chat history
- CRITICAL: Only extract NEW activities (tasks, appointments, notes) for existing contacts
- CRITICAL: If user doesn't mention contact name but mentions activity → use MOST RECENT contact from history
- CRITICAL: If user says "Schedule call" without name → use most recent contact's name, phone, email from history
- CRITICAL: If user says "Create task" without name → use most recent contact's name, phone, email from history
- CRITICAL: If user says "Prepare CMA" without name → use most recent contact's name, phone, email from history
- CRITICAL: NEVER change contact name, phone, or email unless user explicitly provides NEW information
- CRITICAL: When no contact name is mentioned, ALWAYS use the most recent contact from chat history
- CRITICAL: If user mentions "Frank" → use Frank's EXACT name, phone, email from history (don't change them)
- CRITICAL: If user mentions phone number → use the EXACT name, email from that contact in history
- CRITICAL: If user mentions email → use the EXACT name, phone from that contact in history

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

CRITICAL: Before returning the response, double-check that the intent is correct:
- If query contains "cancel", "delete", "remove" → intent MUST be "delete" (HIGHEST PRIORITY)
- If query contains "update", "change", "modify" → intent MUST be "update"  
- If query contains "add", "create", "schedule" → intent MUST be "add"
- If query contains "show", "list", "find" → intent MUST be "list"

CRITICAL DELETE INTENT VERIFICATION:
- "cancel last task" → intent:"delete" (contains "cancel")
- "delete the appointment" → intent:"delete" (contains "delete")
- "remove contact" → intent:"delete" (contains "remove")
- "can you cancel" → intent:"delete" (contains "cancel")

CRITICAL: Before returning the response, double-check chat history usage:
- If no contact name mentioned but activity mentioned → use MOST RECENT contact from history
- NEVER return empty contact (no name/phone/email) when there's a contact in history
- ALWAYS preserve contact details from chat history

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

    console.log(`📚 History before invoke: ${historyMessages.length} messages`);
    if (historyMessages.length > 0) {
      console.log(`📜 Last messages:`, historyMessages.slice(-2).map(m => ({
        type: m._getType(),
        content: typeof m.content === 'string' ? m.content.substring(0, 100) : m.content
      })));
    }
    
    console.log(`📋 Chat history content: ${chatHistoryContent.substring(0, 200)}...`);

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

