// Docuhotel — Cuestionarios en las solicitudes (plantillas + resultado).
// La página que rellena el destinatario es formulario.html (sin login, por token).
// Spec: { intro, blocks: [{ t, sub, q: [pregunta] }] }
// pregunta: { id, k: 'doc'|'equipo'|'dato', t, why:[norma, nota], prev, si:{idDato: valor},
//   dato: op[] · equipo: pre, dsi, dno · doc: f ('fecha'|'caducidad'), r (resultado), multi, noTxt }

(function () {
  const vis = (q, A) => !q.si || Object.entries(q.si).every(([k, v]) => (A[k] || {}).v === v);
  const files = (a) => (a && a.files) || [];
  function done(q, A) {
    const a = A[q.id] || {};
    if (q.k === "dato") return !!a.v;
    if (q.k === "equipo") return a.v === "si" ? (!q.dsi || files(a).length > 0 || !!a.noDoc) : a.v === "no" ? !!(a.txt && a.txt.trim()) : false;
    if (a.v === "no") return true;
    if (a.v === "si") return files(a).length > 0 && (!q.f || !!a.fecha) && (!q.r || !!a.res);
    return false;
  }
  function progress(spec, A) {
    const qs = (spec?.blocks || []).flatMap((b) => b.q.filter((q) => vis(q, A || {})));
    return { done: qs.filter((q) => done(q, A || {})).length, total: qs.length };
  }
  // Un request_item por cada punto que admite documentos: ahí cuelgan las subidas
  // (mismo almacenamiento y «Enviar a documentos» que una solicitud normal).
  function itemsFromSpec(reqId, spec) {
    return (spec.blocks || []).flatMap((b) => b.q.filter((q) => q.k === "doc" || (q.k === "equipo" && q.dsi)))
      .map((q) => ({ id: `${reqId}__${q.id}`, title: q.k === "equipo" ? q.dsi : q.t, comments: "", required: false, files: [] }));
  }
  const formUrl = (token) => `${location.origin}/formulario?t=${encodeURIComponent(token)}`;
  const qid = () => "q_" + Math.random().toString(36).slice(2, 8);
  window.DocuForm = { vis, done, progress, itemsFromSpec, formUrl, qid };
})();

const FORM_KIND = { doc: "Documento", equipo: "Equipo (¿sigue instalado?)", dato: "Pregunta con opciones" };

// ── Crear una solicitud a partir de una plantilla ────────────────────
function FormFromTemplateModal({ state, t, onCreate, onClose, onManage }) {
  const [tpls, setTpls] = React.useState(null);
  const [tplId, setTplId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [expires, setExpires] = React.useState(new Date(Date.now() + 86400000 * 45).toISOString().slice(0, 10));
  React.useEffect(() => { window.DocuApi.listTemplates().then((l) => { setTpls(l); if (l[0]) { setTplId(l[0].id); setTitle(l[0].name); } }); }, []);
  const tpl = (tpls || []).find((x) => x.id === tplId);
  const nPreg = tpl ? tpl.spec.blocks.reduce((n, b) => n + b.q.length, 0) : 0;
  const create = () => {
    if (!tpl || !title.trim()) return;
    const id = window.DocuStore.uid("req");
    const spec = JSON.parse(JSON.stringify(tpl.spec));
    onCreate({
      id, title: title.trim(), notes: "",
      recipientName: name.trim(), recipientEmail: email.trim(),
      items: window.DocuForm.itemsFromSpec(id, spec),
      expiresAt: new Date(expires + "T23:59:59").toISOString(),
      maxFileSizeMb: 25,
      shareToken: "req-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8),
      status: "open", savedAt: null, submittedAt: null,
      log: [{ ts: new Date().toISOString(), action: "create", details: "Desde plantilla: " + tpl.name }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      templateId: tpl.id, formSpec: spec, formAnswers: {},
    });
  };
  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: "var(--bg)", borderRadius: 12, padding: 22, width: "min(560px, 94vw)", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Solicitud con cuestionario</h2>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>El destinatario recibe un enlace sin contraseña y contesta bloque a bloque.</div>
        {tpls === null ? <div style={{ fontSize: 13 }}>Cargando plantillas…</div> : tpls.length === 0 ? (
          <div style={{ fontSize: 13 }}>Aún no hay plantillas. <button className="btn btn-sm" onClick={onManage}>Crear una</button></div>
        ) : (
          <div className="form-grid">
            <div className="field full">
              <label>Plantilla</label>
              <select className="input" value={tplId} onChange={(e) => { setTplId(e.target.value); const x = tpls.find((y) => y.id === e.target.value); if (x) setTitle(x.name); }}>
                {tpls.map((x) => <option key={x.id} value={x.id}>{x.name}{x.hotel_id ? "" : " · todos los hoteles"}</option>)}
              </select>
              {tpl && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>{tpl.spec.blocks.length} {tpl.spec.blocks.length === 1 ? "bloque" : "bloques"} · {nPreg} {nPreg === 1 ? "pregunta" : "preguntas"}{tpl.description ? " · " + tpl.description : ""}</div>}
            </div>
            <div className="field full"><label>Título (lo verá el destinatario)</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="field"><label>Destinatario</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre · cargo" /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>El enlace caduca el</label><input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onManage}>Gestionar plantillas</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>{t.common?.cancel || "Cancelar"}</button>
          <button className="btn btn-primary" disabled={!tpl || !title.trim()} onClick={create}><Icon.check /> Crear solicitud</button>
        </div>
      </div>
    </div>
  );
}

// ── Resultado de una solicitud con cuestionario ──────────────────────
function FormRequestView({ state, setState, t, lang, log, request, onSave, onCancel }) {
  const [req, setReq] = React.useState(request);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [expires, setExpires] = React.useState(request.expiresAt?.slice(0, 10));
  const [sendToDocs, setSendToDocs] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await window.DocuApi.requestFresh(request.id);
      if (fresh) {
        setReq(fresh);
        setState((s) => ({ ...s, requests: (s.requests || []).map((r) => (r.id === fresh.id ? fresh : r)) }));
      }
    } finally { setLoading(false); }
  }, [request.id]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const spec = req.formSpec, A = req.formAnswers || {};
  const F = window.DocuForm;
  const url = req.shareToken ? F.formUrl(req.shareToken) : "";
  const pr = F.progress(spec, A);
  const fileOf = (qid) => {
    const it = (req.items || []).find((i) => i.id === `${req.id}__${qid}`);
    return it ? it.files || [] : [];
  };
  const allQ = spec.blocks.flatMap((b, bi) => b.q.filter((q) => F.vis(q, A)).map((q) => ({ ...q, bi })));
  const cnt = {
    docs: allQ.filter((q) => q.k === "doc" && (A[q.id] || {}).v === "si").length,
    sinDoc: allQ.filter((q) => (q.k === "doc" && (A[q.id] || {}).v === "no") || (q.k === "equipo" && (A[q.id] || {}).noDoc)).length,
    cambiados: allQ.filter((q) => q.k === "equipo" && (A[q.id] || {}).v === "no").length,
    pend: allQ.filter((q) => !F.done(q, A)).length,
  };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : lang === "en" ? "en-GB" : "es-ES") : "—");
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} };
  const mail = () => {
    const subject = encodeURIComponent(req.title);
    const body = encodeURIComponent(`Hola ${(req.recipientName || "").split("·")[0].trim()},\n\nTe envío el cuestionario «${req.title}». Se contesta bloque a bloque y se guarda solo, así que puedes dejarlo y seguir otro día con el mismo enlace:\n\n${url}\n\nEl enlace funciona hasta el ${new Date(req.expiresAt).toLocaleDateString("es-ES")}.\n\nGracias.`);
    window.location.href = `mailto:${req.recipientEmail || ""}?subject=${subject}&body=${body}`;
  };
  const saveMeta = (patch) => {
    const next = { ...req, ...patch, updatedAt: new Date().toISOString() };
    setReq(next);
    setState((s) => ({ ...s, requests: (s.requests || []).map((r) => (r.id === next.id ? next : r)) }));
    log && log("request_update", next.title);
  };
  const openFile = async (f) => {
    const href = await window.DocuApi.signedUrl(f.key);
    if (href) window.open(href, "_blank", "noopener,noreferrer"); else alert("No se pudo abrir el archivo.");
  };
  const toDocs = async (f, title) => {
    setBusy(true);
    let key = f.key;
    try { key = (await window.DocuApi.copyToDocsPath(state.hotelId, f.key, f.name)) || f.key; } catch (e) { console.error(e); }
    setBusy(false);
    setSendToDocs({ name: f.name, size: f.size, mime: f.type || "application/pdf", key, title });
  };
  const respuesta = (q) => {
    const a = A[q.id] || {};
    if (q.k === "dato") return a.v ? <b>{a.v}</b> : null;
    if (q.k === "equipo") {
      if (a.v === "si") return <span style={{ color: "var(--ok)" }}>✓ Sigue igual{a.noDoc ? " · sin documento" : ""}</span>;
      if (a.v === "no") return <span style={{ color: "var(--warn)" }}>✎ Cambiado: {a.txt}</span>;
      return null;
    }
    if (a.v === "si") return <span style={{ color: "var(--ok)" }}>✓ Lo tiene{a.fecha ? " · " + (q.f === "caducidad" ? "caduca " : "") + new Date(a.fecha).toLocaleDateString("es-ES") : ""}{a.res ? " · " + a.res : ""}</span>;
    if (a.v === "no") return <span style={{ color: "var(--warn)" }}>✗ No lo tiene{a.txt ? " · " + a.txt : ""}</span>;
    return null;
  };

  return (
    <div className="form-request">
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm no-print" onClick={onCancel} style={{ marginBottom: 8 }}>← {t.common?.back || "Atrás"}</button>
          <h1 className="page-title">{req.title}</h1>
          <div className="page-sub">{req.recipientName ? "Para " + req.recipientName + " · " : ""}{req.submittedAt ? "Enviado el " + fmt(req.submittedAt) : req.savedAt ? "Último guardado " + fmt(req.savedAt) : "Sin empezar"}</div>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Actualizando…" : "↻ Actualizar"}</button>
          <button className="btn" onClick={() => window.print()}>🖨 Informe</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 24, marginTop: 12 }} className="form-request-grid">
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
            {[["Contestado", `${pr.done}/${pr.total}`, "var(--ink)"], ["Documentos", cnt.docs, "var(--ok)"], ["No los tiene", cnt.sinDoc, "var(--warn)"], ["Equipos cambiados", cnt.cambiados, "var(--warn)"]].map(([l, v, c]) => (
              <div key={l} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {spec.blocks.map((b, bi) => {
            const qs = b.q.filter((q) => F.vis(q, A));
            if (!qs.length) return null;
            const ok = qs.filter((q) => F.done(q, A)).length;
            return (
              <div key={bi} style={{ border: "1px solid var(--line)", borderRadius: 10, marginBottom: 12, overflow: "hidden", breakInside: "avoid" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--bg-soft)" }}>
                  <b style={{ fontSize: 14 }}>{bi + 1}. {b.t}</b><div style={{ flex: 1 }} />
                  <span className="pill" style={{ background: ok === qs.length ? "var(--ok-bg)" : "var(--bg)", color: ok === qs.length ? "var(--ok)" : "var(--muted)" }}>{ok}/{qs.length}</span>
                </div>
                {qs.map((q, i) => {
                  const fs = fileOf(q.id);
                  return (
                    <div key={q.id} style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", fontSize: 13 }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, minWidth: 20, paddingTop: 1 }}>{String(i + 1).padStart(2, "0")}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{q.t}</div>
                          {q.why && q.why[0] && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{q.why.join(" · ")}</div>}
                          {q.prev && <div style={{ fontSize: 11.5, color: "#1E3A8A" }}>ℹ {q.prev}</div>}
                          <div style={{ marginTop: 4 }}>{respuesta(q) || <span style={{ color: "var(--muted)" }}>Pendiente</span>}</div>
                          {fs.map((f) => (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "5px 9px", background: "var(--bg-soft)", borderRadius: 6, fontSize: 12 }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {f.name} <span style={{ color: "var(--muted)" }}>· {Math.max(1, Math.round((f.size || 0) / 1024))} KB</span></span>
                              <button className="btn btn-sm btn-ghost no-print" onClick={() => openFile(f)}>👁 Ver</button>
                              <button className="btn btn-sm no-print" disabled={busy} onClick={() => toDocs(f, q.k === "equipo" ? q.dsi : q.t)}>➕ {t.requests?.sendToDocs || "Enviar a documentos"}</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="no-print" style={{ borderLeft: "1px solid var(--line)", paddingLeft: 24 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600 }}>{t.requests?.shareTitle || "Enviar al destinatario"}</h3>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 0, lineHeight: 1.5 }}>Enlace sin contraseña. Se guarda solo y puede seguir otro día.</p>
          {url ? (
            <>
              <div style={{ padding: 12, background: "var(--ok-bg)", borderRadius: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ok)", fontWeight: 600, marginBottom: 6 }}>● {t.requests?.linkActive || "Enlace activo"}</div>
                <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} style={{ fontSize: 10.5, fontFamily: "monospace", padding: "6px 8px" }} />
              </div>
              <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                <button className="btn btn-sm" onClick={copy}>{copied ? "✓ Copiado" : "Copiar enlace"}</button>
                <a className="btn btn-sm" href={url} target="_blank" rel="noopener">👁 Abrir el formulario</a>
                {req.recipientEmail && <button className="btn btn-sm" onClick={mail}>✉ {t.requests?.sendByEmail || "Enviar por email"}</button>}
                {!req.submittedAt && <button className="btn btn-sm btn-ghost" onClick={() => confirm("¿Revocar el enlace? Dejará de funcionar.") && saveMeta({ shareToken: "" })}>{t.requests?.revoke || "Revocar"}</button>}
              </div>
            </>
          ) : (
            !req.submittedAt && <button className="btn" onClick={() => saveMeta({ shareToken: "req-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8) })}>{t.requests?.generateLink || "Generar enlace"}</button>
          )}
          {!req.submittedAt && (
            <div className="field" style={{ marginTop: 16 }}>
              <label>El enlace caduca el</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
                <button className="btn btn-sm" disabled={expires === req.expiresAt?.slice(0, 10)} onClick={() => saveMeta({ expiresAt: new Date(expires + "T23:59:59").toISOString() })}>{t.common?.save || "Guardar"}</button>
              </div>
            </div>
          )}
          {req.log?.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>{t.requests?.activityLog || "Historial"}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, maxHeight: 260, overflowY: "auto" }}>
                {[...req.log].reverse().map((e, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}><span style={{ color: "var(--muted)" }}>{fmt(e.ts)}</span> · {e.action}: {e.details}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@media print{.no-print,.topbar,.tabs,header,nav{display:none!important}.form-request-grid{display:block!important}}`}</style>

      {busy && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}><div style={{ background: "var(--bg)", padding: "14px 22px", borderRadius: 10 }}>Preparando documento…</div></div>}
      {sendToDocs && window.DocumentForm && (
        <window.DocumentForm state={state} t={t} lang={lang} doc={null}
          initialFile={{ name: sendToDocs.name, size: sendToDocs.size, mime: sendToDocs.mime, key: sendToDocs.key, dataUrl: null }}
          initialTitle={sendToDocs.title}
          onSave={(newDoc) => { setState((s) => ({ ...s, documents: [newDoc, ...s.documents] })); log && log("doc_create", newDoc.title); setSendToDocs(null); alert(t.requests?.sentToDocsOk || "Documento añadido a la sección Documentos."); }}
          onClose={() => setSendToDocs(null)} />
      )}
    </div>
  );
}

// ── Plantillas: lista y editor ───────────────────────────────────────
function FormTemplatesPage({ state, t, onBack }) {
  const [tpls, setTpls] = React.useState(null);
  const [edit, setEdit] = React.useState(null);
  const load = () => window.DocuApi.listTemplates().then(setTpls);
  React.useEffect(() => { load(); }, []);
  if (edit) return <FormTemplateEditor state={state} t={t} tpl={edit} onDone={() => { setEdit(null); load(); }} />;
  const nuevo = () => setEdit({ name: "", description: "", hotel_id: null, spec: { intro: "Responde bloque a bloque: en cada punto sube el documento o marca que no lo tienes. Se guarda solo: puedes cerrar y seguir otro día con el mismo enlace.", blocks: [{ t: "", sub: "", q: [] }] } });
  const duplicar = (x) => setEdit({ name: x.name + " (copia)", description: x.description, hotel_id: x.hotel_id, spec: JSON.parse(JSON.stringify(x.spec)) });
  const borrar = async (x) => {
    if (!confirm(`¿Borrar la plantilla «${x.name}»? Las solicitudes ya creadas con ella no cambian.`)) return;
    try { await window.DocuApi.deleteTemplate(x.id); load(); } catch (e) { alert("No se pudo borrar: " + e.message); }
  };
  const preview = (spec) => { try { localStorage.setItem("dh_form_preview", JSON.stringify(spec)); } catch {} window.open("/formulario?preview=1", "_blank"); };
  const hotelName = (id) => (state.hotels || []).find((h) => h.id === id)?.name || "este hotel";
  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>← {t.common?.back || "Atrás"}</button>
          <h1 className="page-title">Plantillas de cuestionario</h1>
          <div className="page-sub">Cuestionarios por bloques que se envían con un enlace. Al crear una solicitud se copia la plantilla: cambiarla después no altera lo ya enviado.</div>
        </div>
        <button className="btn btn-primary" onClick={nuevo}><Icon.plus /> Nueva plantilla</button>
      </div>
      {tpls === null ? <div>Cargando…</div> : tpls.length === 0 ? <div className="empty-state" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Aún no hay plantillas.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {tpls.map((x) => {
            const n = x.spec.blocks.reduce((a, b) => a + b.q.length, 0);
            return (
              <div key={x.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{x.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{x.spec.blocks.length} {x.spec.blocks.length === 1 ? "bloque" : "bloques"} · {n} {n === 1 ? "pregunta" : "preguntas"} · {x.hotel_id ? "solo " + hotelName(x.hotel_id) : "todos los hoteles"}{x.description ? " · " + x.description : ""}</div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => preview(x.spec)}>👁 Vista previa</button>
                <button className="btn btn-sm" onClick={() => duplicar(x)}>Duplicar</button>
                <button className="btn btn-sm" onClick={() => setEdit(x)}>Editar</button>
                <button className="icon-btn" onClick={() => borrar(x)}><Icon.trash /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormTemplateEditor({ state, t, tpl, onDone }) {
  const [name, setName] = React.useState(tpl.name || "");
  const [description, setDescription] = React.useState(tpl.description || "");
  const [scope, setScope] = React.useState(tpl.hotel_id ? "hotel" : "all");
  const [spec, setSpec] = React.useState(() => JSON.parse(JSON.stringify(tpl.spec)));
  const [open, setOpen] = React.useState(null); // id de la pregunta abierta
  const [saving, setSaving] = React.useState(false);
  const upd = (fn) => setSpec((s) => { const c = JSON.parse(JSON.stringify(s)); fn(c); return c; });
  const mover = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const datos = spec.blocks.flatMap((b) => b.q.filter((q) => q.k === "dato"));
  const addQ = (bi) => { const id = window.DocuForm.qid(); upd((c) => c.blocks[bi].q.push({ id, k: "doc", t: "", why: [] })); setOpen(id); };
  const save = async () => {
    const errs = [];
    if (!name.trim()) errs.push("Ponle un nombre a la plantilla.");
    spec.blocks.forEach((b, bi) => {
      if (!b.t.trim()) errs.push(`El bloque ${bi + 1} no tiene título.`);
      b.q.forEach((q, qi) => {
        if (!q.t.trim()) errs.push(`Bloque ${bi + 1}, pregunta ${qi + 1}: falta el texto.`);
        if (q.k === "dato" && (q.op || []).filter(Boolean).length < 2) errs.push(`Bloque ${bi + 1}, pregunta ${qi + 1}: pon al menos dos opciones.`);
      });
    });
    if (!spec.blocks.some((b) => b.q.length)) errs.push("Añade al menos una pregunta.");
    if (errs.length) { alert(errs.join("\n")); return; }
    const clean = JSON.parse(JSON.stringify(spec));
    clean.blocks.forEach((b) => b.q.forEach((q) => {
      q.why = (q.why || []).map((w) => (w || "").trim()).filter(Boolean);
      if (q.k === "dato") q.op = q.op.map((o) => o.trim()).filter(Boolean);
      Object.keys(q).forEach((k) => (q[k] === "" || q[k] === false || q[k] == null) && delete q[k]);
    }));
    setSaving(true);
    try { await window.DocuApi.saveTemplate({ id: tpl.id, name: name.trim(), description: description.trim(), hotel_id: scope === "hotel" ? (tpl.hotel_id || state.hotelId) : null, spec: clean }); onDone(); }
    catch (e) { alert("No se pudo guardar: " + e.message); }
    setSaving(false);
  };
  const preview = () => { try { localStorage.setItem("dh_form_preview", JSON.stringify(spec)); } catch {} window.open("/formulario?preview=1", "_blank"); };
  const lbl = { fontSize: 11.5, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 };

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={onDone} style={{ marginBottom: 8 }}>← {t.common?.back || "Atrás"}</button>
          <h1 className="page-title">{tpl.id ? "Editar plantilla" : "Nueva plantilla"}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={preview}>👁 Vista previa</button>
          <button className="btn btn-ghost" onClick={onDone}>{t.common?.cancel || "Cancelar"}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}><Icon.check /> {saving ? "Guardando…" : (t.common?.save || "Guardar")}</button>
        </div>
      </div>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <div className="field"><label>Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Auditoría legal · …" /></div>
        <div className="field"><label>Disponible en</label>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}><option value="all">Todos los hoteles</option><option value="hotel">Solo este hotel</option></select></div>
        <div className="field full"><label>Descripción (solo la ves tú)</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field full"><label>Texto de bienvenida (lo lee el destinatario arriba del todo)</label><textarea className="textarea" rows={3} value={spec.intro || ""} onChange={(e) => { const v = e.target.value; upd((c) => (c.intro = v)); }} /></div>
      </div>

      {spec.blocks.map((b, bi) => (
        <div key={bi} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b style={{ fontSize: 13, color: "var(--muted)", minWidth: 22 }}>{bi + 1}.</b>
            <input className="input" style={{ flex: 1, fontWeight: 600 }} value={b.t} placeholder="Título del bloque (p. ej. Electricidad)" onChange={(e) => { const v = e.target.value; upd((c) => (c.blocks[bi].t = v)); }} />
            <button className="icon-btn" title="Subir bloque" onClick={() => upd((c) => mover(c.blocks, bi, -1))} disabled={bi === 0}>↑</button>
            <button className="icon-btn" title="Bajar bloque" onClick={() => upd((c) => mover(c.blocks, bi, 1))} disabled={bi === spec.blocks.length - 1}>↓</button>
            <button className="icon-btn" title="Borrar bloque" onClick={() => confirm("¿Borrar el bloque y sus preguntas?") && upd((c) => c.blocks.splice(bi, 1))}><Icon.trash /></button>
          </div>
          <input className="input" style={{ marginTop: 6, fontSize: 12.5 }} value={b.sub || ""} placeholder="Subtítulo (opcional)" onChange={(e) => { const v = e.target.value; upd((c) => (c.blocks[bi].sub = v)); }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {b.q.map((q, qi) => {
              const isOpen = open === q.id;
              const set = (k, v) => upd((c) => (c.blocks[bi].q[qi][k] = v));
              const cond = q.si ? Object.entries(q.si)[0] : null;
              return (
                <div key={q.id} style={{ border: "1px solid var(--line)", borderRadius: 8, background: isOpen ? "var(--bg)" : "var(--bg-soft)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : q.id)}>
                    <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, minWidth: 20 }}>{String(qi + 1).padStart(2, "0")}</span>
                    <span className="pill" style={{ background: "var(--bg)", fontSize: 10.5 }}>{FORM_KIND[q.k]}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.t || <i style={{ color: "var(--muted)" }}>sin texto</i>}{cond ? <span style={{ color: "var(--muted)" }}> · si «{cond[1]}»</span> : null}</span>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); upd((c) => mover(c.blocks[bi].q, qi, -1)); }} disabled={qi === 0}>↑</button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); upd((c) => mover(c.blocks[bi].q, qi, 1)); }} disabled={qi === b.q.length - 1}>↓</button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); confirm("¿Borrar la pregunta?") && upd((c) => c.blocks[bi].q.splice(qi, 1)); }}><Icon.trash /></button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "4px 12px 12px 38px", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <label style={{ ...lbl, width: 220 }}>Tipo
                          <select className="input" value={q.k} onChange={(e) => set("k", e.target.value)}>{Object.entries(FORM_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                        <label style={{ ...lbl, flex: 1, minWidth: 220 }}>{q.k === "equipo" ? "Equipo (lo que sabemos que hay)" : "Pregunta o documento"}
                          <input className="input" value={q.t} onChange={(e) => set("t", e.target.value)} /></label>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <label style={{ ...lbl, flex: 1, minWidth: 200 }}>Norma (sale resaltada)<input className="input" value={(q.why || [])[0] || ""} onChange={(e) => { const v = e.target.value; upd((c) => { const w = c.blocks[bi].q[qi].why || []; w[0] = v; c.blocks[bi].q[qi].why = w; }); }} placeholder="DL 96/2017 art. 16" /></label>
                        <label style={{ ...lbl, flex: 1, minWidth: 200 }}>Nota (periodicidad, plazo…)<input className="input" value={(q.why || [])[1] || ""} onChange={(e) => { const v = e.target.value; upd((c) => { const w = c.blocks[bi].q[qi].why || []; w[0] = w[0] || ""; w[1] = v; c.blocks[bi].q[qi].why = w; }); }} placeholder="cada 2 años" /></label>
                      </div>
                      <label style={lbl}>Lo que ya sabemos (sale en azul para que solo confirme)<input className="input" value={q.prev || ""} onChange={(e) => set("prev", e.target.value)} placeholder="NetZero: 3 calderas de 570 kW…" /></label>
                      {q.k === "dato" && <label style={lbl}>Opciones (una por línea)<textarea className="textarea" rows={3} value={(q.op || []).join("\n")} onChange={(e) => set("op", e.target.value.split("\n"))} /></label>}
                      {q.k === "equipo" && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <label style={{ ...lbl, flex: 1, minWidth: 180 }}>Pregunta<input className="input" value={q.pre || ""} onChange={(e) => set("pre", e.target.value)} placeholder="¿Sigue instalado?" /></label>
                          <label style={{ ...lbl, flex: 1, minWidth: 180 }}>Si dice «Sí», pedir este documento (opcional)<input className="input" value={q.dsi || ""} onChange={(e) => set("dsi", e.target.value)} /></label>
                          <label style={{ ...lbl, flex: 1, minWidth: 180 }}>Si dice «No», qué le preguntamos<input className="input" value={q.dno || ""} onChange={(e) => set("dno", e.target.value)} placeholder="¿Por cuál se ha sustituido? Marca, modelo, potencia y fecha" /></label>
                        </div>
                      )}
                      {q.k === "doc" && (
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                          <label style={{ ...lbl, width: 190 }}>Fecha que pedimos
                            <select className="input" value={q.f || ""} onChange={(e) => set("f", e.target.value)}><option value="">Ninguna</option><option value="fecha">Fecha del documento</option><option value="caducidad">Fecha de caducidad</option></select></label>
                          <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!q.r} onChange={(e) => set("r", e.target.checked ? 1 : 0)} /> Pedir el resultado (favorable, defectos…)</label>
                          <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={!!q.multi} onChange={(e) => set("multi", e.target.checked ? 1 : 0)} /> Varios archivos</label>
                          <label style={{ ...lbl, flex: 1, minWidth: 180 }}>Texto del botón «no»<input className="input" value={q.noTxt || ""} onChange={(e) => set("noTxt", e.target.value)} placeholder="No lo tengo" /></label>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <label style={{ ...lbl, flex: 1, minWidth: 220 }}>Mostrar solo si…
                          <select className="input" value={cond ? cond[0] : ""} onChange={(e) => { const v = e.target.value; const d = datos.find((x) => x.id === v); set("si", v && d ? { [v]: (d.op || [])[0] } : null); }}>
                            <option value="">Siempre</option>
                            {datos.filter((d) => d.id !== q.id).map((d) => <option key={d.id} value={d.id}>{d.t || d.id}</option>)}
                          </select></label>
                        {cond && <label style={{ ...lbl, width: 200 }}>…la respuesta es
                          <select className="input" value={cond[1]} onChange={(e) => set("si", { [cond[0]]: e.target.value })}>{((datos.find((d) => d.id === cond[0]) || {}).op || []).filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select></label>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => addQ(bi)}><Icon.plus /> Añadir pregunta</button>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 14 }} onClick={() => upd((c) => c.blocks.push({ t: "", sub: "", q: [] }))}><Icon.plus /> Añadir bloque</button>
    </div>
  );
}

window.FormFromTemplateModal = FormFromTemplateModal;
window.FormRequestView = FormRequestView;
window.FormTemplatesPage = FormTemplatesPage;
