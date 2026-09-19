/* ===== APPLICATION STATE ===== */
const state = {
  fileName: "Untitled.txt",
  fileHandle: null,
  modified: false,
  zoom: 100,
  theme: localStorage.getItem("modern-notepad-theme") || "dark",
  wordWrap: true,
  lineNumbers: true,
  statusBar: true,
  tool: "select",
  primaryColor: "#72b7ff",
  secondaryColor: "#8b5cf6",
  comboColors: null,
  strokeSize: 4,
  isDrawing: false,
  drawStart: null,
  lastPoint: null,
  findQuery: "",
  findIndex: -1,
  recognition: null,
  recognizing: false,
  selectionRange: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const editor = $("#editor");
const editorViewport = $("#editorViewport");
const drawingCanvas = $("#drawingCanvas");
const ctx = drawingCanvas.getContext("2d");
const modalBackdrop = $("#modalBackdrop");
const modalTitle = $("#modalTitle");
const modalBody = $("#modalBody");
const modalActions = $("#modalActions");

/* ===== INITIALIZATION ===== */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  setupMenus();
  setupEditor();
  setupToolbar();
  setupPalette();
  setupActions();
  setupKeyboardShortcuts();
  setupFindReplace();
  setupVoiceRecognition();
  setupDrawingCanvas();
  updateAll();
  requestAnimationFrame(resizeCanvas);
});

/* ===== MAIN MENUS ===== */
function setupMenus() {
  $$(".menu-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".menu");
      const wasOpen = menu.classList.contains("open");
      closeMenus();
      if (!wasOpen) menu.classList.add("open");
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu")) closeMenus();
    if (!event.target.closest(".color-popover") && !event.target.closest("#paletteButton")) {
      $("#colorPalette").classList.remove("open");
    }
  });
}

function closeMenus() {
  $$(".menu.open").forEach((menu) => menu.classList.remove("open"));
}

/* ===== EDITOR / MULTI-FONT RICH TEXT ===== */
function setupEditor() {
  editor.addEventListener("input", () => {
    markModified();
    updateAll();
  });

  editor.addEventListener("keyup", updateCaretStatus);
  editor.addEventListener("mouseup", updateCaretStatus);
  editor.addEventListener("click", handleEditorClick);
  editor.addEventListener("dragstart", handleEditorDragStart);
  editor.addEventListener("drop", handleEditorDrop);

  document.addEventListener("selectionchange", () => {
    if (document.activeElement === editor) saveSelection();
  });
}

function saveSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    state.selectionRange = range.cloneRange();
  }
}

function restoreSelection() {
  if (!state.selectionRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(state.selectionRange);
}

function execCommand(command, value = null) {
  editor.focus();
  restoreSelection();
  document.execCommand(command, false, value);
  saveSelection();
  markModified();
  updateAll();
}

function chooseFont() {
  showModal(
    "Font Family",
    `<div class="setting-row"><label>Choose font:</label>
      <select id="fontSelect">
        <option value="Inter">Inter</option>
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        <option value="Courier New">Courier New</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Verdana">Verdana</option>
        <option value="Trebuchet MS">Trebuchet MS</option>
      </select>
    </div>`,
    [
      { text: "Apply", primary: true, action: () => {
        const value = $("#fontSelect").value;
        execCommand("fontName", value);
        closeModal();
      }},
      { text: "Cancel", action: closeModal }
    ]
  );
}

function chooseFontSize() {
  showModal(
    "Font Size",
    `<div class="setting-row"><label>Size:</label>
      <input id="fontSizeInput" type="number" min="8" max="96" value="16">
      <span>px</span>
    </div>`,
    [
      { text: "Apply", primary: true, action: () => {
        const size = Math.max(8, Math.min(96, Number($("#fontSizeInput").value) || 16));
        applyFontSize(size);
        closeModal();
      }},
      { text: "Cancel", action: closeModal }
    ]
  );
}

function applyFontSize(px) {
  editor.focus();
  restoreSelection();
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    document.execCommand("fontSize", false, "4");
    return;
  }

  document.execCommand("fontSize", false, "7");
  $$("#editor font[size='7']").forEach((node) => {
    node.removeAttribute("size");
    node.style.fontSize = `${px}px`;
  });
  markModified();
  updateAll();
}

function chooseColor(type) {
  showModal(
    type === "background-color" ? "Background Color" : "Text Color",
    `<div class="setting-row">
      <label>Choose color:</label>
      <input id="customColor" type="color" value="${type === "background-color" ? "#243044" : state.primaryColor}">
    </div>`,
    [
      { text: "Apply", primary: true, action: () => {
        const color = $("#customColor").value;
        if (type === "background-color") execCommand("backColor", color);
        else execCommand("foreColor", color);
        closeModal();
      }},
      { text: "Cancel", action: closeModal }
    ]
  );
}

function applyHighlight() {
  showModal(
    "Highlight Color",
    `<div class="setting-row"><label>Highlight:</label>
      <input id="highlightColor" type="color" value="#fff176">
    </div>`,
    [
      { text: "Apply", primary: true, action: () => {
        execCommand("hiliteColor", $("#highlightColor").value);
        closeModal();
      }},
      { text: "Cancel", action: closeModal }
    ]
  );
}

/* ===== TOOLBAR ACTIONS ===== */
function setupToolbar() {
  $$(".tool-button[data-tool]").forEach((button) => {
    button.addEventListener("click", () => selectTool(button.dataset.tool));
  });

  $("#strokeSize").addEventListener("input", (event) => {
    state.strokeSize = Number(event.target.value);
  });

  $("#paletteButton").addEventListener("click", (event) => {
    event.stopPropagation();
    $("#colorPalette").classList.toggle("open");
  });

  $("#clearDrawing").addEventListener("click", clearCanvas);
}

function selectTool(tool) {
  state.tool = tool;
  $$(".tool-button[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  drawingCanvas.classList.toggle("drawing-active", tool !== "select");
  if (tool === "select") drawingCanvas.style.pointerEvents = "none";
}

function clearCanvas() {
  if (!confirm("Clear all drawings from the current document?")) return;
  resizeCanvas();
  markModified();
}

function resizeCanvas() {
  const rect = editorViewport.getBoundingClientRect();
  const old = document.createElement("canvas");
  old.width = drawingCanvas.width;
  old.height = drawingCanvas.height;
  if (old.width && old.height) old.getContext("2d").drawImage(drawingCanvas, 0, 0);

  const dpr = window.devicePixelRatio || 1;
  drawingCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  drawingCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  drawingCanvas.style.width = `${rect.width}px`;
  drawingCanvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (old.width && old.height) {
    ctx.drawImage(old, 0, 0, old.width / (window.devicePixelRatio || 1), old.height / (window.devicePixelRatio || 1), 0, 0, rect.width, rect.height);
  }
}

window.addEventListener("resize", resizeCanvas);

/* ===== DRAWING TOOLS ===== */
function setupDrawingCanvas() {
  drawingCanvas.addEventListener("pointerdown", startDrawing);
  drawingCanvas.addEventListener("pointermove", drawMove);
  drawingCanvas.addEventListener("pointerup", finishDrawing);
  drawingCanvas.addEventListener("pointercancel", finishDrawing);
  drawingCanvas.addEventListener("pointerleave", finishDrawing);
}

function canvasPoint(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function createStrokeStyle() {
  if (!state.comboColors) return state.primaryColor;
  const gradient = ctx.createLinearGradient(0, 0, drawingCanvas.clientWidth, drawingCanvas.clientHeight);
  gradient.addColorStop(0, state.comboColors[0]);
  gradient.addColorStop(1, state.comboColors[state.comboColors.length - 1]);
  return gradient;
}

function prepareDrawing() {
  ctx.strokeStyle = createStrokeStyle();
  ctx.fillStyle = state.primaryColor;
  ctx.lineWidth = state.strokeSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function startDrawing(event) {
  if (state.tool === "select") return;
  event.preventDefault();
  drawingCanvas.setPointerCapture(event.pointerId);
  state.isDrawing = true;
  state.drawStart = canvasPoint(event);
  state.lastPoint = state.drawStart;
  prepareDrawing();

  if (state.tool === "dot") {
    ctx.beginPath();
    ctx.arc(state.drawStart.x, state.drawStart.y, Math.max(2, state.strokeSize * 1.2), 0, Math.PI * 2);
    ctx.fillStyle = state.primaryColor;
    ctx.fill();
    state.isDrawing = false;
    markModified();
  }
}

function drawMove(event) {
  if (!state.isDrawing) return;
  const point = canvasPoint(event);

  if (state.tool === "pen") {
    ctx.strokeStyle = createStrokeStyle();
    ctx.beginPath();
    ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    state.lastPoint = point;
    return;
  }

  if (state.tool === "eraser") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = Math.max(12, state.strokeSize * 3);
    ctx.beginPath();
    ctx.moveTo(state.lastPoint.x, state.lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
    state.lastPoint = point;
    return;
  }

  redrawPreview();
}

function redrawPreview() {
  /* Preview uses a snapshot so shapes do not permanently stack while dragging. */
  if (!state.drawStart || !state.lastPoint) return;
  const current = state.lastPoint;
  /* Shape previews are intentionally lightweight; the final shape is committed on pointerup. */
  void current;
}

function finishDrawing(event) {
  if (!state.isDrawing) return;
  const end = canvasPoint(event);
  if (state.tool !== "pen" && state.tool !== "eraser") {
    drawShape(state.tool, state.drawStart, end);
  }
  state.isDrawing = false;
  state.drawStart = null;
  state.lastPoint = null;
  markModified();
}

function drawShape(tool, start, end) {
  prepareDrawing();
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  if (tool === "line") {
    drawLine(start.x, start.y, end.x, end.y);
  } else if (tool === "arrow") {
    drawArrow(start.x, start.y, end.x, end.y);
  } else if (tool === "rectangle") {
    ctx.strokeRect(x, y, w, h);
  } else if (tool === "circle") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArrow(x1, y1, x2, y2) {
  drawLine(x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(8, state.strokeSize * 3);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

/* ===== COLOR PALETTE ===== */
function setupPalette() {
  const colors = [
    ["Red", "#ef4444"], ["Blue", "#3b82f6"], ["Green", "#22c55e"],
    ["Yellow", "#facc15"], ["Orange", "#f97316"], ["Purple", "#8b5cf6"],
    ["Pink", "#ec4899"], ["Cyan", "#06b6d4"], ["White", "#ffffff"],
    ["Black", "#111111"], ["Gray", "#94a3b8"]
  ];

  $("#basicColors").innerHTML = colors.map(([name, color]) =>
    `<button class="color-swatch" title="${name}" style="background:${color}" data-color="${color}"></button>`
  ).join("");

  $$("#basicColors .color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      state.primaryColor = button.dataset.color;
      state.secondaryColor = button.dataset.color;
      state.comboColors = null;
      updatePalettePreview();
    });
  });

  const two = [
    ["Blue + Purple", ["#3b82f6", "#8b5cf6"]],
    ["Blue + Cyan", ["#3b82f6", "#06b6d4"]],
    ["Red + Orange", ["#ef4444", "#f97316"]],
    ["Green + Yellow", ["#22c55e", "#facc15"]],
    ["Pink + Purple", ["#ec4899", "#8b5cf6"]],
    ["Black + Blue", ["#111111", "#3b82f6"]]
  ];
  const three = [
    ["Blue + Purple + Cyan", ["#3b82f6", "#8b5cf6", "#06b6d4"]],
    ["Red + Orange + Yellow", ["#ef4444", "#f97316", "#facc15"]],
    ["Green + Blue + Cyan", ["#22c55e", "#3b82f6", "#06b6d4"]],
    ["Pink + Purple + Blue", ["#ec4899", "#8b5cf6", "#3b82f6"]],
    ["Black + Blue + White", ["#111111", "#3b82f6", "#ffffff"]]
  ];

  renderCombos("#twoColorCombos", two);
  renderCombos("#threeColorCombos", three);
  updatePalettePreview();
}

function renderCombos(selector, combos) {
  $(selector).innerHTML = combos.map(([name, colors]) =>
    `<button class="combo-swatch" title="${name}" data-colors="${colors.join("|")}" style="background:linear-gradient(135deg,${colors.join(",")})"><span>${name}</span></button>`
  ).join("");

  $$(selector + " .combo-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      state.comboColors = button.dataset.colors.split("|");
      state.primaryColor = state.comboColors[0];
      state.secondaryColor = state.comboColors[1];
      updatePalettePreview();
    });
  });
}

function updatePalettePreview() {
  $("#primaryColorPreview").style.background = state.primaryColor;
  $("#secondaryColorPreview").style.background = state.secondaryColor;
}

/* ===== ACTION DISPATCH ===== */
function setupActions() {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    const commandButton = event.target.closest("[data-command]");

    if (actionButton) {
      handleAction(actionButton.dataset.action);
      closeMenus();
    }

    if (commandButton) {
      execCommand(commandButton.dataset.command);
      closeMenus();
    }
  });
}

async function handleAction(action) {
  switch (action) {
    case "new": await newDocument(); break;
    case "new-window": window.open(location.href, "_blank"); break;
    case "open": $("#fileInput").click(); break;
    case "save": await saveFile(false); break;
    case "save-as": await saveFile(true); break;
    case "save-all": await saveFile(true); break;
    case "close": await closeDocument(); break;
    case "exit": await exitApplication(); break;
    case "undo": execCommand("undo"); break;
    case "redo": execCommand("redo"); break;
    case "cut": execCommand("cut"); break;
    case "copy": execCommand("copy"); break;
    case "paste": await pasteFromClipboard(); break;
    case "delete": execCommand("delete"); break;
    case "select-all": execCommand("selectAll"); break;
    case "find": openFindPanel(false); break;
    case "find-next": findNext(); break;
    case "find-prev": findPrevious(); break;
    case "replace": openFindPanel(true); break;
    case "text-color": chooseColor("text-color"); break;
    case "background-color": chooseColor("background-color"); break;
    case "highlight-color": applyHighlight(); break;
    case "font-family": chooseFont(); break;
    case "font-size": chooseFontSize(); break;
    case "insert-image": $("#imageInput").click(); break;
    case "stickers": openStickers(); break;
    case "zoom-in": setZoom(state.zoom + 10); break;
    case "zoom-out": setZoom(state.zoom - 10); break;
    case "zoom-reset": setZoom(100); break;
    case "fullscreen": toggleFullscreen(); break;
    case "word-wrap": toggleWordWrap(); break;
    case "line-numbers": toggleLineNumbers(); break;
    case "status-bar": toggleStatusBar(); break;
    case "help": showHelp(); break;
    case "shortcuts": showShortcuts(); break;
    case "features": showFeatures(); break;
    case "about": showAbout(); break;
    case "version": showVersion(); break;
  }
}

/* ===== FILE OPERATIONS ===== */
$("#fileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!(await confirmDiscardIfNeeded())) {
    event.target.value = "";
    return;
  }

  const text = await file.text();
  editor.innerHTML = textToHtml(text);
  state.fileName = file.name;
  state.fileHandle = null;
  state.modified = false;
  drawingCanvas.getContext("2d").clearRect(0, 0, drawingCanvas.clientWidth, drawingCanvas.clientHeight);
  updateAll();
  event.target.value = "";
});

$("#imageInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  insertImage(url);
  event.target.value = "";
});

async function newDocument() {
  if (!(await confirmDiscardIfNeeded())) return;
  editor.innerHTML = "<p><br></p>";
  state.fileName = "Untitled.txt";
  state.fileHandle = null;
  state.modified = false;
  resizeCanvas();
  updateAll();
}

async function closeDocument() {
  if (!(await confirmDiscardIfNeeded())) return;
  await newDocument();
}

async function exitApplication() {
  if (!(await confirmDiscardIfNeeded())) return;
  window.close();
  showModal("Exit", "<p>Your browser may prevent a web page from closing itself. You can close this tab/window normally.</p>", [
    { text: "OK", primary: true, action: closeModal }
  ]);
}

async function confirmDiscardIfNeeded() {
  if (!state.modified) return true;
  return new Promise((resolve) => {
    showModal(
      "Unsaved Changes",
      "<p>This document has unsaved changes. Save them before continuing?</p>",
      [
        { text: "Save", primary: true, action: async () => {
          const saved = await saveFile(false);
          closeModal();
          resolve(saved);
        }},
        { text: "Discard", action: () => { closeModal(); resolve(true); } },
        { text: "Cancel", action: () => { closeModal(); resolve(false); } }
      ]
    );
  });
}

async function saveFile(saveAs) {
  const plainText = editor.innerText.replace(/\u00a0/g, " ");
  const defaultName = state.fileName || "Untitled.txt";

  if (window.showSaveFilePicker) {
    try {
      if (!state.fileHandle || saveAs) {
        state.fileHandle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: "Text File", accept: { "text/plain": [".txt"] } }]
        });
      }
      const writable = await state.fileHandle.createWritable();
      await writable.write(plainText);
      await writable.close();
      state.fileName = state.fileHandle.name || defaultName;
      state.modified = false;
      updateAll();
      return true;
    } catch (error) {
      if (error.name === "AbortError") return false;
    }
  }

  downloadText(plainText, defaultName);
  state.modified = false;
  updateAll();
  return true;
}

function downloadText(text, name) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.endsWith(".txt") ? name : `${name}.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textToHtml(text) {
  return text.split(/\n/).map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`).join("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function markModified() {
  state.modified = true;
  $("#modifiedMark").classList.add("visible");
}

function clearModified() {
  state.modified = false;
  $("#modifiedMark").classList.remove("visible");
}

/* ===== CLIPBOARD ===== */
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    execCommand("insertText", text);
  } catch {
    showModal("Paste", "<p>Clipboard access was blocked by the browser. Use Ctrl+V directly inside the editor.</p>", [
      { text: "OK", primary: true, action: closeModal }
    ]);
  }
}

/* ===== IMAGE / STICKERS ===== */
function insertImage(url) {
  editor.focus();
  restoreSelection();
  const img = document.createElement("img");
  img.src = url;
  img.alt = "Inserted image";
  img.draggable = true;
  img.style.width = "320px";
  const selection = window.getSelection();
  if (selection.rangeCount && editor.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.appendChild(img);
  }
  markModified();
}

function openStickers() {
  const stickers = ["⭐", "✨", "🔥", "💡", "🚀", "🎯", "❤️", "⚡", "✅", "📌", "💻", "🎨"];
  showModal(
    "Stickers",
    `<p>Select a sticker to insert:</p><div class="sticker-picker">${stickers.map((s) =>
      `<button class="tool-button sticker-choice" data-sticker="${s}" style="font-size:24px">${s}</button>`
    ).join("")}</div>`,
    [{ text: "Close", action: closeModal }]
  );
  $$(".sticker-choice").forEach((button) => {
    button.addEventListener("click", () => {
      editor.focus();
      restoreSelection();
      const sticker = document.createElement("span");
      sticker.className = "sticker";
      sticker.textContent = button.dataset.sticker;
      sticker.contentEditable = "false";
      const selection = window.getSelection();
      if (selection.rangeCount && editor.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(sticker);
        range.setStartAfter(sticker);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.appendChild(sticker);
      }
      markModified();
    });
  });
}

function handleEditorClick(event) {
  if (event.target.matches("img")) {
    const current = event.target;
    showModal(
      "Image Options",
      `<div class="setting-row"><label>Width (px):</label>
        <input id="imageWidth" type="number" min="40" max="1600" value="${Math.round(current.getBoundingClientRect().width)}">
      </div>`,
      [
        { text: "Apply", primary: true, action: () => {
          current.style.width = `${$("#imageWidth").value}px`;
          markModified();
          closeModal();
        }},
        { text: "Remove", action: () => { current.remove(); markModified(); closeModal(); } },
        { text: "Cancel", action: closeModal }
      ]
    );
  }

  if (event.target.matches(".sticker")) {
    showModal("Sticker Options", "<p>You can remove this sticker or leave it in place.</p>", [
      { text: "Delete", primary: true, action: () => { event.target.remove(); markModified(); closeModal(); } },
      { text: "Cancel", action: closeModal }
    ]);
  }
}

function handleEditorDragStart(event) {
  if (event.target.matches("img, .sticker")) {
    event.dataTransfer.setData("text/plain", event.target.outerHTML);
  }
}

function handleEditorDrop(event) {
  if (event.dataTransfer.files?.length) return;
  event.preventDefault();
}

/* ===== FIND / REPLACE ===== */
function setupFindReplace() {
  $("#findNextButton").addEventListener("click", findNext);
  $("#findPrevButton").addEventListener("click", findPrevious);
  $("#replaceOne").addEventListener("click", replaceOne);
  $("#replaceAll").addEventListener("click", replaceAll);
  $("#findClose").addEventListener("click", () => $("#findPanel").classList.add("hidden"));
  $("#findInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.shiftKey ? findPrevious() : findNext();
  });
}

function openFindPanel(withReplace) {
  $("#findPanel").classList.remove("hidden");
  $("#replaceInput").parentElement.style.display = withReplace ? "flex" : "none";
  $("#findInput").focus();
}

function getTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function findMatch(reverse = false) {
  const query = $("#findInput").value;
  if (!query) return;

  const text = editor.innerText;
  const start = state.findIndex;
  let index;

  if (reverse) {
    index = text.lastIndexOf(query, start <= 0 ? text.length : start - 1);
  } else {
    index = text.indexOf(query, start + 1);
    if (index === -1) index = text.indexOf(query);
  }

  if (index === -1) {
    state.findIndex = -1;
    return;
  }

  state.findIndex = index;
  selectTextRange(index, index + query.length);
}

function findNext() {
  findMatch(false);
}

function findPrevious() {
  findMatch(true);
}

function selectTextRange(start, end) {
  const nodes = getTextNodes(editor);
  let offset = 0;
  const range = document.createRange();

  for (const node of nodes) {
    const next = offset + node.nodeValue.length;
    if (start >= offset && start <= next) {
      const endOffset = Math.min(node.nodeValue.length, start - offset);
      range.setStart(node, endOffset);
      break;
    }
    offset = next;
  }

  offset = 0;
  for (const node of nodes) {
    const next = offset + node.nodeValue.length;
    if (end >= offset && end <= next) {
      range.setEnd(node, Math.max(0, end - offset));
      break;
    }
    offset = next;
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
}

function replaceOne() {
  const query = $("#findInput").value;
  if (!query) return;
  const selection = window.getSelection();
  if (selection.toString() === query) {
    document.execCommand("insertText", false, $("#replaceInput").value);
    markModified();
  }
  findNext();
}

function replaceAll() {
  const query = $("#findInput").value;
  const replacement = $("#replaceInput").value;
  if (!query) return;
  const nodes = getTextNodes(editor);
  nodes.forEach((node) => {
    node.nodeValue = node.nodeValue.split(query).join(replacement);
  });
  markModified();
  updateAll();
}

/* ===== VOICE TO TEXT ===== */
function setupVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("#voiceButton").title = "Voice-to-Text is not supported by this browser";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  state.recognition = recognition;

  recognition.onstart = () => {
    state.recognizing = true;
    $("#voiceButton").classList.add("listening");
    $("#voiceStatus").textContent = "Listening… speak now";
  };

  recognition.onresult = (event) => {
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
    }
    if (finalText) {
      editor.focus();
      restoreSelection();
      document.execCommand("insertText", false, finalText + " ");
      markModified();
      updateAll();
    }
  };

  recognition.onerror = (event) => {
    $("#voiceStatus").textContent = `Voice error: ${event.error}`;
  };

  recognition.onend = () => {
    state.recognizing = false;
    $("#voiceButton").classList.remove("listening");
    $("#voiceStatus").textContent = "Voice ready";
  };

  $("#voiceButton").addEventListener("click", () => {
    if (state.recognizing) recognition.stop();
    else {
      try { recognition.start(); }
      catch { $("#voiceStatus").textContent = "Voice recognition could not start"; }
    }
  });
}

/* ===== THEME SYSTEM ===== */
$("#themeToggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("modern-notepad-theme", state.theme);
  applyTheme();
});

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  $("#themeToggle").textContent = state.theme === "light" ? "☀ / 🌙" : "☀ / 🌙";
}

/* ===== VIEW SYSTEM ===== */
function setZoom(value) {
  state.zoom = Math.max(60, Math.min(200, value));
  editor.style.fontSize = `${16 * state.zoom / 100}px`;
  $("#zoomStatus").textContent = `${state.zoom}%`;
}

function toggleWordWrap() {
  state.wordWrap = !state.wordWrap;
  editor.classList.toggle("nowrap", !state.wordWrap);
}

function toggleLineNumbers() {
  state.lineNumbers = !state.lineNumbers;
  $("#lineNumbers").style.display = state.lineNumbers ? "" : "none";
}

function toggleStatusBar() {
  state.statusBar = !state.statusBar;
  $("#statusBar").style.display = state.statusBar ? "" : "none";
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

/* ===== STATUS BAR ===== */
function updateAll() {
  updateDocumentName();
  updateCounts();
  updateCaretStatus();
  updateLineNumbers();
  $("#zoomStatus").textContent = `${state.zoom}%`;
  $("#lineNumbers").style.display = state.lineNumbers ? "" : "none";
  $("#statusBar").style.display = state.statusBar ? "" : "none";
}

function updateDocumentName() {
  $("#documentName").textContent = state.fileName;
}

function updateCounts() {
  const text = editor.innerText.replace(/\u00a0/g, " ").replace(/\n$/, "");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  $("#wordStatus").textContent = words;
  $("#charStatus").textContent = text.length;
}

function updateCaretStatus() {
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.anchorNode)) return;

  const range = selection.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  const before = preRange.toString();
  const lines = before.split("\n");
  $("#lineStatus").textContent = lines.length;
  $("#columnStatus").textContent = lines[lines.length - 1].length + 1;
}

function updateLineNumbers() {
  const count = Math.max(1, editor.innerText.split("\n").length);
  $("#lineNumbers").textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
}

/* ===== KEYBOARD SHORTCUTS ===== */
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", async (event) => {
    const key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey)) {
      if (event.key === "F3") findNext();
      if (event.shiftKey && event.key === "F3") findPrevious();
      return;
    }

    if (key === "n") { event.preventDefault(); await newDocument(); }
    if (key === "o") { event.preventDefault(); $("#fileInput").click(); }
    if (key === "s") {
      event.preventDefault();
      if (event.shiftKey) await saveFile(true);
      else await saveFile(false);
    }
    if (key === "f") { event.preventDefault(); openFindPanel(false); }
    if (key === "h") { event.preventDefault(); openFindPanel(true); }
    if (key === "=" || key === "+") { event.preventDefault(); setZoom(state.zoom + 10); }
    if (key === "-") { event.preventDefault(); setZoom(state.zoom - 10); }
    if (key === "b" || key === "i" || key === "u") {
      event.preventDefault();
      execCommand(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
    }
  });
}

/* ===== HELP / ABOUT DIALOGS ===== */
function showHelp() {
  showModal("Help", "<p>Use the menus at the top for file, editing, formatting and view controls. Use the drawing toolbar for diagrams and the microphone button for voice-to-text.</p>", [
    { text: "Close", primary: true, action: closeModal }
  ]);
}

function showShortcuts() {
  showModal("Keyboard Shortcuts", `
    <p><strong>Ctrl+N</strong> New &nbsp; <strong>Ctrl+O</strong> Open &nbsp; <strong>Ctrl+S</strong> Save</p>
    <p><strong>Ctrl+Shift+S</strong> Save As &nbsp; <strong>Ctrl+Z</strong> Undo &nbsp; <strong>Ctrl+Y</strong> Redo</p>
    <p><strong>Ctrl+F</strong> Find &nbsp; <strong>Ctrl+H</strong> Replace &nbsp; <strong>Ctrl+B/I/U</strong> Formatting</p>
    <p><strong>F3</strong> Find Next &nbsp; <strong>Shift+F3</strong> Find Previous</p>
  `, [{ text: "Close", primary: true, action: closeModal }]);
}

function showFeatures() {
  showModal("Features", `
    <p>Rich-text formatting with independent font spans, file operations, voice-to-text, drawing tools, image insertion, stickers, find/replace, zoom, line numbers, status bar and persistent theme selection.</p>
  `, [{ text: "Close", primary: true, action: closeModal }]);
}

function showAbout() {
  showModal("About Modern Notepad", `
    <p><strong>Modern Notepad</strong></p>
    <p>A professional browser-based desktop-style editor built using only HTML, CSS and JavaScript.</p>
    <p>Designed with a soft black + soft blue interface and modular feature sections for easy editing in VS Code.</p>
  `, [{ text: "Close", primary: true, action: closeModal }]);
}

function showVersion() {
  showModal("Version Information", "<p>Modern Notepad — Version 1.0.0</p><p>HTML + CSS + JavaScript edition.</p>", [
    { text: "Close", primary: true, action: closeModal }
  ]);
}

/* ===== MODAL SYSTEM ===== */
function showModal(title, body, actions = []) {
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  modalActions.innerHTML = "";

  actions.forEach((item) => {
    const button = document.createElement("button");
    button.textContent = item.text;
    if (item.primary) button.classList.add("primary");
    button.addEventListener("click", item.action);
    modalActions.appendChild(button);
  });

  modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
}

$("#modalClose").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});

/* ===== DOCUMENT SAFETY ===== */
window.addEventListener("beforeunload", (event) => {
  if (!state.modified) return;
  event.preventDefault();
  event.returnValue = "";
});
