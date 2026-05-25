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
        // autoRefreshToken: false -- the free-tier GoTrue on t4g.nano can take
        // 30-120s per /token refresh, and supabase-js holds an internal lock
        // while a refresh is in flight which blocks every PostgREST query
        // behind it. The DB itself is fast (~200ms), so the app appears stuck
        // on "Cargando datos del hotel…" for minutes when in reality it is
        // only auth that is slow.
        //
        // Trade-off: access tokens are valid 1h; after that, queries will
        // return 401 and the app will route the user to login. We refresh
        // manually below on a long interval, far from the critical path.
        auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
      });

  // Background, non-blocking refresh: every 50 minutes try to extend the
  // session. Failures are silent — if the access token expires, the next
  // failing request will surface a login prompt via the normal auth flow.
  if (client) {
    setInterval(() => {
      client.auth.refreshSession().catch(() => {});
    }, 50 * 60 * 1000);
  }

  // ── Mapping helpers (camelCase ↔ snake_case) ───────────────────────

  const docFromRow = (r) => ({
    id: r.id,
    hotelId: r.hotel_id,
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
    hotel_id: d.hotelId || hotelId,
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

  async function getMe(preloadedSession) {
    if (offline) return null;
    // Prefer a session that the caller already obtained (boot path passes the
    // one it just fetched). Otherwise read the cached session locally. Only
    // fall back to auth.getUser() — a GoTrue round-trip — when neither is
    // available, since on a cold-started project that call can hang for ~30s
    // while it waits for the auth service to wake up.
    let user = preloadedSession?.user || null;
    if (!user) {
      const { data: sessData } = await client.auth.getSession();
      user = sessData?.session?.user || null;
    }
    if (!user) {
      const { data: { user: u } = {}, error: userErr } = await client.auth.getUser();
      if (userErr) throw new Error("No se pudo validar la sesión: " + userErr.message);
      user = u || null;
    }
    if (!user) return null; // not authenticated → caller shows login
    const { data: profile, error } = await client
      .from("app_users")
      .select("*, hotels:hotel_id(*)")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      throw new Error(
        "No se pudo leer tu perfil (tabla app_users): " + error.message +
        (error.hint ? ` — ${error.hint}` : "") +
        ". Comprueba que el esquema (schema.sql) y las políticas RLS están aplicados en Supabase."
      );
    }
    if (!profile) {
      throw new Error(
        `Tu cuenta (${user.email}) no está vinculada a ningún hotel. ` +
        "Un administrador debe crear la fila correspondiente en app_users (paso 'seed' del despliegue)."
      );
    }
    if (!profile.hotels) {
      throw new Error("Tu perfil existe pero su hotel_id no apunta a ningún hotel. Revisa la tabla hotels / app_users.");
    }
    return {
      authUser: user,
      profile,
      hotel: profile.hotels,
    };
  }

  // ── Load: rebuild the prototype's state from Supabase tables ────────

  async function loadFullState(hotelId) {
    if (offline) return null;
    const _t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const _perf = (label) => console.info(`[docuhotel] loadFullState ${label}: ${Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - _t0)}ms`);
    const tables = [
      "categories","departments","statuses","periods","responsibles",
      "app_users","documents","projects","email_templates","activity_log","email_log","hotel_config"
    ];
    // activity_log / email_log grow without bound; only the most recent matter.
    const RECENT_LIMIT = 500;
    const tableQ = tables.map((t) => {
      const q = client.from(t).select("*").eq("hotel_id", hotelId);
      if (t === "activity_log" || t === "email_log") return q.order("ts", { ascending: false }).limit(RECENT_LIMIT);
      return q;
    });
    // First wave — fire everything that doesn't depend on another query at once.
    const [results, dhRes, reqRes] = await Promise.all([
      Promise.all(tableQ),
      // Only the rows that share a document INTO this hotel — not every
      // document_hotels row in the system (RLS already scopes this to hotels
      // the user can access, but a regional admin can access all of them).
      client.from("document_hotels").select("document_id, hotel_id").eq("hotel_id", hotelId),
      client.from("requests").select("*").eq("hotel_id", hotelId),
    ]);
    _perf("wave 1");
    const byTable = Object.fromEntries(tables.map((t, i) => [t, results[i].data || []]));
    const errs = results.filter((r) => r.error).map((r) => r.error.message);
    if (errs.length) console.warn("[docuhotel] load errors:", errs);

    // Regional/corporate documents shared into this hotel via document_hotels
    // (single row, no duplication). Merge them into the document list.
    let docRows = byTable.documents.slice();
    const sharedByDoc = {};
    for (const r of (dhRes.data || [])) (sharedByDoc[r.document_id] = sharedByDoc[r.document_id] || []).push(r.hotel_id);
    const haveIds = new Set(docRows.map((d) => d.id));
    const wantIds = Object.keys(sharedByDoc).filter((id) => (sharedByDoc[id] || []).includes(hotelId) && !haveIds.has(id));

    // Requests need a nested fetch.
    const reqRows = reqRes.data || [];
    const reqIds = reqRows.map((r) => r.id);

    // Second wave — extra shared docs + request items/log, in parallel.
    const noData = Promise.resolve({ data: [] });
    const [extraDocsRes, itemsRes, logsRes] = await Promise.all([
      wantIds.length ? client.from("documents").select("*").in("id", wantIds) : noData,
      reqIds.length  ? client.from("request_items").select("*").in("request_id", reqIds) : noData,
      reqIds.length  ? client.from("request_log").select("*").in("request_id", reqIds).order("ts", { ascending: true }) : noData,
    ]);
    _perf("wave 2");
    if (extraDocsRes.data?.length) docRows = docRows.concat(extraDocsRes.data);
    const items = itemsRes.data || [];
    const logs = logsRes.data || [];

    // Third wave — request uploads (needs item ids).
    const itemIds = items.map((i) => i.id);
    const { data: uploads } = itemIds.length
      ? await client.from("request_uploads").select("*").in("request_item_id", itemIds)
      : { data: [] };
    const requests = reqRows.map((r) =>
      reqFromRow(
        r,
        items.filter((i) => i.request_id === r.id).sort((a, b) => a.sort - b.sort),
        uploads || [],
        logs.filter((l) => l.request_id === r.id)
      )
    );

    _perf("wave 3 (done)");
    const hotelCfg = byTable.hotel_config[0]?.data || {};

    return {
      hotelId,
      statuses:    byTable.statuses.map((s) => ({ id: s.id, key: s.key, color: s.color, bg: s.bg, label: s.label })),
      categories:  byTable.categories.map((c) => ({ id: c.id, name: c.name })),
      departments: byTable.departments.map((d) => ({ id: d.id, name: d.name })),
      periods:     byTable.periods.map((p) => ({ id: p.id, months: p.months, manual: !!p.manual, label: p.label })),
      responsibles:byTable.responsibles.map((r) => ({ id: r.id, name: r.name, email: r.email })),
      users:       byTable.app_users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments || [] })),
      documents:   docRows.map((d) => ({ ...docFromRow(d), sharedHotelIds: sharedByDoc[d.id] || [] })),
      projects:    byTable.projects.map(projFromRow),
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

    // hotel_config (jsonb blob — strip runtime/auth-derived fields)
    const RUNTIME_CFG = ["emailLog","emailTemplates","isRegional","myHotelId","accessibleHotels"];
    const strip = (c) => { const o = { ...(c || {}) }; RUNTIME_CFG.forEach((k) => delete o[k]); return o; };
    const cfgCopy = strip(next.config);
    const prevCfgCopy = strip(prev?.config);
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
        // Items: upsert the current ones and delete only the removed ones, so
        // request_uploads rows (FK on delete cascade) survive an edit.
        const keepIds = (r.items || []).map((it) => it.id);
        const { data: existingItems } = await client.from("request_items").select("id").eq("request_id", id);
        const removedIds = (existingItems || []).map((x) => x.id).filter((x) => !keepIds.includes(x));
        if (removedIds.length) await client.from("request_items").delete().in("id", removedIds);
        if (r.items?.length) {
          await client.from("request_items").upsert(r.items.map((it, i) => ({
            id: it.id, request_id: id, title: it.title, comments: it.comments || "", required: !!it.required, sort: i,
          })), { onConflict: "id" });
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

  // Server-side copy of an existing object into the hotel's docs/ tree, so a
  // request upload can be promoted to a Document without re-uploading bytes and
  // keeps working even if the original request is later deleted.
  async function copyToDocsPath(hotelId, srcKey, fileName) {
    if (offline || !srcKey || !hotelId) return null;
    const safe = (fileName || "documento.pdf").replace(/[^\w.\-]+/g, "_");
    const key = `docs/${hotelId}/imports/${Date.now()}_${safe}`;
    const { error } = await client.storage.from(cfg.storageBucket || "docuhotel").copy(srcKey, key);
    if (error) throw error;
    return key;
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

  async function requestDeleteUpload(token, uploadId) {
    if (offline) return;
    const { error } = await client.rpc("request_upload_delete", { p_token: token, p_upload_id: uploadId });
    if (error) throw error;
  }

  async function requestSaveProgress(token) {
    if (offline) return;
    const { error } = await client.rpc("request_save_progress", { p_token: token });
    if (error) throw error;
  }

  async function requestSubmit(token) {
    if (offline) return;
    const { error } = await client.rpc("request_submit", { p_token: token });
    if (error) throw error;
  }

  // ── Regional / multi-hotel ──────────────────────────────────────────

  // Hotels the current user can access (RLS: all of them for a regional admin,
  // else their primary hotel + any rows in user_hotels).
  async function createHotel({ name, country, timezone } = {}) {
    if (offline) throw new Error("No disponible en modo offline.");
    const { data, error } = await client.rpc("create_hotel", {
      p_name: name, p_country: country || "ES", p_timezone: timezone || "Europe/Madrid",
    });
    if (error) throw error;
    return data; // uuid of the new hotel
  }

  async function listAccessibleHotels() {
    if (offline) return [];
    // Fast path: a SECURITY DEFINER RPC that bypasses per-row RLS evaluation
    // on the `hotels` table. Without it, `select * from hotels` invokes
    // user_can_access(id) for every row, which on a regional account fans
    // out to `select id from hotels` again per row — O(N²) — and on Supabase
    // free-tier projects can take 60s+ for a few hundred hotels. The RPC
    // computes user_hotel_ids() once and filters by primary-key membership.
    try {
      const { data, error } = await client.rpc("list_accessible_hotels");
      if (!error && Array.isArray(data)) {
        return data.map((h) => ({ id: h.id, name: h.name, country: h.country, timezone: h.timezone, publicToken: h.public_token }));
      }
      if (error && !/function .* does not exist|could not find the function/i.test(error.message || "")) {
        console.warn("[docuhotel] list_accessible_hotels rpc:", error.message);
      }
    } catch (e) {
      console.warn("[docuhotel] list_accessible_hotels rpc threw:", e?.message || e);
    }
    // Fallback when the RPC hasn't been deployed yet (older schema.sql).
    const { data, error } = await client.from("hotels").select("*").order("name").limit(500);
    if (error) { console.error("listAccessibleHotels", error); return []; }
    return (data || []).map((h) => ({ id: h.id, name: h.name, country: h.country, timezone: h.timezone, publicToken: h.public_token }));
  }

  // Upload a single regional/corporate document visible in all given hotels.
  async function regionalUpload({ file, fields, hotelIds }) {
    if (offline) throw new Error("offline mode");
    if (!hotelIds || !hotelIds.length) throw new Error("Selecciona al menos un hotel.");
    const { data: { user } = {} } = await client.auth.getUser();
    const docId = "doc_reg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ownerHotel = hotelIds[0];
    let fileMeta = null;
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `docs/${ownerHotel}/${docId}/${Date.now()}_${safe}`;
      const { error } = await client.storage.from(cfg.storageBucket || "docuhotel").upload(key, file, {
        cacheControl: "3600", upsert: false, contentType: file.type || "application/pdf",
      });
      if (error) throw error;
      fileMeta = { key, name: file.name, size: file.size, mime: file.type };
    }
    const row = {
      id: docId, hotel_id: ownerHotel,
      title: fields.title, description: fields.description || "",
      category_id: fields.categoryId || null, status_id: fields.statusId || null, period_id: fields.periodId || null,
      departments: ["*"], responsible_ids: [],
      start_date: fields.startDate || null, expiry_date: fields.expiryDate || null,
      version: 1, public_access: !!fields.publicAccess, linked_doc_ids: [],
      file_key: fileMeta?.key || null, file_name: fileMeta?.name || null, file_size: fileMeta?.size || null, file_mime: fileMeta?.mime || null,
      uploaded_by: user?.id || null, uploaded_at: new Date().toISOString(),
    };
    { const { error } = await client.from("documents").insert(row); if (error) throw error; }
    { const { error } = await client.from("document_hotels").insert(hotelIds.map((h) => ({ document_id: docId, hotel_id: h }))); if (error) throw error; }
    await client.from("regional_uploads").insert({ document_id: docId, uploaded_by: user?.id || null, title: fields.title, hotel_ids: hotelIds });
    return docId;
  }

  async function updateRegionalDocHotels(docId, hotelIds) {
    if (offline) return;
    await client.from("document_hotels").delete().eq("document_id", docId);
    if (hotelIds && hotelIds.length) {
      const { error } = await client.from("document_hotels").insert(hotelIds.map((h) => ({ document_id: docId, hotel_id: h })));
      if (error) throw error;
    }
  }

  async function listRegionalUploads() {
    if (offline) return [];
    const { data, error } = await client.from("regional_uploads").select("*").order("created_at", { ascending: false });
    if (error) { console.error("listRegionalUploads", error); return []; }
    return data || [];
  }

  async function listAllUsers() {
    if (offline) return [];
    const { data, error } = await client.from("app_users").select("*").order("name");
    if (error) { console.error("listAllUsers", error); return []; }
    return data || [];
  }

  // Create a brand-new user: an Auth account (via signUp on a throwaway client
  // so it doesn't touch the current session) + the matching app_users row.
  // The caller must be a hotel admin (for their hotel) or a regional admin.
  async function createAppUser({ email, password, name, hotelId, role, departments, isRegional } = {}) {
    if (offline) throw new Error("No disponible en modo offline.");
    const em = String(email || "").trim().toLowerCase();
    if (!em) throw new Error("Email obligatorio.");
    if (!password || String(password).length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
    if (!hotelId) throw new Error("Selecciona un hotel.");
    const c = window.DOCUHOTEL_CONFIG || {};
    const tmp = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await tmp.auth.signUp({ email: em, password });
    if (error) throw error;
    const u = data?.user;
    if (!u?.id) throw new Error("No se pudo crear la cuenta de acceso.");
    if (Array.isArray(u.identities) && u.identities.length === 0) {
      throw new Error("Ya existe una cuenta con ese email.");
    }
    const { error: e2 } = await client.from("app_users").insert({
      id: u.id, hotel_id: hotelId, name: (name || em).trim(), email: em,
      role: role || "employee",
      departments: (departments && departments.length) ? departments : ["*"],
      is_regional: !!isRegional,
    });
    if (e2) throw e2;
    return { id: u.id, email: em, needsEmailConfirm: !data?.session };
  }

  async function getUserHotels(userId) {
    if (offline) return [];
    const { data } = await client.from("user_hotels").select("hotel_id").eq("user_id", userId);
    return (data || []).map((r) => r.hotel_id);
  }

  async function setUserAccess(userId, { isRegional, hotelIds } = {}) {
    if (offline) return;
    if (typeof isRegional === "boolean") {
      const { error } = await client.from("app_users").update({ is_regional: isRegional }).eq("id", userId);
      if (error) throw error;
    }
    if (Array.isArray(hotelIds)) {
      await client.from("user_hotels").delete().eq("user_id", userId);
      if (hotelIds.length) {
        const { error } = await client.from("user_hotels").insert(hotelIds.map((h) => ({ user_id: userId, hotel_id: h })));
        if (error) throw error;
      }
    }
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
    const { data } = client.auth.onAuthStateChange((evt, session) => cb(session, evt));
    return () => data.subscription.unsubscribe();
  }

  // ── Expose ──────────────────────────────────────────────────────────

  window.DocuApi = {
    offline,
    client,
    getSession, getMe,
    loadFullState, saveDiff,
    uploadDocFile, uploadRequestFile, copyToDocsPath, signedUrl, deleteFile,
    publicDocs, auditProject, requestByToken, requestLog,
    requestDeleteUpload, requestSaveProgress, requestSubmit,
    createHotel, listAccessibleHotels, regionalUpload, updateRegionalDocHotels, listRegionalUploads,
    listAllUsers, createAppUser, getUserHotels, setUserAccess,
    signIn, signOut, onAuthChange,
  };
})();
