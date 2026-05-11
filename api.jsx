// Docuhotel — Supabase API layer.
// All persistence flows through this file. The rest of the app keeps the same
// `state` shape it used in localStorage mode; api.load() reconstructs that
// shape from Supabase tables, and api.save() diffs it and writes back.

(function () {
  const cfg = window.DOCUHOTEL_CONFIG || {};
  const offline = !!cfg.offlineMode || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase;

  const client = offline
    ? null
    : window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });

  // ── Mapping helpers (camelCase ↔ snake_case) ───────────────────────

  const docFromRow = (r) => ({
    id: r.id,
    title: r.title,
    description: r.description || "",
    categoryId: r.category_id,
    statusId: r.status_id,
    departments: r.departments || [],
    responsibleIds: r.responsible_ids || [],
    periodId: r.period_id,
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    version: r.version,
    publicAccess: !!r.public_access,
    linkedDocIds: r.linked_doc_ids || [],
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    file: r.file_key
      ? { name: r.file_name, size: Number(r.file_size || 0), mime: r.file_mime, key: r.file_key, dataUrl: null }
      : { name: r.file_name || "documento.pdf", size: Number(r.file_size || 0), dataUrl: null },
  });

  const docToRow = (d, hotelId) => ({
    id: d.id,
    hotel_id: hotelId,
    title: d.title,
    description: d.description || "",
    category_id: d.categoryId || null,
    status_id: d.statusId || null,
    period_id: d.periodId || null,
    departments: d.departments || [],
    responsible_ids: d.responsibleIds || [],
    start_date: d.startDate || null,
    expiry_date: d.expiryDate || null,
    version: d.version || 1,
    public_access: !!d.publicAccess,
    linked_doc_ids: d.linkedDocIds || [],
    file_key: d.file?.key || null,
    file_name: d.file?.name || null,
    file_size: d.file?.size || null,
    file_mime: d.file?.mime || null,
    uploaded_by: d.uploadedBy || null,
    uploaded_at: d.uploadedAt || new Date().toISOString(),
  });

  const projFromRow = (r) => ({
    id: r.id, name: r.name, notes: r.notes || "", status: r.status || "active",
    docIds: r.doc_ids || [],
    shareToken: r.share_token || "",
    shareExpiresAt: r.share_expires_at || "",
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
  const projToRow = (p, hotelId) => ({
    id: p.id, hotel_id: hotelId, name: p.name, notes: p.notes || "", status: p.status || "active",
    doc_ids: p.docIds || [],
    share_token: p.shareToken || null,
    share_expires_at: p.shareExpiresAt || null,
  });

  const reqFromRow = (r, items, uploads, log) => ({
    id: r.id, title: r.title, notes: r.notes || "",
    recipientName: r.recipient_name, recipientEmail: r.recipient_email,
    shareToken: r.share_token,
    expiresAt: r.expires_at, maxFileSizeMb: r.max_file_size_mb,
    status: r.status,
    savedAt: r.saved_at, submittedAt: r.submitted_at,
    items: (items || []).map((i) => ({
      id: i.id, title: i.title, comments: i.comments || "", required: !!i.required,
      files: (uploads || [])
        .filter((u) => u.request_item_id === i.id && !u.deleted_at)
        .map((u) => ({ id: u.id, name: u.file_name, size: Number(u.file_size || 0), type: u.file_mime, key: u.file_key, uploadedAt: u.uploaded_at, dataUrl: null })),
    })),
    log: (log || []).map((l) => ({ ts: l.ts, action: l.action, details: l.details })),
    createdAt: r.created_at, updatedAt: r.updated_at,
  });
  const reqToRow = (r, hotelId) => ({
    id: r.id, hotel_id: hotelId,
    title: r.title, notes: r.notes || "",
    recipient_name: r.recipientName || null,
    recipient_email: r.recipientEmail || null,
    share_token: r.shareToken,
    expires_at: r.expiresAt,
    max_file_size_mb: r.maxFileSizeMb || 10,
    status: r.status || "open",
    saved_at: r.savedAt || null,
    submitted_at: r.submittedAt || null,
  });

  // ── Bootstrap: who am I + my hotel ──────────────────────────────────

  async function getSession() {
    if (offline) return null;
    const { data } = await client.auth.getSession();
    return data.session;
  }

  async function getMe() {
    if (offline) return null;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data: profile, error } = await client.from("app_users").select("*, hotels:hotel_id(*)").eq("id", user.id).single();
    if (error || !profile) return null;
    return {
      authUser: user,
      profile,
      hotel: profile.hotels,
    };
  }

  // ── Load: rebuild the prototype's state from Supabase tables ────────

  async function loadFullState(hotelId) {
    if (offline) return null;
    const tables = [
      "categories","departments","statuses","periods","responsibles",
      "app_users","documents","projects","email_templates","activity_log","email_log","hotel_config"
    ];
    const promises = tables.map((t) =>
      client.from(t).select("*").eq("hotel_id", hotelId)
    );
    // hotel_config is keyed by hotel_id (PK), still filtered by hotel_id
    const results = await Promise.all(promises);
    const byTable = Object.fromEntries(tables.map((t, i) => [t, results[i].data || []]));
    const errs = results.filter((r) => r.error).map((r) => r.error.message);
    if (errs.length) console.warn("[docuhotel] load errors:", errs);

    // Requests need nested fetch
    const { data: reqRows } = await client.from("requests").select("*").eq("hotel_id", hotelId);
    let requests = [];
    if (reqRows?.length) {
      const reqIds = reqRows.map((r) => r.id);
      const [{ data: items }, { data: logs }] = await Promise.all([
        client.from("request_items").select("*").in("request_id", reqIds),
        client.from("request_log").select("*").in("request_id", reqIds).order("ts", { ascending: true }),
      ]);
      const itemIds = (items || []).map((i) => i.id);
      const { data: uploads } = itemIds.length
        ? await client.from("request_uploads").select("*").in("request_item_id", itemIds)
        : { data: [] };
      requests = reqRows.map((r) =>
        reqFromRow(
          r,
          (items || []).filter((i) => i.request_id === r.id).sort((a, b) => a.sort - b.sort),
          uploads || [],
          (logs || []).filter((l) => l.request_id === r.id)
        )
      );
    }

    const hotelCfg = byTable.hotel_config[0]?.data || {};

    return {
      hotelId,
      statuses:    byTable.statuses.map((s) => ({ id: s.id, key: s.key, color: s.color, bg: s.bg, label: s.label })),
      categories:  byTable.categories.map((c) => ({ id: c.id, name: c.name })),
      departments: byTable.departments.map((d) => ({ id: d.id, name: d.name })),
      periods:     byTable.periods.map((p) => ({ id: p.id, months: p.months, manual: !!p.manual, label: p.label })),
      responsibles:byTable.responsibles.map((r) => ({ id: r.id, name: r.name, email: r.email })),
      users:       byTable.app_users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments || [] })),
      documents:   byTable.documents.map(docFromRow),
      projects:    [], // filled below
      requests,
      log:         byTable.activity_log
                     .sort((a, b) => new Date(b.ts) - new Date(a.ts))
                     .slice(0, 500)
                     .map((l) => ({ id: l.id, ts: l.ts, userId: l.user_id, action: l.action, details: l.details })),
      config: {
        ...hotelCfg,
        emailLog: byTable.email_log
                    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
                    .slice(0, 200)
                    .map((e) => ({ id: e.id, ts: e.ts, to: e.to_email, subject: e.subject, status: e.status, trigger: e.trigger })),
        emailTemplates: byTable.email_templates.map((t) => ({
          id: t.id, trigger: t.trigger, enabled: t.enabled,
          recipients: t.recipients, sendHour: t.send_hour,
          attachPdf: t.attach_pdf, includeViewLink: t.include_view_link,
          name: t.name, subject: t.subject, body: t.body,
        })),
      },
      _projects_raw: byTable, // not used; safe to ignore
    };
  }

  // ── Save: diff prev vs next and persist ─────────────────────────────

  function diffCollection(prev, next, keyFn = (x) => x.id) {
    const prevMap = new Map((prev || []).map((x) => [keyFn(x), x]));
    const nextMap = new Map((next || []).map((x) => [keyFn(x), x]));
    const upserts = [];
    const deletes = [];
    for (const [k, v] of nextMap) {
      const old = prevMap.get(k);
      if (!old || JSON.stringify(old) !== JSON.stringify(v)) upserts.push(v);
    }
    for (const k of prevMap.keys()) if (!nextMap.has(k)) deletes.push(k);
    return { upserts, deletes };
  }

  async function persistTable(table, hotelId, prevList, nextList, toRow) {
    const { upserts, deletes } = diffCollection(prevList, nextList);
    if (upserts.length) {
      const rows = upserts.map((x) => toRow(x, hotelId));
      const { error } = await client.from(table).upsert(rows, { onConflict: "id" });
      if (error) console.error(`[${table}] upsert`, error);
    }
    if (deletes.length) {
      const { error } = await client.from(table).delete().in("id", deletes);
      if (error) console.error(`[${table}] delete`, error);
    }
  }

  async function saveDiff(prev, next) {
    if (offline || !next?.hotelId) return;
    const hotelId = next.hotelId;

    await Promise.all([
      persistTable("categories",   hotelId, prev?.categories,   next.categories,   (x, h) => ({ id: x.id, hotel_id: h, name: x.name })),
      persistTable("departments",  hotelId, prev?.departments,  next.departments,  (x, h) => ({ id: x.id, hotel_id: h, name: x.name })),
      persistTable("statuses",     hotelId, prev?.statuses,     next.statuses,     (x, h) => ({ id: x.id, hotel_id: h, key: x.key, color: x.color, bg: x.bg, label: x.label })),
      persistTable("periods",      hotelId, prev?.periods,      next.periods,      (x, h) => ({ id: x.id, hotel_id: h, months: x.months || 0, manual: !!x.manual, label: x.label })),
      persistTable("responsibles", hotelId, prev?.responsibles, next.responsibles, (x, h) => ({ id: x.id, hotel_id: h, name: x.name, email: x.email || null })),
      persistTable("documents",    hotelId, prev?.documents,    next.documents,    docToRow),
      persistTable("projects",     hotelId, prev?.projects,     next.projects,     projToRow),
      persistTable("email_templates", hotelId, prev?.config?.emailTemplates, next.config?.emailTemplates, (x, h) => ({
        id: x.id, hotel_id: h, trigger: x.trigger, enabled: !!x.enabled,
        recipients: x.recipients || [], send_hour: x.sendHour ?? 8,
        attach_pdf: !!x.attachPdf, include_view_link: !!x.includeViewLink,
        name: x.name, subject: x.subject, body: x.body,
      })),
    ]);

    // Requests: nested. Replace items per-request only if the request was touched.
    await persistRequests(hotelId, prev?.requests, next.requests);

    // hotel_config (jsonb blob without emailLog/emailTemplates)
    const cfgCopy = { ...(next.config || {}) };
    delete cfgCopy.emailLog;
    delete cfgCopy.emailTemplates;
    const prevCfgCopy = { ...(prev?.config || {}) };
    delete prevCfgCopy.emailLog;
    delete prevCfgCopy.emailTemplates;
    if (JSON.stringify(cfgCopy) !== JSON.stringify(prevCfgCopy)) {
      const { error } = await client.from("hotel_config").upsert({ hotel_id: hotelId, data: cfgCopy }, { onConflict: "hotel_id" });
      if (error) console.error("[hotel_config] upsert", error);
    }

    // Activity log: insert only newly added entries (compared by id)
    const prevIds = new Set((prev?.log || []).map((l) => l.id));
    const newLogs = (next.log || []).filter((l) => l.id && !prevIds.has(l.id));
    if (newLogs.length) {
      await client.from("activity_log").insert(newLogs.map((l) => ({
        id: l.id, hotel_id: hotelId, ts: l.ts, user_id: l.userId, action: l.action, details: l.details,
      })));
    }
  }

  async function persistRequests(hotelId, prevReqs, nextReqs) {
    const prevMap = new Map((prevReqs || []).map((r) => [r.id, r]));
    const nextMap = new Map((nextReqs || []).map((r) => [r.id, r]));
    // Deletes
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) await client.from("requests").delete().eq("id", id);
    }
    // Upserts
    for (const [id, r] of nextMap) {
      const prev = prevMap.get(id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(r)) {
        const { error } = await client.from("requests").upsert(reqToRow(r, hotelId), { onConflict: "id" });
        if (error) { console.error("[requests] upsert", error); continue; }
        // Items: replace all (simpler than diff)
        await client.from("request_items").delete().eq("request_id", id);
        if (r.items?.length) {
          await client.from("request_items").insert(r.items.map((it, i) => ({
            id: it.id, request_id: id, title: it.title, comments: it.comments || "", required: !!it.required, sort: i,
          })));
        }
      }
      // Append new log entries
      const prevLogTs = new Set((prev?.log || []).map((l) => l.ts + "|" + l.action));
      const newLogs = (r.log || []).filter((l) => !prevLogTs.has(l.ts + "|" + l.action));
      if (newLogs.length) {
        await client.from("request_log").insert(newLogs.map((l) => ({
          request_id: id, ts: l.ts, action: l.action, details: l.details,
        })));
      }
    }
  }

  // ── Storage helpers ────────────────────────────────────────────────

  async function uploadDocFile(hotelId, docId, file) {
    if (offline) return null;
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `docs/${hotelId}/${docId}/${Date.now()}_${safe}`;
    const { error } = await client.storage.from(cfg.storageBucket || "docuhotel").upload(key, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || "application/pdf",
    });
    if (error) throw error;
    return { key, name: file.name, size: file.size, mime: file.type };
  }

  async function uploadRequestFile(requestId, itemId, uploadId, file) {
    if (offline) return null;
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `requests/${requestId}/${itemId}/${uploadId}_${safe}`;
    const { error } = await client.storage.from(cfg.storageBucket || "docuhotel").upload(key, file, {
      cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    // Register upload row (anon may also call this through RLS if request is open)
    await client.from("request_uploads").insert({
      id: uploadId,
      request_item_id: itemId,
      file_key: key,
      file_name: file.name,
      file_size: file.size,
      file_mime: file.type || null,
    });
    return { id: uploadId, key, name: file.name, size: file.size, mime: file.type };
  }

  async function signedUrl(fileKey, expiresSec = 900) {
    if (offline || !fileKey) return null;
    const { data, error } = await client.storage.from(cfg.storageBucket || "docuhotel").createSignedUrl(fileKey, expiresSec);
    if (error) { console.error("signedUrl", error); return null; }
    return data?.signedUrl || null;
  }

  async function deleteFile(fileKey) {
    if (offline || !fileKey) return;
    await client.storage.from(cfg.storageBucket || "docuhotel").remove([fileKey]);
  }

  // ── Public/share routes (no auth) ──────────────────────────────────

  async function publicDocs(token) {
    if (offline) return [];
    const { data, error } = await client.rpc("public_documents", { p_token: token });
    if (error) { console.error("public_documents", error); return []; }
    return (data || []).map(docFromRow);
  }

  async function auditProject(token) {
    if (offline) return null;
    const { data, error } = await client.rpc("audit_project", { p_token: token });
    if (error || !data?.length) return null;
    const row = data[0];
    return { project: row.project, docs: (row.docs || []).map(docFromRow) };
  }

  async function requestByToken(token) {
    if (offline) return null;
    const { data, error } = await client.rpc("request_by_token", { p_token: token });
    if (error || !data) return null;
    return reqFromRow(data.request, data.items, data.uploads, []);
  }

  async function requestLog(token, action, details) {
    if (offline) return;
    await client.rpc("request_log_append", { p_token: token, p_action: action, p_details: details || "" });
  }

  // ── Auth ────────────────────────────────────────────────────────────

  async function signIn(email, password) {
    if (offline) throw new Error("offline mode");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }
  async function signOut() {
    if (offline) return;
    await client.auth.signOut();
  }
  function onAuthChange(cb) {
    if (offline) return () => {};
    const { data } = client.auth.onAuthStateChange((_evt, session) => cb(session));
    return () => data.subscription.unsubscribe();
  }

  // ── Expose ──────────────────────────────────────────────────────────

  window.DocuApi = {
    offline,
    client,
    getSession, getMe,
    loadFullState, saveDiff,
    uploadDocFile, uploadRequestFile, signedUrl, deleteFile,
    publicDocs, auditProject, requestByToken, requestLog,
    signIn, signOut, onAuthChange,
  };
})();
