// Docuhotel — compresión de ficheros en el navegador ANTES de subirlos al
// Storage. Objetivo: "lo máximo comprimible que siga siendo legible".
//
//   - PDF: se renderiza cada página con pdf.js (ya incluido en vendor/, se
//     carga en diferido con window.ensurePdfJs) a un canvas de como mucho
//     MAX_PDF_DIM px y se reconstruye un PDF mínimo con cada página como JPEG
//     (DCTDecode). Esto aplasta los escaneos (contratos, certificados…), que
//     son el 95% del peso. Los PDF de texto nativo casi nunca encogen al
//     rasterizarlos, así que el resultado solo se usa si es < KEEP_RATIO del
//     original — de lo contrario el fichero de texto se sube tal cual y no
//     pierde el texto seleccionable.
//   - Imágenes (jpeg/png/webp): canvas → JPEG recomprimido y reescalado.
//
// Cualquier error (PDF cifrado, pdf.js no carga, canvas sin memoria…) hace
// fallback silencioso al fichero original: subir SIEMPRE gana a comprimir.
(function () {
  const MAX_PDF_DIM = 1500;   // px del lado mayor de cada página renderizada
  const PDF_JPEG_Q = 0.5;
  const MAX_PDF_PAGES = 80;   // por encima, no rasterizamos (bloquearía el móvil)
  const MAX_IMG_DIM = 1600;
  const IMG_JPEG_Q = 0.6;
  const KEEP_RATIO = 0.85;    // el resultado debe bajar al menos un 15%

  function canvasToJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob null"))), "image/jpeg", quality);
    });
  }

  // PDF mínimo válido: catálogo + árbol de páginas + por página (Page,
  // Contents, XObject JPEG). Sin fuentes ni metadatos: solo imágenes.
  function buildPdfFromJpegs(pages) {
    const enc = new TextEncoder();
    const chunks = [];
    let pos = 0;
    const offsets = [0]; // offsets[n] = byte offset del objeto n
    const push = (b) => { chunks.push(b); pos += b.length; };
    const pushStr = (s) => push(enc.encode(s));

    pushStr("%PDF-1.4\n%\xB5\xB5\n");
    const nObjs = 2 + pages.length * 3;
    const pageObj = (i) => 3 + i * 3;
    const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ");

    const beginObj = (n) => { offsets[n] = pos; pushStr(`${n} 0 obj\n`); };
    const endObj = () => pushStr("\nendobj\n");

    beginObj(1); pushStr("<< /Type /Catalog /Pages 2 0 R >>"); endObj();
    beginObj(2); pushStr(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`); endObj();

    pages.forEach((p, i) => {
      const n = pageObj(i);
      const w = p.wPt.toFixed(2), h = p.hPt.toFixed(2);
      beginObj(n);
      pushStr(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
      endObj();
      const content = `q ${w} 0 0 ${h} 0 0 cm /Im Do Q`;
      beginObj(n + 1);
      pushStr(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      endObj();
      beginObj(n + 2);
      pushStr(`<< /Type /XObject /Subtype /Image /Width ${p.wPx} /Height ${p.hPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      pushStr("\nendstream");
      endObj();
    });

    const xrefPos = pos;
    pushStr(`xref\n0 ${nObjs + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= nObjs; n++) pushStr(String(offsets[n]).padStart(10, "0") + " 00000 n \n");
    pushStr(`trailer\n<< /Size ${nObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  async function compressPdf(file) {
    const lib = await window.ensurePdfJs();
    if (!lib) return file;
    const data = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: data.slice(0) }).promise;
    if (pdf.numPages > MAX_PDF_PAGES) { pdf.destroy(); return file; }
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3, MAX_PDF_DIM / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // los PDF pueden tener fondo transparente
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await canvasToJpeg(canvas, PDF_JPEG_Q);
      pages.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        wPx: canvas.width, hPx: canvas.height, wPt: vp1.width, hPt: vp1.height,
      });
      canvas.width = canvas.height = 0; // libera memoria en móviles
    }
    pdf.destroy();
    const bytes = buildPdfFromJpegs(pages);
    if (bytes.length >= file.size * KEEP_RATIO) return file;
    return new File([bytes], file.name, { type: "application/pdf" });
  }

  async function compressImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMG_DIM / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG con alfa → fondo blanco, no negro
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await canvasToJpeg(canvas, IMG_JPEG_Q);
    if (blob.size >= file.size * KEEP_RATIO) return file;
    const name = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  }

  async function compressForUpload(file) {
    if (!file || typeof file.arrayBuffer !== "function") return file;
    try {
      let out = file;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) out = await compressPdf(file);
      else if (/^image\/(jpeg|png|webp)$/.test(file.type || "")) out = await compressImage(file);
      if (out !== file) {
        console.info(`Docuhotel compress: ${file.name} ${file.size} -> ${out.size} bytes (${Math.round((100 * out.size) / file.size)}%)`);
      }
      return out;
    } catch (e) {
      console.warn("Docuhotel compress: fallback al original —", e?.message || e);
      return file;
    }
  }

  window.DocuCompress = { compressForUpload };
})();
