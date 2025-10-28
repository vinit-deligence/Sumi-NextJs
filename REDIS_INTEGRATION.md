# Redis Integration for Conversation Memory

## Overview

This guide shows how to replace the in-memory conversation storage with **Redis** for production deployments. Redis provides persistent, scalable storage with automatic TTL (time-to-live) support.

## Benefits of Redis

- ✅ **Persistent storage** - Survives server restarts
- ✅ **Scalable** - Works across multiple server instances
- ✅ **Automatic cleanup** - TTL-based expiration
- ✅ **Fast** - Sub-millisecond access times
- ✅ **Production-ready** - Battle-tested in production

## Installation

### 1. Install Redis Client

```bash
npm install ioredis
```

### 2. Install Redis Server (Local Development)

**On Windows:**
```bash
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**On macOS:**
```bash
brew install redis
brew services start redis
```

**On Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Using Docker:**
```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

## Implementation

### Option 1: Full Redis Implementation (Recommended)

Create a new file `app/utils/redisMemory.ts`:

```typescript
import Redis from 'ioredis';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

// Redis client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

// Interface for conversation memory
interface ConversationMemory {
  summary: string;
  recentMessages: Array<{
    type: string;
    content: string;
  }>;
  messageCount: number;
  maxMessages: number;
}

// Token usage stats interface
interface TokenUsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  messagesCount: number;
  lastUpdated: string;
}

// TTL in seconds (30 minutes default)
const MEMORY_TTL = parseInt(process.env.MEMORY_TTL || '1800');
const TOKEN_STATS_TTL = parseInt(process.env.TOKEN_STATS_TTL || '3600');

/**
 * Get conversation memory from Redis
 */
export async function getConversationMemory(sessionId: string): Promise<ConversationMemory> {
  const key = `conversation:${sessionId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return {
      summary: '',
      recentMessages: [],
      messageCount: 0,
      maxMessages: 10,
    };
  }
  
  return JSON.parse(data);
}

/**
 * Save conversation memory to Redis
 */
export async function saveConversationMemory(
  sessionId: string,
  memory: ConversationMemory
): Promise<void> {
  const key = `conversation:${sessionId}`;
  await redis.setex(key, MEMORY_TTL, JSON.stringify(memory));
}

/**
 * Summarize conversation messages
 */
async function summarizeConversation(
  messages: Array<{ type: string; content: string }>,
  sessionId: string,
  updateTokenUsage: (sessionId: string, usage: any) => Promise<void>
): Promise<string> {
  try {
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
      apiKey: process.env.OPENAI_API_KEY,
      callbacks: [
        {
          handleLLMEnd: async (output) => {
            if (output.llmOutput?.tokenUsage) {
              const usage = output.llmOutput.tokenUsage;
              await updateTokenUsage(sessionId, {
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
      .map((m) => `${m.type}: ${m.content}`)
      .join('\n');

    const summaryPrompt = `Summarize the following conversation, preserving key contact information, activities, and context:\n\n${conversationText}\n\nSummary:`;
    
    const summary = await llm.invoke([new HumanMessage(summaryPrompt)]);
    return typeof summary.content === 'string' ? summary.content : JSON.stringify(summary.content);
  } catch (error) {
    console.error('Error summarizing conversation:', error);
    return 'Previous conversation history (summarization failed)';
  }
}

/**
 * Convert stored messages to BaseMessage objects
 */
function convertToBaseMessages(messages: Array<{ type: string; content: string }>): BaseMessage[] {
  return messages.map((m) => {
    switch (m.type) {
      case 'human':
        return new HumanMessage(m.content);
      case 'ai':
        return new AIMessage(m.content);
      case 'system':
        return new SystemMessage(m.content);
      default:
        return new HumanMessage(m.content);
    }
  });
}

/**
 * Load conversation memory as BaseMessage array
 */
export async function loadConversationMemory(sessionId: string): Promise<BaseMessage[]> {
  const memory = await getConversationMemory(sessionId);
  const messages: BaseMessage[] = [];
  
  // Add summary as system message if exists
  if (memory.summary) {
    messages.push(new SystemMessage(`Conversation summary: ${memory.summary}`));
  }
  
  // Add recent messages
  const baseMessages = convertToBaseMessages(memory.recentMessages);
  messages.push(...baseMessages);
  
  return messages;
}

/**
 * Save conversation to memory with automatic summarization
 */
export async function saveConversationToMemory(
  sessionId: string,
  userMessage: string,
  aiResponse: string,
  updateTokenUsage: (sessionId: string, usage: any) => Promise<void>
): Promise<void> {
  const memory = await getConversationMemory(sessionId);
  
  // Add new messages
  memory.recentMessages.push({ type: 'human', content: userMessage });
  memory.recentMessages.push({ type: 'ai', content: aiResponse });
  memory.messageCount += 2;

  // If we have too many messages, summarize older ones
  if (memory.recentMessages.length > memory.maxMessages) {
    console.log(`🔄 Summarizing conversation for session ${sessionId} (${memory.recentMessages.length} messages)`);
    
    // Take messages to summarize (keep last 4 messages as recent)
    const messagesToSummarize = memory.recentMessages.slice(0, -4);
    const recentMessages = memory.recentMessages.slice(-4);
    
    // Create new summary
    const oldSummary = memory.summary ? `Previous summary: ${memory.summary}\n\n` : '';
    const newSummary = await summarizeConversation(messagesToSummarize, sessionId, updateTokenUsage);
    
    memory.summary = oldSummary + newSummary;
    memory.recentMessages = recentMessages;
    
    console.log(`✅ Conversation summarized. Summary length: ${memory.summary.length} chars, Recent messages: ${memory.recentMessages.length}`);
  }
  
  // Save to Redis
  await saveConversationMemory(sessionId, memory);
}

/**
 * Get token usage stats from Redis
 */
export async function getTokenUsageStats(sessionId: string): Promise<TokenUsageStats | null> {
  const key = `tokens:${sessionId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }
  
  return JSON.parse(data);
}

/**
 * Update token usage stats in Redis
 */
export async function updateTokenUsage(
  sessionId: string,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
): Promise<void> {
  const key = `tokens:${sessionId}`;
  const stats = await getTokenUsageStats(sessionId) || {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    messagesCount: 0,
    lastUpdated: new Date().toISOString(),
  };
  
  stats.totalTokens += usage.totalTokens;
  stats.promptTokens += usage.promptTokens;
  stats.completionTokens += usage.completionTokens;
  stats.messagesCount += 1;
  stats.lastUpdated = new Date().toISOString();
  
  await redis.setex(key, TOKEN_STATS_TTL, JSON.stringify(stats));
  
  console.log(`📊 Token Usage [${sessionId}]: Total=${stats.totalTokens}, Prompt=${stats.promptTokens}, Completion=${stats.completionTokens}, Messages=${stats.messagesCount}`);
}

/**
 * Clear conversation memory and token stats
 */
export async function clearChatHistory(sessionId: string): Promise<void> {
  const conversationKey = `conversation:${sessionId}`;
  const tokenKey = `tokens:${sessionId}`;
  
  await redis.del(conversationKey, tokenKey);
  console.log(`🗑️ Cleared conversation memory and token stats for session: ${sessionId}`);
}

/**
 * Get all active session IDs
 */
export async function getActiveSessions(): Promise<string[]> {
  const keys = await redis.keys('conversation:*');
  return keys.map(key => key.replace('conversation:', ''));
}

/**
 * Get all token usage stats
 */
export async function getAllTokenUsage(): Promise<Record<string, TokenUsageStats>> {
  const keys = await redis.keys('tokens:*');
  const result: Record<string, TokenUsageStats> = {};
  
  for (const key of keys) {
    const sessionId = key.replace('tokens:', '');
    const data = await redis.get(key);
    if (data) {
      result[sessionId] = JSON.parse(data);
    }
  }
  
  return result;
}

/**
 * Cleanup old sessions (manual cleanup function)
 */
export async function cleanupOldSessions(): Promise<void> {
  const sessions = await getActiveSessions();
  let cleaned = 0;
  
  for (const sessionId of sessions) {
    const stats = await getTokenUsageStats(sessionId);
    if (stats) {
      const age = Date.now() - new Date(stats.lastUpdated).getTime();
      const maxAge = MEMORY_TTL * 1000; // Convert to milliseconds
      
      if (age > maxAge) {
        await clearChatHistory(sessionId);
        cleaned++;
      }
    }
  }
  
  console.log(`🧹 Cleaned up ${cleaned} old sessions`);
}

// Export Redis client for advanced usage
export { redis };
```

### Option 2: Update Existing contactExtractor.ts

Replace the in-memory storage in `app/utils/contactExtractor.ts`:

```typescript
// At the top of the file, replace the imports and storage
import { 
  getConversationMemory,
  loadConversationMemory,
  saveConversationToMemory,
  updateTokenUsage,
  getTokenUsageStats as getRedisTokenUsageStats,
  getAllTokenUsage as getRedisAllTokenUsage,
  clearChatHistory as clearRedisHistory,
  getActiveSessions as getRedisActiveSessions,
} from './redisMemory';

// Remove these old declarations:
// const conversationMemories: Record<string, ConversationMemory> = {};
// const tokenUsageStats: Record<string, TokenUsageStats> = {};

// Update the exported functions to use Redis versions:
export async function clearChatHistory(sessionId: string): Promise<void> {
  await clearRedisHistory(sessionId);
}

export async function getActiveSessions(): Promise<string[]> {
  return await getRedisActiveSessions();
}

export async function getSessionTokenUsage(sessionId: string) {
  return await getRedisTokenUsageStats(sessionId);
}

export async function getAllTokenUsage() {
  return await getRedisAllTokenUsage();
}

// In extractContactsWithLLM function, replace memory loading:
const historyMessages = await loadConversationMemory(userId);

// Replace memory saving:
await saveConversationToMemory(userId, query, JSON.stringify(parsedData), updateTokenUsage);
```

## Environment Variables

Add to your `.env.local`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password_if_needed
REDIS_DB=0

# Memory TTL in seconds (30 minutes)
MEMORY_TTL=1800

# Token stats TTL in seconds (1 hour)
TOKEN_STATS_TTL=3600

# OpenAI API Key
OPENAI_API_KEY=sk-your-key
```

## Production Redis Options

### Option A: Redis Cloud (Recommended)

**1. Redis Cloud (redis.com):**
```bash
# Free tier: 30MB, perfect for development
# Sign up at: https://redis.com/try-free/

# Get connection string
REDIS_HOST=redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your_password
```

**2. AWS ElastiCache:**
```bash
# Managed Redis on AWS
# More expensive but fully managed

REDIS_HOST=myredis.abc123.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
```

**3. Azure Cache for Redis:**
```bash
# Managed Redis on Azure

REDIS_HOST=myredis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your_password
```

**4. Upstash (Serverless Redis):**
```bash
# Serverless Redis with free tier
# Sign up at: https://upstash.com

REDIS_HOST=your-region.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your_token
```

### Option B: Docker Compose for Development

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    container_name: sumi-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

Start Redis:
```bash
docker-compose up -d
```

## Migration from In-Memory

### Step 1: Backup Current Sessions

Before migrating, you might want to export current sessions:

```typescript
// Create a migration script: scripts/migrate-to-redis.ts
import { redis } from '@/app/utils/redisMemory';

async function migrateToRedis() {
  // If you have any data to migrate, add it here
  console.log('Migration complete');
}

migrateToRedis();
```

### Step 2: Update Imports

Replace all references to the old memory functions with Redis versions.

### Step 3: Test

```bash
npm run dev
```

Test the application to ensure Redis is working correctly.

## Monitoring and Debugging

### Check Redis Connection

```typescript
// In your app
import { redis } from '@/app/utils/redisMemory';

redis.ping().then(() => {
  console.log('✅ Redis is connected');
}).catch((err) => {
  console.error('❌ Redis connection failed:', err);
});
```

### View Redis Data (CLI)

```bash
# Connect to Redis CLI
redis-cli

# List all keys
KEYS *

# Get a specific conversation
GET conversation:user_12345

# Get token stats
GET tokens:user_12345

# Check TTL
TTL conversation:user_12345

# Delete a key
DEL conversation:user_12345

# Clear all data (careful!)
FLUSHDB
```

### Monitor Redis with GUI Tools

- **RedisInsight** (Free, recommended): https://redis.com/redis-enterprise/redis-insight/
- **Medis** (macOS): https://github.com/luin/medis
- **RedisDesktopManager**: https://github.com/RedisInsight/RedisInsight

## Performance Considerations

### 1. Connection Pooling

`ioredis` automatically handles connection pooling. For high-traffic apps:

```typescript
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  // Optional: connection pool settings
  lazyConnect: false,
  keepAlive: 30000,
});
```

### 2. Pipeline Operations

For bulk operations, use pipelines:

```typescript
export async function clearMultipleSessions(sessionIds: string[]): Promise<void> {
  const pipeline = redis.pipeline();
  
  sessionIds.forEach(sessionId => {
    pipeline.del(`conversation:${sessionId}`);
    pipeline.del(`tokens:${sessionId}`);
  });
  
  await pipeline.exec();
  console.log(`🗑️ Cleared ${sessionIds.length} sessions`);
}
```

### 3. Compression (Optional)

For large summaries, add compression:

```bash
npm install pako
```

```typescript
import pako from 'pako';

function compress(data: string): string {
  const compressed = pako.deflate(data, { to: 'string' });
  return Buffer.from(compressed).toString('base64');
}

function decompress(data: string): string {
  const buffer = Buffer.from(data, 'base64');
  return pako.inflate(buffer, { to: 'string' });
}
```

## Error Handling

### Graceful Degradation

```typescript
export async function getConversationMemory(sessionId: string): Promise<ConversationMemory> {
  try {
    const key = `conversation:${sessionId}`;
    const data = await redis.get(key);
    
    if (!data) {
      return getDefaultMemory();
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Redis error, falling back to default memory:', error);
    return getDefaultMemory();
  }
}

function getDefaultMemory(): ConversationMemory {
  return {
    summary: '',
    recentMessages: [],
    messageCount: 0,
    maxMessages: 10,
  };
}
```

## Automatic Cleanup Job

Add a cleanup cron job:

```typescript
// app/api/cleanup/route.ts
import { cleanupOldSessions } from '@/app/utils/redisMemory';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await cleanupOldSessions();
    return NextResponse.json({ success: true, message: 'Cleanup completed' });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ success: false, error: 'Cleanup failed' }, { status: 500 });
  }
}
```

Set up a cron job:
```bash
# Every hour
curl http://localhost:3000/api/cleanup
```

Or use Vercel Cron (vercel.json):
```json
{
  "crons": [{
    "path": "/api/cleanup",
    "schedule": "0 * * * *"
  }]
}
```

## Testing

### Unit Tests

```typescript
// __tests__/redisMemory.test.ts
import { 
  saveConversationMemory, 
  getConversationMemory 
} from '@/app/utils/redisMemory';

describe('Redis Memory', () => {
  it('should save and retrieve conversation', async () => {
    const memory = {
      summary: 'Test summary',
      recentMessages: [],
      messageCount: 0,
      maxMessages: 10,
    };
    
    await saveConversationMemory('test_123', memory);
    const retrieved = await getConversationMemory('test_123');
    
    expect(retrieved.summary).toBe('Test summary');
  });
});
```

## Troubleshooting

### Issue: Connection timeout
**Solution:** Check Redis server is running and firewall allows port 6379

### Issue: ECONNREFUSED
**Solution:** Verify REDIS_HOST and REDIS_PORT are correct

### Issue: Data not persisting
**Solution:** Check TTL settings and ensure Redis is configured for persistence

### Issue: High memory usage
**Solution:** Reduce MEMORY_TTL or implement compression

## Summary

✅ **Production-ready** - Redis handles millions of operations  
✅ **Persistent** - Survives server restarts  
✅ **Scalable** - Works across multiple instances  
✅ **Automatic cleanup** - TTL-based expiration  
✅ **Easy migration** - Drop-in replacement for in-memory storage  
✅ **Cost-effective** - Free tier available on multiple providers  

---

**Next Steps:**
1. Choose a Redis provider (Redis Cloud recommended for quick start)
2. Install `ioredis` package
3. Create `redisMemory.ts` file
4. Update environment variables
5. Test locally
6. Deploy to production

**Recommended for Production:**
- Use Redis Cloud or AWS ElastiCache
- Set appropriate TTLs (30 min for conversations, 1 hour for stats)
- Enable Redis persistence (AOF or RDB)
- Monitor Redis memory usage
- Set up automatic cleanup cron job

