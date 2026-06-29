import { useState, useRef, useEffect } from "react";
import { FaPaperPlane, FaPaperclip } from "react-icons/fa";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

const SUGGESTED = [
  "What courses does NNRG offer?",
  "Tell me about placements",
  "How can I contact admissions?",
  "What bus routes are available?",
  "Library timings?",
];

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)/gm, "• $1")
    .replace(/\n/g, "<br/>");
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#6c757d",
          display: "inline-block",
          animation: `bounce 1.2s ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

export default function ChatWidget() {
  const [open, setOpen]       = useState(false);
  const [minimized, setMin]   = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState([
    {
      role: "bot",
      text: "👋 **Welcome to NNRG AI Assistant!**\n\nI can answer questions about:\n- Admissions & Courses\n- Placements & Training\n- Campus Facilities\n- Bus Routes & Transport\n- Library, Sports & more\n\nYou can also upload a document (PDF, DOCX, TXT) using the 📎 button below!\n\nWhat would you like to know?",
    },
  ]);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, loading]);
  useEffect(() => { if (open && !minimized) inputRef.current?.focus(); }, [open, minimized]);

  const apiHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role === "bot" ? "assistant" : m.role, content: m.text }));

  const send = async (msg) => {
    const q = (msg || message).trim();
    if (!q || loading) return;
    setMessage("");
    setHistory((h) => [...h, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history: apiHistory }),
      });
      const data = await res.json();
      setHistory((h) => [...h, {
        role: "bot",
        text: data.response || "Sorry, no response.",
        sources: data.sources || [],
      }]);
    } catch {
      setHistory((h) => [...h, {
        role: "bot",
        text: "❌ Cannot connect to backend.\n\n**Fix:** Run `setup_and_run.bat` inside the `backend/` folder.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setHistory((h) => [...h, { role: "user", text: `📎 Uploading: ${file.name}…` }]);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch(`${BACKEND_URL}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setHistory((h) => [...h, {
          role: "bot",
          text: `✅ **${data.filename}** uploaded and indexed successfully!\n\nYou can now ask questions about this document.`,
        }]);
      } else {
        setHistory((h) => [...h, { role: "bot", text: `❌ Upload failed: ${data.detail}` }]);
      }
    } catch {
      setHistory((h) => [...h, {
        role: "bot",
        text: "❌ Upload failed — backend not running.\n\nRun `setup_and_run.bat` in the `backend/` folder first.",
      }]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); opacity: .4; }
          40%            { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .nnrg-msg { animation: fadeIn .22s ease; }
        .nnrg-fab:hover { transform: scale(1.1) !important; }
        .nnrg-chip:hover { background: #dbe8ff !important; }
        .nnrg-icon-btn:hover { background: rgba(255,255,255,.35) !important; }
      `}</style>

      {/* FAB */}
      {!open && (
        <button className="nnrg-fab" onClick={() => { setOpen(true); setMin(false); }}
          title="Chat with NNRG AI"
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            width: 62, height: 62, borderRadius: "50%",
            background: "linear-gradient(135deg,#0d6efd,#0a58ca)",
            border: "none", color: "#fff", fontSize: 26,
            boxShadow: "0 4px 20px rgba(13,110,253,.45)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform .2s",
          }}>🤖</button>
      )}

      {/* Chat window */}
      {open && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 390, borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,.22)",
          background: "#fff", overflow: "hidden",
          display: "flex", flexDirection: "column",
          height: minimized ? "auto" : 570,
          transition: "height .3s ease",
        }}>

          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg,#0d6efd,#0a58ca)",
            color: "#fff", padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>🤖</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>NNRG AI Assistant</div>
                <div style={{ fontSize: 11, opacity: .85 }}>
                  {uploading ? "Uploading file…" : loading ? "Typing…" : "Online · Powered by NNRG Docs"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="nnrg-icon-btn" onClick={() => setMin((m) => !m)}
                style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff",
                  borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 13 }}>
                {minimized ? "▲" : "—"}
              </button>
              <button className="nnrg-icon-btn" onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff",
                  borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 13 }}>
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div style={{
                flex: 1, overflowY: "auto", padding: "14px 14px 8px",
                background: "#f8f9fa", display: "flex", flexDirection: "column", gap: 10,
              }}>
                {history.map((msg, i) => (
                  <div key={i} className="nnrg-msg"
                    style={{ display: "flex", flexDirection: "column",
                      alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "86%", padding: "10px 14px", borderRadius: 14,
                      fontSize: 13.5, lineHeight: 1.6,
                      background: msg.role === "user"
                        ? "linear-gradient(135deg,#0d6efd,#0a58ca)"
                        : "#fff",
                      color: msg.role === "user" ? "#fff" : "#212529",
                      boxShadow: msg.role === "user"
                        ? "0 2px 8px rgba(13,110,253,.3)"
                        : "0 2px 8px rgba(0,0,0,.08)",
                      borderBottomRightRadius: msg.role === "user" ? 4 : 14,
                      borderBottomLeftRadius:  msg.role === "bot"  ? 4 : 14,
                    }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                    />
                    {msg.sources?.length > 0 && (
                      <div style={{ fontSize: 11, color: "#6c757d", marginTop: 3, paddingLeft: 2 }}>
                        📄 {msg.sources.join(", ")}
                      </div>
                    )}
                  </div>
                ))}

                {(loading || uploading) && (
                  <div style={{ display: "flex" }}>
                    <div style={{
                      background: "#fff", borderRadius: 14, borderBottomLeftRadius: 4,
                      padding: "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.08)",
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Suggested chips — show only at start */}
              {history.length <= 2 && (
                <div style={{
                  padding: "6px 12px", background: "#fff",
                  borderTop: "1px solid #e9ecef",
                  display: "flex", flexWrap: "wrap", gap: 6,
                }}>
                  {SUGGESTED.map((q) => (
                    <button key={q} className="nnrg-chip" onClick={() => send(q)}
                      style={{
                        fontSize: 11.5, padding: "4px 10px", borderRadius: 20,
                        border: "1px solid #0d6efd", background: "#f0f5ff",
                        color: "#0d6efd", cursor: "pointer",
                      }}>{q}</button>
                  ))}
                </div>
              )}

              {/* Input row */}
              <div style={{
                padding: "10px 12px", background: "#fff",
                borderTop: "1px solid #e9ecef",
                display: "flex", gap: 6, alignItems: "center",
              }}>
                {/* File upload button */}
                <button
                  title="Upload a document (PDF, DOCX, TXT…)"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || loading}
                  style={{
                    width: 38, height: 38, borderRadius: 9, border: "1.5px solid #dee2e6",
                    background: uploading ? "#f8f9fa" : "#fff",
                    color: uploading ? "#adb5bd" : "#0d6efd",
                    cursor: uploading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, flexShrink: 0, transition: "all .2s",
                  }}>
                  <FaPaperclip />
                </button>
                <input ref={fileRef} type="file" style={{ display: "none" }}
                  accept=".pdf,.docx,.txt,.csv,.xlsx,.md,.html,.json"
                  onChange={uploadFile} />

                {/* Text input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask about NNRG…"
                  disabled={loading || uploading}
                  style={{
                    flex: 1, border: "1.5px solid #dee2e6", borderRadius: 10,
                    padding: "9px 13px", fontSize: 13.5, outline: "none",
                    background: (loading || uploading) ? "#f8f9fa" : "#fff",
                    transition: "border-color .2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#0d6efd")}
                  onBlur={(e)  => (e.target.style.borderColor = "#dee2e6")}
                />

                {/* Send button */}
                <button onClick={() => send()} disabled={loading || uploading || !message.trim()}
                  style={{
                    width: 38, height: 38, borderRadius: 9, border: "none", flexShrink: 0,
                    background: (loading || uploading || !message.trim())
                      ? "#adb5bd"
                      : "linear-gradient(135deg,#0d6efd,#0a58ca)",
                    color: "#fff",
                    cursor: (loading || uploading || !message.trim()) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, transition: "background .2s",
                  }}>
                  <FaPaperPlane />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
