"use client";

import { useState } from "react";
import JsonViewer from "./components/JsonViewer";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  data?: any; // Structured data from API
  showJson?: boolean; // Flag to show/hide JSON
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId] = useState(() => {
    // Generate or retrieve user session ID
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

  const toggleJsonView = (messageId: number) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, showJson: !msg.showJson } : msg
      )
    );
  };

  const clearHistory = () => {
    if (confirm("Clear chat history? This will start a fresh conversation.")) {
      setMessages([]);
      localStorage.removeItem("chatUserId");
      window.location.reload();
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      text: input,
      sender: "user",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    console.log(`📤 Sending message with userId: ${userId}`);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          message: input,
          userId: userId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        }),
      });

      const data = await response.json();

      // Create bot message with structured data
      let botText = data.message || "Response received";
      
      // If extraction was successful, format a nice response
      if (data.success && data.data) {
        const extractionData = data.data;
        botText = `✅ Extracted successfully!\n\nLanguage: ${extractionData.language}\nContacts: ${extractionData.contacts.length}`;
        
        // Add contact details if available
        if (extractionData.contacts.length > 0) {
          extractionData.contacts.forEach((contact: any, idx: number) => {
            const inputContact = contact.input_contact;
            botText += `\n\nContact ${idx + 1}:`;
            if (inputContact.first_name || inputContact.last_name) {
              botText += `\n  Name: ${inputContact.first_name} ${inputContact.last_name}`;
            }
            if (inputContact.phone) {
              botText += `\n  Phone: ${inputContact.phone}`;
            }
            if (inputContact.email) {
              botText += `\n  Email: ${inputContact.email}`;
            }
            botText += `\n  Stage: ${inputContact.stage}`;
            botText += `\n  Intent: ${inputContact.intent}`;
            
            if (inputContact.appointments && inputContact.appointments.length > 0) {
              botText += `\n  Appointments: ${inputContact.appointments.length}`;
            }
            if (inputContact.tasks && inputContact.tasks.length > 0) {
              botText += `\n  Tasks: ${inputContact.tasks.length}`;
            }
            if (inputContact.notes && inputContact.notes.length > 0) {
              botText += `\n  Notes: ${inputContact.notes.length}`;
            }
          });
        }
      }

      const botMessage: Message = {
        id: Date.now() + 1,
        text: botText,
        sender: "bot",
        data: data.data, // Store structured data
        showJson: false, // Initially hide JSON
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: "Sorry, something went wrong.",
        sender: "bot",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Simple Chatbot</h1>
              <p className="text-sm opacity-90 mt-1">AI-powered contact extraction with memory</p>
            </div>
            <button
              onClick={clearHistory}
              className="text-xs bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
              title="Clear chat history and start fresh"
            >
              🔄 Reset
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-10">
              <p className="text-lg">👋 Start a conversation!</p>
              <p className="text-sm mt-2">Type a message below to begin</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.sender === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none"
                }`}
              >
                <p className="text-sm whitespace-pre-line">{message.text}</p>
                
                {/* Show structured data button if available */}
                {message.data && message.sender === "bot" && (
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={() => toggleJsonView(message.id)}
                      className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 shadow-md"
                    >
                      {message.showJson ? (
                        <>
                          <span>▼</span> Hide JSON
                        </>
                      ) : (
                        <>
                          <span>▶</span> Show JSON
                        </>
                      )}
                    </button>
                    
                    {/* Pretty JSON Display with Syntax Highlighting */}
                    {message.showJson && (
                      <JsonViewer
                        data={message.data}
                        onCopy={() => {
                          // Optional: Show a toast notification instead of alert
                          const toast = document.createElement("div");
                          toast.className =
                            "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in";
                          toast.textContent = "✓ JSON copied to clipboard!";
                          document.body.appendChild(toast);
                          setTimeout(() => toast.remove(), 2000);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-bl-none px-4 py-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800 dark:text-white"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

