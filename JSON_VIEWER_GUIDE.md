# JSON Viewer Guide

## Overview

The chatbot now includes a beautiful, interactive JSON viewer that displays extracted contact data with syntax highlighting and advanced features.

## Visual Representation

```
┌─────────────────────────────────────────────────────────┐
│  Bot Message Bubble (Gray Background)                   │
│                                                          │
│  ✅ Extracted successfully!                             │
│                                                          │
│  Language: english                                       │
│  Contacts: 1                                             │
│                                                          │
│  Contact 1:                                              │
│    Name: John Smith                                      │
│    Phone: 5551234                                        │
│    Email: john@example.com                               │
│    Stage: Lead                                           │
│    Intent: add                                           │
│                                                          │
│  ┌────────────────────────────────────┐                 │
│  │  ▶ Show JSON                       │  <- Button      │
│  └────────────────────────────────────┘                 │
│                                                          │
│  When clicked, expands to:                               │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ▼ Hide JSON                                       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ JSON Output                          📋 Copy     │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ {                                                │   │
│  │   "contacts": [                  <- Blue Key     │   │
│  │     {                                            │   │
│  │       "input_contact": {         <- Blue Key     │   │
│  │         "first_name": "John",    <- Green Value  │   │
│  │         "last_name": "Smith",    <- Green Value  │   │
│  │         "phone": "5551234",      <- Green Value  │   │
│  │         "email": "john@...",     <- Green Value  │   │
│  │         "stage": "Lead",         <- Green Value  │   │
│  │         "intent": "add",         <- Green Value  │   │
│  │         "appointments": [],                      │   │
│  │         "tasks": [],                             │   │
│  │         "notes": []                              │   │
│  │       }                                          │   │
│  │     }                                            │   │
│  │   ],                                             │   │
│  │   "language": "english",         <- Green Value  │   │
│  │   "skip_to": ""                  <- Green Value  │   │
│  │ }                                                │   │
│  │                                                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Lines: 42  Size: 1234 bytes  Contacts: 1       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Color Scheme

### Syntax Highlighting Colors

| Element | Color | Example |
|---------|-------|---------|
| Keys | Blue (#60A5FA) | `"contacts"`, `"first_name"` |
| String Values | Green (#4ADE80) | `"John"`, `"english"` |
| Numbers | Yellow (#FBBF24) | `5551234`, `0` |
| Booleans | Purple (#C084FC) | `true`, `false` |
| Null | Red (#F87171) | `null` |
| Brackets/Syntax | White/Gray | `{`, `}`, `[`, `]`, `:`, `,` |

### Component Colors

| Component | Background | Text |
|-----------|-----------|------|
| Main Container | Dark Gray (#111827) | White |
| Header | Darker Gray (#1F2937) | Gray (#9CA3AF) |
| Footer | Darker Gray (#1F2937) | Gray (#6B7280) |
| Copy Button | Green (#059669) | White |
| Contact Count | Blue (#60A5FA) | White |

## Features Breakdown

### 1. Header Section
```
┌──────────────────────────────────────┐
│ JSON OUTPUT              📋 Copy     │
└──────────────────────────────────────┘
```
- **Left**: "JSON OUTPUT" label in uppercase
- **Right**: Copy button with clipboard emoji
- **Background**: Dark gray
- **Border**: Bottom border separating from content

### 2. Content Section
```
┌──────────────────────────────────────┐
│ {                                    │
│   "key": "value"    <- Colored       │
│   ...                                │
│ }                                    │
└──────────────────────────────────────┘
```
- **Max Height**: 384px (24rem)
- **Scrolling**: Both horizontal and vertical
- **Font**: Monospace (Monaco, Courier New)
- **Size**: 12px (0.75rem)
- **Padding**: 16px all sides
- **Background**: Pure black (#000000)

### 3. Footer Section
```
┌──────────────────────────────────────┐
│ Lines: 42  Size: 1234 bytes          │
│ Contacts: 1                          │
└──────────────────────────────────────┘
```
- **Lines**: Total line count
- **Size**: Byte size of JSON string
- **Contacts**: Number of extracted contacts (highlighted in blue)

### 4. Toast Notification
```
  ┌─────────────────────────────────┐
  │ ✓ JSON copied to clipboard!    │
  └─────────────────────────────────┘
```
- **Position**: Fixed, bottom-right corner
- **Duration**: 2 seconds
- **Animation**: Fade in from bottom
- **Background**: Green (#059669)
- **Text**: White with checkmark

## Interaction Flow

### Step-by-Step Usage

1. **Initial State**
   - User sends message
   - Bot responds with summary
   - "Show JSON" button visible

2. **Expand JSON**
   - Click "▶ Show JSON" button
   - Button changes to "▼ Hide JSON"
   - JSON viewer smoothly appears below

3. **View JSON**
   - Scroll through formatted JSON
   - Colors help identify data types
   - Read metadata in footer

4. **Copy JSON**
   - Click "📋 Copy" button in header
   - JSON copied to clipboard
   - Toast notification appears for 2 seconds
   - Success message: "✓ JSON copied to clipboard!"

5. **Collapse JSON**
   - Click "▼ Hide JSON" button
   - JSON viewer disappears
   - Button changes back to "▶ Show JSON"

## Responsive Design

### Desktop (>768px)
- Full width within message bubble
- Max width: 85% of screen
- Comfortable scrolling
- All features visible

### Tablet (768px - 1024px)
- Slightly narrower
- Horizontal scroll for long keys/values
- Touch-friendly buttons
- Same feature set

### Mobile (<768px)
- Adaptive width
- Touch-optimized buttons
- Easy scrolling
- Slightly smaller text (if needed)

## Accessibility

### Keyboard Navigation
- Tab to "Show JSON" button
- Enter/Space to toggle
- Tab to "Copy" button
- Enter/Space to copy

### Screen Readers
- Button labels are descriptive
- Toast notifications are announced
- JSON structure preserved in text

## Performance

### Optimization
- Syntax highlighting uses regex (fast)
- No external dependencies
- Lazy rendering (only when expanded)
- Efficient re-renders

### Large JSON Handling
- Max height prevents page overflow
- Scrolling maintains performance
- Size shown in footer for awareness

## Example Screenshots (Text Representation)

### Before Clicking "Show JSON"
```
┌─────────────────────────────────────┐
│ ✅ Extracted successfully!          │
│                                     │
│ Language: english                   │
│ Contacts: 1                         │
│                                     │
│ Contact 1:                          │
│   Name: John Smith                  │
│   Phone: 5551234                    │
│                                     │
│ ┌─────────────────────┐             │
│ │  ▶ Show JSON        │             │
│ └─────────────────────┘             │
└─────────────────────────────────────┘
```

### After Clicking "Show JSON"
```
┌─────────────────────────────────────┐
│ ✅ Extracted successfully!          │
│                                     │
│ [Summary content...]                │
│                                     │
│ ┌─────────────────────┐             │
│ │  ▼ Hide JSON        │             │
│ └─────────────────────┘             │
│                                     │
│ ┌───────────────────────────────┐   │
│ │ JSON OUTPUT      📋 Copy      │   │
│ ├───────────────────────────────┤   │
│ │ { "contacts": [...] }         │   │
│ │                               │   │
│ ├───────────────────────────────┤   │
│ │ Lines: 42  Contacts: 1        │   │
│ └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

### After Clicking "Copy"
```
┌─────────────────────────────────────┐
│ [Chat content...]                   │
│                                     │
│                                     │
│                                     │
│                 ┌──────────────────┐│
│                 │ ✓ JSON copied!   ││ <- Toast
│                 └──────────────────┘│
└─────────────────────────────────────┘
```

## Best Practices

### For Users
1. **Use "Show JSON" for debugging** - See exactly what the API returned
2. **Copy for documentation** - Paste into your notes or tickets
3. **Check metadata** - Verify expected number of contacts
4. **Collapse when done** - Keep chat clean and readable

### For Developers
1. **Inspect structure** - Understand API response format
2. **Test edge cases** - Look for empty arrays or missing fields
3. **Verify transformations** - Ensure data is correctly processed
4. **Share with team** - Copy/paste for bug reports or feature requests

## Technical Details

### Component Props
```typescript
interface JsonViewerProps {
  data: any;              // JSON data to display
  onCopy?: () => void;    // Optional callback after copy
}
```

### Styling
- Uses Tailwind CSS utility classes
- Custom fade-in animation in globals.css
- Dark theme optimized
- Responsive breakpoints

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- clipboard API support required
- CSS Grid/Flexbox support required
- ES6+ JavaScript support required

## Troubleshooting

### JSON not showing
- Check if `data` prop has value
- Verify button click handler
- Check browser console for errors

### Copy not working
- Requires HTTPS (or localhost)
- Check clipboard permissions
- Try keyboard shortcut as fallback

### Styling issues
- Verify Tailwind CSS is loaded
- Check dark mode preferences
- Clear browser cache

---

**Version**: 1.0  
**Last Updated**: October 2025  
**Component**: `app/components/JsonViewer.tsx`

