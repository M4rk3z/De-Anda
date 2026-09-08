// Configuracion de Supabase y conexion principal.
const SUPABASE_URL = 'https://ehwxvirqiwztonbgosfy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVod3h2aXJxaXd6dG9uYmdvc2Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDAwMTUsImV4cCI6MjA5NTkxNjAxNX0.VzMoS_kOFIjvSz_ewdu6Q9_vAIwAnTuqPTlxFvzfJk8';

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let dashboardCharts = [];
let buscadorResultadosRows = [];
const DASHBOARD_GRUPOS_OCULTOS = new Set(['I']);
const PREFIJOS_CODIGO_SAP_PT = new Set(['A', 'V', 'E', 'T', 'P', 'G', 'X', 'Q', 'N']);

// Grupos visibles del dashboard; el conteo se calcula con la primera letra de Codigo SAP.
const DASHBOARD_GRUPOS_BASE = [
  { Id: 'A', Grupo: 'P.T.AVICOLA' },
  { Id: 'V', Grupo: 'P.T.PLANTAS DE ALIMENTOS' },
  { Id: 'E', Grupo: 'P.T.ESTRUCTURA' },
  { Id: 'T', Grupo: 'P.T.TRANSPORTE' },
  { Id: 'P', Grupo: 'P.T.PORCICOLA' },
  { Id: 'G', Grupo: 'P.T.GANADERIA' },
  { Id: 'X', Grupo: 'P.T.ESTANTERIA' },
  { Id: 'Q', Grupo: 'P.T.MAQUILA' },
  { Id: 'N', Grupo: 'P.T.INVERNADERO' },
  { Id: 'M', Grupo: 'MATERIA PRIMA' },
  { Id: 'C', Grupo: 'CONSUMIBLES' },
  { Id: 'B', Grupo: 'BIENES DE CONSUMO' },
  { Id: 'S', Grupo: 'SERVICIO' },
  { Id: 'K', Grupo: 'EMPAQUE' },
  { Id: 'H', Grupo: 'HERRAMIENTA' },
  { Id: 'L', Grupo: 'IMPORTACIONES' },
  { Id: 'Z', Grupo: 'ACTIVOS' }
];

function mostrarPopupGuardado(mensaje, opciones = {}) {
  const titulo = opciones.titulo || 'Guardado correctamente';

  document.getElementById('popupGuardadoOverlay')?.remove();
  window.popupGuardadoCallback = typeof opciones.onClose === 'function'
    ? opciones.onClose
    : null;

  const overlay = document.createElement('div');
  overlay.id = 'popupGuardadoOverlay';
  overlay.className = 'popup-tipos-overlay';
  overlay.innerHTML = `
    <div class="popup-tipos guardado-popup" role="dialog" aria-modal="true">
      <div class="popup-tipos-header">
        <h3>${escapeHtml(titulo)}</h3>
      </div>
      <div class="popup-tipos-body">
        <p>${escapeHtml(mensaje)}</p>
        <div class="guardado-popup-actions">
          <button type="button" onclick="cerrarPopupGuardado()">Aceptar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function cerrarPopupGuardado() {
  document.getElementById('popupGuardadoOverlay')?.remove();

  const callback = window.popupGuardadoCallback;
  window.popupGuardadoCallback = null;

  if (typeof callback === 'function') {
    callback();
  }
}

// Navegacion principal entre secciones del sistema.
function aplicarPermisosNavegacion() {
  document.querySelectorAll('#sideMenu [data-section]').forEach(button => {
    button.hidden = !puedeAccederSeccion(button.dataset.section);
  });
}

function toggleSidebar() {
  const menu = document.getElementById('sideMenu');

  if (menu) {
    menu.classList.toggle('open');
  }
}

function showSection(section) {
  const viewer = document.getElementById('viewer');

  if (!viewer) return;

  if (localStorage.getItem('sesionActiva') !== 'true') {
    const appScreen = document.getElementById('appScreen');
    const loginScreen = document.getElementById('loginScreen');
    const loginStatus = document.getElementById('loginStatus');

    if (appScreen) appScreen.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'grid';
    if (loginStatus) loginStatus.textContent = 'Inicia sesion para continuar.';
    return;
  }

  if (section !== 'bienvenida' && !puedeAccederSeccion(section)) {
    mostrarAccesoDenegado();
    return;
  }

  document.querySelectorAll('#sideMenu [data-section]').forEach(button => {
    const isActive = button.dataset.section === section;
    button.classList.toggle('active', isActive);

    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  if (section === 'bienvenida') {
    renderDashboardInicio();
    return;
  }

  if (section === 'buscador') {
    renderBuscador();
    return;
  }

  if (section === 'nuevoCodigo') {
    renderNuevoCodigo();
    return;
  }

  if (section === 'simuladorADN') {
    renderSimuladorADN();
    return;
  }

  if (section === 'panelControl') {
    renderPanelControl();
    return;
  }

  if (section === 'solicitudes') {
    window.renderSolicitudes();
    return;
  }

  
  if (section === 'manual') {
    renderManual();
    return;
  }
}


// Vista Inicio: tablero con solicitudes, codigos y distribucion por grupo.
function renderDashboardInicio() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  const nombreUsuario = obtenerNombreUsuarioVisible() || 'Kevin Gomez';

  destruirDashboardCharts();

  viewer.innerHTML = `
    <div class="dashboard-home">
      <div class="dashboard-hero">
        <div>
          <h2>Bienvenido, ${escapeHtml(nombreUsuario)}</h2>
          <p>Vista de trabajo para solicitudes, codigos y catalogos.</p>
        </div>

        <button
          id="dashboardSolicitudesNuevasBtn"
          type="button"
          class="dashboard-primary-action"
          onclick="irSolicitudesNuevasPendientes()"
        >
          Ver solicitudes nuevas (0)
        </button>
      </div>

      <div class="dashboard-quick-actions">
        ${renderDashboardQuickAction('Buscar articulo', 'Consulta codigos SAP/Pixvs', 'buscador')}
        ${renderDashboardQuickAction('Nuevo codigo', 'Genera claves nuevas', 'nuevoCodigo')}
        ${renderDashboardQuickAction('Solicitudes', 'Revisa pendientes y liberadas', 'solicitudes')}
        ${renderDashboardQuickAction('Panel de control', 'Administra datos del sistema', 'panelControl')}
      </div>

      <div class="dashboard-kpi-grid">
        ${renderDashboardKpiCard('Solicitudes nuevas', '-', 'dashboardKpiNuevas', 'Sin revisar')}
        ${renderDashboardKpiCard('Codigos hoy', '-', 'dashboardKpiCodigosHoy', 'Altas o cambios de hoy')}
        ${renderDashboardKpiCard('Codigos esta semana', '-', 'dashboardKpiCodigosSemana', 'Actividad semanal')}
        ${renderDashboardKpiCard('Solicitudes pendientes', '-', 'dashboardKpiPendientes', 'En seguimiento')}
      </div>

      <div class="dashboard-main-grid">
        <section class="dashboard-panel dashboard-focus-panel">
          <div class="dashboard-panel-header">
            <h3>Enfoque del dia</h3>
            <span>Resumen activo</span>
          </div>

          <div id="dashboardFocusList" class="dashboard-focus-list">
            <p class="dashboard-chart-fallback">Cargando prioridades...</p>
          </div>
        </section>

        <section class="dashboard-panel dashboard-panel-wide">
          <div class="dashboard-panel-header">
            <h3>Codigos por grupo</h3>
            <span id="dashboardCodigosGrupoTotal">Total: 0</span>
          </div>
          <div id="dashboardCodigosGrupoLista" class="dashboard-group-list">
            <p class="dashboard-chart-fallback">Cargando grupos...</p>
          </div>
        </section>

        <section class="dashboard-panel dashboard-recent-panel">
          <div class="dashboard-panel-header">
            <h3>Ultimas solicitudes</h3>
            <span id="dashboardUltimasSolicitudesTotal">Recientes</span>
          </div>

          <div class="table-scroll dashboard-table-scroll">
            <table class="catalog-table dashboard-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Solicitante</th>
                  <th>Descripcion</th>
                  <th>Estado</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody id="dashboardUltimasSolicitudes">
                <tr>
                  <td colspan="5">Cargando informacion...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;

  cargarDashboardInicio();
}

function renderDashboardQuickAction(titulo, descripcion, section) {
  if (!puedeAccederSeccion(section)) return '';

  return `
    <button type="button" class="dashboard-quick-action" onclick="showSection('${section}')">
      <strong>${escapeHtml(titulo)}</strong>
      <span>${escapeHtml(descripcion)}</span>
    </button>
  `;
}

function renderDashboardKpiCard(titulo, valor, id, descripcion = '') {
  return `
    <article class="dashboard-kpi-card">
      <span>${escapeHtml(titulo)}</span>
      <strong id="${id}">${escapeHtml(valor)}</strong>
      ${descripcion ? `<small>${escapeHtml(descripcion)}</small>` : ''}
    </article>
  `;
}

async function cargarDashboardInicio() {
  try {
    const [solicitudesResult, codigosResult, gruposResult] = await Promise.all([
      cargarDashboardSolicitudes(),
      cargarDashboardCodigos(),
      cargarDashboardGrupos()
    ]);

    const solicitudes = solicitudesResult.data || [];
    const codigos = codigosResult.data || [];
    const grupos = gruposResult.data || [];

    const resumen = construirDashboardResumen(solicitudes, codigos, grupos);
    pintarDashboardResumen(resumen);
  } catch (error) {
    console.error(error);
    const resumen = construirDashboardResumen(
      obtenerDashboardSolicitudesMock(),
      obtenerDashboardCodigosMock(),
      obtenerDashboardGruposMock()
    );
    pintarDashboardResumen(resumen);
  }
}

async function cargarDashboardSolicitudes() {
  const columnas = 'id,Folio,Fecha,Solicitante,D_extranjero,Status';

  if (!supabaseClient) {
    return { data: obtenerDashboardSolicitudesMock(), mock: true };
  }

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .select(columnas)
    .order('id', { ascending: false })
    .limit(100);

  if (error || !data || data.length === 0) {
    return { data: obtenerDashboardSolicitudesMock(), mock: true };
  }

  return { data, mock: false };
}

async function cargarDashboardCodigos() {
  if (!supabaseClient) {
    return { data: obtenerDashboardCodigosMock(), mock: true };
  }

  const { data, error } = await leerSupabasePaginado(
    'BD_General',
    '"Codigo SAP","Status","Fecha de ultimo Cambio"',
    'Id',
    false
  );

  if (error || !data || data.length === 0) {
    return { data: obtenerDashboardCodigosMock(), mock: true };
  }

  return { data, mock: false };
}

async function cargarDashboardGrupos() {
  if (!supabaseClient) {
    return { data: obtenerDashboardGruposMock(), mock: true };
  }

  const { data, error } = await supabaseClient
    .from('DT_Grupos')
    .select('Grupo,Id')
    .order('Id', { ascending: true });

  if (error || !data || data.length === 0) {
    return { data: obtenerDashboardGruposMock(), mock: true };
  }

  return { data: combinarDashboardGrupos(data), mock: false };
}

function construirDashboardResumen(solicitudes, codigos, grupos = []) {
  const hoy = obtenerFechaSoloDia(new Date());
  const inicioSemana = obtenerInicioSemana(new Date());

  const solicitudesNuevas = solicitudes.filter(solicitudEsNuevaPendiente);
  const solicitudesPendientes = solicitudes.filter(solicitudEsPendiente);

  const codigosHoy = codigos.filter(item => (
    obtenerFechaSoloDia(parsearFechaFlexible(item['Fecha de ultimo Cambio'])) === hoy
  ));

  const codigosSemana = codigos.filter(item => {
    const fecha = parsearFechaFlexible(item['Fecha de ultimo Cambio']);
    return fecha && fecha >= inicioSemana;
  });

  return {
    kpis: {
      nuevas: solicitudesNuevas.length,
      codigosHoy: codigosHoy.length,
      codigosSemana: codigosSemana.length,
      pendientes: solicitudesPendientes.length
    },
    codigosPorGrupo: contarPorGrupoCodigo(codigos, grupos),
    solicitudesPorEstado: contarPorEstadoSolicitud(solicitudes),
    ultimasSolicitudes: solicitudes.slice(0, 4)
  };
}

function pintarDashboardResumen(resumen) {
  asignarTextoDashboard('dashboardKpiNuevas', resumen.kpis.nuevas);
  asignarTextoDashboard('dashboardKpiCodigosHoy', resumen.kpis.codigosHoy);
  asignarTextoDashboard('dashboardKpiCodigosSemana', resumen.kpis.codigosSemana);
  asignarTextoDashboard('dashboardKpiPendientes', resumen.kpis.pendientes);

  const boton = document.getElementById('dashboardSolicitudesNuevasBtn');
  if (boton) {
    boton.textContent = `Ver solicitudes nuevas (${resumen.kpis.nuevas})`;
  }

  renderDashboardCodigosGrupoLista(resumen.codigosPorGrupo);
  renderDashboardFocusList(resumen);

  renderDashboardUltimasSolicitudes(resumen.ultimasSolicitudes);
}

function asignarTextoDashboard(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = String(valor);
}

function renderDashboardCodigosGrupoLista(grupos) {
  const contenedor = document.getElementById('dashboardCodigosGrupoLista');
  const totalLabel = document.getElementById('dashboardCodigosGrupoTotal');
  const totalDonaLabel = document.getElementById('dashboardCodigosGrupoDonaTotal');

  if (!contenedor) return;

  const total = (grupos || []).reduce((sum, item) => sum + Number(item.value || 0), 0);

  if (totalLabel) totalLabel.textContent = `Total: ${total}`;
  if (totalDonaLabel) totalDonaLabel.textContent = `Total: ${total}`;

  if (!grupos || grupos.length === 0 || total === 0) {
    contenedor.innerHTML = '<p class="dashboard-chart-fallback">Sin codigos registrados por grupo.</p>';
    return;
  }

  contenedor.innerHTML = grupos.map(item => {
    const porcentaje = total > 0
      ? Math.round((Number(item.value || 0) / total) * 100)
      : 0;

    return `
      <div class="dashboard-group-row">
        <div class="dashboard-group-main">
          <span class="dashboard-group-dot" style="background:${escapeHtml(item.color)}"></span>
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small>ID ${escapeHtml(item.id)}</small>
          </div>
        </div>
        <div class="dashboard-group-count">
          <strong>${Number(item.value || 0)}</strong>
          <span>${porcentaje}%</span>
        </div>
        <div class="dashboard-group-track" aria-hidden="true">
          <span style="width:${porcentaje}%; background:${escapeHtml(item.color)}"></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashboardFocusList(resumen) {
  const contenedor = document.getElementById('dashboardFocusList');
  if (!contenedor) return;

  const gruposOrdenados = [...(resumen.codigosPorGrupo || [])]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const grupoPrincipal = gruposOrdenados[0];
  const status = resumen.solicitudesPorEstado || [];
  const statusPrincipal = status[0];

  const items = [
    {
      label: 'Solicitudes por atender',
      value: resumen.kpis.pendientes,
      detail: resumen.kpis.nuevas
        ? `${resumen.kpis.nuevas} nuevas pendientes de revisar`
        : 'Sin solicitudes nuevas pendientes'
    },
    {
      label: 'Movimiento de codigos',
      value: resumen.kpis.codigosHoy,
      detail: `${resumen.kpis.codigosSemana} cambios registrados esta semana`
    },
    {
      label: 'Grupo con mas articulos',
      value: grupoPrincipal ? grupoPrincipal.value : '-',
      detail: grupoPrincipal ? `${grupoPrincipal.label} · ID ${grupoPrincipal.id}` : 'Sin grupos disponibles'
    },
    {
      label: 'Estado mas comun',
      value: statusPrincipal ? statusPrincipal.value : '-',
      detail: statusPrincipal ? statusPrincipal.label : 'Sin solicitudes cargadas'
    }
  ];

  contenedor.innerHTML = items.map(item => `
    <div class="dashboard-focus-item">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.detail)}</span>
      </div>
      <b>${escapeHtml(item.value)}</b>
    </div>
  `).join('');
}

function renderDashboardChart(canvasId, fallbackId, config) {
  const canvas = document.getElementById(canvasId);
  const fallback = document.getElementById(fallbackId);

  if (!canvas) return;

  if (!window.Chart) {
    canvas.style.display = 'none';
    if (fallback) fallback.textContent = 'Chart.js no esta disponible.';
    return;
  }

  const valores = config.data || [];
  const total = valores.reduce((sum, value) => sum + Number(value || 0), 0);

  if (total === 0) {
    canvas.style.display = 'none';
    if (fallback) fallback.textContent = 'Sin datos para graficar.';
    return;
  }

  if (fallback) fallback.textContent = '';
  canvas.style.display = 'block';

  const chartConfig = construirChartConfig(config);
  dashboardCharts.push(new Chart(canvas, chartConfig));
}

function construirChartConfig(config) {
  const baseDataset = {
    label: config.label || '',
    data: config.data,
    backgroundColor: config.backgroundColor,
    borderColor: config.borderColor || config.backgroundColor,
    borderWidth: 2,
    tension: 0.35,
    fill: config.type === 'line'
  };

  return {
    type: config.type,
    data: {
      labels: config.labels,
      datasets: [baseDataset]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 180,
      animation: false,
      cutout: config.type === 'doughnut' ? '62%' : undefined,
      plugins: {
        legend: {
          display: config.type === 'doughnut',
          position: 'bottom'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: config.type === 'doughnut' ? {} : {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: '#edf2f7' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  };
}

function renderDashboardUltimasSolicitudes(solicitudes) {
  const tbody = document.getElementById('dashboardUltimasSolicitudes');
  const total = document.getElementById('dashboardUltimasSolicitudesTotal');
  if (!tbody) return;

  if (total) {
    total.textContent = `${(solicitudes || []).length} recientes`;
  }

  if (!solicitudes || solicitudes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No hay solicitudes recientes.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = solicitudes.map(solicitud => `
    <tr>
      <td>${escapeHtml(formatearFechaSolicitudDashboard(solicitud.Fecha))}</td>
      <td>${escapeHtml(solicitud.Solicitante || '-')}</td>
      <td>${escapeHtml(solicitud.D_extranjero || solicitud.Descripcion || '-')}</td>
      <td>${renderDashboardEstadoBadge(solicitud.Status)}</td>
      <td>
        <button
          type="button"
          class="dashboard-review-button"
          onclick="revisarSolicitudDashboard(${Number(solicitud.id || 0)})"
        >Revisar</button>
      </td>
    </tr>
  `).join('');
}

function renderDashboardEstadoBadge(status) {
  const valor = String(status || 'Pendiente').trim();
  const normalizado = normalizarTextoFlexible(valor);
  let clase = 'pendiente';

  if (normalizado.includes('NUEVA')) clase = 'nueva';
  if (normalizado.includes('SEGUIMIENTO') || normalizado.includes('PENDIENTE')) clase = 'pendiente';
  if (normalizado.includes('LIBERADO') || normalizado.includes('APROBADO')) clase = 'liberado';
  if (normalizado.includes('RECHAZO')) clase = 'rechazo';

  return `<span class="dashboard-status-badge dashboard-status-${clase}">${escapeHtml(valor)}</span>`;
}

function revisarSolicitudDashboard(id) {
  if (id && typeof abrirSolicitud === 'function' && usuarioPuedeEnDashboardSeguimiento()) {
    abrirSolicitud(id);
    return;
  }

  showSection('solicitudes');
}

function usuarioPuedeEnDashboardSeguimiento() {
  const nivel = normalizarNivelUsuario(localStorage.getItem('usuarioNivel'));
  return nivel === 0 || nivel === 1;
}

function irSolicitudesNuevasPendientes() {
  showSection('solicitudes');

  setTimeout(() => {
    const filtro = document.getElementById('solicitudesFiltroStatus');
    if (filtro) {
      filtro.value = 'Seguimiento';
      cargarSolicitudes();
    }
  }, 0);
}

function destruirDashboardCharts() {
  dashboardCharts.forEach(chart => {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  });

  dashboardCharts = [];
}

function solicitudEsNuevaPendiente(solicitud) {
  const status = normalizarTextoFlexible(solicitud?.Status);
  return status.includes('NUEVA') || status.includes('PENDIENTE');
}

function solicitudEsPendiente(solicitud) {
  const status = normalizarTextoFlexible(solicitud?.Status);
  return solicitudEsNuevaPendiente(solicitud) || status.includes('SEGUIMIENTO') || !status;
}

function contarPorGrupoCodigo(codigos, grupos = []) {
  const contador = new Map();
  const gruposPorId = new Map();
  const ordenPorId = new Map();
  const colores = [
    '#0a6ed1',
    '#14a7c7',
    '#107e3e',
    '#e9730c',
    '#7b61ff',
    '#bb0000',
    '#64748b',
    '#0891b2',
    '#2563eb',
    '#ca8a04'
  ];

  DASHBOARD_GRUPOS_BASE.forEach((grupo, index) => {
    ordenPorId.set(grupo.Id, index);
  });

  (grupos || []).forEach(grupo => {
    const id = String(grupo.ID || grupo.Id || grupo.id || '').trim().toUpperCase();
    const nombre = String(grupo.Grupo || '').trim();

    if (id && nombre && !DASHBOARD_GRUPOS_OCULTOS.has(id)) {
      gruposPorId.set(id, nombre);
    }
  });

  (codigos || []).forEach(item => {
    const codigo = String(item['Codigo SAP'] || '').trim();
    const grupo = codigo ? codigo.charAt(0).toUpperCase() : 'S/D';
    if (DASHBOARD_GRUPOS_OCULTOS.has(grupo)) return;
    contador.set(grupo, (contador.get(grupo) || 0) + 1);
  });

  return Array.from(contador.entries())
    .map(([id, value], index) => ({
      id,
      label: gruposPorId.get(id) || `Grupo ${id}`,
      value,
      color: colores[index % colores.length]
    }))
    .sort((a, b) => (
      b.value - a.value
      || (ordenPorId.get(a.id) ?? 999) - (ordenPorId.get(b.id) ?? 999)
    ))
    .map((item, index) => ({
      ...item,
      color: colores[index % colores.length]
    }));
}

function contarPorEstadoSolicitud(solicitudes) {
  const contador = new Map();

  (solicitudes || []).forEach(item => {
    const estado = String(item.Status || 'Pendiente').trim() || 'Pendiente';
    contador.set(estado, (contador.get(estado) || 0) + 1);
  });

  return Array.from(contador.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function obtenerUltimosDias(cantidad) {
  const dias = [];

  for (let i = cantidad - 1; i >= 0; i -= 1) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    dias.push({
      key: obtenerFechaSoloDia(fecha),
      label: fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })
    });
  }

  return dias;
}

function obtenerInicioSemana(fecha) {
  const inicio = new Date(fecha);
  const dia = inicio.getDay();
  const distancia = dia === 0 ? 6 : dia - 1;

  inicio.setDate(inicio.getDate() - distancia);
  inicio.setHours(0, 0, 0, 0);

  return inicio;
}

function obtenerFechaSoloDia(fecha) {
  if (!fecha || Number.isNaN(fecha.getTime())) return '';
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsearFechaFlexible(valor) {
  if (!valor) return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const texto = String(valor).trim();
  const directa = new Date(texto);
  if (!Number.isNaN(directa.getTime())) return directa;

  const ddmmyyyy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const fecha = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  return null;
}

function formatearFechaSolicitudDashboard(fecha) {
  if (!fecha) return '-';

  const parsed = parsearFechaFlexible(fecha);
  if (!parsed) return String(fecha);

  return parsed.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function obtenerDashboardSolicitudesMock() {
  const hoy = obtenerFechaSoloDia(new Date());

  return [
    { id: 0, Fecha: hoy, Solicitante: 'Kevin Gomez', D_extranjero: 'Tornillo especial de acero', Status: 'Nueva' },
    { id: 0, Fecha: hoy, Solicitante: 'Administracion SAP', D_extranjero: 'Actualizacion de material', Status: 'Pendiente' },
    { id: 0, Fecha: hoy, Solicitante: 'Compras', D_extranjero: 'Alta de empaque', Status: 'Seguimiento' },
    { id: 0, Fecha: hoy, Solicitante: 'Ingenieria', D_extranjero: 'Cambio de revision', Status: 'Liberado' }
  ];
}

function obtenerDashboardCodigosMock() {
  const dias = obtenerUltimosDias(7);

  return [
    { 'Codigo SAP': 'M0010001', 'Fecha de ultimo Cambio': dias[6].key, Status: '2 - Local' },
    { 'Codigo SAP': 'M0010002', 'Fecha de ultimo Cambio': dias[6].key, Status: '2 - Local' },
    { 'Codigo SAP': 'A1000001', 'Fecha de ultimo Cambio': dias[5].key, Status: '3 - SAP' },
    { 'Codigo SAP': 'B1200001', 'Fecha de ultimo Cambio': dias[4].key, Status: '2 - Local' },
    { 'Codigo SAP': 'P1000001', 'Fecha de ultimo Cambio': dias[3].key, Status: '1 - Proceso' },
    { 'Codigo SAP': 'P1000002', 'Fecha de ultimo Cambio': dias[2].key, Status: '1 - Proceso' },
    { 'Codigo SAP': 'H1300001', 'Fecha de ultimo Cambio': dias[1].key, Status: '2 - Local' }
  ];
}

function combinarDashboardGrupos(gruposSupabase = []) {
  const porId = new Map();

  DASHBOARD_GRUPOS_BASE.forEach(grupo => {
    porId.set(grupo.Id, grupo);
  });

  (gruposSupabase || []).forEach(grupo => {
    const id = String(grupo.Id || grupo.ID || grupo.id || '').trim().toUpperCase();
    const nombre = String(grupo.Grupo || '').trim();

    if (id && nombre && !DASHBOARD_GRUPOS_OCULTOS.has(id)) {
      porId.set(id, { Id: id, Grupo: nombre });
    }
  });

  return Array.from(porId.values());
}

function obtenerDashboardGruposMock() {
  return DASHBOARD_GRUPOS_BASE;
}

// Buscador de BD_General con busqueda normal y busqueda especial por campo.
function renderBuscador() {
  const viewer = document.getElementById('viewer');

  viewer.innerHTML = `
    <div class="inicio-panel">
      <div class="inicio-header">
        <h2>Buscador</h2>
        <p>Busca por Nombre Pixvs, Nombre SAP o Codigo SAP.</p>
      </div>

      <div class="search-bar">
        <input
          id="buscadorInput"
          type="text"
          placeholder="Ejemplo: tornillo, cable, M11F020007, M01*Codigo SAP..."
          onkeydown="onBuscadorKeydown(event)"
        >

        <button onclick="buscarMateriaPrima()">
          Buscar
        </button>
      </div>

      <div id="buscadorStatus" class="status-box">
        Escribe un nombre o codigo para buscar.
      </div>

      <div class="table-scroll">
        <table class="catalog-table results-table">
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
              <th>Rutas</th>
            </tr>
          </thead>

          <tbody id="buscadorResults">
            <tr>
              <td colspan="11">Sin resultados todavia.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function onBuscadorKeydown(event) {
  if (event.key === 'Enter') {
    buscarMateriaPrima();
  }
}

async function buscarMateriaPrima() {
  const input = document.getElementById('buscadorInput');
  const status = document.getElementById('buscadorStatus');
  const tbody = document.getElementById('buscadorResults');

  const query = input.value.trim();

  if (!query) {
    status.textContent = 'Escribe un nombre o codigo para buscar.';

    tbody.innerHTML = `
      <tr>
        <td colspan="11">Sin resultados todavia.</td>
      </tr>
    `;
    buscadorResultadosRows = [];

    return;
  }

  status.textContent = 'Buscando...';

  await refrescarPermisoMuliixSesion();

  const columnasBusqueda = [
    'Codigo Pixvs',
    'Nombre Pixvs',
    'Codigo SAP',
    'Nombre SAP'
  ];

  const { data, error } = await leerSupabasePaginado(
    'BD_General',
    '"Id","Codigo Pixvs","Nombre Pixvs","Codigo SAP","Nombre SAP","Version SAP","Revision SAP","Muliix","Status","Fecha de ultimo Cambio","Responsable"',
    'Codigo SAP'
  );

  if (error) {
    status.textContent = 'Error al buscar en Supabase.';

    tbody.innerHTML = `
      <tr>
        <td colspan="11">${escapeHtml(error.message)}</td>
      </tr>
    `;
    buscadorResultadosRows = [];

    return;
  }

  const busquedaEspecial = obtenerBusquedaEspecialBuscador(query);
  const resultados = busquedaEspecial
    ? filtrarRegistrosPorInicioNormalizado(
      data,
      busquedaEspecial.valor,
      busquedaEspecial.columnas
    )
    : filtrarRegistrosNormalizados(
      data,
      query,
      columnasBusqueda
    );

  if (resultados.length === 0) {
    status.textContent = 'No se encontraron resultados.';

    tbody.innerHTML = `
      <tr>
        <td colspan="11">No hay coincidencias.</td>
      </tr>
    `;
    buscadorResultadosRows = [];

    return;
  }

  status.textContent = busquedaEspecial
    ? `Resultados encontrados: ${resultados.length} | Filtro por inicio en ${busquedaEspecial.etiqueta}`
    : `Resultados encontrados: ${resultados.length}`;

  buscadorResultadosRows = resultados;
  tbody.innerHTML = resultados.map((item, index) => `
    <tr>
      <td>${escapeHtml(item['Codigo SAP'])}</td>
      <td>${escapeHtml(item['Nombre SAP'])}</td>
      <td>${escapeHtml(item['Codigo Pixvs'])}</td>
      <td>${escapeHtml(item['Nombre Pixvs'])}</td>
      <td>${escapeHtml(item['Version SAP'])}</td>
      <td>${escapeHtml(item['Revision SAP'])}</td>
      <td>${renderMuliixCheckbox(item['Muliix'], item['Id'])}</td>
      <td>${renderStatusBadge(item['Status'])}</td>
      <td>${escapeHtml(formatearFecha(item['Fecha de ultimo Cambio']))}</td>
      <td>${escapeHtml(item['Responsable'])}</td>
      <td>${renderBotonRutaTrabajo(buscadorResultadosRows[index], index)}</td>
    </tr>
  `).join('');
}

function esArticuloPT(row) {
  const codigoSap = String(row?.['Codigo SAP'] || '').trim().toUpperCase();
  return Boolean(codigoSap) && PREFIJOS_CODIGO_SAP_PT.has(codigoSap[0]);
}

function renderBotonRutaTrabajo(item, index) {
  if (!esArticuloPT(item)) {
    return '<span class="route-not-available">Solo PT</span>';
  }

  return `
    <button
      type="button"
      class="route-open-button"
      onclick="abrirRutasTrabajoDesdeBuscador(${index})"
    >Rutas</button>
  `;
}

function renderVisualizer() {
  const viewer = document.getElementById('viewer');

  viewer.innerHTML = `
    <div class="catalog-wrapper">
      <div class="catalog-header">
        <h2>Visualizador</h2>
        <p>Modulo visualizador pendiente por configurar.</p>
      </div>
    </div>
  `;
}

// Manual embebido del sistema.
function renderManual() {
  const viewer = document.getElementById('viewer');

  viewer.innerHTML = `
    <h2>Manual</h2>
    <p>Aqui podras ver el manual.</p>
  `;
}

// Utilidades de formato usadas por varias vistas.
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


//document.addEventListener('DOMContentLoaded', function () {
//  if (localStorage.getItem('sesionActiva') === 'true') {
//    showSection('bienvenida');
//  }
//});

function formatearFecha(fecha) {
  if (!fecha) return '';

  const date = new Date(fecha);

  if (Number.isNaN(date.getTime())) {
    return fecha;
  }

  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

//Decoracion//

function renderStatusBadge(status) {
  const statusNormalizado = normalizarTextoFlexible(status);

  let clase = 'status-proceso';
  let etiqueta = String(status || 'Sin status').trim();

  if (statusNormalizado === '1PROCESO') {
    clase = 'status-proceso';
    etiqueta = '1 - Proceso';
  }

  if (statusNormalizado === '2LOCAL') {
    clase = 'status-local';
    etiqueta = '2 - Local';
  }

  if (statusNormalizado === '3SAP') {
    clase = 'status-sap';
    etiqueta = '3 - SAP';
  }

  if (statusNormalizado === '4BLOQUEADO') {
    clase = 'status-bloqueado';
    etiqueta = '4 - Bloqueado';
  }

  return `
    <span class="status-badge ${clase}">
      <span class="status-dot"></span>
      ${etiqueta}
    </span>
  `;
}

// Edicion rapida de Muliix desde el buscador; respeta el permiso del usuario.
function renderMuliixCheckbox(valor, id) {
  const puedeEditar = usuarioPuedeEditarMuliixBuscador();
  const idSeguro = Number(id);

  return `
    <input
      type="checkbox"
      class="muliix-checkbox"
      ${normalizarBooleanoMuliix(valor) ? 'checked' : ''}
      ${puedeEditar && Number.isFinite(idSeguro) ? '' : 'disabled'}
      onchange="guardarMuliixBuscador(${Number.isFinite(idSeguro) ? idSeguro : 0}, this)"
      aria-label="Muliix"
      title="${puedeEditar ? 'Modificar Muliix' : 'No tienes permiso para modificar Muliix'}"
    >
  `;
}

function usuarioPuedeEditarMuliixBuscador() {
  if (usuarioPuede(0)) return true;
  return normalizarBooleanoMuliix(localStorage.getItem('permisoMuliix'));
}

async function refrescarPermisoMuliixSesion() {
  if (usuarioPuede(0)) {
    localStorage.setItem('permisoMuliix', 'true');
    return true;
  }

  const usuarioId = localStorage.getItem('usuarioId');
  if (!usuarioId || !supabaseClient) {
    return usuarioPuedeEditarMuliixBuscador();
  }

  const { data, error } = await supabaseClient
    .from('MD:Usuarios')
    .select('User_Nombre,Nombre,Nivel,Permiso_Muliix')
    .eq('id', usuarioId)
    .maybeSingle();

  if (error || !data) {
    return usuarioPuedeEditarMuliixBuscador();
  }

  const nivel = normalizarNivelUsuario(data.Nivel);
  if (nivel !== null) {
    localStorage.setItem('usuarioNivel', String(nivel));
  }

  if (data.User_Nombre) {
    localStorage.setItem('usuarioActivo', data.User_Nombre);
  }

  if (data.Nombre || data.User_Nombre) {
    localStorage.setItem('usuarioNombre', data.Nombre || data.User_Nombre);
  }

  const permiso = nivel === 0 || normalizarBooleanoMuliix(data.Permiso_Muliix);
  localStorage.setItem('permisoMuliix', permiso ? 'true' : 'false');
  return permiso;
}

async function obtenerNombreResponsableMuliix() {
  const usuarioId = localStorage.getItem('usuarioId');
  const usuarioActivo = localStorage.getItem('usuarioActivo');

  let consulta = supabaseClient
    .from('MD:Usuarios')
    .select('User_Nombre,Nombre')
    .limit(1);

  if (usuarioId) {
    consulta = consulta.eq('id', usuarioId);
  } else if (usuarioActivo) {
    consulta = consulta.ilike('User_Nombre', usuarioActivo);
  } else {
    return '';
  }

  const { data, error } = await consulta.maybeSingle();

  if (error || !data?.Nombre) {
    return '';
  }

  localStorage.setItem('usuarioActivo', data.User_Nombre || usuarioActivo || '');
  localStorage.setItem('usuarioNombre', data.Nombre);

  return data.Nombre;
}

async function guardarMuliixBuscador(id, checkbox) {
  const status = document.getElementById('buscadorStatus');
  await refrescarPermisoMuliixSesion();

  if (!usuarioPuedeEditarMuliixBuscador()) {
    if (status) status.textContent = 'No tienes permiso para modificar Muliix.';
    if (checkbox) checkbox.checked = !checkbox.checked;
    return;
  }

  if (!id) {
    if (status) status.textContent = 'No se identifico el registro que se desea actualizar.';
    if (checkbox) checkbox.checked = !checkbox.checked;
    return;
  }

  const nuevoValor = Boolean(checkbox?.checked);
  const responsable = await obtenerNombreResponsableMuliix();
  const fechaCambio = new Date().toISOString();

  if (!responsable) {
    if (status) status.textContent = 'No se encontro el nombre del responsable. Revisa el campo Nombre en Control de Accesos.';
    if (checkbox) checkbox.checked = !checkbox.checked;
    return;
  }

  if (checkbox) checkbox.disabled = true;
  if (status) status.textContent = 'Guardando Muliix...';

  const { data, error } = await supabaseClient
    .from('BD_General')
    .update({
      Muliix: nuevoValor,
      'Fecha de ultimo Cambio': fechaCambio,
      Responsable: responsable
    })
    .eq('Id', id)
    .select('"Id","Muliix","Fecha de ultimo Cambio","Responsable"')
    .maybeSingle();

  if (error || !data) {
    if (checkbox) {
      checkbox.checked = !nuevoValor;
      checkbox.disabled = false;
    }

    if (status) {
      status.textContent = error
        ? 'Error al guardar Muliix: ' + error.message
        : 'No se actualizo Muliix. Revisa permisos de UPDATE en BD_General.';
    }
    return;
  }

  if (checkbox) checkbox.disabled = false;
  actualizarFilaMuliixBuscador(checkbox, data);
  if (status) status.textContent = 'Muliix actualizado correctamente.';
}

function actualizarFilaMuliixBuscador(checkbox, data) {
  const fila = checkbox?.closest('tr');
  if (!fila || !data) return;

  const celdas = fila.querySelectorAll('td');
  const fechaCelda = celdas[8];
  const responsableCelda = celdas[9];

  if (fechaCelda) {
    fechaCelda.textContent = formatearFecha(data['Fecha de ultimo Cambio']);
  }

  if (responsableCelda) {
    responsableCelda.textContent = data.Responsable || '';
  }
}

function normalizarTextoFlexible(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
}

function filtrarRegistrosNormalizados(rows, busqueda, columnas) {
  const busquedaNormalizada = normalizarTextoFlexible(busqueda);
  if (!busquedaNormalizada) return [];

  return (rows || []).filter(row => (
    columnas.some(columna => (
      normalizarTextoFlexible(row[columna]).includes(busquedaNormalizada)
    ))
  ));
}

function obtenerBusquedaEspecialBuscador(query) {
  if (!query || !query.includes('*')) return null;

  const partes = String(query).split('*');
  if (partes.length < 2) return null;

  const valor = partes.shift().trim();
  const campo = partes.join('*').trim();

  if (!valor || !campo) return null;

  const campoNormalizado = normalizarTextoFlexible(campo);
  const camposPorAlias = {
    CODIGOSAP: {
      etiqueta: 'Codigo SAP',
      columnas: ['Codigo SAP']
    },
    CODIGOPIXVS: {
      etiqueta: 'Codigo Pixvs',
      columnas: ['Codigo Pixvs']
    },
    NOMBRESAP: {
      etiqueta: 'Nombre SAP',
      columnas: ['Nombre SAP']
    },
    NOMBREPIXVS: {
      etiqueta: 'Nombre Pixvs',
      columnas: ['Nombre Pixvs']
    },
    NOMBRE: {
      etiqueta: 'Nombre Pixvs / Nombre SAP',
      columnas: ['Nombre Pixvs', 'Nombre SAP']
    },
    CODIGO: {
      etiqueta: 'Codigo Pixvs / Codigo SAP',
      columnas: ['Codigo Pixvs', 'Codigo SAP']
    }
  };

  const config = camposPorAlias[campoNormalizado];
  if (!config) return null;

  return {
    valor,
    etiqueta: config.etiqueta,
    columnas: config.columnas
  };
}

function filtrarRegistrosPorInicioNormalizado(rows, busqueda, columnas) {
  const busquedaNormalizada = normalizarTextoFlexible(busqueda);
  if (!busquedaNormalizada) return [];

  return (rows || []).filter(row => (
    columnas.some(columna => (
      normalizarTextoFlexible(row[columna]).startsWith(busquedaNormalizada)
    ))
  ));
}

// Lectura paginada para evitar el limite normal de 1000 registros de Supabase.
async function leerSupabasePaginado(
  tabla,
  columnas = '*',
  columnaOrden = '',
  ascendente = true
) {
  const limitePagina = 1000;
  const registros = [];
  let inicio = 0;

  while (true) {
    let consulta = supabaseClient
      .from(tabla)
      .select(columnas);

    if (columnaOrden) {
      consulta = consulta.order(columnaOrden, { ascending: ascendente });
    }

    const { data, error } = await consulta.range(
      inicio,
      inicio + limitePagina - 1
    );

    if (error) {
      return { data: [], error };
    }

    const pagina = data || [];
    registros.push(...pagina);

    if (pagina.length < limitePagina) {
      break;
    }

    inicio += limitePagina;
  }

  return { data: registros, error: null };
}
