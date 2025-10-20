# Simple Chatbot - Next.js App

An intelligent chatbot application with AI-powered contact extraction built with Next.js, TypeScript, OpenAI, and Tailwind CSS.

## Features

- 🤖 Intelligent chatbot UI with beautiful design
- 🧠 **LangChain.js integration** with conversation memory
- 💭 **Persistent chat history** across multiple queries
- 📊 Structured JSON data extraction (contacts, appointments, tasks, notes)
- ✅ **Zod validation** for type-safe responses
- 🎨 **Pretty JSON viewer** with syntax highlighting and one-click copy
- 💬 Real-time message display with context awareness
- 🔄 Reset button to clear history and start fresh
- 🎯 Modern, responsive interface with Tailwind CSS
- 🌓 Dark mode support
- 🌍 Multi-language support (English & Spanish)
- ⚡ Fast and lightweight

## Getting Started

### Prerequisites

- Node.js 18+ installed on your machine
- npm or yarn package manager

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up your OpenAI API key:

Create a `.env.local` file in the root directory:

```bash
cp env.example .env.local
```

Then edit `.env.local` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

### Building for Production

```bash
npm run build
npm start
```

## Project Structure

```
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts       # Backend API that responds with "hello"
│   ├── globals.css            # Global styles
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Main chatbot UI component
├── public/                     # Static assets
├── next.config.ts             # Next.js configuration
├── tailwind.config.ts         # Tailwind CSS configuration
└── package.json               # Dependencies and scripts
```

## API Endpoint

### POST `/api/chat`

The chatbot backend API endpoint that extracts structured contact information from natural language using AI.

**Request:**
```json
{
  "message": "Schedule a showing with John Smith at 123 Main St tomorrow at 2pm. His phone is 555-1234.",
  "userId": "user123",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Contact information extracted successfully",
  "data": {
    "contacts": [
      {
        "input_contact": {
          "id": "temp_contact_1",
          "first_name": "John",
          "last_name": "Smith",
          "phone": "5551234",
          "email": "",
          "stage": "Lead",
          "source": "sumiAgent",
          "intent": "add",
          "operation": "add",
          "appointments": [
            {
              "title": "Property Showing",
              "start": "2025-10-21T18:00:00Z",
              "end": "2025-10-21T18:30:00Z",
              "location": "123 Main St",
              "type": "Showing",
              "intent": "add"
            }
          ],
          "tasks": [],
          "notes": [],
          "validations": {
            "missing_fields": ["email"],
            "invalid_fields": []
          }
        },
        "update_contact": {},
        "approved": false
      }
    ],
    "language": "english",
    "skip_to": ""
  },
  "timestamp": "2025-10-20T12:00:00.000Z"
}
```

### Extraction Capabilities

The AI can extract:

- **Contact Information**: Names, phone numbers, emails, stages (Lead, Prospect, Client, etc.)
- **Appointments**: Showings, consultations, meetings with datetime and location
- **Tasks**: Follow-up actions, reminders, to-dos
- **Notes**: Client preferences, background information
- **Language Detection**: Automatically detects English or Spanish
- **Intent Detection**: Add, update, delete, or list operations

## Technologies Used

- **Next.js 15** - React framework
- **TypeScript** - Type-safe JavaScript
- **LangChain.js** - LLM orchestration framework
- **OpenAI GPT-4** - AI-powered natural language processing
- **Zod** - TypeScript-first schema validation
- **Tailwind CSS** - Utility-first CSS framework
- **React 18** - UI library

## How It Works

1. User types a natural language message (e.g., "Schedule a meeting with Sarah Johnson tomorrow at 3pm")
2. Message is sent to the `/api/chat` endpoint via POST request
3. Backend uses OpenAI GPT to extract structured information:
   - Contact details (name, phone, email)
   - Appointments with datetime and location
   - Tasks and follow-up actions
   - Client notes and preferences
4. Structured JSON data is returned to the frontend
5. UI displays a formatted summary with key information
6. Click "Show JSON" button to reveal a beautiful JSON viewer with:
   - Syntax-highlighted JSON output
   - Color-coded keys, values, and data types
   - Scrollable view for large responses
   - One-click copy to clipboard
   - Metadata footer showing lines, size, and contact count

## Example Queries

Try these natural language queries:

1. **Basic Contact**: "Add contact John Smith, phone 555-1234, email john@example.com"
2. **With Appointment**: "Schedule showing with Sarah at 123 Oak St tomorrow at 2pm"
3. **With Task**: "Remind me to call Mike Johnson next Monday"
4. **With Notes**: "John prefers properties under $500K in downtown area"
5. **Spanish**: "Agregar contacto María García, teléfono 555-5678"
6. **Complex**: "Schedule buyer consultation with Robert Lee tomorrow at 10am. His email is robert@email.com. He's interested in 3-bedroom homes."

## Customization

### Modify Extraction Logic

Edit `app/utils/contactExtractor.ts` to customize:
- Available appointment types
- Contact stages
- Extraction prompts
- Timezone handling
- Post-processing logic

### Adjust UI Display

Edit `app/page.tsx` to customize how extracted data is displayed in the chat interface.

### Configure OpenAI Model

In `app/utils/contactExtractor.ts`, change the model:

```typescript
model: "gpt-4o-mini", // or "gpt-4-turbo" for better accuracy
```

