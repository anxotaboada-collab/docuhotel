// Docuhotel — main app shell
const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "theme": "light",
  "showFileMeta": true
}/*EDITMODE-END*/;

function App() {
  const useBackend = !!(window.DocuApi && !window.DocuApi.offline);
  const [route, setRouteState] = useState(window.location.hash || "");
  const isPublicRoute = /^#\/(public|audit|request)\//.test(route);

  const [bootStatus, setBootStatus] = useState(
    useBackend && !isPublicRoute ? "loading" : "ready"
  );
  const [state, setStateRaw] = useState(() =>
    (useBackend && !isPublicRoute) ? null : window.DocuStore.loadState()
  );
  const [tab, setTab] = useState("documents");
  const [viewerDoc, setViewerDoc] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRouteState(window.location.hash || "");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Public route bootstrap (backend mode, no auth required): fetch via RPC.
  useEffect(() => {
    if (!useBackend || !isPublicRoute) return;
    let cancelled = false;
    const bootPublic = async () => {
      const def = window.DocuStore.defaultState();
      const m1 = route.match(/^#\/public\/(.+)$/);
      const m2 = route.match(/^#\/audit\/(.+)$/);
      const m3 = route.match(/^#\/request\/(.+)$/);
      try {
        if (m1) {
          const docs = await window.DocuApi.publicDocs(m1[1]);
          if (cancelled) return;
          setStateRaw({ ...def, documents: docs, projects: [], requests: [], config: { ...def.config, publicToken: m1[1] } });
        } else if (m2) {
          const res = await window.DocuApi.auditProject(m2[1]);
          if (cancelled) return;
          if (!res) { setStateRaw({ ...def, projects: [] }); }
          else setStateRaw({
            ...def,
            documents: res.docs || [],
            projects: [{ ...res.project, shareToken: m2[1], docIds: (res.docs || []).map(d => d.id) }],
          });
        } else if (m3) {
          const req = await window.DocuApi.requestByToken(m3[1]);
          if (cancelled) return;
          setStateRaw({ ...def, requests: req ? [req] : [] });
        }
      } catch (e) {
        console.error("public bootstrap", e);
      }
    };
    bootPublic();
  }, [useBackend, isPublicRoute, route]);

  // Backend bootstrap: load state once authenticated, or show login.
  useEffect(() => {
    if (!useBackend || isPublicRoute) return;
    let cancelled = false;
    const boot = async () => {
      const session = await window.DocuApi.getSession();
      if (cancelled) return;
      if (!session) { setBootStatus("login"); return; }
      const next = await window.DocuStore.loadStateFromBackend();
      if (cancelled) return;
      if (!next) { setBootStatus("login"); return; }
      setStateRaw(next);
      setBootStatus("ready");
    };
    boot();
    const unsub = window.DocuApi.onAuthChange(async (sess) => {
      if (!sess) { setBootStatus("login"); setStateRaw(null); return; }
      const next = await window.DocuStore.loadStateFromBackend();
      if (next) { setStateRaw(next); setBootStatus("ready"); }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [useBackend, isPublicRoute]);

  const lang = state?.config?.lang || "es";
  const t = useMemo(() => ({ ...window.TRANSLATIONS[lang], _lang: lang }), [lang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.title = `${t.appName} — ${t.appTagline}`;
  }, [tweaks.theme, tweaks.density, t]);

  // Tweaks toolbar wiring
  useEffect(() => {
    const onMsg = (e) => {
      const m = e.data || {};
      if (m.type === "__activate_edit_mode") setTweaksOpen(true);
      if (m.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const setState = (updater) => {
    setStateRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (useBackend && next?.hotelId) window.DocuStore.saveStateToBackend(next);
      else window.DocuStore.saveState(next);
      return next;
    });
  };

  if (useBackend && !isPublicRoute) {
    if (bootStatus === "loading") return <window.LoadingScreen label="Cargando datos del hotel…" />;
    if (bootStatus === "login")   return <window.LoginForm onSignedIn={() => setBootStatus("loading")} />;
    if (!state)                   return <window.LoadingScreen label="Cargando…" />;
  }
  if (useBackend && isPublicRoute && !state) {
    return <window.LoadingScreen label="Cargando…" />;
  }

  const setLang = (l) => {
    setState(s => ({ ...s, config: { ...s.config, lang: l } }));
  };

  const log = (action, details) => {
    const entry = {
      id: window.DocuStore.uid("log"),
      ts: new Date().toISOString(),
      userId: state.config.currentUserId,
      action,
      details: details || "",
    };
    setState(s => ({ ...s, log: [entry, ...s.log] }));
  };

  const openViewer = (doc) => setViewerDoc(doc);
  const closeViewer = () => setViewerDoc(null);
  const onDownloaded = (doc) => {
    log("doc_download", doc.title);
    pushToast(`✓ ${t.common.download}: ${doc.title}`);
  };

  const pushToast = (text) => {
    const id = Math.random();
    setToasts(arr => [...arr, { id, text }]);
    setTimeout(() => setToasts(arr => arr.filter(x => x.id !== id)), 2400);
  };

  const currentUser = state.users.find(u => u.id === state.config.currentUserId);

  // Public route: #/public/<token>
  const publicMatch = route.match(/^#\/public\/(.+)$/);
  if (publicMatch && publicMatch[1] === state.config.publicToken) {
    return <window.PublicView state={state} t={t} lang={lang} setLang={setLang} />;
  }
  if (publicMatch) {
    return (
      <div className="app">
        <main className="main">
          <div className="empty-state">
            <h2>404</h2>
            <p>Enlace público no válido o caducado.</p>
          </div>
        </main>
      </div>
    );
  }

  // Audit route: #/audit/<token>
  const auditMatch = route.match(/^#\/audit\/(.+)$/);
  if (auditMatch) {
    const proj = (state.projects || []).find(p => p.shareToken === auditMatch[1]);
    const expired = !proj || !proj.shareExpiresAt || new Date(proj.shareExpiresAt) < new Date();
    if (expired) {
      return (
        <div className="app">
          <main className="main">
            <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
              <h2>{t.audit?.expiredTitle || "Enlace caducado"}</h2>
              <p>{t.audit?.expiredHelp || "Este enlace de auditoría ya no es válido. Contacta con el hotel para solicitar uno nuevo."}</p>
            </div>
          </main>
        </div>
      );
    }
    return <window.AuditView project={proj} state={state} setState={setState} t={t} lang={lang} setLang={setLang} />;
  }

  // Request route: #/request/<token>
  const requestMatch = route.match(/^#\/request\/(.+)$/);
  if (requestMatch) {
    const req = (state.requests || []).find(r => r.shareToken === requestMatch[1]);
    if (!req) {
      return (
        <div className="app">
          <main className="main">
            <div className="empty-state" style={{ padding: 60, textAlign: 'center' }}>
              <h2>404</h2>
              <p>{t.requests?.linkExpiredHelp || "Enlace no válido."}</p>
            </div>
          </main>
        </div>
      );
    }
    return <window.RequestSubmitView key={req.id} request={req} state={state} setState={setState} t={t} lang={lang} setLang={setLang} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DH</span>
          <span className="brand-name">{t.appName}</span>
          <span className="brand-tag">— {t.appTagline}</span>
        </div>
        <nav className="tabs">
          <button className={`tab ${tab === "documents" ? "active" : ""}`} onClick={() => setTab("documents")}>{t.nav.documents}</button>
          <button className={`tab ${tab === "projects" ? "active" : ""}`} onClick={() => setTab("projects")}>{t.nav.projects || "Proyectos"}</button>
          <button className={`tab ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>{t.nav.requests || "Solicitudes"}</button>
          <button className={`tab ${tab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>{t.nav.log}</button>
          <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>{t.nav.admin}</button>
        </nav>
        <button
          className="btn btn-sm"
          title="Descargar QR de acceso público"
          style={{ marginLeft: 8 }}
          onClick={() => {
            const url = `${location.href.split("#")[0].split("?")[0]}#/public/${state.config.publicToken}`;
            const dataUrl = window.generateQrDataUrl(url, 360);
            if (!dataUrl) { pushToast("⚠ QR no disponible"); return; }
            const a = document.createElement("a");
            a.href = dataUrl; a.download = "docuhotel-qr.png"; a.click();
            pushToast("✓ QR descargado");
          }}
        >
          <span style={{ fontSize: 14 }}>◫</span> <span className="qr-public-btn-text">QR público</span>
        </button>
        <div className="spacer" />
        <div className="lang-switch" role="tablist" aria-label={t.common.language}>
          {["es", "en", "de"].map(l => (
            <button key={l} className={l === lang ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
          ))}
        </div>
        <div
          className="user-chip"
          title={useBackend ? `${currentUser?.email || ""} — clic para cerrar sesión` : currentUser?.email}
          onClick={() => {
            if (!useBackend) return;
            if (confirm("¿Cerrar sesión?")) {
              window.DocuApi.signOut().then(() => location.reload());
            }
          }}
          style={useBackend ? { cursor: "pointer" } : undefined}
        >
          <span className="avatar">{(currentUser?.name || "?").split(" ").map(p => p[0]).slice(0,2).join("")}</span>
          <span>{currentUser?.name}</span>
        </div>
      </header>

      <main className="main">
        {tab === "documents" && (
          <DocumentsPage
            state={state} setState={setState} t={t} lang={lang}
            openViewer={openViewer} log={log} density={tweaks.density}
          />
        )}
        {tab === "log" && <LogPage state={state} t={t} lang={lang} />}
        {tab === "admin" && <AdminPage state={state} setState={setState} t={t} lang={lang} log={log} />}
        {tab === "projects" && <window.ProjectsPage state={state} setState={setState} t={t} lang={lang} log={log} openViewer={openViewer} />}
        {tab === "requests" && <window.RequestsPage state={state} setState={setState} t={t} lang={lang} log={log} />}
      </main>

      {viewerDoc && (
        <ViewerModal doc={viewerDoc} state={state} t={t} lang={lang}
          setState={setState}
          onOpenDoc={(d) => setViewerDoc(d)}
          onClose={closeViewer} onDownloaded={onDownloaded} />
      )}

      <div className="toast-container">
        {toasts.map(tt => <div key={tt.id} className="toast">{tt.text}</div>)}
      </div>

      {tweaksOpen && (
        <window.TweaksPanel onClose={() => setTweaksOpen(false)}>
          <window.TweakSection title="Apariencia">
            <window.TweakRadio
              label="Tema"
              value={tweaks.theme}
              onChange={(v) => setTweak("theme", v)}
              options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Oscuro" }]}
            />
            <window.TweakRadio
              label="Densidad"
              value={tweaks.density}
              onChange={(v) => setTweak("density", v)}
              options={[{ value: "compact", label: "Compacta" }, { value: "comfortable", label: "Cómoda" }]}
            />
            <window.TweakToggle
              label="Mostrar metadatos del archivo en la lista"
              checked={tweaks.showFileMeta}
              onChange={(v) => setTweak("showFileMeta", v)}
            />
          </window.TweakSection>
          <window.TweakSection title="Datos">
            <window.TweakButton onClick={() => {
              if (confirm("¿Restablecer todos los datos a los valores iniciales?")) {
                localStorage.removeItem(window.DocuStore.LS_KEY);
                location.reload();
              }
            }}>Restablecer datos demo</window.TweakButton>
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
