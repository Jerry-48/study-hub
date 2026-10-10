(() => {
  const $ = (s) => document.querySelector(s);
  const show = (el, on) => { el.hidden = !on; };
  const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
  const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let me = null; try { me = JSON.parse(sessionStorage.getItem("me")); } catch (e) {}
  let folders = [], timer = null;

  function say(text, bad) {
    const m = $("#msg"); m.textContent = text || ""; m.hidden = !text; m.className = "msg" + (bad ? " bad" : "");
    if (text) m.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  async function api(action, data, btn) {
    if (!APPS_SCRIPT_URL) { show($("#setupMsg"), true); throw new Error("Not connected"); }
    const label = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = "Please wait..."; } say("");
    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action, token: me && me.token, ...data }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      return j.data;
    } catch (e) {
      if (/Session expired/.test(e.message)) { sessionStorage.removeItem("me"); me = null; screen("s1"); }
      say(e.message === "Failed to fetch" ? "Could not reach the server. Check your internet and try again." : e.message, true); throw e;
    } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  /* ----- screens ----- */
  const POS = { s1: 0, s2: 1, dash: 2 };
  function screen(n) {
    ["s1", "s2", "ownerBox", "dash"].forEach((id) => show($("#" + id), id === n));
    show($("#steps"), n in POS); show($("#intro"), n !== "dash"); show($("#footLink"), n === "s1"); show($("#logout"), n === "dash");
    document.querySelectorAll("#steps li").forEach((li, i) => li.classList.toggle("on", i <= (POS[n] || 0)));
    if (n === "s1") say("");
  }
  if (!APPS_SCRIPT_URL) show($("#setupMsg"), true);
  $("#name").value = store.get("ictName"); $("#email").value = store.get("ictEmail");

  /* ----- login ----- */
  function countdown(mins) {
    clearInterval(timer); const end = Date.now() + mins * 60000, t = $("#timer");
    const tick = () => { const s = Math.max(0, Math.round((end - Date.now()) / 1000)); t.textContent = s ? "Password works for " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " more" : "This password has expired. Ask for a new one."; if (!s) clearInterval(timer); };
    tick(); timer = setInterval(tick, 1000);
  }
  async function sendPassword(btn) {
    const r = await api("requestPassword", { name: $("#name").value, email: $("#email").value }, btn).catch(() => null);
    if (!r) return;
    store.set("ictName", $("#name").value.trim()); store.set("ictEmail", $("#email").value.trim());
    $("#sentNote").textContent = "We sent a password to " + $("#email").value.trim() + ".";
    countdown(r.minutes); screen("s2"); $("#pw").value = ""; $("#pw").focus();
  }
  $("#f1").addEventListener("submit", (e) => { e.preventDefault(); sendPassword($("#sendBtn")); });
  $("#resendBtn").addEventListener("click", () => sendPassword(null));
  $("#haveBtn").addEventListener("click", () => {
    if (!$("#email").value) { $("#email").focus(); return say("Type your email first.", true); }
    clearInterval(timer); $("#timer").textContent = ""; $("#sentNote").textContent = "Enter the password for " + $("#email").value.trim() + "."; screen("s2"); $("#pw").focus();
  });
  $("#backBtn").addEventListener("click", () => { clearInterval(timer); screen("s1"); });
  $("#f2").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("login", { email: $("#email").value, password: $("#pw").value }, $("#loginBtn")).catch(() => null);
    if (r) start(r);
  });
  $("#ownerLink").addEventListener("click", () => screen("ownerBox"));
  $("#ownerBack").addEventListener("click", () => screen("s1"));
  $("#fo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("ownerLogin", { email: $("#oEmail").value, password: $("#oPw").value }, $("#oBtn")).catch(() => null);
    if (r) start(r);
  });
  $("#logout").addEventListener("click", () => { sessionStorage.removeItem("me"); me = null; screen("s1"); });

  /* ----- dashboard ----- */
  const ROLE_TEXT = { user: "Contributor", worker: "Worker", admin: "Admin", owner: "Owner" };
  const label = (f) => (f.group === "papers" ? "Papers: " : "") + f.name;
  function start(r) {
    me = r; sessionStorage.setItem("me", JSON.stringify(r)); screen("dash");
    $("#who").textContent = "Hi " + r.name + (r.role === "user" ? "" : " (" + ROLE_TEXT[r.role] + ")");
    const staff = r.role !== "user", boss = r.role === "admin" || r.role === "owner";
    const tabs = [["upload", "Upload"], ["notes", staff ? "Manage" : "My uploads"]];
    if (boss) tabs.push(["folders", "Folders"]); if (r.role === "owner") tabs.push(["team", "Team"]);
    const bar = $("#tabs"); bar.innerHTML = "";
    tabs.forEach(([id, text]) => { const b = el("button", "seg-b", text); b.type = "button"; b.dataset.t = id; b.addEventListener("click", () => openTab(id)); bar.append(b); });
    show(bar, tabs.length > 2 || staff);
    resetUpload(); loadFolders(); openTab("upload");
  }
  function openTab(id) {
    document.querySelectorAll("#tabs .seg-b").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
    ["upload", "notes", "folders", "team"].forEach((t) => show($("#tab-" + t), t === id));
    say(""); if (id === "notes") loadNotes(); if (id === "team") loadTeam();
  }
  async function loadFolders() {
    try {
      const j = await (await fetch(APPS_SCRIPT_URL)).json(); folders = j.folders || [];
      const sel = $("#upFolder"); sel.innerHTML = '<option value="">Choose a folder</option>';
      [["notes", "Subject notes"], ["papers", "Mid-exam papers"]].forEach(([g, t]) => {
        const og = el("optgroup"); og.label = t;
        folders.filter((f) => f.group === g).forEach((f) => { const o = el("option", "", f.name); o.value = f.id; og.append(o); });
        if (og.children.length) sel.append(og);
      });
    } catch (e) { say("Could not load the folder list. Refresh the page.", true); }
  }

  /* upload */
  const fileIn = $("#upFile");
  function picked() {
    const f = fileIn.files[0]; $("#drop").classList.toggle("has", !!f);
    $("#dropT").textContent = f ? f.name : "Tap to choose a PDF";
    $("#dropS").textContent = f ? (f.size / 1048576).toFixed(1) + " MB. Tap to change" : "or drag it here. Max 10 MB";
    if (f && !$("#upTitle").value) $("#upTitle").value = f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  }
  fileIn.addEventListener("change", picked);
  ["dragover", "dragenter"].forEach((ev) => $("#drop").addEventListener(ev, (e) => { e.preventDefault(); $("#drop").classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => $("#drop").addEventListener(ev, () => $("#drop").classList.remove("over")));
  $("#drop").addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) { fileIn.files = e.dataTransfer.files; picked(); } });
  function resetUpload() { $("#upForm").reset(); picked(); show($("#upForm"), true); show($("#upDone"), false); }
  $("#againBtn").addEventListener("click", resetUpload);
  $("#upForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = fileIn.files[0];
    if (!f) return say("Choose a PDF file first.", true);
    if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return say("Only PDF files are allowed.", true);
    if (f.size > 10 * 1048576) return say("This file is bigger than 10 MB. Please compress it.", true);
    const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(f); });
    const r = await api("upload", { title: $("#upTitle").value, folder: $("#upFolder").value, data }, $("#upBtn")).catch(() => null);
    if (!r) return;
    $("#doneT").textContent = r.status === "approved" ? "Your PDF is live on the site." : "An admin will check it. After that it appears in the folder you chose.";
    show($("#upForm"), false); show($("#upDone"), true);
  });

  /* manage / my uploads */
  const STATUS = { pending: "Waiting for approval", approved: "Live" };
  async function loadNotes() {
    const list = $("#noteList"); list.innerHTML = "";
    const rows = await api("listNotes", {}).catch(() => null);
    if (!rows) return;
    if (!rows.length) return list.append(el("li", "row-empty", "Nothing here yet."));
    rows.sort((a, b) => (b.status === "pending") - (a.status === "pending"));
    const canReview = me.role === "admin" || me.role === "owner", canDelete = me.role !== "user";
    rows.forEach((n) => {
      const li = el("li", "row"), info = el("div", "row-main"), a = el("a", "", n.title);
      a.href = n.url; info.append(a, el("p", "row-sub", n.folder));
      const acts = el("div", "row-acts");
      const mk = (text, cls, fn) => { const b = el("button", "btn btn-sm " + cls, text); b.addEventListener("click", async () => { b.disabled = true; (await fn().then(() => 1, () => 0)) ? loadNotes() : (b.disabled = false); }); return b; };
      if (canReview && n.status === "pending") acts.append(mk("Approve", "btn-ink", () => api("review", { id: n.id, decision: "approve" })), mk("Reject", "btn-ghost", () => api("review", { id: n.id, decision: "reject" })));
      if (canDelete) acts.append(mk("Delete", "btn-danger", () => confirm('Delete "' + n.title + '"? This cannot be undone.') ? api("removeNote", { id: n.id }) : Promise.reject()));
      li.append(info, el("span", "badge" + (n.status === "approved" ? " badge-ok" : ""), STATUS[n.status] || n.status), acts); list.append(li);
    });
  }

  /* new folder (admin / owner) */
  $("#folderForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("createFolder", { name: $("#fName").value, group: $("#fGroup").value, drive: $("#fDrive").value }, e.submitter).catch(() => null);
    if (r) { e.target.reset(); say("Folder created. It now appears on the site and in the upload list."); loadFolders(); }
  });

  /* team (owner) */
  async function loadTeam() {
    const list = $("#teamList"); list.innerHTML = "";
    const rows = await api("listTeam", {}).catch(() => null);
    if (!rows) return;
    if (!rows.length) list.append(el("li", "row-empty", "No admins or workers yet."));
    rows.forEach((r) => {
      const li = el("li", "row"), info = el("div", "row-main"), b = el("button", "btn btn-sm btn-danger", "Remove");
      info.append(el("p", "", r.email));
      b.addEventListener("click", async () => { b.disabled = true; await api("setRole", { email: r.email, role: "none" }).catch(() => {}); loadTeam(); });
      li.append(info, el("span", "badge", r.role), b); list.append(li);
    });
  }
  $("#teamForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("setRole", { email: $("#tEmail").value, role: $("#tRole").value }, e.submitter).catch(() => null);
    if (r) { e.target.reset(); loadTeam(); }
  });

  if (me && me.token) start(me); else screen("s1");
})();
