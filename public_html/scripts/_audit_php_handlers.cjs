// Audit B: every handler named in action_map.php must be DEFINED as a function somewhere
// in the PHP backend. A dangling reference ("handleX" not defined) => PHP fatal 500 at runtime.
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function read(p){ try { return fs.readFileSync(p,'utf8'); } catch(e){ return null; } }

// 1. collect handler names from action_map.php
const am = read(path.join(ROOT,'database/action_map.php')) || '';
const handlerRe = /=>\s*'(handle[A-Za-z0-9_]+)'/g;
const handlers = new Set();
let m;
while ((m = handlerRe.exec(am))) handlers.add(m[0].replace(/=>\s*'/,'').replace(/'$/,''));

// 2. collect all PHP files that could define them
const phpDirs = [
  path.join(ROOT,'database'),
  path.join(ROOT,'.'),
];
const defined = new Set();
function walk(dir){
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e){ return; }
  for (const e of entries){
    const fp = path.join(dir, e.name);
    if (e.isDirectory()){
      if (['.git','vendor','node_modules','.scratch'].includes(e.name)) continue;
      walk(fp);
    } else if (e.name.endsWith('.php')){
      const src = read(fp);
      if (!src) continue;
      const fr = /function\s+(handle[A-Za-z0-9_]+)\s*\(/g;
      let fm;
      while ((fm = fr.exec(src))) defined.add(fm[1]);
    }
  }
}
for (const d of phpDirs) walk(d);

// 3. check _v18_handlers.php include of SQL handlers etc (also covered by walk)
const missing = [];
const ok = [];
for (const h of handlers){
  if (defined.has(h)) ok.push(h);
  else { missing.push(h); }
}

console.log('distinct handlers referenced by action_map.php:', handlers.size);
console.log('handlers DEFINED in PHP backend:', ok.length);
console.log('handlers MISSING (dangling -> PHP fatal 500):', missing.length);
for (const h of missing) console.log('  MISSING handler:', h);
// Also: handlers defined but not referenced by action_map (dead, not a defect)
process.exit(missing.length ? 3 : 0);
