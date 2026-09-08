// Arbol de trabajo por articulo PT: producto/hijos contienen rutas e hijos; las rutas contienen materia prima.
let rutaTrabajoArticuloActual = null;
let rutaTrabajoNodos = [];
let rutaTrabajoCatalogoCodigos = null;
let rutaTrabajoCatalogoCentrosTrabajo = null;
let rutaTrabajoCatalogoCentrosRecurso = null;
let rutaTrabajoStatusTimer = null;
let rutaTrabajoNodosPlegados = new Set();
let rutaTrabajoPadresArticuloActual = [];

function abrirRutasTrabajoDesdeBuscador(index) {
  const articulo = buscadorResultadosRows[index];
  if (!articulo) return;

  abrirRutasTrabajoArticulo(articulo);
}

function abrirRutasTrabajoArticulo(articulo) {
  if (typeof esArticuloPT === 'function' && !esArticuloPT(articulo)) {
    const status = document.getElementById('buscadorStatus');
    if (status) status.textContent = 'Las rutas de trabajo solo aplican para articulos PT.';
    return;
  }

  rutaTrabajoArticuloActual = articulo;
  rutaTrabajoNodos = [];
  rutaTrabajoPadresArticuloActual = [];
  rutaTrabajoNodosPlegados.clear();
  renderRutasTrabajoArticulo();
  cargarRutasTrabajoArticulo();
  cargarPadresRutaTrabajoArticulo();
}

function renderRutasTrabajoArticulo() {
  const viewer = document.getElementById('viewer');
  if (!viewer || !rutaTrabajoArticuloActual) return;

  const articulo = rutaTrabajoArticuloActual;

  viewer.innerHTML = `
    <div class="catalog-wrapper route-workspace">
      <div class="route-header">
        <div>
          <h2>Rutas de trabajo</h2>
          <p>${escapeHtml(articulo['Codigo SAP'] || '-')} | ${escapeHtml(articulo['Nombre SAP'] || '-')}</p>
        </div>

        <button type="button" class="route-secondary-button" onclick="renderBuscador()">Regresar al buscador</button>
      </div>

      <div id="rutaTrabajoPadres" class="route-parent-alert"></div>

      <section class="route-tree-card">
        <div id="rutaRamificacion" class="route-tree"></div>
      </section>

      <span id="rutaTrabajoStatus" class="route-status-inline"></span>

      <div class="route-actions">
        <button type="button" class="route-secondary-button" onclick="descargarRutasTrabajoArticulo()">Descargar</button>
        <button type="button" class="route-primary-button" onclick="guardarRutasTrabajoArticulo()">Guardar arbol</button>
      </div>
    </div>
  `;

  renderRamificacionRutasTrabajo();
  renderPadresRutaTrabajoArticulo();
}

async function cargarPadresRutaTrabajoArticulo() {
  const articulo = rutaTrabajoArticuloActual;
  if (!articulo || !supabaseClient) return;

  const codigo = String(articulo['Codigo SAP'] || '').trim();
  if (!codigo) return;

  const { data, error } = await leerSupabasePaginado(
    'Rutas_Trabajo_Nodos',
    'BD_General_Id,Codigo,Codigo_SAP,Nombre_SAP,Tipo',
    'BD_General_Id'
  );

  if (error || !data?.length || rutaTrabajoArticuloActual !== articulo) return;

  const codigoActual = normalizarTextoFlexible(codigo);
  const idActual = Number(articulo.Id);
  const padres = [];

  data
    .filter(row => (
      row.Tipo === 'HIJO'
      && normalizarTextoFlexible(row.Codigo) === codigoActual
      && Number(row.BD_General_Id) !== idActual
    ))
    .forEach(row => {
      const duplicado = padres.some(padre => Number(padre.BD_General_Id) === Number(row.BD_General_Id));
      if (duplicado) return;

      padres.push({
        Id: row.BD_General_Id,
        BD_General_Id: row.BD_General_Id,
        Codigo_SAP: row.Codigo_SAP || '',
        Nombre_SAP: row.Nombre_SAP || ''
      });
    });

  rutaTrabajoPadresArticuloActual = padres;
  renderPadresRutaTrabajoArticulo();
}

function renderPadresRutaTrabajoArticulo() {
  const contenedor = document.getElementById('rutaTrabajoPadres');
  if (!contenedor) return;

  if (!rutaTrabajoPadresArticuloActual.length) {
    contenedor.innerHTML = '';
    contenedor.classList.remove('is-visible');
    return;
  }

  contenedor.classList.add('is-visible');
  contenedor.innerHTML = rutaTrabajoPadresArticuloActual.map((padre, index) => `
    <div class="route-parent-link">
      <span>Este articulo es hijo de ${escapeHtml(padre.Codigo_SAP || '-')}</span>
      <strong>${escapeHtml(padre.Nombre_SAP || '-')}</strong>
      <button
        type="button"
        class="route-open-button route-open-parent-button"
        onclick="abrirRutaPadreDesdeRutasTrabajo(${index})"
      >Abrir padre</button>
    </div>
  `).join('');
}

function abrirRutaPadreDesdeRutasTrabajo(index) {
  const padre = rutaTrabajoPadresArticuloActual[index];
  if (!padre) return;

  abrirRutasTrabajoArticulo({
    Id: padre.Id || padre.BD_General_Id,
    'Codigo SAP': padre.Codigo_SAP,
    'Nombre SAP': padre.Nombre_SAP
  });
}

async function cargarRutasTrabajoArticulo() {
  const articulo = rutaTrabajoArticuloActual;
  if (!articulo) return;

  setRutaTrabajoStatus('Cargando arbol de trabajo...');

  if (!supabaseClient) {
    setRutaTrabajoStatus('Supabase no esta cargado. Revisa index.html.');
    return;
  }

  const { data, error } = await supabaseClient
    .from('Rutas_Trabajo_Nodos')
    .select('*')
    .eq('BD_General_Id', articulo.Id)
    .order('Nivel', { ascending: true });

  if (error) {
    rutaTrabajoNodos = [];
    renderRamificacionRutasTrabajo();
    setRutaTrabajoStatus('No se pudo cargar el arbol. Revisa que exista la tabla Rutas_Trabajo_Nodos.');
    return;
  }

  rutaTrabajoNodos = construirArbolTrabajo(data || null);
  renderRamificacionRutasTrabajo();
  setRutaTrabajoStatus(rutaTrabajoNodos.length ? 'Arbol cargado correctamente.' : '');
}

function construirArbolTrabajo(rows) {
  const porId = new Map();
  const raiz = [];

  (rows || []).forEach(row => {
    porId.set(row.id, {
      uid: crearUidRutaTrabajo(),
      id: row.id,
      parent_id: row.parent_id,
      tipo: row.Tipo,
      Nivel: row.Nivel,
      Codigo: row.Codigo || '',
      Descripcion: row.Descripcion || '',
      CT: row.CT || '',
      Descripcion_CT: row.Descripcion_CT || '',
      CR: row.CR || '',
      Descripcion_CR: row.Descripcion_CR || '',
      Tiempo_Pzs_Hr: row.Tiempo_Pzs_Hr ?? '',
      Costo_Hr: row.Costo_Hr ?? '',
      Cantidad: row.Cantidad ?? '',
      Tipo_Materia: row.Tipo_Materia || '',
      children: []
    });
  });

  porId.forEach(nodo => {
    const padre = porId.get(nodo.parent_id);
    if (padre && puedeNodoAceptarHijo(padre, nodo.tipo)) {
      padre.children.push(nodo);
    } else {
      raiz.push(nodo);
    }
  });

  ordenarNodosTrabajo(raiz);
  return raiz;
}

function ordenarNodosTrabajo(nodos) {
  nodos.sort((a, b) => {
    const prioridad = obtenerPrioridadNodoTrabajo(a.tipo) - obtenerPrioridadNodoTrabajo(b.tipo);
    if (prioridad !== 0) return prioridad;
    return (Number(a.Nivel) || 0) - (Number(b.Nivel) || 0);
  });
  nodos.forEach(nodo => ordenarNodosTrabajo(nodo.children || []));
}

function crearNodoHijoTrabajo() {
  return {
    uid: crearUidRutaTrabajo(),
    tipo: 'HIJO',
    Codigo: '',
    Descripcion: '',
    children: []
  };
}

function crearNodoRutaTrabajo() {
  return {
    uid: crearUidRutaTrabajo(),
    tipo: 'RUTA',
    CT: '',
    Descripcion_CT: '',
    CR: '',
    Descripcion_CR: '',
    Tiempo_Pzs_Hr: '',
    Costo_Hr: '',
    children: []
  };
}

function crearNodoMateriaPrimaTrabajo() {
  return {
    uid: crearUidRutaTrabajo(),
    tipo: 'MATERIA_PRIMA',
    Codigo: '',
    Descripcion: '',
    Cantidad: '',
    Tipo_Materia: '',
    children: []
  };
}

function crearUidRutaTrabajo() {
  return 'rt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function puedeNodoTenerSubnodos(nodo) {
  return !nodo || nodo.tipo === 'PADRE' || nodo.tipo === 'HIJO' || nodo.tipo === 'RUTA';
}

function puedeNodoAceptarHijo(nodo, tipoHijo) {
  if (!nodo || nodo.tipo === 'PADRE') {
    return tipoHijo === 'RUTA' || tipoHijo === 'MATERIA_PRIMA' || tipoHijo === 'HIJO';
  }

  if (nodo.tipo === 'HIJO') {
    return tipoHijo === 'RUTA' || tipoHijo === 'MATERIA_PRIMA' || tipoHijo === 'HIJO';
  }

  if (nodo.tipo === 'RUTA') {
    return tipoHijo === 'MATERIA_PRIMA';
  }

  return false;
}

function renderRamificacionRutasTrabajo() {
  const contenedor = document.getElementById('rutaRamificacion');
  const articulo = rutaTrabajoArticuloActual;
  if (!contenedor || !articulo) return;

  rutaTrabajoNodos = normalizarNivelesNodosTrabajo(rutaTrabajoNodos);

  contenedor.innerHTML = `
    <div class="route-tree-root">
      <div class="route-tree-node route-tree-product">
        <button type="button" class="route-toggle-button route-arrow-button ${estaNodoTrabajoPlegado('root') ? 'is-collapsed' : ''}" onclick="togglePlegadoTrabajo('root')" title="${estaNodoTrabajoPlegado('root') ? 'Mostrar' : 'Plegar'}"></button>

        <div class="route-product-summary">
          <span class="route-node-kicker">Padre</span>
          <strong>${escapeHtml(articulo['Codigo SAP'] || '-')}</strong>
          <span>${escapeHtml(articulo['Nombre SAP'] || '-')}</span>
        </div>

        <div class="route-product-actions">
          <button type="button" class="route-primary-button" onclick="agregarNodoTrabajo(null, 'RUTA')">Ruta</button>
          <button type="button" class="route-secondary-button" onclick="agregarNodoTrabajo(null, 'MATERIA_PRIMA')">MP</button>
          <button type="button" class="route-secondary-button" onclick="agregarNodoTrabajo(null, 'HIJO')">Hijo</button>
        </div>
      </div>

      ${renderListaNodosTrabajo(obtenerSubnodosVisiblesTrabajo({ uid: 'root', tipo: 'PADRE', children: rutaTrabajoNodos }), 'root')}
    </div>
  `;
}

function renderListaNodosTrabajo(nodos, parentPath) {
  if (!nodos?.length) return '';

  const nodosOrdenados = ordenarNodosTrabajoPorJerarquia(nodos);
  const nivelesPorTipo = obtenerNivelesPorTipoTrabajo(nodosOrdenados);

  return `
    <ul class="route-tree-branches route-level-block">
      ${nodosOrdenados.map((nodo, index) => renderNodoTrabajo(nodo, `${parentPath}-${index}`, nivelesPorTipo.get(nodo.uid) || 1)).join('')}
    </ul>
  `;
}

function renderNodoTrabajo(nodo, path, nivel) {
  const nodeClass = obtenerClaseNodoTrabajo(nodo.tipo);
  const acciones = obtenerAccionesNodoTrabajo(nodo);
  const titulo = obtenerTituloNodoTrabajo(nodo.tipo, nivel);
  const tieneSubnodos = puedeNodoTenerSubnodos(nodo) && nodoTieneSubnodosPlegablesTrabajo(nodo);
  const encabezado = acciones
    ? `
      <div class="route-node-actions">
        ${acciones}
      </div>
    `
    : '';
  const encabezadoCompleto = encabezado
    ? `
      <div class="route-node-title">
        <div class="route-title-main">
          ${renderFlechaNodoTrabajo(nodo)}
          ${renderIconoTipoTrabajo(nodo.tipo)}
          <div>
          <span class="route-node-kicker">${escapeHtml(obtenerEtiquetaNodoTrabajo(nodo.tipo))}</span>
          <strong>${titulo}</strong>
          </div>
        </div>
        ${encabezado}
      </div>
    `
    : '';

  return `
    <li class="${nivel === 1 ? 'route-first-type' : ''}">
      <div class="route-tree-node ${nodeClass} route-edit-node" data-node-uid="${nodo.uid}">
        ${encabezadoCompleto}
        ${renderCamposNodoTrabajo(nodo, path, nivel)}
      </div>

      ${puedeNodoTenerSubnodos(nodo) ? renderListaNodosTrabajo(obtenerSubnodosVisiblesTrabajo(nodo), path) : ''}
    </li>
  `;
}

function obtenerSubnodosVisiblesTrabajo(nodo) {
  const children = nodo?.children || [];

  if (!estaNodoTrabajoPlegado(nodo.uid)) {
    return children;
  }

  if (nodo.tipo === 'PADRE' || nodo.tipo === 'HIJO') {
    return children.filter(child => child.tipo === 'HIJO');
  }

  return [];
}

function nodoTieneSubnodosPlegablesTrabajo(nodo) {
  const children = nodo?.children || [];

  if (nodo.tipo === 'PADRE' || nodo.tipo === 'HIJO') {
    return children.some(child => child.tipo !== 'HIJO');
  }

  return children.length > 0;
}

function obtenerAccionesNodoTrabajo(nodo) {
  if (nodo.tipo === 'HIJO') {
    return `
      <button type="button" class="route-primary-button" onclick="agregarNodoTrabajo('${nodo.uid}', 'RUTA')">Ruta</button>
      <button type="button" class="route-secondary-button" onclick="agregarNodoTrabajo('${nodo.uid}', 'MATERIA_PRIMA')">MP</button>
      <button type="button" class="route-secondary-button" onclick="agregarNodoTrabajo('${nodo.uid}', 'HIJO')">Hijo</button>
      <button type="button" class="route-remove-button" onclick="quitarNodoTrabajo('${nodo.uid}')">Quitar</button>
    `;
  }

  return '';
}

function obtenerClaseNodoTrabajo(tipo) {
  if (tipo === 'HIJO') return 'route-tree-child';
  if (tipo === 'RUTA') return 'route-tree-route';
  if (tipo === 'MATERIA_PRIMA') return 'route-tree-material';
  return 'route-tree-empty';
}

function obtenerEtiquetaNodoTrabajo(tipo) {
  if (tipo === 'HIJO') return 'Hijo';
  if (tipo === 'RUTA') return 'Ruta de trabajo';
  if (tipo === 'MATERIA_PRIMA') return 'Materia prima';
  return 'Nodo';
}

function obtenerTituloNodoTrabajo(tipo, nivel) {
  const etiqueta = obtenerEtiquetaNodoTrabajo(tipo);
  return `${etiqueta} ${nivel}`;
}

function renderCamposNodoTrabajo(nodo, path, nivel) {
  const accionQuitar = `<button type="button" class="route-remove-button route-row-remove" onclick="quitarNodoTrabajo('${nodo.uid}')">Quitar</button>`;
  const accionMateriaPrima = `<button type="button" class="route-secondary-button route-row-assign" onclick="agregarNodoTrabajo('${nodo.uid}', 'MATERIA_PRIMA')">MP</button>`;
  const controlNivel = renderCampoNivelTrabajo(nivel, nodo);

  if (nodo.tipo === 'HIJO') {
    return `
      <div class="route-node-grid route-grid-child">
        ${renderCampoNivelTrabajo(nivel, nodo, false)}
        <label>
          <span>Codigo</span>
          <input id="ruta-codigo-${path}" class="master-input" type="text"
            value="${escapeHtml(nodo.Codigo || '')}" placeholder="Codigo del hijo"
            onblur="autocompletarDescripcionHijoTrabajo('${path}')">
        </label>
        <label class="route-node-description">
          <span>Descripcion</span>
          <textarea id="ruta-descripcion-${path}" class="master-textarea" rows="2"
            placeholder="Automatica por codigo">${escapeHtml(nodo.Descripcion || '')}</textarea>
        </label>
      </div>
    `;
  }

  if (nodo.tipo === 'RUTA') {
    return `
      <div class="route-node-grid route-grid-ruta">
        ${controlNivel}
        <label>
          <span>CT</span>
          <input id="ruta-ct-${path}" class="master-input" type="text"
            value="${escapeHtml(nodo.CT || '')}" placeholder="Codigo CT"
            onblur="autocompletarDescripcionRutaTrabajo('CT', '${path}')">
        </label>
        <label class="route-node-description">
          <span>Descripcion CT</span>
          <textarea id="ruta-descripcion-ct-${path}" class="master-textarea master-locked-input" rows="2"
            placeholder="Automatica por CT" readonly>${escapeHtml(nodo.Descripcion_CT || '')}</textarea>
        </label>
        <label>
          <span>CR</span>
          <input id="ruta-cr-${path}" class="master-input" type="text"
            value="${escapeHtml(nodo.CR || '')}" placeholder="Codigo CR"
            onblur="autocompletarDescripcionRutaTrabajo('CR', '${path}')">
        </label>
        <label class="route-node-description">
          <span>Descripcion CR</span>
          <textarea id="ruta-descripcion-cr-${path}" class="master-textarea master-locked-input" rows="2"
            placeholder="Automatica por CR" readonly>${escapeHtml(nodo.Descripcion_CR || '')}</textarea>
        </label>
        <label>
          <span>Tiempo Pzs x Hr</span>
          <input id="ruta-tiempo-pzs-hr-${path}" class="master-input master-number-input"
            type="number" min="0" step="0.0001" value="${escapeHtml(nodo.Tiempo_Pzs_Hr ?? '')}" placeholder="0">
        </label>
        <label>
          <span>Costo por Hr</span>
          <input id="ruta-costo-hr-${path}" class="master-input master-number-input master-locked-input"
            type="number" min="0" step="0.0001" value="${escapeHtml(nodo.Costo_Hr ?? '')}" placeholder="0" readonly>
        </label>
        <div class="route-row-action route-row-action-inline">${accionMateriaPrima}${accionQuitar}</div>
      </div>
    `;
  }

  return `
    <div class="route-node-grid route-material-grid">
      ${renderCampoNivelTrabajo(nivel, nodo)}
      <label>
        <span>Codigo</span>
        <input id="ruta-mp-codigo-${path}" class="master-input" type="text"
          value="${escapeHtml(nodo.Codigo || '')}" placeholder="Codigo"
          onblur="autocompletarDescripcionMateriaPrimaTrabajo('${path}')">
      </label>
      <label class="route-node-description">
        <span>Descripcion</span>
        <textarea id="ruta-mp-descripcion-${path}" class="master-textarea" rows="2"
          placeholder="Automatica por codigo">${escapeHtml(nodo.Descripcion || '')}</textarea>
      </label>
      <label>
        <span>Cantidad</span>
        <input id="ruta-mp-cantidad-${path}" class="master-input master-number-input"
          type="number" min="0" step="0.0001" value="${escapeHtml(nodo.Cantidad ?? '')}" placeholder="0">
      </label>
      <label>
        <span>Tipo</span>
        <input id="ruta-mp-tipo-${path}" class="master-input" type="text"
          value="${escapeHtml(nodo.Tipo_Materia || '')}" placeholder="MP, Consumible">
      </label>
      <div class="route-row-action">${accionQuitar}</div>
    </div>
  `;
}

function renderCampoNivelTrabajo(nivel, nodo = null, mostrarFlecha = true) {
  const control = nodo && mostrarFlecha
    ? renderFlechaNodoTrabajo(nodo, 'route-level-arrow')
    : '<span class="route-arrow-placeholder"></span>';
  const icono = nodo ? renderIconoTipoTrabajo(nodo.tipo, 'route-level-icon') : '<span class="route-type-icon route-type-empty"></span>';

  return `
    <label>
      <span>Nivel</span>
      <div class="route-level-control">
        ${control}
        ${icono}
        <input class="master-input master-number-input" type="number" value="${nivel}" disabled>
      </div>
    </label>
  `;
}

function renderIconoTipoTrabajo(tipo, claseExtra = '') {
  const texto = obtenerTextoIconoTipoTrabajo(tipo);
  return `<span class="route-type-icon ${obtenerClaseIconoTipoTrabajo(tipo)} ${claseExtra}" title="${escapeHtml(obtenerEtiquetaNodoTrabajo(tipo))}">${texto}</span>`;
}

function obtenerTextoIconoTipoTrabajo(tipo) {
  if (tipo === 'HIJO') return 'H';
  if (tipo === 'RUTA') return 'RT';
  if (tipo === 'MATERIA_PRIMA') return 'MP';
  return '';
}

function obtenerClaseIconoTipoTrabajo(tipo) {
  if (tipo === 'HIJO') return 'route-type-child';
  if (tipo === 'RUTA') return 'route-type-route';
  if (tipo === 'MATERIA_PRIMA') return 'route-type-material';
  return 'route-type-empty';
}

function renderFlechaNodoTrabajo(nodo, claseExtra = '') {
  const puedePlegar = puedeNodoTenerSubnodos(nodo);
  const tieneSubnodos = nodoTieneSubnodosPlegablesTrabajo(nodo);

  if (!puedePlegar) {
    return '<span class="route-arrow-placeholder"></span>';
  }

  if (!tieneSubnodos) {
    return '<span class="route-arrow-placeholder"></span>';
  }

  return `
    <button
      type="button"
      class="route-toggle-button route-arrow-button ${claseExtra} ${estaNodoTrabajoPlegado(nodo.uid) ? 'is-collapsed' : ''}"
      onclick="togglePlegadoTrabajo('${nodo.uid}')"
      title="${estaNodoTrabajoPlegado(nodo.uid) ? 'Mostrar' : 'Plegar'}"
    ></button>
  `;
}

function leerArbolTrabajoDesdePantalla() {
  const leerNivel = (nodos, parentPath) => {
    const nodosOrdenados = ordenarNodosTrabajoPorJerarquia(nodos);
    const nivelesPorTipo = obtenerNivelesPorTipoTrabajo(nodosOrdenados);

    return nodosOrdenados.map((nodo, index) => {
    const path = `${parentPath}-${index}`;
    const nodoVisible = document.querySelector(`[data-node-uid="${nodo.uid}"]`);
    const nivelTipo = nivelesPorTipo.get(nodo.uid) || 1;

    if (!nodoVisible) {
      return {
        ...nodo,
        Nivel: nivelTipo
      };
    }

    const base = {
      ...nodo,
      Nivel: nivelTipo,
      children: puedeNodoTenerSubnodos(nodo) ? leerNivel(nodo.children || [], path) : []
    };

    if (nodo.tipo === 'HIJO') {
      return {
        ...base,
        Codigo: document.getElementById(`ruta-codigo-${path}`)?.value.trim() || '',
        Descripcion: document.getElementById(`ruta-descripcion-${path}`)?.value.trim() || ''
      };
    }

    if (nodo.tipo === 'RUTA') {
      return {
        ...base,
        CT: document.getElementById(`ruta-ct-${path}`)?.value.trim() || '',
        Descripcion_CT: document.getElementById(`ruta-descripcion-ct-${path}`)?.value.trim() || '',
        CR: document.getElementById(`ruta-cr-${path}`)?.value.trim() || '',
        Descripcion_CR: document.getElementById(`ruta-descripcion-cr-${path}`)?.value.trim() || '',
        Tiempo_Pzs_Hr: document.getElementById(`ruta-tiempo-pzs-hr-${path}`)?.value || '',
        Costo_Hr: document.getElementById(`ruta-costo-hr-${path}`)?.value || ''
      };
    }

    return {
      ...base,
      Codigo: document.getElementById(`ruta-mp-codigo-${path}`)?.value.trim() || '',
      Descripcion: document.getElementById(`ruta-mp-descripcion-${path}`)?.value.trim() || '',
      Cantidad: document.getElementById(`ruta-mp-cantidad-${path}`)?.value || '',
      Tipo_Materia: document.getElementById(`ruta-mp-tipo-${path}`)?.value.trim() || ''
    };
    });
  };

  return leerNivel(rutaTrabajoNodos, 'root');
}

function normalizarNivelesNodosTrabajo(nodos) {
  const nodosOrdenados = ordenarNodosTrabajoPorJerarquia(nodos);
  const nivelesPorTipo = obtenerNivelesPorTipoTrabajo(nodosOrdenados);

  return nodosOrdenados.map(nodo => ({
    ...nodo,
    Nivel: nivelesPorTipo.get(nodo.uid) || 1,
    children: puedeNodoTenerSubnodos(nodo) ? normalizarNivelesNodosTrabajo(nodo.children || []) : []
  }));
}

function obtenerNivelesPorTipoTrabajo(nodos) {
  const contadores = {};
  const niveles = new Map();

  (nodos || []).forEach(nodo => {
    contadores[nodo.tipo] = (contadores[nodo.tipo] || 0) + 1;
    niveles.set(nodo.uid, contadores[nodo.tipo]);
  });

  return niveles;
}

function ordenarNodosTrabajoPorJerarquia(nodos) {
  return [...(nodos || [])].sort((a, b) => {
    const prioridad = obtenerPrioridadNodoTrabajo(a.tipo) - obtenerPrioridadNodoTrabajo(b.tipo);
    if (prioridad !== 0) return prioridad;
    return (Number(a.Nivel) || 0) - (Number(b.Nivel) || 0);
  });
}

function obtenerPrioridadNodoTrabajo(tipo) {
  if (tipo === 'MATERIA_PRIMA') return 1;
  if (tipo === 'RUTA') return 2;
  if (tipo === 'HIJO') return 3;
  return 9;
}

function agregarNodoTrabajo(parentUid, tipo) {
  rutaTrabajoNodos = leerArbolTrabajoDesdePantalla();
  const nuevoNodo = crearNodoTrabajoPorTipo(tipo);

  if (!parentUid) {
    rutaTrabajoNodosPlegados.delete('root');
    nuevoNodo.Nivel = obtenerSiguienteNivelNodoTrabajo(rutaTrabajoNodos, tipo);
    rutaTrabajoNodos.push(nuevoNodo);
    renderRamificacionRutasTrabajo();
    return;
  }

  const padre = buscarNodoTrabajoPorUid(rutaTrabajoNodos, parentUid);
  if (!padre || !puedeNodoAceptarHijo(padre, tipo)) return;

  rutaTrabajoNodosPlegados.delete(parentUid);
  padre.children = padre.children || [];
  nuevoNodo.Nivel = obtenerSiguienteNivelNodoTrabajo(padre.children, tipo);
  padre.children.push(nuevoNodo);
  renderRamificacionRutasTrabajo();
}

function obtenerSiguienteNivelNodoTrabajo(nodos, tipo) {
  const nivelesMismoTipo = (nodos || [])
    .filter(nodo => nodo.tipo === tipo)
    .map(nodo => Number(nodo.Nivel) || 0);

  return Math.max(0, ...nivelesMismoTipo) + 1;
}

function crearNodoTrabajoPorTipo(tipo) {
  if (tipo === 'HIJO') return crearNodoHijoTrabajo();
  if (tipo === 'RUTA') return crearNodoRutaTrabajo();
  return crearNodoMateriaPrimaTrabajo();
}

function quitarNodoTrabajo(uid) {
  rutaTrabajoNodos = leerArbolTrabajoDesdePantalla();
  rutaTrabajoNodosPlegados.delete(uid);
  rutaTrabajoNodos = quitarNodoTrabajoPorUid(rutaTrabajoNodos, uid);
  renderRamificacionRutasTrabajo();
}

function togglePlegadoTrabajo(uid) {
  rutaTrabajoNodos = leerArbolTrabajoDesdePantalla();

  if (rutaTrabajoNodosPlegados.has(uid)) {
    rutaTrabajoNodosPlegados.delete(uid);
  } else {
    rutaTrabajoNodosPlegados.add(uid);
  }

  renderRamificacionRutasTrabajo();
}

function estaNodoTrabajoPlegado(uid) {
  return rutaTrabajoNodosPlegados.has(uid);
}

function quitarNodoTrabajoPorUid(nodos, uid) {
  return (nodos || [])
    .filter(nodo => nodo.uid !== uid)
    .map(nodo => ({
      ...nodo,
      children: puedeNodoTenerSubnodos(nodo) ? quitarNodoTrabajoPorUid(nodo.children || [], uid) : []
    }));
}

function buscarNodoTrabajoPorUid(nodos, uid) {
  for (const nodo of nodos || []) {
    if (nodo.uid === uid) return nodo;
    const encontrado = buscarNodoTrabajoPorUid(nodo.children || [], uid);
    if (encontrado) return encontrado;
  }

  return null;
}

async function autocompletarDescripcionHijoTrabajo(path) {
  const campoCodigo = document.getElementById(`ruta-codigo-${path}`);
  const campoDescripcion = document.getElementById(`ruta-descripcion-${path}`);
  await autocompletarDescripcionPorCodigo(campoCodigo, campoDescripcion);
}

async function autocompletarDescripcionRutaTrabajo(tipo, path) {
  const campoCodigo = tipo === 'CT'
    ? document.getElementById(`ruta-ct-${path}`)
    : document.getElementById(`ruta-cr-${path}`);
  const campoDescripcion = tipo === 'CT'
    ? document.getElementById(`ruta-descripcion-ct-${path}`)
    : document.getElementById(`ruta-descripcion-cr-${path}`);

  const codigo = campoCodigo?.value.trim() || '';
  if (!codigo || !campoDescripcion) return;

  if (tipo === 'CT') {
    const centroTrabajo = await buscarCentroTrabajoPorCodigo(codigo);
    if (centroTrabajo?.Descripcion && !campoDescripcion.value.trim()) {
      campoDescripcion.value = centroTrabajo.Descripcion;
    }
    return;
  }

  const centroRecurso = await buscarCentroRecursoPorCodigo(codigo);
  if (centroRecurso?.Descripcion && !campoDescripcion.value.trim()) {
    campoDescripcion.value = centroRecurso.Descripcion;
  }

  const campoCosto = document.getElementById(`ruta-costo-hr-${path}`);
  if (campoCosto && centroRecurso?.Costo_Hr !== null && centroRecurso?.Costo_Hr !== undefined) {
    const costoActual = campoCosto.value.trim();
    if (!costoActual || Number(costoActual) === 0) {
      campoCosto.value = centroRecurso.Costo_Hr;
    }
  }
}

async function autocompletarDescripcionMateriaPrimaTrabajo(path) {
  const campoCodigo = document.getElementById(`ruta-mp-codigo-${path}`);
  const campoDescripcion = document.getElementById(`ruta-mp-descripcion-${path}`);
  await autocompletarDescripcionPorCodigo(campoCodigo, campoDescripcion);
}

async function autocompletarDescripcionPorCodigo(campoCodigo, campoDescripcion) {
  const codigo = campoCodigo?.value.trim() || '';
  if (!codigo || !campoDescripcion || campoDescripcion.value.trim()) return;

  const descripcion = await buscarDescripcionArticuloPorCodigo(codigo);
  if (descripcion) campoDescripcion.value = descripcion;
}

async function buscarDescripcionArticuloPorCodigo(codigo) {
  if (!supabaseClient) return '';

  const { data, error } = await cargarCatalogoCodigosRutaTrabajo();
  if (error || !data?.length) return '';

  const codigoNormalizado = normalizarTextoFlexible(codigo);
  const articulo = data.find(row => (
    normalizarTextoFlexible(row['Codigo SAP']) === codigoNormalizado
    || normalizarTextoFlexible(row['Codigo Pixvs']) === codigoNormalizado
  ));

  return articulo?.['Nombre SAP'] || articulo?.['Nombre Pixvs'] || '';
}

async function cargarCatalogoCodigosRutaTrabajo() {
  if (rutaTrabajoCatalogoCodigos) {
    return { data: rutaTrabajoCatalogoCodigos, error: null };
  }

  const { data, error } = await leerSupabasePaginado(
    'BD_General',
    '"Codigo SAP","Nombre SAP","Codigo Pixvs","Nombre Pixvs"',
    'Codigo SAP'
  );

  rutaTrabajoCatalogoCodigos = error ? [] : (data || []);
  return { data: rutaTrabajoCatalogoCodigos, error };
}

async function buscarCentroTrabajoPorCodigo(codigo) {
  if (!supabaseClient) return null;

  const { data, error } = await cargarCatalogoCentrosTrabajoRuta();
  if (error || !data?.length) return null;

  const codigoNormalizado = normalizarTextoFlexible(codigo);
  return data.find(row => normalizarTextoFlexible(row.CT) === codigoNormalizado) || null;
}

async function buscarCentroRecursoPorCodigo(codigo) {
  if (!supabaseClient) return null;

  const { data, error } = await cargarCatalogoCentrosRecursoRuta();
  if (error || !data?.length) return null;

  const codigoNormalizado = normalizarTextoFlexible(codigo);
  return data.find(row => normalizarTextoFlexible(row.CR) === codigoNormalizado) || null;
}

async function cargarCatalogoCentrosTrabajoRuta() {
  if (rutaTrabajoCatalogoCentrosTrabajo) {
    return { data: rutaTrabajoCatalogoCentrosTrabajo, error: null };
  }

  const { data, error } = await leerSupabasePaginado(
    'CT_CentrosTrabajo',
    '"Actividad","CT","Descripcion"',
    'CT'
  );

  rutaTrabajoCatalogoCentrosTrabajo = error ? [] : (data || []);
  return { data: rutaTrabajoCatalogoCentrosTrabajo, error };
}

async function cargarCatalogoCentrosRecursoRuta() {
  if (rutaTrabajoCatalogoCentrosRecurso) {
    return { data: rutaTrabajoCatalogoCentrosRecurso, error: null };
  }

  const { data, error } = await leerSupabasePaginado(
    'CR_CentrosRecurso',
    '"CT","CR","Descripcion","Costo_Hr"',
    'CR'
  );

  rutaTrabajoCatalogoCentrosRecurso = error ? [] : (data || []);
  return { data: rutaTrabajoCatalogoCentrosRecurso, error };
}

function obtenerNodosTrabajoValidos() {
  const limpiarNivel = (nodos) => {
    const nodosOrdenados = ordenarNodosTrabajoPorJerarquia(nodos);
    const nivelesPorTipo = obtenerNivelesPorTipoTrabajo(nodosOrdenados);

    return nodosOrdenados
    .map(nodo => {
      const limpio = {
        ...nodo,
        Nivel: nivelesPorTipo.get(nodo.uid) || 1,
        children: puedeNodoTenerSubnodos(nodo) ? limpiarNivel(nodo.children || []) : []
      };

      if (limpio.tipo === 'RUTA') {
        limpio.Tiempo_Pzs_Hr = normalizarNumeroRutaTrabajo(limpio.Tiempo_Pzs_Hr);
        limpio.Costo_Hr = normalizarNumeroRutaTrabajo(limpio.Costo_Hr);
      }

      if (limpio.tipo === 'MATERIA_PRIMA') {
        limpio.Cantidad = normalizarNumeroRutaTrabajo(limpio.Cantidad);
      }

      return limpio;
    })
    .filter(nodo => nodoTieneDatosTrabajo(nodo));
  };

  return limpiarNivel(leerArbolTrabajoDesdePantalla());
}

function nodoTieneDatosTrabajo(nodo) {
  if (nodo.tipo === 'HIJO') {
    return nodo.Codigo || nodo.Descripcion || nodo.children?.length;
  }

  if (nodo.tipo === 'RUTA') {
    return (
      nodo.CT
      || nodo.Descripcion_CT
      || nodo.CR
      || nodo.Descripcion_CR
      || nodo.Tiempo_Pzs_Hr !== null
      || nodo.Costo_Hr !== null
      || nodo.children?.length
    );
  }

  return nodo.Codigo || nodo.Descripcion || nodo.Cantidad !== null || nodo.Tipo_Materia;
}

function arbolTrabajoTieneNumerosInvalidos(nodos) {
  return (nodos || []).some(nodo => (
    (nodo.tipo === 'RUTA' && (Number.isNaN(nodo.Tiempo_Pzs_Hr) || Number.isNaN(nodo.Costo_Hr)))
    || (nodo.tipo === 'MATERIA_PRIMA' && Number.isNaN(nodo.Cantidad))
    || arbolTrabajoTieneNumerosInvalidos(nodo.children || [])
  ));
}

function normalizarNumeroRutaTrabajo(valor) {
  if (valor === null || valor === undefined) return null;
  if (String(valor).trim() === '') return null;

  const numero = Number(valor);
  return Number.isNaN(numero) ? NaN : numero;
}

function descargarRutasTrabajoArticulo() {
  const articulo = rutaTrabajoArticuloActual;
  if (!articulo) return;

  const nodos = obtenerNodosTrabajoValidos();
  if (!nodos.length) {
    setRutaTrabajoStatus('No hay informacion de rutas para descargar.');
    return;
  }

  const contenido = construirExcelXmlDescargaRutasTrabajo(articulo, nodos);
  const nombreArchivo = `rutas-${limpiarNombreArchivoRuta(articulo['Codigo SAP'] || 'articulo')}.xls`;
  descargarArchivoRuta(nombreArchivo, contenido, 'application/vnd.ms-excel;charset=utf-8');
  setRutaTrabajoStatus('Archivo de rutas descargado.');
}

function construirExcelXmlDescargaRutasTrabajo(articulo, nodos) {
  const filas = [];
  agregarFilaExcelRuta(filas, [
    'Nivel jerarquico',
    'Tipo',
    'Nivel',
    'Codigo',
    'Descripcion',
    'CT',
    'Descripcion CT',
    'CR',
    'Descripcion CR',
    'Tiempo Pzs x Hr',
    'Costo por Hr',
    'Cantidad',
    'Tipo MP'
  ], true);

  agregarFilaExcelRuta(filas, [
    0,
    'Padre',
    '',
    articulo['Codigo SAP'] || '',
    articulo['Nombre SAP'] || '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  ]);

  nodos.forEach(nodo => agregarNodoExcelDescargaRutasTrabajo(filas, nodo, 1));

  const lineas = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '  <Styles>',
    '    <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCEAF7" ss:Pattern="Solid"/></Style>',
    '  </Styles>',
    `  <Worksheet ss:Name="${escapeXmlAtributoRuta(limpiarNombreHojaExcelRuta(articulo['Codigo SAP'] || 'Rutas'))}">`,
    '    <Table>',
    ...filas,
    '    </Table>',
    '  </Worksheet>',
    '</Workbook>'
  ];

  return lineas.join('\r\n');
}

function agregarNodoExcelDescargaRutasTrabajo(filas, nodo, profundidad) {
  if (nodo.tipo === 'HIJO') {
    agregarFilaExcelRuta(filas, [
      profundidad,
      'Hijo',
      nodo.Nivel || '',
      nodo.Codigo || '',
      textoConSangriaRuta(profundidad, nodo.Descripcion || ''),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ]);
  } else if (nodo.tipo === 'RUTA') {
    agregarFilaExcelRuta(filas, [
      profundidad,
      'Ruta',
      nodo.Nivel || '',
      '',
      textoConSangriaRuta(profundidad, 'Ruta de trabajo'),
      nodo.CT || '',
      nodo.Descripcion_CT || '',
      nodo.CR || '',
      nodo.Descripcion_CR || '',
      nodo.Tiempo_Pzs_Hr ?? '',
      nodo.Costo_Hr ?? '',
      '',
      ''
    ]);
  } else if (nodo.tipo === 'MATERIA_PRIMA') {
    agregarFilaExcelRuta(filas, [
      profundidad,
      'Materia Prima',
      nodo.Nivel || '',
      nodo.Codigo || '',
      textoConSangriaRuta(profundidad, nodo.Descripcion || ''),
      '',
      '',
      '',
      '',
      '',
      '',
      nodo.Cantidad ?? '',
      nodo.Tipo_Materia || ''
    ]);
  }

  (nodo.children || []).forEach(hijo => agregarNodoExcelDescargaRutasTrabajo(filas, hijo, profundidad + 1));
}

function agregarFilaExcelRuta(filas, valores, esHeader = false) {
  const estilo = esHeader ? ' ss:StyleID="Header"' : '';
  filas.push(`      <Row${estilo}>${valores.map(valor => crearCeldaExcelRuta(valor)).join('')}</Row>`);
}

function crearCeldaExcelRuta(valor) {
  const esNumero = typeof valor === 'number' && Number.isFinite(valor);
  const tipo = esNumero ? 'Number' : 'String';
  return `<Cell><Data ss:Type="${tipo}">${escapeXmlTextoRuta(valor)}</Data></Cell>`;
}

function textoConSangriaRuta(profundidad, texto) {
  return `${'  '.repeat(Math.max(0, profundidad - 1))}${texto}`;
}

function descargarArchivoRuta(nombreArchivo, contenido, tipoMime) {
  const blob = new Blob([contenido], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeXmlTextoRuta(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAtributoRuta(valor) {
  return escapeXmlTextoRuta(valor)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function limpiarNombreHojaExcelRuta(texto) {
  return String(texto || 'Rutas')
    .replace(/[\\/?*[\]:]/g, '_')
    .slice(0, 31)
    || 'Rutas';
}

function limpiarNombreArchivoRuta(texto) {
  return String(texto || 'articulo')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'articulo';
}

async function guardarRutasTrabajoArticulo() {
  const articulo = rutaTrabajoArticuloActual;
  if (!articulo) return;

  const nodos = obtenerNodosTrabajoValidos();

  if (!nodos.length) {
    setRutaTrabajoStatus('Captura al menos un hijo, una ruta o una materia prima.');
    return;
  }

  if (arbolTrabajoTieneNumerosInvalidos(nodos)) {
    setRutaTrabajoStatus('Revisa tiempos, costos y cantidades. Deben ser numeros validos.');
    return;
  }

  setRutaTrabajoStatus('Guardando arbol...');

  const { data: nodosAnteriores, error: errorLectura } = await supabaseClient
    .from('Rutas_Trabajo_Nodos')
    .select('*')
    .eq('BD_General_Id', articulo.Id);

  if (errorLectura) {
    setRutaTrabajoStatus('No se pudo preparar el reemplazo del arbol: ' + errorLectura.message);
    return;
  }

  const idsInsertados = [];
  const errorInsert = await insertarNodosTrabajo(nodos, null, idsInsertados);
  if (errorInsert) {
    await limpiarNodosInsertadosTrabajo(idsInsertados);
    setRutaTrabajoStatus('Error al guardar arbol: ' + errorInsert.message);
    return;
  }

  const idsAnteriores = (nodosAnteriores || []).map(row => row.id).filter(Boolean);
  const errorDelete = await eliminarNodosTrabajoPorIds(idsAnteriores);
  if (errorDelete) {
    setRutaTrabajoStatus('El arbol nuevo se guardo, pero no se pudo borrar la version anterior: ' + errorDelete.message);
    await cargarRutasTrabajoArticulo();
    return;
  }

  setRutaTrabajoStatus('Arbol guardado correctamente.');
  if (typeof registrarLogControl === 'function') {
    await registrarLogControl({
      modulo: 'Rutas de Trabajo',
      accion: 'REEMPLAZO',
      tabla: 'Rutas_Trabajo_Nodos',
      registroId: articulo.Id,
      codigoSap: articulo['Codigo SAP'] || null,
      descripcion: 'Reemplazo de arbol de rutas',
      antes: {
        total_nodos: (nodosAnteriores || []).length,
        nodos: nodosAnteriores || []
      },
      despues: {
        total_nodos: idsInsertados.length,
        arbol: nodos
      }
    });
  }
  await cargarRutasTrabajoArticulo();
}

async function insertarNodosTrabajo(nodos, parentId, idsInsertados = []) {
  const articulo = rutaTrabajoArticuloActual;

  for (const nodo of nodos || []) {
    const { data, error } = await supabaseClient
      .from('Rutas_Trabajo_Nodos')
      .insert({
        BD_General_Id: articulo.Id,
        Codigo_SAP: articulo['Codigo SAP'] || null,
        Nombre_SAP: articulo['Nombre SAP'] || null,
        parent_id: parentId,
        Tipo: nodo.tipo,
        Nivel: nodo.Nivel,
        Codigo: nodo.Codigo || null,
        Descripcion: nodo.Descripcion || null,
        CT: nodo.CT || null,
        Descripcion_CT: nodo.Descripcion_CT || null,
        CR: nodo.CR || null,
        Descripcion_CR: nodo.Descripcion_CR || null,
        Tiempo_Pzs_Hr: normalizarNumeroRutaTrabajo(nodo.Tiempo_Pzs_Hr),
        Costo_Hr: normalizarNumeroRutaTrabajo(nodo.Costo_Hr),
        Cantidad: normalizarNumeroRutaTrabajo(nodo.Cantidad),
        Tipo_Materia: nodo.Tipo_Materia || null,
        Responsable: obtenerNombreUsuarioVisible(),
        Fecha_Actualizacion: new Date().toISOString()
      })
      .select('id')
      .maybeSingle();

    if (error || !data) return error || new Error('No se pudo guardar un nodo.');
    idsInsertados.push(data.id);

    const errorHijos = await insertarNodosTrabajo(nodo.children || [], data.id, idsInsertados);
    if (errorHijos) return errorHijos;
  }

  return null;
}

async function limpiarNodosInsertadosTrabajo(ids) {
  if (!ids?.length) return null;
  return eliminarNodosTrabajoPorIds(ids);
}

async function eliminarNodosTrabajoPorIds(ids) {
  if (!ids?.length) return null;

  const idsUnicos = Array.from(new Set(ids.filter(Boolean)));
  for (let index = 0; index < idsUnicos.length; index += 100) {
    const bloque = idsUnicos.slice(index, index + 100);
    const { error } = await supabaseClient
      .from('Rutas_Trabajo_Nodos')
      .delete()
      .in('id', bloque);

    if (error) return error;
  }

  return null;
}

function setRutaTrabajoStatus(mensaje) {
  const status = document.getElementById('rutaTrabajoStatus');
  if (!status) return;

  clearTimeout(rutaTrabajoStatusTimer);
  status.textContent = mensaje || '';
  status.classList.toggle('is-visible', Boolean(mensaje));

  if (mensaje) {
    rutaTrabajoStatusTimer = setTimeout(() => {
      status.textContent = '';
      status.classList.remove('is-visible');
    }, 4500);
  }
}

