// Docuhotel — Audit projects: group documents for special audits

function ProjectsPage({ state, setState, t, lang, log, openViewer }) {
  const [editingId, setEditingId] = React.useState(null); // null | "new" | <id>
  const projects = state.projects || [];

  const create = () => setEditingId("new");
  const editing = editingId === "new" ? null : projects.find(p => p.id === editingId);

  const save = (proj, opts) => {
    const isNew = !projects.find(p => p.id === proj.id);
    setState(s => ({ ...s, projects: isNew ? [...(s.projects || []), proj] : s.projects.map(p => p.id === proj.id ? proj : p) }));
    log(isNew ? "project_create" : "project_update", proj.name);
    // opts.stay is set by generateShare so the editor remains open after the
    // share token is persisted — the user can immediately copy the link.
    if (opts && opts.stay) setEditingId(proj.id);
    else setEditingId(null);
  };

  const remove = (id) => {
    if (!confirm(t.projects?.confirmDelete || "¿Eliminar este proyecto?")) return;
    const p = projects.find(x => x.id === id);
    setState(s => ({ ...s, projects: s.projects.filter(p => p.id !== id) }));
    log("project_delete", p?.name || id);
  };

  if (editingId !== null) {
    return (
      <ProjectEditor
        state={state} setState={setState} t={t} lang={lang} log={log}
        project={editing}
        onSave={save}
        onCancel={() => setEditingId(null)}
        openViewer={openViewer}
      />
    );
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";

  const statusPill = (st) => {
    const map = {
      draft:    { label: t.projects?.statusDraft    || "Borrador",  bg: "var(--bg-soft)", fg: "var(--muted)" },
      active:   { label: t.projects?.statusActive   || "Activo",    bg: "var(--ok-bg)",   fg: "var(--ok)" },
      archived: { label: t.projects?.statusArchived || "Archivado", bg: "var(--warn-bg)", fg: "var(--warn)" },
    };
    const s = map[st] || map.active;
    return <span className="pill" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.projects?.title || "Proyectos de auditoría"}</h1>
          <div className="page-sub">{t.projects?.subtitle || "Agrupa documentos para auditorías especiales"}</div>
        </div>
        <button className="btn btn-primary" onClick={create}><Icon.plus /> {t.projects?.newProject || "Nuevo proyecto"}</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{t.projects?.emptyTitle || "Aún no hay proyectos"}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
            {t.projects?.emptyHelp || "Crea un proyecto para agrupar documentos de una auditoría concreta (seguro, ISO, sanidad, etc.)."}
          </div>
          <button className="btn btn-primary" onClick={create}><Icon.plus /> {t.projects?.newProject || "Nuevo proyecto"}</button>
        </div>
      ) : (
        <div className="proj-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
          {projects.map(p => (
            <div key={p.id} className="proj-card" style={{
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 18,
              background: 'var(--bg)',
              display: 'flex', flexDirection: 'column', gap: 10,
              transition: 'border-color 0.15s, box-shadow 0.15s',
              cursor: 'pointer',
            }}
              onClick={() => setEditingId(p.id)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {statusPill(p.status)}
                    <span>· {(p.docIds || []).length} {t.projects?.docCount || "documentos"}</span>
                  </div>
                </div>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); remove(p.id); }}>
                  <Icon.trash />
                </button>
              </div>
              {p.notes && <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.notes}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)' }}>
                <span>{t.projects?.updated || "Actualizado"}: {fmtDate(p.updatedAt)}</span>
                {p.shareToken && p.shareExpiresAt && new Date(p.shareExpiresAt) > new Date() && (
                  <span style={{ marginLeft: 'auto', color: 'var(--ok)' }}>● {t.projects?.shared || "Compartido"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectEditor({ state, setState, t, lang, log, project, onSave, onCancel, openViewer }) {
  const [name, setName] = React.useState(project?.name || "");
  const [notes, setNotes] = React.useState(project?.notes || "");
  const [status, setStatus] = React.useState(project?.status || "draft");
  const [docIds, setDocIds] = React.useState(project?.docIds || []);
  const [showPicker, setShowPicker] = React.useState(false);
  const [shareToken, setShareToken] = React.useState(project?.shareToken || "");
  const [shareExpiresAt, setShareExpiresAt] = React.useState(project?.shareExpiresAt || "");
  const [copied, setCopied] = React.useState(false);

  const docs = docIds.map(id => state.documents.find(d => d.id === id)).filter(Boolean);

  const save = () => {
    if (!name.trim()) return;
    const proj = {
      id: project?.id || window.DocuStore.uid("proj"),
      name: name.trim(),
      notes,
      status,
      docIds,
      shareToken,
      shareExpiresAt,
      createdAt: project?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(proj);
  };

  const removeDoc = (id) => setDocIds(ids => ids.filter(x => x !== id));
  const addDocs = (ids) => { setDocIds(prev => Array.from(new Set([...prev, ...ids]))); setShowPicker(false); };

  const generateShare = (days) => {
    if (!name.trim()) {
      alert(t.projects?.nameFirst || "Pon un nombre al proyecto antes de generar el enlace.");
      return;
    }
    const token = "audit-" + Math.random().toString(36).slice(2, 12);
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    setShareToken(token);
    setShareExpiresAt(expires);
    // Persist right away. Without this the share_token stayed null in the DB
    // until the user pressed Save manually, and the audit link returned
    // "Enlace caducado" because audit_project() could not match the token.
    const proj = {
      id: project?.id || window.DocuStore.uid("proj"),
      name: name.trim(),
      notes, status, docIds,
      shareToken: token,
      shareExpiresAt: expires,
      createdAt: project?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(proj, { stay: true });
    log("project_share", `${name} → ${days} días`);
  };
  const revokeShare = () => {
    if (!confirm(t.projects?.confirmRevoke || "¿Revocar el enlace? El auditor dejará de poder acceder.")) return;
    setShareToken("");
    setShareExpiresAt("");
  };

  const shareUrl = shareToken ? `${location.href.split("#")[0].split("?")[0]}#/audit/${shareToken}` : "";
  const isShareActive = shareToken && shareExpiresAt && new Date(shareExpiresAt) > new Date();
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ marginBottom: 8 }}>← {t.common?.back || "Atrás"}</button>
          <h1 className="page-title">{project ? (t.projects?.editTitle || "Editar proyecto") : (t.projects?.newProject || "Nuevo proyecto")}</h1>
          <div className="page-sub">{t.projects?.subtitle || "Agrupa documentos para auditorías especiales"}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>{t.common.cancel}</button>
          <button className="btn btn-primary" onClick={save}><Icon.check /> {t.common.save}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 24, marginTop: 12 }}>
        {/* Main column */}
        <div>
          <div className="form-grid">
            <div className="field full">
              <label>{t.projects?.projectName || "Nombre del proyecto"}</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t.projects?.namePlaceholder || "Auditoría seguro 2026"} />
            </div>
            <div className="field">
              <label>{t.common.status}</label>
              <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="draft">{t.projects?.statusDraft || "Borrador"}</option>
                <option value="active">{t.projects?.statusActive || "Activo"}</option>
                <option value="archived">{t.projects?.statusArchived || "Archivado"}</option>
              </select>
            </div>
            <div className="field">
              <label>{t.projects?.docCount || "Documentos"}</label>
              <input className="input" disabled value={`${docs.length}`} />
            </div>
            <div className="field full">
              <label>{t.projects?.notes || "Notas / observaciones"}</label>
              <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={t.projects?.notesPlaceholder || "Auditor previsto, contactos, observaciones para esta auditoría…"} />
            </div>
          </div>

          {/* Documents list */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t.projects?.docsInProject || "Documentos en el proyecto"} ({docs.length})</h3>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setShowPicker(true)}><Icon.plus /> {t.projects?.addDocs || "Añadir documentos"}</button>
            </div>
            {docs.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 13 }}>
                {t.projects?.noDocsYet || "Sin documentos aún. Pulsa “Añadir documentos” para empezar."}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {docs.map(d => {
                  const cat = state.categories.find(c => c.id === d.categoryId);
                  const st = state.statuses.find(s => s.id === d.statusId);
                  const depts = d.departments.includes("*")
                    ? [t.documents.allDepartments]
                    : d.departments.map(id => state.departments.find(x => x.id === id)?.name).filter(Boolean);
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 8 }}>
                      <button onClick={() => openViewer?.(d)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', flex: 1, cursor: 'pointer', color: 'var(--ink)' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          {cat?.name} · {depts.join(", ")} · v{d.version}
                        </div>
                      </button>
                      <StatusPill status={st} t={t} />
                      <ExpiryCell expiry={d.expiryDate} t={t} lang={lang} />
                      <button className="icon-btn" onClick={() => removeDoc(d.id)} title={t.common.delete}><Icon.trash /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Side column — share */}
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>{t.projects?.shareTitle || "Compartir con auditor"}</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
            {t.projects?.shareHelp || "Genera un enlace temporal de solo lectura para que el auditor vea los documentos sin descargarlos."}
          </p>

          {!shareToken ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" onClick={() => generateShare(7)}>{t.projects?.share7 || "Generar enlace · 7 días"}</button>
              <button className="btn" onClick={() => generateShare(14)}>{t.projects?.share14 || "Generar enlace · 14 días"}</button>
              <button className="btn" onClick={() => generateShare(30)}>{t.projects?.share30 || "Generar enlace · 30 días"}</button>
            </div>
          ) : (
            <div>
              <div style={{ padding: 14, background: isShareActive ? 'var(--ok-bg)' : 'var(--warn-bg)', borderRadius: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: isShareActive ? 'var(--ok)' : 'var(--warn)', fontWeight: 600, marginBottom: 6 }}>
                  {isShareActive ? "● " + (t.projects?.activeLink || "Enlace activo") : "● " + (t.projects?.expiredLink || "Enlace caducado")}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                  {t.projects?.expiresOn || "Caduca el"}: <strong>{fmtDateTime(shareExpiresAt)}</strong>
                </div>
              </div>
              <div className="field">
                <label>{t.projects?.linkUrl || "URL"}</label>
                <input className="input" readOnly value={shareUrl} onFocus={e => e.target.select()} style={{ fontSize: 11, fontFamily: 'monospace' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-sm" onClick={copyLink} style={{ flex: 1 }}>{copied ? "✓ " + (t.common?.copied || "Copiado") : (t.common?.copy || "Copiar")}</button>
                <button className="btn btn-sm btn-ghost" onClick={revokeShare}>{t.projects?.revoke || "Revocar"}</button>
              </div>
              {/* QR */}
              {window.generateQrDataUrl && shareUrl && (
                <div style={{ marginTop: 16, textAlign: 'center', padding: 12, background: 'var(--bg-soft)', borderRadius: 10 }}>
                  <img src={window.generateQrDataUrl(shareUrl, 200)} alt="QR" style={{ width: 160, height: 160, display: 'block', margin: '0 auto', background: '#fff', borderRadius: 6 }} />
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8 }}>{t.projects?.scanToView || "Escanear para ver"}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <DocPickerModal
          state={state} t={t}
          excludeIds={docIds}
          title={t.projects?.pickDocs || "Selecciona documentos para añadir al proyecto"}
          onClose={() => setShowPicker(false)}
          onConfirm={addDocs}
        />
      )}
    </div>
  );
}

function DocPickerModal({ state, t, excludeIds = [], title, onClose, onConfirm }) {
  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [statusId, setStatusId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [vigorOnly, setVigorOnly] = React.useState(false);
  const [picked, setPicked] = React.useState([]);

  const candidates = state.documents.filter(d => !excludeIds.includes(d.id));
  const filtered = candidates.filter(d => {
    if (search && !(d.title + " " + (d.description || "")).toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryId && d.categoryId !== categoryId) return false;
    if (statusId && d.statusId !== statusId) return false;
    if (departmentId && !(d.departments.includes(departmentId) || d.departments.includes("*"))) return false;
    if (vigorOnly) {
      const st = state.statuses.find(s => s.id === d.statusId);
      if (st?.key !== "active") return false;
    }
    return true;
  });

  const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll = () => {
    const all = filtered.map(d => d.id);
    setPicked(p => all.every(id => p.includes(id)) ? p.filter(id => !all.includes(id)) : Array.from(new Set([...p, ...all])));
  };
  const allChecked = filtered.length > 0 && filtered.every(d => picked.includes(d.id));

  return (
    <Modal
      size="lg"
      title={title}
      onClose={onClose}
      footer={
        <>
          <span style={{ color: 'var(--muted)', fontSize: 12.5, marginRight: 'auto' }}>{picked.length} {t.common?.selected || "seleccionados"}</span>
          <button className="btn btn-ghost" onClick={onClose}>{t.common.cancel}</button>
          <button className="btn btn-primary" disabled={picked.length === 0} onClick={() => onConfirm(picked)}><Icon.check /> {t.projects?.addSelected || "Añadir"} ({picked.length})</button>
        </>
      }
    >
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="input" style={{ flex: '1 1 240px', minWidth: 200 }} placeholder={t.documents?.searchPlaceholder || "Buscar…"} value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select" style={{ minWidth: 140 }} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">{t.common.category} · {t.common?.all || "Todas"}</option>
          {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={statusId} onChange={e => setStatusId(e.target.value)}>
          <option value="">{t.common.status} · {t.common?.all || "Todos"}</option>
          {state.statuses.map(s => <option key={s.id} value={s.id}>{(t.statuses && t.statuses[s.key]) || s.key}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
          <option value="">{t.common.departments} · {t.common?.all || "Todos"}</option>
          {state.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={vigorOnly} onChange={e => setVigorOnly(e.target.checked)} />
          {t.projects?.onlyActive || "Solo vigentes"}
        </label>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            {filtered.length} {t.common?.results || "resultados"}
          </label>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>—</div>
          ) : filtered.map(d => {
            const cat = state.categories.find(c => c.id === d.categoryId);
            const st = state.statuses.find(s => s.id === d.statusId);
            const depts = d.departments.includes("*")
              ? [t.documents.allDepartments]
              : d.departments.map(id => state.departments.find(x => x.id === id)?.name).filter(Boolean);
            const isPicked = picked.includes(d.id);
            return (
              <label key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderBottom: '1px solid var(--line)',
                background: isPicked ? 'var(--ok-bg)' : 'transparent',
                cursor: 'pointer',
              }}>
                <input type="checkbox" checked={isPicked} onChange={() => toggle(d.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{d.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                    {cat?.name} · {depts.join(", ")} · v{d.version}
                  </div>
                </div>
                <StatusPill status={st} t={t} />
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

window.ProjectsPage = ProjectsPage;
window.DocPickerModal = DocPickerModal;
