// Estado general del modulo Solicitudes.
let solicitudSeguimientoId = null;
let solicitudArticuloContador = 1;
let solicitudActualData = null;
let solicitudCambioPadre = null;
let solicitudesListadoRows = [];
let solicitudGuardadoEnProceso = false;
let solicitudConfirmacionCallback = null;
const SOLICITUD_LISTADO_LIMITE = 10;
const TIPO_SOLICITUD_ALTA_PRODUCTO = 'Alta de Producto';
// Tipos nuevos de solicitud y columnas extra usadas en Supabase.
const SOLICITUD_TIPOS_NUEVOS = {
  baja_articulos: 'Baja de articulos',
  modificacion_articulos: 'Modificacion de Articulos',
  alta_ct_cr: 'Alta de CT y CR',
  modificacion_ct: 'Modificacion de Centros de Trabajo'
};

const SOLICITUD_CAMPOS_EXTRA = [
  'Solicitud_Codigo',
  'Solicitud_Nombre',
  'Solicitud_SAP_BEAS',
  'Solicitud_Cambio_Version_Revision',
  'Solicitud_Categorias',
  'Solicitud_Area',
  'Solicitud_Recursos',
  'Solicitud_Centro_Trabajo',
  'Solicitud_Cambio_A_Hacer'
];

// Permisos y reglas de propiedad de solicitudes.
function obtenerTipoSolicitud(row) {
  return row?.Tipo_Solicitud || TIPO_SOLICITUD_ALTA_PRODUCTO;
}

function usuarioPuedeEnSolicitudes(...nivelesPermitidos) {
  const nivel = normalizarNivelUsuario(localStorage.getItem('usuarioNivel'));
  const nivelEfectivo = nivel === 1 ? 0 : nivel;

  return nivelEfectivo !== null
    && nivelesPermitidos.includes(nivelEfectivo);
}

function puedeDarSeguimientoSolicitudes() {
  return usuarioPuedeEnSolicitudes(0);
}

function esControlTotalSolicitudes() {
  return normalizarNivelUsuario(localStorage.getItem('usuarioNivel')) === 0;
}

function esUsuarioNivelDosSolicitudes() {
  return normalizarNivelUsuario(localStorage.getItem('usuarioNivel')) === 2;
}

function obtenerIdentidadesUsuarioSolicitud() {
  return [
    localStorage.getItem('usuarioNombre'),
    localStorage.getItem('usuarioActivo'),
    obtenerNombreUsuarioVisible()
  ]
    .filter(Boolean)
    .map(valor => normalizarTextoFlexible(valor))
    .filter(Boolean);
}

function obtenerNombresUsuarioSolicitud() {
  const nombres = [
    localStorage.getItem('usuarioNombre'),
    localStorage.getItem('usuarioActivo'),
    obtenerNombreUsuarioVisible()
  ]
    .filter(Boolean)
    .map(valor => String(valor).trim())
    .filter(Boolean);

  return Array.from(new Set(nombres));
}

function esSolicitudPropia(solicitud) {
  const solicitante = normalizarTextoFlexible(solicitud?.Solicitante || '');
  return solicitante
    && obtenerIdentidadesUsuarioSolicitud().includes(solicitante);
}

function puedeAdministrarSolicitudPropia(solicitud) {
  return esControlTotalSolicitudes() || esSolicitudPropia(solicitud);
}

// Catalogo local de unidades usadas por Alta de Producto.
const SOLICITUD_UNIDADES_MEDIDA = [
  ['PZA', 'PZA - Pieza'],
  ['KG', 'KG - Kilogramo'],
  ['GR', 'GR - Gramo'],
  ['MTS', 'MTS - Metro'],
  ['CM', 'CM - Centimetro'],
  ['MM', 'MM - Milimetro'],
  ['M2', 'M2 - Metro cuadrado'],
  ['M3', 'M3 - Metro cubico'],
  ['LTS', 'LTS - Litro'],
  ['ML', 'ML - Mililitro'],
  ['TON', 'TON - Tonelada'],
  ['CAJA', 'CAJA'],
  ['PAQUETE', 'PAQUETE'],
  ['ROLLO', 'ROLLO'],
  ['JUEGO', 'JUEGO'],
  ['PAR', 'PAR'],
  ['SERVICIO', 'SERVICIO']
];

function crearOpcionesUnidadMedida() {
  return `
    <option value="">Selecciona una unidad</option>
    ${SOLICITUD_UNIDADES_MEDIDA.map(([valor, etiqueta]) => (
      `<option value="${valor}">${etiqueta}</option>`
    )).join('')}
  `;
}

function mostrarStatusSolicitudes(mensaje) {
  const status = document.getElementById('solicitudesStatus');
  if (!status) return;

  status.hidden = false;
  status.textContent = mensaje;
}

function ocultarStatusSolicitudes() {
  const status = document.getElementById('solicitudesStatus');
  if (!status) return;

  status.hidden = true;
  status.textContent = '';
}

function reiniciarBloqueoGuardadoSolicitud() {
  solicitudGuardadoEnProceso = false;
}

// Listado principal de solicitudes.
window.renderSolicitudes = function renderSolicitudes() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  const puedeCrear = usuarioPuedeEnSolicitudes(0, 2);
  const mostrarFiltroStatus = !esUsuarioNivelDosSolicitudes();

  viewer.innerHTML = `
    <div class="catalog-wrapper solicitudes-wrapper">
      <div class="catalog-header">
        <h2>Solicitudes</h2>
        <p>Registro y seguimiento de solicitudes del Index.</p>
      </div>

      <div class="solicitudes-panel">
        <div class="solicitudes-toolbar">
          ${mostrarFiltroStatus ? `
            <label class="solicitudes-filter" for="solicitudesFiltroStatus">
              <span>Filtrar por estatus</span>
              <select id="solicitudesFiltroStatus" onchange="cargarSolicitudes()">
                <option value="Seguimiento" selected>Seguimiento</option>
                <option value="Rechazo">Rechazo</option>
                <option value="Liberado">Liberado</option>
              </select>
            </label>
          ` : ''}

          ${puedeCrear ? '<button type="button" onclick="mostrarNuevaSolicitud()">Nueva solicitud</button>' : ''}
        </div>

        <div id="solicitudesStatus" class="status-box" hidden></div>

        <div class="table-scroll">
          <table class="catalog-table solicitudes-table">
            <thead>
              <tr>
                <th></th>
                <th>Folio</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Solicitante</th>
                <th>Descripcion</th>
                <th>Estatus</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody id="solicitudesResultados">
              <tr>
                <td colspan="8">Sin solicitudes registradas todavia.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  cargarSolicitudes();
};

async function cargarSolicitudes() {
  const status = document.getElementById('solicitudesStatus');
  const tbody = document.getElementById('solicitudesResultados');
  const filtroStatus = document.getElementById('solicitudesFiltroStatus')?.value || 'Seguimiento';
  const puedeSeguimiento = puedeDarSeguimientoSolicitudes();
  const columnas = 8;

  if (!tbody) return;

  if (!supabaseClient) {
    mostrarStatusSolicitudes('Supabase no esta cargado. Revisa index.html.');
    return;
  }

  ocultarStatusSolicitudes();

  const esControlTotal = esControlTotalSolicitudes();
  const mostrarTodasPropias = esUsuarioNivelDosSolicitudes();
  const filtroStatusConsulta = mostrarTodasPropias ? '' : filtroStatus;
  const nombresUsuario = obtenerNombresUsuarioSolicitud();

  if (!esControlTotal && nombresUsuario.length === 0) {
    mostrarStatusSolicitudes('No se encontro el usuario de la sesion.');
    solicitudesListadoRows = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnas}">Sin solicitudes registradas todavia.</td>
      </tr>
    `;
    return;
  }

  let consulta = supabaseClient
    .from('Solicitudes')
    .select('id,Folio,Tipo_Solicitud,Fecha,Solicitante,D_extranjero,Status,Motivo_Rechazo,Comentario_Revision');

  if (!esControlTotal) {
    consulta = consulta.in('Solicitante', nombresUsuario);
  }

  if (filtroStatusConsulta === 'Rechazo') {
    consulta = consulta.in('Status', ['Rechazo', 'Rechazado']);
  } else if (filtroStatusConsulta === '__nuevas_pendientes__') {
    consulta = consulta.in('Status', ['Nueva', 'Pendiente', 'Seguimiento']);
  } else if (filtroStatusConsulta && filtroStatusConsulta !== '__activas__') {
    consulta = consulta.eq('Status', filtroStatusConsulta);
  }

  consulta = consulta.order('id', { ascending: false });

  if (!esControlTotal && !mostrarTodasPropias) {
    consulta = consulta.limit(SOLICITUD_LISTADO_LIMITE);
  }

  let { data, error } = await consulta;
  let motivoRechazoDisponible = true;

  if (error && (
    String(error.message || '').includes('Motivo_Rechazo') ||
    String(error.message || '').includes('Tipo_Solicitud') ||
    String(error.message || '').includes('Comentario_Revision')
  )) {
    motivoRechazoDisponible = false;

    let consultaRespaldo = supabaseClient
      .from('Solicitudes')
      .select('id,Folio,Fecha,Solicitante,D_extranjero,Status');

    if (!esControlTotal) {
      consultaRespaldo = consultaRespaldo.in('Solicitante', nombresUsuario);
    }

    if (filtroStatusConsulta === 'Rechazo') {
      consultaRespaldo = consultaRespaldo.in('Status', ['Rechazo', 'Rechazado']);
    } else if (filtroStatusConsulta === '__nuevas_pendientes__') {
      consultaRespaldo = consultaRespaldo.in('Status', ['Nueva', 'Pendiente', 'Seguimiento']);
    } else if (filtroStatusConsulta && filtroStatusConsulta !== '__activas__') {
      consultaRespaldo = consultaRespaldo.eq('Status', filtroStatusConsulta);
    }

    consultaRespaldo = consultaRespaldo.order('id', { ascending: false });

    if (!esControlTotal && !mostrarTodasPropias) {
      consultaRespaldo = consultaRespaldo.limit(SOLICITUD_LISTADO_LIMITE);
    }

    const resultadoRespaldo = await consultaRespaldo;
    data = resultadoRespaldo.data;
    error = resultadoRespaldo.error;
  }

  if (error) {
    mostrarStatusSolicitudes('Error al cargar solicitudes: ' + error.message);
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnas}">No fue posible consultar las solicitudes.</td>
      </tr>
    `;
    return;
  }

  data = filtrarSolicitudesPorFiltroStatus(data || [], filtroStatusConsulta)
    .filter(solicitud => esControlTotal || esSolicitudPropia(solicitud));

  if (!esControlTotal && !mostrarTodasPropias) {
    data = data.slice(0, SOLICITUD_LISTADO_LIMITE);
  }

  if (!data || data.length === 0) {
    mostrarStatusSolicitudes(esControlTotal
      ? filtroStatusConsulta
        ? `No hay solicitudes con estatus ${obtenerEtiquetaFiltroSolicitudes(filtroStatusConsulta)}.`
        : 'No hay solicitudes registradas.'
      : mostrarTodasPropias
        ? 'No tienes solicitudes registradas.'
        : filtroStatusConsulta
          ? `No tienes solicitudes con estatus ${obtenerEtiquetaFiltroSolicitudes(filtroStatusConsulta)}.`
          : 'No tienes solicitudes registradas.');
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnas}">Sin solicitudes registradas todavia.</td>
      </tr>
    `;
    return;
  }

  if (!motivoRechazoDisponible) {
    mostrarStatusSolicitudes('Falta crear la columna Motivo_Rechazo en Supabase.');
  } else {
    ocultarStatusSolicitudes();
  }
  solicitudesListadoRows = data;
  tbody.innerHTML = data.map((solicitud, index) => {
    const puedeAdministrar = puedeAdministrarSolicitudPropia(solicitud);
    const solicitudCerrada = esSolicitudCerradaConComentario(solicitud);
    const puedeBorrar = esControlTotalSolicitudes();

    return `
      <tr>
        <td class="solicitud-delete-cell">
          ${puedeBorrar ? `
            <button
              type="button"
              class="solicitud-delete-icon"
              title="Borrar"
              aria-label="Borrar"
              onclick="eliminarSolicitud(${Number(solicitud.id)})"
            >🗑</button>
          ` : ''}
        </td>
        <td>${escapeHtml(solicitud.Folio || '-')}</td>
        <td>${escapeHtml(obtenerTipoSolicitud(solicitud))}</td>
        <td>${escapeHtml(formatearFechaSolicitud(solicitud.Fecha))}</td>
        <td>${escapeHtml(solicitud.Solicitante || '-')}</td>
        <td>${escapeHtml(solicitud.D_extranjero || '-')}</td>
        <td>${renderStatusSolicitud(solicitud.Status)}</td>
        <td>
          <div class="solicitud-row-actions">
            ${puedeSeguimiento ? `
              <button
                type="button"
                class="solicitud-open-button"
                onclick="abrirSolicitud(${Number(solicitud.id)})"
              >Abrir</button>
            ` : `
              <button
                type="button"
                class="solicitud-open-button"
                onclick="imprimirSolicitudPDF(${Number(solicitud.id)})"
              >Imprimir PDF</button>
            `}

            ${puedeAdministrar && !solicitudCerrada ? `
              <button
                type="button"
                class="solicitud-change-button"
                onclick="editarSolicitud(${Number(solicitud.id)})"
              >Editar</button>
            ` : ''}

            ${solicitudCerrada ? `
              <button
                type="button"
                class="solicitud-change-button"
                onclick="verComentarioCierreSolicitud(${index})"
              >Ver comentario</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function formatearFechaSolicitud(fecha) {
  if (!fecha) return '-';

  const partes = String(fecha).slice(0, 10).split('-');
  if (partes.length !== 3) return fecha;

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obtenerEtiquetaFiltroSolicitudes(filtroStatus) {
  if (filtroStatus === '__activas__') {
    return 'Activas';
  }

  if (filtroStatus === '__nuevas_pendientes__') {
    return 'Nueva/Pendiente';
  }

  return filtroStatus;
}

function filtrarSolicitudesPorFiltroStatus(data, filtroStatus) {
  if (filtroStatus !== '__activas__') {
    return data;
  }

  return (data || []).filter(solicitud => {
    const status = normalizarTextoFlexible(solicitud.Status);

    return status !== 'RECHAZO'
      && status !== 'RECHAZADO'
      && status !== 'LIBERADO';
  });
}

function obtenerFechaLocalSolicitud() {
  const fecha = new Date();
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function renderStatusSolicitud(status) {
  const valor = String(status || 'Seguimiento').trim();
  const clase = valor === 'Liberado'
    ? 'liberado'
    : valor === 'Rechazo'
      ? 'rechazo'
      : 'seguimiento';

  return `<span class="solicitud-status solicitud-status-${clase}">${escapeHtml(valor)}</span>`;
}

function esSolicitudCerradaConComentario(solicitud) {
  const status = normalizarTextoFlexible(solicitud?.Status || '');
  return status === 'LIBERADO'
    || status === 'RECHAZO'
    || status === 'RECHAZADO';
}

// Comentario final visible para solicitudes liberadas o rechazadas.
window.verComentarioCierreSolicitud = function verComentarioCierreSolicitud(index) {
  const solicitud = solicitudesListadoRows[index];
  if (!solicitud) return;

  document.getElementById('popupComentarioCierreSolicitud')?.remove();

  const comentario = solicitud.Comentario_Revision
    || solicitud.Motivo_Rechazo
    || 'No hay comentario registrado.';

  const overlay = document.createElement('div');
  overlay.id = 'popupComentarioCierreSolicitud';
  overlay.className = 'popup-tipos-overlay';
  overlay.innerHTML = `
    <div class="popup-tipos rechazo-popup" role="dialog" aria-modal="true">
      <div class="popup-tipos-header">
        <h3>Comentario - ${escapeHtml(solicitud.Folio || '')}</h3>
        <button type="button" onclick="cerrarComentarioCierreSolicitud()">Cerrar</button>
      </div>
      <div class="popup-tipos-body">
        <div class="rechazo-motivo-texto">
          ${escapeHtml(comentario)}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
};

window.cerrarComentarioCierreSolicitud = function cerrarComentarioCierreSolicitud() {
  document.getElementById('popupComentarioCierreSolicitud')?.remove();
};

function mostrarConfirmacionSolicitud(mensaje, onConfirmar) {
  document.getElementById('popupConfirmacionSolicitud')?.remove();
  solicitudConfirmacionCallback = typeof onConfirmar === 'function' ? onConfirmar : null;

  const overlay = document.createElement('div');
  overlay.id = 'popupConfirmacionSolicitud';
  overlay.className = 'popup-tipos-overlay';
  overlay.innerHTML = `
    <div class="popup-tipos guardado-popup solicitud-confirmacion-popup" role="dialog" aria-modal="true">
      <div class="popup-tipos-header">
        <h3>Confirmar accion</h3>
      </div>
      <div class="popup-tipos-body">
        <p>${escapeHtml(mensaje)}</p>
        <div class="guardado-popup-actions">
          <button type="button" class="danger-button" onclick="confirmarAccionSolicitud()">Borrar</button>
          <button type="button" onclick="cerrarConfirmacionSolicitud()">Cancelar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

window.cerrarConfirmacionSolicitud = function cerrarConfirmacionSolicitud() {
  solicitudConfirmacionCallback = null;
  document.getElementById('popupConfirmacionSolicitud')?.remove();
};

window.confirmarAccionSolicitud = function confirmarAccionSolicitud() {
  const callback = solicitudConfirmacionCallback;
  cerrarConfirmacionSolicitud();
  if (callback) callback();
};

// Edicion de solicitudes abiertas por el solicitante o control total.
window.editarSolicitud = async function editarSolicitud(id) {
  const viewer = document.getElementById('viewer');
  if (!viewer || !supabaseClient) return;

  viewer.innerHTML = `
    <div class="catalog-wrapper solicitudes-wrapper">
      <div id="solicitudesStatus" class="status-box">Cargando solicitud para editar...</div>
    </div>
  `;

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    document.getElementById('solicitudesStatus').textContent =
      'Error al cargar la solicitud: ' + error.message;
    return;
  }

  if (!puedeAdministrarSolicitudPropia(data)) {
    mostrarAccesoDenegado();
    return;
  }

  solicitudSeguimientoId = data.id;
  solicitudActualData = data;

  if (esSolicitudCambio(data)) {
    renderFormularioSolicitudCambio(null, data, { edicion: true });
    return;
  }

  if (esSolicitudGenerica(data)) {
    solicitudSeguimientoId = data.id;
    solicitudActualData = data;
    renderFormularioSolicitudGenerica(
      obtenerClaveTipoSolicitudGenerica(data.Tipo_Solicitud),
      data,
      { edicion: true, integrado: false, destinoId: 'viewer' }
    );
    return;
  }

  crearSolicitud();
  solicitudSeguimientoId = data.id;
  solicitudActualData = data;

  document.getElementById('solicitudAgregarArticulo')?.remove();

  const titulo = document.querySelector('.solicitud-paper-header h2');
  if (titulo) titulo.textContent = 'Editar Solicitud';

  asignarValorSolicitud('solicitudFolio', data.Folio);
  asignarValorSolicitud('solicitudFecha', data.Fecha);
  asignarValorSolicitud('solicitudSolicitante', data.Solicitante);
  asignarValorSolicitud('codigoExtranjero', data.C_Extranjero);
  asignarValorSolicitud('descripcionExtranjera', data.D_extranjero);
  asignarValorSolicitud('solicitudUnidadMedida', data.UM);
  asignarValorSolicitud('solicitudComentarios', data.Comentarios);

  const fantasma = document.querySelector(
    `input[name="productoFantasma"][value="${data.Fantasma ? 'Si' : 'No'}"]`
  );
  if (fantasma && data.Fantasma !== null) fantasma.checked = true;

  const categorias = String(data.Categoria || '')
    .split(',')
    .map(categoria => categoria.trim().toLowerCase());

  const inventario = document.getElementById('categoriaInventario');
  const venta = document.getElementById('categoriaVenta');
  const compra = document.getElementById('categoriaCompra');

  if (inventario) inventario.checked = categorias.includes('inventario');
  if (venta) venta.checked = categorias.includes('venta');
  if (compra) compra.checked = categorias.includes('compra');

  bloquearSolicitanteSolicitud();

  const acciones = document.querySelector('.solicitud-actions');
  if (acciones) {
    acciones.innerHTML = `
      <button type="button" onclick="guardarEdicionSolicitud()">Guardar cambios</button>
      <button type="button" onclick="renderSolicitudes()">Cancelar</button>
    `;
  }

  const status = document.getElementById('solicitudesStatus');
  if (status) status.textContent = `Editando solicitud ${data.Folio || ''}.`;
};

// Eliminacion de solicitudes; solo nivel 0 puede borrar sin importar estatus.
window.eliminarSolicitud = async function eliminarSolicitud(id) {
  if (!supabaseClient) return;

  const status = document.getElementById('solicitudesStatus');
  const { data: solicitud, error: consultaError } = await supabaseClient
    .from('Solicitudes')
    .select('id,Folio,Solicitante,Status')
    .eq('id', id)
    .single();

  if (consultaError) {
    if (status) status.textContent = 'Error al validar la solicitud: ' + consultaError.message;
    return;
  }

  if (!solicitud?.id) {
    if (status) status.textContent = 'No se encontro la solicitud que se desea borrar.';
    return;
  }

  if (!esControlTotalSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  mostrarConfirmacionSolicitud(
    `Se borrara la solicitud "${solicitud.Folio || id}". Esta accion no se puede deshacer.`,
    () => ejecutarEliminacionSolicitud(solicitud.id)
  );
};

async function ejecutarEliminacionSolicitud(id) {
  const status = document.getElementById('solicitudesStatus');

  if (status) status.textContent = 'Borrando solicitud...';

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .delete()
    .eq('id', id)
    .select('id,Folio');

  if (error) {
    if (status) status.textContent = 'Error al borrar solicitud: ' + error.message;
    return;
  }

  if (!data || data.length === 0) {
    if (status) {
      status.textContent = 'Supabase no borro ningun registro. Revisa permisos RLS de delete en la tabla Solicitudes.';
    }
    return;
  }

  if (status) status.textContent = 'Solicitud borrada correctamente.';
  mostrarPopupGuardado('Solicitud borrada correctamente.', {
    titulo: 'Solicitud borrada'
  });
  cargarSolicitudes();
}

// Apertura de solicitud para revision, seguimiento o consulta.
window.abrirSolicitud = async function abrirSolicitud(id) {
  const viewer = document.getElementById('viewer');
  if (!viewer || !supabaseClient) return;

  if (!puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  viewer.innerHTML = `
    <div class="catalog-wrapper solicitudes-wrapper">
      <div id="solicitudesStatus" class="status-box">Cargando solicitud...</div>
    </div>
  `;

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    document.getElementById('solicitudesStatus').textContent =
      'Error al abrir la solicitud: ' + error.message;
    return;
  }

  if (esSolicitudCambio(data)) {
    renderDetalleSolicitudCambio(data);
    return;
  }

  if (esSolicitudGenerica(data)) {
    solicitudSeguimientoId = data.id;
    solicitudActualData = data;
    renderFormularioSolicitudGenerica(
      obtenerClaveTipoSolicitudGenerica(data.Tipo_Solicitud),
      data,
      {
        soloLectura: true,
        comentarioSeguimiento: true,
        integrado: false,
        destinoId: 'viewer'
      }
    );

    const acciones = document.querySelector('.solicitud-actions');
    if (!acciones && puedeDarSeguimientoSolicitudes()) {
      const paper = document.querySelector('.solicitud-generica-paper');
      paper?.insertAdjacentHTML('beforeend', `
        <div class="solicitud-actions">
          <button type="button" onclick="guardarEdicionSolicitudGenerica()">Guardar comentario</button>
          <label class="solicitud-status-field" for="solicitudStatusSeguimiento">
            <span>Status</span>
            <select id="solicitudStatusSeguimiento">
              <option value="Seguimiento">Seguimiento</option>
              <option value="Rechazo">Rechazo</option>
              <option value="Liberado">Liberado</option>
            </select>
          </label>
          <button type="button" onclick="cambiarStatusSolicitud()">Cambiar status</button>
        </div>
      `);
      const statusSelect = document.getElementById('solicitudStatusSeguimiento');
      if (statusSelect) statusSelect.value = data.Status || 'Seguimiento';
    }

    const status = document.getElementById('solicitudesStatus');
    if (status) status.textContent = `Solicitud ${data.Folio || ''} abierta en modo de consulta.`;
    return;
  }

  crearSolicitud();
  solicitudSeguimientoId = data.id;
  solicitudActualData = data;

  document.getElementById('solicitudAgregarArticulo')?.remove();

  const titulo = document.querySelector('.solicitud-paper-header h2');
  if (titulo) titulo.textContent = 'Seguimiento de Solicitud';

  asignarValorSolicitud('solicitudFolio', data.Folio);
  asignarValorSolicitud('solicitudFecha', data.Fecha);
  asignarValorSolicitud('solicitudSolicitante', data.Solicitante);
  asignarValorSolicitud('codigoExtranjero', data.C_Extranjero);
  asignarValorSolicitud('descripcionExtranjera', data.D_extranjero);
  asignarValorSolicitud('solicitudUnidadMedida', data.UM);
  asignarValorSolicitud('solicitudComentarios', data.Comentarios);

  const fantasma = document.querySelector(
    `input[name="productoFantasma"][value="${data.Fantasma ? 'Si' : 'No'}"]`
  );
  if (fantasma && data.Fantasma !== null) fantasma.checked = true;

  const categorias = String(data.Categoria || '')
    .split(',')
    .map(categoria => categoria.trim().toLowerCase());

  const inventario = document.getElementById('categoriaInventario');
  const venta = document.getElementById('categoriaVenta');
  const compra = document.getElementById('categoriaCompra');

  if (inventario) inventario.checked = categorias.includes('inventario');
  if (venta) venta.checked = categorias.includes('venta');
  if (compra) compra.checked = categorias.includes('compra');

  const formatoFuturo = document.querySelector('.solicitud-formato-futuro');
  if (formatoFuturo) formatoFuturo.hidden = false;

  asignarValorSolicitud('solicitudVersion', data.Version ?? 1);
  asignarValorSolicitud('solicitudRevision', data.Revision ?? 1);
  asignarValorSolicitud('nuevoCodigoDescripcionVieja', data.Descripcion || data.D_extranjero);

  const clasificacion = document.querySelector(
    `input[name="clasificacionGeneral"][value="${data.Clasificacion || ''}"]`
  );
  if (clasificacion) clasificacion.checked = true;

  const codigoGenerado = document.getElementById('nuevoCodigoGenerado');
  if (codigoGenerado) codigoGenerado.textContent = data.Codigo || '-';

  document.querySelectorAll('.solicitud-paper input, .solicitud-paper textarea, .solicitud-paper select')
    .forEach(control => {
      if (control.closest('.solicitud-formato-futuro')) return;

      const soloLectura = ['solicitudFolio', 'solicitudFecha', 'solicitudSolicitante'].includes(control.id);
      control.disabled = soloLectura;
      control.readOnly = soloLectura;
    });

  const acciones = document.querySelector('.solicitud-actions');
  if (acciones) {
    acciones.innerHTML = `
      <button type="button" onclick="guardarSeguimientoSolicitud()">Guardar cambios</button>
      <label class="solicitud-status-field" for="solicitudStatusSeguimiento">
        <span>Status</span>
        <select id="solicitudStatusSeguimiento" onchange="actualizarBotonSubirSolicitud()">
          <option value="Seguimiento">Seguimiento</option>
          <option value="Rechazo">Rechazo</option>
          <option value="Liberado">Liberado</option>
        </select>
      </label>
      <button type="button" onclick="cambiarStatusSolicitud()">Cambiar status</button>
      <button
        id="btnSubirSolicitud"
        type="button"
        onclick="subirSolicitudBDGeneral()"
        disabled
      >Subir a Base de Datos</button>
      <button type="button" onclick="descargarSolicitudPDF()">Descargar PDF</button>
    `;

    const statusSelect = document.getElementById('solicitudStatusSeguimiento');
    if (statusSelect) statusSelect.value = data.Status || 'Seguimiento';
    actualizarBotonSubirSolicitud();
  }

  await prepararGeneradorSolicitud(data);

  const status = document.getElementById('solicitudesStatus');
  if (status) {
    status.textContent = data.Status === 'Rechazo' && data.Motivo_Rechazo
      ? `Solicitud rechazada. Motivo: ${data.Motivo_Rechazo}`
      : `Solicitud ${data.Folio || ''} abierta en modo de consulta.`;
  }
};

function asignarValorSolicitud(id, valor) {
  const control = document.getElementById(id);
  if (!control) return;

  if (control.tagName === 'SELECT' && valor != null) {
    const valorNormalizado = normalizarTextoFlexible(valor);
    const option = Array.from(control.options).find(item => (
      normalizarTextoFlexible(item.value) === valorNormalizado
    ));

    control.value = option?.value || '';
    return;
  }

  control.value = valor ?? '';
}

function bloquearSolicitanteSolicitud() {
  const solicitante = document.getElementById('solicitudSolicitante');
  if (!solicitante) return;

  solicitante.disabled = true;
  solicitante.readOnly = true;
}

function construirPayloadEdicionSolicitudBasica() {
  const categorias = [];

  if (document.getElementById('categoriaInventario')?.checked) {
    categorias.push('Inventario');
  }

  if (document.getElementById('categoriaVenta')?.checked) {
    categorias.push('Venta');
  }

  if (document.getElementById('categoriaCompra')?.checked) {
    categorias.push('Compra');
  }

  const fantasmaValue = document.querySelector(
    'input[name="productoFantasma"]:checked'
  )?.value || null;

  return {
    C_Extranjero: document.getElementById('codigoExtranjero')?.value.trim() || null,
    D_extranjero: document.getElementById('descripcionExtranjera')?.value.trim() || null,
    UM: document.getElementById('solicitudUnidadMedida')?.value || null,
    Fantasma: fantasmaValue === null ? null : fantasmaValue === 'Si',
    Categoria: categorias.length ? categorias.join(', ') : null,
    Comentarios: document.getElementById('solicitudComentarios')?.value.trim() || null
  };
}

window.guardarEdicionSolicitud = async function guardarEdicionSolicitud() {
  const status = document.getElementById('solicitudesStatus');

  if (!solicitudSeguimientoId || !solicitudActualData) {
    if (status) status.textContent = 'No se identifico la solicitud que se desea actualizar.';
    return;
  }

  if (!puedeAdministrarSolicitudPropia(solicitudActualData) && !puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  if (status) status.textContent = 'Guardando cambios...';

  const { error } = await supabaseClient
    .from('Solicitudes')
    .update(construirPayloadEdicionSolicitudBasica())
    .eq('id', solicitudSeguimientoId);

  if (error) {
    if (status) status.textContent = 'Error al guardar cambios: ' + error.message;
    return;
  }

  if (status) status.textContent = 'Solicitud actualizada correctamente.';
  mostrarPopupGuardado('Solicitud actualizada correctamente.', {
    onClose: () => renderSolicitudes()
  });
};

async function prepararGeneradorSolicitud(data) {
  nuevoCodigoState = {
    grupoNombre: '',
    grupoId: '',
    familiaNombre: '',
    idFamilia: '',
    tipoNombre: '',
    idTipo: '',
    claveTipo: '',
    materialNombre: '',
    idMaterial: '',
    nomenclaturaMaterial: ''
  };

  await cargarGruposNuevoCodigo();

  const grupoSelect = document.getElementById('nuevoCodigoGrupo');
  if (!grupoSelect || !data.Grupo) return;

  grupoSelect.value = data.Grupo;
  const grupoOption = grupoSelect.options[grupoSelect.selectedIndex];

  nuevoCodigoState.grupoNombre = grupoSelect.value;
  nuevoCodigoState.grupoId = grupoOption?.dataset.grupoId || '';

  await cargarFamiliasNuevoCodigo(nuevoCodigoState.grupoNombre);

  const familiaSelect = document.getElementById('nuevoCodigoFamilia');
  if (familiaSelect && data.Familia) {
    familiaSelect.value = data.Familia;
    const familiaOption = familiaSelect.options[familiaSelect.selectedIndex];
    nuevoCodigoState.familiaNombre = familiaSelect.value;
    nuevoCodigoState.idFamilia = familiaOption?.dataset.idFamilia || '';
  }

  if (esGrupoPTNuevoCodigo()) {
    limpiarMaterialesNuevoCodigo();
    await restaurarTipoPTSolicitud(data.Tipo);
  } else {
    await Promise.all([
      cargarTiposMPNuevoCodigo(nuevoCodigoState.familiaNombre),
      cargarMaterialesNuevoCodigo(nuevoCodigoState.grupoNombre)
    ]);

    restaurarSeleccionSolicitud('nuevoCodigoTipo', data.Tipo, option => {
      nuevoCodigoState.tipoNombre = option.value;
      nuevoCodigoState.idTipo = option.dataset.idTipo || '';
    });

    restaurarSeleccionSolicitud('nuevoCodigoMaterial', data.Material, option => {
      nuevoCodigoState.materialNombre = option.value;
      nuevoCodigoState.idMaterial = option.dataset.idMaterial || '';
      nuevoCodigoState.nomenclaturaMaterial = option.dataset.nomenclaturaMaterial || '';
    });
  }

  const codigo = String(data.Codigo || '').trim();
  const codigoGenerado = document.getElementById('nuevoCodigoGenerado');
  const consecutivo = document.getElementById('nuevoCodigoConsecutivo');

  if (codigoGenerado) codigoGenerado.textContent = codigo || '-';
  if (consecutivo && codigo) {
    consecutivo.value = codigo.slice(esGrupoPTNuevoCodigo() ? -3 : -4);
  }

  actualizarBotonPrincipalNuevoCodigo();
}

function restaurarSeleccionSolicitud(selectId, valor, onSelected) {
  const select = document.getElementById(selectId);
  if (!select || !valor) return;

  const valorNormalizado = normalizarTextoFlexible(valor);
  const option = Array.from(select.options).find(item => (
    normalizarTextoFlexible(item.value) === valorNormalizado
  ));

  select.value = option?.value || '';
  if (option && option.value) onSelected(option);
}

async function restaurarTipoPTSolicitud(tipo) {
  if (!tipo) return;

  const { data } = await supabaseClient
    .from('PT:Tipos')
    .select('"Clave","Tipos","Id"')
    .order('Id', { ascending: true });

  const tipoNormalizado = normalizarTextoFlexible(tipo);
  const coincidencia = (data || []).find(row => (
    normalizarTextoFlexible(row.Tipos) === tipoNormalizado
  ));

  if (coincidencia) seleccionarTipoDetectado(coincidencia);
}

window.guardarSeguimientoSolicitud = async function guardarSeguimientoSolicitud() {
  if (!puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  const status = document.getElementById('solicitudesStatus');
  const versionInput = document.getElementById('solicitudVersion');
  const revisionInput = document.getElementById('solicitudRevision');

  if (!solicitudSeguimientoId) {
    if (status) status.textContent = 'No se identifico la solicitud que se desea actualizar.';
    return;
  }

  const version = Number(versionInput?.value || 1);
  const revision = Number(revisionInput?.value || 1);

  if (
    !Number.isInteger(version) ||
    !Number.isInteger(revision) ||
    version < 1 ||
    revision < 1
  ) {
    if (status) {
      status.textContent = 'Version y Revision deben ser numeros enteros mayores o iguales a 1.';
    }
    return;
  }

  const clasificacion = document.querySelector(
    'input[name="clasificacionGeneral"]:checked'
  )?.value || null;

  const categorias = [];

  if (document.getElementById('categoriaInventario')?.checked) {
    categorias.push('Inventario');
  }

  if (document.getElementById('categoriaVenta')?.checked) {
    categorias.push('Venta');
  }

  if (document.getElementById('categoriaCompra')?.checked) {
    categorias.push('Compra');
  }

  const fantasmaValue = document.querySelector(
    'input[name="productoFantasma"]:checked'
  )?.value || null;

  const codigo = document.getElementById('nuevoCodigoGenerado')?.textContent.trim();
  const payload = {
    C_Extranjero: document.getElementById('codigoExtranjero')?.value.trim() || null,
    D_extranjero: document.getElementById('descripcionExtranjera')?.value.trim() || null,
    UM: document.getElementById('solicitudUnidadMedida')?.value || null,
    Fantasma: fantasmaValue === null ? null : fantasmaValue === 'Si',
    Categoria: categorias.length ? categorias.join(', ') : null,
    Clasificacion: clasificacion,
    Grupo: nuevoCodigoState.grupoNombre || null,
    Familia: nuevoCodigoState.familiaNombre || null,
    Tipo: nuevoCodigoState.tipoNombre || null,
    Material: nuevoCodigoState.materialNombre || null,
    Descripcion: document.getElementById('nuevoCodigoDescripcionVieja')?.value.trim() || null,
    Codigo: codigo && codigo !== '-' ? codigo : null,
    Version: version,
    Revision: revision,
    Comentarios: document.getElementById('solicitudComentarios')?.value.trim() || null
  };

  if (status) status.textContent = 'Guardando seguimiento...';

  const { error } = await supabaseClient
    .from('Solicitudes')
    .update(payload)
    .eq('id', solicitudSeguimientoId);

  if (error) {
    if (status) status.textContent = 'Error al guardar seguimiento: ' + error.message;
    return;
  }

  if (status) status.textContent = 'Cambios guardados correctamente.';
  mostrarPopupGuardado('Cambios guardados correctamente.', {
    onClose: () => showSection('bienvenida')
  });
};

// Cambio de estatus y comentario final de revision.
window.cambiarStatusSolicitud = async function cambiarStatusSolicitud() {
  if (!puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  const statusBox = document.getElementById('solicitudesStatus');
  const statusSelect = document.getElementById('solicitudStatusSeguimiento');
  const nuevoStatus = statusSelect?.value;

  if (!solicitudSeguimientoId || !nuevoStatus) {
    if (statusBox) statusBox.textContent = 'Selecciona un status valido.';
    return;
  }

  if (statusBox) statusBox.textContent = 'Actualizando status...';

  const cambiosStatus = { Status: nuevoStatus };

  const esCambio = esSolicitudCambio(solicitudActualData);
  const esNuevaAprobacion = nuevoStatus === 'Liberado' && (
    solicitudActualData?.Status !== 'Liberado' ||
    (esCambio
      ? !solicitudActualData?.Cambio_Fecha_Aprobacion
      : !solicitudActualData?.Fecha_Publicacion)
  );

  if (esNuevaAprobacion) {
    if (esCambio) {
      cambiosStatus.Cambio_Aprobado_Por = obtenerNombreUsuarioVisible();
      cambiosStatus.Cambio_Fecha_Aprobacion = obtenerFechaLocalSolicitud();
    } else {
      cambiosStatus.Fecha_Publicacion = obtenerFechaLocalSolicitud();
    }
  }

  const { error } = await supabaseClient
    .from('Solicitudes')
    .update(cambiosStatus)
    .eq('id', solicitudSeguimientoId);

  if (error) {
    if (
      statusBox &&
      String(error.message || '').includes('Motivo_Rechazo')
    ) {
      statusBox.textContent =
        'No se pudo guardar el rechazo: falta crear la columna Motivo_Rechazo en Supabase.';
    } else if (statusBox) {
      statusBox.textContent = 'Error al cambiar status: ' + error.message;
    }
    return;
  }

  if (statusBox) statusBox.textContent = `Status actualizado a ${nuevoStatus}.`;
  mostrarPopupGuardado(`Status actualizado a ${nuevoStatus}.`, {
    onClose: () => showSection('bienvenida')
  });
  if (solicitudActualData) {
    Object.assign(solicitudActualData, cambiosStatus);
  }

  if (cambiosStatus.Cambio_Aprobado_Por) {
    asignarValorSolicitud('cambioAprobadoPor', cambiosStatus.Cambio_Aprobado_Por);
    asignarValorSolicitud(
      'cambioFechaAprobacion',
      formatearFechaSolicitud(cambiosStatus.Cambio_Fecha_Aprobacion)
    );
  }
  actualizarBotonSubirSolicitud();
};

window.actualizarBotonSubirSolicitud = function actualizarBotonSubirSolicitud() {
  const boton = document.getElementById('btnSubirSolicitud');
  const status = document.getElementById('solicitudStatusSeguimiento')?.value;
  const codigo = document.getElementById('nuevoCodigoGenerado')?.textContent.trim();

  if (boton) {
    boton.disabled = status !== 'Liberado' || !codigo || codigo === '-';
  }
};

window.subirSolicitudBDGeneral = async function subirSolicitudBDGeneral() {
  if (!puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  const statusBox = document.getElementById('solicitudesStatus');
  const statusSolicitud = document.getElementById('solicitudStatusSeguimiento')?.value;
  const codigo = document.getElementById('nuevoCodigoGenerado')?.textContent.trim();
  const descripcion = document.getElementById('nuevoCodigoDescripcionVieja')?.value.trim();
  const version = Number(document.getElementById('solicitudVersion')?.value || 1);
  const revision = Number(document.getElementById('solicitudRevision')?.value || 1);

  if (statusSolicitud !== 'Liberado') {
    if (statusBox) statusBox.textContent = 'La solicitud debe estar en status Liberado antes de subirla.';
    return;
  }

  if (!codigo || codigo === '-' || !descripcion) {
    if (statusBox) statusBox.textContent = 'Genera el codigo y completa la descripcion antes de subir.';
    return;
  }

  if (!Number.isInteger(version) || !Number.isInteger(revision) || version < 1 || revision < 1) {
    if (statusBox) statusBox.textContent = 'Version y Revision deben ser enteros mayores o iguales a 1.';
    return;
  }

  if (statusBox) statusBox.textContent = 'Validando codigo en BD_General...';

  const { data: existente, error: errorConsulta } = await supabaseClient
    .from('BD_General')
    .select('"Id"')
    .eq('Codigo SAP', codigo)
    .limit(1);

  if (errorConsulta) {
    if (statusBox) statusBox.textContent = 'Error al validar el codigo: ' + errorConsulta.message;
    return;
  }

  if (existente && existente.length > 0) {
    if (statusBox) statusBox.textContent = 'El codigo ya existe en BD_General y no se puede duplicar.';
    return;
  }

  if (statusBox) statusBox.textContent = 'Subiendo codigo a BD_General...';

  const responsable = obtenerNombreUsuarioVisible();
  const { error } = await supabaseClient
    .from('BD_General')
    .insert({
      'Codigo Pixvs': null,
      'Nombre Pixvs': descripcion,
      'Codigo SAP': codigo,
      'Nombre SAP': construirDescripcionSAPNuevoCodigo(descripcion),
      'Version SAP': version,
      'Revision SAP': revision,
      'Status': '2 - Local',
      'Fecha de ultimo Cambio': new Date().toISOString(),
      'Responsable': responsable
    });

  if (error) {
    if (statusBox) statusBox.textContent = 'Error al subir a BD_General: ' + error.message;
    return;
  }

  const boton = document.getElementById('btnSubirSolicitud');
  if (boton) boton.disabled = true;

  if (statusBox) statusBox.textContent = 'Codigo subido correctamente a BD_General.';
};

// Generacion e impresion del PDF de solicitud.
window.descargarSolicitudPDF = async function descargarSolicitudPDF() {
  if (!puedeDarSeguimientoSolicitudes()) {
    mostrarAccesoDenegado();
    return;
  }

  const categorias = [];
  if (document.getElementById('categoriaInventario')?.checked) categorias.push('Inventario');
  if (document.getElementById('categoriaVenta')?.checked) categorias.push('Venta');
  if (document.getElementById('categoriaCompra')?.checked) categorias.push('Compra');

  const fantasmaValor = document.querySelector(
    'input[name="productoFantasma"]:checked'
  )?.value;

  const datos = {
    ...(solicitudActualData || {}),
    Folio: document.getElementById('solicitudFolio')?.value,
    Fecha: document.getElementById('solicitudFecha')?.value,
    Solicitante: document.getElementById('solicitudSolicitante')?.value,
    C_Extranjero: document.getElementById('codigoExtranjero')?.value,
    D_extranjero: document.getElementById('descripcionExtranjera')?.value,
    UM: document.getElementById('solicitudUnidadMedida')?.value,
    Fantasma: fantasmaValor == null ? null : fantasmaValor === 'Si',
    Categoria: categorias.join(', '),
    Clasificacion: document.querySelector(
      'input[name="clasificacionGeneral"]:checked'
    )?.value || '',
    Grupo: nuevoCodigoState.grupoNombre,
    Familia: nuevoCodigoState.familiaNombre,
    Tipo: nuevoCodigoState.tipoNombre,
    Material: nuevoCodigoState.materialNombre,
    Consecutivo: document.getElementById('nuevoCodigoConsecutivo')?.value,
    Descripcion: document.getElementById('nuevoCodigoDescripcionVieja')?.value,
    Codigo: document.getElementById('nuevoCodigoGenerado')?.textContent.trim(),
    Status: document.getElementById('solicitudStatusSeguimiento')?.value
  };

  await generarDocumentoSolicitudPDF(datos);
};

window.imprimirSolicitudPDF = async function imprimirSolicitudPDF(id) {
  if (!usuarioPuedeEnSolicitudes(2)) {
    mostrarAccesoDenegado();
    return;
  }

  const statusBox = document.getElementById('solicitudesStatus');
  if (statusBox) statusBox.textContent = 'Consultando solicitud...';

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (statusBox) statusBox.textContent = 'Error al consultar solicitud: ' + error.message;
    return;
  }

  await generarDocumentoSolicitudPDF(data);
};

async function generarDocumentoSolicitudPDF(datos) {
  const statusBox = document.getElementById('solicitudesStatus');

  if (!window.PDFLib) {
    if (statusBox) statusBox.textContent = 'No se pudo cargar el generador de PDF.';
    return;
  }

  try {
    if (statusBox) statusBox.textContent = 'Generando PDF...';

    let articulo = datos;
    let cambio = null;

    if (esSolicitudCambio(datos)) {
      cambio = datos;

      const { data: padre, error: errorPadre } = await supabaseClient
        .from('Solicitudes')
        .select('*')
        .eq('Folio', datos.Folio_Padre)
        .maybeSingle();

      if (errorPadre) throw errorPadre;
      if (!padre) throw new Error('No se encontro la solicitud SOL relacionada.');
      articulo = padre;
    } else if (datos.Folio) {
      const { data: ultimoCambio, error: errorCambio } = await supabaseClient
        .from('Solicitudes')
        .select('*')
        .eq('Folio_Padre', datos.Folio)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorCambio) throw errorCambio;
      cambio = ultimoCambio || null;
    }

    const response = await fetch('./assets/solicitud-articulo-template.pdf');
    if (!response.ok) throw new Error('No se encontro la plantilla PDF.');

    const templateBytes = await response.arrayBuffer();
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const color = rgb(0, 0, 0);
    const texto = value => String(value || '').replace(/\s+/g, ' ').trim();

    const ajustar = (value, fuente, size, maxWidth) => {
      let contenido = texto(value);
      let fontSize = size;

      while (contenido && fuente.widthOfTextAtSize(contenido, fontSize) > maxWidth && fontSize > 6) {
        fontSize -= 0.25;
      }

      while (contenido && fuente.widthOfTextAtSize(contenido, fontSize) > maxWidth) {
        contenido = contenido.slice(0, -1);
      }

      return { contenido, fontSize };
    };

    const escribir = (value, x, y, maxWidth, size = 8, fuente = font) => {
      const { contenido, fontSize } = ajustar(value, fuente, size, maxWidth);
      if (contenido) page.drawText(contenido, { x, y, size: fontSize, font: fuente, color });
    };

    const marcar = (condicion, x, y) => {
      if (condicion) page.drawText('X', { x, y, size: 9, font: bold, color });
    };

    const escribirLineas = (value, x, y, maxWidth, maxLines = 3, size = 8) => {
      const palabras = texto(value).split(' ').filter(Boolean);
      const lineas = [];
      let linea = '';

      palabras.forEach(palabra => {
        const candidata = linea ? `${linea} ${palabra}` : palabra;

        if (font.widthOfTextAtSize(candidata, size) <= maxWidth) {
          linea = candidata;
        } else {
          if (linea) lineas.push(linea);
          linea = palabra;
        }
      });

      if (linea) lineas.push(linea);

      lineas.slice(0, maxLines).forEach((contenido, index) => {
        escribir(contenido, x, y - (index * 13), maxWidth, size);
      });
    };

    const categorias = texto(articulo.Categoria).toLowerCase();
    const codigo = texto(articulo.Codigo) === '-' ? '' : texto(articulo.Codigo);
    const esPT = texto(articulo.Grupo).toUpperCase().startsWith('P.T.');
    const consecutivo = texto(articulo.Consecutivo) || (
      codigo ? codigo.slice(esPT ? -3 : -4) : ''
    );

    escribir(articulo.Folio, 114, 754, 58);
    escribir(formatearFechaSolicitud(articulo.Fecha), 236, 754, 58);
    escribir(articulo.Solicitante, 357, 754, 58);
    escribir(articulo.C_Extranjero, 56, 699, 178);
    escribir(articulo.D_extranjero, 297, 699, 240);
    escribir(articulo.UM, 176, 662, 58);

    marcar(articulo.Fantasma === true, 80, 615);
    marcar(articulo.Fantasma === false, 80, 602);
    marcar(categorias.includes('inventario'), 322, 660);
    marcar(categorias.includes('venta'), 322, 634);
    marcar(categorias.includes('compra'), 322, 608);
    marcar(articulo.Clasificacion === 'ADN-5', 80, 558);
    marcar(articulo.Clasificacion === 'ADN-4', 80, 533);

    escribir(articulo.Grupo, 114, 501, 60);
    escribir(articulo.Familia, 114, 488, 60);
    escribir(articulo.Tipo, 114, 476, 60);
    escribir(articulo.Material, 114, 463, 60);
    escribir(consecutivo, 114, 450, 60);
    escribir(articulo.Descripcion, 56, 409, 480, 8);
    escribir(codigo, 236, 371, 120, 9, bold);

    if (articulo.Status === 'Rechazo') {
      escribir('RECHAZO', 236, 359, 120, 8, bold);
    } else if (articulo.Status === 'Liberado' && articulo.Fecha_Publicacion) {
      escribir(formatearFechaSolicitud(articulo.Fecha_Publicacion), 236, 359, 120, 8, bold);
    }

    if (cambio) {
      const seccionesCambio = texto(cambio.Cambio_Secciones).toLowerCase();

      marcar(cambio.Cambio_Estatus_Requerido === 'Aprobado', 202, 314);
      marcar(cambio.Cambio_Estatus_Requerido === 'Bloqueado', 202, 301);
      marcar(cambio.Cambio_Estatus_Requerido === 'Revision', 202, 288);
      marcar(seccionesCambio.includes('ficha tecnica'), 202, 275);
      marcar(seccionesCambio.includes('plano / referencia'), 202, 262);
      marcar(seccionesCambio.includes('bom inicial'), 202, 249);
      escribir(cambio.Cambio_UM, 176, 227, 58);
      escribirLineas(cambio.Cambio_Motivo, 56, 184, 480, 3, 8);
      escribir(cambio.Cambio_Aprobado_Por, 176, 121, 118, 8);
      if (cambio.Cambio_Fecha_Aprobacion) {
        escribir(
          formatearFechaSolicitud(cambio.Cambio_Fecha_Aprobacion),
          176,
          108,
          118,
          8
        );
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const folioArchivo = cambio
      ? `${texto(articulo.Folio)}_${texto(cambio.Folio)}`
      : texto(articulo.Folio) || 'sin-folio';

    link.href = url;
    link.download = `Solicitud_${folioArchivo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (statusBox) statusBox.textContent = 'PDF descargado correctamente.';
  } catch (error) {
    if (statusBox) statusBox.textContent = 'Error al generar PDF: ' + error.message;
    console.error(error);
  }
}

function esSolicitudCambio(datos) {
  return datos?.Tipo_Solicitud === 'Cambio' ||
    String(datos?.Folio || '').startsWith('CAM-');
}

function esSolicitudGenerica(datos) {
  return Boolean(obtenerClaveTipoSolicitudGenerica(datos?.Tipo_Solicitud));
}

// Flujo historico de solicitud de cambio; se conserva por compatibilidad.
window.solicitarCambio = async function solicitarCambio(id) {
  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  viewer.innerHTML = '<div class="status-box">Cargando articulo...</div>';

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    viewer.innerHTML = `<div class="status-box">Error al consultar articulo: ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (esSolicitudCambio(data)) {
    viewer.innerHTML = '<div class="status-box">Solo se pueden solicitar cambios sobre folios SOL.</div>';
    return;
  }

  solicitudCambioPadre = data;
  renderFormularioSolicitudCambio(data, null);
};

function renderDetalleSolicitudCambio(cambio) {
  solicitudSeguimientoId = cambio.id;
  solicitudActualData = cambio;
  solicitudCambioPadre = null;
  renderFormularioSolicitudCambio(null, cambio);
}

function renderFormularioSolicitudCambio(padre, cambio, opciones = {}) {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  const esConsulta = Boolean(cambio);
  const esEdicion = Boolean(opciones.edicion && cambio);
  const deshabilitado = esConsulta && !esEdicion ? 'disabled' : '';
  const folioPadre = cambio?.Folio_Padre || padre?.Folio || '';
  const solicitante = cambio?.Solicitante || obtenerNombreUsuarioVisible();
  const fecha = cambio?.Fecha || obtenerFechaLocalSolicitud();
  const secciones = String(cambio?.Cambio_Secciones || '').split(',').map(item => item.trim());
  const estatusRequerido = cambio?.Cambio_Estatus_Requerido || '';

  viewer.innerHTML = `
    <div class="catalog-wrapper solicitudes-wrapper">
      <div class="solicitud-paper cambio-paper">
        <div class="solicitud-paper-header">
          <div>
            <h2>${esEdicion ? 'Editar Solicitud de Cambio' : esConsulta ? 'Seguimiento de Solicitud de Cambio' : 'Solicitud de Cambio de Articulo'}</h2>
            <p>Complemento del folio ${escapeHtml(folioPadre)}.</p>
          </div>
          <button type="button" onclick="renderSolicitudes()">Regresar</button>
        </div>

        <div class="solicitud-row four-cols">
          <div class="paper-field">
            <label for="cambioFolio">Folio de Cambio</label>
            <input id="cambioFolio" value="${escapeHtml(cambio?.Folio || '')}" placeholder="Automatico" disabled>
          </div>
          <div class="paper-field">
            <label for="cambioFolioPadre">Folio Padre</label>
            <input id="cambioFolioPadre" value="${escapeHtml(folioPadre)}" disabled>
          </div>
          <div class="paper-field">
            <label for="cambioFecha">Fecha</label>
            <input id="cambioFecha" type="date" value="${escapeHtml(fecha)}" disabled>
          </div>
          <div class="paper-field">
            <label for="cambioSolicitante">Solicitante</label>
            <input id="cambioSolicitante" value="${escapeHtml(solicitante)}" disabled>
          </div>
        </div>

        <div class="paper-section cambio-captura">
          <div class="paper-section-title">3. Control de Cambios</div>

          <div class="cambio-form-grid">
            <div class="cambio-option-group">
              <strong>Estatus Requerido</strong>
              ${['Aprobado', 'Bloqueado', 'Revision'].map(valor => `
                <label>
                  <input type="radio" name="cambioEstatusRequerido" value="${valor}"
                    ${estatusRequerido === valor ? 'checked' : ''} ${deshabilitado}>
                  ${valor}
                </label>
              `).join('')}
            </div>

            <div class="cambio-option-group">
              <strong>Cambio hecho en</strong>
              ${[
                'Ficha Tecnica / Norma',
                'Plano / Referencia Visual',
                'BOM Inicial (Solo Productos P.T.)'
              ].map(valor => `
                <label>
                  <input type="checkbox" class="cambio-seccion" value="${valor}"
                    ${secciones.includes(valor) ? 'checked' : ''} ${deshabilitado}>
                  ${valor}
                </label>
              `).join('')}
            </div>
          </div>

          <div class="paper-field cambio-um-field">
            <label for="cambioUnidadMedida">Unidad de Medida (UM)</label>
            <select id="cambioUnidadMedida" ${deshabilitado}>
              ${crearOpcionesUnidadMedida()}
            </select>
          </div>

          <div class="paper-field">
            <label for="cambioMotivo">Motivo de Cambio</label>
            <textarea id="cambioMotivo" rows="5" ${deshabilitado}>${escapeHtml(cambio?.Cambio_Motivo || '')}</textarea>
          </div>

          <div class="solicitud-row two-cols cambio-approval-row">
            <div class="paper-field">
              <label for="cambioAprobadoPor">Aprobado por</label>
              <input id="cambioAprobadoPor" value="${escapeHtml(cambio?.Cambio_Aprobado_Por || '')}" disabled>
            </div>
            <div class="paper-field">
              <label for="cambioFechaAprobacion">Fecha de Aprobacion</label>
              <input id="cambioFechaAprobacion" value="${escapeHtml(
                cambio?.Cambio_Fecha_Aprobacion
                  ? formatearFechaSolicitud(cambio.Cambio_Fecha_Aprobacion)
                  : ''
              )}" disabled>
            </div>
          </div>
        </div>

        <div class="solicitud-actions">
          ${esConsulta && esEdicion ? `
            <button type="button" onclick="guardarEdicionSolicitudCambio()">Guardar cambios</button>
            <button type="button" onclick="renderSolicitudes()">Cancelar</button>
          ` : esConsulta ? `
            <label class="solicitud-status-field" for="solicitudStatusSeguimiento">
              <span>Status</span>
              <select id="solicitudStatusSeguimiento">
                <option value="Seguimiento">Seguimiento</option>
                <option value="Rechazo">Rechazo</option>
                <option value="Liberado">Liberado</option>
              </select>
            </label>
            <button type="button" onclick="cambiarStatusSolicitud()">Cambiar status</button>
            <button type="button" onclick="descargarSolicitudActualPDF()">Descargar PDF</button>
          ` : `
            <button id="btnGuardarCambio" type="button" onclick="guardarSolicitudCambio()">
              Guardar solicitud de cambio
            </button>
          `}
        </div>

        <div id="solicitudesStatus" class="status-box">
          ${esEdicion
            ? `Editando solicitud de cambio ${escapeHtml(cambio.Folio || '')}.`
            : esConsulta
            ? cambio.Status === 'Rechazo' && cambio.Motivo_Rechazo
              ? `Solicitud rechazada. Motivo: ${escapeHtml(cambio.Motivo_Rechazo)}`
              : 'Solicitud de cambio abierta en modo de seguimiento.'
            : 'Completa los datos del cambio.'}
        </div>
      </div>
    </div>
  `;

  asignarValorSolicitud('cambioUnidadMedida', cambio?.Cambio_UM || padre?.UM || '');

  if (esConsulta && !esEdicion) {
    asignarValorSolicitud('solicitudStatusSeguimiento', cambio.Status || 'Seguimiento');
  }
}

window.guardarSolicitudCambio = async function guardarSolicitudCambio() {
  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  const status = document.getElementById('solicitudesStatus');
  const estatusRequerido = document.querySelector(
    'input[name="cambioEstatusRequerido"]:checked'
  )?.value || '';
  const secciones = Array.from(document.querySelectorAll('.cambio-seccion:checked'))
    .map(input => input.value);
  const unidad = document.getElementById('cambioUnidadMedida')?.value || '';
  const motivo = document.getElementById('cambioMotivo')?.value.trim() || '';

  if (!solicitudCambioPadre?.Folio) {
    if (status) status.textContent = 'No se encontro el folio padre.';
    return;
  }

  if (!estatusRequerido || secciones.length === 0 || !unidad || !motivo) {
    if (status) status.textContent = 'Completa estatus, cambio realizado, unidad y motivo.';
    return;
  }

  if (status) status.textContent = 'Guardando solicitud de cambio...';

  const payload = {
    Tipo_Solicitud: 'Cambio',
    Folio_Padre: solicitudCambioPadre.Folio,
    Fecha: obtenerFechaLocalSolicitud(),
    Solicitante: obtenerNombreUsuarioVisible(),
    D_extranjero: motivo,
    UM: unidad,
    Status: 'Seguimiento',
    Cambio_Estatus_Requerido: estatusRequerido,
    Cambio_Secciones: secciones.join(', '),
    Cambio_UM: unidad,
    Cambio_Motivo: motivo,
    Version: 1,
    Revision: 1
  };

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (status) status.textContent = 'Error al guardar solicitud de cambio: ' + error.message;
    return;
  }

  asignarValorSolicitud('cambioFolio', data.Folio);
  document.querySelectorAll('.cambio-captura input, .cambio-captura select, .cambio-captura textarea')
    .forEach(control => { control.disabled = true; });
  const boton = document.getElementById('btnGuardarCambio');
  if (boton) boton.disabled = true;
  if (status) status.textContent = `Solicitud de cambio guardada. Folio: ${data.Folio}`;

  mostrarPopupGuardado(
    `Solicitud de cambio guardada correctamente. Folio: ${data.Folio}.`,
    {
      titulo: 'Solicitud guardada',
      onClose: () => showSection('bienvenida')
    }
  );
};

window.guardarEdicionSolicitudCambio = async function guardarEdicionSolicitudCambio() {
  const status = document.getElementById('solicitudesStatus');
  const estatusRequerido = document.querySelector(
    'input[name="cambioEstatusRequerido"]:checked'
  )?.value || '';
  const secciones = Array.from(document.querySelectorAll('.cambio-seccion:checked'))
    .map(input => input.value);
  const unidad = document.getElementById('cambioUnidadMedida')?.value || '';
  const motivo = document.getElementById('cambioMotivo')?.value.trim() || '';

  if (!solicitudSeguimientoId || !solicitudActualData) {
    if (status) status.textContent = 'No se identifico la solicitud que se desea actualizar.';
    return;
  }

  if (!puedeAdministrarSolicitudPropia(solicitudActualData)) {
    mostrarAccesoDenegado();
    return;
  }

  if (!estatusRequerido || secciones.length === 0 || !unidad || !motivo) {
    if (status) status.textContent = 'Completa estatus, cambio realizado, unidad y motivo.';
    return;
  }

  if (status) status.textContent = 'Guardando cambios...';

  const payload = {
    D_extranjero: motivo,
    UM: unidad,
    Cambio_Estatus_Requerido: estatusRequerido,
    Cambio_Secciones: secciones.join(', '),
    Cambio_UM: unidad,
    Cambio_Motivo: motivo
  };

  const { error } = await supabaseClient
    .from('Solicitudes')
    .update(payload)
    .eq('id', solicitudSeguimientoId);

  if (error) {
    if (status) status.textContent = 'Error al guardar cambios: ' + error.message;
    return;
  }

  if (status) status.textContent = 'Solicitud de cambio actualizada correctamente.';
  mostrarPopupGuardado('Solicitud de cambio actualizada correctamente.', {
    onClose: () => renderSolicitudes()
  });
};

window.descargarSolicitudActualPDF = async function descargarSolicitudActualPDF() {
  if (!puedeDarSeguimientoSolicitudes() || !solicitudActualData) {
    mostrarAccesoDenegado();
    return;
  }

  await generarDocumentoSolicitudPDF(solicitudActualData);
};

function crearBloqueArticuloSolicitud(index) {
  const esPrimero = index === 1;
  const codigoId = esPrimero ? 'codigoExtranjero' : `codigoExtranjero-${index}`;
  const descripcionId = esPrimero ? 'descripcionExtranjera' : `descripcionExtranjera-${index}`;
  const unidadId = esPrimero ? 'solicitudUnidadMedida' : `solicitudUnidadMedida-${index}`;
  const inventarioId = esPrimero ? 'categoriaInventario' : `categoriaInventario-${index}`;
  const ventaId = esPrimero ? 'categoriaVenta' : `categoriaVenta-${index}`;
  const compraId = esPrimero ? 'categoriaCompra' : `categoriaCompra-${index}`;
  const comentariosId = esPrimero ? 'solicitudComentarios' : `solicitudComentarios-${index}`;
  const fantasmaName = esPrimero ? 'productoFantasma' : `productoFantasma-${index}`;

  return `
    <div class="paper-section solicitud-articulo" data-articulo-index="${index}">
      <div class="paper-section-title solicitud-articulo-title">
        <span>1. Datos de Nuevo Articulo - Articulo ${index}</span>
        ${esPrimero ? '' : `
          <button type="button" onclick="eliminarArticuloSolicitud(${index})">
            Eliminar articulo
          </button>
        `}
      </div>

      <div class="pdf-two-columns">
        <div class="pdf-column">
          <div class="paper-field underline-field">
            <label for="${codigoId}">Codigo Extranjero</label>
            <input id="${codigoId}" class="solicitud-codigo-extranjero" type="text">
          </div>

          <div class="subsection-title">Datos Generales</div>

          <div class="paper-field underline-field short-field">
            <label for="${unidadId}">Unidad de Medida (UM)</label>
            <select
              id="${unidadId}"
              class="solicitud-unidad-medida"
            >
              ${crearOpcionesUnidadMedida()}
            </select>
          </div>

          <div class="subsection-title">Es un producto fantasma? (Solo ADN-4):</div>

          <div class="pdf-check-options small-options">
            <label>
              <input class="solicitud-fantasma" type="radio" name="${fantasmaName}" value="Si">
              Si
            </label>

            <label>
              <input class="solicitud-fantasma" type="radio" name="${fantasmaName}" value="No">
              No
            </label>
          </div>
        </div>

        <div class="pdf-column">
          <div class="paper-field underline-field">
            <label for="${descripcionId}">Descripcion Extranjera</label>
            <input id="${descripcionId}" class="solicitud-descripcion-extranjera" type="text">
          </div>

          <div class="subsection-title">Categorias del articulo</div>

          <div class="pdf-check-options category-options">
            <label>
              <input id="${inventarioId}" class="solicitud-categoria-inventario" type="checkbox">
              <span><strong>Articulo de Inventario:</strong> Articulo capaz de guardarse fisicamente.</span>
            </label>

            <label>
              <input id="${ventaId}" class="solicitud-categoria-venta" type="checkbox">
              <span><strong>Articulo de Venta:</strong> Articulo para venta.</span>
            </label>

            <label>
              <input id="${compraId}" class="solicitud-categoria-compra" type="checkbox">
              <span><strong>Articulo de Compra:</strong> Articulo comprado a un proveedor.</span>
            </label>
          </div>
        </div>
      </div>

      <div class="paper-field solicitud-comentarios-field">
        <label for="${comentariosId}">Comentarios</label>
        <textarea
          id="${comentariosId}"
          class="solicitud-comentarios"
          rows="3"
          maxlength="2000"
          placeholder="Agrega observaciones o informacion adicional para esta solicitud"
        ></textarea>
        <span class="solicitud-comentarios-ayuda">Maximo 2,000 caracteres.</span>
      </div>
    </div>
  `;
}

// Selector de nueva solicitud y formatos por tipo.
window.mostrarNuevaSolicitud = function mostrarNuevaSolicitud() {
  reiniciarBloqueoGuardadoSolicitud();

  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  viewer.innerHTML = `
    <div class="catalog-wrapper solicitudes-wrapper">
      <div class="solicitud-paper-header">
        <div>
          <h2>Nueva solicitud</h2>
          <p>Selecciona el tipo de solicitud para cargar el formato correspondiente.</p>
        </div>

        <button type="button" onclick="renderSolicitudes()">Regresar</button>
      </div>

      <div class="solicitud-selector-layout">
        <aside class="solicitud-selector-sidebar">
          <label class="solicitudes-filter" for="tipoNuevaSolicitud">
            <span>Tipo de solicitud</span>
            <select id="tipoNuevaSolicitud" onchange="cambiarTipoNuevaSolicitud()">
              <option value="">Selecciona una opcion</option>
              <option value="alta_producto">Alta de Producto</option>
              <option value="baja_articulos">Baja de articulos</option>
              <option value="modificacion_articulos">Modificacion de Articulos</option>
              <option value="alta_ct_cr">Alta de CT y CR</option>
              <option value="modificacion_ct">Modificacion de Centros de Trabajo</option>
            </select>
          </label>

          <div class="status-box solicitud-selector-help">
            Elige una opcion para ver los datos requeridos.
          </div>
        </aside>

        <section id="solicitudTipoContenido" class="solicitud-selector-content"></section>
      </div>
    </div>
  `;
};

window.cambiarTipoNuevaSolicitud = function cambiarTipoNuevaSolicitud() {
  const tipo = document.getElementById('tipoNuevaSolicitud')?.value || '';
  const contenido = document.getElementById('solicitudTipoContenido');

  if (!contenido) return;

  if (tipo === 'alta_producto') {
    crearSolicitud({ integrado: true, destinoId: 'solicitudTipoContenido' });
    return;
  }

  if (SOLICITUD_TIPOS_NUEVOS[tipo]) {
    renderFormularioSolicitudGenerica(tipo);
    return;
  }

  contenido.innerHTML = '';
};

// Formatos genericos: baja, modificacion y centros de trabajo.
function renderFormularioSolicitudGenerica(tipo, data = null, opciones = {}) {
  const contenido = document.getElementById(opciones.destinoId || 'solicitudTipoContenido');
  if (!contenido) return;

  const titulo = SOLICITUD_TIPOS_NUEVOS[tipo] || data?.Tipo_Solicitud || 'Solicitud';
  const esEdicion = Boolean(opciones.edicion && data?.id);
  const soloLectura = Boolean(opciones.soloLectura);
  const comentarioSeguimiento = Boolean(opciones.comentarioSeguimiento);
  const bloquearCaptura = soloLectura || esEdicion;
  const disabled = bloquearCaptura ? 'disabled' : '';
  const readOnly = bloquearCaptura ? 'readonly' : '';

  contenido.innerHTML = `
    <div class="solicitud-paper solicitud-generica-paper">
      <div class="solicitud-paper-header">
        <div>
          <h2>${escapeHtml(titulo)}</h2>
        </div>

        <button type="button" onclick="${opciones.integrado === false ? 'renderSolicitudes()' : 'mostrarNuevaSolicitud()'}">
          ${opciones.integrado === false ? 'Regresar' : 'Cambiar tipo'}
        </button>
      </div>

      <div class="solicitud-row three-cols">
        <div class="paper-field">
          <label for="solicitudFolio">Folio</label>
          <input id="solicitudFolio" type="text" value="${escapeHtml(data?.Folio || '')}" placeholder="Automatico" disabled>
        </div>

        <div class="paper-field">
          <label for="solicitudFecha">Fecha</label>
          <input id="solicitudFecha" type="date" value="${escapeHtml(data?.Fecha || new Date().toISOString().slice(0, 10))}" disabled>
        </div>

        <div class="paper-field">
          <label for="solicitudSolicitante">Solicitante</label>
          <input id="solicitudSolicitante" type="text" value="${escapeHtml(data?.Solicitante || obtenerNombreUsuarioVisible())}" disabled>
        </div>
      </div>

      ${renderCamposSolicitudGenerica(tipo, data, {
        disabled,
        readOnly,
        ocultarComentario: false
      })}

      ${esEdicion || comentarioSeguimiento
        ? renderComentarioRevisionSolicitudGenerica(data?.Comentario_Revision || '')
        : ''}

      ${soloLectura ? '' : `
        <div class="solicitud-actions">
          <button type="button" onclick="${esEdicion ? 'guardarEdicionSolicitudGenerica()' : `guardarSolicitudGenerica('${tipo}')`}">
            ${esEdicion ? 'Guardar comentario' : 'Guardar solicitud'}
          </button>
          <button type="button" onclick="renderSolicitudes()">Cancelar</button>
        </div>
      `}

      <div id="solicitudesStatus" class="status-box">
        ${comentarioSeguimiento
          ? 'Agrega o actualiza el comentario de revision.'
          : soloLectura ? 'Solicitud abierta en modo de consulta.' : esEdicion ? 'Agrega o actualiza el comentario de revision.' : 'Completa el formato para registrar la solicitud.'}
      </div>
    </div>
  `;
}

function renderCamposSolicitudGenerica(tipo, data = null, opciones = {}) {
  const disabled = opciones.disabled || '';
  const readOnly = opciones.readOnly || '';
  const codigo = escapeHtml(data?.Solicitud_Codigo || data?.C_Extranjero || '');
  const nombre = escapeHtml(data?.Solicitud_Nombre || data?.D_extranjero || '');
  const comentario = escapeHtml(data?.Comentarios || '');
  const categorias = String(data?.Solicitud_Categorias || '').split(',').map(item => item.trim());
  const cambios = String(data?.Solicitud_Cambio_A_Hacer || '').split(',').map(item => item.trim());
  const comentarioHtml = opciones.ocultarComentario
    ? ''
    : renderComentarioSolicitudGenerica(comentario, disabled, readOnly);

  if (tipo === 'baja_articulos') {
    return `
      <div class="solicitud-row two-cols">
        ${renderCampoTextoSolicitud('solicitudCodigoGenerico', 'Codigo', codigo, disabled, readOnly)}
        ${renderCampoTextoSolicitud('solicitudNombreGenerico', 'Nombre', nombre, disabled, readOnly)}
      </div>

      <div class="paper-section">
        <div class="paper-section-title">Validacion</div>
        <div class="paper-options">
          <label>
            <input id="solicitudSapBeas" type="checkbox" ${data?.Solicitud_SAP_BEAS ? 'checked' : ''} ${disabled}>
            <span>Esta en SAP B1 / BEAS</span>
          </label>
        </div>
      </div>

      ${comentarioHtml}
    `;
  }

  if (tipo === 'modificacion_articulos') {
    return `
      <div class="solicitud-row two-cols">
        ${renderCampoTextoSolicitud('solicitudCodigoGenerico', 'Codigo', codigo, disabled, readOnly)}
        ${renderCampoTextoSolicitud('solicitudNombreGenerico', 'Nombre', nombre, disabled, readOnly)}
      </div>

      <div class="solicitud-row two-cols">
        <div class="paper-field">
          <label for="solicitudCambioVersionRevision">Cambio de Version o Revision</label>
          <select id="solicitudCambioVersionRevision" ${disabled}>
            <option value="">Selecciona una opcion</option>
            ${['Version', 'Revision', 'Version y Revision'].map(opcion => `
              <option value="${opcion}" ${data?.Solicitud_Cambio_Version_Revision === opcion ? 'selected' : ''}>${opcion}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="paper-section">
        <div class="paper-section-title">Categorias del articulo</div>
        <div class="paper-options">
          ${renderCheckSolicitud('solicitudCategoriaUbicacion', 'Cambio de Ubicacion.', categorias, disabled)}
          ${renderCheckSolicitud('solicitudCategoriaBoom', 'Cambio en su BOOM List o diseno.', categorias, disabled)}
          ${renderCheckSolicitud('solicitudCategoriaEstetico', 'Cambio Estetico.', categorias, disabled)}
        </div>
      </div>

      ${comentarioHtml}
    `;
  }

  if (tipo === 'alta_ct_cr') {
    return `
      <div class="solicitud-row two-cols">
        ${renderCampoTextoSolicitud('solicitudCodigoGenerico', 'Codigo del CT o CR', codigo, disabled, readOnly)}
        ${renderCampoTextoSolicitud('solicitudNombreGenerico', 'Nombre del CT o CR', nombre, disabled, readOnly)}
      </div>

      <div class="solicitud-row three-cols">
        ${renderCampoTextoSolicitud('solicitudArea', 'Area Perteneciente', escapeHtml(data?.Solicitud_Area || ''), disabled, readOnly)}
        ${renderCampoTextoSolicitud('solicitudRecursos', 'Si es CT, cuales son sus Recursos?', escapeHtml(data?.Solicitud_Recursos || ''), disabled, readOnly)}
        ${renderCampoTextoSolicitud('solicitudCentroTrabajo', 'Si es CR, a que Centro de Trabajo pertenece?', escapeHtml(data?.Solicitud_Centro_Trabajo || ''), disabled, readOnly)}
      </div>

      ${comentarioHtml}
    `;
  }

  return `
    <div class="solicitud-row two-cols">
      ${renderCampoTextoSolicitud('solicitudCodigoGenerico', 'Codigo del CT o CR', codigo, disabled, readOnly)}
      ${renderCampoTextoSolicitud('solicitudNombreGenerico', 'Nombre del CT o CR', nombre, disabled, readOnly)}
    </div>

    <div class="paper-section">
      <div class="paper-section-title">Cambio a hacer</div>
      <div class="paper-options">
        ${renderCheckSolicitud('solicitudCambioCodigo', 'Codigo', cambios, disabled)}
        ${renderCheckSolicitud('solicitudCambioNombre', 'Nombre', cambios, disabled)}
        ${renderCheckSolicitud('solicitudCambioArea', 'Area', cambios, disabled)}
        ${renderCheckSolicitud('solicitudCambioNuevaArea', 'Asignar a una nueva Area', cambios, disabled)}
        ${renderCheckSolicitud('solicitudCambioRecursoCT', 'Asignar Recurso a Centro de Trabajo', cambios, disabled)}
      </div>
    </div>

    ${comentarioHtml}
  `;
}

function renderCampoTextoSolicitud(id, label, value, disabled = '', readOnly = '') {
  return `
    <div class="paper-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" type="text" value="${value}" ${disabled} ${readOnly}>
    </div>
  `;
}

function renderComentarioSolicitudGenerica(value, disabled = '', readOnly = '') {
  return `
    <div class="paper-field solicitud-comentarios-field">
      <label for="solicitudComentarios">Comentario</label>
      <textarea id="solicitudComentarios" rows="4" maxlength="2000" ${disabled} ${readOnly}>${value}</textarea>
      <span class="solicitud-comentarios-ayuda">Maximo 2,000 caracteres.</span>
    </div>
  `;
}

function renderComentarioRevisionSolicitudGenerica(value = '') {
  return `
    <div class="paper-section solicitud-comentario-edicion">
      <div class="paper-section-title">Comentario de revision</div>
      <div class="paper-field">
        <label for="solicitudComentarioRevision">Comentario Final</label>
        <textarea
          id="solicitudComentarioRevision"
          rows="4"
          maxlength="2000"
          placeholder="Agrega un comentario de revision para esta solicitud"
        >${escapeHtml(value)}</textarea>
        <span class="solicitud-comentarios-ayuda">Maximo 2,000 caracteres.</span>
      </div>
    </div>
  `;
}

function renderCheckSolicitud(id, value, seleccionados = [], disabled = '') {
  const checked = seleccionados.includes(value) ? 'checked' : '';
  return `
    <label>
      <input id="${id}" class="solicitud-check-lista" type="checkbox" value="${escapeHtml(value)}" ${checked} ${disabled}>
      <span>${escapeHtml(value)}</span>
    </label>
  `;
}

// Payload comun para guardar los nuevos tipos de solicitud.
function construirPayloadSolicitudGenerica(tipo) {
  const categorias = Array.from(document.querySelectorAll('.solicitud-check-lista:checked'))
    .map(input => input.value);
  const codigo = document.getElementById('solicitudCodigoGenerico')?.value.trim() || null;
  const nombre = document.getElementById('solicitudNombreGenerico')?.value.trim() || null;

  const payload = {
    Tipo_Solicitud: SOLICITUD_TIPOS_NUEVOS[tipo],
    Fecha: obtenerFechaLocalSolicitud(),
    Solicitante: obtenerNombreUsuarioVisible(),
    C_Extranjero: codigo,
    D_extranjero: nombre,
    Solicitud_Codigo: codigo,
    Solicitud_Nombre: nombre,
    Comentarios: document.getElementById('solicitudComentarios')?.value.trim() || null,
    Status: 'Seguimiento'
  };

  if (tipo === 'baja_articulos') {
    payload.Solicitud_SAP_BEAS = document.getElementById('solicitudSapBeas')?.checked || false;
  }

  if (tipo === 'modificacion_articulos') {
    payload.Solicitud_Cambio_Version_Revision =
      document.getElementById('solicitudCambioVersionRevision')?.value || null;
    payload.Solicitud_Categorias = categorias.length ? categorias.join(', ') : null;
  }

  if (tipo === 'alta_ct_cr') {
    payload.Solicitud_Area = document.getElementById('solicitudArea')?.value.trim() || null;
    payload.Solicitud_Recursos = document.getElementById('solicitudRecursos')?.value.trim() || null;
    payload.Solicitud_Centro_Trabajo = document.getElementById('solicitudCentroTrabajo')?.value.trim() || null;
  }

  if (tipo === 'modificacion_ct') {
    payload.Solicitud_Cambio_A_Hacer = categorias.length ? categorias.join(', ') : null;
  }

  return payload;
}

function obtenerClaveTipoSolicitudGenerica(tipoSolicitud) {
  return Object.keys(SOLICITUD_TIPOS_NUEVOS).find(clave => (
    SOLICITUD_TIPOS_NUEVOS[clave] === tipoSolicitud
  )) || '';
}

window.guardarSolicitudGenerica = async function guardarSolicitudGenerica(tipo) {
  const status = document.getElementById('solicitudesStatus');

  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  if (!SOLICITUD_TIPOS_NUEVOS[tipo]) {
    if (status) status.textContent = 'Selecciona un tipo de solicitud valido.';
    return;
  }

  const payload = construirPayloadSolicitudGenerica(tipo);

  if (!payload.Solicitud_Codigo || !payload.Solicitud_Nombre) {
    if (status) status.textContent = 'Completa codigo y nombre antes de guardar.';
    return;
  }

  if (status) status.textContent = 'Guardando solicitud...';

  const { data, error } = await supabaseClient
    .from('Solicitudes')
    .insert(payload)
    .select('Folio')
    .single();

  if (error) {
    if (status) status.textContent = 'Error al guardar solicitud: ' + error.message;
    return;
  }

  asignarValorSolicitud('solicitudFolio', data?.Folio);
  if (status) status.textContent = `Solicitud guardada correctamente. Folio: ${data?.Folio || 'generado'}.`;

  mostrarPopupGuardado(
    `Solicitud guardada correctamente. Folio: ${data?.Folio || 'generado'}.`,
    {
      titulo: 'Solicitud guardada',
      onClose: () => showSection('bienvenida')
    }
  );
};

window.guardarEdicionSolicitudGenerica = async function guardarEdicionSolicitudGenerica() {
  const status = document.getElementById('solicitudesStatus');
  const tipo = obtenerClaveTipoSolicitudGenerica(solicitudActualData?.Tipo_Solicitud);

  if (!solicitudSeguimientoId || !solicitudActualData || !tipo) {
    if (status) status.textContent = 'No se identifico la solicitud que se desea actualizar.';
    return;
  }

  if (!puedeAdministrarSolicitudPropia(solicitudActualData)) {
    mostrarAccesoDenegado();
    return;
  }

  const payload = {
    Comentario_Revision: document.getElementById('solicitudComentarioRevision')?.value.trim() || null
  };

  if (status) status.textContent = 'Guardando comentario...';

  const { error } = await supabaseClient
    .from('Solicitudes')
    .update(payload)
    .eq('id', solicitudSeguimientoId);

  if (error) {
    if (status) status.textContent = 'Error al guardar comentario: ' + error.message;
    return;
  }

  if (status) status.textContent = 'Comentario guardado correctamente.';
  mostrarPopupGuardado('Comentario guardado correctamente.', {
    onClose: () => renderSolicitudes()
  });
};

// Alta de Producto: formato original con uno o varios articulos.
window.crearSolicitud = function crearSolicitud(opciones = {}) {
  reiniciarBloqueoGuardadoSolicitud();

  const destino = opciones.destinoId
    ? document.getElementById(opciones.destinoId)
    : document.getElementById('viewer');

  if (!destino) return;

  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  solicitudArticuloContador = 1;

  const botonRegresar = opciones.integrado
    ? '<button type="button" onclick="mostrarNuevaSolicitud()">Cambiar tipo</button>'
    : '<button type="button" onclick="renderSolicitudes()">Regresar</button>';

  const formularioHtml = `
      <div class="solicitud-paper">
        <div class="solicitud-paper-header">
          <div>
            <h2>Alta de Producto</h2>
          </div>

          ${botonRegresar}
        </div>

        <div class="solicitud-row three-cols">
          <div class="paper-field">
            <label for="solicitudFolio">Folios de Solicitud</label>
            <input id="solicitudFolio" type="text" placeholder="Automaticos" disabled>
          </div>

          <div class="paper-field">
            <label for="solicitudFecha">Fecha</label>
            <input id="solicitudFecha" type="date" disabled>
          </div>

          <div class="paper-field">
            <label for="solicitudSolicitante">Solicitante</label>
            <input
              id="solicitudSolicitante"
              type="text"
              maxlength="150"
              autocomplete="off"
              disabled
              required
            >
          </div>
        </div>

        <div id="solicitudArticulosContainer">
          ${crearBloqueArticuloSolicitud(1)}
        </div>

        <div id="solicitudAgregarArticulo" class="solicitud-add-article">
          <button type="button" onclick="agregarArticuloSolicitud()">Agregar articulos</button>
        </div>

        <div class="paper-section solicitud-formato-futuro" hidden>
          <div class="paper-section-title">2. Clasificacion General</div>

          <div class="paper-options">
            <label>
              <input type="radio" name="clasificacionGeneral" value="ADN-5">
              ADN-5: Materia Prima, Consumibles, Herramientas, Servicios, Activos o Empaques.
            </label>

            <label>
              <input type="radio" name="clasificacionGeneral" value="ADN-4">
              ADN-4: Productos Terminados o Sub-Productos.
            </label>
          </div>

          <div class="subsection-title solicitud-subsection-title">Datos para Identificacion</div>

          <div class="solicitud-row solicitud-code-grid">
            <div class="paper-field">
              <label for="nuevoCodigoGrupo">Grupo</label>
              <select id="nuevoCodigoGrupo" onchange="onNuevoCodigoGrupoChange()">
                <option value="">Selecciona un grupo</option>
              </select>
            </div>

            <div class="paper-field">
              <label for="nuevoCodigoFamilia">Familia</label>
              <select id="nuevoCodigoFamilia" onchange="onNuevoCodigoFamiliaChange()" disabled>
                <option value="">Selecciona una familia</option>
              </select>
            </div>

            <div class="paper-field">
              <label for="nuevoCodigoTipo">Tipo</label>
              <select id="nuevoCodigoTipo" onchange="onNuevoCodigoTipoChange()" disabled>
                <option value="">Selecciona un tipo</option>
              </select>
              <button
                id="btnSolicitudAsignarTipo"
                class="solicitud-field-action"
                type="button"
                onclick="detectarTipoPorDescripcion()"
                hidden
              >Asignar tipo</button>
            </div>

            <div class="paper-field" id="nuevoCodigoMaterialBlock" style="display:none;">
              <label for="nuevoCodigoMaterial">Material</label>
              <select id="nuevoCodigoMaterial" onchange="onNuevoCodigoMaterialChange()" disabled>
                <option value="">Selecciona un material</option>
              </select>
            </div>

            <div class="paper-field">
              <label for="nuevoCodigoConsecutivo">Consecutivo</label>
              <input id="nuevoCodigoConsecutivo" type="text" value="Automatico" disabled>
              <button
                id="btnSolicitudGenerarConsecutivo"
                class="solicitud-field-action"
                type="button"
                onclick="generarConsecutivoNuevoCodigo()"
                disabled
              >Generar consecutivo</button>
            </div>
          </div>

          <div class="subsection-title solicitud-subsection-title">Descripcion Sugerida</div>

          <div class="paper-instruction">
            Formato: NOMBRE + MEDIDA + MATERIAL + DETALLE TECNICO.
          </div>

          <div class="paper-field">
            <label for="nuevoCodigoDescripcionVieja">Descripcion</label>
            <textarea
              id="nuevoCodigoDescripcionVieja"
              rows="4"
              placeholder="MAYUSCULAS Y SIN ACENTOS"
              oninput="onNuevoCodigoDescripcionChange()"
            ></textarea>
          </div>

          <div class="solicitud-generation-row">
            <div class="paper-field">
              <label for="solicitudVersion">Version</label>
              <input id="solicitudVersion" type="number" min="1" step="1" value="1">
            </div>

            <div class="paper-field">
              <label for="solicitudRevision">Revision</label>
              <input id="solicitudRevision" type="number" min="1" step="1" value="1">
            </div>
          </div>

          <div class="codigo-generado-panel solicitud-codigo-panel">
            <div class="panel-label">CODIGO GENERADO</div>
            <div id="nuevoCodigoGenerado" class="codigo-generado-value">-</div>
            <div id="nuevoCodigoStatus" class="status-box">Selecciona un grupo para continuar.</div>
          </div>

          <div class="solicitud-preview-hidden" hidden>
            <span id="previewDescripcionVieja">-</span>
            <span id="previewDescripcionNueva">-</span>
            <span id="previewCodigoNuevo">-</span>
          </div>
        </div>

        <div class="solicitud-actions">
          <button type="button" onclick="guardarSolicitud()">Guardar solicitud</button>
        </div>

        <div id="solicitudesStatus" class="status-box">Completa el formato para registrar la solicitud.</div>
      </div>
  `;

  destino.innerHTML = opciones.integrado
    ? formularioHtml
    : `<div class="catalog-wrapper solicitudes-wrapper">${formularioHtml}</div>`;

  prepararSolicitudInicial();
};

window.agregarArticuloSolicitud = function agregarArticuloSolicitud() {
  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  const container = document.getElementById('solicitudArticulosContainer');
  if (!container) return;

  solicitudArticuloContador += 1;
  container.insertAdjacentHTML(
    'beforeend',
    crearBloqueArticuloSolicitud(solicitudArticuloContador)
  );

  actualizarNumeracionArticulosSolicitud();
};

window.eliminarArticuloSolicitud = function eliminarArticuloSolicitud(index) {
  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  const articulo = document.querySelector(
    `.solicitud-articulo[data-articulo-index="${index}"]`
  );

  if (articulo) articulo.remove();
  actualizarNumeracionArticulosSolicitud();
};

function actualizarNumeracionArticulosSolicitud() {
  document.querySelectorAll('.solicitud-articulo').forEach((articulo, posicion) => {
    const titulo = articulo.querySelector('.solicitud-articulo-title span');
    if (titulo) {
      titulo.textContent = `1. Datos de Nuevo Articulo - Articulo ${posicion + 1}`;
    }
  });
}

window.prepararSolicitudInicial = function prepararSolicitudInicial() {
  const fecha = document.getElementById('solicitudFecha');
  const solicitante = document.getElementById('solicitudSolicitante');
  const nombreUsuario = obtenerNombreUsuarioVisible();

  if (fecha) {
    fecha.value = new Date().toISOString().slice(0, 10);
  }

  if (solicitante) {
    solicitante.value = nombreUsuario;
    solicitante.disabled = true;
    solicitante.readOnly = true;
  }
};

window.limpiarSolicitud = function limpiarSolicitud() {
  crearSolicitud();
};

// Guardado de Alta de Producto con bloqueo contra doble clic.
async function guardarSolicitud() {
  if (!usuarioPuedeEnSolicitudes(0, 2)) {
    mostrarAccesoDenegado();
    return;
  }

  const status = document.getElementById('solicitudesStatus');

  if (solicitudGuardadoEnProceso) {
    if (status) status.textContent = 'La solicitud ya se esta guardando. Espera la confirmacion.';
    return;
  }

  if (!supabaseClient) {
    if (status) {
      status.textContent = 'Supabase no esta cargado. Revisa index.html.';
    }
    return;
  }

  const solicitante = obtenerNombreUsuarioVisible();

  if (!solicitante) {
    if (status) status.textContent = 'Escribe el nombre del solicitante.';
    return;
  }

  const articulos = Array.from(document.querySelectorAll('.solicitud-articulo'));

  const payload = articulos.map(articulo => {
    const fantasmaValue = articulo.querySelector('.solicitud-fantasma:checked')?.value || null;
    const categorias = [];

    if (articulo.querySelector('.solicitud-categoria-inventario')?.checked) {
      categorias.push('Inventario');
    }

    if (articulo.querySelector('.solicitud-categoria-venta')?.checked) {
      categorias.push('Venta');
    }

    if (articulo.querySelector('.solicitud-categoria-compra')?.checked) {
      categorias.push('Compra');
    }

    return {
      Tipo_Solicitud: TIPO_SOLICITUD_ALTA_PRODUCTO,
      Solicitante: solicitante,
      C_Extranjero: articulo.querySelector('.solicitud-codigo-extranjero')?.value.trim() || null,
      D_extranjero: articulo.querySelector('.solicitud-descripcion-extranjera')?.value.trim() || null,
      UM: articulo.querySelector('.solicitud-unidad-medida')?.value.trim() || null,
      Fantasma: fantasmaValue === null ? null : fantasmaValue === 'Si',
      Categoria: categorias.length ? categorias.join(', ') : null,
      Comentarios: articulo.querySelector('.solicitud-comentarios')?.value.trim() || null,
      Status: 'Seguimiento'
    };
  });

  if (payload.length === 0) {
    if (status) status.textContent = 'Agrega al menos un articulo a la solicitud.';
    return;
  }

  try {
    solicitudGuardadoEnProceso = true;
    if (status) status.textContent = `Guardando ${payload.length} articulo(s)...`;

    const { data, error } = await supabaseClient
      .from('Solicitudes')
      .insert(payload)
      .select('Folio');

    if (error) throw error;

    const folios = (data || []).map(row => row.Folio).filter(Boolean);

    if (status) {
      status.textContent = `${payload.length} articulo(s) guardado(s). Folios: ${folios.join(', ')}`;
    }

    const folioInput = document.getElementById('solicitudFolio');
    if (folioInput) {
      folioInput.value = folios.join(', ');
    }

    mostrarPopupGuardado(
      `Solicitud guardada correctamente. Folios: ${folios.join(', ') || 'generados'}.`,
      {
        titulo: 'Solicitud guardada',
        onClose: () => {
          reiniciarBloqueoGuardadoSolicitud();
          showSection('bienvenida');
        }
      }
    );
  } catch (error) {
    solicitudGuardadoEnProceso = false;

    if (status) {
      status.textContent = 'Error al guardar solicitud: ' + error.message;
    }

    console.error(error);
  }
}
