import React, { useEffect, useState } from "react";
import "./StudyMaterialApp.css";

export default function StudyMaterialApp({ apiBase = "http://127.0.0.1:8000/api/v1", token = "" }) {
  const [materialId, setMaterialId] = useState("1");
  const [material, setMaterial] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [error, setError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetchMaterial(materialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMaterial(id) {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`${apiBase}/materials/${id}`, { headers });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Material not found");
        throw new Error(`Fetch failed: ${res.status}`);
      }
      const data = await res.json();
      setMaterial(data);
    } catch (err) {
      setError(err.message || String(err));
      setMaterial(null);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Please choose a .docx file first");
    if (!file.name.toLowerCase().endsWith(".docx")) return setError("Only .docx files allowed");

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBase}/uploads/`, { method: "POST", headers, body: fd });
      const text = await res.text().catch(() => null);
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = text; }

      if (!res.ok) {
        const bodyStr = typeof json === "string" ? json : JSON.stringify(json);
        throw new Error(`Upload failed: ${res.status} ${bodyStr}`);
      }
      setUploadToast(json?.message || "Upload received — processing started");
      setFile(null);
      const el = document.getElementById("docx-file-input"); if (el) el.value = "";
      setTimeout(() => setUploadToast(""), 5000);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateVersion(publish = true) {
    if (!material?.id) return setError("Open a material first");
    setError(null);
    try {
      const body = { content: newContent, language: "mr", change_summary: "Edited in UI" };
      const qs = publish ? "?publish=true" : "?publish=false";
      const res = await fetch(`${apiBase}/materials/${material.id}/versions${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Create version failed: ${res.status}`);
      await fetchMaterial(material.id);
      setEditorOpen(false);
      setNewContent("");
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function renderContent(raw) {
    if (!raw) return <div className="muted">No content</div>;
    return raw.split(/\n{2,}/).map((p, i) => <p key={i} className="hero-paragraph">{p}</p>);
  }

  return (
    <div className="dark-app">
      <div className="left-panel">
        <div className="brand">
          <div className="brand-icon">☁</div>
          <div className="brand-title">AnveshAI</div>
          <div className="brand-sub">StudyMaterial editor</div>
        </div>

        <div className="form-block">
          <label className="label">Material ID</label>
          <div className="row">
            <input className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)} />
            <button className="btn primary" onClick={() => fetchMaterial(materialId)}>Load</button>
          </div>

          <div className="spacer" />

          <label className="label">Upload .docx</label>
          <form onSubmit={handleUpload} className="upload-form">
            <input id="docx-file-input" type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="upload-row">
              <button className="btn" type="submit" disabled={uploading || !file}>{uploading ? "Uploading..." : "Upload"}</button>
              <button className="btn outline" type="button" onClick={() => { setFile(null); const el = document.getElementById("docx-file-input"); if(el) el.value = ""; }}>Clear</button>
            </div>
            <div className="file-name">{file ? file.name : <span className="muted">No file selected</span>}</div>
          </form>

          <div className="spacer" />

          <label className="label">Quick actions</label>
          <button className="btn ghost" onClick={() => { setEditorOpen(true); setNewContent(material?.latest_version?.content || ""); }}>New Version</button>

          {error && <div className="error">{error}</div>}
          {uploadToast && <div className="success">{uploadToast}</div>}

          <div className="footer-note muted">Tip: use token="test" in dev to bypass auth.</div>
        </div>
      </div>

      <div className="right-hero">
        <div className="hero-inner">
          <div className="hero-card">
            <h2 className="hero-title">Study Materials</h2>
            <p className="hero-sub">View, upload, and publish concise study notes from your .docx files.</p>
            <div className="hero-cta-row">
              <button className="btn primary" onClick={() => fetchMaterial(materialId)}>Open Material</button>
              <button className="btn outline" onClick={() => { if (material?.id) navigator.clipboard?.writeText(`${apiBase}/materials/${material.id}`); }}>Copy Link</button>
            </div>
          </div>

          <div className="hero-side">
            <div className="material-card">
              <div className="mc-header">Material Preview</div>
              <div className="mc-body">
                {material ? (
                  <>
                    <div className="muted small">Topic</div>
                    <div className="mc-title">{material.topic || "—"}</div>
                    <div className="muted small">Latest</div>
                    <div className="mc-content">{renderContent(material.latest_version?.content)}</div>
                  </>
                ) : (
                  <div className="muted">No material loaded</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Modal editor */}
      {editorOpen && (
        <div className="editor-modal">
          <div className="editor-card">
            <div className="editor-header">
              <div>Create new version</div>
              <button className="btn small" onClick={() => setEditorOpen(false)}>Close</button>
            </div>
            <textarea className="editor-text" value={newContent} onChange={(e) => setNewContent(e.target.value)} />
            <div className="editor-actions">
              <button className="btn" onClick={() => handleCreateVersion(false)}>Save draft</button>
              <button className="btn primary" onClick={() => handleCreateVersion(true)}>Publish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
