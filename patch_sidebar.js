const fs = require('fs');
let c = fs.readFileSync('public/assets/js/app.js', 'utf8');

// 1. Add toggleSidebar
const toggleFunc = `
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
`;

c = c.replace('// ====== AUTHENTICATION & BOOT ======', toggleFunc + '\n// ====== AUTHENTICATION & BOOT ======');
if (!c.includes('window.toggleSidebar')) {
    // maybe bootstrap comment is different
    c = toggleFunc + '\n' + c;
}

// 2. Modify nav link click event
const searchNavLinks = `document.querySelectorAll('.nav-link').forEach(link => {
     link.addEventListener('click', (e) => {
       e.preventDefault(); loadView(e.currentTarget.dataset.view);
     });
  });`;

const replacementNavLinks = `document.querySelectorAll('.nav-link').forEach(link => {
     link.addEventListener('click', (e) => {
       e.preventDefault(); 
       loadView(e.currentTarget.dataset.view);
       if (window.innerWidth < 768) {
         window.toggleSidebar();
       }
     });
  });`;

if (c.includes(searchNavLinks)) {
    c = c.replace(searchNavLinks, replacementNavLinks);
} else {
    // Let's do a wider replace or run it via regex
    c = c.replace(/e\.preventDefault\(\); loadView\(e\.currentTarget\.dataset\.view\);/g, "e.preventDefault(); loadView(e.currentTarget.dataset.view); if(window.innerWidth < 768) { const sb = document.getElementById('sidebar-menu'); if(sb && !sb.classList.contains('-translate-x-full')) window.toggleSidebar(); }");
}

fs.writeFileSync('public/assets/js/app.js', c, 'utf8');
console.log('PATCH SIDEBAR DONE');
