let nuevoCodigoState = {
  grupo: '',
  familia: '',
  tipo: '',
  material: '',
  requiereMaterial: false
};

function toggleSidebar() {
  const menu = document.getElementById('sideMenu');
  if (menu) {
    menu.classList.toggle('open');
  }
}

function showSection(section) {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  if (section === 'inicio') {
    viewer.innerHTML = `
      <h2>Inicio</h2>
      <p>Este es el panel principal del Index.</p>
    `;
    return;
  }

  if (section === 'visualizador') {
    renderVisualizer();
    return;
  }

  if (section === 'nuevoCodigo') {
    renderNuevoCodigo();
    return;
  }

  if (section === 'Manual') {
    viewer.innerHTML = `
      <h2>Manual</h2>
      <p>Aqui podras ver el manual.</p>
    `;
    return;
  }

  viewer.innerHTML = `
    <h2>Seccion</h2>
    <p>Contenido no definido.</p>
  `;
}

function renderVisualizer() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  viewer.innerHTML = `
    <div class="catalog-wrapper">
      <div class="catalog-header">
        <h2>Visualizador</h2>
        <p>Esta seccion ya esta conectada al menu. Falta migrar aqui el contenido especifico del visualizador.</p>
      </div>

      <div class="table-scroll">
        <table class="catalog-table visualizer-table">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Familias</th>
              <th>Tipos</th>
              <th>Datos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="4">Visualizador listo para recibir la logica migrada.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function apiGet(path, params = {}) {
  const url = new URL(path, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Error de servidor.');
  }

  return data;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(data.message || 'Error de servidor.');
  }

  return data;
}

function renderNuevoCodigo() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  nuevoCodigoState = {
    grupo: '',
    familia: '',
    tipo: '',
    material: '',
    requiereMaterial: false
  };

  viewer.innerHTML = `
    <div class="catalog-wrapper">
      <div class="catalog-header">
        <h2>Nuevo Codigo</h2>
        <p>Selecciona Grupo, Familia y Tipo para construir el codigo y buscar coincidencias en la Base de Datos.</p>
      </div>

      <div class="nuevo-codigo-panel">
        <div class="nuevo-codigo-grid">
          <div class="field-block">
            <label for="nuevoGrupo">Grupo</label>
            <select id="nuevoGrupo" onchange="onNuevoGrupoChange()">
              <option value="">Selecciona un grupo</option>
            </select>
          </div>

          <div class="field-block">
            <label for="nuevoFamilia">Familia</label>
            <select id="nuevoFamilia" onchange="onNuevoFamiliaChange()" disabled>
              <option value="">Selecciona una familia</option>
            </select>
          </div>

          <div class="field-block">
            <label for="nuevoTipo">Tipo</label>
            <select id="nuevoTipo" onchange="onNuevoTipoChange()" disabled>
              <option value="">Selecciona un tipo</option>
            </select>
          </div>

          <div class="field-block" id="materialBlock" style="display:none;">
            <label for="nuevoMaterial">Material</label>
            <select id="nuevoMaterial" onchange="onNuevoMaterialChange()" disabled>
              <option value="">Selecciona un material</option>
            </select>
          </div>

          <div class="field-block action-block">
            <label>&nbsp;</label>
            <button id="btnBuscarNuevoCodigo" onclick="buscarNuevoCodigo()" disabled>Buscar</button>
          </div>
        </div>

        <div id="nuevoCodigoStatus" class="status-box">Cargando grupos...</div>
        <div id="nuevoCodigoGenerado" class="codigo-box">Codigo generado: ---</div>
        <div id="nuevoCodigoSummary" class="summary-box"></div>

        <div class="table-scroll">
          <table class="catalog-table results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Codigo</th>
                <th>Descripcion</th>
                <th>Columna C</th>
              </tr>
            </thead>
            <tbody id="nuevoCodigoResultados">
              <tr><td colspan="4">Sin resultados todavia.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  cargarGruposNuevoCodigo();
}

async function cargarGruposNuevoCodigo() {
  try {
    setNuevoCodigoStatus('Cargando grupos...');
    const resp = await apiGet('/api/grupos');
    const grupoEl = document.getElementById('nuevoGrupo');
    if (!grupoEl) return;

    grupoEl.innerHTML = '<option value="">Selecciona un grupo</option>';

    (resp.rows || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.nombre;
      option.textContent = `${item.nombre} (${item.prefijo})`;
      grupoEl.appendChild(option);
    });

    setNuevoCodigoStatus('Selecciona un grupo para continuar.');
  } catch (error) {
    setNuevoCodigoStatus('Error al cargar grupos: ' + error.message);
    console.error(error);
  }
}

async function onNuevoGrupoChange() {
  const grupoEl = document.getElementById('nuevoGrupo');
  const grupo = grupoEl ? grupoEl.value : '';

  nuevoCodigoState.grupo = grupo;
  nuevoCodigoState.familia = '';
  nuevoCodigoState.tipo = '';
  nuevoCodigoState.material = '';
  nuevoCodigoState.requiereMaterial = false;

  resetNuevoFamilias();
  resetNuevoTipos();
  resetNuevoMateriales();
  ocultarMateriales();
  limpiarResultadosNuevoCodigo();
  setCodigoGeneradoNuevoCodigo('---');
  validarBusquedaNuevoCodigo();

  if (!grupo) {
    setNuevoCodigoStatus('Selecciona un grupo para continuar.');
    return;
  }

  try {
    setNuevoCodigoStatus('Cargando familias...');
    const resp = await apiGet('/api/familias', { grupo });
    const familiaEl = document.getElementById('nuevoFamilia');
    if (!familiaEl) return;

    familiaEl.innerHTML = '<option value="">Selecciona una familia</option>';

    (resp.rows || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.nombre;
      option.textContent = `${item.nombre} (${item.id})`;
      familiaEl.appendChild(option);
    });

    familiaEl.disabled = false;
    setNuevoCodigoStatus('Selecciona una familia.');
  } catch (error) {
    setNuevoCodigoStatus('Error al cargar familias: ' + error.message);
    console.error(error);
  }
}

async function onNuevoFamiliaChange() {
  const familiaEl = document.getElementById('nuevoFamilia');
  const familia = familiaEl ? familiaEl.value : '';

  nuevoCodigoState.familia = familia;
  nuevoCodigoState.tipo = '';
  nuevoCodigoState.material = '';
  nuevoCodigoState.requiereMaterial = false;

  resetNuevoTipos();
  resetNuevoMateriales();
  ocultarMateriales();
  limpiarResultadosNuevoCodigo();
  setCodigoGeneradoNuevoCodigo('---');
  validarBusquedaNuevoCodigo();

  if (!familia) {
    setNuevoCodigoStatus('Selecciona una familia.');
    return;
  }

  try {
    setNuevoCodigoStatus('Cargando tipos...');
    const resp = await apiGet('/api/tipos', {
      grupo: nuevoCodigoState.grupo,
      familia
    });
    const tipoEl = document.getElementById('nuevoTipo');
    if (!tipoEl) return;

    tipoEl.innerHTML = '<option value="">Selecciona un tipo</option>';

    (resp.rows || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.nombre;
      option.textContent = `${item.nombre} (${item.id})`;
      tipoEl.appendChild(option);
    });

    tipoEl.disabled = false;
    setNuevoCodigoStatus('Selecciona un tipo.');
  } catch (error) {
    setNuevoCodigoStatus('Error al cargar tipos: ' + error.message);
    console.error(error);
  }
}

async function onNuevoTipoChange() {
  const tipoEl = document.getElementById('nuevoTipo');
  const tipo = tipoEl ? tipoEl.value : '';

  nuevoCodigoState.tipo = tipo;
  nuevoCodigoState.material = '';
  nuevoCodigoState.requiereMaterial = false;

  limpiarResultadosNuevoCodigo();
  setCodigoGeneradoNuevoCodigo('---');
  resetNuevoMateriales();
  ocultarMateriales();
  validarBusquedaNuevoCodigo();

  if (!nuevoCodigoState.grupo || !nuevoCodigoState.familia || !nuevoCodigoState.tipo) return;

  try {
    setNuevoCodigoStatus('Validando material...');
    const resp = await apiGet('/api/materiales', { grupo: nuevoCodigoState.grupo });
    nuevoCodigoState.requiereMaterial = !!resp.required;

    if (resp.required) {
      mostrarMateriales();
      const materialEl = document.getElementById('nuevoMaterial');
      if (!materialEl) return;

      materialEl.innerHTML = '<option value="">Selecciona un material</option>';

      (resp.rows || []).forEach(item => {
        const option = document.createElement('option');
        option.value = item.nombre;
        option.textContent = `${item.nombre} (${item.id})`;
        materialEl.appendChild(option);
      });

      materialEl.disabled = false;
      setNuevoCodigoStatus('Selecciona un material.');
      validarBusquedaNuevoCodigo();
      return;
    }

    ocultarMateriales();
    construirCodigoNuevoCodigo();
  } catch (error) {
    setNuevoCodigoStatus('Error al cargar materiales: ' + error.message);
    console.error(error);
  }
}

function onNuevoMaterialChange() {
  const materialEl = document.getElementById('nuevoMaterial');
  const material = materialEl ? materialEl.value : '';

  nuevoCodigoState.material = material;
  limpiarResultadosNuevoCodigo();
  setCodigoGeneradoNuevoCodigo('---');
  validarBusquedaNuevoCodigo();

  if (!nuevoCodigoState.material) {
    setNuevoCodigoStatus('Selecciona un material.');
    return;
  }

  construirCodigoNuevoCodigo();
}

async function construirCodigoNuevoCodigo() {
  try {
    const resp = await apiPost('/api/codigo', nuevoCodigoState);
    setCodigoGeneradoNuevoCodigo(resp.codigo);
    setNuevoCodigoStatus('Codigo generado correctamente.');
    validarBusquedaNuevoCodigo();
  } catch (error) {
    setNuevoCodigoStatus('Error al construir el codigo: ' + error.message);
    console.error(error);
  }
}

async function buscarNuevoCodigo() {
  const { grupo, familia, tipo, material, requiereMaterial } = nuevoCodigoState;

  if (!grupo || !familia || !tipo) {
    setNuevoCodigoStatus('Debes seleccionar Grupo, Familia y Tipo.');
    return;
  }

  if (requiereMaterial && !material) {
    setNuevoCodigoStatus('Debes seleccionar un material.');
    return;
  }

  const btn = document.getElementById('btnBuscarNuevoCodigo');
  if (btn) btn.disabled = true;

  try {
    setNuevoCodigoStatus('Buscando datos en MP...');
    const resp = await apiPost('/api/buscar', { grupo, familia, tipo, material });
    setCodigoGeneradoNuevoCodigo(resp.codigo);
    setNuevoCodigoSummary(`Coincidencias encontradas: ${resp.total}`);
    setNuevoCodigoStatus((resp.total || 0) > 0 ? 'Busqueda completada.' : 'No se encontraron coincidencias para ese codigo.');
    renderResultadosNuevoCodigo(resp.rows || []);
  } catch (error) {
    setNuevoCodigoStatus('Error al buscar datos: ' + error.message);
    console.error(error);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderResultadosNuevoCodigo(rows) {
  const tbody = document.getElementById('nuevoCodigoResultados');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">No se encontraron resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.indice ?? '')}</td>
      <td>${escapeHtml(row.codigoMP ?? '')}</td>
      <td>${escapeHtml(row.descripcion ?? '')}</td>
      <td>${escapeHtml(row.colC ?? '')}</td>
    </tr>
  `).join('');
}

function limpiarResultadosNuevoCodigo() {
  const tbody = document.getElementById('nuevoCodigoResultados');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4">Sin resultados todavia.</td></tr>';
  setNuevoCodigoSummary('');
}

function resetNuevoFamilias() {
  const familiaEl = document.getElementById('nuevoFamilia');
  if (!familiaEl) return;

  familiaEl.innerHTML = '<option value="">Selecciona una familia</option>';
  familiaEl.disabled = true;
}

function resetNuevoTipos() {
  const tipoEl = document.getElementById('nuevoTipo');
  if (!tipoEl) return;

  tipoEl.innerHTML = '<option value="">Selecciona un tipo</option>';
  tipoEl.disabled = true;
}

function resetNuevoMateriales() {
  const materialEl = document.getElementById('nuevoMaterial');
  if (!materialEl) return;

  materialEl.innerHTML = '<option value="">Selecciona un material</option>';
  materialEl.disabled = true;
}

function mostrarMateriales() {
  const block = document.getElementById('materialBlock');
  if (block) block.style.display = '';
}

function ocultarMateriales() {
  const block = document.getElementById('materialBlock');
  if (block) block.style.display = 'none';
}

function validarBusquedaNuevoCodigo() {
  const btn = document.getElementById('btnBuscarNuevoCodigo');
  if (!btn) return;

  const baseCompleta = !!(
    nuevoCodigoState.grupo &&
    nuevoCodigoState.familia &&
    nuevoCodigoState.tipo
  );

  if (!baseCompleta) {
    btn.disabled = true;
    return;
  }

  btn.disabled = nuevoCodigoState.requiereMaterial ? !nuevoCodigoState.material : false;
}

function setNuevoCodigoStatus(message) {
  const el = document.getElementById('nuevoCodigoStatus');
  if (el) el.textContent = message;
}

function setCodigoGeneradoNuevoCodigo(codigo) {
  const el = document.getElementById('nuevoCodigoGenerado');
  if (el) el.textContent = `Codigo generado: ${codigo}`;
}

function setNuevoCodigoSummary(text) {
  const el = document.getElementById('nuevoCodigoSummary');
  if (el) el.textContent = text;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', function () {
  showSection('inicio');
});
