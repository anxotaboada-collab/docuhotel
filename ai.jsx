// Docuhotel — AI autofill. Extracts document metadata (title, description,
// category, theme, dates…) from a freshly-picked PDF using the SAME shared AI
// provider the Gastos de Viaje app is configured with (viaje.ocr_config via
// the docuhotel_ai_config RPC). Supports Mistral (Pixtral) and Gemini.

(function () {
  // Render the first pages + the LAST page of the PDF to JPEG data-URLs.
  // The last page matters: signatures and signing dates usually live there.
  async function pdfToImages(file, maxPages = 2, maxDim = 1400) {
    const lib = await window.ensurePdfJs();
    if (!lib) throw new Error("pdf.js no disponible");
    const data = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data }).promise;
    const n = Math.min(pdf.numPages, maxPages);
    const pageNums = [];
    for (let i = 1; i <= n; i++) pageNums.push(i);
    if (pdf.numPages > n) pageNums.push(pdf.numPages);
    const out = [];
    for (const i of pageNums) {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, maxDim / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.82));
      canvas.width = canvas.height = 0;
    }
    pdf.destroy();
    return out;
  }

  function buildPrompt(state) {
    const li = (arr) => (arr || []).map((x) => `  - ${x.id}: ${x.name}`).join("\n");
    return [
      "Eres un asistente que cataloga documentos de un hotel. Analiza el documento adjunto y extrae sus metadatos.",
      "Responde SOLO un objeto JSON (sin markdown, sin explicaciones) con estas claves:",
      '- "title": título corto y descriptivo del documento, en español (o el idioma del documento).',
      '- "description": 1-2 frases resumiendo qué es el documento.',
      '- "categoryId": el id de la categoría que mejor encaje, o null si ninguna encaja claramente. Categorías disponibles:',
      li(state.categories),
      '- "themeId": el id del tema que mejor encaje, o null. Temas disponibles:',
      li(state.themes),
      '- "departments": array con los ids de los departamentos afectados, ["*"] si afecta a todo el hotel, o null si no está claro. Departamentos:',
      li(state.departments),
      '- "startDate": fecha del documento en formato YYYY-MM-DD. Busca con atención: la fecha de FIRMA (suele estar al final, junto a firmas o sellos, p.ej. "En Madrid, a 5 de marzo de 2026"), o si no la fecha de emisión/entrada en vigor/inspección que figure en el encabezado. Solo null si de verdad no hay ninguna fecha.',
      '- "expiryDate": fecha de caducidad en formato YYYY-MM-DD. Búscala como fecha explícita ("válido hasta", "caducidad", "próxima inspección/revisión antes de") O como periodo de validez ("validez: 12 meses", "renovación anual") — en ese caso calcúlala sumando el periodo a startDate. null solo si el documento no indica ni fecha ni periodo de validez.',
      '- "validityMonths": número de meses de validez si el documento lo indica (12 para anual, 6 para semestral…), o null.',
      "Se incluyen las primeras páginas y la ÚLTIMA página del documento (donde suelen estar las firmas). No inventes fechas que no estén en el documento.",
    ].join("\n");
  }

  function parseLenientJSON(text) {
    let s = String(text || "").trim();
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch {}
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    throw new Error("La IA no devolvió JSON válido");
  }

  async function callMistral(cfg, prompt, images) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.api_key },
      body: JSON.stringify({
        model: cfg.options?.model || "pixtral-12b-2409",
        messages: [{
          role: "user",
          content: [{ type: "text", text: prompt }].concat(images.map((u) => ({ type: "image_url", image_url: u }))),
        }],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error("Mistral " + (await res.text()).slice(0, 120));
    const j = await res.json();
    return parseLenientJSON(j.choices?.[0]?.message?.content || "");
  }

  async function callGemini(cfg, prompt, images) {
    const model = cfg.options?.model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.api_key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }].concat(images.map((u) => ({ inline_data: { mime_type: "image/jpeg", data: u.split(",")[1] } }))),
        }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error("Gemini " + (await res.text()).slice(0, 120));
    const j = await res.json();
    return parseLenientJSON(j.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
  }

  // Main entry: PDF File + app state → {title, description, categoryId, themeId,
  // departments, startDate, expiryDate} with ids validated against the state.
  async function extractDocFields(file, state) {
    const cfg = await window.DocuApi.aiConfig();
    if (!cfg) throw new Error("noconfig");
    const images = await pdfToImages(file);
    const prompt = buildPrompt(state);
    let r;
    if (cfg.provider === "gemini") r = await callGemini(cfg, prompt, images);
    else r = await callMistral(cfg, prompt, images);
    if (!r || typeof r !== "object") return null;

    // Sanitise: only keep ids/dates that actually validate.
    const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
    const catIds = new Set((state.categories || []).map((c) => c.id));
    const themeIds = new Set((state.themes || []).map((c) => c.id));
    const depIds = new Set((state.departments || []).map((d) => d.id));
    let departments = null;
    if (Array.isArray(r.departments)) {
      const deps = r.departments.filter((d) => d === "*" || depIds.has(d));
      if (deps.includes("*")) departments = ["*"];
      else if (deps.length) departments = deps;
    }
    return {
      title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 200) : null,
      description: typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 1000) : null,
      categoryId: catIds.has(r.categoryId) ? r.categoryId : null,
      themeId: themeIds.has(r.themeId) ? r.themeId : null,
      departments,
      startDate: isDate(r.startDate) ? r.startDate : null,
      expiryDate: isDate(r.expiryDate) ? r.expiryDate : null,
      validityMonths: Number.isFinite(+r.validityMonths) && +r.validityMonths > 0 ? Math.round(+r.validityMonths) : null,
    };
  }

  window.DocuAI = { extractDocFields };
})();
