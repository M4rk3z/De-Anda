// Configuracion del modulo Nuevo Codigo y columnas de BD_General.
const TABLA_CODIGOS = 'BD_General';
const COLUMNA_CODIGO_PIXVS = 'Codigo Pixvs';
const COLUMNA_CODIGO = 'Codigo SAP';
const COLUMNA_DESCRIPCION_1 = 'Nombre Pixvs';
const COLUMNA_DESCRIPCION_2 = 'Nombre SAP';
const COLUMNA_FECHA_CAMBIO = 'Fecha de ultimo Cambio';

// Estado temporal del formulario; se reinicia al limpiar o cambiar grupo.
let nuevoCodigoState = {
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

let nuevoCodigoRelaciones = {
  familias: [],
  tipos: [],
  materiales: []
};

let nuevoCodigoModoSimulador = false;

function esValorCatalogoValido(value) {
  const texto = String(value ?? '').trim().toLowerCase();
  return texto !== '' && texto !== 'null' && texto !== 'undefined';
}

function esNombreGrupoPT(grupoNombre) {
  return normalizarTextoFlexible(grupoNombre).startsWith('PT');
}

function obtenerFamiliasRelacionadas(grupoNombre) {
  const grupoNormalizado = normalizarTextoFlexible(grupoNombre);

  return nuevoCodigoRelaciones.familias.filter(row => {
    const familia = String(row.Familia || '').trim().toUpperCase();

    return normalizarTextoFlexible(row.Grupo) === grupoNormalizado
      && esValorCatalogoValido(row.Familia)
      && esValorCatalogoValido(row.IdFamilia)
      && !familia.includes('LIBRE');
  });
}

function obtenerTiposRelacionados(familiaNombre) {
  const familiaNormalizada = normalizarTextoFlexible(familiaNombre);

  return nuevoCodigoRelaciones.tipos.filter(row => (
    normalizarTextoFlexible(row.Familia) === familiaNormalizada
    && esValorCatalogoValido(row.Tipo)
    && esValorCatalogoValido(row.Id)
  ));
}

function obtenerMaterialesRelacionados(grupoNombre) {
  const grupoNormalizado = normalizarTextoFlexible(grupoNombre);

  return nuevoCodigoRelaciones.materiales.filter(row => (
    normalizarTextoFlexible(row.Grupo) === grupoNormalizado
    && esValorCatalogoValido(row.Material)
    && esValorCatalogoValido(row.Id_Material)
  ));
}

function marcarOpcionSinRelacion(option, motivo = 'Sin relacion') {
  option.disabled = true;
  option.classList.add('option-sin-relacion');
  option.textContent += ` - ${motivo}`;
  option.title = motivo;
}

/*************************************************
 * RENDER PRINCIPAL
 *************************************************/

// Vista principal de Nuevo Codigo; tambien alimenta el Simulador ADN.
function renderNuevoCodigo(opciones = {}) {
  nuevoCodigoModoSimulador = Boolean(opciones.simulador);

  if (!nuevoCodigoModoSimulador && !usuarioPuede(0, 1)) {
    mostrarAccesoDenegado();
    return;
  }

  const viewer = document.getElementById('viewer');
  const titulo = nuevoCodigoModoSimulador
    ? 'Simulador ADN'
    : 'Registrar un nuevo codigo';
  const descripcion = nuevoCodigoModoSimulador
    ? ''
    : 'Selecciona Grupo, Familia, Tipo para construir una nueva clave.';

  viewer.innerHTML = `
    <div class="nuevo-codigo-view">
      <div class="nuevo-codigo-header">
        <h2>${titulo}</h2>
        ${descripcion ? `<p>${descripcion}</p>` : ''}
      </div>

      <div class="nuevo-codigo-form">
        <div class="field-block">
          <label for="nuevoCodigoGrupo">Grupo</label>
          <select id="nuevoCodigoGrupo" onchange="onNuevoCodigoGrupoChange()">
            <option value="">Selecciona un grupo</option>
          </select>
        </div>

        <div class="field-block">
          <label for="nuevoCodigoFamilia">Familia</label>
          <select id="nuevoCodigoFamilia" onchange="onNuevoCodigoFamiliaChange()" disabled>
            <option value="">Selecciona una familia</option>
          </select>
        </div>

        <div class="field-block">
          <label for="nuevoCodigoTipo">Tipo</label>
          <select id="nuevoCodigoTipo" onchange="onNuevoCodigoTipoChange()" disabled>
            <option value="">Selecciona un tipo</option>
          </select>
        </div>

        <div class="field-block" id="nuevoCodigoMaterialBlock" style="display:none;">
          <label for="nuevoCodigoMaterial">Material</label>
          <select id="nuevoCodigoMaterial" onchange="onNuevoCodigoMaterialChange()" disabled>
            <option value="">Selecciona un material</option>
          </select>
        </div>

        <div class="field-block consecutivo-block">
          <label for="nuevoCodigoConsecutivo">Consecutivo</label>
          <input id="nuevoCodigoConsecutivo" type="text" value="Automatico" disabled>
        </div>
      </div>

      <div class="field-block descripcion-block">
        <label for="nuevoCodigoDescripcionVieja">Descripcion</label>
        <input
          id="nuevoCodigoDescripcionVieja"
          type="text"
          placeholder="Escribe la descripcion base del articulo"
          oninput="onNuevoCodigoDescripcionChange()"
        >
      </div>

      <div class="nuevo-codigo-actions">
        <button id="btnNuevoCodigoPrincipal" onclick="accionPrincipalNuevoCodigo()"></button>

        ${nuevoCodigoModoSimulador ? '' : `
          <button onclick="guardarNuevoCodigoMateriaPrima()">
            Guardar
          </button>
        `}

        <button onclick="limpiarNuevoCodigo()">
          Limpiar
        </button>
      </div>

      <div class="codigo-generado-panel">
        <div class="panel-label">CODIGO GENERADO</div>

        <div id="nuevoCodigoGenerado" class="codigo-generado-value">
          -
        </div>

        <div id="nuevoCodigoStatus" class="status-box">
          Selecciona un grupo para continuar.
        </div>
      </div>

      <div class="vista-previa-panel">
        <h3>Vista previa final</h3>

        <div class="preview-row">
          <strong>Descripcion:</strong>
          <span id="previewDescripcionVieja">-</span>
        </div>

        <div class="preview-row">
          <strong>Descripcion nueva:</strong>
          <span id="previewDescripcionNueva">-</span>
        </div>

        <div class="preview-row">
          <strong>Codigo nuevo:</strong>
          <span id="previewCodigoNuevo">-</span>
        </div>

        ${nuevoCodigoModoSimulador ? '' : `
          <div class="preview-row">
            <label for="nuevoCodigoPixvs">
              <strong>Codigo Pixvs:</strong>
            </label>
            <input
              id="nuevoCodigoPixvs"
              class="preview-input"
              type="text"
              placeholder="Opcional"
              disabled
            >
          </div>
        `}
      </div>
    </div>
  `;

  cargarGruposNuevoCodigo();
  actualizarBotonPrincipalNuevoCodigo();
}

function renderSimuladorADN() {
  renderNuevoCodigo({ simulador: true });
}

/*************************************************
 * GRUPOS
 *************************************************/

// Carga de catalogos relacionados: grupos, familias, tipos y materiales.
async function cargarGruposNuevoCodigo() {
  const grupoSelect = document.getElementById('nuevoCodigoGrupo');

  if (!grupoSelect) return;

  grupoSelect.innerHTML = `<option value="">Cargando grupos...</option>`;
  grupoSelect.disabled = true;

  const [
    gruposResultado,
    familiasResultado,
    tiposResultado,
    materialesResultado
  ] = await Promise.all([
    leerSupabasePaginado('DT_Grupos', '"Grupo", "ID"', 'Grupo'),
    leerSupabasePaginado(
      'MP:MateriaPrima',
      '"Grupo", "Familia", "IdFamilia"',
      'Familia'
    ),
    leerSupabasePaginado('MP:Tipos', '"Familia", "Tipo", "Id"', 'Tipo'),
    leerSupabasePaginado(
      'MP:Materiales',
      '"Grupo", "Material", "Id_Material", "Nomenclatura"',
      'Material'
    )
  ]);

  const error = gruposResultado.error
    || familiasResultado.error
    || tiposResultado.error
    || materialesResultado.error;

  if (error) {
    grupoSelect.innerHTML = `<option value="">Error al cargar grupos</option>`;
    setNuevoCodigoStatus('Error al cargar grupos: ' + error.message);
    return;
  }

  nuevoCodigoRelaciones = {
    familias: familiasResultado.data || [],
    tipos: tiposResultado.data || [],
    materiales: materialesResultado.data || []
  };

  const gruposValidos = (gruposResultado.data || []).filter(row => (
    esValorCatalogoValido(row.Grupo) && esValorCatalogoValido(row.ID)
  ));

  if (gruposValidos.length === 0) {
    grupoSelect.innerHTML = `<option value="">No hay grupos registrados</option>`;
    setNuevoCodigoStatus('No se encontraron grupos en DT_Grupos.');
    return;
  }

  grupoSelect.innerHTML = `<option value="">Selecciona un grupo</option>`;

  gruposValidos.forEach(row => {
    const option = document.createElement('option');

    option.value = row.Grupo;
    option.textContent = `${row.Grupo} (${row.ID})`;
    option.dataset.grupoId = row.ID;

    const familias = obtenerFamiliasRelacionadas(row.Grupo);
    const tieneFamilias = familias.length > 0;
    const tieneCadenaMP = esNombreGrupoPT(row.Grupo) || (
      obtenerMaterialesRelacionados(row.Grupo).length > 0
      && familias.some(familia => (
        obtenerTiposRelacionados(familia.Familia).length > 0
      ))
    );

    if (!tieneFamilias) {
      marcarOpcionSinRelacion(option, 'Sin familias');
    } else if (!tieneCadenaMP) {
      marcarOpcionSinRelacion(option, 'Sin relacion completa');
    }

    grupoSelect.appendChild(option);
  });

  grupoSelect.disabled = false;
  setNuevoCodigoStatus('Selecciona un grupo para continuar.');
}

async function onNuevoCodigoGrupoChange() {
  const grupoSelect = document.getElementById('nuevoCodigoGrupo');
  const selectedOption = grupoSelect.options[grupoSelect.selectedIndex];

  nuevoCodigoState.grupoNombre = grupoSelect.value;
  nuevoCodigoState.grupoId = selectedOption.dataset.grupoId || '';
  nuevoCodigoState.familiaNombre = '';
  nuevoCodigoState.idFamilia = '';
  nuevoCodigoState.tipoNombre = '';
  nuevoCodigoState.idTipo = '';
  nuevoCodigoState.claveTipo = '';
  nuevoCodigoState.materialNombre = '';
  nuevoCodigoState.idMaterial = '';
  nuevoCodigoState.nomenclaturaMaterial = '';

  limpiarFamiliasNuevoCodigo();
  limpiarTiposNuevoCodigo();
  limpiarMaterialesNuevoCodigo();
  limpiarCodigoGeneradoNuevoCodigo();
  limpiarVistaPreviaNuevoCodigo();
  actualizarBotonPrincipalNuevoCodigo();

  if (selectedOption?.disabled) {
    grupoSelect.value = '';
    nuevoCodigoState.grupoNombre = '';
    nuevoCodigoState.grupoId = '';
    setNuevoCodigoStatus('El grupo seleccionado no tiene relaciones disponibles.');
    return;
  }

  if (!nuevoCodigoState.grupoNombre) {
    setNuevoCodigoStatus('Selecciona un grupo para continuar.');
    return;
  }

  setNuevoCodigoStatus('Cargando familias...');
  const tieneFamilias = await cargarFamiliasNuevoCodigo(
    nuevoCodigoState.grupoNombre
  );

  if (!tieneFamilias) {
    limpiarMaterialesNuevoCodigo();
    setNuevoCodigoStatus(
      'Este grupo no tiene familias disponibles. No es posible seleccionar material.'
    );
    return;
  }

  if (!esGrupoPTNuevoCodigo()) {
    await cargarMaterialesNuevoCodigo(nuevoCodigoState.grupoNombre);
  }
}

/*************************************************
 * FAMILIAS
 *************************************************/

async function cargarFamiliasNuevoCodigo(grupoNombre) {
  const familiaSelect = document.getElementById('nuevoCodigoFamilia');

  if (!familiaSelect) return;

  familiaSelect.innerHTML = `<option value="">Cargando familias...</option>`;
  familiaSelect.disabled = true;

  const familiasFiltradas = obtenerFamiliasRelacionadas(grupoNombre)
    .sort((a, b) => String(a.Familia).localeCompare(
      String(b.Familia),
      'es',
      { sensitivity: 'base', numeric: true }
    ));

  if (familiasFiltradas.length === 0) {
    familiaSelect.innerHTML = `<option value="">No hay familias para este grupo</option>`;
    setNuevoCodigoStatus('No se encontraron familias disponibles para el grupo seleccionado.');
    return false;
  }

  familiaSelect.innerHTML = `<option value="">Selecciona una familia</option>`;

  familiasFiltradas.forEach(row => {
    const option = document.createElement('option');

    option.value = row.Familia;
    option.textContent = `${row.Familia} (${row.IdFamilia})`;
    option.dataset.idFamilia = row.IdFamilia;

    if (
      !esNombreGrupoPT(grupoNombre)
      && obtenerTiposRelacionados(row.Familia).length === 0
    ) {
      marcarOpcionSinRelacion(option, 'Sin tipos');
    }

    familiaSelect.appendChild(option);
  });

  const tieneFamiliasDisponibles = Array.from(familiaSelect.options)
    .some(option => option.value && !option.disabled);

  familiaSelect.disabled = !tieneFamiliasDisponibles;
  setNuevoCodigoStatus(
    tieneFamiliasDisponibles
      ? 'Selecciona una familia.'
      : 'Las familias del grupo no tienen tipos relacionados.'
  );

  return tieneFamiliasDisponibles;
}

function onNuevoCodigoFamiliaChange() {
  const familiaSelect = document.getElementById('nuevoCodigoFamilia');
  const selectedOption = familiaSelect.options[familiaSelect.selectedIndex];

  nuevoCodigoState.familiaNombre = familiaSelect.value;
  nuevoCodigoState.idFamilia = selectedOption.dataset.idFamilia || '';
  nuevoCodigoState.tipoNombre = '';
  nuevoCodigoState.idTipo = '';
  nuevoCodigoState.claveTipo = '';

  limpiarTiposNuevoCodigo();
  limpiarCodigoGeneradoNuevoCodigo();
  limpiarVistaPreviaNuevoCodigo();
  actualizarBotonPrincipalNuevoCodigo();

  if (selectedOption?.disabled) {
    familiaSelect.value = '';
    nuevoCodigoState.familiaNombre = '';
    nuevoCodigoState.idFamilia = '';
    setNuevoCodigoStatus('La familia seleccionada no tiene tipos relacionados.');
    return;
  }

  if (!nuevoCodigoState.familiaNombre) {
    setNuevoCodigoStatus('Selecciona una familia.');
    return;
  }

  if (esGrupoPTNuevoCodigo()) {
    setNuevoCodigoStatus('Familia seleccionada. Escribe la descripcion y asigna el tipo.');
    return;
  }

  setNuevoCodigoStatus('Cargando tipos...');
  cargarTiposMPNuevoCodigo(nuevoCodigoState.familiaNombre);
}

/*************************************************
 * BOTON PRINCIPAL
 *************************************************/

function accionPrincipalNuevoCodigo() {
  if (!nuevoCodigoState.grupoNombre) {
    setNuevoCodigoStatus('Selecciona un grupo para continuar.');
    return;
  }

  if (esGrupoPTNuevoCodigo()) {
    if (!nuevoCodigoState.tipoNombre || !nuevoCodigoState.idTipo) {
      detectarTipoPorDescripcion();
      return;
    }

    generarConsecutivoNuevoCodigo();
    return;
  }

  generarConsecutivoNuevoCodigo();
}

function actualizarBotonPrincipalNuevoCodigo() {
  const btn = document.getElementById('btnNuevoCodigoPrincipal');
  const btnAsignarTipo = document.getElementById('btnSolicitudAsignarTipo');
  const btnGenerarConsecutivo = document.getElementById('btnSolicitudGenerarConsecutivo');

  const esPT = esGrupoPTNuevoCodigo();
  const tieneGrupo = Boolean(nuevoCodigoState.grupoNombre);
  const tieneFamilia = Boolean(
    nuevoCodigoState.familiaNombre && nuevoCodigoState.idFamilia
  );
  const tieneTipo = Boolean(
    nuevoCodigoState.tipoNombre && nuevoCodigoState.idTipo
  );
  const tieneMaterial = Boolean(
    nuevoCodigoState.materialNombre && nuevoCodigoState.idMaterial
  );

  if (btnAsignarTipo) {
    btnAsignarTipo.hidden = !esPT;
    btnAsignarTipo.disabled = !tieneGrupo || !tieneFamilia;
  }

  if (btnGenerarConsecutivo) {
    btnGenerarConsecutivo.disabled = esPT
      ? !tieneGrupo || !tieneFamilia || !tieneTipo
      : !tieneGrupo || !tieneFamilia || !tieneTipo || !tieneMaterial;
  }

  if (!btn) return;

  if (!nuevoCodigoState.grupoNombre) {
    btn.textContent = '';
    return;
  }

  if (esGrupoPTNuevoCodigo()) {
    btn.textContent = nuevoCodigoState.tipoNombre && nuevoCodigoState.idTipo
      ? 'Generar consecutivo'
      : 'Asignar Tipo';
    return;
  }

  btn.textContent = 'Generar consecutivo';
}

function esGrupoPTNuevoCodigo() {
  return String(nuevoCodigoState.grupoNombre || '')
    .trim()
    .toUpperCase()
    .startsWith('P.T.');
}

/*************************************************
 * TIPOS POR DESCRIPCION
 *************************************************/

async function detectarTipoPorDescripcion() {
  const descripcionInput = document.getElementById('nuevoCodigoDescripcionVieja');
  const descripcion = descripcionInput.value.trim();

  limpiarTiposNuevoCodigo();
  limpiarCodigoGeneradoNuevoCodigo();

  nuevoCodigoState.tipoNombre = '';
  nuevoCodigoState.idTipo = '';
  nuevoCodigoState.claveTipo = '';

  actualizarBotonPrincipalNuevoCodigo();

  if (!nuevoCodigoState.grupoNombre) {
    setNuevoCodigoStatus('Selecciona un grupo antes de detectar el tipo.');
    return;
  }

  if (!esGrupoPTNuevoCodigo()) {
    setNuevoCodigoStatus('La deteccion automatica de tipo solo aplica para grupos P.T.');
    return;
  }

  if (!descripcion) {
    setNuevoCodigoStatus('Escribe una descripcion para detectar el tipo.');
    descripcionInput.focus();
    return;
  }

  setNuevoCodigoStatus('Buscando palabras clave en la descripcion...');

  const { data, error } = await supabaseClient
    .from('PT:Tipos')
    .select('"Clave", "Tipos", "Id"')
    .order('Clave', { ascending: true });

  if (error) {
    setNuevoCodigoStatus('Error al cargar tipos: ' + error.message);
    return;
  }

  const descripcionNormalizada = normalizarTextoNuevoCodigo(descripcion);

  const coincidencias = (data || []).filter(row => {
    if (!esValorCatalogoValido(row.Clave)
      || !esValorCatalogoValido(row.Tipos)
      || !esValorCatalogoValido(row.Id)) {
      return false;
    }

    const clave = normalizarTextoNuevoCodigo(row.Clave);

    if (!clave) return false;

    return descripcionNormalizada.includes(clave);
  });

  if (coincidencias.length === 0) {
    setNuevoCodigoStatus('No se encontro ninguna palabra clave para la descripcion.');
    return;
  }

  if (coincidencias.length === 1) {
    seleccionarTipoDetectado(coincidencias[0]);
    return;
  }

  mostrarPopupTiposNuevoCodigo(coincidencias);
}

function seleccionarTipoDetectado(row) {
  nuevoCodigoState.claveTipo = row.Clave || '';
  nuevoCodigoState.tipoNombre = row.Tipos || '';
  nuevoCodigoState.idTipo = row.Id || '';

  const tipoSelect = document.getElementById('nuevoCodigoTipo');

  if (tipoSelect) {
    tipoSelect.innerHTML = `
      <option value="${escapeHtml(row.Tipos)}">
        ${escapeHtml(row.Tipos)} (${escapeHtml(row.Id)})
      </option>
    `;

    tipoSelect.value = row.Tipos;
    tipoSelect.disabled = false;

    const selectedOption = tipoSelect.options[0];
    selectedOption.dataset.idTipo = row.Id || '';
    selectedOption.dataset.claveTipo = row.Clave || '';
  }

  setNuevoCodigoStatus(
    `Tipo asignado: ${row.Tipos} (${row.Id}) por clave "${row.Clave}".`
  );

  actualizarBotonPrincipalNuevoCodigo();
}

function onNuevoCodigoTipoChange() {
  const tipoSelect = document.getElementById('nuevoCodigoTipo');
  const selectedOption = tipoSelect.options[tipoSelect.selectedIndex];

  nuevoCodigoState.tipoNombre = tipoSelect.value;
  nuevoCodigoState.idTipo = selectedOption.dataset.idTipo || '';
  nuevoCodigoState.claveTipo = selectedOption.dataset.claveTipo || '';

  limpiarCodigoGeneradoNuevoCodigo();
  actualizarBotonPrincipalNuevoCodigo();

  if (!nuevoCodigoState.tipoNombre) {
    setNuevoCodigoStatus('Selecciona un tipo.');
    return;
  }

  setNuevoCodigoStatus('Tipo seleccionado. Puedes continuar con el consecutivo.');
}

function onNuevoCodigoDescripcionChange() {
  limpiarCodigoGeneradoNuevoCodigo();
  limpiarVistaPreviaNuevoCodigo();

  if (!esGrupoPTNuevoCodigo()) return;

  nuevoCodigoState.tipoNombre = '';
  nuevoCodigoState.idTipo = '';
  nuevoCodigoState.claveTipo = '';

  limpiarTiposNuevoCodigo();
  actualizarBotonPrincipalNuevoCodigo();
}

/*************************************************
 * CONSECUTIVO
 *************************************************/

// Generacion del Codigo SAP usando nomenclatura y consecutivos existentes.
async function generarConsecutivoNuevoCodigo() {
  if (!nuevoCodigoState.grupoNombre) {
    setNuevoCodigoStatus('Selecciona un grupo.');
    return;
  }

  if (!nuevoCodigoState.familiaNombre || !nuevoCodigoState.idFamilia) {
    setNuevoCodigoStatus('Selecciona una familia.');
    return;
  }

  const descripcionInput = document.getElementById('nuevoCodigoDescripcionVieja');
  const descripcion = descripcionInput.value.trim();

  if (!descripcion) {
    setNuevoCodigoStatus('Escribe una descripcion antes de generar el consecutivo.');
    descripcionInput.focus();
    return;
  }

  setNuevoCodigoStatus('Validando descripcion...');

  const descripcionUsada = await validarDescripcionUsadaNuevoCodigo(descripcion);

  if (descripcionUsada) {
    setNuevoCodigoStatus('Descripcion ya usada en Nombre Pixvs o Nombre SAP. No se puede generar un nuevo codigo.');
    return;
  }

  if (esGrupoPTNuevoCodigo()) {
    if (!nuevoCodigoState.tipoNombre || !nuevoCodigoState.idTipo) {
      setNuevoCodigoStatus('Primero asigna un tipo.');
      actualizarBotonPrincipalNuevoCodigo();
      return;
    }

    generarConsecutivoPorPrecodigoNuevoCodigo({
      precodigo: construirPrecodigoPTNuevoCodigo(),
      longitudConsecutivo: 3
    });

    return;
  }

  if (!nuevoCodigoState.tipoNombre || !nuevoCodigoState.idTipo) {
    setNuevoCodigoStatus('Selecciona un tipo.');
    return;
  }

  if (!nuevoCodigoState.materialNombre || !nuevoCodigoState.idMaterial) {
    setNuevoCodigoStatus('Selecciona un material.');
    return;
  }

  generarConsecutivoPorPrecodigoNuevoCodigo({
    precodigo: construirPrecodigoMPNuevoCodigo(),
    longitudConsecutivo: 4
  });
}

function construirPrecodigoPTNuevoCodigo() {
  const grupo = String(nuevoCodigoState.grupoId || '').trim();
  const familia = String(nuevoCodigoState.idFamilia || '').trim().padStart(2, '0');
  const tipo = String(nuevoCodigoState.idTipo || '').trim().padStart(2, '0');

  if (!grupo || !familia || !tipo) return '';

  return `${grupo}${familia}${tipo}`;
}

function obtenerConsecutivosDesdeCodigos(rows, precodigo, longitudConsecutivo) {
  return rows
    .map(row => String(row[COLUMNA_CODIGO] || '').trim())
    .filter(codigo => codigo.startsWith(precodigo))
    .map(codigo => codigo.slice(
      precodigo.length,
      precodigo.length + longitudConsecutivo
    ))
    .filter(consecutivo => {
      const regex = new RegExp(`^\\d{${longitudConsecutivo}}$`);
      return regex.test(consecutivo);
    })
    .map(consecutivo => Number(consecutivo))
    .filter(numero => Number.isInteger(numero) && numero > 0)
    .sort((a, b) => a - b);
}

function calcularSiguienteConsecutivoNuevoCodigo(consecutivos) {
  const consecutivosUnicos = [...new Set(consecutivos)];
  const consecutivoMasAlto = consecutivosUnicos.length
    ? Math.max(...consecutivosUnicos)
    : 0;

  const huecos = [];

  for (let i = 1; i < consecutivoMasAlto; i++) {
    if (!consecutivosUnicos.includes(i)) {
      huecos.push(i);
    }
  }

  return {
    huecos,
    consecutivoMasAlto,
    siguienteMayor: consecutivoMasAlto + 1
  };
}

function asignarConsecutivoNuevoCodigo(precodigo, consecutivoNumero, longitudConsecutivo) {
  const consecutivo = String(consecutivoNumero).padStart(longitudConsecutivo, '0');
  const codigoFinal = `${precodigo}${consecutivo}`;

  document.getElementById('nuevoCodigoGenerado').textContent = codigoFinal;
  document.getElementById('nuevoCodigoConsecutivo').value = consecutivo;

  setNuevoCodigoStatus('Codigo generado correctamente.');
  prepararVistaPreviaNuevoCodigo();

  if (typeof window.actualizarBotonSubirSolicitud === 'function') {
    window.actualizarBotonSubirSolicitud();
  }
}

/*************************************************
 * GUARDAR
 *************************************************/

// Guardado final en BD_General; el Simulador ADN nunca permite guardar.
async function guardarNuevoCodigoMateriaPrima() {
  if (nuevoCodigoModoSimulador) {
    setNuevoCodigoStatus('Simulacion lista. Este modulo no guarda codigos.');
    return;
  }

  if (!usuarioPuede(0, 1)) {
    mostrarAccesoDenegado();
    return;
  }

  const descripcionInput = document.getElementById('nuevoCodigoDescripcionVieja');
  const codigoGeneradoEl = document.getElementById('nuevoCodigoGenerado');
  const codigoPixvsInput = document.getElementById('nuevoCodigoPixvs');

  const descripcion = descripcionInput.value.trim();
  const codigoNuevo = codigoGeneradoEl.textContent.trim();
  const codigoPixvs = codigoPixvsInput?.value.trim() || null;

  if (!descripcion) {
    setNuevoCodigoStatus('Escribe una descripcion antes de guardar.');
    descripcionInput.focus();
    return;
  }

  if (!codigoNuevo || codigoNuevo === '-') {
    setNuevoCodigoStatus('Primero genera un codigo antes de guardar.');
    return;
  }

  setNuevoCodigoStatus('Validando descripcion antes de guardar...');

  const descripcionUsada = await validarDescripcionUsadaNuevoCodigo(descripcion);

  if (descripcionUsada) {
    setNuevoCodigoStatus('Descripcion ya usada en Nombre Pixvs o Nombre SAP. No se puede guardar.');
    return;
  }

  setNuevoCodigoLoading();

  const responsable = obtenerNombreUsuarioVisible();

  const { error } = await supabaseClient
    .from(TABLA_CODIGOS)
    .insert([
      {
        [COLUMNA_CODIGO_PIXVS]: codigoPixvs,
        [COLUMNA_DESCRIPCION_1]: descripcion,
        [COLUMNA_CODIGO]: codigoNuevo,
        [COLUMNA_DESCRIPCION_2]: construirDescripcionSAPNuevoCodigo(descripcion),
        'Version SAP': '01',
        'Revision SAP': '01',
        'Status': '2 - Local',
        [COLUMNA_FECHA_CAMBIO]: new Date().toISOString(),
        'Responsable': responsable
      }
    ]);

  if (error) {
    setNuevoCodigoStatus('Error al guardar: ' + error.message);
    return;
  }

  setNuevoCodigoStatus('Se genero correctamente.');
  mostrarPopupGuardado('Codigo guardado correctamente.');
}

function construirDescripcionSAPNuevoCodigo(descripcion) {
  const descripcionBase = String(descripcion || '').trim();

  if (!descripcionBase) return '';

  if (esGrupoPTNuevoCodigo()) {
    return descripcionBase;
  }

  const nomenclatura = String(nuevoCodigoState.nomenclaturaMaterial || '').trim();

  if (!nomenclatura) {
    return descripcionBase;
  }

  return `${descripcionBase} ${nomenclatura}`;
}

async function validarDescripcionUsadaNuevoCodigo(descripcion) {
  const descripcionBase = normalizarTextoNuevoCodigo(descripcion);
  const descripcionNueva = normalizarTextoNuevoCodigo(
    construirDescripcionSAPNuevoCodigo(descripcion)
  );

  const { data, error } = await leerSupabasePaginado(
    TABLA_CODIGOS,
    `"${COLUMNA_DESCRIPCION_1}", "${COLUMNA_DESCRIPCION_2}"`
  );

  if (error) {
    setNuevoCodigoStatus('Error al validar descripcion: ' + error.message);
    return true;
  }

  return (data || []).some(row => {
    const descPixvs = normalizarTextoNuevoCodigo(row[COLUMNA_DESCRIPCION_1]);
    const descSap = normalizarTextoNuevoCodigo(row[COLUMNA_DESCRIPCION_2]);

    return (
      descPixvs === descripcionBase ||
      descSap === descripcionBase ||
      descPixvs === descripcionNueva ||
      descSap === descripcionNueva
    );
  });
}

/*************************************************
 * VISTA PREVIA
 *************************************************/

// Vista previa final antes de guardar, con Codigo Pixvs opcional.
function prepararVistaPreviaNuevoCodigo() {
  const descripcionInput = document.getElementById('nuevoCodigoDescripcionVieja');
  const descripcion = descripcionInput.value.trim();
  const codigoGenerado = document.getElementById('nuevoCodigoGenerado').textContent;
  const codigoPixvsInput = document.getElementById('nuevoCodigoPixvs');

  document.getElementById('previewDescripcionVieja').textContent =
    descripcion || '-';

  document.getElementById('previewDescripcionNueva').textContent =
    construirDescripcionSAPNuevoCodigo(descripcion) || '-';

  document.getElementById('previewCodigoNuevo').textContent =
    codigoGenerado || '-';

  if (codigoPixvsInput) {
    codigoPixvsInput.disabled = !codigoGenerado || codigoGenerado === '-';
  }
}

/*************************************************
 * LIMPIEZA
 *************************************************/

function limpiarNuevoCodigo() {
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

  const grupoSelect = document.getElementById('nuevoCodigoGrupo');
  const descripcionInput = document.getElementById('nuevoCodigoDescripcionVieja');
  const consecutivoInput = document.getElementById('nuevoCodigoConsecutivo');
  const codigoPixvsInput = document.getElementById('nuevoCodigoPixvs');

  if (grupoSelect) grupoSelect.value = '';
  if (descripcionInput) descripcionInput.value = '';
  if (consecutivoInput) consecutivoInput.value = 'Automatico';
  if (codigoPixvsInput) codigoPixvsInput.value = '';

  limpiarFamiliasNuevoCodigo();
  limpiarTiposNuevoCodigo();
  limpiarCodigoGeneradoNuevoCodigo();
  limpiarVistaPreviaNuevoCodigo();
  limpiarMaterialesNuevoCodigo();

  setNuevoCodigoStatus('Selecciona un grupo para continuar.');
  actualizarBotonPrincipalNuevoCodigo();
}

function limpiarFamiliasNuevoCodigo() {
  const familiaSelect = document.getElementById('nuevoCodigoFamilia');

  if (!familiaSelect) return;

  familiaSelect.innerHTML = `<option value="">Selecciona una familia</option>`;
  familiaSelect.disabled = true;
}

function limpiarTiposNuevoCodigo() {
  const tipoSelect = document.getElementById('nuevoCodigoTipo');

  if (!tipoSelect) return;

  tipoSelect.innerHTML = `<option value="">Selecciona un tipo</option>`;
  tipoSelect.disabled = true;
}

function limpiarCodigoGeneradoNuevoCodigo() {
  const codigoGenerado = document.getElementById('nuevoCodigoGenerado');

  if (codigoGenerado) {
    codigoGenerado.textContent = '-';
  }

  if (typeof window.actualizarBotonSubirSolicitud === 'function') {
    window.actualizarBotonSubirSolicitud();
  }
}

function limpiarVistaPreviaNuevoCodigo() {
  const descripcionVieja = document.getElementById('previewDescripcionVieja');
  const descripcionNueva = document.getElementById('previewDescripcionNueva');
  const codigoNuevo = document.getElementById('previewCodigoNuevo');
  const codigoPixvsInput = document.getElementById('nuevoCodigoPixvs');

  if (descripcionVieja) descripcionVieja.textContent = '-';
  if (descripcionNueva) descripcionNueva.textContent = '-';
  if (codigoNuevo) codigoNuevo.textContent = '-';
  if (codigoPixvsInput) {
    codigoPixvsInput.value = '';
    codigoPixvsInput.disabled = true;
  }
}

/*************************************************
 * POPUP TIPOS
 *************************************************/

function mostrarPopupTiposNuevoCodigo(coincidencias) {
  cerrarPopupTiposNuevoCodigo();

  window.nuevoCodigoTipoCoincidencias = coincidencias;

  const overlay = document.createElement('div');
  overlay.id = 'popupTiposOverlay';
  overlay.className = 'popup-tipos-overlay';

  const opcionesHtml = coincidencias.map((row, index) => `
    <button type="button" class="popup-tipo-option" onclick="seleccionarTipoDesdePopupNuevoCodigo(${index})">
      <strong>${escapeHtml(row.Tipos)} (${escapeHtml(row.Id)})</strong>
      <span>Clave encontrada: ${escapeHtml(row.Clave)}</span>
    </button>
  `).join('');

  overlay.innerHTML = `
    <div class="popup-tipos">
      <div class="popup-tipos-header">
        <h3>Selecciona el tipo correcto</h3>
        <button type="button" onclick="cerrarPopupTiposNuevoCodigo()">Cerrar</button>
      </div>

      <div class="popup-tipos-body">
        ${opcionesHtml}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setNuevoCodigoStatus('Se encontraron varias coincidencias. Selecciona una opcion.');
}

function seleccionarTipoDesdePopupNuevoCodigo(index) {
  const coincidencias = window.nuevoCodigoTipoCoincidencias || [];
  const row = coincidencias[index];

  if (!row) return;

  seleccionarTipoDetectado(row);
  cerrarPopupTiposNuevoCodigo();
}

function cerrarPopupTiposNuevoCodigo() {
  const overlay = document.getElementById('popupTiposOverlay');

  if (overlay) {
    overlay.remove();
  }

  window.nuevoCodigoTipoCoincidencias = [];
}

/*************************************************
 * POPUP CONSECUTIVO
 *************************************************/

function mostrarPopupConsecutivoNuevoCodigo(info) {
  cerrarPopupConsecutivoNuevoCodigo();

  const longitud = info.longitudConsecutivo || 3;
  const primerHueco = info.huecos[0];
  const primerHuecoTexto = String(primerHueco).padStart(longitud, '0');
  const siguienteMayorTexto = String(info.siguienteMayor).padStart(longitud, '0');

  window.nuevoCodigoConsecutivoInfo = info;

  const overlay = document.createElement('div');
  overlay.id = 'popupConsecutivoOverlay';
  overlay.className = 'popup-tipos-overlay';

  overlay.innerHTML = `
    <div class="popup-tipos">
      <div class="popup-tipos-header">
        <h3>Consecutivos disponibles</h3>
        <button type="button" onclick="cerrarPopupConsecutivoNuevoCodigo()">Cerrar</button>
      </div>

      <div class="popup-tipos-body">
        <p>Se detectaron saltos en la cadena de consecutivos.</p>

        <p>
          Consecutivos libres encontrados:
          <strong>${info.huecos.map(n => String(n).padStart(longitud, '0')).join(', ')}</strong>
        </p>

        <button type="button" class="popup-tipo-option" onclick="usarHuecoConsecutivoNuevoCodigo()">
          <strong>Usar codigo disponible: ${info.precodigo}${primerHuecoTexto}</strong>
          <span>Rellena el primer espacio libre encontrado.</span>
        </button>

        <button type="button" class="popup-tipo-option" onclick="usarMayorConsecutivoNuevoCodigo()">
          <strong>Usar consecutivo mas alto: ${info.precodigo}${siguienteMayorTexto}</strong>
          <span>Continua despues del consecutivo mas alto registrado.</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function usarHuecoConsecutivoNuevoCodigo() {
  const info = window.nuevoCodigoConsecutivoInfo;

  if (!info || !info.huecos.length) return;

  asignarConsecutivoNuevoCodigo(
    info.precodigo,
    info.huecos[0],
    info.longitudConsecutivo
  );

  cerrarPopupConsecutivoNuevoCodigo();
}

function usarMayorConsecutivoNuevoCodigo() {
  const info = window.nuevoCodigoConsecutivoInfo;

  if (!info) return;

  asignarConsecutivoNuevoCodigo(
    info.precodigo,
    info.siguienteMayor,
    info.longitudConsecutivo
  );

  cerrarPopupConsecutivoNuevoCodigo();
}

function cerrarPopupConsecutivoNuevoCodigo() {
  const overlay = document.getElementById('popupConsecutivoOverlay');

  if (overlay) {
    overlay.remove();
  }

  window.nuevoCodigoConsecutivoInfo = null;
}

/*************************************************
 * Materia Prima
 *************************************************/
async function cargarTiposMPNuevoCodigo(familiaNombre) {
  const tipoSelect = document.getElementById('nuevoCodigoTipo');

  if (!tipoSelect) return;

  tipoSelect.innerHTML = `
    <option value="">Cargando tipos...</option>
  `;

  tipoSelect.disabled = true;

  const tiposValidos = obtenerTiposRelacionados(familiaNombre)
    .sort((a, b) => String(a.Tipo).localeCompare(
      String(b.Tipo),
      'es',
      { sensitivity: 'base', numeric: true }
    ));

  if (tiposValidos.length === 0) {
    tipoSelect.innerHTML = `
      <option value="">No hay tipos para esta familia</option>
    `;

    setNuevoCodigoStatus('No se encontraron tipos para la familia seleccionada.');
    return;
  }

  tipoSelect.innerHTML = `
    <option value="">Selecciona un tipo</option>
  `;

  tiposValidos.forEach(row => {
    const option = document.createElement('option');

    option.value = row.Tipo;
    option.textContent = `${row.Tipo} (${row.Id})`;
    option.dataset.idTipo = row.Id;

    tipoSelect.appendChild(option);
  });

  tipoSelect.disabled = false;
  setNuevoCodigoStatus('Selecciona un tipo.');
}

/*************************************************
 * MATERIALES
 *************************************************/

async function cargarMaterialesNuevoCodigo(grupoNombre) {
  const materialBlock = document.getElementById('nuevoCodigoMaterialBlock');
  const materialSelect = document.getElementById('nuevoCodigoMaterial');

  if (!materialBlock || !materialSelect) return;

  materialBlock.style.display = '';

  materialSelect.innerHTML = `<option value="">Cargando materiales...</option>`;
  materialSelect.disabled = true;

  const materialesValidos = obtenerMaterialesRelacionados(grupoNombre)
    .sort((a, b) => String(a.Material).localeCompare(
      String(b.Material),
      'es',
      { sensitivity: 'base', numeric: true }
    ));

  if (materialesValidos.length === 0) {
    materialSelect.innerHTML = `<option value="">No hay materiales para este grupo</option>`;
    setNuevoCodigoStatus('No se encontraron materiales para el grupo seleccionado.');
    return;
  }

  materialSelect.innerHTML = `<option value="">Selecciona un material</option>`;

  materialesValidos.forEach(row => {
    const option = document.createElement('option');

    option.value = row.Material;
    option.textContent = `${row.Material} (${row.Id_Material})`;
    option.dataset.idMaterial = row.Id_Material;
    option.dataset.nomenclaturaMaterial = row.Nomenclatura;

    materialSelect.appendChild(option);
  });

  materialSelect.disabled = false;
  setNuevoCodigoStatus('Selecciona un material.');
}

function onNuevoCodigoMaterialChange() {
  const materialSelect = document.getElementById('nuevoCodigoMaterial');
  const selectedOption = materialSelect.options[materialSelect.selectedIndex];

  nuevoCodigoState.materialNombre = materialSelect.value;
  nuevoCodigoState.idMaterial = selectedOption.dataset.idMaterial || '';
  nuevoCodigoState.nomenclaturaMaterial =
    selectedOption.dataset.nomenclaturaMaterial || '';

  actualizarBotonPrincipalNuevoCodigo();

  limpiarCodigoGeneradoNuevoCodigo();
  limpiarVistaPreviaNuevoCodigo();

  if (!nuevoCodigoState.materialNombre) {
    setNuevoCodigoStatus('Selecciona un material.');
    return;
  }

  setNuevoCodigoStatus('Material seleccionado. Puedes generar consecutivo.');
}

function limpiarMaterialesNuevoCodigo() {
  const materialBlock = document.getElementById('nuevoCodigoMaterialBlock');
  const materialSelect = document.getElementById('nuevoCodigoMaterial');

  nuevoCodigoState.materialNombre = '';
  nuevoCodigoState.idMaterial = '';
  nuevoCodigoState.nomenclaturaMaterial = '';

  if (materialSelect) {
    materialSelect.innerHTML = `<option value="">Selecciona un material</option>`;
    materialSelect.disabled = true;
  }

  if (materialBlock) {
    materialBlock.style.display = 'none';
  }
}

/*************************************************
 * Codigo no PT
 *************************************************/
async function generarConsecutivoPorPrecodigoNuevoCodigo(config) {
  const precodigo = config.precodigo;
  const longitudConsecutivo = config.longitudConsecutivo;

  if (!precodigo) {
    setNuevoCodigoStatus('No se pudo construir el precodigo.');
    return;
  }

  setNuevoCodigoStatus('Buscando consecutivos existentes...');

  const { data, error } = await supabaseClient
    .from(TABLA_CODIGOS)
    .select(`"${COLUMNA_CODIGO}"`)
    .like(COLUMNA_CODIGO, `${precodigo}%`)
    .limit(1000);

  if (error) {
    setNuevoCodigoStatus('Error al buscar consecutivos: ' + error.message);
    return;
  }

  const consecutivos = obtenerConsecutivosDesdeCodigos(
    data || [],
    precodigo,
    longitudConsecutivo
  );

  const siguienteInfo = calcularSiguienteConsecutivoNuevoCodigo(consecutivos);

  if (siguienteInfo.huecos.length > 0) {
    mostrarPopupConsecutivoNuevoCodigo({
      precodigo,
      longitudConsecutivo,
      huecos: siguienteInfo.huecos,
      consecutivoMasAlto: siguienteInfo.consecutivoMasAlto,
      siguienteMayor: siguienteInfo.siguienteMayor
    });

    setNuevoCodigoStatus('Se encontraron consecutivos disponibles intermedios.');
    return;
  }

  asignarConsecutivoNuevoCodigo(
    precodigo,
    siguienteInfo.siguienteMayor,
    longitudConsecutivo
  );
}

/*************************************************
 * Crear Cod No PT
 *************************************************/
function construirPrecodigoMPNuevoCodigo() {
  const grupo = String(nuevoCodigoState.grupoId || '').trim();
  const familia = String(nuevoCodigoState.idFamilia || '').trim().padStart(2, '0');
  const tipo = String(nuevoCodigoState.idTipo || '').trim();
  const material = String(nuevoCodigoState.idMaterial || '').trim().padStart(2, '0');

  if (!grupo || !familia || !tipo || !material) return '';

  return `${grupo}${familia}${tipo}${material}`;
}

/*************************************************
 * UTILIDADES
 *************************************************/

// Mensajes de estado del modulo Nuevo Codigo.
function setNuevoCodigoStatus(message) {
  const status = document.getElementById('nuevoCodigoStatus');

  if (status) {
    status.classList.remove('status-box-loading');
    status.textContent = message;
  }
}

function setNuevoCodigoLoading() {
  const status = document.getElementById('nuevoCodigoStatus');
  if (!status) return;

  status.classList.add('status-box-loading');
  status.innerHTML = `
    <span class="status-loading-label">Generando...</span>
    <span class="status-loading-track" aria-hidden="true">
      <span class="status-loading-bar"></span>
    </span>
  `;
}

function normalizarTextoNuevoCodigo(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizarTextoFlexible(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();
}
