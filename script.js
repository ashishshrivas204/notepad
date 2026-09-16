const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const editor = $("#editor");
const app = $("#app");
const body = document.body;
const fileInput = $("#fileInput");
const imageInput = $("#imageInput");
const modalBackdrop = $("#modalBackdrop");
const modal = $("#modal");
const toast = $("#toast");

let state = {
  fileName: "Untitled",
  dirty: false,
  zoom: 100,
  wrap: true,
  lineNumbers: false,
  statusBar: true,
  theme: localStorage.getItem("notepad-theme") || "dark"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 1800);
}

function setDirty(value = true) {
  state.dirty = value;
  $("#docState").textContent = state.fileName + (value ? " •" : "");
  $("#saveStatus").textContent = value ? "Unsaved changes" : "Saved";
}

function closeMenus() {
  $$(".dropdown").forEach(m => m.classList.remove("open"));
  $$(".menu-trigger").forEach(b => b.classList.remove("active"));
}

$$(".menu-trigger").forEach(trigger => {
  trigger.addEventListener("click", e => {
    e.stopPropagation();
    const menu = $("#" + trigger.dataset.menu);
    const wasOpen = menu.classList.contains("open");
    closeMenus();
    if (!wasOpen) {
      const rect = trigger.getBoundingClientRect();
      menu.style.left = `${Math.max(4, rect.left)}px`;
      menu.style.top = `${rect.bottom + 1}px`;
      menu.classList.add("open");
      trigger.classList.add("active");
    }
  });
});

document.addEventListener("click", e => {
  if (!e.target.closest(".dropdown") && !e.target.closest(".menu-trigger")) closeMenus();
});

function exec(command, value = null) {
  editor.focus();
  try { document.execCommand(command, false, value); } catch {}
  setDirty(true);
  updateStatus();
}

function selectedText() {
  const sel = window.getSelection();
  return sel && sel.rangeCount ? sel.toString() : "";
}

function wrapSelectionWithStyle(styleObj) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) {
    showToast("Select some text first");
    return;
  }
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  Object.assign(span.style, styleObj);
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(span);
  sel.addRange(r);
  setDirty(true);
}

function chooseColor(type) {
  const input = type === "text" ? $("#textColorInput") : type === "highlight" ? $("#highlightInput") : $("#bgColorInput");
  input.onchange = () => {
    const value = input.value;
    if (type === "text") exec("foreColor", value);
    else if (type === "highlight") exec("hiliteColor", value);
    else wrapSelectionWithStyle({backgroundColor:value});
  };
  input.click();
}

function openModal(content, onReady) {
  modal.innerHTML = content;
  modalBackdrop.classList.add("open");
  if (onReady) onReady();
}
function closeModal() { modalBackdrop.classList.remove("open"); modal.innerHTML = ""; }
modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });

function confirmUnsaved(action) {
  if (!state.dirty) return action();
  openModal(`
    <h2>Unsaved changes</h2>
    <p>Your document has changes that have not been saved. What would you like to do?</p>
    <div class="modal-actions">
      <button class="secondary" id="cancelModal">Cancel</button>
      <button class="secondary" id="discardBtn">Discard</button>
      <button class="primary" id="saveContinue">Save & Continue</button>
    </div>`);
  $("#cancelModal").onclick = closeModal;
  $("#discardBtn").onclick = () => { closeModal(); action(); };
  $("#saveContinue").onclick = async () => {
    await saveFile(false);
    closeModal();
    action();
  };
}

function newDocument() {
  confirmUnsaved(() => {
    editor.innerHTML = "";
    state.fileName = "Untitled";
    setDirty(false);
    updateStatus();
    showToast("New document created");
  });
}

function newWindow() {
  window.open(location.href, "_blank", "noopener,noreferrer");
}

function openFile() { fileInput.click(); }

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  confirmUnsaved(() => {
    const reader = new FileReader();
    reader.onload = () => {
      editor.innerText = reader.result;
      state.fileName = file.name;
      setDirty(false);
      updateStatus();
      showToast("File opened");
    };
    reader.readAsText(file);
  });
  fileInput.value = "";
});

function downloadText(name, content, type = "text/plain") {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function saveFile(saveAs = false) {
  let name = state.fileName === "Untitled" ? "Untitled.txt" : state.fileName;
  if (saveAs || state.fileName === "Untitled") {
    const suggested = name.replace(/\.[^.]+$/, "") || "Untitled";
    openModal(`
      <h2>Save As</h2>
      <p>Choose a file name for your document.</p>
      <input id="saveName" type="text" value="${suggested.replace(/"/g, "&quot;")}" placeholder="File name">
      <div class="modal-actions">
        <button class="secondary" id="cancelSave">Cancel</button>
        <button class="primary" id="confirmSave">Save</button>
      </div>`);
    $("#cancelSave").onclick = closeModal;
    $("#confirmSave").onclick = () => {
      let v = $("#saveName").value.trim() || "Untitled";
      if (!/\.[a-z0-9]+$/i.test(v)) v += ".html";
      state.fileName = v;
      closeModal();
      performSave();
    };
    $("#saveName").focus();
    return;
  }
  performSave();

  function performSave() {
    const isHtml = /\.html?$/i.test(state.fileName);
    const content = isHtml ? buildHtmlDocument() : editor.innerText;
    downloadText(state.fileName, content, isHtml ? "text/html" : "text/plain");
    setDirty(false);
    showToast("Document saved");
  }
}

function saveAll() { saveFile(false); }

function buildHtmlDocument() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(state.fileName)}</title>
<style>body{font-family:Inter,Arial,sans-serif;padding:40px;line-height:1.6}img{max-width:100%}</style>
</head><body>${editor.innerHTML}</body></html>`;
}

function closeDocument() {
  confirmUnsaved(() => {
    editor.innerHTML = "";
    state.fileName = "Untitled";
    setDirty(false);
    updateStatus();
  });
}

function exitApp() {
  confirmUnsaved(() => {
    window.close();
    showToast("Browser security may prevent closing this tab");
  });
}

function findReplace(replaceMode = false) {
  openModal(`
    <h2>${replaceMode ? "Find & Replace" : "Find"}</h2>
    <div class="find-row"><input id="findText" type="text" placeholder="Find text"><button class="primary" id="findNext">Find Next</button></div>
    ${replaceMode ? `<input id="replaceText" type="text" placeholder="Replace with">
    <div class="modal-actions"><button class="secondary" id="replaceOne">Replace One</button><button class="primary" id="replaceAll">Replace All</button></div>` : ""}
    <p id="findInfo">Type a word or phrase to search the document.</p>`);
  const input = $("#findText");
  let lastIndex = 0;
  function findNext() {
    const q = input.value;
    if (!q) return;
    const text = editor.innerText;
    const index = text.toLowerCase().indexOf(q.toLowerCase(), lastIndex);
    if (index < 0) { lastIndex = 0; $("#findInfo").textContent = "No more matches."; return; }
    selectTextRange(index, index + q.length);
    lastIndex = index + q.length;
    $("#findInfo").textContent = `Found at character ${index + 1}.`;
  }
  $("#findNext").onclick = findNext;
  input.addEventListener("keydown", e => { if (e.key === "Enter") findNext(); });
  if (replaceMode) {
    $("#replaceOne").onclick = () => {
      const q = input.value;
      if (!q) return;
      const text = editor.innerText;
      const index = text.toLowerCase().indexOf(q.toLowerCase(), 0);
      if (index < 0) return;
      editor.focus();
      selectTextRange(index, index + q.length);
      exec("insertText", $("#replaceText").value);
      $("#findInfo").textContent = "Replaced one match.";
    };
    $("#replaceAll").onclick = () => {
      const q = input.value;
      if (!q) return;
      const replacement = $("#replaceText").value;
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "gi");
      const before = editor.innerText;
      editor.innerText = before.replace(re, replacement);
      setDirty(true); updateStatus();
      $("#findInfo").textContent = "All matches replaced.";
    };
  }
  input.focus();
}

function selectTextRange(start, end) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let pos = 0, startNode, endNode, startOffset = 0, endOffset = 0, node;
  while (node = walker.nextNode()) {
    const next = pos + node.nodeValue.length;
    if (!startNode && start >= pos && start <= next) { startNode = node; startOffset = start - pos; }
    if (!endNode && end >= pos && end <= next) { endNode = node; endOffset = end - pos; break; }
    pos = next;
  }
  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    editor.scrollIntoView({block:"nearest"});
  }
}

function insertImage() { imageInput.click(); }
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    editor.focus();
    const img = document.createElement("img");
    img.src = reader.result; img.alt = file.name; img.title = "Double-click to resize";
    img.style.width = "420px";
    const sel = window.getSelection();
    if (sel.rangeCount) sel.getRangeAt(0).insertNode(img); else editor.appendChild(img);
    setDirty(true); updateStatus();
    img.addEventListener("dblclick", () => resizeImage(img));
    img.addEventListener("click", () => {
      $$(".editor img").forEach(x => x.classList.remove("selected"));
      img.classList.add("selected");
    });
  };
  reader.readAsDataURL(file);
  imageInput.value = "";
});

function resizeImage(img) {
  openModal(`
    <h2>Resize Image</h2>
    <p>Set the image width in pixels.</p>
    <input id="imageWidth" type="number" min="40" max="2000" value="${parseInt(img.getBoundingClientRect().width) || 420}">
    <div class="modal-actions"><button class="secondary" id="cancelResize">Cancel</button><button class="primary" id="applyResize">Apply</button></div>`);
  $("#cancelResize").onclick = closeModal;
  $("#applyResize").onclick = () => {
    const w = Math.max(40, Math.min(2000, Number($("#imageWidth").value) || 420));
    img.style.width = w + "px"; img.classList.remove("selected");
    setDirty(true); closeModal();
  };
}

function stickerPicker() {
  const stickers = ["★","☆","✦","✧","●","◆","◇","✓","❤","☀","☁","⚡","☕","✎","➜","❖","✿","❀","🎯","💡"];
  openModal(`<h2>Stickers</h2><p>Choose a decorative sticker to insert at the cursor.</p>
  <div class="sticker-grid">${stickers.map((s,i)=>`<button class="sticker" data-sticker="${i}">${s}</button>`).join("")}</div>`);
  $$(".sticker").forEach(btn => btn.onclick = () => {
    editor.focus();
    const span = document.createElement("span");
    span.textContent = stickers[Number(btn.dataset.sticker)] + " ";
    span.style.cssText = "font-size:1.5em;color:var(--blue);display:inline-block;";
    const sel = window.getSelection();
    if (sel.rangeCount) sel.getRangeAt(0).insertNode(span); else editor.appendChild(span);
    setDirty(true); closeModal(); updateStatus();
  });
}

function headingStyle() {
  openModal(`<h2>Heading Style</h2><p>Apply a heading level to the selected text.</p>
  <div class="modal-list">
    ${[1,2,3,4].map(n=>`<button class="secondary" data-heading="${n}">Heading ${n}</button>`).join("")}
  </div>`);
  $$("[data-heading]").forEach(b => b.onclick = () => { exec("formatBlock", "H" + b.dataset.heading); closeModal(); });
}

function fontPicker() {
  openModal(`<h2>Font Family</h2><p>Select a font for the selected text or future typing.</p>
  <select id="fontModal">
    <option value="Inter, sans-serif">Inter</option><option value="Arial, sans-serif">Arial</option>
    <option value="Georgia, serif">Georgia</option><option value="'Times New Roman', serif">Times New Roman</option>
    <option value="'Courier New', monospace">Courier New</option><option value="Verdana, sans-serif">Verdana</option>
  </select>
  <div class="modal-actions"><button class="primary" id="applyFont">Apply</button></div>`);
  $("#applyFont").onclick = () => { wrapSelectionWithStyle({fontFamily:$("#fontModal").value}); closeModal(); };
}
function sizePicker() {
  openModal(`<h2>Font Size</h2><p>Choose a text size.</p>
  <select id="sizeModal">${[12,14,16,18,20,24,28,32,40,48].map(n=>`<option value="${n}px">${n}px</option>`).join("")}</select>
  <div class="modal-actions"><button class="primary" id="applySize">Apply</button></div>`);
  $("#applySize").onclick = () => { wrapSelectionWithStyle({fontSize:$("#sizeModal").value}); closeModal(); };
}
function letterSpacing() {
  openModal(`<h2>Letter Spacing</h2><p>Set spacing for the selected text.</p>
  <select id="spacingModal"><option value="0px">Normal</option><option value="1px">1 px</option><option value="2px">2 px</option><option value="3px">3 px</option></select>
  <div class="modal-actions"><button class="primary" id="applySpacing">Apply</button></div>`);
  $("#applySpacing").onclick = () => { wrapSelectionWithStyle({letterSpacing:$("#spacingModal").value}); closeModal(); };
}

function helpModal(title, content) {
  openModal(`<h2>${title}</h2><p>${content}</p><div class="modal-actions"><button class="primary" id="okModal">OK</button></div>`);
  $("#okModal").onclick = closeModal;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function updateStatus() {
  const text = editor.innerText || "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $("#wordCount").textContent = words;
  $("#charCount").textContent = text.length;

  const sel = window.getSelection();
  let caret = 0;
  if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
    const range = document.createRange();
    range.selectNodeContents(editor); range.setEnd(sel.anchorNode, sel.anchorOffset);
    caret = range.toString().length;
  }
  const before = text.slice(0, caret);
  const lines = before.split("\n");
  $("#lineNo").textContent = lines.length;
  $("#colNo").textContent = lines[lines.length - 1].length + 1;
  $("#zoomValue").textContent = state.zoom + "%";
  renderLineNumbers(text);
}

function renderLineNumbers(text) {
  if (!state.lineNumbers) return;
  const count = Math.max(1, text.split("\n").length);
  $("#linePanel").innerHTML = Array.from({length:count},(_,i)=>`${i+1}`).join("<br>");
}

function setZoom(next) {
  state.zoom = Math.max(70, Math.min(180, next));
  editor.style.fontSize = `${16 * state.zoom / 100}px`;
  editor.style.lineHeight = 1.65;
  document.documentElement.style.setProperty("--zoom", state.zoom / 100);
  updateStatus();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  body.classList.toggle("light", state.theme === "light");
  localStorage.setItem("notepad-theme", state.theme);
  $("#themeToggle").textContent = state.theme === "dark" ? "☾" : "☀";
}
toggleTheme();
toggleTheme();

function handleAction(action) {
  closeMenus();
  switch(action) {
    case "new": newDocument(); break;
    case "new-window": newWindow(); break;
    case "open": openFile(); break;
    case "save": saveFile(false); break;
    case "save-as": saveFile(true); break;
    case "save-all": saveAll(); break;
    case "close": closeDocument(); break;
    case "exit": exitApp(); break;
    case "undo": exec("undo"); break;
    case "redo": exec("redo"); break;
    case "cut": exec("cut"); break;
    case "copy": exec("copy"); break;
    case "paste": exec("paste"); break;
    case "delete": exec("delete"); break;
    case "select-all": exec("selectAll"); break;
    case "find": findReplace(false); break;
    case "replace": findReplace(true); break;
    case "text-color": chooseColor("text"); break;
    case "highlight": chooseColor("highlight"); break;
    case "bg-color": chooseColor("bg"); break;
    case "font": fontPicker(); break;
    case "font-size": sizePicker(); break;
    case "bold": exec("bold"); break;
    case "italic": exec("italic"); break;
    case "underline": exec("underline"); break;
    case "strike": exec("strikeThrough"); break;
    case "heading": headingStyle(); break;
    case "letter-spacing": letterSpacing(); break;
    case "align-left": exec("justifyLeft"); break;
    case "align-center": exec("justifyCenter"); break;
    case "align-right": exec("justifyRight"); break;
    case "justify": exec("justifyFull"); break;
    case "image": insertImage(); break;
    case "sticker": stickerPicker(); break;
    case "zoom-in": setZoom(state.zoom + 10); break;
    case "zoom-out": setZoom(state.zoom - 10); break;
    case "zoom-reset": setZoom(100); break;
    case "fullscreen":
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      break;
    case "word-wrap":
      state.wrap = !state.wrap; editor.classList.toggle("no-wrap", !state.wrap);
      $("#wrapState").textContent = state.wrap ? "On" : "Off"; break;
    case "line-numbers":
      state.lineNumbers = !state.lineNumbers; $("#linePanel").classList.toggle("show", state.lineNumbers);
      $("#lineState").textContent = state.lineNumbers ? "On" : "Off"; updateStatus(); break;
    case "status-bar":
      state.statusBar = !state.statusBar; $("#statusbar").style.display = state.statusBar ? "flex" : "none";
      $("#statusState").textContent = state.statusBar ? "On" : "Off"; break;
    case "help":
      helpModal("Help", "Use the File, Edit, Edits, View and Help menus to manage documents, editing, formatting and display options."); break;
    case "shortcuts":
      helpModal("Keyboard Shortcuts", "<b>Ctrl+N</b> New · <b>Ctrl+O</b> Open · <b>Ctrl+S</b> Save · <b>Ctrl+Shift+S</b> Save As · <b>Ctrl+F</b> Find · <b>Ctrl+H</b> Replace · <b>Ctrl+B/I/U</b> Formatting · <b>Ctrl+Z/Y</b> Undo/Redo."); break;
    case "features":
      helpModal("Features", "Modern dark/light themes, rich text formatting, file open/save, find & replace, images, stickers, zoom, word wrap, line numbers and a live status bar."); break;
    case "about":
      helpModal("About Notepad", "<b>Modern Notepad</b><br><br>A polished desktop-style editor built using only HTML, CSS and JavaScript.<br><br>Version 1.0.0"); break;
    case "version":
      helpModal("Version Information", "Modern Notepad · Version 1.0.0 · Pure HTML, CSS & JavaScript"); break;
  }
}

$$("[data-action]").forEach(btn => btn.addEventListener("click", () => handleAction(btn.dataset.action)));

$("#themeToggle").addEventListener("click", toggleTheme);
$("#fontSelect").addEventListener("change", e => {
  editor.style.fontFamily = e.target.value;
  if (selectedText()) wrapSelectionWithStyle({fontFamily:e.target.value});
  setDirty(true);
});
$("#sizeSelect").addEventListener("change", e => {
  if (selectedText()) wrapSelectionWithStyle({fontSize:e.target.value});
  else editor.style.fontSize = e.target.value;
  setDirty(true); updateStatus();
});
$("#textColorBtn").onclick = () => chooseColor("text");
$("#highlightBtn").onclick = () => chooseColor("highlight");

editor.addEventListener("input", () => { setDirty(true); updateStatus(); });
editor.addEventListener("keyup", updateStatus);
editor.addEventListener("mouseup", updateStatus);
editor.addEventListener("paste", () => setTimeout(updateStatus, 0));

document.addEventListener("keydown", e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "n") { e.preventDefault(); newDocument(); }
  else if (ctrl && e.key.toLowerCase() === "o") { e.preventDefault(); openFile(); }
  else if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(e.shiftKey); }
  else if (ctrl && e.key.toLowerCase() === "f") { e.preventDefault(); findReplace(false); }
  else if (ctrl && e.key.toLowerCase() === "h") { e.preventDefault(); findReplace(true); }
  else if (ctrl && e.key.toLowerCase() === "b") { e.preventDefault(); exec("bold"); }
  else if (ctrl && e.key.toLowerCase() === "i") { e.preventDefault(); exec("italic"); }
  else if (ctrl && e.key.toLowerCase() === "u") { e.preventDefault(); exec("underline"); }
});

window.addEventListener("beforeunload", e => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
});

setDirty(false);
setZoom(100);
editor.focus();
