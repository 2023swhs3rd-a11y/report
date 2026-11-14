"use strict";
/* ---------- 작은 도구 ---------- */
function h(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x) e.append(x); });
    else e.append(c);
  }
  return e;
}
const $app = document.getElementById("app");
/* 빈 값(null·false)은 건너뛰고 내용을 바꿉니다. replaceChildren에 null을 넘기면 "null" 글자가 찍힙니다. */
function put(el) {
  const list = [];
  (function add(a) { a.forEach(function (x) { if (Array.isArray(x)) add(x); else if (x != null && x !== false) list.push(x); }); })([].slice.call(arguments, 1));
  el.replaceChildren.apply(el, list);
}
function fieldsOf(st) {
  const out = [];
  st.blocks.forEach(function (b) { if (b.t === "f") out.push(b); else if (b.t === "card") b.fields.forEach(function (f) { out.push(f); }); });
  return out;
}
function filled(v) { return v != null && String(v).trim() !== ""; }
/* 0 없음 · 1 작성 중 · 2 완료(저장했고 필수 칸을 모두 채움) */
function stageStatus(d, st) {
  const fs = fieldsOf(st);
  const any = fs.some(function (f) { return filled(d[f.key]); });
  const reqOk = fs.filter(function (f) { return f.req; }).every(function (f) { return filled(d[f.key]); });
  if (filled(d[st.id]) && reqOk) return 2;
  return any || filled(d[st.id]) ? 1 : 0;
}
const STATUS = [["○", "아직"], ["◐", "작성 중"], ["●", "완료"]];
let toastTimer = null;
function toast(msg, err) {
  document.querySelectorAll(".toast").forEach(function (t) { t.remove(); });
  const t = h("div", { class: "toast" + (err ? " err" : ""), role: "status", text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.remove(); }, err ? 6000 : 2500);
}
function store(key, val) {
  try {
    if (val === undefined) { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { /* 저장소를 못 쓰는 환경에서는 조용히 넘어갑니다 */ }
  return null;
}

/* ---------- 서버 통신 ---------- */
const DEMO = !API_URL;
/* 다시 보내면 되는 오류(인터넷 끊김, 서버 응답 없음)는 net 표시를 붙인다 */
function netErr(m) { const e = new Error(m); e.net = true; return e; }
async function api(req) {
  if (DEMO) return demoApi(req);
  let res;
  try {
    res = await fetch(API_URL, { method: "POST", body: JSON.stringify(req), redirect: "follow" });
  } catch (e) { throw netErr("서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요."); }
  let out;
  try { out = await res.json(); } catch (e) { throw netErr("서버 응답을 읽지 못했습니다. 잠시 뒤 다시 시도하세요."); }
  if (!out.ok) throw new Error(out.error || "처리하지 못했습니다.");
  return out;
}
/* 미리보기 모드: 서버 없이 이 기기에서만 동작합니다. 교사 비밀번호는 demo 입니다. */
let demoMem = null;
function demoApi(req) {
  const db = demoMem || store("bum_demo") || { rows: {} };
  demoMem = db;
  const now = new Date().toLocaleString("ko-KR", { hour12: false });
  const fail = function (m) { throw new Error(m); };
  const pub = function (r) { const o = {}; for (const k in r) if (k !== "pin" && k !== "t_memo" && k !== "t_note" && !/^t_r/.test(k)) o[k] = r[k]; return o; };
  let out;
  if (req.action === "change_pin") {
    const r = db.rows[req.id];
    if (!r || r.pin !== req.pin) fail("비밀번호가 다릅니다.");
    if (String(req.newpin).length < 4) fail("새 비밀번호는 4~12자로 정하세요.");
    r.pin = req.newpin; store("bum_demo", db);
    return Promise.resolve({ ok: true });
  }
  if (req.action === "login" || req.action === "save") {
    let r = db.rows[req.id];
    if (!r) {
      if (req.action === "save") fail("먼저 로그인하세요.");
      r = db.rows[req.id] = { id: req.id, name: req.name, pin: req.pin, created: now };
    } else if (!r.pin) { r.pin = req.pin; }
    else if (r.pin !== req.pin) fail("비밀번호가 다릅니다. 잊었으면 선생님께 초기화를 요청하세요.");
    else if (req.action === "login" && r.name !== req.name) fail("이 학번은 다른 이름으로 등록되어 있습니다. 학번을 확인하세요.");
    if (req.action === "save") {
      for (const k in req.data) if (!/^(t_|s[1-5]$)/.test(k)) r[k] = String(req.data[k]);
      r[req.stage] = now; r.updated = now;
      out = { ok: true, saved: now };
    } else out = { ok: true, data: pub(r) };
  } else {
    if (req.tpw !== "demo") fail("교사 비밀번호가 다릅니다. (미리보기 모드에서는 demo)");
    if (req.action === "teacher_list") {
      const classes = {};
      Object.keys(db.rows).forEach(function (k) { const c = k.slice(0, -2); classes[c] = (classes[c] || 0) + 1; });
      out = { ok: true, classes: classes, total: Object.keys(db.rows).length, roster: -1, maxFails: 10, lockMinutes: 5, now: Date.now(),
        rows: Object.keys(db.rows).sort().filter(function (k) { return !req.cls || k.slice(0, -2) === req.cls; })
          .map(function (k) { const o = Object.assign({}, db.rows[k]); o.hasPin = !!o.pin; delete o.pin; return o; }) };
    }
    else if (req.action === "teacher_save") { for (const k in req.data) if (/^t_/.test(k)) db.rows[req.id][k] = String(req.data[k]); out = { ok: true }; }
    else if (req.action === "teacher_reset") { db.rows[req.id].pin = ""; out = { ok: true }; }
    else if (req.action === "teacher_backup" || req.action === "teacher_clear") {
      if (req.action === "teacher_clear" && req.confirm !== "초기화") fail("확인 글자가 맞지 않습니다.");
      const name = "백업 " + now + (req.action === "teacher_clear" ? " 초기화 전" : "");
      db.backups = db.backups || {}; db.backups[name] = JSON.parse(JSON.stringify(db.rows));
      let removed = 0;
      if (req.action === "teacher_clear") Object.keys(db.rows).forEach(function (k) {
        if (req.scope === "all" || k.slice(0, -2) === req.cls) { delete db.rows[k]; removed++; }
      });
      out = { ok: true, backup: name, removed: removed };
    }
    else fail("알 수 없는 요청입니다.");
  }
  store("bum_demo", db);
  return Promise.resolve(JSON.parse(JSON.stringify(out)));
}

/* ---------- 읽기 전용 보기 (전체 보기, 교사 화면에서 함께 씀) ---------- */
function answersView(d) {
  const box = h("div", { class: "view" });
  STAGES.forEach(function (st) {
    box.append(h("h3", { class: "c-" + st.id }, h("span", { class: "em", "aria-hidden": "true", text: LOOK[st.id] }), st.badge + " " + st.nick + " · " + st.title, h("small", { text: filled(d[st.id]) ? "저장 " + d[st.id] : "저장 전" })));
    const dl = h("dl", { class: "c-" + st.id });
    const add = function (f, pre) {
      dl.append(h("dt", { text: (pre ? pre + " · " : "") + f.label }), h("dd", { class: filled(d[f.key]) ? "" : "empty", text: filled(d[f.key]) ? String(d[f.key]) : "—" }));
    };
    st.blocks.forEach(function (b) {
      if (b.t === "f") add(b);
      else if (b.t === "card") b.fields.forEach(function (f) { add(f, b.title === "스스로 평가하기" ? "" : b.title.split(" · ")[0]); });
    });
    box.append(dl);
  });
  return box;
}

/* ============================================================
   학생 화면
   ============================================================ */
const S = { id: "", name: "", pin: "", data: {}, cur: "s1", dirty: false, busy: false, browse: false };
function startBrowse() {
  S.browse = true; S.id = ""; S.name = ""; S.pin = ""; S.data = {}; S.cur = "s1"; S.dirty = false;
  renderStudent(); window.scrollTo(0, 0);
}
/* 비밀번호 바꾸기: 처음 비밀번호(생년월일)는 친구가 알 수 있으므로 바꾸기를 권한다 */
async function changePin() {
  const a = prompt("새 비밀번호를 정해 주세요 (4~12자, 생년월일은 안 돼요)");
  if (a == null) return;
  if (a.length < 4 || a.length > 12) return toast("새 비밀번호는 4~12자로 정하세요.", true);
  const b = prompt("확인을 위해 새 비밀번호를 한 번 더 써 주세요");
  if (b == null) return;
  if (a !== b) return toast("두 번 쓴 비밀번호가 달라요. 다시 해 주세요.", true);
  try {
    await api({ action: "change_pin", id: S.id, name: S.name, pin: S.pin, newpin: a });
    S.pin = a; S.initial = false; renderStudent();
    toast("🔑 비밀번호를 바꿨어요. 다음부터는 새 비밀번호로 들어와요.");
  } catch (e) { toast(e.message, true); }
}
function goHome() { leaveStudent(); window.scrollTo(0, 0); }
function goLogin() {
  leaveStudent();
  const id = document.getElementById("lid");
  if (id) { id.closest("form").scrollIntoView({ block: "center" }); id.focus({ preventScroll: true }); }
}
function leaveStudent() {
  /* 공용 컴퓨터를 생각해 이 기기에 남은 임시 저장과 화면의 글을 지운다 */
  if (S.id) store("bum_draft_" + S.id, null);
  clearTimeout(S.autoT); clearTimeout(S.retryT);
  if (S.id && pendGet()) toast("📶 아직 못 보낸 내용은 이 기기에 보관했다가, 다음에 로그인하면 보내요.");
  S.browse = false; S.id = S.name = S.pin = ""; S.data = {}; S.dirty = false;
  renderLogin();
}

function demoBanner() {
  return DEMO ? h("div", { class: "demo" }, h("b", { text: "미리보기 모드 " }), "입력한 내용은 이 기기에만 저장되고 선생님께 전달되지 않습니다.") : null;
}
function renderLogin() {
  document.body.classList.remove("has-bar");
  window.scrollTo(0, 0);
  $app.className = "wrap";
  const id = h("input", { type: "text", id: "lid", inputmode: "numeric", autocomplete: "off", maxlength: "5", placeholder: "예: 10312" });
  const name = h("input", { type: "text", id: "lname", autocomplete: "off", maxlength: "10" });
  const pin = h("input", { type: "password", id: "lpin", autocomplete: "off", maxlength: "12" });
  const go = h("button", { class: "btn", type: "submit", style: "width:100%", text: "출발하기 🚀" });
  const form = h("form", { class: "panel start", onsubmit: async function (ev) {
    ev.preventDefault();
    const v = { id: id.value.trim(), name: name.value.trim(), pin: pin.value };
    if (!/^\d{4,5}$/.test(v.id)) return toast("학번은 숫자 4~5자리로 입력하세요.", true);
    if (!v.name) return toast("이름을 입력하세요.", true);
    if (v.pin.length < 3) return toast("비밀번호를 확인하세요. 생년월일이면 0310처럼 4자리로 써요.", true);
    go.disabled = true; go.textContent = "확인하는 중…";
    try {
      const out = await api({ action: "login", id: v.id, name: v.name, pin: v.pin });
      S.id = v.id; S.name = v.name; S.pin = v.pin; S.data = out.data || {}; S.initial = !!out.initial;
      let draft = store("bum_draft_" + S.id);
      if (draft && !(draft.at > Date.now() - 3 * 86400000)) { store("bum_draft_" + S.id, null); draft = null; }   // 3일 지난 임시 저장은 버린다
      S.browse = false;
      if (draft && draft.data) { Object.assign(S.data, draft.data); S.dirty = true; S.cur = draft.cur || "s1"; }
      else { const next = STAGES.find(function (st) { return stageStatus(S.data, st) < 2; }); S.cur = next ? next.id : "s5"; }
      const pend = pendGet();
      if (pend) Object.keys(pend).forEach(function (k) { if (/^s\d$/.test(k)) Object.assign(S.data, pend[k]); });
      renderStudent(); window.scrollTo(0, 0);
      if (S.initial) setTimeout(function () { toast("🔑 처음 비밀번호(생년월일)는 친구도 알 수 있어요. 위의 '비밀번호 바꾸기'로 나만 아는 비밀번호로 바꿔 두세요."); }, 2500);
      if (pend) flushPending();
      else if (draft && draft.data) toast("저장하지 않은 내용을 불러왔습니다. 1분 뒤 자동으로 저장되고, 💾를 눌러 바로 저장해도 돼요.");
      if (draft && draft.data) scheduleAuto();
    } catch (e) { toast(e.message, true); go.disabled = false; go.textContent = "출발하기 🚀"; }
  } },
    h("h2", { text: "👋 시작해 볼까요?" }),
    h("label", { class: "fl", for: "lid", text: "학번" }), id,
    h("label", { class: "fl", for: "lname", text: "이름" }), name,
    h("label", { class: "fl", for: "lpin", text: "비밀번호" }),
    h("p", { class: "hint", text: "처음 비밀번호는 생년월일 4자리(월일)예요. 예: 3월 10일 → 0310. 들어온 뒤 '🔑 비밀번호 바꾸기'로 나만 아는 비밀번호로 바꿀 수 있어요. 선생님이 생년월일을 정해 두지 않았다면 처음 들어올 때 내가 쓸 비밀번호(4자 이상)를 정해요." }), pin,
    h("div", { style: "margin-top:20px" }, go),
    h("button", { class: "btn ghost", type: "button", style: "width:100%; margin-top:8px", text: "👀 먼저 둘러볼래요 (저장 안 됨)", onclick: startBrowse }),
    h("p", { class: "hint", style: "margin:12px 0 0", text: "비밀번호를 잊었으면 선생님께 초기화를 부탁하세요. 쓰던 내용은 지워지지 않아요." }));
  put($app,
    h("header", { class: "hero" },
      h("div", null,
        h("span", { class: "kick", text: "🗺️ 1학년 중점 진로 활동" }),
        h("h1", null, "진로 빌드업 맵", h("br"), h("em", { text: "탐구 보고서" })),
        h("p", { class: "lead", text: "내가 궁금한 것을 질문 하나로 만들고, 자료를 찾아 내 힘으로 답해 보는 활동이에요. 정답은 없어요!" }),
        h("ul", { class: "chips" }, h("li", { text: "🏫 수업 3번 + 🏠 과제 2번" }), h("li", { text: "💾 단계마다 저장" }), h("li", { text: "🙆 정답 없음" })),
        h("button", { class: "btn ghost browse-btn", type: "button", text: "👀 로그인 없이 둘러보기", onclick: startBrowse })),
      h("img", { class: "art", src: "img/map.svg?v=2", width: "620", height: "380", alt: "탐구 지도: 출발해서 다섯 정거장을 지나 도착 깃발까지 가는 그림" })),
    demoBanner(),
    h("div", { class: "login" },
      h("section", { class: "panel" },
        h("h2", { text: "🧭 이렇게 진행해요" }),
        h("p", { class: "hint", text: "다섯 정거장을 하나씩 지나가요. 단계마다 저장하고, 다음에 이어서 쓰면 돼요." }),
        kindLegend(),
        h("ol", { class: "flow" }, STAGES.map(function (st) {
          return h("li", { class: "c-" + st.id + " " + kcls(st) }, h("span", { class: "em", "aria-hidden": "true", text: LOOK[st.id] }),
            h("b", null, h("span", { class: "kpill", text: st.kind === "과제" ? "🏠 과제" : "🏫 수업" }), st.badge + " · " + st.nick), h("span", { text: st.title + " — " + st.goal + " · " + st.time }));
        }))),
      form),
    h("div", { style: "margin-top:16px" }, collegeBox(false)));
}
/* 드롭다운 대신 눌러서 고르는 버튼 묶음. 같은 버튼을 다시 누르면 선택이 풀린다 */
const SEG_EMO = { "잘함": "🌟", "보통": "🙂", "노력 필요": "💪" };
function segEl(opts, val, onPick, label) {
  const box = h("div", { class: "seg", role: "radiogroup", "aria-label": label });
  box.dataset.v = val || "";
  const sync = function () {
    box.querySelectorAll("button").forEach(function (b) {
      const on = b.dataset.v === box.dataset.v;
      b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
  };
  opts.forEach(function (o) {
    const b = h("button", { type: "button", role: "radio", text: (SEG_EMO[o] ? SEG_EMO[o] + " " : "") + o, onclick: function () {
      box.dataset.v = box.dataset.v === o ? "" : o; sync(); onPick(box.dataset.v);
    } });
    b.dataset.v = o; box.append(b);
  });
  sync();
  return box;
}
/* 단어 끝 글자에 받침이 있으면 은·을·과, 없으면 는·를·와를 고른다(한글이 아니면 두 가지를 다 둔다) */
function withJosa(t, w) {
  return t.replace(/\{w\}(은\(는\)|을\(를\)|와\(과\))/, function (m, pair) {
    const c = w.charCodeAt(w.length - 1);
    if (w === "~" || c < 0xAC00 || c > 0xD7A3) return w + pair;
    const has = (c - 0xAC00) % 28 > 0;
    const a = pair.slice(0, 1), b = pair.slice(2, 3);   // 예: "은(는)" → 은, 는
    return w + (has ? (a === "와" ? "과" : a) : (a === "와" ? "와" : b));
  });
}
const QTPL_LABEL = ["왜 ~일까?", "어떤 영향을 줄까?", "무엇이 다를까?", "줄이려면(늘리려면)?", "앞으로 어떻게?"];
/* "모두 합쳐 5개 이상"처럼 묶어서 채우는 칸은 '선택' 표시를 붙이지 않는다(건너뛰어도 된다고 읽히지 않게) */
const NO_OPT = ["career", "k1", "k2", "k3", "k4", "word"];
function fieldEl(f) {
  const idv = "f_" + f.key;
  let inp;
  const val = S.data[f.key] == null ? "" : String(S.data[f.key]);
  const set = function (v) { S.data[f.key] = v; markDirty(); };
  if (f.kind === "select") inp = segEl(f.opts, val, set, f.label);
  else {
    if (f.kind === "area") inp = h("textarea", { id: idv, rows: f.rows || 3, maxlength: "3000" });
    else inp = h("input", { type: "text", id: idv, maxlength: "300" });
    inp.value = val;
    const on = function () { set(inp.value); };
    inp.addEventListener("input", on); inp.addEventListener("change", on);
  }
  let helper = null;
  if (f.chips) helper = h("div", { class: "pick" }, h("span", { class: "plabel", text: "막히면 골라 봐요" }), f.chips.map(function (c) {
    return h("button", { type: "button", text: "+ " + c, onclick: function () {
      const parts = inp.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.indexOf(c) < 0) parts.push(c);
      inp.value = parts.join(", "); set(inp.value); inp.focus();
    } });
  }));
  if (f.qtpl) helper = h("div", { class: "pick" }, h("span", { class: "plabel", text: "질문 틀 넣기" }), QTPL.map(function (t, k) {
    return h("button", { type: "button", text: QTPL_LABEL[k], onclick: function () {
      const w = filled(S.data.word) ? String(S.data.word).trim() : "~";
      if (filled(inp.value) && !confirm("지금 쓴 질문을 이 틀로 바꿀까요?")) return;
      inp.value = withJosa(t, w); set(inp.value); inp.focus();
    } });
  }));
  const tag = f.req ? h("span", { class: "req must", text: "필수" }) : f.challenge ? h("span", { class: "req ch", text: "🚀 도전" }) : f.link ? h("span", { class: "req lk", text: "🔗 연결" }) : NO_OPT.indexOf(f.key) >= 0 ? null : h("span", { class: "req opt", text: "선택" });
  /* 질문 카드: 질문(제목·설명) → 예시(참고) → 내 답(가장 뚜렷하게) 순서로 구역을 나눈다 */
  return h("div", { class: "fwrap" + (f.req ? " isreq" : "") + (f.challenge ? " challenge" : "") + (f.link ? " linked" : "") + (filled(val) ? " done" : ""), "data-k": f.key },
    h("div", { class: "qhead" },
      f.kind === "select" ? h("p", { class: "fl" }, f.label, tag) : h("label", { class: "fl", for: idv }, f.label, tag),
      h("span", { class: "qdone", "aria-hidden": "true", text: "✓ 썼어요" })),
    f.hint ? h("p", { class: "hint", text: f.hint }) : null,
    exBox(f),
    h("div", { class: "ans" },
      h("p", { class: "anslabel" }, f.kind === "select" ? "👆 하나 골라요" : "✏️ 내 답", f.ph ? h("span", { class: "tpl", text: f.ph }) : null),
      inp, helper));
}
/* 이 단계의 필수 칸과 도전 과제 */
function reqItems(st) {
  const out = [];
  st.blocks.forEach(function (b) {
    if (b.t === "f" && b.req) out.push([b.key, b.label]);
    else if (b.t === "card") b.fields.forEach(function (f) { if (f.req) out.push([f.key, b.title.split(" · ")[0].replace("자료 카드 ", "카드 ") + " " + f.label]); });
  });
  return out;
}
function levelsBox(st) {
  const items = reqItems(st);
  return h("div", { class: "levels one" },
    h("div", { class: "lv base" }, h("b", { text: "✅ 이 단계에서 할 일" }), h("span", { class: "lcnt", id: "reqcnt" }),
      h("p", { class: "lvhint", text: "아래 '필수' 칸만 쓰고 💾 저장하면 이 단계 완성이에요. 누르면 그 칸으로 가요." }),
      h("ul", { id: "reqlist" }, items.map(function (x) { return h("li", { "data-k": x[0] }, h("button", { type: "button", class: "linkbtn", text: x[1], onclick: function () { jumpTo(x[0]); } })); }))));
}
/* 가이드·더 해 보기·예시 친구 소개는 접어 둔다(첫 질문이 빨리 보이게) */
function moreInfo(st, lead) {
  /* 휴대폰에서는 접고, 태블릿·PC에서는 펼친다 */
  return h("details", { class: "moreinfo", open: window.matchMedia("(min-width: 641px)").matches || null },
    h("summary", null, h("span", { text: "📖 안내 더 보기" }), h("small", { text: "가이드 · 더 해 보고 싶다면 · 예시 친구" })),
    lead.map(blockEl),
    st.more ? h("div", { class: "lv more" }, h("b", { text: "🚀 더 해 보고 싶다면" }),
      h("ul", null, st.more.map(function (m) { return h("li", { text: m }); }))) : null);
}
function jumpTo(k) {
  const el = document.querySelector('.fwrap[data-k="' + k + '"]');
  if (!el) return;
  for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  const inp = el.querySelector("textarea, input, .seg button");
  if (inp) inp.focus({ preventScroll: true });
}
/* 단계 맨 아래: 저장하고 다음 단계로 (마지막 단계는 저장하고 전체 보기) */
function stageEnd(st) {
  const i = STAGES.indexOf(st), next = STAGES[i + 1];
  return h("div", { class: "stage-end noprint" },
    h("p", { text: next ? "여기까지 썼으면 저장하고 다음 단계로 가요. 다 못 썼어도 괜찮아요. 나중에 돌아와서 이어 쓸 수 있어요." : "마지막 단계예요. 저장하고 내 보고서 전체를 확인해요." }),
    h("button", { class: "btn big", type: "button",
      text: next ? "💾 저장하고 다음으로 넘어가기 → " + next.badge + " " + next.nick : "💾 저장하고 내 보고서 전체 보기",
      onclick: async function () {
        if (next) { await goStage(next.id); return; }
        if (await saveStage(false)) renderAll();
      } }));
}
function nextReq() {
  const st = STAGES.find(function (s) { return s.id === S.cur; });
  const left = reqItems(st).filter(function (x) { return !filled(S.data[x[0]]); });
  if (left.length) jumpTo(left[0][0]);
}
function updReq() {
  const ul = document.getElementById("reqlist"); if (!ul) return;
  let n = 0, all = 0;
  ul.querySelectorAll("li").forEach(function (li) { const ok = filled(S.data[li.dataset.k]); li.classList.toggle("ok", ok); all++; if (ok) n++; });
  const c = document.getElementById("reqcnt"); if (c) c.textContent = n + " / " + all + (n === all ? " · 저장하면 완성! 🎉" : "");
  document.querySelectorAll(".fwrap[data-k]").forEach(function (el) { el.classList.toggle("done", filled(S.data[el.dataset.k])); });
  const nb = document.getElementById("nextreq");
  if (nb) { nb.textContent = n === all ? "필수 " + n + "/" + all + " 🎉" : "필수 " + n + "/" + all + " · 빈 칸 ↓"; nb.disabled = n === all; }
}
function markDirty() {
  updReq();
  if (S.browse || !S.id) return;
  S.dirty = true;
  store("bum_draft_" + S.id, { cur: S.cur, data: stageData(S.cur), at: Date.now() });
  const st = document.getElementById("savestate");
  if (st) { st.textContent = "✋ 저장 안 됨 · 1분 뒤 자동 저장"; st.className = "state dirty"; }
  scheduleAuto();
}
/* 자동 저장: 마지막으로 고친 뒤 1분 동안 손을 멈추면 저장한다 */
const AUTO_MS = 60000;
function scheduleAuto() {
  clearTimeout(S.autoT);
  if (S.browse || !S.id) return;
  S.autoT = setTimeout(function () {
    if (!S.dirty || S.browse || !S.id) return;
    if (S.busy) return scheduleAuto();
    saveStage("auto");
  }, AUTO_MS);
}
/* 보관함: 인터넷이 끊겨 못 보낸 단계 내용을 이 기기에 두었다가 연결되면 다시 보낸다 */
function pendKey() { return "bum_pend_" + S.id; }
function pendGet() { if (!S.id) return null; const p = store(pendKey()); return p && Object.keys(p).some(function (k) { return /^s\d$/.test(k); }) ? p : null; }
function pendPut(sid, data) { const p = store(pendKey()) || {}; p[sid] = Object.assign(p[sid] || {}, data); p.at = Date.now(); store(pendKey(), p); }
function pendDrop(sid) { const p = store(pendKey()); if (!p) return; delete p[sid]; store(pendKey(), Object.keys(p).some(function (k) { return /^s\d$/.test(k); }) ? p : null); }
function scheduleRetry() { clearTimeout(S.retryT); S.retryT = setTimeout(flushPending, 30000); }
async function flushPending() {
  clearTimeout(S.retryT);
  const p = pendGet();
  if (!p || S.browse) return;
  if (S.busy) return scheduleRetry();
  S.busy = true;
  let sent = 0;
  try {
    for (const sid of Object.keys(p).filter(function (k) { return /^s\d$/.test(k); })) {
      const out = await api({ action: "save", id: S.id, name: S.name, pin: S.pin, stage: sid, data: p[sid] });
      S.data[sid] = out.saved; pendDrop(sid); sent++;
    }
    toast("📶 보관해 두었던 내용을 선생님께 보냈어요.");
  } catch (e) {
    if (e.net) scheduleRetry(); else toast(e.message, true);
  } finally { S.busy = false; if (sent || !pendGet()) { renderBar(); renderNav(); } }
}
window.addEventListener("online", function () { if (S.id && !S.browse) flushPending(); });
function stageData(sid) {
  const o = {};
  fieldsOf(STAGES.find(function (s) { return s.id === sid; })).forEach(function (f) { if (S.data[f.key] != null) o[f.key] = S.data[f.key]; });
  return o;
}
async function saveStage(quiet) {
  if (S.browse) { if (!quiet) toast("👀 둘러보기 중에는 저장되지 않아요. 로그인하고 써 주세요."); return true; }
  if (S.busy) return false;
  S.busy = true;
  const btn = document.getElementById("savebtn");
  if (btn) { btn.disabled = true; btn.textContent = "저장하는 중…"; }
  try {
    const st = STAGES.find(function (x) { return x.id === S.cur; });
    const before = stageStatus(S.data, st);
    clearTimeout(S.autoT);
    const out = await api({ action: "save", id: S.id, name: S.name, pin: S.pin, stage: S.cur, data: stageData(S.cur) });
    S.data[S.cur] = out.saved; S.dirty = false; S.autoAt = quiet === "auto"; store("bum_draft_" + S.id, null);
    pendDrop(S.cur);
    if (before < 2 && stageStatus(S.data, st) === 2) celebrate(st);
    else if (!quiet) toast("💾 저장했어요.");
    if (pendGet()) setTimeout(flushPending, 0);
    return true;
  } catch (e) {
    if (e.net) {
      /* 연결이 끊겼으면 이 기기에 보관하고, 연결되면 저절로 보낸다. 다음 단계로 넘어가도 된다 */
      pendPut(S.cur, stageData(S.cur)); S.dirty = false; store("bum_draft_" + S.id, null);
      if (quiet !== "auto") toast("📶 인터넷이 끊겨 이 기기에 보관했어요. 연결되면 자동으로 보내요. 창을 닫지 말아 주세요.", true);
      scheduleRetry();
      return true;
    }
    toast(e.message, true); return false;
  }
  finally { S.busy = false; renderBar(); renderNav(); }
}
function doneCount() { return STAGES.filter(function (st) { return stageStatus(S.data, st) === 2; }).length; }
function celebrate(st) {
  const all = doneCount() === STAGES.length;
  const i = STAGES.indexOf(st), next = STAGES[i + 1];
  toast(all ? "🏆 다섯 정거장을 모두 지났어요! 보고서 완성!" : "🎉 " + st.badge + " '" + st.nick + "' 완료!" + (next ? " 다음은 " + next.badge + " '" + next.nick + "' " + LOOK[next.id] : ""));
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#f59e0b", "#0ea5e9", "#22c55e", "#ec4899", "#8b5cf6", "#facc15"];
  const box = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let k = 0; k < (all ? 70 : 36); k++) {
    const c = h("i");
    c.style.left = (Math.random() * 100) + "%";
    c.style.background = colors[k % colors.length];
    c.style.animationDelay = (Math.random() * 0.4) + "s";
    c.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
    c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    box.append(c);
  }
  document.body.append(box);
  setTimeout(function () { box.remove(); }, 2600);
  if (all && S.cur === st.id) renderStudent();
}
async function goStage(sid) {
  if (sid === S.cur) return;
  if (S.dirty && !(await saveStage(true))) return;
  S.cur = sid; renderStudent(); window.scrollTo(0, 0);
}
function renderNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  put(nav, STAGES.map(function (st) {
    const n = stageStatus(S.data, st), s = STATUS[n];
    return h("button", { type: "button", class: "c-" + st.id + " s" + n + " " + kcls(st), "aria-current": st.id === S.cur ? "true" : null,
      "aria-label": st.badge + " " + st.nick + "(" + st.kind + ") " + s[1], onclick: function () { goStage(st.id); } },
      h("span", { class: "em", "aria-hidden": "true", text: LOOK[st.id] }), h("b", { text: st.nick }), h("span", null, h("i", { class: "kemo", "aria-hidden": "true", text: st.kind === "과제" ? "🏠 " : "🏫 " }), st.badge + " · " + s[1]));
  }));
  const pr = document.getElementById("prog");
  if (pr) {
    const dc = doneCount();
    put(pr, h("b", { text: "🗺️ 나의 탐구 지도" }),
      h("span", { class: "cnt", text: dc === STAGES.length ? "다섯 정거장 모두 통과! 🏁" : "5단계 중 " + dc + "단계 완료" }),
      h("span", { class: "track", "aria-hidden": "true" }, STAGES.map(function (st) {
        const n = stageStatus(S.data, st); return h("i", { class: "c-" + st.id + (n === 2 ? " on" : n === 1 ? " half" : "") });
      })));
  }
}
function renderBar() {
  const bar = document.getElementById("bar");
  if (!bar) return;
  const st = STAGES.find(function (s) { return s.id === S.cur; });
  const saved = S.data[S.cur];
  const i = STAGES.indexOf(st);
  if (S.browse) {
    put(bar, h("div", { class: "bar-in" },
      h("span", { class: "state", text: "👀 둘러보기 · 저장되지 않아요" }),
      i < STAGES.length - 1 ? h("button", { class: "btn ghost", type: "button", text: "다음 " + LOOK[STAGES[i + 1].id], onclick: function () { goStage(STAGES[i + 1].id); } }) : null,
      h("button", { class: "btn ghost", type: "button", text: "🏠 처음", "aria-label": "처음 화면으로", onclick: goHome }),
      h("button", { class: "btn", type: "button", text: "🔑 로그인", onclick: goLogin })));
    return;
  }
  put(bar, h("div", { class: "bar-in" },
    (function () {
      const pend = pendGet() && pendGet()[S.cur];
      const txt = pend ? "📶 기기에 보관 중 · 연결되면 자동 전송" : S.dirty ? "✋ 저장 안 됨 · 1분 뒤 자동 저장" : saved ? (S.autoAt ? "✅ 자동 저장됨 · " : "✅ 저장됨 · ") + saved : "아직 저장 전";
      return h("span", { id: "savestate", class: "state" + (pend || S.dirty ? " dirty" : saved ? " ok" : ""), role: "status", text: txt });
    })(),
    h("button", { id: "nextreq", class: "btn ghost todo-btn", type: "button", "aria-label": "아직 안 쓴 필수 칸으로 가기", onclick: nextReq }),
    i < STAGES.length - 1 ? h("button", { class: "btn ghost", type: "button", text: "다음 " + LOOK[STAGES[i + 1].id], onclick: function () { goStage(STAGES[i + 1].id); } }) : null,
    h("button", { id: "savebtn", class: "btn", type: "button", text: "💾 저장하기", onclick: function () { saveStage(false); } })));
}
function teacherNote(st) {
  if (!st.check) return null;
  const done = filled(S.data["t_c" + st.check]);
  const fb = S.data["t_f" + st.check];
  if (!done && !filled(fb)) return h("div", { class: "tfb wait", text: "🙋 이 단계를 저장한 뒤 선생님 확인 " + "①②③"[st.check - 1] + "을 받아요. 선생님 한마디가 여기에 나타나요." });
  return h("div", { class: "tfb" },
    h("b", { text: "💬 선생님 확인 " + "①②③"[st.check - 1] + (done ? " · 확인 완료 👍" : " · 확인 전") }),
    filled(fb) ? h("p", { style: "margin:4px 0 0; white-space:pre-wrap", text: String(fb) }) : null);
}
function refBlock() {
  const keys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];
  const have = keys.filter(function (k) { return filled(S.data[k]); });
  if (!have.length) return h("div", { class: "tfb wait", text: "🧩 3단계의 ①~⑦을 먼저 저장하면 여기에 불러올 수 있어요." });
  return h("details", { class: "ref", open: true },
    h("summary", { text: "🧩 3단계에서 내가 쓴 ①~⑦ 보기" }),
    h("ol", null, keys.map(function (k) { return h("li", { text: filled(S.data[k]) ? String(S.data[k]) : "(비어 있음)" }); })),
    h("button", { class: "btn ghost small", type: "button", text: "아래 칸에 이어 붙이기", onclick: function () {
      const ta = document.getElementById("f_para");
      if (filled(ta.value) && !confirm("이미 쓴 글이 있습니다. 지우고 ①~⑦을 다시 붙일까요?")) return;
      ta.value = have.map(function (k) { return String(S.data[k]).trim(); }).join(" ");
      S.data.para = ta.value; markDirty(); ta.focus();
    } }),
    h("p", { class: "hint", style: "margin:6px 0 0", text: "붙인 뒤에는 이음말을 넣고 어색한 곳을 다듬습니다." }));
}
function kcls(st) { return st.kind === "과제" ? "k-hw" : "k-cls"; }
function kindLegend() {
  return h("p", { class: "klegend" }, h("span", { class: "k-cls" }, "🏫 수업 시간에 해요"), h("span", { class: "k-hw" }, "🏠 집에서 해 오는 과제"));
}
function exBox(f) {
  if (!f.ex) return null;
  return h("details", { class: "exbox", open: true }, h("summary", null, "👀 예시", h("small", { text: " 참고만 해요 · 누르면 접혀요" })),
    PEOPLE.map(function (p, i) {
      return f.ex[i] ? h("div", { class: "exrow" }, h("span", { class: "pchip", text: p[0] + " " + p[1] }), h("p", { text: f.ex[i] })) : null;
    }));
}
function peopleBox() {
  return h("div", { class: "people" }, h("b", { text: "예시에 나오는 두 친구" }),
    PEOPLE.map(function (p) { return h("span", { class: "pchip" }, p[0] + " " + p[1], h("small", { text: " · " + p[2] })); }),
    h("small", { class: "pnote", text: "이해를 돕기 위해 지어낸 친구들이고, 예시 속 자료 내용도 형식을 보여 주려고 만든 것이에요." }));
}
function linksBox(compact) {
  const out = h("div", { class: "links" + (compact ? " compact" : "") }, h("h3", null, h("i", { class: "ico", "aria-hidden": "true", text: "🔗" }), compact ? "자료 찾는 곳 (새 창으로 열려요)" : "자료는 여기서 찾아요 (누르면 새 창으로 열려요)"));
  Object.keys(LINKS).forEach(function (sec) {
    out.append(h("div", { class: "lsec" }, h("p", { class: "lhead", text: sec }),
      h("ul", null, LINKS[sec].map(function (x) {
        const ext = !/^\//.test(x[1]);
        return h("li", null, h("a", { href: x[1], target: ext ? "_blank" : null, rel: ext ? "noopener" : null, text: x[0] + (ext ? " ↗" : " →") }), compact ? null : h("span", { text: x[2] }));
      }))));
  });
  return out;
}
const BLOOM = [
  ["1 기억", "사실 떠올리기", "간호사는 몇 시간씩 교대로 일할까?", "검색 한 번이면 끝나요"],
  ["2 이해", "뜻과 까닭 설명하기", "교대 근무란 무엇이고 병원은 왜 교대 근무를 할까?", "1학년 추천"],
  ["3 적용", "배운 것을 상황에 써 보기", "우리 가족이 밤 근무표대로 산다면 하루가 어떻게 바뀔까?", "1학년 추천"],
  ["4 분석", "원인과 관계 나누어 보기", "야간 근무는 간호사의 건강에 어떤 영향을 줄까?", "1학년 추천"],
  ["5 평가", "기준을 세워 판단하기", "지금의 교대 근무 방식은 간호사와 환자 모두에게 좋은 방식일까?", "도전"],
  ["6 창안", "새로운 것 만들기", "간호사의 피로를 줄이는 근무표를 내가 만든다면?", "다음 탐구로"]
];
function bloomBox() {
  return h("details", { class: "bloom" },
    h("summary", null, h("i", { class: "ico", "aria-hidden": "true", text: "🔭" }), "질문 수준 올려 보기 · 블룸의 여섯 수준", h("span", { class: "more", "aria-hidden": "true" })),
    h("p", { text: "같은 주제라도 질문을 어떻게 묻느냐에 따라 탐구의 깊이가 달라져요. 1학년은 2~4수준 질문이 알맞아요. 1수준 질문은 검색 한 번이면 끝나서 탐구가 짧아지고, 5~6수준은 다음 탐구에서 도전해 봐요." }),
    h("ol", { class: "blist" }, BLOOM.map(function (x) {
      return h("li", { class: /추천/.test(x[3]) ? "rec" : "" }, h("b", { text: x[0] }), h("span", { class: "bd", text: x[1] }), h("span", { class: "bq", text: "🩺 " + x[2] }), h("em", { text: x[3] }));
    })),
    h("p", { class: "hint", style: "margin:8px 0 0" }, "더 알아보기: ", h("a", { href: "/matrix/", text: "블룸 교과탐구활동 매트릭스 →" }),
      " 과목을 고르면 그 과목 성취기준에 맞는 탐구 활동과 '탐구 첫걸음' 예시(국어·수학·영어 등)를 볼 수 있어요."));
}
function collegeBox(open) {
  return h("details", { class: "college", open: open ? true : null },
    h("summary", null, h("i", { class: "ico", "aria-hidden": "true", text: "🎓" }), "이 활동, 대학은 어떻게 볼까요? (학생부종합전형)", h("span", { class: "more", "aria-hidden": "true" })),
    h("p", { text: "학생부종합전형에서 대학은 학교생활기록부를 읽고 크게 세 가지 역량을 살펴요. 여러 대학의 학생부종합전형 가이드북이 이 세 가지 틀로 평가 방법을 설명해요." }),
    h("div", { class: "cgrid" },
      h("div", null, h("b", { text: "📘 학업역량" }), h("p", { text: "배운 것을 스스로 더 알아보려는 태도와 탐구력" }), h("p", { class: "here", text: "이 활동에서는 → 질문을 세우고, 믿을 만한 자료로 답을 찾는 과정" })),
      h("div", null, h("b", { text: "🧭 진로역량" }), h("p", { text: "관심 분야를 탐색한 활동과 경험, 관련 과목을 고르려는 노력" }), h("p", { class: "here", text: "이 활동에서는 → 관심에서 출발한 질문, '더 배우고 싶은 과목'과 '다음 질문'" })),
      h("div", null, h("b", { text: "🤝 공동체역량" }), h("p", { text: "협업과 소통, 배려, 맡은 일을 끝까지 하는 성실함" }), h("p", { class: "here", text: "이 활동에서는 → 발표하고 질문에 답하기, 친구들과 의견 나누기, 기한 지켜 제출하기" }))),
    h("div", { class: "case" }, h("b", { text: "📝 학생부에는 이렇게 남을 수 있어요 (예시)" }),
      h("p", { text: "병원 실습 영상을 보고 간호사의 근무 환경에 관심을 가져 '야간 교대 근무는 간호사의 건강에 어떤 영향을 줄까'라는 질문을 스스로 세움. 직업 정보와 신문 기사를 찾아 내용을 자신의 말로 정리하고, 처음 예상과 달리 근무 제도의 문제이기도 하다는 점을 근거를 들어 발표함. 친구의 질문을 계기로 다른 교대 근무 직업과 비교하는 다음 탐구를 계획함." }),
      h("p", { class: "hint", style: "margin:6px 0 0", text: "어려운 지식을 많이 쓰는 것보다 '왜 궁금했고 → 어떻게 알아봤고 → 무엇이 달라졌는지'가 보이는 것이 중요해요. 학생부는 선생님이 실제로 본 활동만 기록해요." })),
    h("p", { class: "hint", style: "margin:10px 0 0" }, "더 알아보기: ",
      h("a", { href: "https://drive.google.com/file/d/1Xln5IVLgr7FpCeKdh7DBY4UTSKo5m1E3/view", target: "_blank", rel: "noopener", text: "2027 경희대 학생부종합 가이드북 ↗" }), " · ",
      h("a", { href: "/jinhak/", text: "진로진학부 추천 자료의 대학별 가이드북 →" }), " · ",
      h("a", { href: "https://snuarori.snu.ac.kr", target: "_blank", rel: "noopener", text: "서울대 웹진 아로리 ↗" })));
}
function linkHead() {
  return h("div", { class: "linkhead" },
    h("h3", null, h("i", { class: "ico", "aria-hidden": "true", text: "🔗" }), "이전 활동과 이어 보기", h("span", { class: "req lk", text: "선택 · 강력 추천" })),
    h("p", { text: "대학은 활동 하나보다 관심이 이어지는 흐름을 봐요. 예전 수업, 특강, 동아리, 독서에서 생긴 궁금증을 이번 탐구로 풀었다면 꼭 적어 두세요. 다른 과목에서 배운 개념과 이어 설명하면 더 좋아요." }),
    h("div", { class: "lkex" },
      h("p", null, h("b", { text: "이렇게 이어져요 " }), "~에 관심이 있어서 ~ 특강을 들었는데, 해결되지 않았던 궁금증을 이번에 알아보았다."),
      h("p", null, h("b", { text: "이렇게도 이어져요 " }), "○○ 과목 시간에 조사했던 ○○ 문제를 다른 과목의 ○○ 개념과 연결해 탐구해 보았다.")));
}
/* 선택·도전 칸은 접어 두고, 이미 쓴 내용이 있으면 펼친다. 인쇄할 때는 모두 펼친다 */
function foldBox(title, inner, open) {
  return h("details", { class: "fold", open: open || null },
    h("summary", null, h("span", { class: "ft", text: "🚀 " + title }), h("span", { class: "fs", text: open ? "쓴 내용 있음" : "선택 · 눌러서 펼치기" })), inner);
}
function blockEl(b) {
  if (b.t === "guide") return h("div", { class: "note" }, h("h3", null, h("i", { class: "ico", "aria-hidden": "true", text: b.title === "가이드" ? "🧭" : "📌" }), b.title), h("ul", null, b.items.map(function (x) { return h("li", { text: x }); })));
  if (b.t === "ex") return h("div", { class: "ex" }, h("h3", null, h("i", { class: "ico", "aria-hidden": "true", text: "👀" }), b.title), b.lines.map(function (l) { return h("p", null, l[0] ? h("b", { text: l[0] + "  " }) : null, l[1]); }));
  if (b.t === "warn") return h("div", { class: "warn" }, h("i", { class: "ico", "aria-hidden": "true", text: "🚫" }), b.text);
  if (b.t === "h") {
    const m = /^(.+?) · (.+)$/.exec(b.text);
    return h("h3", { class: "step" }, m ? [h("span", { class: "no", text: m[1] }), m[2]] : b.text, b.sub ? h("small", { text: b.sub }) : null);
  }
  if (b.t === "f" && b.challenge) return foldBox("도전 칸 · " + b.label, fieldEl(b), filled(S.data[b.key]));
  if (b.t === "f") return fieldEl(b);
  if (b.t === "card") {
    const ic = /자료 카드/.test(b.title) ? "🗂️" : /친구|피드백/.test(b.title) ? "🙋" : /평가/.test(b.title) ? "⭐" : "📝";
    const cardEl = h("div", { class: "card" }, h("h3", null, h("i", { class: "ico", "aria-hidden": "true", text: ic }), b.title), h("div", null, b.fields.map(fieldEl)));
    if (/\(선택/.test(b.title)) return foldBox(b.title.replace(/\s*\(.*$/, "") + " (선택)", cardEl, b.fields.some(function (f) { return filled(S.data[f.key]); }));
    return cardEl;
  }
  if (b.t === "ref") return refBlock();
  if (b.t === "people") return peopleBox();
  if (b.t === "link") return linkHead();
  if (b.t === "links") return linksBox(b.compact);
  if (b.t === "bloom") return bloomBox();
  if (b.t === "college") return collegeBox(true);
  return null;
}
function renderStudent() {
  document.body.classList.add("has-bar");
  const st = STAGES.find(function (s) { return s.id === S.cur; });
  $app.className = "wrap";
  put($app, 
    h("div", { class: "top noprint" },
      h("h1", { text: "진로 빌드업 맵 탐구 보고서" }),
      S.browse ? h("span", { class: "who browse", text: "👀 둘러보기 중" }) : h("span", { class: "who", text: "🙂 " + S.id + " " + S.name }),
      h("button", { class: "btn ghost small", type: "button", text: "전체 보기·인쇄", onclick: async function () { if (S.dirty && !(await saveStage(true))) return; renderAll(); } }),
      S.browse ? h("button", { class: "btn ghost small", type: "button", text: "🏠 처음 화면으로", onclick: goHome }) : null,
      S.browse ? null : h("button", { class: "btn small" + (S.initial ? "" : " ghost"), type: "button", text: "🔑 비밀번호 바꾸기", onclick: changePin }),
      h("button", { class: "btn ghost small", type: "button", text: S.browse ? "🔑 로그인" : "나가기", onclick: function () {
        if (S.browse) return goLogin();
        if (S.dirty && !confirm("저장하지 않은 내용은 지워집니다. 그래도 나갈까요?")) return;
        leaveStudent();
      } })),
    demoBanner(),
    S.browse ? h("div", { class: "browsing" }, h("b", { text: "👀 둘러보기 중이에요." }),
      " 다섯 단계와 예시를 모두 볼 수 있고 칸에 써 볼 수도 있지만, 저장되지 않아요. 내 보고서를 쓰려면 ",
      h("button", { class: "linkbtn", type: "button", text: "로그인", onclick: goLogin }), "하고, 처음 소개로 돌아가려면 ",
      h("button", { class: "linkbtn", type: "button", text: "처음 화면으로", onclick: goHome }), " 가요.") : null,
    !S.browse && doneCount() === STAGES.length ? h("div", { class: "finish" }, h("img", { src: "img/done.svg?v=1", alt: "" }),
      h("div", null, h("b", { text: "🏁 다섯 정거장을 모두 지났어요!" }), h("span", { text: "보고서를 완성했어요. '전체 보기·인쇄'로 내 보고서를 한눈에 볼 수 있어요." }))) : null,
    h("div", { id: "prog", class: "prog" }),
    h("div", { id: "nav", class: "nav" }),
    h("div", { class: "panel stage c-" + st.id + " " + kcls(st) },
      h("div", { class: "shead" },
        h("span", { class: "big", "aria-hidden": "true", text: LOOK[st.id] }),
        h("span", { class: "tag" + (st.kind === "과제" ? " hw" : ""), text: st.badge + " · " + st.nick + (st.kind === "과제" ? " · 🏠 과제" : " · 🏫 수업") }),
        h("h2", { text: st.title }),
        h("p", null, h("b", { text: "🎯 목표 " }), st.goal + "  ·  ⏱ " + st.time),
        h("div", { class: "kband" }, st.kind === "과제"
          ? [h("b", { text: "🏠 집에서 해 오는 과제예요." }), " 다음 수업 전까지 이 단계를 채우고 💾 저장해요. 학교 컴퓨터실이나 휴대폰으로 해도 돼요."]
          : [h("b", { text: "🏫 수업 시간에 하는 단계예요." }), " 선생님 안내에 맞춰 함께 쓰고, 끝나기 전에 💾 저장해요."])),
      (function () {
        /* 맨 앞의 '가이드'와 예시 친구 소개는 '안내 더 보기'로 접는다 */
        let n = 0;
        while (n < st.blocks.length && ((st.blocks[n].t === "guide" && st.blocks[n].title === "가이드") || st.blocks[n].t === "people")) n++;
        return [levelsBox(st), teacherNote(st), moreInfo(st, st.blocks.slice(0, n))].concat(st.blocks.slice(n).map(blockEl));
      })(),
      S.browse ? null : stageEnd(st)),
    h("div", { id: "bar", class: "bar noprint" }));
  renderNav(); renderBar(); updReq();
}
/* ---------- 인쇄: 머리말(제목·학생)·꼬리말(출력 일시·쪽수)은 @page 여백 칸에 넣는다 ---------- */
let PRINT_WHO = "";
function nowStr() {
  const d = new Date(), z = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() + ". " + z(d.getHours()) + ":" + z(d.getMinutes());
}
function setPrintMeta(who) {
  let el = document.getElementById("printmeta");
  if (!el) { el = h("style", { id: "printmeta" }); document.head.append(el); }
  const q = function (x) { return '"' + String(x).replace(/["\\\n]/g, " ") + '"'; };
  const small = "font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', sans-serif; font-size: 8.5pt; color: #555;";
  el.textContent = "@page { size: A4; margin: 17mm 14mm 16mm; " +
    "@top-left { content: " + q("진로 빌드업 맵 탐구 보고서 · 봉일천고 1학년") + "; " + small + " } " +
    "@top-right { content: " + q(who || "") + "; " + small + " } " +
    "@bottom-left { content: " + q("출력 " + nowStr() + " · 봉일천고등학교 진로진학부") + "; " + small + " } " +
    "@bottom-right { content: counter(page) \" / \" counter(pages) \" 쪽\"; " + small + " } }";
}
window.addEventListener("beforeprint", function () {
  setPrintMeta(PRINT_WHO || (S.id ? S.id + " " + S.name : ""));
  document.querySelectorAll(".pdate").forEach(function (e) { e.textContent = nowStr(); });
});
function sheet(rec, teacher) {
  const stages = STAGES.map(function (st) { return st.badge + " " + STATUS[stageStatus(rec, st)][0]; }).join("  ");
  const sec = h("section", { class: "sheet" },
    h("h2", { style: "margin:0 0 4px; font-size:1.3rem", text: "📘 진로 빌드업 맵 탐구 보고서" }),
    h("table", { class: "ptab" },
      h("tr", null, h("th", { text: "학번" }), h("td", { text: rec.id || "" }), h("th", { text: "이름" }), h("td", { text: rec.name || "" })),
      h("tr", null, h("th", { text: "관심 진로" }), h("td", { text: rec.career || "" }), h("th", { text: "출력 일시" }), h("td", { class: "pdate", text: nowStr() })),
      h("tr", null, h("th", { text: "탐구 질문" }), h("td", { colspan: "3", text: rec.question || "" })),
      h("tr", null, h("th", { text: "진행" }), h("td", { colspan: "3", text: stages }))),
    answersView(rec));
  if (teacher) {
    const lines = [1, 2, 3].map(function (n) {
      return h("p", null, h("b", { text: "확인 " + "①②③"[n - 1] + " " }), (filled(rec["t_c" + n]) ? "확인" : "—") + (filled(rec["t_f" + n]) ? " · " + rec["t_f" + n] : ""));
    });
    sec.append(h("div", { class: "tview" }, h("p", null, h("b", { text: "선생님 기록" })), lines,
      rubText(rec) ? h("p", null, h("b", { text: "기준표 " }), rubText(rec)) : null,
      filled(rec.t_memo) ? h("p", null, h("b", { text: "관찰 메모 " }), String(rec.t_memo)) : null));
  }
  return sec;
}
function renderPrint(recs, who, back, teacher) {
  PRINT_WHO = who;
  document.body.classList.remove("has-bar");
  window.scrollTo(0, 0);
  put($app,
    h("div", { class: "top noprint" },
      h("h1", { text: "📖 보고서 미리보기" + (recs.length > 1 ? " (" + recs.length + "명)" : "") }),
      h("button", { class: "btn small", type: "button", text: "🖨️ 인쇄", onclick: function () { setPrintMeta(who); window.print(); } }),
      h("button", { class: "btn ghost small", type: "button", text: "돌아가기", onclick: function () { PRINT_WHO = ""; back(); } })),
    h("p", { class: "hint noprint", text: "인쇄하면 쪽마다 위에 보고서 이름과 학생, 아래에 출력 일시와 쪽수가 들어가요. 인쇄 창의 '머리글과 바닥글'은 끄면 깔끔해요. 학생마다 새 쪽에서 시작해요." }),
    h("div", { class: "panel" }, recs.map(function (r) { return sheet(r, teacher); })));
}
function renderAll() {
  const rec = Object.assign({}, S.data, { id: S.id || "둘러보기", name: S.name || "" });
  renderPrint([rec], S.browse ? "둘러보기" : S.id + " " + S.name, renderStudent, false);
}
window.addEventListener("beforeunload", function (e) { if ((S.dirty || pendGet()) && !S.browse) { e.preventDefault(); e.returnValue = ""; } });

/* ============================================================
   교사 화면
   ============================================================ */
const T = { pw: "", rows: [], cls: "", tab: "status", sel: "", idle: null, sample: 0, meta: {}, partial: false, all: false, todo: false, skew: 0 };
/* 교사 화면을 30분 동안 쓰지 않으면 비밀번호를 지우고 로그인 화면으로 돌아간다 */
function teacherLogout(msg) {
  T.pw = ""; T.rows = []; T.sel = ""; T.meta = {}; T.partial = T.all = false; clearTimeout(T.idle);
  if (location.hash === "#teacher") renderTeacherLogin();
  if (msg) toast(msg);
}
function touchTeacher() {
  if (!T.pw) return;
  clearTimeout(T.idle);
  T.idle = setTimeout(function () { teacherLogout("30분 동안 쓰지 않아 선생님 화면에서 로그아웃했어요."); }, 30 * 60000);
}
["click", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { if (location.hash === "#teacher") touchTeacher(); }, true); });
function clsOf(id) { return String(id).slice(0, -2); }
function clsName(c) { return c.length >= 2 ? c[0] + "학년 " + Number(c.slice(1)) + "반" : c + "반"; }

function renderTeacherLogin() {
  document.body.classList.remove("has-bar");
  $app.className = "wrap";
  const pw = h("input", { type: "password", id: "tpw", autocomplete: "off" });
  const go = h("button", { class: "btn", type: "submit", style: "width:100%", text: "들어가기" });
  put($app,
    h("div", { class: "tlogin" },
    h("div", { class: "lock", "aria-hidden": "true", text: "🔐" }),
    h("h1", { text: "탐구 보고서 · 선생님용" }),
    h("p", { class: "hint", text: "제출 현황, 확인·피드백, 평가 기록, 완성 예시, 백업·초기화를 다루는 화면이에요." }),
    DEMO ? h("div", { class: "demo" }, h("b", { text: "미리보기 모드 " }), "교사 비밀번호는 demo 입니다. 이 기기에서 학생 화면으로 입력한 내용만 보입니다.") : null,
    h("form", { class: "panel", onsubmit: async function (ev) {
      ev.preventDefault(); go.disabled = true;
      try { T.pw = pw.value; await loadRows(); touchTeacher(); renderTeacher(); }
      catch (e) { T.pw = ""; toast(e.message, true); go.disabled = false; }
    } }, h("label", { class: "fl", for: "tpw", text: "교사 비밀번호" }), pw, h("div", { style: "margin-top:16px" }, go)),
    h("p", { class: "hint", style: "margin-top:12px", text: "학생 앞에서 비밀번호를 입력하지 마세요. 30분 동안 쓰지 않으면 자동으로 로그아웃돼요." })));
}
/* 학생이 많으면(서버 기준 120명 초과) 반 단위로 불러온다 */
async function loadRows() {
  const req = { action: "teacher_list", tpw: T.pw };
  if (T.partial && T.cls) req.cls = T.cls;
  if (T.all) req.all = true;
  let out = await api(req);
  if (out.partial) {
    T.partial = true;
    const cs = Object.keys(out.classes || {}).sort();
    if (!T.cls || cs.indexOf(T.cls) < 0) T.cls = cs[0] || "";
    if (T.cls) out = await api({ action: "teacher_list", tpw: T.pw, cls: T.cls });
  }
  T.meta = out;
  T.skew = out.now ? out.now - Date.now() : 0;
  T.rows = (out.rows || []).map(function (r) { const o = {}; for (const k in r) o[k] = r[k] == null ? "" : r[k]; o.id = String(o.id); return o; });
}
function classList() {
  const m = T.meta.classes || {};
  T.rows.forEach(function (r) { const c = clsOf(r.id); if (!(c in m)) m[c] = 0; });
  return Object.keys(m).sort().map(function (c) { return [c, m[c] || T.rows.filter(function (r) { return clsOf(r.id) === c; }).length]; });
}
/* 저장했는데 선생님 확인을 아직 안 한 단계가 있는 학생 */
function needsCheck(r) { return STAGES.some(function (st) { return st.check && filled(r[st.id]) && !filled(r["t_c" + st.check]); }); }
function isLocked(r) {
  const mf = T.meta.maxFails || 10, lm = T.meta.lockMinutes || 5;
  return Number(r.fails) >= mf && (Date.now() + T.skew - Number(r.lockt)) < lm * 60000;
}
function shownRows() { return T.rows.filter(function (r) { return (!T.cls || clsOf(r.id) === T.cls) && (!T.todo || T.tab !== "status" || needsCheck(r)); }); }
function renderTeacher() {
  document.body.classList.remove("has-bar");
  $app.className = "wrap wide";
  const classes = classList();
  if (T.cls && !classes.some(function (c) { return c[0] === T.cls; })) T.cls = "";
  const total = T.meta.total != null ? T.meta.total : T.rows.length;
  const sel = h("select", { "aria-label": "반 고르기", onchange: async function () {
    const v = sel.value;
    if (T.partial && !v && !confirm("학생이 " + total + "명이라 전체를 불러오면 느릴 수 있어요. 불러올까요?")) { sel.value = T.cls; return; }
    T.cls = v; T.sel = ""; T.all = T.partial && !v;
    if (T.partial) { sel.disabled = true; try { await loadRows(); } catch (e) { toast(e.message, true); } }
    renderTeacher();
  } },
    h("option", { value: "", text: "전체 (" + total + "명)" + (T.partial ? " · 느릴 수 있음" : "") }),
    classes.map(function (c) { return h("option", { value: c[0], text: clsName(c[0]) + " (" + c[1] + "명)" }); }));
  sel.value = T.cls;
  const todo = h("label", { class: "todo" }, h("input", { type: "checkbox", checked: T.todo || null, onchange: function (e) { T.todo = e.target.checked; T.sel = ""; renderTeacher(); } }), " 확인 안 한 학생만");
  const tabBtn = function (id, label) { return h("button", { type: "button", role: "tab", "aria-selected": T.tab === id ? "true" : "false", text: label, onclick: function () { T.tab = id; renderTeacher(); } }); };
  put($app, 
    h("div", { class: "top" }, h("h1", { text: "탐구 보고서 · 선생님용" }),
      h("button", { class: "btn ghost small", type: "button", text: "로그아웃", onclick: function () { teacherLogout("로그아웃했어요."); } }),
      h("button", { class: "btn ghost small", type: "button", text: "새로 고침", onclick: async function () { try { await loadRows(); renderTeacher(); toast("새로 불러왔습니다."); } catch (e) { toast(e.message, true); } } })),
    DEMO ? h("div", { class: "demo" }, h("b", { text: "미리보기 모드 " }), "이 기기에 저장된 연습 자료입니다.") : null,
    !DEMO && T.meta.roster === 0 ? h("div", { class: "warnbox", role: "alert" }, h("b", { text: "⚠️ '명단' 시트가 비어 있어요. " }), "지금은 학번과 이름만 알면 누구나 가입할 수 있어요. 구글 시트의 '명단' 시트에 학생 학번·이름을 넣어 두면 명단에 있는 학생만 들어올 수 있어요.") : null,
    h("div", { class: "tools" }, (T.tab === "sample" || T.tab === "admin") ? null : sel, T.tab === "status" ? todo : null,
      h("div", { class: "tabs", role: "tablist" }, tabBtn("status", "제출 현황·확인"), tabBtn("summary", "학생부 작성용 요약"), tabBtn("sample", "📚 완성 예시"), tabBtn("admin", "⚙️ 관리")),
      (T.tab === "status" || T.tab === "summary") && shownRows().length ? h("button", { class: "btn ghost small", type: "button", text: "🖨️ 보이는 학생 모두 인쇄 (" + shownRows().length + "명)", onclick: function () {
        const rs = shownRows(); renderPrint(rs, (T.cls ? clsName(T.cls) : "전체") + " " + rs.length + "명", renderTeacher, true);
      } }) : null),
    T.tab === "status" ? statusTab() : T.tab === "summary" ? summaryTab() : T.tab === "sample" ? sampleTab() : adminTab());
}
function statusTab() {
  const rows = shownRows();
  if (!rows.length) return h("div", { class: "panel", text: T.todo ? "확인할 학생이 없어요. 👍" : "아직 접속한 학생이 없습니다." });
  const locked = rows.filter(isLocked);
  const tb = h("tbody");
  rows.forEach(function (r) {
    const tr = h("tr", { class: "row" + (r.id === T.sel ? " sel" : ""), tabindex: "0", onclick: function () { T.sel = r.id; renderTeacher(); const d = document.getElementById("detail"); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); },
      onkeydown: function (e) { if (e.key === "Enter") tr.click(); } },
      h("td", { class: "l", text: r.id }), h("td", { class: "l" }, r.name, isLocked(r) ? h("span", { class: "lockb", title: "비밀번호를 여러 번 틀려 잠김", text: "🔒 잠김" }) : null),
      STAGES.map(function (st) { const s = stageStatus(r, st); return h("td", { class: "s" + s, title: STATUS[s][1], text: STATUS[s][0] + " " + STATUS[s][1] }); }),
      [1, 2, 3].map(function (n) { return h("td", { class: filled(r["t_c" + n]) ? "s2" : "s0", text: filled(r["t_c" + n]) ? "확인" : "—" }); }),
      h("td", { class: "q", text: filled(r.question) ? String(r.question) : "" }));
    tb.append(tr);
  });
  const done = STAGES.map(function (st) { return rows.filter(function (r) { return stageStatus(r, st) === 2; }).length; });
  const out = h("div", null,
    locked.length ? h("div", { class: "warnbox", role: "status" }, h("b", { text: "🔒 잠긴 학생 " + locked.length + "명 (" + locked.map(function (r) { return r.name; }).join(", ") + ") " }),
      (T.meta.lockMinutes || 5) + "분 뒤 저절로 풀려요. 바로 풀려면 학생 줄을 눌러 '학생 비밀번호 초기화'를 누르세요.") : null,
    h("div", { class: "panel" },
      h("div", { class: "tblwrap" }, h("table", { class: "st" },
        h("thead", null, h("tr", null, h("th", { class: "l", text: "학번" }), h("th", { class: "l", text: "이름" }),
          STAGES.map(function (st, i) { return h("th", null, h("span", { class: "em", "aria-hidden": "true", text: LOOK[st.id] }), st.nick, h("br"), st.badge + " " + st.kind + " (" + done[i] + "/" + rows.length + ")"); }),
          h("th", { text: "확인①" }), h("th", { text: "확인②" }), h("th", { text: "확인③" }), h("th", { class: "l", text: "탐구 질문" }))),
        tb)),
      h("p", { class: "legend", text: "● 완료: 저장했고 필수 칸을 모두 채움 · ◐ 작성 중 · ○ 아직.  학생 줄을 누르면 아래에 보고서와 확인·피드백 칸이 열립니다." })));
  const cur = T.rows.find(function (r) { return r.id === T.sel; });
  if (cur) out.append(detailPanel(cur));
  return out;
}
function detailPanel(r) {
  const inputs = {};
  const left = h("div", null);
  [1, 2, 3].forEach(function (n) {
    const c = h("input", { type: "checkbox", id: "tc" + n }); c.checked = filled(r["t_c" + n]);
    const f = h("textarea", { rows: 2, maxlength: "500", "aria-label": "확인 " + n + " 피드백" }); f.value = r["t_f" + n] || "";
    inputs["t_c" + n] = function () { return c.checked ? "확인" : ""; };
    inputs["t_f" + n] = function () { return f.value; };
    left.append(h("div", { class: "chk" }, c, h("label", { for: "tc" + n, text: "확인 " + "①②③"[n - 1] + " (" + ["1단계 질문", "3단계 자료·근거", "5단계 최종"][n - 1] + ")" })),
      h("p", { class: "hint", text: "학생에게 보이는 한마디" }), f);
  });
  const right = h("div", null, h("p", { class: "sub", style: "margin-top:14px", text: "평가 기준표 · 학생에게 보이지 않음" }));
  const rub = h("div", { class: "rub" });
  RUBRIC.forEach(function (x) {
    const s = segEl(LEVELS, r[x[0]] || "", function () {}, x[1]);
    inputs[x[0]] = function () { return s.dataset.v; };
    rub.append(h("span", { text: x[1] }), s);
  });
  const memo = h("textarea", { rows: 4, maxlength: "1500", id: "tmemo" }); memo.value = r.t_memo || "";
  inputs.t_memo = function () { return memo.value; };
  const note = h("textarea", { rows: 6, maxlength: "1000", id: "tnote" }); note.value = r.t_note || "";
  const cnt = h("span", { class: "cnt" });
  const upd = function () { const n = note.value.length; cnt.textContent = n + "자 / 진로활동 특기사항 전체 " + NOTE_LIMIT + "자"; cnt.className = "cnt" + (n > NOTE_LIMIT ? " over" : ""); };
  note.addEventListener("input", upd); upd();
  inputs.t_note = function () { return note.value; };
  right.append(rub, h("label", { class: "fl", for: "tmemo", text: "관찰 메모 · 학생에게 보이지 않음" }),
    h("p", { class: "hint", text: "발표 때 본 모습, 질문을 바꾼 과정 등 학생부에 쓸 사실을 적어 둡니다." }), memo,
    h("label", { class: "fl", for: "tnote", text: "✍️ 특기사항 초안 · 학생에게 보이지 않음" }),
    h("p", { class: "hint" }, "동기 → 질문 → 과정 → 배운 점 → 후속 순서로 써요. ", h("button", { class: "linkbtn", type: "button", text: "완성 예시 보기", onclick: function () { T.tab = "sample"; renderTeacher(); window.scrollTo(0, 0); } })),
    note, cnt);
  const save = h("button", { class: "btn", type: "button", text: "확인·평가 저장", onclick: async function () {
    const data = {}; for (const k in inputs) data[k] = inputs[k]();
    save.disabled = true;
    try { await api({ action: "teacher_save", tpw: T.pw, id: r.id, data: data }); Object.assign(r, data); toast(r.name + " 저장했습니다."); renderTeacher(); }
    catch (e) { toast(e.message, true); save.disabled = false; }
  } });
  const reset = h("button", { class: "btn danger small", type: "button", text: "학생 비밀번호 초기화", onclick: async function () {
    if (!confirm(r.name + " 학생의 비밀번호를 초기화할까요? 명단에 생년월일이 있으면 생년월일(월일 4자리)로 다시 들어오고, 없으면 학생이 다음에 들어올 때 새 비밀번호를 정합니다. 보고서 내용은 그대로입니다.")) return;
    try { await api({ action: "teacher_reset", tpw: T.pw, id: r.id }); toast("초기화했습니다. 학생에게 생년월일 4자리(명단에 있으면)로 들어와 비밀번호를 바꾸라고 알려 주세요."); }
    catch (e) { toast(e.message, true); }
  } });
  return h("div", { class: "panel", id: "detail" },
    h("div", { class: "dhead" }, h("h2", { text: r.id + " " + r.name }),
      h("button", { class: "btn ghost small", type: "button", text: "🖨️ 이 학생 보고서 인쇄", onclick: function () { renderPrint([r], r.id + " " + r.name, renderTeacher, true); } }), reset),
    h("div", { class: "tgrid" }, left, right),
    h("div", { style: "margin:16px 0 4px" }, save),
    answersView(r));
}
const SUM = [["관심 진로", "career"], ["질문", "question"], ["고른 이유", "reason"],
  ["🔗 이어진 활동", "lk_type"], ["🔗 그 활동에서 한 일", "lk_what"], ["🔗 남은 궁금증·이어진 점", "lk_q"], ["🔗 다른 과목 개념 연결", "lk_sub"], ["찾은 답", "r2"], ["근거 1", "r3"], ["근거 2", "r4"], ["처음 예상과 비교", "r5"], ["내 생각", "r6"],
  ["달라진 생각", "v2"], ["관련 학과·직업", "v4"], ["더 배우고 싶은 과목", "v5"], ["다음 질문", "v6"], ["도전: 다른 의견·한계", "r8"], ["도전: 다음 탐구 계획", "v7"], ["관찰 메모", "t_memo"], ["특기사항 초안", "t_note"]];
function rubText(r) { return RUBRIC.map(function (x) { return filled(r[x[0]]) ? x[1] + " " + r[x[0]] : ""; }).filter(Boolean).join(" · "); }
function noteView(sm) {
  const total = sm.note.map(function (x) { return x[0]; }).join("").length;
  return h("div", { class: "notebox" },
    h("div", { class: "nhead" }, h("b", { text: "✍️ 진로활동 특기사항 예시" }), h("span", { class: "cnt", text: total + "자 (진로활동 특기사항 전체 " + NOTE_LIMIT + "자 가운데 이 활동 몫)" })),
    h("p", { class: "ntext" }, sm.note.map(function (x) {
      return x[1] ? h("mark", { class: "tag-" + x[1], title: NOTE_TAGS[x[1]][0] + ": " + NOTE_TAGS[x[1]][1], text: x[0] }) : x[0];
    })),
    h("p", { class: "nlegend" }, Object.keys(NOTE_TAGS).map(function (k) { return h("span", { class: "tag-" + k }, NOTE_TAGS[k][0] + " · " + NOTE_TAGS[k][1]); })),
    h("ul", { class: "nwhy" }, sm.why.map(function (w) { return h("li", { text: w }); })),
    h("button", { class: "btn ghost small", type: "button", text: "📋 특기사항 복사", onclick: async function () {
      const t = sm.note.map(function (x) { return x[0]; }).join("");
      try { await navigator.clipboard.writeText(t); toast("복사했어요."); } catch (e) { toast("복사하지 못했어요. 글을 직접 골라 복사해 주세요.", true); }
    } }));
}
function sampleTab() {
  const sm = SAMPLES[T.sample], rec = sampleRecord(sm);
  return h("div", null,
    h("div", { class: "panel" },
      h("p", { style: "margin:0 0 10px", text: "지어낸 학생 두 명의 완성 보고서와, 그 보고서를 바탕으로 쓴 평가 기록(기준표·관찰 메모·특기사항) 예시입니다. 학생 안내나 교사 협의 자료로 쓸 수 있습니다. 실제 특기사항은 선생님이 관찰한 사실로 직접 씁니다." }),
      h("div", { class: "tabs" }, SAMPLES.map(function (x, i) {
        return h("button", { type: "button", "aria-selected": T.sample === i ? "true" : "false", text: (i ? "🍱 " : "🩺 ") + x.name + " · " + x.level, onclick: function () { T.sample = i; renderTeacher(); } });
      })),
      h("p", { class: "hint", style: "margin:10px 0 0", text: sm.summary }),
      noteView(sm),
      h("div", { style: "display:flex; gap:8px; flex-wrap:wrap; margin-top:12px" },
        h("button", { class: "btn ghost small", type: "button", text: "🖨️ 이 예시 인쇄", onclick: function () { renderPrint([rec], "완성 예시 · " + sm.name, renderTeacher, true); } }))),
    h("div", { class: "panel" }, sheet(rec, true)));
}
function adminTab() {
  const scope = h("select", { "aria-label": "초기화 범위" },
    h("option", { value: "class", text: T.cls ? clsName(T.cls) + "만" : "반을 먼저 고르세요" }), h("option", { value: "all", text: "모든 학생" }));
  if (!T.cls) scope.value = "all";
  const conf = h("input", { type: "text", placeholder: "초기화", "aria-label": "확인 글자", autocomplete: "off" });
  const busy = function (b, on) { b.disabled = on; };
  const bk = h("button", { class: "btn ghost", type: "button", text: "💾 지금 백업 시트 만들기", onclick: async function () {
    busy(bk, true);
    try { const o = await api({ action: "teacher_backup", tpw: T.pw }); toast("'" + o.backup + "' 시트를 만들었어요."); }
    catch (e) { toast(e.message, true); } finally { busy(bk, false); }
  } });
  const clr = h("button", { class: "btn danger", type: "button", text: "🧹 백업하고 초기화", onclick: async function () {
    if (scope.value === "class" && !T.cls) return toast("위에서 반을 먼저 고르세요.", true);
    if (conf.value.trim() !== "초기화") return toast("확인 칸에 '초기화'라고 써 주세요.", true);
    const what = scope.value === "all" ? "모든 학생" : clsName(T.cls) + " 학생";
    if (!confirm(what + "의 보고서를 지웁니다. 지우기 전에 백업 시트를 만듭니다. 계속할까요?")) return;
    busy(clr, true);
    try {
      const o = await api({ action: "teacher_clear", tpw: T.pw, scope: scope.value, cls: T.cls, confirm: "초기화" });
      await loadRows(); T.sel = ""; renderTeacher();
      toast(o.removed + "명을 지웠어요. 백업: '" + o.backup + "'");
    } catch (e) { toast(e.message, true); busy(clr, false); }
  } });
  const clsSel = h("select", { "aria-label": "반 고르기", onchange: function () { T.cls = clsSel.value; renderTeacher(); } },
    h("option", { value: "", text: "반 고르기" }),
    classList().map(function (c) { return h("option", { value: c[0], text: clsName(c[0]) + " (" + c[1] + "명)" }); }));
  clsSel.value = T.cls;
  return h("div", { class: "admin" },
    h("section", { class: "panel" }, h("h2", { text: "💾 백업" }),
      h("p", { text: "구글 시트에 '백업 날짜 시각' 시트를 새로 만들어 지금의 '보고서' 시트를 그대로 복사해 둡니다. 학기 중간이나 큰 작업 전에 만들어 두세요." }), bk),
    h("section", { class: "panel danger-zone" }, h("h2", { text: "🧹 초기화" }),
      h("p", { text: "새 학기나 다른 반 운영을 위해 학생 보고서를 지웁니다. 지우기 직전에 백업 시트를 자동으로 만들고, 백업 시트는 지우지 않습니다. 되돌리려면 백업 시트의 학생 줄을 '보고서' 시트로 복사해 넣으면 됩니다." }),
      h("div", { class: "arow" }, h("label", { text: "반" }), clsSel),
      h("div", { class: "arow" }, h("label", { text: "범위" }), scope),
      h("div", { class: "arow" }, h("label", { text: "확인" }), conf, h("span", { class: "hint", text: "'초기화'라고 써요" })),
      clr),
    h("section", { class: "panel" }, h("h2", { text: "🔒 보안 점검표" }),
      h("ul", { class: "checklist" },
        h("li", { text: "교사 비밀번호는 Apps Script '스크립트 속성'의 TEACHER_PASSWORD에 10자 이상으로 둡니다. 코드에는 쓰지 않습니다." }),
        h("li", { text: "구글 시트는 다른 사람과 공유하지 않습니다. 웹 앱만 '모든 사용자'로 엽니다." }),
        h("li", { text: "'명단' 시트에 학번(A)·이름(B)·생년월일 월일 4자리(C)를 넣어 두면 명단에 있는 학생만, 생년월일을 처음 비밀번호로 들어올 수 있습니다. 310처럼 3자리로 바뀌어도 0310으로 맞춰 봅니다." }),
        h("li", { text: "학생이 비밀번호를 10번 틀리면 " + (T.meta.lockMinutes || 5) + "분 동안 잠기고(현황표에 🔒 표시), 학생 줄의 '학생 비밀번호 초기화'로 바로 풀 수 있습니다." }),
        h("li", { text: "교사 비밀번호를 10분 안에 8번 틀리면 10분 동안 교사 화면이 막힙니다. 누가 일부러 막아도 들어올 수 있게 스크립트 속성에 보조 비밀번호 TEACHER_PASSWORD2(10자 이상)를 따로 넣어 두세요." }),
        h("li", { text: "선생님 화면은 30분 동안 쓰지 않으면 저절로 로그아웃됩니다. 공용 컴퓨터에서는 다 쓰고 '로그아웃'을 누르세요." })),
      h("button", { class: "btn ghost small", type: "button", text: "로그아웃", onclick: function () { teacherLogout("로그아웃했어요."); } })));
}
function summaryTab() {
  const rows = shownRows();
  if (!rows.length) return h("div", { class: "panel", text: "아직 접속한 학생이 없습니다." });
  const copy = h("button", { class: "btn small", type: "button", text: "표로 복사 (엑셀·한글에 붙여넣기)", onclick: async function () {
    const clean = function (v) { return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ").trim(); };
    const lines = [["학번", "이름"].concat(SUM.map(function (x) { return x[0]; }), ["기준표"]).join("\t")];
    rows.forEach(function (r) { lines.push([r.id, r.name].concat(SUM.map(function (x) { return clean(r[x[1]]); }), [rubText(r)]).join("\t")); });
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); toast(rows.length + "명 복사했습니다."); }
    catch (e) {
      const ta = h("textarea"); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); toast(rows.length + "명 복사했습니다."); } catch (e2) { toast("복사하지 못했습니다. 구글 시트에서 직접 복사하세요.", true); }
      ta.remove();
    }
  } });
  return h("div", null,
    h("div", { class: "panel" },
      h("p", { style: "margin:0 0 8px", text: "학생이 쓴 내용 중 '동기 → 질문 → 과정 → 배운 점 → 후속'에 해당하는 칸만 모았습니다. 학생부 문장은 이 사실을 바탕으로 선생님이 직접 씁니다." }), copy),
    rows.map(function (r) {
      const anyStage = STAGES.some(function (st) { return stageStatus(r, st) > 0; });
      return h("div", { class: "sumcard" },
        h("h4", null, r.id + " " + r.name, rubText(r) ? h("small", { text: rubText(r) }) : null),
        h("p", { class: "progline" }, "진행 ", STAGES.map(function (st, i) {
          const s = stageStatus(r, st);
          return h("span", { class: "s" + s, text: (i ? "  ·  " : "") + st.badge + " " + STATUS[s][0] + " " + STATUS[s][1] });
        })),
        SUM.filter(function (x) { return filled(r[x[1]]); }).map(function (x) { return h("p", null, h("b", { text: x[0] + ": " }), String(r[x[1]])); }),
        SUM.some(function (x) { return x[1] !== "career" && filled(r[x[1]]); }) ? null :
          h("p", { class: "hint", text: anyStage
            ? "요약에 모으는 칸(탐구 질문, 3단계 결과 정리, 5단계 돌아보기)은 아직 비어 있습니다. 지금까지 쓴 내용은 '제출 현황·확인'에서 학생을 누르면 볼 수 있습니다."
            : "아직 저장한 내용이 없습니다." }));
    }));
}

/* ---------- 시작 ---------- */
function route() {
  const tch = location.hash === "#teacher";
  document.body.classList.toggle("is-wide", tch);
  const fl = document.getElementById("footlink");
  if (fl) { fl.href = tch ? "#" : "#teacher"; fl.textContent = tch ? "학생용 화면" : "선생님용 화면"; }
  if (location.hash === "#teacher") { if (T.pw) renderTeacher(); else renderTeacherLogin(); }
  else if (S.id) renderStudent(); else renderLogin();
}
window.addEventListener("hashchange", route);
route();
