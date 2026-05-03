const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');
// Fix the common syntax errors from bad escaping
c = c.replace(/\\+'/g, "\\'");
c = c.replace(/\\+"/g, "\\\"");
fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('Fixed app.js syntax');
