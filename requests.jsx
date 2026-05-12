// Docuhotel — Document requests (solicitudes de documentación)

function RequestsPage({ state, setState, t, lang, log }) {
  const [editingId, setEditingId] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const allRequests = state.requests || [];

  const computeStatus = (r) => {
    if (r.submittedAt) return "submitted";
    if (new Date(r.expiresAt) < new Date()) return "expired";
    const days = Math.floor((new Date(r.expiresAt) - new Date()) / 86400000);
    if (days <= 7) return "expiring";
    if (r.savedAt && r.items.some(i => i.files?.length)) return "inprogress";
    return "pending";
  };

  const counts = React.useMemo(() => {
    const c = { all: allRequests.length, pending: 0, inprogress: 0, expiring: 0, submitted: 0, expired: 0 };
    allRequests.forEach(r => { c[computeStatus(r)] = (c[computeStatus(r)] || 0) + 1; });
    return c;
  }, [allRequests]);

  const requests = allRequests.filter(r => {
    if (filter !== "all" && computeStatus(r) !== filter) return false;
    if (query && !(r.title.toLowerCase().includes(query.toLowerCase()) || (r.recipientName || "").toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  const create = () => setEditingId("new");
  const editing = editingId === "new" ? null : requests.find(r => r.id === editingId);

  const save = (req) => {
    const isNew = !requests.find(r => r.id === req.id);
    setState(s => ({ ...s, requests: isNew ? [...(s.requests || []), req] : s.requests.map(r => r.id === req.id ? req : r) }));
    log(isNew ? "request_create" : "request_update", req.title);
    setEditingId(null);
  };

  const remove = (id) => {
    if (!confirm(t.requests?.confirmDelete || "¿Eliminar esta solicitud?")) return;
    const r = requests.find(x => x.id === id);
    setState(s => ({ ...s, requests: s.requests.filter(x => x.id !== id) }));
    log("request_delete", r?.title || id);
  };

  if (editingId !== null) {
    return <RequestEditor state={state} setState={setState} t={t} lang={lang} log={log} request={editing} onSave={save} onCancel={() => setEditingId(null)} />;
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";

  const statusInfo = (r) => {
    const s = computeStatus(r);
    if (s === "submitted") return { label: t.requests?.statusSubmitted || "Enviada", bg: "var(--ok-bg)", fg: "var(--ok)" };
    if (s === "inprogress") return { label: t.requests?.statusInProgress || "En curso", bg: "var(--bg-soft)", fg: "var(--ink)" };
    if (s === "expired") return { label: t.requests?.statusExpired || "Caducada", bg: "var(--err-bg, #fde8e8)", fg: "var(--err, #c0392b)" };
    if (s === "expiring") return { label: t.requests?.statusExpiring || "Por vencer", bg: "var(--warn-bg)", fg: "var(--warn)" };
    return { label: t.requests?.statusPending || "Pendiente", bg: "var(--bg-soft)", fg: "var(--muted)" };
  };

  const downloadAll = async (r, ev) => {
    ev?.stopPropagation();
    const files = r.items.flatMap(it => (it.files || []).map(f => ({ ...f, itemTitle: it.title })));
    if (files.length === 0) { alert(t.requests?.noFilesYet || "Aún no se ha subido ningún documento."); return; }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let href = f.dataUrl;
      if (!href && f.key && window.DocuApi && !window.DocuApi.offline) {
        href = await window.DocuApi.signedUrl(f.key);
      }
      if (!href) continue;
      const a = document.createElement("a");
      a.href = href;
      const safeItem = f.itemTitle.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40);
      a.download = `${String(i+1).padStart(2,"0")}_${safeItem}_${f.name}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      await new Promise(res => setTimeout(res, 250));
    }
    log("request_download_all", `${r.title} (${files.length} archivos)`);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.requests?.title || "Solicitudes de documentación"}</h1>
          <div className="page-sub">{t.requests?.subtitle || "Solicita documentos a empleados, proveedores o terceros mediante un enlace temporal"}</div>
        </div>
        <button className="btn btn-primary" onClick={create}><Icon.plus /> {t.requests?.newRequest || "Nueva solicitud"}</button>
      </div>

      {allRequests.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '8px 0 16px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: "all", label: t.requests?.fAll || "Todas" },
              { id: "pending", label: t.requests?.statusPending || "Pendientes" },
              { id: "inprogress", label: t.requests?.statusInProgress || "En curso" },
              { id: "expiring", label: t.requests?.statusExpiring || "Por vencer" },
              { id: "submitted", label: t.requests?.statusSubmitted || "Enviadas" },
              { id: "expired", label: t.requests?.statusExpired || "Caducadas" },
            ].map(f => (
              <button key={f.id} className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[f.id] || 0}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <input className="input" style={{ width: 220, fontSize: 12.5 }} placeholder={t.common?.search || "Buscar..."} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {requests.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📥</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{t.requests?.emptyTitle || "Aún no hay solicitudes"}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, maxWidth: 420, margin: '0 auto 18px' }}>
            {t.requests?.emptyHelp || "Crea una solicitud para pedir documentos a una persona externa (empleado, proveedor, etc.). Se enviará un enlace temporal para que suba la documentación."}
          </div>
          <button className="btn btn-primary" onClick={create}><Icon.plus /> {t.requests?.newRequest || "Nueva solicitud"}</button>
        </div>
      ) : (
        <div className="proj-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 20 }}>
          {requests.map(r => {
            const st = statusInfo(r);
            const total = r.items.length;
            const filled = r.items.filter(i => (i.files || []).length > 0).length;
            return (
              <div key={r.id} className="proj-card" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 18, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
                onClick={() => setEditingId(r.id)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{r.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                      <span className="pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      <span>· {filled}/{total} {t.requests?.docs || "documentos"}</span>
                    </div>
                  </div>
                  <button className="icon-btn" onClick={e => { e.stopPropagation(); remove(r.id); }}><Icon.trash /></button>
                </div>
                {r.recipientName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>→ {r.recipientName} {r.recipientEmail && `(${r.recipientEmail})`}</div>}
                <div style={{ height: 6, background: 'var(--bg-soft)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: total ? `${(filled/total)*100}%` : '0%', background: 'var(--ok)', transition: 'width 0.3s' }} />
                </div>
                {r.submittedAt && filled > 0 && (
                  <button className="btn btn-sm" onClick={(e) => downloadAll(r, e)} style={{ marginTop: 4 }}>
                    ⬇ {t.requests?.downloadAll || "Descargar todos"} ({filled})
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)' }}>
                  <span>{t.requests?.expires || "Caduca"}: {fmtDate(r.expiresAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestEditor({ state, setState, t, lang, log, request, onSave, onCancel }) {
  const [title, setTitle] = React.useState(request?.title || "");
  const [notes, setNotes] = React.useState(request?.notes || "");
  const [recipientName, setRecipientName] = React.useState(request?.recipientName || "");
  const [recipientEmail, setRecipientEmail] = React.useState(request?.recipientEmail || "");
  const [items, setItems] = React.useState(request?.items || [{ id: "it_" + Math.random().toString(36).slice(2,7), title: "", comments: "", required: true, files: [] }]);
  const [expiresAt, setExpiresAt] = React.useState(request?.expiresAt?.slice(0,10) || new Date(Date.now()+86400000*14).toISOString().slice(0,10));
  const [maxFileSizeMb, setMaxFileSizeMb] = React.useState(request?.maxFileSizeMb || 10);
  const [shareToken, setShareToken] = React.useState(request?.shareToken || "");
  const [copied, setCopied] = React.useState(false);
  const [sendToDocs, setSendToDocs] = React.useState(null); // { name, size, mime, key, dataUrl, title }
  const [promoting, setPromoting] = React.useState(false);

  const openUploaded = async (f) => {
    let href = f.dataUrl;
    if (!href && f.key && window.DocuApi && !window.DocuApi.offline) href = await window.DocuApi.signedUrl(f.key);
    if (!href) { alert(t.requests?.cannotOpen || "No se pudo abrir el archivo."); return; }
    window.open(href, "_blank", "noopener,noreferrer");
  };
  const sendFileToDocs = async (f, itemTitle) => {
    if (promoting) return;
    let key = f.key || null;
    if (key && window.DocuApi && !window.DocuApi.offline) {
      setPromoting(true);
      try { key = (await window.DocuApi.copyToDocsPath(state.hotelId, f.key, f.name)) || f.key; }
      catch (e) { console.error("copyToDocsPath", e); key = f.key; }
      setPromoting(false);
    }
    setSendToDocs({ name: f.name, size: f.size, mime: f.mime || f.type || "application/pdf", key, dataUrl: f.dataUrl || null, title: itemTitle });
  };

  const addItem = () => setItems(it => [...it, { id: "it_" + Math.random().toString(36).slice(2,7), title: "", comments: "", required: false, files: [] }]);
  const removeItem = (id) => setItems(it => it.filter(x => x.id !== id));
  const updateItem = (id, patch) => setItems(it => it.map(x => x.id === id ? { ...x, ...patch } : x));
  const moveItem = (id, dir) => setItems(it => {
    const idx = it.findIndex(x => x.id === id);
    const next = idx + dir;
    if (next < 0 || next >= it.length) return it;
    const copy = [...it];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    return copy;
  });

  const generateLink = () => {
    if (!shareToken) {
      const t2 = "req-" + Math.random().toString(36).slice(2,12);
      setShareToken(t2);
    }
  };
  const revoke = () => {
    if (!confirm(t.requests?.confirmRevoke || "¿Revocar enlace?")) return;
    setShareToken("");
  };

  const save = () => {
    if (!title.trim() || items.filter(i => i.title.trim()).length === 0) {
      alert(t.requests?.requiredErr || "Indica un título y al menos un documento.");
      return;
    }
    const req = {
      id: request?.id || window.DocuStore.uid("req"),
      title: title.trim(),
      notes,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      items: items.filter(i => i.title.trim()),
      expiresAt: new Date(expiresAt + "T23:59:59").toISOString(),
      maxFileSizeMb: Number(maxFileSizeMb) || 10,
      shareToken,
      status: request?.status || "open",
      savedAt: request?.savedAt || null,
      submittedAt: request?.submittedAt || null,
      log: request?.log || [],
      createdAt: request?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(req);
  };

  const shareUrl = shareToken ? `${location.href.split("#")[0].split("?")[0]}#/request/${shareToken}` : "";
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };
  const sendEmail = () => {
    const subject = encodeURIComponent(t.requests?.emailSubject?.replace("{title}", title) || `Solicitud de documentación: ${title}`);
    const body = encodeURIComponent((t.requests?.emailBody || "Hola {name},\n\nPor favor sube la documentación solicitada en el siguiente enlace antes del {expires}:\n\n{url}\n\nGracias.").replace("{name}", recipientName || "").replace("{url}", shareUrl).replace("{expires}", new Date(expiresAt).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB")));
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  };

  const submittedReadonly = !!request?.submittedAt;

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ marginBottom: 8 }}>← {t.common?.back || "Atrás"}</button>
          <h1 className="page-title">{request ? (t.requests?.editTitle || "Editar solicitud") : (t.requests?.newRequest || "Nueva solicitud")}</h1>
          <div className="page-sub">{t.requests?.editSubtitle || "Configura los documentos a solicitar y genera un enlace para enviar."}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>{t.common.cancel}</button>
          <button className="btn btn-primary" onClick={save} disabled={submittedReadonly}><Icon.check /> {t.common.save}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 24, marginTop: 12 }}>
        <div>
          <div className="form-grid">
            <div className="field full">
              <label>{t.requests?.requestTitle || "Título de la solicitud"}</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t.requests?.titlePlaceholder || "Documentación PRL para nuevo empleado"} disabled={submittedReadonly} />
            </div>
            <div className="field">
              <label>{t.requests?.recipientName || "Destinatario (nombre)"}</label>
              <input className="input" value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Ana Lopez" disabled={submittedReadonly} />
            </div>
            <div className="field">
              <label>{t.requests?.recipientEmail || "Email del destinatario"}</label>
              <input className="input" type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="ana@ejemplo.com" disabled={submittedReadonly} />
            </div>
            <div className="field full">
              <label>{t.requests?.notesLabel || "Instrucciones generales (verá el destinatario)"}</label>
              <textarea className="textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t.requests?.notesPlaceholder || "Sube todos los certificados antes del viernes…"} disabled={submittedReadonly} />
            </div>
            <div className="field">
              <label>{t.requests?.expiresLabel || "Fecha de caducidad del enlace"}</label>
              <input className="input" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={submittedReadonly} />
            </div>
            <div className="field">
              <label>{t.requests?.maxSizeLabel || "Tamaño máximo por documento (MB)"}</label>
              <input className="input" type="number" min="1" max="100" value={maxFileSizeMb} onChange={e => setMaxFileSizeMb(e.target.value)} disabled={submittedReadonly} />
            </div>
          </div>

          {/* Items */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.requests?.docsToRequest || "Documentos a solicitar"} ({items.length})</h3>
              <div style={{ flex: 1 }} />
              {!submittedReadonly && <button className="btn btn-sm" onClick={addItem}><Icon.plus /> {t.requests?.addDoc || "Añadir documento"}</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, idx) => (
                <div key={it.id} style={{ padding: 14, background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, minWidth: 22 }}>{String(idx+1).padStart(2,"0")}</span>
                    <input className="input" style={{ flex: 1 }} value={it.title} onChange={e => updateItem(it.id, { title: e.target.value })} placeholder={t.requests?.docTitlePh || "Ej: DNI / NIE (ambas caras)"} disabled={submittedReadonly} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!!it.required} onChange={e => updateItem(it.id, { required: e.target.checked })} disabled={submittedReadonly} />
                      {t.requests?.required || "Obligatorio"}
                    </label>
                    {!submittedReadonly && (
                      <>
                        <button className="icon-btn" onClick={() => moveItem(it.id, -1)} disabled={idx === 0}>↑</button>
                        <button className="icon-btn" onClick={() => moveItem(it.id, 1)} disabled={idx === items.length-1}>↓</button>
                        <button className="icon-btn" onClick={() => removeItem(it.id)}><Icon.trash /></button>
                      </>
                    )}
                  </div>
                  <textarea className="textarea" rows={2} value={it.comments} onChange={e => updateItem(it.id, { comments: e.target.value })} placeholder={t.requests?.commentsPh || "Comentarios / instrucciones (opcional)"} disabled={submittedReadonly} style={{ fontSize: 12.5 }} />
                  {(it.files || []).length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {it.files.map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name} <span style={{ color: 'var(--muted)' }}>· {((f.size||0)/1024).toFixed(0)} KB</span></span>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openUploaded(f)}>👁 {t.requests?.viewFile || t.common?.preview || "Ver"}</button>
                          <button type="button" className="btn btn-sm" disabled={promoting} onClick={() => sendFileToDocs(f, it.title)}>➕ {t.requests?.sendToDocs || "Enviar a documentos"}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Share panel */}
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>{t.requests?.shareTitle || "Enviar al destinatario"}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>{t.requests?.shareHelp || "Genera un enlace para que el destinatario suba la documentación."}</p>

          {!shareToken ? (
            <button className="btn" onClick={generateLink}>{t.requests?.generateLink || "Generar enlace"}</button>
          ) : (
            <div>
              <div style={{ padding: 12, background: 'var(--ok-bg)', borderRadius: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ok)', fontWeight: 600, marginBottom: 6 }}>● {t.requests?.linkActive || "Enlace activo"}</div>
                <input className="input" readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ fontSize: 10.5, fontFamily: 'monospace', padding: '6px 8px' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <button className="btn btn-sm" onClick={copyLink}>{copied ? "✓ " + (t.common?.copied || "Copiado") : (t.common?.copy || "Copiar enlace")}</button>
                {recipientEmail && <button className="btn btn-sm" onClick={sendEmail}>✉ {t.requests?.sendByEmail || "Enviar por email"}</button>}
                <button className="btn btn-sm btn-ghost" onClick={revoke}>{t.requests?.revoke || "Revocar"}</button>
              </div>
            </div>
          )}

          {request?.submittedAt && (
            <div style={{ marginTop: 18, padding: 12, background: 'var(--ok-bg)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ok)', fontWeight: 600, marginBottom: 8 }}>✓ {t.requests?.statusSubmitted || "Enviada"}</div>
              <div style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 10 }}>{new Date(request.submittedAt).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB")}</div>
              <button className="btn btn-sm" onClick={async () => {
                const files = (request.items || []).flatMap(it => (it.files || []).map(f => ({ ...f, itemTitle: it.title })));
                if (!files.length) { alert(t.requests?.noFilesYet || "No hay archivos."); return; }
                for (let i = 0; i < files.length; i++) {
                  const f = files[i];
                  let href = f.dataUrl;
                  if (!href && f.key && window.DocuApi && !window.DocuApi.offline) {
                    href = await window.DocuApi.signedUrl(f.key);
                  }
                  if (!href) continue;
                  const a = document.createElement("a");
                  a.href = href;
                  const safeItem = f.itemTitle.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40);
                  a.download = `${String(i+1).padStart(2,"0")}_${safeItem}_${f.name}`;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  await new Promise(res => setTimeout(res, 250));
                }
                log && log("request_download_all", `${request.title} (${files.length})`);
              }} style={{ width: '100%' }}>⬇ {t.requests?.downloadAll || "Descargar todos"} ({(request.items || []).reduce((a,i) => a + (i.files?.length||0), 0)})</button>
            </div>
          )}

          {request?.log && request.log.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 600 }}>{t.requests?.activityLog || "Historial"}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--ink)', maxHeight: 240, overflowY: 'auto' }}>
                {[...request.log].reverse().map((e, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--muted)' }}>{new Date(e.ts).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB")}</span> · {e.action}: {e.details}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {promoting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, fontSize: 14 }}>
          <div style={{ background: 'var(--bg)', padding: '14px 22px', borderRadius: 10 }}>{t.requests?.sendingToDocs || "Preparando documento…"}</div>
        </div>
      )}

      {sendToDocs && window.DocumentForm && (
        <window.DocumentForm
          state={state} t={t} lang={lang}
          doc={null}
          initialFile={{ name: sendToDocs.name, size: sendToDocs.size, mime: sendToDocs.mime, key: sendToDocs.key, dataUrl: sendToDocs.dataUrl }}
          initialTitle={sendToDocs.title}
          onSave={(newDoc) => {
            setState(s => ({ ...s, documents: [newDoc, ...s.documents] }));
            log && log("doc_create", newDoc.title);
            setSendToDocs(null);
            alert(t.requests?.sentToDocsOk || "Documento añadido a la sección Documentos.");
          }}
          onClose={() => setSendToDocs(null)}
        />
      )}
    </div>
  );
}

// Public-facing upload page (#/request/<token>)
function RequestSubmitView({ request, state, setState, t, lang, setLang }) {
  const [items, setItems] = React.useState(request.items);
  const [submitted, setSubmitted] = React.useState(!!request.submittedAt);
  const fmtDateTime = (iso) => new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");
  const expiresMs = new Date(request.expiresAt) - new Date();
  const daysLeft = Math.max(0, Math.floor(expiresMs / 86400000));
  const expired = expiresMs < 0;

  const persistItems = (newItems, logEntry) => {
    setItems(newItems);
    setState(s => ({
      ...s,
      requests: s.requests.map(r => r.id === request.id ? {
        ...r,
        items: newItems,
        log: logEntry ? [...(r.log || []), logEntry] : (r.log || []),
        updatedAt: new Date().toISOString(),
      } : r),
    }));
  };

  const onFile = async (itemId, file) => {
    if (!file) return;
    const maxBytes = (request.maxFileSizeMb || 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      alert((t.requests?.tooBig || "Archivo demasiado grande. Máximo:") + " " + request.maxFileSizeMb + " MB");
      return;
    }
    const useBackend = window.DocuApi && !window.DocuApi.offline;
    const itTitle = items.find(it => it.id === itemId)?.title || "";
    if (useBackend) {
      try {
        const uploadId = window.DocuStore.uid("up");
        const up = await window.DocuApi.uploadRequestFile(request.id, itemId, uploadId, file);
        const fileObj = { id: up.id, name: up.name, size: up.size, type: file.type, key: up.key, uploadedAt: new Date().toISOString(), dataUrl: null, previewUrl: (typeof URL !== "undefined" && URL.createObjectURL) ? URL.createObjectURL(file) : null };
        const newItems = items.map(it => it.id === itemId ? { ...it, files: [...(it.files || []), fileObj] } : it);
        await window.DocuApi.requestLog(request.shareToken, "upload", `${itTitle}: ${file.name} (${(file.size/1024).toFixed(0)} KB)`);
        persistItems(newItems, { ts: new Date().toISOString(), action: "upload", details: `${itTitle}: ${file.name} (${(file.size/1024).toFixed(0)} KB)` });
      } catch (err) {
        alert("Error subiendo el archivo: " + (err?.message || err));
      }
      return;
    }
    // Offline / localStorage mode (prototype)
    const reader = new FileReader();
    reader.onload = () => {
      const fileObj = { name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), dataUrl: reader.result };
      const newItems = items.map(it => it.id === itemId ? { ...it, files: [...(it.files || []), fileObj] } : it);
      persistItems(newItems, { ts: new Date().toISOString(), action: "upload", details: `${itTitle}: ${file.name} (${(file.size/1024).toFixed(0)} KB)` });
    };
    reader.readAsDataURL(file);
  };

  const removeFile = (itemId, fileIdx) => {
    if (!confirm(t.requests?.confirmRemoveFile || "¿Eliminar este archivo?")) return;
    const item = items.find(it => it.id === itemId);
    const f = item?.files?.[fileIdx];
    const newItems = items.map(it => it.id === itemId ? { ...it, files: it.files.filter((_,i) => i !== fileIdx) } : it);
    persistItems(newItems, { ts: new Date().toISOString(), action: "delete", details: `${item?.title}: ${f?.name}` });
  };

  const saveDraft = () => {
    setState(s => ({ ...s, requests: s.requests.map(r => r.id === request.id ? { ...r, savedAt: new Date().toISOString(), log: [...(r.log || []), { ts: new Date().toISOString(), action: "save_draft", details: t.requests?.savedDraft || "Guardado como borrador" }] } : r) }));
    alert(t.requests?.savedOk || "Guardado. Puedes volver más tarde con el mismo enlace para seguir subiendo documentos.");
  };

  const submitAll = () => {
    const missingRequired = items.filter(it => it.required && (!it.files || it.files.length === 0));
    if (missingRequired.length > 0) {
      if (!confirm((t.requests?.missingRequired || "Faltan documentos obligatorios:") + "\n\n" + missingRequired.map(i => "• " + i.title).join("\n") + "\n\n" + (t.requests?.submitAnyway || "¿Enviar de todos modos?"))) return;
    } else {
      if (!confirm(t.requests?.confirmSubmit || "¿Enviar definitivamente? Después no podrás añadir más documentos.")) return;
    }
    setState(s => ({ ...s, requests: s.requests.map(r => r.id === request.id ? { ...r, submittedAt: new Date().toISOString(), status: "submitted", log: [...(r.log || []), { ts: new Date().toISOString(), action: "submit", details: t.requests?.submitted || "Envío definitivo" }] } : r) }));
    setSubmitted(true);
  };

  if (expired && !submitted) {
    return (
      <div className="app">
        <main className="main">
          <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
            <h2>⏰ {t.requests?.linkExpired || "Enlace caducado"}</h2>
            <p>{t.requests?.linkExpiredHelp || "Este enlace ya no es válido. Contacta con quien te lo envió."}</p>
          </div>
        </main>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="app">
        <main className="main">
          <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', padding: 30, background: 'var(--ok-bg)', borderRadius: 12 }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>✓</div>
            <h2 style={{ margin: '0 0 10px', color: 'var(--ok)' }}>{t.requests?.thanksTitle || "¡Documentación enviada!"}</h2>
            <p style={{ color: 'var(--ink)', lineHeight: 1.6 }}>{t.requests?.thanksHelp || "Gracias. La organización ha recibido tus documentos y se pondrá en contacto si necesita algo más."}</p>
            <div style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>{items.filter(i => i.files?.length).length} {t.requests?.docs || "documentos"} · {new Date(request.submittedAt || Date.now()).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB")}</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DH</span>
          <span className="brand-name">{t.appName}</span>
          <span className="brand-tag">— {t.requests?.uploadTitle || "Solicitud de documentación"}</span>
        </div>
        <div className="spacer" />
        <div className="lang-switch">
          {["es","en","de"].map(l => <button key={l} className={l === lang ? "active" : ""} onClick={() => setLang(l)}>{l}</button>)}
        </div>
      </header>
      <main className="main" style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Banner */}
        <div style={{ padding: '18px 22px', background: 'var(--bg-soft)', borderRadius: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 30 }}>📥</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>{request.title}</h1>
            {request.recipientName && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.requests?.for || "Para"}: <strong>{request.recipientName}</strong></div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>{t.requests?.expiresIn || "Caduca en"}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{daysLeft} {t.audit?.days || "días"}</div>
          </div>
        </div>

        {request.notes && (
          <div style={{ padding: 14, background: 'var(--warn-bg)', borderLeft: '3px solid var(--warn)', borderRadius: 4, marginBottom: 20, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {request.notes}
          </div>
        )}

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((it, idx) => (
            <RequestItemUpload key={it.id} item={it} idx={idx} t={t} lang={lang} maxFileSizeMb={request.maxFileSizeMb} onFile={(f) => onFile(it.id, f)} onRemove={(i) => removeFile(it.id, i)} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ marginTop: 30, padding: 20, background: 'var(--bg-soft)', borderRadius: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <button className="btn" onClick={saveDraft} style={{ width: '100%', padding: '14px 16px', fontSize: 14, fontWeight: 600 }}>💾 {t.requests?.btnSave || "Guardar y continuar más tarde"}</button>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4, textAlign: 'center' }}>{t.requests?.btnSaveHelp || "Guarda lo que has subido hasta ahora. Podrás volver con el mismo enlace y completar la subida en otro momento."}</p>
          </div>
          <div>
            <button className="btn btn-primary" onClick={submitAll} style={{ width: '100%', padding: '14px 16px', fontSize: 14, fontWeight: 600 }}>✓ {t.requests?.btnSubmit || "Enviar definitivamente"}</button>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4, textAlign: 'center' }}>{t.requests?.btnSubmitHelp || "Avisa a la organización de que has terminado. Tras esto no podrás añadir más documentos."}</p>
          </div>
        </div>

        <footer style={{ marginTop: 30, paddingTop: 16, borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
          {t.requests?.footer || "Enlace seguro · Tus archivos se cifran en tránsito"} · Docuhotel
        </footer>
      </main>
    </div>
  );
}

function RequestItemUpload({ item, idx, t, lang, maxFileSizeMb, onFile, onRemove }) {
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef(null);
  const fmt = (iso) => new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");

  return (
    <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{String(idx+1).padStart(2,"0")}</span>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>{item.title}</h3>
        {item.required && <span className="pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 10.5 }}>{t.requests?.required || "Obligatorio"}</span>}
        {(item.files || []).length > 0 && <span className="pill" style={{ background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: 10.5 }}>✓ {item.files.length}</span>}
      </div>
      {item.comments && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{item.comments}</div>}

      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); for (const f of e.dataTransfer.files) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        style={{ padding: 18, border: '2px dashed ' + (drag ? 'var(--ink)' : 'var(--line)'), borderRadius: 8, background: drag ? 'var(--bg-soft)' : 'transparent', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', transition: 'all 0.15s' }}
      >
        📎 {t.requests?.dropHere || "Arrastra aquí o haz clic para subir"} · {t.requests?.max || "Máx"} {maxFileSizeMb} MB
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => { for (const f of e.target.files) onFile(f); e.target.value = ""; }} />
      </div>

      {(item.files || []).map((f, i) => (
        <div key={i} style={{ marginTop: 8, padding: '8px 12px', background: 'var(--ok-bg)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name} <span style={{ color: 'var(--muted)' }}>· {((f.size||0)/1024).toFixed(0)} KB · {fmt(f.uploadedAt)}</span></span>
          {(f.previewUrl || f.dataUrl) && (
            <button type="button" className="icon-btn" onClick={() => window.open(f.previewUrl || f.dataUrl, "_blank", "noopener,noreferrer")} title={t.requests?.viewFile || t.common?.preview || "Ver"}>👁</button>
          )}
          <button type="button" className="icon-btn" onClick={() => onRemove(i)} title={t.common?.delete || "Eliminar"}>×</button>
        </div>
      ))}
    </div>
  );
}

window.RequestsPage = RequestsPage;
window.RequestSubmitView = RequestSubmitView;
