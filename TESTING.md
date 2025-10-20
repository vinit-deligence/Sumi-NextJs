# Testing Guide

## Setup for Testing

1. **Set up OpenAI API Key**:
   ```bash
   cp env.example .env.local
   ```
   
   Add your OpenAI API key to `.env.local`:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open the app**: Navigate to [http://localhost:3000](http://localhost:3000)

## Test Cases

### Test 1: Basic Contact Extraction
**Input**: "Add contact John Smith, phone 555-1234, email john@example.com"

**Expected Output**:
- Contact name: John Smith
- Phone: 5551234
- Email: john@example.com
- Stage: Lead
- Intent: add

### Test 2: Contact with Appointment
**Input**: "Schedule showing with Sarah Johnson at 123 Oak St tomorrow at 2pm"

**Expected Output**:
- Contact: Sarah Johnson
- Appointment type: Showing
- Location: 123 Oak St
- Start time: Tomorrow at 2pm (UTC)
- End time: Tomorrow at 2:30pm (UTC)

### Test 3: Contact with Task
**Input**: "Remind me to call Mike Johnson next Monday. His phone is 555-9876"

**Expected Output**:
- Contact: Mike Johnson
- Phone: 5559876
- Task: Call Mike Johnson
- Due date: Next Monday

### Test 4: Spanish Language Detection
**Input**: "Agregar contacto María García, teléfono 555-5678"

**Expected Output**:
- Language: spanish
- Contact: María García
- Phone: 5555678

### Test 5: Complex Multi-Entity Query
**Input**: "Schedule buyer consultation with Robert Lee tomorrow at 10am. His email is robert@email.com. He's interested in 3-bedroom homes."

**Expected Output**:
- Contact: Robert Lee
- Email: robert@email.com
- Appointment: Buyer Consultation at 10am
- Note: Interested in 3-bedroom homes

### Test 6: Multiple Appointments
**Input**: "Schedule showing with Tom at 123 Main St Saturday at 10am and another showing at 456 Oak Ave Sunday at 2pm"

**Expected Output**:
- Contact: Tom
- 2 appointments:
  - Showing at 123 Main St, Saturday 10am
  - Showing at 456 Oak Ave, Sunday 2pm

## Viewing Structured JSON

After each response:
1. The chatbot displays a formatted summary with key information
2. Click the "▶ Show JSON" button to expand the JSON viewer
3. View the beautifully formatted, syntax-highlighted JSON output
4. Click "📋 Copy" to copy the JSON to your clipboard
5. Check the metadata footer to see:
   - Number of lines
   - Response size in bytes
   - Number of contacts extracted
6. Click "▼ Hide JSON" to collapse the viewer

## Expected JSON Structure

```json
{
  "contacts": [
    {
      "input_contact": {
        "id": "temp_contact_1",
        "first_name": "John",
        "last_name": "Smith",
        "phone": "5551234",
        "email": "john@example.com",
        "stage": "Lead",
        "source": "sumiAgent",
        "intent": "add",
        "operation": "add",
        "appointments": [],
        "tasks": [],
        "notes": [],
        "validations": {
          "missing_fields": [],
          "invalid_fields": []
        }
      },
      "update_contact": {},
      "approved": false
    }
  ],
  "language": "english",
  "skip_to": ""
}
```

## Troubleshooting

### Error: "Failed to process request"
- **Cause**: OpenAI API key not set or invalid
- **Solution**: Check your `.env.local` file and ensure the API key is correct

### Error: Rate limit exceeded
- **Cause**: Too many requests to OpenAI API
- **Solution**: Wait a moment and try again, or upgrade your OpenAI plan

### Empty or incorrect extraction
- **Cause**: Ambiguous query or model limitation
- **Solution**: Try rephrasing the query more clearly

## Performance Notes

- Each query makes 1 API call to OpenAI
- Response time: typically 1-3 seconds
- Cost per request: ~$0.0001 - $0.001 (depending on model and query length)
- Recommended model: `gpt-4o-mini` for cost efficiency, `gpt-4-turbo` for best accuracy

