// Arbol de trabajo por articulo PT: producto/hijos contienen rutas e hijos; las rutas contienen materia prima.
let rutaTrabajoArticuloActual = null;
let rutaTrabajoNodos = [];
let rutaTrabajoCatalogoCodigos = null;
let rutaTrabajoCatalogoCentrosTrabajo = null;
let rutaTrabajoCatalogoCentrosRecurso = null;
let rutaTrabajoStatusTimer = null;
let rutaTrabajoNodosPlegados = new Set();
let rutaTrabajoPadresArticuloActual = [];
let rutaTrabajoFiltrosVisibilidad = crearFiltrosVisibilidadRutasTrabajo();
let rutaTrabajoSeleccionPdf = null;

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
  rutaTrabajoFiltrosVisibilidad = crearFiltrosVisibilidadRutasTrabajo();
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

        <div class="route-header-controls">
          <button type="button" class="route-secondary-button route-back-button" onclick="renderBuscador()">Regresar al buscador</button>
          <div class="route-actions">
            <button type="button" class="route-secondary-button" onclick="descargarRutasTrabajoArticulo()">Descargar</button>
            <button type="button" class="route-secondary-button" onclick="descargarFormatoTiemposRutasTrabajo()">Hoja viajera PDF</button>
            <button type="button" class="route-primary-button" onclick="guardarRutasTrabajoArticulo()">Guardar arbol</button>
          </div>
        </div>
      </div>

      <span id="rutaTrabajoStatus" class="route-status-inline"></span>

      <div class="route-view-options" role="group" aria-label="Elementos visibles en el arbol">
        <span class="route-view-options-title">Mostrar</span>
        ${renderFiltroVisibilidadRutaTrabajo('MATERIA_PRIMA', 'MP', 'Materia prima')}
        ${renderFiltroVisibilidadRutaTrabajo('RUTA', 'RT', 'Rutas')}
        ${renderFiltroVisibilidadRutaTrabajo('HIJO', 'H', 'Hijos')}
      </div>

      <div id="rutaTrabajoPadres" class="route-parent-alert"></div>

      <section class="route-tree-card">
        <div id="rutaRamificacion" class="route-tree"></div>
      </section>
    </div>
  `;

  renderRamificacionRutasTrabajo();
  renderPadresRutaTrabajoArticulo();
}

function crearFiltrosVisibilidadRutasTrabajo() {
  return {
    MATERIA_PRIMA: true,
    RUTA: true,
    HIJO: true
  };
}

function renderFiltroVisibilidadRutaTrabajo(tipo, icono, etiqueta) {
  const checked = rutaTrabajoFiltrosVisibilidad[tipo] !== false ? 'checked' : '';
  return `
    <label class="route-view-option">
      <input type="checkbox" data-route-filter="${tipo}" ${checked}
        onchange="cambiarVisibilidadTipoRutaTrabajo('${tipo}', this.checked)">
      <span class="route-type-icon ${obtenerClaseIconoTipoTrabajo(tipo)}">${icono}</span>
      <span>${etiqueta}</span>
    </label>
  `;
}

function cambiarVisibilidadTipoRutaTrabajo(tipo, visible) {
  if (!Object.prototype.hasOwnProperty.call(rutaTrabajoFiltrosVisibilidad, tipo)) return;
  rutaTrabajoFiltrosVisibilidad[tipo] = Boolean(visible);
  aplicarFiltrosVisibilidadRutasTrabajo();
}

function aplicarFiltrosVisibilidadRutasTrabajo() {
  const arbol = document.getElementById('rutaRamificacion');
  if (!arbol) return;

  arbol.classList.toggle('route-hide-material', !rutaTrabajoFiltrosVisibilidad.MATERIA_PRIMA);
  arbol.classList.toggle('route-hide-routes', !rutaTrabajoFiltrosVisibilidad.RUTA);
  arbol.classList.toggle('route-hide-children', !rutaTrabajoFiltrosVisibilidad.HIJO);
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

  aplicarFiltrosVisibilidadRutasTrabajo();
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
    <li class="route-node-item ${nivel === 1 ? 'route-first-type' : ''}" data-node-type="${nodo.tipo}">
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
  if (Object.prototype.hasOwnProperty.call(rutaTrabajoFiltrosVisibilidad, tipo)) {
    rutaTrabajoFiltrosVisibilidad[tipo] = true;
    const checkbox = document.querySelector(`.route-view-option input[data-route-filter="${tipo}"]`);
    if (checkbox) checkbox.checked = true;
  }
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

function descargarFormatoTiemposRutasTrabajo() {
  const articulo = rutaTrabajoArticuloActual;
  if (!articulo) return;

  if (!window.PDFLib) {
    setRutaTrabajoStatus('No se pudo generar el PDF. Revisa que pdf-lib este cargado.');
    return;
  }

  const nodos = obtenerNodosTrabajoValidos();
  if (!nodos.length || !arbolTrabajoTieneRutas(nodos)) {
    setRutaTrabajoStatus('No hay rutas para generar el formato de tiempos.');
    return;
  }

  abrirSelectorProcesosHojaViajera(articulo, nodos);
}

function abrirSelectorProcesosHojaViajera(articulo, nodos) {
  cerrarSelectorProcesosHojaViajera();
  const rutas = obtenerFilasFormatoTiemposRutasTrabajo(nodos);
  rutaTrabajoSeleccionPdf = { articulo, nodos, rutas };

  const modal = document.createElement('div');
  modal.id = 'routePdfProcessModal';
  modal.className = 'route-pdf-modal';
  modal.setAttribute('role', 'presentation');
  modal.onclick = event => {
    if (event.target === modal) cerrarSelectorProcesosHojaViajera();
  };
  modal.onkeydown = event => {
    if (event.key === 'Escape') cerrarSelectorProcesosHojaViajera();
  };
  modal.innerHTML = `
    <section class="route-pdf-dialog" role="dialog" aria-modal="true"
      aria-labelledby="routePdfDialogTitle" tabindex="-1">
      <header class="route-pdf-dialog-header">
        <div>
          <span class="route-node-kicker">Hoja viajera PDF</span>
          <h3 id="routePdfDialogTitle">Selecciona los procesos</h3>
          <p>${escapeHtml(articulo['Codigo SAP'] || '-')} | ${escapeHtml(articulo['Nombre SAP'] || '-')}</p>
        </div>
        <button type="button" class="route-pdf-close" onclick="cerrarSelectorProcesosHojaViajera()"
          aria-label="Cerrar" title="Cerrar">&times;</button>
      </header>

      <div class="route-pdf-order-fields">
        ${renderCampoEncabezadoHojaViajera('routePdfOrden', 'Orden de produccion')}
        ${renderCampoEncabezadoHojaViajera('routePdfLote', 'Lote')}
        ${renderCampoEncabezadoHojaViajera('routePdfCantidad', 'Cantidad', 'number')}
        ${renderCampoEncabezadoHojaViajera('routePdfTurno', 'Turno')}
        ${renderCampoEncabezadoHojaViajera('routePdfFechaInicio', 'Fecha de inicio', 'date', '', false)}
        ${renderCampoEncabezadoHojaViajera('routePdfFechaTermino', 'Fecha de termino', 'date', '', false)}
        ${renderCampoEncabezadoHojaViajera('routePdfResponsable', 'Responsable', 'text', 'route-pdf-field-wide', false)}
      </div>

      <div class="route-pdf-selection-toolbar">
        <button type="button" class="route-secondary-button" onclick="seleccionarProcesosHojaViajera(true)">Seleccionar todos</button>
        <button type="button" class="route-secondary-button" onclick="seleccionarProcesosHojaViajera(false)">Deseleccionar todos</button>
        <strong id="routePdfSelectionCount" class="route-pdf-selection-count"></strong>
      </div>

      <div class="route-pdf-process-list">
        ${rutas.map((ruta, index) => renderOpcionProcesoHojaViajera(ruta, index)).join('')}
      </div>

      <p id="routePdfSelectionMessage" class="route-pdf-selection-message" aria-live="polite"></p>

      <footer class="route-pdf-dialog-actions">
        <button type="button" class="route-secondary-button" onclick="cerrarSelectorProcesosHojaViajera()">Cancelar</button>
        <button id="routePdfGenerateButton" type="button" class="route-primary-button"
          onclick="generarHojaViajeraSeleccionada()">Generar PDF</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);
  actualizarConteoProcesosHojaViajera();
  modal.querySelector('.route-pdf-dialog')?.focus();
}

function renderCampoEncabezadoHojaViajera(id, etiqueta, tipo = 'text', claseExtra = '', obligatorio = true) {
  const minimo = tipo === 'number' ? 'min="1" step="1"' : '';
  const requerido = obligatorio ? 'required' : '';
  const sufijo = obligatorio ? '' : ' (opcional)';
  return `
    <label class="route-pdf-order-field ${claseExtra}">
      <span>${etiqueta}${sufijo}</span>
      <input id="${id}" type="${tipo}" ${minimo} ${requerido} autocomplete="off"
        oninput="limpiarErrorCampoHojaViajera(this)">
    </label>
  `;
}

function limpiarErrorCampoHojaViajera(input) {
  input?.classList.remove('is-invalid');
  const mensaje = document.getElementById('routePdfSelectionMessage');
  if (mensaje) mensaje.textContent = '';
}

function renderOpcionProcesoHojaViajera(ruta, index) {
  const proceso = ruta.Descripcion_CT || ruta.Descripcion_CR || 'Proceso de ruta';
  const codigos = `${ruta.CT || 'Sin CT'} / ${ruta.CR || 'Sin CR'}`;
  return `
    <label class="route-pdf-process-option">
      <input class="route-pdf-process-check" type="checkbox" value="${index}" checked
        onchange="actualizarConteoProcesosHojaViajera()">
      <span class="route-type-icon route-type-route">RT</span>
      <span class="route-pdf-process-number">${index + 1}</span>
      <span class="route-pdf-process-info">
        <strong>${escapeHtml(proceso)}</strong>
        <span>${escapeHtml(codigos)}</span>
        <small>${escapeHtml(ruta.jerarquia || 'Ruta de trabajo')}</small>
      </span>
    </label>
  `;
}

function seleccionarProcesosHojaViajera(seleccionar) {
  document.querySelectorAll('#routePdfProcessModal .route-pdf-process-check').forEach(checkbox => {
    checkbox.checked = Boolean(seleccionar);
  });
  actualizarConteoProcesosHojaViajera();
}

function actualizarConteoProcesosHojaViajera() {
  const checkboxes = [...document.querySelectorAll('#routePdfProcessModal .route-pdf-process-check')];
  const seleccionados = checkboxes.filter(checkbox => checkbox.checked).length;
  const contador = document.getElementById('routePdfSelectionCount');
  const mensaje = document.getElementById('routePdfSelectionMessage');
  const boton = document.getElementById('routePdfGenerateButton');

  if (contador) contador.textContent = `${seleccionados} de ${checkboxes.length} procesos`;
  if (mensaje && seleccionados > 0) mensaje.textContent = '';
  if (boton) boton.disabled = seleccionados === 0;
}

function cerrarSelectorProcesosHojaViajera() {
  document.getElementById('routePdfProcessModal')?.remove();
  rutaTrabajoSeleccionPdf = null;
}

async function generarHojaViajeraSeleccionada() {
  const seleccion = rutaTrabajoSeleccionPdf;
  if (!seleccion) return;

  const indices = [...document.querySelectorAll('#routePdfProcessModal .route-pdf-process-check:checked')]
    .map(checkbox => Number(checkbox.value))
    .filter(index => Number.isInteger(index) && seleccion.rutas[index]);
  const mensaje = document.getElementById('routePdfSelectionMessage');

  if (!indices.length) {
    if (mensaje) mensaje.textContent = 'Selecciona al menos un proceso para generar la hoja viajera.';
    return;
  }

  const datosEncabezado = obtenerDatosEncabezadoHojaViajera();
  if (!datosEncabezado) return;

  const boton = document.getElementById('routePdfGenerateButton');
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Generando...';
  }

  try {
    const rutasSeleccionadas = indices.map(index => seleccion.rutas[index]);
    const pdfBytes = await construirPdfFormatoTiemposRutasTrabajo(
      seleccion.articulo,
      seleccion.nodos,
      rutasSeleccionadas,
      datosEncabezado
    );
    const nombreArchivo = `hoja-viajera-${limpiarNombreArchivoRuta(seleccion.articulo['Codigo SAP'] || 'articulo')}.pdf`;
    descargarArchivoRuta(nombreArchivo, pdfBytes, 'application/pdf');
    cerrarSelectorProcesosHojaViajera();
    setRutaTrabajoStatus('Hoja viajera PDF descargada.');
  } catch (error) {
    setRutaTrabajoStatus('No se pudo generar el PDF: ' + error.message);
    if (mensaje) mensaje.textContent = 'No se pudo generar el PDF. Intenta nuevamente.';
    if (boton) {
      boton.disabled = false;
      boton.textContent = 'Generar PDF';
    }
  }
}

function obtenerDatosEncabezadoHojaViajera() {
  const campos = [
    ['orden', 'routePdfOrden', true],
    ['lote', 'routePdfLote', true],
    ['cantidad', 'routePdfCantidad', true],
    ['turno', 'routePdfTurno', true],
    ['fechaInicio', 'routePdfFechaInicio', false],
    ['fechaTermino', 'routePdfFechaTermino', false],
    ['responsable', 'routePdfResponsable', false]
  ];
  const datos = {};
  let primerCampoVacio = null;

  campos.forEach(([clave, id, obligatorio]) => {
    const input = document.getElementById(id);
    const valor = input?.value.trim() || '';
    const invalido = obligatorio && !valor;
    datos[clave] = valor;
    input?.classList.toggle('is-invalid', invalido);
    if (invalido && !primerCampoVacio) primerCampoVacio = input;
  });

  if (primerCampoVacio) {
    const mensaje = document.getElementById('routePdfSelectionMessage');
    if (mensaje) mensaje.textContent = 'Completa orden, lote, cantidad y turno antes de generar el PDF.';
    primerCampoVacio.focus();
    return null;
  }

  return datos;
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

async function construirPdfFormatoTiemposRutasTrabajo(articulo, nodos, rutasSeleccionadas = null, datosEncabezado = {}) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const colorTexto = rgb(0.02, 0.13, 0.25);
  const colorLinea = rgb(0.56, 0.66, 0.76);
  const colorHeader = rgb(0.88, 0.93, 0.97);
  const colorAzul = rgb(0.04, 0.44, 0.82);
  const colorSuave = rgb(0.96, 0.98, 1);
  const rutas = Array.isArray(rutasSeleccionadas)
    ? rutasSeleccionadas
    : obtenerFilasFormatoTiemposRutasTrabajo(nodos);
  const layout = {
    width: 792,
    height: 612,
    margin: 24,
    rowHeight: 56,
    headerHeight: 146,
    tableHeaderHeight: 28,
    footerHeight: 42
  };

  let page = null;
  let y = 0;
  let pagina = 0;

  function nuevaPagina() {
    page = pdfDoc.addPage([layout.width, layout.height]);
    pagina += 1;
    y = layout.height - layout.margin;
    dibujarEncabezadoFormatoTiemposPdf(page, {
      articulo,
      datosEncabezado,
      pagina,
      font,
      bold,
      colorTexto,
      colorLinea,
      colorAzul,
      colorSuave,
      layout
    });
    y -= layout.headerHeight;
    dibujarCabeceraTablaFormatoTiemposPdf(page, {
      y,
      font,
      bold,
      colorTexto,
      colorLinea,
      colorHeader,
      layout
    });
    y -= layout.tableHeaderHeight;
  }

  nuevaPagina();

  rutas.forEach((ruta, index) => {
    if (y - layout.rowHeight < layout.margin + layout.footerHeight) {
      dibujarPieHojaViajeraPdf(page, { font, bold, colorTexto, colorLinea, layout });
      nuevaPagina();
    }

    dibujarFilaFormatoTiemposPdf(page, {
      ruta,
      index: index + 1,
      y,
      font,
      bold,
      colorTexto,
      colorLinea,
      layout
    });
    y -= layout.rowHeight;
  });

  dibujarPieHojaViajeraPdf(page, { font, bold, colorTexto, colorLinea, layout });

  return pdfDoc.save();
}

function dibujarEncabezadoFormatoTiemposPdf(page, ctx) {
  const { articulo, datosEncabezado, pagina, font, bold, colorTexto, colorLinea, colorAzul, colorSuave, layout } = ctx;
  const x = layout.margin;
  const ancho = layout.width - (layout.margin * 2);
  const top = layout.height - layout.margin;

  page.drawRectangle({
    x,
    y: top - 34,
    width: ancho,
    height: 34,
    color: colorAzul,
    borderColor: colorAzul,
    borderWidth: 0.8
  });
  page.drawText('HOJA VIAJERA DE PROCESOS', {
    x: x + 12,
    y: top - 22,
    size: 15,
    font: bold,
    color: rgbPdfBlanco()
  });
  page.drawText('RUTAS DE TRABAJO', {
    x: layout.width - layout.margin - 142,
    y: top - 13,
    size: 7.5,
    font: bold,
    color: rgbPdfBlanco()
  });
  page.drawText(`PAGINA ${pagina}`, {
    x: layout.width - layout.margin - 142,
    y: top - 25,
    size: 8,
    font,
    color: rgbPdfBlanco()
  });

  page.drawRectangle({
    x,
    y: top - 82,
    width: ancho,
    height: 42,
    color: colorSuave,
    borderColor: colorLinea,
    borderWidth: 0.7
  });
  dibujarEtiquetaValorPdf(page, 'CODIGO DEL ARTICULO', articulo['Codigo SAP'] || '-', x + 10, top - 54, 145, font, bold, colorTexto);
  dibujarEtiquetaValorPdf(page, 'DESCRIPCION', articulo['Nombre SAP'] || '-', x + 175, top - 54, ancho - 185, font, bold, colorTexto);

  const yCaptura1 = top - 101;
  const yCaptura2 = top - 126;
  dibujarLineaCapturaPdf(page, 'ORDEN', x, yCaptura1, 154, font, bold, colorTexto, colorLinea, datosEncabezado.orden);
  dibujarLineaCapturaPdf(page, 'LOTE', x + 174, yCaptura1, 140, font, bold, colorTexto, colorLinea, datosEncabezado.lote);
  dibujarLineaCapturaPdf(page, 'CANTIDAD', x + 334, yCaptura1, 168, font, bold, colorTexto, colorLinea, datosEncabezado.cantidad);
  dibujarLineaCapturaPdf(page, 'TURNO', x + 522, yCaptura1, 120, font, bold, colorTexto, colorLinea, datosEncabezado.turno);
  dibujarLineaCapturaPdf(page, 'FECHA INICIO', x, yCaptura2, 206, font, bold, colorTexto, colorLinea, formatearFechaHojaViajera(datosEncabezado.fechaInicio));
  dibujarLineaCapturaPdf(page, 'FECHA TERMINO', x + 226, yCaptura2, 206, font, bold, colorTexto, colorLinea, formatearFechaHojaViajera(datosEncabezado.fechaTermino));
  dibujarLineaCapturaPdf(page, 'RESPONSABLE', x + 452, yCaptura2, 292, font, bold, colorTexto, colorLinea, datosEncabezado.responsable);
}

function dibujarCabeceraTablaFormatoTiemposPdf(page, ctx) {
  const { y, font, bold, colorTexto, colorLinea, colorHeader, layout } = ctx;
  const x = layout.margin;
  const ancho = layout.width - (layout.margin * 2);
  const columnas = obtenerColumnasHojaViajeraPdf(x);

  page.drawRectangle({
    x,
    y: y - layout.tableHeaderHeight,
    width: ancho,
    height: layout.tableHeaderHeight,
    color: colorHeader,
    borderColor: colorLinea,
    borderWidth: 0.6
  });

  columnas.forEach(columna => {
    dibujarTextoEnLineasPdf(page, columna.titulo, columna.x + 4, y - 10, columna.ancho - 8, 6.4, bold, colorTexto, 2, 8);
    page.drawLine({
      start: { x: columna.x, y: y },
      end: { x: columna.x, y: y - layout.tableHeaderHeight },
      thickness: 0.45,
      color: colorLinea
    });
  });
}

function dibujarFilaFormatoTiemposPdf(page, ctx) {
  const { ruta, index, y, font, bold, colorTexto, colorLinea, layout } = ctx;
  const x = layout.margin;
  const ancho = layout.width - (layout.margin * 2);
  const rowTop = y;
  const rowBottom = y - layout.rowHeight;
  const columnas = obtenerColumnasHojaViajeraPdf(x);

  page.drawRectangle({
    x,
    y: rowBottom,
    width: ancho,
    height: layout.rowHeight,
    borderColor: colorLinea,
    borderWidth: 0.45
  });

  columnas.forEach(columna => {
    page.drawLine({
      start: { x: columna.x, y: rowTop },
      end: { x: columna.x, y: rowBottom },
      thickness: 0.45,
      color: colorLinea
    });
  });

  dibujarTextoCentradoPdf(page, String(index), columnas[0], rowTop - 31, 8, bold, colorTexto);

  const proceso = ruta.Descripcion_CT || ruta.Descripcion_CR || 'Proceso de ruta';
  dibujarTextoEnLineasPdf(page, proceso, columnas[1].x + 5, rowTop - 12, columnas[1].ancho - 10, 7.4, bold, colorTexto, 1, 9);
  dibujarTextoEnLineasPdf(page, `Trabajo: ${ruta.productoTrabajo || 'Producto padre'}`, columnas[1].x + 5, rowTop - 27, columnas[1].ancho - 10, 6.2, font, colorTexto, 2, 7);
  dibujarTextoEnLineasPdf(page, `Ruta ${ruta.Nivel || index}`, columnas[1].x + 5, rowBottom + 6, columnas[1].ancho - 10, 5.6, font, colorTexto, 1, 7);

  [2, 3, 4, 5].forEach(indice => {
    const columna = columnas[indice];
    page.drawLine({
      start: { x: columna.x + 6, y: rowBottom + 17 },
      end: { x: columna.x + columna.ancho - 6, y: rowBottom + 17 },
      thickness: 0.5,
      color: colorLinea
    });
  });

  const trabajador = columnas[6];
  page.drawLine({
    start: { x: trabajador.x + 42, y: rowBottom + 36 },
    end: { x: trabajador.x + trabajador.ancho - 7, y: rowBottom + 36 },
    thickness: 0.5,
    color: colorLinea
  });
  page.drawText('Codigo', {
    x: trabajador.x + 7,
    y: rowBottom + 34,
    size: 5.5,
    font,
    color: colorTexto
  });
  page.drawLine({
    start: { x: trabajador.x + 42, y: rowBottom + 16 },
    end: { x: trabajador.x + trabajador.ancho - 7, y: rowBottom + 16 },
    thickness: 0.5,
    color: colorLinea
  });
  page.drawText('Nombre', {
    x: trabajador.x + 7,
    y: rowBottom + 14,
    size: 5.5,
    font,
    color: colorTexto
  });
}

function obtenerColumnasHojaViajeraPdf(x) {
  const definiciones = [
    ['#', 24],
    ['PROCESO / RUTA', 250],
    ['INICIO', 80],
    ['FIN', 80],
    ['CANT.\nBUENA', 68],
    ['RECHAZO', 68],
    ['CODIGO Y NOMBRE\nDEL TRABAJADOR', 174]
  ];
  let cursor = x;

  return definiciones.map(([titulo, ancho]) => {
    const columna = { titulo, x: cursor, ancho };
    cursor += ancho;
    return columna;
  });
}

function dibujarPieHojaViajeraPdf(page, ctx) {
  const { font, bold, colorTexto, colorLinea, layout } = ctx;
  const x = layout.margin;
  const y = layout.margin + 6;
  const ancho = layout.width - (layout.margin * 2);

  page.drawLine({
    start: { x, y: y + 38 },
    end: { x: x + ancho, y: y + 38 },
    thickness: 0.65,
    color: colorLinea
  });
  dibujarLineaCapturaPdf(page, 'RECIBIDO', x, y + 25, 220, font, bold, colorTexto, colorLinea);
  dibujarLineaCapturaPdf(page, 'FECHA', x, y + 7, 220, font, bold, colorTexto, colorLinea);
  dibujarLineaCapturaPdf(page, 'OBSERVACIONES', x + 250, y + 25, ancho - 250, font, bold, colorTexto, colorLinea);
  page.drawLine({
    start: { x: x + 250, y: y + 5 },
    end: { x: x + ancho, y: y + 5 },
    thickness: 0.7,
    color: colorLinea
  });
}

function dibujarEtiquetaValorPdf(page, etiqueta, valor, x, y, ancho, font, bold, colorTexto) {
  page.drawText(etiqueta, { x, y, size: 7.5, font: bold, color: colorTexto });
  dibujarTextoCortadoPdf(page, valor, x, y - 13, ancho, 9, font, colorTexto);
}

function dibujarLineaCapturaPdf(page, etiqueta, x, y, ancho, font, bold, colorTexto, colorLinea, valor = '') {
  page.drawText(etiqueta, { x, y, size: 7.5, font: bold, color: colorTexto });
  const inicioLinea = x + bold.widthOfTextAtSize(etiqueta, 7.5) + 8;
  page.drawLine({
    start: { x: Math.min(inicioLinea, x + ancho - 12), y: y - 2 },
    end: { x: x + ancho, y: y - 2 },
    thickness: 0.7,
    color: colorLinea
  });
  if (valor) {
    dibujarTextoCortadoPdf(
      page,
      valor,
      Math.min(inicioLinea + 3, x + ancho - 10),
      y,
      Math.max(8, (x + ancho) - inicioLinea - 6),
      7.5,
      font,
      colorTexto
    );
  }
}

function formatearFechaHojaViajera(valor) {
  const partes = String(valor || '').split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : String(valor || '');
}

function dibujarTextoCortadoPdf(page, texto, x, y, ancho, size, font, color) {
  const valor = String(texto ?? '');
  let salida = valor;

  while (salida.length > 0 && font.widthOfTextAtSize(salida, size) > ancho) {
    salida = salida.slice(0, -1);
  }

  if (salida.length < valor.length && salida.length > 3) {
    salida = salida.slice(0, -3) + '...';
  }

  page.drawText(salida, { x, y, size, font, color });
}

function dibujarTextoEnLineasPdf(page, texto, x, y, ancho, size, font, color, maxLineas = 2, interlineado = 9) {
  const palabras = String(texto ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lineas = [];
  let linea = '';

  palabras.forEach(palabra => {
    const candidata = linea ? `${linea} ${palabra}` : palabra;
    if (!linea || font.widthOfTextAtSize(candidata, size) <= ancho) {
      linea = candidata;
      return;
    }
    lineas.push(linea);
    linea = palabra;
  });
  if (linea) lineas.push(linea);

  const visibles = lineas.slice(0, maxLineas);
  if (lineas.length > maxLineas && visibles.length) {
    const ultima = visibles.length - 1;
    let truncada = visibles[ultima];
    while (truncada.length && font.widthOfTextAtSize(`${truncada}...`, size) > ancho) {
      truncada = truncada.slice(0, -1);
    }
    visibles[ultima] = `${truncada.trim()}...`;
  }

  visibles.forEach((valor, indice) => {
    page.drawText(valor, { x, y: y - (indice * interlineado), size, font, color });
  });
}

function dibujarTextoCentradoPdf(page, texto, columna, y, size, font, color) {
  const valor = String(texto ?? '');
  const anchoTexto = font.widthOfTextAtSize(valor, size);
  const x = columna.x + Math.max(4, (columna.ancho - anchoTexto) / 2);
  dibujarTextoCortadoPdf(page, valor, x, y, columna.ancho - 8, size, font, color);
}

function rgbPdfBlanco() {
  return window.PDFLib.rgb(1, 1, 1);
}

function obtenerFilasFormatoTiemposRutasTrabajo(nodos) {
  const filas = [];

  function recorrer(lista, rutaPadres = [], productoTrabajo = '') {
    (lista || []).forEach(nodo => {
      const etiqueta = obtenerEtiquetaNodoFormatoTiempos(nodo);
      const nuevaRuta = etiqueta ? [...rutaPadres, etiqueta] : rutaPadres;
      const productoActual = nodo.tipo === 'HIJO' ? etiqueta : productoTrabajo;

      if (nodo.tipo === 'RUTA') {
        filas.push({
          ...nodo,
          jerarquia: nuevaRuta.join(' > '),
          productoTrabajo: productoActual
        });
      }

      recorrer(nodo.children || [], nuevaRuta, productoActual);
    });
  }

  recorrer(nodos);
  return filas;
}

function obtenerEtiquetaNodoFormatoTiempos(nodo) {
  if (!nodo) return '';

  if (nodo.tipo === 'HIJO') {
    const codigo = nodo.Codigo ? ` - ${nodo.Codigo}` : '';
    const descripcion = nodo.Descripcion ? ` - ${nodo.Descripcion}` : '';
    return `Hijo ${nodo.Nivel || ''}${codigo}${descripcion}`.trim();
  }

  if (nodo.tipo === 'RUTA') {
    return `Ruta ${nodo.Nivel || ''}`.trim();
  }

  if (nodo.tipo === 'MATERIA_PRIMA') {
    return `MP ${nodo.Nivel || ''}${nodo.Codigo ? ` - ${nodo.Codigo}` : ''}`.trim();
  }

  return '';
}

function arbolTrabajoTieneRutas(nodos) {
  return (nodos || []).some(nodo => (
    nodo.tipo === 'RUTA' || arbolTrabajoTieneRutas(nodo.children || [])
  ));
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

