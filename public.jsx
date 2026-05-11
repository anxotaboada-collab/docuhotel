// Docuhotel — public, login-less view (accessed via QR token)

function PublicView({ state, t, lang, setLang }) {
  const [openDoc, setOpenDoc] = React.useState(null);
  const docs = state.documents.filter(d => {
    const st = state.statuses.find(s => s.id === d.statusId);
    return d.publicAccess && st?.key === "active";
  });

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "short", day: "2-digit" }) : "—";
  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DH</span>
          <span className="brand-name">{t.appName}</span>
          <span className="brand-tag">— {t.documents.publicBadge}</span>
        </div>
        <div className="spacer" />
        <div className="lang-switch">
          {["es", "en", "de"].map(l => (
            <button key={l} className={l === lang ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
      </header>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">◈ {t.documents.publicBadge}</h1>
            <div className="page-sub">{docs.length} {t.common.total.toLowerCase()}</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.documents.table.title}</th>
                <th>{t.documents.table.category}</th>
                <th>{t.documents.table.expiry}</th>
                <th style={{ textAlign: "right", width: 120 }}>{t.documents.table.actions}</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={4}><div className="empty-state">{t.common.empty}</div></td></tr>}
              {docs.map(d => {
                const cat = state.categories.find(c => c.id === d.categoryId);
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="doc-title">
                        <Icon.doc style={{ color: 'var(--muted)' }} />
                        <div>
                          <div>{d.title}</div>
                          <div className="doc-meta">{d.file.name} · {fmtSize(d.file.size)} · v{d.version}</div>
                        </div>
                      </div>
                    </td>
                    <td>{cat?.name || "—"}</td>
                    <td>{fmtDate(d.expiryDate)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="icon-btn" onClick={() => setOpenDoc(d)}><Icon.eye /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 18, padding: 12, background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          ◈ {t.watermark.line2}
        </div>
      </main>

      {openDoc && (
        <ViewerModal doc={openDoc} state={{ ...state, config: { ...state.config, currentUserId: "public" } }} t={t} lang={lang}
          onClose={() => setOpenDoc(null)} onDownloaded={() => {}} />
      )}
    </div>
  );
}

window.PublicView = PublicView;
