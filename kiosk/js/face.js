/* Camera + face detection/recognition on the tablet (face-api 1.7.15, models stored on the tablet). */
const faceapi = window.faceapi;
const L = window.KioskLogic;

let video = null, stream = null, detOpts = null;
const work = document.createElement('canvas');
const wctx = work.getContext('2d', { willReadFrequently: true });

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
  detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  return faceapi.tf.getBackend();
}

export async function startCamera(el) {
  video = el;
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  video.srcObject = stream;
  await video.play();
  return stream;
}
export function stopCamera() { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }
export function cameraOk() {
  if (!stream || !video) return false;
  const t = stream.getVideoTracks()[0];
  return !!t && t.readyState === 'live' && !t.muted && video.readyState >= 2;
}

/**
 * Finds faces and returns only the closest one (largest box), with landmarks and pose.
 * Faces of people waiting behind are smaller and are ignored.
 */
export async function closestFace() {
  if (!video || video.readyState < 2) return null;
  const all = await faceapi.detectAllFaces(video, detOpts).withFaceLandmarks();
  if (!all.length) return null;
  all.sort((a, b) => b.detection.box.area - a.detection.box.area);
  const f = all[0], box = f.detection.box;
  const p = L.pose(f.landmarks.positions);
  return { raw: f, box, score: f.detection.score, widthRatio: box.width / video.videoWidth, others: all.length - 1, ear: p.ear, yaw: p.yaw, roll: p.roll };
}

/** 128-number face descriptor of the aligned face. */
export async function describe(face) {
  const crops = await faceapi.extractFaces(video, [face.raw.alignedRect]);
  const d = await faceapi.computeFaceDescriptor(crops[0]);
  crops[0].remove && crops[0].remove();
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
