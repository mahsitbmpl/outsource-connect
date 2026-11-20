/* ===== 01b Fast SHA-256 / HMAC / PBKDF2 in plain JavaScript =====
 * Utilities.computeHmacSha256Signature costs ~0.3 ms per call on Google's servers, so 2,000 calls took seconds.
 * This version runs inside the script with no service calls. Output is identical (checked against Node crypto in tests).
 */
var FastHash = (function () {
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var W = new Int32Array(64);

  /** Processes one 64-byte block (bytes[off..off+63]) into state (Int32Array 8). */
  function block(st, bytes, off) {
    var i, t1, t2;
    for (i = 0; i < 16; i++) W[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var x = W[i - 15], y = W[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
    for (i = 0; i < 64; i++) {
      t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + b) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + d) | 0;
    st[4] = (st[4] + e) | 0; st[5] = (st[5] + f) | 0; st[6] = (st[6] + g) | 0; st[7] = (st[7] + h) | 0;
  }
  /** Finishes a hash: state already holds `prefixLen` bytes (a multiple of 64); msg is the rest. Returns 32 bytes. */
  function finish(state, msg, prefixLen) {
    var st = new Int32Array(state), n = msg.length, total = prefixLen + n;
    var padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
    padded.set(msg); padded[n] = 0x80;
    var bits = total * 8, L = padded.length;
    padded[L - 4] = (bits >>> 24) & 255; padded[L - 3] = (bits >>> 16) & 255; padded[L - 2] = (bits >>> 8) & 255; padded[L - 1] = bits & 255;
    padded[L - 5] = Math.floor(bits / 4294967296) & 255;
    for (var off = 0; off < L; off += 64) block(st, padded, off);
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) { out[4 * i] = st[i] >>> 24; out[4 * i + 1] = (st[i] >>> 16) & 255; out[4 * i + 2] = (st[i] >>> 8) & 255; out[4 * i + 3] = st[i] & 255; }
    return out;
  }
  function sha256(bytes) { return finish(new Int32Array(IV), bytes, 0); }
  /** HMAC key schedule done once; returns a function msg -> 32-byte MAC. */
  function hmacFor(key) {
    if (key.length > 64) key = sha256(key);
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { var k = i < key.length ? key[i] : 0; ipad[i] = k ^ 0x36; opad[i] = k ^ 0x5c; }
    var ist = new Int32Array(IV), ost = new Int32Array(IV);
    block(ist, ipad, 0); block(ost, opad, 0);
    return function (msg) { return finish(ost, finish(ist, msg, 64), 64); };
  }
  /** PBKDF2-HMAC-SHA256, one 32-byte block. password and salt are byte arrays (0..255). */
  function pbkdf2(password, salt, iterations) {
    var mac = hmacFor(Uint8Array.from(password));
    var s = new Uint8Array(salt.length + 4); s.set(salt); s[salt.length + 3] = 1;
    var u = mac(s), t = new Uint8Array(u);
    for (var i = 1; i < iterations; i++) { u = mac(u); for (var j = 0; j < 32; j++) t[j] ^= u[j]; }
    return t;
  }
  return { sha256: sha256, hmacFor: hmacFor, pbkdf2: pbkdf2 };
})();
