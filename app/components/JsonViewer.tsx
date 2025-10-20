"use client";

interface JsonViewerProps {
  data: any;
  onCopy?: () => void;
}

export default function JsonViewer({ data, onCopy }: JsonViewerProps) {
  const jsonString = JSON.stringify(data, null, 2);

  // Enhanced syntax highlighting function with proper escaping
  const highlightJson = (json: string) => {
    // First, escape HTML special characters
    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const escaped = escapeHtml(json);
    
    return escaped
      // Highlight string keys (followed by :)
      .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="text-blue-400">$1</span>$2')
      // Highlight string values (not followed by :)
      .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="text-green-400">$1</span>')
      // Highlight booleans
      .replace(/\b(true|false)\b/g, '<span class="text-purple-400">$1</span>')
      // Highlight null
      .replace(/\b(null)\b/g, '<span class="text-red-400">$1</span>')
      // Highlight numbers
      .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="text-yellow-400">$1</span>');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    if (onCopy) {
      onCopy();
    }
  };

  return (
    <div className="mt-2 bg-gray-900 dark:bg-black rounded-lg border border-gray-700 overflow-hidden">
      {/* Header with copy button */}
      <div className="flex items-center justify-between bg-gray-800 dark:bg-gray-900 px-4 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          JSON Output
        </span>
        <button
          onClick={handleCopy}
          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors flex items-center gap-1"
        >
          📋 Copy
        </button>
      </div>

      {/* JSON Content */}
      <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
        <pre
          className="text-xs font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightJson(jsonString) }}
        />
      </div>

      {/* Footer with stats */}
      <div className="bg-gray-800 dark:bg-gray-900 px-4 py-2 border-t border-gray-700">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>Lines: {jsonString.split("\n").length}</span>
          <span>Size: {new Blob([jsonString]).size} bytes</span>
          {data.contacts && (
            <span className="text-blue-400 font-semibold">
              Contacts: {data.contacts.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

