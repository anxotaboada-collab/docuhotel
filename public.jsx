// Docuhotel — public, login-less view (accessed via QR token)

function PublicView({ state, t, lang, setLang }) {
  const [openDoc, setOpenDoc] = React.useState(null);
  // The public_documents RPC already returns only public_access + En vigor docs.
  // Do not re-filter on state.statuses here: per-hotel status rows have ids like
  // "st_active_<uuid>" while DEFAULT_STATUSES uses "st_active", so the lookup
  // would always miss and the page would render empty.
  const docs = state.documents;

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
        {docs.length === 0 && <div className="empty-state">{t.common.empty}</div>}
        <div className="public-doc-list">
          {docs.map(d => {
            const cat = state.categories.find(c => c.id === d.categoryId);
            return (
              <div key={d.id} className="public-doc-card">
                <div className="public-doc-main">
                  <div className="doc-title">
                    <Icon.doc style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <div>
                      <div className="public-doc-name">{d.title}</div>
                      <div className="doc-meta">
                        {(cat?.name ? cat.name + " · " : "")}{t.documents.table.expiry}: {fmtDate(d.expiryDate)} · v{d.version}
                      </div>
                      <div className="doc-meta">{d.file.name} · {fmtSize(d.file.size)}</div>
                    </div>
                  </div>
                </div>
                <button className="btn btn-primary public-doc-view" onClick={() => setOpenDoc(d)}>
                  <Icon.eye /> {t.common.view || "Ver"}
                </button>
              </div>
            );
          })}
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
