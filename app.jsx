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
  const isPublicRoute = /^#\/(public|audit|request|sign)\//.test(route);

  const [bootStatus, setBootStatus] = useState(
    useBackend && !isPublicRoute ? "loading" : "ready"
  );
  // In backend mode (public OR authenticated), start with no state so the
  // loading guard renders a spinner until the route's bootstrap completes.
  // Otherwise the route matcher below sees stale localStorage state (wrong
  // publicToken, missing project) and flashes "Enlace no válido / caducado"
  // for ~1s before the real data arrives.
  const [state, setStateRaw] = useState(() =>
    useBackend ? null : window.DocuStore.loadState()
  );
  const [tab, setTab] = useState("documents");
  const [viewerDoc, setViewerDoc] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [impersonateId, setImpersonateId] = useState(null); // master "view as" — UI only

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
          else {
            // The RPC returns rows in snake_case (and strips share_token).
            // Map them with the same helpers the authenticated path uses so
            // the audit view sees camelCase fields (shareExpiresAt, fileKey,
            // categoryId, etc.).
            const docs = (res.docs || []).map(window.DocuApi.docFromRow);
            const proj = {
              ...window.DocuApi.projFromRow(res.project),
              shareToken: m2[1],
              docIds: docs.map(d => d.id),
            };
            // Taxonomies from the RPC. Without these the documents table
            // shows empty cells because category/status/department/responsible
            // IDs do not resolve to any name in the default state.
            setStateRaw({
              ...def,
              documents: docs,
              projects: [proj],
              categories: res.categories || [],
              statuses: res.statuses || [],
              departments: res.departments || [],
              responsibles: res.responsibles || [],
            });
          }
        } else if (m3) {
          const req = await window.DocuApi.requestByToken(m3[1]);
          if (cancelled) return;
          setStateRaw({ ...def, requests: req ? [req] : [] });
        }
      } catch (e) {
        console.error("public bootstrap", e);
        // Surface a usable state so the loading guard doesn't hang. The
        // route matcher then renders the appropriate "no válido" message
        // because the token won't be found.
        if (!cancelled) setStateRaw(window.DocuStore.defaultState());
      }
    };
    bootPublic();
    return () => { cancelled = true; };
  }, [useBackend, isPublicRoute, route]);

  // Backend bootstrap: load state once authenticated, or show login.
  const [bootError, setBootError] = useState("");
  const [bootRetry, setBootRetry] = useState(0);
  const currentHotelIdRef = useRef(null);
  useEffect(() => { currentHotelIdRef.current = state?.hotelId || null; }, [state?.hotelId]);
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms)),
  ]);
  useEffect(() => {
    if (!useBackend || isPublicRoute) return;
    // Hub-handoff in progress: api.jsx is finishing setSession() and will
    // location.replace() to a clean URL momentarily. Don't kick off boot here
    // because the about-to-happen reload will redo this useEffect with the
    // session already persisted; running boot() now would race the reload and
    // show either a login-screen flash or a stuck spinner.
    if (typeof window !== "undefined" && window.__DOCU_HUB_HANDOFF__) {
      setBootStatus("loading");
      // Si el traspaso se rinde (api.jsx suelta la bandera y avisa), hay que
      // volver a arrancar a mano: este efecto no se reejecuta solo porque sus
      // dependencias no cambian, y el usuario se quedaba mirando el spinner.
      const onAbort = () => setBootRetry((n) => n + 1);
      window.addEventListener("docu-handoff-abort", onAbort, { once: true });
      return () => window.removeEventListener("docu-handoff-abort", onAbort);
    }
    let cancelled = false;
    const boot = async () => {
      try {
        // Timeouts are generous on purpose: Supabase free-tier projects pause
        // after inactivity and the first request can take ~30-60s to wake up
        // GoTrue + Postgres. Aborting earlier just leaves users on an error
        // screen for what is actually a successful (slow) cold start.
        const session = await withTimeout(window.DocuApi.getSession(), 60000, "getSession");
        if (cancelled) return;
        if (!session) { setBootStatus("login"); return; }
        const next = await withTimeout(window.DocuStore.loadStateFromBackend(undefined, session), 60000, "loadState");
        if (cancelled) return;
        if (!next) { setBootError("No pudimos cargar los datos del hotel. Verifica tu cuenta o intenta de nuevo."); setBootStatus("error"); return; }
        setStateRaw(next);
        setBootStatus("ready");
      } catch (e) {
        console.error("boot", e);
        if (cancelled) return;
        setBootError(e?.message || "Error al conectar con el servidor.");
        setBootStatus("error");
      }
    };
    boot();
    const unsub = window.DocuApi.onAuthChange(async (sess, event) => {
      // boot() above already handles the initial session replay; background token
      // refreshes must NOT trigger a full reload (it duplicates the startup work
      // and would drop any unsaved local edits). Only react to real transitions.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      // supabase-js fires SIGNED_IN not just on actual sign-in but also on tab
      // visibility/storage re-sync (e.g. when the user opens a doc in a new tab
      // and returns). If we already have state loaded, that SIGNED_IN is a false
      // positive — ignore it. Real first-time logins are handled by boot() and
      // by the SIGNED_IN that fires with no prior state.
      if (event === "SIGNED_IN" && currentHotelIdRef.current) return;
      try {
        if (event === "SIGNED_OUT" || !sess) { setBootStatus("login"); setStateRaw(null); return; }
        setBootStatus("loading");
        const next = await withTimeout(window.DocuStore.loadStateFromBackend(currentHotelIdRef.current || undefined, sess), 60000, "loadState");
        if (next) { setStateRaw(next); setBootStatus("ready"); }
        else { setBootError("No pudimos cargar los datos del hotel."); setBootStatus("error"); }
      } catch (e) {
        console.error("auth change", e);
        setBootError(e?.message || "Error al conectar con el servidor.");
        setBootStatus("error");
      }
    });
    return () => { cancelled = true; unsub && unsub(); };
  }, [useBackend, isPublicRoute, bootRetry]);

  // Switch to another hotel the user can access (regional / multi-hotel).
  // opts.editDocId: open that document's editor on arrival (Regional panel).
  const [pendingEditDocId, setPendingEditDocId] = React.useState(null);
  const switchHotel = async (hid, opts) => {
    if (!useBackend || !hid) return;
    if (hid === state?.hotelId) {
      if (opts?.editDocId) { setPendingEditDocId(opts.editDocId); setTab("documents"); }
      return;
    }
    setBootError(""); setBootStatus("loading");
    try {
      const next = await withTimeout(window.DocuStore.loadStateFromBackend(hid), 60000, "loadState");
      if (next) { setTab("documents"); if (opts?.editDocId) setPendingEditDocId(opts.editDocId); setStateRaw(next); setBootStatus("ready"); }
      else { setBootError("No se pudo cargar ese hotel."); setBootStatus("error"); }
    } catch (e) {
      setBootError(e?.message || "Error al cambiar de hotel."); setBootStatus("error");
    }
  };

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

  // Signer route: #/sign/<token>. SignView is self-contained (it talks to the
  // docu-sign edge function), so it must resolve BEFORE the bootstrap guards:
  // bootPublic() loads nothing for this route and the "!state" guard below
  // would otherwise leave the signer staring at a spinner forever.
  const signMatch = route.match(/^#\/sign\/(.+)$/);
  if (signMatch) return <window.SignView token={signMatch[1]} />;

  if (useBackend && !isPublicRoute) {
    if (bootStatus === "loading") return <window.LoadingScreen label="Cargando datos del hotel…" />;
    if (bootStatus === "error")   return <window.ErrorScreen message={bootError} onRetry={() => { setBootError(""); setBootStatus("loading"); setBootRetry(n => n + 1); }} onSignOut={() => window.DocuApi.signOut().then(() => location.reload())} />;
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

  const realUser = state.users.find(u => u.id === state.config.currentUserId);
  const impUser = impersonateId ? state.users.find(u => u.id === impersonateId) : null;
  const isImpersonating = !!impUser;
  const currentUser = impUser || realUser;
  const currentRole = currentUser?.role || "employee";
  const perms = (state.config?.permissions && state.config.permissions[currentRole]) || {};
  const can = (p) => !!perms[p];
  const canAdmin = can("adminPanel") || (!!state.config?.isRegional && !isImpersonating);
  const canViewLog = can("viewLog") || canAdmin;
  const canRegional = !!state.config?.isRegional && !isImpersonating;
  const visibleTabs = ["documents", "projects", "requests"]
    .concat(can("create") ? ["sign"] : [])
    .concat(canViewLog ? ["log"] : [])
    .concat(canAdmin ? ["admin"] : [])
    .concat(canRegional ? ["regional"] : []);
  const effectiveTab = visibleTabs.includes(tab) ? tab : "documents";

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
        </div>
        {useBackend && (state.config?.accessibleHotels?.length > 1 || state.config?.isRegional) ? (
          <select
            className="hotel-switch"
            value={state.hotelId}
            title="Cambiar de hotel"
            onChange={(e) => switchHotel(e.target.value)}
          >
            {(state.config.accessibleHotels || []).map(h => (
              <option key={h.id} value={h.id}>🏨 {h.name}</option>
            ))}
          </select>
        ) : (
          <span className="brand-tag current-hotel-name">— {state.config?.hotel?.name || t.appTagline}</span>
        )}
        <nav className="tabs">
          <button className={`tab ${effectiveTab === "documents" ? "active" : ""}`} onClick={() => setTab("documents")}>{t.nav.documents}</button>
          <button className={`tab ${effectiveTab === "projects" ? "active" : ""}`} onClick={() => setTab("projects")}>{t.nav.projects || "Proyectos"}</button>
          <button className={`tab ${effectiveTab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>{t.nav.requests || "Solicitudes"}</button>
          {can("create") && <button className={`tab ${effectiveTab === "sign" ? "active" : ""}`} onClick={() => setTab("sign")}>{t.nav.sign || "Firmas"}</button>}
          {canViewLog && <button className={`tab ${effectiveTab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>{t.nav.log}</button>}
          {canAdmin && <button className={`tab ${effectiveTab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>{t.nav.admin}</button>}
          {canRegional && (
            <button className={`tab ${effectiveTab === "regional" ? "active" : ""}`} onClick={() => setTab("regional")}>🌐 Regional</button>
          )}
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
        <UserMenu
          currentUser={currentUser}
          useBackend={useBackend}
          isImpersonating={isImpersonating}
          onExitImpersonate={() => setImpersonateId(null)}
        />
      </header>

      {isImpersonating && (
        <div style={{ background: "#fef3c7", color: "#92400e", padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, fontSize: 13, borderBottom: "1px solid #fde68a" }}>
          <span>👁 {t.common?.viewingAs || "Viendo como"}: <strong>{currentUser?.name}</strong> · {(t.admin?.role && t.admin.role[currentRole]) || currentRole}</span>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => setImpersonateId(null)}>{t.common?.exitViewAs || "Salir de la vista"}</button>
        </div>
      )}

      <main className="main">
        {effectiveTab === "documents" && (
          <DocumentsPage
            state={state} setState={setState} t={t} lang={lang}
            openViewer={openViewer} log={log} density={tweaks.density} can={can} viewerUser={currentUser}
            editDocId={pendingEditDocId} onEditDocHandled={() => setPendingEditDocId(null)}
          />
        )}
        {effectiveTab === "sign" && (
          <window.SignaturesPage state={state} t={t} lang={lang} log={log} pushToast={pushToast} />
        )}
        {effectiveTab === "log" && <LogPage state={state} t={t} lang={lang} />}
        {effectiveTab === "admin" && <AdminPage state={state} setState={setState} t={t} lang={lang} log={log} onImpersonate={(uid) => { setImpersonateId(uid); setTab("documents"); }} />}
        {effectiveTab === "regional" && (
          <window.RegionalPanel state={state} setState={setState} t={t} lang={lang} switchHotel={switchHotel} pushToast={pushToast} />
        )}
        {effectiveTab === "projects" && <window.ProjectsPage state={state} setState={setState} t={t} lang={lang} log={log} openViewer={openViewer} />}
        {effectiveTab === "requests" && <window.RequestsPage state={state} setState={setState} t={t} lang={lang} log={log} />}
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
