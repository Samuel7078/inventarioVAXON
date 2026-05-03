const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');

// 1. Add Edit icons to PresCards rendering
const presCardsTarget = `+ '<div class="flex justify-between items-start mb-2"><div><span class="font-bold text-base">' + p.nombre + '</span><span class="ml-2 text-[10px] bg-neutral-800 px-2 py-0.5 rounded font-mono text-neutral-400">' + tipoLabel + '</span></div>'`;
const presCardsReplacement = `+ '<div class="flex justify-between items-start mb-2"><div><button onclick="editarPresupuestoModal(' + p.id + ')" class="mr-2 text-neutral-500 hover:text-indigo-400 transition-colors"><svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button><span class="font-bold text-base">' + p.nombre + '</span><span class="ml-2 text-[10px] bg-neutral-800 px-2 py-0.5 rounded font-mono text-neutral-400">' + tipoLabel + '</span></div>'`;
c = c.replace(presCardsTarget, presCardsReplacement);

// 2. Add Edit icons to Comisiones rendering
const comisRowTarget = `+ '<div class="flex items-center gap-4"><span class="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-sm font-bold font-mono">' + c.porcentaje + '%</span>'`;
const comisRowReplacement = `+ '<div class="flex items-center gap-4"><button onclick="editarComisionModal(' + c.id + ', ' + c.usuario_id + ', \\'' + c.usuario_nombre + '\\', ' + c.porcentaje + ')" class="text-neutral-500 hover:text-indigo-400 transition-colors"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button><span class="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-sm font-bold font-mono">' + c.porcentaje + '%</span>'`;
c = c.replace(comisRowTarget, comisRowReplacement);

// 3. Add modals right before ejecutarFinanzas
const editModals = `
window.editarPresupuestoModal = (id) => {
  const fin = finanzasData;
  if (!fin) return;
  const p = fin.presupuestos.find(x => x.id === id);
  if (!p) return;
  
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Editar Presupuesto</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<form onsubmit="ejecutarFinanzas(event, \\'MODIFICAR_PRESUPUESTO\\', ' + id + ')" class="space-y-4">'
    + '<div><label class="text-xs text-neutral-400">Nombre de la Etiqueta</label><input type="text" id="fin-mod-nombre" value="' + p.nombre + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none"></div>'
    + (p.tipo === 'PORCENTAJE' ? '<div><label class="text-xs text-neutral-400">Porcentaje de Ganancia (%)</label><input type="number" step="0.01" id="fin-mod-porcentaje" value="' + p.porcentaje_asignacion + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono"></div>' 
                               : '<div><label class="text-xs text-neutral-400">Monto Fijo Mensual (Bs)</label><input type="number" step="0.01" id="fin-mod-fijo" value="' + p.monto_fijo + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono"></div>'
                               + '<div><label class="text-xs text-neutral-400">Día de Reset Mensual</label><input type="number" min="1" max="28" id="fin-mod-reset" value="' + p.dia_reset + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-mono"></div>')
    + '<input type="hidden" id="fin-mod-tipo" value="' + p.tipo + '">'
    + '<div><label class="text-xs text-neutral-400">Color</label><input type="color" id="fin-mod-color" value="' + p.color_hex + '" class="w-full h-12 bg-neutral-950 border border-neutral-800 rounded-xl outline-none cursor-pointer"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold shadow-lg text-white">Actualizar</button></div>'
    + '</form>');
};

window.editarComisionModal = (comisionId, usuarioId, nombre, porcentajeActual) => {
  openModal('<div class="flex justify-between items-center mb-6"><h3 class="text-xl font-bold">Editar Comisión</h3><button onclick="closeModal()" class="text-neutral-500 hover:text-white transition-colors"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>'
    + '<p class="text-xs text-neutral-400 mb-4">Usuario: <strong class="text-white">' + nombre + '</strong></p>'
    + '<form onsubmit="ejecutarFinanzas(event, \\'CREAR_COMISION\\')" class="space-y-4">'
    + '<input type="hidden" id="fin-comision-usuario" value="' + usuarioId + '">'
    + '<div><label class="text-xs text-neutral-400">Porcentaje de Ganancia Real (%)</label><input type="number" step="0.01" max="100" id="fin-comision-pct" value="' + porcentajeActual + '" required class="w-full p-3 bg-neutral-950 border border-neutral-800 rounded-xl outline-none font-bold font-mono text-center text-2xl"></div>'
    + '<div class="flex gap-3 mt-4"><button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-neutral-400">Cancelar</button>'
    + '<button class="flex-1 bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold text-white">Actualizar Comisión</button></div>'
    + '</form>');
};
`;

c = c.replace('window.ejecutarFinanzas =', editModals + '\nwindow.ejecutarFinanzas =');

// 4. Update ejecutarFinanzas logic to handle MODIFICAR_PRESUPUESTO payload 
const ejFinMarker = `} else if (action === 'CREAR_COMISION') {`;
const ejFinReplacement = `} else if (action === 'MODIFICAR_PRESUPUESTO') {
     const tipo = document.getElementById('fin-mod-tipo').value;
     payload = {
        presupuesto_id: p_id,
        nombre: document.getElementById('fin-mod-nombre').value,
        color: document.getElementById('fin-mod-color').value
     };
     if (tipo === 'PORCENTAJE') {
        payload.porcentaje = +document.getElementById('fin-mod-porcentaje').value;
     } else {
        payload.monto_fijo = +document.getElementById('fin-mod-fijo').value;
        payload.dia_reset = +document.getElementById('fin-mod-reset').value;
     }
     taskLabel = 'Actualizando Presupuesto: ' + payload.nombre;
   } else if (action === 'CREAR_COMISION') {`;

c = c.replace(ejFinMarker, ejFinReplacement);

fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('PATCH MODALS DONE');
