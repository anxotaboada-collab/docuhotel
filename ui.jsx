// Docuhotel — shared icon set + small UI helpers
const Icon = {
  search: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  plus: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  edit: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>,
  trash: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  eye: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  download: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  warning: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
  close: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  filter: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z"/></svg>,
  doc: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
  lock: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  check: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  send: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
};

function Modal({ size = "md", title, onClose, children, footer }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={`modal size-${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status, t }) {
  if (!status) return null;
  const cls = status.key || "outline";
  const label = (t.statuses && t.statuses[status.key]) || status.label?.[t._lang] || status.label?.es || status.key;
  const customStyle = (status.color || status.bg) ? {
    background: status.bg || "transparent",
    color: status.color || "inherit",
    borderColor: status.color ? "transparent" : undefined,
  } : undefined;
  return <span className={`pill ${cls}`} style={customStyle}><span className="dot" />{label}</span>;
}

function ExpiryCell({ iso, t }) {
  if (!iso) return <span className="muted">∞ {t.documents?.noExpiry || "No caduca"}</span>;
  const days = window.DocuStore.daysUntil(iso);
  const date = new Date(iso).toLocaleDateString(t._lang === "es" ? "es-ES" : t._lang === "de" ? "de-DE" : "en-GB", { year: "numeric", month: "short", day: "2-digit" });
  let icon = null;
  if (days < 0) icon = <Icon.warning className="icon-danger" />;
  else if (days <= 30) icon = <Icon.warning className="icon-warn" />;
  return <span className="expiry">{icon}<span>{date}</span></span>;
}

function ToggleChips({ items, value, onChange, getLabel, multi = true, allowAll = false }) {
  const set = new Set(value || []);
  const toggle = (id) => {
    if (!multi) { onChange([id]); return; }
    if (id === "*") { onChange(set.has("*") ? [] : ["*"]); return; }
    const next = new Set(set);
    next.delete("*");
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };
  return (
    <div className="multi-select-box">
      {allowAll && (
        <button type="button" className={`toggle-chip ${set.has("*") ? "active" : ""}`} onClick={() => toggle("*")}>★ Todos</button>
      )}
      {items.map(it => (
        <button key={it.id} type="button"
          className={`toggle-chip ${set.has(it.id) ? "active" : ""}`}
          onClick={() => toggle(it.id)}>
          {getLabel(it)}
        </button>
      ))}
    </div>
  );
}

// Generate a QR PNG dataURL for given text using qrcode-generator lib (loaded globally).
function generateQrDataUrl(text, size = 320) {
  if (!window.qrcode) return null;
  const qr = window.qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const cell = Math.floor((size - 24) / count);
  const offset = Math.floor((size - cell * count) / 2);
  ctx.fillStyle = "#111";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
    }
  }
  return canvas.toDataURL("image/png");
}
window.generateQrDataUrl = generateQrDataUrl;

Object.assign(window, { Icon, Modal, StatusPill, ExpiryCell, ToggleChips });
