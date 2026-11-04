// renderedLookCore.js — what a rendered look draws and how, with nothing imported: the shader, the
// specs a part's properties make, and the function that draws one image on a canvas.
//
// utils/renderedLook.js keeps the editor's side of it (a store of images, a queue, the bake at
// export). This half has no imports so that a bare page can load it as it is: the export tools in
// tools/scripts bake a saved panel's images in headless Chromium, which has WebGL where node has
// none, and they draw them with this exact code, so a baked image is the one the editor drew.
//
// Three kinds of part are drawn (docs/design/changeable-control-sets.md, piece E):
//   - a knob's plates (housing, skirt, cap, insert): a turned body, smooth, knurled or fluted;
//   - a fader's cap: a block, a rounded box the size of the cap, or, for a round cap, a turned body;
//   - a button's or a switch's housing, guard, key and indicator: a block, or a turned body where the
//     part is a circle.

export const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes;
uniform float uFrame;     // width of the panel seen, in control units
uniform float uAngle;     // the control turned clockwise, radians
uniform int uShape;       // 0 knurled, 1 fluted, 2 chicken-head, 3 fader cap, 4 button, 5 smooth skirted, 6 block
uniform vec3 uBody; uniform vec3 uTop; uniform vec3 uMark; uniform vec3 uLens;
uniform int uBodyMat; uniform int uTopMat;   // 0 spun metal, 1 metal, 2 gloss plastic, 3 satin plastic, 4 rubber
uniform float uCount; uniform float uDepth; uniform float uTaper; uniform float uHeight;
uniform int uTopKind;     // 0 flat, 1 insert, 2 dome, 3 ridged, 4 dish
uniform vec2 uBox;        // a block's half width and half length
uniform float uCorner;    // a block's corner radius, seen from above
uniform int uAxis;        // a block's ridges: 0 one after another along y, 1 along x
uniform int uLit;
uniform vec3 uLamp;       // towards the key light
uniform int uSpp;
uniform int uShowMark;  // 0: the indicator is a part of its own, not painted on

const float PI = 3.14159265;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float sdTrapezoid(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he); vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
// A turned body: radius r1 at z0, r2 at z1, its edges rounded by rb.
float sdTurned(vec3 p, float rr, float r1, float r2, float z0, float z1, float rb) {
  float he = 0.5 * (z1 - z0);
  return sdTrapezoid(vec2(rr, p.z - z0 - he), r1 - rb, r2 - rb, he - rb) - rb;
}
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdUnevenCapsule(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h; float a = sqrt(1.0 - b * b); float k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

// The scene: x = distance, y = material (1 body, 2 top, 3 mark, 4 lens).
vec2 map(vec3 p) {
  vec2 res = vec2(1e9, 0.0);
  p.xy = rot(uAngle) * p.xy;
  float rr = length(p.xy);
  float ang = atan(p.y, p.x);
  float H = uHeight;
  if (uShape == 0 || uShape == 1 || uShape == 5) {
    // The skirt, then the body, then the top.
    float body;
    if (uShape == 0) {
      // Knurled: a triangle wave round the side, between a chamfer at the foot and one at the top.
      float t = fract(ang * uCount / (2.0 * PI));
      float ridge = uDepth * (1.0 - abs(t - 0.5) * 2.0);
      float band = smoothstep(0.05, 0.08, p.z) * (1.0 - smoothstep(H - 0.07, H - 0.04, p.z));
      body = sdTurned(p, rr + ridge * band, 0.47, 0.47 - uTaper, 0.0, H, 0.045);
      float skirt = sdTurned(p, rr, 0.5, 0.48, 0.0, 0.045, 0.012);
      body = min(body, skirt);
    } else {
      float s = 0.5 - 0.5 * cos(ang * uCount);
      float band = smoothstep(0.08, 0.11, p.z) * (1.0 - smoothstep(H - 0.06, H - 0.03, p.z));
      float groove = uShape == 1 ? uDepth * pow(s, 0.6) * band : 0.0;
      body = sdTurned(p, rr + groove, 0.40, 0.40 - uTaper, 0.03, H, 0.03);
      float skirt = sdTurned(p, rr, 0.5, 0.485, 0.0, 0.055, 0.015);
      body = min(body, skirt);
    }
    res = vec2(body * 0.75, 1.0);
    if (uTopKind == 1) {
      float topR = (uShape == 0 ? 0.47 - uTaper : 0.40 - uTaper) - 0.11;
      float insert = sdTurned(p, rr, topR, topR - 0.008, H - 0.01, H + 0.008, 0.004);
      if (insert < res.x) res = vec2(insert, 2.0);
    } else if (uTopKind == 2) {
      float dome = length(p - vec3(0.0, 0.0, H - 0.55)) - 0.62;
      dome = max(dome, -(p.z - H + 0.02));
      float topR = (uShape == 0 ? 0.47 - uTaper : 0.40 - uTaper) - 0.02;
      dome = max(dome, rr - topR);
      if (dome < res.x) res = vec2(dome, 2.0);
    }
  } else if (uShape == 2) {
    float hub = sdTurned(p, rr, 0.25, 0.235, 0.0, 0.14, 0.02);
    float top = 0.38 - 0.14 * max(0.0, p.y) / 0.48;
    float rb = 0.06;
    float d2 = sdUnevenCapsule(p.xy, 0.25 - rb, 0.035, 0.45);
    vec2 w = vec2(d2, max(0.06 + rb - p.z, p.z - (top - rb)));
    float wing = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - rb;
    res = vec2(min(hub, wing) * 0.85, 1.0);
  } else if (uShape == 3) {
    float cap = sdRoundBox(p - vec3(0.0, 0.0, 0.15), vec3(0.21, 0.35, 0.15), 0.05);
    for (int i = 0; i < 4; i++) {
      float y = i == 0 ? -0.22 : i == 1 ? -0.11 : i == 2 ? 0.11 : 0.22;
      cap = min(cap, sdRoundBox(p - vec3(0.0, y, 0.305), vec3(0.2, 0.0175, 0.015), 0.012));
    }
    res = vec2(cap, 1.0);
  } else if (uShape == 4) {
    float b = sdRoundBox(p - vec3(0.0, 0.0, 0.11), vec3(0.4, 0.4, 0.11), 0.08);
    res = vec2(b, 1.0);
    float lens = sdRoundBox(p - vec3(0.0, 0.24, 0.225), vec3(0.15, 0.05, 0.015), 0.012);
    if (lens < res.x) res = vec2(lens, 4.0);
  } else if (uShape == 6) {
    // A block: a fader cap or a key. Its plan a rectangle uBox (half sizes) with corners uCorner,
    // H tall, its edges rounded, narrower at its top by uTaper; its top flat, with an insert, ridged
    // across its travel, a dome or a dish.
    float k = 1.0 - uTaper * clamp(p.z / max(H, 1e-3), 0.0, 1.0);
    vec2 hb = uBox * k;
    float rc = min(uCorner * k, min(hb.x, hb.y) - 0.002);
    float re = min(0.035, H * 0.3);
    vec2 dq = abs(p.xy) - hb + rc;
    float plan = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - rc;
    vec2 w = vec2(plan + re, abs(p.z - H * 0.5) - H * 0.5 + re);
    float body = (min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - re) * 0.8;
    if (uTopKind == 3) {
      float along = uAxis == 1 ? p.x : p.y;
      float across = uAxis == 1 ? p.y : p.x;
      float span = max((uAxis == 1 ? hb.x : hb.y) - rc - 0.01, 0.01);
      float reach = max((uAxis == 1 ? hb.y : hb.x) - 0.035, 0.005);
      float pitch = 2.0 * span / max(uCount, 1.0);
      float u = mod(along + span, pitch) - 0.5 * pitch;
      float cut = max(max(abs(u) - pitch * 0.2, abs(across) - reach), max(H - uDepth - p.z, abs(along) - span));
      body = max(body, -cut);
    } else if (uTopKind == 4) {
      body = max(body, -sdEllipsoid(p - vec3(0.0, 0.0, H), vec3(hb * 0.86, max(uDepth, 0.004))) * 0.8);
    }
    res = vec2(body, 1.0);
    if (uTopKind == 2) {
      float dome = sdEllipsoid(p - vec3(0.0, 0.0, H - 0.004), vec3(hb - rc * 0.25, max(uDepth, 0.006))) * 0.8;
      dome = max(dome, H - 0.012 - p.z);
      if (dome < res.x) res = vec2(dome, 2.0);
    } else if (uTopKind == 1) {
      float inset = min(hb.x, hb.y) * 0.22;
      vec2 ib = max(hb - inset, vec2(0.004));
      float plate = sdRoundBox(p - vec3(0.0, 0.0, H + 0.002), vec3(ib, 0.006), min(max(rc - inset, 0.004), min(ib.x, ib.y) - 0.001));
      if (plate < res.x) res = vec2(plate, 2.0);
    }
  }
  return res;
}

// Painted marks, read off the surface: the indicator line, the chicken-head's inlay, the fader's line.
bool markAt(vec3 p) {
  if (uShowMark == 0) return false;
  vec3 q = p; q.xy = rot(uAngle) * q.xy;
  if (uShape == 0 || uShape == 1 || uShape == 5) {
    float topR = (uShape == 0 ? 0.47 - uTaper : 0.40 - uTaper);
    return q.z > uHeight - 0.012 && abs(q.x) < 0.016 && q.y > (uTopKind == 1 ? 0.04 : topR * 0.25) && q.y < topR - 0.035;
  }
  if (uShape == 2) {
    float top = 0.38 - 0.14 * max(0.0, q.y) / 0.48;
    return q.z > top - 0.03 && abs(q.x) < 0.014 && q.y > 0.07 && q.y < 0.38;
  }
  if (uShape == 3) return q.z > 0.27 && abs(q.y) < 0.02;
  return false;
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0); const float e = 0.0006;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}

float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0; float t = 0.004;
  for (int i = 0; i < 64; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, k * h / t);
    t += clamp(h, 0.004, 0.08);
    if (res < 0.002 || t > 2.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 1; i <= 5; i++) {
    float h = 0.012 * float(i);
    occ += (h - map(p + n * h).x) * sca; sca *= 0.75;
  }
  return clamp(1.0 - 3.5 * occ, 0.0, 1.0);
}

vec3 sky(vec3 d) {
  // A dim studio: dark below the horizon, light overhead, a softbox where the key light is.
  vec3 c = mix(vec3(0.07), vec3(0.42, 0.43, 0.45), smoothstep(-0.35, 0.85, d.z));
  c += vec3(2.4) * pow(max(dot(d, uLamp), 0.0), 12.0);
  c += vec3(0.5, 0.52, 0.56) * pow(max(dot(d, normalize(vec3(2.2, -1.2, 2.0))), 0.0), 10.0);
  return c;
}

float D_GGX(float nh, float a) { float a2 = a * a; float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float D_aniso(vec3 h, vec3 n, vec3 t, vec3 b, float at, float ab) {
  float th = dot(t, h) / at, bh = dot(b, h) / ab, nh = dot(n, h);
  float d = th * th + bh * bh + nh * nh;
  return 1.0 / (PI * at * ab * d * d);
}
float G_Smith(float nv, float nl, float a) { float k = a * 0.5; return (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k)); }
vec3 F_Schlick(vec3 f0, float vh) { return f0 + (1.0 - f0) * pow(1.0 - vh, 5.0); }

struct Mat { vec3 albedo; float metal; float rough; float coat; float aniso; vec3 emit; };

Mat materialOf(int kind, vec3 colour) {
  Mat m; m.albedo = colour; m.metal = 0.0; m.rough = 0.4; m.coat = 0.0; m.aniso = 0.0; m.emit = vec3(0.0);
  if (kind == 0) { m.metal = 1.0; m.rough = 0.22; m.aniso = 1.0; }
  else if (kind == 1) { m.metal = 1.0; m.rough = 0.24; }
  else if (kind == 2) { m.rough = 0.22; m.coat = 1.0; }
  else if (kind == 3) { m.rough = 0.38; m.coat = 0.3; }
  else if (kind == 4) { m.rough = 0.62; }
  return m;
}

vec3 shade(vec3 p, vec3 n, vec3 v, float id) {
  Mat m;
  if (id == 4.0) {
    m = materialOf(2, uLens);
    if (uLit == 1) { m.emit = uLens * 3.0; m.albedo = uLens * 0.6; } else { m.albedo = uLens * 0.15; }
  } else if (markAt(p)) {
    m = materialOf(3, uMark); m.coat = 0.0; m.rough = 0.5;
  } else if (id == 2.0) {
    m = materialOf(uTopMat, uTop);
  } else {
    // The top face of a turned knob without an insert is the top material too.
    bool turned = uShape == 0 || uShape == 1 || uShape == 5;
    // A block's top is the top material: its face, and the ridges or the dish cut in it.
    bool carved = uShape == 6 && (uTopKind == 3 || uTopKind == 4);
    bool blockTop = uShape == 6 && (carved ? (p.z > uHeight - uDepth - 0.006 && n.z > 0.2) : (p.z > uHeight - 0.02 && n.z > 0.85));
    if ((turned && n.z > 0.92 && p.z > uHeight - 0.03) || blockTop) m = materialOf(uTopMat, uTop); else m = materialOf(uBodyMat, uBody);
  }
  // Lathe marks on a spun top: rings in the normal, and roughness drawn out across them.
  vec3 radial = normalize(vec3(p.xy + 1e-5, 0.0));
  vec3 tangent = vec3(-radial.y, radial.x, 0.0);
  if (m.aniso > 0.0 && n.z > 0.9) n = normalize(n + radial * 0.035 * sin(length(p.xy) * 900.0));
  vec3 f0 = mix(vec3(0.04), m.albedo, m.metal);
  float nv = max(dot(n, v), 1e-4);
  vec3 col = vec3(0.0);
  vec3 L[3]; L[0] = uLamp; L[1] = normalize(vec3(2.2, -1.2, 2.0)); L[2] = normalize(vec3(0.0, 2.6, 0.9));
  vec3 C[3]; C[0] = vec3(3.4); C[1] = vec3(0.55, 0.57, 0.62); C[2] = vec3(0.45);
  float shadow = softShadow(p + n * 0.003, uLamp, 10.0);
  for (int i = 0; i < 3; i++) {
    vec3 l = L[i]; vec3 h = normalize(l + v);
    float nl = max(dot(n, l), 0.0); if (nl <= 0.0) continue;
    float vis = i == 0 ? shadow : 1.0;
    float a = max(m.rough * m.rough, 0.02) + 0.04; // the lights have a size: wider than a point
    float D = m.aniso > 0.0 && n.z > 0.9 ? D_aniso(h, n, tangent, normalize(cross(n, tangent)), a * 0.45, a * 2.4) : D_GGX(max(dot(n, h), 0.0), a);
    vec3 F = F_Schlick(f0, max(dot(v, h), 0.0));
    vec3 spec = D * G_Smith(nv, nl, a) * F / max(4.0 * nv * nl, 1e-4);
    vec3 diff = (1.0 - F) * (1.0 - m.metal) * m.albedo / PI;
    col += (diff + spec) * C[i] * nl * vis;
    if (m.coat > 0.0) {
      float Dc = D_GGX(max(dot(n, h), 0.0), 0.06);
      col += m.coat * Dc * 0.04 * C[i] * nl * vis * 0.25;
    }
  }
  float ao = ambientOcclusion(p, n);
  vec3 r = reflect(-v, n);
  vec3 Fr = F_Schlick(f0, nv);
  // The studio in reflection, blurred with roughness by mixing towards its average.
  vec3 env = mix(sky(r), vec3(0.18), clamp(m.rough * 1.6, 0.0, 1.0));
  col += env * Fr * ao * (1.0 - 0.5 * m.rough);
  if (m.coat > 0.0) col += m.coat * sky(r) * F_Schlick(vec3(0.04), nv).x * ao;
  col += (1.0 - m.metal) * m.albedo * mix(0.08, 0.34, n.z * 0.5 + 0.5) * ao;
  col += m.emit;
  return col;
}

vec3 tonemap(vec3 x) {
  x *= 0.9;
  vec3 c = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return pow(c, vec3(1.0 / 2.2));
}

vec4 trace(vec2 uv) {
  // The camera as far from a wide image as from a square one of its larger side.
  float D = 2.4 * uFrame * max(1.0, uRes.x / uRes.y);
  vec3 ro = vec3(0.0, 0.0, D);
  vec3 target = vec3((uv - 0.5) * uFrame * vec2(uRes.x / uRes.y, 1.0), 0.0);
  vec3 rd = normalize(target - ro);
  // Start where the ray comes down to the top of anything there is.
  float t = (ro.z - 0.7) / -rd.z;
  for (int i = 0; i < 220; i++) {
    vec3 p = ro + rd * t;
    if (p.z < -0.001) break;
    vec2 h = map(p);
    if (h.x < 0.0004) {
      vec3 n = calcNormal(p);
      return vec4(shade(p, n, -rd, h.y), 1.0);
    }
    t += h.x;
  }
  // The panel under it: transparent, but for the shadow and the occlusion the control casts.
  float tp = ro.z / -rd.z;
  vec3 p = ro + rd * tp;
  float sh = softShadow(p + vec3(0.0, 0.0, 0.002), uLamp, 9.0);
  float ao = ambientOcclusion(p, vec3(0.0, 0.0, 1.0));
  float a = clamp((1.0 - sh) * 0.62 + (1.0 - ao) * 0.5, 0.0, 0.85);
  return vec4(0.0, 0.0, 0.0, a);
}

void main() {
  vec4 acc = vec4(0.0);
  int n = uSpp;
  for (int i = 0; i < 4; i++) {
    for (int j = 0; j < 4; j++) {
      if (i >= n || j >= n) continue;
      vec2 o = (vec2(float(i), float(j)) + 0.5) / float(n) - 0.5;
      vec2 uv = (gl_FragCoord.xy + o) / uRes;
      vec4 c = trace(uv);
      acc += vec4(tonemap(c.rgb) * c.a, c.a);
    }
  }
  acc /= float(n * n);
  outColor = acc; // premultiplied
}`;



export const SHAPES = { knurled: 0, fluted: 1, chicken: 2, fader: 3, button: 4, smooth: 5, block: 6 };
export const MATERIALS = { spun: 0, metal: 1, gloss: 2, satin: 3, rubber: 4 };
export const TOPS = { flat: 0, insert: 1, dome: 2, ridged: 3, dish: 4 };

/** The choices a plate's rendered look takes, as the Knob tab offers them. */
export const RENDERED_PROFILES = [['smooth', 'Smooth'], ['knurled', 'Knurled'], ['fluted', 'Fluted']];
export const RENDERED_MATERIALS = [['spun', 'Spun metal'], ['metal', 'Brushed metal'], ['gloss', 'Gloss plastic'], ['satin', 'Satin plastic'], ['rubber', 'Rubber']];
export const RENDERED_TOPS = [['flat', 'Flat'], ['insert', 'Insert'], ['dome', 'Dome']];
/** A block's tops: a fader cap's or a key's. */
export const RENDERED_BLOCK_TOPS = [['flat', 'Flat'], ['insert', 'Insert'], ['ridged', 'Ridged'], ['dome', 'Dome'], ['dish', 'Dish']];

/** How much wider than the body the image is: the cast shadow falls past its edge. */
export const RENDERED_FRAME = 1.3;
/** The same room, for a part that is not square: added to each side's share of the larger. */
export const RENDERED_MARGIN = RENDERED_FRAME - 1;

/** A button's or a switch's device frame, in its drawing's units (models/buttonDeviceParts.js DEVICE_FRAME). */
export const RENDERED_DEVICE_FRAME = { width: 160, height: 80 };
/** A meter's, as models/meterDeviceParts.js METER_FRAME. */
export const RENDERED_METER_FRAME = { width: 160, height: 100 };

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const r3 = (value) => Math.round(value * 1000) / 1000;
const hex6 = (colour, fallback) => {
  const raw = String(colour ?? '').replace('#', '').trim();
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return fallback;
};

/** The set's lamp ({ azimuth, elevation } in degrees, as setEditing.js keeps it) as a direction. */
export function lampDirection(lamp) {
  const az = (num(lamp?.azimuth, 225) * Math.PI) / 180;
  const el = (clamp(num(lamp?.elevation, 48), 5, 90) * Math.PI) / 180;
  // The azimuth runs as SVG's does, y down; the shader's y is up.
  return [Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), Math.sin(el)].map((v) => Math.round(v * 1000) / 1000);
}

/**
 * What a plate's rendered look draws: its properties read, defaulted and bounded. `colour` and
 * `topColour` are the resolved body and top colours (a role resolved by the caller), `lamp` the set's.
 */
export function renderedLookSpec(part, { colour = 'FFC9CCD0', topColour = null, lamp = null } = {}) {
  const profile = ['smooth', 'knurled', 'fluted'].includes(part?.renderProfile) ? part.renderProfile : 'smooth';
  return {
    shape: profile,
    body: hex6(colour, '#C9CCD0'),
    top: hex6(topColour ?? part?.renderTopColour ?? colour, '#D6D8DB'),
    bodyMaterial: Object.hasOwn(MATERIALS, part?.renderMaterial) ? part.renderMaterial : 'metal',
    topMaterial: Object.hasOwn(MATERIALS, part?.renderTopMaterial) ? part.renderTopMaterial : 'spun',
    count: Math.round(clamp(num(part?.renderCount, profile === 'fluted' ? 18 : 72), 3, 160)),
    // Depth, taper and height in % of the body's radius, as the Knob tab shows them; the shader's
    // unit is the body's diameter.
    depth: clamp(num(part?.renderDepth, profile === 'fluted' ? 10 : 4), 0, 30) / 200,
    taper: clamp(num(part?.renderTaper, 8), 0, 40) / 200,
    height: clamp(num(part?.renderHeight, 80), 20, 160) / 200,
    topKind: Object.hasOwn(TOPS, part?.renderTop) && TOPS[part.renderTop] <= 2 ? part.renderTop : 'flat',
    lamp: lampDirection(lamp),
  };
}

const BLOCK_TOP_IDS = RENDERED_BLOCK_TOPS.map(([id]) => id);

/**
 * What a block's rendered look draws: a fader cap's or a key's. `width` and `length` are its size
 * on screen (any unit; only their ratio is kept), `axis` the way its ridges follow one another (along
 * a fader's travel). Height, corner and depth are percentages of its narrower side (corner and depth
 * of half of it), as a fader cap's and a key's fields show them; the shader's unit is its larger side.
 */
export function renderedBlockSpec(part, { width = 1, length = 1, axis = 'y', corner = 30, height = 60, colour = 'FF2A2D31', topColour = null, lamp = null } = {}) {
  const w = Math.max(1e-3, num(width, 1));
  const l = Math.max(1e-3, num(length, 1));
  const big = Math.max(w, l);
  const narrow = Math.min(w, l) / big;
  return {
    shape: 'block',
    body: hex6(colour, '#2A2D31'),
    top: hex6(topColour ?? part?.renderTopColour ?? colour, '#3A3D42'),
    bodyMaterial: Object.hasOwn(MATERIALS, part?.renderMaterial) ? part.renderMaterial : 'satin',
    topMaterial: Object.hasOwn(MATERIALS, part?.renderTopMaterial) ? part.renderTopMaterial : 'satin',
    width: r3(w / big),
    length: r3(l / big),
    corner: r3((clamp(num(part?.renderCorner, corner), 0, 100) / 100) * (narrow / 2)),
    height: r3(Math.min(0.65, (clamp(num(part?.renderHeight, height), 10, 200) / 100) * narrow)),
    taper: r3(clamp(num(part?.renderTaper, 6), 0, 40) / 100),
    topKind: BLOCK_TOP_IDS.includes(part?.renderTop) ? part.renderTop : 'flat',
    count: Math.round(clamp(num(part?.renderCount, 5), 1, 40)),
    depth: r3((clamp(num(part?.renderDepth, 12), 0, 60) / 100) * (narrow / 2)),
    axis: axis === 'x' ? 'x' : 'y',
    lamp: lampDirection(lamp),
  };
}

const RECT_CAPS = ['bar', 'console', 'block'];
const ROUND_CAPS = ['dot', 'lens', 'glass'];

/**
 * A fader cap's spec, as SliderFamilyRenderer's capGeometry sizes it: `Layout.width` along the
 * travel, `Layout.height` across it; a round cap is a turned body. Null for a cap that is a line or
 * a ring, which a render does not draw.
 */
export function renderedCapSpec(part, { vertical = true, colour, topColour = null, lamp = null } = {}) {
  const kind = String(part?.kind ?? 'dot').toLowerCase();
  if (ROUND_CAPS.includes(kind)) return renderedLookSpec(part, { colour, topColour, lamp });
  if (!RECT_CAPS.includes(kind)) return null;
  const along = Math.max(2, num(part?._children?.Layout?.width, 20));
  const across = Math.max(2, num(part?._children?.Layout?.height, 20));
  return renderedBlockSpec(part, {
    width: vertical ? across : along, length: vertical ? along : across, axis: vertical ? 'y' : 'x',
    corner: kind === 'block' ? 30 : 36, height: 60, colour, topColour, lamp,
  });
}

/**
 * A button's or a switch's part's spec, from its box in the device frame (a percentage of it, as
 * ButtonDeviceParts places it): a circle is a turned body, anything else a block with the part's
 * corner radius.
 */
export function renderedDevicePartSpec(part, { colour, topColour = null, lamp = null, frame = RENDERED_DEVICE_FRAME, height = 30 } = {}) {
  const layout = part?._children?.Layout ?? {};
  const w = (num(layout.width, 0) / 100) * frame.width;
  const h = (num(layout.height, 0) / 100) * frame.height;
  if (w <= 0 || h <= 0) return null;
  const shape = String(part?.shape ?? 'rect');
  if (shape === 'ellipse' && Math.abs(w - h) / Math.max(w, h) < 0.08) return renderedLookSpec(part, { colour, topColour, lamp });
  const radius = num(part?._children?.Background?._children?.Corners?.radius, 0);
  const corner = shape === 'ellipse' ? 100 : Math.min(100, (radius / (Math.min(w, h) / 2)) * 100);
  return renderedBlockSpec(part, { width: w, length: h, axis: w >= h ? 'x' : 'y', corner, height, colour, topColour, lamp });
}

/**
 * A meter's housing or clip lamp, from its box in the meter's frame: a housing is a low block (a
 * bezel, its face and scale drawn over it), a round lamp a turned body.
 */
export function renderedMeterPartSpec(part, { colour, topColour = null, lamp = null, name = 'housing' } = {}) {
  return renderedDevicePartSpec(part, { colour, topColour, lamp, frame: RENDERED_METER_FRAME, height: name === 'housing' ? 12 : 30 });
}

/** The image's size in the shader's units (the part's larger side is 1), its shadow's room included. */
export function renderedFrame(spec) {
  return { w: num(spec?.width, 1) + RENDERED_MARGIN, h: num(spec?.length, 1) + RENDERED_MARGIN };
}

/** The angle to draw a turning grooved body at: its turn within one groove's repeat, in eight steps. */
export function renderedTurn(spec, degrees) {
  if (spec.shape === 'smooth' || spec.shape === 'block') return 0;
  const period = 360 / Math.max(1, spec.count);
  const within = ((num(degrees, 0) % period) + period) % period;
  return Math.round((within / period) * 8) % 8 * (period / 8);
}

/** The turns a part's image is needed at: eight through one groove's repeat if it turns, else one. */
export function renderedTurns(spec, turns) {
  if (!turns || spec.shape === 'smooth' || spec.shape === 'block') return [0];
  const period = 360 / Math.max(1, spec.count);
  return Array.from({ length: 8 }, (_, i) => i * (period / 8));
}

/** The cache key of one image: its spec, its size in device pixels and its turn. */
export function renderedLookKey(spec, size, angle = 0) {
  return JSON.stringify([spec, Math.round(size), Math.round(angle * 1000) / 1000]);
}

/** The key a baked image is kept under: its spec and its turn. */
export function renderedBakeKey(spec, angle = 0) {
  return JSON.stringify([spec, Math.round(angle * 1000) / 1000]);
}

const KNOB_PLATES = ['bodyHousing', 'bodySkirt', 'bodyCap', 'bodyInsert'];
const FADER_CAPS = ['pointerStart', 'pointerCurrent', 'pointerEnd'];
const DEVICE_PARTS = ['housing', 'guard', 'key', 'indicator'];
const METER_PARTS = ['housing', 'lamp'];

/**
 * Every image a control's rendered parts need, as `[{ spec, angle }]`: the control as it is DRAWN
 * (its set's family applied and its colour roles resolved, models/controlSetFamilies.js
 * resolveControlForSet), so the specs are the ones its renderer asks for and a baked image is found.
 * A key that lights up when on needs its lit colour too.
 */
export function renderedLookJobs(control, { lamp = null, resolveColour = (value) => value } = {}) {
  const children = control?._children ?? {};
  // A component's parts are its layers: each draws its own (layerRenderedJobs), a state's colour too.
  if (String(children.Core?.controlType ?? '') === 'CustomComponent') return layerRenderedJobs(control, { lamp, resolveColour });
  const parts = children.Parts?._children ?? {};
  const circular = String(children.Behavior?.geometry ?? '') === 'circular';
  const vertical = String(children.Behavior?.orientation ?? 'vertical') === 'vertical';
  const jobs = [];
  const fillOf = (part) => part?._children?.Background?._children?.Fill?.colour;
  for (const [name, part] of Object.entries(parts)) {
    if (String(part?.look ?? '') !== 'rendered' || part?.visible === false) continue;
    const topColour = part?.renderTopColour || null;
    if (KNOB_PLATES.includes(name)) {
      const spec = renderedLookSpec(part, { colour: fillOf(part), topColour, lamp });
      for (const angle of renderedTurns(spec, part?.turns === true)) jobs.push({ spec, angle });
    } else if (FADER_CAPS.includes(name) && !circular && children.Behavior) {
      const spec = renderedCapSpec(part, { vertical, colour: fillOf(part), topColour, lamp });
      if (spec) jobs.push({ spec, angle: 0 });
    } else if (children.Meter && METER_PARTS.includes(name)) {
      // A meter's housing and clip lamp; a lamp that lights needs its lit colour too. One the meter's
      // zones colour draws as it always did (editor/MeterDeviceParts.svelte), so it needs none.
      if (String(part?.zoneColours ?? 'off') !== 'off') continue;
      for (const colour of [fillOf(part), name === 'lamp' ? String(part?.activeColour ?? '').trim() || null : null].filter(Boolean)) {
        const spec = renderedMeterPartSpec(part, { colour, topColour, lamp, name });
        if (spec) jobs.push({ spec, angle: 0 });
      }
    } else if (DEVICE_PARTS.includes(name)) {
      for (const colour of [fillOf(part), String(part?.activeColour ?? '').trim() || null].filter(Boolean)) {
        const spec = renderedDevicePartSpec(part, { colour, topColour, lamp });
        if (spec) jobs.push({ spec, angle: 0 });
      }
    }
  }
  return jobs;
}

// --- a component's layers drawn rendered (utils/layerRenderedLook.js says what a layer carries) -------

/** Whether a layer draws a rendered look. */
export function layerIsRendered(part) {
  return String(part?.look ?? '') === 'rendered';
}

/**
 * The spec of a rendered layer `width` by `height` pixels, its body `colour` (resolved), lit by `lamp`,
 * or null when it draws none.
 */
export function layerRenderedSpec(part, { width, height, colour, topColour = null, lamp = null }) {
  if (!layerIsRendered(part) || !(width > 0) || !(height > 0)) return null;
  const top = topColour ?? (part?.renderTopColour || null);
  if (String(part?.renderShape ?? 'round') === 'block') {
    return renderedBlockSpec(part, {
      width, length: height, axis: part?.renderAxis === 'x' || part?.renderAxis === 'y' ? part.renderAxis : (width >= height ? 'x' : 'y'),
      corner: num(part?.renderCorner, 30), height: num(part?.renderHeight, 30), colour, topColour: top, lamp,
    });
  }
  return renderedLookSpec(part, { colour, topColour: top, lamp });
}

/**
 * Where a rendered layer's image goes in its `width` by `height` box, `{ spec, angle, x, y, w, h }`:
 * centred on the box, the frame's room for its cast shadow about it; turned to `rotation` when its
 * light stays put.
 */
export function layerRenderedPlacement(part, { width, height, rotation = 0, colour, topColour = null, lamp = null }) {
  const spec = layerRenderedSpec(part, { width, height, colour, topColour, lamp });
  if (!spec) return null;
  let w;
  let h;
  if (spec.shape === 'block') {
    const big = Math.max(width, height);
    const frame = renderedFrame(spec);
    w = frame.w * big;
    h = frame.h * big;
  } else {
    // A turned body: the frame about the box's larger side, as the panel sizes a round part's image.
    w = Math.max(width, height) * RENDERED_FRAME;
    h = w;
  }
  const angle = part?.meta?.fixedLight === true ? renderedTurn(spec, num(part?.meta?.renderTurn, 0) + num(rotation, 0)) : 0;
  return { spec, angle, x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * Every image a component's rendered layers need, `[{ spec, angle }]`, for an exported panel to bake:
 * each layer at its box, in its colour and in each colour a state gives it, and at each step of a
 * groove's repeat if it turns. `resolveColour` turns a role into the colour it draws.
 */
export function layerRenderedJobs(component, { lamp = null, resolveColour = (value) => value } = {}) {
  const parts = component?._children?.Parts?._children ?? {};
  const states = Object.values(component?._children?.States?._children ?? {});
  const jobs = [];
  for (const [name, part] of Object.entries(parts)) {
    if (!layerIsRendered(part)) continue;
    const layout = part?._children?.Layout ?? {};
    const width = num(layout.width, 0);
    const height = num(layout.height, 0);
    const colours = new Set([part?._children?.Background?._children?.Fill?.colour]);
    for (const state of states) {
      const patch = state?.patches?.parts?.[name];
      if (patch?.['Background.Fill.colour'] !== undefined) colours.add(patch['Background.Fill.colour']);
    }
    for (const colour of colours) {
      const spec = layerRenderedSpec(part, { width, height, colour: resolveColour(colour), topColour: part?.renderTopColour ? resolveColour(part.renderTopColour) : null, lamp });
      if (!spec) continue;
      for (const angle of renderedTurns(spec, part?.meta?.fixedLight === true)) jobs.push({ spec, angle });
    }
  }
  return jobs;
}

/** sRGB hex to the linear values the shader lights. */
function linear(hex) {
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

/**
 * A function that draws one image on `canvas` with WebGL2 and returns it as a PNG data URL:
 * `(spec, size, angle)`, `size` the image's larger side in pixels. Null where WebGL2 is missing.
 */
export function createRenderedLookRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, antialias: false });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  const u = (name) => gl.getUniformLocation(prog, name);
  return (spec, size, angle = 0) => {
    const frame = renderedFrame(spec);
    const perUnit = size / Math.max(frame.w, frame.h);
    const cw = Math.max(1, Math.round(frame.w * perUnit));
    const ch = Math.max(1, Math.round(frame.h * perUnit));
    canvas.width = cw; canvas.height = ch;
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const [lx, ly, lz] = spec.lamp;
    gl.uniform2f(u('uRes'), cw, ch);
    gl.uniform1f(u('uFrame'), frame.h);
    gl.uniform1f(u('uAngle'), (angle * Math.PI) / 180);
    gl.uniform1i(u('uShape'), SHAPES[spec.shape] ?? 5);
    gl.uniform3fv(u('uBody'), linear(spec.body));
    gl.uniform3fv(u('uTop'), linear(spec.top));
    gl.uniform3fv(u('uMark'), [0, 0, 0]);
    gl.uniform3fv(u('uLens'), [0, 0, 0]);
    gl.uniform1i(u('uBodyMat'), MATERIALS[spec.bodyMaterial] ?? 1);
    gl.uniform1i(u('uTopMat'), MATERIALS[spec.topMaterial] ?? 0);
    gl.uniform1f(u('uCount'), spec.count);
    gl.uniform1f(u('uDepth'), spec.depth);
    gl.uniform1f(u('uTaper'), spec.taper);
    gl.uniform1f(u('uHeight'), spec.height);
    gl.uniform1i(u('uTopKind'), TOPS[spec.topKind] ?? 0);
    gl.uniform2f(u('uBox'), num(spec.width, 1) / 2, num(spec.length, 1) / 2);
    gl.uniform1f(u('uCorner'), num(spec.corner, 0));
    gl.uniform1i(u('uAxis'), spec.axis === 'x' ? 1 : 0);
    gl.uniform1i(u('uLit'), 0);
    gl.uniform1i(u('uShowMark'), 0);
    gl.uniform3f(u('uLamp'), lx, ly, lz);
    gl.uniform1i(u('uSpp'), size > 256 ? 2 : 3);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();
    return canvas.toDataURL('image/png');
  };
}
