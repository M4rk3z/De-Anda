const NOMBRE_BLOQUEO_SESION = 'index-de-anda-sesion-unica';
const CLAVE_BLOQUEO_RESPALDO = 'indexBloqueoPestana';
const TIEMPO_EXPIRACION_BLOQUEO = 12000;
const ID_PESTANA = sessionStorage.getItem('indexPestanaId')
  || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

sessionStorage.setItem('indexPestanaId', ID_PESTANA);

let bloqueoSesionActivo = false;
let solicitudBloqueoSesion = null;
let liberarBloqueoSesion = null;
let intervaloBloqueoRespaldo = null;
let intervaloReintentoBloqueo = null;
let pestanaBloqueada = false;

function leerBloqueoRespaldo() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_BLOQUEO_RESPALDO) || 'null');
  } catch (error) {
    return null;
  }
}

function escribirBloqueoRespaldo() {
  localStorage.setItem(CLAVE_BLOQUEO_RESPALDO, JSON.stringify({
    pestanaId: ID_PESTANA,
    actualizado: Date.now()
  }));
}

function adquirirBloqueoRespaldo() {
  const bloqueo = leerBloqueoRespaldo();
  const perteneceAOtraPestana = bloqueo?.pestanaId
    && bloqueo.pestanaId !== ID_PESTANA;
  const sigueVigente = Date.now() - Number(bloqueo?.actualizado || 0)
    < TIEMPO_EXPIRACION_BLOQUEO;

  if (perteneceAOtraPestana && sigueVigente) return false;

  escribirBloqueoRespaldo();
  intervaloBloqueoRespaldo = window.setInterval(
    escribirBloqueoRespaldo,
    4000
  );
  bloqueoSesionActivo = true;
  return true;
}

async function asegurarBloqueoSesion() {
  if (bloqueoSesionActivo) return true;
  if (solicitudBloqueoSesion) return solicitudBloqueoSesion;

  if (!navigator.locks?.request) {
    return adquirirBloqueoRespaldo();
  }

  solicitudBloqueoSesion = new Promise(resolve => {
    navigator.locks.request(
      NOMBRE_BLOQUEO_SESION,
      { ifAvailable: true },
      async lock => {
        if (!lock) {
          resolve(false);
          return;
        }

        bloqueoSesionActivo = true;
        resolve(true);

        await new Promise(liberar => {
          liberarBloqueoSesion = liberar;
        });

        bloqueoSesionActivo = false;
      }
    ).catch(() => {
      resolve(adquirirBloqueoRespaldo());
    });
  });

  const resultado = await solicitudBloqueoSesion;
  solicitudBloqueoSesion = null;
  return resultado;
}

function liberarBloqueoDeSesion() {
  if (liberarBloqueoSesion) {
    liberarBloqueoSesion();
    liberarBloqueoSesion = null;
  }

  if (intervaloBloqueoRespaldo) {
    clearInterval(intervaloBloqueoRespaldo);
    intervaloBloqueoRespaldo = null;
  }

  const bloqueo = leerBloqueoRespaldo();
  if (bloqueo?.pestanaId === ID_PESTANA) {
    localStorage.removeItem(CLAVE_BLOQUEO_RESPALDO);
  }

  bloqueoSesionActivo = false;
}

function mostrarBloqueoOtraPestana() {
  pestanaBloqueada = true;

  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const status = document.getElementById('loginStatus');
  const controles = document.querySelectorAll(
    '#loginScreen input, #loginScreen button'
  );

  if (appScreen) appScreen.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'grid';

  controles.forEach(control => {
    control.disabled = true;
  });

  if (status) {
    status.textContent = 'El usuario ya está en uso.';
    status.style.color = '#b91c1c';
  }

  if (!intervaloReintentoBloqueo) {
    intervaloReintentoBloqueo = window.setInterval(async () => {
      if (!pestanaBloqueada) return;

      const disponible = await asegurarBloqueoSesion();
      if (!disponible) return;

      clearInterval(intervaloReintentoBloqueo);
      intervaloReintentoBloqueo = null;
      habilitarLoginPestana();

      if (localStorage.getItem('sesionActiva') === 'true') {
        entrarAlSistema();
      }
    }, 2500);
  }
}

function habilitarLoginPestana() {
  pestanaBloqueada = false;

  if (intervaloReintentoBloqueo) {
    clearInterval(intervaloReintentoBloqueo);
    intervaloReintentoBloqueo = null;
  }

  document.querySelectorAll('#loginScreen input, #loginScreen button')
    .forEach(control => {
      control.disabled = false;
    });

  const status = document.getElementById('loginStatus');
  if (status) status.textContent = '';
}

async function login(event) {
  event.preventDefault();

  const usuario = document.getElementById('loginUsuario').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const status = document.getElementById('loginStatus');

  status.textContent = 'Validando usuario...';
  status.style.color = '#111827';

  try {
    let { data, error } = await supabaseClient
      .from('Usuarios_Login')
      .select('id, User_Nombre, User_Pass, Nivel, Nombre, Permiso_Muliix')
      .ilike('User_Nombre', usuario)
      .maybeSingle();

    if (error && (
      String(error.message || '').includes('Nombre') ||
      String(error.message || '').includes('Permiso_Muliix')
    )) {
      const respaldo = await supabaseClient
        .from('Usuarios_Login')
        .select('id, User_Nombre, User_Pass, Nivel')
        .ilike('User_Nombre', usuario)
        .maybeSingle();

      data = respaldo.data;
      error = respaldo.error;
    }

    console.log('USUARIO ENCONTRADO:', data);
    console.log('ERROR LOGIN:', error);

    if (error) {
      status.textContent = 'Error al consultar usuarios: ' + error.message;
      status.style.color = '#b91c1c';
      return;
    }

    if (!data) {
      status.textContent = 'Usuario no encontrado.';
      status.style.color = '#b91c1c';
      return;
    }

    if (String(data.User_Pass).trim() !== password) {
      status.textContent = 'Contraseña incorrecta.';
      status.style.color = '#b91c1c';
      return;
    }

    const nivelNormalizado = normalizarNivelUsuario(data.Nivel);

    if (nivelNormalizado === null) {
      status.textContent = 'El usuario no tiene un nivel de acceso valido.';
      status.style.color = '#b91c1c';
      return;
    }

    const bloqueoDisponible = await asegurarBloqueoSesion();

    if (!bloqueoDisponible) {
      mostrarBloqueoOtraPestana();
      return;
    }

    status.textContent = 'Acceso correcto. Entrando...';
    status.style.color = '#15803d';

    localStorage.setItem('sesionActiva', 'true');
    localStorage.setItem('usuarioActivo', data.User_Nombre);
    localStorage.setItem('usuarioNombre', data.Nombre || data.User_Nombre);
    localStorage.setItem('usuarioId', data.id);
    localStorage.setItem('usuarioNivel', String(nivelNormalizado));
    localStorage.setItem('permisoMuliix', normalizarBooleanoMuliix(data.Permiso_Muliix) ? 'true' : 'false');

    entrarAlSistema();
  } catch (error) {
    console.error(error);
    status.textContent = 'No se pudo iniciar sesion: ' + error.message;
    status.style.color = '#b91c1c';
  }
}

async function refrescarDatosUsuarioSesion() {
  const usuarioId = localStorage.getItem('usuarioId');
  const usuarioActivo = localStorage.getItem('usuarioActivo');

  if (!usuarioId && !usuarioActivo) {
    return obtenerNombreUsuarioVisible();
  }

  let consulta = supabaseClient
    .from('MD:Usuarios')
    .select('id, User_Nombre, Nombre, Nivel, Permiso_Muliix')
    .limit(1);

  if (usuarioId) {
    consulta = consulta.eq('id', usuarioId);
  } else {
    consulta = consulta.ilike('User_Nombre', usuarioActivo);
  }

  const { data, error } = await consulta.maybeSingle();

  if (error || !data) {
    return obtenerNombreUsuarioVisible();
  }

  const nivelNormalizado = normalizarNivelUsuario(data.Nivel);
  if (nivelNormalizado !== null) {
    localStorage.setItem('usuarioNivel', String(nivelNormalizado));
  }

  if (data.id !== null && data.id !== undefined) {
    localStorage.setItem('usuarioId', data.id);
  }

  if (data.User_Nombre) {
    localStorage.setItem('usuarioActivo', data.User_Nombre);
  }

  if (data.Nombre) {
    localStorage.setItem('usuarioNombre', data.Nombre);
  }

  const permisoMuliix = nivelNormalizado === 0
    || normalizarBooleanoMuliix(data.Permiso_Muliix);
  localStorage.setItem('permisoMuliix', permisoMuliix ? 'true' : 'false');

  return data.Nombre || obtenerNombreUsuarioVisible();
}

function entrarAlSistema() {
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const viewer = document.getElementById('viewer');
  const nombreUsuario = obtenerNombreUsuarioVisible();
  const topbarUserName = document.getElementById('topbarUserName');

  if (!loginScreen || !appScreen) {
    alert('Falta loginScreen o appScreen en el HTML.');
    return;
  }

  if (localStorage.getItem('sesionActiva') !== 'true') {
    appScreen.style.display = 'none';
    loginScreen.style.display = 'grid';
    return;
  }

  loginScreen.style.display = 'none';
  appScreen.style.display = 'flex';
  if (topbarUserName) topbarUserName.textContent = nombreUsuario;

  refrescarDatosUsuarioSesion().then(nombreActualizado => {
    const topbarActual = document.getElementById('topbarUserName');
    if (topbarActual && nombreActualizado) {
      topbarActual.textContent = nombreActualizado;
    }
  });

  aplicarPermisosNavegacion();

  if (viewer) {
    showSection('bienvenida');
  }
}

function cerrarSesion() {
  liberarBloqueoDeSesion();

  localStorage.removeItem('sesionActiva');
  localStorage.removeItem('usuarioActivo');
  localStorage.removeItem('usuarioNombre');
  localStorage.removeItem('usuarioId');
  localStorage.removeItem('usuarioNivel');
  localStorage.removeItem('permisoMuliix');

  const appScreen = document.getElementById('appScreen');
  const loginScreen = document.getElementById('loginScreen');
  const usuarioInput = document.getElementById('loginUsuario');
  const passwordInput = document.getElementById('loginPassword');
  const status = document.getElementById('loginStatus');
  const topbarUserName = document.getElementById('topbarUserName');

  if (appScreen) {
    appScreen.style.display = 'none';
  }

  if (loginScreen) {
    loginScreen.style.display = 'grid';
  }

  if (usuarioInput) {
    usuarioInput.value = '';
  }

  if (passwordInput) {
    passwordInput.value = '';
  }

  if (status) {
    status.textContent = '';
  }

  if (topbarUserName) {
    topbarUserName.textContent = '';
  }
}

window.addEventListener('pagehide', () => {
  if (!navigator.locks?.request) {
    liberarBloqueoDeSesion();
  }
});

window.addEventListener('storage', async event => {
  if (event.key !== 'sesionActiva') return;

  if (event.newValue === 'true' && !bloqueoSesionActivo) {
    const disponible = await asegurarBloqueoSesion();
    if (!disponible) mostrarBloqueoOtraPestana();
    return;
  }

  if (event.newValue === null && pestanaBloqueada) {
    habilitarLoginPestana();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const appScreen = document.getElementById('appScreen');
  const loginScreen = document.getElementById('loginScreen');

  if (appScreen) appScreen.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'grid';

  if (localStorage.getItem('sesionActiva') !== 'true') return;

  const disponible = await asegurarBloqueoSesion();

  if (disponible) {
    entrarAlSistema();
  } else {
    mostrarBloqueoOtraPestana();
  }
});
