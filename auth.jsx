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

function LoadingScreen({ label }) {
  return (
    <div className="app" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", color: "#666" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "3px solid #ddd", borderTopColor: "#111",
          margin: "0 auto 12px", animation: "spin 0.9s linear infinite",
        }} />
        <div>{label || "Cargando…"}</div>
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

window.LoginForm = LoginForm;
window.LoadingScreen = LoadingScreen;
window.ErrorScreen = ErrorScreen;
