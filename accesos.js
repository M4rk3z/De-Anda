// Accesos del sistema: niveles, permisos por seccion y datos visibles de sesion.
const ACCESOS_POR_SECCION = {
  bienvenida: [0, 1, 2],
  buscador: [0, 1, 2],
  simuladorADN: [0, 1, 2],
  nuevoCodigo: [0, 1],
  panelControl: [0, 1],
  solicitudes: [0, 1, 2],
  manual: [0, 1, 2]
};

function normalizarTextoAcceso(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function obtenerNivelUsuario() {
  const valor = localStorage.getItem('usuarioNivel');
  return normalizarNivelUsuario(valor);
}

function normalizarNivelUsuario(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const texto = String(valor).trim();
  const coincidenciaNumerica = texto.match(/(?:^|\D)([012])(?:\D|$)/);

  if (coincidenciaNumerica) {
    return Number(coincidenciaNumerica[1]);
  }

  const etiqueta = normalizarTextoAcceso(texto);

  if (etiqueta.includes('CONTROL TOTAL')) return 0;
  if (etiqueta.includes('ADMINISTRADOR') || etiqueta === 'ADMIN') return 1;
  if (etiqueta.includes('USUARIO') || etiqueta.includes('OPERADOR')) return 2;

  return null;
}

function usuarioPuede(...niveles) {
  const nivel = obtenerNivelUsuario();
  return nivel !== null && niveles.includes(nivel);
}

function obtenerNombreUsuarioVisible() {
  return localStorage.getItem('usuarioNombre')
    || localStorage.getItem('usuarioActivo')
    || 'Usuario';
}

function puedeAccederSeccion(section) {
  if (section === 'solicitudes') {
    return localStorage.getItem('sesionActiva') === 'true';
  }

  const niveles = ACCESOS_POR_SECCION[section];
  return Array.isArray(niveles) && usuarioPuede(...niveles);
}

function mostrarAccesoDenegado() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;

  viewer.innerHTML = `
    <div class="status-box">No tienes permisos para acceder a esta funcion.</div>
  `;
}

function normalizarBooleanoMuliix(valor) {
  if (valor === true) return true;
  if (valor === false || valor === null || valor === undefined) return false;

  const normalizado = normalizarTextoAcceso(valor);
  return normalizado === 'TRUE'
    || normalizado === 'SI'
    || normalizado === '1'
    || normalizado === 'YES';
}

// Control de Accesos: administra usuarios, niveles y permiso para editar Muliix.
let controlAccesosRows = [];
const USUARIOS_ROOT_OCULTOS = ['M4rk3z'];
const CONTROL_ACCESOS_SELECT = 'id,User_Nombre,Nombre,User_Pass,Nivel,Permiso_Muliix';
const NIVELES_ACCESO = [
  ['0', '0 - Control Total'],
  ['1', '1 - Administrador'],
  ['2', '2 - Usuario']
];

function esUsuarioRootOculto(rowOrUserName) {
  const userName = typeof rowOrUserName === 'string'
    ? rowOrUserName
    : rowOrUserName?.User_Nombre;
  const normalizado = normalizarClaveAcceso(userName);

  return USUARIOS_ROOT_OCULTOS.some(usuario => (
    normalizarClaveAcceso(usuario) === normalizado
  ));
}

function normalizarClaveAcceso(valor) {
  return normalizarTextoAcceso(valor).replace(/[^A-Z0-9]/g, '');
}

function usuarioPuedeEditarMuliix() {
  if (usuarioPuede(0)) return true;
  return normalizarBooleanoMuliix(localStorage.getItem('permisoMuliix'));
}

function debeMostrarPermisoMuliix(nivel) {
  const nivelNormalizado = normalizarNivelUsuario(nivel);
  return nivelNormalizado === 1 || nivelNormalizado === 2;
}

function setControlAccesosStatus(mensaje) {
  const status = document.getElementById('controlAccesosStatus');
  if (status) status.textContent = mensaje;
}

function obtenerDatosUsuarioAcceso(prefijo) {
  const usuario = document.getElementById(`${prefijo}UsuarioAcceso`)?.value.trim()
    || document.getElementById(`${prefijo}-usuario`)?.value.trim()
    || '';
  const nombre = document.getElementById(`${prefijo}NombreAcceso`)?.value.trim()
    || document.getElementById(`${prefijo}-nombre`)?.value.trim()
    || '';
  const password = document.getElementById(`${prefijo}PasswordAcceso`)?.value
    || document.getElementById(`${prefijo}-password`)?.value
    || '';
  const nivel = document.getElementById(`${prefijo}NivelAcceso`)?.value.trim()
    || document.getElementById(`${prefijo}-nivel`)?.value.trim()
    || '';
  const permisoInput = document.getElementById(`${prefijo}PermisoMuliix`)
    || document.getElementById(`${prefijo}-muliix`);

  return {
    usuario,
    nombre,
    password,
    nivel,
    permisoMuliix: debeMostrarPermisoMuliix(nivel) ? Boolean(permisoInput?.checked) : false
  };
}

function obtenerDatosFilaAcceso(index) {
  return {
    usuario: document.getElementById(`acceso-usuario-${index}`)?.value.trim() || '',
    nombre: document.getElementById(`acceso-nombre-${index}`)?.value.trim() || '',
    password: document.getElementById(`acceso-password-${index}`)?.value || '',
    nivel: document.getElementById(`acceso-nivel-${index}`)?.value.trim() || '',
    permisoMuliix: debeMostrarPermisoMuliix(document.getElementById(`acceso-nivel-${index}`)?.value)
      ? Boolean(document.getElementById(`acceso-muliix-${index}`)?.checked)
      : false
  };
}

function construirPayloadUsuarioAcceso(datos) {
  return {
    User_Nombre: datos.usuario,
    Nombre: datos.nombre,
    User_Pass: datos.password,
    Nivel: datos.nivel,
    Permiso_Muliix: datos.permisoMuliix
  };
}

function datosUsuarioAccesoValidos(datos) {
  return Boolean(datos.usuario && datos.nombre && datos.password && datos.nivel);
}

function limpiarFormularioNuevoAcceso() {
  ['Usuario', 'Nombre', 'Password', 'Nivel'].forEach(campo => {
    const input = document.getElementById(`nuevo${campo}Acceso`);
    if (input) input.value = '';
  });

  const permisoMuliixInput = document.getElementById('nuevoPermisoMuliix');
  if (permisoMuliixInput) permisoMuliixInput.checked = false;
  actualizarPermisoMuliixNuevoUsuario();
}

function sincronizarSesionUsuarioActual(data) {
  if (String(data.id) !== String(localStorage.getItem('usuarioId') || '')) return;

  localStorage.setItem('usuarioActivo', data.User_Nombre);
  localStorage.setItem('usuarioNombre', data.Nombre || data.User_Nombre);
  localStorage.setItem('usuarioNivel', String(data.Nivel ?? ''));
  localStorage.setItem('permisoMuliix', normalizarBooleanoMuliix(data.Permiso_Muliix) ? 'true' : 'false');

  const topbarUserName = document.getElementById('topbarUserName');
  if (topbarUserName) {
    topbarUserName.textContent = data.Nombre || data.User_Nombre;
  }

  aplicarPermisosNavegacion();
}

function renderControlAccesos() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const contenedor = document.getElementById('panelControlContenido');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="control-card access-control-card">
      <div class="catalog-header">
        <h2>Control de Accesos</h2>
        <p>Administra usuarios, contrasenas y permisos del sistema.</p>
      </div>

      <div class="access-create-form">
        <div class="field-block">
          <label for="nuevoUsuarioAcceso">Usuario</label>
          <input id="nuevoUsuarioAcceso" type="text" autocomplete="off" placeholder="Nombre del nuevo usuario">
        </div>

        <div class="field-block">
          <label for="nuevoNombreAcceso">Nombre</label>
          <input id="nuevoNombreAcceso" type="text" autocomplete="off" placeholder="Nombre completo">
        </div>

        <div class="field-block">
          <label for="nuevoPasswordAcceso">Contrasena</label>
          <div class="password-field">
            <input id="nuevoPasswordAcceso" type="password" autocomplete="new-password" placeholder="Contrasena">
            <button type="button" onclick="alternarPasswordAcceso('nuevoPasswordAcceso', this)">Mostrar</button>
          </div>
        </div>

        <div class="field-block">
          <label for="nuevoNivelAcceso">Nivel</label>
          <select id="nuevoNivelAcceso" onchange="actualizarPermisoMuliixNuevoUsuario()">
            <option value="">Selecciona un nivel</option>
            <option value="0">0 - Control Total</option>
            <option value="1">1 - Administrador</option>
            <option value="2">2 - Usuario</option>
          </select>
        </div>

        <label id="nuevoPermisoMuliixWrap" class="access-permission-check" hidden>
          <span>Permiso Muliix</span>
          <input id="nuevoPermisoMuliix" type="checkbox">
        </label>

        <button type="button" onclick="agregarUsuarioAcceso()">Agregar usuario</button>
      </div>

      <div id="controlAccesosStatus" class="status-box">Cargando usuarios...</div>

      <div class="table-scroll">
        <table class="catalog-table access-control-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Contrasena</th>
              <th>Nivel</th>
              <th>Permiso Muliix</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="controlAccesosResultados">
            <tr><td colspan="6">Cargando usuarios...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  cargarUsuariosAcceso();
}

async function cargarUsuariosAcceso() {
  if (!usuarioPuede(0)) return;

  const tbody = document.getElementById('controlAccesosResultados');
  if (!tbody) return;

  setControlAccesosStatus('Cargando usuarios...');

  let { data, error } = await supabaseClient
    .from('MD:Usuarios')
    .select(CONTROL_ACCESOS_SELECT)
    .order('User_Nombre', { ascending: true });

  if (error && (
    String(error.message || '').includes('Nombre') ||
    String(error.message || '').includes('Permiso_Muliix')
  )) {
    const respaldo = await supabaseClient
      .from('MD:Usuarios')
      .select('id,User_Nombre,User_Pass,Nivel')
      .order('User_Nombre', { ascending: true });

    data = (respaldo.data || []).map(row => ({
      ...row,
      Nombre: row.User_Nombre,
      Permiso_Muliix: false
    }));
    error = respaldo.error;
  }

  if (error) {
    setControlAccesosStatus('Error al cargar usuarios: ' + error.message);
    tbody.innerHTML = '<tr><td colspan="6">No se pudieron cargar los usuarios.</td></tr>';
    return;
  }

  controlAccesosRows = (data || []).filter(row => !esUsuarioRootOculto(row));
  renderUsuariosAcceso();
  setControlAccesosStatus(`Usuarios registrados: ${controlAccesosRows.length}`);
}

function renderUsuariosAcceso() {
  const tbody = document.getElementById('controlAccesosResultados');
  if (!tbody) return;

  if (!controlAccesosRows.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay usuarios registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = controlAccesosRows.map((row, index) => `
    <tr>
      <td>
        <input id="acceso-usuario-${index}" class="master-input" type="text"
          autocomplete="off" value="${escapeHtml(row.User_Nombre || '')}">
      </td>
      <td>
        <input id="acceso-nombre-${index}" class="master-input" type="text"
          autocomplete="off" value="${escapeHtml(row.Nombre || row.User_Nombre || '')}">
      </td>
      <td>
        <div class="password-field">
          <input id="acceso-password-${index}" class="master-input" type="password"
            autocomplete="new-password" value="${escapeHtml(row.User_Pass || '')}">
          <button type="button"
            onclick="alternarPasswordAcceso('acceso-password-${index}', this)">Mostrar</button>
        </div>
      </td>
      <td>
        <select id="acceso-nivel-${index}" class="master-input" onchange="actualizarPermisoMuliixFila(${index})">
          ${renderOpcionesNivelAcceso(row.Nivel)}
        </select>
      </td>
      <td class="access-permission-cell">
        <label
          id="acceso-muliix-wrap-${index}"
          class="access-permission-check access-permission-check-inline"
          ${debeMostrarPermisoMuliix(row.Nivel) ? '' : 'hidden'}
        >
          <input
            id="acceso-muliix-${index}"
            type="checkbox"
            ${normalizarBooleanoMuliix(row.Permiso_Muliix) ? 'checked' : ''}
          >
          <span>Modificar</span>
        </label>
      </td>
      <td>
        <div class="access-row-actions">
          <button type="button" onclick="guardarUsuarioAcceso(${index})">Guardar</button>
          <button type="button" class="danger-button"
            onclick="eliminarUsuarioAcceso(${index})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderOpcionesNivelAcceso(nivelActual) {
  const nivelNormalizado = normalizarNivelUsuario(nivelActual);

  return NIVELES_ACCESO.map(([valor, etiqueta]) => `
    <option value="${valor}" ${String(nivelNormalizado) === valor ? 'selected' : ''}>
      ${etiqueta}
    </option>
  `).join('');
}

function actualizarPermisoMuliixNuevoUsuario() {
  const nivel = document.getElementById('nuevoNivelAcceso')?.value || '';
  const wrapper = document.getElementById('nuevoPermisoMuliixWrap');
  const checkbox = document.getElementById('nuevoPermisoMuliix');
  const mostrar = debeMostrarPermisoMuliix(nivel);

  if (wrapper) wrapper.hidden = !mostrar;
  if (!mostrar && checkbox) checkbox.checked = false;
}

function actualizarPermisoMuliixFila(index) {
  const nivel = document.getElementById(`acceso-nivel-${index}`)?.value || '';
  const wrapper = document.getElementById(`acceso-muliix-wrap-${index}`);
  const checkbox = document.getElementById(`acceso-muliix-${index}`);
  const mostrar = debeMostrarPermisoMuliix(nivel);

  if (wrapper) wrapper.hidden = !mostrar;
  if (!mostrar && checkbox) checkbox.checked = false;
}

function alternarPasswordAcceso(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const mostrar = input.type === 'password';
  input.type = mostrar ? 'text' : 'password';
  if (button) button.textContent = mostrar ? 'Ocultar' : 'Mostrar';
}

async function agregarUsuarioAcceso() {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const datos = obtenerDatosUsuarioAcceso('nuevo');

  if (!datosUsuarioAccesoValidos(datos)) {
    setControlAccesosStatus('Escribe usuario, nombre, contrasena y nivel.');
    return;
  }

  if (esUsuarioRootOculto(datos.usuario)) {
    setControlAccesosStatus('Este usuario root esta protegido.');
    return;
  }

  const { data: existente, error: errorConsulta } = await supabaseClient
    .from('MD:Usuarios')
    .select('id')
    .ilike('User_Nombre', datos.usuario)
    .maybeSingle();

  if (errorConsulta) {
    setControlAccesosStatus('Error al validar usuario: ' + errorConsulta.message);
    return;
  }

  if (existente) {
    setControlAccesosStatus('Ese nombre de usuario ya existe.');
    return;
  }

  const payload = construirPayloadUsuarioAcceso(datos);
  const { data, error } = await supabaseClient
    .from('MD:Usuarios')
    .insert(payload)
    .select(CONTROL_ACCESOS_SELECT)
    .maybeSingle();

  if (error) {
    setControlAccesosStatus('Error al agregar usuario: ' + error.message);
    return;
  }

  limpiarFormularioNuevoAcceso();
  await cargarUsuariosAcceso();
  if (typeof registrarLogControl === 'function') {
    await registrarLogControl({
      modulo: 'Control de Accesos',
      accion: 'ALTA',
      tabla: 'MD:Usuarios',
      registroId: data?.id || datos.usuario,
      descripcion: `Alta de usuario ${datos.usuario}`,
      antes: null,
      despues: sanitizarUsuarioAccesoParaLog(data || payload)
    });
  }
  setControlAccesosStatus('Usuario agregado correctamente.');
  mostrarPopupGuardado('Usuario agregado correctamente.');
}

async function guardarUsuarioAcceso(index) {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const row = controlAccesosRows[index];
  if (!row) return;

  if (esUsuarioRootOculto(row)) {
    setControlAccesosStatus('Este usuario root esta protegido.');
    return;
  }

  const datos = obtenerDatosFilaAcceso(index);

  if (!datosUsuarioAccesoValidos(datos)) {
    setControlAccesosStatus('Usuario, nombre, contrasena y nivel no pueden quedar vacios.');
    return;
  }

  if (esUsuarioRootOculto(datos.usuario)) {
    setControlAccesosStatus('Este usuario root esta protegido.');
    return;
  }

  const { data, error } = await supabaseClient
    .from('MD:Usuarios')
    .update(construirPayloadUsuarioAcceso(datos))
    .eq('id', row.id)
    .select(CONTROL_ACCESOS_SELECT)
    .maybeSingle();

  if (error) {
    setControlAccesosStatus('Error al guardar usuario: ' + error.message);
    return;
  }

  if (!data) {
    setControlAccesosStatus('No se actualizo el usuario. Revisa la policy UPDATE.');
    return;
  }

  controlAccesosRows[index] = data;
  renderUsuariosAcceso();
  sincronizarSesionUsuarioActual(data);
  if (typeof registrarLogControl === 'function') {
    await registrarLogControl({
      modulo: 'Control de Accesos',
      accion: 'EDICION',
      tabla: 'MD:Usuarios',
      registroId: row.id,
      descripcion: `Actualizacion de usuario ${row.User_Nombre}`,
      antes: sanitizarUsuarioAccesoParaLog(row),
      despues: sanitizarUsuarioAccesoParaLog(data)
    });
  }

  setControlAccesosStatus('Usuario actualizado correctamente.');
  mostrarPopupGuardado('Usuario actualizado correctamente.');
}

async function eliminarUsuarioAcceso(index) {
  if (!usuarioPuede(0)) {
    mostrarAccesoDenegado();
    return;
  }

  const row = controlAccesosRows[index];
  if (!row) return;

  if (esUsuarioRootOculto(row)) {
    setControlAccesosStatus('Este usuario root esta protegido.');
    return;
  }

  if (String(row.id) === String(localStorage.getItem('usuarioId') || '')) {
    setControlAccesosStatus('No puedes eliminar el usuario de la sesion actual.');
    return;
  }

  if (!window.confirm(`Se eliminara el usuario "${row.User_Nombre}". Esta accion no se puede deshacer.`)) {
    return;
  }

  const { data, error } = await supabaseClient
    .from('MD:Usuarios')
    .delete()
    .eq('id', row.id)
    .select(CONTROL_ACCESOS_SELECT)
    .maybeSingle();

  if (error) {
    setControlAccesosStatus('Error al eliminar usuario: ' + error.message);
    return;
  }

  await cargarUsuariosAcceso();
  if (typeof registrarLogControl === 'function') {
    await registrarLogControl({
      modulo: 'Control de Accesos',
      accion: 'ELIMINACION',
      tabla: 'MD:Usuarios',
      registroId: row.id,
      descripcion: `Eliminacion de usuario ${row.User_Nombre}`,
      antes: sanitizarUsuarioAccesoParaLog(data || row),
      despues: null
    });
  }
  setControlAccesosStatus('Usuario eliminado correctamente.');
}

function sanitizarUsuarioAccesoParaLog(row) {
  if (!row) return null;

  const copia = { ...row };
  delete copia.User_Password;
  delete copia.Password;
  delete copia.password;
  return copia;
}
