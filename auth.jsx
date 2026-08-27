// Docuhotel — login + auth state hook

function LoginForm({ onSignedIn }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await window.DocuApi.signIn(email, password);
      onSignedIn && onSignedIn();
    } catch (err) {
      setError(err?.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg, #f6f6f4)" }}>
      <form onSubmit={submit} style={{
        background: "var(--surface, #fff)",
        padding: 32, borderRadius: 12,
        width: "100%", maxWidth: 380,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.05)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span className="brand-mark" style={{
            width: 32, height: 32, borderRadius: 8, background: "#111", color: "#fff",
            display: "grid", placeItems: "center", fontWeight: 700,
          }}>DH</span>
          <strong style={{ fontSize: 18 }}>Docuhotel</strong>
        </div>
        <h2 style={{ margin: 0, fontSize: 20 }}>Iniciar sesión</h2>
        <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
          Accede con tu cuenta del hotel para gestionar los documentos.
        </p>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#444" }}>Email</span>
          <input
            className="input" type="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#444" }}>Contraseña</span>
          <input
            className="input" type="password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
          />
        </label>
        {error && (
          <div style={{ color: "#b91c1c", fontSize: 13, background: "#fee2e2", padding: 8, borderRadius: 6 }}>
            {error}
          </div>
        )}
        <button
          type="submit" disabled={loading}
          style={{
            padding: "10px 14px", borderRadius: 8, border: "none",
            background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
        <p style={{ margin: 0, color: "#888", fontSize: 12, textAlign: "center" }}>
          ¿Problemas para acceder? Pide a tu administrador que verifique tu cuenta.
        </p>
      </form>
    </div>
  );
}

// Pasados unos segundos el spinner deja de ser información y pasa a ser una
// trampa: si el arranque se atasca (traspaso de sesión del hub que no vuelve,
// GoTrue lento), sin esta salida el único remedio era vaciar el navegador.
function LoadingScreen({ label, escapeAfter = 20 }) {
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setStuck(true), escapeAfter * 1000);
    return () => clearTimeout(t);
  }, [escapeAfter]);
  return (
    <div className="app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ textAlign: "center", color: "#666" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "3px solid #ddd", borderTopColor: "#111",
          margin: "0 auto 12px", animation: "spin 0.9s linear infinite",
        }} />
        <div>{label || "Cargando…"}</div>
        {stuck && (
          <div style={{ marginTop: 18, fontSize: 13.5, lineHeight: 1.6, maxWidth: 360 }}>
            <div style={{ color: "#8a8f98" }}>Esto está tardando más de lo normal.</div>
            <button
              className="btn"
              style={{ marginTop: 10 }}
              onClick={() => {
                // Tira la sesión a medias y vuelve al login con la URL limpia.
                try {
                  Object.keys(localStorage)
                    .filter((k) => k.startsWith("sb-") || k.indexOf("supabase.auth") >= 0)
                    .forEach((k) => localStorage.removeItem(k));
                } catch (_e) { /* modo privado */ }
                window.location.replace(window.location.pathname);
              }}
            >Entrar con usuario y contraseña</button>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onRetry, onSignOut }) {
  return (
    <div className="app" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{
        background: "var(--surface, #fff)", padding: 28, borderRadius: 12,
        width: "100%", maxWidth: 460,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.05)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="brand-mark" style={{
            width: 32, height: 32, borderRadius: 8, background: "#111", color: "#fff",
            display: "grid", placeItems: "center", fontWeight: 700,
          }}>DH</span>
          <strong style={{ fontSize: 18 }}>Docuhotel</strong>
        </div>
        <h2 style={{ margin: 0, fontSize: 18, color: "#b91c1c" }}>No se pudieron cargar los datos</h2>
        <p style={{ margin: 0, color: "#444", fontSize: 14 }}>
          {message || "Se produjo un error al conectar con el servidor."}
        </p>
        <p style={{ margin: 0, color: "#888", fontSize: 12 }}>
          Comprueba tu conexión a internet. Si el problema persiste, pide a tu administrador que verifique que tu cuenta está vinculada a un hotel.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            type="button" onClick={onRetry}
            style={{
              padding: "10px 14px", borderRadius: 8, border: "none",
              background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer", flex: 1,
            }}
          >Reintentar</button>
          {onSignOut && (
            <button
              type="button" onClick={onSignOut}
              style={{
                padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd",
                background: "#fff", color: "#111", fontWeight: 500, cursor: "pointer",
              }}
            >Cerrar sesión</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cambiar contraseña ──────────────────────────────────────────────
// La cuenta es única para todas las webapps (mismo proyecto Supabase):
// cambiarla aquí la cambia en todas.

function passwordErrorText(err) {
  const m = (err && err.message) || "";
  if (/leak|pwned|breach|weak/i.test(m)) return "Esa contraseña aparece en filtraciones de datos conocidas. Elige otra diferente.";
  if (/at least|length|short/i.test(m)) return "La contraseña es demasiado corta.";
  if (/different from the old|same password/i.test(m)) return "La nueva contraseña no puede ser igual a la actual.";
  return m || "No se pudo cambiar la contraseña.";
}

function ChangePasswordModal({ email, onClose }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  const inputStyle = { padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", width: "100%", boxSizing: "border-box" };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (next !== repeat) { setError("Las contraseñas nuevas no coinciden."); return; }
    if (next === current) { setError("La nueva contraseña no puede ser igual a la actual."); return; }
    setLoading(true);
    try {
      try {
        await window.DocuApi.signIn(email, current);
      } catch (err) {
        setError("La contraseña actual no es correcta."); setLoading(false); return;
      }
      const { error: upErr } = await window.DocuApi.client.auth.updateUser({ password: next });
      if (upErr) { setError(passwordErrorText(upErr)); setLoading(false); return; }
      setDone(true);
    } catch (err) {
      setError(passwordErrorText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 200, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={submit} style={{
        background: "var(--surface, #fff)", padding: 28, borderRadius: 12,
        width: "100%", maxWidth: 400,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Cambiar contraseña</h2>
        {done ? (
          <React.Fragment>
            <div style={{ color: "#166534", fontSize: 14, background: "#dcfce7", padding: 10, borderRadius: 6 }}>
              ✓ Contraseña actualizada. El cambio aplica a todas las webapps (Docuhotel, EcoTrack, Subsana…).
            </div>
            <button type="button" onClick={onClose} style={{
              padding: "10px 14px", borderRadius: 8, border: "none",
              background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer",
            }}>Cerrar</button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
              La cuenta es la misma en todas las webapps: al cambiarla aquí, cambia en todas.
            </p>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#444" }}>Contraseña actual</span>
              <input type="password" required autoFocus autoComplete="current-password"
                value={current} onChange={(e) => setCurrent(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#444" }}>Nueva contraseña (mínimo 8 caracteres)</span>
              <input type="password" required autoComplete="new-password"
                value={next} onChange={(e) => setNext(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#444" }}>Repite la nueva contraseña</span>
              <input type="password" required autoComplete="new-password"
                value={repeat} onChange={(e) => setRepeat(e.target.value)} style={inputStyle} />
            </label>
            {error && (
              <div style={{ color: "#b91c1c", fontSize: 13, background: "#fee2e2", padding: 8, borderRadius: 6 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={loading} style={{
                padding: "10px 14px", borderRadius: 8, border: "none", flex: 1,
                background: "#111", color: "#fff", fontWeight: 600, cursor: "pointer",
                opacity: loading ? 0.6 : 1,
              }}>{loading ? "Guardando…" : "Cambiar contraseña"}</button>
              <button type="button" onClick={onClose} style={{
                padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd",
                background: "#fff", color: "#111", cursor: "pointer",
              }}>Cancelar</button>
            </div>
          </React.Fragment>
        )}
      </form>
    </div>
  );
}

// Chip de usuario del header con menú: cambiar contraseña / cerrar sesión.
function UserMenu({ currentUser, useBackend, isImpersonating, onExitImpersonate }) {
  const [open, setOpen] = React.useState(false);
  const [showPass, setShowPass] = React.useState(false);

  const itemStyle = {
    display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
    background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#222",
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        className="user-chip"
        title={useBackend ? `${currentUser?.email || ""}` : currentUser?.email}
        onClick={() => {
          if (isImpersonating) { onExitImpersonate(); return; }
          if (!useBackend) return;
          setOpen((o) => !o);
        }}
        style={(useBackend || isImpersonating) ? { cursor: "pointer" } : undefined}
      >
        <span className="avatar">{(currentUser?.name || "?").split(" ").map(p => p[0]).slice(0, 2).join("")}</span>
        <span>{currentUser?.name}</span>
      </div>
      {open && (
        <React.Fragment>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 91,
            background: "var(--surface, #fff)", borderRadius: 10, minWidth: 190,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.14)",
            border: "1px solid #eee", overflow: "hidden", padding: "4px 0",
          }}>
            <div style={{ padding: "8px 14px 6px", fontSize: 12, color: "#888", borderBottom: "1px solid #f0f0f0" }}>
              {currentUser?.email}
            </div>
            <button type="button" style={itemStyle} onClick={() => { setOpen(false); setShowPass(true); }}>
              🔑 Cambiar contraseña
            </button>
            <button type="button" style={{ ...itemStyle, color: "#b91c1c" }} onClick={() => {
              setOpen(false);
              if (confirm("¿Cerrar sesión?")) window.DocuApi.signOut().then(() => location.reload());
            }}>
              ⎋ Cerrar sesión
            </button>
          </div>
        </React.Fragment>
      )}
      {showPass && <ChangePasswordModal email={currentUser?.email} onClose={() => setShowPass(false)} />}
    </div>
  );
}

window.LoginForm = LoginForm;
window.LoadingScreen = LoadingScreen;
window.ErrorScreen = ErrorScreen;
window.ChangePasswordModal = ChangePasswordModal;
window.PasswordErrorText = passwordErrorText;
window.UserMenu = UserMenu;
