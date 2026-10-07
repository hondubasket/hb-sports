// ============================================================
//  HB Sports — Servidor (Render)
//  - Protege el token de Airtable (nunca llega al navegador)
//  - Sirve jugadores y clubes desde Airtable
//  - Guarda torneos y resultados en disco (data.json)
//  - Suscripciones por correo y avisos de transmisión
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Config desde variables de entorno (se configuran en Render) ----
const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN;        // secreto
const PLAYERS_BASE     = process.env.PLAYERS_BASE  || 'appeSfTpQN0rm03K1';
const PLAYERS_TABLE    = process.env.PLAYERS_TABLE || 'tblyoZQvvWdbwCdwj';
const CLUBS_BASE       = process.env.CLUBS_BASE    || 'appWAZgIGnaS2kSm3';
const CLUBS_TABLE      = process.env.CLUBS_TABLE   || 'tblnUhNw4kpVuuhem';
const ADMIN_PIN        = process.env.ADMIN_PIN     || 'hb2026';
const PORT             = process.env.PORT || 3000;

// ---- Suscripciones y correo ----
const SUBS_BASE        = process.env.SUBS_BASE;             // base de Airtable con la tabla Suscriptores
const SUBS_TABLE       = process.env.SUBS_TABLE || 'Suscriptores';
const GMAIL_USER       = process.env.GMAIL_USER || 'hondubasket@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;  // secreto: contraseña de aplicación de Google
const SITE_URL         = process.env.SITE_URL || 'https://hb-sports.onrender.com';
const YT_LIVE          = 'https://www.youtube.com/@hondubasket/live';

const DATA_FILE = path.join(__dirname, 'data.json');

// ---- Persistencia simple (torneos + resultados) ----
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { tournaments: {} }; }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---- Helper: traer todos los registros de una tabla ----
async function fetchAll(base, table) {
  let records = [], offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN } });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || ('Airtable error ' + res.status));
    }
    const d = await res.json();
    records = records.concat(d.records);
    offset = d.offset;
  } while (offset);
  return records;
}

// ============================================================
//  API
// ============================================================

// --- Jugadores (con foto) ---
app.get('/api/players', async (req, res) => {
  try {
    const recs = await fetchAll(PLAYERS_BASE, PLAYERS_TABLE);
    const players = recs.map(r => {
      const f = r.fields;
      let club = f['Club']; if (Array.isArray(club)) club = club[0];
      const birth = f['Fecha de Nacimiento'] || '';
      const ph = f['Foto Jugador(a)'];
      let photo = null;
      if (Array.isArray(ph) && ph[0]) {
        photo = ph[0].thumbnails?.large?.url || ph[0].thumbnails?.small?.url || ph[0].url || null;
      }
      return { name: f['Nombre Jugador(a)'] || '(sin nombre)', club: club || 'Sin club', birth, photo };
    });
    res.json({ players });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Clubes (con categorías + rama) ---
app.get('/api/clubs', async (req, res) => {
  try {
    const recs = await fetchAll(CLUBS_BASE, CLUBS_TABLE);
    const clubs = recs.map(r => {
      const f = r.fields;
      let cats = f['Categorías a Participar'] || [];
      if (!Array.isArray(cats)) cats = [cats];
      const coach = f['Nombre del Entrenador'] || f['Nombre del entrenador'] || '';
      return { name: f['Nombre de Equipo'] || '', cats, coach };
    }).filter(c => c.name);
    res.json({ clubs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Leer torneos guardados ---
app.get('/api/tournaments', (req, res) => {
  res.json(loadData());
});

// --- Guardar torneos (requiere PIN) ---
app.post('/api/tournaments', (req, res) => {
  const pin = req.headers['x-admin-pin'];
  if (pin !== ADMIN_PIN) return res.status(401).json({ error: 'No autorizado' });
  try {
    saveData({ tournaments: req.body.tournaments || {} });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Verificar PIN ---
app.post('/api/auth', (req, res) => {
  res.json({ ok: req.body.pin === ADMIN_PIN });
});

// ============================================================
//  SUSCRIPCIONES (avisos de transmisión por correo)
//  Guarda en Airtable si SUBS_BASE está configurado; si no, en
//  un archivo local (se borra cuando Render vuelve a desplegar).
// ============================================================
const SUBS_FILE = path.join(__dirname, 'subs.json');
const LIGAS = ['LNBM', 'LNBF', 'Liga de las Estrellas', 'Tour 3x3'];
const useAirtable = () => !!(AIRTABLE_TOKEN && SUBS_BASE);
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSubsFile() { try { return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch { return []; } }
function saveSubsFile(l) { fs.writeFileSync(SUBS_FILE, JSON.stringify(l, null, 2)); }

async function airtable(method, pathPart, body) {
  const res = await fetch(`https://api.airtable.com/v0/${SUBS_BASE}/${encodeURIComponent(SUBS_TABLE)}${pathPart || ''}`, {
    method, headers: { Authorization: 'Bearer ' + AIRTABLE_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || ('Airtable error ' + res.status));
  return d;
}

// Lista de suscriptores: [{ id, email, ligas:[], token, activo }]
async function listSubs() {
  if (!useAirtable()) return loadSubsFile();
  const recs = await fetchAll(SUBS_BASE, encodeURIComponent(SUBS_TABLE));
  return recs.map(r => ({
    id: r.id, email: String(r.fields['Email'] || '').trim(), token: r.fields['Token'] || '',
    ligas: String(r.fields['Ligas'] || '').split(',').map(x => x.trim()).filter(Boolean),
    activo: !!r.fields['Activo'],
  })).filter(x => x.email);
}

async function upsertSub(email, ligas) {
  const all = await listSubs();
  const found = all.find(x => x.email.toLowerCase() === email);
  const token = found?.token || crypto.randomBytes(16).toString('hex');
  const fields = { Email: email, Ligas: ligas.join(', '), Activo: true, Token: token, Fecha: new Date().toISOString().slice(0, 10) };
  if (useAirtable()) {
    if (found) await airtable('PATCH', '', { records: [{ id: found.id, fields }], typecast: true });
    else await airtable('POST', '', { records: [{ fields }], typecast: true });
  } else {
    const l = loadSubsFile().filter(x => x.email.toLowerCase() !== email);
    l.push({ id: token, email, ligas, token, activo: true, fecha: fields.Fecha });
    saveSubsFile(l);
  }
  return { nuevo: !found || !found.activo };
}

async function unsubscribe(token) {
  const all = await listSubs();
  const s = all.find(x => x.token && x.token === token);
  if (!s) return false;
  if (useAirtable()) await airtable('PATCH', '', { records: [{ id: s.id, fields: { Activo: false } }] });
  else saveSubsFile(loadSubsFile().map(x => x.token === token ? { ...x, activo: false } : x));
  return true;
}

// Límite simple para evitar abuso del formulario
const hits = new Map();
function limited(ip) {
  const now = Date.now(), l = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  l.push(now); hits.set(ip, l);
  return l.length > 10;
}

// --- Suscribirse (público) ---
app.post('/api/suscribir', async (req, res) => {
  try {
    if (req.body.web) return res.json({ ok: true });            // trampa para bots
    if (limited(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Probá más tarde.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: 'Escribí un correo válido.' });
    let ligas = Array.isArray(req.body.ligas) ? req.body.ligas.filter(l => LIGAS.includes(l)) : [];
    if (!ligas.length) ligas = LIGAS.slice();
    const r = await upsertSub(email, ligas);
    res.json({ ok: true, nuevo: r.nuevo });
  } catch (e) { console.error('suscribir', e); res.status(500).json({ error: 'No pudimos guardar tu suscripción. Probá de nuevo.' }); }
});

// --- Darse de baja (enlace en cada correo) ---
app.get('/baja', async (req, res) => {
  let ok = false;
  try { ok = await unsubscribe(String(req.query.t || '')); } catch (e) { console.error('baja', e); }
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hondubasket</title>
<body style="font-family:system-ui,sans-serif;background:#f5f5f7;margin:0;display:grid;place-items:center;min-height:100vh;padding:20px">
<div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;border:1px solid #e5e5ea">
<img src="/img/hb.png" alt="" style="height:56px"><h1 style="font-size:22px">${ok ? 'Listo, ya no te enviaremos avisos' : 'Este enlace ya no es válido'}</h1>
<p style="color:#555">${ok ? 'Podés volver a suscribirte cuando querás desde nuestra página.' : 'Puede que ya te hayas dado de baja.'}</p>
<a href="/" style="color:#EC8400;font-weight:700">Ir a HB Sports</a></div></body>`);
});

// --- Admin: estado de suscriptores ---
function needPin(req, res) {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) { res.status(401).json({ error: 'No autorizado' }); return true; }
  return false;
}
app.get('/api/avisos/estado', async (req, res) => {
  if (needPin(req, res)) return;
  try {
    const subs = (await listSubs()).filter(s => s.activo);
    const porLiga = Object.fromEntries(LIGAS.map(l => [l, subs.filter(s => s.ligas.includes(l)).length]));
    res.json({ total: subs.length, porLiga, almacenamiento: useAirtable() ? 'airtable' : 'temporal', correo: !!GMAIL_APP_PASSWORD, enviados: [...sent.keys()] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Admin: enviar aviso de transmisión ---
const sent = new Map();   // id de partido -> fecha de envío (en memoria)
let job = null;
let transporter = null;
function mailer() {
  if (!transporter) transporter = nodemailer.createTransport({ service: 'gmail', pool: true, maxConnections: 2, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  return transporter;
}
function emailHtml(a, token) {
  const link = a.link || YT_LIVE;
  return `<!doctype html><html><body style="margin:0;background:#f2f2f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f5;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#1a1a1a;padding:18px 24px"><img src="${SITE_URL}/img/hb.png" alt="Hondubasket" height="40" style="vertical-align:middle;background:#fff;border-radius:8px;padding:3px"> <span style="color:#fff;font-weight:bold;font-size:16px;vertical-align:middle;margin-left:8px">HONDUBASKET</span></td></tr>
<tr><td style="padding:28px 24px 8px">
<div style="display:inline-block;background:#FF0000;color:#fff;font-size:12px;font-weight:bold;letter-spacing:1px;padding:5px 10px;border-radius:6px">● EN VIVO ${a.hora ? '· ' + esc(a.hora) : ''}</div>
<div style="color:#EC8400;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin-top:16px">${esc(a.liga || 'Hondubasket')}</div>
<h1 style="font-size:24px;margin:6px 0 10px">${esc(a.titulo)}</h1>
<p style="color:#555;font-size:15px;margin:0 0 6px">${esc([a.fecha, a.sede].filter(Boolean).join(' · '))}</p>
${a.mensaje ? `<p style="font-size:15px;line-height:1.5">${esc(a.mensaje)}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px 28px"><a href="${esc(link)}" style="display:inline-block;background:#FF0000;color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 22px;border-radius:10px">▶ Ver la transmisión en YouTube</a>
<p style="font-size:13px;color:#777;margin-top:14px">Canal: <a href="https://www.youtube.com/@hondubasket" style="color:#EC8400">youtube.com/@hondubasket</a></p></td></tr>
<tr><td style="background:#fafafa;padding:16px 24px;font-size:12px;color:#888;border-top:1px solid #eee">Recibís este correo porque te suscribiste a los avisos de transmisión en <a href="${SITE_URL}" style="color:#888">HB Sports</a>.<br><a href="${SITE_URL}/baja?t=${token}" style="color:#888">Darme de baja</a></td></tr>
</table></td></tr></table></body></html>`;
}

app.post('/api/avisos/enviar', async (req, res) => {
  if (needPin(req, res)) return;
  if (!GMAIL_APP_PASSWORD) return res.status(400).json({ error: 'Falta configurar GMAIL_APP_PASSWORD en Render.' });
  if (job && job.running) return res.status(409).json({ error: 'Ya hay un envío en curso.' });
  const a = req.body || {};
  if (!a.titulo) return res.status(400).json({ error: 'Falta el título del partido.' });
  if (a.link && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(a.link)) return res.status(400).json({ error: 'El enlace debe ser de YouTube.' });
  if (a.id && sent.has(a.id) && !a.reenviar) return res.status(409).json({ error: 'Ya se envió el aviso de este partido.', yaEnviado: true });
  let subs;
  try { subs = (await listSubs()).filter(s => s.activo && (!a.liga || !LIGAS.includes(a.liga) || s.ligas.includes(a.liga))); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  job = { running: true, total: subs.length, ok: 0, fallos: 0 };
  res.json({ ok: true, total: subs.length });
  const subject = `🔴 En vivo${a.hora ? ' ' + a.hora : ''}: ${a.titulo}`;
  for (const s of subs) {
    try {
      await mailer().sendMail({
        from: `"Hondubasket" <${GMAIL_USER}>`, to: s.email, subject,
        html: emailHtml(a, s.token),
        text: `${a.titulo}\n${[a.fecha, a.hora, a.sede].filter(Boolean).join(' · ')}\nMiralo en vivo: ${a.link || YT_LIVE}\n\nDarme de baja: ${SITE_URL}/baja?t=${s.token}`,
        headers: { 'List-Unsubscribe': `<${SITE_URL}/baja?t=${s.token}>` },
      });
      job.ok++;
    } catch (e) { job.fallos++; console.error('correo', s.email, e.message); }
  }
  job.running = false;
  if (a.id && job.ok) sent.set(a.id, new Date().toISOString());
});

app.get('/api/avisos/progreso', (req, res) => {
  if (needPin(req, res)) return;
  res.json(job || { running: false, total: 0, ok: 0, fallos: 0 });
});

app.listen(PORT, () => console.log('HB Sports server on :' + PORT));
