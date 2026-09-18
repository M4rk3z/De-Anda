const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const CONFIG_PATH = process.env.DEANDA_API_CONFIG || path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
  port: 3001,
  postgres: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'de_anda_local',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || ''
  }
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;

  const userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    postgres: {
      ...DEFAULT_CONFIG.postgres,
      ...(userConfig.postgres || {})
    }
  };
}

const config = loadConfig();
const app = express();
const pool = new Pool(config.postgres);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function quoteIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || /[\u0000-\u001f]/.test(text)) {
    throw new Error('Identificador invalido.');
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function parseColumns(select) {
  const text = String(select || '*').trim();
  if (!text || text === '*') return '*';

  const columns = [];
  let current = '';
  let quoted = false;

  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      if (current.trim()) columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) columns.push(current.trim());

  return columns
    .map(column => column.replace(/^"|"$/g, '').trim())
    .filter(Boolean)
    .map(quoteIdentifier)
    .join(', ');
}

function addParam(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function buildWhere(filters = [], params = []) {
  if (!Array.isArray(filters) || !filters.length) return '';

  const clauses = filters.map(filter => {
    const column = quoteIdentifier(filter.column);

    if (filter.op === 'eq') {
      return `${column} = ${addParam(params, filter.value)}`;
    }

    if (filter.op === 'neq') {
      return `${column} <> ${addParam(params, filter.value)}`;
    }

    if (filter.op === 'in') {
      const values = Array.isArray(filter.value) ? filter.value : [];
      if (!values.length) return 'false';
      const placeholders = values.map(value => addParam(params, value)).join(', ');
      return `${column} in (${placeholders})`;
    }

    if (filter.op === 'is') {
      if (filter.value === null) return `${column} is null`;
      if (filter.value === true) return `${column} is true`;
      if (filter.value === false) return `${column} is false`;
      return `${column} is ${String(filter.value)}`;
    }

    if (filter.op === 'ilike') {
      return `${column} ilike ${addParam(params, filter.value)}`;
    }

    if (filter.op === 'like') {
      return `${column} like ${addParam(params, filter.value)}`;
    }

    throw new Error(`Filtro no soportado: ${filter.op}`);
  });

  return ` where ${clauses.join(' and ')}`;
}

function buildOrder(orders = []) {
  if (!Array.isArray(orders) || !orders.length) return '';

  const clauses = orders.map(order => {
    const direction = order.ascending === false ? 'desc' : 'asc';
    return `${quoteIdentifier(order.column)} ${direction}`;
  });

  return ` order by ${clauses.join(', ')}`;
}

function buildLimit(query = {}, params = []) {
  if (query.range && Number.isInteger(query.range.from) && Number.isInteger(query.range.to)) {
    const limit = Math.max(0, query.range.to - query.range.from + 1);
    return ` limit ${addParam(params, limit)} offset ${addParam(params, query.range.from)}`;
  }

  if (Number.isInteger(query.limit)) {
    return ` limit ${addParam(params, query.limit)}`;
  }

  return '';
}

async function runSelect(client, query) {
  const params = [];
  const sql = [
    `select ${parseColumns(query.select)} from public.${quoteIdentifier(query.table)}`,
    buildWhere(query.filters, params),
    buildOrder(query.orders),
    buildLimit(query, params)
  ].join('');

  const result = await client.query(sql, params);
  return result.rows;
}

async function runInsert(client, query) {
  const rows = Array.isArray(query.payload) ? query.payload : [query.payload];
  if (!rows.length || !rows[0] || typeof rows[0] !== 'object') {
    throw new Error('Payload de insert invalido.');
  }

  const columns = Object.keys(rows[0]);
  const params = [];
  const valuesSql = rows.map(row => {
    const placeholders = columns.map(column => addParam(params, row[column]));
    return `(${placeholders.join(', ')})`;
  });
  const returning = query.returning ? ` returning ${parseColumns(query.select)}` : '';
  const sql = `insert into public.${quoteIdentifier(query.table)} (${columns.map(quoteIdentifier).join(', ')}) values ${valuesSql.join(', ')}${returning}`;
  const result = await client.query(sql, params);
  return query.returning ? result.rows : null;
}

async function runUpdate(client, query) {
  const payload = query.payload || {};
  const columns = Object.keys(payload);
  if (!columns.length) throw new Error('Payload de update vacio.');

  const params = [];
  const assignments = columns.map(column => `${quoteIdentifier(column)} = ${addParam(params, payload[column])}`);
  const returning = query.returning ? ` returning ${parseColumns(query.select)}` : '';
  const sql = [
    `update public.${quoteIdentifier(query.table)} set ${assignments.join(', ')}`,
    buildWhere(query.filters, params),
    returning
  ].join('');

  const result = await client.query(sql, params);
  return query.returning ? result.rows : null;
}

async function runDelete(client, query) {
  const params = [];
  const returning = query.returning ? ` returning ${parseColumns(query.select)}` : '';
  const sql = [
    `delete from public.${quoteIdentifier(query.table)}`,
    buildWhere(query.filters, params),
    returning
  ].join('');

  const result = await client.query(sql, params);
  return query.returning ? result.rows : null;
}

function applySingleMode(rows, mode) {
  if (mode === 'single') {
    if (!rows || rows.length !== 1) {
      throw new Error(`Se esperaba un registro y se recibieron ${rows?.length || 0}.`);
    }
    return rows[0];
  }

  if (mode === 'maybeSingle') {
    if (!rows || rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(`Se esperaba maximo un registro y se recibieron ${rows.length}.`);
    }
    return rows[0];
  }

  return rows;
}

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('select current_database() as database, now() as server_time');
    res.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: { message: error.message } });
  }
});

app.post('/api/query', async (req, res) => {
  const client = await pool.connect();

  try {
    const query = req.body || {};
    let rows = null;

    if (query.action === 'select') rows = await runSelect(client, query);
    else if (query.action === 'insert') rows = await runInsert(client, query);
    else if (query.action === 'update') rows = await runUpdate(client, query);
    else if (query.action === 'delete') rows = await runDelete(client, query);
    else throw new Error(`Accion no soportada: ${query.action}`);

    res.json({
      data: query.returning || query.action === 'select'
        ? applySingleMode(rows, query.singleMode)
        : null,
      error: null
    });
  } catch (error) {
    res.status(400).json({
      data: null,
      error: { message: error.message }
    });
  } finally {
    client.release();
  }
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`API local De Anda escuchando en http://0.0.0.0:${config.port}`);
  console.log(`Base de datos: ${config.postgres.database}@${config.postgres.host}:${config.postgres.port}`);
});
