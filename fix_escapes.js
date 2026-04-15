const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');

// List all the specific broken patterns and their fixes
const fixes = [
  // egreso modal
  ["actionCaja(event, \\'TRANSACCION\\', \\'EGRESO\\'", "actionCaja(event, \\'TRANSACCION\\', \\'EGRESO\\'"],
  // Fix any remaining double-escaped quotes: \\' -> \'
];

// The root issue: \\' in JS string context means a literal \' 
// But the file has some places with \\' that should be \'
// Let me do a targeted search for all onsubmit handler lines and fix them

const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  // Original caja egreso form
  if (lines[i].includes("actionCaja(event,") && lines[i].includes("onsubmit")) {
    lines[i] = lines[i].replace(/\\\\/g, '\\');
  }
  // ejecutarFinanzas forms  
  if (lines[i].includes("ejecutarFinanzas(event,") && lines[i].includes("onsubmit")) {
    lines[i] = lines[i].replace(/\\\\/g, '\\');
  }
}

c = lines.join('\n');
fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('FIX3 DONE');
