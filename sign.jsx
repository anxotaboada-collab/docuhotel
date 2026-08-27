// Docuhotel — Firmas: enviar un documento del gestor a firmar electrónicamente.
//
// Dos vistas en este archivo:
//   · SignaturesPage — pestaña "Firmas" del hotel: crear envíos, seguir el estado,
//     recordar, anular, descargar el PDF firmado y exportar el rastro probatorio.
//   · SignView       — página pública del firmante (#/sign/<token>), sin login:
//     lee el PDF, verifica su código, firma a mano alzada y acepta la declaración.
//
// Todo pasa por la edge function `docu-sign` (las tablas sign_* no son accesibles
// desde el navegador: ahí viven los tokens de firma y los hashes de los OTP).
//
// Los textos viven aquí y no en i18n.jsx a propósito: el firmante es alguien de
// fuera del hotel que abre un enlace suelto, así que esta vista elige idioma por
// su navegador y necesita ser autosuficiente.

(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  /* ─────────────────────────────── API ─────────────────────────────── */

  async function callSign(op, payload, opts) {
    const cfg = window.DOCUHOTEL_CONFIG || {};
    let auth = cfg.supabaseAnonKey;
    if (!opts?.anon) {
      try {
        const sess = await window.DocuApi.getSession();
        if (sess?.access_token) auth = sess.access_token;
      } catch (_e) { /* sin sesión: seguimos con la anon key */ }
    }
    const res = await fetch(`${cfg.supabaseUrl}/functions/v1/docu-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ op, ...payload }),
    });
    let body = null;
    try { body = await res.json(); } catch (_e) { /* respuesta no JSON */ }
    if (!res.ok || !body || body.error) throw new Error(body?.error || `Error ${res.status}`);
    return body;
  }
  window.DocuSignApi = { call: callSign };

  /* ───────────────────────────── textos ───────────────────────────── */

  const T = {
    es: {
      tab: "Firmas", title: "Firmas electrónicas", newEnvelope: "Enviar a firmar",
      empty: "Todavía no has enviado ningún documento a firmar.",
      filters: { all: "Todos", sent: "En curso", completed: "Completados", cancelled: "Anulados" },
      status: { sent: "En curso", completed: "Firmado", cancelled: "Anulado", expired: "Caducado" },
      signerStatus: { pending: "Sin abrir", opened: "Abierto", read: "Leído", signed: "Firmado", declined: "Rechazado" },
      col: { doc: "Documento", signers: "Firmantes", status: "Estado", sent: "Enviado", expires: "Caduca", actions: "" },
      view: "Ver", remind: "Recordar", cancel: "Anular", signedPdf: "PDF firmado", origPdf: "PDF enviado",
      exportAudit: "Exportar rastro (JSON)", copyLink: "Copiar enlace", copied: "Enlace copiado",
      openMail: "Abrir en mi correo", qr: "QR",
      wizard: {
        title: "Enviar un documento a firmar",
        doc: "Documento a firmar", docHelp: "Solo documentos PDF ya subidos al gestor.",
        noDocs: "No hay documentos PDF en este hotel.",
        searchDoc: "Buscar documento…",
        signers: "Firmantes", addSigner: "Añadir firmante", fromUsers: "Añadir del hotel",
        name: "Nombre y apellidos", email: "Correo electrónico",
        message: "Mensaje para el firmante", messagePh: "Por ejemplo: por favor, lee y firma esta instrucción antes del viernes.",
        options: "Garantías y opciones",
        otp: "Pedir un código de un solo uso por email (recomendado)",
        otpHelp: "El firmante recibe un código de 6 dígitos en su correo y debe introducirlo antes de firmar. Es lo que prueba que controla ese buzón.",
        read: "Obligar a leer el documento hasta el final",
        readHelp: "Se registra cuántas páginas vio y cuánto tiempo estuvo. Sin llegar al final, el botón de firmar no se activa.",
        idNum: "Pedir DNI / NIE / pasaporte",
        kind: "Tipo de firma", kindDraw: "Manuscrita (dibujada)", kindTyped: "Nombre tecleado",
        order: "Orden", orderParallel: "Todos a la vez", orderSequential: "Uno detrás de otro",
        expires: "El enlace caduca en", days: "días",
        consent: "Declaración que acepta el firmante", consentEdit: "Ver / editar el texto legal",
        sendNow: "Enviar por email ahora", linksOnly: "Solo generar enlaces",
        linksOnlyHelp: "No se envía ningún correo: te damos el enlace de cada firmante para que lo mandes tú por tu correo de siempre, por WhatsApp o como quieras.",
        sending: "Enviando…",
      },
      created: { titleSent: "Enviado a firmar", titleLinks: "Enlaces listos", help: "Enlace personal de cada firmante:", done: "Hecho" },
      detail: {
        title: "Detalle del envío", doc: "Documento", file: "Archivo", hash: "SHA-256 del documento enviado",
        envelope: "Identificador del sobre", sentBy: "Enviado por", sentAt: "Enviado el", expires: "Caduca",
        signedHash: "SHA-256 del PDF firmado", tsa: "Sello de tiempo",
        chainOk: "Cadena de auditoría íntegra", chainBad: "⚠ La cadena de auditoría no cuadra",
        guarantees: "Garantías exigidas", trail: "Rastro de actividad",
        pages: "páginas vistas", secs: "s en pantalla", ip: "IP",
        confirmCancel: "¿Anular este envío? Los enlaces dejarán de funcionar.",
      },
      events: {
        created: "Sobre creado", invited: "Invitación enviada por correo", invite_failed: "Fallo al enviar el correo",
        link_generated: "Enlace generado para envío manual", reminded: "Recordatorio enviado",
        opened: "Documento abierto", read_completed: "Lectura completada",
        otp_sent: "Código enviado", otp_verified: "Código verificado", otp_failed: "Código incorrecto",
        signed: "Firmado", declined: "Firma rechazada", completed: "Sobre completado", cancelled: "Sobre anulado",
      },
    },
    en: {
      tab: "Signatures", title: "Electronic signatures", newEnvelope: "Send for signature",
      empty: "You haven't sent any document for signature yet.",
      filters: { all: "All", sent: "In progress", completed: "Completed", cancelled: "Cancelled" },
      status: { sent: "In progress", completed: "Signed", cancelled: "Cancelled", expired: "Expired" },
      signerStatus: { pending: "Not opened", opened: "Opened", read: "Read", signed: "Signed", declined: "Declined" },
      col: { doc: "Document", signers: "Signers", status: "Status", sent: "Sent", expires: "Expires", actions: "" },
      view: "View", remind: "Remind", cancel: "Cancel", signedPdf: "Signed PDF", origPdf: "Sent PDF",
      exportAudit: "Export trail (JSON)", copyLink: "Copy link", copied: "Link copied",
      openMail: "Open in my mail app", qr: "QR",
      wizard: {
        title: "Send a document for signature",
        doc: "Document", docHelp: "Only PDF documents already uploaded.",
        noDocs: "No PDF documents in this hotel.",
        searchDoc: "Search document…",
        signers: "Signers", addSigner: "Add signer", fromUsers: "Add from hotel",
        name: "Full name", email: "Email",
        message: "Message for the signer", messagePh: "E.g. please read and sign this instruction before Friday.",
        options: "Safeguards and options",
        otp: "Require a one-time code by email (recommended)",
        otpHelp: "The signer receives a 6-digit code and must enter it before signing. That is what proves they control the mailbox.",
        read: "Require reading the document to the end",
        readHelp: "Pages viewed and time on screen are recorded. Until the end is reached, the sign button stays disabled.",
        idNum: "Ask for ID number / passport",
        kind: "Signature type", kindDraw: "Handwritten (drawn)", kindTyped: "Typed name",
        order: "Order", orderParallel: "All at once", orderSequential: "One after another",
        expires: "Link expires in", days: "days",
        consent: "Declaration accepted by the signer", consentEdit: "View / edit the legal wording",
        sendNow: "Send by email now", linksOnly: "Only generate links",
        linksOnlyHelp: "No email is sent: you get each signer's link to send it yourself by your usual mail, WhatsApp or however you like.",
        sending: "Sending…",
      },
      created: { titleSent: "Sent for signature", titleLinks: "Links ready", help: "Personal link for each signer:", done: "Done" },
      detail: {
        title: "Envelope detail", doc: "Document", file: "File", hash: "SHA-256 of the sent document",
        envelope: "Envelope id", sentBy: "Sent by", sentAt: "Sent on", expires: "Expires",
        signedHash: "SHA-256 of the signed PDF", tsa: "Timestamp",
        chainOk: "Audit chain intact", chainBad: "⚠ The audit chain does not add up",
        guarantees: "Required safeguards", trail: "Activity trail",
        pages: "pages viewed", secs: "s on screen", ip: "IP",
        confirmCancel: "Cancel this envelope? The links will stop working.",
      },
      events: {
        created: "Envelope created", invited: "Invitation emailed", invite_failed: "Email failed",
        link_generated: "Link generated for manual sending", reminded: "Reminder sent",
        opened: "Document opened", read_completed: "Reading completed",
        otp_sent: "Code sent", otp_verified: "Code verified", otp_failed: "Wrong code",
        signed: "Signed", declined: "Declined", completed: "Envelope completed", cancelled: "Envelope cancelled",
      },
    },
    de: {
      tab: "Unterschriften", title: "Elektronische Unterschriften", newEnvelope: "Zur Unterschrift senden",
      empty: "Du hast noch kein Dokument zur Unterschrift gesendet.",
      filters: { all: "Alle", sent: "Laufend", completed: "Abgeschlossen", cancelled: "Storniert" },
      status: { sent: "Laufend", completed: "Unterschrieben", cancelled: "Storniert", expired: "Abgelaufen" },
      signerStatus: { pending: "Nicht geöffnet", opened: "Geöffnet", read: "Gelesen", signed: "Unterschrieben", declined: "Abgelehnt" },
      col: { doc: "Dokument", signers: "Unterzeichner", status: "Status", sent: "Gesendet", expires: "Läuft ab", actions: "" },
      view: "Ansehen", remind: "Erinnern", cancel: "Stornieren", signedPdf: "Unterschriebenes PDF", origPdf: "Gesendetes PDF",
      exportAudit: "Protokoll exportieren (JSON)", copyLink: "Link kopieren", copied: "Link kopiert",
      openMail: "In meinem Mailprogramm öffnen", qr: "QR",
      wizard: {
        title: "Ein Dokument zur Unterschrift senden",
        doc: "Dokument", docHelp: "Nur bereits hochgeladene PDF-Dokumente.",
        noDocs: "Keine PDF-Dokumente in diesem Hotel.",
        searchDoc: "Dokument suchen…",
        signers: "Unterzeichner", addSigner: "Unterzeichner hinzufügen", fromUsers: "Aus dem Hotel hinzufügen",
        name: "Vor- und Nachname", email: "E-Mail",
        message: "Nachricht an den Unterzeichner", messagePh: "Z. B. bitte lies und unterschreibe diese Anweisung bis Freitag.",
        options: "Garantien und Optionen",
        otp: "Einmalcode per E-Mail verlangen (empfohlen)",
        otpHelp: "Der Unterzeichner erhält einen 6-stelligen Code und muss ihn vor der Unterschrift eingeben. Das beweist, dass er dieses Postfach kontrolliert.",
        read: "Lesen bis zum Ende verlangen",
        readHelp: "Gesehene Seiten und Zeit am Bildschirm werden protokolliert. Vor dem Ende bleibt der Unterschreiben-Knopf gesperrt.",
        idNum: "Ausweis-/Passnummer verlangen",
        kind: "Art der Unterschrift", kindDraw: "Handschriftlich (gezeichnet)", kindTyped: "Getippter Name",
        order: "Reihenfolge", orderParallel: "Alle gleichzeitig", orderSequential: "Nacheinander",
        expires: "Link läuft ab in", days: "Tagen",
        consent: "Erklärung, die der Unterzeichner akzeptiert", consentEdit: "Rechtstext ansehen / bearbeiten",
        sendNow: "Jetzt per E-Mail senden", linksOnly: "Nur Links erzeugen",
        linksOnlyHelp: "Es wird keine E-Mail gesendet: Du bekommst den Link jedes Unterzeichners und verschickst ihn selbst.",
        sending: "Senden…",
      },
      created: { titleSent: "Zur Unterschrift gesendet", titleLinks: "Links bereit", help: "Persönlicher Link je Unterzeichner:", done: "Fertig" },
      detail: {
        title: "Detail des Umschlags", doc: "Dokument", file: "Datei", hash: "SHA-256 des gesendeten Dokuments",
        envelope: "Umschlag-ID", sentBy: "Gesendet von", sentAt: "Gesendet am", expires: "Läuft ab",
        signedHash: "SHA-256 des unterschriebenen PDF", tsa: "Zeitstempel",
        chainOk: "Prüfkette unversehrt", chainBad: "⚠ Die Prüfkette stimmt nicht",
        guarantees: "Verlangte Garantien", trail: "Aktivitätsprotokoll",
        pages: "Seiten gesehen", secs: "s am Bildschirm", ip: "IP",
        confirmCancel: "Diesen Umschlag stornieren? Die Links funktionieren dann nicht mehr.",
      },
      events: {
        created: "Umschlag erstellt", invited: "Einladung per E-Mail", invite_failed: "E-Mail fehlgeschlagen",
        link_generated: "Link für manuellen Versand erzeugt", reminded: "Erinnerung gesendet",
        opened: "Dokument geöffnet", read_completed: "Lesen abgeschlossen",
        otp_sent: "Code gesendet", otp_verified: "Code bestätigt", otp_failed: "Falscher Code",
        signed: "Unterschrieben", declined: "Abgelehnt", completed: "Umschlag abgeschlossen", cancelled: "Umschlag storniert",
      },
    },
  };
  const tt = (lang) => T[lang] || T.es;

  // Mismo literal que usa la edge function por defecto. Se muestra en el
  // formulario para que quien envía vea exactamente qué está aceptando el otro.
  const consentDefault = (title) =>
    `Declaro que he recibido, abierto y leído íntegramente el documento «${title}», que comprendo su contenido y que lo firmo ` +
    `electrónicamente por mi propia voluntad. Acepto que esta firma electrónica —realizada mediante enlace personal, código de un solo ` +
    `uso enviado a mi correo y firma manuscrita digitalizada— tenga la misma validez y produzca los mismos efectos que mi firma ` +
    `manuscrita en papel, conforme al artículo 25 del Reglamento (UE) 910/2014 (eIDAS) y a la Ley 6/2020. Acepto asimismo que queden ` +
    `registrados como prueba la fecha y hora, mi dirección IP, el dispositivo utilizado y el rastro completo de mi actividad sobre el documento.`;

  const fmtDT = (iso, lang) => iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : lang === "en" ? "en-GB" : "es-ES",
        { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const fmtD = (iso, lang) => iso
    ? new Date(iso).toLocaleDateString(lang === "de" ? "de-DE" : lang === "en" ? "en-GB" : "es-ES",
        { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch (_e) { return false; } };

  /* ──────────────────────── lienzo de firma ──────────────────────── */

  function SignaturePad({ onChange }) {
    const ref = useRef(null);
    const drawing = useRef(false);
    const dirty = useRef(false);

    useEffect(() => {
      const canvas = ref.current;
      if (!canvas) return;
      // El lienzo se dibuja a resolución de dispositivo para que la firma no
      // salga pixelada en el PDF, pero se maneja en coordenadas CSS.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";

      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        const p = e.touches ? e.touches[0] : e;
        return { x: p.clientX - r.left, y: p.clientY - r.top };
      };
      const start = (e) => { e.preventDefault(); drawing.current = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
      const move = (e) => {
        if (!drawing.current) return;
        e.preventDefault();
        const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke();
        if (!dirty.current) { dirty.current = true; }
      };
      const end = () => {
        if (!drawing.current) return;
        drawing.current = false;
        if (dirty.current) onChange(canvas.toDataURL("image/png"));
      };
      canvas.addEventListener("mousedown", start);
      canvas.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);
      canvas.addEventListener("touchstart", start, { passive: false });
      canvas.addEventListener("touchmove", move, { passive: false });
      canvas.addEventListener("touchend", end);
      return () => {
        canvas.removeEventListener("mousedown", start);
        canvas.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", end);
        canvas.removeEventListener("touchstart", start);
        canvas.removeEventListener("touchmove", move);
        canvas.removeEventListener("touchend", end);
      };
    }, [onChange]);

    const clear = () => {
      const canvas = ref.current;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty.current = false;
      onChange(null);
    };

    return (
      <div className="sign-pad-wrap">
        <canvas ref={ref} className="sign-pad" />
        <div className="sign-pad-foot">
          <span className="sign-pad-hint">✍ Firma aquí con el dedo o el ratón</span>
          <button type="button" className="btn btn-sm" onClick={clear}>Limpiar</button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════ PANEL DEL HOTEL ═══════════════════════ */

  function SignaturesPage({ state, t, lang, log, pushToast }) {
    const s = tt(lang);
    const [envelopes, setEnvelopes] = useState(null);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("all");
    const [wizard, setWizard] = useState(false);
    const [detail, setDetail] = useState(null);
    const [created, setCreated] = useState(null);

    const reload = useCallback(async () => {
      try {
        setError("");
        const r = await callSign("list", { hotelId: state.hotelId });
        setEnvelopes(r.envelopes || []);
      } catch (e) { setError(e.message); setEnvelopes([]); }
    }, [state.hotelId]);

    useEffect(() => { reload(); }, [reload]);

    const rows = (envelopes || []).filter(e => filter === "all" || e.status === filter);

    const remind = async (env, signerId) => {
      try {
        const r = await callSign("remind", { envelopeId: env.id, signerId });
        pushToast(`✓ ${r.sent} recordatorio(s) enviados`);
        reload();
      } catch (e) { pushToast("⚠ " + e.message); }
    };
    const cancel = async (env) => {
      if (!confirm(s.detail.confirmCancel)) return;
      try { await callSign("cancel", { envelopeId: env.id }); pushToast("✓ " + s.status.cancelled); log && log("sign_cancel", env.title); reload(); }
      catch (e) { pushToast("⚠ " + e.message); }
    };
    const openFile = async (env, which) => {
      try {
        const r = await callSign("file", { envelopeId: env.id, which });
        if (r.url) window.open(r.url, "_blank", "noopener");
      } catch (e) { pushToast("⚠ " + e.message); }
    };

    return (
      <div>
        <div className="page-head">
          <div>
            <h1 className="page-title">✍ {s.title}</h1>
            <div className="page-sub">{(envelopes || []).length} {t.common.total.toLowerCase()}</div>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setWizard(true)}><Icon.send /> {s.newEnvelope}</button>
          </div>
        </div>

        <div className="sign-filters">
          {["all", "sent", "completed", "cancelled"].map(k => (
            <button key={k} className={`toggle-chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{s.filters[k]}</button>
          ))}
        </div>

        {error && <div className="empty-state" style={{ color: "var(--danger, #b91c1c)" }}>{error}</div>}
        {envelopes === null && !error && <div className="empty-state">{t.common.loading || "Cargando…"}</div>}
        {envelopes && rows.length === 0 && !error && <div className="empty-state">{s.empty}</div>}

        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{s.col.doc}</th>
                  <th style={{ width: 240 }}>{s.col.signers}</th>
                  <th style={{ width: 120 }}>{s.col.status}</th>
                  <th style={{ width: 130 }}>{s.col.sent}</th>
                  <th style={{ width: 210 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(env => {
                  const done = env.signers.filter(x => x.status === "signed").length;
                  const declined = env.signers.some(x => x.status === "declined");
                  return (
                    <tr key={env.id}>
                      <td>
                        <div className="doc-title"><Icon.doc style={{ color: "var(--muted)", flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{env.title}</div>
                            <div className="doc-meta">{env.file_name} · {env.page_count} p. · {env.require_otp ? "OTP" : "sin OTP"}{env.require_read ? " · lectura" : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="sign-signers-cell">
                          <strong>{done}/{env.signers.length}</strong>
                          <span className="sign-dots">
                            {env.signers.map(x => (
                              <span key={x.id} className={`sign-dot ${x.status}`} title={`${x.name} — ${s.signerStatus[x.status] || x.status}`} />
                            ))}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`pill sign-${declined && env.status === "sent" ? "declined" : env.status}`}>
                          <span className="dot" />{declined && env.status === "sent" ? s.signerStatus.declined : s.status[env.status]}
                        </span>
                      </td>
                      <td>{fmtD(env.created_at, lang)}</td>
                      <td className="row-actions">
                        <button className="btn btn-sm" onClick={() => setDetail(env.id)}><Icon.eye /> {s.view}</button>
                        {env.status === "sent" && <button className="btn btn-sm" onClick={() => remind(env)}>{s.remind}</button>}
                        {env.status === "completed" && <button className="btn btn-sm" onClick={() => openFile(env, "signed")}><Icon.download /> PDF</button>}
                        {env.status !== "completed" && <button className="btn btn-sm" onClick={() => cancel(env)}>{s.cancel}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {wizard && (
          <NewEnvelope
            state={state} t={t} lang={lang} s={s}
            onClose={() => setWizard(false)}
            onCreated={(res) => { setWizard(false); setCreated(res); log && log("sign_send", res.title); reload(); }}
          />
        )}
        {created && <CreatedLinks res={created} s={s} onClose={() => setCreated(null)} />}
        {detail && (
          <EnvelopeDetail
            envelopeId={detail} s={s} lang={lang}
            onClose={() => { setDetail(null); reload(); }}
            onRemind={remind} onCancel={cancel} onFile={openFile} pushToast={pushToast}
          />
        )}
      </div>
    );
  }

  /* ──────────────────── formulario de nuevo envío ──────────────────── */

  function NewEnvelope({ state, t, lang, s, onClose, onCreated }) {
    const pdfDocs = useMemo(
      () => (state.documents || []).filter(d => d.file?.key && /\.pdf$/i.test(d.file.name || "") ),
      [state.documents]);
    const [q, setQ] = useState("");
    const [docId, setDocId] = useState("");
    const [signers, setSigners] = useState([{ name: "", email: "" }]);
    const [message, setMessage] = useState("");
    const [requireOtp, setRequireOtp] = useState(true);
    const [requireRead, setRequireRead] = useState(true);
    const [requireId, setRequireId] = useState(false);
    const [signatureKind, setKind] = useState("draw");
    const [mode, setMode] = useState("parallel");
    const [expiresDays, setDays] = useState(30);
    const [consentOpen, setConsentOpen] = useState(false);
    const [consentText, setConsent] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const doc = pdfDocs.find(d => d.id === docId);
    const shown = q
      ? pdfDocs.filter(d => (d.title || "").toLowerCase().includes(q.toLowerCase()))
      : pdfDocs;
    const effConsent = consentText || consentDefault(doc?.title || "…");

    const setSigner = (i, patch) => setSigners(arr => arr.map((x, n) => n === i ? { ...x, ...patch } : x));
    const addFromHotel = (u) => setSigners(arr => {
      if (arr.some(x => (x.email || "").toLowerCase() === (u.email || "").toLowerCase())) return arr;
      const clean = arr.filter(x => x.name || x.email);
      return [...clean, { name: u.name, email: u.email }];
    });

    const submit = async (send) => {
      setErr(""); setBusy(true);
      try {
        const list = signers.filter(x => x.name.trim() && x.email.trim());
        if (!doc) throw new Error(s.wizard.doc + ": —");
        if (!list.length) throw new Error(s.wizard.addSigner);
        const res = await callSign("create", {
          hotelId: state.hotelId, documentId: doc.id, title: doc.title,
          signers: list, message, requireOtp, requireRead, requireId,
          signatureKind, mode, expiresDays: Number(expiresDays) || 30,
          consentText: consentText || undefined,
          send,
        });
        onCreated({ ...res, title: doc.title, sent: send });
      } catch (e) { setErr(e.message); setBusy(false); }
    };

    const people = (state.users || []).filter(u => u.email);

    return (
      <Modal size="lg" title={s.wizard.title} onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose} disabled={busy}>{t.common.cancel}</button>
            <button className="btn" onClick={() => submit(false)} disabled={busy || !doc}>{s.wizard.linksOnly}</button>
            <button className="btn btn-primary" onClick={() => submit(true)} disabled={busy || !doc}>
              <Icon.send /> {busy ? s.wizard.sending : s.wizard.sendNow}
            </button>
          </>
        }>
        {err && <div className="form-error">{err}</div>}

        <div className="form-section">
          <label className="form-label">{s.wizard.doc}</label>
          <p className="help-text">{s.wizard.docHelp}</p>
          {pdfDocs.length === 0
            ? <div className="empty-state">{s.wizard.noDocs}</div>
            : (
              <>
                <input className="input" placeholder={s.wizard.searchDoc} value={q} onChange={e => setQ(e.target.value)} />
                <div className="sign-doc-list">
                  {shown.slice(0, 60).map(d => (
                    <label key={d.id} className={`sign-doc-opt ${docId === d.id ? "active" : ""}`}>
                      <input type="radio" name="signdoc" checked={docId === d.id} onChange={() => setDocId(d.id)} />
                      <span>
                        <span className="sign-doc-name">{d.title}</span>
                        <span className="doc-meta">{d.file?.name}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
        </div>

        <div className="form-section">
          <label className="form-label">{s.wizard.signers}</label>
          {signers.map((x, i) => (
            <div key={i} className="sign-signer-row">
              <input className="input" placeholder={s.wizard.name} value={x.name} onChange={e => setSigner(i, { name: e.target.value })} />
              <input className="input" type="email" placeholder={s.wizard.email} value={x.email} onChange={e => setSigner(i, { email: e.target.value })} />
              <button className="icon-btn" title={t.common.delete} onClick={() => setSigners(arr => arr.filter((_, n) => n !== i))}><Icon.trash /></button>
            </div>
          ))}
          <div className="sign-signer-actions">
            <button className="btn btn-sm" onClick={() => setSigners(arr => [...arr, { name: "", email: "" }])}><Icon.plus /> {s.wizard.addSigner}</button>
            {people.length > 0 && (
              <select className="input sign-people" value="" onChange={e => { const u = people.find(p => p.id === e.target.value); if (u) addFromHotel(u); }}>
                <option value="">{s.wizard.fromUsers}…</option>
                {people.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="form-section">
          <label className="form-label">{s.wizard.message}</label>
          <textarea className="input textarea" rows={3} placeholder={s.wizard.messagePh} value={message} onChange={e => setMessage(e.target.value)} />
        </div>

        <div className="form-section">
          <label className="form-label">{s.wizard.options}</label>
          <label className="check-row">
            <input type="checkbox" checked={requireOtp} onChange={e => setRequireOtp(e.target.checked)} />
            <span><strong>{s.wizard.otp}</strong><br /><span className="help-text">{s.wizard.otpHelp}</span></span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={requireRead} onChange={e => setRequireRead(e.target.checked)} />
            <span><strong>{s.wizard.read}</strong><br /><span className="help-text">{s.wizard.readHelp}</span></span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={requireId} onChange={e => setRequireId(e.target.checked)} />
            <span><strong>{s.wizard.idNum}</strong></span>
          </label>
          <div className="sign-opts-grid">
            <div>
              <label className="form-label sm">{s.wizard.kind}</label>
              <select className="input" value={signatureKind} onChange={e => setKind(e.target.value)}>
                <option value="draw">{s.wizard.kindDraw}</option>
                <option value="typed">{s.wizard.kindTyped}</option>
              </select>
            </div>
            <div>
              <label className="form-label sm">{s.wizard.order}</label>
              <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="parallel">{s.wizard.orderParallel}</option>
                <option value="sequential">{s.wizard.orderSequential}</option>
              </select>
            </div>
            <div>
              <label className="form-label sm">{s.wizard.expires}</label>
              <div className="sign-days"><input className="input" type="number" min="1" max="180" value={expiresDays} onChange={e => setDays(e.target.value)} /><span>{s.wizard.days}</span></div>
            </div>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { if (!consentText) setConsent(effConsent); setConsentOpen(o => !o); }}>
            {s.wizard.consentEdit}
          </button>
          {consentOpen && (
            <textarea className="input textarea" rows={7} style={{ marginTop: 8, fontSize: 12.5 }} value={consentText || effConsent} onChange={e => setConsent(e.target.value)} />
          )}
          <p className="help-text" style={{ marginTop: 10 }}>{s.wizard.linksOnlyHelp}</p>
        </div>
      </Modal>
    );
  }

  /* ──────────────── enlaces recién generados ──────────────── */

  function CreatedLinks({ res, s, onClose }) {
    const [copied, setCopied] = useState("");
    return (
      <Modal size="md" title={res.sent ? s.created.titleSent : s.created.titleLinks} onClose={onClose}
        footer={<button className="btn btn-primary" onClick={onClose}>{s.created.done}</button>}>
        <p className="help-text">{s.created.help}</p>
        {(res.signers || []).map(x => {
          const mailto = `mailto:${encodeURIComponent(x.email)}?subject=${encodeURIComponent("Firma requerida: " + res.title)}&body=${encodeURIComponent(
            `Hola ${x.name},\n\nPor favor, lee y firma electrónicamente el documento "${res.title}" en este enlace personal:\n\n${x.url}\n\nGracias.`)}`;
          return (
            <div key={x.id} className="sign-link-card">
              <div className="sign-link-who"><strong>{x.name}</strong><span className="doc-meta">{x.email}</span></div>
              <code className="sign-link-url">{x.url}</code>
              <div className="sign-link-actions">
                <button className="btn btn-sm" onClick={async () => { if (await copy(x.url)) { setCopied(x.id); setTimeout(() => setCopied(""), 1600); } }}>
                  {copied === x.id ? "✓ " + s.copied : s.copyLink}
                </button>
                <a className="btn btn-sm" href={mailto}>{s.openMail}</a>
                <button className="btn btn-sm" onClick={() => {
                  const url = window.generateQrDataUrl(x.url, 360);
                  if (!url) return;
                  const a = document.createElement("a");
                  a.href = url; a.download = `firma_${x.name.replace(/\W+/g, "_")}.png`; a.click();
                }}>{s.qr}</button>
              </div>
            </div>
          );
        })}
      </Modal>
    );
  }

  /* ──────────────── detalle y rastro ──────────────── */

  function EnvelopeDetail({ envelopeId, s, lang, onClose, onRemind, onCancel, onFile, pushToast }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [copied, setCopied] = useState("");

    useEffect(() => {
      let cancelled = false;
      callSign("detail", { envelopeId })
        .then(r => { if (!cancelled) setData(r); })
        .catch(e => { if (!cancelled) setErr(e.message); });
      return () => { cancelled = true; };
    }, [envelopeId]);

    const exportAudit = async () => {
      try {
        const r = await callSign("audit", { envelopeId });
        const blob = new Blob([JSON.stringify(r.export, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `rastro_firma_${envelopeId.slice(0, 8)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (e) { pushToast("⚠ " + e.message); }
    };

    const env = data?.envelope;
    const names = {};
    (data?.signers || []).forEach(x => { names[x.id] = x.name; });

    return (
      <Modal size="lg" title={s.detail.title} onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={exportAudit}>{s.exportAudit}</button>
            <button className="btn" onClick={() => onFile({ id: envelopeId }, "original")}>{s.origPdf}</button>
            {env?.signed_file_key && <button className="btn btn-primary" onClick={() => onFile({ id: envelopeId }, "signed")}><Icon.download /> {s.signedPdf}</button>}
          </>
        }>
        {err && <div className="form-error">{err}</div>}
        {!data && !err && <div className="empty-state">…</div>}
        {env && (
          <>
            <div className="sign-kv-grid">
              <div><span>{s.detail.doc}</span><strong>{env.title}</strong></div>
              <div><span>{s.detail.file}</span><strong>{env.file_name} · {env.page_count} p.</strong></div>
              <div><span>{s.detail.sentBy}</span><strong>{env.created_by_name}</strong></div>
              <div><span>{s.detail.sentAt}</span><strong>{fmtDT(env.created_at, lang)}</strong></div>
              <div><span>{s.detail.expires}</span><strong>{fmtDT(env.expires_at, lang)}</strong></div>
              <div><span>{s.detail.envelope}</span><code>{env.id}</code></div>
              <div className="wide"><span>{s.detail.hash}</span><code>{env.file_sha256}</code></div>
              {env.signed_sha256 && <div className="wide"><span>{s.detail.signedHash}</span><code>{env.signed_sha256}</code></div>}
              {env.tsa_provider && <div className="wide"><span>{s.detail.tsa}</span><strong>{env.tsa_provider} · {fmtDT(env.tsa_gen_time, lang)}</strong></div>}
            </div>

            <div className={`sign-chain ${data.chainOk ? "ok" : "bad"}`}>
              {data.chainOk ? `✓ ${s.detail.chainOk}` : s.detail.chainBad}
              {data.chainLast && <code>{String(data.chainLast).slice(0, 32)}…</code>}
            </div>

            <h4 className="sign-h4">{s.wizard.signers}</h4>
            {(data.signers || []).map(x => (
              <div key={x.id} className="sign-signer-card">
                <div className="sign-signer-head">
                  <div>
                    <strong>{x.name}</strong> <span className="doc-meta">{x.email}</span>
                    {x.id_number && <span className="doc-meta"> · {x.id_number}</span>}
                  </div>
                  <span className={`pill sign-${x.status}`}><span className="dot" />{s.signerStatus[x.status] || x.status}</span>
                </div>
                <div className="doc-meta">
                  {x.signed_at ? `${s.events.signed}: ${fmtDT(x.signed_at, lang)}` : x.first_opened_at ? `${s.events.opened}: ${fmtDT(x.first_opened_at, lang)}` : "—"}
                  {x.pages_viewed ? ` · ${x.pages_viewed} ${s.detail.pages}` : ""}
                  {x.read_seconds ? ` · ${x.read_seconds}${s.detail.secs}` : ""}
                  {x.ip ? ` · ${s.detail.ip} ${x.ip}` : ""}
                </div>
                {x.decline_reason && <div className="doc-meta" style={{ color: "#b91c1c" }}>“{x.decline_reason}”</div>}
                <div className="sign-link-actions">
                  <button className="btn btn-sm" onClick={async () => { if (await copy(x.url)) { setCopied(x.id); setTimeout(() => setCopied(""), 1600); } }}>
                    {copied === x.id ? "✓ " + s.copied : s.copyLink}
                  </button>
                  {env.status === "sent" && x.status !== "signed" && x.status !== "declined" &&
                    <button className="btn btn-sm" onClick={() => onRemind({ id: env.id }, x.id)}>{s.remind}</button>}
                </div>
              </div>
            ))}

            <h4 className="sign-h4">{s.detail.trail}</h4>
            <div className="sign-trail">
              {(data.events || []).map(e => (
                <div key={e.id} className={`sign-trail-row ${e.type}`}>
                  <span className="sign-trail-ts">{fmtDT(e.ts, lang)}</span>
                  <span className="sign-trail-what">
                    {s.events[e.type] || e.type}{e.signer_id && names[e.signer_id] ? ` — ${names[e.signer_id]}` : ""}
                    <span className="sign-trail-meta">
                      {e.ip ? ` · ${s.detail.ip} ${e.ip}` : ""}
                      {e.detail?.pagesViewed ? ` · ${e.detail.pagesViewed}/${e.detail.totalPages || "?"} ${s.detail.pages}` : ""}
                      {e.detail?.readSeconds ? ` · ${e.detail.readSeconds}${s.detail.secs}` : ""}
                    </span>
                  </span>
                  <code className="sign-trail-hash">{String(e.hash).slice(0, 12)}</code>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    );
  }

  /* ═══════════════════ PÁGINA DEL FIRMANTE (sin login) ═══════════════════ */

  const SV = {
    es: {
      loading: "Cargando el documento…", invalid: "Enlace no válido",
      hi: "Hola", asks: "te pide que leas y firmes este documento",
      readFirst: "Recorre el documento hasta el final para poder firmar.",
      readOk: "✓ Lectura completada", pageOf: "Página",
      openPdf: "Abrir el PDF en una pestaña",
      step1: "1 · Verifica que eres tú", step2: "2 · Tu firma", step3: "3 · Declaración y firma",
      sendCode: "Enviarme el código", resend: "Reenviar código",
      codeSent: "Te hemos enviado un código de 6 dígitos a", codePh: "Código de 6 dígitos",
      verify: "Verificar", verified: "✓ Identidad verificada",
      idLabel: "DNI / NIE / pasaporte", typedLabel: "Escribe tu nombre completo",
      accept: "He leído y acepto la declaración",
      sign: "Firmar el documento", decline: "Rechazar la firma",
      declineWhy: "¿Por qué rechazas la firma? (opcional)", declineOk: "Rechazo registrado",
      signing: "Firmando…",
      doneTitle: "Documento firmado", doneHelp: "Gracias. Hemos registrado tu firma y te enviaremos por correo el PDF firmado con el certificado de auditoría en cuanto firmen todas las partes.",
      alreadyTitle: "Ya has firmado este documento", alreadyHelp: "Tu firma quedó registrada el",
      evidence: "Lo que queda registrado como prueba",
      evidenceList: [
        "Tu correo electrónico y el enlace personal por el que entraste",
        "El código de un solo uso que verificaste",
        "Las páginas que viste y el tiempo que estuviste",
        "La fecha y hora exactas, tu IP y el dispositivo",
        "La huella SHA-256 del documento y de tu firma",
      ],
      legal: "Firma electrónica simple reforzada · Reglamento (UE) 910/2014 (eIDAS), art. 25 · Ley 6/2020",
    },
    en: {
      loading: "Loading the document…", invalid: "Invalid link",
      hi: "Hello", asks: "asks you to read and sign this document",
      readFirst: "Scroll through the document to the end to be able to sign.",
      readOk: "✓ Reading completed", pageOf: "Page",
      openPdf: "Open the PDF in a tab",
      step1: "1 · Verify it's you", step2: "2 · Your signature", step3: "3 · Declaration and signing",
      sendCode: "Send me the code", resend: "Resend code",
      codeSent: "We sent a 6-digit code to", codePh: "6-digit code",
      verify: "Verify", verified: "✓ Identity verified",
      idLabel: "ID / passport number", typedLabel: "Type your full name",
      accept: "I have read and accept the declaration",
      sign: "Sign the document", decline: "Decline to sign",
      declineWhy: "Why are you declining? (optional)", declineOk: "Decline recorded",
      signing: "Signing…",
      doneTitle: "Document signed", doneHelp: "Thank you. Your signature is recorded and we will email you the signed PDF with the audit certificate once every party has signed.",
      alreadyTitle: "You already signed this document", alreadyHelp: "Your signature was recorded on",
      evidence: "What is recorded as evidence",
      evidenceList: [
        "Your email address and the personal link you used",
        "The one-time code you verified",
        "The pages you viewed and how long you stayed",
        "The exact date and time, your IP and your device",
        "The SHA-256 fingerprint of the document and of your signature",
      ],
      legal: "Advanced-grade simple electronic signature · Regulation (EU) 910/2014 (eIDAS), art. 25",
    },
    de: {
      loading: "Dokument wird geladen…", invalid: "Ungültiger Link",
      hi: "Hallo", asks: "bittet dich, dieses Dokument zu lesen und zu unterschreiben",
      readFirst: "Scrolle das Dokument bis zum Ende, um unterschreiben zu können.",
      readOk: "✓ Lesen abgeschlossen", pageOf: "Seite",
      openPdf: "PDF in einem Tab öffnen",
      step1: "1 · Bestätige, dass du es bist", step2: "2 · Deine Unterschrift", step3: "3 · Erklärung und Unterschrift",
      sendCode: "Code senden", resend: "Code erneut senden",
      codeSent: "Wir haben einen 6-stelligen Code gesendet an", codePh: "6-stelliger Code",
      verify: "Prüfen", verified: "✓ Identität bestätigt",
      idLabel: "Ausweis-/Passnummer", typedLabel: "Gib deinen vollständigen Namen ein",
      accept: "Ich habe die Erklärung gelesen und akzeptiere sie",
      sign: "Dokument unterschreiben", decline: "Unterschrift ablehnen",
      declineWhy: "Warum lehnst du ab? (optional)", declineOk: "Ablehnung erfasst",
      signing: "Unterschreiben…",
      doneTitle: "Dokument unterschrieben", doneHelp: "Danke. Deine Unterschrift ist erfasst. Sobald alle unterschrieben haben, senden wir dir das unterschriebene PDF mit dem Prüfzertifikat per E-Mail.",
      alreadyTitle: "Du hast dieses Dokument bereits unterschrieben", alreadyHelp: "Deine Unterschrift wurde erfasst am",
      evidence: "Was als Nachweis gespeichert wird",
      evidenceList: [
        "Deine E-Mail-Adresse und der persönliche Link",
        "Der bestätigte Einmalcode",
        "Die gesehenen Seiten und die Verweildauer",
        "Datum und Uhrzeit, deine IP und dein Gerät",
        "Der SHA-256-Fingerabdruck des Dokuments und deiner Unterschrift",
      ],
      legal: "Fortgeschrittene einfache elektronische Signatur · Verordnung (EU) 910/2014 (eIDAS), Art. 25",
    },
  };

  function SignView({ token }) {
    const guess = (navigator.language || "es").slice(0, 2);
    const [lang, setLang] = useState(["es", "en", "de"].includes(guess) ? guess : "es");
    const v = SV[lang];

    const [data, setData] = useState(null);
    const [blocked, setBlocked] = useState("");
    const [fatal, setFatal] = useState("");
    const [readDone, setReadDone] = useState(false);
    const [pagesSeen, setPagesSeen] = useState(0);
    const [otpSent, setOtpSent] = useState(false);
    const [otpMsg, setOtpMsg] = useState("");
    const [code, setCode] = useState("");
    const [verified, setVerified] = useState(false);
    const [idNumber, setIdNumber] = useState("");
    const [typedName, setTypedName] = useState("");
    const [sigPng, setSigPng] = useState(null);
    const [accepted, setAccepted] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);
    const [declined, setDeclined] = useState(false);

    const boxRef = useRef(null);
    const startedAt = useRef(Date.now());
    const sentDone = useRef(false);

    useEffect(() => {
      let cancelled = false;
      callSign("open", { t: token, lang }, { anon: true })
        .then(r => {
          if (cancelled) return;
          setData(r.envelope);
          setBlocked(r.blocked || "");
          setTypedName(r.envelope.signer.name || "");
          setVerified(!!r.envelope.signer.otpVerified);
          setReadDone(!!r.envelope.signer.readCompleted);
        })
        .catch(e => { if (!cancelled) setFatal(e.message); });
      return () => { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // Render del PDF con pdf.js. Si falla, se cae a un <iframe> y la lectura se
    // da por hecha con el botón manual (queda registrado igualmente cómo fue).
    const [pdfMode, setPdfMode] = useState("loading");
    const [totalPages, setTotalPages] = useState(0);
    useEffect(() => {
      const url = data?.pdfUrl;
      const box = boxRef.current;
      if (!url || !box || typeof window.ensurePdfJs !== "function") return;
      let cancelled = false;
      setPdfMode("loading");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      window.ensurePdfJs().then(lib => {
        if (cancelled || !lib) { setPdfMode("iframe"); return; }
        box.innerHTML = "";
        return lib.getDocument({ url }).promise.then(async pdf => {
          if (cancelled) return;
          setTotalPages(pdf.numPages);
          const cssW = (box.clientWidth || 700) - 4;
          for (let n = 1; n <= pdf.numPages; n++) {
            if (cancelled) return;
            const page = await pdf.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const scale = Math.max(0.3, Math.min(2, cssW / base.width));
            const vp = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.className = "pdf-page-canvas";
            canvas.dataset.page = String(n);
            canvas.width = Math.floor(vp.width * dpr);
            canvas.height = Math.floor(vp.height * dpr);
            canvas.style.width = vp.width + "px";
            canvas.style.height = vp.height + "px";
            box.appendChild(canvas);
            await page.render({
              canvasContext: canvas.getContext("2d"), viewport: vp,
              transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            }).promise;
          }
          if (!cancelled) setPdfMode(box.childElementCount ? "rendered" : "iframe");
        });
      }).catch(() => { if (!cancelled) setPdfMode("iframe"); });
      return () => { cancelled = true; };
    }, [data?.pdfUrl]);

    // Seguimiento de lectura: cuántas páginas han pasado por pantalla y cuánto
    // tiempo lleva abierto. Es la prueba de que el documento se leyó de verdad.
    useEffect(() => {
      if (pdfMode !== "rendered" || done) return;
      const box = boxRef.current;
      if (!box) return;
      const seen = new Set();
      const io = new IntersectionObserver((entries) => {
        let changed = false;
        for (const en of entries) {
          if (en.isIntersecting) { seen.add(Number(en.target.dataset.page)); changed = true; }
        }
        if (!changed) return;
        setPagesSeen(seen.size);
        if (seen.size >= (totalPages || 1) && !sentDone.current) {
          sentDone.current = true;
          setReadDone(true);
          callSign("progress", {
            t: token, pagesViewed: seen.size, totalPages,
            readSeconds: Math.round((Date.now() - startedAt.current) / 1000), readCompleted: true,
          }, { anon: true }).catch(() => {});
        }
      }, { threshold: 0.35 });
      box.querySelectorAll("canvas[data-page]").forEach(c => io.observe(c));
      // Latido cada 20 s para que el tiempo en pantalla no se pierda si el
      // firmante cierra la pestaña a mitad.
      const beat = setInterval(() => {
        callSign("progress", {
          t: token, pagesViewed: seen.size, totalPages,
          readSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        }, { anon: true }).catch(() => {});
      }, 20000);
      return () => { io.disconnect(); clearInterval(beat); };
    }, [pdfMode, totalPages, token, done]);

    const markReadManually = () => {
      if (sentDone.current) return;
      sentDone.current = true;
      setReadDone(true);
      callSign("progress", {
        t: token, pagesViewed: totalPages || data?.pageCount || 1, totalPages: data?.pageCount || 0,
        readSeconds: Math.round((Date.now() - startedAt.current) / 1000), readCompleted: true,
      }, { anon: true }).catch(() => {});
    };

    const askCode = async () => {
      setErr(""); setBusy(true);
      try { await callSign("otp", { t: token }, { anon: true }); setOtpSent(true); setOtpMsg(`${v.codeSent} ${data.signer.email}`); }
      catch (e) { setErr(e.message); }
      setBusy(false);
    };
    const doVerify = async () => {
      setErr(""); setBusy(true);
      try { await callSign("verify", { t: token, code }, { anon: true }); setVerified(true); }
      catch (e) { setErr(e.message); }
      setBusy(false);
    };
    const doSign = async () => {
      setErr(""); setBusy(true);
      try {
        await callSign("sign", {
          t: token, consentAccepted: accepted, idNumber,
          typedName, signaturePng: sigPng,
        }, { anon: true });
        setDone(true);
      } catch (e) { setErr(e.message); setBusy(false); }
    };
    const doDecline = async () => {
      const reason = prompt(v.declineWhy) ?? null;
      if (reason === null) return;
      setBusy(true);
      try { await callSign("decline", { t: token, reason }, { anon: true }); setDeclined(true); }
      catch (e) { setErr(e.message); }
      setBusy(false);
    };

    const Shell = ({ children }) => (
      <div className="app sign-public">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">DH</span>
            <span className="brand-name">Docuhotel</span>
            {data?.hotel && <span className="brand-tag">— {data.hotel}</span>}
          </div>
          <div className="spacer" />
          <div className="lang-switch">
            {["es", "en", "de"].map(l => (
              <button key={l} className={l === lang ? "active" : ""} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
        </header>
        <main className="main sign-main">{children}</main>
        <footer className="sign-legal">{v.legal}</footer>
      </div>
    );

    if (fatal) return <Shell><div className="empty-state" style={{ padding: 60, textAlign: "center" }}><h2>{v.invalid}</h2><p>{fatal}</p></div></Shell>;
    if (!data) return <Shell><div className="empty-state" style={{ padding: 60, textAlign: "center" }}>{v.loading}</div></Shell>;

    if (declined) return <Shell><div className="sign-result"><h2>{v.declineOk}</h2></div></Shell>;
    if (done) return (
      <Shell>
        <div className="sign-result ok">
          <div className="sign-result-mark">✓</div>
          <h2>{v.doneTitle}</h2>
          <p>{v.doneHelp}</p>
        </div>
      </Shell>
    );
    if (data.signer.status === "signed") return (
      <Shell>
        <div className="sign-result ok">
          <div className="sign-result-mark">✓</div>
          <h2>{v.alreadyTitle}</h2>
          <p>{v.alreadyHelp} {fmtDT(data.signer.signedAt, lang)}.</p>
          {data.pdfUrl && <a className="btn" href={data.pdfUrl} target="_blank" rel="noopener">{v.openPdf}</a>}
        </div>
      </Shell>
    );
    if (blocked) return <Shell><div className="sign-result"><h2>{data.title}</h2><p>{blocked}</p></div></Shell>;

    const canSign = accepted
      && (!data.requireRead || readDone)
      && (!data.requireOtp || verified)
      && (!data.requireId || idNumber.trim())
      && (data.signatureKind === "typed" ? typedName.trim().length > 2 : !!sigPng);

    return (
      <Shell>
        <div className="sign-head">
          <h1>{data.title}</h1>
          <p>{v.hi} <strong>{data.signer.name}</strong> — {data.sender.name} {v.asks}.</p>
          {data.message && <div className="sign-message">{data.message}</div>}
        </div>

        <div className="sign-doc-box">
          <div ref={boxRef} className="sign-pdf-scroll" />
          {pdfMode === "iframe" && data.pdfUrl && (
            <div className="sign-pdf-fallback">
              <iframe title="documento" src={data.pdfUrl} />
              <button className="btn" onClick={markReadManually}>{v.readOk}</button>
            </div>
          )}
        </div>

        <div className={`sign-read-bar ${readDone ? "ok" : ""}`}>
          {readDone
            ? v.readOk
            : <>{v.readFirst} <span className="sign-read-count">{v.pageOf} {pagesSeen}/{totalPages || data.pageCount || "?"}</span></>}
        </div>

        <div className="sign-panel">
          {err && <div className="form-error">{err}</div>}

          {data.requireOtp && (
            <div className="sign-step">
              <h3>{v.step1}</h3>
              {verified ? <div className="sign-ok">{v.verified}</div> : (
                <>
                  {!otpSent
                    ? <button className="btn btn-primary" disabled={busy} onClick={askCode}>{v.sendCode}</button>
                    : (
                      <>
                        <p className="help-text">{otpMsg}</p>
                        <div className="sign-otp-row">
                          <input className="input sign-otp" inputMode="numeric" maxLength={6} placeholder={v.codePh}
                            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
                          <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={doVerify}>{v.verify}</button>
                          <button className="btn btn-sm" disabled={busy} onClick={askCode}>{v.resend}</button>
                        </div>
                      </>
                    )}
                </>
              )}
            </div>
          )}

          <div className="sign-step">
            <h3>{v.step2}</h3>
            {data.requireId && (
              <div className="sign-field">
                <label className="form-label sm">{v.idLabel}</label>
                <input className="input" value={idNumber} onChange={e => setIdNumber(e.target.value.toUpperCase())} />
              </div>
            )}
            {data.signatureKind === "typed" ? (
              <div className="sign-field">
                <label className="form-label sm">{v.typedLabel}</label>
                <input className="input sign-typed" value={typedName} onChange={e => setTypedName(e.target.value)} />
              </div>
            ) : <SignaturePad onChange={setSigPng} />}
          </div>

          <div className="sign-step">
            <h3>{v.step3}</h3>
            <div className="sign-consent">{data.consentText}</div>
            <label className="check-row">
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
              <span><strong>{v.accept}</strong></span>
            </label>
            <div className="sign-actions">
              <button className="btn btn-primary btn-lg" disabled={!canSign || busy} onClick={doSign}>
                {busy ? v.signing : v.sign}
              </button>
              <button className="btn" disabled={busy} onClick={doDecline}>{v.decline}</button>
            </div>
          </div>

          <details className="sign-evidence">
            <summary>{v.evidence}</summary>
            <ul>{v.evidenceList.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <p className="doc-meta">SHA-256: <code>{data.fileSha256}</code></p>
          </details>
        </div>
      </Shell>
    );
  }

  window.SignaturesPage = SignaturesPage;
  window.SignView = SignView;
})();
