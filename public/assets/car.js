const SEV = {
  stop:    { label: "Stop and get help", cls: "sev-stop" },
  service: { label: "Book service",      cls: "sev-service" },
  diy:     { label: "Fix it yourself",   cls: "sev-diy" },
  normal:  { label: "Normal behaviour",  cls: "sev-normal" }
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const load  = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };

let car = null;
let state = { cat: "all", q: "", current: null, stepIdx: 0, done: [], outcome: null };

function carIdFromUrl() {
  const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
  if (m) return m[1];
  return new URLSearchParams(location.search).get("car") || "";
}

/* ---------- diagnose ---------- */

function matches(i) {
  if (state.cat !== "all" && i.cat !== state.cat) return false;
  if (!state.q) return true;
  const hay = `${i.title} ${i.keys || ""} ${i.summary}`.toLowerCase();
  return state.q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t.replace(/'/g, "")) || hay.includes(t));
}

function renderCats() {
  const cats = [{ id: "all", name: "All problems" }, ...car.categories];
  $("#cats").innerHTML = cats.map(c => {
    const n = c.id === "all" ? car.issues.length : car.issues.filter(i => i.cat === c.id).length;
    return `<button class="cat" aria-pressed="${state.cat === c.id}" data-cat="${esc(c.id)}">${esc(c.name)}<span class="n">${n}</span></button>`;
  }).join("");
}

function renderList() {
  const res = car.issues.filter(matches);
  const catName = state.cat === "all" ? "All problems" : (car.categories.find(c => c.id === state.cat) || {}).name;
  const head = state.q ? `${res.length} match${res.length === 1 ? "" : "es"} for "${esc(state.q)}"` : `${esc(catName)}, ${res.length}`;
  const emptyMsg = car.issues.length
    ? `No match. Try fewer words, or browse a system on the left. If the car shows smoke, a burning smell or damage, use the emergency button.`
    : `No checks have been written for this car yet. Use the Ask tab only once its manual has been added.`;
  $("#list").innerHTML = `<h2>${head}</h2>` + (res.length
    ? res.map(i => `<button class="item ${SEV[i.sev].cls}" data-id="${esc(i.id)}" aria-current="${state.current === i.id}"><i class="dot"></i><div><b>${esc(i.title)}</b><span>${SEV[i.sev].label}</span></div></button>`).join("")
    : `<div class="empty">${emptyMsg}</div>`);
}

function renderDetail() {
  const d = $("#detail");
  const i = car.issues.find(x => x.id === state.current);
  if (!i) {
    d.innerHTML = `<div class="placeholder"><svg viewBox="0 0 120 60" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 42h8l10-16c3-5 7-7 12-7h36c6 0 10 2 14 6l12 12 10 3v7h-8"/><circle cx="30" cy="44" r="7"/><circle cx="90" cy="44" r="7"/><path d="M37 44h46"/></svg><p>Pick a problem to start a guided check.</p></div>`;
    return;
  }
  const sev = SEV[i.sev];
  let out = "";
  if (state.outcome === "fixed") {
    out = `<div class="result ok"><strong>Resolved at step ${state.stepIdx + 1}</strong><p>Good. If it comes back, run the check again or book a service visit.</p></div>`;
  } else if (state.outcome === "exhausted") {
    out = `<div class="result ${i.sev === "stop" ? "stopbox" : "esc"}"><strong>Checks done, still not fixed</strong><p>${esc(i.esc || "Contact an authorised service centre for this make.")}</p></div>`;
  }
  const steps = i.steps.map((s, idx) => {
    let cls = "step";
    if (state.outcome === null && idx === state.stepIdx) cls += " active";
    if (state.done.includes(idx) || (state.outcome === "fixed" && idx === state.stepIdx)) cls += " done";
    return `<li class="${cls}"><p>${esc(s.d)}</p>${s.w ? `<p class="why">${esc(s.w)}</p>` : ""}
      <div class="acts"><button class="btn primary" data-act="fixed">That fixed it</button><button class="btn" data-act="next">${idx === i.steps.length - 1 ? "Still not fixed" : "Didn't help, next"}</button></div></li>`;
  }).join("");
  d.innerHTML = `
    <button class="back" data-act="back">Back to list</button>
    <span class="badge ${sev.cls}"><i></i>${sev.label}</span>
    <h3>${esc(i.title)}</h3>
    <p class="summary">${esc(i.summary)}</p>
    ${i.warn ? `<p class="warn">${esc(i.warn)}</p>` : ""}
    ${i.inferred ? `<p class="note"><b>Not from the manual.</b> ${esc(i.note || "")}</p>` : ""}
    ${out}
    <ol class="steps">${steps}</ol>
    ${state.outcome ? `<button class="btn" data-act="restart">Run the check again</button>` : ""}
    ${i.esc && !state.outcome ? `<p class="meta"><b>If it's not resolved:</b> ${esc(i.esc)}</p>` : ""}
    <p class="meta">Manual reference: ${esc(i.ref)}</p>`;
}

function openIssue(id) {
  state = { ...state, current: id, stepIdx: 0, done: [], outcome: null };
  switchTab("diagnose");
  document.body.classList.add("showing");
  renderList(); renderDetail();
  store(`last:${car.id}`, id);
  if (window.innerWidth <= 980) window.scrollTo({ top: $("#diagnose").offsetTop - 10 });
}

function stepAction(act) {
  const i = car.issues.find(x => x.id === state.current);
  if (act === "fixed") state.outcome = "fixed";
  else if (act === "next") {
    state.done.push(state.stepIdx);
    if (state.stepIdx < i.steps.length - 1) state.stepIdx++;
    else state.outcome = "exhausted";
  } else if (act === "restart") { state.stepIdx = 0; state.done = []; state.outcome = null; }
  else if (act === "back") { document.body.classList.remove("showing"); state.current = null; renderList(); }
  renderDetail();
}

function switchTab(t) {
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  ["diagnose", "decoder", "service", "specs", "chat"].forEach(id => { $("#" + id).hidden = id !== t; });
}

/* ---------- service schedule ---------- */

const km = n => `${n.toLocaleString("en-IN")} km`;   // 50,000 km
const kmShort = n => n >= 1000 ? `${n / 1000}k` : String(n);  // 50k

// Group an interval's operations by what actually happens, because
// "one part is replaced" is the answer, not a wall of inspections.
const ACTION_ORDER = [
  { codes: ["R"],     title: "Replaced",   cls: "sev-service" },
  { codes: ["CO"],    title: "Carried out", cls: "sev-diy" },
  { codes: ["L"],     title: "Lubricated", cls: "sev-diy" },
  { codes: ["I"],     title: "Inspected",  cls: "sev-normal" },
  { codes: ["IFREQ"], title: "If required", cls: "sev-normal" }
];

function renderServiceFor(idx) {
  const s = car.service;
  const atKm = s.intervals[idx];
  const free = (s.freeLabourAt || []).includes(atKm);
  const rows = s.operations
    .map(op => ({ ...op, code: op.c[idx] }))
    .filter(op => op.code);

  const groups = ACTION_ORDER.map(g => ({
    ...g,
    items: rows.filter(r => g.codes.includes(r.code))
  })).filter(g => g.items.length);

  const replaced = rows.filter(r => r.code === "R").length;
  const paid = rows.filter(r => r.chargeable).length;

  $("#svcOut").innerHTML = `
    <div class="svc-head">
      <h2>At ${km(atKm)}</h2>
      <span class="badge ${free ? "sev-diy" : "sev-normal"}"><i></i>${free ? "Labour free" : "Labour chargeable"}</span>
    </div>
    <p class="summary">${rows.length} operations. ${replaced ? `${replaced} ${replaced === 1 ? "part is" : "parts are"} replaced` : "Nothing is replaced"}, the rest is inspection and adjustment.${paid ? ` ${paid} ${paid === 1 ? "item is" : "items are"} chargeable even when labour is free.` : ""}</p>
    ${groups.map(g => `<div class="svc-group">
      <h3><span class="badge ${g.cls}"><i></i>${g.title}</span><span class="n">${g.items.length}</span></h3>
      <ul>${g.items.map(op => `<li>
        <span class="op">${esc(op.n)}${op.chargeable ? ` <span class="pay">chargeable</span>` : ""}</span>
        ${op.note ? `<span class="why">${esc(op.note)}</span>` : ""}
      </li>`).join("")}</ul>
    </div>`).join("")}`;

  document.querySelectorAll(".svc-pick button").forEach(b =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.svc) === idx)));
}

function nextServiceFromOdo(value) {
  const s = car.service;
  const odo = Number(String(value).replace(/[^0-9]/g, ""));
  if (!odo && odo !== 0) return null;
  const idx = s.intervals.findIndex(i => i >= odo);
  return idx === -1 ? s.intervals.length - 1 : idx;
}

function renderService() {
  const s = car.service;
  if (!s) return;
  $("#serviceTab").hidden = false;
  $("#service").innerHTML = `
    <div class="svc-side">
      <h2>Your next service</h2>
      <p>Enter your odometer reading and the schedule jumps to the service you are heading for.</p>
      <input id="odo" type="text" inputmode="numeric" placeholder="e.g. 7800" aria-label="Odometer reading in km">
      <div class="svc-pick">
        ${s.intervals.map((i, k) => `<button data-svc="${k}" aria-pressed="${k === 0}">${kmShort(i)}</button>`).join("")}
      </div>
      <div class="svc-facts">
        <p><b>First service</b> ${km(s.firstServiceKm)}</p>
        <p><b>Then every</b> ${km(s.intervalKm)}</p>
        <p><b>Labour free at</b> ${(s.freeLabourAt || []).map(kmShort).join(", ")}</p>
      </div>
      ${(s.notes || []).map(n => `<p class="why">${esc(n)}</p>`).join("")}
      <p class="meta">${esc(s.coverageNote || "")}</p>
      <p class="meta">Source: ${esc(s.source)}${s.sourceUrl ? ` <a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">Open the guide</a>` : ""}</p>
    </div>
    <div class="svc-main" id="svcOut"></div>`;
  renderServiceFor(0);

  $("#odo").addEventListener("input", e => {
    const idx = nextServiceFromOdo(e.target.value);
    if (idx !== null) renderServiceFor(idx);
  });
}

/* ---------- decoder ---------- */

function ledSvg() {
  return `<svg id="portSvg" viewBox="0 0 200 200" aria-hidden="true">
    <circle id="ring" class="ring" cx="100" cy="100" r="88" fill="none" stroke="var(--led-off)" stroke-width="9" stroke-dasharray="553" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="74" fill="var(--port)"/>
    <path d="M60 82a40 40 0 0 1 80 0v6H60z" fill="#3B4458"/>
    <g fill="#11151D">
      <circle cx="100" cy="58" r="6"/><circle cx="80" cy="68" r="6"/><circle cx="120" cy="68" r="6"/>
      <circle cx="88" cy="82" r="5"/><circle cx="112" cy="82" r="5"/><circle cx="74" cy="84" r="3.5"/><circle cx="126" cy="84" r="3.5"/>
    </g>
    <rect x="62" y="108" width="76" height="40" rx="20" fill="#3B4458"/>
    <circle cx="82" cy="128" r="11" fill="#11151D"/><circle cx="118" cy="128" r="11" fill="#11151D"/>
  </svg>`;
}

function renderDecoder() {
  const groups = car.signalGroups || [];
  if (!groups.length) {
    $("#decoder").innerHTML = `<div class="portcard" style="text-align:left"><h2>Nothing to decode yet</h2><p>No indicator patterns have been entered for this car. They come from the manual's charging and warning lamp chapters.</p></div>`;
    return;
  }
  $("#decoder").innerHTML = groups.map(g => {
    if (g.kind === "led") {
      return `<div class="portcard" data-group="${esc(g.id)}">
        <h2>${esc(g.name)}</h2><p>${esc(g.blurb || "")}</p>
        ${ledSvg()}
        <div class="ledpick">${g.items.map(l => `<button class="ledbtn" data-led="${esc(l.id)}" aria-pressed="false"><i style="background:${esc(l.color || "#888")}"></i>${esc(l.name)}</button>`).join("")}</div>
        <div class="ledout" id="ledout"><p style="color:var(--muted)">No light selected.</p></div>
      </div>`;
    }
    return `<div class="fobcard"><h2>${esc(g.name)}</h2><p>${esc(g.blurb || "")}</p>
      ${g.items.map((s, k) => `<div class="sig"><button aria-expanded="false" aria-controls="sb-${esc(g.id)}-${k}">
        <span>${s.flashes ? `<span class="flashes">${"<i></i>".repeat(s.flashes)}</span>` : ""}${esc(s.name)}</span></button>
        <div class="body" id="sb-${esc(g.id)}-${k}" hidden>${esc(s.mean)}${s.act ? ` ${esc(s.act)}` : ""}${s.link ? `<br><button class="btn" style="margin-top:8px" data-open="${esc(s.link)}">Open the guided check</button>` : ""}</div></div>`).join("")}
    </div>`;
  }).join("");
}

function renderLed(id) {
  const group = (car.signalGroups || []).find(g => g.kind === "led");
  if (!group) return;
  const l = group.items.find(x => x.id === id);
  const ring = $("#ring");
  ring.classList.remove("blink", "chase");
  ring.style.stroke = l ? l.color : "var(--led-off)";
  ring.setAttribute("stroke-dasharray", l && l.mode === "chase" ? "60 60" : "553");
  if (l && l.mode === "blink") ring.classList.add("blink");
  if (l && l.mode === "chase") ring.classList.add("chase");
  ring.style.filter = l && String(l.color).toUpperCase() === "#FFFFFF" ? "drop-shadow(0 0 1px #8893A5)" : "";
  document.querySelectorAll(".ledbtn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.led === id)));
  $("#ledout").innerHTML = l
    ? `<span class="badge ${SEV[l.sev || "normal"].cls}"><i></i>${SEV[l.sev || "normal"].label}</span>
       <h3>${esc(l.name)}</h3><p>${esc(l.mean)}</p>${l.act ? `<p><b>What to do:</b> ${esc(l.act)}</p>` : ""}
       ${l.link ? `<button class="btn primary" data-open="${esc(l.link)}">Open the guided check</button>` : ""}`
    : `<p style="color:var(--muted)">No light selected.</p>`;
}

/* ---------- specs ---------- */

function renderSpecs() {
  const specs = car.specs || [];
  const never = car.neverDo || [];
  if (!specs.length && !never.length) {
    $("#specs").innerHTML = `<div class="spec"><h2>No specs yet</h2><p>Specifications have not been entered for this car.</p></div>`;
    return;
  }
  $("#specs").innerHTML =
    specs.map(s => `<div class="spec"><h2>${esc(s.h)}</h2><table>${s.rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table></div>`).join("") +
    (never.length ? `<div class="spec"><h2>Never do this</h2>${never.map(n => `<p>${esc(n)}</p>`).join("")}</div>` : "");
}

/* ---------- chat ---------- */

const history = [];
let busy = false;

function addMsg(role, text, cite) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  if (cite) { const c = document.createElement("cite"); c.textContent = cite; el.appendChild(c); }
  $("#msgs").appendChild(el);
  $("#msgs").scrollTop = $("#msgs").scrollHeight;
  return el;
}

async function ask(text) {
  if (busy || !text.trim()) return;
  busy = true;
  $("#send").disabled = true;
  addMsg("user", text);
  history.push({ role: "user", content: text });
  const pending = addMsg("bot", "");
  pending.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carId: car.id, messages: history.slice(-10) })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      pending.className = "msg err";
      pending.textContent = data.error || "That did not go through. Try again in a moment.";
    } else {
      pending.className = "msg bot";
      pending.textContent = data.reply;
      if (data.cite) { const c = document.createElement("cite"); c.textContent = data.cite; pending.appendChild(c); }
      history.push({ role: "assistant", content: data.reply });
    }
  } catch (e) {
    pending.className = "msg err";
    pending.textContent = "No connection to the server. Check your network and ask again.";
  } finally {
    busy = false;
    $("#send").disabled = false;
    $("#msgs").scrollTop = $("#msgs").scrollHeight;
  }
}

function initChat() {
  const usable = car.status !== "stub";
  const starters = usable
    ? [`What does the charging light mean?`, `Is a whining noise normal?`, `What tyre pressure should I use?`]
    : [];
  $("#starters").innerHTML = starters.map(s => `<button data-ask="${esc(s)}">${esc(s)}</button>`).join("");

  if (!usable) {
    $("#input").disabled = true;
    $("#send").disabled = true;
    $("#input").placeholder = "Chat is off until this car's manual is added";
    addMsg("bot", "Chat is switched off for this car. There is no manual content to ground an answer in, and a guess about a car's safety systems is worse than no answer.");
    return;
  }

  addMsg("bot", `Ask anything about the ${car.make} ${car.model}. Answers come from its owner's manual, and you get told when the manual does not cover something.`);

  $("#composer").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#input").value;
    $("#input").value = "";
    $("#input").style.height = "auto";
    ask(v);
  });
  $("#input").addEventListener("input", e => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
  });
  $("#input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
}

/* ---------- boot ---------- */

function renderEmergency() {
  const em = car.emergency;
  if (!em) return;
  $("#openEmergency").hidden = false;
  $("#gateText").textContent = em.gatePrompt || "";
  $("#gate").hidden = false;
  $("#emTitle").textContent = em.title || "Emergency";
  $("#emSteps").innerHTML = (em.steps || []).map(s => `<li>${esc(s)}</li>`).join("");
  $("#emContacts").innerHTML = (em.contacts || []).map(c => `<div><b>${esc(c.name)}</b>${esc(c.detail)}</div>`).join("");
  $("#emFoot").textContent = em.footnote || "";
}

async function init() {
  const id = carIdFromUrl();
  try {
    const res = await fetch(`/data/cars/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(String(res.status));
    car = await res.json();
  } catch (e) {
    $("#carTitle").textContent = "Car not found";
    $("#carBlurb").innerHTML = `That car is not in the library. <a href="/">Pick one from the list</a>.`;
    return;
  }

  document.title = `${car.make} ${car.model} manual`;
  $("#brandSub").textContent = `${car.make} ${car.model}`;
  $("#carTitle").textContent = `What is your ${car.model} doing?`;
  $("#carBlurb").textContent = "Describe the symptom or pick a system. Each check walks through the manual in order, tells you when it is normal, and tells you when to stop and call for help.";
  $("#manualRef").textContent = `Source: ${car.manual.title}, ${car.manual.publisher}${car.manual.issued ? `, ${car.manual.issued}` : ""}. ${car.manual.note || ""}`;

  if (car.status !== "complete" && car.coverageNote) {
    $("#coverage").innerHTML = `<div class="banner"><b>${car.status === "stub" ? "No content yet" : "Partial coverage"}</b>${esc(car.coverageNote)}</div>`;
  }

  renderEmergency();
  renderCats(); renderList(); renderDetail(); renderDecoder(); renderService(); renderSpecs(); initChat();

  const last = load(`last:${car.id}`);
  const chips = car.issues.slice(0, 6).map(i => i.title);
  $("#chips").innerHTML =
    (last && car.issues.find(i => i.id === last)
      ? `<button class="chip" data-open="${esc(last)}" style="border-color:var(--cobalt);color:var(--cobalt)">Resume: ${esc(car.issues.find(i => i.id === last).title)}</button>` : "") +
    chips.map(c => `<button class="chip" data-q="${esc(c)}">${esc(c)}</button>`).join("");

  document.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.cat)  { state.cat = t.dataset.cat; state.q = ""; $("#q").value = ""; renderCats(); renderList(); return; }
    if (t.dataset.id)   { openIssue(t.dataset.id); return; }
    if (t.dataset.open) { openIssue(t.dataset.open); return; }
    if (t.dataset.ask)  { $("#input").value = t.dataset.ask; $("#composer").requestSubmit(); return; }
    if (t.dataset.q)    { $("#q").value = t.dataset.q; state.q = t.dataset.q; state.cat = "all"; switchTab("diagnose"); document.body.classList.remove("showing"); renderCats(); renderList(); return; }
    if (t.dataset.act)  { stepAction(t.dataset.act); return; }
    if (t.dataset.tab)  { switchTab(t.dataset.tab); return; }
    if (t.dataset.led)  { renderLed(t.dataset.led); return; }
    if (t.dataset.svc)  { renderServiceFor(Number(t.dataset.svc)); return; }
    if (t.getAttribute("aria-controls")) {
      const open = t.getAttribute("aria-expanded") === "true";
      t.setAttribute("aria-expanded", String(!open));
      document.getElementById(t.getAttribute("aria-controls")).hidden = open;
    }
  });

  $("#q").addEventListener("input", e => {
    state.q = e.target.value.trim(); state.cat = "all";
    document.body.classList.remove("showing"); switchTab("diagnose"); renderCats(); renderList();
  });

  const dlg = $("#emergency");
  $("#openEmergency").onclick = () => dlg.showModal();
  $("#gateYes").onclick = () => dlg.showModal();
  $("#gateNo").onclick = () => $("#q").focus();
  $("#closeEmergency").onclick = () => dlg.close();
}

init();
