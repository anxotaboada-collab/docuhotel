// Docuhotel — Documents page (list + filters + form)

function DocumentsPage({ state, setState, t, lang, openViewer, log, density, can, viewerUser }) {
  can = can || (() => true);
  const [filterStatus, setFilterStatus] = React.useState("all"); // all | active | draft | expiring | <statusId>
  const [search, setSearch] = React.useState("");
  const [filterCategory, setFilterCategory] = React.useState("");
  const [filterDepartment, setFilterDepartment] = React.useState("");
  const [filterResponsible, setFilterResponsible] = React.useState("");
  const [filterDateFrom, setFilterDateFrom] = React.useState("");
  const [filterDateTo, setFilterDateTo] = React.useState("");
  const [editing, setEditing] = React.useState(null); // doc or {new:true}
  const [hiddenCols, setHiddenCols] = React.useState({});

  const statusById = Object.fromEntries(state.statuses.map(s => [s.id, s]));
  const catById = Object.fromEntries(state.categories.map(c => [c.id, c]));
  const depById = Object.fromEntries(state.departments.map(d => [d.id, d]));
  const respById = Object.fromEntries(state.responsibles.map(r => [r.id, r]));
  const userById = Object.fromEntries(state.users.map(u => [u.id, u]));

  // Department-scoped visibility (matches the server RLS): admins / "allDepts"
  // see everything; everyone else only sees docs for "*" or one of their depts.
  const myDepts = (viewerUser?.departments) || ["*"];
  const seesAllDepts = can("allDepts") || myDepts.includes("*");
  const visibleDocs = React.useMemo(() => (
    seesAllDepts ? state.documents : state.documents.filter(d =>
      !d.departments || d.departments.includes("*") || d.departments.some(dep => myDepts.includes(dep))
    )
  ), [state.documents, seesAllDepts, myDepts.join(",")]);

  const counts = React.useMemo(() => {
    const c = { all: visibleDocs.length, active: 0, draft: 0, expiring: 0, public: 0 };
    for (const d of visibleDocs) {
      const st = statusById[d.statusId];
      if (st?.key === "active") c.active++;
      if (st?.key === "draft") c.draft++;
      const days = window.DocuStore.daysUntil(d.expiryDate);
      if (days != null && days >= 0 && days <= 30) c.expiring++;
      if (d.publicAccess && st?.key === "active") c.public++;
    }
    return c;
  }, [visibleDocs, state.statuses]);

  const filtered = visibleDocs.filter(d => {
    const st = statusById[d.statusId];
    if (filterStatus === "active" && st?.key !== "active") return false;
    if (filterStatus === "draft" && st?.key !== "draft") return false;
    if (filterStatus === "expiring") {
      const days = window.DocuStore.daysUntil(d.expiryDate);
      if (days == null || days < 0 || days > 30) return false;
    }
    if (filterStatus === "public") {
      if (!d.publicAccess || st?.key !== "active") return false;
    }
    if (filterStatus !== "all" && filterStatus !== "active" && filterStatus !== "draft" && filterStatus !== "expiring" && filterStatus !== "public") {
      if (d.statusId !== filterStatus) return false;
    }
    if (filterCategory && d.categoryId !== filterCategory) return false;
    if (filterDepartment) {
      if (!(d.departments.includes("*") || d.departments.includes(filterDepartment))) return false;
    }
    if (filterResponsible && !d.responsibleIds.includes(filterResponsible)) return false;
    if (filterDateFrom && new Date(d.expiryDate) < new Date(filterDateFrom)) return false;
    if (filterDateTo && new Date(d.expiryDate) > new Date(filterDateTo)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(d.title.toLowerCase().includes(q) || (d.description||"").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const reset = () => {
    setFilterStatus("all"); setSearch(""); setFilterCategory(""); setFilterDepartment(""); setFilterResponsible(""); setFilterDateFrom(""); setFilterDateTo("");
  };

  const handleSave = (doc) => {
    const isNew = !state.documents.find(d => d.id === doc.id);
    if (isNew) {
      setState(s => ({ ...s, documents: [doc, ...s.documents] }));
      log("doc_create", doc.title);
    } else {
      const prev = state.documents.find(d => d.id === doc.id);
      setState(s => ({ ...s, documents: s.documents.map(d => d.id === doc.id ? doc : d) }));
      if (prev && prev.statusId !== doc.statusId) {
        const stOld = statusById[prev.statusId]?.label?.[lang] || "";
        const stNew = statusById[doc.statusId]?.label?.[lang] || "";
        log("doc_status", `${doc.title}: ${stOld} → ${stNew}`);
      } else {
        log("doc_update", doc.title);
      }
    }
    setEditing(null);
  };
  const handleDelete = (doc) => {
    if (!confirm(t.documents.confirmDelete)) return;
    setState(s => ({ ...s, documents: s.documents.filter(d => d.id !== doc.id) }));
    log("doc_delete", doc.title);
  };

  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.documents.title}</h1>
          <div className="page-sub">{visibleDocs.length} · {t.common.total}</div>
        </div>
        {can("create") && (
          <button className="btn btn-primary" onClick={() => setEditing({ new: true })}>
            <Icon.plus /> {t.documents.newDoc}
          </button>
        )}
      </div>

      {/* Quick filter pills */}
      <div className="quick-filters">
        <button className={`quick-pill ${filterStatus === "all" ? "active" : ""}`} onClick={() => setFilterStatus("all")}>
          <span className="qp-count">{counts.all}</span>
          <span className="qp-label">{t.documents.filterAll}</span>
        </button>
        <button className={`quick-pill ${filterStatus === "active" ? "active" : ""}`} onClick={() => setFilterStatus("active")}>
          <span className="qp-count">{counts.active}</span>
          <span className="qp-label">{t.documents.filterActive}</span>
        </button>
        <button className={`quick-pill ${filterStatus === "draft" ? "active" : ""}`} onClick={() => setFilterStatus("draft")}>
          <span className="qp-count">{counts.draft}</span>
          <span className="qp-label">{t.documents.filterDraft}</span>
        </button>
        <button className={`quick-pill ${filterStatus === "expiring" ? "active" : ""}`} onClick={() => setFilterStatus("expiring")}>
          <span className="qp-count">{counts.expiring}</span>
          <span className="qp-label">⚠ {t.documents.filterExpiring}</span>
        </button>
        <button className={`quick-pill ${filterStatus === "public" ? "active" : ""}`} onClick={() => setFilterStatus("public")} title={t.documents.publicWarning}>
          <span className="qp-count">{counts.public}</span>
          <span className="qp-label">◈ {t.documents.filterPublic}</span>
        </button>
      </div>

      {/* Advanced filter row */}
      <div className="filter-row">
        <div className="search-input">
          <Icon.search />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t.common.search}...`} />
        </div>
        <select className="select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">{t.common.category}: {t.common.all}</option>
          {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
          <option value="">{t.common.department}: {t.common.all}</option>
          {state.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}>
          <option value="">{t.common.responsible}: {t.common.all}</option>
          {state.responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="select" value={filterStatus.startsWith("st_") ? filterStatus : ""} onChange={e => setFilterStatus(e.target.value || "all")}>
          <option value="">{t.common.status}: {t.common.all}</option>
          {state.statuses.map(s => <option key={s.id} value={s.id}>{(t.statuses && t.statuses[s.key]) || s.label?.[lang] || s.key}</option>)}
        </select>
        <input type="date" className="input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title={t.common.from} />
        <input type="date" className="input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title={t.common.to} />
        <button className="btn btn-ghost" onClick={reset}>{t.common.reset}</button>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.documents.table.title}</th>
              <th>{t.documents.table.category}</th>
              <th>{t.documents.table.status}</th>
              <th>{t.documents.table.department}</th>
              <th>{t.documents.table.startDate}</th>
              <th>{t.documents.table.expiry}</th>
              <th>{t.documents.table.responsible}</th>
              <th style={{ textAlign: "right", width: 120 }}>{t.documents.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state">{t.common.empty}</div></td></tr>
            )}
            {filtered.map(d => {
              const st = statusById[d.statusId];
              const cat = catById[d.categoryId];
              const days = window.DocuStore.daysUntil(d.expiryDate);
              return (
                <tr key={d.id}>
                  <td>
                    <div className="doc-title">
                      <Icon.doc style={{ color: 'var(--muted)' }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {d.title}
                          {d.publicAccess && <span className="pill outline" style={{ fontSize: 10, padding: '1px 6px' }}>◈ {t.documents.publicBadge}</span>}
                        </div>
                        {density !== "compact" && <div className="doc-meta">{d.file.name} · {fmtSize(d.file.size)} · v{d.version}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{cat?.name || "—"}</td>
                  <td><StatusPill status={st} t={t} /></td>
                  <td>
                    <div className="chip-stack">
                      {d.departments.includes("*")
                        ? <span className="chip">★ {t.documents.allDepartments}</span>
                        : d.departments.map(id => <span key={id} className="chip">{depById[id]?.name || id}</span>)}
                    </div>
                  </td>
                  <td>
                    <span className="expiry">
                      {d.startDate ? new Date(d.startDate).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "short", day: "2-digit" }) : "—"}
                    </span>
                  </td>
                  <td>
                    <ExpiryCell iso={d.expiryDate} t={t} />
                    {days != null && days >= 0 && days <= 30 && (
                      <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>
                        {t.documents.expiryWarning}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="chip-stack">
                      {d.responsibleIds.length === 0 && <span className="chip muted">—</span>}
                      {d.responsibleIds.map(id => <span key={id} className="chip">{respById[id]?.name || id}</span>)}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="icon-btn" title={t.common.preview} onClick={() => openViewer(d)}><Icon.eye /></button>
                    {can("edit") && <button className="icon-btn" title={t.common.edit} onClick={() => setEditing(d)}><Icon.edit /></button>}
                    {can("delete") && <button className="icon-btn" title={t.common.delete} onClick={() => handleDelete(d)}><Icon.trash /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <DocumentForm
          state={state}
          t={t}
          lang={lang}
          doc={editing.new ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DocumentForm({ state, t, lang, doc, onSave, onClose, initialFile, initialTitle }) {
  const isNew = !doc;
  const [title, setTitle] = React.useState(doc?.title || initialTitle || "");
  const [description, setDescription] = React.useState(doc?.description || "");
  const [categoryId, setCategoryId] = React.useState(doc?.categoryId || state.categories[0]?.id || "");
  const [statusId, setStatusId] = React.useState(doc?.statusId || state.statuses.find(s => s.key === "draft")?.id || state.statuses[0]?.id);
  const [departments, setDepartments] = React.useState(doc?.departments || ["*"]);
  const [responsibleIds, setResponsibleIds] = React.useState(doc?.responsibleIds || []);
  const [publicAccess, setPublicAccess] = React.useState(!!doc?.publicAccess);
  const [periodId, setPeriodId] = React.useState(doc?.periodId || state.periods.find(p => p.months === 12)?.id || state.periods[0]?.id);
  const [startDate, setStartDate] = React.useState(doc?.startDate?.slice(0,10) || new Date().toISOString().slice(0,10));
  const [manualExpiry, setManualExpiry] = React.useState(doc?.expiryDate?.slice(0,10) || "");
  const [file, setFile] = React.useState(doc?.file || initialFile || null);
  const [error, setError] = React.useState("");
  const fileRef = React.useRef();

  const period = state.periods.find(p => p.id === periodId);
  const isManual = period?.manual;
  const expiryDate = React.useMemo(() => {
    if (isManual) return manualExpiry ? new Date(manualExpiry).toISOString() : null;
    if (!startDate || !period) return null;
    return window.DocuStore.addMonths(new Date(startDate).toISOString(), period.months);
  }, [startDate, period, isManual, manualExpiry]);

  const [pendingFile, setPendingFile] = React.useState(null); // raw File object to upload on submit
  const [uploading, setUploading] = React.useState(false);

  const onPickFile = (f) => {
    setError("");
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError(t.common.onlyPdf); return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError(t.common.tooLarge); return;
    }
    setPendingFile(f);
    setFile({ name: f.name, size: f.size, dataUrl: null });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError(t.common.required); return; }
    const docId = doc?.id || window.DocuStore.uid("doc");
    let fileMeta = file || { name: "documento.pdf", size: 0, dataUrl: null };
    if (pendingFile && window.DocuApi && !window.DocuApi.offline && state.hotelId) {
      setUploading(true);
      try {
        const up = await window.DocuApi.uploadDocFile(state.hotelId, docId, pendingFile);
        fileMeta = { name: up.name, size: up.size, mime: up.mime, key: up.key, dataUrl: null };
      } catch (err) {
        setUploading(false);
        setError("Error subiendo el archivo: " + (err?.message || err));
        return;
      }
      setUploading(false);
    }
    const next = {
      id: docId,
      title: title.trim(),
      description,
      categoryId,
      statusId,
      departments: departments.length ? departments : ["*"],
      responsibleIds,
      periodId,
      startDate: new Date(startDate).toISOString(),
      expiryDate,
      uploadedBy: doc?.uploadedBy || state.config.currentUserId,
      uploadedAt: doc?.uploadedAt || new Date().toISOString(),
      file: fileMeta,
      version: doc ? doc.version + (doc.title !== title ? 1 : 0) : 1,
      publicAccess,
    };
    onSave(next);
  };

  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  return (
    <Modal
      size="lg"
      title={isNew ? t.documents.newDoc : t.documents.editDoc}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={uploading}>{t.common.cancel}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading}>
            <Icon.check /> {uploading ? "Subiendo…" : t.common.save}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field full">
            <label>{t.common.title}</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="field full">
            <label>{t.common.description}</label>
            <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label>{t.common.category}</label>
            <select className="select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t.common.status}</label>
            <select className="select" value={statusId} onChange={e => setStatusId(e.target.value)}>
              {state.statuses.map(s => <option key={s.id} value={s.id}>{(t.statuses && t.statuses[s.key]) || s.label?.[lang] || s.key}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>{t.common.departments}</label>
            <ToggleChips items={state.departments} value={departments} onChange={setDepartments} getLabel={d => d.name} allowAll />
            <span className="help">{t.documents.visibilityHelp}</span>
          </div>
          <div className="field full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={publicAccess} onChange={e => setPublicAccess(e.target.checked)} />
              ◈ {t.documents.visPublic}
            </label>
            <span className="help">{t.documents.publicWarning}</span>
          </div>
          <div className="field full">
            <label>{t.common.responsibles}</label>
            {state.responsibles.length === 0 ? (
              <div className="multi-select-box" style={{ background: 'var(--bg-soft)' }}>
                <span style={{ color: 'var(--muted)', fontSize: 12.5, padding: '4px 6px' }}>{t.common.none}</span>
              </div>
            ) : (
              <ToggleChips items={state.responsibles} value={responsibleIds} onChange={setResponsibleIds} getLabel={r => r.email ? `${r.name} · ${r.email}` : r.name} />
            )}
          </div>
          <div className="field">
            <label>{t.documents.validityPeriod}</label>
            <select className="select" value={periodId} onChange={e => setPeriodId(e.target.value)}>
              {state.periods.map(p => <option key={p.id} value={p.id}>{p.label?.[lang] || `${p.months} m`}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t.documents.startDate}</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="field full">
            <label>{t.documents.endDate} <span className="help">— {isManual ? t.admin.manualExpiryHelp : t.documents.autoCalculated}</span></label>
            {isManual ? (
              <input type="date" className="input" value={manualExpiry} onChange={e => setManualExpiry(e.target.value)} />
            ) : (
              <input className="input" disabled value={expiryDate ? new Date(expiryDate).toLocaleDateString() : ""} />
            )}
          </div>
          <div className="field full">
            <label>{t.common.file} (PDF, ≤ 5 MB)</label>
            <div className="dropzone" onClick={() => fileRef.current?.click()}>
              {file ? (
                <div>
                  <div className="file-name">{file.name}</div>
                  <div className="help">{fmtSize(file.size)}</div>
                </div>
              ) : (
                <div>{t.documents.pickFile}</div>
              )}
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => onPickFile(e.target.files?.[0])} />
            </div>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

window.DocumentsPage = DocumentsPage;
window.DocumentForm = DocumentForm;
