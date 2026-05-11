// Docuhotel — Document viewer with watermarked download

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

  // Build watermark line repeated diagonally
  const now = new Date();
  const stamp = now.toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");
  const wmHeader = auditMode ? (t.audit?.wmAuditor || "AUDITOR EXTERNO") : t.watermark.line1;
  const wmText = `${wmHeader} · ${user?.name || "—"} · ${stamp}`;
  const wmLines = Array.from({ length: 12 }, () => wmText).join("    ");

  const handleDownload = () => {
    onDownloaded(doc);
    // generate a watermarked HTML "PDF-like" file (real apps would re-render the PDF)
    const html = buildWatermarkedHtml(doc, state, t, lang, auditMode);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeAuditor = (user?.name || "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    const suffix = auditMode && safeAuditor ? `_auditor-${safeAuditor}` : "_copia-privada";
    a.download = (doc.file?.name?.replace(/\.pdf$/i, "") || doc.title) + suffix + ".html";
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
        </div>
        <div className="viewer-side">
          <h4>{t.viewer.meta}</h4>
          <div className="meta-row"><span className="label">{t.common.title}</span><span className="value">{doc.title}</span></div>
          <div className="meta-row"><span className="label">{t.common.status}</span><span className="value"><StatusPill status={status} t={t} /></span></div>
          <div className="meta-row"><span className="label">{t.common.category}</span><span className="value">{cat?.name || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.common.departments}</span><span className="value">{departmentNames.join(", ") || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.common.responsibles}</span><span className="value">{respNames.join(", ") || "—"}</span></div>
          <div className="meta-row"><span className="label">{t.documents.startDate}</span><span className="value">{fmtDate(doc.startDate)}</span></div>
          <div className="meta-row"><span className="label">{t.documents.endDate}</span><span className="value">{fmtDate(doc.expiryDate)}</span></div>
          <div className="meta-row"><span className="label">{t.common.version}</span><span className="value">v{doc.version}</span></div>
          <div className="meta-row"><span className="label">{t.common.file}</span><span className="value" style={{ wordBreak: 'break-all' }}>{doc.file?.name}</span></div>
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