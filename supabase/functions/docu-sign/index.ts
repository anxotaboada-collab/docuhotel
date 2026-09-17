// docu-sign — módulo de firma electrónica de Docuhotel.
//
// Es el ÚNICO camino a las tablas sign_* (que tienen RLS sin políticas): aquí
// viven los tokens personales de firma y los hashes de los OTP, y si el front
// pudiera leerlos cualquiera podría firmar en nombre de otro.
//
// Dos mundos en la misma función:
//   · Operaciones del hotel (list/detail/create/remind/cancel/file/audit): exigen
//     el JWT de un usuario de Docuhotel con rol admin o dept_head en ese hotel.
//   · Operaciones del firmante (open/progress/otp/verify/sign/decline): sin
//     login, autenticadas por el token del enlace personal.
//
// Nivel de firma: FIRMA ELECTRÓNICA SIMPLE REFORZADA (eIDAS art. 25 / Ley 6/2020).
// Lo que se conserva como prueba de cada firma:
//   · enlace personal e irrepetible por firmante,
//   · código de un solo uso enviado a SU correo (prueba de control del buzón),
//   · lectura efectiva del documento (páginas vistas y tiempo en pantalla),
//   · consentimiento expreso con el literal exacto que aceptó (y su hash),
//   · firma manuscrita digitalizada o nombre tecleado,
//   · IP y user-agent de cada paso, con hora del servidor,
//   · SHA-256 del PDF enviado, de la imagen de la firma y del PDF final,
//   · rastro de eventos append-only ENCADENADO POR HASH (sign_event),
//   · sello de tiempo RFC-3161 de una TSA externa sobre el PDF final (best-effort).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const BUCKET = 'docuhotel';
const APP_URL = 'https://docuhotel.vercel.app';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/* ────────────────────────────── utilidades ────────────────────────────── */

const enc = new TextEncoder();

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function genOtp(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  return String(n % 1000000).padStart(6, '0');
}

function reqMeta(req: Request) {
  const h = req.headers;
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('cf-connecting-ip') || null;
  return { ip: ip || null, ua: (h.get('user-agent') || '').slice(0, 400) || null };
}

// Fecha larga en hora peninsular, que es la que entiende quien lee el certificado.
function fmtES(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }) + ' (hora peninsular)';
  } catch { return String(iso); }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Helvetica de pdf-lib solo sabe WinAnsi: cualquier carácter fuera (comillas
// tipográficas, guiones largos, emoji) reventaría el guardado del PDF.
function win(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // deja pasar el latín-1 imprimible (acentos y ñ incluidos) y tira el resto
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, '');
}

async function secrets(): Promise<Record<string, string>> {
  const { data } = await db.from('integration_secrets').select('key,value');
  const out: Record<string, string> = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

/* ─────────────────────────────── correo ─────────────────────────────── */

type Attach = { content: string; name: string };

async function sendEmail(to: { email: string; name?: string }[], subject: string, html: string, attachment?: Attach[]) {
  const list = (to || []).filter((x) => x && x.email);
  if (!list.length) return { ok: false, error: 'sin destinatarios' };
  const sec = await secrets();
  const apiKey = sec.brevo_api_key;
  if (!apiKey) return { ok: false, error: 'falta brevo_api_key' };
  const payload: Record<string, unknown> = {
    sender: { name: sec.brevo_from_name || 'Docuhotel', email: sec.brevo_from_email || 'anxo.taboada@gmail.com' },
    to: list.map((x) => ({ email: x.email, name: x.name || undefined })),
    subject, htmlContent: html,
  };
  if (attachment?.length) payload.attachment = attachment;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `brevo ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

const SHELL = (hotel: string, body: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f4f5f7;padding:26px 12px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e5e8;border-radius:10px;overflow:hidden">
    <div style="background:#111;color:#fff;padding:14px 20px;font-size:14px;font-weight:600">Docuhotel · ${esc(hotel)}</div>
    <div style="padding:22px 20px;color:#1f2430;font-size:14.5px;line-height:1.6">${body}</div>
    <div style="padding:12px 20px;border-top:1px solid #eee;color:#8a8f98;font-size:11.5px;line-height:1.5">
      Firma electrónica simple reforzada (Reglamento (UE) 910/2014, art. 25 · Ley 6/2020).
      Este mensaje y la actividad asociada quedan registrados como prueba.
    </div>
  </div>
</div>`;

const BTN = (href: string, label: string) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(label)}</a></p>
   <p style="font-size:12px;color:#8a8f98;word-break:break-all;margin:0">Si el botón no funciona, copia este enlace:<br>${esc(href)}</p>`;

const signUrl = (token: string) => `${APP_URL}/#/sign/${token}`;

/* ───────────────────── rastro de auditoría encadenado ───────────────────── */

// Forma canónica para el hash: claves ordenadas y sin depender de cómo devuelva
// Postgres el JSON. `detail` se guarda como jsonb, que reordena las claves a su
// antojo, y la marca de tiempo vuelve como '+00:00' en vez de 'Z'. Hasheando el
// texto tal cual, al recalcular la cadena NUNCA cuadraba y el certificado acusaba
// de manipulado un rastro intacto.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) if (o[k] !== undefined) out[k] = canon(o[k]);
    return out;
  }
  return v;
}
function eventPayload(prev: string, ts: string, type: string, signerId: string | null, detail: unknown) {
  return JSON.stringify(canon({ prev, ts: new Date(ts).toISOString(), type, signerId: signerId || null, detail }));
}

async function appendEvent(
  envelopeId: string, signerId: string | null, type: string,
  detail: Record<string, unknown>, meta: { ip?: string | null; ua?: string | null } = {},
) {
  const { data: last } = await db.from('sign_event')
    .select('hash').eq('envelope_id', envelopeId).order('id', { ascending: false }).limit(1).maybeSingle();
  const prev = last?.hash || 'GENESIS';
  const ts = new Date().toISOString();
  const hash = await sha256Hex(eventPayload(prev, ts, type, signerId, detail));
  await db.from('sign_event').insert({
    envelope_id: envelopeId, signer_id: signerId, ts, type, detail,
    ip: meta.ip || null, ua: meta.ua || null, prev_hash: prev, hash,
  });
  return hash;
}

// Rehace la cadena desde el principio: si algún evento fue tocado a posteriori,
// el hash recalculado deja de coincidir y el certificado lo dice.
async function verifyChain(envelopeId: string) {
  const { data } = await db.from('sign_event')
    .select('id,ts,type,signer_id,detail,prev_hash,hash,ip,ua').eq('envelope_id', envelopeId).order('id');
  let prev = 'GENESIS';
  let ok = true;
  for (const e of data || []) {
    const calc = await sha256Hex(eventPayload(prev, e.ts, e.type, e.signer_id, e.detail));
    if (e.prev_hash !== prev || calc !== e.hash) { ok = false; break; }
    prev = e.hash;
  }
  return { ok, last: ok ? prev : null, events: data || [] };
}

/* ─────────────────── sello de tiempo RFC-3161 (best-effort) ─────────────────── */

function der(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let header: number[];
  if (len < 0x80) header = [tag, len];
  else {
    const bytes: number[] = [];
    let n = len;
    while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
    header = [tag, 0x80 | bytes.length, ...bytes];
  }
  return new Uint8Array([...header, ...content]);
}

// TimeStampReq ::= SEQUENCE { version INTEGER(1), messageImprint MessageImprint, certReq BOOLEAN }
function tsQuery(hashHex: string): Uint8Array {
  const digest = new Uint8Array(hashHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const sha256Oid = new Uint8Array([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
  const algId = der(0x30, new Uint8Array([...sha256Oid, 0x05, 0x00]));
  const imprint = der(0x30, new Uint8Array([...algId, ...der(0x04, digest)]));
  const version = new Uint8Array([0x02, 0x01, 0x01]);
  const certReq = new Uint8Array([0x01, 0x01, 0xff]);
  return der(0x30, new Uint8Array([...version, ...imprint, ...certReq]));
}

// Dentro de la respuesta viene un GeneralizedTime 'YYYYMMDDhhmmssZ'; con eso basta
// para enseñar la fecha en el certificado. El token entero se guarda en base64 para
// que un tercero pueda verificarlo con `openssl ts -verify`.
function tsGenTime(resp: Uint8Array): string | null {
  for (let i = 0; i < resp.length - 17; i++) {
    if (resp[i] === 0x18 && resp[i + 1] === 15) {
      const s = String.fromCharCode(...resp.slice(i + 2, i + 17));
      const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
    }
  }
  return null;
}

const TSAS = [
  { name: 'FreeTSA (freetsa.org)', url: 'https://freetsa.org/tsr' },
  { name: 'DigiCert', url: 'http://timestamp.digicert.com' },
];

async function rfc3161(hashHex: string) {
  const body = tsQuery(hashHex);
  for (const tsa of TSAS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(tsa.url, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/timestamp-query' },
        body,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 40) continue;
      const genTime = tsGenTime(buf);
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { provider: tsa.name, genTime, token: btoa(bin) };
    } catch (_e) { /* siguiente TSA */ }
  }
  return null;
}

/* ────────────────────────────── autenticación ────────────────────────────── */

// Usuario de Docuhotel + hoteles a los que llega. Se calcula aquí a mano porque
// las funciones user_can_access()/user_is_regional() del esquema van por auth.uid()
// y aquí entramos con la service role.
async function authUser(req: Request, body: Record<string, unknown>) {
  const hdr = req.headers.get('Authorization') || '';
  const token = String(body.authToken || '') || hdr.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  const u = data?.user;
  if (error || !u) return null;
  const { data: row } = await db.from('app_users')
    .select('id,hotel_id,name,email,role,active,is_regional').eq('id', u.id).maybeSingle();
  if (!row || row.active === false) return null;
  let hotels: string[] = [row.hotel_id];
  if (row.is_regional) {
    const { data: all } = await db.from('hotels').select('id');
    hotels = (all || []).map((h: { id: string }) => h.id);
  } else {
    const { data: extra } = await db.from('user_hotels').select('hotel_id').eq('user_id', u.id);
    hotels = [...new Set([row.hotel_id, ...(extra || []).map((x: { hotel_id: string }) => x.hotel_id)])];
  }
  return { ...row, hotels };
}

// Enviar a firmar es un acto de gestión documental: mismo listón que subir o
// editar documentos (admin / jefe de departamento / regional).
const canManage = (u: { role: string; is_regional: boolean } | null) =>
  !!u && (u.is_regional || u.role === 'admin' || u.role === 'dept_head');

async function signerByToken(t: string) {
  if (!t) return null;
  const { data: signer } = await db.from('sign_signer').select('*').eq('token', t).maybeSingle();
  if (!signer) return null;
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', signer.envelope_id).maybeSingle();
  if (!env) return null;
  return { signer, env };
}

async function hotelName(id: string): Promise<string> {
  const { data } = await db.from('hotels').select('name').eq('id', id).maybeSingle();
  return data?.name || 'Hotel';
}

const CONSENT_ES = (docTitle: string) =>
  `Declaro que he recibido, abierto y leído íntegramente el documento «${docTitle}», que comprendo su contenido y que lo firmo ` +
  `electrónicamente por mi propia voluntad. Acepto que esta firma electrónica —realizada mediante enlace personal, código de un solo ` +
  `uso enviado a mi correo y firma manuscrita digitalizada— tenga la misma validez y produzca los mismos efectos que mi firma ` +
  `manuscrita en papel, conforme al artículo 25 del Reglamento (UE) 910/2014 (eIDAS) y a la Ley 6/2020. Acepto asimismo que queden ` +
  `registrados como prueba la fecha y hora, mi dirección IP, el dispositivo utilizado y el rastro completo de mi actividad sobre el documento.`;

/* ──────────────────────── PDF final: firmas + certificado ──────────────────────── */

type Signer = Record<string, any>;

async function buildSignedPdf(env: Record<string, any>, signers: Signer[], chain: { ok: boolean; last: string | null; events: any[] }) {
  const { data: file } = await db.storage.from(BUCKET).download(env.file_key);
  if (!file) throw new Error('no se pudo leer el PDF original');
  const original = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const short = String(env.id).slice(0, 8).toUpperCase();

  // 1) Sello al pie de cada página del original (como hace DocuSign): identifica
  //    el sobre sin tapar el contenido y hace evidente de dónde sale el papel.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    const line = win(`Firmado electronicamente con Docuhotel · Sobre ${short} · SHA-256 doc. ${String(env.file_sha256).slice(0, 16)} · pag. ${i + 1}/${pages.length}`);
    p.drawText(line, { x: 24, y: 12, size: 6.5, font: helv, color: rgb(0.45, 0.45, 0.48), maxWidth: width - 48 });
  });

  // 2) Página de firmas y 3) certificado de auditoría.
  const A4: [number, number] = [595.28, 841.89];
  const M = 46;
  let page = pdf.addPage(A4);
  let y = A4[1] - M;

  const room = (h: number) => { if (y - h < M + 24) { page = pdf.addPage(A4); y = A4[1] - M; } };
  const text = (s: string, size = 10, f = helv, color = rgb(0.12, 0.14, 0.18), gap = 4) => {
    const maxW = A4[0] - M * 2;
    for (const raw of win(s).split('\n')) {
      const words = raw.split(' ');
      let line = '';
      const flush = () => { room(size + gap); page.drawText(line, { x: M, y, size, font: f, color }); y -= size + gap; line = ''; };
      for (const w of words) {
        const next = line ? line + ' ' + w : w;
        // La palabra que desborda abre la línea siguiente. Antes se descartaba al
        // hacer flush() y el certificado imprimía el consentimiento con huecos.
        if (f.widthOfTextAtSize(next, size) > maxW && line) { flush(); line = w; }
        else line = next;
      }
      flush();
    }
  };
  const heading = (s: string) => {
    y -= 8; room(26);
    page.drawText(win(s), { x: M, y, size: 14, font: bold, color: rgb(0.07, 0.08, 0.1) });
    y -= 8;
    page.drawRectangle({ x: M, y, width: A4[0] - M * 2, height: 1, color: rgb(0.85, 0.86, 0.88) });
    y -= 14;
  };
  const kv = (k: string, v: string) => {
    room(14);
    page.drawText(win(k), { x: M, y, size: 9, font: bold, color: rgb(0.35, 0.37, 0.42) });
    page.drawText(win(v), { x: M + 132, y, size: 9, font: helv, color: rgb(0.12, 0.14, 0.18), maxWidth: A4[0] - M * 2 - 132 });
    y -= 13;
  };

  heading('Pagina de firmas');
  text('Este documento ha sido firmado electronicamente por las personas relacionadas a continuacion. La firma se realizo de forma remota mediante Docuhotel, con enlace personal, verificacion por codigo de un solo uso enviado al correo del firmante y consentimiento expreso.', 9.5, helv, rgb(0.3, 0.32, 0.36), 3);
  y -= 6;
  kv('Documento', env.title);
  kv('Archivo', `${env.file_name || 'documento.pdf'} (${env.page_count || pages.length} pag.)`);
  kv('SHA-256 del original', env.file_sha256);
  kv('Identificador del sobre', String(env.id));
  kv('Enviado por', `${env.created_by_name || '-'} <${env.created_by_email || '-'}>`);
  kv('Enviado el', fmtES(env.created_at));
  y -= 10;

  for (const s of signers) {
    room(112);
    const boxTop = y;
    const boxH = 100;
    page.drawRectangle({ x: M, y: boxTop - boxH, width: A4[0] - M * 2, height: boxH, borderColor: rgb(0.84, 0.85, 0.88), borderWidth: 1, color: rgb(0.985, 0.987, 0.99) });
    let ty = boxTop - 18;
    page.drawText(win(s.name), { x: M + 12, y: ty, size: 11.5, font: bold, color: rgb(0.07, 0.08, 0.1) }); ty -= 14;
    page.drawText(win(s.email), { x: M + 12, y: ty, size: 9, font: helv, color: rgb(0.4, 0.42, 0.46) }); ty -= 13;
    if (s.id_number) { page.drawText(win('Documento de identidad: ' + s.id_number), { x: M + 12, y: ty, size: 9, font: helv, color: rgb(0.4, 0.42, 0.46) }); ty -= 13; }
    page.drawText(win('Firmado: ' + fmtES(s.signed_at)), { x: M + 12, y: ty, size: 9, font: helv, color: rgb(0.4, 0.42, 0.46) }); ty -= 12;
    page.drawText(win(`IP ${s.ip || '-'} · codigo OTP verificado: ${s.otp_verified_at ? 'si' : 'no aplicaba'}`), { x: M + 12, y: ty, size: 8, font: helv, color: rgb(0.5, 0.52, 0.56) });

    // La firma manuscrita, a la derecha del bloque de datos.
    if (s.signature_key) {
      try {
        const { data: png } = await db.storage.from(BUCKET).download(s.signature_key);
        if (png) {
          const img = await pdf.embedPng(new Uint8Array(await png.arrayBuffer()));
          const maxW = 190, maxH = 62;
          const sc = Math.min(maxW / img.width, maxH / img.height, 1);
          page.drawImage(img, { x: A4[0] - M - 14 - img.width * sc, y: boxTop - 26 - img.height * sc, width: img.width * sc, height: img.height * sc });
        }
      } catch (_e) { /* si la imagen falla, el bloque de datos ya prueba la firma */ }
    } else if (s.typed_name) {
      page.drawText(win('/' + s.typed_name + '/'), { x: A4[0] - M - 210, y: boxTop - 54, size: 17, font: bold, color: rgb(0.1, 0.12, 0.16) });
    }
    y = boxTop - boxH - 12;
  }

  page = pdf.addPage(A4); y = A4[1] - M;
  heading('Certificado de firma electronica');
  text('Documento probatorio generado automaticamente por Docuhotel. Acredita quien firmo, cuando, desde donde y sobre que contenido exacto.', 9.5, helv, rgb(0.3, 0.32, 0.36), 3);
  y -= 4;
  kv('Sobre', String(env.id));
  kv('Completado el', fmtES(env.completed_at || new Date().toISOString()));
  kv('Tipo de firma', 'Electronica simple reforzada (eIDAS art. 25 · Ley 6/2020)');
  kv('Autenticacion', env.require_otp ? 'Enlace personal + codigo de un solo uso al correo del firmante' : 'Enlace personal unico por firmante');
  kv('Lectura exigida', env.require_read ? 'Si - habia que recorrer el documento hasta el final' : 'No exigida');
  kv('Integridad', 'SHA-256 del documento y cadena de eventos encadenada por hash');
  // El sello se pide SOBRE este PDF ya terminado, así que su token no puede vivir
  // dentro del propio PDF (cambiaría el hash sellado). Se dice aquí y se guarda
  // en el sobre, de donde sale con la exportación del rastro.
  kv('Sello de tiempo', 'RFC-3161 de una TSA externa sobre el SHA-256 de este PDF; el token se conserva en Docuhotel');
  kv('Cadena de auditoria', chain.ok ? `INTEGRA - ultimo eslabon ${String(chain.last).slice(0, 32)}` : 'ALTERADA (revisar)');
  y -= 8;

  heading('Consentimiento aceptado por cada firmante');
  text(env.consent_text, 8.5, helv, rgb(0.3, 0.32, 0.36), 2.5);
  y -= 2;
  kv('SHA-256 del consentimiento', env.consent_sha256);
  y -= 6;

  heading('Rastro completo de la actividad');
  const names: Record<string, string> = {};
  for (const s of signers) names[s.id] = s.name;
  const LABEL: Record<string, string> = {
    created: 'Sobre creado', invited: 'Invitacion enviada por correo', invite_failed: 'Fallo al enviar el correo',
    link_generated: 'Enlace generado para envio manual', reminded: 'Recordatorio enviado',
    opened: 'Documento abierto por el firmante', read_completed: 'Lectura completada',
    otp_sent: 'Codigo de un solo uso enviado', otp_verified: 'Codigo verificado correctamente', otp_failed: 'Codigo incorrecto',
    signed: 'FIRMADO', declined: 'Firma rechazada', completed: 'Sobre completado', cancelled: 'Sobre anulado',
  };
  for (const e of chain.events) {
    const who = e.signer_id ? names[e.signer_id] || '' : '';
    room(30);
    page.drawText(win(fmtES(e.ts).replace(' (hora peninsular)', '')), { x: M, y, size: 8, font: helv, color: rgb(0.45, 0.47, 0.5) });
    page.drawText(win((LABEL[e.type] || e.type) + (who ? ' - ' + who : '')), { x: M + 118, y, size: 8.5, font: e.type === 'signed' ? bold : helv, color: rgb(0.12, 0.14, 0.18), maxWidth: A4[0] - M * 2 - 118 });
    y -= 10.5;
    const bits: string[] = [];
    if (e.ip) bits.push('IP ' + e.ip);
    if (e.detail?.pagesViewed) bits.push(`paginas vistas ${e.detail.pagesViewed}/${e.detail.totalPages || '?'}`);
    if (e.detail?.readSeconds) bits.push(`${e.detail.readSeconds}s en pantalla`);
    if (e.detail?.signatureSha256) bits.push('SHA-256 firma ' + String(e.detail.signatureSha256).slice(0, 24));
    if (e.ua) bits.push(String(e.ua).slice(0, 88));
    if (bits.length) { page.drawText(win(bits.join(' · ')), { x: M + 118, y, size: 7, font: helv, color: rgb(0.5, 0.52, 0.56), maxWidth: A4[0] - M * 2 - 118 }); y -= 9; }
    page.drawText(win('hash ' + String(e.hash).slice(0, 40)), { x: M + 118, y, size: 6.2, font: helv, color: rgb(0.66, 0.68, 0.71) });
    y -= 12;
  }

  y -= 6;
  heading('Como verificar este documento');
  text('1. Calcule el SHA-256 del PDF original que se envio a firmar y comparelo con el valor impreso en la pagina de firmas.\n' +
    '2. Solicite al hotel la exportacion del rastro de auditoria (JSON) desde Docuhotel: cada evento incluye su hash y el del evento anterior; recalculando la cadena se comprueba que nada fue alterado.\n' +
    '3. Pida al hotel el sello de tiempo RFC-3161 de este PDF (viene en la exportacion del rastro) y verifiquelo con "openssl ts -verify": acredita ante un tercero que el documento ya existia en esa fecha.\n',
    8.5, helv, rgb(0.3, 0.32, 0.36), 2.5);

  return await pdf.save();
}

/* ────────────────────────────── finalización ────────────────────────────── */

async function finalize(envId: string) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', envId).maybeSingle();
  if (!env || env.status === 'completed') return;
  const { data: signers } = await db.from('sign_signer').select('*').eq('envelope_id', envId).order('order_idx');
  const all = signers || [];
  if (!all.length || all.some((s) => s.status !== 'signed')) return;

  const completedAt = new Date().toISOString();
  await appendEvent(envId, null, 'completed', { signers: all.length });
  const chain = await verifyChain(envId);

  const bytes = await buildSignedPdf({ ...env, completed_at: completedAt }, all, chain);
  const sha = await sha256Hex(bytes);
  const key = `sign/${envId}/firmado.pdf`;
  await db.storage.from(BUCKET).upload(key, bytes, { contentType: 'application/pdf', upsert: true });

  const stamp = await rfc3161(sha);
  await db.from('sign_envelope').update({
    status: 'completed', completed_at: completedAt,
    signed_file_key: key, signed_sha256: sha,
    tsa_provider: stamp?.provider || null, tsa_gen_time: stamp?.genTime || null, tsa_token: stamp?.token || null,
  }).eq('id', envId);

  // El PDF probatorio va a todos: firmantes y remitente. Que cada uno tenga su copia.
  const hotel = await hotelName(env.hotel_id);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const attach: Attach[] = [{ content: btoa(bin), name: `firmado_${String(env.title).replace(/[^\w.\-]+/g, '_').slice(0, 60)}.pdf` }];
  const rows = all.map((s) => `<li>${esc(s.name)} — ${fmtES(s.signed_at)}</li>`).join('');
  const html = SHELL(hotel, `
    <p><strong>Documento firmado por todas las partes.</strong></p>
    <p style="margin:0 0 6px"><strong>${esc(env.title)}</strong></p>
    <ul style="padding-left:18px;margin:10px 0">${rows}</ul>
    <p style="font-size:13px;color:#4b5160">Adjuntamos el PDF firmado, que incluye la página de firmas y el certificado de auditoría con el rastro completo.
    Huella SHA-256 del PDF firmado:<br><code style="font-size:11px;word-break:break-all">${esc(sha)}</code></p>`);
  const to = all.map((s) => ({ email: s.email, name: s.name }));
  if (env.created_by_email) to.push({ email: env.created_by_email, name: env.created_by_name || '' });
  await sendEmail(to, `Documento firmado: ${env.title}`, html, attach);
}

/* ─────────────────────────── operaciones del hotel ─────────────────────────── */

// PDF subido suelto para firmar (un contrato que no está en el gestor). El
// navegador lo sube con la sesión del usuario —la política storage_docs_write ya
// exige admin/dept_head/regional en ese hotel— a esta ruta temporal, y aquí se
// valida, se congela en sign/<sobre>/original.pdf y se borra la temporal.
const UPLOAD_RE = /^docs\/([0-9a-f-]{36})\/_firma\/[0-9a-f-]{36}\.pdf$/i;
const MAX_PDF = 50 * 1024 * 1024;

async function opCreate(req: Request, body: any, user: any) {
  const hotelId = String(body.hotelId || '');
  if (!user.hotels.includes(hotelId)) return json({ error: 'Sin acceso a ese hotel' }, 403);

  const uploadKey = body.uploadKey ? String(body.uploadKey) : '';
  if (uploadKey) {
    const m = uploadKey.match(UPLOAD_RE);
    if (!m || m[1].toLowerCase() !== hotelId.toLowerCase()) return json({ error: 'Archivo subido no válido' }, 400);
    if (body.documentId) return json({ error: 'Elige un documento del gestor o sube un PDF, no las dos cosas' }, 400);
  }
  // La subida temporal se borra pase lo que pase: si el sobre se crea, ya existe
  // su copia congelada; si falla, no debe quedar un contrato huérfano en Storage.
  try {
    return await createEnvelope(req, body, user, hotelId, uploadKey);
  } finally {
    if (uploadKey) {
      try { await db.storage.from(BUCKET).remove([uploadKey]); } catch (_e) { /* best-effort */ }
    }
  }
}

async function createEnvelope(req: Request, body: any, user: any, hotelId: string, uploadKey: string) {
  // El origen del PDF sale SOLO de dos sitios comprobados: un documento al que el
  // usuario llega, o su propia subida. Nunca de una ruta libre que mande el
  // navegador: la función lee Storage con la service role y podría sacar a firmar
  // el archivo de otro hotel.
  let doc: any = null;
  let fileKey = uploadKey;
  if (!uploadKey) {
    if (!body.documentId) return json({ error: 'Elige un documento o sube un PDF' }, 400);
    doc = (await db.from('documents').select('*').eq('id', String(body.documentId)).maybeSingle()).data;
    if (!doc) return json({ error: 'Documento no encontrado' }, 404);
    let reachable = user.hotels.includes(doc.hotel_id);
    if (!reachable) {
      const { data: shared } = await db.from('document_hotels')
        .select('hotel_id').eq('document_id', doc.id).eq('hotel_id', hotelId).maybeSingle();
      reachable = !!shared;
    }
    if (!reachable) return json({ error: 'Sin acceso a ese documento' }, 403);
    fileKey = doc.file_key;
    if (!fileKey) return json({ error: 'El documento no tiene archivo adjunto' }, 400);
  }

  const signers = (body.signers || []).filter((s: any) => s?.email && s?.name);
  if (!signers.length) return json({ error: 'Añade al menos un firmante' }, 400);
  for (const s of signers) {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(s.email).trim())) return json({ error: `Email no válido: ${s.email}` }, 400);
  }

  // Copia CONGELADA del PDF: lo que se firma no puede cambiar después aunque el
  // documento del gestor se sustituya por una versión nueva.
  const { data: src } = await db.storage.from(BUCKET).download(fileKey);
  if (!src) return json({ error: uploadKey ? 'No se encontró el PDF subido. Vuelve a intentarlo.' : 'No se pudo leer el archivo del documento' }, 400);
  const bytes = new Uint8Array(await src.arrayBuffer());
  if (bytes.length > MAX_PDF) return json({ error: 'El PDF supera los 50 MB' }, 400);
  // Firma de fichero: la extensión y el tipo MIME los pone el navegador y no prueban nada.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) return json({ error: 'El archivo no es un PDF' }, 400);
  const fileSha = await sha256Hex(bytes);
  let pageCount: number | null = null;
  try {
    const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // Un PDF cifrado (con contraseña o con restricciones) no se puede sellar: pdf-lib
    // escribiría páginas nuevas sin cifrar dentro de un fichero cifrado y el PDF
    // firmado saldría roto justo al final, cuando ya han firmado todos.
    if (probe.isEncrypted) {
      return json({ error: 'El PDF está protegido (contraseña o restricciones). Ábrelo e imprímelo como PDF nuevo sin protección, y súbelo otra vez.' }, 400);
    }
    pageCount = probe.getPageCount();
  } catch { return json({ error: 'Solo se pueden enviar a firmar documentos PDF válidos' }, 400); }
  if (!pageCount) return json({ error: 'El PDF no tiene páginas' }, 400);

  const id = crypto.randomUUID();
  const key = `sign/${id}/original.pdf`;
  const up = await db.storage.from(BUCKET).upload(key, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) return json({ error: 'No se pudo preparar el documento: ' + up.error.message }, 500);

  const title = String(body.title || doc?.title || 'Documento').trim().slice(0, 200) || 'Documento';
  const consent = String(body.consentText || CONSENT_ES(title));
  const days = Math.min(180, Math.max(1, Number(body.expiresDays) || 30));
  let fileName = doc?.file_name || String(body.fileName || '').replace(/[\\/\x00-\x1f]+/g, '_').trim().slice(0, 160) || 'documento.pdf';
  if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
  const env = {
    id, hotel_id: hotelId, document_id: doc?.id || null,
    title, message: String(body.message || '').slice(0, 4000),
    file_key: key, file_name: fileName,
    file_size: bytes.length, file_mime: 'application/pdf', file_sha256: fileSha, page_count: pageCount,
    mode: body.mode === 'sequential' ? 'sequential' : 'parallel',
    require_otp: body.requireOtp !== false,
    require_read: body.requireRead !== false,
    require_id: !!body.requireId,
    signature_kind: body.signatureKind === 'typed' ? 'typed' : 'draw',
    consent_text: consent, consent_sha256: await sha256Hex(consent),
    status: 'sent',
    expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    created_by: user.id, created_by_name: user.name, created_by_email: user.email,
  };
  const { error: e1 } = await db.from('sign_envelope').insert(env);
  if (e1) return json({ error: e1.message }, 500);

  const rows = signers.map((s: any, i: number) => ({
    envelope_id: id, order_idx: i, name: String(s.name).slice(0, 120),
    email: String(s.email).trim().toLowerCase(), token: randToken(24),
  }));
  const { data: inserted, error: e2 } = await db.from('sign_signer').insert(rows).select('*');
  if (e2) return json({ error: e2.message }, 500);

  const meta = reqMeta(req);
  await appendEvent(id, null, 'created', {
    title, docSha256: fileSha, pages: pageCount,
    source: doc ? 'gestor' : 'subido', fileName,
    by: `${user.name} <${user.email}>`, signers: rows.map((r: any) => `${r.name} <${r.email}>`),
    requireOtp: env.require_otp, requireRead: env.require_read, mode: env.mode,
  }, meta);

  // "Enviar ahora" manda el correo. Si no, solo se generan los enlaces para
  // pegarlos en el correo de siempre, en WhatsApp o donde haga falta.
  const hotel = await hotelName(hotelId);
  const list = (inserted || []).sort((a, b) => a.order_idx - b.order_idx);
  const sendNow = body.send !== false;
  for (const s of list) {
    const itsTurn = env.mode === 'parallel' || s.order_idx === 0;
    if (sendNow && itsTurn) {
      const r = await sendEmail([{ email: s.email, name: s.name }], `Firma requerida: ${title}`, SHELL(hotel, `
        <p>Hola <strong>${esc(s.name)}</strong>,</p>
        <p>${esc(user.name)} te pide que leas y firmes electrónicamente el documento <strong>${esc(title)}</strong>.</p>
        ${body.message ? `<p style="background:#f7f8fa;border-left:3px solid #111;padding:10px 12px;margin:14px 0;white-space:pre-wrap">${esc(body.message)}</p>` : ''}
        ${BTN(signUrl(s.token), 'Leer y firmar el documento')}
        <p style="font-size:12.5px;color:#4b5160">El enlace es personal e intransferible y caduca el ${esc(fmtES(env.expires_at))}.</p>`));
      await db.from('sign_signer').update({ invited_at: new Date().toISOString() }).eq('id', s.id);
      await appendEvent(id, s.id, r.ok ? 'invited' : 'invite_failed', { email: s.email, error: r.ok ? undefined : r.error }, meta);
    } else {
      await appendEvent(id, s.id, 'link_generated', { email: s.email, mode: sendNow ? 'en espera de turno' : 'envío manual' }, meta);
    }
  }
  return json({ ok: true, id, sent: sendNow, signers: list.map((s) => ({ id: s.id, name: s.name, email: s.email, url: signUrl(s.token) })) });
}

async function opList(body: any, user: any) {
  const hotelId = String(body.hotelId || '');
  if (!user.hotels.includes(hotelId)) return json({ error: 'Sin acceso a ese hotel' }, 403);
  const { data: envs } = await db.from('sign_envelope')
    .select('id,document_id,title,message,status,mode,require_otp,require_read,require_id,signature_kind,expires_at,created_at,completed_at,created_by_name,created_by_email,file_name,page_count,file_sha256,signed_sha256,tsa_provider,tsa_gen_time')
    .eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(300);
  const ids = (envs || []).map((e) => e.id);
  let signers: any[] = [];
  if (ids.length) {
    const { data } = await db.from('sign_signer')
      .select('id,envelope_id,order_idx,name,email,token,status,invited_at,first_opened_at,read_completed_at,signed_at,declined_at,decline_reason,pages_viewed,read_seconds,ip,reminders')
      .in('envelope_id', ids).order('order_idx');
    signers = data || [];
  }
  return json({
    ok: true,
    envelopes: (envs || []).map((e) => ({
      ...e,
      signers: signers.filter((s) => s.envelope_id === e.id).map(({ token, ...s }) => ({ ...s, url: signUrl(token) })),
    })),
  });
}

async function opDetail(body: any, user: any) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', body.envelopeId).maybeSingle();
  if (!env || !user.hotels.includes(env.hotel_id)) return json({ error: 'No encontrado' }, 404);
  const { data: signers } = await db.from('sign_signer').select('*').eq('envelope_id', env.id).order('order_idx');
  const chain = await verifyChain(env.id);
  const { tsa_token, ...envSafe } = env;
  return json({
    ok: true,
    envelope: { ...envSafe, has_tsa_token: !!tsa_token },
    signers: (signers || []).map(({ token, otp_hash, ...s }) => ({ ...s, url: signUrl(token) })),
    chainOk: chain.ok, chainLast: chain.last,
    events: chain.events,
  });
}

async function opRemind(req: Request, body: any, user: any) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', body.envelopeId).maybeSingle();
  if (!env || !user.hotels.includes(env.hotel_id)) return json({ error: 'No encontrado' }, 404);
  if (env.status !== 'sent') return json({ error: 'El sobre ya no está activo' }, 400);
  const { data: all } = await db.from('sign_signer').select('*').eq('envelope_id', env.id).order('order_idx');
  const list = all || [];
  // En orden secuencial solo tiene sentido recordárselo a quien tiene el turno.
  const turnIdx = list.findIndex((s) => s.status !== 'signed' && s.status !== 'declined');
  const pending = list.filter((s, i) =>
    s.status !== 'signed' && s.status !== 'declined' &&
    (!body.signerId || s.id === body.signerId) &&
    (env.mode === 'parallel' || i === turnIdx));
  if (!pending.length) return json({ error: 'No queda nadie a quien recordar' }, 400);
  const hotel = await hotelName(env.hotel_id);
  const meta = reqMeta(req);
  for (const s of pending) {
    const r = await sendEmail([{ email: s.email, name: s.name }], `Recordatorio de firma: ${env.title}`, SHELL(hotel, `
      <p>Hola <strong>${esc(s.name)}</strong>,</p>
      <p>Te recordamos que tienes pendiente leer y firmar <strong>${esc(env.title)}</strong>.</p>
      ${BTN(signUrl(s.token), 'Leer y firmar ahora')}
      <p style="font-size:12.5px;color:#4b5160">El enlace caduca el ${esc(fmtES(env.expires_at))}.</p>`));
    await db.from('sign_signer').update({
      reminded_at: new Date().toISOString(), reminders: (s.reminders || 0) + 1,
      invited_at: s.invited_at || new Date().toISOString(),
    }).eq('id', s.id);
    await appendEvent(env.id, s.id, r.ok ? 'reminded' : 'invite_failed', { email: s.email, error: r.ok ? undefined : r.error }, meta);
  }
  return json({ ok: true, sent: pending.length });
}

async function opCancel(req: Request, body: any, user: any) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', body.envelopeId).maybeSingle();
  if (!env || !user.hotels.includes(env.hotel_id)) return json({ error: 'No encontrado' }, 404);
  if (env.status === 'completed') return json({ error: 'Un sobre ya completado no se puede anular' }, 400);
  await db.from('sign_envelope').update({ status: 'cancelled' }).eq('id', env.id);
  await appendEvent(env.id, null, 'cancelled', { by: `${user.name} <${user.email}>`, reason: String(body.reason || '') }, reqMeta(req));
  return json({ ok: true });
}

async function opFile(body: any, user: any) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', body.envelopeId).maybeSingle();
  if (!env || !user.hotels.includes(env.hotel_id)) return json({ error: 'No encontrado' }, 404);
  const key = body.which === 'signed' ? env.signed_file_key : env.file_key;
  if (!key) return json({ error: 'Todavía no hay PDF firmado' }, 400);
  const { data } = await db.storage.from(BUCKET).createSignedUrl(key, 900);
  return json({ ok: true, url: data?.signedUrl || null });
}

// Exportación del rastro para llevarlo a un tercero (perito, inspección, juzgado).
async function opAudit(body: any, user: any) {
  const { data: env } = await db.from('sign_envelope').select('*').eq('id', body.envelopeId).maybeSingle();
  if (!env || !user.hotels.includes(env.hotel_id)) return json({ error: 'No encontrado' }, 404);
  const { data: signers } = await db.from('sign_signer').select('*').eq('envelope_id', env.id).order('order_idx');
  const chain = await verifyChain(env.id);
  return json({
    ok: true,
    export: {
      generatedAt: new Date().toISOString(),
      envelope: env,
      signers: (signers || []).map(({ token, otp_hash, ...s }) => s),
      chain: { verified: chain.ok, algorithm: 'sha256(JSON canonico {prev,ts,type,signerId,detail})', last: chain.last },
      events: chain.events,
    },
  });
}

/* ─────────────────────── operaciones del firmante (sin login) ─────────────────────── */

const publicEnv = (env: any, signer: any, hotel: string, pdfUrl: string | null) => ({
  id: env.id, title: env.title, message: env.message, hotel,
  fileName: env.file_name, pageCount: env.page_count, fileSha256: env.file_sha256,
  requireOtp: env.require_otp, requireRead: env.require_read, requireId: env.require_id,
  signatureKind: env.signature_kind, consentText: env.consent_text,
  status: env.status, expiresAt: env.expires_at,
  sender: { name: env.created_by_name, email: env.created_by_email },
  signer: {
    id: signer.id, name: signer.name, email: signer.email, status: signer.status,
    otpVerified: !!signer.otp_verified_at, readCompleted: !!signer.read_completed_at,
    signedAt: signer.signed_at, declinedAt: signer.declined_at,
  },
  pdfUrl,
});

// Motivos por los que el enlace no permite firmar ahora mismo.
function blockedReason(env: any, signer: any, others: any[]): string | null {
  if (env.status === 'cancelled') return 'Este envío ha sido anulado por el hotel.';
  if (new Date(env.expires_at) < new Date()) return 'El enlace ha caducado. Pide al hotel que te lo reenvíe.';
  if (signer.status === 'declined') return 'Ya rechazaste firmar este documento.';
  if (env.mode === 'sequential') {
    const before = others.filter((s) => s.order_idx < signer.order_idx && s.status !== 'signed');
    if (before.length) return `Es un envío en orden: falta que firme antes ${before[0].name}. Te avisaremos cuando sea tu turno.`;
  }
  return null;
}

async function opOpen(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  const { data: others } = await db.from('sign_signer').select('id,order_idx,name,status').eq('envelope_id', env.id).order('order_idx');
  const meta = reqMeta(req);

  if (!signer.first_opened_at) {
    const now = new Date().toISOString();
    const status = signer.status === 'pending' ? 'opened' : signer.status;
    await db.from('sign_signer').update({
      first_opened_at: now, status, ip: meta.ip, ua: meta.ua, lang: String(body.lang || '').slice(0, 5) || null,
    }).eq('id', signer.id);
    await appendEvent(env.id, signer.id, 'opened', { email: signer.email }, meta);
    signer.first_opened_at = now;
    signer.status = status;
  }

  const blocked = blockedReason(env, signer, others || []);
  let pdfUrl: string | null = null;
  if (!blocked || signer.status === 'signed') {
    const { data } = await db.storage.from(BUCKET).createSignedUrl(env.file_key, 3600);
    pdfUrl = data?.signedUrl || null;
  }
  const hotel = await hotelName(env.hotel_id);
  return json({ ok: true, blocked, envelope: publicEnv(env, signer, hotel, pdfUrl) });
}

async function opProgress(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  if (signer.status === 'signed' || signer.status === 'declined') return json({ ok: true });
  const pages = Math.max(Number(body.pagesViewed) || 0, signer.pages_viewed || 0);
  const secs = Math.max(Number(body.readSeconds) || 0, signer.read_seconds || 0);
  const done = !!body.readCompleted && !signer.read_completed_at;
  const patch: Record<string, unknown> = { pages_viewed: pages, read_seconds: secs };
  if (done) {
    patch.read_completed_at = new Date().toISOString();
    if (signer.status === 'opened' || signer.status === 'pending') patch.status = 'read';
  }
  await db.from('sign_signer').update(patch).eq('id', signer.id);
  if (done) await appendEvent(env.id, signer.id, 'read_completed', { pagesViewed: pages, totalPages: env.page_count, readSeconds: secs }, reqMeta(req));
  return json({ ok: true });
}

async function opOtp(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  if (signer.status === 'signed') return json({ error: 'Ya has firmado' }, 400);
  // Un código cada 45 s como mucho: que el envío no se use como cañón de correo.
  if (signer.otp_sent_at && Date.now() - new Date(signer.otp_sent_at).getTime() < 45000) {
    return json({ error: 'Acabamos de enviarte un código. Espera unos segundos antes de pedir otro.' }, 429);
  }
  const code = genOtp();
  await db.from('sign_signer').update({
    otp_hash: await sha256Hex(`${signer.id}:${code}`), otp_sent_at: new Date().toISOString(), otp_attempts: 0,
  }).eq('id', signer.id);
  const hotel = await hotelName(env.hotel_id);
  const r = await sendEmail([{ email: signer.email, name: signer.name }], `Tu código para firmar: ${code}`, SHELL(hotel, `
    <p>Hola <strong>${esc(signer.name)}</strong>,</p>
    <p>Tu código de un solo uso para firmar <strong>${esc(env.title)}</strong> es:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:18px 0;text-align:center">${esc(code)}</p>
    <p style="font-size:12.5px;color:#4b5160">Caduca en 10 minutos. Si no has sido tú, ignora este mensaje y avisa al hotel.</p>`));
  await appendEvent(env.id, signer.id, 'otp_sent', { email: signer.email, ok: r.ok }, reqMeta(req));
  if (!r.ok) return json({ error: 'No se pudo enviar el código: ' + r.error }, 500);
  return json({ ok: true });
}

async function opVerify(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  const meta = reqMeta(req);
  if (!signer.otp_hash || !signer.otp_sent_at) return json({ error: 'Pide primero un código' }, 400);
  if (Date.now() - new Date(signer.otp_sent_at).getTime() > 600000) return json({ error: 'El código ha caducado. Pide uno nuevo.' }, 400);
  if ((signer.otp_attempts || 0) >= 6) return json({ error: 'Demasiados intentos. Pide un código nuevo.' }, 429);
  const hash = await sha256Hex(`${signer.id}:${String(body.code || '').trim()}`);
  if (hash !== signer.otp_hash) {
    await db.from('sign_signer').update({ otp_attempts: (signer.otp_attempts || 0) + 1 }).eq('id', signer.id);
    await appendEvent(env.id, signer.id, 'otp_failed', { attempt: (signer.otp_attempts || 0) + 1 }, meta);
    return json({ error: 'Código incorrecto' }, 400);
  }
  await db.from('sign_signer').update({ otp_verified_at: new Date().toISOString(), ip: meta.ip, ua: meta.ua }).eq('id', signer.id);
  await appendEvent(env.id, signer.id, 'otp_verified', { email: signer.email }, meta);
  return json({ ok: true });
}

async function opSign(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  const meta = reqMeta(req);
  const { data: others } = await db.from('sign_signer').select('id,order_idx,name,status').eq('envelope_id', env.id).order('order_idx');
  if (signer.status === 'signed') return json({ error: 'Ya has firmado este documento' }, 400);
  const blocked = blockedReason(env, signer, others || []);
  if (blocked) return json({ error: blocked }, 400);
  if (!body.consentAccepted) return json({ error: 'Debes aceptar la declaración de firma' }, 400);
  if (env.require_read && !signer.read_completed_at) return json({ error: 'Tienes que leer el documento hasta el final antes de firmar' }, 400);
  if (env.require_otp) {
    if (!signer.otp_verified_at) return json({ error: 'Verifica primero el código enviado a tu correo' }, 400);
    if (Date.now() - new Date(signer.otp_verified_at).getTime() > 3600000) return json({ error: 'La verificación ha caducado. Pide un código nuevo.' }, 400);
  }
  if (env.require_id && !String(body.idNumber || '').trim()) return json({ error: 'Indica tu DNI/NIE/pasaporte' }, 400);

  const patch: Record<string, unknown> = {
    status: 'signed', signed_at: new Date().toISOString(), ip: meta.ip, ua: meta.ua,
    id_number: String(body.idNumber || '').trim().toUpperCase().slice(0, 32) || null,
    typed_name: String(body.typedName || signer.name).slice(0, 120),
  };
  let sigSha: string | null = null;
  if (env.signature_kind === 'draw') {
    const dataUrl = String(body.signaturePng || '');
    const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!m) return json({ error: 'Falta la firma manuscrita' }, 400);
    const raw = atob(m[1]);
    if (raw.length > 900000) return json({ error: 'La firma ocupa demasiado' }, 400);
    const bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    sigSha = await sha256Hex(bin);
    const key = `sign/${env.id}/firma_${signer.id}.png`;
    const { error } = await db.storage.from(BUCKET).upload(key, bin, { contentType: 'image/png', upsert: true });
    if (error) return json({ error: 'No se pudo guardar la firma: ' + error.message }, 500);
    patch.signature_key = key; patch.signature_sha256 = sigSha;
  }
  await db.from('sign_signer').update(patch).eq('id', signer.id);
  await appendEvent(env.id, signer.id, 'signed', {
    name: signer.name, email: signer.email, idNumber: patch.id_number || undefined,
    signatureSha256: sigSha || undefined, typedName: env.signature_kind === 'typed' ? patch.typed_name : undefined,
    consentSha256: env.consent_sha256, docSha256: env.file_sha256,
    pagesViewed: signer.pages_viewed, totalPages: env.page_count, readSeconds: signer.read_seconds,
    otpVerifiedAt: signer.otp_verified_at || undefined,
  }, meta);

  // En orden secuencial, el turno pasa al siguiente en cuanto este firma.
  if (env.mode === 'sequential') {
    const next = (others || []).find((s) => s.order_idx > signer.order_idx && s.status !== 'signed' && s.status !== 'declined');
    if (next) {
      const { data: full } = await db.from('sign_signer').select('*').eq('id', next.id).maybeSingle();
      if (full && !full.invited_at) {
        const hotel = await hotelName(env.hotel_id);
        const r = await sendEmail([{ email: full.email, name: full.name }], `Firma requerida: ${env.title}`, SHELL(hotel, `
          <p>Hola <strong>${esc(full.name)}</strong>,</p>
          <p>Es tu turno para leer y firmar <strong>${esc(env.title)}</strong>.</p>
          ${BTN(signUrl(full.token), 'Leer y firmar el documento')}`));
        await db.from('sign_signer').update({ invited_at: new Date().toISOString() }).eq('id', full.id);
        await appendEvent(env.id, full.id, r.ok ? 'invited' : 'invite_failed', { email: full.email, error: r.ok ? undefined : r.error }, meta);
      }
    }
  }

  await finalize(env.id);
  return json({ ok: true });
}

async function opDecline(req: Request, body: any) {
  const found = await signerByToken(String(body.t || ''));
  if (!found) return json({ error: 'Enlace no válido' }, 404);
  const { signer, env } = found;
  if (signer.status === 'signed') return json({ error: 'Ya has firmado' }, 400);
  const reason = String(body.reason || '').slice(0, 1000);
  const meta = reqMeta(req);
  await db.from('sign_signer').update({
    status: 'declined', declined_at: new Date().toISOString(), decline_reason: reason, ip: meta.ip, ua: meta.ua,
  }).eq('id', signer.id);
  await appendEvent(env.id, signer.id, 'declined', { name: signer.name, email: signer.email, reason }, meta);
  if (env.created_by_email) {
    const hotel = await hotelName(env.hotel_id);
    await sendEmail([{ email: env.created_by_email, name: env.created_by_name || '' }], `Firma rechazada: ${env.title}`, SHELL(hotel, `
      <p><strong>${esc(signer.name)}</strong> ha rechazado firmar <strong>${esc(env.title)}</strong>.</p>
      ${reason ? `<p style="background:#f7f8fa;border-left:3px solid #b91c1c;padding:10px 12px;white-space:pre-wrap">${esc(reason)}</p>` : ''}`));
  }
  return json({ ok: true });
}

/* ─────────────────────────────── router ─────────────────────────────── */

const PUBLIC_OPS = new Set(['open', 'progress', 'otp', 'verify', 'sign', 'decline']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const op = String(body.op || '');

  try {
    if (PUBLIC_OPS.has(op)) {
      switch (op) {
        case 'open': return await opOpen(req, body);
        case 'progress': return await opProgress(req, body);
        case 'otp': return await opOtp(req, body);
        case 'verify': return await opVerify(req, body);
        case 'sign': return await opSign(req, body);
        case 'decline': return await opDecline(req, body);
      }
    }
    const user = await authUser(req, body);
    if (!user) return json({ error: 'No autenticado' }, 401);
    if (!canManage(user)) return json({ error: 'Solo administradores y jefes de departamento pueden enviar documentos a firmar.' }, 403);
    switch (op) {
      case 'list': return await opList(body, user);
      case 'detail': return await opDetail(body, user);
      case 'create': return await opCreate(req, body, user);
      case 'remind': return await opRemind(req, body, user);
      case 'cancel': return await opCancel(req, body, user);
      case 'file': return await opFile(body, user);
      case 'audit': return await opAudit(body, user);
      default: return json({ error: 'Operación desconocida: ' + op }, 400);
    }
  } catch (e) {
    console.error('docu-sign', op, e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
