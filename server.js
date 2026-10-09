const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);

let inFlight = 0;
let maxInFlight = 0;
const tokens = new Set();
const productCache = new Map();
const rateBuckets = new Map();
const idempotency = new Map();
const exportJobs = new Map();

const stats = {
  startedAt: new Date().toISOString(),
  requests: 0,
  errors: 0,
  rateLimited: 0,
  paymentsFailed: 0,
  ordersCreated: 0,
  exportsCreated: 0,
  cacheHit: 0,
  cacheMiss: 0
};

const products = Array.from({length: 30}, (_, i) => ({
  id: i + 1,
  name: `Producto ${i + 1}`,
  price: Number((20 + ((i + 1) * 9.71) % 450).toFixed(2)),
  stock: 500
}));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rnd(min, max) { return Math.floor(Math.random() * (max-min+1)) + min; }
function token() { return crypto.randomBytes(12).toString('hex'); }

async function pressureDelay(baseMin, baseMax) {
  let extra = 0;
  if (inFlight > 20) extra += (inFlight - 20) * 8;
  if (inFlight > 45) extra += (inFlight - 45) * 14;
  await sleep(rnd(baseMin, baseMax) + extra);
}

function startReq() {
  inFlight++;
  stats.requests++;
  if (inFlight > maxInFlight) maxInFlight = inFlight;
}
function endReq() { inFlight = Math.max(0, inFlight - 1); }

function json(res, status, data, headers={}) {
  if (status >= 400) stats.errors++;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function html(res, body) {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 1e6) reject(new Error('payload too large')); });
    req.on('end', () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('invalid json')); }
    });
  });
}

function auth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return false;
  return tokens.has(h.slice(7));
}

function rateLimit(req, key='global', limit=30, windowMs=10000) {
  const authHeader = req.headers.authorization || 'anonymous';
  const bucketKey = `${key}:${authHeader}`;
  const now = Date.now();
  let b = rateBuckets.get(bucketKey);
  if (!b || now - b.start >= windowMs) {
    b = {start: now, count: 0};
    rateBuckets.set(bucketKey, b);
  }
  b.count++;
  if (b.count > limit) {
    stats.rateLimited++;
    return true;
  }
  return false;
}

const home = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Performance Engineering Lab</title>
<style>
body{font-family:Segoe UI,Arial;margin:0;background:#f5f7fb;color:#172033}header{background:#0f172a;color:white;padding:32px}
main{max-width:1050px;margin:auto;padding:25px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.card{background:white;border:1px solid #e5e7eb;border-radius:12px;padding:18px}.tag{font-family:Consolas,monospace;color:#0f766e}
small{color:#64748b}</style></head>
<body><header><h1>Performance Engineering Lab</h1><p>Aplicación intencionalmente imperfecta para pruebas avanzadas con k6.</p></header>
<main><div class="grid">
<div class="card"><b>POST /api/auth/login</b><br><small>Obtenga Bearer token.</small></div>
<div class="card"><b>GET /api/products/:id</b><br><small>Cache HIT/MISS.</small></div>
<div class="card"><b>GET /api/search?q=</b><br><small>Rate limit y degradación bajo concurrencia.</small></div>
<div class="card"><b>POST /api/orders</b><br><small>Requiere Idempotency-Key.</small></div>
<div class="card"><b>POST /api/payments</b><br><small>Dependencia inestable (~5% 502).</small></div>
<div class="card"><b>POST /api/exports</b><br><small>Proceso asíncrono: devuelve jobId.</small></div>
<div class="card"><b>GET /api/exports/:jobId</b><br><small>Polling hasta completar.</small></div>
<div class="card"><b>GET /api/report</b><br><small>Endpoint pesado.</small></div>
<div class="card"><b>GET /api/admin/stats</b><br><small>Contadores internos del laboratorio.</small></div>
<div class="card"><b>POST /api/admin/reset</b><br><small>Reinicia métricas y estado transaccional.</small></div>
</div></main></body></html>`;

const server = http.createServer(async (req,res) => {
  startReq();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/') return html(res, home);

    if (req.method === 'GET' && path === '/health') {
      await pressureDelay(5,20);
      return json(res,200,{status:'ok',inFlight,maxInFlight});
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      await pressureDelay(90,180);
      const b = await readJson(req);
      if (b.user === 'student' && b.password === 'qa123') {
        const t = token(); tokens.add(t);
        return json(res,200,{token:t,expiresIn:3600});
      }
      return json(res,401,{error:'credenciales invalidas'});
    }

    if (req.method === 'GET' && /^\/api\/products\/\d+$/.test(path)) {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      const id = Number(path.split('/').pop());
      const p = products.find(x => x.id === id);
      if (!p) return json(res,404,{error:'producto no encontrado'});
      const c = productCache.get(id);
      const now = Date.now();
      if (c && now-c.at < 10000) {
        stats.cacheHit++;
        await pressureDelay(15,35);
        return json(res,200,p,{'X-Cache':'HIT'});
      }
      stats.cacheMiss++;
      await pressureDelay(230,420);
      productCache.set(id,{at:now});
      return json(res,200,p,{'X-Cache':'MISS'});
    }

    if (req.method === 'GET' && path === '/api/search') {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      if (rateLimit(req,'search',35,10000)) {
        return json(res,429,{error:'rate limit exceeded'},{'Retry-After':'2'});
      }
      await pressureDelay(130,280);
      if (inFlight > 60 && Math.random() < 0.15) return json(res,503,{error:'search overloaded'});
      const q=(url.searchParams.get('q')||'').toLowerCase();
      const items=products.filter(x=>x.name.toLowerCase().includes(q));
      return json(res,200,{count:items.length,items});
    }

    if (req.method === 'POST' && path === '/api/orders') {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      const idem = req.headers['idempotency-key'];
      if (!idem) return json(res,400,{error:'Idempotency-Key requerido'});
      if (idempotency.has(idem)) {
        return json(res,200,{...idempotency.get(idem),duplicate:true});
      }
      const b=await readJson(req);
      const p=products.find(x=>x.id===Number(b.productId));
      if (!p || !b.quantity || b.quantity < 1) return json(res,400,{error:'pedido invalido'});
      await pressureDelay(220,420);
      if (p.stock < b.quantity) return json(res,409,{error:'stock insuficiente'});
      p.stock -= b.quantity;
      const order={orderId:`ORD-${Date.now()}-${rnd(100,999)}`,productId:p.id,quantity:b.quantity,status:'created'};
      idempotency.set(idem,order); stats.ordersCreated++;
      return json(res,201,order);
    }

    if (req.method === 'POST' && path === '/api/payments') {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      await pressureDelay(180,360);
      if (Math.random() < 0.05 || (inFlight>55 && Math.random()<0.12)) {
        stats.paymentsFailed++;
        return json(res,502,{error:'payment provider unavailable'});
      }
      return json(res,200,{paymentId:`PAY-${Date.now()}-${rnd(100,999)}`,status:'approved'});
    }

    if (req.method === 'POST' && path === '/api/exports') {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      await pressureDelay(80,150);
      const jobId=`JOB-${Date.now()}-${rnd(100,999)}`;
      exportJobs.set(jobId,{readyAt:Date.now()+rnd(800,2200)});
      stats.exportsCreated++;
      return json(res,202,{jobId,status:'queued'});
    }

    if (req.method === 'GET' && /^\/api\/exports\/JOB-/.test(path)) {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      const jobId=path.split('/').pop();
      const job=exportJobs.get(jobId);
      if (!job) return json(res,404,{error:'job no encontrado'});
      await pressureDelay(20,60);
      if (Date.now()<job.readyAt) return json(res,202,{jobId,status:'processing'});
      return json(res,200,{jobId,status:'completed',url:`/downloads/${jobId}.csv`});
    }

    if (req.method === 'GET' && path === '/api/report') {
      if (!auth(req)) return json(res,401,{error:'token requerido'});
      await pressureDelay(650,1100);
      if (inFlight>50 && Math.random()<0.18) return json(res,503,{error:'report worker saturated'});
      return json(res,200,{rows:15000,generatedAt:new Date().toISOString()});
    }

    if (req.method === 'GET' && path === '/api/admin/stats') {
      return json(res,200,{...stats,inFlight,maxInFlight,cacheSize:productCache.size,jobs:exportJobs.size});
    }

    if (req.method === 'POST' && path === '/api/admin/reset') {
      stats.requests=0; stats.errors=0; stats.rateLimited=0; stats.paymentsFailed=0; stats.ordersCreated=0; stats.exportsCreated=0; stats.cacheHit=0; stats.cacheMiss=0;
      maxInFlight=0; productCache.clear(); rateBuckets.clear(); idempotency.clear(); exportJobs.clear();
      for (const p of products) p.stock=500;
      return json(res,200,{status:'reset'});
    }

    return json(res,404,{error:'route not found'});
  } catch(e) {
    return json(res,500,{error:e.message});
  } finally {
    endReq();
  }
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Performance Engineering Lab en :${PORT}`));
