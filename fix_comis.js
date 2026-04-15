const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');

c = c.replace(
  /, '' \+ c\.usuario_nombre \+ '', /g,
  ", \\\\\\'\' + c.usuario_nombre + \'\\\\\\', "
);

fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('FIX DONE');
