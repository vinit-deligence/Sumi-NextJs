# Features Documentation

## JSON Viewer Component

The application includes a beautiful, feature-rich JSON viewer that displays extracted contact data in a user-friendly format.

### Key Features

#### 1. Syntax Highlighting
- **Keys**: Displayed in blue
- **String values**: Displayed in green
- **Boolean values** (true/false): Displayed in purple
- **Null values**: Displayed in red
- **Numbers**: Displayed in yellow

#### 2. Interactive Display
- **Collapsible viewer**: Click "Show JSON" / "Hide JSON" to toggle
- **Scrollable content**: Both horizontal and vertical scrolling for large JSON
- **Maximum height**: 400px with scroll to prevent overwhelming the UI
- **Smooth animations**: Fade-in effects for toast notifications

#### 3. Copy Functionality
- **One-click copy**: Click the "📋 Copy" button in the header
- **Toast notification**: Brief success message appears at bottom-right
- **Preserves formatting**: Copied JSON maintains proper indentation

#### 4. Metadata Display
The footer shows:
- **Lines**: Total number of lines in the JSON
- **Size**: Response size in bytes
- **Contacts**: Number of contacts extracted (if available)

### Visual Design

#### Color Scheme
```css
Background: Dark gray (#111827 / #000000)
Border: Medium gray (#374151)
Header/Footer: Darker gray (#1F2937 / #111827)
Text: Light gray / White
```

#### Layout
- **Header**: Contains title and copy button
- **Content Area**: Scrollable JSON with syntax highlighting
- **Footer**: Metadata and statistics

### Usage in Chat

1. **Send a message** to extract contact information
2. **View summary** in the chat bubble
3. **Click "Show JSON"** to expand the viewer
4. **Review the data** with color-coded syntax
5. **Copy if needed** using the copy button
6. **Collapse** when done with "Hide JSON"

### Component Structure

```
JsonViewer
├── Header (Title + Copy Button)
├── Content (Syntax-highlighted JSON)
└── Footer (Metadata: lines, size, contacts)
```

### Props

```typescript
interface JsonViewerProps {
  data: any;              // JSON data to display
  onCopy?: () => void;    // Optional callback after copy
}
```

### Example

When you send: `"Add contact John Smith, phone 555-1234, email john@test.com"`

The JSON viewer will show:
```json
{
  "contacts": [
    {
      "input_contact": {
        "first_name": "John",
        "last_name": "Smith",
        "phone": "5551234",
        "email": "john@test.com",
        ...
      }
    }
  ],
  "language": "english",
  "skip_to": ""
}
```

With syntax highlighting:
- `"contacts"` appears in **blue**
- `"John"` appears in **green**
- `5551234` appears in **yellow**
- `"english"` appears in **green**

### Benefits

1. **Developer-Friendly**: Easy to inspect API responses
2. **User-Friendly**: No need to open browser console
3. **Professional**: Clean, modern design
4. **Functional**: Quick copy for debugging or documentation
5. **Informative**: Shows metadata about the response
6. **Accessible**: Works in light and dark modes

### Future Enhancements

Potential improvements:
- Add JSON path display on hover
- Implement collapsible nested objects
- Add search/filter functionality
- Export to file option
- Compare two JSON responses
- Validation indicators
- Schema documentation overlay

