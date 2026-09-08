// Configuracion del Panel de control y exportacion a Google Sheets.
let editorMaestroRows = [];
const GOOGLE_SHEET_BD_GENERAL_ID = '1ZLRZQha9-TC3JF_Waan9suSIZ9l2U6kMeuHlRhQKBCo';
const GOOGLE_SHEET_BD_GENERAL_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_BD_GENERAL_ID}/edit`;
const GOOGLE_SHEET_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxzyr0DbU0zuWCZX7racR-82u-Tz8KvmoAOdvMFihkzMCc5L7fAje95nl1plr2tg1ehZQ/exec';
const GOOGLE_SHEET_EXPORT_CHUNK_SIZE = 400;
const BD_GENERAL_EXPORT_COLUMNS = [
  'Id',
  'Codigo Pixvs',
  'Nombre Pixvs',
  'Codigo SAP',
  'Nombre SAP',
  'Version SAP',
  'Revision SAP',
  'Muliix',
  'Status',
  'Fecha de ultimo Cambio',
  'Responsable'
];
const TABLA_LOG_CONTROL = 'Log_Control';
const LOG_CONTROL_ACCIONES = ['ALTA', 'EDICION', 'ELIMINACION', 'REEMPLAZO'];
const LOG_CONTROL_MODULOS = [
  'Nuevo Codigo',
  'Editor Maestro',
  'Catalogos',
  'Rutas de Trabajo',
  'Control de Accesos'
];

// Catalogos administrables desde el panel.
const CATALOGOS_ADMIN = {
  'DT_Grupos': {
    label: 'DT_Grupos',
    sortField: 'ID',
    keys: ['Grupo', 'ID'],
    fields: [
      { name: 'Grupo', label: 'Grupo' },
      { name: 'ID', label: 'ID' }
    ]
  },
  'MP:MateriaPrima': {
    label: 'MP:MateriaPrima',
    sortField: 'IdFamilia',
    keys: ['Grupo', 'Familia', 'IdFamilia'],
    fields: [
      { name: 'Grupo', label: 'Grupo' },
      { name: 'Familia', label: 'Familia' },
      { name: 'IdFamilia', label: 'Id Familia' }
    ]
  },
  'MP:Materiales': {
    label: 'MP:Materiales',
    sortField: 'Id_Material',
    keys: ['Grupo', 'Material', 'Id_Material'],
    fields: [
      { name: 'Grupo', label: 'Grupo' },
      { name: 'Material', label: 'Material' },
      { name: 'Id_Material', label: 'Id Material' },
      { name: 'Nomenclatura', label: 'Nomenclatura' }
    ]
  },
  'MP:Tipos': {
    label: 'MP:Tipos',
    sortField: 'Id',
    keys: ['id_Keys'],
    fields: [
      { name: 'id_Keys', label: 'ID Key', readonly: true, hidden: true },
      { name: 'Familia', label: 'Familia' },
      { name: 'Tipo', label: 'Tipo' },
      { name: 'Id', label: 'ID' }
    ]
  },
  'PT:Tipos': {
    label: 'PT:Tipos',
    sortField: 'Id',
    keys: ['Registro_Id'],
    fields: [
      { name: 'Registro_Id', label: 'Registro ID', readonly: true, hidden: true },
      { name: 'Clave', label: 'Clave' },
      { name: 'Tipos', label: 'Tipo' },
      { name: 'Id', label: 'ID' }
    ]
  },
  'CT_CentrosTrabajo': {
    label: 'CT_CentrosTrabajo',
    sortField: 'CT',
    keys: ['CT'],
    fields: [
      { name: 'Actividad', label: 'Actividad' },
      { name: 'CT', label: 'Centro de Trabajo' },
      { name: 'Descripcion', label: 'Descripcion CT' }
    ]
  },
  'CR_CentrosRecurso': {
    label: 'CR_CentrosRecurso',
    sortField: 'CR',
    keys: ['CR'],
    fields: [
      { name: 'CT', label: 'Centro de Trabajo' },
      { name: 'CR', label: 'Centro de Recurso' },
      { name: 'Descripcion', label: 'Descripcion CR' },
      { name: 'Costo_Hr', label: 'Costo por hora', optional: true, type: 'number' }
    ]
  }
};

let catalogoAdminActual = 'DT_Grupos';
let catalogoAdminRows = [];
let catalogoAdminOrden = 'asc';
let logControlRows = [];

// Entrada principal del Panel de control.
function renderPanelControl() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  if (!usuarioPuede(0, 1)) {
    mostrarAccesoDenegado();
    return;
  }

  const nombreUsuario = obtenerNombreUsuarioVisible();

  viewer.innerHTML = `
    <div class="catalog-wrapper">
      <div class="catalog-header">
        <h2>Bienvenido, ${escapeHtml(nombreUsuario)}</h2>
        <p>Herramientas de administracion.</p>
      </div>

      <div class="nuevo-codigo-panel">
        <div class="panel-actions">
          <button onclick="renderEditorMaestro()">Editor Maestro</button>
          <button onclick="renderLogControl()">Log Control</button>
          ${usuarioPuede(0) ? '<button onclick="renderControlAccesos()">Control de Accesos</button>' : ''}
          ${usuarioPuede(0) ? '<button onclick="renderAdministrarCatalogos()">Administrar Catalogos</button>' : ''}
          ${usuarioPuede(0) ? '<button onclick="renderFuncionesAdicionales()">Importar a Sheets</button>' : ''}
        </div>

        <div id="panelControlContenido" class="panel-control-content"></div>
      </div>
    </div>
  `;
}

// Editor Maestro: consulta y actualiza registros de BD_General.
function renderEditorMaestro() {
  if (!usuarioPuede(0, 1)) {
    mostrarAccesoDenegado();
    return;
  }

  const contenedor = document.getElementById('panelControlContenido');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="control-card">
      <div class="catalog-header">
        <h2>Editor Maestro</h2>
        <p>Consulta y actualiza registros de BD_General.</p>
      </div>

      <div class="editor-toolbar">
        <div class="field-block">
          <label for="buscadorMaestro">Buscar</label>
          <input
            id="buscadorMaestro"
            type="text"
            placeholder="Codigo o nombre Pixvs / SAP"
            onkeydown="onEditorMaestroKeydown(event)"
          >
        </div>

        <button type="button" onclick="buscarEditorMaestro()">Buscar</button>
      </div>

      <div id="editorMaestroStatus" class="status-box">
        Escribe un valor o presiona Buscar para mostrar registros.
      </div>

      <div class="table-scroll">
        <table class="catalog-table master-editor-table">
          <thead>
            <tr>
              <th>Codigo SAP</th>
              <th>Nombre SAP</th>
              <th>Codigo Pixvs</th>
              <th>Nombre Pixvs</th>
              <th>Version SAP</th>
              <th>Revision SAP</th>
              <th>Muliix</th>
              <th>Status</th>
              <th>Fecha Ultimo Cambio</th>
              <th>Responsable</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody id="editorMaestroResultados">
            <tr>
              <td colspan="11">Sin resultados todavia.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function onEditorMaestroKeydown(event) {
  if (event.key === 'Enter') {
    buscarEditorMaestro();
  }
}

async function buscarEditorMaestro() {
  const input = document.getElementById('buscadorMaestro');
  const statusBox = document.getElementById('editorMaestroStatus');
  const busqueda = input ? input.value.trim() : '';

  if (!statusBox) return;

  statusBox.textContent = 'Buscando...';

  const columnas = '"Id","Codigo Pixvs","Nombre Pixvs","Codigo SAP","Nombre SAP","Version SAP","Revision SAP","Muliix","Status","Fecha de ultimo Cambio","Responsable"';
  let data = [];
  let error = null;

  if (busqueda) {
    const resultado = await leerSupabasePaginado(
      'BD_General',
      columnas,
      'Codigo SAP'
    );

    error = resultado.error;
    data = filtrarRegistrosNormalizados(
      resultado.data,
      busqueda,
      ['Codigo Pixvs', 'Nombre Pixvs', 'Codigo SAP', 'Nombre SAP']
    ).slice(0, 25);
  } else {
    const resultado = await supabaseClient
      .from('BD_General')
      .select(columnas)
      .order('Codigo SAP', { ascending: true })
      .limit(25);

    data = resultado.data || [];
    error = resultado.error;
  }

  if (error) {
    console.error('Error Supabase:', error);
    statusBox.textContent = 'Error: ' + error.message;
    return;
  }

  renderResultadosEditorMaestro(data);

  statusBox.textContent = data.length
    ? `Registros encontrados: ${data.length}`
    : 'No se encontraron resultados.';
}

function renderResultadosEditorMaestro(rows) {
  const tbody = document.getElementById('editorMaestroResultados');
  if (!tbody) return;

  editorMaestroRows = rows || [];
  const puedeEditarMuliix = usuarioPuedeEditarMuliix();

  if (!editorMaestroRows.length) {
    tbody.innerHTML = '<tr><td colspan="11">No se encontraron resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = editorMaestroRows.map((row, index) => `
    <tr>
      <td>
        <input
          id="maestro-codigo-sap-${index}"
          class="master-input master-code-input master-locked-input"
          type="text"
          value="${escapeHtml(row['Codigo SAP'] || '')}"
          readonly
          aria-readonly="true"
          title="El Codigo SAP no se puede modificar"
        >
      </td>

      <td>
        <textarea
          id="maestro-nombre-sap-${index}"
          class="master-textarea"
          rows="2"
        >${escapeHtml(row['Nombre SAP'] || '')}</textarea>
      </td>

      <td>
        <input
          id="maestro-codigo-pixvs-${index}"
          class="master-input master-code-input"
          type="text"
          value="${escapeHtml(row['Codigo Pixvs'] || '')}"
        >
      </td>

      <td>
        <textarea
          id="maestro-nombre-pixvs-${index}"
          class="master-textarea"
          rows="2"
        >${escapeHtml(row['Nombre Pixvs'] || '')}</textarea>
      </td>

      <td>
        <input
          id="maestro-version-sap-${index}"
          class="master-input master-number-input"
          type="number"
          min="0"
          step="1"
          value="${escapeHtml(row['Version SAP'] ?? '')}"
        >
      </td>

      <td>
        <input
          id="maestro-revision-sap-${index}"
          class="master-input master-number-input"
          type="number"
          min="0"
          step="1"
          value="${escapeHtml(row['Revision SAP'] ?? '')}"
        >
      </td>

      <td class="master-checkbox-cell">
        <input
          id="maestro-muliix-${index}"
          class="muliix-checkbox"
          type="checkbox"
          ${normalizarBooleanoMuliix(row['Muliix']) ? 'checked' : ''}
          ${puedeEditarMuliix ? '' : 'disabled'}
          aria-label="Muliix"
          title="${puedeEditarMuliix ? 'Muliix' : 'No tienes permiso para modificar Muliix'}"
        >
      </td>

      <td>
        <select id="maestro-status-${index}" class="master-select">
          ${renderOpcionesStatusMaestro(row['Status'])}
        </select>
      </td>

      <td class="master-readonly">
        ${escapeHtml(formatearFecha(row['Fecha de ultimo Cambio']))}
      </td>

      <td class="master-readonly">
        ${escapeHtml(row['Responsable'] || '')}
      </td>

      <td>
        <button
          type="button"
          class="master-save-button"
          onclick="guardarRegistroMaestro(${index})"
        >
          Guardar
        </button>
      </td>
    </tr>
  `).join('');
}

function renderOpcionesStatusMaestro(statusActual) {
  const opciones = [
    '1 - Proceso',
    '2 - Local',
    '3 - SAP',
    '4 - Bloqueado'
  ];

  return opciones.map(status => `
    <option value="${status}" ${status === statusActual ? 'selected' : ''}>
      ${status}
    </option>
  `).join('');
}

async function guardarRegistroMaestro(index) {
  const row = editorMaestroRows[index];
  const statusBox = document.getElementById('editorMaestroStatus');

  if (!row) {
    if (statusBox) statusBox.textContent = 'No se encontro el registro seleccionado.';
    return;
  }

  const versionRaw = obtenerValorMaestro('maestro-version-sap', index);
  const revisionRaw = obtenerValorMaestro('maestro-revision-sap', index);

  const versionSap = convertirEnteroOpcional(versionRaw);
  const revisionSap = convertirEnteroOpcional(revisionRaw);

  if (versionSap === undefined || revisionSap === undefined) {
    if (statusBox) {
      statusBox.textContent = 'Version SAP y Revision SAP deben ser numeros enteros.';
    }
    return;
  }

  const responsable = obtenerNombreUsuarioVisible();
  const fechaCambio = new Date().toISOString();

  const payload = {
    'Codigo Pixvs': valorONull(obtenerValorMaestro('maestro-codigo-pixvs', index)),
    'Nombre Pixvs': valorONull(obtenerValorMaestro('maestro-nombre-pixvs', index)),
    'Nombre SAP': valorONull(obtenerValorMaestro('maestro-nombre-sap', index)),
    'Version SAP': versionSap,
    'Revision SAP': revisionSap,
    'Status': obtenerValorMaestro('maestro-status', index),
    'Fecha de ultimo Cambio': fechaCambio,
    'Responsable': responsable
  };

  if (usuarioPuedeEditarMuliix()) {
    payload['Muliix'] = obtenerCheckboxMaestro('maestro-muliix', index);
  }

  if (statusBox) statusBox.textContent = 'Guardando cambios...';

  const { data, error } = await supabaseClient
    .from('BD_General')
    .update(payload)
    .eq('Id', row.Id)
    .select('"Id","Codigo Pixvs","Nombre Pixvs","Codigo SAP","Nombre SAP","Version SAP","Revision SAP","Muliix","Status","Fecha de ultimo Cambio","Responsable"')
    .maybeSingle();

  if (error) {
    console.error('Error Supabase:', error);
    if (statusBox) statusBox.textContent = 'Error al guardar: ' + error.message;
    return;
  }

  if (!data) {
    if (statusBox) {
      statusBox.textContent = 'No se actualizo el registro. Revisa la policy UPDATE de BD_General.';
    }
    return;
  }

  editorMaestroRows[index] = data;
  renderResultadosEditorMaestro(editorMaestroRows);

  await registrarLogControl({
    modulo: 'Editor Maestro',
    accion: 'EDICION',
    tabla: 'BD_General',
    registroId: row.Id,
    codigoSap: row['Codigo SAP'] || data['Codigo SAP'],
    descripcion: 'Actualizacion desde Editor Maestro',
    antes: row,
    despues: data
  });

  if (statusBox) {
    statusBox.textContent = 'Registro actualizado correctamente.';
  }

  mostrarPopupGuardado('Registro actualizado correctamente.');
}

function obtenerValorMaestro(prefijo, index) {
  const elemento = document.getElementById(`${prefijo}-${index}`);
  return elemento ? elemento.value.trim() : '';
}

function obtenerCheckboxMaestro(prefijo, index) {
  const elemento = document.getElementById(`${prefijo}-${index}`);
  return Boolean(elemento?.checked);
}

function convertirEnteroOpcional(valor) {
  if (valor === '') return null;

  const numero = Number(valor);

  if (!Number.isInteger(numero) || numero < 0) {
    return undefined;
  }

  return numero;
}

function valorONull(valor) {
  return valor === '' ? null : valor;
}

/*************************************************
 * LOG CONTROL
 *************************************************/

function renderLogControl() {
  if (!usuarioPuede(0, 1)) {
    mostrarAccesoDenegado();
    return;
  }

  const contenedor = document.getElementById('panelControlContenido');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="control-card log-control-card">
      <div class="catalog-header">
        <h2>Log Control</h2>
        <p>Historial de altas, ediciones, eliminaciones y reemplazos realizados en el sistema.</p>
      </div>

      <div class="log-control-toolbar">
        <div class="field-block">
          <label for="logControlFiltro">Buscar</label>
          <input
            id="logControlFiltro"
            type="search"
            placeholder="Codigo, usuario, tabla o descripcion"
            oninput="renderFilasLogControl()"
          >
        </div>

        <div class="field-block">
          <label for="logControlModulo">Modulo</label>
          <select id="logControlModulo" onchange="renderFilasLogControl()">
            <option value="">Todos</option>
            ${LOG_CONTROL_MODULOS.map(modulo => `
              <option value="${escapeHtml(modulo)}">${escapeHtml(modulo)}</option>
            `).join('')}
          </select>
        </div>

        <div class="field-block">
          <label for="logControlAccion">Accion</label>
          <select id="logControlAccion" onchange="renderFilasLogControl()">
            <option value="">Todas</option>
            ${LOG_CONTROL_ACCIONES.map(accion => `
              <option value="${escapeHtml(accion)}">${escapeHtml(accion)}</option>
            `).join('')}
          </select>
        </div>

        <button type="button" onclick="cargarLogControl()">Actualizar</button>
      </div>

      <div id="logControlStatus" class="status-box">Cargando log...</div>

      <div class="log-control-layout">
        <div class="table-scroll">
          <table class="catalog-table log-control-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Modulo</th>
                <th>Accion</th>
                <th>Tabla</th>
                <th>Registro</th>
                <th>Descripcion</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody id="logControlBody">
              <tr>
                <td colspan="8">Sin eventos todavia.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside id="logControlDetalle" class="log-control-detail">
          <h3>Detalle del cambio</h3>
          <p>Selecciona un evento para revisar que cambio.</p>
        </aside>
      </div>
    </div>
  `;

  cargarLogControl();
}

async function cargarLogControl() {
  const status = document.getElementById('logControlStatus');
  const body = document.getElementById('logControlBody');
  if (status) status.textContent = 'Cargando log...';

  const { data, error } = await supabaseClient
    .from(TABLA_LOG_CONTROL)
    .select('*')
    .order('fecha', { ascending: false })
    .limit(300);

  if (error) {
    logControlRows = [];
    if (status) status.textContent = 'Error al cargar log: ' + error.message;
    if (body) body.innerHTML = '<tr><td colspan="8">No se pudo cargar el log.</td></tr>';
    return;
  }

  logControlRows = data || [];
  if (status) status.textContent = `Eventos cargados: ${logControlRows.length}`;
  renderFilasLogControl();
}

function renderFilasLogControl() {
  const body = document.getElementById('logControlBody');
  if (!body) return;

  const filtro = normalizarTextoFlexible(document.getElementById('logControlFiltro')?.value || '');
  const modulo = document.getElementById('logControlModulo')?.value || '';
  const accion = document.getElementById('logControlAccion')?.value || '';

  const rows = logControlRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (modulo && row.modulo !== modulo) return false;
      if (accion && row.accion !== accion) return false;
      if (!filtro) return true;

      return [
        row.usuario,
        row.modulo,
        row.accion,
        row.tabla,
        row.registro_id,
        row.codigo_sap,
        row.descripcion
      ].some(valor => normalizarTextoFlexible(valor).includes(filtro));
    });

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8">No hay eventos con esos filtros.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(({ row, index }) => `
    <tr>
      <td>${escapeHtml(formatearFecha(row.fecha))}</td>
      <td>${escapeHtml(row.usuario || '-')}</td>
      <td>${escapeHtml(row.modulo || '-')}</td>
      <td><span class="log-action-badge">${escapeHtml(row.accion || '-')}</span></td>
      <td>${escapeHtml(row.tabla || '-')}</td>
      <td>${escapeHtml(row.codigo_sap || row.registro_id || '-')}</td>
      <td>${escapeHtml(row.descripcion || '-')}</td>
      <td>
        <button type="button" class="log-detail-button" onclick="mostrarDetalleLogControl(${index})">
          Ver
        </button>
      </td>
    </tr>
  `).join('');
}

function mostrarDetalleLogControl(index) {
  const row = logControlRows[index];
  const detalle = document.getElementById('logControlDetalle');
  if (!row || !detalle) return;

  const cambios = obtenerCambiosLogControl(row.antes, row.despues);

  detalle.innerHTML = `
    <h3>${escapeHtml(row.accion || 'Cambio')}</h3>
    <dl>
      <div><dt>Fecha</dt><dd>${escapeHtml(formatearFecha(row.fecha))}</dd></div>
      <div><dt>Usuario</dt><dd>${escapeHtml(row.usuario || '-')}</dd></div>
      <div><dt>Modulo</dt><dd>${escapeHtml(row.modulo || '-')}</dd></div>
      <div><dt>Tabla</dt><dd>${escapeHtml(row.tabla || '-')}</dd></div>
      <div><dt>Registro</dt><dd>${escapeHtml(row.codigo_sap || row.registro_id || '-')}</dd></div>
    </dl>

    <h4>Cambios</h4>
    ${cambios.length ? `
      <div class="log-change-list">
        ${cambios.map(cambio => `
          <div class="log-change-row">
            <strong>${escapeHtml(cambio.campo)}</strong>
            <span>${escapeHtml(cambio.antes)}</span>
            <span>${escapeHtml(cambio.despues)}</span>
          </div>
        `).join('')}
      </div>
    ` : '<p>No hay diferencias campo por campo para mostrar.</p>'}
  `;
}

function obtenerCambiosLogControl(antes, despues) {
  const antesObj = esObjetoPlanoLog(antes) ? antes : {};
  const despuesObj = esObjetoPlanoLog(despues) ? despues : {};
  const keys = Array.from(new Set([
    ...Object.keys(antesObj),
    ...Object.keys(despuesObj)
  ])).sort((a, b) => a.localeCompare(b));

  return keys
    .map(key => ({
      campo: key,
      antes: formatearValorLogControl(antesObj[key]),
      despues: formatearValorLogControl(despuesObj[key])
    }))
    .filter(row => row.antes !== row.despues);
}

function esObjetoPlanoLog(valor) {
  return Boolean(valor) && typeof valor === 'object' && !Array.isArray(valor);
}

function formatearValorLogControl(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

async function registrarLogControl(evento = {}) {
  if (!supabaseClient) return;

  const payload = {
    fecha: new Date().toISOString(),
    usuario: obtenerNombreUsuarioVisible(),
    usuario_id: localStorage.getItem('usuarioId') || null,
    modulo: evento.modulo || 'Sistema',
    accion: evento.accion || 'EDICION',
    tabla: evento.tabla || null,
    registro_id: evento.registroId === undefined || evento.registroId === null
      ? null
      : String(evento.registroId),
    codigo_sap: evento.codigoSap || null,
    descripcion: evento.descripcion || null,
    antes: evento.antes || null,
    despues: evento.despues || null
  };

  const { error } = await supabaseClient
    .from(TABLA_LOG_CONTROL)
    .insert(payload);

  if (error) {
    console.warn('No se pudo registrar Log Control:', error.message);
  }
}

/*************************************************
 * CONTROL DE ACCESOS
 *************************************************/

// Administracion de catalogos usados por Nuevo Codigo.
function renderAdministrarCatalogos() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const contenedor = document.getElementById('panelControlContenido');
  if (!contenedor) return;

  catalogoAdminOrden = 'asc';

  contenedor.innerHTML = `
    <div class="control-card catalog-admin-card">
      <div class="catalog-header">
        <h2>Administrar Catalogos</h2>
        <p>Edita los catalogos utilizados para construir codigos.</p>
      </div>

      <div class="catalog-admin-toolbar">
        <div class="field-block">
          <label for="catalogoAdminSelect">Tabla</label>
          <select id="catalogoAdminSelect" onchange="seleccionarCatalogoAdmin(this.value)">
            ${Object.entries(CATALOGOS_ADMIN).map(([tabla, config]) => `
              <option value="${escapeHtml(tabla)}" ${tabla === catalogoAdminActual ? 'selected' : ''}>
                ${escapeHtml(config.label)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="field-block catalog-admin-search">
          <label for="catalogoAdminFiltro">Buscar en la tabla</label>
          <input
            id="catalogoAdminFiltro"
            type="search"
            placeholder="Filtrar registros"
            oninput="renderFilasCatalogoAdmin(this.value)"
          >
        </div>

        <div class="field-block">
          <label for="catalogoAdminOrden">Orden por ID</label>
          <select id="catalogoAdminOrden" onchange="cambiarOrdenCatalogoAdmin(this.value)">
            <option value="asc" ${catalogoAdminOrden === 'asc' ? 'selected' : ''}>
              Menor a mayor
            </option>
            <option value="desc" ${catalogoAdminOrden === 'desc' ? 'selected' : ''}>
              Mayor a menor
            </option>
          </select>
        </div>

        <button type="button" onclick="cargarCatalogoAdmin()">Actualizar</button>
      </div>

      <div id="catalogoAdminNuevo" class="catalog-admin-new"></div>
      <div id="catalogoAdminStatus" class="status-box">Cargando catalogo...</div>

      <div class="table-scroll">
        <table class="catalog-table catalog-admin-table">
          <thead id="catalogoAdminHead"></thead>
          <tbody id="catalogoAdminBody"></tbody>
        </table>
      </div>
    </div>
  `;

  renderFormularioNuevoCatalogo();
  cargarCatalogoAdmin();
}

function seleccionarCatalogoAdmin(tabla) {
  if (!usuarioPuede(0) || !CATALOGOS_ADMIN[tabla]) return;

  catalogoAdminActual = tabla;
  catalogoAdminRows = [];
  catalogoAdminOrden = 'asc';

  const filtro = document.getElementById('catalogoAdminFiltro');
  if (filtro) filtro.value = '';

  renderFormularioNuevoCatalogo();
  cargarCatalogoAdmin();
}

function cambiarOrdenCatalogoAdmin(orden) {
  if (!usuarioPuede(0) || !['asc', 'desc'].includes(orden)) return;

  catalogoAdminOrden = orden;
  ordenarCatalogoAdminRows();

  const filtro = document.getElementById('catalogoAdminFiltro')?.value || '';
  renderFilasCatalogoAdmin(filtro);
}

function renderFormularioNuevoCatalogo() {
  const contenedor = document.getElementById('catalogoAdminNuevo');
  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  if (!contenedor || !config) return;

  const fields = config.fields.filter(field => !field.readonly);

  contenedor.innerHTML = `
    <div class="catalog-admin-new-header">
      <h3>Agregar registro</h3>
    </div>
    <div class="catalog-admin-new-grid">
      ${fields.map((field, index) => `
        <div class="field-block">
          <label for="catalogoNuevo-${index}">${escapeHtml(field.label)}</label>
          <input id="catalogoNuevo-${index}" type="${field.type === 'number' ? 'number' : 'text'}" ${field.type === 'number' ? 'step="0.0001"' : ''} autocomplete="off">
        </div>
      `).join('')}
      <button type="button" onclick="agregarRegistroCatalogo()">Agregar</button>
    </div>
  `;
}

async function cargarCatalogoAdmin() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const status = document.getElementById('catalogoAdminStatus');
  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  if (!status || !config) return;

  status.textContent = `Cargando ${config.label}...`;

  const { data, error } = await supabaseClient
    .from(catalogoAdminActual)
    .select('*')
    .order(config.sortField, {
      ascending: catalogoAdminOrden === 'asc'
    })
    .limit(1000);

  if (error) {
    catalogoAdminRows = [];
    status.textContent = `Error al cargar ${config.label}: ${error.message}`;
    renderFilasCatalogoAdmin();
    return;
  }

  catalogoAdminRows = data || [];
  ordenarCatalogoAdminRows();
  status.textContent = `Registros cargados: ${catalogoAdminRows.length}`;
  renderFilasCatalogoAdmin();
}

function ordenarCatalogoAdminRows() {
  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  if (!config) return;

  const factor = catalogoAdminOrden === 'desc' ? -1 : 1;

  catalogoAdminRows.sort((a, b) => {
    const valorA = String(a[config.sortField] ?? '');
    const valorB = String(b[config.sortField] ?? '');

    return valorA.localeCompare(valorB, undefined, {
      numeric: true,
      sensitivity: 'base'
    }) * factor;
  });
}

function renderFilasCatalogoAdmin(filtro = '') {
  const head = document.getElementById('catalogoAdminHead');
  const body = document.getElementById('catalogoAdminBody');
  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  if (!head || !body || !config) return;

  const visibleFields = config.fields
    .map((field, fieldIndex) => ({ field, fieldIndex }))
    .filter(({ field }) => !field.hidden);

  const filtroNormalizado = normalizarTextoFlexible(filtro);
  const rows = catalogoAdminRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!filtroNormalizado) return true;

      return config.fields.some(field => (
        normalizarTextoFlexible(row[field.name]).includes(filtroNormalizado)
      ));
    });

  head.innerHTML = `
    <tr>
      ${visibleFields.map(({ field }) => `<th>${escapeHtml(field.label)}</th>`).join('')}
      <th>Acciones</th>
    </tr>
  `;

  if (rows.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="${visibleFields.length + 1}">No hay registros para mostrar.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map(({ row, index }) => `
    <tr>
      ${visibleFields.map(({ field, fieldIndex }) => `
        <td>
          <input
            id="catalogo-${index}-${fieldIndex}"
            class="master-input"
            type="${field.type === 'number' ? 'number' : 'text'}"
            ${field.type === 'number' ? 'step="0.0001"' : ''}
            value="${escapeHtml(row[field.name] ?? '')}"
            ${field.readonly ? 'disabled' : ''}
          >
        </td>
      `).join('')}
      <td>
        <div class="catalog-admin-actions">
          <button type="button" onclick="guardarRegistroCatalogo(${index})">Guardar</button>
          <button type="button" class="danger-button" onclick="eliminarRegistroCatalogo(${index})">
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function agregarRegistroCatalogo() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  const status = document.getElementById('catalogoAdminStatus');
  const fields = config?.fields.filter(field => !field.readonly) || [];
  if (!config || !status) return;

  const payload = {};

  for (let index = 0; index < fields.length; index += 1) {
    const value = document.getElementById(`catalogoNuevo-${index}`)?.value.trim() || '';

    if (!value && !fields[index].optional) {
      status.textContent = `Completa el campo ${fields[index].label}.`;
      return;
    }

    const valorPreparado = prepararValorCatalogo(fields[index], value);
    if (valorPreparado === undefined) {
      status.textContent = `El campo ${fields[index].label} debe ser un numero valido.`;
      return;
    }

    payload[fields[index].name] = valorPreparado;
  }

  status.textContent = 'Agregando registro...';

  const { data, error } = await supabaseClient
    .from(catalogoAdminActual)
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error) {
    status.textContent = 'Error al agregar: ' + error.message;
    return;
  }

  fields.forEach((field, index) => {
    const input = document.getElementById(`catalogoNuevo-${index}`);
    if (input) input.value = '';
  });

  await cargarCatalogoAdmin();
  invalidarCatalogosRutasTrabajo();
  await registrarLogControl({
    modulo: 'Catalogos',
    accion: 'ALTA',
    tabla: catalogoAdminActual,
    registroId: obtenerRegistroIdCatalogo(config, data || payload),
    descripcion: `Alta en ${config.label}`,
    antes: null,
    despues: data || payload
  });
  status.textContent = 'Registro agregado correctamente.';
  mostrarPopupGuardado('Registro agregado correctamente.');
}

async function guardarRegistroCatalogo(index) {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  const row = catalogoAdminRows[index];
  const status = document.getElementById('catalogoAdminStatus');
  if (!config || !row || !status) return;

  const payload = {};

  for (let fieldIndex = 0; fieldIndex < config.fields.length; fieldIndex += 1) {
    const field = config.fields[fieldIndex];
    if (field.readonly) continue;

    const value = document.getElementById(`catalogo-${index}-${fieldIndex}`)?.value.trim() || '';

    if (!value && !field.optional) {
      status.textContent = `El campo ${field.label} no puede quedar vacio.`;
      return;
    }

    const valorPreparado = prepararValorCatalogo(field, value);
    if (valorPreparado === undefined) {
      status.textContent = `El campo ${field.label} debe ser un numero valido.`;
      return;
    }

    payload[field.name] = valorPreparado;
  }

  status.textContent = 'Guardando cambios...';

  let query = supabaseClient
    .from(catalogoAdminActual)
    .update(payload);

  query = aplicarIdentificadorCatalogo(query, config, row);
  const { data, error } = await query
    .select('*')
    .maybeSingle();

  if (error) {
    status.textContent = 'Error al guardar: ' + error.message;
    return;
  }

  await cargarCatalogoAdmin();
  invalidarCatalogosRutasTrabajo();
  await registrarLogControl({
    modulo: 'Catalogos',
    accion: 'EDICION',
    tabla: catalogoAdminActual,
    registroId: obtenerRegistroIdCatalogo(config, row),
    descripcion: `Actualizacion en ${config.label}`,
    antes: row,
    despues: data || { ...row, ...payload }
  });
  status.textContent = 'Registro actualizado correctamente.';
  mostrarPopupGuardado('Registro actualizado correctamente.');
}

async function eliminarRegistroCatalogo(index) {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const config = CATALOGOS_ADMIN[catalogoAdminActual];
  const row = catalogoAdminRows[index];
  const status = document.getElementById('catalogoAdminStatus');
  if (!config || !row || !status) return;

  if (!window.confirm(`Se eliminara este registro de ${config.label}. Esta accion no se puede deshacer.`)) {
    return;
  }

  status.textContent = 'Eliminando registro...';

  let query = supabaseClient
    .from(catalogoAdminActual)
    .delete();

  query = aplicarIdentificadorCatalogo(query, config, row);
  const { data, error } = await query
    .select('*')
    .maybeSingle();

  if (error) {
    status.textContent = 'Error al eliminar: ' + error.message;
    return;
  }

  await cargarCatalogoAdmin();
  invalidarCatalogosRutasTrabajo();
  await registrarLogControl({
    modulo: 'Catalogos',
    accion: 'ELIMINACION',
    tabla: catalogoAdminActual,
    registroId: obtenerRegistroIdCatalogo(config, row),
    descripcion: `Eliminacion en ${config.label}`,
    antes: data || row,
    despues: null
  });
  status.textContent = 'Registro eliminado correctamente.';
}

function invalidarCatalogosRutasTrabajo() {
  if (catalogoAdminActual === 'CT_CentrosTrabajo' && typeof rutaTrabajoCatalogoCentrosTrabajo !== 'undefined') {
    rutaTrabajoCatalogoCentrosTrabajo = null;
  }

  if (catalogoAdminActual === 'CR_CentrosRecurso' && typeof rutaTrabajoCatalogoCentrosRecurso !== 'undefined') {
    rutaTrabajoCatalogoCentrosRecurso = null;
  }
}

function prepararValorCatalogo(field, value) {
  if (!value && field.optional) return null;
  if (field.type !== 'number') return value;

  const numero = Number(value);
  return Number.isNaN(numero) ? undefined : numero;
}

function aplicarIdentificadorCatalogo(query, config, row) {
  const keysDisponibles = config.keys.every(key => row[key] !== null && row[key] !== undefined);
  const keys = keysDisponibles
    ? config.keys
    : config.fields.filter(field => !field.readonly).map(field => field.name);

  keys.forEach(key => {
    query = row[key] === null
      ? query.is(key, null)
      : query.eq(key, row[key]);
  });

  return query;
}

function obtenerRegistroIdCatalogo(config, row) {
  if (!config || !row) return null;

  return config.keys
    .map(key => row[key])
    .filter(value => value !== null && value !== undefined && value !== '')
    .join(' | ') || null;
}

// Importar a Sheets: compara conteos y exporta BD_General por bloques.
function renderFuncionesAdicionales() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const contenedor = document.getElementById('panelControlContenido');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="control-card panel-extra-card">
      <div class="catalog-header">
        <h2>Importar a Sheets</h2>
        <p>Exporta BD_General y compara los conteos con Google Sheets.</p>
      </div>

      <div class="panel-sync-dashboard">
        <div class="dashboard-kpi-card">
          <span>Articulos en Supabase</span>
          <strong id="syncSupabaseCount">-</strong>
        </div>

        <div class="dashboard-kpi-card">
          <span>Articulos en Google Sheet</span>
          <strong id="syncSheetCount">-</strong>
        </div>

        <div class="dashboard-kpi-card">
          <span>Estado</span>
          <strong id="syncEstado">-</strong>
        </div>
      </div>

      <div class="panel-sync-actions">
        <button type="button" onclick="actualizarDashboardExportacionSheet()">Actualizar conteos</button>
        <button type="button" onclick="exportarBDGeneralGoogleSheet()">Exportar a Google Sheet</button>
        <a href="${escapeHtml(GOOGLE_SHEET_BD_GENERAL_URL)}" target="_blank" rel="noopener">Abrir Google Sheet</a>
      </div>

      <div id="panelSyncStatus" class="status-box">
        Cargando datos de sincronizacion...
      </div>
    </div>
  `;

  actualizarDashboardExportacionSheet();
}

async function actualizarDashboardExportacionSheet() {
  const status = document.getElementById('panelSyncStatus');
  const supabaseCount = document.getElementById('syncSupabaseCount');
  const sheetCount = document.getElementById('syncSheetCount');
  const estado = document.getElementById('syncEstado');

  if (status) status.textContent = 'Consultando conteos...';

  const resultadoSupabase = await obtenerRegistrosBDGeneralExportacion();

  if (resultadoSupabase.error) {
    if (status) status.textContent = 'Error al consultar BD_General: ' + resultadoSupabase.error.message;
    return;
  }

  const totalSupabase = resultadoSupabase.data.length;
  if (supabaseCount) supabaseCount.textContent = String(totalSupabase);

  if (!GOOGLE_SHEET_WEB_APP_URL) {
    if (sheetCount) sheetCount.textContent = 'Config.';
    if (estado) estado.textContent = 'Pendiente';
    if (status) {
      status.textContent = 'Falta configurar GOOGLE_SHEET_WEB_APP_URL en panel.js para leer y exportar al Sheet.';
    }
    return;
  }

  const resultadoSheet = await consultarGoogleSheetBDGeneral('count');

  if (!resultadoSheet.ok) {
    if (sheetCount) sheetCount.textContent = 'Error';
    if (estado) estado.textContent = 'Revisar';
    if (status) status.textContent = resultadoSheet.message;
    return;
  }

  const totalSheet = Number(resultadoSheet.count || 0);
  if (sheetCount) sheetCount.textContent = String(totalSheet);
  if (estado) estado.textContent = totalSupabase === totalSheet ? 'Correcto' : 'Diferencia';
  if (status) {
    status.textContent = totalSupabase === totalSheet
      ? 'Los conteos coinciden.'
      : 'Los conteos no coinciden. Puedes exportar BD_General al Sheet.';
  }
}

async function obtenerRegistrosBDGeneralExportacion() {
  const columnas = BD_GENERAL_EXPORT_COLUMNS
    .map(columna => `"${columna}"`)
    .join(',');

  const resultado = await leerSupabasePaginado(
    'BD_General',
    columnas,
    'Id',
    false
  );

  return {
    data: resultado.data || [],
    error: resultado.error
  };
}

async function consultarGoogleSheetBDGeneral(action, payload = null) {
  if (action === 'count') {
    return consultarConteoGoogleSheetJsonp();
  }

  if (action === 'replace' || action === 'replaceStart' || action === 'appendChunk') {
    return enviarGoogleSheetSinCors(action, payload);
  }

  return {
    ok: false,
    message: 'Accion no valida para Google Sheet.'
  };
}

function consultarConteoGoogleSheetJsonp() {
  return new Promise(resolve => {
    const callbackName = `googleSheetCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({
        ok: false,
        message: 'No se recibio respuesta del Google Apps Script.'
      });
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };

    const params = new URLSearchParams({
      action: 'count',
      sheetId: GOOGLE_SHEET_BD_GENERAL_ID,
      callback: callbackName
    });

    script.onerror = () => {
      cleanup();
      resolve({
        ok: false,
        message: 'No se pudo cargar el conteo desde Google Apps Script.'
      });
    };

    script.src = `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

async function enviarGoogleSheetSinCors(action, payload = null) {
  try {
    await fetch(GOOGLE_SHEET_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action,
        sheetId: GOOGLE_SHEET_BD_GENERAL_ID,
        payload
      })
    });

    return { ok: true, message: 'Solicitud enviada al Google Sheet.' };
  } catch (error) {
    return {
      ok: false,
      message: 'No se pudo conectar con Google Apps Script: ' + error.message
    };
  }
}

async function exportarBDGeneralGoogleSheet() {
  const status = document.getElementById('panelSyncStatus');

  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  if (!GOOGLE_SHEET_WEB_APP_URL) {
    if (status) {
      status.textContent = 'Falta configurar GOOGLE_SHEET_WEB_APP_URL en panel.js antes de exportar.';
    }
    return;
  }

  actualizarBarraExportacionSheet(0, 'Leyendo BD_General desde Supabase...');

  const resultado = await obtenerRegistrosBDGeneralExportacion();

  if (resultado.error) {
    if (status) status.textContent = 'Error al leer BD_General: ' + resultado.error.message;
    return;
  }

  const rows = resultado.data.map(row => (
    BD_GENERAL_EXPORT_COLUMNS.map(columna => row[columna] ?? '')
  ));

  actualizarBarraExportacionSheet(2, `Preparando Google Sheet para ${rows.length} registros...`);

  const inicioExportacion = await consultarGoogleSheetBDGeneral('replaceStart', {
    columns: BD_GENERAL_EXPORT_COLUMNS,
    totalRows: rows.length
  });

  if (!inicioExportacion.ok) {
    if (status) status.textContent = inicioExportacion.message || 'No se pudo iniciar la exportacion.';
    return;
  }

  for (let index = 0; index < rows.length; index += GOOGLE_SHEET_EXPORT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + GOOGLE_SHEET_EXPORT_CHUNK_SIZE);
    const inicioFila = index + 2;

    if (status) {
      const porcentaje = Math.round(((index + chunk.length) / rows.length) * 92) + 5;
      actualizarBarraExportacionSheet(
        porcentaje,
        `Exportando registros ${index + 1}-${index + chunk.length} de ${rows.length}...`
      );
    }

    const resultadoChunk = await consultarGoogleSheetBDGeneral('appendChunk', {
      startRow: inicioFila,
      rows: chunk
    });

    if (!resultadoChunk.ok) {
      if (status) status.textContent = resultadoChunk.message || 'No se pudo enviar un bloque al Google Sheet.';
      return;
    }

    await esperarExportacionSheet(180);
  }

  actualizarBarraExportacionSheet(98, 'Verificando registros exportados en Google Sheet...');

  await esperarExportacionSheet(3500);

  const verificacion = await consultarGoogleSheetBDGeneral('count');
  const totalSheet = Number(verificacion.count || 0);

  if (!verificacion.ok || totalSheet !== rows.length) {
    if (status) {
      status.textContent = verificacion.ok
        ? `Exportacion enviada, pero el Sheet reporta ${totalSheet} de ${rows.length} registros. Revisa Apps Script.`
        : verificacion.message;
    }
    await actualizarDashboardExportacionSheet();
    return;
  }

  actualizarBarraExportacionSheet(100, `Exportacion completa. Registros en Sheet: ${totalSheet}.`);

  mostrarPopupGuardado('BD_General exportada correctamente a Google Sheets.', {
    titulo: 'Exportacion completa'
  });

  await actualizarDashboardExportacionSheet();
}

function esperarExportacionSheet(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function actualizarBarraExportacionSheet(porcentaje, mensaje) {
  const status = document.getElementById('panelSyncStatus');
  if (!status) return;

  const progreso = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  status.classList.add('status-box-loading', 'panel-export-progress');
  status.innerHTML = `
    <div class="panel-export-progress-head">
      <span class="status-loading-label">${escapeHtml(mensaje)}</span>
      <strong>${progreso}%</strong>
    </div>
    <span class="status-loading-track" aria-hidden="true">
      <span class="status-loading-bar panel-export-progress-bar" style="width:${progreso}%"></span>
    </span>
  `;
}
