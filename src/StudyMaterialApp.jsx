import React, { useEffect, useState, useCallback, useMemo } from "react";
import "./StudyMaterialApp.css";
import logo from "./assets/anveshai-logo.png";

/**
 * StudyMaterialApp — dark split layout with full-screen content view
 *
 * Usage: <StudyMaterialApp apiBase="http://127.0.0.1:8000/api/v1" token="test" />
 */

export default function StudyMaterialApp({ apiBase = "http://127.0.0.1:8000/api/v1", token = "" }) {
  // --- existing material/version state ---
  const [materialId, setMaterialId] = useState("1");
  const [material, setMaterial] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);

  // --- upload / editor state (unchanged) ---
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadToast, setUploadToast] = useState("");
  const [error, setError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [fullViewOpen, setFullViewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- new: subject/topic/subtopic state ---
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [topics, setTopics] = useState([]); // array of { topic, subtopics } or strings
  const [selectedTopic, setSelectedTopic] = useState("");
  const [subtopics, setSubtopics] = useState([]); // array of strings
  const [selectedSubtopic, setSelectedSubtopic] = useState("");

  // MEMOIZE headers so object identity doesn't change each render
  const headers = useMemo(() => {
    const h = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, [token]);

  // -------------------------
  // Helper fetch wrappers
  // -------------------------
  async function safeFetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${txt}`);
    }
    return res.json();
  }

  // -------------------------
  // Subjects / Topics / Subtopics loaders
  // -------------------------
  const fetchSubjects = useCallback(async () => {
    setError(null);
    try {
      const data = await safeFetchJson(`${apiBase}/subjects/`, { headers });
      // data expected as list of SubjectOut { id, title?, name? }
      setSubjects(Array.isArray(data) ? data : []);
      // auto-select first subject if none
      if (Array.isArray(data) && data.length > 0 && !selectedSubjectId) {
        const first = data[0];
        setSelectedSubjectId(first.id);
      }
    } catch (err) {
      console.warn("fetchSubjects failed:", err);
      setError("Could not fetch subjects");
      setSubjects([]);
      setSelectedSubjectId(null);
    }
  }, [apiBase, headers, selectedSubjectId]);

  const fetchTopicsForSubject = useCallback(
    async (subjectId) => {
      if (!subjectId) {
        setTopics([]);
        setSelectedTopic("");
        return;
      }
      setError(null);
      try {
        const data = await safeFetchJson(`${apiBase}/subjects/${subjectId}/topics`, { headers });
        // data expected as array of { topic: string, subtopics: [{subtopic}] } or simple list of strings
        // Normalize to array of objects { topic, subtopics }
        let normalized = [];
        if (Array.isArray(data)) {
          if (data.length > 0 && typeof data[0] === "string") {
            normalized = data.map((t) => ({ topic: t, subtopics: [] }));
          } else {
            normalized = data.map((item) => {
              // item might be string or object
              if (!item) return null;
              if (typeof item === "string") return { topic: item, subtopics: [] };
              const topicStr = item.topic ?? item.title ?? (item[0] || "");
              const subs =
                Array.isArray(item.subtopics) && item.subtopics.length > 0
                  ? item.subtopics.map((s) => (typeof s === "string" ? s : s.subtopic ?? s.title ?? ""))
                  : [];
              return { topic: topicStr, subtopics: subs };
            }).filter(Boolean);
          }
        }
        setTopics(normalized);
        // auto-select first topic if none set
        if (normalized.length > 0) {
          setSelectedTopic((prev) => prev || normalized[0].topic);
        } else {
          setSelectedTopic("");
        }
      } catch (err) {
        console.warn("fetchTopicsForSubject failed:", err);
        setError("Could not fetch topics");
        setTopics([]);
        setSelectedTopic("");
      }
    },
    [apiBase, headers]
  );

  const fetchSubtopicsForTopic = useCallback(
    async (subjectId, topic) => {
      if (!subjectId || !topic) {
        setSubtopics([]);
        setSelectedSubtopic("");
        return;
      }
      setError(null);
      try {
        const encTopic = encodeURIComponent(topic);
        const data = await safeFetchJson(`${apiBase}/subjects/${subjectId}/topics/${encTopic}/subtopics`, { headers });
        // data expected as [{ subtopic: "..." }, ...] or array of strings
        let normalized = [];
        if (Array.isArray(data) && data.length > 0) {
          if (typeof data[0] === "string") {
            normalized = data;
          } else {
            normalized = data.map((i) => (i.subtopic ?? i.title ?? (i[0] || ""))).filter(Boolean);
          }
        }
        setSubtopics(normalized);
        if (normalized.length > 0) {
          setSelectedSubtopic((prev) => prev || normalized[0]);
        } else {
          setSelectedSubtopic("");
        }
      } catch (err) {
        console.warn("fetchSubtopicsForTopic failed:", err);
        setError("Could not fetch subtopics");
        setSubtopics([]);
        setSelectedSubtopic("");
      }
    },
    [apiBase, headers]
  );

  // call when subject/topic/subtopic selections change
  useEffect(() => {
    // when subject changes -> load topics
    if (selectedSubjectId) {
      fetchTopicsForSubject(selectedSubjectId);
    } else {
      setTopics([]);
      setSubtopics([]);
      setSelectedTopic("");
      setSelectedSubtopic("");
    }
  }, [selectedSubjectId, fetchTopicsForSubject]);

  useEffect(() => {
    if (selectedSubjectId && selectedTopic) {
      fetchSubtopicsForTopic(selectedSubjectId, selectedTopic);
    } else {
      setSubtopics([]);
      setSelectedSubtopic("");
    }
  }, [selectedTopic, selectedSubjectId, fetchSubtopicsForTopic]);

  // when subtopic selected => fetch notes (StudyMaterial via /subjects/notes)
  useEffect(() => {
    if (selectedSubjectId && selectedTopic && selectedSubtopic) {
      // fetch material/versions for this hierarchy
      (async () => {
        try {
          setError(null);
          // URL encode topic and subtopic
          const url = `${apiBase}/subjects/notes?subject_id=${encodeURIComponent(selectedSubjectId)}&topic=${encodeURIComponent(
            selectedTopic
          )}&subtopic=${encodeURIComponent(selectedSubtopic)}`;
          const data = await safeFetchJson(url, { headers });
          // data expected to be StudyMaterialOut
          setMaterial(data);
          // if response has versions, map. older shape may use data.versions
          const vs = Array.isArray(data?.versions) ? data.versions : [];
          setVersions(vs);
          setSelectedVersionId(vs && vs.length > 0 ? vs[0].id : null);
          // reflect material id field into materialId input if present
          if (data?.id) setMaterialId(String(data.id));
        } catch (err) {
          console.warn("fetch material by hierarchy failed:", err);
          // if not found, clear material (user can create via UI later)
          setMaterial(null);
          setVersions([]);
          setSelectedVersionId(null);
        }
      })();
    }
  }, [selectedSubjectId, selectedTopic, selectedSubtopic, apiBase, headers]);

  // -------------------------
  // existing fetch material/versions by material id (unchanged)
  // -------------------------
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
    // initial load: subjects (which will cascade to auto-select first topic/subtopic)
    fetchSubjects();

    // initial material id load (legacy)
    fetchMaterial(materialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close full view on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setFullViewOpen(false);
        setIsFullscreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectedVersion() {
    return versions.find((v) => String(v.id) === String(selectedVersionId)) || null;
  }

  // Upload handler (unchanged)
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

  // create version (unchanged)
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
    setIsFullscreen(false);
  }

  // Handler: Enter in Material ID input triggers load
  function handleMaterialInputKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchMaterial(materialId);
    }
  }

  function toggleFullview() {
    setIsFullscreen((prev) => !prev);
  }

  // -------------------------
  // UI: format subject display
  // -------------------------
  function subjectDisplayName(s) {
    if (!s) return "";
    return s.title || s.name || `Subject ${s.id}`;
  }

  return (
    <div className="dark-app">
      <div className="left-panel">
        <div className="brand">
          <img src={logo} alt="AnveshAI Logo" className="brand-logo" />
          <div className="brand-title-frame">
            <div className="brand-title-wrapper">
              <div className="brand-title">
                Anvesh<span className="ai-highlight">AI</span>
              </div>
            </div>
          </div>
          <div className="brand-sub">अन्वेषणं ज्ञानस्य मार्गः।</div>
          <div className="brand-sub">
            <span className="text-exploration">Exploration</span> is the Path to Knowledge.
          </div>
        </div>

        <div className="form-block">
          {/* NEW: Subject / Topic / Subtopic selectors */}
          <label className="label">Subject</label>
          <div className="row">
            <select
              className="input"
              value={selectedSubjectId ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setSelectedSubjectId(v);
              }}
            >
              <option value="">— Select subject —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {subjectDisplayName(s)}
                </option>
              ))}
            </select>
          </div>

          <label className="label">Topic</label>
          <div className="row">
            <select
              className="input"
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
              }}
            >
              <option value="">— Select topic —</option>
              {topics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic}
                </option>
              ))}
            </select>
          </div>

          <label className="label">Subtopic</label>
          <div className="row">
            <select
              className="input"
              value={selectedSubtopic}
              onChange={(e) => {
                setSelectedSubtopic(e.target.value);
              }}
            >
              <option value="">— Select subtopic —</option>
              {subtopics.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="spacer" />

          {/* Material ID loader (legacy input) */}
          <label className="label">Material ID</label>
          <div className="row">
            <input
              className="input"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              onKeyDown={handleMaterialInputKey}
              aria-label="Material ID"
            />
            <button className="btn primary" onClick={() => fetchMaterial(materialId)}>Load</button>
          </div>

          <div className="spacer" />

          <label className="label">Upload .docx</label>
          <form onSubmit={handleUpload} className="upload-form">
            <input
              id="docx-file-input"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="upload-row">
              <button className="upload-btn" type="submit" disabled={uploading || !file}>{uploading ? "Uploading..." : "Upload"}</button>
              <button
                className="clear-btn"
                type="button"
                onClick={() => {
                  setFile(null);
                  const el = document.getElementById("docx-file-input");
                  if (el) el.value = "";
                }}
              >
                Clear
              </button>
            </div>
            <div className="file-name">{file ? file.name : <span className="muted">No file selected</span>}</div>
          </form>

          <div className="spacer" />

          <label className="label">Quick actions</label>
          <button
            className="btn ghost"
            onClick={() => {
              setEditorOpen(true);
              setNewContent(material?.latest_version?.content || "");
            }}
          >
            New Version
          </button>

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
              <button
                className="btn outline"
                onClick={() => {
                  if (material?.id) navigator.clipboard?.writeText(`${apiBase}/materials/${material.id}`);
                }}
              >
                Copy Link
              </button>
            </div>
          </div>

          <div className="hero-side">
            <div className="material-card">
              <div className="mc-header">Material Preview</div>
              <div className="mc-body">
                {material ? (
                  <>
                    <div className="muted small">Topic</div>
                    <div className="mc-title">{material.topic || material.subtopic || "—"}</div>

                    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                      <div style={{ flex: "0 0 180px" }}>
                        <div className="muted small">Versions</div>
                        <div className="versions-list">
                          {versions.length === 0 && <div className="muted">No versions</div>}
                          {versions.map((v) => (
                            <button
                              key={v.id}
                              className={`version-item ${String(v.id) === String(selectedVersionId) ? "active" : ""}`}
                              onClick={() => {
                                setSelectedVersionId(v.id);
                                openFullView(v.id);
                              }}
                            >
                              <div className="ver-id">v{v.id}</div>
                              <div className="ver-meta">{v.change_summary || (v.created_at ? new Date(v.created_at).toLocaleString() : "")}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
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
        <div className="fullview-backdrop" onClick={() => { setFullViewOpen(false); setIsFullscreen(false); }}>
          <div
            className={`fullview-panel ${isFullscreen ? "fullscreen-mode" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fullview-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div>
                  <div className="fullview-title">{material?.topic || "Study Material"}</div>
                  <div className="fullview-sub muted">{material ? `Material ID: ${material.id}` : ""}</div>
                </div>
              </div>

              <div className="fullview-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="btn fullview-expand-btn"
                  onClick={toggleFullview}
                >
                  {isFullscreen ? "⤡ Exit Full View" : "⤢ Full View"}
                </button>

                <button
                  className="btn outline"
                  onClick={() => {
                    setFullViewOpen(false);
                    setIsFullscreen(false);
                  }}
                >
                  Close
                </button>
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
