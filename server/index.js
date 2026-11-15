const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const fetch = require('node-fetch');
const express = require('express');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_ID   = 18550618;
const API_HASH = 'e98b922550a95f725dfc30e13571589f';
const SESSION_FILE = './session.txt';
const RESULTS_FILE = './results.json';
const PORT = process.env.PORT || 3000;

// ─── Active detection ─────────────────────────────────────────────────────────
const ACTIVE_BOOL = new Set(['online','isOnline','is_online','active','isActive','connected','isConnected','live','present','status']);
const ACTIVE_TS   = ['lastSeen','last_seen','lastOnline','lastActive','last_active','updatedAt','updated_at','timestamp','ts','time','lastPing'];
const ACTIVE_MS   = 10 * 60 * 1000;
const PATHS       = ['devices','users','Devices','Users','device','user','online','connected','clients','tokens','panel','members','accounts','data','players','sessions','fcm'];

// ─── State ────────────────────────────────────────────────────────────────────
let results = {};     // url -> result object
let scanning = false;
let scanQueue = new Set();
let client;

// Load saved results
if (fs.existsSync(RESULTS_FILE)) {
  try { results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch(e) {}
}

function saveResults() {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().slice(11,19);
  console.log(`[${ts}] ${msg}`);
}

// ─── Firebase link extractor ──────────────────────────────────────────────────
function extractFirebaseLinks(text) {
  if (!text) return [];
  const regex = /https?:\/\/[a-zA-Z0-9-]+(?:-default-rtdb)?\.firebaseio\.com[^\s"'<>]*/g;
  return [...new Set(
    (text.match(regex) || []).map(m => m.replace(/[.,;)>]+$/, '').replace(/\/+$/, ''))
  )];
}

// ─── Firebase fetch ───────────────────────────────────────────────────────────
async function getFetch(url, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { status: r.status, text: await r.text() };
  } catch(e) { clearTimeout(t); throw e; }
}

function countActive(data) {
  if (!data || typeof data !== 'object') return 0;
  let active = 0;
  const now = Date.now();
  for (const dev of Object.values(data)) {
    if (!dev || typeof dev !== 'object') continue;
    let isActive = false;
    for (const f of ACTIVE_BOOL) {
      if (f in dev) {
        const v = dev[f];
        if (v === true || v === 1 || v === 'true' || v === 'online' || v === 'active' || v === 'connected' || v === '1') {
          isActive = true; break;
        }
      }
    }
    if (!isActive) {
      for (const f of ACTIVE_TS) {
        if (f in dev) {
          let ts = dev[f];
          if (typeof ts === 'number') {
            if (ts < 1e10) ts *= 1000;
            if (now - ts < ACTIVE_MS) { isActive = true; break; }
          }
        }
      }
    }
    if (isActive) active++;
  }
  return active;
}

async function scanDevices(baseUrl) {
  let rootKeys = [];
  try {
    const r = await getFetch(baseUrl + '/.json?shallow=true', 5000);
    if (r.status === 200 && r.text && r.text !== 'null' && !r.text.includes('"error"')) {
      const p = JSON.parse(r.text);
      if (p && typeof p === 'object') rootKeys = Object.keys(p);
    }
  } catch(e) {}

  const pathsToTry = [...new Set([...PATHS, ...rootKeys])];
  const shallowResults = await Promise.allSettled(
    pathsToTry.map(p => getFetch(baseUrl + '/' + p + '.json?shallow=true', 5000).then(r => ({ p, r })))
  );

  let bestPath = '', bestKeys = [];
  for (const res of shallowResults) {
    if (res.status !== 'fulfilled') continue;
    const { p, r } = res.value;
    if (r.status !== 200 || !r.text || r.text === 'null' || r.text.includes('"error"')) continue;
    try {
      const parsed = JSON.parse(r.text);
      if (!parsed || typeof parsed !== 'object') continue;
      const k = Object.keys(parsed);
      if (k.length > bestKeys.length) { bestKeys = k; bestPath = p; }
    } catch(e) {}
  }

  if (!bestPath || !bestKeys.length) return { total: 0, active: 0, path: '' };
  const total = bestKeys.length;
  let active = 0;

  try {
    if (total <= 500) {
      const r = await getFetch(baseUrl + '/' + bestPath + '.json', 8000);
      if (r.status === 200 && r.text && r.text !== 'null') {
        active = countActive(JSON.parse(r.text));
      }
    } else {
      const r = await getFetch(`${baseUrl}/${bestPath}.json?orderBy="$key"&limitToFirst=200`, 8000);
      if (r.status === 200 && r.text && r.text !== 'null') {
        const data = JSON.parse(r.text);
        const sa = countActive(data);
        const st = Object.keys(data || {}).length;
        active = st > 0 ? Math.round((sa / st) * total) : 0;
      }
    }
  } catch(e) {}

  return { total, active, path: bestPath };
}

async function checkFirebase(url, source = '') {
  if (results[url] && results[url].status === 'live' && Date.now() - results[url].lastChecked < 30 * 60 * 1000) {
    log(`Skip (cached): ${url}`);
    return; // skip recently checked live DBs
  }

  log(`Checking: ${url}`);
  const entry = {
    url,
    status: 'checking',
    detail: '',
    total: 0,
    active: 0,
    path: '',
    source,
    lastChecked: Date.now(),
    firstSeen: results[url]?.firstSeen || Date.now()
  };
  results[url] = entry;

  try {
    const r = await getFetch(url + '/.json?shallow=true');
    if (r.status === 200) {
      if (r.text.includes('"error"')) {
        const m = r.text.match(/"error"\s*:\s*"([^"]+)"/);
        const msg = m ? m[1] : 'unknown';
        if (/deactivat|disabl|retir/i.test(msg)) {
          entry.status = 'dead'; entry.detail = `Disabled: ${msg}`;
        } else if (/permission/i.test(msg)) {
          entry.status = 'live'; entry.detail = 'Alive — rules deny read';
        } else {
          entry.status = 'error'; entry.detail = `Error: ${msg}`;
        }
      } else if (r.text.trim() === 'null') {
        entry.status = 'live'; entry.detail = 'Alive — empty DB';
      } else {
        entry.status = 'live';
        const s = await scanDevices(url);
        entry.total  = s.total;
        entry.active = s.active;
        entry.path   = s.path;
        entry.detail = s.total > 0 ? `Alive — /${s.path}` : 'Alive — no readable devices';
      }
    } else if (r.status === 401 || r.status === 403) {
      entry.status = 'live'; entry.detail = `HTTP ${r.status} — Alive`;
    } else if (r.status === 404) {
      entry.status = 'dead'; entry.detail = 'HTTP 404 — Deleted';
    } else if (r.status === 503) {
      entry.status = r.text.includes('deactivat') ? 'dead' : 'error';
      entry.detail = r.text.includes('deactivat') ? 'Deactivated' : 'HTTP 503';
    } else {
      entry.status = 'error'; entry.detail = `HTTP ${r.status}`;
    }
  } catch(e) {
    entry.status = e.name === 'AbortError' ? 'dead' : 'error';
    entry.detail = e.name === 'AbortError' ? 'Timeout' : `Error: ${e.message}`;
  }

  log(`  → ${entry.status} | ${entry.detail} | devices: ${entry.total} active: ${entry.active}`);
  saveResults();
}

// ─── Queue processor ──────────────────────────────────────────────────────────
async function processQueue() {
  if (scanning || scanQueue.size === 0) return;
  scanning = true;
  const batch = [...scanQueue].slice(0, 10); // process 10 at a time
  batch.forEach(u => scanQueue.delete(u));
  await Promise.all(batch.map(url => checkFirebase(url)));
  scanning = false;
  if (scanQueue.size > 0) setTimeout(processQueue, 500);
}

function queueUrl(url, source = '') {
  if (!results[url] || results[url].status !== 'live') {
    // Queue new or non-live URLs immediately
    scanQueue.add(url);
    setTimeout(processQueue, 100);
  } else if (Date.now() - results[url].lastChecked > 30 * 60 * 1000) {
    // Re-check live ones every 30 mins
    scanQueue.add(url);
    setTimeout(processQueue, 100);
  }
}

// ─── Telegram client ──────────────────────────────────────────────────────────
async function input(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
}

async function startTelegram() {
  const savedSession = fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8').trim() : '';
  const session = new StringSession(savedSession);

  client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 10,
    retryDelay: 1000,
    autoReconnect: true,
  });

  log('Connecting to Telegram...');
  await client.start({
    phoneNumber: async () => {
      if (process.env.TG_PHONE) return process.env.TG_PHONE;
      return await input('Phone number (+91...): ');
    },
    password: async () => {
      if (process.env.TG_PASSWORD) return process.env.TG_PASSWORD;
      return await input('2FA password (if any): ');
    },
    phoneCode: async () => {
      if (process.env.TG_CODE) return process.env.TG_CODE;
      return await input('OTP code from Telegram: ');
    },
    onError: (err) => log('TG Error: ' + err.message),
  });

  // Save session so we never need to login again
  const sessionString = client.session.save();
  fs.writeFileSync(SESSION_FILE, sessionString);
  log('✅ Logged in! Session saved.');

  // ─── Listen for new messages ─────────────────────────────────────────────
  client.addEventHandler(async (event) => {
    const msg = event.message;
    const text = msg?.message || msg?.text || '';
    const links = extractFirebaseLinks(text);
    if (links.length) {
      log(`New message — found ${links.length} firebase link(s)`);
      for (const url of links) queueUrl(url, 'live message');
    }
  }, new NewMessage({}));

  log('👂 Listening for new messages...');

  // ─── Scan history of all chats ───────────────────────────────────────────
  log('📋 Scanning chat history...');
  const dialogs = await client.getDialogs({ limit: 500 });
  log(`Found ${dialogs.length} chats/groups/channels`);

  let d = 0;
  for (const dialog of dialogs) {
    d++;
    const name = dialog.title || dialog.name || `Dialog ${d}`;
    try {
      const messages = await client.getMessages(dialog.entity, { limit: 1000 });
      let found = 0;
      for (const msg of messages) {
        const text = msg.message || msg.text || '';
        for (const url of extractFirebaseLinks(text)) {
          queueUrl(url, name);
          found++;
        }
      }
      if (found) log(`[${d}/${dialogs.length}] ${name}: ${found} firebase link(s)`);
    } catch(e) {
      log(`[${d}/${dialogs.length}] ${name}: skip (${e.message.slice(0,50)})`);
    }
    // small delay to avoid flood limits
    if (d % 20 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  log(`✅ History scan complete. Queue: ${scanQueue.size} urls`);
}

// ─── Express dashboard ────────────────────────────────────────────────────────
function startDashboard() {
  const app = express();

  app.get('/api/results', (req, res) => {
    res.json({
      total: Object.keys(results).length,
      live:  Object.values(results).filter(r => r.status === 'live').length,
      dead:  Object.values(results).filter(r => r.status === 'dead').length,
      totalDevices: Object.values(results).reduce((s, r) => s + (r.total || 0), 0),
      activeDevices: Object.values(results).reduce((s, r) => s + (r.active || 0), 0),
      queue: scanQueue.size,
      items: Object.values(results).sort((a, b) => {
        const o = { live: 0, error: 1, dead: 2, checking: 3 };
        return (o[a.status] ?? 4) - (o[b.status] ?? 4);
      })
    });
  });

  app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TG Firebase Scanner</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#e0e0e0;font-family:system-ui,sans-serif;padding:16px}
h1{font-size:1.3rem;color:#2AABEE;margin-bottom:4px}
.sub{font-size:0.72rem;color:#555;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px}
.stat{background:#161616;border:1px solid #252525;border-radius:10px;padding:12px;text-align:center}
.stat .n{font-size:1.8rem;font-weight:800;line-height:1}
.stat .l{font-size:0.6rem;color:#555;margin-top:4px;text-transform:uppercase}
.c-blue .n{color:#2AABEE}.c-green .n{color:#22c55e}.c-yellow .n{color:#f59e0b}.c-purple .n{color:#818cf8}
.item{background:#0d0d0d;border-radius:8px;padding:10px 12px;margin-bottom:7px;border-left:3px solid #252525}
.item.live{border-left-color:#22c55e}.item.dead{border-left-color:#ef4444}.item.error{border-left-color:#f59e0b}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px}
.url{font-size:0.68rem;color:#666;word-break:break-all;flex:1}
.badge{font-size:0.6rem;font-weight:700;padding:2px 7px;border-radius:20px;text-transform:uppercase;white-space:nowrap}
.badge.live{background:#052e16;color:#22c55e}.badge.dead{background:#450a0a;color:#ef4444}.badge.error{background:#422006;color:#f59e0b}
.detail{font-size:0.65rem;color:#444;font-family:monospace}
.pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.pill{font-size:0.62rem;font-weight:600;padding:2px 7px;border-radius:20px}
.pt{background:#1e1b4b;color:#818cf8}.pa{background:#052e16;color:#22c55e}.pi{background:#1c1917;color:#78716c}
.refresh{font-size:0.65rem;color:#333;text-align:right;margin-bottom:8px}
.queue{font-size:0.7rem;color:#f59e0b;margin-bottom:10px}
</style></head>
<body>
<h1>🔥 TG Firebase Scanner</h1>
<p class="sub">24/7 live scan — auto-refreshes every 10s</p>
<div class="refresh" id="ts">loading...</div>
<div id="queue" class="queue"></div>
<div class="grid">
  <div class="stat c-blue">  <div class="n" id="s-total">-</div><div class="l">Total Links</div></div>
  <div class="stat c-green"> <div class="n" id="s-live">-</div> <div class="l">Live DBs</div></div>
  <div class="stat c-yellow"><div class="n" id="s-dev">-</div>  <div class="l">Total Devices</div></div>
  <div class="stat c-purple"><div class="n" id="s-act">-</div>  <div class="l">Active Now</div></div>
</div>
<div id="items"></div>
<script>
async function refresh(){
  try{
    const d=await(await fetch('/api/results')).json();
    document.getElementById('ts').textContent='Updated '+new Date().toLocaleTimeString();
    document.getElementById('s-total').textContent=d.total;
    document.getElementById('s-live').textContent=d.live;
    document.getElementById('s-dev').textContent=d.totalDevices;
    document.getElementById('s-act').textContent=d.activeDevices;
    document.getElementById('queue').textContent=d.queue>0?'⏳ Queue: '+d.queue+' pending':'';
    document.getElementById('items').innerHTML=d.items.map(i=>{
      const name=i.url.replace('https://','').replace('-default-rtdb.firebaseio.com','');
      const dev=i.total>0?'<div class="pills"><span class="pill pt">📱 '+i.total+'</span><span class="pill pa">🟢 '+i.active+' active</span><span class="pill pi">⚫ '+(i.total-i.active)+' idle</span></div>':'';
      const src=i.source?'<div class="detail" style="color:#2d2d2d">from: '+i.source.slice(0,60)+'</div>':'';
      return '<div class="item '+i.status+'"><div class="row"><span class="url">'+name+'</span><span class="badge '+i.status+'">'+i.status+'</span></div><div class="detail">'+i.detail+'</div>'+dev+src+'</div>';
    }).join('');
  }catch(e){}
}
refresh();
setInterval(refresh,10000);
</script></body></html>`);
  });

  app.listen(PORT, () => log(`📊 Dashboard at http://localhost:${PORT}`));
}

// ─── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  startDashboard();
  await startTelegram();
  log('🚀 Scanner running. Dashboard: http://localhost:' + PORT);
})();
