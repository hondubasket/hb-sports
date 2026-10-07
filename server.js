// ============================================================
//  HB Sports — Servidor (Render)
//  - Protege el token de Airtable (nunca llega al navegador)
//  - Sirve jugadores y clubes desde Airtable
//  - Guarda torneos y resultados en disco (data.json)
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

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

app.listen(PORT, () => console.log('HB Sports server on :' + PORT));
