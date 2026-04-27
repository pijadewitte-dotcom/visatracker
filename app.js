const categories = ['Parking','Brandstof','Tol','Openbaar vervoer','Taxi','Huurwagen','Boodschappen','Restaurant','Koffie','Hotel','Reizen','Vlucht/Trein','Kantoor','Software','Diensten','Abonnementen','Telecom','Verzekering','Belastingen','Gezondheid','Onderhoud','Cadeaus','Vrije tijd','Aankopen','Overige'];
const $ = (id) => document.getElementById(id);
const ui = {
  scanBtn: $('scanBtn'), photoBtn: $('photoBtn'), pdfBtn: $('pdfBtn'), exportBtn: $('exportBtn'), photoInput: $('photoInput'),
  scanner: $('scanner'), video: $('video'), closeCamBtn: $('closeCamBtn'), shootBtn: $('shootBtn'), doneBtn: $('doneBtn'),
  strip: $('strip'), count: $('count'), scannerPoly: $('scannerPoly'), scannerH0: $('scannerH0'), scannerH1: $('scannerH1'), scannerH2: $('scannerH2'), scannerH3: $('scannerH3'), scanStatus: $('scanDetectStatus'),
  review: $('review'), reviewBackBtn: $('reviewBackBtn'), rotateBtn: $('rotateBtn'), redetectBtn: $('redetectBtn'), enhanceBtn: $('enhanceBtn'), acceptBtn: $('acceptBtn'),
  stage: $('stage'), canvas: $('canvas'), overlay: $('overlay'), poly: $('poly'),
  sheet: $('sheet'), preview: $('preview'), date: $('date'), amount: $('amount'), desc: $('desc'), cat: $('cat'), notes: $('notes'), saveBtn: $('saveBtn'),
  total: $('total'), list: $('list'), work: $('work'), toast: $('toast')
};

let expenses = JSON.parse(localStorage.visaExpenses || '[]');
let pages = [];
let pageHints = [];
let stream = null;
let current = '';
let img = null;
let idx = 0;
let rot = 0;
let enhanced = false;
let quad = [];
let drag = -1;
let uploadFlow = false;
let liveQuad = null;
let liveSize = null;
let liveTimer = null;
let liveBusy = false;
let liveMisses = 0;

ui.cat.innerHTML = categories.map((c) => `<option>${c}</option>`).join('');
ui.date.valueAsDate = new Date();
render();

ui.scanBtn.onclick = openCam;
ui.photoBtn.onclick = () => ui.photoInput.click();
ui.pdfBtn.onclick = () => showToast('PDF upload is beperkt op GitHub Pages. Gebruik best foto of camera.');
ui.exportBtn.onclick = () => window.exportPdf ? window.exportPdf() : showToast('PDF-export niet beschikbaar');
ui.closeCamBtn.onclick = closeCam;
ui.shootBtn.onclick = shoot;
ui.doneBtn.onclick = finishScan;
ui.reviewBackBtn.onclick = backFromReview;
ui.rotateBtn.onclick = rotate;
ui.redetectBtn.onclick = () => detect(true);
ui.enhanceBtn.onclick = () => { enhanced = !enhanced; draw(); detect(true); };
ui.acceptBtn.onclick = acceptCrop;
ui.saveBtn.onclick = saveExpense;
ui.sheet.onclick = (e) => { if (e.target === ui.sheet) ui.sheet.classList.remove('on'); };
ui.photoInput.onchange = uploadPhoto;
window.addEventListener('resize', () => { paint(); paintLiveOverlay(); });

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(ui.toast.t);
  ui.toast.t = setTimeout(() => ui.toast.classList.remove('show'), 2400);
}

async function openCam() {
  pages = [];
  pageHints = [];
  uploadFlow = false;
  thumbs();
  ui.scanner.classList.add('on');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    ui.video.srcObject = stream;
    await ui.video.play().catch(() => {});
    await waitForVideoFrame(ui.video);
    startLiveDetection();
  } catch {
    ui.scanner.classList.remove('on');
    showToast('Camera niet beschikbaar');
  }
}

function closeCam() {
  stopLiveDetection();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  ui.scanner.classList.remove('on');
}

async function waitForVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return;
  await new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('loadeddata', done);
      resolve();
    };
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('loadeddata', done, { once: true });
  });
}

function startLiveDetection() {
  stopLiveDetection();
  liveQuad = null;
  liveSize = null;
  liveMisses = 0;
  setLiveStatus('Zoeken naar documentranden...');
  paintLiveOverlay();
  liveTimer = setInterval(runLiveDetection, 180);
  runLiveDetection();
}

function stopLiveDetection() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
  liveBusy = false;
  liveQuad = null;
  liveSize = null;
  liveMisses = 0;
  paintLiveOverlay();
}

function runLiveDetection() {
  if (!stream || !ui.video || ui.video.readyState < 2 || liveBusy) return;
  liveBusy = true;
  try {
    const srcW = ui.video.videoWidth || 0;
    const srcH = ui.video.videoHeight || 0;
    if (!srcW || !srcH) return;
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const drawW = Math.max(1, Math.round(srcW * scale));
    const drawH = Math.max(1, Math.round(srcH * scale));
    ui.work.width = drawW;
    ui.work.height = drawH;
    const ctx = ui.work.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ui.video, 0, 0, drawW, drawH);
    const data = ctx.getImageData(0, 0, drawW, drawH).data;
    const detected = autoDetectDocument(drawW, drawH, data);
    if (detected && isValidQuad(drawW, drawH, detected.quad)) {
      liveQuad = regularizeDocumentQuad(detected.quad, drawW, drawH);
      liveSize = { width: drawW, height: drawH };
      liveMisses = 0;
      setLiveStatus('Randen gevonden - hou de camera nog even stil');
    } else {
      liveMisses += 1;
      if (liveMisses >= 3) {
        liveQuad = null;
        liveSize = null;
        setLiveStatus('Zoeken naar documentranden...');
      }
    }
    paintLiveOverlay();
  } finally {
    liveBusy = false;
  }
}

function setLiveStatus(message) {
  if (ui.scanStatus) ui.scanStatus.textContent = message;
}

function paintLiveOverlay() {
  if (!ui.scannerPoly || !ui.scannerH0) return;
  const mapped = mapQuadToVideoOverlay(liveQuad, liveSize, ui.video);
  if (!mapped) {
    ui.scannerPoly.setAttribute('points', '');
    for (let i = 0; i < 4; i += 1) {
      $('scannerH' + i).setAttribute('cx', -100);
      $('scannerH' + i).setAttribute('cy', -100);
    }
    return;
  }
  ui.scannerPoly.setAttribute('points', mapped.map((p) => `${p.x},${p.y}`).join(' '));
  mapped.forEach((p, i) => {
    $('scannerH' + i).setAttribute('cx', p.x);
    $('scannerH' + i).setAttribute('cy', p.y);
  });
}

function shoot() {
  const c = ui.work;
  c.width = ui.video.videoWidth || 1280;
  c.height = ui.video.videoHeight || 720;
  c.getContext('2d').drawImage(ui.video, 0, 0, c.width, c.height);
  pages.push(c.toDataURL('image/jpeg', 0.94));
  pageHints.push(scaleQuadToSize(liveQuad, liveSize, c.width, c.height));
  thumbs();
  openReview(pages.length - 1, false);
}

function thumbs() {
  ui.count.textContent = pages.length;
  ui.doneBtn.style.visibility = pages.length ? 'visible' : 'hidden';
  ui.strip.innerHTML = pages.map((p, i) => `
    <div class="mini">
      <img src="${p}" onclick="openReview(${i},false)">
      <button onclick="event.stopPropagation();deletePage(${i})">x</button>
    </div>`).join('');
}

function deletePage(i) {
  pages.splice(i, 1);
  pageHints.splice(i, 1);
  thumbs();
}

function finishScan() {
  if (!pages.length) return closeCam();
  closeCam();
  stitch(pages).then((url) => {
    current = url;
    openForm();
  });
}

function uploadPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pages = [reader.result];
    pageHints = [null];
    uploadFlow = true;
    openReview(0, true);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function openReview(i, fromUpload) {
  idx = i;
  uploadFlow = fromUpload;
  rot = 0;
  enhanced = false;
  stopLiveDetection();
  img = new Image();
  img.onload = () => {
    ui.scanner.classList.remove('on');
    ui.review.classList.add('on');
    draw();
    detect(false);
    dragHandles();
    showToast('Hoeken automatisch gevonden. Controleer en bevestig.');
  };
  img.src = pages[i];
}

function backFromReview() {
  ui.review.classList.remove('on');
  if (!uploadFlow) {
    ui.scanner.classList.add('on');
    if (stream) startLiveDetection();
  }
}

function draw() {
  let w = img.width;
  let h = img.height;
  if (rot % 180) [w, h] = [h, w];
  ui.canvas.width = w;
  ui.canvas.height = h;
  const ctx = ui.canvas.getContext('2d');
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
  if (enhanced) {
    const image = ctx.getImageData(0, 0, w, h);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        pixels[i + c] = clamp(1.6 * (pixels[i + c] - 128) + 150, 0, 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
}

function rotate() {
  rot = (rot + 90) % 360;
  draw();
  detect(true);
}

function detect(manual) {
  const W = ui.canvas.width;
  const H = ui.canvas.height;
  const data = ui.canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const detected = autoDetectDocument(W, H, data);
  const hint = hintToDocument(pageHints[idx], W, H);
  quad = mergeDocumentCandidates(detected, hint, W, H).quad;
  paint();
  if (manual) showToast('Hoeken opnieuw gezocht');
}

function autoDetectDocument(W, H, data) {
  const contourDoc = detectContourDocument(W, H, data);
  if (contourDoc) return contourDoc;
  const brightDoc = detectBrightDocument(W, H, data);
  return brightDoc || defaultDocumentCrop(W, H);
}

function detectContourDocument(W, H, data) {
  const maxSize = 760;
  const scale = Math.min(1, maxSize / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const gray = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(H - 1, Math.round(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(W - 1, Math.round(x / scale));
      const i = (sy * W + sx) * 4;
      gray[y * w + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  const normalized = normalizeGrayForEdges(gray, w, h);
  const edge = new Uint8Array(w * h);
  const mags = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      const gx = -normalized[p - w - 1] + normalized[p - w + 1] - 2 * normalized[p - 1] + 2 * normalized[p + 1] - normalized[p + w - 1] + normalized[p + w + 1];
      const gy = -normalized[p - w - 1] - 2 * normalized[p - w] - normalized[p - w + 1] + normalized[p + w - 1] + 2 * normalized[p + w] + normalized[p + w + 1];
      mags.push(Math.hypot(gx, gy));
    }
  }
  mags.sort((a, b) => a - b);
  const threshold = Math.max(34, mags[Math.floor(mags.length * 0.8)] || 0);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      const gx = -normalized[p - w - 1] + normalized[p - w + 1] - 2 * normalized[p - 1] + 2 * normalized[p + 1] - normalized[p + w - 1] + normalized[p + w + 1];
      const gy = -normalized[p - w - 1] - 2 * normalized[p - w] - normalized[p - w + 1] + normalized[p + w - 1] + 2 * normalized[p + w] + normalized[p + w + 1];
      if (Math.hypot(gx, gy) >= threshold) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) edge[p + dy * w + dx] = 1;
        }
      }
    }
  }
  const seen = new Uint8Array(w * h);
  let best = null;
  const queue = [];
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const start = y * w + x;
      if (!edge[start] || seen[start]) continue;
      let count = 0;
      let minX = x, minY = y, maxX = x, maxY = y;
      queue.length = 0;
      queue.push(start);
      seen[start] = 1;
      for (let qi = 0; qi < queue.length; qi += 1) {
        const p = queue[qi];
        const px = p % w;
        const py = (p / w) | 0;
        count += 1;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        const ns = [p - 1, p + 1, p - w, p + w, p - w - 1, p - w + 1, p + w - 1, p + w + 1];
        for (const n of ns) {
          if (n > 0 && n < edge.length && edge[n] && !seen[n]) {
            seen[n] = 1;
            queue.push(n);
          }
        }
      }
      const bw = maxX - minX;
      const bh = maxY - minY;
      const area = bw * bh;
      const fill = count / Math.max(1, area);
      const touchesBorder = minX < 4 || minY < 4 || maxX > w - 5 || maxY > h - 5;
      if (!touchesBorder && count > 70 && area > w * h * 0.08 && fill > 0.02) {
        const score = area * Math.min(1.35, 0.65 + fill * 8);
        if (!best || score > best.score) best = { minX, minY, maxX, maxY, score };
      }
    }
  }
  if (!best) return null;
  const pad = Math.round(Math.min(w, h) * 0.018);
  const points = [];
  for (let y = Math.max(0, best.minY - pad); y <= Math.min(h - 1, best.maxY + pad); y += 1) {
    for (let x = Math.max(0, best.minX - pad); x <= Math.min(w - 1, best.maxX + pad); x += 1) {
      if (edge[y * w + x]) points.push([x / scale, y / scale]);
    }
  }
  return pointsToDocument(W, H, points, Math.round(Math.min(W, H) * 0.012));
}

function detectBrightDocument(W, H, data) {
  const step = Math.max(2, Math.floor(Math.min(W, H) / 420));
  const samples = [];
  const hits = [];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      samples.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }
  samples.sort((a, b) => a - b);
  const low = samples[Math.floor(samples.length * 0.18)] || 0;
  const high = samples[Math.floor(samples.length * 0.9)] || 255;
  const threshold = Math.max(145, low + (high - low) * 0.52);
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (luma >= threshold && (saturation < 92 || luma > 210)) hits.push([x, y]);
    }
  }
  return pointsToDocument(W, H, hits, Math.round(Math.min(W, H) * 0.018));
}

function normalizeGrayForEdges(gray, w, h) {
  const radius = Math.max(6, Math.round(Math.min(w, h) * 0.018));
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y += 1) {
    let row = 0;
    for (let x = 1; x <= w; x += 1) {
      row += gray[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x += 1) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)] - integral[y1 * (w + 1) + (x2 + 1)] - integral[(y2 + 1) * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      out[y * w + x] = gray[y * w + x] - sum / area + 128;
    }
  }
  return out;
}

function pointsToDocument(W, H, points, pad) {
  if (points.length < 40) return null;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  const sums = [];
  const diffs = [];
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    sums.push(x + y);
    diffs.push(x - y);
  });
  const rect = sanitizeCropRect(W, H, { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 });
  sums.sort((a, b) => a - b);
  diffs.sort((a, b) => a - b);
  const sumLow = sums[Math.floor(sums.length * 0.08)] || 0;
  const sumHigh = sums[Math.floor(sums.length * 0.92)] || 0;
  const diffLow = diffs[Math.floor(diffs.length * 0.08)] || 0;
  const diffHigh = diffs[Math.floor(diffs.length * 0.92)] || 0;
  const rough = expandQuad([
    averageCorner(points, ([x, y]) => x + y <= sumLow + pad * 1.5),
    averageCorner(points, ([x, y]) => x - y >= diffHigh - pad * 1.5),
    averageCorner(points, ([x, y]) => x + y >= sumHigh - pad * 1.5),
    averageCorner(points, ([x, y]) => x - y <= diffLow + pad * 1.5)
  ], W, H, pad);
  const better = regularizeDocumentQuad(refineQuadFromEdgePoints(rough, points, W, H, pad), W, H);
  if (!isValidQuad(W, H, better)) return rectToDocument(rect);
  return { rect: sanitizeCropRect(W, H, quadBounds(better)), quad: better };
}

function averageCorner(points, keep) {
  let sx = 0, sy = 0, n = 0;
  points.forEach((point) => {
    if (!keep(point)) return;
    sx += point[0];
    sy += point[1];
    n += 1;
  });
  return n ? { x: sx / n, y: sy / n } : null;
}

function refineQuadFromEdgePoints(inputQuad, points, W, H, pad) {
  if (!inputQuad || !inputQuad.every(Boolean)) return inputQuad;
  const ordered = orderQuad(inputQuad);
  const lines = [];
  const band = Math.max(pad * 2.4, Math.min(W, H) * 0.035);
  for (let i = 0; i < 4; i += 1) {
    const a = ordered[i];
    const b = ordered[(i + 1) % 4];
    const sidePoints = points.filter(([x, y]) => {
      const p = { x, y };
      const proj = projectToSegmentRatio(p, a, b);
      return proj >= -0.12 && proj <= 1.12 && pointLineDistance(p, a, b) <= band;
    });
    lines.push(sidePoints.length >= 18 ? fitLinePCA(sidePoints) : pointsToLine(a, b));
  }
  const refined = [];
  for (let i = 0; i < 4; i += 1) refined.push(intersectLines(lines[(i + 3) % 4], lines[i]) || ordered[i]);
  return expandQuad(refined, W, H, Math.max(2, Math.round(pad * 0.5)));
}

function mergeDocumentCandidates(primary, secondary, W, H) {
  const a = primary && isValidQuad(W, H, primary.quad) ? regularizeDocumentQuad(primary.quad, W, H) : null;
  const b = secondary && isValidQuad(W, H, secondary.quad) ? regularizeDocumentQuad(secondary.quad, W, H) : null;
  if (a && b) {
    const overlap = quadBoundsIoU(a, b);
    if (overlap > 0.55) {
      const merged = regularizeDocumentQuad(a.map((p, i) => ({ x: p.x * 0.6 + b[i].x * 0.4, y: p.y * 0.6 + b[i].y * 0.4 })), W, H);
      if (merged && isValidQuad(W, H, merged)) return { rect: sanitizeCropRect(W, H, quadBounds(merged)), quad: merged };
    }
    return { rect: sanitizeCropRect(W, H, quadBounds(a)), quad: a };
  }
  if (a) return { rect: sanitizeCropRect(W, H, quadBounds(a)), quad: a };
  if (b) return { rect: sanitizeCropRect(W, H, quadBounds(b)), quad: b };
  return primary || secondary || defaultDocumentCrop(W, H);
}

function hintToDocument(candidateQuad, W, H) {
  if (!candidateQuad) return null;
  const fixed = regularizeDocumentQuad(candidateQuad, W, H);
  return fixed ? { rect: sanitizeCropRect(W, H, quadBounds(fixed)), quad: fixed } : null;
}

function defaultCropRect(W, H) {
  const pad = Math.max(8, Math.round(Math.min(W, H) * 0.03));
  return { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
}

function sanitizeCropRect(W, H, rect) {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.min(W - x, Math.round(rect.w));
  const h = Math.min(H - y, Math.round(rect.h));
  const area = w * h;
  if (w < W * 0.32 || h < H * 0.32 || area < W * H * 0.22) return defaultCropRect(W, H);
  return { x, y, w, h };
}

function rectToQuad(rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ];
}

function rectToDocument(rect) {
  return { rect, quad: rectToQuad(rect) };
}

function defaultDocumentCrop(W, H) {
  return rectToDocument(defaultCropRect(W, H));
}

function quadBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function expandQuad(inputQuad, W, H, pad) {
  if (!inputQuad || !inputQuad.every(Boolean)) return null;
  const cx = inputQuad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = inputQuad.reduce((sum, p) => sum + p.y, 0) / 4;
  return inputQuad.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: clamp(p.x + dx / len * pad, 0, W), y: clamp(p.y + dy / len * pad, 0, H) };
  });
}

function regularizeDocumentQuad(points, W, H) {
  if (!points || !points.every(Boolean)) return null;
  const ordered = orderQuad(points).map((p) => ({ x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) }));
  return Math.abs(polyArea(ordered)) >= W * H * 0.14 ? ordered : null;
}

function isValidQuad(W, H, points) {
  if (!points || !points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  const area = Math.abs(polyArea(points));
  if (area < W * H * 0.2) return false;
  const top = dist(points[0], points[1]);
  const right = dist(points[1], points[2]);
  const bottom = dist(points[2], points[3]);
  const left = dist(points[3], points[0]);
  return Math.min(top, right, bottom, left) > Math.min(W, H) * 0.12;
}

function orderQuad(points) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const score = p.x + p.y;
    if (score < best) {
      best = score;
      start = i;
    }
  });
  const ordered = [];
  for (let i = 0; i < sorted.length; i += 1) ordered.push(sorted[(start + i) % sorted.length]);
  if (polyArea(ordered) < 0) ordered.reverse();
  return ordered;
}

function pointsToLine(a, b) {
  return { p: a, d: { x: b.x - a.x, y: b.y - a.y } };
}

function fitLinePCA(points) {
  let mx = 0, my = 0;
  points.forEach(([x, y]) => { mx += x; my += y; });
  mx /= points.length;
  my /= points.length;
  let xx = 0, xy = 0, yy = 0;
  points.forEach(([x, y]) => {
    const dx = x - mx;
    const dy = y - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  });
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  return { p: { x: mx, y: my }, d: { x: Math.cos(theta), y: Math.sin(theta) } };
}

function intersectLines(l1, l2) {
  if (!l1 || !l2) return null;
  const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(det) < 1e-6) return null;
  const dx = l2.p.x - l1.p.x;
  const dy = l2.p.y - l1.p.y;
  const t = (dx * l2.d.y - dy * l2.d.x) / det;
  return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
}

function pointLineDistance(p, a, b) {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
  return num / Math.max(1e-6, dist(a, b));
}

function projectToSegmentRatio(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

function quadBoundsIoU(a, b) {
  const ra = quadBounds(a);
  const rb = quadBounds(b);
  const x1 = Math.max(ra.x, rb.x);
  const y1 = Math.max(ra.y, rb.y);
  const x2 = Math.min(ra.x + ra.w, rb.x + rb.w);
  const y2 = Math.min(ra.y + ra.h, rb.y + rb.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = ra.w * ra.h + rb.w * rb.h - inter;
  return union > 0 ? inter / union : 0;
}

function scaleQuadToSize(points, size, targetW, targetH) {
  if (!points || !size || !size.width || !size.height) return null;
  const sx = targetW / size.width;
  const sy = targetH / size.height;
  return regularizeDocumentQuad(points.map((p) => ({ x: p.x * sx, y: p.y * sy })), targetW, targetH);
}

function mapQuadToVideoOverlay(points, size, video) {
  if (!points || !size || !video || !video.clientWidth || !video.clientHeight || !video.videoWidth || !video.videoHeight) return null;
  const viewW = video.clientWidth;
  const viewH = video.clientHeight;
  const videoAspect = video.videoWidth / video.videoHeight;
  const viewAspect = viewW / viewH;
  let renderW, renderH, offsetX, offsetY;
  if (videoAspect > viewAspect) {
    renderH = viewH;
    renderW = renderH * videoAspect;
    offsetX = (viewW - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = viewW;
    renderH = renderW / videoAspect;
    offsetX = 0;
    offsetY = (viewH - renderH) / 2;
  }
  return points.map((p) => ({ x: offsetX + p.x * (renderW / size.width), y: offsetY + p.y * (renderH / size.height) }));
}

function polyArea(points) {
  return points.reduce((sum, p, i) => {
    const n = points[(i + 1) % points.length];
    return sum + p.x * n.y - n.x * p.y;
  }, 0) / 2;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function paint() {
  if (!quad.length) return;
  const rect = ui.canvas.getBoundingClientRect();
  const stageRect = ui.stage.getBoundingClientRect();
  ui.overlay.style.left = (rect.left - stageRect.left) + 'px';
  ui.overlay.style.top = (rect.top - stageRect.top) + 'px';
  ui.overlay.style.width = rect.width + 'px';
  ui.overlay.style.height = rect.height + 'px';
  ui.overlay.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  const pts = quad.map((p) => [p.x * rect.width / ui.canvas.width, p.y * rect.height / ui.canvas.height]);
  ui.poly.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  pts.forEach(([x, y], i) => {
    const handle = $('h' + i);
    handle.setAttribute('cx', x);
    handle.setAttribute('cy', y);
    handle.style.pointerEvents = 'all';
  });
}

function dragHandles() {
  ui.overlay.style.pointerEvents = 'all';
  for (let i = 0; i < 4; i += 1) {
    $('h' + i).onpointerdown = (e) => {
      drag = i;
      e.preventDefault();
      ui.overlay.setPointerCapture(e.pointerId);
    };
  }
  ui.overlay.onpointermove = (e) => {
    if (drag < 0) return;
    const rect = ui.canvas.getBoundingClientRect();
    quad[drag] = {
      x: clamp((e.clientX - rect.left) * ui.canvas.width / rect.width, 0, ui.canvas.width),
      y: clamp((e.clientY - rect.top) * ui.canvas.height / rect.height, 0, ui.canvas.height)
    };
    paint();
  };
  ui.overlay.onpointerup = () => { drag = -1; };
  ui.overlay.onpointercancel = () => { drag = -1; };
}

function acceptCrop() {
  pages[idx] = warp(ui.canvas, quad);
  pageHints[idx] = null;
  thumbs();
  ui.review.classList.remove('on');
  if (uploadFlow) {
    current = pages[idx];
    openForm();
  } else {
    ui.scanner.classList.add('on');
    if (stream) startLiveDetection();
  }
}

function warp(src, points) {
  const top = dist(points[0], points[1]);
  const right = dist(points[1], points[2]);
  const bottom = dist(points[2], points[3]);
  const left = dist(points[3], points[0]);
  const rawW = Math.max(top, bottom);
  const rawH = Math.max(left, right);
  const scale = Math.min(1, 1700 / Math.max(rawW, rawH));
  const w = Math.max(1, Math.round(rawW * scale));
  const h = Math.max(1, Math.round(rawH * scale));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  const srcData = src.getContext('2d').getImageData(0, 0, src.width, src.height);
  const outData = ctx.createImageData(w, h);
  const m = matrix([{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }], points);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const z = m[6] * x + m[7] * y + 1;
      const sx = (m[0] * x + m[1] * y + m[2]) / z;
      const sy = (m[3] * x + m[4] * y + m[5]) / z;
      const color = sample(srcData, sx, sy);
      const i = (y * w + x) * 4;
      outData.data[i] = color[0];
      outData.data[i + 1] = color[1];
      outData.data[i + 2] = color[2];
      outData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(outData, 0, 0);
  return out.toDataURL('image/jpeg', 0.93);
}

function sample(image, x, y) {
  x = clamp(x, 0, image.width - 1);
  y = clamp(y, 0, image.height - 1);
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const dx = x - x0;
  const dy = y - y0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const px = (xx, yy) => image.data[(yy * image.width + xx) * 4 + c];
    const top = px(x0, y0) * (1 - dx) + px(x1, y0) * dx;
    const bottom = px(x0, y1) * (1 - dx) + px(x1, y1) * dx;
    out[c] = top * (1 - dy) + bottom * dy;
  }
  return out;
}

function matrix(a, b) {
  const A = [];
  const B = [];
  for (let i = 0; i < 4; i += 1) {
    const x = a[i].x, y = a[i].y, u = b[i].x, v = b[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }
  return solve(A, B) || [1, 0, 0, 0, 1, 0, 0, 0];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    if (Math.abs(M[pivot][col]) < 1e-9) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col];
    for (let j = col; j <= n; j += 1) M[col][j] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j += 1) M[row][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

function stitch(arr) {
  return new Promise((resolve) => {
    const imgs = [];
    let loaded = 0;
    arr.forEach((url, i) => {
      const im = new Image();
      im.onload = () => {
        imgs[i] = im;
        loaded += 1;
        if (loaded === arr.length) {
          const W = Math.max(...imgs.map((item) => item.width));
          const H = imgs.reduce((sum, item) => sum + item.height + 18, 0);
          const c = ui.work;
          const x = c.getContext('2d');
          c.width = W;
          c.height = H;
          x.fillStyle = '#eee';
          x.fillRect(0, 0, W, H);
          let y = 0;
          imgs.forEach((item) => {
            x.drawImage(item, (W - item.width) / 2, y);
            y += item.height + 18;
          });
          resolve(c.toDataURL('image/jpeg', 0.9));
        }
      };
      im.src = url;
    });
  });
}

function openForm() {
  ui.preview.src = current;
  ui.date.valueAsDate = new Date();
  ui.amount.value = '';
  ui.desc.value = '';
  ui.notes.value = '';
  ui.sheet.classList.add('on');
}

function saveExpense() {
  const amount = parseFloat(ui.amount.value);
  const desc = ui.desc.value.trim();
  if (!amount || !desc) return showToast('Vul bedrag en beschrijving in');
  expenses.unshift({ id: Date.now(), date: ui.date.value, amount, desc, cat: ui.cat.value, notes: ui.notes.value, img: current });
  localStorage.visaExpenses = JSON.stringify(expenses);
  ui.sheet.classList.remove('on');
  render();
  showToast('Uitgave toegevoegd');
}

function render() {
  ui.total.textContent = 'EUR ' + expenses.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2);
  ui.list.innerHTML = expenses.length ? expenses.map((item) => `
    <article class="expense">
      <div class="row">
        <div class="thumb">${item.img ? `<img src="${item.img}">` : 'Doc'}</div>
        <div class="body">
          <div class="line1"><div class="desc">${esc(item.desc)}</div><div class="amt">EUR ${Number(item.amount).toFixed(2)}</div></div>
          <div class="meta">${fmt(item.date)}</div>
          <span class="cat">${esc(item.cat)}</span>
          ${item.notes ? `<div class="note">${esc(item.notes)}</div>` : ''}
        </div>
      </div>
      <button class="del" onclick="deleteExpense(${item.id})">Verwijderen</button>
    </article>`).join('') : '<div class="empty">Nog geen uitgaven</div>';
}

function deleteExpense(id) {
  expenses = expenses.filter((item) => item.id !== id);
  localStorage.visaExpenses = JSON.stringify(expenses);
  render();
}

function fmt(value) {
  if (!value) return '';
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
