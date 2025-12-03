import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./StudyMaterialApp.css";
import logo from "./assets/anveshai-logo.png";

/**
 * StudyMaterialApp — dark split layout with full-screen content view
 *
 * Usage: <StudyMaterialApp apiBase="http://127.0.0.1:8000/api/v1" token="test" />
 */

export default function StudyMaterialApp({ apiBase = "http://127.0.0.1:8000/api/v1", token = "" }) {
  const [materialId, setMaterialId] = useState("1");
  const [material, setMaterial] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [error, setError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [fullViewOpen, setFullViewOpen] = useState(false);

  // MEMOIZE headers so object identity doesn't change each render
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  // fetch versions and auto-select preferred id
  const fetchVersions = useCallback(
    async (studyMaterialId, preferVersionId = null) => {
      if (!studyMaterialId) return;
      setError(null);
      setVersions([]);
      setSelectedVersionId(null);

      const url = `${apiBase}/materials/${studyMaterialId}/versions`;
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`Versions fetch failed: ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          setVersions([]);
          return;
        }
        setVersions(data);
        const pickId = preferVersionId ?? (data[0] ? data[0].id : null);
        setSelectedVersionId(pickId ?? (data[0] ? data[0].id : null));
        return data;
      } catch (err) {
        console.warn("fetchVersions failed:", err);
        setError("Could not fetch versions");
        setVersions([]);
        setSelectedVersionId(null);
      }
    },
    [apiBase, headers]
  );

  // fetch material and then versions; include fetchVersions in deps
  const fetchMaterial = useCallback(
    async (id) => {
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
        // fetch versions (prefer latest_version_id if present)
        await fetchVersions(id, data?.latest_version_id);
      } catch (err) {
        setError(err.message || String(err));
        setMaterial(null);
        setVersions([]);
        setSelectedVersionId(null);
      }
    },
    [apiBase, headers, fetchVersions]
  );

  useEffect(() => {
    fetchMaterial(materialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close full view on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setFullViewOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectedVersion() {
    return versions.find((v) => String(v.id) === String(selectedVersionId)) || null;
  }

  // Upload handler
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
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }

      if (!res.ok) {
        const bodyStr = typeof json === "string" ? json : JSON.stringify(json);
        throw new Error(`Upload failed: ${res.status} ${bodyStr}`);
      }
      setUploadToast(json?.message || "Upload received — processing started");
      setFile(null);
      const el = document.getElementById("docx-file-input");
      if (el) el.value = "";
      setTimeout(() => setUploadToast(""), 5000);
      setTimeout(() => fetchVersions(materialId), 1500);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setUploading(false);
    }
  }

  // create version
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
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        throw new Error(`Create version failed: ${res.status} ${txt || ""}`);
      }
      await fetchVersions(material.id);
      setEditorOpen(false);
      setNewContent("");
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function renderContent(raw) {
    if (!raw) return <div className="muted">No content</div>;
    const paragraphs = String(raw).split(/\n{2,}|\r\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return paragraphs.map((p, i) => <p key={i} className="hero-paragraph">{p}</p>);
  }

  function openFullView(versionId = null) {
    if (versionId) setSelectedVersionId(versionId);
    if ((!versions || versions.length === 0) && material?.id) {
      fetchVersions(material.id).then(() => setFullViewOpen(true));
    } else {
      setFullViewOpen(true);
    }
  }

  return (
    <div className="dark-app">
      <div className="left-panel">
        <div className="brand">
          <img src={logo} alt="AnveshAI Logo" className="brand-logo" />
          <div class="brand-title-frame">
          <div class="brand-title-wrapper">
  <div class="brand-title">AnveshAI</div>
</div>
        </div>
          <div className="brand-sub">अन्वेषणं ज्ञानस्य मार्गः।</div>
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
            <input id="docx-file-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
              <button className="btn primary" onClick={() => openFullView(selectedVersionId)}>Open Material</button>
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

                    <div style={{display:"flex", gap:12, marginTop:12}}>
                      <div style={{flex:"0 0 180px"}}>
                        <div className="muted small">Versions</div>
                        <div className="versions-list">
                          {versions.length === 0 && <div className="muted">No versions</div>}
                          {versions.map((v) => (
                            <button
                              key={v.id}
                              className={`version-item ${String(v.id) === String(selectedVersionId) ? "active" : ""}`}
                              onClick={() => { setSelectedVersionId(v.id); openFullView(v.id); }}
                            >
                              <div className="ver-id">v{v.id}</div>
                              <div className="ver-meta">{v.change_summary || (v.created_at ? new Date(v.created_at).toLocaleString() : "")}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{flex:1}}>
                        <div className="muted small">Selected Content</div>
                        <div className="mc-content">
                          {selectedVersion() ? renderContent(selectedVersion().content) : <div className="muted">Select a version to view its notes</div>}
                        </div>
                      </div>
                    </div>

                  </>
                ) : (
                  <div className="muted">No material loaded</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Editor modal */}
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

      {/* Full screen reading view */}
      {fullViewOpen && (
        <div className="fullview-backdrop" onClick={() => setFullViewOpen(false)}>
          <div className="fullview-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fullview-header">
              <div>
                <div className="fullview-title">{material?.topic || "Study Material"}</div>
                <div className="fullview-sub muted">{material ? `Material ID: ${material.id}` : ""}</div>
              </div>
              <div className="fullview-actions">
                <button className="btn outline" onClick={() => setFullViewOpen(false)}>Close</button>
              </div>
            </div>
            <div className="fullview-body">
              {selectedVersion() ? (
                <article className="fullview-article">
                  {renderContent(selectedVersion().content)}
                </article>
              ) : (
                <div className="muted">No version selected</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
