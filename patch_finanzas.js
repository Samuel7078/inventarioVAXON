const fs = require('fs');
const content = fs.readFileSync('public/assets/js/app.js', 'utf8');
const lines = content.split('\n');

// Find the egreso modal (line ~801) and replace it to include budget selector
const egresoStart = lines.findIndex(l => l.includes('window.openEgresoModal'));
const egresoEnd = lines.findIndex((l, i) => i > egresoStart && l.trim() === '};');

const newEgresoModal = `window.openEgresoModal = async (caja_id) => {
  // Fetch budgets to show as options
  const finData = await api('/finanzas');
  const presupuestos = finData.presupuestos || [];
  const budgetOpts = presupuestos.map(p => {
    const disp = p.disponible.toFixed(2);
    return '<option value="' + p.id + '" data-disp="' + p.disponible + '">[' + p.nombre + '] Disponible: Bs. ' + disp + '</option>';
  }).join('');

  openModal('<div class="flex justify-between items-center mb-4"><h3 class="text-2xl font-bold text-red-500">Salida Operativa</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="actionCaja(event, \\'TRANSACCION\\', \\'EGRESO\\', ' + caja_id + ')" class="space-y-4">'
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
};`;

lines.splice(egresoStart, egresoEnd - egresoStart + 1, newEgresoModal);

// Now find finanzas section and replace it 
const finStart = lines.findIndex(l => l.includes('// ====== FINANZAS V2 ======'));
const finEnd = lines.findIndex((l, i) => i > finStart && l.includes('renderProveedores'));

const newFinanzas = `// ====== FINANZAS V2 ======
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
    const pctUsado = p.monto_asignado > 0 ? Math.min((p.total_gastado / (p.monto_asignado + p.fondos_extra)) * 100, 100) : 0;
    const tipoLabel = p.tipo === 'FIJO' ? 'Fijo: Bs. ' + p.monto_fijo.toFixed(2) : p.porcentaje_asignacion + '% de ganancia';
    const barColor = pctUsado > 80 ? 'bg-red-500' : pctUsado > 50 ? 'bg-amber-500' : 'bg-emerald-500';
    return '<div class="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl" style="border-left: 4px solid ' + (p.color_hex || '#6366f1') + '">'
      + '<div class="flex justify-between items-start mb-2"><div><span class="font-bold text-base">' + p.nombre + '</span><span class="ml-2 text-[10px] bg-neutral-800 px-2 py-0.5 rounded font-mono text-neutral-400">' + tipoLabel + '</span></div>'
      + '<span class="text-[10px] font-bold ' + (p.disponible > 0 ? 'text-emerald-400' : 'text-red-400') + '">' + (p.disponible >= 0 ? 'Bs. ' + p.disponible.toFixed(2) : '-Bs. ' + Math.abs(p.disponible).toFixed(2)) + '</span></div>'
      + '<div class="w-full bg-neutral-800 rounded-full h-2 mb-3"><div class="h-2 rounded-full transition-all ' + barColor + '" style="width:' + pctUsado.toFixed(0) + '%"></div></div>'
      + '<div class="flex gap-2 text-[10px] text-neutral-500 mb-3"><span>Asignado: Bs. ' + p.monto_asignado.toFixed(2) + '</span>'
      + (p.fondos_extra > 0 ? '<span>+ Extra: Bs. ' + p.fondos_extra.toFixed(2) + '</span>' : '')
      + '<span>Gastado: Bs. ' + p.total_gastado.toFixed(2) + '</span></div>'
      + '<div class="flex gap-2">'
      + '<button onclick="gastarFondoModal(' + p.id + ', \\'' + p.nombre.replace(/'/g, "\\'") + '\\')" class="flex-1 text-[11px] font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-lg border border-red-500/10 transition-colors">Gastar</button>'
      + '<button onclick="agregarFondoExtraModal(' + p.id + ', \\'' + p.nombre.replace(/'/g, "\\'") + '\\')" class="flex-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/10 transition-colors">+ Fondo</button>'
      + '<button onclick="verDetallePresupuesto(' + p.id + ')" class="flex-1 text-[11px] font-bold text-neutral-400 bg-neutral-800 hover:bg-neutral-700 p-2 rounded-lg transition-colors">Detalle</button>'
      + '</div></div>';
  }).join('');

  const comisRows = fin.comisiones.map(c => {
    return '<div class="flex items-center justify-between bg-neutral-950 border border-neutral-800 p-4 rounded-xl">'
      + '<div><span class="font-bold">' + c.usuario_nombre + '</span><span class="text-xs text-neutral-500 ml-2">' + c.usuario_email + '</span></div>'
      + '<div class="flex items-center gap-4"><span class="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-sm font-bold font-mono">' + c.porcentaje + '%</span>'
      + '<span class="font-bold font-mono text-lg text-emerald-400">Bs. ' + c.monto_comision.toFixed(2) + '</span>'
      + '<button onclick="ejecutarFinanzas(null, \\' ELIMINAR_COMISION\\', null, {comision_id:' + c.id + '})" class="text-red-400 hover:text-red-300 text-xs font-bold">×</button></div></div>';
  }).join('');

  appContent.innerHTML = '<div class="animate-[fadeInZoom_0.3s_ease-out] space-y-6">'
    // ROW 1: Main metrics
    + '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">'
    + '<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl"><p class="text-xs text-neutral-500">Ventas Totales</p><p class="text-xl font-bold">Bs. ' + m.ingresosBrutos.toFixed(2) + '</p></div>'
    + '<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl"><p class="text-xs text-neutral-500">Capital Invertido</p><p class="text-xl font-bold text-neutral-300">Bs. ' + m.capitalInvertido.toFixed(2) + '</p></div>'
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
    + '<div class="flex justify-between items-center mb-4"><h3 class="text-lg font-bold tracking-tight">Comisiones de Usuarios</h3>'
    + '<button onclick="crearComisionModal()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-bold shadow-lg text-white">+ Asignar Comisión</button></div>'
    + '<div class="space-y-2">' + comisRows + '</div>'
    + (fin.comisiones.length === 0 ? '<p class="text-neutral-600 text-sm py-4 text-center">Sin comisiones asignadas</p>' : '')
    + '<div class="mt-4 bg-neutral-950 border border-neutral-800 p-4 rounded-xl flex justify-between items-center"><span class="text-sm text-neutral-400">Ganancia sin asignar:</span>'
    + '<span class="text-lg font-bold font-mono ' + (m.gananciaNoAsignada >= 0 ? 'text-emerald-400' : 'text-red-400') + '">Bs. ' + m.gananciaNoAsignada.toFixed(2) + '</span></div>'
    + '</div>'

    + '</div>';

  // Render chart
  if (fin.presupuestos.length > 0) {
    const ctx = document.getElementById('budgetChart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [...fin.presupuestos.map(p => p.nombre + (p.tipo === 'FIJO' ? ' (Fijo)' : ' (' + p.porcentaje_asignacion + '%)')), 'Ganancia Real'],
        datasets: [{
          data: [...fin.presupuestos.map(p => p.monto_asignado + p.fondos_extra), m.gananciaReal > 0 ? m.gananciaReal : 0],
          backgroundColor: [...fin.presupuestos.map(p => p.color_hex || '#6366f1'), '#10b981'],
          borderWidth: 0
        }]
      },
      options: { cutout: '75%', plugins: { legend: { display: false } } }
    });
  }
}

window.crearPresupuestoModal = () => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Nuevo Presupuesto</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \\'CREAR_FONDO\\')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Nombre de la Etiqueta</label><input type="text" id="fin-nombre" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" placeholder="Alquiler, Luz, Marketing..."></div>'
    + '<div><label class="text-xs text-neutral-400">Tipo</label><select id="fin-tipo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold" onchange="toggleFinTipo()"><option value="PORCENTAJE">Porcentaje de Ganancia Bruta</option><option value="FIJO">Monto Fijo Mensual</option></select></div>'
    + '<div id="fin-pct-row"><label class="text-xs text-neutral-400">Porcentaje (%)</label><input type="number" step="0.01" id="fin-porcentaje" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono" placeholder="15"></div>'
    + '<div id="fin-fijo-row" class="hidden"><label class="text-xs text-neutral-400">Monto Fijo (Bs)</label><input type="number" step="0.01" id="fin-monto-fijo" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono" placeholder="350"></div>'
    + '<div id="fin-reset-row" class="hidden"><label class="text-xs text-neutral-400">Día de Reset Mensual (1-28)</label><input type="number" min="1" max="28" id="fin-dia-reset" value="1" class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-mono"></div>'
    + '<div><label class="text-xs text-neutral-400">Color</label><input type="color" id="fin-color" value="#6366f1" class="w-full h-12 bg-neutral-950 border border-neutral-800 rounded-xl outline-none cursor-pointer"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold shadow-lg text-white">Crear Presupuesto</button></div></form>');
};

window.toggleFinTipo = () => {
  const tipo = document.getElementById('fin-tipo').value;
  document.getElementById('fin-pct-row').classList.toggle('hidden', tipo !== 'PORCENTAJE');
  document.getElementById('fin-fijo-row').classList.toggle('hidden', tipo !== 'FIJO');
  document.getElementById('fin-reset-row').classList.toggle('hidden', tipo !== 'FIJO');
};

window.gastarFondoModal = (id, nombre) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Gasto de \\'' + nombre + '\\'</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \\'GASTAR_FONDO\\', ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Importe (Bs)</label><input type="number" step="0.01" id="fin-gasto-monto" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-3xl"></div>'
    + '<div><label class="text-xs text-neutral-400">Descripción</label><input type="text" id="fin-gasto-desc" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-red-600 hover:bg-red-500 p-3 rounded-xl font-bold text-white">Confirmar Gasto</button></div></form>');
};

window.agregarFondoExtraModal = (id, nombre) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Fondo Extra: \\'' + nombre + '\\'</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \\'AGREGAR_FONDO_EXTRA\\', ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Monto Extraordinario (Bs)</label><input type="number" step="0.01" id="fin-gasto-monto" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-3xl text-emerald-400"></div>'
    + '<div><label class="text-xs text-neutral-400">Descripción</label><input type="text" id="fin-gasto-desc" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none" placeholder="Fondo extra mes de diciembre..."></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-emerald-600 hover:bg-emerald-500 p-3 rounded-xl font-bold text-white">Inyectar Fondo</button></div></form>');
};

window.verDetallePresupuesto = async (id) => {
  const p = await api('/finanzas/' + id);
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
    + '<div class="bg-neutral-950 p-3 rounded-xl text-center"><p class="text-[10px] text-neutral-500">Fondos Extra</p><p class="font-bold text-emerald-400 font-mono">+' + totalFondos.toFixed(2) + '</p></div>'
    + '<div class="bg-neutral-950 p-3 rounded-xl text-center"><p class="text-[10px] text-neutral-500">Tipo</p><p class="font-bold text-indigo-400">' + (p.tipo === 'FIJO' ? 'Fijo: Bs.' + p.monto_fijo : p.porcentaje_asignacion + '%') + '</p></div></div>'
    + (p.tipo === 'FIJO' ? '<div class="bg-amber-950/30 border border-amber-500/20 p-3 rounded-xl text-xs mb-4 flex justify-between"><span class="text-amber-400">Reset mensual el día ' + p.dia_reset + '</span><button onclick="resetPresupuesto(' + p.id + ', \\'' + p.nombre.replace(/'/g, "\\'") + '\\')" class="text-amber-400 font-bold hover:text-amber-300 underline">Resetear ahora</button></div>' : '')
    + '<div class="overflow-y-auto max-h-[300px] space-y-2"><h4 class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">Movimientos (' + (p.movimientos || []).length + ')</h4>'
    + movs
    + ((p.movimientos || []).length === 0 ? '<p class="text-neutral-600 text-sm py-4 text-center">Sin movimientos</p>' : '')
    + '</div>');
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
    + '<form onsubmit="ejecutarFinanzas(event, \\'CREAR_COMISION\\')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Usuario</label><select id="fin-comision-usuario" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none">' + userOpts + '</select></div>'
    + '<div><label class="text-xs text-neutral-400">Porcentaje de Ganancia Real (%)</label><input type="number" step="0.01" max="100" id="fin-comision-pct" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-2xl" placeholder="25"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold text-white">Asignar Comisión</button></div></form>');
};`;

lines.splice(finStart, finEnd - finStart, newFinanzas);

// Now update ejecutarFinanzas to handle new actions
const ejFinStart = lines.findIndex(l => l.includes('window.ejecutarFinanzas'));
const ejFinEnd = lines.findIndex((l, i) => i > ejFinStart + 1 && l.trim() === '}');

const newEjecutarFinanzas = `window.ejecutarFinanzas = async (e, action, p_id = null, directPayload = null) => {
   if (e) e.preventDefault();

   let payload = directPayload || {};
   let taskLabel = '';
   
   if (action === 'CREAR_FONDO') {
     const tipo = document.getElementById('fin-tipo').value;
     payload = {
       nombre: document.getElementById('fin-nombre').value,
       tipo: tipo,
       porcentaje: tipo === 'PORCENTAJE' ? +(document.getElementById('fin-porcentaje').value || 0) : 0,
       monto_fijo: tipo === 'FIJO' ? +(document.getElementById('fin-monto-fijo').value || 0) : 0,
       dia_reset: tipo === 'FIJO' ? +(document.getElementById('fin-dia-reset').value || 1) : 1,
       color: document.getElementById('fin-color').value
     };
     taskLabel = 'Nuevo Presupuesto: ' + payload.nombre;
   } else if (action === 'GASTAR_FONDO') {
     payload = {presupuesto_id: p_id, monto: +document.getElementById('fin-gasto-monto').value, descripcion: document.getElementById('fin-gasto-desc').value};
     taskLabel = 'Gasto: ' + payload.descripcion;
   } else if (action === 'AGREGAR_FONDO_EXTRA') {
     payload = {presupuesto_id: p_id, monto: +document.getElementById('fin-gasto-monto').value, descripcion: document.getElementById('fin-gasto-desc').value};
     taskLabel = 'Fondo Extra: ' + payload.descripcion;
   } else if (action === 'CREAR_COMISION') {
     payload = {usuario_id: +document.getElementById('fin-comision-usuario').value, porcentaje: +document.getElementById('fin-comision-pct').value};
     taskLabel = 'Nueva Comisión: ' + payload.porcentaje + '%';
   } else if (action === 'ELIMINAR_COMISION') {
     taskLabel = 'Eliminando comisión';
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
};`;

lines.splice(ejFinStart, ejFinEnd - ejFinStart + 1, newEjecutarFinanzas);

// Now also update actionCaja to include presupuesto_id
const actionCajaIdx = lines.findIndex(l => l.includes('window.actionCaja'));
// Find the line with presupuesto_id handling or add it to TRANSACCION payload
const tranPayloadLine = lines.findIndex((l, i) => i > actionCajaIdx && l.includes('cantidad: document.getElementById'));
if (tranPayloadLine !== -1) {
  // Add presupuesto_id to the payload
  const origLine = lines[tranPayloadLine];
  lines[tranPayloadLine] = origLine.replace(
    "cantidad: document.getElementById('trans-cant').value ? +document.getElementById('trans-cant').value : null",
    "cantidad: document.getElementById('trans-cant').value ? +document.getElementById('trans-cant').value : null,\n        presupuesto_id: document.getElementById('trans-presupuesto') ? (document.getElementById('trans-presupuesto').value || null) : null"
  );
}

const result = lines.join('\n');
fs.writeFileSync('public/assets/js/app.js', result, 'utf8');
console.log('PATCH OK — new line count:', result.split('\n').length);
