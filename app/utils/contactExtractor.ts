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

  // Analyze chat history to find the most recent contact with activities
  let mostRecentActiveContact = null;
  let mostRecentActivity = null;
  let mostRecentContactInfo = null;
  let firstContactWithActivities = null;
  let firstContactInfo = null;
  
  // Check if current query mentions a new contact name (but not addresses)
  const currentQueryContactMatch = query.match(/([A-Z][a-z]+(?:\.)? [A-Z][a-z]+)/);
  let currentQueryContact = currentQueryContactMatch ? currentQueryContactMatch[1] : null;
  
  // Filter out addresses and locations (like "Pine Ave", "Elm St")
  if (currentQueryContact && (
    currentQueryContact.includes('Ave') || 
    currentQueryContact.includes('St') || 
    currentQueryContact.includes('Rd') || 
    currentQueryContact.includes('Blvd') ||
    currentQueryContact.includes('Dr') ||
    currentQueryContact.includes('Way') ||
    currentQueryContact.includes('Ln')
  )) {
    currentQueryContact = null; // Don't treat addresses as contact names
  }
  
  // Track all contacts from conversation in chronological order
  const allContactsWithActivities = [];
  
  // Parse ALL messages to get chronological contact list
  for (let i = 0; i < historyMessages.length; i++) {
    const msg = historyMessages[i];
    if (msg._getType() === 'ai' && typeof msg.content === 'string') {
      try {
        const parsedResponse = JSON.parse(msg.content);
        if (parsedResponse.contacts && parsedResponse.contacts.length > 0) {
          const contact = parsedResponse.contacts[0].input_contact;
          const contactName = `${contact.first_name} ${contact.last_name}`.trim();
          if (contactName && contactName !== ' ') {
            allContactsWithActivities.push({
              contact: contactName,
              info: contact,
              timestamp: i,
              hasActivities: contact.tasks && contact.tasks.length > 0 || contact.appointments && contact.appointments.length > 0
            });
          }
        }
      } catch (e) {
        // Not JSON, continue
      }
    }
  }
  
  // Set first contact (chronologically first)
  if (allContactsWithActivities.length > 0) {
    const firstContact = allContactsWithActivities[0];
    firstContactWithActivities = firstContact.contact;
    firstContactInfo = firstContact.info;
  }
  
  // Set most recent contact (chronologically last)
  if (allContactsWithActivities.length > 0) {
    const lastContact = allContactsWithActivities[allContactsWithActivities.length - 1];
    mostRecentActiveContact = lastContact.contact;
    mostRecentContactInfo = lastContact.info;
  }
  
  // If current query has a new contact, update most recent to that contact
  if (currentQueryContact) {
    mostRecentActiveContact = currentQueryContact;
    mostRecentContactInfo = null; // Clear old contact info
  }
  
  // Fallback: Parse chat history to find the most recent contact with activities
  if (!mostRecentActiveContact) {
    const historyLines = chatHistoryContent.split('\n').filter(line => line.trim());
    for (let i = historyLines.length - 1; i >= 0; i--) {
      const line = historyLines[i];
      // Look for patterns that indicate contact with activities
      if (line.includes('task') || line.includes('appointment') || line.includes('call') || line.includes('schedule') || line.includes('Mrs.') || line.includes('Mr.')) {
        // Extract contact name from this line - improved pattern matching
        const nameMatch = line.match(/(?:Met|New lead|Contact|Call|Schedule|Mrs\.|Mr\.).*?([A-Z][a-z]+(?:\.)? [A-Z][a-z]+)/);
        if (nameMatch) {
          mostRecentActiveContact = nameMatch[1];
          mostRecentActivity = line;
          break;
        }
        // Also try to match single names followed by activities
        const singleNameMatch = line.match(/([A-Z][a-z]+(?:\.)? [A-Z][a-z]+).*?(?:task|appointment|call|schedule)/);
        if (singleNameMatch) {
          mostRecentActiveContact = singleNameMatch[1];
          mostRecentActivity = line;
          break;
        }
      }
    }
  }

  // Create the extraction prompt (converted from Python)
  const prompt = `
Extract contact information from: "${query}"

CONTEXT:
${chatHistoryContent ? `History: ${chatHistoryContent}` : 'No history'}
Most Recent: ${mostRecentActiveContact || 'None'}
First: ${firstContactWithActivities || 'None'}

RULES:
1. If query mentions specific name → use that contact (HIGHEST PRIORITY)
2. If "last task/appointment" → use Most Recent contact  
3. If "first task/appointment" → use First contact
4. If no name mentioned → use Most Recent contact
5. CRITICAL: When no contact name is mentioned, ALWAYS use the most recent contact from chat history
6. CRITICAL: NEVER create empty contacts when there's a contact in history

CRITICAL: When query mentions a specific contact name, IGNORE chat history and use that contact.

EXAMPLE: If query is "Update Jane Miller's email" → use Jane Miller, NOT Sarah Williams from history.
EXAMPLE: If query is "Schedule showing at 789 Pine Ave" → use Sarah Williams from history, NOT create empty contact.

INTENTS:
- DELETE: "cancel", "delete", "remove" → intent:"delete"
- UPDATE: "update", "change", "modify" → intent:"update"
- ADD: "add", "create", "schedule" → intent:"add" 
- LIST: "show", "list", "find" → intent:"list"

EXTRACTION:
- Extract contacts, tasks, appointments, notes from query
- Use chat history for context when no specific contact mentioned
- Return JSON with contacts array, language, skip_to fields
- For existing contacts, preserve name/phone/email from history
- For new contacts, extract from current query

RESPONSE FORMAT:
{
  "contacts": [{"input_contact": {"id": "temp_contact_1", "first_name": "", "last_name": "", "phone": "", "email": "", "stage": "Lead", "source": "sumiAgent", "intent": "add", "operation": "add", "notes": [], "tasks": [], "appointments": [], "validations": {"missing_fields": [], "invalid_fields": []}}, "update_contact": {}, "approved": false}],
  "language": "english",
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
    console.log(`🎯 Most recent active contact: ${mostRecentActiveContact || 'None'}`);
    console.log(`📝 Most recent activity: ${mostRecentActivity || 'None'}`);
    console.log(`🥇 First active contact: ${firstContactWithActivities || 'None'}`);
    console.log(`📊 All contacts in order: ${allContactsWithActivities.map(c => c.contact).join(' → ')}`);
    if (currentQueryContact) {
      console.log(`🆕 Current query contact: ${currentQueryContact} (will override most recent)`);
    }
    if (mostRecentContactInfo) {
      console.log(`👤 Most recent contact info: ${JSON.stringify(mostRecentContactInfo, null, 2)}`);
    }
    if (firstContactInfo) {
      console.log(`👤 First contact info: ${JSON.stringify(firstContactInfo, null, 2)}`);
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

