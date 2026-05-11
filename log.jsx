// Docuhotel — Activity log (immutable view)

function LogPage({ state, t, lang }) {
  const [filterAction, setFilterAction] = React.useState("");
  const userById = Object.fromEntries(state.users.map(u => [u.id, u]));

  const sorted = [...state.log].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const filtered = filterAction ? sorted.filter(l => l.action === filterAction) : sorted;
  const fmt = (iso) => new Date(iso).toLocaleString(lang === "es" ? "es-ES" : lang === "de" ? "de-DE" : "en-GB");
  const userLabel = (id) => {
    if (id && id.startsWith("audit:")) return `🔍 ${id.slice(6)} (${t.log?.auditor || "auditor externo"})`;
    return userById[id]?.name || id;
  };

  const exportCsv = () => {
    const header = ["timestamp", "user", "action", "details"];
    const rows = filtered.map(l => [
      new Date(l.ts).toISOString(),
      userById[l.userId]?.name || (l.userId?.startsWith("audit:") ? l.userId.slice(6) + " (auditor externo)" : l.userId),
      t.log.actions[l.action] || l.action,
      (l.details || "").replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "docuhotel-log.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const allActions = [...new Set(state.log.map(l => l.action))];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t.log.title}</h1>
          <div className="page-sub">{t.log.subtitle}</div>
        </div>
      </div>

      <div className="log-immutable-banner">
        <Icon.lock /> {t.log.subtitle}
      </div>

      <div className="filter-row">
        <select className="select" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">{t.log.filterByAction}: {t.common.all}</option>
          {allActions.map(a => <option key={a} value={a}>{t.log.actions[a] || a}</option>)}
        </select>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={exportCsv}><Icon.download /> {t.log.exportCsv}</button>
      </div>

      <div className="table-wrap">
        <table className="table log-table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>{t.log.timestamp}</th>
              <th style={{ width: 180 }}>{t.log.user}</th>
              <th style={{ width: 220 }}>{t.log.action}</th>
              <th>{t.log.details}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={4}><div className="empty-state">{t.log.empty}</div></td></tr>}
            {filtered.map(l => (
              <tr key={l.id}>
                <td className="ts">{fmt(l.ts)}</td>
                <td>{userLabel(l.userId)}</td>
                <td className="action">{t.log.actions[l.action] || l.action}</td>
                <td>{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.LogPage = LogPage;
