import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';

const app = express();
const port = Number(process.env.PORT || 3000);

const SOURCE_SPREADSHEET_ID = process.env.SOURCE_SPREADSHEET_ID || '1zeg86JmEDBaAK_Nq3Iq7i1e5NzrSXSkhoCfVZ4OnmnU';

const SHEETS = {
  BASE: 'Base',
  MP: 'MP',
  GRUPOS: 'GRUPOS',
  FAMILIAS: 'FAMILIAS',
  TIPOS: 'TIPOS',
  TIPOS_PT: 'TIPOS_PT',
  FAMILIA_TIPOS: 'FAMILIA_TIPOS',
  MATERIALES: 'MATERIALES'
};

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
});

const sheetsApi = google.sheets({ version: 'v4', auth });

app.use(express.json());
app.use(express.static('public'));

async function getSheetValues(sheetName) {
  const response = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: SOURCE_SPREADSHEET_ID,
    range: sheetName
  });

  const values = response.data.values || [];
  if (values.length < 2) return [];

  return values.slice(1).map(row => row.map(value => String(value ?? '')));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function isPTGroup(nombreGrupo) {
  return normalizeText(nombreGrupo).toUpperCase().startsWith('P.T.');
}

function requiresMaterial(nombreGrupo) {
  const gruposConMaterial = [
    'MATERIA PRIMA',
    'BIENES DE CONSUMO',
    'SERVICIOS',
    'EMPAQUE',
    'HERRAMIENTA',
    'IMPORTACIONES',
    'ACTIVOS'
  ];

  return gruposConMaterial.includes(normalizeKey(nombreGrupo));
}

async function readGrupos() {
  const data = await getSheetValues(SHEETS.GRUPOS);
  return data
    .filter(row => row[0] && row[1])
    .map(row => ({ grupo: normalizeText(row[0]), prefijo: normalizeText(row[1]) }));
}

async function readFamilias() {
  const data = await getSheetValues(SHEETS.FAMILIAS);
  return data
    .filter(row => row[0] && row[1] && row[2])
    .map(row => ({ grupo: normalizeText(row[0]), familia: normalizeText(row[1]), idFamilia: normalizeText(row[2]) }));
}

async function readTipos() {
  const data = await getSheetValues(SHEETS.TIPOS);
  return data
    .filter(row => row[0] && row[1])
    .map(row => ({ tipo: normalizeText(row[0]), idTipo: normalizeText(row[1]) }));
}

async function readTiposPT() {
  const data = await getSheetValues(SHEETS.TIPOS_PT);
  return data
    .filter(row => row[0] && row[1])
    .map(row => ({ tipo: normalizeText(row[0]), idTipo: normalizeText(row[1]) }));
}

async function readFamiliaTipos() {
  const data = await getSheetValues(SHEETS.FAMILIA_TIPOS);
  return data
    .filter(row => row[0] && row[1] && row[2])
    .map(row => ({ grupo: normalizeText(row[0]), familia: normalizeText(row[1]), tipo: normalizeText(row[2]) }));
}

async function readMateriales() {
  const data = await getSheetValues(SHEETS.MATERIALES);
  return data
    .filter(row => row[0] && row[1] && row[2])
    .map(row => ({ grupo: normalizeText(row[0]), material: normalizeText(row[1]), idMaterial: normalizeText(row[2]) }));
}

async function findGrupo(nombreGrupo) {
  const grupoKey = normalizeKey(nombreGrupo);
  const grupo = (await readGrupos()).find(item => normalizeKey(item.grupo) === grupoKey);
  if (!grupo) throw new Error(`No se encontro el grupo "${nombreGrupo}".`);
  return grupo;
}

async function findFamilia(nombreGrupo, nombreFamilia) {
  const grupoKey = normalizeKey(nombreGrupo);
  const familiaKey = normalizeKey(nombreFamilia);
  const familia = (await readFamilias()).find(item => normalizeKey(item.grupo) === grupoKey && normalizeKey(item.familia) === familiaKey);
  if (!familia) throw new Error(`No se encontro la familia "${nombreFamilia}" para el grupo "${nombreGrupo}".`);
  return familia;
}

async function findTipo(nombreGrupo, nombreFamilia, nombreTipo) {
  const grupoKey = normalizeKey(nombreGrupo);
  const familiaKey = normalizeKey(nombreFamilia);
  const tipoKey = normalizeKey(nombreTipo);

  if (isPTGroup(nombreGrupo)) {
    const tipo = (await readTiposPT()).find(item => normalizeKey(item.tipo) === tipoKey);
    if (!tipo) throw new Error(`No se encontro el tipo PT "${nombreTipo}".`);
    return tipo;
  }

  const relaciones = await readFamiliaTipos();
  const existeRelacion = relaciones.some(item => normalizeKey(item.grupo) === grupoKey && normalizeKey(item.familia) === familiaKey && normalizeKey(item.tipo) === tipoKey);
  if (!existeRelacion) throw new Error(`El tipo "${nombreTipo}" no esta permitido para la familia "${nombreFamilia}" del grupo "${nombreGrupo}".`);

  const tipo = (await readTipos()).find(item => normalizeKey(item.tipo) === tipoKey);
  if (!tipo) throw new Error(`No se encontro el tipo "${nombreTipo}" en el catalogo TIPOS.`);
  return tipo;
}

async function findMaterial(nombreGrupo, nombreMaterial) {
  const grupoKey = normalizeKey(nombreGrupo);
  const materialKey = normalizeKey(nombreMaterial);
  const material = (await readMateriales()).find(item => normalizeKey(item.grupo) === grupoKey && normalizeKey(item.material) === materialKey);
  if (!material) throw new Error(`No se encontro el material "${nombreMaterial}" para el grupo "${nombreGrupo}".`);
  return material;
}

function ok(data) {
  return { success: true, ...data };
}

function fail(error, fallback = {}) {
  return { success: false, message: error.message, ...fallback };
}

app.get('/api/grupos', async (_req, res) => {
  try {
    const rows = (await readGrupos()).map(item => ({ nombre: item.grupo, prefijo: item.prefijo }));
    res.json(ok({ rows }));
  } catch (error) {
    res.status(500).json(fail(error, { rows: [] }));
  }
});

app.get('/api/familias', async (req, res) => {
  try {
    const grupoKey = normalizeKey(req.query.grupo);
    const rows = (await readFamilias())
      .filter(item => normalizeKey(item.grupo) === grupoKey)
      .map(item => ({ nombre: item.familia, id: item.idFamilia }));
    res.json(ok({ rows }));
  } catch (error) {
    res.status(500).json(fail(error, { rows: [] }));
  }
});

app.get('/api/tipos', async (req, res) => {
  try {
    const { grupo, familia } = req.query;
    if (!grupo || !familia) return res.json(ok({ rows: [] }));

    if (isPTGroup(grupo)) {
      const rows = (await readTiposPT()).map(item => ({ nombre: item.tipo, id: item.idTipo }));
      return res.json(ok({ rows }));
    }

    const grupoKey = normalizeKey(grupo);
    const familiaKey = normalizeKey(familia);
    const tiposCatalogo = await readTipos();
    const relaciones = (await readFamiliaTipos()).filter(item => normalizeKey(item.grupo) === grupoKey && normalizeKey(item.familia) === familiaKey);

    if (!relaciones.length) {
      return res.status(404).json(fail(new Error(`No hay relaciones en FAMILIA_TIPOS para grupo "${grupo}" y familia "${familia}".`), { rows: [] }));
    }

    const faltantes = [];
    const rows = relaciones.map(rel => {
      const tipoEncontrado = tiposCatalogo.find(t => normalizeKey(t.tipo) === normalizeKey(rel.tipo));
      if (!tipoEncontrado) {
        faltantes.push(rel.tipo);
        return null;
      }
      return { nombre: tipoEncontrado.tipo, id: tipoEncontrado.idTipo };
    }).filter(Boolean);

    if (!rows.length) {
      return res.status(404).json(fail(new Error(`Los tipos de FAMILIA_TIPOS no existen en TIPOS: ${faltantes.join(', ')}`), { rows: [] }));
    }

    res.json(ok({ rows }));
  } catch (error) {
    res.status(500).json(fail(error, { rows: [] }));
  }
});

app.get('/api/materiales', async (req, res) => {
  try {
    const { grupo } = req.query;
    if (!grupo || !requiresMaterial(grupo)) return res.json(ok({ required: false, rows: [] }));

    const grupoKey = normalizeKey(grupo);
    const rows = (await readMateriales())
      .filter(item => normalizeKey(item.grupo) === grupoKey)
      .map(item => ({ nombre: item.material, id: item.idMaterial }));

    res.json(ok({ required: true, rows }));
  } catch (error) {
    res.status(500).json(fail(error, { required: false, rows: [] }));
  }
});

async function construirCodigoPT(nombreGrupo, nombreFamilia, nombreTipo, nombreMaterial) {
  const grupo = await findGrupo(nombreGrupo);
  const familia = await findFamilia(nombreGrupo, nombreFamilia);
  const tipo = await findTipo(nombreGrupo, nombreFamilia, nombreTipo);

  let codigo = grupo.prefijo + familia.idFamilia + tipo.idTipo;
  let material = null;

  if (requiresMaterial(nombreGrupo)) {
    if (!nombreMaterial) throw new Error(`Debes seleccionar un material para el grupo "${nombreGrupo}".`);
    material = await findMaterial(nombreGrupo, nombreMaterial);
    codigo += material.idMaterial;
  }

  return {
    grupo: grupo.grupo,
    familia: familia.familia,
    tipo: tipo.tipo,
    material: material ? material.material : '',
    prefijoGrupo: grupo.prefijo,
    idFamilia: familia.idFamilia,
    idTipo: tipo.idTipo,
    idMaterial: material ? material.idMaterial : '',
    requiereMaterial: requiresMaterial(nombreGrupo),
    codigo
  };
}

app.post('/api/codigo', async (req, res) => {
  try {
    const armado = await construirCodigoPT(req.body.grupo, req.body.familia, req.body.tipo, req.body.material);
    res.json(ok(armado));
  } catch (error) {
    res.status(400).json(fail(error));
  }
});

app.post('/api/buscar', async (req, res) => {
  try {
    const armado = await construirCodigoPT(req.body.grupo, req.body.familia, req.body.tipo, req.body.material);
    const data = await getSheetValues(SHEETS.MP);
    const rows = data
      .filter(row => normalizeText(row[0]).startsWith(armado.codigo))
      .map((row, index) => ({
        indice: index + 1,
        codigoMP: row[0] || '',
        descripcion: row[1] || '',
        colC: row[2] || '',
        filaCompleta: row
      }));

    res.json(ok({ codigo: armado.codigo, total: rows.length, rows }));
  } catch (error) {
    res.status(400).json(fail(error, { rows: [] }));
  }
});

app.listen(port, () => {
  console.log(`Index De Anda disponible en http://localhost:${port}`);
});

