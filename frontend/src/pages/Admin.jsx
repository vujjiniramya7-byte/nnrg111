import { useState, useEffect } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

export default function Admin() {
  const [docs, setDocs]     = useState([]);
  const [health, setHealth] = useState(null);
  const [uploading, setUp]  = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => { loadDocs(); loadHealth(); }, []);

  const loadDocs = async () => {
    const r = await fetch(`${BACKEND_URL}/documents`);
    if (r.ok) setDocs((await r.json()).documents || []);
  };

  const loadHealth = async () => {
    const r = await fetch(`${BACKEND_URL}/health`);
    if (r.ok) setHealth(await r.json());
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUp(true); setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(`${BACKEND_URL}/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (r.ok) { setMsg(`✅ Uploaded & indexed: ${d.filename}`); loadDocs(); loadHealth(); }
      else setMsg(`❌ ${d.detail}`);
    } catch { setMsg("❌ Upload failed — is backend running?"); }
    finally { setUp(false); e.target.value = ""; }
  };

  const deleteDoc = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    const r = await fetch(`${BACKEND_URL}/documents/${id}`, { method: "DELETE" });
    if (r.ok) { setMsg(`🗑 Deleted: ${name}`); loadDocs(); loadHealth(); }
    else setMsg("❌ Delete failed");
  };

  const reindex = async () => {
    setMsg("⏳ Re-indexing...");
    const r = await fetch(`${BACKEND_URL}/reindex`, { method: "POST" });
    const d = await r.json();
    setMsg(`✅ Re-indexed. Total chunks: ${d.total_chunks}`);
    loadHealth();
  };

  const card = { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.08)", marginBottom: 24 };

  return (
    <div style={{ maxWidth: 860, margin: "100px auto 40px", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h3 style={{ color: "#0d6efd", margin: 0 }}>⚙️ NNRG Knowledge Base Admin</h3>
        {health && (
          <span style={{ fontSize: 13, color: "#198754", background: "#d1e7dd", padding: "6px 14px", borderRadius: 20 }}>
            ✅ {health.chunks_indexed} chunks indexed
          </span>
        )}
      </div>

      {msg && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.startsWith("✅") ? "#d1e7dd" : msg.startsWith("⏳") ? "#fff3cd" : "#f8d7da" }}>
          {msg}
        </div>
      )}

      {/* Upload */}
      <div style={card}>
        <h5 style={{ marginBottom: 8 }}>📤 Upload Document</h5>
        <p style={{ fontSize: 13, color: "#6c757d", marginBottom: 14 }}>
          Supported: PDF, DOCX, TXT, CSV, XLSX, MD, HTML, JSON
        </p>
        <label style={{
          display: "inline-block", padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
          background: uploading ? "#6c757d" : "#0d6efd", color: "#fff",
          cursor: uploading ? "not-allowed" : "pointer",
        }}>
          {uploading ? "Uploading…" : "Choose File to Upload"}
          <input type="file" style={{ display: "none" }} onChange={upload} disabled={uploading}
            accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.md,.html,.json" />
        </label>
      </div>

      {/* Documents list */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h5 style={{ margin: 0 }}>📄 Documents ({docs.length})</h5>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={loadDocs}
              style={{ padding: "6px 14px", border: "1px solid #dee2e6", borderRadius: 6, cursor: "pointer", fontSize: 13, background: "#fff" }}>
              🔄 Refresh
            </button>
            <button onClick={reindex}
              style={{ padding: "6px 14px", background: "#198754", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
              ⚡ Re-index All
            </button>
          </div>
        </div>
        {docs.length === 0 ? (
          <p style={{ color: "#6c757d", fontSize: 13 }}>No documents yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                <th style={{ textAlign: "left", padding: "8px 4px" }}>Filename</th>
                <th style={{ textAlign: "left", padding: "8px 4px" }}>Source</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Size</th>
                <th style={{ padding: "8px 4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.doc_id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                  <td style={{ padding: "8px 4px", fontWeight: 500 }}>{d.filename}</td>
                  <td style={{ padding: "8px 4px", color: "#6c757d" }}>{d.source}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#6c757d" }}>
                    {d.size ? `${(d.size / 1024).toFixed(1)} KB` : "—"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }}>
                    {d.doc_id === "nnrg_builtin"
                      ? <span style={{ fontSize: 11, color: "#0d6efd" }}>Built-in</span>
                      : <button onClick={() => deleteDoc(d.doc_id, d.filename)}
                          style={{ padding: "4px 10px", background: "#dc3545", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12 }}>
                          Delete
                        </button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Health */}
      {health && (
        <div style={card}>
          <h5 style={{ marginBottom: 14 }}>💊 System Status</h5>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            {Object.entries(health).map(([k, v]) => (
              <div key={k} style={{ background: "#f8f9fa", borderRadius: 8, padding: "10px 14px" }}>
                <strong>{k}:</strong> {String(v)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
