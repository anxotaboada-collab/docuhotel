// Docuhotel — Regional / master panel (only for users flagged is_regional).
// Lets a regional admin: upload one corporate document into many hotels at once,
// see the registry of regional uploads, and manage which hotels each user can access.

function RegionalPanel({ state, t, lang, switchHotel, pushToast }) {
  const [section, setSection] = React.useState("upload");
  const hotels = state.config?.accessibleHotels || [];
  const hotelName = (id) => hotels.find(h => h.id === id)?.name || id;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">🌐 Regional</h1>
          <div className="page-sub">Gestión corporativa: hoteles, documentos para varios hoteles, registro y usuarios.</div>
        </div>
      </div>
      <div className="admin-nav" style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={`btn btn-sm ${section === "newhotel" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSection("newhotel")}>🏨 Nuevo hotel</button>
        <button className={`btn btn-sm ${section === "upload" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSection("upload")}>Subir documento regional</button>
        <button className={`btn btn-sm ${section === "registry" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSection("registry")}>Registro de subidas</button>
        <button className={`btn btn-sm ${section === "users" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSection("users")}>Usuarios y hoteles</button>
      </div>
      {section === "newhotel" && <RegionalNewHotel switchHotel={switchHotel} pushToast={pushToast} />}
      {section === "upload" && <RegionalUpload state={state} hotels={hotels} pushToast={pushToast} onDone={() => setSection("registry")} />}
      {section === "registry" && <RegionalRegistry hotels={hotels} hotelName={hotelName} switchHotel={switchHotel} lang={lang} />}
      {section === "users" && <RegionalUsers hotels={hotels} hotelName={hotelName} pushToast={pushToast} />}
    </div>
  );
}

// ── Create a brand-new hotel (with default taxonomies) ────────────────
function RegionalNewHotel({ switchHotel, pushToast }) {
  const [name, setName] = React.useState("");
  const [country, setCountry] = React.useState("ES");
  const [timezone, setTimezone] = React.useState("Europe/Madrid");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Pon un nombre para el hotel."); return; }
    setBusy(true);
    try {
      const id = await window.DocuApi.createHotel({ name: name.trim(), country: country.trim() || "ES", timezone: timezone.trim() || "Europe/Madrid" });
      pushToast && pushToast(`✓ Hotel "${name.trim()}" creado`);
      setName("");
      if (id && switchHotel) await switchHotel(id);
    } catch (err) {
      setError("No se pudo crear el hotel: " + (err?.message || err));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Crea un hotel nuevo con las categorías, departamentos, estados y periodos por defecto. Al crearlo entrarás en él automáticamente; luego podrás editarlo y añadir usuarios desde el panel de administración.
      </p>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Nombre del hotel *</span>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Hotel Atlántico Norte" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>País</span>
          <input className="input" value={country} onChange={e => setCountry(e.target.value)} placeholder="ES" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Zona horaria</span>
          <input className="input" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="Europe/Madrid" />
        </label>
      </div>
      {error && <div style={{ color: "var(--danger, #b91c1c)", background: "var(--danger-bg, #fee2e2)", padding: 8, borderRadius: 6, fontSize: 13 }}>{error}</div>}
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear hotel"}</button></div>
    </form>
  );
}

// ── Upload one document into N hotels (single synchronized row) ────────
function RegionalUpload({ state, hotels, pushToast, onDone }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [publicAccess, setPublicAccess] = React.useState(false);
  const [pickedHotels, setPickedHotels] = React.useState(() => new Set());
  const [pendingFile, setPendingFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileRef = React.useRef();

  const toggleHotel = (id) => setPickedHotels(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allOn = hotels.length > 0 && pickedHotels.size === hotels.length;
  const toggleAll = () => setPickedHotels(allOn ? new Set() : new Set(hotels.map(h => h.id)));

  const onPickFile = (f) => {
    setError("");
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) { setError("Solo se admiten archivos PDF."); return; }
    if (f.size > 25 * 1024 * 1024) { setError("El archivo supera los 25 MB."); return; }
    setPendingFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Pon un título."); return; }
    if (pickedHotels.size === 0) { setError("Selecciona al menos un hotel."); return; }
    setBusy(true);
    try {
      const fields = {
        title: title.trim(),
        description,
        statusId: state.statuses.find(s => s.key === "active")?.id || state.statuses[0]?.id || null,
        periodId: state.periods.find(p => p.manual)?.id || state.periods[0]?.id || null,
        categoryId: null,
        startDate: new Date().toISOString(),
        expiryDate: null,
        publicAccess,
      };
      await window.DocuApi.regionalUpload({ file: pendingFile, fields, hotelIds: Array.from(pickedHotels) });
      pushToast && pushToast(`✓ Documento creado en ${pickedHotels.size} hotel(es)`);
      setTitle(""); setDescription(""); setPublicAccess(false); setPickedHotels(new Set()); setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onDone && onDone();
    } catch (err) {
      setError("No se pudo crear: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        Sube un PDF una sola vez y elige en qué hoteles debe quedar activo. Es <strong>un único documento</strong> sincronizado:
        si lo descatalogas, cambia para todos los hoteles seleccionados. No se duplica.
      </p>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Título *</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Política de seguridad alimentaria 2026" />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Descripción</span>
        <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Archivo PDF</span>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => onPickFile(e.target.files?.[0])} />
        {pendingFile && <span style={{ fontSize: 12, color: "var(--muted)" }}>{pendingFile.name} ({(pendingFile.size/1024/1024).toFixed(2)} MB)</span>}
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={publicAccess} onChange={e => setPublicAccess(e.target.checked)} />
        Visible también en la vista pública / QR de cada hotel
      </label>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Hoteles donde debe estar activo *</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={toggleAll}>{allOn ? "Ninguno" : "Todos"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, border: "1px solid var(--line)", borderRadius: 8, padding: 10, maxHeight: 260, overflow: "auto" }}>
          {hotels.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>No tienes hoteles accesibles.</span>}
          {hotels.map(h => (
            <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", borderRadius: 6, background: pickedHotels.has(h.id) ? "var(--bg-soft)" : "transparent" }}>
              <input type="checkbox" checked={pickedHotels.has(h.id)} onChange={() => toggleHotel(h.id)} />
              🏨 {h.name}
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{pickedHotels.size} seleccionado(s)</div>
      </div>
      {error && <div style={{ color: "var(--danger, #b91c1c)", background: "var(--danger-bg, #fee2e2)", padding: 8, borderRadius: 6, fontSize: 13 }}>{error}</div>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear documento regional"}</button>
      </div>
    </form>
  );
}

// ── Registry of regional uploads ──────────────────────────────────────
function RegionalRegistry({ hotels, hotelName, switchHotel, lang }) {
  const [rows, setRows] = React.useState(null);
  const reload = React.useCallback(() => {
    window.DocuApi.listRegionalUploads().then(setRows).catch(() => setRows([]));
  }, []);
  React.useEffect(() => { reload(); }, [reload]);
  const fmt = (iso) => iso ? new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB") : "—";

  if (rows === null) return <div className="empty-state">Cargando…</div>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn btn-sm btn-ghost" onClick={reload}>↻ Actualizar</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Documento</th><th>Fecha</th><th>Hoteles</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3}><div className="empty-state">Aún no hay subidas regionales.</div></td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td><strong>{r.title || "(sin título)"}</strong><div className="doc-meta">{r.document_id}</div></td>
                <td style={{ whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(r.hotel_ids || []).map(hid => (
                      <button key={hid} className="btn btn-sm btn-ghost" title="Entrar en este hotel" onClick={() => switchHotel(hid)}>🏨 {hotelName(hid)}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Manage which hotels each user can access ──────────────────────────
function RegionalUsers({ hotels, hotelName, pushToast }) {
  const [users, setUsers] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // { user, isRegional, picked:Set }
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(() => {
    window.DocuApi.listAllUsers().then(setUsers).catch(() => setUsers([]));
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  const openEdit = async (u) => {
    const extra = u.is_regional ? [] : await window.DocuApi.getUserHotels(u.id);
    const picked = new Set([u.hotel_id, ...extra]);
    setEditing({ user: u, isRegional: !!u.is_regional, picked });
  };
  const toggle = (id) => setEditing(e => {
    const n = new Set(e.picked); n.has(id) ? n.delete(id) : n.add(id); return { ...e, picked: n };
  });
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      // Extra hotels = picked minus the user's primary hotel (that one lives in app_users.hotel_id).
      const extra = Array.from(editing.picked).filter(h => h !== editing.user.hotel_id);
      await window.DocuApi.setUserAccess(editing.user.id, { isRegional: editing.isRegional, hotelIds: editing.isRegional ? [] : extra });
      pushToast && pushToast("✓ Acceso actualizado");
      setEditing(null);
      reload();
    } catch (err) {
      pushToast && pushToast("⚠ " + (err?.message || err));
    } finally { setBusy(false); }
  };

  const [creating, setCreating] = React.useState(false);

  if (users === null) return <div className="empty-state">Cargando…</div>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13, flex: 1 }}>
          Crea usuarios nuevos (con su cuenta de acceso), márcalos como <strong>regional</strong> (ven todos los hoteles)
          o asígnales 1, 2 o más hoteles concretos. Su hotel principal (el de su ficha) siempre está incluido.
        </p>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>➕ Crear usuario</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Acceso</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong><div className="doc-meta">{u.email}</div></td>
                <td>{u.role}</td>
                <td>{u.is_regional ? <span style={{ background: "var(--bg-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>🌐 Todos los hoteles</span> : hotelName(u.hotel_id)}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => openEdit(u)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <RegionalCreateUser hotels={hotels} pushToast={pushToast} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />
      )}
      {editing && (
        <Modal size="md" title={`Acceso de ${editing.user.name}`} onClose={() => setEditing(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></>}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
            <input type="checkbox" checked={editing.isRegional} onChange={e => setEditing(s => ({ ...s, isRegional: e.target.checked }))} />
            Admin regional (acceso a todos los hoteles)
          </label>
          {!editing.isRegional && (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Hoteles a los que puede acceder:</div>
              <div style={{ display: "grid", gap: 6, maxHeight: 280, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
                {hotels.map(h => {
                  const isPrimary = h.id === editing.user.hotel_id;
                  return (
                    <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={editing.picked.has(h.id)} disabled={isPrimary} onChange={() => toggle(h.id)} />
                      🏨 {h.name}{isPrimary && <span style={{ color: "var(--muted)", fontSize: 11 }}> (principal)</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Create a brand-new user (Auth account + app_users row) ────────────
function RegionalCreateUser({ hotels, pushToast, onClose, onCreated }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [hotelId, setHotelId] = React.useState(hotels[0]?.id || "");
  const [role, setRole] = React.useState("employee");
  const [isRegional, setIsRegional] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setError("");
    if (!email.trim()) { setError("Pon un email."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (!hotelId) { setError("Selecciona el hotel principal."); return; }
    setBusy(true);
    try {
      const res = await window.DocuApi.createAppUser({
        email: email.trim(), password, name: name.trim(), hotelId, role, isRegional,
      });
      pushToast && pushToast(`✓ Usuario "${email.trim()}" creado` + (res?.needsEmailConfirm ? " (debe confirmar su email)" : ""));
      onCreated && onCreated();
    } catch (err) {
      setError("No se pudo crear: " + (err?.message || err));
    } finally { setBusy(false); }
  };

  return (
    <Modal size="md" title="Crear usuario nuevo" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</button></>}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5 }}>
          Se crea la cuenta de acceso y el perfil. Comparte la contraseña con la persona; podrá cambiarla al entrar.
          Si tu proyecto de Supabase exige confirmación por email, recibirá un enlace para activarla.
        </p>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Nombre</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Marta García" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Email *</span>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marta@hotel.com" />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Contraseña inicial * (mín. 6)</span>
          <input className="input" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="contraseña temporal" autoComplete="new-password" />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Hotel principal *</span>
            <select className="select" value={hotelId} onChange={e => setHotelId(e.target.value)}>
              {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Rol</span>
            <select className="select" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Administrador</option>
              <option value="dept_head">Jefe de departamento</option>
              <option value="employee">Empleado</option>
            </select>
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <input type="checkbox" checked={isRegional} onChange={e => setIsRegional(e.target.checked)} />
          🌐 Admin regional (master) — acceso a todos los hoteles
        </label>
        {error && <div style={{ color: "var(--danger, #b91c1c)", background: "var(--danger-bg, #fee2e2)", padding: 8, borderRadius: 6, fontSize: 13 }}>{error}</div>}
      </form>
    </Modal>
  );
}

window.RegionalPanel = RegionalPanel;
