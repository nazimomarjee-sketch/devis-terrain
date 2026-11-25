const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const err = []; p.on('pageerror', e => err.push(e.message)); p.on('console', m => m.type() === 'error' && err.push(m.text()));
  for (const n of process.argv.slice(2)) { await p.goto('file://' + path.join(__dirname, n + '.html')); await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, n + '.png') }); }
  console.log('erreurs', JSON.stringify(err)); await b.close(); })();
