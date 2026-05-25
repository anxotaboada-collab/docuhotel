// Docuhotel — public read-only audit view (accessed via #/audit/<token>)

function AuditView({ project, state, setState, t, lang, setLang }) {
  const [openDoc, setOpenDoc] = React.useState(null);
  const sessionKey = `docuhotel:audit:${project.shareToken}:name`;
  const [auditorName, setAuditorName] = React.useState(() => sessionStorage.getItem(sessionKey) || "");
  const [askingName, setAskingName] = React.useState(!auditorName);
  const loggedEntryRef = React.useRef(false);

  // Audit log — pushes a single entry into state.log without bumping doc state
  const logAudit = React.useCallback((action, details) => {
    if (!setState) return;
    const entry = {
      id: window.DocuStore.uid("log"),
      ts: new Date().toISOString(),
      userId: `audit:${auditorName || "anon"}`,
      action,
      details: details || "",
    };
    setState(s => ({ ...s, log: [entry, ...s.log] }));
  }, [setState, auditorName]);

  // Log entry once per session (after auditor sets their name)
  React.useEffect(() => {
    if (!auditorName || loggedEntryRef.current) return;
    loggedEntryRef.current = true;
    logAudit("audit_enter", `${project.name} · ${auditorName}`);
  }, [auditorName, project.name, logAudit]);

  if (askingName) {
    return <AuditNameGate project={project} t={t} onConfirm={(name) => {
      sessionStorage.setItem(sessionKey, name);
      setAuditorName(name);
      setAskingName(false);
    }} />;
  }

  const docIdSet = new Set(project.docIds || []);
  const docs = (state.documents || []).filter(d => docIdSet.has(d.id));
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";
  const expiresIso = project.shareExpiresAt;
  const daysLeft = Math.max(0, Math.floor((new Date(expiresIso) - new Date()) / 86400000));

  const handleOpen = (d) => {
    setOpenDoc(d);
    logAudit("audit_view", `${project.name} · ${auditorName} · ${d.title}`);
  };
  const handleDownload = (d) => {
    logAudit("audit_download", `${project.name} · ${auditorName} · ${d.title}`);
  };

  // Reuse DocumentsPage with a scoped state that only contains the docs the
  // auditor is allowed to see, and a `can()` that blocks every mutating
  // action. The result is the exact same layout and filters as the main
  // documents list — but read-only and limited to this project.
  const auditState = {
    ...state,
    documents: docs,
    config: { ...state.config, currentUserId: `audit:${auditorName}` },
    users: [...state.users, { id: `audit:${auditorName}`, name: auditorName, email: `auditor@externo`, role: "auditor" }],
  };
  const auditViewerUser = { id: `audit:${auditorName}`, departments: ["*"] };
  const auditCan = (p) => p === "allDepts"; // read access to everything; no create/edit/delete

  return (
    <div className="app audit-view" data-audit="true">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DH</span>
          <span className="brand-name">{t.appName}</span>
          <span className="brand-tag">— {t.audit?.title || "Acceso de auditoría"}</span>
        </div>
        <div className="spacer" />
        <div className="lang-switch" role="tablist" aria-label={t.common.language}>
          {["es", "en", "de"].map(l => (
            <button key={l} className={l === lang ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
        <div className="user-chip" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
          <span style={{ fontSize: 14 }}>👁</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{auditorName}</span>
        </div>
      </header>

      <main className="main">
        {/* Banner */}
        <div style={{
          padding: '20px 24px',
          background: 'var(--warn-bg)',
          color: 'var(--warn)',
          borderRadius: 12,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 28 }}>📋</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {t.audit?.banner || "Vista de auditor"} — {auditorName}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
              {t.audit?.bannerHelp2 || "Acceso temporal. Puedes consultar y descargar copias con tu nombre como marca de agua. Cada acción queda registrada."}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink)', opacity: 0.7 }}>{t.audit?.expiresIn || "Caduca en"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{daysLeft} {t.audit?.days || "días"}</div>
            <div style={{ fontSize: 11, color: 'var(--ink)', opacity: 0.7 }}>{fmtDateTime(expiresIso)}</div>
          </div>
        </div>

        {/* Project header */}
        <div style={{ marginBottom: 18 }}>
          <h1 className="page-title">{project.name}</h1>
          {project.notes && (
            <div style={{ marginTop: 10, padding: 14, background: 'var(--bg-soft)', borderLeft: '3px solid var(--ink)', borderRadius: 4, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {project.notes}
            </div>
          )}
        </div>

        {/* Same documents list (with filters) as the authenticated app, but
            limited to the project's docs and with create/edit/delete hidden. */}
        <DocumentsPage
          state={auditState}
          setState={setState}
          t={t} lang={lang}
          openViewer={handleOpen}
          log={() => {}}
          density="comfortable"
          can={auditCan}
          viewerUser={auditViewerUser}
        />

        <footer style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11.5, textAlign: 'center' }}>
          {t.audit?.footerAuditor || "Auditor"}: <strong>{auditorName}</strong> · {t.audit?.allActionsLogged || "Todas las acciones quedan registradas"} · Docuhotel
        </footer>
      </main>

      {openDoc && (
        <ViewerModal
          doc={openDoc}
          state={auditState}
          t={t} lang={lang}
          auditMode={true}
          onClose={() => setOpenDoc(null)}
          onDownloaded={handleDownload}
          onOpenDoc={(d) => { setOpenDoc(d); logAudit("audit_view", `${project.name} · ${auditorName} · ${d.title}`); }}
        />
      )}
    </div>
  );
}

function AuditNameGate({ project, t, onConfirm }) {
  const [name, setName] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || !accepted) return;
    onConfirm(trimmed);
  };

  return (
    <div className="app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg-soft)' }}>
      <form onSubmit={submit} style={{
        maxWidth: 460, width: '100%',
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span className="brand-mark" style={{ width: 32, height: 32, fontSize: 12 }}>DH</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t.audit?.gateTitle || "Acceso de auditoría"}
          </span>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{project.name}</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          {t.audit?.gateHelp || "Antes de empezar, indica tu nombre y entidad. Aparecerá como marca de agua en cada copia que descargues y quedará registrado en el historial."}
        </p>
        <div className="field" style={{ marginBottom: 18 }}>
          <label>{t.audit?.gateNameLabel || "Nombre y entidad"}</label>
          <input
            ref={inputRef}
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t.audit?.gatePlaceholder || "Ej: Ana García — Mapfre"}
            style={{ fontSize: 15 }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--muted)', marginBottom: 22, cursor: 'pointer', lineHeight: 1.5 }}>
          <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ marginTop: 2 }} />
          <span>{t.audit?.gateConsent || "Acepto que mi nombre, fecha y los documentos consultados queden registrados, y aparezcan como marca de agua en las descargas."}</span>
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={name.trim().length < 2 || !accepted}
          style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14 }}
        >
          {t.audit?.gateEnter || "Acceder"} →
        </button>
      </form>
    </div>
  );
}

window.AuditView = AuditView;
