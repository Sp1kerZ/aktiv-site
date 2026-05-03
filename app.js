(() => {
  const els = {
    home: document.getElementById("home"),
    logsPage: document.getElementById("logsPage"),
    headerGroupSwitch: document.getElementById("headerGroupSwitch"),
    metaLine: document.getElementById("metaLine"),
    cards: document.getElementById("cards"),
    emptyState: document.getElementById("emptyState"),
    statusBar: document.getElementById("statusBar"),
    searchInput: document.getElementById("searchInput"),
    userFilter: document.getElementById("userFilter"),
    resetBtn: document.getElementById("resetBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    segBtns: Array.from(document.querySelectorAll(".seg-btn")),
    openGroupBtns: Array.from(document.querySelectorAll("[data-open-group]")),
  };

  const state = {
    page: "home", // home | logs
    group: "1",
    search: "",
    user: "",
    allData: null,
    lastLoadedAt: null,
    dataUrl: "",
  };

  const TYPE_STYLES = {
    message: { label: "message", pill: "" },
    photo: { label: "photo", pill: "ok" },
    edit: { label: "edit", pill: "warn" },
    system: { label: "system", pill: "danger" },
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeLower(value) {
    return String(value ?? "").toLowerCase();
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const map = Object.create(null);
    for (const p of parts) map[p.type] = p.value;
    if (!map.day || !map.month || !map.year || !map.hour || !map.minute) return "—";
    return `${map.day}.${map.month}.${map.year} ${map.hour}:${map.minute}`;
  }

  function initialsFromName(name, username) {
    const src = String(name || "").trim() || String(username || "").trim();
    if (!src) return "??";
    const parts = src.replaceAll("_", " ").split(/\s+/g).filter(Boolean);
    const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "");
    const out = letters.join("");
    return out || src.slice(0, 2).toUpperCase();
  }

  function getTypeStyle(type) {
    return TYPE_STYLES[type] || { label: String(type || "unknown"), pill: "" };
  }

  function setGroup(nextGroup) {
    state.group = String(nextGroup);
    for (const btn of els.segBtns) {
      const pressed = btn.dataset.group === state.group;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    }
    state.user = "";
    els.userFilter.value = "";
    render();
  }

  function showLogsPage(groupToOpen) {
    state.page = "logs";
    els.home.hidden = true;
    els.logsPage.hidden = false;
    els.headerGroupSwitch.hidden = false;
    setGroup(groupToOpen);
    els.searchInput?.focus();
  }

  function getGroupMessages() {
    const groups = state.allData?.groups || {};
    const arr = groups[state.group] || [];
    return Array.isArray(arr) ? arr : [];
  }

  function rebuildUserFilter(messages) {
    const current = state.user;
    const users = new Map();
    for (const m of messages) {
      const key = String(m.username || "");
      if (!key) continue;
      if (!users.has(key)) users.set(key, m.name || key);
    }

    const options = [
      '<option value="">Все пользователи</option>',
      ...Array.from(users.entries())
        .sort((a, b) => a[0].localeCompare(b[0], "ru"))
        .map(([username, name]) => {
          const label = `${name} (@${username})`;
          return `<option value="${escapeHtml(username)}">${escapeHtml(label)}</option>`;
        }),
    ];
    els.userFilter.innerHTML = options.join("");

    if (current && users.has(current)) {
      els.userFilter.value = current;
    } else {
      state.user = "";
      els.userFilter.value = "";
    }
  }

  function applyFilters(messages) {
    const q = safeLower(state.search).trim();
    const u = String(state.user || "");
    if (!q && !u) return messages;

    return messages.filter((m) => {
      if (u && String(m.username || "") !== u) return false;
      if (!q) return true;

      const hay = [
        m.name,
        m.username ? `@${m.username}` : "",
        m.userId,
        m.messageId,
        m.type,
        m.text,
        m.caption,
      ]
        .map((x) => safeLower(x))
        .join(" • ");

      return hay.includes(q);
    });
  }

  function sortMessages(messages) {
    return [...messages].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    });
  }

  function renderMeta(total, newestTimestamp) {
    const groupLabel = state.group === "1" ? "1 группа" : "2 группа";
    const newest = newestTimestamp ? formatTime(newestTimestamp) : "—";
    els.metaLine.textContent = `${groupLabel} • записей: ${total} • последнее: ${newest} МСК`;
  }

  function renderStatus(visible, total) {
    const q = state.search.trim();
    const u = state.user;
    const parts = [];
    parts.push(`Показано: ${visible} из ${total}`);
    if (q) parts.push(`поиск: “${q}”`);
    if (u) parts.push(`пользователь: @${u}`);
    els.statusBar.textContent = parts.join(" • ");
  }

  function renderCards(messages, total) {
    const newestTimestamp = Array.isArray(messages) && messages.length > 0 ? messages[0]?.timestamp : null;
    renderMeta(total, newestTimestamp);
    renderStatus(messages.length, total);

    if (messages.length === 0) {
      els.cards.innerHTML = "";
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    const html = messages
      .map((m) => {
        const type = getTypeStyle(m.type);
        const pillClass = type.pill ? `pill ${type.pill}` : "pill";
        const avatar = initialsFromName(m.name, m.username);
        const name = escapeHtml(m.name || "Без имени");
        const username = m.username ? `@${escapeHtml(m.username)}` : "—";
        const userId = escapeHtml(m.userId ?? "—");
        const msgId = escapeHtml(m.messageId ?? "—");
        const timeRaw = formatTime(m.timestamp);
        const time = escapeHtml(timeRaw);
        const timeLabel = timeRaw === "—" ? "—" : `${time} <span class="tz">МСК</span>`;
        const text = escapeHtml(m.text || "");
        const caption = m.caption ? escapeHtml(m.caption) : "";

        return `
          <article class="card">
            <div class="card-top">
              <div class="avatar" aria-hidden="true">${avatar}</div>
              <div class="who">
                <div class="name-row">
                  <div class="name" title="${name}">${name}</div>
                  <div class="${pillClass}" title="Тип">${escapeHtml(type.label)}</div>
                </div>
                <div class="sub">
                  <span title="Username"><code>${username}</code></span>
                  <span title="User ID">ID: <code>${userId}</code></span>
                  <span title="Message ID">Msg: <code>${msgId}</code></span>
                  <span class="time" title="Время (МСК)">${timeLabel}</span>
                </div>
              </div>
            </div>
            <div class="card-body">
              <div class="msg">
                <div class="msg-title">Текст</div>
                <div class="msg-text">${text || "<span class='muted'>—</span>"}</div>
                ${
                  caption
                    ? `<div class="msg-caption"><div class="msg-title">Подпись</div><div class="msg-text">${caption}</div></div>`
                    : ""
                }
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    els.cards.innerHTML = html;
  }

  async function loadData() {
    const cfg = window.ACTIV_CONFIG || {};
    state.dataUrl = String(cfg.DATA_URL || "").trim();

    try {
      if (!state.dataUrl) throw new Error("DATA_URL not set");

      const res = await fetch(state.dataUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.allData = json;
      state.lastLoadedAt = new Date();
      return;
    } catch {
      // Fallback: чтобы интерфейс не был пустым без бекенда
      state.allData = {
        groups: {
          "1": [
            {
              messageId: "m-local-1",
              userId: 1,
              name: "Локальный мок",
              username: "local_mock",
              timestamp: new Date().toISOString(),
              type: "system",
              text:
                "Не удалось загрузить данные. Укажите window.ACTIV_CONFIG.DATA_URL в config.js (URL вашего бекенда на Railway), который отдаёт JSON вида { groups: { '1': [...], '2': [...] } }.",
            },
          ],
          "2": [],
        },
      };
      state.lastLoadedAt = new Date();
    }
  }

  function render() {
    if (state.page !== "logs") return;
    const all = sortMessages(getGroupMessages());
    rebuildUserFilter(all);
    const filtered = applyFilters(all);
    renderCards(filtered, all.length);
  }

  function wireUi() {
    for (const btn of els.segBtns) {
      btn.addEventListener("click", () => setGroup(btn.dataset.group));
    }

    for (const btn of els.openGroupBtns) {
      btn.addEventListener("click", () => showLogsPage(btn.dataset.openGroup));
    }

    const onSearch = () => {
      state.search = els.searchInput.value || "";
      render();
    };
    els.searchInput.addEventListener("input", onSearch);

    els.userFilter.addEventListener("change", () => {
      state.user = els.userFilter.value || "";
      render();
    });

    els.resetBtn.addEventListener("click", () => {
      state.search = "";
      state.user = "";
      els.searchInput.value = "";
      els.userFilter.value = "";
      render();
      els.searchInput.focus();
    });

    els.refreshBtn.addEventListener("click", async () => {
      els.refreshBtn.disabled = true;
      els.refreshBtn.textContent = "Обновление…";
      await loadData();
      render();
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = "Обновить";
    });
  }

  (async function boot() {
    wireUi();
    await loadData();
  })();
})();
