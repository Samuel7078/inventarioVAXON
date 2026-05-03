const fs = require('fs');
const filePath = 'public/assets/js/app.js';

let lines = fs.readFileSync(filePath, 'utf8').split('\n');

console.log('Total lines before fix:', lines.length);

// Lines 1505-1529 (0-indexed: 1504-1528) are the stray duplicated block.
// Remove them.
lines.splice(1504, lines.length - 1504);

// Add a proper end-of-file newline
lines.push('');

console.log('Total lines after fix:', lines.length);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done — stray block removed.');
