// PHP-compatible crc32() so the deterministic per-session choice shuffling and
// question paraphrasing behave exactly like the web version.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(str) {
  const s = String(str);
  let crc = 0xffffffff;
  for (let i = 0; i < s.length; i++) {
    crc = TABLE[(crc ^ s.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0; // unsigned, like PHP
}

module.exports = { crc32 };
