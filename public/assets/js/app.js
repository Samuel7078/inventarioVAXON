
window.toggleSidebar = () => {
  const sidebar = document.getElementById('sidebar-menu');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    // slight delay for opacity transition if we added one, but simple remove is fine
  } else {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  }
};

// ====== AUTHENTICATION & BOOT ======
const API_URL = '/api';

function getToken() { return localStorage.getItem('vaxon_token'); }
function setAuth(token, user) { 
  localStorage.setItem('vaxon_token', token);
  localStorage.setItem('vaxon_user', JSON.stringify(user));
  checkAuth();
}
window.logout = () => { localStorage.clear(); checkAuth(); }

function checkAuth() {
  if (!getToken()) {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('md:flex');
  } else {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    try {
      const user = JSON.parse(localStorage.getItem('vaxon_user'));
      document.getElementById('user-info').innerText = user.nombre + " ("+user.rol+")";
    } catch(e){}
    loadView('dashboard');
  }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-pass').value;
  try {
    const res = await fetch(API_URL+'/auth/login', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password})
    });
    const data = await res.json();
    if(res.ok) setAuth(data.token, data.user);
    else document.getElementById('login-err').classList.remove('hidden');
  } catch(e) { console.error(e) }
});

// ====== API WRAPPER ======
async function api(path, method = 'GET', body = null, isFormData = false) {
  const options = { method, headers: {'Authorization': 'Bearer ' + getToken()} };
  if(body) {
    if(isFormData) { options.body = body; } 
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  }
  const res = await fetch(`${API_URL}${path}`, options);
  if (res.status === 401 || res.status === 403) logout();
  if (!res.ok) throw new Error('API Error');
  return res.json();
}

// ====== NOTIFICATION ENGINE ======
const NotifEngine = {
  _items: [],
  _id: 0,
  _visible: false,

  // Create a new task notification (returns taskId)
  addTask(label, subtitle = '') {
    const id = ++this._id;
    this._items.unshift({ id, label, subtitle, status: 'loading', progress: 0, error: null, timestamp: Date.now() });
    this._show();
    this._render();
    return id;
  },

  // Update progress (0-100)
  updateProgress(id, progress, subtitle = null) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    item.progress = Math.min(progress, 100);
    if (subtitle) item.subtitle = subtitle;
    this._render();
  },

  // Mark as success
  success(id, label = null) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    item.status = 'success';
    item.progress = 100;
    if (label) item.label = label;
    this._render();
    // Auto-hide after 8s
    setTimeout(() => { this._removeItem(id); }, 8000);
  },

  // Mark as error
  error(id, errorMsg = 'Error desconocido') {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    item.status = 'error';
    item.error = errorMsg;
    this._render();
  },

  // Remove single item
  _removeItem(id) {
    this._items = this._items.filter(i => i.id !== id);
    this._render();
    if (this._items.length === 0) this._hide();
  },

  // Clear completed items
  clearDone() {
    this._items = this._items.filter(i => i.status === 'loading');
    this._render();
    if (this._items.length === 0) this._hide();
  },

  // Toggle tray visibility
  toggle() {
    if (this._visible) this._hide(); else this._show();
  },

  _show() {
    this._visible = true;
    document.getElementById('notif-tray').style.display = 'flex';
  },
  _hide() {
    this._visible = false;
    document.getElementById('notif-tray').style.display = 'none';
  },

  _render() {
    const list = document.getElementById('notif-list');
    const countEl = document.getElementById('notif-count');
    const activeCount = this._items.filter(i => i.status === 'loading').length;
    countEl.textContent = activeCount;

    // Update header bell badge
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (this._items.length > 0) {
        badge.textContent = this._items.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    if (this._items.length === 0) {
      list.innerHTML = '<div class="px-5 py-6 text-center text-neutral-600 text-xs">Sin procesos activos</div>';
      return;
    }

    list.innerHTML = this._items.map(item => {
      let icon = '';
      let statusColor = '';
      if (item.status === 'loading') {
        icon = '<div class="notif-spinner flex-shrink-0"></div>';
        statusColor = 'text-indigo-400';
      } else if (item.status === 'success') {
        icon = '<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>';
        statusColor = 'text-emerald-400';
      } else if (item.status === 'error') {
        icon = '<svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>';
        statusColor = 'text-red-400';
      }

      const progressHtml = item.status === 'loading' ? `
        <div class="notif-progress">
          <div class="notif-progress-bar" style="width:${item.progress}%"></div>
        </div>` : '';

      const errorHtml = item.status === 'error' && item.error ? `
        <details class="mt-1">
          <summary class="text-[10px] text-red-400 cursor-pointer hover:text-red-300 font-bold">Ver detalles del error</summary>
          <pre class="text-[10px] text-red-300/70 mt-1 whitespace-pre-wrap break-all bg-red-950/30 p-2 rounded-lg">${item.error}</pre>
        </details>` : '';

      const dismissBtn = item.status !== 'loading' ? `<button onclick="NotifEngine._removeItem(${item.id})" class="text-neutral-600 hover:text-white transition-colors flex-shrink-0 ml-2"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : '';

      return `
        <div class="notif-item px-5 py-3.5 flex items-start gap-3">
          ${icon}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold ${statusColor} truncate">${item.label}</p>
            <p class="text-[11px] text-neutral-500 truncate">${item.subtitle}</p>
            ${progressHtml}
            ${errorHtml}
          </div>
          ${dismissBtn}
        </div>
      `;
    }).join('');
  },

  // Ephemeral toast notification (for sync events)
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const id = 'toast-' + Date.now();
    const colors = {
      info: 'border-indigo-500/40 bg-indigo-950/80',
      success: 'border-emerald-500/40 bg-emerald-950/80',
      warning: 'border-amber-500/40 bg-amber-950/80',
      sync: 'border-blue-500/40 bg-blue-950/80'
    };
    const icons = {
      info: '<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
      success: '<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
      warning: '<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
      sync: '<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>'
    };

    const el = document.createElement('div');
    el.id = id;
    el.className = `toast-item border ${colors[type] || colors.info} backdrop-blur-xl rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3`;
    el.innerHTML = `${icons[type] || icons.info}<span class="text-sm font-medium text-white/90 flex-1">${message}</span>`;
    container.appendChild(el);

    // Auto-dismiss after 4s
    setTimeout(() => {
      el.classList.add('toast-exit');
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }
};
window.NotifEngine = NotifEngine;

// ====== DOM & NAVIGATION ======
const appContent = document.getElementById('app-content');
const pageTitle = document.getElementById('page-title');

let viewCache = {
  inventario: null,
  caja: null,
  finanzas: null,
  proveedores: null,
  dashboard: null
};
window.clearCache = () => { viewCache = { inventario: null, caja: null, finanzas: null, proveedores: null, dashboard: null }; };

window.currentActiveView = null;

window.loadView = async (view) => {
  window.currentActiveView = view;
  
  if (viewCache[view]) {
     if (view === 'dashboard') pageTitle.innerText="Vista General";
     if (view === 'inventario') pageTitle.innerText="Inventario de Almacén";
     if (view === 'caja') pageTitle.innerText="Módulo de Ventas y Caja";
     if (view === 'finanzas') pageTitle.innerText="Gestión Financiera ERP";
     if (view === 'proveedores') pageTitle.innerText="Directorio de Proveedores";
     
     document.getElementById('app-content').innerHTML = viewCache[view];
  } else {
      document.getElementById('app-content').innerHTML = `
        <div class="h-full w-full flex flex-col items-center justify-center pt-24 animate-[fadeInZoom_0.3s_ease-out]">
          <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mb-4"></div>
          <span class="text-neutral-500 text-sm font-medium">Sincronizando datos...</span>
        </div>
      `;
      
      if (view === 'dashboard') { pageTitle.innerText="Vista General"; await renderDashboard(); }
      if (view === 'inventario') { pageTitle.innerText="Inventario de Almacén"; await renderInventario(); }
      if (view === 'caja') { pageTitle.innerText="Módulo de Ventas y Caja"; await renderCaja(); }
      if (view === 'finanzas') { pageTitle.innerText="Gestión Financiera ERP"; await renderFinanzas(); }
      if (view === 'proveedores') { pageTitle.innerText="Directorio de Proveedores"; await renderProveedores(); }
      
      if (window.currentActiveView === view) {
         viewCache[view] = document.getElementById('app-content').innerHTML;
      }
  }

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('bg-neutral-900', 'text-white');
    if (l.dataset.view === view) l.classList.add('bg-neutral-900', 'text-white');
  });
};
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
       e.preventDefault(); loadView(e.currentTarget.dataset.view); if(window.innerWidth < 768) { const sb = document.getElementById('sidebar-menu'); if(sb && !sb.classList.contains('-translate-x-full')) window.toggleSidebar(); }
    });
  });

  const logoutBtn = document.getElementById('logout-btn');
  if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
       localStorage.removeItem('vaxon_token');
       localStorage.removeItem('vaxon_user');
       window.location.reload();
    });
  }

  checkAuth();
});


// ====== MODAL ======
function openModal(html) { modalContent.innerHTML = html; modalContainer.classList.remove('hidden'); }
window.closeModal = () => { modalContainer.classList.add('hidden'); modalContent.innerHTML = ''; }

// ====== DASHBOARD ======
async function renderDashboard() {
  const [data, finData] = await Promise.all([api('/dashboard/summary'), api('/finanzas')]);
  if (window.currentActiveView !== 'dashboard') return;

  let safeUser = null;
  let tuGananciaHtml = '';
  try { safeUser = JSON.parse(localStorage.getItem('vaxon_user')); } catch(e){}
  if (safeUser) {
    const miCom = (finData.comisiones || []).find(c => c.usuario_id == safeUser.id || c.usuario_nombre == safeUser.nombre || c.usuario_email == safeUser.email);
    const monto = miCom ? miCom.monto_comision : 0;
    tuGananciaHtml = '<div class="mt-4 flex justify-center"><div class="bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 p-5 rounded-2xl w-full max-w-md flex justify-between items-center cursor-pointer group transition-colors" onclick="const s=this.querySelector(\'.hidden-monto\'); s.classList.toggle(\'blur-md\'); s.classList.toggle(\'select-none\');"><span class="text-indigo-300 text-sm font-bold tracking-tight">Saldo Personal (' + safeUser.nombre + ')</span><span class="hidden-monto text-2xl font-bold text-indigo-400 font-mono blur-md select-none transition-all duration-300">Bs. ' + monto.toFixed(2) + '</span></div></div>';
  }

  appContent.innerHTML = `
    <div class="space-y-6 animate-[fadeInZoom_0.3s_ease-out]">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-blue-600 border border-blue-500 p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
          <div class="block absolute right-[0px] top-[0px] bg-white opacity-10 w-48 h-48 rounded-full blur-3xl"></div>
          <h3 class="text-blue-100 font-medium">Inventario Valorizado</h3>
          <p class="text-4xl font-bold mt-2">Bs. ${data.totalValorizado.toFixed(2)}</p>
        </div>
        <div class="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[2rem]">
          <h3 class="text-emerald-500/80 font-medium">Saldo en Caja Activa</h3>
          <p class="text-4xl font-bold mt-2 text-emerald-400">Bs. ${data.cajaActual ? data.cajaActual.saldoActual.toFixed(2) : '0.00'}</p>
        </div>
      </div>
      ${tuGananciaHtml}
      <div class="mt-8 bg-neutral-900 border border-neutral-800 rounded-[2rem] p-8">
        <h3 class="text-lg font-bold mb-5 text-red-500 flex items-center gap-2">Alertas Stock Crítico</h3>
        ${data.productosBajoStock.length > 0 
          ? '<div class="space-y-3">' + data.productosBajoStock.map(p => `
            <div class="flex justify-between items-center bg-neutral-950 p-4 border border-neutral-800/80 rounded-2xl">
               <span class="font-bold">${p.producto} <span class="font-normal text-neutral-500 ml-1">#${p.modelo}</span></span>
               <span class="text-red-400 text-sm font-bold bg-red-400/20 px-3 py-1 rounded-full">${p.cantidad} ud.</span>
            </div>`).join('') + '</div>'
          : '<p class="text-neutral-500">Todo en orden ✅</p>'}
      </div>
    </div>
  `;
}

// ====== INVENTARIO & CLOUDINARY ======
let invViewStyle = 'list';
let currentEgresos = [];
let allProveedores = [];
let allProductos = [];
let allCombos = [];
let catalogMeta = { categories: [], contacts: [] };
let invSubTab = 'productos'; // 'productos' | 'combos'

// Load catalog meta once
async function loadCatalogMeta() {
  try { catalogMeta = await api('/catalog/meta'); } catch(e) { catalogMeta = { categories: [], contacts: [] }; }
}

async function renderInventario() {
  const [productos, provs] = await Promise.all([ api('/inventario'), api('/proveedores') ]);
  if(window.currentActiveView !== 'inventario') return;
  
  allProveedores = provs;
  allProductos = productos;

  // Sub-tabs
  const tabsHtml = `
    <div class="flex items-center gap-3 mb-6">
      <div class="bg-neutral-950 p-1.5 rounded-xl border border-neutral-800 flex gap-1.5">
        <button onclick="invSubTab='productos'; renderInventario()" class="${invSubTab==='productos'?'bg-indigo-600 text-white':'text-neutral-500 hover:text-white'} text-xs font-bold px-5 py-2.5 rounded-lg transition-all">📦 Productos</button>
        <button onclick="invSubTab='combos'; renderInventarioComboTab()" class="${invSubTab==='combos'?'bg-indigo-600 text-white':'text-neutral-500 hover:text-white'} text-xs font-bold px-5 py-2.5 rounded-lg transition-all">🎁 Combos</button>
      </div>
      <div class="flex-1"></div>
      <button onclick="invViewStyle = invViewStyle==='list'?'grid':'list'; renderInventario()" class="text-sm bg-neutral-900 px-4 py-2 border border-neutral-800 rounded-xl text-neutral-400">Vista: ${invViewStyle.toUpperCase()}</button>
      <button onclick="renderModalInventario()" class="bg-indigo-600 px-6 py-3 rounded-2xl shadow-lg font-bold text-sm">+ Nuevo Artículo</button>
    </div>
  `;

  if (invSubTab === 'combos') {
    renderInventarioComboTab();
    return;
  }

  let contentHtml = '';
  if (invViewStyle === 'grid') {
    contentHtml = `<div class="grid grid-cols-2 md:grid-cols-4 gap-6">`+ productos.map(p => `
      <div class="bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden group">
         <div class="w-full h-40 bg-neutral-950 flex items-center justify-center relative">
           ${p.imagen_url ? `<img src="${p.imagen_url}" class="object-cover w-full h-full group-hover:scale-105 transition-transform" />` : '<span class="text-neutral-600">Sin foto</span>'}
           <span class="absolute top-3 right-3 ${p.cantidad<5?'bg-red-500':'bg-emerald-500'} text-white text-xs font-bold px-2 py-1 rounded-lg">${p.cantidad}</span>
         </div>
         <div class="p-5">
           <p class="font-bold tracking-tight line-clamp-1">${p.producto}</p>
           <p class="text-xs text-neutral-500 mb-2 truncate">${p.modelo} / ${p.proveedor_nombre||'-'}</p>
           <div class="flex justify-between mt-4 items-end">
             <span class="text-xs text-neutral-400">Bs. ${p.costoNeto?.toFixed(2)}</span>
             <span class="font-bold text-indigo-400">Bs. ${p.precio_venta.toFixed(2)}</span>
           </div>
           <button onclick="editInventario(${p.id})" class="mt-3 w-full bg-neutral-800 text-xs text-neutral-400 hover:bg-indigo-600 hover:text-white py-2 rounded-xl transition-colors font-bold">Editar Producto</button>
         </div>
      </div>
    `).join('') + `</div>`;
  } else {
    contentHtml = `
      <div class="bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden">
        <table class="w-full text-left whitespace-nowrap">
          <thead class="bg-neutral-950 font-medium text-neutral-400 text-sm border-b border-neutral-800">
            <tr><th class="py-5 px-6">Producto</th><th class="py-5 px-6">Suministrador</th><th class="py-5 px-6 text-center">Unidades</th><th class="py-5 px-6 text-right">P. Venta</th></tr>
          </thead>
          <tbody class="text-sm">
            ${productos.map(p => `
               <tr class="border-b border-neutral-800/40 hover:bg-neutral-800/40 transition-colors">
                 <td class="py-4 px-6 flex items-center gap-3">
                   ${p.imagen_url ? `<img src="${p.imagen_url}" class="w-10 h-10 rounded-lg object-cover">` : `<div class="w-10 h-10 rounded-lg bg-neutral-800"></div>`}
                   <div><span class="font-bold block">${p.producto}</span><span class="text-xs text-neutral-500">${p.modelo}</span></div>
                 </td>
                 <td class="py-4 px-6 text-neutral-400">${p.proveedor_nombre || '-'}</td>
                 <td class="py-4 px-6 text-center"><span class="${p.cantidad<5?'text-red-400':'text-emerald-400'} font-bold">${p.cantidad}</span></td>
                 <td class="py-4 px-6 text-right">
                   <div class="font-bold text-indigo-400 mb-1">Bs. ${p.precio_venta.toFixed(2)}</div>
                   <button onclick="editInventario(${p.id})" class="text-xs font-bold text-neutral-500 hover:text-indigo-400 underline decoration-dotted">Editar información</button>
                 </td>
               </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }
  appContent.innerHTML = `<div class="animate-[fadeInZoom_0.3s_ease-out]">${tabsHtml}${contentHtml}</div>`;
}

window.renderModalInventario = async () => {
  currentEgresos = [];
  await loadCatalogMeta();
  const catOpts = catalogMeta.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const conOpts = catalogMeta.contacts.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  openModal(`
    <h3 class="text-2xl font-bold mb-4">Ingreso de Mercancía</h3>
    <div class="mb-6 bg-neutral-950 p-2 rounded-xl border border-neutral-800 flex gap-2">
       <button id="tab-new" type="button" onclick="setInvMode('new')" class="w-full bg-neutral-800 text-white text-xs font-bold py-2 rounded-lg transition-colors">Producto Nuevo</button>
       <button id="tab-exist" type="button" onclick="setInvMode('exist')" class="w-full text-neutral-500 hover:text-white text-xs font-bold py-2 rounded-lg transition-colors">Reabastecer Existente</button>
    </div>
    
    <form onsubmit="saveInventario(event)" class="space-y-4">
      <input type="hidden" id="inv-mode" value="new">
      
      <!-- Seccion para Existentes -->
      <div id="sect-exist" class="hidden">
        <label class="text-xs text-neutral-400">Seleccionar Producto a Reabastecer</label>
        <select id="inv-exist-id" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none" onchange="fillExistingData(this.value)">
          <option value="">- Elige un producto -</option>
          ${allProductos.map(p => `<option value="${p.id}" data-pcompra="${p.precio_compra}" data-pventa="${p.precio_venta}">${p.producto} (${p.modelo}) | Stock Act: ${p.cantidad}</option>`).join('')}
        </select>
      </div>

      <!-- Seccion para Nuevos -->
      <div id="sect-new" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="text-xs text-neutral-400">Artículo</label><input type="text" id="inv-prod" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" required></div>
          <div><label class="text-xs text-neutral-400">Modelo</label><input type="text" id="inv-mod" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" required></div>
        </div>
        <div>
          <label class="text-xs text-neutral-400">Proveedor</label>
          <select id="inv-prov" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none">
            <option value="">(Ninguno)</option>${allProveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div><label class="text-xs text-neutral-400" id="lbl-cant">Unidades a Ingresar</label><input type="number" id="inv-cant" required value="1" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 font-bold text-lg text-center" min="1"></div>
        <div><label class="text-xs text-neutral-400">P. Compra Unit.</label><input type="number" step="0.01" id="inv-compra" required value="0" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 font-mono text-center"></div>
        <div><label class="text-xs font-bold text-indigo-400">P. Venta Público</label><input type="number" step="0.01" id="inv-venta" required value="0" class="w-full bg-neutral-950 border border-indigo-500/50 rounded-xl px-3 py-2 text-indigo-400 font-bold text-lg text-center"></div>
      </div>
      
      <div id="sect-photo">
         <label class="text-xs text-neutral-400 block mb-1">Imagen / Foto (Opcional)</label>
         <input type="file" id="inv-file" accept="image/*" class="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white" onchange="document.getElementById('inv-preview').src = window.URL.createObjectURL(this.files[0]); document.getElementById('inv-preview').classList.remove('hidden');" />
         <img id="inv-preview" class="hidden mt-3 w-full h-40 rounded-xl object-cover border border-neutral-800 shadow-inner">
      </div>

      <!-- CATALOG SETTINGS COLLAPSIBLE -->
      <div id="sect-catalog-toggle" class="border border-neutral-800 rounded-2xl overflow-hidden">
        <button type="button" onclick="document.getElementById('sect-catalog-body').classList.toggle('hidden'); this.querySelector('.cat-arrow').classList.toggle('rotate-180')" class="w-full flex items-center justify-between px-4 py-3 bg-neutral-950 hover:bg-neutral-900 transition-colors text-left">
          <span class="text-xs font-bold text-amber-400 flex items-center gap-2">⚙ Ajustes para Catálogo <span class="text-neutral-600 font-normal">(Opcional)</span></span>
          <svg class="cat-arrow w-4 h-4 text-neutral-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <div id="sect-catalog-body" class="hidden p-4 space-y-4 bg-neutral-950/50">
          <div class="grid grid-cols-2 gap-4">
            <div><label class="text-xs text-neutral-400">Categoría</label>
              <select id="inv-cat-category" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none text-sm">
                <option value="">(Sin categoría)</option>${catOpts}
              </select>
            </div>
            <div><label class="text-xs text-neutral-400">Vendedor / Contacto</label>
              <select id="inv-cat-contact" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none text-sm">
                <option value="">(Sin vendedor)</option>${conOpts}
              </select>
            </div>
          </div>
          <div><label class="text-xs text-neutral-400">Descripción para Catálogo</label>
            <textarea id="inv-cat-desc" rows="2" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none text-sm resize-none" placeholder="Descripción detallada del producto..."></textarea>
          </div>
          <div><label class="text-xs text-neutral-400">Mensaje WhatsApp Personalizado</label>
            <input type="text" id="inv-cat-whatsapp" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none text-sm" placeholder="Ej: Consultar por tallas disponibles" oninput="updateWhatsappPreview()">
            <div id="inv-cat-wa-preview" class="mt-2 bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl text-xs text-emerald-300">
              <span class="text-emerald-500 font-bold text-[10px] block mb-1">Vista previa WhatsApp:</span>
              <span id="inv-cat-wa-text">Hola Vaxon! Estoy Interesad@ en: [NOMBRE] Precio: BS [PRECIO]</span>
            </div>
          </div>
          <div><label class="text-xs text-neutral-400 block mb-1">Imágenes Adicionales para Catálogo</label>
            <input type="file" id="inv-cat-images" accept="image/*" multiple class="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white">
            <div id="inv-cat-img-preview" class="flex gap-2 mt-2 flex-wrap"></div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
         <button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>
         <button type="submit" id="inv-btn-submit" class="bg-indigo-600 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg text-white whitespace-nowrap">Consolidar Inventario</button>
      </div>
    </form>
  `);

  // Catalog image preview handler
  const catImgInput = document.getElementById('inv-cat-images');
  if (catImgInput) {
    catImgInput.addEventListener('change', function() {
      const preview = document.getElementById('inv-cat-img-preview');
      preview.innerHTML = '';
      Array.from(this.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.className = 'w-16 h-16 rounded-lg object-cover border border-neutral-700';
        preview.appendChild(img);
      });
    });
  }
};

window.setInvMode = (mode) => {
   document.getElementById('inv-mode').value = mode;
   if(mode === 'new') {
      document.getElementById('tab-new').className = "w-full bg-neutral-800 text-white text-xs font-bold py-2 rounded-lg transition-colors";
      document.getElementById('tab-exist').className = "w-full text-neutral-500 hover:text-white text-xs font-bold py-2 rounded-lg transition-colors";
      document.getElementById('sect-new').classList.remove('hidden');
      document.getElementById('sect-exist').classList.add('hidden');
      document.getElementById('sect-photo').classList.remove('hidden');
      document.getElementById('inv-prod').required = true;
      document.getElementById('inv-mod').required = true;
      document.getElementById('inv-exist-id').required = false;
   } else {
      document.getElementById('tab-exist').className = "w-full bg-neutral-800 text-white text-xs font-bold py-2 rounded-lg transition-colors";
      document.getElementById('tab-new').className = "w-full text-neutral-500 hover:text-white text-xs font-bold py-2 rounded-lg transition-colors";
      document.getElementById('sect-exist').classList.remove('hidden');
      document.getElementById('sect-new').classList.add('hidden');
      document.getElementById('sect-photo').classList.add('hidden'); 
      document.getElementById('inv-prod').required = false;
      document.getElementById('inv-mod').required = false;
      document.getElementById('inv-exist-id').required = true;
   }
}

window.fillExistingData = (id) => {
   if(!id) return;
   const sel = document.getElementById('inv-exist-id');
   const opt = sel.options[sel.selectedIndex];
   document.getElementById('inv-compra').value = opt.getAttribute('data-pcompra') || 0;
   document.getElementById('inv-venta').value = opt.getAttribute('data-pventa') || 0;
}

window.saveInventario = async (e) => {
  e.preventDefault();
  const isRestock = document.getElementById('inv-mode').value === 'exist';

  // Capture all form values BEFORE closing modal
  const formData = {
    isRestock,
    prodId: isRestock ? document.getElementById('inv-exist-id').value : null,
    producto: document.getElementById('inv-prod')?.value || '',
    modelo: document.getElementById('inv-mod')?.value || '',
    cantidad: +document.getElementById('inv-cant').value,
    compra: +document.getElementById('inv-compra').value,
    venta: +document.getElementById('inv-venta').value,
    proveedor: document.getElementById('inv-prov')?.value || null,
  };

  // Capture catalog fields
  const catalogFields = {
    catalog_category_id: document.getElementById('inv-cat-category')?.value || null,
    catalog_contact_id: document.getElementById('inv-cat-contact')?.value || null,
    catalog_description: document.getElementById('inv-cat-desc')?.value || '',
    catalog_whatsapp_msg: document.getElementById('inv-cat-whatsapp')?.value || '',
  };

  let safeUser = 'ADMIN';
  try { safeUser = JSON.parse(localStorage.getItem('vaxon_user'))?.nombre || 'ADMIN'; } catch(ex){}

  // Capture file if present
  const fileInput = document.getElementById('inv-file');
  let fileDataURL = null;
  if (!isRestock && fileInput && fileInput.files.length > 0) {
    fileDataURL = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    });
  }

  // Capture catalog additional images
  const catImgInput = document.getElementById('inv-cat-images');
  let catalogImageDataURLs = [];
  if (!isRestock && catImgInput && catImgInput.files.length > 0) {
    for (const file of catImgInput.files) {
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
      catalogImageDataURLs.push(dataUrl);
    }
  }

  const taskLabel = isRestock 
    ? `Reabasteciendo: ${allProductos.find(p=>p.id==formData.prodId)?.producto || '???'}`
    : `Nuevo: ${formData.producto} (${formData.modelo})`;

  // Close modal immediately — user is free!
  closeModal();

  // Start background notification
  const taskId = NotifEngine.addTask(taskLabel, 'Preparando datos...');

  // Run everything in background
  (async () => {
    try {
      let img_url = null;

      // Step 1: Upload image if present
      if (fileDataURL) {
        NotifEngine.updateProgress(taskId, 20, 'Subiendo foto a Cloudinary...');
        try {
          const pRes = await api('/upload', 'POST', { fileBase64: fileDataURL });
          img_url = pRes.url;
          NotifEngine.updateProgress(taskId, 60, 'Foto subida correctamente');
        } catch(uploadErr) {
          NotifEngine.error(taskId, 'Error subiendo imagen: ' + String(uploadErr));
          return;
        }
      } else {
        NotifEngine.updateProgress(taskId, 40, 'Registrando en base de datos...');
      }

      // Step 2: Save to DB
      NotifEngine.updateProgress(taskId, 70, 'Guardando en inventario...');
      if (formData.isRestock) {
        const targetProduct = allProductos.find(p => p.id == formData.prodId);
        await api('/inventario/' + formData.prodId, 'PUT', {
          producto: targetProduct.producto,
          modelo: targetProduct.modelo,
          cantidad: targetProduct.cantidad + formData.cantidad,
          precio_compra: formData.compra,
          precio_venta: formData.venta,
          proveedor_id: targetProduct.proveedor_id,
          imagen_url: targetProduct.imagen_url
        });
      } else {
        // Upload catalog images if any
        let catalogImageUrls = [];
        if (catalogImageDataURLs.length > 0) {
          NotifEngine.updateProgress(taskId, 75, 'Subiendo imágenes de catálogo...');
          for (const dataUrl of catalogImageDataURLs) {
            try {
              const upRes = await api('/upload', 'POST', { fileBase64: dataUrl });
              catalogImageUrls.push(upRes.url);
            } catch(e) { console.error('Error subiendo imagen catálogo:', e); }
          }
        }

        await api('/inventario', 'POST', {
          proveedor_id: formData.proveedor,
          producto: formData.producto,
          modelo: formData.modelo,
          cantidad: formData.cantidad,
          precio_compra: formData.compra,
          precio_venta: formData.venta,
          usuario_registro: safeUser,
          imagen_url: img_url,
          gastos: [],
          catalog_images: catalogImageUrls,
          catalog_category_id: catalogFields.catalog_category_id ? +catalogFields.catalog_category_id : null,
          catalog_contact_id: catalogFields.catalog_contact_id ? +catalogFields.catalog_contact_id : null,
          catalog_description: catalogFields.catalog_description,
          catalog_whatsapp_msg: catalogFields.catalog_whatsapp_msg
        });
      }

      // Step 3: Success
      NotifEngine.updateProgress(taskId, 100);
      NotifEngine.success(taskId, `✓ ${taskLabel}`);
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'inventario') renderInventario();

    } catch(dbErr) {
      NotifEngine.error(taskId, 'Error en Base de Datos: ' + String(dbErr));
    }
  })();
};


window.editInventario = (id) => {
  const p = allProductos.find(x => x.id === id);
  if (!p) return;
  
  openModal(`
    <h3 class="text-2xl font-bold mb-4">Editando: ${p.producto}</h3>
    <form onsubmit="saveEditInventario(event, ${p.id}, '${p.imagen_url || ''}')" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="text-xs text-neutral-400">Artículo</label><input type="text" id="inv-prod" required value="${p.producto}" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500"></div>
        <div><label class="text-xs text-neutral-400">Modelo</label><input type="text" id="inv-mod" required value="${p.modelo}" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500"></div>
      </div>
      <div><label class="text-xs text-neutral-400">Proveedor</label>
        <select id="inv-prov" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 outline-none">
          <option value="">(Ninguno)</option>${allProveedores.map(prov => `<option value="${prov.id}" ${prov.id === p.proveedor_id ? 'selected':''}>${prov.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div><label class="text-xs text-neutral-400">Cantidad</label><input type="number" id="inv-cant" required value="${p.cantidad}" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 font-bold text-lg text-center"></div>
        <div><label class="text-xs text-neutral-400">P. Compra</label><input type="number" step="0.01" id="inv-compra" required value="${p.precio_compra}" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 font-mono text-center"></div>
        <div><label class="text-xs font-bold text-indigo-400">P. Venta</label><input type="number" step="0.01" id="inv-venta" required value="${p.precio_venta}" class="w-full bg-neutral-950 border border-indigo-500/50 rounded-xl px-3 py-2 text-indigo-400 font-bold text-lg text-center"></div>
      </div>
      <div>
         <label class="text-xs text-neutral-400 block mb-1">Reemplazar Foto (Dejar vacío para conservar foto actual)</label>
         <input type="file" id="inv-file" accept="image/*" class="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white" onchange="document.getElementById('inv-preview').src = window.URL.createObjectURL(this.files[0]); document.getElementById('inv-preview').classList.remove('hidden');" />
         <img id="inv-preview" ${p.imagen_url ? `src="${p.imagen_url}"` : 'class="hidden"'} class="mt-3 w-full h-40 rounded-xl object-cover border border-neutral-800 shadow-inner">
      </div>
      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
         <button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>
         <button type="submit" id="inv-btn-submit" class="bg-indigo-600 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg text-white hover:bg-indigo-500">Guardar Cambios</button>
      </div>
    </form>
  `);
};

window.saveEditInventario = async (e, id, existing_img_url) => {
  e.preventDefault();

  // Capture form data before closing
  const formData = {
    proveedor: document.getElementById('inv-prov')?.value || null,
    producto: document.getElementById('inv-prod').value,
    modelo: document.getElementById('inv-mod').value,
    cantidad: +document.getElementById('inv-cant').value,
    compra: +document.getElementById('inv-compra').value,
    venta: +document.getElementById('inv-venta').value,
  };
  let safeUser = 'ADMIN';
  try { safeUser = JSON.parse(localStorage.getItem('vaxon_user'))?.nombre || 'ADMIN'; } catch(ex){}

  const fileInput = document.getElementById('inv-file');
  let fileDataURL = null;
  if (fileInput && fileInput.files.length > 0) {
    fileDataURL = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(fileInput.files[0]);
    });
  }

  const taskLabel = `Editando: ${formData.producto}`;
  closeModal();

  const taskId = NotifEngine.addTask(taskLabel, 'Preparando cambios...');

  (async () => {
    try {
      let img_url = existing_img_url || null;

      if (fileDataURL) {
        NotifEngine.updateProgress(taskId, 30, 'Reemplazando foto...');
        try {
          const pRes = await api('/upload', 'POST', { fileBase64: fileDataURL });
          img_url = pRes.url;
          NotifEngine.updateProgress(taskId, 60, 'Foto reemplazada');
        } catch(uploadErr) {
          NotifEngine.error(taskId, 'Error subiendo imagen: ' + String(uploadErr));
          return;
        }
      }

      NotifEngine.updateProgress(taskId, 80, 'Actualizando registro...');
      await api('/inventario/' + id, 'PUT', {
        proveedor_id: formData.proveedor,
        producto: formData.producto,
        modelo: formData.modelo,
        cantidad: formData.cantidad,
        precio_compra: formData.compra,
        precio_venta: formData.venta,
        usuario_registro: safeUser,
        imagen_url: img_url
      });

      NotifEngine.success(taskId, `✓ ${taskLabel}`);
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'inventario') renderInventario();

    } catch(err) {
      NotifEngine.error(taskId, 'Error actualizando: ' + String(err));
    }
  })();
};


let networkLock = false;

// ====== CAJA Y VENTAS ======
async function renderCaja() {
  const data = await api('/caja');
  if(window.currentActiveView !== 'caja') return;

  const caja = data.active;
  const history = data.history || [];

  const fmtDate = (d) => { if(!d) return '-'; const dt = new Date(d); return dt.toLocaleDateString('es-BO', {day:'2-digit',month:'short',year:'numeric'}) + ' ' + dt.toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'}); };

  if(!caja) {
    appContent.innerHTML = '<div class="animate-[fadeInZoom_0.3s_ease-out]">'
      + '<div class="bg-neutral-900 border border-neutral-800 p-12 text-center rounded-[2rem] max-w-xl mx-auto mb-8">'
      + '<h3 class="text-2xl font-bold mb-3">Caja Cerrada</h3>'
      + '<p class="text-neutral-500 text-sm mb-6">No hay ninguna caja abierta. Inicia una jornada para registrar ventas.</p>'
      + '<button onclick="openAperturaModal()" class="bg-emerald-600 hover:bg-emerald-500 px-8 py-3.5 rounded-2xl font-bold shadow-lg active:scale-95 transition-all text-white">Abrir Nueva Jornada</button>'
      + '</div>'
      + renderHistorySection(history, fmtDate)
      + '</div>';
    return;
  }

  const trans = caja.Transacciones || [];
  const ingresos = trans.filter(t => t.tipo==='INGRESO').reduce((s,t)=>s+t.monto,0);
  const egresos = trans.filter(t => t.tipo==='EGRESO').reduce((s,t)=>s+t.monto,0);
  const ingresosEfectivo = trans.filter(t => t.tipo==='INGRESO' && t.metodo_pago==='EFECTIVO').reduce((s,t)=>s+t.monto,0);
  const ingresosQR = trans.filter(t => t.tipo==='INGRESO' && t.metodo_pago==='QR').reduce((s,t)=>s+t.monto,0);
  const arqueo = caja.monto_inicial + ingresos - egresos;
  const efectivoFisico = caja.monto_inicial + ingresosEfectivo - egresos;

  const transHtml = trans.map(t => {
    const icoPago = t.metodo_pago === 'QR' ? '📱 QR' : '🪙 Efectivo';
    const prodInfo = t.nombre_producto ? '| ' + t.nombre_producto : '';
    const colorClass = t.tipo==='INGRESO' ? 'text-emerald-400' : 'text-red-400';
    const sign = t.tipo==='INGRESO' ? '+' : '-';
    
    const actionBtns = `<div class="flex gap-2 ml-4">
        <button onclick="editarTransaccionModal(${t.id}, '${t.descripcion.replace(/'/g, "\\'")}', ${t.monto})" class="text-neutral-500 hover:text-indigo-400 transition-colors" title="Editar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
        <button onclick="borrarTransaccionCaja(${t.id}, '${t.tipo}', '${t.descripcion.replace(/'/g, "\\'")}', ${t.monto}, ${t.producto_id || 'null'}, ${t.cantidad || 'null'}, ${t.presupuesto_id || 'null'}, '${t.metodo_pago}', ${caja.id})" class="text-neutral-500 hover:text-red-400 transition-colors" title="Eliminar"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
      </div>`;

    return '<div class="flex justify-between items-center p-3 mb-2 bg-neutral-950 rounded-xl border border-neutral-800/80">'
      + '<div class="min-w-0 flex-1">'
      + '<span class="font-bold text-sm block truncate">' + t.descripcion + '</span>'
      + '<span class="text-[10px] text-neutral-500 mt-0.5 block">' + icoPago + ' ' + prodInfo + ' · ' + fmtDate(t.fecha) + '</span>'
      + '</div>'
      + '<div class="flex items-center"><span class="font-bold font-mono text-lg flex-shrink-0 ml-3 ' + colorClass + '">' + sign + ' Bs ' + t.monto.toFixed(2) + '</span>'
      + actionBtns + '</div></div>';
  }).join('');

  appContent.innerHTML = '<div class="animate-[fadeInZoom_0.3s_ease-out]">'
    + '<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">'
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem]"><p class="text-neutral-500 text-sm">Inicio</p><p class="text-2xl font-bold">Bs. ' + caja.monto_inicial.toFixed(2) + '</p><p class="text-[10px] text-neutral-600 mt-1">' + fmtDate(caja.fecha_apertura) + '</p></div>'
    + '<div class="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[2rem]"><p class="text-emerald-500/80 text-sm">Ingresos</p><p class="text-2xl font-bold text-emerald-400">+ ' + ingresos.toFixed(2) + '</p><p class="text-[10px] text-neutral-500 mt-1">🪙 ' + ingresosEfectivo.toFixed(2) + ' | 📱 ' + ingresosQR.toFixed(2) + '</p></div>'
    + '<div class="bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem]"><p class="text-red-500/80 text-sm">Egresos</p><p class="text-2xl font-bold text-red-500">- ' + egresos.toFixed(2) + '</p></div>'
    + '<div class="bg-emerald-600 p-6 rounded-[2rem] shadow-xl relative overflow-hidden"><div class="absolute right-[-20px] top-[-20px] bg-white opacity-20 w-32 h-32 rounded-full blur-3xl"></div><p class="text-emerald-100 text-sm font-bold uppercase">Corte Libre</p><p class="text-4xl font-bold text-white mt-1">Bs. ' + arqueo.toFixed(2) + '</p></div>'
    + '</div>'
    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">'
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem] col-span-1 space-y-3">'
    + '<button onclick="openVentaModal(' + caja.id + ')" class="w-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-bold p-4 rounded-2xl text-sm border border-emerald-500/20">Nueva Venta (Ingreso)</button>'
    + '<button onclick="openEgresoModal(' + caja.id + ')" class="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold p-4 rounded-2xl text-sm border border-red-500/20">Registrar Egreso</button>'
    + '<hr class="border-neutral-800 my-4"/>'
    + '<button onclick="confirmarCierreCaja(' + caja.id + ', ' + caja.monto_inicial + ', ' + ingresosEfectivo + ', ' + ingresosQR + ', ' + egresos + ', ' + efectivoFisico + ', ' + arqueo + ')" class="w-full text-xs font-bold text-red-500 py-3 block text-center bg-red-500/5 hover:bg-red-500/10 rounded-xl border border-red-500/10 transition-colors">Cerrar Jornada</button>'
    + '</div>'
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem] col-span-2 overflow-y-auto" style="max-height: 400px;">'
    + '<h4 class="text-sm font-bold text-neutral-400 mb-3 uppercase tracking-wider">Movimientos (' + trans.length + ')</h4>'
    + (trans.length === 0 ? '<p class="text-neutral-600 text-sm py-8 text-center">Sin movimientos registrados aún</p>' : '')
    + transHtml
    + '</div>'
    + '</div>'
    + (history.length > 0 ? '<div class="mt-8">' + renderHistorySection(history, fmtDate) + '</div>' : '')
    + '</div>';
}

function renderHistorySection(history, fmtDate) {
  if (history.length === 0) return '';
  const rows = history.map(h => {
    const ganancia = h.total_ingresos - h.total_egresos;
    const ganColor = ganancia >= 0 ? 'text-emerald-400' : 'text-red-400';
    const ganSign = ganancia >= 0 ? '+' : '';
    return '<div class="bg-neutral-950 border border-neutral-800/60 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center gap-2 mb-1"><span class="text-sm font-bold">' + fmtDate(h.fecha_apertura) + '</span><span class="text-neutral-600">→</span><span class="text-sm font-bold">' + fmtDate(h.fecha_cierre) + '</span></div>'
      + '<div class="flex flex-wrap gap-3 text-xs"><span class="text-neutral-500">Responsable: <b class="text-neutral-300">' + h.responsable + '</b></span><span class="text-neutral-500">' + h.total_transacciones + ' mov.</span><span class="text-emerald-400 font-bold">+' + h.total_ingresos.toFixed(2) + '</span><span class="text-red-400 font-bold">-' + h.total_egresos.toFixed(2) + '</span></div>'
      + '</div>'
      + '<div class="flex items-center gap-4">'
      + '<div class="text-right"><p class="text-[10px] text-neutral-500 uppercase">Balance</p><p class="text-lg font-bold font-mono ' + ganColor + '">' + ganSign + ganancia.toFixed(2) + '</p></div>'
      + '<button onclick="verDetalleCaja(' + h.id + ')" class="bg-neutral-800 hover:bg-neutral-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors text-neutral-300 whitespace-nowrap">Detalles</button>'
      + '</div></div>';
  }).join('');

  return '<div class="bg-neutral-900 border border-neutral-800 rounded-[2rem] p-6">'
    + '<h3 class="text-lg font-bold mb-4 tracking-tight flex items-center gap-2"><svg class="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>Historial de Cajas Cerradas</h3>'
    + '<div class="space-y-2">' + rows + '</div></div>';
}

window.openAperturaModal = () => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Abrir Caja del Día</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div><form onsubmit="actionCaja(event, \'APERTURA\')" class="space-y-4"><div><label class="text-xs text-neutral-400">Monto Inicial en Caja (Bs)</label><input type="number" step="0.01" id="caja-monto" class="w-full bg-neutral-950 p-4 rounded-xl font-bold text-2xl text-center outline-none border border-emerald-500/30" required/></div><button class="w-full bg-emerald-600 hover:bg-emerald-500 mt-4 p-3 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-all">Abrir Caja</button></form>');
};

window.openVentaModal = async (caja_id) => {
  const [inv, combos] = await Promise.all([api('/inventario'), api('/combos').catch(() => [])]);
  const optHtml = inv.map(p => '<option value="' + p.id + '" data-price="' + p.precio_venta + '" data-type="product">[Stk: ' + p.cantidad + '] ' + p.producto + ' - Bs. ' + p.precio_venta + '</option>').join('');
  const comboOptHtml = combos.map(c => '<option value="' + c.id + '" data-price="' + c.precio_venta + '" data-type="combo">🎁 COMBO: ' + c.nombre + ' - Bs. ' + c.precio_venta + '</option>').join('');
  openModal('<div class="flex justify-between items-center mb-4"><h3 class="text-2xl font-bold text-emerald-400">Punto de Venta</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="actionCaja(event, \'TRANSACCION\', \'INGRESO\', ' + caja_id + ')" class="space-y-4">'
    + '<input type="hidden" id="trans-combo-id" value="">'
    + '<div><label class="text-xs text-neutral-400">Producto / Combo (Autodescuento de Stock)</label><select id="trans-prod" class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm outline-none"><option value="" data-type="">- Venta Libre Especial -</option>' + optHtml + (comboOptHtml ? '<optgroup label="── Combos ──">' + comboOptHtml + '</optgroup>' : '') + '</select></div>'
    + '<div class="grid grid-cols-2 gap-4"><div><label class="text-xs text-neutral-400">Cant.</label><input type="number" id="trans-cant" value="1" min="1" class="w-full bg-neutral-950 border border-emerald-500/30 p-3 text-center font-bold font-mono rounded-xl outline-none" required></div><div><label class="text-xs text-neutral-400">Precio Total (Bs)</label><input type="number" step="0.01" id="trans-monto" class="w-full bg-neutral-950 border border-emerald-500/30 p-3 text-center font-bold text-lg font-mono text-emerald-400 rounded-xl outline-none" required></div></div>'
    + '<div><label class="text-xs text-neutral-400">Concepto</label><input type="text" id="trans-desc" value="Venta Directa" class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl" required></div>'
    + '<div><label class="text-xs text-neutral-400">Cobrado Vía</label><select id="trans-metodo" class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm outline-none font-bold"><option value="EFECTIVO">🪙 Físico / Efectivo</option><option value="QR">📱 QR / Transferencia</option></select></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button><button class="flex-1 bg-emerald-600 hover:bg-emerald-500 p-3 rounded-xl font-bold shadow-lg active:scale-95 text-white">Efectuar Cobro</button></div>'
    + '</form>');
  document.getElementById('trans-prod').addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    const px = opt.getAttribute('data-price');
    const type = opt.getAttribute('data-type');
    const comboIdEl = document.getElementById('trans-combo-id');
    if (type === 'combo') {
      comboIdEl.value = this.value;
      // Clear product value so backend knows it's a combo
      // The select value will be used for combo_id, not producto_id
    } else {
      comboIdEl.value = '';
    }
    if(px) document.getElementById('trans-monto').value = (parseFloat(px) * parseInt(document.getElementById('trans-cant').value)).toFixed(2);
  });
};

window.openEgresoModal = async (caja_id) => {
  // Fetch budgets to show as options
  const finData = await api('/finanzas');
  const presupuestos = finData.presupuestos || [];
  const budgetOpts = presupuestos.map(p => {
    const disp = p.disponible.toFixed(2);
    return '<option value="' + p.id + '" data-disp="' + p.disponible + '">[' + p.nombre + '] Disponible: Bs. ' + disp + '</option>';
  }).join('');

  openModal('<div class="flex justify-between items-center mb-4"><h3 class="text-2xl font-bold text-red-500">Salida Operativa</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="actionCaja(event, \'TRANSACCION\', \'EGRESO\', ' + caja_id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Presupuesto / Etiqueta</label><select id="trans-presupuesto" class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-sm outline-none" onchange="updateBudgetInfo()"><option value="">— Egreso Libre (sin presupuesto) —</option>' + budgetOpts + '</select></div>'
    + '<div id="budget-info-bar" class="hidden bg-amber-950/30 border border-amber-500/20 p-3 rounded-xl text-sm"><span class="text-amber-400 font-bold">Disponible: </span><span id="budget-disp-val" class="font-mono font-bold text-amber-300">Bs. 0.00</span></div>'
    + '<div><label class="text-xs text-neutral-400">Monto A Retirar (Bs)</label><input type="number" step="0.01" id="trans-monto" class="w-full bg-neutral-950 border border-neutral-800 p-4 text-center font-bold text-3xl font-mono text-red-400 rounded-xl outline-none" required></div>'
    + '<div><label class="text-xs text-neutral-400">Concepto</label><input type="text" id="trans-desc" placeholder="Pasajes, Almuerzo..." class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl" required></div>'
    + '<input type="hidden" id="trans-metodo" value="EFECTIVO"><input type="hidden" id="trans-prod" value=""><input type="hidden" id="trans-cant" value="">'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button><button class="flex-1 bg-red-600 hover:bg-red-500 p-3 rounded-xl font-bold shadow-lg text-white">Remover Dinero</button></div>'
    + '</form>');
};

window.updateBudgetInfo = () => {
  const sel = document.getElementById('trans-presupuesto');
  const bar = document.getElementById('budget-info-bar');
  const val = document.getElementById('budget-disp-val');
  if (sel.value) {
    const disp = sel.options[sel.selectedIndex].getAttribute('data-disp');
    val.textContent = 'Bs. ' + parseFloat(disp).toFixed(2);
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
};

window.confirmarCierreCaja = (cajaId, montoInicial, ingEfectivo, ingQR, egresos, efectivoFisico, arqueoTotal) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-red-400">Confirmar Cierre de Caja</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<div class="space-y-3 mb-6">'
    + '<div class="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl"><p class="text-xs text-neutral-500 uppercase font-bold mb-2">Desglose de Efectivo Físico</p><div class="grid grid-cols-2 gap-2 text-sm"><span class="text-neutral-400">Apertura:</span><span class="text-right font-mono font-bold">Bs. ' + montoInicial.toFixed(2) + '</span><span class="text-neutral-400">+ Ventas Efectivo:</span><span class="text-right font-mono font-bold text-emerald-400">Bs. ' + ingEfectivo.toFixed(2) + '</span><span class="text-neutral-400">- Egresos:</span><span class="text-right font-mono font-bold text-red-400">Bs. ' + egresos.toFixed(2) + '</span></div><hr class="border-neutral-800 my-3"/><div class="flex justify-between items-center"><span class="text-sm font-bold text-amber-400">🪙 Debería haber en efectivo:</span><span class="text-2xl font-black font-mono text-amber-400">Bs. ' + efectivoFisico.toFixed(2) + '</span></div></div>'
    + '<div class="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl"><div class="flex justify-between items-center"><span class="text-sm text-neutral-400">📱 Ventas por QR/Transferencia:</span><span class="text-lg font-bold font-mono text-blue-400">Bs. ' + ingQR.toFixed(2) + '</span></div></div>'
    + '<div class="bg-emerald-950/40 border border-emerald-500/20 p-4 rounded-2xl"><div class="flex justify-between items-center"><span class="text-sm font-bold text-emerald-400">Balance Total de la Jornada:</span><span class="text-2xl font-black font-mono text-emerald-400">Bs. ' + arqueoTotal.toFixed(2) + '</span></div></div>'
    + '</div>'
    + '<p class="text-xs text-neutral-500 text-center mb-4">¿El dinero físico en caja coincide con el reporte? Esta acción es irreversible.</p>'
    + '<div class="flex gap-3"><button onclick="closeModal()" class="flex-1 bg-neutral-800 hover:bg-neutral-700 p-3 rounded-xl font-bold text-sm text-neutral-300 transition-colors">No, Revisar</button><button onclick="ejecutarCierreCaja(' + cajaId + ')" class="flex-1 bg-red-600 hover:bg-red-500 p-3 rounded-xl font-bold text-sm text-white shadow-lg active:scale-95 transition-all">Sí, Cerrar Caja</button></div>');
};

window.ejecutarCierreCaja = async (id) => {
  closeModal();
  const taskId = NotifEngine.addTask('Cierre de Caja', 'Cerrando jornada...');

  (async () => {
    try {
      NotifEngine.updateProgress(taskId, 50, 'Calculando monto final...');
      await api('/caja', 'POST', {action:'CIERRE', payload:{caja_id: id}});
      NotifEngine.success(taskId, '✓ Caja cerrada exitosamente');
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'caja') renderCaja();
    } catch(err) {
      NotifEngine.error(taskId, 'Error cerrando caja: ' + String(err));
    }
  })();
};

window.verDetalleCaja = async (id) => {
  const caja = await api('/caja/' + id);
  const trans = caja.Transacciones || [];
  const ingresos = trans.filter(t => t.tipo==='INGRESO').reduce((s,t)=>s+t.monto,0);
  const egresos = trans.filter(t => t.tipo==='EGRESO').reduce((s,t)=>s+t.monto,0);
  const ingEfectivo = trans.filter(t => t.tipo==='INGRESO' && t.metodo_pago==='EFECTIVO').reduce((s,t)=>s+t.monto,0);
  const ingQR = trans.filter(t => t.tipo==='INGRESO' && t.metodo_pago==='QR').reduce((s,t)=>s+t.monto,0);
  const fmtDate = (d) => { if(!d) return '-'; const dt = new Date(d); return dt.toLocaleDateString('es-BO', {day:'2-digit',month:'short',year:'numeric'}) + ' ' + dt.toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'}); };

  const transHtml = trans.map(t => {
    const ico = t.metodo_pago === 'QR' ? '📱 QR' : '🪙 Efectivo';
    const prod = t.nombre_producto ? '| ' + t.nombre_producto : '';
    const col = t.tipo==='INGRESO' ? 'text-emerald-400' : 'text-red-400';
    const s = t.tipo==='INGRESO' ? '+' : '-';
    return '<div class="flex justify-between items-center p-3 bg-neutral-950 rounded-xl border border-neutral-800/60"><div class="min-w-0 flex-1"><span class="font-bold text-sm block truncate">' + t.descripcion + '</span><span class="text-[10px] text-neutral-500 block">' + ico + ' ' + prod + ' · ' + fmtDate(t.fecha) + '</span></div><span class="font-bold font-mono flex-shrink-0 ml-3 ' + col + '">' + s + ' Bs ' + t.monto.toFixed(2) + '</span></div>';
  }).join('');

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Detalle de Caja #' + caja.id + '</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<div class="space-y-3 mb-4"><div class="grid grid-cols-2 gap-2 text-sm"><span class="text-neutral-500">Responsable:</span><span class="font-bold">' + caja.responsable + '</span><span class="text-neutral-500">Apertura:</span><span class="font-mono text-xs">' + fmtDate(caja.fecha_apertura) + '</span><span class="text-neutral-500">Cierre:</span><span class="font-mono text-xs">' + fmtDate(caja.fecha_cierre) + '</span><span class="text-neutral-500">Monto Inicial:</span><span class="font-bold font-mono">Bs. ' + caja.monto_inicial.toFixed(2) + '</span><span class="text-neutral-500">Monto Final:</span><span class="font-bold font-mono text-emerald-400">Bs. ' + (caja.monto_final || 0).toFixed(2) + '</span></div>'
    + '<div class="flex flex-wrap gap-3 text-sm"><span class="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg font-bold">+' + ingresos.toFixed(2) + '</span><span class="bg-red-500/10 text-red-400 px-3 py-1 rounded-lg font-bold">-' + egresos.toFixed(2) + '</span><span class="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-lg font-bold">📱 QR: ' + ingQR.toFixed(2) + '</span><span class="bg-amber-500/10 text-amber-400 px-3 py-1 rounded-lg font-bold">🪙 Efe: ' + ingEfectivo.toFixed(2) + '</span></div></div>'
    + '<div class="overflow-y-auto max-h-[300px] space-y-2"><h4 class="text-xs font-bold text-neutral-500 uppercase tracking-wider">Movimientos (' + trans.length + ')</h4>' + transHtml + '</div>');
};

window.actionCaja = async (e, action, tipo=null, caja_id=null) => {
   e.preventDefault();

   // Capture data before closing
   let payload = {};
   let taskLabel = '';
   if(action==='APERTURA') {
     let safeUser = 'ADMIN';
     try { safeUser = JSON.parse(localStorage.getItem('vaxon_user'))?.nombre || 'ADMIN'; } catch(ex){}
     payload = { monto: +document.getElementById('caja-monto').value, responsable: safeUser };
     taskLabel = 'Apertura de Caja: Bs. ' + payload.monto.toFixed(2);
   }
   else if(action==='TRANSACCION') {
     const comboIdVal = document.getElementById('trans-combo-id') ? document.getElementById('trans-combo-id').value : '';
     const transProdEl = document.getElementById('trans-prod');
     const prodSelectType = (transProdEl && transProdEl.options) ? (transProdEl.options[transProdEl.selectedIndex]?.getAttribute('data-type') || '') : '';
     payload = { caja_id, tipo, 
        monto: +document.getElementById('trans-monto').value, 
        descripcion: document.getElementById('trans-desc').value,
        metodo_pago: document.getElementById('trans-metodo').value,
        producto_id: (prodSelectType === 'combo' ? null : (document.getElementById('trans-prod').value || null)),
        combo_id: comboIdVal || null,
        cantidad: document.getElementById('trans-cant').value ? +document.getElementById('trans-cant').value : null,
        presupuesto_id: document.getElementById('trans-presupuesto') ? (document.getElementById('trans-presupuesto').value || null) : null
     };
     taskLabel = (tipo === 'INGRESO' ? 'Venta: ' : 'Egreso: ') + payload.descripcion;
   }

   closeModal();
   const taskId = NotifEngine.addTask(taskLabel, 'Procesando...');

   (async () => {
     try {
       NotifEngine.updateProgress(taskId, 50, 'Enviando a base de datos...');
       await api('/caja', 'POST', { action, payload });
       NotifEngine.success(taskId, '\u2713 ' + taskLabel);
       window.clearCache(); window._bumpLocalVersion();
       if (window.currentActiveView === 'caja') renderCaja();
     } catch(err) {
       NotifEngine.error(taskId, 'Error en Caja: ' + String(err));
     }
   })();
}

// Lógica de Edición y Borrado de Transacciones
window.lastDeletedTx = null;

window.editarTransaccionModal = (id, desc, monto) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Editar Transacción</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarEdicionTransaccion(event, ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Descripción</label><input type="text" id="edit-tx-desc" value="' + desc + '" required class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl outline-none"></div>'
    + '<div><label class="text-xs text-neutral-400">Monto (Bs)</label><input type="number" step="0.01" id="edit-tx-monto" value="' + monto + '" required class="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl outline-none font-bold font-mono"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold shadow-lg text-white">Guardar Cambios</button></div>'
    + '</form>');
};

window.ejecutarEdicionTransaccion = async (e, id) => {
  e.preventDefault();
  const desc = document.getElementById('edit-tx-desc').value;
  const monto = +document.getElementById('edit-tx-monto').value;
  closeModal();
  const taskId = NotifEngine.addTask('Editando Transacción', 'Actualizando y ajustando dependencias...');
  try {
    await api('/caja', 'POST', { action: 'EDITAR_TRANSACCION', payload: { id, descripcion: desc, monto } });
    NotifEngine.success(taskId, '✓ Transacción actualizada');
    window.clearCache(); window._bumpLocalVersion();
    if (window.currentActiveView === 'caja') renderCaja();
  } catch(err) {
    NotifEngine.error(taskId, 'Error editando: ' + String(err));
  }
};

window.borrarTransaccionCaja = async (id, tipo, desc, monto, prod_id, cant, pres_id, metodo, caja_id) => {
  const taskId = NotifEngine.addTask('Eliminando Transacción', 'Revirtiendo cambios...');
  try {
    await api('/caja', 'POST', { action: 'ELIMINAR_TRANSACCION', payload: { id } });
    // Guardar para Ctrl+Z
    window.lastDeletedTx = { action: 'TRANSACCION', payload: { caja_id, tipo, monto, descripcion: desc, metodo_pago: metodo, producto_id: prod_id, cantidad: cant, presupuesto_id: pres_id } };
    NotifEngine.success(taskId, '✓ Eliminada. Presiona Ctrl+Z para deshacer.');
    window.clearCache(); window._bumpLocalVersion();
    if (window.currentActiveView === 'caja') renderCaja();
  } catch(err) {
    NotifEngine.error(taskId, 'Error eliminando: ' + String(err));
  }
};

window.revertirUltimaTransaccion = async () => {
  if (!window.lastDeletedTx) return;
  const tx = window.lastDeletedTx;
  window.lastDeletedTx = null; // Consume
  const taskId = NotifEngine.addTask('Deshaciendo', 'Restaurando transacción...');
  try {
    await api('/caja', 'POST', tx);
    NotifEngine.success(taskId, '✓ Transacción restaurada');
    window.clearCache(); window._bumpLocalVersion();
    if (window.currentActiveView === 'caja') renderCaja();
  } catch(err) {
    NotifEngine.error(taskId, 'Error restaurando: ' + String(err));
  }
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    if (window.lastDeletedTx) {
      window.revertirUltimaTransaccion();
    }
  }
});

// ====== FINANZAS V2 ======
let finanzasData = null;

async function renderFinanzas() {
  const fin = await api('/finanzas');
  if(window.currentActiveView !== 'finanzas') return;
  finanzasData = fin;
  const m = fin.metricas;

  // Check for pending resets
  if (fin.resetsPendientes && fin.resetsPendientes.length > 0) {
    fin.resetsPendientes.forEach(r => {
      NotifEngine.toast('Presupuesto "' + r.nombre + '" pendiente de reset mensual', 'warning');
    });
  }

  const presCards = fin.presupuestos.map(p => {
    const isProductoGlobal = p.alcance === 'PRODUCTO_GLOBAL';
    const isProductoEsp = p.alcance === 'PRODUCTO_ESPECIFICO';
    const isProducto = isProductoGlobal || isProductoEsp;
    
    const pctUsado = isProducto
      ? (p.fondos_extra > 0 ? Math.min((p.total_gastado / p.fondos_extra) * 100, 100) : 0)
      : (p.monto_asignado > 0 ? Math.min((p.total_gastado / (p.monto_asignado + p.fondos_extra)) * 100, 100) : 0);
    const tipoLabel = isProducto
      ? (p.tipo === 'FIJO' ? 'Bs.' + p.monto_fijo + '/ud' : p.porcentaje_asignacion + '% x venta')
      : (p.tipo === 'FIJO' ? 'Fijo: Bs. ' + p.monto_fijo.toFixed(2) : p.porcentaje_asignacion + '% de ganancia');
    const barColor = pctUsado > 80 ? 'bg-red-500' : pctUsado > 50 ? 'bg-amber-500' : 'bg-emerald-500';
    
    const alcanceBadge = isProductoGlobal
      ? '<span class="ml-2 text-[10px] bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded font-bold">🌎 Todo el Inventario</span>'
      : isProductoEsp
        ? '<span class="ml-2 text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-bold">📦 ' + (p.producto_nombre || 'Producto') + '</span>'
        : '<span class="ml-2 text-[10px] bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded font-bold">🏷 General</span>';

    const priorityBadge = '<span class="ml-2 text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">#' + p.prioridad + '</span>';

    return '<div class="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl transition-all hover:border-neutral-700" style="border-left: 4px solid ' + (p.color_hex || '#6366f1') + '">'
      + '<div class="flex justify-between items-start mb-2"><div><button onclick="editarPresupuestoModal(' + p.id + ')" class="mr-2 text-neutral-500 hover:text-indigo-400 transition-colors"><svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button><span class="font-bold text-base">' + p.nombre + '</span>' + alcanceBadge + priorityBadge + '<span class="ml-2 text-[10px] bg-neutral-800 px-2 py-0.5 rounded font-mono text-neutral-400">' + (p.tipo === 'MANUAL' ? 'Manual (Caja fuerte)' : tipoLabel) + '</span></div>'
      + '<span class="text-[10px] font-bold ' + (p.disponible > 0 ? 'text-emerald-400' : 'text-red-400') + '">' + (p.disponible >= 0 ? 'Bs. ' + p.disponible.toFixed(2) : '-Bs. ' + Math.abs(p.disponible).toFixed(2)) + '</span></div>'
      + '<div class="w-full bg-neutral-800 rounded-full h-2 mb-3"><div class="h-2 rounded-full transition-all ' + barColor + '" style="width:' + pctUsado.toFixed(0) + '%"></div></div>'
      + '<div class="flex gap-2 text-[10px] text-neutral-500 mb-3"><span>Asignado: Bs. ' + p.monto_asignado.toFixed(2) + '</span>'
      + (p.fondos_extra > 0 ? '<span>+ Extra/Abonos: Bs. ' + p.fondos_extra.toFixed(2) + '</span>' : '')
      + '<span>Gastado: Bs. ' + p.total_gastado.toFixed(2) + '</span></div>'
      + '<div class="flex gap-2">'
      + '<button onclick="gastarFondoModal(' + p.id + ', \'' + p.nombre.replace(/'/g, "\\'") + '\')" class="flex-1 text-[11px] font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-lg border border-red-500/10 transition-colors">Gastar</button>'
      + '<button onclick="transferirFondosModal(' + p.id + ', \'' + p.nombre.replace(/'/g, "\\'") + '\')" class="flex-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/10 transition-colors">Abonar</button>'
      + '<button onclick="verDetallePresupuesto(' + p.id + ', ' + p.disponible + ')" class="flex-1 text-[11px] font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 p-2 rounded-lg transition-colors">Detalles</button>'
      + '</div></div>';
  }).join('');

  const comisRows = fin.comisiones.map(c => {
    const pctCobrado = c.monto_generado > 0 ? ((c.total_pagado / c.monto_generado) * 100) : 0;
    return '<div class="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl transition-all hover:border-neutral-700">'
      + '<div class="flex justify-between items-start mb-3"><div><button onclick="editarComisionModal(' + c.id + ', ' + c.usuario_id + ', \\\'' + c.usuario_nombre + '\\\', ' + c.porcentaje + ')" class="mr-2 text-neutral-500 hover:text-indigo-400 transition-colors" title="Editar %"><svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button><span class="font-bold text-base text-white">' + c.usuario_nombre + '</span><span class="ml-2 text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">Comisión: ' + c.porcentaje + '%</span></div>'
      + '<div class="text-right flex flex-col"><span class="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Saldo</span><span class="text-xs font-bold text-emerald-400">Bs. ' + c.monto_comision.toFixed(2) + '</span></div></div>'
      + '<div class="w-full bg-neutral-800 rounded-full h-2 mb-3"><div class="h-2 rounded-full transition-all bg-emerald-500" style="width:' + Math.min(100, pctCobrado).toFixed(0) + '%"></div></div>'
      + '<div class="flex gap-2 text-[10px] text-neutral-500 mb-4"><span>Generado: Bs. ' + c.monto_generado.toFixed(2) + '</span>'
      + '<span>Retirado: Bs. ' + c.total_pagado.toFixed(2) + '</span></div>'
      + '<div class="flex gap-2">'
      + '<button onclick="abrirPagarComisionModal(' + c.usuario_id + ', ' + c.monto_comision + ', \\\'' + c.usuario_nombre.replace(/'/g, "\\'") + '\\\')" class="flex-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/10 transition-colors">Pagar Adelanto</button>'
      + '<button onclick="verDetalleComision(' + c.usuario_id + ', \\\'' + c.usuario_nombre.replace(/'/g, "\\'") + '\\\')" class="flex-1 text-[11px] font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 p-2 rounded-lg transition-colors">Historial</button>'
      + '<button onclick="ejecutarFinanzas(null, \'ELIMINAR_COMISION\', null, {comision_id:' + c.id + '})" class="text-neutral-500 hover:text-red-400 transition-colors p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700" title="Eliminar"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>'
      + '</div></div>';
  }).join('');

  appContent.innerHTML = '<div class="animate-[fadeInZoom_0.3s_ease-out] space-y-6">'
    // ROW 1: Main metrics
    + '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">'
    + '<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl"><p class="text-xs text-neutral-500">Ventas Totales</p><p class="text-xl font-bold">Bs. ' + m.ingresosBrutos.toFixed(2) + '</p></div>'
    + '<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl relative group"><p class="text-xs text-neutral-500">Capital Invertido (Mercancía)</p><p class="text-xl font-bold text-neutral-300">Bs. ' + m.capitalInvertido.toFixed(2) + '</p>'
    + '<div class="mt-3 pt-3 border-t border-neutral-800 flex justify-between items-center"><div class="flex items-center gap-2"><p class="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Respaldo:</p>'
    + '<span id="cap-blur-text" class="text-xs font-mono font-bold text-indigo-400 blur-[4px] cursor-pointer hover:blur-none transition-all duration-300 select-none" onclick="this.classList.toggle(\'blur-[4px]\')">Bs. ' + fin.capitalRespaldo.toFixed(2) + '</span></div>'
    + '<button onclick="manejarCapitalRespaldoModal(' + fin.capitalRespaldo + ')" class="text-neutral-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg></button></div></div>'
    + '<div class="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl"><p class="text-xs text-emerald-500/80">Ganancia Bruta</p><p class="text-xl font-bold text-emerald-400">Bs. ' + m.gananciaBruta.toFixed(2) + '</p></div>'
    + '<div class="bg-indigo-600 border border-indigo-500 p-5 rounded-2xl relative overflow-hidden"><div class="absolute right-[-20px] top-[-20px] bg-white opacity-20 w-32 h-32 rounded-full blur-3xl"></div><p class="text-xs text-indigo-200">Ganancia Real (Repartible)</p><p class="text-2xl font-bold text-white">Bs. ' + m.gananciaReal.toFixed(2) + '</p></div>'
    + '</div>'

    // ROW 2: Budget chart + budgets
    + '<div class="grid grid-cols-1 md:grid-cols-3 gap-6">'
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem]">'
    + '<h3 class="text-lg font-bold mb-4 tracking-tight">Distribución</h3>'
    + '<div class="relative w-full aspect-square flex items-center justify-center"><canvas id="budgetChart"></canvas>'
    + (fin.presupuestos.length === 0 ? '<p class="absolute text-sm font-bold text-neutral-500 text-center">Crea tu primer presupuesto</p>' : '')
    + '</div>'
    + '<button onclick="crearPresupuestoModal()" class="w-full bg-neutral-800 hover:bg-neutral-700 text-sm font-bold mt-4 py-3 rounded-xl transition-colors">+ Nuevo Presupuesto</button>'
    + '</div>'
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem] col-span-2 overflow-y-auto" style="max-height:500px;">'
    + '<h3 class="text-lg font-bold mb-4 tracking-tight">Presupuestos & Etiquetas</h3>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + presCards + '</div>'
    + (fin.presupuestos.length === 0 ? '<p class="text-neutral-600 text-sm py-8 text-center">Sin presupuestos configurados</p>' : '')
    + '</div></div>'

    // ROW 3: Commissions
    + '<div class="bg-neutral-900 border border-neutral-800 p-6 rounded-[2rem]">'
    + '<div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold tracking-tight">Sueldos y Comisiones</h3>'
    + '<button onclick="crearComisionModal()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold shadow-lg text-white">+ Asignar Comisión</button></div>'
    + '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + comisRows + '</div>'
    + (fin.comisiones.length === 0 ? '<p class="text-neutral-600 text-sm py-8 text-center">Sin comisiones asignadas</p>' : '')
    + '<div class="mt-4 bg-neutral-950 border border-neutral-800 p-4 rounded-xl flex justify-between items-center"><span class="text-sm text-neutral-400">Ganancia sin asignar (Dinero Libre):</span>'
    + '<span class="text-lg font-bold font-mono ' + (m.gananciaNoAsignada >= 0 ? 'text-emerald-400' : 'text-red-400') + '">Bs. ' + m.gananciaNoAsignada.toFixed(2) + '</span></div>'
    + '</div>'

    + '</div>';

  // Render chart
  if (fin.presupuestos.length > 0) {
    const ctx = document.getElementById('budgetChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [...fin.presupuestos.map(p => p.nombre + (p.tipo === 'FIJO' ? ' (Fijo)' : p.tipo === 'MANUAL' ? ' (Manual)' : ' (' + p.porcentaje_asignacion + '%)')), 'Ganancia Real'],
        datasets: [{
          data: [...fin.presupuestos.map(p => Math.max(0, p.monto_asignado + p.fondos_extra)), Math.max(0, m.gananciaReal)],
          backgroundColor: [...fin.presupuestos.map(p => p.color_hex || '#6366f1'), '#10b981'],
          borderWidth: 0
        }]
      },
      options: { cutout: '75%', plugins: { legend: { display: false } } }
    });
  }
}

window.crearPresupuestoModal = async () => {
  // Fetch products for the product selector
  let productosOpts = '';
  try {
    const inv = await api('/inventario');
    productosOpts = inv.map(p => '<option value="' + p.id + '">' + p.producto + ' (' + p.modelo + ')</option>').join('');
  } catch(e) {}

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Nuevo Presupuesto</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \'CREAR_FONDO\')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Nombre de la Etiqueta</label><input type="text" id="fin-nombre" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" placeholder="Alquiler, Luz, Marketing..."></div>'
    + '<div><label class="text-xs text-neutral-400 mb-1 block">Alcance del Presupuesto</label>'
    + '<div class="bg-neutral-950 p-1.5 rounded-xl border border-neutral-800 flex flex-wrap gap-1.5">'
    + '<button type="button" id="btn-alcance-GENERAL" onclick="setAlcance(\'GENERAL\')" class="flex-1 bg-indigo-600 text-white text-[10px] font-bold py-2.5 rounded-lg transition-all">🏷 General</button>'
    + '<button type="button" id="btn-alcance-PRODUCTO_GLOBAL" onclick="setAlcance(\'PRODUCTO_GLOBAL\')" class="flex-1 text-neutral-500 hover:text-white text-[10px] font-bold py-2.5 rounded-lg transition-all">🌎 Todo el Inventario</button>'
    + '<button type="button" id="btn-alcance-PRODUCTO_ESPECIFICO" onclick="setAlcance(\'PRODUCTO_ESPECIFICO\')" class="flex-1 text-neutral-500 hover:text-white text-[10px] font-bold py-2.5 rounded-lg transition-all">📦 Un Producto</button>'
    + '</div><input type="hidden" id="fin-alcance" value="GENERAL"></div>'
    + '<div id="fin-producto-row" class="hidden"><label class="text-xs text-neutral-400">Producto Vinculado</label><select id="fin-producto-id" class="w-full p-3 bg-neutral-950 border border-amber-500/30 rounded-xl outline-none font-bold text-amber-400"><option value="">— Selecciona un producto —</option>' + productosOpts + '</select><p class="text-[10px] text-amber-400/60 mt-1">💡 Cada venta de este producto alimentará automáticamente este presupuesto</p></div>'
    + '<div><label class="text-xs text-neutral-400">Tipo de Asignación / Cuenta</label><select id="fin-tipo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold" onchange="toggleFinTipo()"><option value="PORCENTAJE" id="fin-tipo-opt-pct">Porcentaje de Ganancia Bruta (Auto)</option><option value="FIJO">Monto Fijo Mensual (Auto)</option><option value="MANUAL">Cuenta Manual / Personalizada (Solo abonos)</option></select></div>'
    + '<div id="fin-pct-row"><label class="text-xs text-neutral-400" id="fin-pct-label">Porcentaje (%)</label><input type="number" step="0.01" id="fin-porcentaje" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono" placeholder="15"></div>'
    + '<div id="fin-fijo-row" class="hidden"><label class="text-xs text-neutral-400" id="fin-fijo-label">Monto Fijo (Bs)</label><input type="number" step="0.01" id="fin-monto-fijo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono" placeholder="350"></div>'
    + '<div id="fin-reset-row" class="hidden"><label class="text-xs text-neutral-400">Día de Reset Mensual (1-28)</label><input type="number" min="1" max="28" id="fin-dia-reset" value="1" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-mono"></div>'
    + '<div class="grid grid-cols-2 gap-4"><div><label class="text-xs text-neutral-400">Color</label><input type="color" id="fin-color" value="#6366f1" class="w-full h-12 bg-neutral-950 border border-neutral-800 rounded-xl outline-none cursor-pointer"></div>'
    + '<div><label class="text-xs text-neutral-400">Prioridad Ejecución</label><input type="number" id="fin-prioridad" value="1" min="1" class="w-full h-12 p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold text-center"></div></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold shadow-lg text-white">Crear Presupuesto</button></div></form>');
};

window.setAlcance = (alcance) => {
  document.getElementById('fin-alcance').value = alcance;
  const ids = ['GENERAL', 'PRODUCTO_GLOBAL', 'PRODUCTO_ESPECIFICO'];
  ids.forEach(id => {
    const btn = document.getElementById('btn-alcance-' + id);
    if (!btn) return;
    if (id === alcance) {
       btn.className = 'flex-1 ' + (alcance === 'GENERAL' ? 'bg-indigo-600' : alcance === 'PRODUCTO_GLOBAL' ? 'bg-sky-600' : 'bg-amber-600') + ' text-white text-[10px] font-bold py-2.5 rounded-lg transition-all';
    } else {
       btn.className = 'flex-1 text-neutral-500 hover:text-white text-[10px] font-bold py-2.5 rounded-lg transition-all';
    }
  });

  const prodRow = document.getElementById('fin-producto-row');
  const pctOptEl = document.getElementById('fin-tipo-opt-pct');
  const pctLabel = document.getElementById('fin-pct-label');
  const fijoLabel = document.getElementById('fin-fijo-label');
  
  const isProd = alcance !== 'GENERAL';
  prodRow.classList.toggle('hidden', alcance !== 'PRODUCTO_ESPECIFICO');
  
  if (isProd) {
    if (pctOptEl) pctOptEl.textContent = 'Porcentaje de cada Venta';
    if (pctLabel) pctLabel.textContent = '% de cada venta que se acumula';
    if (fijoLabel) fijoLabel.textContent = 'Monto fijo por unidad vendida (Bs)';
  } else {
    if (pctOptEl) pctOptEl.textContent = 'Porcentaje de Ganancia Bruta';
    if (pctLabel) pctLabel.textContent = 'Porcentaje (%)';
    if (fijoLabel) fijoLabel.textContent = 'Monto Fijo (Bs)';
  }
};

window.toggleFinTipo = () => {
  const tipo = document.getElementById('fin-tipo').value;
  document.getElementById('fin-pct-row').classList.toggle('hidden', tipo !== 'PORCENTAJE');
  document.getElementById('fin-fijo-row').classList.toggle('hidden', tipo !== 'FIJO');
  document.getElementById('fin-reset-row').classList.toggle('hidden', tipo === 'MANUAL');
};

window.gastarFondoModal = (id, nombre) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Gasto de \'' + nombre + '\'</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \'GASTAR_FONDO\', ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Importe (Bs)</label><input type="number" step="0.01" id="fin-gasto-monto" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-3xl"></div>'
    + '<div><label class="text-xs text-neutral-400">Descripción</label><input type="text" id="fin-gasto-desc" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-red-600 hover:bg-red-500 p-3 rounded-xl font-bold text-white">Confirmar Gasto</button></div></form>');
};

window.transferirFondosModal = (destinoId, nombreDestino) => {
  const fin = finanzasData;
  if(!fin) return;
  // Options for source
  let origenOpts = '<option value="GANANCIA_REAL">Ganancia Real (Disponible: Bs. ' + fin.metricas.gananciaReal.toFixed(2) + ')</option>';
  fin.presupuestos.forEach(p => {
    if (p.id !== destinoId) {
      origenOpts += '<option value="' + p.id + '">' + p.nombre + ' (Disp: Bs. ' + p.disponible.toFixed(2) + ')</option>';
    }
  });

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Abonar a \'' + nombreDestino + '\'</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-400 mb-4">Transfiere dinero manualmente desde la ganancia u otras cuentas.</p>'
    + '<form onsubmit="enviarTransferencia(event, ' + destinoId + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Cuenta de Origen</label><select id="fin-transf-origen" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold text-indigo-400">' + origenOpts + '</select></div>'
    + '<div><label class="text-xs text-neutral-400">Monto a Transferir (Bs)</label><input type="number" step="0.01" id="fin-transf-monto" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-3xl text-emerald-400"></div>'
    + '<div><label class="text-xs text-neutral-400">Descripción / Motivo</label><input type="text" id="fin-transf-desc" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" placeholder="Abono manual..."></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-emerald-600 hover:bg-emerald-500 p-3 rounded-xl font-bold text-white shadow-lg shadow-emerald-500/20">Realizar Transferencia</button></div></form>');
};

window.enviarTransferencia = async (e, destinoId) => {
  e.preventDefault();
  const origenVal = document.getElementById('fin-transf-origen').value;
  const monto = +document.getElementById('fin-transf-monto').value;
  const desc = document.getElementById('fin-transf-desc').value;
  
  let origen_tipo = 'PRESUPUESTO';
  let origen_id = origenVal;
  if (origenVal === 'GANANCIA_REAL') {
    origen_tipo = 'GANANCIA_REAL';
    origen_id = null;
  }

  const payload = { destino_id: destinoId, origen_tipo, origen_id, monto, descripcion: desc };
  ejecutarFinanzas(null, 'TRANSFERIR_FONDOS', null, payload);
};

window.verDetallePresupuesto = async (id, dispCalculado) => {
  const p = await api('/finanzas/' + id);
  const disponible = dispCalculado !== undefined ? dispCalculado : 0;
  const fmtDate = (d) => { if(!d) return '-'; const dt = new Date(d); return dt.toLocaleDateString('es-BO', {day:'2-digit',month:'short'}) + ' ' + dt.toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'}); };
  const movs = (p.movimientos || []).map(m => {
    const isGasto = m.tipo_movimiento === 'GASTO';
    return '<div class="flex justify-between items-center p-3 bg-neutral-950 rounded-xl border border-neutral-800/60">'
      + '<div class="min-w-0 flex-1"><span class="font-bold text-sm block truncate">' + m.descripcion + '</span>'
      + '<span class="text-[10px] text-neutral-500">' + fmtDate(m.fecha) + '</span></div>'
      + '<span class="font-bold font-mono flex-shrink-0 ml-3 ' + (isGasto ? 'text-red-400' : 'text-emerald-400') + '">' + (isGasto ? '-' : '+') + ' Bs ' + m.monto.toFixed(2) + '</span></div>';
  }).join('');

  const totalGastos = (p.movimientos || []).filter(m => m.tipo_movimiento === 'GASTO').reduce((a,m) => a + m.monto, 0);
  const totalFondos = (p.movimientos || []).filter(m => m.tipo_movimiento === 'FONDO_EXTRA').reduce((a,m) => a + m.monto, 0);

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">' + p.nombre + '</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<div class="grid grid-cols-3 gap-3 mb-4 text-sm"><div class="bg-neutral-950 p-3 rounded-xl text-center"><p class="text-[10px] text-neutral-500">Gastos</p><p class="font-bold text-red-400 font-mono">-' + totalGastos.toFixed(2) + '</p></div>'
    + '<div class="bg-neutral-950 p-3 rounded-xl text-center"><p class="text-[10px] text-neutral-500">Abonos Extra</p><p class="font-bold text-emerald-400 font-mono">+' + totalFondos.toFixed(2) + '</p></div>'
    + '<div class="bg-neutral-950 p-3 rounded-xl text-center"><p class="text-[10px] text-neutral-500">Tipo</p><p class="font-bold text-indigo-400">' + (p.tipo === 'FIJO' ? 'Fijo: Bs.' + p.monto_fijo : p.tipo === 'MANUAL' ? 'Manual' : p.porcentaje_asignacion + '%') + '</p></div></div>'
    + '<div class="bg-neutral-900 border border-neutral-800 p-4 rounded-xl text-sm mb-4 flex justify-between items-center"><div class="flex flex-col">'
    + '<span class="text-neutral-400 text-xs">Saldo actual disponible:</span><span class="text-lg font-bold font-mono ' + (disponible > 0 ? 'text-emerald-400' : disponible < 0 ? 'text-red-400' : 'text-neutral-300') + '">Bs. ' + disponible.toFixed(2) + '</span>'
    + (p.tipo === 'FIJO' && disponible < p.monto_fijo ? '<span class="text-[10px] text-amber-500 font-bold mt-1">Faltan Bs. ' + (p.monto_fijo - disponible).toFixed(2) + ' para completar meta.</span>' : '')
    + '</div><button onclick="liquidarPresupuesto(' + p.id + ', \'' + p.nombre.replace(/'/g, "\\'") + '\', ' + disponible + ')" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-bold shadow-lg text-white transition-colors">Liquidar / Pagar Todo</button></div>'
    + '<div class="overflow-y-auto max-h-[300px] space-y-2"><h4 class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Historial de Movimientos (' + (p.movimientos || []).length + ')</h4>'
    + movs
    + ((p.movimientos || []).length === 0 ? '<p class="text-neutral-600 text-sm py-4 text-center">Sin movimientos</p>' : '')
    + '</div>');
};

window.liquidarPresupuesto = async (id, nombre, disponible) => {
  if (disponible <= 0) {
    alert('No hay saldo disponible para liquidar en la cuenta "' + nombre + '".');
    return;
  }
  if (!confirm('¿Liquidar el periodo de "' + nombre + '"? Se generará un pago de Bs. ' + disponible.toFixed(2) + ' dejando la cuenta en cero.')) return;
  const taskId = NotifEngine.addTask('Liquidando: ' + nombre, 'Registrando pago...');
  try {
    await api('/finanzas', 'POST', {action: 'LIQUIDAR_PRESUPUESTO', payload: {presupuesto_id: id, disponible}});
    NotifEngine.success(taskId, '✓ Cuenta liquidada y reiniciada a 0');
    window.clearCache(); window._bumpLocalVersion();
    closeModal();
    if (window.currentActiveView === 'finanzas') renderFinanzas();
  } catch(err) {
    NotifEngine.error(taskId, 'Error: ' + String(err));
  }
};

window.resetPresupuesto = async (id, nombre) => {
  if (!confirm('¿Resetear todos los gastos de "' + nombre + '"? Esto borra el historial de este período.')) return;
  const taskId = NotifEngine.addTask('Reset: ' + nombre, 'Limpiando período...');
  try {
    await api('/finanzas', 'POST', {action: 'RESET_PRESUPUESTO', payload: {presupuesto_id: id}});
    NotifEngine.success(taskId, '✓ ' + nombre + ' reseteado');
    window.clearCache(); window._bumpLocalVersion();
    closeModal();
    if (window.currentActiveView === 'finanzas') renderFinanzas();
  } catch(err) {
    NotifEngine.error(taskId, 'Error: ' + String(err));
  }
};

window.crearComisionModal = () => {
  const fin = finanzasData;
  if (!fin) return;
  // Filter out users that already have active commissions
  const existingUserIds = fin.comisiones.map(c => c.usuario_id);
  const availableUsers = fin.usuarios.filter(u => !existingUserIds.includes(u.id));
  const userOpts = availableUsers.map(u => '<option value="' + u.id + '">' + u.nombre + ' (' + u.email + ')</option>').join('');

  if (availableUsers.length === 0) {
    NotifEngine.toast('Todos los usuarios ya tienen comisión asignada', 'warning');
    return;
  }

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Asignar Comisión</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-500 mb-4">La comisión se calcula sobre la <b class="text-indigo-400">Ganancia Real</b> (lo que sobra después de todos los presupuestos).</p>'
    + '<form onsubmit="ejecutarFinanzas(event, \'CREAR_COMISION\')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Usuario</label><select id="fin-comision-usuario" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none">' + userOpts + '</select></div>'
    + '<div><label class="text-xs text-neutral-400">Porcentaje de Ganancia Real (%)</label><input type="number" step="0.01" max="100" id="fin-comision-pct" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-2xl" placeholder="25"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold text-white">Asignar Comisión</button></div></form>');
};
window.renderProveedores = async () => {
  const res = await api('/proveedores');
  if(window.currentActiveView !== 'proveedores') return;
  allProveedores = res;
  appContent.innerHTML = `
    <div class="animate-[fadeInZoom_0.3s_ease-out]">
        <div class="flex justify-end mb-6">
           <button onclick="renderModalProveedor()" class="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl shadow-lg shadow-blue-500/20 font-bold active:scale-95 transition-all text-sm">+ Registrar Nuevo Proveedor</button>
        </div>
        <div class="bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden">
         <div class="overflow-x-auto">
           <table class="w-full text-left whitespace-nowrap">
             <thead class="bg-neutral-950 font-medium text-neutral-400 text-sm border-b border-neutral-800/80">
               <tr>
                 <th class="py-5 px-6">Nombre de Empresa</th>
                 <th class="py-5 px-6">Contacto Directo</th>
                 <th class="py-5 px-6 text-right">Opciones</th>
               </tr>
             </thead>
             <tbody class="text-sm">
               ${allProveedores.map(p => `
                  <tr class="border-b border-neutral-800/40 hover:bg-neutral-800/40 transition-colors">
                    <td class="py-4 px-6 font-bold text-neutral-200">${p.nombre}</td>
                    <td class="py-4 px-6 text-neutral-400">${p.contacto || '-'}</td>
                    <td class="py-4 px-6 text-right">
                      <button onclick='deleteProveedor(${p.id})' class="text-red-400 font-bold bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors text-xs ml-2">Dar de baja</button>
                    </td>
                  </tr>
               `).join('')}
               ${allProveedores.length === 0 ? `<tr><td colspan="3" class="p-10 text-center text-neutral-500 font-medium">No cuentas con ningún proveedor registrado.</td></tr>` : ''}
             </tbody>
           </table>
         </div>
      </div>
    </div>
  `;
}
window.renderModalProveedor = () => {
  openModal(`
    <h3 class="text-2xl font-bold mb-4">Alta Proveedor</h3>
    <form onsubmit="saveProveedor(event)" class="space-y-4">
      <input type="text" id="prov-nombre" placeholder="Nombre Empresa" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" />
      <input type="text" id="prov-contacto" placeholder="Contacto directo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" />
      <button class="w-full bg-blue-600 p-3 rounded-xl font-bold mt-4 shadow-lg text-white">Guardar</button>
    </form>
  `);
};
window.saveProveedor = async (e) => {
  e.preventDefault();

  // Capture data before closing
  const nombre = document.getElementById('prov-nombre').value;
  const contacto = document.getElementById('prov-contacto').value;
  const taskLabel = 'Nuevo Proveedor: ' + nombre;

  closeModal();
  const taskId = NotifEngine.addTask(taskLabel, 'Registrando proveedor...');

  (async () => {
    try {
      NotifEngine.updateProgress(taskId, 50, 'Guardando en base de datos...');
      await api('/proveedores', 'POST', {nombre, contacto});
      NotifEngine.success(taskId, '\u2713 ' + taskLabel);
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'proveedores') renderProveedores();
    } catch(err) {
      NotifEngine.error(taskId, 'Error registrando proveedor: ' + String(err));
    }
  })();
};
window.deleteProveedor = async (id) => {
  if(!confirm('¿Eliminar proveedor permanentemente?')) return;

  const taskId = NotifEngine.addTask('Eliminando proveedor #' + id, 'Procesando baja...');

  (async () => {
    try {
      NotifEngine.updateProgress(taskId, 50, 'Eliminando de la base de datos...');
      await api('/proveedores/' + id, 'DELETE');
      NotifEngine.success(taskId, '\u2713 Proveedor eliminado');
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'proveedores') renderProveedores();
    } catch(err) {
      NotifEngine.error(taskId, 'Error eliminando proveedor: ' + String(err));
    }
  })();
};

// Boot inicial
setTimeout(() => checkAuth(), 100);

// ====== SYNC ENGINE (Polling) ======
let _syncVersion = 0;
let _syncInterval = null;

function startSyncEngine() {
  // First call: just learn the current version (don't invalidate)
  fetch(API_URL + '/sync/version', { headers: { 'Authorization': 'Bearer ' + getToken() } })
    .then(r => r.json())
    .then(d => { _syncVersion = d.version || 0; })
    .catch(() => {});

  // Poll every 4 seconds
  _syncInterval = setInterval(async () => {
    if (!getToken()) return; // Not logged in
    try {
      const r = await fetch(API_URL + '/sync/version', { headers: { 'Authorization': 'Bearer ' + getToken() } });
      const d = await r.json();
      const newVer = d.version || 0;
      if (newVer > _syncVersion) {
        // Another user (or another tab) changed something
        _syncVersion = newVer;
        window.clearCache();
        NotifEngine.toast('Un usuario actualizó datos del sistema', 'sync');
        // Silently refresh the current active view
        const v = window.currentActiveView;
        if (v) {
          // Re-fetch and re-render in background without showing loader
          if (v === 'dashboard') await renderDashboard();
          if (v === 'inventario') await renderInventario();
          if (v === 'caja') await renderCaja();
          if (v === 'finanzas') await renderFinanzas();
          if (v === 'proveedores') await renderProveedores();
          // Re-cache with fresh data
          viewCache[v] = document.getElementById('app-content').innerHTML;
        }
      }
    } catch (e) { /* silently ignore network hiccups */ }
  }, 4000);
}

// Also bump local version after OUR OWN mutations so polling doesn't re-fetch our own changes
window._bumpLocalVersion = () => {
  _syncVersion++;
};

// Start polling after login
const _origSetAuth = setAuth;
// Patch setAuth to start sync engine on login
window.setAuth = (token, user) => {
  localStorage.setItem('vaxon_token', token);
  localStorage.setItem('vaxon_user', JSON.stringify(user));
  startSyncEngine();
  checkAuth();
};
// If already logged in on page load, start polling
if (getToken()) startSyncEngine();

window.manejarCapitalRespaldoModal = (capitalActual) => {
  const fin = finanzasData;
  if (!fin) return;
  const budgetOpts = (fin.presupuestos || []).map(p => '<option value="' + p.id + '">' + p.nombre + ' (' + (p.disponible < 0 ? 'Falta: Bs.' + Math.abs(p.disponible).toFixed(2) : 'OK') + ')</option>').join('');

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-indigo-400">Fondo de Respaldo</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-400 mb-6">Capital total indisponible/guardado para contingencias: <strong class="text-white">Bs. ' + capitalActual.toFixed(2) + '</strong></p>'
    + '<div class="space-y-6">'
    
    // Form Aumentar
    + '<form onsubmit="ejecutarFinanzas(event, \'AUMENTAR_CAPITAL_RESPALDO\')" class="bg-neutral-950 border border-emerald-500/20 p-4 rounded-xl">'
    + '<p class="text-xs font-bold text-emerald-500 mb-3">⭣ Inyectar Dinero al Respaldo</p>'
    + '<div class="flex gap-2"><input type="number" step="0.01" id="cap-add-monto" required class="flex-1 p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none font-mono text-sm" placeholder="Monto (Bs)">'
    + '<button class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-bold px-4 rounded-lg transition-colors border border-emerald-600/30">Guardar</button></div></form>'

    // Form Reducir / Rescatar
    + '<form onsubmit="ejecutarFinanzas(event, \'DEDUCIR_CAPITAL_RESPALDO\')" class="bg-neutral-950 border border-amber-500/20 p-4 rounded-xl">'
    + '<p class="text-xs font-bold text-amber-500 mb-3">⭡ Utilizar este dinero</p>'
    + '<div class="space-y-3"><div><label class="text-[10px] text-neutral-500">Monto a retirar (Bs)</label><input type="number" step="0.01" id="cap-sub-monto" max="' + capitalActual + '" required class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none font-mono text-sm" placeholder="Monto"></div>'
    + '<div><label class="text-[10px] text-neutral-500">Destino (Opcional)</label><select id="cap-sub-presupuesto" class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none text-xs"><option value="">-- Retiro libre (Efectivo) --</option>' + budgetOpts + '</select></div>'
    + '<div><label class="text-[10px] text-neutral-500">Motivo</label><input type="text" id="cap-sub-desc" required class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none text-xs" placeholder="Balancear cuenta negativa..."></div>'
    + '<button class="w-full bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 text-xs font-bold p-2.5 rounded-lg transition-colors border border-amber-600/30 mt-2">Extraer Fondos</button></div>'
    + '</form>'
    
    + '</div>');
};


window.editarPresupuestoModal = (id) => {
  const fin = finanzasData;
  if (!fin) return;
  const p = fin.presupuestos.find(x => x.id === id);
  if (!p) return;
  
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Editar Presupuesto</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \'MODIFICAR_PRESUPUESTO\', ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Nombre de la Etiqueta / Cuenta</label><input type="text" id="fin-mod-nombre" value="' + p.nombre + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none"></div>'
    + '<div><label class="text-xs text-neutral-400">Tipo de Cuenta</label><select id="fin-mod-tipo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold" onchange="toggleFinModTipo()">'
    + '<option value="PORCENTAJE" ' + (p.tipo==='PORCENTAJE'?'selected':'') + '>Porcentaje (%)</option>'
    + '<option value="FIJO" ' + (p.tipo==='FIJO'?'selected':'') + '>Fijo Mensual</option>'
    + '<option value="MANUAL" ' + (p.tipo==='MANUAL'?'selected':'') + '>Manual / Personalizado</option></select></div>'
    + '<div id="fin-mod-pct-row" class="' + (p.tipo==='PORCENTAJE'?'':'hidden') + '"><label class="text-xs text-neutral-400">Porcentaje (%)</label><input type="number" step="0.01" id="fin-mod-porcentaje" value="' + p.porcentaje_asignacion + '" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono"></div>' 
    + '<div id="fin-mod-fijo-row" class="' + (p.tipo==='FIJO'?'':'hidden') + '"><label class="text-xs text-neutral-400">Monto Fijo Mensual (Bs)</label><input type="number" step="0.01" id="fin-mod-fijo" value="' + p.monto_fijo + '" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono"></div>'
    + '<div id="fin-mod-reset-row" class="' + (p.tipo==='MANUAL'?'hidden':'') + '"><label class="text-xs text-neutral-400">Día de Reset Mensual</label><input type="number" min="1" max="28" id="fin-mod-reset" value="' + p.dia_reset + '" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-mono"></div>'
    + '<div class="grid grid-cols-2 gap-4"><div><label class="text-xs text-neutral-400">Color</label><input type="color" id="fin-mod-color" value="' + p.color_hex + '" class="w-full h-12 bg-neutral-950 border border-neutral-800 rounded-xl outline-none cursor-pointer"></div>'
    + '<div><label class="text-xs text-neutral-400">Prioridad</label><input type="number" id="fin-mod-prioridad" value="' + p.prioridad + '" min="1" class="w-full h-12 p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold text-center"></div></div>'
    + '<div class="flex gap-3 mt-4">'
    + '<button type="button" onclick="eliminarPresupuesto(' + id + ', \'' + p.nombre.replace(/'/g, "\\'") + '\')" class="px-4 py-2.5 text-sm font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl border border-red-500/10 transition-colors">Eliminar</button>'
    + '<button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold shadow-lg text-white">Actualizar</button></div>'
    + '</form>');
};

window.toggleFinModTipo = () => {
  const tipo = document.getElementById('fin-mod-tipo').value;
  document.getElementById('fin-mod-pct-row').classList.toggle('hidden', tipo !== 'PORCENTAJE');
  document.getElementById('fin-mod-fijo-row').classList.toggle('hidden', tipo !== 'FIJO');
  document.getElementById('fin-mod-reset-row').classList.toggle('hidden', tipo === 'MANUAL');
};

window.eliminarPresupuesto = async (id, nombre) => {
  if (!confirm('¿Estás seguro de que deseas eliminar permanentemente el presupuesto "' + nombre + '"? Se perderá todo su historial de gastos y fondos extra. Esta acción no se puede deshacer.')) return;
  const taskId = NotifEngine.addTask('Eliminando: ' + nombre, 'Borrando presupuesto...');
  try {
    await api('/finanzas', 'POST', {action: 'ELIMINAR_PRESUPUESTO', payload: {presupuesto_id: id}});
    NotifEngine.success(taskId, '✓ Presupuesto eliminado');
    window.clearCache(); window._bumpLocalVersion();
    closeModal();
    if (window.currentActiveView === 'finanzas') renderFinanzas();
  } catch(err) {
    NotifEngine.error(taskId, 'Error: ' + String(err));
  }
};

window.editarComisionModal = (comisionId, usuarioId, nombre, porcentajeActual) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Editar Comisión</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-400 mb-4">Usuario: <strong class="text-white">' + nombre + '</strong></p>'
    + '<form onsubmit="ejecutarFinanzas(event, \'CREAR_COMISION\')" class="space-y-4">'
    + '<input type="hidden" id="fin-comision-usuario" value="' + usuarioId + '">'
    + '<div><label class="text-xs text-neutral-400">Porcentaje de Ganancia Real (%)</label><input type="number" step="0.01" max="100" id="fin-comision-pct" value="' + porcentajeActual + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-2xl"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold text-white">Actualizar Comisión</button></div>'
    + '</form>');
};

window.abrirPagarComisionModal = (usuarioId, maxMonto, nombre) => {
  if (maxMonto <= 0) return NotifEngine.error('Sin saldo pendiente', 'El usuario no tiene comisiones por cobrar actualmente.');
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-emerald-400">Pagar Sueldo / Comisión</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-sm text-neutral-400 mb-6">Usuario: <strong class="text-white">' + nombre + '</strong><br>Saldo Pendiente: <strong class="text-emerald-400 font-mono">Bs. ' + maxMonto.toFixed(2) + '</strong></p>'
    + '<form onsubmit="ejecutarFinanzas(event, \'PAGAR_COMISION\')" class="space-y-4">'
    + '<input type="hidden" id="pagar-comision-usuario" value="' + usuarioId + '">'
    + '<div><label class="text-xs text-neutral-400">Monto a Pagar (Bs.)</label><input type="number" step="0.01" max="' + maxMonto + '" id="pagar-comision-monto" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-2xl text-center text-emerald-400"></div>'
    + '<div><label class="text-xs text-neutral-400">Concepto / Descripción</label><input type="text" id="pagar-comision-desc" placeholder="Ej. Pago parcial mes de abril" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none text-sm"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-emerald-600 hover:bg-emerald-500 p-3 rounded-xl font-bold text-white shadow-lg shadow-emerald-500/20">Confirmar Pago</button></div>'
    + '</form>');
};

window.verDetalleComision = (usuarioId, nombre) => {
  const fin = finanzasData;
  if (!fin) return;
  const userPagos = (fin.historialPagos || []).filter(p => p.usuario_id === usuarioId);
  const histHtml = userPagos.length > 0 ? userPagos.map(p => `
    <div class="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex justify-between items-center hover:border-neutral-700 transition-colors">
      <div><p class="font-bold text-sm text-indigo-300">\${p.descripcion}</p><p class="text-[11px] text-neutral-500">\${new Date(p.fecha).toLocaleString()}</p></div>
      <div class="font-mono text-emerald-400 font-bold text-right text-lg">- Bs. \${p.monto.toFixed(2)}</div>
    </div>
  `).join('') : '<p class="text-sm text-neutral-500 text-center py-8">No se han registrado pagos para este usuario.</p>';

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-indigo-400">Historial de Pagos</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-sm text-neutral-400 mb-6">Usuario: <strong class="text-white">' + nombre + '</strong></p>'
    + '<div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">' + histHtml + '</div>'
  );
};

window.ejecutarFinanzas = async (e, action, p_id = null, directPayload = null) => {
   if (e) e.preventDefault();

   let payload = directPayload || {};
   let taskLabel = '';
   
   if (action === 'CREAR_FONDO') {
     const tipo = document.getElementById('fin-tipo').value;
     const alcance = document.getElementById('fin-alcance') ? document.getElementById('fin-alcance').value : 'GENERAL';
     payload = {
       nombre: document.getElementById('fin-nombre').value,
       tipo: tipo,
       alcance: alcance,
       producto_id: alcance === 'PRODUCTO_ESPECIFICO' ? (document.getElementById('fin-producto-id')?.value || null) : null,
       porcentaje: tipo === 'PORCENTAJE' ? +(document.getElementById('fin-porcentaje').value || 0) : 0,
       monto_fijo: tipo === 'FIJO' ? +(document.getElementById('fin-monto-fijo').value || 0) : 0,
       dia_reset: tipo === 'FIJO' ? +(document.getElementById('fin-dia-reset').value || 1) : 1,
       color: document.getElementById('fin-color').value,
       prioridad: +document.getElementById('fin-prioridad').value
     };
     taskLabel = 'Nuevo Presupuesto: ' + payload.nombre;
   } else if (action === 'GASTAR_FONDO') {
     payload = {presupuesto_id: p_id, monto: +document.getElementById('fin-gasto-monto').value, descripcion: document.getElementById('fin-gasto-desc').value};
     taskLabel = 'Gasto: ' + payload.descripcion;
   } else if (action === 'AGREGAR_FONDO_EXTRA') {
     payload = {presupuesto_id: p_id, monto: +document.getElementById('fin-gasto-monto').value, descripcion: document.getElementById('fin-gasto-desc').value};
     taskLabel = 'Fondo Extra: ' + payload.descripcion;
   } else if (action === 'AUMENTAR_CAPITAL_RESPALDO') {
     payload = { monto: +document.getElementById('cap-add-monto').value };
     taskLabel = 'Inyectando Bs. ' + payload.monto + ' al capital';
   } else if (action === 'DEDUCIR_CAPITAL_RESPALDO') {
     const p_id = document.getElementById('cap-sub-presupuesto').value;
     payload = { 
       monto: +document.getElementById('cap-sub-monto').value,
       presupuesto_id: p_id ? +p_id : null,
       descripcion: document.getElementById('cap-sub-desc').value
     };
     taskLabel = 'Extrayendo Bs. ' + payload.monto + ' del capital';
   } else if (action === 'MODIFICAR_PRESUPUESTO') {
      const tipo = document.getElementById('fin-mod-tipo').value;
      payload.presupuesto_id = p_id;
      payload.nombre = document.getElementById('fin-mod-nombre').value;
      payload.tipo = tipo;
      payload.color = document.getElementById('fin-mod-color').value;
      payload.prioridad = +document.getElementById('fin-mod-prioridad').value;
      
      if (tipo === 'PORCENTAJE') payload.porcentaje = +document.getElementById('fin-mod-porcentaje').value;
      else if (tipo === 'FIJO') {
        payload.monto_fijo = +document.getElementById('fin-mod-fijo').value;
        payload.dia_reset = +document.getElementById('fin-mod-reset').value;
      }
      taskLabel = 'Actualizando Presupuesto: ' + payload.nombre;
   } else if (action === 'CREAR_COMISION') {
     payload = {usuario_id: +document.getElementById('fin-comision-usuario').value, porcentaje: +document.getElementById('fin-comision-pct').value};
     taskLabel = 'Nueva Comisión: ' + payload.porcentaje + '%';
   } else if (action === 'ELIMINAR_COMISION') {
     taskLabel = 'Eliminando comisión';
   } else if (action === 'PAGAR_COMISION') {
     payload = {
       usuario_id: +document.getElementById('pagar-comision-usuario').value,
       monto: +document.getElementById('pagar-comision-monto').value,
       descripcion: document.getElementById('pagar-comision-desc').value
     };
     taskLabel = 'Registrando pago de Bs. ' + payload.monto;
   } else if (action === 'TRANSFERIR_FONDOS') {
     taskLabel = 'Abonando Bs. ' + payload.monto + ' a cuenta';
   } else if (action === 'LIQUIDAR_PRESUPUESTO') {
     taskLabel = 'Liquidando cuenta (' + payload.disponible + ' Bs)';
   } else {
     taskLabel = action;
   }

   closeModal();
   const taskId = NotifEngine.addTask(taskLabel, 'Procesando...');

   (async () => {
     try {
       NotifEngine.updateProgress(taskId, 50, 'Registrando en sistema...');
       await api('/finanzas', 'POST', {action, payload});
       NotifEngine.success(taskId, '✓ ' + taskLabel);
       window.clearCache(); window._bumpLocalVersion();
       if (window.currentActiveView === 'finanzas') renderFinanzas();
     } catch(err) {
       NotifEngine.error(taskId, 'Error: ' + String(err));
     }
   })();
};

// ====== WHATSAPP PREVIEW ======
window.updateWhatsappPreview = () => {
  const nameEl = document.getElementById('inv-prod');
  const priceEl = document.getElementById('inv-venta');
  const customMsg = document.getElementById('inv-cat-whatsapp')?.value || '';
  const name = nameEl?.value || '[NOMBRE]';
  const price = priceEl?.value || '[PRECIO]';
  const textEl = document.getElementById('inv-cat-wa-text');
  if (!textEl) return;
  let msg = customMsg || `Hola Vaxon! Estoy Interesad@ en: ${name} Precio: BS ${price}`;
  if (customMsg) msg = customMsg.replace('[NOMBRE]', name).replace('[PRECIO]', price);
  textEl.textContent = msg;
};

// ====== COMBOS TAB ======
window.renderInventarioComboTab = async () => {
  invSubTab = 'combos';
  try { allCombos = await api('/combos'); } catch(e) { allCombos = []; }
  if(window.currentActiveView !== 'inventario') return;

  const tabsHtml = `
    <div class="flex items-center gap-3 mb-6">
      <div class="bg-neutral-950 p-1.5 rounded-xl border border-neutral-800 flex gap-1.5">
        <button onclick="invSubTab='productos'; renderInventario()" class="text-neutral-500 hover:text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-all">📦 Productos</button>
        <button onclick="invSubTab='combos'; renderInventarioComboTab()" class="bg-indigo-600 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-all">🎁 Combos</button>
      </div>
      <div class="flex-1"></div>
      <button onclick="renderComboModal()" class="bg-indigo-600 px-6 py-3 rounded-2xl shadow-lg font-bold text-sm">+ Nuevo Combo</button>
    </div>
  `;

  const combosHtml = allCombos.length === 0
    ? '<div class="bg-neutral-900 border border-neutral-800 p-12 text-center rounded-[2rem]"><p class="text-neutral-500">No hay combos creados aún</p></div>'
    : '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">' + allCombos.map(c => {
      const items = c.items || [];
      const itemList = items.map(i => `<span class="text-[11px] bg-neutral-800 px-2 py-0.5 rounded-lg">${i.producto_nombre} x${i.cantidad}</span>`).join(' ');
      return `<div class="bg-neutral-900 border border-neutral-800 rounded-[2rem] overflow-hidden">
        <div class="w-full h-36 bg-neutral-950 flex items-center justify-center relative">
          ${c.imagen_url ? `<img src="${c.imagen_url}" class="object-cover w-full h-full" />` : '<span class="text-4xl">🎁</span>'}
          <span class="absolute top-3 right-3 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg">COMBO</span>
        </div>
        <div class="p-5">
          <p class="font-bold text-lg mb-1">${c.nombre}</p>
          <div class="flex flex-wrap gap-1 mb-3">${itemList}</div>
          <div class="flex justify-between items-end mb-3">
            <span class="text-xs text-neutral-400">Costo: Bs. ${c.costoTotal?.toFixed(2) || '0.00'}</span>
            <span class="font-bold text-lg text-emerald-400">Bs. ${c.precio_venta.toFixed(2)}</span>
          </div>
          <div class="flex gap-2">
            <button onclick="editComboModal(${c.id})" class="flex-1 bg-neutral-800 text-xs text-neutral-400 hover:bg-indigo-600 hover:text-white py-2 rounded-xl transition-colors font-bold">Editar</button>
            <button onclick="deleteCombo(${c.id})" class="bg-red-500/10 text-red-400 text-xs font-bold px-4 py-2 rounded-xl hover:bg-red-500/20 transition-colors">Eliminar</button>
          </div>
        </div>
      </div>`;
    }).join('') + '</div>';

  appContent.innerHTML = `<div class="animate-[fadeInZoom_0.3s_ease-out]">${tabsHtml}${combosHtml}</div>`;
};

// ====== COMBO MODAL (Create) ======
window._comboItems = [];

window.renderComboModal = () => {
  window._comboItems = [];
  const prodOpts = allProductos.map(p => `<option value="${p.id}" data-nombre="${p.producto}">${p.producto} (${p.modelo}) | Stock: ${p.cantidad}</option>`).join('');
  
  openModal(`
    <h3 class="text-2xl font-bold mb-4">🎁 Nuevo Combo</h3>
    <form onsubmit="saveCombo(event)" class="space-y-4">
      <div><label class="text-xs text-neutral-400">Nombre del Combo</label>
        <input type="text" id="combo-nombre" required class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none focus:border-indigo-500" placeholder="Combo Hogar Completo">
      </div>
      <div><label class="text-xs font-bold text-emerald-400">Precio de Venta del Combo (Bs)</label>
        <input type="number" step="0.01" id="combo-precio" required class="w-full bg-neutral-950 border border-emerald-500/30 rounded-xl px-4 py-3 outline-none font-bold text-lg text-emerald-400 text-center" value="0">
      </div>
      <div>
        <label class="text-xs text-neutral-400 block mb-2">Productos del Combo</label>
        <div class="flex gap-2 mb-2">
          <select id="combo-prod-select" class="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="">— Seleccionar producto —</option>${prodOpts}
          </select>
          <input type="number" id="combo-prod-qty" value="1" min="1" class="w-20 bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-center font-bold text-sm outline-none">
          <button type="button" onclick="addComboItem()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors">Agregar</button>
        </div>
        <div id="combo-items-list" class="space-y-2"></div>
      </div>
      <div>
        <label class="text-xs text-neutral-400 block mb-1">Imagen del Combo (Opcional)</label>
        <input type="file" id="combo-file" accept="image/*" class="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-800 file:text-white">
      </div>
      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
        <button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>
        <button type="submit" class="bg-indigo-600 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg text-white">Crear Combo</button>
      </div>
    </form>
  `);
};

window.addComboItem = () => {
  const sel = document.getElementById('combo-prod-select');
  const qty = +document.getElementById('combo-prod-qty').value;
  if (!sel.value || qty < 1) return;
  const prodId = +sel.value;
  const prodName = sel.options[sel.selectedIndex].getAttribute('data-nombre');
  // Check if already added
  if (window._comboItems.find(i => i.producto_id === prodId)) {
    NotifEngine.toast('Este producto ya está en el combo', 'warning');
    return;
  }
  window._comboItems.push({ producto_id: prodId, cantidad: qty, producto_nombre: prodName });
  renderComboItemsList();
};

window.removeComboItem = (prodId) => {
  window._comboItems = window._comboItems.filter(i => i.producto_id !== prodId);
  renderComboItemsList();
};

function renderComboItemsList() {
  const list = document.getElementById('combo-items-list');
  if (!list) return;
  list.innerHTML = window._comboItems.length === 0
    ? '<p class="text-neutral-600 text-xs text-center py-3">Agrega productos al combo</p>'
    : window._comboItems.map(i => `
      <div class="flex items-center justify-between bg-neutral-950 border border-neutral-800 p-3 rounded-xl">
        <span class="text-sm font-bold">${i.producto_nombre} <span class="text-neutral-500 font-normal">x${i.cantidad}</span></span>
        <button type="button" onclick="removeComboItem(${i.producto_id})" class="text-red-400 hover:text-red-300 text-xs font-bold">✕</button>
      </div>
    `).join('');
}

window.saveCombo = async (e) => {
  e.preventDefault();
  if (window._comboItems.length === 0) { NotifEngine.toast('Agrega al menos un producto al combo', 'warning'); return; }
  const nombre = document.getElementById('combo-nombre').value;
  const precio_venta = +document.getElementById('combo-precio').value;
  const fileInput = document.getElementById('combo-file');
  let fileDataURL = null;
  if (fileInput && fileInput.files.length > 0) {
    fileDataURL = await new Promise(resolve => { const r = new FileReader(); r.onload = ev => resolve(ev.target.result); r.readAsDataURL(fileInput.files[0]); });
  }
  const items = [...window._comboItems];
  closeModal();
  const taskId = NotifEngine.addTask('Nuevo Combo: ' + nombre, 'Creando combo...');
  (async () => {
    try {
      let img_url = null;
      if (fileDataURL) {
        NotifEngine.updateProgress(taskId, 30, 'Subiendo imagen...');
        const upRes = await api('/upload', 'POST', { fileBase64: fileDataURL });
        img_url = upRes.url;
      }
      NotifEngine.updateProgress(taskId, 70, 'Guardando combo...');
      await api('/combos', 'POST', { nombre, precio_venta, imagen_url: img_url, items });
      NotifEngine.success(taskId, '✓ Combo creado: ' + nombre);
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'inventario') renderInventarioComboTab();
    } catch(err) { NotifEngine.error(taskId, 'Error: ' + String(err)); }
  })();
};

window.editComboModal = async (id) => {
  const combo = allCombos.find(c => c.id === id);
  if (!combo) return;
  window._comboItems = (combo.items || []).map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad, producto_nombre: i.producto_nombre }));
  const prodOpts = allProductos.map(p => `<option value="${p.id}" data-nombre="${p.producto}">${p.producto} (${p.modelo})</option>`).join('');
  openModal(`
    <h3 class="text-2xl font-bold mb-4">🎁 Editar Combo: ${combo.nombre}</h3>
    <form onsubmit="saveEditCombo(event, ${combo.id})" class="space-y-4">
      <div><label class="text-xs text-neutral-400">Nombre</label>
        <input type="text" id="combo-nombre" required value="${combo.nombre}" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 outline-none">
      </div>
      <div><label class="text-xs font-bold text-emerald-400">Precio de Venta (Bs)</label>
        <input type="number" step="0.01" id="combo-precio" required value="${combo.precio_venta}" class="w-full bg-neutral-950 border border-emerald-500/30 rounded-xl px-4 py-3 outline-none font-bold text-lg text-emerald-400 text-center">
      </div>
      <div>
        <label class="text-xs text-neutral-400 block mb-2">Productos del Combo</label>
        <div class="flex gap-2 mb-2">
          <select id="combo-prod-select" class="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm outline-none"><option value="">— Seleccionar —</option>${prodOpts}</select>
          <input type="number" id="combo-prod-qty" value="1" min="1" class="w-20 bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-center font-bold text-sm outline-none">
          <button type="button" onclick="addComboItem()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold text-white">Agregar</button>
        </div>
        <div id="combo-items-list" class="space-y-2"></div>
      </div>
      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
        <button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>
        <button type="submit" class="bg-indigo-600 px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg text-white">Actualizar Combo</button>
      </div>
    </form>
  `);
  renderComboItemsList();
};

window.saveEditCombo = async (e, id) => {
  e.preventDefault();
  if (window._comboItems.length === 0) { NotifEngine.toast('Agrega al menos un producto', 'warning'); return; }
  const nombre = document.getElementById('combo-nombre').value;
  const precio_venta = +document.getElementById('combo-precio').value;
  const items = [...window._comboItems];
  closeModal();
  const taskId = NotifEngine.addTask('Editando Combo', 'Actualizando...');
  (async () => {
    try {
      await api('/combos/' + id, 'PUT', { nombre, precio_venta, items });
      NotifEngine.success(taskId, '✓ Combo actualizado');
      window.clearCache(); window._bumpLocalVersion();
      if (window.currentActiveView === 'inventario') renderInventarioComboTab();
    } catch(err) { NotifEngine.error(taskId, 'Error: ' + String(err)); }
  })();
};

window.deleteCombo = async (id) => {
  if (!confirm('¿Eliminar este combo?')) return;
  const taskId = NotifEngine.addTask('Eliminando combo', 'Procesando...');
  try {
    await api('/combos/' + id, 'DELETE');
    NotifEngine.success(taskId, '✓ Combo eliminado');
    window.clearCache(); window._bumpLocalVersion();
    if (window.currentActiveView === 'inventario') renderInventarioComboTab();
  } catch(err) { NotifEngine.error(taskId, 'Error: ' + String(err)); }
};