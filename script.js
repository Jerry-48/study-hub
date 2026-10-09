// Renders subject cards from resources.js and handles search.
(() => {
  const WA = "https://wa.me/918401542135";
  const ICON_FILE = '<svg class="f-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5M10 13h6M10 17h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_GO = '<svg class="go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CHEV = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const $ = (s, r = document) => r.querySelector(s);
  const input = $("#q");
  const clearBtn = $("#clear");
  const summary = $("#summary");
  const searchBox = $(".search");
  const emptyAll = $("#emptyAll");

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Wrap each search word in <mark> (text is escaped first)
  function highlight(text, tokens) {
    const safe = esc(text);
    if (!tokens.length) return safe;
    const re = new RegExp("(" + tokens.map((t) => escRe(esc(t))).join("|") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  const cards = []; // { sub, root, rows: [{item, li}], titleEl, countEl, group }

  function build(list, grid, group) {
    list.forEach((sub) => {
      const root = el("details", "subject");
      root.id = sub.id;

      const sum = el("summary");
      let img;
      if (sub.cover) { img = el("img", "cover"); img.src = sub.cover; img.alt = ""; img.width = 320; img.height = 480; img.loading = "lazy"; }
      else img = el("div", "cover cover-ph", "+");
      const body = el("div", "s-body");
      const titleEl = el("h3", "s-title");
      const countEl = el("p", "s-count");
      body.append(titleEl, countEl);
      sum.append(img, body, el("span", "chev", ICON_CHEV));
      root.append(sum);

      const rows = [];
      if (sub.items.length) {
        const ul = el("ul", "files");
        sub.items.forEach((item) => {
          const li = el("li");
          const a = el("a", "file");
          a.href = item.url; a.target = "_blank"; a.rel = "noopener";
          a.innerHTML = ICON_FILE + '<span class="f-name"></span>';
          const nameEl = $(".f-name", a);
          if (item.unofficial) a.insertAdjacentHTML("beforeend", '<span class="badge">Non-official</span>');
          if (item.external) a.insertAdjacentHTML("beforeend", '<span class="badge badge-ext">External site</span>');
          a.insertAdjacentHTML("beforeend", ICON_GO);
          li.append(a); ul.append(li);
          rows.push({ item, li, nameEl, a });
        });
        root.append(ul);
      } else {
        root.append(el("p", "empty-note",
          'No files yet for this subject. Have notes to share? <a href="' + WA + '" target="_blank" rel="noopener">Send them on WhatsApp</a>.'));
      }
      grid.append(root);
      cards.push({ sub, root, rows, titleEl, countEl, group });
    });
  }

  build(NOTES, $("#notesGrid"), "notes");
  build(PAPERS, $("#papersGrid"), "papers");

  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  function render() {
    const raw = input.value.trim();
    const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
    const searching = tokens.length > 0;
    clearBtn.hidden = !searching;
    searchBox.classList.toggle("has-value", searching);

    let total = 0, subjects = 0;
    const groupHits = { notes: 0, papers: 0 };

    cards.forEach((c) => {
      let shown = 0;
      c.rows.forEach((r) => {
        const hay = (r.item.title + " " + c.sub.title + (r.item.unofficial ? " non-official unofficial" : "")).toLowerCase();
        const ok = tokens.every((t) => hay.includes(t));
        r.li.hidden = !ok;
        if (ok) shown++;
        r.nameEl.innerHTML = highlight(r.item.title, searching ? tokens : []);
      });

      c.titleEl.innerHTML = highlight(c.sub.title, searching ? tokens : []);
      const base = c.rows.length ? plural(c.rows.length, "file") : "No files yet";
      c.countEl.textContent = searching && c.rows.length ? shown + " of " + base : base;

      const visible = !searching || shown > 0;
      c.root.hidden = !visible;
      if (searching) c.root.open = shown > 0;
      if (visible) { subjects++; groupHits[c.group]++; total += shown; }
    });

    // Hide a whole section when it has no matching cards
    $("#notes").hidden = searching && groupHits.notes === 0;
    $("#papers").hidden = searching && groupHits.papers === 0;
    emptyAll.hidden = !(searching && total === 0);

    if (searching) {
      summary.innerHTML = total
        ? "<strong>" + plural(total, "file") + "</strong> found for \u201c" + esc(raw) + "\u201d in " + plural(subjects, "subject") + "."
        : "";
    } else {
      const all = cards.reduce((n, c) => n + c.rows.length, 0);
      summary.textContent = all + " PDFs across " + NOTES.filter((s) => s.items.length).length + " subjects and " + PAPERS.length + " paper sets.";
    }
  }

  input.addEventListener("input", render);
  clearBtn.addEventListener("click", () => { input.value = ""; render(); input.focus(); });
  document.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      input.value = b.dataset.q;
      render();
      $("#notes").hidden ? $("#papers").scrollIntoView() : $("#notes").scrollIntoView();
    })
  );
  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); }
    if (e.key === "Escape" && document.activeElement === input && input.value) { input.value = ""; render(); }
  });

  // Open the card the visitor linked to (e.g. index.html#maths)
  const hash = location.hash.slice(1);
  const target = cards.find((c) => c.root.id === hash);
  if (target) target.root.open = true;

  render();

  // Community notes approved by admins (served by the Apps Script backend)
  if (typeof APPS_SCRIPT_URL !== "undefined" && APPS_SCRIPT_URL) {
    fetch(APPS_SCRIPT_URL).then((r) => r.json()).then((j) => {
      if (!j.ok || !j.notes.length) return;
      const items = j.notes.map((n) => ({ title: n.title + " (" + n.subject + ", by " + n.by + ")", url: n.url, unofficial: true }));
      build([{ id: "community", title: "Community notes", items }], $("#notesGrid"), "notes");
      render();
    }).catch(() => {});
  }
})();
