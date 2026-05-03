const fs = require('fs');

function fixFile(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    // Replace any sequence of backslashes followed by a quote with exactly \'
    content = content.replace(/\\+(['"])/g, "\\\\$1");
    fs.writeFileSync(filename, content, 'utf8');
    console.log('Fixed', filename);
}

['patch_finanzas.js', 'patch_edit_finanzas.js', 'patch_capital.js'].forEach(fixFile);
