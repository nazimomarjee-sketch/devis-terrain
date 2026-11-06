const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  for (const n of ['v1', 'v2', 'v3']) { await p.goto('file://' + path.join(__dirname, n + '.html')); await p.waitForTimeout(300);
    await p.addStyleTag({ content: '.legende,.carte-tap,.outils,.approx{display:none!important}' });
    await (await p.$('#scene')).screenshot({ path: path.join(__dirname, 'scene-' + n + '.png') }); }
  await b.close(); })();
