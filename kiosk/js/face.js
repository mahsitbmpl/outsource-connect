/* Camera + face detection/recognition on the tablet (face-api 1.7.15, models stored on the tablet).
 * v3.1: lighter camera (640x480), lighter detector while idle, warm-up at start, frozen-picture check, graphics-reset alarm, timings. */
const faceapi = window.faceapi;
const L = window.KioskLogic;

let video = null, stream = null, detIdle = null, detScan = null;
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });
export const stats = { detectMs: 0, recogMs: 0, camRes: '' };
const ema = (old, v) => (old ? old * 0.8 + v * 0.2 : v);

export async function loadModels(onProgress) {
  try { await faceapi.tf.setBackend('webgl'); } catch (e) { await faceapi.tf.setBackend('cpu'); }
  await faceapi.tf.ready();
  onProgress && onProgress(1);
  await faceapi.nets.tinyFaceDetector.loadFromUri('models');
  onProgress && onProgress(2);
  await faceapi.nets.faceLandmark68Net.loadFromUri('models');
  onProgress && onProgress(3);
  await faceapi.nets.faceRecognitionNet.loadFromUri('models');
  onProgress && onProgress(4);
  detIdle = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 }); // waiting: quick look, about half the work
  detScan = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });  // someone in front: full accuracy
  return faceapi.tf.getBackend();
}

/** Runs each model once on a blank picture so the first person of the day is not slow (the graphics chip prepares its programs). */
export async function warmUp() {
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, 320, 240);
  try {
    await faceapi.detectAllFaces(c, detIdle);
    await faceapi.detectAllFaces(c, detScan);
    const crop = document.createElement('canvas'); crop.width = 150; crop.height = 150; crop.getContext('2d').drawImage(c, 0, 0, 150, 150);
    await faceapi.computeFaceDescriptor(crop);
    await faceapi.nets.faceLandmark68Net.detectLandmarks(crop);
  } catch (e) { /* warm-up is only a speed-up */ }
}

/** Calls cb if the browser resets the graphics chip (then the page must reload). */
export function onGraphicsLost(cb) {
  try {
    const b = faceapi.tf.backend(), canvas = b && b.gpgpu && b.gpgpu.gl && b.gpgpu.gl.canvas;
    if (canvas) canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb(); }, { once: true });
  } catch (e) { /* cpu backend */ }
}
export function tensors() { try { return faceapi.tf.memory().numTensors; } catch (e) { return 0; } }

export async function startCamera(el) {
  video = el;
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
  } catch (e) {
    if (e && e.name === 'NotAllowedError') throw e;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user' } });
  }
  video.srcObject = stream;
  video.muted = true; video.playsInline = true;
  await Promise.race([video.play(), new Promise((r) => setTimeout(r, 4000))]);
  lastT = -1; sameT = 0;
  const t = stream.getVideoTracks()[0], st = t && t.getSettings ? t.getSettings() : {};
  stats.camRes = (st.width || video.videoWidth || '?') + 'x' + (st.height || video.videoHeight || '?');
  return stream;
}
export function stopCamera() { if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* already stopped */ } }); stream = null; }
let lastT = -1, sameT = 0;
/** Camera is delivering moving pictures (not stopped, not paused, not frozen). Call every few seconds. */
export function cameraOk() {
  if (!stream || !video) return false;
  const t = stream.getVideoTracks()[0];
  if (!t || t.readyState !== 'live' || t.muted || video.readyState < 2) return false;
  if (video.paused) { video.play().catch(() => {}); return false; }
  const ct = video.currentTime;
  sameT = ct === lastT ? sameT + 1 : 0; lastT = ct;
  return sameT < 2; // the same frame for two checks in a row = frozen picture
}
export function resumeVideo() { if (video && video.paused) return video.play().catch(() => {}); return Promise.resolve(); }

/**
 * Finds faces and returns only the closest one (largest box), with landmarks and pose.
 * Faces of people waiting behind are smaller and are ignored.
 */
export const testHooks = { hang: false }; // automated test only: simulates a detection call that never finishes
export async function closestFace(quick) {
  if (!video || video.readyState < 2 || video.paused) return null;
  if (testHooks.hang) return new Promise(() => {});
  const t0 = performance.now();
  const all = await faceapi.detectAllFaces(video, quick ? detIdle : detScan).withFaceLandmarks();
  stats.detectMs = ema(stats.detectMs, performance.now() - t0);
  if (!all.length) return null;
  all.sort((a, b) => b.detection.box.area - a.detection.box.area);
  const f = all[0], box = f.detection.box;
  const p = L.pose(f.landmarks.positions);
  return { raw: f, box, score: f.detection.score, widthRatio: box.width / video.videoWidth, others: all.length - 1, ear: p.ear, yaw: p.yaw, roll: p.roll };
}

/** 128-number face descriptor of the aligned face. */
export async function describe(face) {
  const t0 = performance.now();
  const crops = await faceapi.extractFaces(video, [face.raw.alignedRect]);
  const d = await faceapi.computeFaceDescriptor(crops[0]);
  crops.forEach((c) => { c.width = 0; c.height = 0; }); // free the canvas memory at once
  stats.recogMs = ema(stats.recogMs, performance.now() - t0);
  return d;
}

/** Brightness and sharpness of the face area (for enrollment quality checks). */
export function quality(face) {
  const b = face.box, size = 96;
  work.width = size; work.height = size;
  wctx.drawImage(video, b.x, b.y, b.width, b.height, 0, 0, size, size);
  const grey = L.toGrey(wctx.getImageData(0, 0, size, size).data);
  return { brightness: L.brightness(grey), sharpness: L.sharpness(grey, size, size) };
}

/** Proof photo of the whole frame (small JPEG as data URL). */
export function snapshot(width, q) {
  const w = width || 320, h = Math.round(w * video.videoHeight / video.videoWidth);
  work.width = w; work.height = h;
  wctx.drawImage(video, 0, 0, w, h);
  return work.toDataURL('image/jpeg', q || 0.6);
}
/** Square face thumbnail with a margin (for the result screen and the console). */
export function thumbnail(face, size) {
  const b = face.box, m = b.width * 0.35;
  const x = Math.max(0, b.x - m), y = Math.max(0, b.y - m * 1.2), s = Math.min(video.videoWidth - x, video.videoHeight - y, b.width + 2 * m);
  work.width = size || 128; work.height = size || 128;
  wctx.drawImage(video, x, y, s, s, 0, 0, work.width, work.height);
  return work.toDataURL('image/jpeg', 0.75);
}
