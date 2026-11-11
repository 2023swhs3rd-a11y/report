#!/usr/bin/env node
/* 미리보기 이미지(og.png)와 파비콘 PNG를 다시 만든다.
   준비: 진로진학부 첫 사이트 저장소(2023swhs3rd-a11y.github.io)를 받아 그 폴더 안에 이 저장소를 report/ 로 두고
         그 폴더에서 `python3 -m http.server 8765` 를 켠다(글꼴 /assets 를 쓰기 위해).
   실행: node tools/render-og.js   (puppeteer 또는 puppeteer-core + 크롬 필요) */
const path = require('path');
let pp; try { pp = require('puppeteer'); } catch (e) { pp = require('puppeteer-core'); }
const BASE = process.env.BASE || 'http://localhost:8765/report/';
const out = p => path.join(__dirname, '..', p);
(async () => {
  const b = await pp.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1200, height: 630 });
  await p.goto(BASE + 'tools/og/og.html'); await p.evaluateHandle('document.fonts.ready');
  await p.screenshot({ path: out('og.png') });
  for (const [n, s] of [['img/favicon-32.png', 32], ['img/apple-touch-icon.png', 180]]) {
    await p.setViewport({ width: s, height: s });
    await p.goto(BASE + 'img/favicon.svg');
    await p.screenshot({ path: out(n), omitBackground: true });
  }
  await b.close();
  console.log('og.png, img/favicon-32.png, img/apple-touch-icon.png 를 만들었습니다. index.html 의 og.png?v= 숫자를 올리세요.');
})();
