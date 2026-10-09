(() => {
  const $ = (s) => document.querySelector(s);
  const show = (el, on) => { el.hidden = !on; };
  let me = JSON.parse(sessionStorage.getItem("me") || "null");

  function say(text, bad) {
    const m = $("#msg"); m.textContent = text || ""; m.hidden = !text; m.className = "msg" + (bad ? " bad" : "");
    if (text) m.scrollIntoView({ block: "nearest" });
  }
  async function api(action, data, btn) {
    if (!APPS_SCRIPT_URL) { show($("#setupMsg"), true); throw new Error("Not connected"); }
    if (btn) btn.disabled = true; say("");
    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action, token: me && me.token, ...data }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      return j.data;
    } catch (e) { say(e.message === "Failed to fetch" ? "Could not reach the server. Check your internet and try again." : e.message, true); throw e; }
    finally { if (btn) btn.disabled = false; }
  }
  const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };

  if (!APPS_SCRIPT_URL) show($("#setupMsg"), true);

  /* ----- login ----- */
  document.querySelectorAll(".seg-b").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".seg-b").forEach((x) => x.classList.toggle("on", x === b));
    show($("#userForm"), b.dataset.mode === "user"); show($("#ownerForm"), b.dataset.mode === "owner"); say("");
  }));
  const step = (n) => { show($("#step1"), n === 1); show($("#step2"), n === 2); };
  $("#userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("requestPassword", { name: $("#name").value, email: $("#email").value }, $("#sendBtn")).catch(() => null);
    if (r) { $("#sentNote").textContent = "Password sent to " + $("#email").value.trim() + ". It works for " + r.minutes + " minutes. Check spam if you don't see it."; step(2); $("#pw").focus(); }
  });
  $("#haveBtn").addEventListener("click", () => { if ($("#email").value) { $("#sentNote").textContent = "Enter the password for " + $("#email").value.trim() + "."; step(2); } else say("Type your email first.", true); });
  $("#backBtn").addEventListener("click", () => { step(1); say(""); });
  $("#loginBtn").addEventListener("click", async () => {
    const r = await api("login", { email: $("#email").value, password: $("#pw").value }, $("#loginBtn")).catch(() => null);
    if (r) start(r);
  });
  $("#ownerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("ownerLogin", { email: $("#oEmail").value, password: $("#oPw").value }, e.submitter).catch(() => null);
    if (r) start(r);
  });
  $("#logout").addEventListener("click", () => { sessionStorage.removeItem("me"); me = null; location.reload(); });

  /* ----- dashboard ----- */
  const ROLE_TEXT = { user: "Contributor", worker: "Worker", admin: "Admin", owner: "Owner" };
  function start(r) {
    me = r; sessionStorage.setItem("me", JSON.stringify(r));
    show($("#authBox"), false); show($("#dash"), true); show($("#logout"), true); show($("#intro"), false); say("");
    $("#who").textContent = "Signed in as " + r.name + (r.name === ROLE_TEXT[r.role] ? "" : " (" + ROLE_TEXT[r.role] + ")");
    const tabs = [["upload", "Upload"], ["notes", r.role === "user" ? "My uploads" : r.role === "worker" ? "Notes" : "Review and manage"]];
    if (r.role === "owner") tabs.push(["team", "Team"]);
    const bar = $("#tabs"); bar.innerHTML = "";
    tabs.forEach(([id, label], i) => { const b = el("button", "seg-b" + (i ? "" : " on"), label); b.dataset.t = id; b.addEventListener("click", () => open(id)); bar.append(b); });
    open("upload");
  }
  function open(id) {
    document.querySelectorAll("#tabs .seg-b").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
    ["upload", "notes", "team"].forEach((t) => show($("#tab-" + t), t === id));
    if (id === "notes") loadNotes(); if (id === "team") loadTeam();
  }

  $("#upForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = $("#upFile").files[0];
    if (!f) return;
    if (f.size > 10 * 1048576) return say("File is bigger than 10 MB. Compress it and try again.", true);
    const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(f); });
    const r = await api("upload", { title: $("#upTitle").value, subject: $("#upSubject").value, data }, $("#upBtn")).catch(() => null);
    if (r) { say(r.status === "approved" ? "Uploaded. Your note is live." : "Uploaded. It will appear on the site after an admin approves it."); e.target.reset(); }
  });

  const STATUS = { pending: "Waiting for approval", approved: "Live" };
  async function loadNotes() {
    const list = $("#noteList"); list.innerHTML = "";
    const rows = await api("listNotes", {}).catch(() => null);
    if (!rows) return;
    if (!rows.length) { list.append(el("li", "row-empty", "Nothing here yet.")); return; }
    const canReview = me.role === "admin" || me.role === "owner", canDelete = me.role !== "user";
    rows.forEach((n) => {
      const li = el("li", "row"), info = el("div", "row-main");
      const a = el("a", "", n.title); a.href = n.url; a.target = "_blank"; a.rel = "noopener";
      info.append(a, el("p", "row-sub", n.subject + " \u00b7 by " + n.by + " (" + n.email + ")"));
      const st = el("span", "badge" + (n.status === "approved" ? " badge-ok" : ""), STATUS[n.status] || n.status);
      const acts = el("div", "row-acts");
      const mk = (label, cls, fn) => { const b = el("button", "btn btn-sm " + cls, label); b.addEventListener("click", async () => { b.disabled = true; if (await fn().then(() => 1, () => 0)) loadNotes(); else b.disabled = false; }); return b; };
      if (canReview && n.status === "pending") acts.append(mk("Approve", "btn-ink", () => api("review", { id: n.id, decision: "approve" })), mk("Reject", "btn-ghost", () => api("review", { id: n.id, decision: "reject" })));
      if (canDelete) acts.append(mk("Delete", "btn-danger", () => confirm('Delete "' + n.title + '"? This cannot be undone.') ? api("removeNote", { id: n.id }) : Promise.reject()));
      li.append(info, st, acts); list.append(li);
    });
  }
  async function loadTeam() {
    const list = $("#teamList"); list.innerHTML = "";
    const rows = await api("listTeam", {}).catch(() => null);
    if (!rows) return;
    if (!rows.length) list.append(el("li", "row-empty", "No admins or workers yet."));
    rows.forEach((r) => {
      const li = el("li", "row"), info = el("div", "row-main", ""); info.append(el("p", "", r.email));
      const b = el("button", "btn btn-sm btn-danger", "Remove");
      b.addEventListener("click", async () => { b.disabled = true; await api("setRole", { email: r.email, role: "none" }).catch(() => {}); loadTeam(); });
      li.append(info, el("span", "badge", r.role), b); list.append(li);
    });
  }
  $("#teamForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("setRole", { email: $("#tEmail").value, role: $("#tRole").value }, e.submitter).catch(() => null);
    if (r) { e.target.reset(); loadTeam(); }
  });

  if (me) start(me);
})();
