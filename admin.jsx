// Docuhotel — Admin panel (categories, departments, statuses, periods, owners, users, email)

function AdminPage({ state, setState, t, lang, log, onImpersonate }) {
  const [section, setSection] = React.useState("categories");
  const sections = [
    ["categories",   t.admin.sections.categories],
    ["themes",       t.admin.sections.themes || "Temas"],
    ["departments",  t.admin.sections.departments],
    ["statuses",     t.admin.sections.statuses],
    ["periods",      t.admin.sections.periods],
    ["responsibles", t.admin.sections.responsibles],
    ["users",        t.admin.sections.users],
    ["templates",    t.admin.sections.templates || "Plantillas de correo"],
    ["roles",        t.admin.sections.roles || "Roles y permisos"],
    ["publicAccess", t.admin.sections.publicAccess],
    ["email",        t.admin.sections.email],
    ["hotel",        t.admin.sections.hotel || "Datos del hotel"],
  ];
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.admin.title}</h1>
          <div className="page-sub">{t.appName} · {t.admin.title}</div>
        </div>
      </div>
      <div className="admin-shell">
        <nav className="admin-nav">
          {sections.map(([k, label]) => (
            <button key={k} className={section === k ? "active" : ""} onClick={() => setSection(k)}>{label}</button>
          ))}
        </nav>
        <div className="admin-section">
          {section === "categories"   && <SimpleListAdmin state={state} setState={setState} t={t} log={log}
              keyName="categories" title={t.admin.sections.categories} help={t.admin.categoriesHelp}
              addLabel={t.admin.newCategory} logAction="cat_change" withColors />}
          {section === "themes"       && <SimpleListAdmin state={state} setState={setState} t={t} log={log}
              keyName="themes" title={t.admin.sections.themes || "Temas"} help={t.admin.themesHelp}
              addLabel={t.admin.newTheme || "Nuevo tema"} logAction="theme_change" />}
          {section === "departments"  && <SimpleListAdmin state={state} setState={setState} t={t} log={log}
              keyName="departments" title={t.admin.sections.departments} help={t.admin.departmentsHelp}
              addLabel={t.admin.newDepartment} logAction="dep_change" />}
          {section === "statuses"     && <StatusesAdmin state={state} setState={setState} t={t} lang={lang} log={log} />}
          {section === "periods"      && <PeriodsAdmin state={state} setState={setState} t={t} lang={lang} log={log} />}
          {section === "responsibles" && <ResponsiblesAdmin state={state} setState={setState} t={t} log={log} />}
          {section === "users"        && <UsersAdmin state={state} setState={setState} t={t} lang={lang} log={log} onImpersonate={onImpersonate} />}
          {section === "templates"    && <TemplatesAdmin state={state} setState={setState} t={t} lang={lang} log={log} />}
          {section === "roles"        && <RolesAdmin state={state} setState={setState} t={t} log={log} />}
          {section === "publicAccess" && <PublicAccessAdmin state={state} setState={setState} t={t} log={log} />}
          {section === "email"        && <EmailAdmin state={state} setState={setState} t={t} lang={lang} log={log} />}
          {section === "hotel"        && <HotelAdmin state={state} setState={setState} t={t} log={log} />}
        </div>
      </div>
    </div>
  );
}

// Shaded color presets (text + background pairs), same palette as statuses.
const LIST_COLOR_PRESETS = [
  { color: "#14532d", bg: "#dcfce7" }, // green
  { color: "#1e3a8a", bg: "#dbeafe" }, // blue
  { color: "#b45309", bg: "#fef3c7" }, // amber
  { color: "#991b1b", bg: "#fee2e2" }, // red
  { color: "#581c87", bg: "#f3e8ff" }, // purple
  { color: "#0e7490", bg: "#cffafe" }, // teal
  { color: "#404040", bg: "#e5e5e3" }, // gray
  { color: "#7c2d12", bg: "#fed7aa" }, // orange
];

function SimpleListAdmin({ state, setState, t, log, keyName, title, help, addLabel, logAction, withColors }) {
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState(null);
  const [editingName, setEditingName] = React.useState("");
  const items = state[keyName] || [];
  const setColor = (it, preset) => {
    setState(s => ({ ...s, [keyName]: (s[keyName] || []).map(i => i.id === it.id ? { ...i, color: preset?.color || null, bg: preset?.bg || null } : i) }));
    log(logAction, `~ ${it.name} (color)`);
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const id = window.DocuStore.uid(keyName.slice(0,3));
    setState(s => ({ ...s, [keyName]: [...(s[keyName] || []), { id, name }] }));
    log(logAction, `+ ${name}`);
    setNewName("");
  };
  const remove = (id) => {
    const it = items.find(i => i.id === id);
    setState(s => ({ ...s, [keyName]: (s[keyName] || []).filter(i => i.id !== id) }));
    log(logAction, `− ${it?.name || id}`);
  };
  const startEdit = (it) => { setEditingId(it.id); setEditingName(it.name); };
  const saveEdit = () => {
    setState(s => ({ ...s, [keyName]: (s[keyName] || []).map(i => i.id === editingId ? { ...i, name: editingName.trim() || i.name } : i) }));
    log(logAction, `~ ${editingName}`);
    setEditingId(null);
  };
  return (
    <div>
      <h2>{title}</h2>
      <p className="help-text">{help}</p>
      <div className="admin-list">
        {items.map(it => (
          <div key={it.id} className="row">
            {editingId === it.id ? (
              <input className="input" value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus />
            ) : (
              <div className="name">
                {withColors && (it.bg || it.color)
                  ? <span className="pill" style={{ background: it.bg || "transparent", color: it.color || "inherit", borderColor: "transparent" }}>{it.name}</span>
                  : it.name}
              </div>
            )}
            {withColors && editingId !== it.id && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginRight: 8 }}>
                <button
                  type="button"
                  title="Sin color"
                  onClick={() => setColor(it, null)}
                  style={{
                    width: 18, height: 18, borderRadius: "50%", cursor: "pointer", padding: 0,
                    background: "transparent", color: "var(--muted)", fontSize: 11, lineHeight: "16px",
                    border: (!it.bg && !it.color) ? "2px solid var(--ink)" : "1px solid var(--line)",
                  }}
                >∅</button>
                {LIST_COLOR_PRESETS.map(p => (
                  <button
                    type="button"
                    key={p.bg}
                    title={p.bg}
                    onClick={() => setColor(it, p)}
                    style={{
                      width: 18, height: 18, borderRadius: "50%", cursor: "pointer", padding: 0,
                      background: p.bg,
                      border: it.bg === p.bg ? `2px solid ${p.color}` : "1px solid var(--line)",
                    }}
                  />
                ))}
              </div>
            )}
            {editingId === it.id ? (
              <>
                <button className="btn btn-sm btn-primary" onClick={saveEdit}>{t.common.save}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>{t.common.cancel}</button>
              </>
            ) : (
              <>
                <button className="icon-btn" onClick={() => startEdit(it)}><Icon.edit /></button>
                <button className="icon-btn" onClick={() => remove(it.id)}><Icon.trash /></button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="add-bar">
        <input className="input" placeholder={addLabel} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn btn-primary" onClick={add}><Icon.plus /> {t.common.add}</button>
      </div>
    </div>
  );
}

function StatusesAdmin({ state, setState, t, lang, log }) {
  const [newName, setNewName] = React.useState("");
  const items = state.statuses;
  const PRESET_COLORS = [
    { color: "#14532d", bg: "#dcfce7" }, // green
    { color: "#1e3a8a", bg: "#dbeafe" }, // blue
    { color: "#b45309", bg: "#fef3c7" }, // amber
    { color: "#991b1b", bg: "#fee2e2" }, // red
    { color: "#581c87", bg: "#f3e8ff" }, // purple
    { color: "#0e7490", bg: "#cffafe" }, // teal
    { color: "#404040", bg: "#e5e5e3" }, // gray
    { color: "#7c2d12", bg: "#fed7aa" }, // orange
  ];
  const add = () => {
    const name = newName.trim(); if (!name) return;
    const id = window.DocuStore.uid("st");
    const preset = PRESET_COLORS[items.length % PRESET_COLORS.length];
    setState(s => ({ ...s, statuses: [...s.statuses, { id, key: id, color: preset.color, bg: preset.bg, label: { es: name, en: name, de: name } }] }));
    log("status_change", `+ ${name}`);
    setNewName("");
  };
  const remove = (id) => {
    const it = items.find(i => i.id === id);
    setState(s => ({ ...s, statuses: s.statuses.filter(i => i.id !== id) }));
    log("status_change", `− ${it?.label?.[lang] || id}`);
  };
  const rename = (id, val) => {
    setState(s => ({ ...s, statuses: s.statuses.map(i => i.id === id ? { ...i, label: { ...i.label, [lang]: val } } : i) }));
  };
  const setColor = (id, preset) => {
    setState(s => ({ ...s, statuses: s.statuses.map(i => i.id === id ? { ...i, color: preset.color, bg: preset.bg } : i) }));
    log("status_change", "color");
  };
  return (
    <div>
      <h2>{t.admin.sections.statuses}</h2>
      <p className="help-text">{t.admin.statusesHelp}</p>
      <div className="admin-list">
        {items.map(s => (
          <div key={s.id} className="row" style={{ flexWrap: 'wrap' }}>
            <span className="pill" style={{ minWidth: 100, background: s.bg || 'var(--bg-soft-2)', color: s.color || 'var(--ink)' }}>
              <span className="dot" />{(t.statuses && t.statuses[s.key]) || s.label?.[lang]}
            </span>
            <input className="input" style={{ flex: 1, minWidth: 160 }} value={s.label?.[lang] || ""} onChange={e => rename(s.id, e.target.value)} />
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESET_COLORS.map((p, i) => (
                <button key={i} type="button"
                  onClick={() => setColor(s.id, p)}
                  title={p.color}
                  style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: p.bg,
                    border: s.color === p.color ? `2px solid ${p.color}` : '1px solid var(--line-strong)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span style={{ position: 'absolute', inset: 4, background: p.color, borderRadius: 2 }} />
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={() => remove(s.id)} disabled={["active","draft","pending","archived"].includes(s.key)} title={["active","draft","pending","archived"].includes(s.key) ? "Estado del sistema" : ""}><Icon.trash /></button>
          </div>
        ))}
      </div>
      <div className="add-bar">
        <input className="input" placeholder={t.admin.newStatus} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
        <button className="btn btn-primary" onClick={add}><Icon.plus /> {t.common.add}</button>
      </div>
    </div>
  );
}

function PeriodsAdmin({ state, setState, t, lang, log }) {
  const [months, setMonths] = React.useState(12);
  const items = [...state.periods].sort((a, b) => a.months - b.months);
  const labelFor = (m) => {
    if (m < 12) return { es: `${m} ${t.admin.months}`, en: `${m} months`, de: `${m} Monate` };
    if (m === 12) return { es: `1 ${t.admin.year}`, en: "1 year", de: "1 Jahr" };
    if (m % 12 === 0) return { es: `${m/12} ${t.admin.years}`, en: `${m/12} years`, de: `${m/12} Jahre` };
    return { es: `${m} m`, en: `${m} m`, de: `${m} M` };
  };
  const add = () => {
    const m = parseInt(months, 10); if (!m || m <= 0) return;
    if (state.periods.find(p => p.months === m)) return;
    const id = window.DocuStore.uid("p");
    setState(s => ({ ...s, periods: [...s.periods, { id, months: m, label: labelFor(m) }] }));
    log("period_change", `+ ${labelFor(m)[lang]}`);
  };
  const remove = (id) => {
    const it = items.find(i => i.id === id);
    setState(s => ({ ...s, periods: s.periods.filter(p => p.id !== id) }));
    log("period_change", `− ${it?.label?.[lang]}`);
  };
  return (
    <div>
      <h2>{t.admin.sections.periods}</h2>
      <p className="help-text">{t.admin.periodsHelp}</p>
      <div className="admin-list">
        {items.map(p => (
          <div key={p.id} className="row">
            <div className="name">{p.label?.[lang] || `${p.months} m`}</div>
            <div className="meta">{p.months} {t.admin.months}</div>
            <button className="icon-btn" onClick={() => remove(p.id)}><Icon.trash /></button>
          </div>
        ))}
      </div>
      <div className="add-bar">
        <input type="number" min="1" max="240" className="input" value={months} onChange={e => setMonths(e.target.value)} />
        <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: 13 }}>{t.admin.months}</span>
        <button className="btn btn-primary" onClick={add}><Icon.plus /> {t.admin.addPeriod}</button>
      </div>
    </div>
  );
}

function ResponsiblesAdmin({ state, setState, t, log }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const items = state.responsibles;
  const add = () => {
    if (!name.trim()) return;
    const id = window.DocuStore.uid("r");
    setState(s => ({ ...s, responsibles: [...s.responsibles, { id, name: name.trim(), email: email.trim() }] }));
    log("resp_change", `+ ${name}`);
    setName(""); setEmail("");
  };
  const remove = (id) => {
    const it = items.find(i => i.id === id);
    setState(s => ({ ...s, responsibles: s.responsibles.filter(r => r.id !== id) }));
    log("resp_change", `− ${it?.name || id}`);
  };
  return (
    <div>
      <h2>{t.admin.sections.responsibles}</h2>
      <p className="help-text">{t.admin.responsiblesHelp}</p>
      <div className="admin-list">
        {items.map(r => (
          <div key={r.id} className="row">
            <div className="name">{r.name}</div>
            <div className="meta">{r.email || "—"}</div>
            <button className="icon-btn" onClick={() => remove(r.id)}><Icon.trash /></button>
          </div>
        ))}
      </div>
      <div className="add-bar">
        <input className="input" placeholder={t.common.name} value={name} onChange={e => setName(e.target.value)} />
        <input className="input" placeholder={t.common.email} value={email} onChange={e => setEmail(e.target.value)} />
        <button className="btn btn-primary" onClick={add}><Icon.plus /> {t.admin.newResponsible}</button>
      </div>
    </div>
  );
}

function UsersAdmin({ state, setState, t, lang, log, onImpersonate }) {
  const [editing, setEditing] = React.useState(null);
  const items = state.users;
  const myId = state.config?.currentUserId;
  const remove = (id) => {
    const it = items.find(i => i.id === id);
    setState(s => ({ ...s, users: s.users.filter(u => u.id !== id) }));
    log("user_delete", it?.name || id);
  };
  const save = (u) => {
    const isNew = !items.find(x => x.id === u.id);
    setState(s => ({ ...s, users: isNew ? [...s.users, u] : s.users.map(x => x.id === u.id ? u : x) }));
    log(isNew ? "user_create" : "user_update", u.name);
    setEditing(null);
  };
  return (
    <div>
      <h2>{t.admin.sections.users}</h2>
      <p className="help-text">{t.admin.usersHelp}</p>
      <div className="admin-list">
        {items.map(u => (
          <div key={u.id} className="row">
            <div className="name">{u.name}</div>
            <div className="meta">{u.email}</div>
            <span className="pill outline">{t.admin.role[u.role] || u.role}</span>
            {u.role === "dept_head" && <span className="pill" style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 10 }}>📧 alertas</span>}
            <span className="meta" style={{ minWidth: 160 }}>
              {u.departments.includes("*") ? t.documents.allDepartments :
                u.departments.map(d => state.departments.find(x => x.id === d)?.name).filter(Boolean).join(", ")}
            </span>
            {onImpersonate && u.id !== myId && (
              <button className="icon-btn" title={t.admin?.viewAs || "Ver como este usuario"} onClick={() => onImpersonate(u.id)}><Icon.eye /></button>
            )}
            <button className="icon-btn" onClick={() => setEditing(u)}><Icon.edit /></button>
            <button className="icon-btn" onClick={() => remove(u.id)}><Icon.trash /></button>
          </div>
        ))}
      </div>
      <div className="add-bar">
        <button className="btn btn-primary" onClick={() => setEditing({ new: true })}><Icon.plus /> {t.admin.newUser}</button>
      </div>
      {editing && <UserForm state={state} t={t} lang={lang} user={editing.new ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ state, t, lang, user, onSave, onClose }) {
  const [name, setName] = React.useState(user?.name || "");
  const [email, setEmail] = React.useState(user?.email || "");
  const [role, setRole] = React.useState(user?.role || "employee");
  const [departments, setDepartments] = React.useState(user?.departments || []);
  const submit = (e) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onSave({
      id: user?.id || window.DocuStore.uid("u"),
      name: name.trim(), email: email.trim(),
      role,
      departments: departments.length ? departments : ["*"],
    });
  };
  return (
    <Modal size="md" title={user ? t.common.edit + " " + t.common.user : t.admin.newUser} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn btn-primary" onClick={submit}><Icon.check /> {t.common.save}</button>
      </>}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field full">
            <label>{t.common.name}</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="field full">
            <label>{t.common.email}</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field full">
            <label>{t.common.role}</label>
            <select className="select" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">{t.admin.role.admin}</option>
              <option value="dept_head">{t.admin.role.dept_head}</option>
              <option value="employee">{t.admin.role.employee}</option>
            </select>
            {role === "dept_head" && <span className="help">📧 Recibirá notificaciones automáticas de caducidad de los documentos de su departamento.</span>}
          </div>
          <div className="field full">
            <label>{t.common.departments}</label>
            <ToggleChips items={state.departments} value={departments} onChange={setDepartments} getLabel={d => d.name} allowAll />
          </div>
        </div>
      </form>
    </Modal>
  );
}

function EmailAdmin({ state, setState, t, lang, log }) {
  const [subTab, setSubTab] = React.useState("config");
  const cfg = state.config.email;
  const [draft, setDraft] = React.useState(cfg);
  const [testStatus, setTestStatus] = React.useState("");
  const emailLog = state.config.emailLog || [];

  const save = () => {
    setState(s => ({ ...s, config: { ...s.config, email: draft } }));
    log("config_change", "Email · " + (draft.enabled ? "enabled" : "disabled"));
    setTestStatus(t.common.saved);
    setTimeout(() => setTestStatus(""), 2000);
  };

  const sendTest = () => {
    if (!draft.apiKey) { setTestStatus("⚠ " + t.common.required); return; }
    const entry = { id: window.DocuStore.uid("elog"), ts: new Date().toISOString(), to: "test@hotel.com", subject: "Test email", status: "sent", trigger: "test" };
    setState(s => ({ ...s, config: { ...s.config, emailLog: [entry, ...(s.config.emailLog || [])] } }));
    setTestStatus("✓ Test queued (mock)");
    setTimeout(() => setTestStatus(""), 3000);
  };

  const exportCsv = () => {
    const rows = [["timestamp","to","subject","trigger","status"], ...emailLog.map(e => [new Date(e.ts).toISOString(), e.to, e.subject, e.trigger || "", e.status])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "docuhotel-email-log.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div>
      <h2>{t.admin.sections.email}</h2>
      <div className="sub-tabs" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
        <button className={`tab ${subTab === "config" ? "active" : ""}`} onClick={() => setSubTab("config")}>{t.admin.provider}</button>
        <button className={`tab ${subTab === "log" ? "active" : ""}`} onClick={() => setSubTab("log")}>{t.admin.emailLog}</button>
      </div>

      {subTab === "config" && <>
        <p className="help-text">{t.admin.emailHelp}</p>
        <div className="form-grid">
          <div className="field full">
            <label>{t.admin.provider}</label>
            <select className="select" value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })}>
              <option value="resend">Resend (3.000 emails/mes — gratis)</option>
            </select>
            <span className="help">{t.admin.provHelp.resend}</span>
          </div>
          <div className="field full">
            <label>{t.admin.apiKey}</label>
            <input className="input" type="password" placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx" value={draft.apiKey} onChange={e => setDraft({ ...draft, apiKey: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.admin.fromAddress}</label>
            <input className="input" placeholder="alarmas@hotel.com" value={draft.fromAddress} onChange={e => setDraft({ ...draft, fromAddress: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.admin.fromName}</label>
            <input className="input" placeholder="Docuhotel" value={draft.fromName} onChange={e => setDraft({ ...draft, fromName: e.target.value })} />
          </div>
          <div className="field full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 13.5, color: 'var(--ink)' }}>
              <input type="checkbox" checked={!!draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />
              {t.admin.enabled}
            </label>
            <span className="help">Los destinatarios se calculan automáticamente: jefes de los departamentos asignados a cada documento.</span>
          </div>
        </div>
        <div className="add-bar">
          <button className="btn" onClick={sendTest}><Icon.send /> {t.admin.testEmail}</button>
          <div className="spacer" style={{ flex: 1 }} />
          <span style={{ color: 'var(--muted)', fontSize: 12.5, alignSelf: 'center' }}>{testStatus}</span>
          <button className="btn btn-primary" onClick={save}><Icon.check /> {t.common.save}</button>
        </div>
      </>}

      {subTab === "templates" && <TemplatesAdmin state={state} setState={setState} t={t} lang={lang} log={log} />}      {subTab === "log" && <>
        <p className="help-text">{t.admin.emailLogHelp}</p>
        <div className="filter-row" style={{ marginBottom: 10 }}>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" onClick={exportCsv}><Icon.download /> CSV</button>
        </div>
        <div className="table-wrap">
          <table className="table log-table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>{t.log.timestamp}</th>
                <th style={{ width: 220 }}>{t.admin.emailLogTo}</th>
                <th>{t.admin.emailLogSubject}</th>
                <th style={{ width: 140 }}>Trigger</th>
                <th style={{ width: 90 }}>{t.admin.emailLogStatus}</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.length === 0 && <tr><td colSpan={5}><div className="empty-state">—</div></td></tr>}
              {emailLog.map(e => (
                <tr key={e.id}>
                  <td className="ts">{new Date(e.ts).toLocaleString()}</td>
                  <td>{e.to}</td>
                  <td>{e.subject}</td>
                  <td><span className="pill outline" style={{ fontSize: 10 }}>{e.trigger || "—"}</span></td>
                  <td><span className="pill" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

function TemplatesAdmin({ state, setState, t, lang, log }) {
  const templates = state.config.emailTemplates || [];
  const [selectedId, setSelectedId] = React.useState(templates[0]?.id);
  const [previewLang, setPreviewLang] = React.useState(lang);
  const tpl = templates.find(x => x.id === selectedId) || templates[0];
  const [testStatus, setTestStatus] = React.useState("");

  const updateTpl = (patch) => {
    setState(s => ({
      ...s,
      config: {
        ...s.config,
        emailTemplates: s.config.emailTemplates.map(x => x.id === tpl.id ? { ...x, ...patch } : x),
      },
    }));
  };
  const updateField = (field, value) => updateTpl({ [field]: value });
  const updateLocalized = (field, langKey, value) => {
    updateTpl({ [field]: { ...tpl[field], [langKey]: value } });
  };
  const toggleRecipient = (role) => {
    const next = tpl.recipients.includes(role) ? tpl.recipients.filter(r => r !== role) : [...tpl.recipients, role];
    updateTpl({ recipients: next });
  };

  // Sample doc for preview
  const sampleDoc = state.documents[0];
  const sampleDept = sampleDoc ? state.departments.find(d => sampleDoc.departments.includes(d.id) || sampleDoc.departments.includes("*")) : null;
  const sampleCat = sampleDoc ? state.categories.find(c => c.id === sampleDoc.categoryId) : null;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(previewLang) : "—";
  const vars = {
    documento: sampleDoc?.title || "Plan de evacuación 2026",
    departamento: sampleDept?.name || "Dirección",
    categoria: sampleCat?.name || "Calidad",
    fecha_vigor: fmtDate(sampleDoc?.startDate || new Date().toISOString()),
    fecha_caducidad: fmtDate(sampleDoc?.expiryDate || new Date(Date.now() + 30*86400000).toISOString()),
    version: sampleDoc?.version || 1,
    destinatario: "Ana Dirección",
    remitente: state.config.email.fromName || "Docuhotel",
  };
  const interpolate = (s) => (s || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] != null ? String(vars[k]) : `{${k}}`);

  const sendTest = () => {
    const entry = {
      id: window.DocuStore.uid("elog"),
      ts: new Date().toISOString(),
      to: "test@hotel.com",
      subject: "[TEST] " + interpolate(tpl.subject[previewLang]),
      status: "sent",
      trigger: tpl.trigger,
    };
    setState(s => ({ ...s, config: { ...s.config, emailLog: [entry, ...(s.config.emailLog || [])] } }));
    setTestStatus("✓ Prueba encolada (mock)");
    log("config_change", `Test email · ${tpl.trigger}`);
    setTimeout(() => setTestStatus(""), 2400);
  };

  if (!tpl) return <p className="help-text">—</p>;

  const variableChips = ["documento", "departamento", "categoria", "fecha_vigor", "fecha_caducidad", "version", "destinatario", "remitente"];

  return (
    <div>
      <p className="help-text">{t.admin.templatesHelp}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, marginTop: 8 }}>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--line)', paddingRight: 16 }}>
          {templates.map(x => (
            <button
              key={x.id}
              onClick={() => setSelectedId(x.id)}
              className="tpl-row"
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid ' + (x.id === selectedId ? 'var(--ink)' : 'transparent'),
                background: x.id === selectedId ? 'var(--bg-soft)' : 'transparent',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: x.id === selectedId ? 600 : 500 }}>
                {t.admin.triggerLabels[x.trigger] || x.trigger}
              </span>
              <span style={{ fontSize: 11, color: x.enabled ? 'var(--ok)' : 'var(--muted)' }}>
                {x.enabled ? '● activa' : '○ desactivada'}
              </span>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>
              {t.admin.templateFor}: {t.admin.triggerLabels[tpl.trigger]}
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={tpl.enabled} onChange={e => updateField('enabled', e.target.checked)} />
              {t.admin.tplActive}
            </label>
          </div>

          <div className="form-grid">
            {/* Recipients */}
            <div className="field full">
              <label>{t.admin.whoReceives}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: "admin", label: t.admin.roleAdmin },
                  { id: "dept_head", label: t.admin.roleHeads },
                  { id: "employee", label: t.admin.roleEmployees },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRecipient(r.id)}
                    className="chip"
                    style={{
                      cursor: 'pointer',
                      background: tpl.recipients.includes(r.id) ? 'var(--ink)' : 'transparent',
                      color: tpl.recipients.includes(r.id) ? 'var(--bg)' : 'var(--ink)',
                      border: '1px solid ' + (tpl.recipients.includes(r.id) ? 'var(--ink)' : 'var(--line-strong)'),
                    }}
                  >
                    {tpl.recipients.includes(r.id) ? '✓ ' : ''}{r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>{t.admin.sendHour}</label>
              <select className="select" value={tpl.sendHour} onChange={e => updateField('sendHour', parseInt(e.target.value))}>
                {[6,7,8,9,10,11,12,13,14,15,16,17,18].map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
              </select>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!tpl.attachPdf} onChange={e => updateField('attachPdf', e.target.checked)} />
                  {t.admin.attachPdf}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!tpl.includeViewLink} onChange={e => updateField('includeViewLink', e.target.checked)} />
                  {t.admin.includeViewLink}
                </label>
              </div>
            </div>

            {/* Language tabs */}
            <div className="field full">
              <label>{t.admin.tplLanguage}</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {["es","en","de"].map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPreviewLang(l)}
                    className="chip"
                    style={{
                      cursor: 'pointer',
                      background: previewLang === l ? 'var(--ink)' : 'transparent',
                      color: previewLang === l ? 'var(--bg)' : 'var(--ink)',
                      border: '1px solid ' + (previewLang === l ? 'var(--ink)' : 'var(--line-strong)'),
                      textTransform: 'uppercase',
                      fontSize: 11,
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="field full">
              <label>{t.admin.tplSubject}</label>
              <input className="input" value={tpl.subject[previewLang] || ""} onChange={e => updateLocalized('subject', previewLang, e.target.value)} />
            </div>

            <div className="field full">
              <label>{t.admin.tplBody}</label>
              <textarea className="textarea" rows={10} style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: 12.5 }}
                value={tpl.body[previewLang] || ""} onChange={e => updateLocalized('body', previewLang, e.target.value)} />
              <span className="help" style={{ marginTop: 6, display: 'block' }}>{t.admin.tplVariables}:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {variableChips.map(v => (
                  <code key={v} style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 4 }}>{`{${v}}`}</code>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="field full">
              <label>{t.admin.tplPreview} <span className="help">— con datos de muestra</span></label>
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: 12 }}>
                  <div><strong>De:</strong> {state.config.email.fromName} &lt;{state.config.email.fromAddress}&gt;</div>
                  <div><strong>Para:</strong> {tpl.recipients.map(r => ({admin: t.admin.roleAdmin, dept_head: t.admin.roleHeads, employee: t.admin.roleEmployees})[r]).join(", ") || <em style={{ color: 'var(--muted)' }}>nadie seleccionado</em>}</div>
                  <div><strong>Asunto:</strong> {interpolate(tpl.subject[previewLang])}</div>
                </div>
                <pre style={{ margin: 0, padding: 16, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: '#222' }}>
                  {interpolate(tpl.body[previewLang])}
                </pre>
                {tpl.includeViewLink && (
                  <div style={{ padding: '10px 16px 16px' }}>
                    <span style={{ display: 'inline-block', padding: '8px 14px', background: 'var(--ink)', color: 'var(--bg)', borderRadius: 6, fontSize: 12.5, fontWeight: 500 }}>Ver documento →</span>
                  </div>
                )}
                {tpl.attachPdf && (
                  <div style={{ padding: '0 16px 14px', fontSize: 11.5, color: 'var(--muted)' }}>
                    📎 documento.pdf adjuntado
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="add-bar">
            <button className="btn" onClick={sendTest}><Icon.send /> {t.admin.tplSendTest}</button>
            <div className="spacer" style={{ flex: 1 }} />
            <span style={{ color: 'var(--muted)', fontSize: 12.5, alignSelf: 'center' }}>{testStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicAccessAdmin({ state, setState, t, log }) {
  const token = state.config.publicToken || "";
  const baseUrl = location.href.split("#")[0].split("?")[0];
  const url = `${baseUrl}#/public/${token}`;
  const publicDocs = state.documents.filter(d => {
    const st = state.statuses.find(s => s.id === d.statusId);
    return d.publicAccess && st?.key === "active";
  });
  const [copied, setCopied] = React.useState(false);
  const canvasRef = React.useRef();

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const size = 240;
    canvasRef.current.width = size;
    canvasRef.current.height = size;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    if (!window.qrcode) return;
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      const count = qr.getModuleCount();
      const cell = Math.floor((size - 16) / count);
      const offset = Math.floor((size - cell * count) / 2);
      ctx.fillStyle = "#111";
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  const downloadQr = () => {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = "docuhotel-qr.png";
    a.click();
  };
  const regenerate = () => {
    if (!confirm("¿Regenerar el enlace? El QR anterior dejará de funcionar.")) return;
    const newToken = "hotel-" + Math.random().toString(36).slice(2, 10);
    setState(s => ({ ...s, config: { ...s.config, publicToken: newToken } }));
    log("config_change", "Public token regenerated");
  };

  return (
    <div>
      <h2>{t.admin.sections.publicAccess}</h2>
      <p className="help-text">{t.admin.publicHelp}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 28, alignItems: "start", marginTop: 8 }}>
        <div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>{t.admin.publicUrl}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" readOnly value={url} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }} onFocus={e => e.target.select()} />
              <button className="btn" onClick={copy}>{copied ? "✓" : t.admin.copyUrl}</button>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>{publicDocs.length} {t.admin.publicDocsCount}</label>
            <div className="admin-list" style={{ borderTop: "1px solid var(--line)" }}>
              {publicDocs.length === 0 && <div className="row" style={{ color: "var(--muted)" }}>—</div>}
              {publicDocs.map(d => (
                <div key={d.id} className="row">
                  <Icon.doc style={{ color: "var(--muted)" }} />
                  <div className="name">{d.title}</div>
                  <div className="meta">v{d.version}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" onClick={regenerate}>{t.admin.regenerateToken}</button>
          </div>
        </div>
        <div style={{ textAlign: "center", padding: 16, border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", background: "var(--bg-soft)" }}>
          <div style={{ background: "white", padding: 12, borderRadius: 6, display: "inline-block" }}>
            <canvas ref={canvasRef} width="240" height="240" />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>{t.admin.publicQr}</div>
          <button className="btn btn-primary" style={{ marginTop: 10, width: "100%" }} onClick={downloadQr}>
            <Icon.download /> {t.admin.downloadQr}
          </button>
        </div>
      </div>
    </div>
  );
}

function HotelAdmin({ state, setState, t, log }) {
  const hotel = state.config.hotel || { name: "", timezone: "Europe/Madrid", country: "ES" };
  const [draft, setDraft] = React.useState(hotel);
  const [saved, setSaved] = React.useState("");

  // Live clock in selected timezone
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timezones = [
    "Europe/Madrid", "Europe/Lisbon", "Europe/London", "Europe/Paris", "Europe/Berlin",
    "Europe/Rome", "Europe/Amsterdam", "Europe/Zurich", "Europe/Vienna", "Europe/Athens",
    "Europe/Istanbul", "Atlantic/Canary", "Africa/Casablanca", "America/New_York",
    "America/Mexico_City", "America/Bogota", "America/Sao_Paulo", "America/Buenos_Aires",
    "Asia/Dubai", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney",
  ];
  const countries = [
    ["ES","España"], ["PT","Portugal"], ["FR","Francia"], ["IT","Italia"], ["DE","Alemania"],
    ["GB","Reino Unido"], ["NL","Países Bajos"], ["CH","Suiza"], ["AT","Austria"],
    ["GR","Grecia"], ["TR","Turquía"], ["MA","Marruecos"], ["MX","México"], ["AR","Argentina"],
    ["CO","Colombia"], ["BR","Brasil"], ["US","Estados Unidos"], ["AE","E.A.U."],
    ["JP","Japón"], ["CN","China"], ["AU","Australia"],
  ];

  const localTime = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat("es-ES", {
        timeZone: draft.timezone,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        weekday: "long", day: "2-digit", month: "long",
      }).format(now);
    } catch { return "—"; }
  }, [now, draft.timezone]);

  const offset = React.useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: draft.timezone, timeZoneName: "shortOffset" });
      const part = fmt.formatToParts(now).find(p => p.type === "timeZoneName");
      return part?.value || "";
    } catch { return ""; }
  }, [now, draft.timezone]);

  const save = () => {
    setState(s => ({ ...s, config: { ...s.config, hotel: draft } }));
    log("config_change", "Hotel · " + draft.name);
    setSaved(t.common.saved);
    setTimeout(() => setSaved(""), 2000);
  };

  return (
    <div>
      <h2>{t.admin.sections.hotel || "Datos del hotel"}</h2>
      <p className="help-text">{t.admin.hotelHelp || "Información general y zona horaria del hotel. La hora se usa para programar el envío de avisos automáticos."}</p>

      <div className="form-grid">
        <div className="field full">
          <label>{t.admin.hotelName || "Nombre del hotel"}</label>
          <input className="input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label>{t.admin.country || "País"}</label>
          <select className="select" value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })}>
            {countries.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t.admin.timezone || "Zona horaria"}</label>
          <select className="select" value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })}>
            {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div className="field full">
          <div style={{ marginTop: 4, padding: '14px 16px', background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28, fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.02em' }}>
              {(() => { try { return new Intl.DateTimeFormat("es-ES", { timeZone: draft.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now); } catch { return "—"; }})()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, textTransform: 'capitalize' }}>{localTime}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{draft.timezone} · {offset}</div>
            </div>
            <span className="pill outline" style={{ fontSize: 10 }}>HORA LOCAL</span>
          </div>
        </div>
      </div>
      <div className="add-bar">
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ color: 'var(--muted)', fontSize: 12.5, alignSelf: 'center' }}>{saved}</span>
        <button className="btn btn-primary" onClick={save}><Icon.check /> {t.common.save}</button>
      </div>
    </div>
  );
}

window.HotelAdmin = HotelAdmin;

function RolesAdmin({ state, setState, t, log }) {
  const perms = state.config.permissions || {};
  const [draft, setDraft] = React.useState(perms);
  const [saved, setSaved] = React.useState("");

  const roles = [
    { id: "admin",     label: t.admin.role?.admin     || "Administrador", color: "var(--danger, #c53030)", desc: "Acceso completo. No se puede limitar." },
    { id: "dept_head", label: t.admin.role?.dept_head || "Jefe de departamento", color: "var(--warn, #c05621)", desc: "Recibe alertas de caducidad." },
    { id: "employee",  label: t.admin.role?.employee  || "Empleado", color: "var(--muted, #718096)", desc: "Acceso básico." },
  ];

  const groups = [
    {
      label: "📄 Documentos",
      items: [
        { key: "view",    label: "Ver documentos",                     desc: "Listar y abrir documentos de su(s) departamento(s)." },
        { key: "create",  label: "Subir / crear documentos",           desc: "Añadir nuevos documentos al sistema." },
        { key: "edit",    label: "Editar documentos",                  desc: "Modificar metadatos y subir nuevas versiones." },
        { key: "delete",  label: "Eliminar documentos",                desc: "Borrar permanentemente." },
        { key: "approve", label: "Aprobar y cambiar a 'Vigente'",      desc: "Validar y activar documentos." },
        { key: "allDepts",label: "Acceso a TODOS los departamentos",   desc: "Ver documentos fuera de los suyos." },
      ],
    },
    {
      label: "⚙ Administración",
      items: [
        { key: "adminPanel",       label: "Acceder al panel de administración", desc: "Pestaña 'Administración'." },
        { key: "manageUsers",      label: "Gestionar usuarios",                 desc: "Crear, editar y eliminar usuarios." },
        { key: "configTemplates",  label: "Configurar plantillas de correo",    desc: "Editar avisos automáticos." },
        { key: "viewLog",          label: "Ver el log del sistema",             desc: "Histórico de movimientos." },
      ],
    },
  ];

  const toggle = (roleId, key) => {
    if (roleId === "admin") return; // admin always full
    setDraft(d => ({ ...d, [roleId]: { ...d[roleId], [key]: !d[roleId][key] } }));
  };

  const save = () => {
    setState(s => ({ ...s, config: { ...s.config, permissions: draft } }));
    log("config_change", "Permisos de roles actualizados");
    setSaved(t.common.saved);
    setTimeout(() => setSaved(""), 2000);
  };

  const reset = () => {
    if (!confirm("¿Restablecer la matriz de permisos por defecto?")) return;
    const def = {
      admin:     { view:true, create:true, edit:true, delete:true, approve:true, manageUsers:true, viewLog:true, allDepts:true, configTemplates:true, adminPanel:true },
      dept_head: { view:true, create:true, edit:true, delete:false, approve:true, manageUsers:false, viewLog:true, allDepts:false, configTemplates:false, adminPanel:false },
      employee:  { view:true, create:false, edit:false, delete:false, approve:false, manageUsers:false, viewLog:false, allDepts:false, configTemplates:false, adminPanel:false },
    };
    setDraft(def);
  };

  return (
    <div>
      <h2>{t.admin.sections.roles || "Roles y permisos"}</h2>
      <p className="help-text">Define qué puede hacer cada rol en Docuhotel. Los administradores siempre tienen acceso completo.</p>

      <div className="roles-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 1fr) repeat(3, minmax(140px, 1fr))',
        gap: 0,
        border: '1px solid var(--line)',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 10,
      }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-soft)', padding: '14px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>Permiso</div>
        {roles.map(r => (
          <div key={r.id} style={{ background: 'var(--bg-soft)', padding: '14px 16px', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{r.desc}</div>
          </div>
        ))}

        {/* Groups */}
        {groups.map((g, gi) => (
          <React.Fragment key={g.label}>
            <div style={{ gridColumn: '1 / -1', padding: '12px 16px', fontSize: 12, fontWeight: 600, background: '#fafafa', borderBottom: '1px solid var(--line)', borderTop: gi === 0 ? 'none' : '2px solid var(--line)' }}>
              {g.label}
            </div>
            {g.items.map((it, ii) => (
              <React.Fragment key={it.key}>
                <div style={{ padding: '12px 16px', borderBottom: ii === g.items.length - 1 && gi === groups.length - 1 ? 'none' : '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{it.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{it.desc}</div>
                </div>
                {roles.map(r => {
                  const checked = !!draft[r.id]?.[it.key];
                  const locked = r.id === "admin";
                  return (
                    <button
                      key={r.id + it.key}
                      type="button"
                      onClick={() => toggle(r.id, it.key)}
                      disabled={locked}
                      style={{
                        padding: '12px 16px',
                        borderBottom: ii === g.items.length - 1 && gi === groups.length - 1 ? 'none' : '1px solid var(--line)',
                        borderLeft: '1px solid var(--line)',
                        background: checked ? (locked ? 'var(--bg-soft)' : 'rgba(34, 139, 87, 0.08)') : 'transparent',
                        cursor: locked ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18,
                        color: checked ? (locked ? 'var(--muted)' : 'var(--ok, #2f855a)') : 'var(--line-strong)',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!locked) e.currentTarget.style.background = checked ? 'rgba(34, 139, 87, 0.14)' : 'var(--bg-soft)'; }}
                      onMouseLeave={e => { if (!locked) e.currentTarget.style.background = checked ? 'rgba(34, 139, 87, 0.08)' : 'transparent'; }}
                      title={locked ? "Los administradores siempre tienen este permiso" : (checked ? "Revocar permiso" : "Conceder permiso")}
                    >
                      {checked ? "✓" : "—"}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="add-bar">
        <button className="btn btn-ghost" onClick={reset}>Restablecer por defecto</button>
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ color: 'var(--muted)', fontSize: 12.5, alignSelf: 'center' }}>{saved}</span>
        <button className="btn btn-primary" onClick={save}><Icon.check /> {t.common.save}</button>
      </div>
    </div>
  );
}
window.RolesAdmin = RolesAdmin;
window.AdminPage = AdminPage;
