import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 3100);
const root = fileURLToPath(new URL('./public', import.meta.url));
const maxUrls = 12;
const priceRegex = /(?:\$|MXN|M\.N\.|USD|US\$)\s*([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{2}))/gi;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': mimeTypes['.json'] });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100_000) {
        req.destroy();
        reject(new Error('La solicitud es demasiado grande.'));
      }
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function cleanText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePrice(value) {
  const raw = String(value || '').replace(/[^\d.,]/g, '').trim();
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  const comma = raw.lastIndexOf(',');
  let normalized = raw;

  if (dot > -1 && comma > -1) {
    const decimal = dot > comma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = raw.replace(new RegExp(`\\${thousands}`, 'g'), '').replace(decimal, '.');
  } else if (comma > -1) {
    normalized = raw.length - comma - 1 === 2 ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (dot > -1) {
    normalized = raw.length - dot - 1 === 2 ? raw.replace(/,/g, '') : raw.replace(/\./g, '');
  }

  const price = Number(normalized.replace(/\s/g, ''));
  return Number.isFinite(price) && price > 0 ? price : null;
}

function normalizeProductUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) throw new Error('URL vacia.');

  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se permiten URLs http o https.');
  return url.toString();
}

function extractTitle(html, url) {
  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(title ? title[1] : '') || new URL(url).hostname;
}

function extractPrices(html) {
  const text = cleanText(html);
  const prices = [];
  const seen = new Set();
  let match;

  priceRegex.lastIndex = 0;
  while ((match = priceRegex.exec(text)) && prices.length < 20) {
    const price = parsePrice(match[1]);
    if (!price) continue;

    const key = price.toFixed(2);
    if (seen.has(key)) continue;
    seen.add(key);

    prices.push({
      price,
      label: match[0].replace(/\s+/g, ' ').trim(),
      context: text.slice(Math.max(0, match.index - 70), Math.min(text.length, match.index + 110)).trim()
    });
  }

  return prices.sort((a, b) => a.price - b.price);
}

async function scanUrl(rawUrl) {
  const url = normalizeProductUrl(rawUrl);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; PriceErrorScanner/1.0)'
    }
  });

  if (!response.ok) throw new Error(`La pagina respondio ${response.status}.`);

  const html = await response.text();
  const candidates = extractPrices(html);
  const best = candidates[0] || null;

  return {
    url,
    domain: new URL(url).hostname,
    title: extractTitle(html, url),
    price: best ? best.price : null,
    label: best ? best.label : '',
    context: best ? best.context : '',
    candidates: candidates.slice(0, 5)
  };
}

function buildSummary(rows, referencePrice, minDiscount) {
  const valid = rows.filter(row => row.price !== null);
  const sorted = valid.map(row => row.price).sort((a, b) => a - b);
  const baseline = referencePrice || (sorted.length ? sorted[Math.floor(sorted.length / 2)] : null);

  const results = rows.map(row => {
    if (row.price === null) {
      return { ...row, severity: 'error', discount: null, reason: row.error || 'No se encontro precio visible.' };
    }

    const discount = baseline ? Math.round(((baseline - row.price) / baseline) * 1000) / 10 : null;
    const isAlert = discount !== null && discount >= minDiscount;
    return {
      ...row,
      discount,
      severity: isAlert ? (discount >= minDiscount * 2 ? 'high' : 'watch') : 'normal',
      reason: isAlert ? `${discount}% por debajo de ${referencePrice ? 'tu referencia' : 'la mediana'}.` : 'Dentro del rango esperado.'
    };
  });

  return {
    scanned: rows.length,
    withPrice: valid.length,
    baseline,
    alerts: results.filter(row => row.severity === 'high' || row.severity === 'watch').length,
    results
  };
}

async function handleScan(req, res) {
  try {
    const body = await readBody(req);
    const urls = String(body.urls || '').split(/\r?\n/).map(url => url.trim()).filter(Boolean).slice(0, maxUrls);
    if (!urls.length) return json(res, 400, { success: false, message: 'Agrega al menos una URL.' });

    const referencePrice = parsePrice(body.referencePrice);
    const minDiscount = Math.max(1, Math.min(95, Number(body.minDiscount || 40)));
    const rows = await Promise.all(urls.map(async url => {
      try {
        return await scanUrl(url);
      } catch (error) {
        return { url, domain: '', title: url, price: null, label: '', context: '', candidates: [], error: error.message };
      }
    }));

    json(res, 200, { success: true, minDiscount, ...buildSummary(rows, referencePrice, minDiscount) });
  } catch (error) {
    json(res, 400, { success: false, message: error.message });
  }
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const relative = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(root, relative));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/scan') {
    handleScan(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  json(res, 405, { success: false, message: 'Metodo no permitido.' });
});

server.listen(port, () => {
  console.log(`Buscador de errores de precios disponible en http://localhost:${port}`);
});
