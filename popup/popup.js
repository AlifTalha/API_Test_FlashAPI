/* =============================================
   API Tester — popup.js
   Full logic: request builder, fetch, response
   renderer, history, syntax highlighting
   ============================================= */

"use strict";

// ── DOM refs ──────────────────────────────────
const methodSelect = document.getElementById("method-select");
const urlInput = document.getElementById("url-input");
const btnSend = document.getElementById("btn-send");
const btnHistoryToggle = document.getElementById("btn-history-toggle");
const btnThemeToggle = document.getElementById("btn-theme-toggle");

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

const headersTable = document.getElementById("headers-table");
const btnAddHeader = document.getElementById("btn-add-header");

const bodyTypeRadios = document.querySelectorAll('input[name="body-type"]');
const bodyEditor = document.getElementById("body-editor");
const formEditor = document.getElementById("form-editor");
const btnAddFormRow = document.getElementById("btn-add-form-row");
const multipartEditor = document.getElementById("multipart-editor");
const btnAddMultipartRow = document.getElementById("btn-add-multipart-row");

const paramsTable = document.getElementById("params-table");
const btnAddParam = document.getElementById("btn-add-param");

const responseSection = document.getElementById("response-section");
const responseMeta = document.getElementById("response-meta");
const responsePretty = document.getElementById("response-pretty");
const responseRaw = document.getElementById("response-raw");
const responseHeadersView = document.getElementById("response-headers-view");

const respTabBtns = document.querySelectorAll(".resp-tab-btn");
const respTabContents = document.querySelectorAll(".resp-tab-content");

const btnRespFontDec = document.getElementById("btn-resp-font-dec");
const btnRespFontInc = document.getElementById("btn-resp-font-inc");
const btnRespFullscreen = document.getElementById("btn-resp-fullscreen");
const respSearchBar = document.getElementById("resp-search-bar");
const respSearchInput = document.getElementById("resp-search-input");
const respSearchCount = document.getElementById("resp-search-count");
const btnRespSearchPrev = document.getElementById("btn-resp-search-prev");
const btnRespSearchNext = document.getElementById("btn-resp-search-next");
const btnRespSearchClose = document.getElementById("btn-resp-search-close");

const loader = document.getElementById("loader");
const btnCancel = document.getElementById("btn-cancel");
const placeholder = document.getElementById("placeholder");

const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const btnClearHistory = document.getElementById("btn-clear-history");

const envPanel = document.getElementById("env-panel");
const envTable = document.getElementById("env-table");
const btnEnvToggle = document.getElementById("btn-env-toggle");
const btnCloseEnv = document.getElementById("btn-close-env");
const btnAddEnvVar = document.getElementById("btn-add-env-var");

// ── CORS CHECK DOM refs ────────────────────────
const btnCorsCheck = document.getElementById("btn-cors-check");
const corsPanel = document.getElementById("cors-panel");
const btnCorsRun = document.getElementById("btn-cors-run");
const btnCorsClose = document.getElementById("btn-cors-close");
const corsOriginInput = document.getElementById("cors-origin-input");
const corsResult = document.getElementById("cors-result");

// ── AUTH DOM refs ──────────────────────────────
const authTypeRadios = document.querySelectorAll('input[name="auth-type"]');
const authBearerFields = document.getElementById("auth-bearer");
const authApikeyFields = document.getElementById("auth-apikey");
const authBasicFields = document.getElementById("auth-basic");
const bearerTokenInput = document.getElementById("auth-bearer-token");
const apikeyNameInput = document.getElementById("auth-apikey-name");
const apikeyValueInput = document.getElementById("auth-apikey-value");
const basicUserInput = document.getElementById("auth-basic-user");
const basicPassInput = document.getElementById("auth-basic-pass");

// ── STATE ─────────────────────────────────────
let abortController = null;
let lastRawText = ""; // kept for copy/download
let reqTabs = [];
let activeTabId = null;

// ── INIT ──────────────────────────────────────
(function init() {
  updateMethodColour();
  loadHistory();
  loadEnvVars();
  chrome.storage.local.get(
    {
      theme: "dark",
      popupSize: null,
      lastStatus: null,
      reqTabs: null,
      activeTabId: null,
    },
    (data) => {
      applyTheme(data.theme === "light");
      if (data.popupSize) {
        document.documentElement.style.width = data.popupSize.w + "px";
        document.documentElement.style.minHeight = data.popupSize.h + "px";
      }
      if (data.lastStatus) {
        updateStatusBar(data.lastStatus.state, data.lastStatus.data);
      }
      // Restore request tabs
      if (data.reqTabs && data.reqTabs.length) {
        reqTabs = data.reqTabs;
        activeTabId = data.activeTabId || data.reqTabs[0].id;
      } else {
        const defaultTab = createDefaultTab(Date.now(), "Tab 1");
        reqTabs = [defaultTab];
        activeTabId = defaultTab.id;
        saveReqTabs();
      }
      const activeTab = reqTabs.find((t) => t.id === activeTabId) || reqTabs[0];
      restoreTab(activeTab);
      renderReqTabBar();
    },
  );
})();

// ── METHOD COLOUR ─────────────────────────────
methodSelect.addEventListener("change", updateMethodColour);

function updateMethodColour() {
  const m = methodSelect.value;
  methodSelect.className = "method-select " + m;
}

// ── TABS ──────────────────────────────────────
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

respTabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    respTabBtns.forEach((b) => b.classList.remove("active"));
    respTabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document
      .getElementById("resp-tab-" + btn.dataset.respTab)
      .classList.add("active");
    // Re-apply search highlight on the newly visible tab
    if (
      !respSearchBar.classList.contains("hidden") &&
      respSearchInput.value.trim()
    ) {
      setTimeout(() => highlightMatches(respSearchInput.value.trim()), 0);
    }
  });
});

// ── AUTH TYPE TOGGLE ─────────────────────────
const authFieldMap = {
  bearer: authBearerFields,
  apikey: authApikeyFields,
  basic: authBasicFields,
};

function showAuthFields(type) {
  Object.values(authFieldMap).forEach((el) => el.classList.add("hidden"));
  if (authFieldMap[type]) authFieldMap[type].classList.remove("hidden");
}

authTypeRadios.forEach((r) => {
  r.addEventListener("change", () => showAuthFields(r.value));
});

// Eye (show/hide) buttons for password fields
[
  ["btn-eye-bearer", bearerTokenInput],
  ["btn-eye-apikey", apikeyValueInput],
  ["btn-eye-basic", basicPassInput],
].forEach(([btnId, input]) => {
  document.getElementById(btnId).addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
  });
});

// ── BUILD AUTH HEADER ─────────────────────────
function getAuthHeader() {
  const type = document.querySelector('input[name="auth-type"]:checked').value;
  if (type === "bearer") {
    const token = bearerTokenInput.value.trim();
    if (token) return { Authorization: `Bearer ${token}` };
  } else if (type === "apikey") {
    const name = apikeyNameInput.value.trim() || "X-API-Key";
    const value = apikeyValueInput.value.trim();
    if (value) return { [name]: value };
  } else if (type === "basic") {
    const user = basicUserInput.value;
    const pass = basicPassInput.value;
    if (user || pass) {
      const encoded = btoa(`${user}:${pass}`);
      return { Authorization: `Basic ${encoded}` };
    }
  }
  return {};
}

// ── BODY TYPE TOGGLE ──────────────────────────
bodyTypeRadios.forEach((r) => {
  r.addEventListener("change", () => {
    const val = r.value;
    bodyEditor.classList.toggle("hidden", val !== "json");
    formEditor.classList.toggle("hidden", val !== "form");
    btnAddFormRow.classList.toggle("hidden", val !== "form");
    multipartEditor.classList.toggle("hidden", val !== "multipart");
    btnAddMultipartRow.classList.toggle("hidden", val !== "multipart");
  });
});

// ── KEY-VALUE ROWS ────────────────────────────
function addKvRow(table, keyVal = "", valueVal = "") {
  const row = document.createElement("div");
  row.className = "kv-row";
  row.innerHTML = `
    <input type="text" placeholder="Key"   value="${escapeAttr(keyVal)}"   />
    <input type="text" placeholder="Value" value="${escapeAttr(valueVal)}" />
    <button class="btn-remove-row" title="Remove">✕</button>
  `;
  row
    .querySelector(".btn-remove-row")
    .addEventListener("click", () => row.remove());
  table.appendChild(row);
}

function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

btnAddHeader.addEventListener("click", () => addKvRow(headersTable));
btnAddParam.addEventListener("click", () => addKvRow(paramsTable));
btnAddFormRow.addEventListener("click", () => addKvRow(formEditor));
btnAddMultipartRow.addEventListener("click", () => {
  addMultipartRow();
  const rows = multipartEditor.querySelectorAll(".mp-row");
  if (rows.length) rows[rows.length - 1].querySelector(".mp-name").focus();
});

// ── MULTIPART ROWS ──────────────────────────────
function addMultipartRow(name = "", type = "text", value = "") {
  const row = document.createElement("div");
  row.className = "mp-row";
  const isFile = type === "file";
  row.innerHTML = `
    <input type="text" class="mp-name" placeholder="field name" value="${escapeAttr(name)}" spellcheck="false" />
    <button class="mp-type-btn" data-type="${isFile ? "file" : "text"}">${isFile ? "File" : "Text"}</button>
    <input type="text" class="mp-text-val${isFile ? " hidden" : ""}" placeholder="value" value="${escapeAttr(value)}" />
    <label class="mp-file-label${isFile ? "" : " hidden"}">
      <input type="file" class="mp-file-input" />
      <span class="mp-file-display">Choose file…</span>
    </label>
    <button class="btn-remove-row" title="Remove">✕</button>
  `;
  const typeBtn = row.querySelector(".mp-type-btn");
  const textVal = row.querySelector(".mp-text-val");
  const fileLabel = row.querySelector(".mp-file-label");
  const fileInput = row.querySelector(".mp-file-input");
  const fileDisplay = row.querySelector(".mp-file-display");

  typeBtn.addEventListener("click", () => {
    const nowFile = typeBtn.dataset.type === "text";
    typeBtn.dataset.type = nowFile ? "file" : "text";
    typeBtn.textContent = nowFile ? "File" : "Text";
    textVal.classList.toggle("hidden", nowFile);
    fileLabel.classList.toggle("hidden", !nowFile);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) {
      fileDisplay.textContent = `${file.name} (${formatSize(file.size)})`;
      fileDisplay.classList.add("has-file");
    } else {
      fileDisplay.textContent = "Choose file…";
      fileDisplay.classList.remove("has-file");
    }
  });

  row
    .querySelector(".btn-remove-row")
    .addEventListener("click", () => row.remove());
  multipartEditor.appendChild(row);
}

function collectMultipartSnapshot() {
  const rows = [];
  multipartEditor.querySelectorAll(".mp-row").forEach((row) => {
    const name = row.querySelector(".mp-name").value.trim();
    const type = row.querySelector(".mp-type-btn").dataset.type;
    const value =
      type === "text" ? row.querySelector(".mp-text-val").value : "";
    rows.push({ name, type, value });
  });
  return rows;
}

// ── COLLECT KEY-VALUE PAIRS ───────────────────
function collectKvRows(table) {
  const pairs = {};
  table.querySelectorAll(".kv-row").forEach((row) => {
    const [keyInput, valInput] = row.querySelectorAll("input");
    const k = keyInput.value.trim();
    const v = valInput.value.trim();
    if (k) pairs[k] = v;
  });
  return pairs;
}

// ── BUILD URL WITH QUERY PARAMS ───────────────
function buildUrl(base, params) {
  const entries = Object.entries(params).filter(([k]) => k);
  if (!entries.length) return base;
  try {
    const url = new URL(base);
    entries.forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  } catch {
    const qs = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return base + (base.includes("?") ? "&" : "?") + qs;
  }
}

// ── SEND REQUEST ──────────────────────────────
btnSend.addEventListener("click", sendRequest);
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.ctrlKey) sendRequest();
});

async function sendRequest() {
  const rawUrl = resolveEnv(urlInput.value.trim());
  if (!rawUrl) {
    urlInput.focus();
    urlInput.style.borderColor = "var(--danger)";
    setTimeout(() => (urlInput.style.borderColor = ""), 1200);
    return;
  }

  const method = methodSelect.value;
  // Build headers; resolve env vars in both keys and values
  const rawHeaders = { ...collectKvRows(headersTable), ...getAuthHeader() };
  const headers = {};
  Object.entries(rawHeaders).forEach(([k, v]) => {
    headers[resolveEnv(k)] = resolveEnv(v);
  });
  // Resolve env vars in query params
  const rawQParams = collectKvRows(paramsTable);
  const qParams = {};
  Object.entries(rawQParams).forEach(([k, v]) => {
    qParams[resolveEnv(k)] = resolveEnv(v);
  });
  const finalUrl = buildUrl(rawUrl, qParams);

  // Build body
  let body = undefined;
  const bodyType = document.querySelector(
    'input[name="body-type"]:checked',
  ).value;
  if (bodyType === "json" && bodyEditor.value.trim()) {
    body = resolveEnv(bodyEditor.value.trim());
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  } else if (bodyType === "form") {
    const rawFormPairs = collectKvRows(formEditor);
    const formPairs = {};
    Object.entries(rawFormPairs).forEach(([k, v]) => {
      formPairs[resolveEnv(k)] = resolveEnv(v);
    });
    body = new URLSearchParams(formPairs).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (bodyType === "multipart") {
    const fd = new FormData();
    multipartEditor.querySelectorAll(".mp-row").forEach((row) => {
      const n = resolveEnv(row.querySelector(".mp-name").value.trim());
      if (!n) return;
      const type = row.querySelector(".mp-type-btn").dataset.type;
      if (type === "file") {
        const file = row.querySelector(".mp-file-input").files[0];
        if (file) fd.append(n, file, file.name);
      } else {
        fd.append(n, resolveEnv(row.querySelector(".mp-text-val").value));
      }
    });
    body = fd;
    // Let browser set Content-Type with correct boundary
    delete headers["Content-Type"];
  }

  // Warn if any {{vars}} are still unresolved after substitution
  const _bodyStr = body instanceof FormData || body === undefined ? "" : body;
  const _checkStr = [rawUrl, JSON.stringify(headers), _bodyStr].join(" ");
  const _unresolved = [
    ...new Set([..._checkStr.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])),
  ];
  if (_unresolved.length) {
    showToast(`⚠ Unresolved: ${_unresolved.map((v) => `{{${v}}}`).join(", ")}`);
  }

  // UI state
  setLoading(true);
  responseSection.classList.remove("visible");
  placeholder.classList.add("hidden");

  // Abort any running request
  if (abortController) abortController.abort();
  abortController = new AbortController();

  const startTime = performance.now();

  try {
    const fetchOptions = {
      method,
      headers,
      signal: abortController.signal,
    };
    if (body !== undefined && !["GET", "HEAD"].includes(method)) {
      fetchOptions.body = body;
    }

    const response = await fetch(finalUrl, fetchOptions);
    const elapsed = Math.round(performance.now() - startTime);
    const rawText = await response.text();
    const size = new Blob([rawText]).size;

    renderResponse(response, rawText, elapsed, size);
    saveHistory(method, finalUrl, response.status);
  } catch (err) {
    if (err.name === "AbortError") {
      updateStatusBar("warn", { text: "Request cancelled" });
      showToast("\u23f9 Request cancelled");
      return;
    }
    renderError(err.message);
  } finally {
    setLoading(false);
  }
}

// ── RENDER RESPONSE ───────────────────────────
function renderResponse(res, rawText, elapsed, size) {
  resetRespSearch();
  // Meta bar
  const statusClass = getStatusClass(res.status);
  const sizeLabel = formatSize(size);

  responseMeta.innerHTML = `
    <span class="status-badge ${statusClass}">${res.status} ${res.statusText || ""}</span>
    <span class="meta-pill">Time: <span>${elapsed} ms</span></span>
    <span class="meta-pill">Size: <span>${sizeLabel}</span></span>
  `;

  // Pretty / Raw
  let parsed = null;
  let isJson = false;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("json") || looksLikeJson(rawText)) {
    try {
      parsed = JSON.parse(rawText);
      isJson = true;
    } catch {
      /* not valid JSON */
    }
  }

  if (isJson && parsed !== null) {
    responsePretty.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 2));
  } else {
    const pre = document.createElement("pre");
    pre.textContent = rawText || "(empty body)";
    responsePretty.innerHTML = "";
    responsePretty.appendChild(pre);
  }

  responseRaw.textContent = rawText || "(empty body)";

  // Store for copy / download
  lastRawText = rawText || "";

  // Response headers
  responseHeadersView.innerHTML = "";
  res.headers.forEach((value, key) => {
    const row = document.createElement("div");
    row.className = "hdr-row";
    row.innerHTML = `<span class="hdr-key">${escapeHtml(key)}</span><span class="hdr-val">${escapeHtml(value)}</span>`;
    responseHeadersView.appendChild(row);
  });

  responseSection.classList.add("visible");

  // Status bar update
  const sbState =
    res.status >= 500
      ? "error"
      : res.status >= 400
        ? "warn"
        : res.status >= 300
          ? "warn"
          : "success";
  updateStatusBar(sbState, {
    text: `${res.status} ${res.statusText || ""} · ${elapsed} ms · ${sizeLabel}`,
  });

  // Reset to pretty tab
  respTabBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.respTab === "pretty"),
  );
  respTabContents.forEach((c) =>
    c.classList.toggle("active", c.id === "resp-tab-pretty"),
  );

  // Save original content for in-response search
  saveOrigResponseContent();

  // Re-apply current font size to freshly rendered content
  applyRespFontSize();
}

function renderError(message) {
  resetRespSearch();
  responseMeta.innerHTML = `<span class="status-badge serr">Error</span>`;
  responsePretty.textContent = message;
  responseRaw.textContent = message;
  responseHeadersView.innerHTML = "";
  responseSection.classList.add("visible");
  lastRawText = message;
  updateStatusBar("error", { text: "Error: " + message });
  saveOrigResponseContent();
  applyRespFontSize();
}

// ══════════════════════════════════════════════
// ── RESPONSE FONT SIZE ────────────────────────
// ══════════════════════════════════════════════

const RESP_FONT_MIN = 9;
const RESP_FONT_MAX = 22;
let _respFontSize = 12;

function applyRespFontSize() {
  document.querySelectorAll(".response-body").forEach((el) => {
    el.style.fontSize = _respFontSize + "px";
  });
}

btnRespFontDec.addEventListener("click", () => {
  if (_respFontSize <= RESP_FONT_MIN) return;
  _respFontSize--;
  applyRespFontSize();
  chrome.storage.local.set({ respFontSize: _respFontSize });
});

btnRespFontInc.addEventListener("click", () => {
  if (_respFontSize >= RESP_FONT_MAX) return;
  _respFontSize++;
  applyRespFontSize();
  chrome.storage.local.set({ respFontSize: _respFontSize });
});

chrome.storage.local.get({ respFontSize: 12 }, (d) => {
  _respFontSize = d.respFontSize;
  applyRespFontSize();
});

// ══════════════════════════════════════════════
// ── FULLSCREEN RESPONSE ───────────────────────
// ══════════════════════════════════════════════

function toggleRespFullscreen() {
  const isFS = responseSection.classList.toggle("resp-fullscreen");
  btnRespFullscreen.innerHTML = isFS ? "&#10529;" : "&#10530;";
  btnRespFullscreen.title = isFS
    ? "Exit fullscreen (Esc)"
    : "Fullscreen response";
}

btnRespFullscreen.addEventListener("click", toggleRespFullscreen);

// ══════════════════════════════════════════════
// ── SEARCH IN RESPONSE (Ctrl+F) ───────────────
// ══════════════════════════════════════════════

let _respSearchIdx = 0;
let _respOrigContent = { pretty: null, raw: null, headers: null };

function saveOrigResponseContent() {
  _respOrigContent.pretty = responsePretty.innerHTML;
  _respOrigContent.raw = responseRaw.innerHTML;
  _respOrigContent.headers = responseHeadersView.innerHTML;
}

function resetRespSearch() {
  if (respSearchBar) respSearchBar.classList.add("hidden");
  if (respSearchInput) respSearchInput.value = "";
  if (respSearchCount) respSearchCount.textContent = "";
  _respSearchIdx = 0;
  _respOrigContent = { pretty: null, raw: null, headers: null };
}

function _getActiveRespKey() {
  const active = document.querySelector(".resp-tab-content.active");
  if (!active) return null;
  if (active.id === "resp-tab-pretty") return "pretty";
  if (active.id === "resp-tab-raw") return "raw";
  if (active.id === "resp-tab-resp-headers") return "headers";
  return null;
}

function _getActiveRespEl() {
  const active = document.querySelector(".resp-tab-content.active");
  return active ? active.querySelector(".response-body") : null;
}

function _restoreOrigContent(key) {
  if (key === "pretty" && _respOrigContent.pretty !== null)
    responsePretty.innerHTML = _respOrigContent.pretty;
  if (key === "raw" && _respOrigContent.raw !== null)
    responseRaw.innerHTML = _respOrigContent.raw;
  if (key === "headers" && _respOrigContent.headers !== null)
    responseHeadersView.innerHTML = _respOrigContent.headers;
}

function highlightMatches(term) {
  const key = _getActiveRespKey();
  const el = _getActiveRespEl();
  if (!el || !key) return;

  _restoreOrigContent(key);
  _respSearchIdx = 0;

  if (!term) {
    respSearchCount.textContent = "";
    return;
  }

  // Collect all text nodes first, then process (avoids walker seeing new nodes)
  const walker = document.createTreeWalker(
    el,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  const lowerTerm = term.toLowerCase();
  const marks = [];

  textNodes.forEach((tn) => {
    const text = tn.nodeValue;
    const lowerText = text.toLowerCase();
    if (!lowerText.includes(lowerTerm)) return;

    const frag = document.createDocumentFragment();
    let last = 0;
    let pos;
    while ((pos = lowerText.indexOf(lowerTerm, last)) !== -1) {
      if (pos > last)
        frag.appendChild(document.createTextNode(text.slice(last, pos)));
      const mark = document.createElement("mark");
      mark.className = "resp-search-mark";
      mark.textContent = text.slice(pos, pos + term.length);
      frag.appendChild(mark);
      marks.push(mark);
      last = pos + term.length;
    }
    if (last < text.length)
      frag.appendChild(document.createTextNode(text.slice(last)));
    tn.parentNode.replaceChild(frag, tn);
  });

  if (!marks.length) {
    respSearchCount.textContent = "No matches";
    return;
  }

  _activateMark(marks, 0);
  respSearchCount.textContent = `1 / ${marks.length}`;
}

function _activateMark(marks, idx) {
  marks.forEach((m, i) => m.classList.toggle("active", i === idx));
  if (marks[idx])
    marks[idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function navSearch(dir) {
  const marks = [...document.querySelectorAll(".resp-search-mark")];
  if (!marks.length) return;
  _respSearchIdx = (_respSearchIdx + dir + marks.length) % marks.length;
  _activateMark(marks, _respSearchIdx);
  respSearchCount.textContent = `${_respSearchIdx + 1} / ${marks.length}`;
}

function openRespSearch() {
  if (!responseSection.classList.contains("visible")) return;
  respSearchBar.classList.remove("hidden");
  respSearchInput.focus();
  respSearchInput.select();
}

function closeRespSearch() {
  const key = _getActiveRespKey();
  if (key) _restoreOrigContent(key);
  respSearchBar.classList.add("hidden");
  respSearchInput.value = "";
  respSearchCount.textContent = "";
  _respSearchIdx = 0;
}

respSearchInput.addEventListener("input", () => {
  highlightMatches(respSearchInput.value.trim());
});

respSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    navSearch(e.shiftKey ? -1 : 1);
  }
  if (e.key === "Escape") {
    e.preventDefault();
    closeRespSearch();
  }
});

btnRespSearchPrev.addEventListener("click", () => navSearch(-1));
btnRespSearchNext.addEventListener("click", () => navSearch(1));
btnRespSearchClose.addEventListener("click", closeRespSearch);

// ── JSON SYNTAX HIGHLIGHT ─────────────────────
function syntaxHighlight(json) {
  // Escape HTML first
  json = escapeHtml(json);
  return json.replace(
    /("(\\u[\dA-Fa-f]{4}|\\[^u]|[^"\\])*"(\s*):?)|(\b(true|false|null)\b)|(-?\d+\.?\d*(?:[eE][+\-]?\d+)?)|([{}\[\],:])/g,
    (match) => {
      let cls = "";
      if (/^"/.test(match)) {
        cls = match.endsWith(":") ? "json-key" : "json-str";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      } else if (!isNaN(parseFloat(match))) {
        cls = "json-num";
      } else {
        cls = "json-punct";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// ── HELPERS ───────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeJson(str) {
  const t = str.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

function getStatusClass(status) {
  if (status >= 200 && status < 300) return "s2xx";
  if (status >= 300 && status < 400) return "s3xx";
  if (status >= 400 && status < 500) return "s4xx";
  if (status >= 500) return "s5xx";
  return "serr";
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function setLoading(on) {
  btnSend.disabled = on;
  btnCancel.classList.toggle("hidden", !on);
  loader.classList.toggle("hidden", !on);
  if (on) {
    placeholder.classList.add("hidden");
    updateStatusBar("loading");
  }
}

btnCancel.addEventListener("click", () => {
  if (abortController) abortController.abort();
});

// ── HISTORY ───────────────────────────────────
const MAX_HISTORY = 50;

function saveHistory(method, url, status) {
  chrome.storage.local.get({ history: [] }, (data) => {
    const entry = { method, url, status, ts: Date.now() };
    const history = [entry, ...data.history].slice(0, MAX_HISTORY);
    chrome.storage.local.set({ history }, loadHistory);
  });
}

function loadHistory() {
  chrome.storage.local.get({ history: [] }, (data) => {
    renderHistory(data.history);
  });
}

function renderHistory(history) {
  historyList.innerHTML = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.style.cssText =
      "padding:12px;text-align:center;color:var(--text-muted);font-size:12px;";
    li.textContent = "No history yet";
    historyList.appendChild(li);
    return;
  }
  history.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.method = item.method;
    const timeAgo = formatTimeAgo(item.ts);
    li.innerHTML = `
      <span class="hi-method">${escapeHtml(item.method)}</span>
      <span class="hi-url" title="${escapeAttr(item.url)}">${escapeHtml(item.url)}</span>
      <span class="hi-time">${timeAgo} · ${item.status || "—"}</span>
    `;
    li.addEventListener("click", () => {
      urlInput.value = item.url;
      methodSelect.value = item.method;
      updateMethodColour();
      historyPanel.classList.add("hidden");
    });
    historyList.appendChild(li);
  });
}

function formatTimeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return diff + "s ago";
  if (diff < 3600) return Math.round(diff / 60) + "m ago";
  if (diff < 86400) return Math.round(diff / 3600) + "h ago";
  return Math.round(diff / 86400) + "d ago";
}

btnClearHistory.addEventListener("click", () => {
  chrome.storage.local.set({ history: [] }, () => renderHistory([]));
});

btnHistoryToggle.addEventListener("click", () => {
  historyPanel.classList.toggle("hidden");
  if (!historyPanel.classList.contains("hidden")) {
    envPanel.classList.add("hidden");
    loadHistory();
  }
});

document.getElementById("btn-close-history").addEventListener("click", () => {
  historyPanel.classList.add("hidden");
});

// ── TOAST ─────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  // force reflow so transition fires
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 220);
  }, 2000);
}

// ── COPY RESPONSE ────────────────────────────
const btnCopy = document.getElementById("btn-copy-response");
btnCopy.addEventListener("click", () => {
  if (!lastRawText) return;
  // Try to prettify if JSON, otherwise copy raw
  let textToCopy = lastRawText;
  try {
    textToCopy = JSON.stringify(JSON.parse(lastRawText), null, 2);
  } catch {
    /* not JSON, keep raw */
  }

  navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
      btnCopy.classList.add("copied");
      showToast("\u2713 Copied to clipboard");
      setTimeout(() => btnCopy.classList.remove("copied"), 1500);
    })
    .catch(() => showToast("\u2717 Copy failed"));
});

// ── DOWNLOAD RESPONSE ────────────────────────
function downloadResponse(ext) {
  if (!lastRawText) return;
  let content = lastRawText;
  let mime = "text/plain";

  if (ext === "json") {
    try {
      content = JSON.stringify(JSON.parse(lastRawText), null, 2);
    } catch {
      /* keep raw if not valid JSON */
    }
    mime = "application/json";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `response.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`\u2193 Downloaded response.${ext}`);
}

document
  .getElementById("btn-download-json")
  .addEventListener("click", () => downloadResponse("json"));
document
  .getElementById("btn-download-txt")
  .addEventListener("click", () => downloadResponse("txt"));

// ── THEME TOGGLE ──────────────────────────────
function applyTheme(isLight) {
  document.body.classList.toggle("light", isLight);
  btnThemeToggle.innerHTML = isLight ? "&#9728;" : "&#9790;";
  btnThemeToggle.title = isLight
    ? "Switch to Dark Mode"
    : "Switch to Light Mode";
}

btnThemeToggle.addEventListener("click", () => {
  const isLight = !document.body.classList.contains("light");
  applyTheme(isLight);
  chrome.storage.local.set({ theme: isLight ? "light" : "dark" });
});

// ── KEYBOARD SHORTCUTS ────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    sendRequest();
  }
  if (e.ctrlKey && (e.key === "h" || e.key === "H")) {
    e.preventDefault();
    historyPanel.classList.toggle("hidden");
    if (!historyPanel.classList.contains("hidden")) {
      envPanel.classList.add("hidden");
      loadHistory();
    }
  }
  if (e.ctrlKey && (e.key === "t" || e.key === "T")) {
    e.preventDefault();
    addReqTab();
  }
  if (e.ctrlKey && (e.key === "e" || e.key === "E")) {
    e.preventDefault();
    const isEnvOpen = !envPanel.classList.contains("hidden");
    if (isEnvOpen) {
      envPanel.classList.add("hidden");
    } else {
      historyPanel.classList.add("hidden");
      envPanel.classList.remove("hidden");
    }
  }
  if (e.ctrlKey && (e.key === "f" || e.key === "F")) {
    if (responseSection.classList.contains("visible")) {
      e.preventDefault();
      openRespSearch();
    }
  }
  if (e.key === "Escape") {
    if (!respSearchBar.classList.contains("hidden")) {
      e.preventDefault();
      closeRespSearch();
    } else if (responseSection.classList.contains("resp-fullscreen")) {
      e.preventDefault();
      toggleRespFullscreen();
    }
  }
});

// ── STATUS BAR ────────────────────────────────
function updateStatusBar(state, data = {}) {
  const dot = document.getElementById("sb-dot");
  const text = document.getElementById("sb-text");
  if (!dot || !text) return;
  dot.className = "sb-dot sb-" + state;
  switch (state) {
    case "idle":
      text.textContent = "Ready";
      break;
    case "loading":
      text.textContent = "Sending\u2026";
      break;
    default:
      text.textContent = data.text || "Ready";
  }
  if (state !== "loading") {
    chrome.storage.local.set({ lastStatus: { state, data } });
  }
}

// ── RESIZE HANDLE ─────────────────────────────
const resizeHandle = document.getElementById("resize-handle");
let isResizing = false;
let resizeStartX, resizeStartY, resizeStartW, resizeStartH;

resizeHandle.addEventListener("pointerdown", (e) => {
  isResizing = true;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartW = document.documentElement.offsetWidth;
  resizeStartH = document.documentElement.offsetHeight;
  resizeHandle.setPointerCapture(e.pointerId);
  e.preventDefault();
});

resizeHandle.addEventListener("pointermove", (e) => {
  if (!isResizing) return;
  const newW = Math.max(500, resizeStartW + (e.clientX - resizeStartX));
  const newH = Math.max(380, resizeStartH + (e.clientY - resizeStartY));
  document.documentElement.style.width = newW + "px";
  document.documentElement.style.minHeight = newH + "px";
});

resizeHandle.addEventListener("pointerup", () => {
  if (!isResizing) return;
  isResizing = false;
  const w = document.documentElement.offsetWidth;
  const h = document.documentElement.offsetHeight;
  chrome.storage.local.set({ popupSize: { w, h } });
});

// ══════════════════════════════════════════════
// ── ENVIRONMENT VARIABLES ─────────────────────
// ══════════════════════════════════════════════

let _envSaveTimer = null;

function getEnvVars() {
  const vars = {};
  envTable.querySelectorAll(".kv-row").forEach((row) => {
    const [k, v] = row.querySelectorAll("input");
    const key = k.value.trim();
    const val = v.value;
    if (key) vars[key] = val;
  });
  return vars;
}

function resolveEnv(str) {
  if (!str || typeof str !== "string") return str;
  const vars = getEnvVars();
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

function addEnvRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "kv-row";
  row.innerHTML = `
    <input type="text" placeholder="variable_name" value="${escapeAttr(key)}" spellcheck="false" />
    <input type="text" placeholder="value" value="${escapeAttr(value)}" spellcheck="false" />
    <button class="btn-remove-row" title="Remove">✕</button>
  `;
  row.querySelector(".btn-remove-row").addEventListener("click", () => {
    row.remove();
    scheduleEnvSave();
  });
  row.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", scheduleEnvSave);
  });
  envTable.appendChild(row);
}

function scheduleEnvSave() {
  clearTimeout(_envSaveTimer);
  _envSaveTimer = setTimeout(saveEnvVars, 600);
}

function saveEnvVars() {
  chrome.storage.local.set({ envVars: getEnvVars() });
}

function loadEnvVars() {
  chrome.storage.local.get({ envVars: {} }, (data) => {
    envTable.querySelectorAll(".kv-row").forEach((r) => r.remove());
    const entries = Object.entries(data.envVars || {});
    if (entries.length) {
      entries.forEach(([k, v]) => addEnvRow(k, v));
    } else {
      addEnvRow();
    }
  });
}

btnEnvToggle.addEventListener("click", () => {
  const isOpen = !envPanel.classList.contains("hidden");
  if (isOpen) {
    envPanel.classList.add("hidden");
  } else {
    historyPanel.classList.add("hidden");
    envPanel.classList.remove("hidden");
  }
});

btnCloseEnv.addEventListener("click", () => {
  envPanel.classList.add("hidden");
});

btnAddEnvVar.addEventListener("click", () => {
  addEnvRow();
  const rows = envTable.querySelectorAll(".kv-row");
  if (rows.length) rows[rows.length - 1].querySelector("input").focus();
});

// Amber border on URL input when {{vars}} detected
urlInput.addEventListener("input", () => {
  urlInput.classList.toggle("url-has-vars", /\{\{/.test(urlInput.value));
});

// ══════════════════════════════════════════════
// ── REQUEST TABS ──────────────────────────────
// ══════════════════════════════════════════════

function createDefaultTab(id, name) {
  return {
    id,
    name,
    method: "GET",
    url: "",
    headers: { "Content-Type": "application/json" },
    params: {},
    bodyType: "none",
    body: "",
    formBody: {},
    multipartRows: [],
    authType: "none",
    bearerToken: "",
    apikeyName: "X-API-Key",
    apikeyValue: "",
    basicUser: "",
    basicPass: "",
  };
}

function snapshotTab() {
  if (!activeTabId) return;
  const tab = reqTabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  tab.method = methodSelect.value;
  tab.url = urlInput.value;
  tab.headers = collectKvRows(headersTable);
  tab.params = collectKvRows(paramsTable);
  tab.bodyType = document.querySelector(
    'input[name="body-type"]:checked',
  ).value;
  tab.body = bodyEditor.value;
  tab.formBody = collectKvRows(formEditor);
  tab.multipartRows = collectMultipartSnapshot();
  tab.authType = document.querySelector(
    'input[name="auth-type"]:checked',
  ).value;
  tab.bearerToken = bearerTokenInput.value;
  tab.apikeyName = apikeyNameInput.value;
  tab.apikeyValue = apikeyValueInput.value;
  tab.basicUser = basicUserInput.value;
  tab.basicPass = basicPassInput.value;
}

function restoreTab(tab) {
  // Method + URL
  methodSelect.value = tab.method || "GET";
  updateMethodColour();
  urlInput.value = tab.url || "";

  // Headers
  headersTable.querySelectorAll(".kv-row").forEach((r) => r.remove());
  const hdrs = tab.headers || {};
  if (Object.keys(hdrs).length) {
    Object.entries(hdrs).forEach(([k, v]) => addKvRow(headersTable, k, v));
  } else {
    addKvRow(headersTable, "Content-Type", "application/json");
  }

  // Params
  paramsTable.querySelectorAll(".kv-row").forEach((r) => r.remove());
  const prms = tab.params || {};
  if (Object.keys(prms).length) {
    Object.entries(prms).forEach(([k, v]) => addKvRow(paramsTable, k, v));
  } else {
    addKvRow(paramsTable);
  }

  // Body
  const bodyType = tab.bodyType || "none";
  document.querySelector(
    `input[name="body-type"][value="${bodyType}"]`,
  ).checked = true;
  bodyEditor.value = tab.body || "";
  bodyEditor.classList.toggle("hidden", bodyType !== "json");
  formEditor.querySelectorAll(".kv-row").forEach((r) => r.remove());
  const fb = tab.formBody || {};
  if (Object.keys(fb).length) {
    Object.entries(fb).forEach(([k, v]) => addKvRow(formEditor, k, v));
  } else {
    addKvRow(formEditor);
  }
  formEditor.classList.toggle("hidden", bodyType !== "form");
  btnAddFormRow.classList.toggle("hidden", bodyType !== "form");

  // Multipart
  multipartEditor.querySelectorAll(".mp-row").forEach((r) => r.remove());
  const mpRows = tab.multipartRows || [];
  if (mpRows.length) {
    mpRows.forEach((r) => addMultipartRow(r.name, r.type, r.value));
  } else if (bodyType === "multipart") {
    addMultipartRow();
  }
  multipartEditor.classList.toggle("hidden", bodyType !== "multipart");
  btnAddMultipartRow.classList.toggle("hidden", bodyType !== "multipart");

  // Auth
  const authType = tab.authType || "none";
  document.querySelector(
    `input[name="auth-type"][value="${authType}"]`,
  ).checked = true;
  showAuthFields(authType);
  bearerTokenInput.value = tab.bearerToken || "";
  apikeyNameInput.value = tab.apikeyName || "X-API-Key";
  apikeyValueInput.value = tab.apikeyValue || "";
  basicUserInput.value = tab.basicUser || "";
  basicPassInput.value = tab.basicPass || "";

  // Reset response area for this tab
  responseSection.classList.remove("visible");
  placeholder.classList.remove("hidden");
}

function renderReqTabBar() {
  const bar = document.getElementById("req-tab-bar");
  if (!bar) return;
  bar.innerHTML = "";

  reqTabs.forEach((tab) => {
    const div = document.createElement("div");
    div.className = "req-tab" + (tab.id === activeTabId ? " active" : "");
    div.dataset.id = tab.id;
    div.innerHTML = `
      <span class="req-tab-label">${escapeHtml(tab.name)}</span>
      ${reqTabs.length > 1 ? '<button class="req-tab-close" title="Close tab">&#10005;</button>' : ""}
    `;
    div.addEventListener("click", (e) => {
      if (e.target.closest(".req-tab-close")) {
        e.stopPropagation();
        closeReqTab(tab.id);
        return;
      }
      if (tab.id !== activeTabId) switchReqTab(tab.id);
    });
    bar.appendChild(div);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "btn-add-req-tab";
  addBtn.title = "New request tab (Ctrl+T)";
  addBtn.textContent = "+";
  addBtn.addEventListener("click", addReqTab);
  bar.appendChild(addBtn);
}

function addReqTab() {
  snapshotTab();
  const id = Date.now();
  const name = "Tab " + (reqTabs.length + 1);
  const tab = createDefaultTab(id, name);
  reqTabs.push(tab);
  activeTabId = id;
  restoreTab(tab);
  renderReqTabBar();
  saveReqTabs();
}

function closeReqTab(id) {
  if (reqTabs.length <= 1) return;
  const idx = reqTabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  reqTabs.splice(idx, 1);
  if (activeTabId === id) {
    const newIdx = Math.min(idx, reqTabs.length - 1);
    activeTabId = reqTabs[newIdx].id;
    restoreTab(reqTabs[newIdx]);
  }
  renderReqTabBar();
  saveReqTabs();
}

function switchReqTab(id) {
  if (id === activeTabId) return;
  snapshotTab();
  saveReqTabs();
  activeTabId = id;
  const tab = reqTabs.find((t) => t.id === id);
  if (tab) restoreTab(tab);
  renderReqTabBar();
}

function saveReqTabs() {
  chrome.storage.local.set({ reqTabs, activeTabId });
}

// ══════════════════════════════════════════════
// ── SAVED COLLECTIONS ─────────────────────────
// ══════════════════════════════════════════════

const collectionsPanel = document.getElementById("collections-panel");
const btnCollectionsToggle = document.getElementById("btn-collections-toggle");
const btnCloseCollections = document.getElementById("btn-close-collections");
const colList = document.getElementById("col-list");
const colSearch = document.getElementById("col-search");

// Modal elements
const colModalOverlay = document.getElementById("col-modal-overlay");
const btnSaveCol = document.getElementById("btn-save-collection");
const btnColModalClose = document.getElementById("btn-col-modal-close");
const btnColModalCancel = document.getElementById("btn-col-modal-cancel");
const btnColModalSave = document.getElementById("btn-col-modal-save");
const colNameInput = document.getElementById("col-name-input");
const colFolderInput = document.getElementById("col-folder-input");
const colModalPreview = document.getElementById("col-modal-preview");

// ── Open / Close panel ────────────────────────
btnCollectionsToggle.addEventListener("click", () => {
  collectionsPanel.classList.toggle("hidden");
  if (!collectionsPanel.classList.contains("hidden")) {
    loadCollections();
    colSearch.value = "";
  }
});

btnCloseCollections.addEventListener("click", () => {
  collectionsPanel.classList.add("hidden");
});

// ── Open Save Modal ───────────────────────────
btnSaveCol.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    urlInput.style.borderColor = "var(--danger)";
    setTimeout(() => (urlInput.style.borderColor = ""), 1200);
    return;
  }
  colNameInput.value = "";
  colFolderInput.value = "";
  colModalPreview.textContent = `${methodSelect.value}  ${url}`;
  colModalOverlay.classList.remove("hidden");
  setTimeout(() => colNameInput.focus(), 60);
});

function closeModal() {
  colModalOverlay.classList.add("hidden");
}

btnColModalClose.addEventListener("click", closeModal);
btnColModalCancel.addEventListener("click", closeModal);
colModalOverlay.addEventListener("click", (e) => {
  if (e.target === colModalOverlay) closeModal();
});

// Allow Enter key to save from modal inputs
[colNameInput, colFolderInput].forEach((inp) => {
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnColModalSave.click();
  });
});

// ── SAVE ─────────────────────────────────────
btnColModalSave.addEventListener("click", () => {
  const name = colNameInput.value.trim();
  if (!name) {
    colNameInput.style.borderColor = "var(--danger)";
    setTimeout(() => (colNameInput.style.borderColor = ""), 1200);
    colNameInput.focus();
    return;
  }

  const folder = colFolderInput.value.trim() || "General";

  // Snapshot current request state
  const entry = {
    id: Date.now(),
    name,
    folder,
    method: methodSelect.value,
    url: urlInput.value.trim(),
    headers: collectKvRows(headersTable),
    params: collectKvRows(paramsTable),
    bodyType: document.querySelector('input[name="body-type"]:checked').value,
    body: bodyEditor.value,
    formBody: collectKvRows(formEditor),
    authType: document.querySelector('input[name="auth-type"]:checked').value,
    bearerToken: bearerTokenInput.value,
    apikeyName: apikeyNameInput.value,
    apikeyValue: apikeyValueInput.value,
    basicUser: basicUserInput.value,
    basicPass: basicPassInput.value,
  };

  chrome.storage.local.get({ collections: [] }, (data) => {
    const collections = [entry, ...data.collections];
    chrome.storage.local.set({ collections }, () => {
      closeModal();
      btnSaveCol.classList.add("saved");
      setTimeout(() => btnSaveCol.classList.remove("saved"), 1500);
      showToast(`\u2713 Saved "${name}" to ${folder}`);
      if (!collectionsPanel.classList.contains("hidden")) {
        loadCollections();
      }
    });
  });
});

// ── LOAD & RENDER ─────────────────────────────
function loadCollections(filter = "") {
  chrome.storage.local.get({ collections: [] }, (data) => {
    renderCollections(data.collections, filter);
  });
}

function renderCollections(collections, filter = "") {
  colList.innerHTML = "";
  const q = filter.toLowerCase();

  // Filter
  const filtered = q
    ? collections.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.url.toLowerCase().includes(q) ||
          (c.folder || "General").toLowerCase().includes(q),
      )
    : collections;

  if (!filtered.length) {
    colList.innerHTML = `<li class="col-empty">
      ${
        filter
          ? `No results for <strong>"${escapeHtml(filter)}"</strong>`
          : `No saved collections yet.<br>Click <strong>☆</strong> next to the URL bar to save a request.`
      }
    </li>`;
    return;
  }

  // Preserve folder order from the full array, then group filtered items
  const seenFolders = [];
  collections.forEach((c) => {
    const f = c.folder || "General";
    if (!seenFolders.includes(f)) seenFolders.push(f);
  });

  const groups = {};
  filtered.forEach((c) => {
    const f = c.folder || "General";
    if (!groups[f]) groups[f] = [];
    groups[f].push(c);
  });

  seenFolders
    .filter((f) => groups[f])
    .forEach((folder) => {
      const items = groups[folder];

      // Folder header
      const li = document.createElement("li");
      li.className = "col-folder-label";
      li.dataset.folder = folder;
      if (!q) li.draggable = true;
      li.innerHTML = `
      <span class="col-arrow">&#9660;</span>
      <span class="col-folder-name">${escapeHtml(folder)}</span>
      <button class="col-folder-rename-btn" title="Rename folder">&#9998;</button>
      <span class="col-folder-count">${items.length}</span>
    `;

      li.addEventListener("click", (e) => {
        if (e.target.closest(".col-folder-rename-btn")) return;
        if (li.querySelector(".col-folder-rename-input")) return;
        toggleFolder(folder, li);
      });
      li.querySelector(".col-folder-rename-btn").addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          startFolderRename(folder, li);
        },
      );
      li.addEventListener("dblclick", (e) => {
        if (e.target.closest(".col-folder-rename-btn")) return;
        startFolderRename(folder, li);
      });

      if (!q) setupFolderDrag(li, folder);
      colList.appendChild(li);

      // Items in folder
      items.forEach((col) => {
        const il = document.createElement("li");
        il.className = "col-item";
        il.dataset.method = col.method;
        il.dataset.folder = folder;
        il.dataset.id = col.id;
        if (!q) il.draggable = true;
        il.innerHTML = `
        <span class="col-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>
        <span class="col-item-method">${escapeHtml(col.method)}</span>
        <span class="col-item-info">
          <span class="col-item-name" title="${escapeAttr(col.name)}">${escapeHtml(col.name)}</span>
          <span class="col-item-url"  title="${escapeAttr(col.url)}">${escapeHtml(col.url)}</span>
        </span>
        <button class="col-item-del" title="Delete">&#128465;</button>
      `;

        il.addEventListener("click", (e) => {
          if (e.target.closest(".col-item-del")) return;
          if (e.target.closest(".col-drag-handle")) return;
          loadCollectionEntry(col);
          collectionsPanel.classList.add("hidden");
          showToast(`\u21e9 Loaded "${col.name}"`);
        });
        il.querySelector(".col-item-del").addEventListener("click", (e) => {
          e.stopPropagation();
          deleteCollectionEntry(col.id);
        });

        if (!q) setupItemDrag(il, col);
        colList.appendChild(il);
      });
    });
}

// ── Toggle folder collapse ────────────────────
function toggleFolder(folder, labelEl) {
  labelEl.classList.toggle("collapsed");
  const isCollapsed = labelEl.classList.contains("collapsed");
  colList
    .querySelectorAll(`.col-item[data-folder="${CSS.escape(folder)}"]`)
    .forEach((el) => {
      el.classList.toggle("col-group-hidden", isCollapsed);
    });
}

// ── Load entry into form fields ───────────────
function loadCollectionEntry(col) {
  // Method + URL
  methodSelect.value = col.method;
  updateMethodColour();
  urlInput.value = col.url;

  // Headers
  headersTable.querySelectorAll(".kv-row").forEach((r) => r.remove());
  Object.entries(col.headers || {}).forEach(([k, v]) =>
    addKvRow(headersTable, k, v),
  );
  if (!Object.keys(col.headers || {}).length) addKvRow(headersTable);

  // Params
  paramsTable.querySelectorAll(".kv-row").forEach((r) => r.remove());
  Object.entries(col.params || {}).forEach(([k, v]) =>
    addKvRow(paramsTable, k, v),
  );
  if (!Object.keys(col.params || {}).length) addKvRow(paramsTable);

  // Body
  const bodyType = col.bodyType || "none";
  document.querySelector(
    `input[name="body-type"][value="${bodyType}"]`,
  ).checked = true;
  bodyEditor.value = col.body || "";
  bodyEditor.classList.toggle("hidden", bodyType !== "json");

  formEditor.querySelectorAll(".kv-row").forEach((r) => r.remove());
  Object.entries(col.formBody || {}).forEach(([k, v]) =>
    addKvRow(formEditor, k, v),
  );
  if (!Object.keys(col.formBody || {}).length) addKvRow(formEditor);
  formEditor.classList.toggle("hidden", bodyType !== "form");
  document
    .getElementById("btn-add-form-row")
    .classList.toggle("hidden", bodyType !== "form");

  // Auth
  const authType = col.authType || "none";
  document.querySelector(
    `input[name="auth-type"][value="${authType}"]`,
  ).checked = true;
  showAuthFields(authType);
  bearerTokenInput.value = col.bearerToken || "";
  apikeyNameInput.value = col.apikeyName || "X-API-Key";
  apikeyValueInput.value = col.apikeyValue || "";
  basicUserInput.value = col.basicUser || "";
  basicPassInput.value = col.basicPass || "";

  // Switch to headers tab so user sees the loaded state
  tabBtns.forEach((b) => b.classList.remove("active"));
  tabContents.forEach((c) => c.classList.remove("active"));
  document
    .querySelector('.tab-btn[data-tab="headers"]')
    .classList.add("active");
  document.getElementById("tab-headers").classList.add("active");

  // Sync current tab slot with newly loaded request
  snapshotTab();
  saveReqTabs();
}

// ── Delete an entry ───────────────────────────
function deleteCollectionEntry(id) {
  chrome.storage.local.get({ collections: [] }, (data) => {
    const updated = data.collections.filter((c) => c.id !== id);
    chrome.storage.local.set({ collections: updated }, () => {
      renderCollections(updated, colSearch.value);
      showToast("🗑 Collection deleted");
    });
  });
}

// ── Folder rename ─────────────────────────────
function startFolderRename(folderName, labelEl) {
  if (labelEl.querySelector(".col-folder-rename-input")) return;
  const nameSpan = labelEl.querySelector(".col-folder-name");
  if (!nameSpan) return;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "col-folder-rename-input";
  input.value = folderName;
  input.spellcheck = false;
  labelEl.draggable = false;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    if (newName && newName !== folderName) {
      commitFolderRename(folderName, newName);
    } else {
      input.replaceWith(nameSpan);
      labelEl.draggable = true;
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      committed = true;
      input.replaceWith(nameSpan);
      labelEl.draggable = true;
    }
  });
  input.addEventListener("blur", commit);
}

function commitFolderRename(oldName, newName) {
  chrome.storage.local.get({ collections: [] }, (data) => {
    const updated = data.collections.map((c) =>
      (c.folder || "General") === oldName ? { ...c, folder: newName } : c,
    );
    chrome.storage.local.set({ collections: updated }, () => {
      renderCollections(updated, colSearch.value);
      showToast(
        `\u270e Renamed \u201c${oldName}\u201d \u2192 \u201c${newName}\u201d`,
      );
    });
  });
}

// ── Drag-to-reorder ───────────────────────────
let _dragSrc = null; // { type: 'folder'|'item', folder, id? }

function clearDragIndicators() {
  colList
    .querySelectorAll(".drag-over-top, .drag-over-bottom")
    .forEach((el) => el.classList.remove("drag-over-top", "drag-over-bottom"));
}

function setupItemDrag(el, col) {
  el.addEventListener("dragstart", (e) => {
    _dragSrc = { type: "item", folder: col.folder || "General", id: col.id };
    el.classList.add("col-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", col.id);
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("col-dragging");
    clearDragIndicators();
    _dragSrc = null;
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!_dragSrc) return;
    e.dataTransfer.dropEffect = "move";
    clearDragIndicators();
    const r = el.getBoundingClientRect();
    el.classList.add(
      e.clientY < r.top + r.height / 2 ? "drag-over-top" : "drag-over-bottom",
    );
  });
  el.addEventListener("dragleave", (e) => {
    if (!el.contains(e.relatedTarget))
      el.classList.remove("drag-over-top", "drag-over-bottom");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!_dragSrc) return;
    const r = el.getBoundingClientRect();
    handleDrop(
      { type: "item", folder: el.dataset.folder, id: el.dataset.id },
      e.clientY < r.top + r.height / 2,
    );
    clearDragIndicators();
  });
}

function setupFolderDrag(el, folder) {
  el.addEventListener("dragstart", (e) => {
    if (el.querySelector(".col-folder-rename-input")) {
      e.preventDefault();
      return;
    }
    _dragSrc = { type: "folder", folder };
    el.classList.add("col-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", folder);
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("col-dragging");
    clearDragIndicators();
    _dragSrc = null;
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!_dragSrc) return;
    e.dataTransfer.dropEffect = "move";
    clearDragIndicators();
    const r = el.getBoundingClientRect();
    el.classList.add(
      e.clientY < r.top + r.height / 2 ? "drag-over-top" : "drag-over-bottom",
    );
  });
  el.addEventListener("dragleave", (e) => {
    if (!el.contains(e.relatedTarget))
      el.classList.remove("drag-over-top", "drag-over-bottom");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!_dragSrc) return;
    const r = el.getBoundingClientRect();
    handleDrop(
      { type: "folder", folder: el.dataset.folder },
      e.clientY < r.top + r.height / 2,
    );
    clearDragIndicators();
  });
}

function handleDrop(target, before) {
  if (!_dragSrc) return;
  chrome.storage.local.get({ collections: [] }, (data) => {
    let cols = [...data.collections];

    if (_dragSrc.type === "item") {
      const srcIdx = cols.findIndex((c) => c.id === _dragSrc.id);
      if (srcIdx === -1) return;
      const [srcItem] = cols.splice(srcIdx, 1);

      if (target.type === "item") {
        if (target.id === _dragSrc.id) {
          cols.splice(srcIdx, 0, srcItem);
          return;
        }
        srcItem.folder = target.folder;
        const tgtIdx = cols.findIndex((c) => c.id === target.id);
        cols.splice(
          tgtIdx === -1 ? cols.length : before ? tgtIdx : tgtIdx + 1,
          0,
          srcItem,
        );
      } else {
        // Dropped onto a folder label — append to end of that folder
        srcItem.folder = target.folder;
        let lastIdx = -1;
        cols.forEach((c, i) => {
          if ((c.folder || "General") === target.folder) lastIdx = i;
        });
        cols.splice(lastIdx + 1, 0, srcItem);
      }
    } else {
      // Drag folder — reorder folder groups
      if (target.folder === _dragSrc.folder) return;
      const folderOrder = [];
      cols.forEach((c) => {
        const f = c.folder || "General";
        if (!folderOrder.includes(f)) folderOrder.push(f);
      });
      const srcFolderIdx = folderOrder.indexOf(_dragSrc.folder);
      if (srcFolderIdx === -1) return;
      folderOrder.splice(srcFolderIdx, 1);
      const tgtFolderIdx = folderOrder.indexOf(target.folder);
      folderOrder.splice(
        tgtFolderIdx === -1
          ? folderOrder.length
          : before
            ? tgtFolderIdx
            : tgtFolderIdx + 1,
        0,
        _dragSrc.folder,
      );
      const grouped = {};
      cols.forEach((c) => {
        const f = c.folder || "General";
        if (!grouped[f]) grouped[f] = [];
        grouped[f].push(c);
      });
      cols = [];
      folderOrder.forEach((f) => cols.push(...(grouped[f] || [])));
    }

    chrome.storage.local.set({ collections: cols }, () => {
      renderCollections(cols, colSearch.value);
    });
  });
}

// ── Search ────────────────────────────────────
colSearch.addEventListener("input", () => {
  loadCollections(colSearch.value);
});

// ══════════════════════════════════════════════
// ── EXPORT / IMPORT COLLECTIONS ───────────────
// ══════════════════════════════════════════════

const importFileInput = document.getElementById("import-file-input");
const importModalOverlay = document.getElementById("import-modal-overlay");
const importModalInfo = document.getElementById("import-modal-info");
const btnImportModalClose = document.getElementById("btn-import-modal-close");
const btnImportModalCancel = document.getElementById("btn-import-modal-cancel");
const btnImportModalConfirm = document.getElementById(
  "btn-import-modal-confirm",
);

let _pendingImport = null; // { entries[], sourceFormat }

// ── EXPORT ────────────────────────────────────
document
  .getElementById("btn-export-collections")
  .addEventListener("click", () => {
    chrome.storage.local.get({ collections: [] }, (data) => {
      if (!data.collections.length) {
        showToast("⚠ No collections to export");
        return;
      }
      const payload = {
        _type: "api_tester_collections",
        version: 1,
        exportedAt: new Date().toISOString(),
        collections: data.collections,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `api-tester-collections-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`↓ Exported ${data.collections.length} requests`);
    });
  });

// ── IMPORT — click triggers file picker ───────
document
  .getElementById("btn-import-collections")
  .addEventListener("click", () => {
    importFileInput.value = "";
    importFileInput.click();
  });

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    let parsed;
    try {
      parsed = JSON.parse(ev.target.result);
    } catch {
      showToast("✗ Invalid JSON file");
      return;
    }
    const result = detectAndConvert(parsed);
    if (!result) {
      showToast("✗ Unrecognised format");
      return;
    }
    _pendingImport = result;
    showImportModal(result);
  };
  reader.readAsText(file);
});

function showImportModal({ entries, sourceFormat }) {
  importModalInfo.innerHTML =
    `<strong>${entries.length}</strong> request${entries.length !== 1 ? "s" : ""} detected ` +
    `from <strong>${escapeHtml(sourceFormat)}</strong> format.`;
  importModalOverlay.classList.remove("hidden");
}

function closeImportModal() {
  importModalOverlay.classList.add("hidden");
  _pendingImport = null;
}

btnImportModalClose.addEventListener("click", closeImportModal);
btnImportModalCancel.addEventListener("click", closeImportModal);
importModalOverlay.addEventListener("click", (e) => {
  if (e.target === importModalOverlay) closeImportModal();
});

btnImportModalConfirm.addEventListener("click", () => {
  if (!_pendingImport) return;
  const mode = document.querySelector(
    'input[name="import-mode"]:checked',
  ).value;
  const { entries } = _pendingImport;
  chrome.storage.local.get({ collections: [] }, (data) => {
    const existing = mode === "replace" ? [] : data.collections;
    // Avoid duplicate IDs on merge
    const existingIds = new Set(existing.map((c) => c.id));
    const deduped = entries.map((e) => {
      if (existingIds.has(e.id))
        return { ...e, id: Date.now() + Math.random() };
      return e;
    });
    const merged = [...deduped, ...existing];
    chrome.storage.local.set({ collections: merged }, () => {
      closeImportModal();
      loadCollections();
      showToast(`✓ Imported ${entries.length} requests`);
    });
  });
});

// ── FORMAT DETECTION & CONVERSION ────────────
function detectAndConvert(parsed) {
  // Native format
  if (
    parsed._type === "api_tester_collections" &&
    Array.isArray(parsed.collections)
  ) {
    return { entries: parsed.collections, sourceFormat: "API Tester" };
  }

  // Postman Collection v2 / v2.1
  if (parsed.info && parsed.item && Array.isArray(parsed.item)) {
    const entries = flattenPostmanItems(
      parsed.item,
      parsed.info.name || "Postman",
    );
    return { entries, sourceFormat: "Postman v2" };
  }

  // Insomnia v4 export
  if (parsed._type === "export" && Array.isArray(parsed.resources)) {
    const entries = convertInsomnia(parsed.resources);
    return { entries, sourceFormat: "Insomnia" };
  }

  // Simple array of our native entries
  if (Array.isArray(parsed) && parsed.length && parsed[0].url !== undefined) {
    return { entries: parsed, sourceFormat: "API Tester (array)" };
  }

  return null;
}

// ── Postman v2.1 flattening ───────────────────
function flattenPostmanItems(items, folderName) {
  const entries = [];
  items.forEach((item) => {
    // Folder (has sub-items)
    if (Array.isArray(item.item)) {
      entries.push(...flattenPostmanItems(item.item, item.name || folderName));
      return;
    }
    if (!item.request) return;
    const req = item.request;
    const method = (
      typeof req.method === "string" ? req.method : "GET"
    ).toUpperCase();

    // URL
    let url = "";
    if (typeof req.url === "string") {
      url = req.url;
    } else if (req.url && typeof req.url.raw === "string") {
      url = req.url.raw;
    }

    // Headers
    const headers = {};
    if (Array.isArray(req.header)) {
      req.header.forEach((h) => {
        if (h.key && !h.disabled) headers[h.key] = h.value || "";
      });
    }

    // Query params
    const params = {};
    const urlRaw = req.url;
    if (urlRaw && Array.isArray(urlRaw.query)) {
      urlRaw.query.forEach((q) => {
        if (q.key && !q.disabled) params[q.key] = q.value || "";
      });
    }

    // Body
    let bodyType = "none";
    let body = "";
    let formBody = {};
    if (req.body) {
      const mode = req.body.mode;
      if (mode === "raw") {
        bodyType = "json";
        body = req.body.raw || "";
      } else if (mode === "urlencoded" && Array.isArray(req.body.urlencoded)) {
        bodyType = "form";
        req.body.urlencoded.forEach((f) => {
          if (f.key && !f.disabled) formBody[f.key] = f.value || "";
        });
      }
    }

    // Auth
    let authType = "none";
    let bearerToken = "";
    let apikeyName = "X-API-Key";
    let apikeyValue = "";
    let basicUser = "";
    let basicPass = "";
    if (req.auth) {
      const a = req.auth;
      if (a.type === "bearer" && Array.isArray(a.bearer)) {
        authType = "bearer";
        const t = a.bearer.find((x) => x.key === "token");
        bearerToken = t ? t.value : "";
      } else if (a.type === "apikey" && Array.isArray(a.apikey)) {
        authType = "apikey";
        const k = a.apikey.find((x) => x.key === "key");
        const v = a.apikey.find((x) => x.key === "value");
        apikeyName = k ? k.value : "X-API-Key";
        apikeyValue = v ? v.value : "";
      } else if (a.type === "basic" && Array.isArray(a.basic)) {
        authType = "basic";
        const u = a.basic.find((x) => x.key === "username");
        const p = a.basic.find((x) => x.key === "password");
        basicUser = u ? u.value : "";
        basicPass = p ? p.value : "";
      }
    }

    entries.push({
      id: Date.now() + Math.random(),
      name: item.name || url,
      folder: folderName,
      method,
      url,
      headers,
      params,
      bodyType,
      body,
      formBody,
      multipartRows: [],
      authType,
      bearerToken,
      apikeyName,
      apikeyValue,
      basicUser,
      basicPass,
    });
  });
  return entries;
}

// ── Insomnia v4 conversion ────────────────────
function convertInsomnia(resources) {
  // Build workspace/folder name map
  const nameMap = {};
  resources.forEach((r) => {
    if (r._type === "workspace" || r._type === "request_group") {
      nameMap[r._id] = r.name || "General";
    }
  });

  return resources
    .filter((r) => r._type === "request")
    .map((r) => {
      const method = (r.method || "GET").toUpperCase();
      const url = r.url || "";
      const folder = nameMap[r.parentId] || "General";

      const headers = {};
      if (Array.isArray(r.headers)) {
        r.headers.forEach((h) => {
          if (h.name && !h.disabled) headers[h.name] = h.value || "";
        });
      }

      const params = {};
      if (Array.isArray(r.parameters)) {
        r.parameters.forEach((p) => {
          if (p.name && !p.disabled) params[p.name] = p.value || "";
        });
      }

      let bodyType = "none";
      let body = "";
      let formBody = {};
      if (r.body) {
        const mime = r.body.mimeType || "";
        if (mime.includes("json") || mime === "text/plain") {
          bodyType = "json";
          body = r.body.text || "";
        } else if (
          mime.includes("urlencoded") &&
          Array.isArray(r.body.params)
        ) {
          bodyType = "form";
          r.body.params.forEach((p) => {
            if (p.name && !p.disabled) formBody[p.name] = p.value || "";
          });
        }
      }

      let authType = "none";
      let bearerToken = "";
      let basicUser = "";
      let basicPass = "";
      if (r.authentication) {
        const a = r.authentication;
        if (a.type === "bearer") {
          authType = "bearer";
          bearerToken = a.token || "";
        } else if (a.type === "basic") {
          authType = "basic";
          basicUser = a.username || "";
          basicPass = a.password || "";
        }
      }

      return {
        id: Date.now() + Math.random(),
        name: r.name || url,
        folder,
        method,
        url,
        headers,
        params,
        bodyType,
        body,
        formBody,
        multipartRows: [],
        authType,
        bearerToken,
        apikeyName: "X-API-Key",
        apikeyValue: "",
        basicUser,
        basicPass,
      };
    });
}

// ── Keyboard shortcut Ctrl+K for collections ─
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    collectionsPanel.classList.toggle("hidden");
    if (!collectionsPanel.classList.contains("hidden")) {
      loadCollections();
      colSearch.value = "";
      setTimeout(() => colSearch.focus(), 60);
    }
  }
});

// Update keyboard hint in status bar
(function updateKbHint() {
  const sbShortcuts = document.querySelector(".sb-shortcuts");
  if (sbShortcuts) {
    sbShortcuts.textContent =
      "Ctrl+Enter: Send · Ctrl+H: History · Ctrl+K: Collections · Ctrl+F: Search";
  }
})();

// ══════════════════════════════════════════════
// ── CORS CHECK ────────────────────────────────
// ══════════════════════════════════════════════

btnCorsCheck.addEventListener("click", () => {
  const isOpen = !corsPanel.classList.contains("hidden");
  if (isOpen) {
    corsPanel.classList.add("hidden");
    corsResult.classList.add("hidden");
    corsResult.innerHTML = "";
    btnCorsCheck.classList.remove("active");
  } else {
    corsPanel.classList.remove("hidden");
    btnCorsCheck.classList.add("active");
    corsOriginInput.focus();
  }
});

btnCorsClose.addEventListener("click", () => {
  corsPanel.classList.add("hidden");
  corsResult.classList.add("hidden");
  corsResult.innerHTML = "";
  btnCorsCheck.classList.remove("active");
});

btnCorsRun.addEventListener("click", runCorsCheck);
corsOriginInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runCorsCheck();
});

async function runCorsCheck() {
  const rawUrl = resolveEnv(urlInput.value.trim());
  if (!rawUrl) {
    urlInput.focus();
    urlInput.style.borderColor = "var(--danger)";
    setTimeout(() => (urlInput.style.borderColor = ""), 1200);
    return;
  }

  const origin = corsOriginInput.value.trim() || "http://localhost:3000";

  corsResult.innerHTML =
    '<div class="cors-loading"><div class="spinner"></div><span>Checking CORS headers…</span></div>';
  corsResult.classList.remove("hidden");

  btnCorsRun.disabled = true;

  let optionsResult = null;
  let getResult = null;

  // OPTIONS preflight — most reliable source of CORS headers
  try {
    const res = await fetch(rawUrl, { method: "OPTIONS" });
    optionsResult = { status: res.status, headers: {} };
    res.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith("access-control-")) {
        optionsResult.headers[k.toLowerCase()] = v;
      }
    });
  } catch (e) {
    optionsResult = { error: String(e.message || e) };
  }

  // GET request — many servers attach CORS headers on every response
  try {
    const res = await fetch(rawUrl, { method: "GET" });
    getResult = { status: res.status, headers: {} };
    res.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith("access-control-")) {
        getResult.headers[k.toLowerCase()] = v;
      }
    });
  } catch (e) {
    getResult = { error: String(e.message || e) };
  }

  btnCorsRun.disabled = false;

  // Merge: GET headers first, OPTIONS headers win on conflict
  const merged = {};
  if (getResult && !getResult.error) Object.assign(merged, getResult.headers);
  if (optionsResult && !optionsResult.error)
    Object.assign(merged, optionsResult.headers);

  renderCorsResult(origin, merged, optionsResult, getResult);
}

function renderCorsResult(origin, headers, optionsResult, getResult) {
  const allowOrigin = headers["access-control-allow-origin"] || null;
  const allowMethods = headers["access-control-allow-methods"] || null;
  const allowHeaders = headers["access-control-allow-headers"] || null;
  const allowCredentials = headers["access-control-allow-credentials"] || null;
  const maxAge = headers["access-control-max-age"] || null;
  const exposeHeaders = headers["access-control-expose-headers"] || null;

  const hasCors = !!allowOrigin;
  const isWildcard = allowOrigin === "*";
  const credentialsMismatch = allowCredentials === "true" && isWildcard;
  const originAllowed =
    isWildcard ||
    (allowOrigin
      ? allowOrigin
          .split(",")
          .map((s) => s.trim())
          .some((o) => o === origin)
      : false);

  let statusClass, statusIcon, statusText;
  if (!hasCors) {
    statusClass = "cors-fail";
    statusIcon = "✗";
    statusText = "CORS Not Configured";
  } else if (credentialsMismatch) {
    statusClass = "cors-warn";
    statusIcon = "⚠";
    statusText = "Invalid CORS Config";
  } else if (originAllowed) {
    statusClass = "cors-ok";
    statusIcon = "✓";
    statusText = "CORS Enabled";
  } else {
    statusClass = "cors-warn";
    statusIcon = "⚠";
    statusText = "Origin Not Whitelisted";
  }

  const corsHeaderRows = [
    ["Access-Control-Allow-Origin", allowOrigin],
    ["Access-Control-Allow-Methods", allowMethods],
    ["Access-Control-Allow-Headers", allowHeaders],
    ["Access-Control-Allow-Credentials", allowCredentials],
    ["Access-Control-Max-Age", maxAge],
    ["Access-Control-Expose-Headers", exposeHeaders],
  ];

  const tableRows = corsHeaderRows
    .map(
      ([key, val]) => `
      <div class="cors-hdr-row">
        <span class="cors-hdr-key ${val ? "" : "cors-absent"}">${escapeHtml(key)}</span>
        <span class="cors-hdr-val ${val ? "" : "cors-absent"}">${val ? escapeHtml(val) : "not present"}</span>
        <span class="cors-hdr-indicator">${val ? "✓" : "—"}</span>
      </div>`,
    )
    .join("");

  let advice;
  if (!hasCors) {
    advice = `<div class="cors-advice cors-advice-fail">
      No CORS headers detected. A browser frontend at <code>${escapeHtml(origin)}</code>
      will be <strong>blocked</strong> from accessing this API.
    </div>`;
  } else if (credentialsMismatch) {
    advice = `<div class="cors-advice cors-advice-warn">
      <code>Access-Control-Allow-Credentials: true</code> combined with
      <code>Access-Control-Allow-Origin: *</code> is <strong>invalid</strong> —
      browsers will reject this combination.
    </div>`;
  } else if (!originAllowed) {
    advice = `<div class="cors-advice cors-advice-warn">
      Server allows <code>${escapeHtml(allowOrigin)}</code> but your
      frontend origin <code>${escapeHtml(origin)}</code> is not whitelisted.
      Cross-origin requests may be blocked by the browser.
    </div>`;
  } else {
    advice = `<div class="cors-advice cors-advice-ok">
      CORS is configured correctly. A frontend at
      <code>${escapeHtml(origin)}</code> should be able to connect to this API.
    </div>`;
  }

  const fmtStatus = (r) => {
    if (!r) return "<code>—</code>";
    if (r.error)
      return `<span class="cors-err-text">${escapeHtml(r.error)}</span>`;
    return `<code>${r.status}</code>`;
  };

  corsResult.innerHTML = `
    <div class="cors-status-badge ${statusClass}">
      <span class="cors-status-icon">${statusIcon}</span>
      <span>${escapeHtml(statusText)}</span>
    </div>
    ${advice}
    <div class="cors-section-label">CORS Response Headers</div>
    <div class="cors-headers-table">
      <div class="cors-hdr-row cors-hdr-head">
        <span>Header</span><span>Value</span><span></span>
      </div>
      ${tableRows}
    </div>
    <div class="cors-req-note">
      <span>OPTIONS &#8594; ${fmtStatus(optionsResult)}</span>
      <span>GET &#8594; ${fmtStatus(getResult)}</span>
      <span class="cors-note-hint">
        Tip: Chrome extensions bypass CORS enforcement, so we read the actual
        headers the server returns. The result shows what a real browser frontend
        would receive.
      </span>
    </div>
  `;
}
