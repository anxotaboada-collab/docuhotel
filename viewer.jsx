// Docuhotel — Document viewer with watermarked download

// Sanitise a document title into a filesystem-safe file name. Used so that the
// PDF downloaded by the user always reflects the current title of the document
// (if the title is edited later, the next download picks up the new name).
function safeDocFilename(title, langSuffix) {
  const base = String(title || "documento")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "documento";
  return base + (langSuffix ? `_${langSuffix}` : "") + ".pdf";
}
window.safeDocFilename = safeDocFilename;

// Resolve the file pointer + display name for a given language. Falls back to
// the document's "default" file (doc.file) when the requested language was not
// uploaded.
function pickDocFile(doc, wantLang) {
  const variants = doc?.files || {};
  // Default language stored on doc.defaultLang, else "es"
  const def = doc?.defaultLang || "es";
  if (wantLang && variants[wantLang]) return { ...variants[wantLang], lang: wantLang };
  // The primary/default-language file may live only on doc.file (legacy: it is
  // not always mirrored into a document_files row). So when the requested
  // language IS the default, prefer doc.file before falling back to any other
  // variant — otherwise selecting the default would wrongly show another lang.
  if (wantLang && wantLang === def && doc?.file?.key) return { ...doc.file, lang: def };
  if (variants[def]) return { ...variants[def], lang: def };
  if (doc?.file?.key) return { ...doc.file, lang: def };
  const anyLang = Object.keys(variants)[0];
  if (anyLang) return { ...variants[anyLang], lang: anyLang };
  return doc?.file ? { ...doc.file, lang: def } : null;
}
window.pickDocFile = pickDocFile;

// All language codes that have an uploaded PDF for this document. The default
// language often lives only on doc.file (no document_files row), so it must be
// included even when other variants exist — otherwise uploading a second
// language (e.g. DE) would hide the original (e.g. ES).
function availableLangs(doc) {
  const v = doc?.files || {};
  const langs = Object.keys(v).filter((l) => v[l]?.key || v[l]?.dataUrl);
  const def = doc?.defaultLang || "es";
  if ((doc?.file?.key || doc?.file?.dataUrl) && !langs.includes(def)) langs.unshift(def);
  return langs;
}
window.availableLangs = availableLangs;

function ViewerModal({ doc, state, t, lang, onClose, onDownloaded, setState, onOpenDoc, readOnly, auditMode }) {
  const cat = state.categories.find(c => c.id === doc.categoryId);
  const status = state.statuses.find(s => s.id === doc.statusId);
  const user = state.users.find(u => u.id === state.config.currentUserId);
  const departmentNames = doc.departments.includes("*")
    ? [t.documents.allDepartments]
    : doc.departments.map(id => state.departments.find(d => d.id === id)?.name).filter(Boolean);
  const respNames = doc.responsibleIds.map(id => state.responsibles.find(r => r.id === id)?.name).filter(Boolean);

  // Linked docs (outgoing) and reverse links (incoming)
  const linkedIds = doc.linkedDocIds || [];
  const linkedDocs = linkedIds.map(id => state.documents.find(d => d.id === id)).filter(Boolean);
  const incomingDocs = state.documents.filter(d => (d.linkedDocIds || []).includes(doc.id));
  const [showPicker, setShowPicker] = React.useState(false);

  const removeLink = (otherId) => {
    if (!setState) return;
    setState(s => ({
      ...s,
      documents: s.documents.map(d => d.id === doc.id ? { ...d, linkedDocIds: (d.linkedDocIds || []).filter(x => x !== otherId) } : d),
    }));
  };
  const addLinks = (ids) => {
    if (!setState) return;
    setState(s => ({
      ...s,
      documents: s.documents.map(d => d.id === doc.id ? { ...d, linkedDocIds: Array.from(new Set([...(d.linkedDocIds || []), ...ids])) } : d),
    }));
    setShowPicker(false);
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "long", day: "2-digit" }) : "—";

  // Language variants. Always start with the document's default (ES unless the
  // doc was uploaded in another language as its default).
  const langs = availableLangs(doc);
  const defaultLang = doc.defaultLang || (langs[0] || "es");
  const [selectedLang, setSelectedLang] = React.useState(defaultLang);
  React.useEffect(() => { setSelectedLang(defaultLang); }, [doc.id, defaultLang]);
  const currentFile = pickDocFile(doc, selectedLang) || doc.file || null;

  // Real uploaded PDF (backend mode): resolve a short-lived signed URL and
  // render it with pdf.js (works on iOS/Android/desktop). Falls back to a
  // native <iframe> if pdf.js can't load or render.
  const hasRealFile = !!(currentFile?.key && window.DocuApi && !window.DocuApi.offline);
  const [pdfUrl, setPdfUrl] = React.useState(null);
  const [pdfErr, setPdfErr] = React.useState("");
  const [pdfStatus, setPdfStatus] = React.useState("loading"); // loading | rendered | iframe | error
  const pdfBoxRef = React.useRef(null);

  React.useEffect(() => {
    if (!hasRealFile) return;
    let cancelled = false;
    setPdfUrl(null); setPdfErr(""); setPdfStatus("loading");
    window.DocuApi.signedUrl(currentFile.key, 1800)
      .then(u => {
        if (cancelled) return;
        if (u) setPdfUrl(u);
        else { setPdfErr("No se pudo obtener el archivo (¿se subió y el documento está marcado como público?)."); setPdfStatus("error"); }
      })
      .catch(e => { if (!cancelled) { setPdfErr(e?.message || "Error al cargar el PDF."); setPdfStatus("error"); } });
    return () => { cancelled = true; };
  }, [hasRealFile, currentFile?.key]);

  React.useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    const box = pdfBoxRef.current;
    if (!box || typeof window.ensurePdfJs !== "function") { setPdfStatus("iframe"); return; }
    setPdfStatus("loading");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    window.ensurePdfJs().then((lib) => {
      if (cancelled) return;
      if (!lib) { setPdfStatus("iframe"); return; }
      box.innerHTML = "";
      return lib.getDocument({ url: pdfUrl }).promise.then(async (pdf) => {
        if (cancelled) return;
        const cssW = (box.clientWidth || 700) - 4;
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(0.3, Math.min(2.5, cssW / base.width));
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page-canvas";
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = vp.width + "px";
          canvas.style.height = vp.height + "px";
          box.appendChild(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: vp,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
          }).promise;
        }
        if (!cancelled) setPdfStatus(box.childElementCount ? "rendered" : "iframe");
      });
    }).catch((e) => {
      if (cancelled) return;
      console.error("pdf.js render failed, falling back to iframe:", e);
      setPdfStatus("iframe");
    });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Build watermark line repeated diagonally
  const now = new Date();
  const stamp = now.toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");
  const wmHeader = auditMode ? (t.audit?.wmAuditor || "AUDITOR EXTERNO") : t.watermark.line1;
  const wmText = `${wmHeader} · ${user?.name || "—"} · ${stamp}`;
  const wmLines = Array.from({ length: 12 }, () => wmText).join("    ");

  const handleDownload = async () => {
    onDownloaded(doc);
    // If a real PDF was uploaded, download that file instead of the placeholder.
    // The downloaded file is named after the document's current title (so renaming
    // the document automatically renames downloads), with the language suffix when
    // the doc has more than one language variant.
    const fileForDl = currentFile;
    if (fileForDl?.key && window.DocuApi && !window.DocuApi.offline) {
      try {
        const url = await window.DocuApi.signedUrl(fileForDl.key);
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          const suffix = langs.length > 1 ? (fileForDl.lang || selectedLang || "").toUpperCase() : "";
          a.download = safeDocFilename(doc.title, suffix);
          document.body.appendChild(a); a.click(); a.remove();
          return;
        }
      } catch (e) {
        console.error("Failed to download original PDF, falling back to placeholder:", e);
      }
    }
    // generate a watermarked HTML "PDF-like" file (real apps would re-render the PDF)
    const html = buildWatermarkedHtml(doc, state, t, lang, auditMode);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeAuditor = (user?.name || "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    const suffix = auditMode && safeAuditor ? `_auditor-${safeAuditor}` : "_copia-privada";
    a.download = safeDocFilename(doc.title).replace(/\.pdf$/i, "") + suffix + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Modal
      size="xl"
      title={t.viewer.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t.common.close}</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={handleDownload}>
              <Icon.download /> {auditMode ? (t.audit?.downloadWithMyName || "Descargar con mi nombre") : t.viewer.downloadWatermarked}
            </button>
          )}
          {readOnly && !auditMode && (
            <span style={{ color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>👁 {t.audit?.readOnly || "Solo lectura"}</span>
          )}
        </>
      }
    >
      <div className="viewer-shell">
        <div className="viewer-pdf">
          {hasRealFile ? (
            <div className="viewer-pdf-frame">
              {pdfStatus === 'error' ? (
                <div className="pdf-msg pdf-msg-err">
                  <div>⚠ {pdfErr}</div>
                  <div className="pdf-msg-sub">Archivo: {doc.file?.name || '—'}</div>
                </div>
              ) : pdfStatus === 'iframe' && pdfUrl ? (
                <iframe className="pdf-iframe" title={doc.file?.name || 'PDF'} src={pdfUrl + '#toolbar=1&navpanes=0'} />
              ) : (
                <>
                  <div ref={pdfBoxRef} className="pdf-canvas-box" />
                  {pdfStatus === 'loading' && <div className="pdf-msg">Cargando PDF…</div>}
                </>
              )}
              <div className="wm-overlay" style={{ pointerEvents: 'none' }}>
                <div className="wm-diagonal">{wmLines}</div>
              </div>
            </div>
          ) : (
          <div className="viewer-page">
            <div className="doc-id">DOC · {doc.id.toUpperCase()} · v{doc.version}</div>
            <h1>{doc.title}</h1>
            <p style={{ color: '#555' }}>{doc.description || ""}</p>
            <h2>1. Objeto</h2>
            <div className="lorem-line med" /><div className="lorem-line" /><div className="lorem-line short" />
            <h2>2. Alcance</h2>
            <div className="lorem-line" /><div className="lorem-line med" /><div className="lorem-line short" />
            <h2>3. Procedimiento</h2>
            <div className="lorem-line med" /><div className="lorem-line" /><div className="lorem-line" /><div className="lorem-line short" />
            <h2>4. Responsabilidades</h2>
            <div className="lorem-line" /><div className="lorem-line med" />
            <div style={{ position: 'absolute', bottom: 30, left: 50, right: 50, fontSize: 10, color: '#888', borderTop: '1px solid #ddd', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>Docuhotel</span>
              <span>{doc.title}</span>
              <span>v{doc.version}</span>
            </div>
            <div className="wm-overlay">
              <div className="wm-diagonal">{wmLines}</div>
            </div>
          </div>
          )}
        </div>
        <div className="viewer-side">
          <h4>{t.viewer.meta}</h4>
          <div className="meta-row"><span className="label">{t.common.title}</span><span className="value">{doc.title}</span></div>
          <div className="meta-row"><span className="label">{t.common.status}</span><span className="value"><StatusPill status={status} t={t} /></span></div>
          <div className="meta-row"><span className="label">{t.common.category}</span><span className="value"><CategoryPill cat={cat} /></span></div>
          <div className="meta-row"><span className="label">{t.common.topic}</span><span className="value">{(state.themes || []).find(x => x.id === doc.themeId)?.name || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.common.departments}</span><span className="value">{departmentNames.join(", ") || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.common.responsibles}</span><span className="value">{respNames.join(", ") || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.documents.startDate}</span><span className="value">{fmtDate(doc.startDate)}</span></div>
          <div className="meta-row"><span className="label">{t.documents.endDate}</span><span className="value">{fmtDate(doc.expiryDate)}</span></div>
          <div className="meta-row"><span className="label">{t.common.version}</span><span className="value">v{doc.version}</span></div>
          <div className="meta-row"><span className="label">{t.common.file}</span><span className="value" style={{ wordBreak: 'break-all' }}>{safeDocFilename(doc.title, langs.length > 1 ? (currentFile?.lang || selectedLang || "").toUpperCase() : "")}</span></div>
          {langs.length > 0 && (
            <div className="meta-row">
              <span className="label">Idioma</span>
              <span className="value">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {["es","en","de","pt"].map(l => {
                    const has = langs.includes(l);
                    const active = selectedLang === l;
                    if (!has && langs.length > 0) return (
                      <span key={l} title="No disponible en este idioma" style={{ fontSize: 11, padding: '2px 6px', border: '1px dashed var(--line)', borderRadius: 4, color: 'var(--muted)', opacity: 0.5 }}>{l.toUpperCase()}</span>
                    );
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setSelectedLang(l)}
                        style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--line)', borderRadius: 4, background: active ? 'var(--bg-soft)' : 'transparent', color: active ? 'var(--ink)' : 'var(--muted)', fontWeight: active ? 600 : 400, cursor: 'pointer' }}
                      >{l.toUpperCase()}</button>
                    );
                  })}
                </div>
              </span>
            </div>
          )}
          {currentFile?.key && window.DocuApi && !window.DocuApi.offline && (
            <div className="meta-row">
              <span className="label">&nbsp;</span>
              <span className="value">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    const url = await window.DocuApi.signedUrl(currentFile.key);
                    if (!url) return;
                    const a = document.createElement("a");
                    a.href = url;
                    const suffix = langs.length > 1 ? (currentFile.lang || selectedLang || "").toUpperCase() : "";
                    a.download = safeDocFilename(doc.title, suffix);
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  }}
                >⬇ Descargar PDF original</button>
              </span>
            </div>
          )}
          <div style={{ marginTop: 14, padding: 10, background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 6, fontSize: 12 }}>
            ⚠ {t.watermark.line2}
          </div>

          {/* Linked documents */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <h4 style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 600 }}>
                {t.viewer?.relatedDocs || "Documentos relacionados"}
              </h4>
              {!readOnly && setState && (
                <button className="icon-btn" onClick={() => setShowPicker(true)} title={t.viewer?.addLink || "Añadir enlace"} style={{ marginLeft: 'auto' }}>
                  <Icon.plus />
                </button>
              )}
            </div>
            {linkedDocs.length === 0 && incomingDocs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>—</div>
            )}
            {linkedDocs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: incomingDocs.length > 0 ? 14 : 0 }}>
                {linkedDocs.map(ld => {
                  const ldStatus = state.statuses.find(s => s.id === ld.statusId);
                  return (
                    <div key={ld.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 6, border: '1px solid var(--line)' }}>
                      <button
                        onClick={() => onOpenDoc?.(ld)}
                        style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', flex: 1, cursor: 'pointer', color: 'var(--ink)' }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>↗ {ld.title}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                          {(t.statuses && t.statuses[ldStatus?.key]) || ldStatus?.key} · v{ld.version}
                        </div>
                      </button>
                      {!readOnly && setState && (
                        <button className="icon-btn" onClick={() => removeLink(ld.id)} title={t.common?.delete || "Quitar"} style={{ flexShrink: 0 }}>
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {incomingDocs.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  ↤ {t.viewer?.usedBy || "Usado por"}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {incomingDocs.map(ld => (
                    <button
                      key={ld.id}
                      onClick={() => onOpenDoc?.(ld)}
                      style={{ background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', cursor: 'pointer', color: 'var(--ink)', fontSize: 12, lineHeight: 1.4 }}
                    >
                      • {ld.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Projects this doc belongs to */}
          {!auditMode && (() => {
            const inProjects = (state.projects || []).filter(p => (p.docIds || []).includes(doc.id));
            if (inProjects.length === 0) return null;
            return (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 600 }}>
                  {t.viewer?.inProjects || "En proyectos"}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inProjects.map(p => {
                    const isShared = p.shareToken && p.shareExpiresAt && new Date(p.shareExpiresAt) > new Date();
                    const stMap = { draft: { label: t.projects?.statusDraft, fg: 'var(--muted)' }, active: { label: t.projects?.statusActive, fg: 'var(--ok)' }, archived: { label: t.projects?.statusArchived, fg: 'var(--warn)' } };
                    const sm = stMap[p.status] || stMap.active;
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg-soft)', borderRadius: 6, border: '1px solid var(--line)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>📁 {p.name}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: sm.fg }}>● {sm.label}</span>
                            {isShared && <span style={{ color: 'var(--ok)' }}>· 🔗 {t.projects?.shared || "Compartido"}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {showPicker && (
        <DocPickerModal
          state={state}
          t={t}
          excludeIds={[doc.id, ...linkedIds]}
          title={t.viewer?.addLink || "Añadir documento relacionado"}
          onClose={() => setShowPicker(false)}
          onConfirm={addLinks}
        />
      )}
    </Modal>
  );
}

function buildWatermarkedHtml(doc, state, t, lang, auditMode) {
  const user = state.users.find(u => u.id === state.config.currentUserId);
  const stamp = new Date().toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");
  const wmHeader = auditMode ? (t.audit?.wmAuditor || "AUDITOR EXTERNO") : t.watermark.line1;
  const wmText = `${wmHeader} · ${user?.name || "—"} · ${stamp}`;
  const cat = state.categories.find(c => c.id === doc.categoryId)?.name || "";
  const status = state.statuses.find(s => s.id === doc.statusId);
  const statusLabel = (t.statuses && t.statuses[status?.key]) || "";
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<title>${doc.title} — ${t.watermark.line1}</title>
<style>
  @page { size: A4; margin: 25mm 22mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px 36px 80px; position: relative; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  .meta { color: #666; font-size: 11px; margin-bottom: 24px; border-bottom: 1px solid #ddd; padding-bottom: 12px; }
  .row { display: flex; gap: 30px; margin-bottom: 4px; font-size: 12px; }
  .row b { color: #333; }
  .lorem { background: #ececea; height: 7px; border-radius: 2px; margin-bottom: 7px; }
  .short { width: 60%; } .med { width: 85%; }
  .wm {
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    display: flex; align-items: center; justify-content: center; overflow: hidden;
  }
  .wm .diagonal {
    transform: rotate(-30deg);
    font-family: monospace;
    color: rgba(0,0,0,.08);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    line-height: 2;
    white-space: nowrap;
    letter-spacing: .15em;
  }
  .footer-note {
    position: fixed; bottom: 12px; left: 36px; right: 36px;
    font-size: 9px; color: #888; text-align: center;
    border-top: 1px solid #ddd; padding-top: 6px;
  }
  @media print { .wm { position: fixed; } }
</style>
</head><body>
  <div class="wm"><div class="diagonal">${Array.from({length: 14}).map(()=>wmText).join('&nbsp;&nbsp;&nbsp;&nbsp;')}</div></div>
  <h1>${doc.title}</h1>
  <div class="meta">
    <div class="row"><span><b>${t.common.category}:</b> ${cat}</span><span><b>${t.common.status}:</b> ${statusLabel}</span><span><b>${t.common.version}:</b> v${doc.version}</span></div>
    <div class="row"><span><b>${t.documents.endDate}:</b> ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}</span></div>
  </div>
  <p>${(doc.description || "").replace(/[<>]/g, "")}</p>
  <h2>1. Objeto</h2><div class="lorem med"></div><div class="lorem"></div><div class="lorem short"></div>
  <h2>2. Alcance</h2><div class="lorem"></div><div class="lorem med"></div><div class="lorem short"></div>
  <h2>3. Procedimiento</h2><div class="lorem med"></div><div class="lorem"></div><div class="lorem"></div><div class="lorem short"></div>
  <h2>4. Responsabilidades</h2><div class="lorem"></div><div class="lorem med"></div>
  <div class="footer-note">${t.watermark.line2} · ${t.watermark.printedBy}: ${user?.name || "—"} · ${t.watermark.printedOn}: ${stamp}</div>
</body></html>`;
}

window.ViewerModal = ViewerModal;