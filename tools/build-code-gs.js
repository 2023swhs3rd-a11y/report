#!/usr/bin/env node
/* js/schema.js(보고서 구성)를 읽어 apps-script/Code.gs 를 만든다.
   쓰는 법: node tools/build-code-gs.js
   시트 열은 [내부 이름(key), 한글 설명] 순서로, 칸을 더하면 열이 자동으로 늘어난다. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/schema.js'), 'utf8') + ';this.STAGES=STAGES;this.RUBRIC=RUBRIC;', ctx);
const cols = [['id', '학번'], ['name', '이름'], ['pin', '비밀번호(암호화)'], ['fails', '비밀번호 틀린 횟수'], ['lockt', '잠금 시각'],
  ['created', '처음 접속'], ['updated', '마지막 저장']];
ctx.STAGES.forEach(s => cols.push([s.id, s.badge + ' 저장 시각']));
[1, 2, 3].forEach(n => { cols.push(['t_c' + n, '교사 확인 ' + n]); cols.push(['t_f' + n, '교사 피드백 ' + n]); });
ctx.RUBRIC.forEach(r => cols.push([r[0], '기준표: ' + r[1]]));
cols.push(['t_memo', '교사 관찰 메모']);
const seen = new Set(cols.map(c => c[0]));
ctx.STAGES.forEach(s => s.blocks.forEach(b => {
  const fs_ = b.t === 'f' ? [b] : b.t === 'card' ? b.fields : [];
  fs_.forEach(f => {
    if (seen.has(f.key)) throw new Error('같은 key가 두 번 나옵니다: ' + f.key);
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(f.key) || /^t_/.test(f.key)) throw new Error('key 이름 규칙 위반: ' + f.key);
    seen.add(f.key);
    cols.push([f.key, '[' + s.badge + '] ' + (b.t === 'card' ? b.title.split(' · ')[0] + ' - ' : '') + f.label]);
  });
}));
const lit = '[\n' + cols.map(c => '  ' + JSON.stringify(c)).join(',\n') + '\n]';
const src = fs.readFileSync(path.join(root, 'apps-script/Code.template.gs'), 'utf8').replace('/*__COLUMNS__*/', lit);
if (src.includes('/*__COLUMNS__*/')) throw new Error('자리표시가 남았습니다');
fs.writeFileSync(path.join(root, 'apps-script/Code.gs'), src);
console.log('apps-script/Code.gs 를 만들었습니다. 열 ' + cols.length + '개');
