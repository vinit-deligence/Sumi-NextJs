# LangChain.js Integration Guide

## Overview

The chatbot uses **LangChain.js** with **Custom ConversationSummaryMemory** for efficient conversation management and structured output generation. This provides intelligent memory summarization, token usage tracking, and context-aware responses.

## Key Features

### 1. Structured Output with Zod
- **Type-safe schemas** using Zod validation
- **Guaranteed JSON structure** from LLM responses
- **Automatic validation** of extracted data
- **IntelliSense support** in TypeScript

### 2. Conversation Summary Memory
- **Automatic summarization** of older messages to conserve tokens
- **Smart memory management** keeping recent messages + summary
- **Token usage tracking** per session with detailed statistics
- **Persistent conversations** across multiple queries
- **Session-based storage** using user IDs
- **In-memory storage** for development (easily swappable for Redis/DB)
- **Context-aware extraction** using conversation history

### 3. Token Usage Monitoring
- **Real-time tracking** of prompt, completion, and total tokens
- **Per-session statistics** with message counts and timestamps
- **Cost optimization** using gpt-4o-mini for summaries
- **API response includes** token usage information

### 4. Chain Architecture
- **Modular design** with LangChain chains
- **Prompt templates** with placeholders for history
- **Composable components** for easy customization
- **Streaming support** (can be enabled)

## Architecture

```
User Query
    ↓
[Frontend (page.tsx)]
    ↓ userId + message + timezone
[API Route (/api/chat)]
    ↓
[extractContactsWithLLM]
    ↓
[Load Conversation Memory]
    ├── getConversationMemory(userId)
    ├── Load summary (if exists)
    └── Load recent messages (last 4-10)
    ↓
[LangChain LLM]
    ├── System Prompt (extraction rules)
    ├── Memory Summary (as SystemMessage)
    ├── Recent History (HumanMessage + AIMessage)
    ├── ChatOpenAI (gpt-4o with structured output)
    ├── Token Usage Callbacks (track usage)
    └── ContactExtractionResponseZod (Zod schema)
    ↓
[Save to Memory]
    ├── Add HumanMessage + AIMessage
    ├── Check message count (> 10?)
    └── Summarize if needed (gpt-4o-mini)
    ↓
[Track Token Usage]
    ├── Update session stats
    └── Log usage metrics
    ↓
[API Response]
    ├── Structured JSON Response
    └── Token Usage Statistics
    ↓
[Frontend Display with JSON Viewer]
```

## Implementation Details

### Zod Schemas (`app/utils/contactSchemas.ts`)

Defines the structure for:
- **Contacts**: name, phone, email, stage
- **Appointments**: title, datetime, location, type
- **Tasks**: name, due date, completion status
- **Notes**: content and intent
- **Validations**: missing/invalid fields

Example:
```typescript
export const ContactExtractionResponseZod = z.object({
  contacts: z.array(ContactSchemaZod),
  language: z.enum(["spanish", "english"]),
  skip_to: z.string().default(""),
});
```

### Contact Extractor (`app/utils/contactExtractor.ts`)

#### Conversation Summary Memory
```typescript
// Custom memory structure
interface ConversationMemory {
  summary: string;
  recentMessages: BaseMessage[];
  messageCount: number;
  maxMessages: number;  // Default: 10
}

const conversationMemories: Record<string, ConversationMemory> = {};

function getConversationMemory(sessionId: string): ConversationMemory {
  if (!conversationMemories[sessionId]) {
    conversationMemories[sessionId] = {
      summary: '',
      recentMessages: [],
      messageCount: 0,
      maxMessages: 10,
    };
  }
  return conversationMemories[sessionId];
}
```

#### Token Usage Tracking
```typescript
interface TokenUsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  messagesCount: number;
  lastUpdated: Date;
}

const tokenUsageStats: Record<string, TokenUsageStats> = {};

function updateTokenUsage(
  sessionId: string, 
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
): void {
  const stats = getTokenUsageStats(sessionId);
  stats.totalTokens += usage.totalTokens;
  stats.promptTokens += usage.promptTokens;
  stats.completionTokens += usage.completionTokens;
  stats.messagesCount += 1;
  stats.lastUpdated = new Date();
}
```

#### Automatic Summarization
```typescript
async function summarizeConversation(
  messages: BaseMessage[], 
  sessionId: string
): Promise<string> {
  const llm = new ChatOpenAI({
    modelName: "gpt-4o-mini",  // Cheaper model for summaries
    temperature: 0,
    callbacks: [
      {
        handleLLMEnd: async (output) => {
          // Track tokens used for summarization
          if (output.llmOutput?.tokenUsage) {
            updateTokenUsage(sessionId, output.llmOutput.tokenUsage);
          }
        },
      },
    ],
  });

  const conversationText = messages
    .map((m) => `${m._getType()}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `Summarize the following conversation, preserving key contact information, activities, and context:\n\n${conversationText}\n\nSummary:`;
  
  const summary = await llm.invoke([new HumanMessage(summaryPrompt)]);
  return summary.content;
}
```

#### Memory Management
```typescript
async function saveConversationToMemory(
  sessionId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  const memory = getConversationMemory(sessionId);
  
  // Add new messages
  memory.recentMessages.push(new HumanMessage(userMessage));
  memory.recentMessages.push(new AIMessage(aiResponse));
  memory.messageCount += 2;

  // Summarize if too many messages
  if (memory.recentMessages.length > memory.maxMessages) {
    // Keep last 4 messages, summarize the rest
    const messagesToSummarize = memory.recentMessages.slice(0, -4);
    const recentMessages = memory.recentMessages.slice(-4);
    
    const newSummary = await summarizeConversation(messagesToSummarize, sessionId);
    
    memory.summary = memory.summary 
      ? `Previous summary: ${memory.summary}\n\n${newSummary}`
      : newSummary;
    memory.recentMessages = recentMessages;
  }
}
```

#### LangChain LLM Setup with Token Tracking
```typescript
// 1. Create LLM with structured output and callbacks
const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.1,
  callbacks: [
    {
      handleLLMEnd: async (output) => {
        // Track token usage
        if (output.llmOutput?.tokenUsage) {
          updateTokenUsage(userId, output.llmOutput.tokenUsage);
        }
      },
    },
  ],
}).withStructuredOutput(ContactExtractionResponseZod);

// 2. Load memory with summary and recent messages
const historyMessages = loadConversationMemory(userId);

// 3. Build messages array
const messages = [
  ["system", extractionPrompt],
  ...historyMessages,  // Includes summary as SystemMessage if exists
  ["human", `Extract contact information from: ${query}`],
];

// 4. Invoke LLM
const result = await llm.invoke(messages);

// 5. Save to memory (automatic summarization if needed)
await saveConversationToMemory(userId, query, JSON.stringify(result));
```

### User Session Management (`app/page.tsx`)

#### Session ID Generation
```typescript
const [userId] = useState(() => {
  if (typeof window !== "undefined") {
    let id = localStorage.getItem("chatUserId");
    if (!id) {
      id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chatUserId", id);
    }
    return id;
  }
  return "user_default";
});
```

#### Clear History Function
```typescript
const clearHistory = () => {
  if (confirm("Clear chat history?")) {
    setMessages([]);
    localStorage.removeItem("chatUserId");
    window.location.reload();
  }
};
```

## Benefits Over Direct OpenAI API

| Feature | Direct OpenAI API | LangChain.js |
|---------|------------------|--------------|
| **Message History** | Manual implementation | Built-in with RunnableWithMessageHistory |
| **Structured Output** | JSON parsing with try-catch | Zod validation with type safety |
| **Context Management** | Custom logic needed | Automatic history injection |
| **Type Safety** | Partial (TypeScript interfaces) | Full (Zod runtime validation) |
| **Extensibility** | Custom code for each feature | Composable chains and tools |
| **Error Handling** | Manual | Built-in retry and fallback |
| **Streaming** | Custom implementation | Native support |
| **Testing** | Harder to mock | Easy to test chains |

## Conversation Flow Examples

### Example 1: Basic Extraction
```
User: "Add contact John Smith, phone 555-1234"
  ↓
[First message in session - no history]
  ↓
Bot: "✅ Extracted: John Smith (555-1234)"
  ↓
[History saved: User message + Bot response]
```

### Example 2: Follow-up Question
```
User: "What's his email?"
  ↓
[History loaded: Previous John Smith context]
  ↓
Bot: "What's John Smith's email address?"
  ↓
User: "john@example.com"
  ↓
[Merges with existing contact from history]
  ↓
Bot: "✅ Updated: John Smith - email added"
```

### Example 3: Context-Aware Extraction
```
User: "Schedule showing with Sarah tomorrow at 2pm"
  ↓
[Creates contact + appointment]
  ↓
Bot: "✅ Showing scheduled for Sarah"
  ↓
User: "What's her phone?"
  ↓
[Knows we're talking about Sarah from history]
  ↓
Bot: "What's Sarah's phone number?"
  ↓
User: "555-5678"
  ↓
[Updates Sarah's contact with phone]
  ↓
Bot: "✅ Sarah's phone updated"
```

## Configuration Options

### Environment Variables
```bash
# Required
OPENAI_API_KEY=sk-...

# Optional (defaults shown)
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=
```

### Model Configuration
```typescript
// In contactExtractor.ts
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",      // or "gpt-4-turbo", "gpt-4"
  temperature: 0.1,               // 0.0 - 2.0
  maxTokens: undefined,           // or specific limit
  timeout: 60000,                 // 60 seconds
  maxRetries: 2,                  // Retry on failure
});
```

### History Storage Options

#### Current: In-Memory (Development)
```typescript
const messageHistories: Record<string, InMemoryChatMessageHistory> = {};
```

#### Production: Redis (Recommended)
```typescript
import { RedisChatMessageHistory } from "@langchain/redis";

function getMessageHistory(sessionId: string) {
  return new RedisChatMessageHistory({
    sessionId,
    sessionTTL: 1800, // 30 minutes
    config: {
      url: process.env.REDIS_URL,
    },
  });
}
```

#### Production: Database
```typescript
import { DynamoDBChatMessageHistory } from "@langchain/aws";

function getMessageHistory(sessionId: string) {
  return new DynamoDBChatMessageHistory({
    tableName: "ChatHistory",
    partitionKey: "SessionId",
    sessionId,
    config: {
      region: "us-east-1",
      credentials: {...},
    },
  });
}
```

## API Reference

### `extractContactsWithLLM(query, userTimezone, userId)`
Main extraction function using LangChain with conversation summary memory.

**Parameters:**
- `query` (string): User's natural language query
- `userTimezone` (string): User's timezone (default: "UTC")
- `userId` (string): Session identifier (default: "unknown")

**Returns:** `Promise<ContactExtractionResponse>`

**Example:**
```typescript
const result = await extractContactsWithLLM(
  "Add John Smith",
  "America/New_York",
  "user_12345"
);
```

### `clearChatHistory(sessionId)`
Clears conversation memory and token usage stats for a specific session.

**Parameters:**
- `sessionId` (string): Session identifier to clear

**Example:**
```typescript
clearChatHistory("user_12345");
```

### `getActiveSessions()`
Returns list of active session IDs.

**Returns:** `string[]`

**Example:**
```typescript
const sessions = getActiveSessions();
console.log(`Active sessions: ${sessions.length}`);
```

### `getSessionTokenUsage(sessionId)`
Get token usage statistics for a specific session.

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** `TokenUsageStats | null`

**Example:**
```typescript
const usage = getSessionTokenUsage("user_12345");
console.log(`Total tokens: ${usage?.totalTokens}`);
```

### `getAllTokenUsage()`
Get token usage statistics for all active sessions.

**Returns:** `Record<string, TokenUsageStats>`

**Example:**
```typescript
const allUsage = getAllTokenUsage();
Object.entries(allUsage).forEach(([sessionId, stats]) => {
  console.log(`${sessionId}: ${stats.totalTokens} tokens`);
});
```

## Monitoring and Debugging

### Enable LangSmith Tracing
```bash
# .env.local
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_api_key
LANGCHAIN_PROJECT=chatbot-prod
```

### Console Logging
The extractor logs useful information:
- 🕐 User timezone detection
- 💬 Extraction start with user ID
- 📝 Query being processed
- ✅ Success with contact count
- 🔍 Appointment details
- ❌ Errors with stack traces

### Message History Inspection
```typescript
// In browser console
const history = getMessageHistory("user_12345");
console.log(await history.getMessages());
```

## Best Practices

### 1. Session Management
- ✅ Generate unique session IDs per user
- ✅ Store session ID in localStorage or cookies
- ✅ Clear stale sessions periodically
- ❌ Don't use predictable session IDs

### 2. Memory Management
- ✅ Set TTL for message histories
- ✅ Limit history to recent N messages
- ✅ Clean up old sessions
- ❌ Don't store unlimited history in-memory

### 3. Error Handling
- ✅ Gracefully handle LLM failures
- ✅ Provide fallback responses
- ✅ Log errors for monitoring
- ❌ Don't expose error details to users

### 4. Performance
- ✅ Use gpt-4o-mini for speed and cost
- ✅ Implement request timeouts
- ✅ Consider caching common queries
- ❌ Don't make synchronous blocking calls

## Troubleshooting

### Issue: History not persisting
**Cause:** Session ID changing between requests
**Solution:** Ensure userId is consistent and stored properly

### Issue: LLM not using context
**Cause:** History placeholder not in prompt template
**Solution:** Verify `["placeholder", "{chat_history}"]` in template

### Issue: Zod validation errors
**Cause:** LLM returning unexpected structure
**Solution:** Make schema more flexible with `.optional()` and `.default()`

### Issue: Memory leak in production
**Cause:** In-memory history accumulating
**Solution:** Switch to Redis or database-backed history

## Migration from Direct OpenAI

If migrating from the previous direct OpenAI implementation:

1. **Install dependencies**:
   ```bash
   npm install @langchain/openai @langchain/core zod langchain
   ```

2. **Update imports**:
   ```typescript
   // Old
   import OpenAI from "openai";
   
   // New
   import { ChatOpenAI } from "@langchain/openai";
   import { RunnableWithMessageHistory } from "@langchain/core/runnables";
   ```

3. **Create Zod schemas** for your data structures

4. **Replace OpenAI client** with LangChain chain

5. **Update API calls** to pass userId for session management

6. **Test conversation flows** to ensure history works

## Performance Metrics

Based on `gpt-4o-mini`:
- **Average response time**: 1-2 seconds
- **Cost per request**: ~$0.0001-0.0005
- **Token usage**: 500-2000 tokens per request
- **History overhead**: Minimal (~50-200 tokens)

## Future Enhancements

Potential improvements:
- [ ] Streaming responses for real-time feedback
- [ ] Multi-turn conversation refinement
- [ ] Custom tools for CRM integration
- [ ] Vector store for RAG over past conversations
- [ ] Batch processing for multiple queries
- [ ] A/B testing different prompts
- [ ] Cost tracking and analytics

---

**Version**: 2.0 with LangChain.js  
**Last Updated**: October 2025  
**Dependencies**: @langchain/openai, @langchain/core, zod

