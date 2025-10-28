// Contact extraction utility converted from Python with LangChain.js
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ContactExtractionResponse, AppointmentSchema, NoteSchema } from "../types/contact";
import { ContactExtractionResponseZod } from "./contactSchemas";

// Structured Context for better continuation handling
interface StructuredContext {
  pendingAppointments: AppointmentSchema[];
  pendingTasks: Array<{
    name: string;
    intent: string;
    id: string;
    type: string;
    is_completed: number;
    dueDate: string;
    dueDateTime: string;
  }>;
  pendingNotes: NoteSchema[];
  hasAskForMoreInfo: boolean;
  lastAsk: string;
  disambiguationType: 'contact' | 'appointment' | 'task' | 'note' | 'other' | null;
  disambiguationItems: any[]; // Items user is choosing from
  knownContacts: Array<{
    name: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    lastSeen?: number; // Timestamp when contact was last seen
  }>;
  lastOperation: {
    intent: string;
    contactName: string;
    timestamp: string;
  } | null;
}

// Custom Conversation Summary Memory Implementation with Structured Context
interface ConversationMemory {
  summary: string;
  recentMessages: BaseMessage[];
  messageCount: number;
  maxMessages: number;
  structuredContext: StructuredContext;
}

// Conversation memory storage (in-memory)
// In production, use Redis or database-backed storage
const conversationMemories: Record<string, ConversationMemory> = {};

// Token usage tracking per session
interface TokenUsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  messagesCount: number;
  lastUpdated: Date;
}

const tokenUsageStats: Record<string, TokenUsageStats> = {};

// Function to summarize conversation history
async function summarizeConversation(messages: BaseMessage[], sessionId: string): Promise<string> {
  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini", // Use smaller model for summaries to save costs
      temperature: 0,
      apiKey: process.env.OPENAI_API_KEY,
      callbacks: [
        {
          handleLLMEnd: async (output) => {
            if (output.llmOutput?.tokenUsage) {
              const usage = output.llmOutput.tokenUsage;
              updateTokenUsage(sessionId, {
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens: usage.totalTokens || 0,
              });
            }
          },
        },
      ],
    });

    const conversationText = messages
      .map((m) => `${m._getType()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    const summaryPrompt = `Summarize the following conversation, preserving key contact information, activities, and context:\n\n${conversationText}\n\nSummary:`;
    
    const summary = await llm.invoke([new HumanMessage(summaryPrompt)]);
    return typeof summary.content === 'string' ? summary.content : JSON.stringify(summary.content);
  } catch (error) {
    console.error('Error summarizing conversation:', error);
    return 'Previous conversation history (summarization failed)';
  }
}

// Function to get or create conversation memory for a session
function getConversationMemory(sessionId: string): ConversationMemory {
  if (!conversationMemories[sessionId]) {
    conversationMemories[sessionId] = {
      summary: '',
      recentMessages: [],
      messageCount: 0,
      maxMessages: 10, // Keep last 10 messages before summarizing
      structuredContext: {
        pendingAppointments: [],
        pendingTasks: [],
        pendingNotes: [],
        hasAskForMoreInfo: false,
        lastAsk: '',
        disambiguationType: null,
        disambiguationItems: [],
        knownContacts: [],
        lastOperation: null,
      },
    };
    
    console.log(`🧠 Created new conversation memory for session: ${sessionId}`);
  }
  return conversationMemories[sessionId];
}

/**
 * Extract structured context from AI response
 */
function extractStructuredContext(aiResponse: ContactExtractionResponse): Partial<StructuredContext> {
  const context: Partial<StructuredContext> = {
    pendingAppointments: [],
    pendingTasks: [],
    pendingNotes: [],
    hasAskForMoreInfo: !!aiResponse.ask_for_more_info,
    lastAsk: aiResponse.ask_for_more_info || '',
    disambiguationType: null,
    disambiguationItems: [],
    knownContacts: [],
  };

  // Extract contacts and their activities
  if (aiResponse.contacts && aiResponse.contacts.length > 0) {
    aiResponse.contacts.forEach(contact => {
      const input = contact.input_contact;
      
      // Add to known contacts if has name
      if (input.first_name || input.last_name) {
        const contactName = `${input.first_name} ${input.last_name}`.trim();
        if (contactName) {
          // Check if contact already exists and update it, or add new one
          const existingIndex = context.knownContacts!.findIndex(c => c.name === contactName);
          const contactInfo = {
            name: contactName,
            firstName: input.first_name,
            lastName: input.last_name,
            phone: input.phone,
            email: input.email,
            lastSeen: Date.now(), // Track when contact was last seen
          };
          
          if (existingIndex >= 0) {
            // Update existing contact with new info and timestamp
            context.knownContacts![existingIndex] = contactInfo;
          } else {
            // Add new contact
            context.knownContacts!.push(contactInfo);
          }
        }
      }

      // If ask_for_more_info exists, determine type and save items
      if (aiResponse.ask_for_more_info) {
        const askLower = aiResponse.ask_for_more_info.toLowerCase();
        
        // Determine disambiguation type
        if (askLower.includes('appointment')) {
          context.disambiguationType = 'appointment';
          context.disambiguationItems = [...(input.appointments || [])];
        } else if (askLower.includes('task')) {
          context.disambiguationType = 'task';
          context.disambiguationItems = [...(input.tasks || [])];
        } else if (askLower.includes('contact')) {
          context.disambiguationType = 'contact';
        } else {
          // Default: pending activities (for contact details scenario)
          context.pendingAppointments = [...(input.appointments || [])];
          context.pendingTasks = [...(input.tasks?.map(t => t.input) || [])];
          context.pendingNotes = [...(input.notes || [])];
        }
      }
    });
  }

  return context;
}

/**
 * Get the most recent contact from known contacts
 */
function getMostRecentContact(knownContacts: Array<{name: string; lastSeen?: number}>): string | null {
  if (knownContacts.length === 0) return null;
  
  // Sort by lastSeen timestamp (most recent first)
  const sortedContacts = [...knownContacts].sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  return sortedContacts[0].name;
}

/**
 * Get the first contact from known contacts (chronologically first)
 */
function getFirstContact(knownContacts: Array<{name: string; lastSeen?: number}>): string | null {
  if (knownContacts.length === 0) return null;
  
  // Sort by lastSeen timestamp (oldest first)
  const sortedContacts = [...knownContacts].sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));
  return sortedContacts[0].name;
}

/**
 * Merge structured context with memory
 */
function mergeStructuredContext(memory: ConversationMemory, newContext: Partial<StructuredContext>): void {
  if (!memory.structuredContext) {
    memory.structuredContext = {
      pendingAppointments: [],
      pendingTasks: [],
      pendingNotes: [],
      hasAskForMoreInfo: false,
      lastAsk: '',
      disambiguationType: null,
      disambiguationItems: [],
      knownContacts: [],
      lastOperation: null,
    };
  }

  // Update with new context
  if (newContext.hasAskForMoreInfo) {
    // Keep pending items or disambiguation items
    memory.structuredContext.pendingAppointments = newContext.pendingAppointments || [];
    memory.structuredContext.pendingTasks = newContext.pendingTasks || [];
    memory.structuredContext.pendingNotes = newContext.pendingNotes || [];
    memory.structuredContext.disambiguationType = newContext.disambiguationType || null;
    memory.structuredContext.disambiguationItems = newContext.disambiguationItems || [];
    memory.structuredContext.hasAskForMoreInfo = true;
    memory.structuredContext.lastAsk = newContext.lastAsk || '';
  } else {
    // Clear all pending items
    memory.structuredContext.pendingAppointments = [];
    memory.structuredContext.pendingTasks = [];
    memory.structuredContext.pendingNotes = [];
    memory.structuredContext.disambiguationType = null;
    memory.structuredContext.disambiguationItems = [];
    memory.structuredContext.hasAskForMoreInfo = false;
    memory.structuredContext.lastAsk = '';
  }

  // Merge known contacts (avoid duplicates)
  if (newContext.knownContacts) {
    newContext.knownContacts.forEach(newContact => {
      const exists = memory.structuredContext.knownContacts.some(
        existing => existing.name === newContact.name
      );
      if (!exists && newContact.name) {
        memory.structuredContext.knownContacts.push(newContact);
      }
    });
  }
}

/**
 * Build structured context string for LLM prompt
 */
function buildStructuredContextPrompt(context: StructuredContext): string {
  const parts: string[] = [];

  // Known contacts
  if (context.knownContacts.length > 0) {
    parts.push('KNOWN CONTACTS:');
    
    // Get most recent and first contacts
    const mostRecentContact = getMostRecentContact(context.knownContacts);
    const firstContact = getFirstContact(context.knownContacts);
    
    context.knownContacts.forEach((contact, idx) => {
      const details: string[] = [];
      if (contact.phone) details.push(`phone: ${contact.phone}`);
      if (contact.email) details.push(`email: ${contact.email}`);
      const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
      
      // Mark most recent and first contacts
      let indicators = '';
      if (contact.name === mostRecentContact) indicators += ' (MOST RECENT)';
      if (contact.name === firstContact) indicators += ' (FIRST)';
      
      parts.push(`${idx + 1}. ${contact.name}${detailsStr}${indicators}`);
    });
    
    // Add context information
    if (mostRecentContact) {
      parts.push(`MOST RECENT CONTACT: ${mostRecentContact}`);
    }
    if (firstContact && firstContact !== mostRecentContact) {
      parts.push(`FIRST CONTACT: ${firstContact}`);
    }
    
    // Debug: Show contact order
    console.log(`🔍 Contact tracking:`, {
      total: context.knownContacts.length,
      mostRecent: mostRecentContact,
      first: firstContact,
      allContacts: context.knownContacts.map(c => ({ name: c.name, lastSeen: c.lastSeen }))
    });
    
    parts.push('');
  }

  // Pending operations or disambiguation
  if (context.hasAskForMoreInfo) {
    parts.push('PENDING OPERATION:');
    parts.push(`Question: "${context.lastAsk}"`);
    parts.push('');
    
    // Disambiguation items (user choosing from these)
    if (context.disambiguationType && context.disambiguationItems.length > 0) {
      parts.push(`Choosing ${context.disambiguationType} (${context.disambiguationItems.length} options):`);
      context.disambiguationItems.forEach((item: any, idx: number) => {
        if (context.disambiguationType === 'appointment') {
          const loc = item.location ? ` at ${item.location}` : '';
          parts.push(`  ${idx + 1}. ${item.title}${loc} - ${item.start}`);
        } else if (context.disambiguationType === 'task') {
          parts.push(`  ${idx + 1}. ${item.name} - due ${item.dueDate}`);
        }
      });
      parts.push('');
    }
    
    // Pending activities (waiting for contact)
    if (context.pendingAppointments.length > 0) {
      parts.push(`Pending appointments (${context.pendingAppointments.length}):`);
      context.pendingAppointments.forEach((appt, idx) => {
        const loc = appt.location ? ` at ${appt.location}` : '';
        parts.push(`  ${idx + 1}. ${appt.title}${loc} - ${appt.start}`);
      });
      parts.push('');
    }
    
    if (context.pendingTasks.length > 0) {
      parts.push(`Pending tasks: ${context.pendingTasks.length}`);
      parts.push('');
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No previous context';
}

// Save conversation to memory with automatic summarization and structured context
async function saveConversationToMemory(
  sessionId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  const memory = getConversationMemory(sessionId);
  
  // Parse AI response to extract structured context
  try {
    const parsedResponse: ContactExtractionResponse = JSON.parse(aiResponse);
    const newContext = extractStructuredContext(parsedResponse);
    mergeStructuredContext(memory, newContext);
    
    console.log(`📋 Structured context updated:`, {
      pendingAppointments: memory.structuredContext.pendingAppointments.length,
      pendingTasks: memory.structuredContext.pendingTasks.length,
      hasAsk: memory.structuredContext.hasAskForMoreInfo,
      knownContacts: memory.structuredContext.knownContacts.length,
    });
  } catch (error) {
    console.error('Failed to parse AI response for structured context:', error);
  }
  
  // Add new messages
  memory.recentMessages.push(new HumanMessage(userMessage));
  memory.recentMessages.push(new AIMessage(aiResponse));
  memory.messageCount += 2;

  // If we have too many messages, summarize older ones
  if (memory.recentMessages.length > memory.maxMessages) {
    console.log(`🔄 Summarizing conversation for session ${sessionId} (${memory.recentMessages.length} messages)`);
    
    // Take messages to summarize (keep last 4 messages as recent)
    const messagesToSummarize = memory.recentMessages.slice(0, -4);
    const recentMessages = memory.recentMessages.slice(-4);
    
    // Create new summary
    const oldSummary = memory.summary ? `Previous summary: ${memory.summary}\n\n` : '';
    const conversationToSummarize = messagesToSummarize;
    const newSummary = await summarizeConversation(conversationToSummarize, sessionId);
    
    memory.summary = oldSummary + newSummary;
    memory.recentMessages = recentMessages;
    
    console.log(`✅ Conversation summarized. Summary length: ${memory.summary.length} chars, Recent messages: ${memory.recentMessages.length}`);
  }
}

// Load conversation memory as messages
function loadConversationMemory(sessionId: string): BaseMessage[] {
  const memory = getConversationMemory(sessionId);
  const messages: BaseMessage[] = [];
  
  // Add summary as system message if exists
  if (memory.summary) {
    messages.push(new SystemMessage(`Conversation summary: ${memory.summary}`));
  }
  
  // Add recent messages
  messages.push(...memory.recentMessages);
  
  return messages;
}

// Initialize or get token usage stats
function getTokenUsageStats(sessionId: string): TokenUsageStats {
  if (!tokenUsageStats[sessionId]) {
    tokenUsageStats[sessionId] = {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      messagesCount: 0,
      lastUpdated: new Date(),
    };
  }
  return tokenUsageStats[sessionId];
}

// Update token usage stats
function updateTokenUsage(sessionId: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }): void {
  const stats = getTokenUsageStats(sessionId);
  stats.totalTokens += usage.totalTokens;
  stats.promptTokens += usage.promptTokens;
  stats.completionTokens += usage.completionTokens;
  stats.messagesCount += 1;
  stats.lastUpdated = new Date();
  
  console.log(`📊 Token Usage [${sessionId}]: Total=${stats.totalTokens}, Prompt=${stats.promptTokens}, Completion=${stats.completionTokens}, Messages=${stats.messagesCount}`);
}

/**
 * Clear chat history for a specific session
 * Useful for starting fresh conversations
 */
export function clearChatHistory(sessionId: string): void {
  if (conversationMemories[sessionId]) {
    delete conversationMemories[sessionId];
    console.log(`🗑️ Cleared conversation memory for session: ${sessionId}`);
  }
  if (tokenUsageStats[sessionId]) {
    delete tokenUsageStats[sessionId];
    console.log(`🗑️ Cleared token usage stats for session: ${sessionId}`);
  }
}

/**
 * Get all active session IDs
 * Useful for monitoring and cleanup
 */
export function getActiveSessions(): string[] {
  return Object.keys(conversationMemories);
}

/**
 * Get token usage statistics for a session
 */
export function getSessionTokenUsage(sessionId: string): TokenUsageStats | null {
  return tokenUsageStats[sessionId] || null;
}

/**
 * Get token usage for all sessions
 */
export function getAllTokenUsage(): Record<string, TokenUsageStats> {
  return { ...tokenUsageStats };
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

  // Get conversation memory for context
  const memory = getConversationMemory(userId);
  
  // Load memory (includes summary and recent messages)
  const historyMessages = loadConversationMemory(userId);
  
  // Build structured context prompt from memory
  const structuredContextPrompt = buildStructuredContextPrompt(memory.structuredContext);
  
  console.log(`🧠 Loaded conversation memory with ${historyMessages.length} messages (${memory.summary ? 'with summary' : 'no summary'})`);
  console.log(`📋 Structured context:`, {
    knownContacts: memory.structuredContext.knownContacts.length,
    pendingAppointments: memory.structuredContext.pendingAppointments.length,
    pendingTasks: memory.structuredContext.pendingTasks.length,
    hasAsk: memory.structuredContext.hasAskForMoreInfo,
  });

  // Create the extraction prompt with structured context
  const prompt = `
Extract contact information from: "${query}"

STRUCTURED CONTEXT:
${structuredContextPrompt}

RULES:
1. If query mentions specific name → use that contact (HIGHEST PRIORITY)
2. If KNOWN CONTACTS exist → use them for context
3. For operations on "last appointment/task" → use MOST RECENT CONTACT
4. For operations on "first appointment/task" → use FIRST CONTACT
5. NEVER create empty contacts when known contacts exist
6. If no name mentioned → use MOST RECENT CONTACT

INTENTS:
- DELETE: "cancel", "delete", "remove" → intent:"delete"
- UPDATE: "update", "change", "modify" → intent:"update"
- ADD: "add", "create", "schedule" → intent:"add" 
- LIST: "show", "list", "find" → intent:"list"

FIELD PRESERVATION: When referencing existing tasks/appointments, ALWAYS preserve ALL original fields (title, start, end, location, description, type, id, etc.). Look at the LAST AI RESPONSE in chat history to get current appointments/tasks. Only change intent and update specific fields mentioned.

CONTINUATION HANDLING (CRITICAL): If STRUCTURED CONTEXT shows PENDING OPERATION:
1. User is responding to the question in "Question asked"
2. Extract contact details from current query (name, phone, or email)
3. Attach ALL pending appointments/tasks/notes to this contact
4. Clear ask_for_more_info field
5. Return complete contact with all pending items
Example: PENDING OPERATION shows 2 pending appointments + user provides "Sarah Williams" → Return Sarah Williams WITH those 2 appointments attached

AMBIGUITY HANDLING - Set ask_for_more_info:
1. Multiple contacts exist and query doesn't specify which
2. Multiple appointments/tasks and query says "the appointment/task" → INCLUDE ALL in response, ask which
3. CRITICAL: Creating appointments/tasks/notes but first_name AND last_name are empty AND no known contacts exist → ask_for_more_info="Please provide contact details (name, phone, or email) to link these activities."
4. Query unclear or missing info

DISAMBIGUATION: When user says "first/1/second/2/both/all" referring to appointments/tasks, extract the FULL LIST from the most recent AI response in chat history, select the item(s), preserve ALL fields, and apply only the operation (delete/update) to selected item(s).

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
  "skip_to": "",
  "ask_for_more_info": ""
}
`;

  try {
    console.log(`\n=== NEW EXTRACTION REQUEST ===`);
    console.log(`💬 User ID: ${userId}`);
    console.log(`📝 Query: "${query}"`);

    const historyLength = historyMessages.length;
    console.log(`📚 History: ${historyLength} messages`);
    console.log(`📋 Structured Context Preview:`, structuredContextPrompt.substring(0, 300) + (structuredContextPrompt.length > 300 ? '...' : ''));

    // Initialize LangChain LLM with structured output and callbacks for token tracking
    const llm = new ChatOpenAI({
      modelName: "gpt-4o", // or "gpt-4-turbo" for better accuracy
      temperature: 0.1, // Low temperature for consistent extraction
      apiKey: process.env.OPENAI_API_KEY,
      callbacks: [
        {
          handleLLMEnd: async (output) => {
            // Track token usage from LLM response
            if (output.llmOutput?.tokenUsage) {
              const usage = output.llmOutput.tokenUsage;
              updateTokenUsage(userId, {
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens: usage.totalTokens || 0,
              });
            }
          },
        },
      ],
    }).withStructuredOutput(ContactExtractionResponseZod);

    // Build messages array with history
    const messages: any[] = [
      ["system", prompt],
      ...historyMessages, // Add existing history (includes summary as system message if present)
      ["human", `Extract contact information from this query: ${query}`],
    ];

    console.log(`📤 Invoking LLM with ${messages.length} messages`);
    
    // Invoke LLM directly with history
    const parsedData = await llm.invoke(messages) as ContactExtractionResponse;

    // Save conversation to memory (this will automatically summarize if needed)
    await saveConversationToMemory(userId, query, JSON.stringify(parsedData));

    // Check memory after saving
    const updatedMemory = getConversationMemory(userId);
    const updatedHistory = loadConversationMemory(userId);
    const updatedLength = updatedHistory.length;
    console.log(`📚 Memory after invoke: ${updatedLength} messages`);
    if (updatedLength > historyLength) {
      console.log(`✅ New messages added to conversation memory!`);
    } else {
      console.log(`🔄 Memory was summarized to conserve tokens`);
    }
    console.log(`📊 Total messages in session: ${updatedMemory.messageCount}, Summary: ${updatedMemory.summary ? 'Yes' : 'No'}`);
    
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

