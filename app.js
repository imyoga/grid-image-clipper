/** @typedef {'horizontal' | 'vertical'} LineMode */

const state = {
  /** @type {ImageBitmap | null} */
  bitmap: null,
  sourceName: 'image',
  naturalWidth: 0,
  naturalHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  /** @type {LineMode} */
  mode: 'horizontal',
  /** Natural-pixel Y positions (exclusive boundaries) */
  horizontalLines: [],
  /** Natural-pixel X positions */
  verticalLines: [],
  /** Undo stack: { mode, value } */
  history: [],
};

const els = {
  fileInput: document.getElementById('fileInput'),
  imageMeta: document.getElementById('imageMeta'),
  gridStats: document.getElementById('gridStats'),
  undoBtn: document.getElementById('undoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  formatSelect: document.getElementById('formatSelect'),
  exportStatus: document.getElementById('exportStatus'),
  stage: document.getElementById('stage'),
  stageInner: document.getElementById('stageInner'),
  viewCanvas: document.getElementById('viewCanvas'),
  hitLayer: document.getElementById('hitLayer'),
  modeButtons: [...document.querySelectorAll('.segmented__btn')],
};

const viewCtx = els.viewCanvas.getContext('2d', { alpha: false });

let layoutRaf = 0;
let drawRaf = 0;

function setMode(mode) {
  state.mode = mode;
  for (const btn of els.modeButtons) {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  }
}

function updateChrome() {
  const hasImage = Boolean(state.bitmap);
  els.undoBtn.disabled = !hasImage || state.history.length === 0;
  els.clearBtn.disabled =
    !hasImage || (state.horizontalLines.length === 0 && state.verticalLines.length === 0);
  els.downloadBtn.disabled = !hasImage;

  if (!hasImage) {
    els.imageMeta.textContent = 'No image loaded';
    els.gridStats.textContent = '—';
    return;
  }

  els.imageMeta.textContent = `${state.sourceName} · ${state.naturalWidth} × ${state.naturalHeight}px`;
  const cols = state.verticalLines.length + 1;
  const rows = state.horizontalLines.length + 1;
  els.gridStats.textContent = `${cols} × ${rows} cells (${cols * rows} images)`;
}

function sortedUnique(values, min, max) {
  const set = new Set();
  for (const v of values) {
    const n = Math.round(v);
    if (n > min && n < max) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function boundaries(lines, max) {
  return [0, ...sortedUnique(lines, 0, max), max];
}

function scheduleLayout() {
  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = 0;
    layoutStage();
  });
}

function layoutStage() {
  if (!state.bitmap) return;

  const workspace = els.stage.getBoundingClientRect();
  const pad = 0;
  const maxW = Math.max(200, workspace.width - pad);
  const maxH = Math.max(200, workspace.height - pad);

  const scale = Math.min(maxW / state.naturalWidth, maxH / state.naturalHeight, 1);
  state.displayWidth = Math.max(1, Math.round(state.naturalWidth * scale));
  state.displayHeight = Math.max(1, Math.round(state.naturalHeight * scale));

  els.viewCanvas.width = state.displayWidth;
  els.viewCanvas.height = state.displayHeight;
  scheduleDraw();
}

function scheduleDraw() {
  if (drawRaf) cancelAnimationFrame(drawRaf);
  drawRaf = requestAnimationFrame(() => {
    drawRaf = 0;
    draw();
  });
}

function draw() {
  if (!state.bitmap || !viewCtx) return;

  viewCtx.drawImage(state.bitmap, 0, 0, state.displayWidth, state.displayHeight);

  const xs = boundaries(state.verticalLines, state.naturalWidth).map(
    (x) => (x / state.naturalWidth) * state.displayWidth
  );
  const ys = boundaries(state.horizontalLines, state.naturalHeight).map(
    (y) => (y / state.naturalHeight) * state.displayHeight
  );

  viewCtx.save();
  viewCtx.lineWidth = 1;
  viewCtx.strokeStyle = 'rgba(255, 220, 80, 0.95)';
  viewCtx.shadowColor = 'rgba(0,0,0,0.75)';
  viewCtx.shadowBlur = 2;

  for (const x of xs) {
    const px = Math.round(x) + 0.5;
    viewCtx.beginPath();
    viewCtx.moveTo(px, 0);
    viewCtx.lineTo(px, state.displayHeight);
    viewCtx.stroke();
  }
  for (const y of ys) {
    const py = Math.round(y) + 0.5;
    viewCtx.beginPath();
    viewCtx.moveTo(0, py);
    viewCtx.lineTo(state.displayWidth, py);
    viewCtx.stroke();
  }
  viewCtx.restore();
}

function displayToNatural(clientX, clientY) {
  const rect = els.hitLayer.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * state.naturalWidth;
  const y = ((clientY - rect.top) / rect.height) * state.naturalHeight;
  return {
    x: Math.max(0, Math.min(state.naturalWidth, x)),
    y: Math.max(0, Math.min(state.naturalHeight, y)),
  };
}

const MIN_LINE_GAP = 4;

function addLineAt(clientX, clientY) {
  const { x, y } = displayToNatural(clientX, clientY);

  if (state.mode === 'horizontal') {
    const ny = Math.round(y);
    if (ny <= MIN_LINE_GAP || ny >= state.naturalHeight - MIN_LINE_GAP) return;
    if (state.horizontalLines.some((v) => Math.abs(v - ny) < MIN_LINE_GAP)) return;
    state.horizontalLines.push(ny);
    state.history.push({ mode: 'horizontal', value: ny });
  } else {
    const nx = Math.round(x);
    if (nx <= MIN_LINE_GAP || nx >= state.naturalWidth - MIN_LINE_GAP) return;
    if (state.verticalLines.some((v) => Math.abs(v - nx) < MIN_LINE_GAP)) return;
    state.verticalLines.push(nx);
    state.history.push({ mode: 'vertical', value: nx });
  }

  scheduleDraw();
  updateChrome();
}

function undoLine() {
  const last = state.history.pop();
  if (!last) return;
  if (last.mode === 'horizontal') {
    state.horizontalLines = state.horizontalLines.filter((v) => v !== last.value);
  } else {
    state.verticalLines = state.verticalLines.filter((v) => v !== last.value);
  }
  scheduleDraw();
  updateChrome();
}

function clearLines() {
  state.horizontalLines = [];
  state.verticalLines = [];
  state.history = [];
  scheduleDraw();
  updateChrome();
}

async function loadFile(file) {
  if (!file?.type.startsWith('image/')) return;

  if (state.bitmap) state.bitmap.close();

  state.bitmap = await createImageBitmap(file);
  state.naturalWidth = state.bitmap.width;
  state.naturalHeight = state.bitmap.height;
  state.sourceName = file.name.replace(/\.[^.]+$/, '') || 'image';
  clearLines();

  els.stage.classList.remove('stage--empty');
  els.stageInner.hidden = false;

  scheduleLayout();
  updateChrome();
  els.exportStatus.textContent = '';
}

function mimeForFormat(format) {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function extForFormat(format) {
  if (format === 'jpeg') return 'jpg';
  if (format === 'webp') return 'webp';
  return 'png';
}

function canvasToBlob(canvas, format) {
  const mime = mimeForFormat(format);
  const quality = format === 'jpeg' ? 1 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      mime,
      quality
    );
  });
}

async function exportCellsZip() {
  if (!state.bitmap) return;

  const format = els.formatSelect.value;
  const ext = extForFormat(format);
  const xs = boundaries(state.verticalLines, state.naturalWidth);
  const ys = boundaries(state.horizontalLines, state.naturalHeight);
  const total = (xs.length - 1) * (ys.length - 1);

  els.downloadBtn.disabled = true;
  els.exportStatus.textContent = `Exporting 0 / ${total}…`;

  const zip = new JSZip();
  const sliceCanvas = document.createElement('canvas');
  const sliceCtx = sliceCanvas.getContext('2d', { alpha: true });

  let index = 0;
  for (let row = 0; row < ys.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const sx = xs[col];
      const sy = ys[row];
      const sw = xs[col + 1] - sx;
      const sh = ys[row + 1] - sy;

      sliceCanvas.width = sw;
      sliceCanvas.height = sh;
      sliceCtx.clearRect(0, 0, sw, sh);
      sliceCtx.drawImage(state.bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob = await canvasToBlob(sliceCanvas, format);
      const name = `${state.sourceName}_r${row + 1}c${col + 1}.${ext}`;
      zip.file(name, blob);

      index += 1;
      if (index % 3 === 0 || index === total) {
        els.exportStatus.textContent = `Exporting ${index} / ${total}…`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.sourceName}_grid.zip`;
  a.click();
  URL.revokeObjectURL(url);

  els.exportStatus.textContent = `Done — ${total} cells at full resolution.`;
  els.downloadBtn.disabled = false;
}

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files?.[0];
  if (file) loadFile(file);
  els.fileInput.value = '';
});

for (const btn of els.modeButtons) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
}

els.hitLayer.addEventListener('click', (e) => {
  if (!state.bitmap) return;
  addLineAt(e.clientX, e.clientY);
});

els.hitLayer.addEventListener('keydown', (e) => {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undoLine();
  }
});

els.undoBtn.addEventListener('click', undoLine);
els.clearBtn.addEventListener('click', clearLines);
els.downloadBtn.addEventListener('click', () => exportCellsZip().catch(() => {
  els.exportStatus.textContent = 'Export failed.';
  els.downloadBtn.disabled = false;
}));

const ro = new ResizeObserver(scheduleLayout);
ro.observe(els.stage);

updateChrome();
