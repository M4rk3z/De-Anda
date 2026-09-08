const elements = {
  urls: document.getElementById('urls'),
  referencePrice: document.getElementById('referencePrice'),
  minDiscount: document.getElementById('minDiscount'),
  scanButton: document.getElementById('scanButton'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  scanned: document.getElementById('scanned'),
  withPrice: document.getElementById('withPrice'),
  baseline: document.getElementById('baseline'),
  alerts: document.getElementById('alerts')
};

const exampleSets = {
  demo: {
    urls: [
      '/demo/laptop-tienda-a.html',
      '/demo/laptop-tienda-b.html',
      '/demo/laptop-error.html',
      '/demo/laptop-sin-precio.html'
    ],
    referencePrice: '',
    minDiscount: 35,
    status: 'Demo cargada: compara tres precios y una pagina sin precio.'
  },
  single: {
    urls: ['/demo/audifonos-oferta.html'],
    referencePrice: '2499',
    minDiscount: 30,
    status: 'Ejemplo cargado: detecta una oferta contra tu precio de referencia.'
  },
  external: {
    urls: [
      'https://tienda-1.com/producto',
      'https://tienda-2.com/producto',
      'https://marketplace.com/producto'
    ],
    referencePrice: '',
    minDiscount: 40,
    status: 'Plantilla cargada: reemplaza estas URLs por paginas reales.'
  }
};

elements.scanButton.addEventListener('click', scanPrices);
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => loadExample(button.dataset.example));
});

loadExample('demo');

async function scanPrices() {
  const urls = elements.urls.value.trim();
  if (!urls) {
    setStatus('Agrega al menos una URL.');
    return;
  }

  elements.scanButton.disabled = true;
  setStatus('Analizando paginas...');
  renderRows([]);

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        referencePrice: elements.referencePrice.value,
        minDiscount: elements.minDiscount.value
      })
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || 'No se pudo analizar.');
    }

    updateMetrics(data);
    renderRows(data.results || []);
    setStatus(data.alerts > 0 ? `Analisis completado con ${data.alerts} alerta(s).` : 'Analisis completado sin alertas.');
  } catch (error) {
    setStatus('Error: ' + error.message);
  } finally {
    elements.scanButton.disabled = false;
  }
}

function loadExample(name) {
  const example = exampleSets[name] || exampleSets.demo;
  const urls = example.urls.map(url => {
    if (/^https?:\/\//i.test(url)) return url;
    return `${window.location.origin}${url}`;
  });

  elements.urls.value = urls.join('\n');
  elements.referencePrice.value = example.referencePrice;
  elements.minDiscount.value = example.minDiscount;
  setStatus(example.status);
}

function updateMetrics(data) {
  elements.scanned.textContent = data.scanned ?? 0;
  elements.withPrice.textContent = data.withPrice ?? 0;
  elements.baseline.textContent = data.baseline ? money(data.baseline) : '---';
  elements.alerts.textContent = data.alerts ?? 0;
}

function renderRows(rows) {
  if (!rows.length) {
    elements.results.innerHTML = '<tr><td colspan="5">Sin resultados.</td></tr>';
    return;
  }

  elements.results.innerHTML = rows.map(row => {
    const price = row.price === null ? '---' : money(row.price);
    const discount = row.discount === null ? '---' : `${row.discount}%`;
    const domain = row.domain || row.url || '';
    const context = row.context ? `<small>${escapeHtml(row.context)}</small>` : '';

    return `
      <tr class="${escapeHtml(row.severity || 'normal')}">
        <td><span class="badge ${escapeHtml(row.severity || 'normal')}">${label(row.severity)}</span></td>
        <td>
          <a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">${escapeHtml(row.title || row.url)}</a>
          <small>${escapeHtml(domain)}</small>
        </td>
        <td><strong>${escapeHtml(price)}</strong>${context}</td>
        <td>${escapeHtml(discount)}</td>
        <td>${escapeHtml(row.reason || row.error || '')}</td>
      </tr>
    `;
  }).join('');
}

function label(severity) {
  if (severity === 'high') return 'Alta';
  if (severity === 'watch') return 'Revisar';
  if (severity === 'error') return 'Error';
  return 'Normal';
}

function money(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN'
  });
}

function setStatus(message) {
  elements.status.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
