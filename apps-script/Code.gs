/**
 * 진로 빌드업 맵 탐구 보고서 — 구글 시트 저장 스크립트 (Apps Script)
 *
 * 이 파일은 저장소의 tools/build-code-gs.js 가 js/schema.js(보고서 구성)를 읽어 만든다.
 * 직접 고치지 말고 apps-script/Code.template.gs 를 고친 뒤 다시 만든다.
 *
 * 설치(README.md 참고)
 *   1. 구글 시트 → 확장 프로그램 → Apps Script → 이 파일 전체를 붙여 넣기
 *   2. 왼쪽 톱니바퀴(프로젝트 설정) → 스크립트 속성 → 속성 추가
 *        속성: TEACHER_PASSWORD   값: 10자 이상의 교사 비밀번호
 *        (선택) TEACHER_PASSWORD2  값: 보조 비밀번호. 학생이 일부러 틀려 교사 화면이 막혔을 때도 들어갈 수 있다
 *      (비밀번호를 코드에 쓰지 않으므로 이 파일은 공개 저장소에 두어도 안전하다)
 *   3. 함수 목록에서 setup 실행 → 배포 → 새 배포 → 웹 앱(실행: 나, 액세스: 모든 사용자)
 *   코드를 바꾼 뒤에는 배포 → 배포 관리 → 수정 → 버전: 새 버전 → 배포 (주소는 그대로)
 */

const SHEET_DATA = '보고서';     // 학생 한 명이 한 줄
const SHEET_ROSTER = '명단';     // 학번·이름을 적어 두면 명단에 있는 학생만 들어올 수 있습니다
const MAX_LEN = 3000;            // 한 칸에 저장하는 최대 글자 수
const MAX_FAILS = 10;            // 학생 비밀번호를 이만큼 연속으로 틀리면 잠깐 잠긴다
const LOCK_MINUTES = 5;          // 학생 잠금 시간(지나면 저절로 풀리고, 교사가 초기화해도 풀린다)
const MAX_STUDENTS = 1500;       // 명단 없이 운영할 때 등록할 수 있는 최대 학생 수(장난 등록 막기)
const TEACHER_MAX_FAILS = 8;     // 교사 비밀번호를 10분 안에 이만큼 틀리면 10분 동안 막는다(보조 비밀번호 TEACHER_PASSWORD2 는 막는 중에도 들어갈 수 있다)
const LIST_ALL_MAX = 120;        // 학생이 이보다 많으면 교사 화면은 반 단위로 불러온다
const MIN_TEACHER_PW = 10;       // 교사 비밀번호 최소 길이
const BACKUP_PREFIX = '백업 ';   // 초기화·백업 때 만드는 시트 이름 앞부분
const HEADER_ROWS = 2;           // 1행: 내부 이름, 2행: 한글 설명

// [내부 이름, 한글 설명] — index.html 의 보고서 구성과 같은 순서입니다.
const COLUMNS = [
  ["id","학번"],
  ["name","이름"],
  ["pin","비밀번호(암호화)"],
  ["fails","비밀번호 틀린 횟수"],
  ["lockt","잠금 시각"],
  ["created","처음 접속"],
  ["updated","마지막 저장"],
  ["s1","1차시 저장 시각"],
  ["s2","과제 1 저장 시각"],
  ["s3","2차시 저장 시각"],
  ["s4","과제 2 저장 시각"],
  ["s5","3차시 저장 시각"],
  ["t_c1","교사 확인 1"],
  ["t_f1","교사 피드백 1"],
  ["t_c2","교사 확인 2"],
  ["t_f2","교사 피드백 2"],
  ["t_c3","교사 확인 3"],
  ["t_f3","교사 피드백 3"],
  ["t_r1","기준표: 질문"],
  ["t_r2","기준표: 자료"],
  ["t_r3","기준표: 이해"],
  ["t_r4","기준표: 내 생각"],
  ["t_r5","기준표: 소통·성찰"],
  ["t_memo","교사 관찰 메모"],
  ["career","[1차시] 관심 진로"],
  ["k1","[1차시] 요즘 자주 보거나 찾아보는 것"],
  ["k2","[1차시] 관심 있는 직업이나 학과"],
  ["k3","[1차시] 재미있었던 수업이나 단원"],
  ["k4","[1차시] 생활하면서 불편하거나 이상하다고 느낀 것"],
  ["word","[1차시] 가장 오래 이야기할 수 있는 단어 1개"],
  ["c1","[1차시] 후보 질문 ①"],
  ["c2","[1차시] 후보 질문 ②"],
  ["c3","[1차시] 후보 질문 ③"],
  ["question","[1차시] 나의 탐구 질문"],
  ["reason","[1차시] 이 질문을 고른 이유"],
  ["lk_type","[1차시] 어떤 활동과 이어지나요?"],
  ["lk_what","[1차시] 그 활동에서 한 일"],
  ["lk_q","[1차시] 그때 남은 궁금증과 이번 탐구가 이어지는 점"],
  ["lk_sub","[1차시] 다른 과목의 개념과 연결하기"],
  ["guess","[1차시] 지금 내가 예상하는 답"],
  ["todo","[1차시] 알아볼 것 2~3가지"],
  ["subject","[1차시] 관련 있는 과목"],
  ["a1_title","[과제 1] 자료 카드 ① - 자료 제목"],
  ["a1_src","[과제 1] 자료 카드 ① - 출처"],
  ["a1_type","[과제 1] 자료 카드 ① - 자료 종류"],
  ["a1_sum","[과제 1] 자료 카드 ① - 핵심 내용"],
  ["a1_ans","[과제 1] 자료 카드 ① - 내 질문에 주는 답"],
  ["a1_new","[과제 1] 자료 카드 ① - 새로 생긴 궁금증"],
  ["a2_title","[과제 1] 자료 카드 ② - 자료 제목"],
  ["a2_src","[과제 1] 자료 카드 ② - 출처"],
  ["a2_type","[과제 1] 자료 카드 ② - 자료 종류"],
  ["a2_sum","[과제 1] 자료 카드 ② - 핵심 내용"],
  ["a2_ans","[과제 1] 자료 카드 ② - 내 질문에 주는 답"],
  ["a2_new","[과제 1] 자료 카드 ② - 새로 생긴 궁금증"],
  ["r1","[2차시] ① 내 질문"],
  ["r2","[2차시] ② 내가 찾은 답"],
  ["r3","[2차시] ③ 근거 1"],
  ["r4","[2차시] ④ 근거 2"],
  ["r5","[2차시] ⑤ 처음 예상과 비교"],
  ["r6","[2차시] ⑥ 내 생각"],
  ["r7","[2차시] ⑦ 아직 모르는 것"],
  ["r8","[2차시] ⑧ 다른 의견이나 이 답의 한계"],
  ["para","[과제 2] 나의 탐구 결과"],
  ["m1","[과제 2] ① 질문"],
  ["m2","[과제 2] ② 내가 찾은 답"],
  ["m3","[과제 2] ③ 근거 2가지"],
  ["m4","[과제 2] ④ 아직 모르는 것"],
  ["a3_title","[과제 2] 자료 카드 ③ (선택) - 자료 제목"],
  ["a3_src","[과제 2] 자료 카드 ③ (선택) - 출처"],
  ["a3_type","[과제 2] 자료 카드 ③ (선택) - 자료 종류"],
  ["a3_sum","[과제 2] 자료 카드 ③ (선택) - 핵심 내용"],
  ["a3_ans","[과제 2] 자료 카드 ③ (선택) - 이 자료로 내 답이 달라졌나요?"],
  ["a3_new","[과제 2] 자료 카드 ③ (선택) - 새로 생긴 궁금증"],
  ["f1n","[3차시] 받은 피드백 ① - 말해 준 사람"],
  ["f1g","[3차시] 받은 피드백 ① - 좋았던 점"],
  ["f1q","[3차시] 받은 피드백 ① - 궁금한 점 (질문)"],
  ["f2n","[3차시] 받은 피드백 ② - 말해 준 사람"],
  ["f2g","[3차시] 받은 피드백 ② - 좋았던 점"],
  ["f2q","[3차시] 받은 피드백 ② - 궁금한 점 (질문)"],
  ["f3n","[3차시] 받은 피드백 ③ - 말해 준 사람"],
  ["f3g","[3차시] 받은 피드백 ③ - 좋았던 점"],
  ["f3q","[3차시] 받은 피드백 ③ - 궁금한 점 (질문)"],
  ["v1","[3차시] 받은 질문 하나에 답하기"],
  ["v2","[3차시] 이 탐구로 달라진 내 생각"],
  ["v3","[3차시] 가장 어려웠던 점과 해결한 방법"],
  ["v4","[3차시] 관련된 학과나 직업"],
  ["v5","[3차시] 더 배우고 싶은 과목"],
  ["v6","[3차시] 다음에 알아보고 싶은 질문"],
  ["v7","[3차시] 다음 탐구 계획"],
  ["ai","[3차시] AI 사용 기록"],
  ["book","[3차시] 읽어 보고 싶은 책이나 자료"],
  ["se1","[3차시] 스스로 평가하기 - 내 관심에서 나온 질문을 스스로 정했다"],
  ["se2","[3차시] 스스로 평가하기 - 출처가 분명한 자료를 2건 이상 찾았다"],
  ["se3","[3차시] 스스로 평가하기 - 자료 내용을 내 말로 바꿔 썼다"],
  ["se4","[3차시] 스스로 평가하기 - 내 답에 근거 2가지를 붙였다"],
  ["se5","[3차시] 스스로 평가하기 - 발표하고, 받은 질문에 답했다"],
  ["se6","[3차시] 스스로 평가하기 - 다음에 할 일을 구체적으로 정했다"],
  ["last","[3차시] 활동을 마치며 한마디"]
];

const RESERVED = ['id', 'name', 'pin', 'fails', 'lockt', 'created', 'updated', 's1', 's2', 's3', 's4', 's5'];

/* ------------------------------------------------------------ 처음 한 번 실행 */
function setup() {
  if (teacherPassword_().length < MIN_TEACHER_PW) {
    Logger.log('주의: 프로젝트 설정 → 스크립트 속성에 TEACHER_PASSWORD(' + MIN_TEACHER_PW + '자 이상)를 넣어야 교사 화면이 열립니다.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getData_();
  let roster = ss.getSheetByName(SHEET_ROSTER);
  if (!roster) {
    roster = ss.insertSheet(SHEET_ROSTER);
    roster.getRange(1, 1, 1, 2).setValues([['학번', '이름']]);
    roster.setFrozenRows(1);
  }
  roster.getRange(1, 1, roster.getMaxRows(), 2).setNumberFormat('@');
}

/* ------------------------------------------------------------ 웹 앱 입구 */
function doGet() {
  return json_({ ok: true, message: '탐구 보고서 저장 서버가 동작 중입니다.' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    return json_({ ok: false, error: '접속이 많습니다. 잠시 뒤 다시 저장해 주세요.' });
  }
  try {
    return json_(handle_(req));
  } catch (err) {
    return json_({ ok: false, error: err && err.userMessage ? err.userMessage : '처리 중 오류가 났습니다. 선생님께 알려 주세요.' });
  } finally {
    lock.releaseLock();
  }
}

function handle_(req) {
  switch (req.action) {
    case 'login': return login_(req);
    case 'save': return save_(req);
    case 'teacher_list': return teacherList_(req);
    case 'teacher_save': return teacherSave_(req);
    case 'teacher_reset': return teacherReset_(req);
    case 'teacher_backup': return teacherBackup_(req);
    case 'teacher_clear': return teacherClear_(req);
    default: fail_('알 수 없는 요청입니다.');
  }
}

/* ------------------------------------------------------------ 학생 */
function login_(req) {
  const who = checkWho_(req);
  const d = getData_();
  let row = findRow_(d, who.id);
  if (!row) {
    checkRoster_(who.id, who.name);
    if (d.sh.getLastRow() - HEADER_ROWS >= MAX_STUDENTS) fail_('등록할 수 있는 학생 수를 넘었습니다. 선생님께 알려 주세요.');
    const rec = {};
    rec.id = who.id; rec.name = who.name; rec.pin = hash_(who.id, who.pin);
    rec.fails = '0'; rec.created = now_();
    row = appendRecord_(d, rec);
    return { ok: true, isNew: true, data: studentView_(readRecord_(d, row)) };
  }
  const rec = readRecord_(d, row);
  if (norm_(rec.name) !== norm_(who.name)) fail_('이 학번은 다른 이름으로 등록되어 있습니다. 학번을 확인하세요.');
  checkPin_(d, row, rec, who);
  return { ok: true, data: studentView_(readRecord_(d, row)) };
}

function save_(req) {
  const who = checkWho_(req);
  if (!/^s[1-5]$/.test(String(req.stage))) fail_('단계 정보가 올바르지 않습니다.');
  const d = getData_();
  const row = findRow_(d, who.id);
  if (!row) fail_('먼저 로그인하세요.');
  const rec = readRecord_(d, row);
  checkPin_(d, row, rec, who);
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const changes = {};
  let count = 0;
  Object.keys(data).forEach(function (k) {
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(k)) return;
    if (RESERVED.indexOf(k) >= 0 || k.indexOf('t_') === 0) return;
    if (++count > 60) return;
    changes[k] = clean_(data[k]);
  });
  const ts = now_();
  changes[req.stage] = ts;
  changes.updated = ts;
  writeRecord_(d, row, changes);
  return { ok: true, saved: ts };
}

/* ------------------------------------------------------------ 교사 */
function teacherList_(req) {
  checkTeacher_(req);
  const d = getData_();
  const last = d.sh.getLastRow();
  const rows = [];
  const classes = {};
  const cls = /^\d{1,3}$/.test(String(req.cls || '')) ? String(req.cls) : '';
  let total = 0;
  if (last > HEADER_ROWS) {
    // 학번 열만 먼저 읽어 반별 인원을 센다(반 고르기 목록에 씀)
    d.sh.getRange(HEADER_ROWS + 1, 1, last - HEADER_ROWS, 1).getValues().forEach(function (v) {
      const id = String(v[0]).trim();
      if (!id) return;
      total++;
      const c = id.slice(0, -2);
      classes[c] = (classes[c] || 0) + 1;
    });
  }
  const roster = (function () {
    const r = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ROSTER);
    return r ? Math.max(0, r.getLastRow() - 1) : 0;
  })();
  const meta = { classes: classes, total: total, roster: roster, maxFails: MAX_FAILS, lockMinutes: LOCK_MINUTES, now: Date.now() };
  // 학생이 많으면 반을 고를 때까지 목록을 보내지 않는다
  const partial = !cls && !req.all && total > LIST_ALL_MAX;
  if (partial) return Object.assign({ ok: true, rows: [], partial: true }, meta);
  if (last > HEADER_ROWS) {
    const vals = d.sh.getRange(HEADER_ROWS + 1, 1, last - HEADER_ROWS, d.keys.length).getValues();
    vals.forEach(function (v) {
      if (String(v[0]) === '') return;
      if (cls && String(v[0]).trim().slice(0, -2) !== cls) return;
      const o = {};
      d.keys.forEach(function (k, i) { if (k) o[k] = String(v[i] == null ? '' : v[i]); });
      o.hasPin = o.pin !== '';
      delete o.pin;
      rows.push(o);
    });
  }
  rows.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  return Object.assign({ ok: true, rows: rows, cls: cls }, meta);
}

function teacherSave_(req) {
  checkTeacher_(req);
  const d = getData_();
  const row = findRow_(d, String(req.id));
  if (!row) fail_('학생을 찾지 못했습니다.');
  const data = req.data && typeof req.data === 'object' ? req.data : {};
  const changes = {};
  Object.keys(data).forEach(function (k) {
    if (/^t_[a-z0-9]{1,12}$/.test(k)) changes[k] = clean_(data[k]);
  });
  writeRecord_(d, row, changes);
  return { ok: true };
}

function teacherReset_(req) {
  checkTeacher_(req);
  const d = getData_();
  const row = findRow_(d, String(req.id));
  if (!row) fail_('학생을 찾지 못했습니다.');
  writeRecord_(d, row, { pin: '', fails: '0', lockt: '' });
  return { ok: true };
}

/* ------------------------------------------------------------ 확인 */
function checkWho_(req) {
  const id = String(req.id == null ? '' : req.id).trim();
  const name = String(req.name == null ? '' : req.name).trim();
  const pin = String(req.pin == null ? '' : req.pin);
  if (!/^\d{4,5}$/.test(id)) fail_('학번은 숫자 4~5자리로 입력하세요.');
  if (name.length < 1 || name.length > 10) fail_('이름을 확인하세요.');
  if (pin.length < 4 || pin.length > 12) fail_('비밀번호는 4~12자로 정하세요.');
  return { id: id, name: name, pin: pin };
}

function checkPin_(d, row, rec, who) {
  if (rec.pin === '') {                       // 교사가 초기화한 상태: 새 비밀번호로 등록
    writeRecord_(d, row, { pin: hash_(who.id, who.pin), fails: '0', lockt: '' });
    return;
  }
  let fails = Number(rec.fails) || 0;
  const lockt = Number(rec.lockt) || 0;
  if (fails >= MAX_FAILS) {
    const left = Math.ceil((lockt + LOCK_MINUTES * 60000 - Date.now()) / 60000);
    if (left > 0) fail_('비밀번호를 여러 번 틀려 ' + left + '분 동안 잠겼습니다. 기다리거나 선생님께 초기화를 요청하세요.');
    fails = 0;                                // 잠금 시간이 지나면 다시 시도할 수 있다
  }
  if (rec.pin !== hash_(who.id, who.pin)) {
    fails += 1;
    writeRecord_(d, row, { fails: String(fails), lockt: fails >= MAX_FAILS ? String(Date.now()) : rec.lockt || '' });
    fail_(fails >= MAX_FAILS ? '비밀번호를 여러 번 틀려 ' + LOCK_MINUTES + '분 동안 잠겼습니다.' : '비밀번호가 다릅니다. 잊었으면 선생님께 초기화를 요청하세요.');
  }
  if (Number(rec.fails) > 0) writeRecord_(d, row, { fails: '0', lockt: '' });
}

function checkRoster_(id, name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ROSTER);
  if (!sh || sh.getLastRow() < 2) return;      // 명단이 비어 있으면 누구나 등록
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const ok = vals.some(function (v) { return String(v[0]).trim() === id && norm_(v[1]) === norm_(name); });
  if (!ok) fail_('명단에 없는 학번 또는 이름입니다. 다시 확인하세요.');
}

function teacherPassword_() {
  return String(PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD') || '');
}

function checkTeacher_(req) {
  const pw = teacherPassword_();
  if (pw.length < MIN_TEACHER_PW) {
    fail_('Apps Script 프로젝트 설정의 스크립트 속성에 TEACHER_PASSWORD(' + MIN_TEACHER_PW + '자 이상)를 넣어 주세요.');
  }
  const given = String(req.tpw == null ? '' : req.tpw);
  const cache = CacheService.getScriptCache();
  const tries = Number(cache.get('tfail') || 0);
  // 보조 비밀번호는 막는 중에도 통과한다(누군가 일부러 틀려 교사 화면을 막는 장난 대비)
  const pw2 = String(PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD2') || '');
  if (pw2.length >= MIN_TEACHER_PW && same_(given, pw2)) { if (tries) cache.remove('tfail'); return; }
  if (tries >= TEACHER_MAX_FAILS) fail_('교사 비밀번호를 여러 번 틀려 10분 동안 막았습니다. 보조 비밀번호(TEACHER_PASSWORD2)가 있으면 그것으로 들어오세요.');
  if (!same_(given, pw)) {
    cache.put('tfail', String(tries + 1), 600);
    Utilities.sleep(800);
    fail_('교사 비밀번호가 다릅니다.');
  }
  if (tries) cache.remove('tfail');           // 맞게 들어오면 틀린 횟수를 지운다
}

// 글자를 끝까지 비교해 맞힌 글자 수로 시간이 달라지지 않게 한다
function same_(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ------------------------------------------------------------ 백업과 초기화 */
function backupSheet_(d, note) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let name = BACKUP_PREFIX + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + (note ? ' ' + note : '');
  let k = 2;
  while (ss.getSheetByName(name)) name = name.replace(/ \(\d+\)$/, '') + ' (' + (k++) + ')';
  const copy = d.sh.copyTo(ss).setName(name);
  copy.getRange(1, 1, copy.getMaxRows(), copy.getMaxColumns()).setNumberFormat('@');
  ss.setActiveSheet(d.sh);
  return name;
}

function teacherBackup_(req) {
  checkTeacher_(req);
  const d = getData_();
  return { ok: true, backup: backupSheet_(d, '') };
}

// scope: 'all'(모든 학생) 또는 'class'(cls로 시작하는 학번만). 지우기 전에 반드시 백업 시트를 만든다.
function teacherClear_(req) {
  checkTeacher_(req);
  if (String(req.confirm || '') !== '초기화') fail_('확인 글자가 맞지 않습니다.');
  const cls = String(req.cls || '');
  if (req.scope === 'class' && !/^\d{1,3}$/.test(cls)) fail_('반 정보가 올바르지 않습니다.');
  const d = getData_();
  const backup = backupSheet_(d, req.scope === 'class' ? cls + '반 초기화 전' : '초기화 전');
  const last = d.sh.getLastRow();
  let removed = 0;
  if (last > HEADER_ROWS) {
    if (req.scope === 'class') {
      if (d.sh.getMaxRows() <= last) d.sh.insertRowsAfter(last, 10);   // 고정 행만 남지 않게
      const ids = d.sh.getRange(HEADER_ROWS + 1, 1, last - HEADER_ROWS, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        const id = String(ids[i][0]);
        if (id && id.slice(0, -2) === cls) { d.sh.deleteRow(HEADER_ROWS + 1 + i); removed++; }
      }
    } else {
      removed = last - HEADER_ROWS;
      d.sh.getRange(HEADER_ROWS + 1, 1, removed, d.sh.getMaxColumns()).clearContent();
    }
  }
  return { ok: true, backup: backup, removed: removed };
}

/* ------------------------------------------------------------ 시트 읽고 쓰기 */
function getData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_DATA);
  if (!sh) sh = ss.insertSheet(SHEET_DATA);
  if (sh.getLastRow() < HEADER_ROWS) {
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getMaxColumns(), 1)).setNumberFormat('@');
    if (sh.getMaxColumns() < COLUMNS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLUMNS.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), COLUMNS.length).setNumberFormat('@');
    sh.getRange(1, 1, 2, COLUMNS.length).setValues([
      COLUMNS.map(function (c) { return c[0]; }),
      COLUMNS.map(function (c) { return c[1]; })
    ]);
    sh.setFrozenRows(HEADER_ROWS);
    sh.setFrozenColumns(2);
  }
  const keys = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (k) { return String(k).trim(); });
  return { sh: sh, keys: keys };
}

function findRow_(d, id) {
  const last = d.sh.getLastRow();
  if (last <= HEADER_ROWS) return 0;
  const ids = d.sh.getRange(HEADER_ROWS + 1, 1, last - HEADER_ROWS, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) return HEADER_ROWS + 1 + i;
  return 0;
}

function readRecord_(d, row) {
  const v = d.sh.getRange(row, 1, 1, d.keys.length).getValues()[0];
  const o = {};
  d.keys.forEach(function (k, i) { if (k) o[k] = String(v[i] == null ? '' : v[i]); });
  return o;
}

function ensureKeys_(d, keys) {
  keys.forEach(function (k) {
    if (d.keys.indexOf(k) >= 0) return;
    if (d.keys.length >= 200) fail_('열이 너무 많습니다.');
    const col = d.keys.length + 1;
    if (d.sh.getMaxColumns() < col) d.sh.insertColumnsAfter(d.sh.getMaxColumns(), 1);
    d.sh.getRange(1, col, d.sh.getMaxRows(), 1).setNumberFormat('@');
    d.sh.getRange(1, col, 2, 1).setValues([[k], [k]]);
    d.keys.push(k);
  });
}

function writeRecord_(d, row, changes) {
  ensureKeys_(d, Object.keys(changes));
  const range = d.sh.getRange(row, 1, 1, d.keys.length);
  const v = range.getValues()[0].map(function (x) { return guard_(String(x == null ? '' : x)); });
  Object.keys(changes).forEach(function (k) { v[d.keys.indexOf(k)] = guard_(String(changes[k])); });
  range.setNumberFormat('@');
  range.setValues([v]);
}

function appendRecord_(d, rec) {
  ensureKeys_(d, Object.keys(rec));
  const row = Math.max(d.sh.getLastRow(), HEADER_ROWS) + 1;
  if (d.sh.getMaxRows() < row) d.sh.insertRowsAfter(d.sh.getMaxRows(), 50);
  const v = d.keys.map(function (k) { return rec[k] == null ? '' : guard_(String(rec[k])); });
  const range = d.sh.getRange(row, 1, 1, d.keys.length);
  range.setNumberFormat('@');
  range.setValues([v]);
  return row;
}

/* ------------------------------------------------------------ 도구 */
function studentView_(rec) {
  const o = {};
  Object.keys(rec).forEach(function (k) {
    if (k === 'pin' || k === 'fails' || k === 'lockt' || k === 't_memo' || k === 't_note' || /^t_r/.test(k)) return;   // 기준표·관찰 메모·특기사항 초안은 학생에게 보내지 않는다
    o[k] = rec[k];
  });
  return o;
}

function clean_(v) {
  return String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, MAX_LEN);
}

// 학생이 쓴 글이 시트에서 수식으로 실행되지 않도록 막습니다.
function guard_(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function norm_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, '');
}

function hash_(id, pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'bum:' + id + ':' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM-dd HH:mm');
}

function fail_(msg) {
  const e = new Error(msg);
  e.userMessage = msg;
  throw e;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
