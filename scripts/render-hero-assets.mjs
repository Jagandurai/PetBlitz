/**
 * Renders the home-hero props (pet bed, rope toy, plush bone, ball) into transparent WebP files in public/hero.
 * They are small 3D renders (geometry + lighting + procedural fabric), so they can be regenerated or re-coloured here:
 *   node scripts/render-hero-assets.mjs
 */
import fs from "node:fs";
import sharp from "sharp";

const OUT = "public/hero";
const SS = 2; // supersampling for smooth edges

// ---------------------------------------------------------------- maths
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const spow = (v, p) => Math.sign(v) * Math.abs(v) ** p;

const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1440662683) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function noise(x, y, z = 0) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t), u = f(x - X), v = f(y - Y), w = f(z - Z);
  const l = (dz) => mix(mix(hash(X, Y, Z + dz), hash(X + 1, Y, Z + dz), u), mix(hash(X, Y + 1, Z + dz), hash(X + 1, Y + 1, Z + dz), u), v);
  return mix(l(0), l(1), w);
}
/** tilts a normal by the gradient of 3D noise, which reads as fabric relief */
function bump(n, p, freq, strength) {
  const e = 0.35, at = (q) => noise(q[0] * freq, q[1] * freq, q[2] * freq), c = at(p);
  const g = [at(add(p, [e, 0, 0])) - c, at(add(p, [0, e, 0])) - c, at(add(p, [0, 0, e])) - c];
  return norm(sub(n, mul(sub(g, mul(n, dot(g, n))), strength / e)));
}

// ---------------------------------------------------------------- lighting (warm key from the upper left, matching the hero)
const KEY = norm([-0.55, 0.75, 0.5]), FILL = norm([0.7, 0.25, 0.4]);
function light(base, n, { ao = 1, sheen = 0, view = [0, 0.44, 0.9], gloss = 0 } = {}) {
  const key = clamp((dot(n, KEY) + 0.35) / 1.35), fill = clamp(dot(n, FILL)), sky = 0.5 + 0.5 * n[1];
  const edge = (1 - clamp(dot(n, view))) ** 2.5 * sheen;
  const spec = gloss ? clamp(dot(n, norm(add(KEY, view)))) ** 24 * gloss : 0;
  const warm = [1.03, 1, 0.95];
  return base.map((c, i) => clamp((c * (0.4 + 0.68 * key * warm[i] + 0.1 * fill + 0.12 * sky) * ao + 255 * (edge * 0.28 + spec)) / 255) * 255);
}

// ---------------------------------------------------------------- tiny rasteriser: parametric surfaces + z-buffer
const E = (24 * Math.PI) / 180, COS = Math.cos(E), SIN = Math.sin(E);
const project = ([x, y, z]) => { const k = 1 + z * 0.00035; return [x * k, (-y * COS + z * SIN) * k, z * COS + y * SIN]; };

function canvas(w, h, ox, oy, scale) {
  const W = Math.round(w * scale * SS), H = Math.round(h * scale * SS);
  return { W, H, ox, oy, k: scale * SS, w: Math.round(w * scale), h: Math.round(h * scale), depth: new Float32Array(W * H).fill(-1e9), rgb: new Float32Array(W * H * 3), a: new Float32Array(W * H), front: new Float32Array(W * H) };
}
/** surface(u, v) -> position; shade({p, n, u, v}) -> { color, front? } */
function draw(c, surface, shade, nu, nv, { flip = false } = {}) {
  const grid = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = surface(u, v), e = 1e-4;
    let n = norm(cross(sub(surface(u + e, v), surface(u - e, v)), sub(surface(u, v + e), surface(u, v - e))));
    if (flip) n = mul(n, -1);
    const s = project(p);
    grid.push({ x: (s[0] + c.ox) * c.k, y: (s[1] + c.oy) * c.k, d: s[2], p, n, u, v });
  }
  const tri = (A, B, C) => {
    const area = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    if (Math.abs(area) < 1e-9) return;
    for (let y = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y))); y <= Math.min(c.H - 1, Math.ceil(Math.max(A.y, B.y, C.y))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x))); x <= Math.min(c.W - 1, Math.ceil(Math.max(A.x, B.x, C.x))); x++) {
        const px = x + 0.5, py = y + 0.5;
        const wa = ((B.x - px) * (C.y - py) - (C.x - px) * (B.y - py)) / area, wb = ((C.x - px) * (A.y - py) - (A.x - px) * (C.y - py)) / area, wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const i = y * c.W + x, d = wa * A.d + wb * B.d + wc * C.d;
        if (d <= c.depth[i]) continue;
        const f = (k, m) => wa * A[k][m] + wb * B[k][m] + wc * C[k][m];
        const out = shade({ p: [f("p", 0), f("p", 1), f("p", 2)], n: norm([f("n", 0), f("n", 1), f("n", 2)]), u: wa * A.u + wb * B.u + wc * C.u, v: wa * A.v + wb * B.v + wc * C.v });
        c.depth[i] = d; c.rgb.set(out.color, i * 3); c.a[i] = 1; c.front[i] = out.front ?? 0;
      }
  };
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = grid[j * (nu + 1) + i], b = grid[j * (nu + 1) + i + 1], d = grid[(j + 1) * (nu + 1) + i], e = grid[(j + 1) * (nu + 1) + i + 1];
    tri(a, b, e); tri(a, e, d);
  }
}
async function save(c, name, mask) {
  const buf = Buffer.alloc(c.W * c.H * 4);
  for (let i = 0; i < c.W * c.H; i++) {
    for (let k = 0; k < 3; k++) buf[i * 4 + k] = c.rgb[i * 3 + k];
    buf[i * 4 + 3] = Math.round(c.a[i] * (mask ? mask[i] : 1) * 255);
  }
  const info = await sharp(buf, { raw: { width: c.W, height: c.H, channels: 4 } }).resize(c.w, c.h, { kernel: "lanczos3" }).webp({ quality: 86, alphaQuality: 95, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  console.log(`${name}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------- pet bed (units = puppy stage pixels)
const OLIVE = hex("#647645"), OLIVE_D = hex("#465936"), CREAM = hex("#F4E5CB"), BADGE = hex("#D9B58C"), PAW = hex("#89562F");
const A = 228, B = 106, TUBE = 52, TAU = Math.PI * 2;
const SEAM = 1.22, BASE = -0.62; // cross-section angles (radians): olive/cream piping, and the darker base band

const bolsterHeight = (t) => 112 - 44 * ((Math.sin(t) + 1) / 2) ** 1.4;
function bolster(u, v) {
  const t = u * TAU, a = v * TAU - Math.PI / 2; // a = 0 outside, PI/2 top, PI inside
  const H = bolsterHeight(t), cx = A * spow(Math.cos(t), 0.9), cz = B * spow(Math.sin(t), 0.9);
  const out = norm([Math.cos(t) / A, 0, Math.sin(t) / B]);
  const crease = Math.exp(-(((a - SEAM) / 0.055) ** 2)) * 0.075 + Math.exp(-(((a - BASE) / 0.06) ** 2)) * 0.05;
  const inner = smooth(SEAM + 0.15, SEAM + 0.6, a) * (1 - smooth(3.5, 4.1, a));
  const gather = inner * (noise(Math.cos(t) * 17, Math.sin(t) * 17, a * 1.6) - 0.5) * 0.11;
  const soft = (noise(Math.cos(t) * 5, Math.sin(t) * 5, a * 2.2) - 0.5) * 0.05;
  const k = 1 - crease + gather + soft;
  const d = TUBE * spow(Math.cos(a), 0.78) * k, y = H / 2 + (H / 2) * spow(Math.sin(a), 0.78) * k;
  return [cx + out[0] * d, y, cz + out[2] * d];
}

function pawMask(x, y) { // paw centred on 0,0, about 24 units wide
  const el = (cx, cy, rx, ry) => 1 - smooth(0.85, 1.08, Math.hypot((x - cx) / rx, (y - cy) / ry));
  return Math.max(el(0, -4, 7.2, 5.8), el(-9, 2.5, 3.1, 3.9), el(-3.4, 7.8, 3.1, 4.1), el(3.4, 7.8, 3.1, 4.1), el(9, 2.5, 3.1, 3.9));
}

function shadeBolster({ p, n, u, v }) {
  const t = u * TAU, a = v * TAU - Math.PI / 2, H = bolsterHeight(t), front = smooth(0.02, 0.4, Math.sin(t));
  const cream = a > SEAM && a < 4.2;
  const ao = clamp(0.5 + 0.5 * smooth(-4, H * 0.42, p[1])) * (cream ? 0.78 + 0.22 * smooth(H * 0.3, H * 0.95, p[1]) : 1);
  let color;
  if (cream) { // sherpa plush
    const tuft = noise(p[0] * 0.42, p[1] * 0.42, p[2] * 0.42), fine = noise(p[0] * 1.1, p[1] * 1.1, p[2] * 1.1);
    const base = lerp3(mul(CREAM, 0.93), mul(CREAM, 1.03), tuft * 0.6 + fine * 0.4);
    color = light(base, bump(bump(n, p, 0.3, 2.1), p, 0.95, 0.55), { ao, sheen: 0.5 });
  } else { // woven olive fabric
    const weave = (Math.sin(t * 760) * Math.sin(a * 150) + 1) / 2, fleck = noise(p[0] * 0.85, p[1] * 0.85, p[2] * 0.85), cloud = noise(p[0] * 0.06, p[1] * 0.06, p[2] * 0.06);
    let base = lerp3(mul(OLIVE, 0.9), mul(OLIVE, 1.14), weave * 0.42 + fleck * 0.46 + cloud * 0.12);
    if (a < BASE) base = lerp3(mul(OLIVE_D, 0.88), mul(OLIVE_D, 1.1), weave * 0.5 + fleck * 0.5);
    color = light(base, bump(bump(n, p, 0.75, 0.5), p, 0.07, 3.2), { ao, sheen: 0.32 });
  }
  const arc = t * 190;
  for (const [at, offset] of [[SEAM, -0.13], [BASE, 0.14]]) {
    const piping = Math.exp(-(((a - at) / 0.038) ** 2));
    color = lerp3(color, light(OLIVE_D, n, { ao }), clamp(piping * 1.1));
    const thread = Math.exp(-(((a - at - offset) / 0.018) ** 2)) * smooth(0.25, 0.4, Math.abs((arc % 9) / 9 - 0.5) < 0.28 ? 1 : 0);
    color = lerp3(color, light(hex("#d9d2ae"), n, { ao }), thread * 0.7);
  }
  // leather badge with a paw, on the front face
  if (Math.sin(t) > 0.8 && a < SEAM && a > BASE) {
    const x = p[0] - 4, y = p[1] - 33;
    const box = (hw, hh, r) => { const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
    const d = box(41, 20, 8);
    color = mul(color, 1 - 0.32 * Math.exp(-(((d - 2) / 2.6) ** 2)) * (d > 0 ? 1 : 0));
    if (d < 0.6) {
      const grain = noise(p[0] * 0.7, p[1] * 0.7, 3), flat = norm([n[0], n[1] * 0.6, n[2]]);
      let leather = light(lerp3(mul(BADGE, 0.93), mul(BADGE, 1.07), grain), bump(flat, p, 0.55, 0.5), { gloss: 0.08, ao: 1 - 0.18 * smooth(-4, 0, d) });
      const stitch = Math.exp(-(((d + 4) / 0.8) ** 2)) * (((Math.atan2(y * 2, x) * 44) / TAU) % 1 > -0.45 && Math.abs(((x + y) % 6)) < 3.6 ? 1 : 0);
      leather = lerp3(leather, light(hex("#8a6440"), flat), stitch * 0.85);
      leather = lerp3(leather, light(PAW, flat, { gloss: 0.05 }), pawMask(x, y + 0.5));
      color = lerp3(color, leather, 1 - smooth(-0.6, 0.6, d));
    }
  }
  return { color, front };
}

function cushion(u, v) {
  const t = u * TAU, r = Math.max(v, 0.001), x = (A - 24) * r * spow(Math.cos(t), 0.9), z = (B - 14) * r * spow(Math.sin(t), 0.9);
  return [x, 30 + 20 * (1 - r * r) ** 0.7 + (noise(x * 0.028, z * 0.045, 7) - 0.5) * 9 * (1 - r * 0.5), z];
}
function shadeCushion({ p, n, v }) {
  const up = n[1] < 0 ? mul(n, -1) : n, tuft = noise(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4), fine = noise(p[0] * 1.05, p[2] * 1.05, 11);
  const base = lerp3(mul(CREAM, 0.94), mul(CREAM, 1.03), tuft * 0.55 + fine * 0.45);
  return { color: light(base, bump(bump(up, p, 0.28, 2), p, 0.9, 0.55), { ao: 1 - 0.34 * smooth(0.55, 1, v), sheen: 0.35 }) };
}

async function bed() {
  // canvas is 600 x 250 stage units with the bed's floor centre at (300, 162); rendered at 2px per unit
  const c = canvas(600, 250, 300, 162, 2);
  draw(c, cushion, shadeCushion, 300, 70);
  draw(c, bolster, shadeBolster, 900, 190, { flip: true });
  await save(c, "bed");
  await save(c, "bed-front", c.front); // identical pixels, limited to the near rim: it sits in front of the puppy
}

// ---------------------------------------------------------------- rope toy
const bezier = (P, t) => { const m = 1 - t; return [0, 1, 2].map((i) => m * m * m * P[0][i] + 3 * m * m * t * P[1][i] + 3 * m * t * t * P[2][i] + t * t * t * P[3][i]); };
function tube(P, radius, { plies = 0, twist = 0 } = {}) {
  return (u, v) => {
    const q = bezier(P, u), tan = norm(sub(bezier(P, u + 1e-3), bezier(P, u - 1e-3))), s = norm(cross(tan, [0, 0, 1])), w = cross(s, tan), a = v * TAU;
    const r = (typeof radius === "function" ? radius(u) : radius) * (plies ? 0.8 + 0.2 * Math.abs(Math.sin((a * plies + u * twist) / 2)) ** 0.45 : 1);
    return add(q, add(mul(s, Math.cos(a) * r), mul(w, Math.sin(a) * r)));
  };
}
const yarn = (pick) => ({ p, n, u, v }) => {
  const fibre = noise(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9), strand = (Math.sin((v * 46 + u * 190) * TAU) + 1) / 2;
  const { color, ao = 1 } = pick(u, v);
  return { color: light(mul(color, 0.9 + 0.13 * fibre + 0.07 * strand), bump(n, p, 0.8, 0.75), { ao, sheen: 0.25 }) };
};

async function rope() {
  const c = canvas(280, 150, 140, 84, 2.4), GREEN = hex("#6c8355"), IVORY = hex("#efe3c9"), SAGE = hex("#a9bb97");
  const path = [[-70, 18, 0], [-24, 62, 22], [20, -6, -6], [72, 34, 8]];
  const plied = (u, v, plies, twist) => { const x = (v * TAU * plies + u * twist) / TAU, i = ((Math.floor(x) % plies) + plies) % plies; return { color: [IVORY, GREEN, SAGE][i], ao: 0.66 + 0.34 * Math.abs(Math.sin(x * Math.PI)) ** 0.5 }; };
  draw(c, tube(path, 15, { plies: 3, twist: 74 }), yarn((u, v) => plied(u, v, 3, 74)), 520, 90);
  for (const [end, dir] of [[0, -1], [1, 1]]) {
    const q = bezier(path, end), tan = norm(sub(bezier(path, end ? 1 : 0.02), bezier(path, end ? 0.98 : 0)));
    const axis = mul(tan, dir);
    for (let i = 0; i < 46; i++) { // frayed tassel
      const jitter = (k) => hash(i, k, end + 5) - 0.5, from = add(q, mul(axis, 22));
      const tip = add(from, add(mul(axis, 26 + 18 * hash(i, 4, end)), [jitter(1) * 40, jitter(2) * 38 - 4, jitter(3) * 34]));
      const P = [add(from, [jitter(5) * 12, jitter(6) * 12, jitter(7) * 12]), add(from, add(mul(axis, 12), [jitter(8) * 16, jitter(9) * 14, 0])), add(tip, [jitter(10) * 8, 5, 0]), tip];
      const tone = hash(i, 11, end) > 0.72 ? GREEN : hash(i, 12, end) > 0.5 ? SAGE : IVORY;
      draw(c, tube(P, (u) => 2.7 * (1 - u * 0.45)), yarn(() => ({ color: tone, ao: 0.8 + 0.2 * jitter(13) + 0.1 })), 40, 10);
    }
    const centre = add(q, mul(axis, 6)), side = norm(cross(axis, [0, 0, 1])), up = cross(side, axis);
    const knot = (u, v) => { // wound knot: a ridged ellipsoid
      const lon = u * TAU, lat = (v - 0.5) * Math.PI, ridge = 1 + 0.085 * Math.abs(Math.sin(lon * 2.5 + lat * 5)) ** 0.5 - 0.05;
      return add(centre, add(mul(axis, Math.sin(lat) * 20 * ridge), add(mul(side, Math.cos(lat) * Math.cos(lon) * 25 * ridge), mul(up, Math.cos(lat) * Math.sin(lon) * 25 * ridge))));
    };
    draw(c, knot, yarn((u, v) => { const x = u * 5 + v * 5; return { color: Math.floor(x) % 3 === 1 ? GREEN : IVORY, ao: 0.68 + 0.32 * Math.abs(Math.sin(x * Math.PI)) ** 0.4 }; }), 150, 90, { flip: true });
  }
  await save(c, "rope");
}

// ---------------------------------------------------------------- per-pixel props (inflated shape / sphere)
async function perPixel(name, w, h, scale, shade) {
  const c = canvas(w, h, w / 2, h / 2, scale);
  for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
    const out = shade((x + 0.5) / c.k - c.ox, c.oy - (y + 0.5) / c.k);
    if (!out) continue;
    const i = y * c.W + x; c.rgb.set(out.color, i * 3); c.a[i] = out.alpha ?? 1;
  }
  await save(c, name);
}

function boneSdf(x, y) {
  const smin = (a, b, k) => { const t = clamp(0.5 + (0.5 * (b - a)) / k); return mix(b, a, t) - k * t * (1 - t); };
  const bar = Math.hypot(x - clamp(x, -46, 46), y) - 19;
  let d = bar;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) d = smin(d, Math.hypot(x - sx * 54, y - sy * 17) - 23, 7);
  return d;
}
const plushBone = () => perPixel("plush-bone", 170, 100, 3, (x, y) => {
  const R = 25, wob = (noise(x * 0.35, y * 0.35, 2) - 0.5) * 1.1, d = boneSdf(x, y) + wob * 0.5;
  if (d > 0.4) return null;
  const height = (px, py) => { const t = clamp(-boneSdf(px, py) / R); return R * Math.sqrt(t * (2 - t)) - 3.2 * Math.exp(-(((boneSdf(px, py) + 8) / 1.5) ** 2)); };
  const e = 0.6, p = [x, y, height(x, y)];
  let n = norm([height(x - e, y) - height(x + e, y), height(x, y - e) - height(x, y + e), 2 * e]);
  n = bump(bump(n, p, 0.45, 1.5), p, 1.25, 0.6);
  const mottled = noise(x * 0.16, y * 0.16, 9), fuzz = noise(x * 1.3, y * 1.3, 4);
  let color = light(lerp3(hex("#d9ab6c"), hex("#edc78e"), mottled * 0.55 + fuzz * 0.45), n, { sheen: 0.55, view: [0, 0, 1], ao: 0.8 + 0.2 * smooth(0, 12, -d) });
  const stitch = Math.exp(-(((boneSdf(x, y) + 8) / 0.75) ** 2)) * ((Math.atan2(y, x * 0.45) * 17 + 100) % 1 < 0.62 ? 1 : 0);
  color = lerp3(color, light(hex("#8f6234"), n, { view: [0, 0, 1] }), stitch * 0.8);
  return { color, alpha: 1 - smooth(-0.5, 0.4, d) };
});

const SEAM_POINTS = Array.from({ length: 700 }, (_, i) => { const t = (i / 700) * TAU, a = 0.72, b = 0.28; return norm([a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t)]); });
const TILT = [norm([0.76, 0.35, 0.55]), null, norm([-0.45, -0.28, 0.85])];
TILT[1] = norm(cross(TILT[2], TILT[0])); TILT[0] = cross(TILT[1], TILT[2]);
const ball = () => perPixel("ball", 108, 108, 3, (x, y) => {
  const R = 48, edge = (noise(Math.atan2(y, x) * 42, 3, 1) - 0.5) * 1.7, r = Math.hypot(x, y);
  if (r > R + edge + 0.5) return null;
  const nz = Math.sqrt(Math.max(0, 1 - (r / (R + 1)) ** 2)), n = norm([x / (R + 1), y / (R + 1), nz]), p = mul(n, R);
  const local = TILT.map((axis) => dot(n, axis));
  let near = 9; for (const q of SEAM_POINTS) { const d = (q[0] - local[0]) ** 2 + (q[1] - local[1]) ** 2 + (q[2] - local[2]) ** 2; if (d < near) near = d; }
  const seam = Math.sqrt(near) * R, felt = noise(p[0] * 0.95, p[1] * 0.95, p[2] * 0.95), speck = noise(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4);
  let base = lerp3(hex("#71873f"), hex("#98ad5c"), felt * 0.65 + speck * 0.35);
  base = lerp3(base, lerp3(hex("#e8dcbd"), hex("#fbf3da"), felt), 1 - smooth(2.6, 3.5, seam));
  base = mul(base, 1 - 0.24 * Math.exp(-(((seam - 3.9) / 0.9) ** 2)));
  return { color: light(base, bump(bump(n, p, 0.7, 1.1), p, 1.5, 0.45), { sheen: 0.6, view: [0, 0, 1] }), alpha: 1 - smooth(-0.9, 0.5, r - R - edge) };
});

fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
for (const [name, fn] of Object.entries({ bed, rope, plushBone, ball })) if (!only || only === name) await fn();
