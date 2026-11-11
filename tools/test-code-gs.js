#!/usr/bin/env node
/* apps-script/Code.gs 를 가짜 구글 시트 위에서 돌려 보는 시험. 쓰는 법: node tools/test-code-gs.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j] ?? ''); o.push(row); } return o; }
  setValues(v) {
    if (v.length !== this.nr || v[0].length !== this.nc) throw new Error('dim mismatch');
    if (this.r + this.nr - 1 > this.sh.maxR || this.c + this.nc - 1 > this.sh.maxC) throw new Error('out of bounds');
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { let x = v[i][j]; if (typeof x === 'string') { if (/^=/.test(x)) this.sh.formulas++; if (x[0] === "'") x = x.slice(1); } (this.sh.d[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; }
    return this;
  }
  clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.d[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; }
  setNumberFormat() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.d = []; this.maxR = 100; this.maxC = 26; this.formulas = 0; }
  getRange(r, c, nr = 1, nc = 1) { if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('bad range ' + [r, c, nr, nc]); return new Range(this, r, c, nr, nc); }
  getLastRow() { let n = 0; this.d.forEach((row, i) => { if (row && row.some(x => x !== '' && x != null)) n = i + 1; }); return n; }
  getLastColumn() { let n = 0; this.d.forEach(row => (row || []).forEach((x, j) => { if (x !== '' && x != null) n = Math.max(n, j + 1); })); return n; }
  getMaxRows() { return this.maxR; } getMaxColumns() { return this.maxC; }
  insertColumnsAfter(a, n) { this.maxC += n; } insertRowsAfter(a, n) { this.maxR += n; }
  deleteRow(r) { if (this.maxR - 2 <= 1) throw new Error('cannot delete all unfrozen rows'); this.d.splice(r - 1, 1); this.maxR--; }
  copyTo(ss) { const c = new Sheet('copy'); c.d = JSON.parse(JSON.stringify(this.d)); c.maxR = this.maxR; c.maxC = this.maxC; ss._add(c); return c; }
  setName(n) { const ss = this._ss; delete ss.sheets[this.name]; this.name = n; ss.sheets[n] = this; return this; }
  setFrozenRows() {} setFrozenColumns() {}
}
const ss = { sheets: {}, _add(sh) { sh._ss = this; this.sheets[sh.name] = sh; }, getSheetByName(n) { return this.sheets[n] || null; },
  insertSheet(n) { const sh = new Sheet(n); this._add(sh); return sh; }, setActiveSheet() {} };
const props = {}, cache = {};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  Logger: { log() {} }, Date,
  Utilities: { DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, sleep() {},
    computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
    formatDate: () => '2026-11-11 10:00' }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script/Code.gs'), 'utf8').replace(/^const /gm, 'var '), ctx);
const post = o => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).s);
let pass = 0, failn = 0;
const t = (name, cond, extra) => { if (cond) pass++; else { failn++; console.log('실패:', name, extra ?? ''); } };
const TP = 'teacher-pass-123';
ctx.setup();
const D = () => ss.sheets['보고서'];
t('머리 행', D().d[0][0] === 'id' && D().d[1][0] === '학번');
t('비밀번호 미설정이면 교사 거부', /TEACHER_PASSWORD/.test(post({ action: 'teacher_list', tpw: 'x' }).error));
props.TEACHER_PASSWORD = TP;
let r = post({ action: 'login', id: '10312', name: '김 하늘', pin: '1234' });
t('새 학생 로그인', r.ok && r.isNew && !('pin' in r.data), JSON.stringify(r));
t('틀린 비밀번호', !post({ action: 'login', id: '10312', name: '김하늘', pin: '9999' }).ok);
t('다른 이름', /다른 이름/.test(post({ action: 'login', id: '10312', name: '박바다', pin: '1234' }).error));
r = post({ action: 'save', id: '10312', name: '김하늘', pin: '1234', stage: 's1', data: { question: '=HYPERLINK("http://x","y")', k1: '2026-11-10', id: '99999', pin: 'hack', t_c1: '확인', s3: 'fake' } });
t('저장', r.ok);
t('수식 실행 막기', D().formulas === 0);
r = post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' });
t('다시 읽기', r.data.question.startsWith('=HYP') && r.data.k1 === '2026-11-10');
t('보호된 칸', r.data.id === '10312' && r.data.t_c1 === '' && r.data.s3 === '');
t('교사 비밀번호 틀림', !post({ action: 'teacher_list', tpw: 'nope' }).ok);
r = post({ action: 'teacher_list', tpw: TP });
t('교사 목록', r.ok && r.rows.length === 1 && !('pin' in r.rows[0]));
t('교사 저장', post({ action: 'teacher_save', tpw: TP, id: '10312', data: { t_c1: '확인', t_f1: '좋아요', t_memo: '관찰', question: 'x' } }).ok);
r = post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' });
t('학생에게 피드백만', r.data.t_f1 === '좋아요' && !('t_memo' in r.data) && r.data.question.startsWith('=HYP'));
post({ action: 'teacher_save', tpw: TP, id: '10312', data: { t_note: '특기사항 초안' } });
t('특기사항 초안은 학생에게 안 보임', !('t_note' in post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' }).data) && post({ action: 'teacher_list', tpw: TP }).rows[0].t_note === '특기사항 초안');
for (let i = 0; i < 10; i++) post({ action: 'login', id: '10312', name: '김하늘', pin: 'bad' + i });
t('잠금', /분 동안 잠겼/.test(post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' }).error));
const row = D().d.findIndex(x => x && x[0] === '10312'); const lc = D().d[0].indexOf('lockt');
D().d[row][lc] = String(Date.now() - 16 * 60000);
t('잠금 시간이 지나면 풀림', post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' }).ok);
t('비밀번호 초기화', post({ action: 'teacher_reset', tpw: TP, id: '10312' }).ok && post({ action: 'login', id: '10312', name: '김하늘', pin: 'new1' }).ok);
post({ action: 'login', id: '10301', name: '이나무', pin: '1234' });
post({ action: 'login', id: '10401', name: '최구름', pin: '1234' });
r = post({ action: 'teacher_backup', tpw: TP });
t('백업 시트', r.ok && ss.sheets[r.backup] && ss.sheets[r.backup].getLastRow() === 5, JSON.stringify(r));
t('확인 글자 없으면 초기화 거부', !post({ action: 'teacher_clear', tpw: TP, scope: 'all' }).ok);
r = post({ action: 'teacher_clear', tpw: TP, scope: 'class', cls: '103', confirm: '초기화' });
t('반 초기화', r.ok && r.removed === 2 && D().getLastRow() === 3 && D().d[2][0] === '10401', JSON.stringify(r));
t('반 초기화 전 백업', ss.sheets[r.backup] && ss.sheets[r.backup].getLastRow() === 5);
r = post({ action: 'teacher_clear', tpw: TP, scope: 'all', confirm: '초기화' });
t('전체 초기화', r.ok && r.removed === 1 && D().getLastRow() === 2, JSON.stringify(r));
t('초기화 뒤 다시 등록', post({ action: 'login', id: '10312', name: '김하늘', pin: '1234' }).ok);
for (let i = 0; i < 8; i++) post({ action: 'teacher_list', tpw: 'wrong' + i });
t('교사 시도 제한', /10분 동안 막/.test(post({ action: 'teacher_list', tpw: TP }).error));
props.TEACHER_PASSWORD2 = 'backup-pass-456';
t('막혀도 보조 비밀번호는 통과', post({ action: 'teacher_list', tpw: 'backup-pass-456' }).ok && !cache.tfail);
cache.tfail = '3';
t('맞게 들어오면 틀린 횟수 지움', post({ action: 'teacher_list', tpw: TP }).ok && !cache.tfail);
r = post({ action: 'teacher_list', tpw: TP });
t('목록에 반·명단·잠금 정보', r.classes && r.total === 1 && r.roster === 0 && r.lockMinutes === 5 && r.maxFails === 10, JSON.stringify(r).slice(0, 200));
post({ action: 'login', id: '10401', name: '박별', pin: '1234' });
r = post({ action: 'teacher_list', tpw: TP, cls: '104' });
t('반 단위 목록', r.ok && r.rows.length === 1 && r.rows[0].id === '10401' && r.classes['103'] === 1 && r.classes['104'] === 1, JSON.stringify(r.rows.map(x => x.id)));
ctx.LIST_ALL_MAX = 1;
r = post({ action: 'teacher_list', tpw: TP });
t('학생이 많으면 반을 고를 때까지 목록 안 보냄', r.ok && r.partial && r.rows.length === 0 && r.total === 2);
t('전체 요청하면 모두 보냄', post({ action: 'teacher_list', tpw: TP, all: true }).rows.length === 2);
ctx.LIST_ALL_MAX = 120;
ss.sheets['명단'].getRange(2, 1, 1, 2).setValues([['10313', '이 나무']]);
t('명단 밖 거부', /명단/.test(post({ action: 'login', id: '10314', name: '최구름', pin: '1234' }).error));
t('명단 안 허용', post({ action: 'login', id: '10313', name: '이나무', pin: '1234' }).ok);
// 생년월일 처음 비밀번호
ss.sheets['명단'].getRange(3, 1, 2, 3).setValues([['10320', '정바람', 310], ['10321', '한구름', '1225']]);
t('명단 머리에 생년월일 열', /생년월일/.test(ss.sheets['명단'].d[0][2]));
t('생년월일이 아니면 첫 가입 거부', /생년월일/.test(post({ action: 'login', id: '10320', name: '정바람', pin: '9999' }).error));
r = post({ action: 'login', id: '10320', name: '정바람', pin: '0310' });
t('310 → 0310 으로 가입', r.ok && r.initial === true, JSON.stringify(r).slice(0, 120));
t('0을 빼고 310 으로도 로그인', post({ action: 'login', id: '10320', name: '정바람', pin: '310' }).ok);
t('저장도 310 으로', post({ action: 'save', id: '10320', name: '정바람', pin: '310', stage: 's1', data: { question: 'q' } }).ok);
t('생년월일로는 비밀번호를 못 바꿈', /생년월일과 다른/.test(post({ action: 'change_pin', id: '10320', name: '정바람', pin: '0310', newpin: '0310' }).error));
t('비밀번호 바꾸기', post({ action: 'change_pin', id: '10320', name: '정바람', pin: '0310', newpin: 'tree77' }).ok);
t('바꾼 뒤 생년월일 거부', !post({ action: 'login', id: '10320', name: '정바람', pin: '0310' }).ok);
r = post({ action: 'login', id: '10320', name: '정바람', pin: 'tree77' });
t('새 비밀번호 로그인, 처음 표시 없음', r.ok && r.initial === false);
post({ action: 'teacher_reset', tpw: TP, id: '10320' });
t('초기화 뒤에는 아무 비밀번호로 못 가로챔', /생년월일/.test(post({ action: 'login', id: '10320', name: '정바람', pin: 'hack1' }).error));
t('초기화 뒤 생년월일로 다시 들어옴', post({ action: 'login', id: '10320', name: '정바람', pin: '0310' }).initial === true);
t('4자리 생년월일', post({ action: 'login', id: '10321', name: '한구름', pin: '1225' }).ok);
t('생년월일 없는 명단 학생은 스스로 정함', post({ action: 'login', id: '10313', name: '이나무', pin: '1234' }).ok);
t('birthOf_', ctx.birthOf_(310) === '0310' && ctx.birthOf_('20080310') === '0310' && ctx.birthOf_('080310') === '0310' && ctx.birthOf_('1340') === '' && ctx.birthOf_('') === '');
t('잘못된 요청', !JSON.parse(ctx.doPost({ postData: { contents: '{' } }).s).ok && !post({ action: 'zzz' }).ok);
console.log('통과 ' + pass + ' · 실패 ' + failn);
process.exit(failn ? 1 : 0);
