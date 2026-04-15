const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');

// 1. Replace the ROW 1 metrics definition to include Capital Respaldo
const searchStr = `'<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl"><p class="text-xs text-neutral-500">Capital Invertido</p><p class="text-xl font-bold text-neutral-300">Bs. ' + m.capitalInvertido.toFixed(2) + '</p></div>'`;

const replacementStr = `'<div class="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl relative group"><p class="text-xs text-neutral-500">Capital Invertido (Mercancía)</p><p class="text-xl font-bold text-neutral-300">Bs. ' + m.capitalInvertido.toFixed(2) + '</p>'
    + '<div class="mt-3 pt-3 border-t border-neutral-800 flex justify-between items-center"><div class="flex items-center gap-2"><p class="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">Respaldo:</p>'
    + '<span id="cap-blur-text" class="text-xs font-mono font-bold text-indigo-400 blur-[4px] cursor-pointer hover:blur-none transition-all duration-300 select-none" onclick="this.classList.toggle(\\'blur-[4px]\\')">Bs. ' + fin.capitalRespaldo.toFixed(2) + '</span></div>'
    + '<button onclick="manejarCapitalRespaldoModal(' + fin.capitalRespaldo + ')" class="text-neutral-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg></button></div></div>'`;

c = c.replace(searchStr, replacementStr);

// 2. Add the modal and new action handlers to app.js
// Inject before window.ejecutarFinanzas
const modalCode = `
window.manejarCapitalRespaldoModal = (capitalActual) => {
  const fin = finanzasData;
  if (!fin) return;
  const budgetOpts = (fin.presupuestos || []).map(p => '<option value="' + p.id + '">' + p.nombre + ' (' + (p.disponible < 0 ? 'Falta: Bs.' + Math.abs(p.disponible).toFixed(2) : 'OK') + ')</option>').join('');

  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold text-indigo-400">Fondo de Respaldo</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-400 mb-6">Capital total indisponible/guardado para contingencias: <strong class="text-white">Bs. ' + capitalActual.toFixed(2) + '</strong></p>'
    + '<div class="space-y-6">'
    
    // Form Aumentar
    + '<form onsubmit="ejecutarFinanzas(event, \\'AUMENTAR_CAPITAL_RESPALDO\\')" class="bg-neutral-950 border border-emerald-500/20 p-4 rounded-xl">'
    + '<p class="text-xs font-bold text-emerald-500 mb-3">⭣ Inyectar Dinero al Respaldo</p>'
    + '<div class="flex gap-2"><input type="number" step="0.01" id="cap-add-monto" required class="flex-1 p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none font-mono text-sm" placeholder="Monto (Bs)">'
    + '<button class="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-bold px-4 rounded-lg transition-colors border border-emerald-600/30">Guardar</button></div></form>'

    // Form Reducir / Rescatar
    + '<form onsubmit="ejecutarFinanzas(event, \\'DEDUCIR_CAPITAL_RESPALDO\\')" class="bg-neutral-950 border border-amber-500/20 p-4 rounded-xl">'
    + '<p class="text-xs font-bold text-amber-500 mb-3">⭡ Utilizar este dinero</p>'
    + '<div class="space-y-3"><div><label class="text-[10px] text-neutral-500">Monto a retirar (Bs)</label><input type="number" step="0.01" id="cap-sub-monto" max="' + capitalActual + '" required class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none font-mono text-sm" placeholder="Monto"></div>'
    + '<div><label class="text-[10px] text-neutral-500">Destino (Opcional)</label><select id="cap-sub-presupuesto" class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none text-xs"><option value="">-- Retiro libre (Efectivo) --</option>' + budgetOpts + '</select></div>'
    + '<div><label class="text-[10px] text-neutral-500">Motivo</label><input type="text" id="cap-sub-desc" required class="w-full p-2 bg-neutral-900 border border-neutral-800 rounded-lg outline-none text-xs" placeholder="Balancear cuenta negativa..."></div>'
    + '<button class="w-full bg-amber-600/20 hover:bg-amber-600/40 text-amber-500 text-xs font-bold p-2.5 rounded-lg transition-colors border border-amber-600/30 mt-2">Extraer Fondos</button></div>'
    + '</form>'
    
    + '</div>');
};
`;

c = c.replace('window.ejecutarFinanzas =', modalCode + '\nwindow.ejecutarFinanzas =');

// 3. Add to ejecutarFinanzas
const actionCodeStr = `} else if (action === 'CREAR_COMISION') {`;
const newActionCode = `} else if (action === 'AUMENTAR_CAPITAL_RESPALDO') {
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
   } else if (action === 'CREAR_COMISION') {`;

c = c.replace(actionCodeStr, newActionCode);

fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('PATCH CAPITAL RESUMEN DONE');
