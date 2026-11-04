/**
 * GLSL ES 3.00 shaders for the silk renderer.
 *
 * Vertex: a hanging length of cloth. Folds are a sum of travelling sines
 * whose amplitude grows towards the free (pallu) end; the normal comes from
 * the analytic partial derivatives, so lighting stays exact under motion.
 *
 * Fragment: every design cell is resolved into its plain-weave interlacement
 * (warp over / weft over), each visible thread gets a cylindrical profile and
 * Kajiya–Kay anisotropic highlights along its own direction. Because warp and
 * weft run at right angles and can be different colours, the highlight
 * alternates between them as the light or view moves: this is the
 * dhoop-chhaon (shot silk) shimmer, produced by the structure, not painted.
 * Zari threads use a sharper, metal-tinted lobe and a sparse glint.
 * Far away (one cell < ~1px) the thread pattern is replaced by its analytic
 * average to avoid moiré.
 */

export const VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aST;
uniform mat4 uProj, uView;
uniform vec2 uSize;      // cloth width, height in world units
uniform float uTime, uWind;
out vec2 vUV;
out vec3 vPos, vN, vT, vB;

// z(s,t) and its partial derivatives.
vec3 fold(float s, float t) {
  float amp = (0.18 + 0.82 * t) * uWind;
  float z = 0.0, dzs = 0.0, dzt = 0.0;
  const float TAU = 6.2831853;
  vec4 f = vec4(1.6, 2.7, 4.1, 0.9);
  vec4 a = vec4(0.055, 0.03, 0.012, 0.04);
  vec4 w = vec4(0.55, -0.8, 1.2, 0.35);
  vec4 ph = vec4(0.0, 1.7, 4.0, 2.2);
  for (int i = 0; i < 4; i++) {
    float arg = TAU * f[i] * s + ph[i] + w[i] * uTime + 1.4 * t * float(i + 1) * 0.35;
    z += a[i] * sin(arg);
    dzs += a[i] * cos(arg) * TAU * f[i];
    dzt += a[i] * cos(arg) * 1.4 * float(i + 1) * 0.35;
  }
  // a gentle belly so the cloth never reads as a flat card
  float belly = 0.06 * t * t;
  return vec3(z * amp + belly, dzs * amp, dzt * amp + z * 0.82 * uWind + 0.12 * t);
}

void main() {
  vec2 st = aST;
  vec3 F = fold(st.x, st.y);
  vec3 p = vec3((st.x - 0.5) * uSize.x, (0.5 - st.y) * uSize.y, F.x);
  // tangent (along s = weft direction) and bitangent (along t = warp direction)
  vec3 T = normalize(vec3(uSize.x, 0.0, F.y));
  vec3 B = normalize(vec3(0.0, -uSize.y, F.z));
  vN = normalize(cross(B, T));
  vT = T; vB = B;
  vUV = st;
  vPos = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 vUV;
in vec3 vPos, vN, vT, vB;
uniform usampler2D uDesign; // r = weft id, g = warp id, b = zone
uniform sampler2D uPalette; // rgb, a = metal
uniform ivec2 uGrid;
uniform vec3 uEye, uLight;
uniform float uTime, uReveal, uGlint;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec4 pal(uint id) { return texelFetch(uPalette, ivec2(int(id), 0), 0); }

// Kajiya–Kay hair/thread shading for a thread running along T.
vec3 shade(vec3 base, float metal, vec3 T, vec3 N, vec3 L, vec3 V) {
  vec3 H = normalize(L + V);
  float TH = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - TH * TH));
  float ndl = max(dot(N, L), 0.0);
  float wrap = max((dot(N, L) + 0.35) / 1.35, 0.0);
  vec3 diffuse = base * (0.22 + 1.15 * mix(wrap, ndl, 0.5));
  // silk: fibre-tinted primary lobe (silk highlights keep the dye's hue) + broad coloured sheen
  float s1 = pow(sinTH, 90.0) * 0.5;
  float s2 = pow(sinTH, 14.0) * 0.55;
  vec3 tint = mix(base * 3.4, vec3(1.0, 0.96, 0.9), 0.08);
  vec3 silk = diffuse + (tint * s1 + base * s2 * 2.4) * smoothstep(0.0, 0.25, ndl + 0.1);
  // zari: metal-tinted, sharper and brighter, darker diffuse
  float m1 = pow(sinTH, 220.0) * 1.6 + pow(sinTH, 30.0) * 0.55;
  vec3 zari = base * (0.12 + 0.45 * ndl) + base * m1 * 1.3 + vec3(1.0, 0.95, 0.8) * pow(sinTH, 600.0) * 0.8;
  // cool ambient from the room, warm bounce from below
  vec3 amb = base * mix(vec3(0.05, 0.11, 0.1), vec3(0.14, 0.09, 0.05), N.y * 0.5 + 0.5);
  return mix(silk, zari, metal) + amb;
}

void main() {
  vec2 cell = vUV * vec2(uGrid);
  ivec2 ci = clamp(ivec2(floor(cell)), ivec2(0), uGrid - 1);
  vec2 f = fract(cell);
  uvec4 d = texelFetch(uDesign, ci, 0);
  vec4 weft = pal(d.r), warp = pal(d.g);
  bool balanced = d.b == 0u;
  bool warpOver = ((ci.x + ci.y) & 1) == 0;

  vec3 V = normalize(uEye - vPos);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uLight);
  vec3 Tw = normalize(vT); // weft runs along s
  vec3 Tp = normalize(vB); // warp runs along t

  // Unwoven region (weaving playback): only the warp is on the loom.
  float pick = float(ci.y);
  if (pick > uReveal) {
    float px = abs(f.x * 2.0 - 1.0);
    if (px > 0.45) discard;
    vec3 c = shade(warp.rgb, warp.a, Tp, N, L, V) * 0.85;
    outColor = vec4(c, 1.0);
    return;
  }

  // Which thread is on top in this cell, and its cross-section profile.
  bool showWarp = balanced && warpOver;
  vec3 T = showWarp ? Tp : Tw;
  vec3 C = showWarp ? Tw : Tp;              // across the thread
  float x = showWarp ? f.x * 2.0 - 1.0 : f.y * 2.0 - 1.0;
  float along = showWarp ? f.y : f.x;
  float prof = sqrt(max(0.0, 1.0 - x * x));
  // thread dives under its neighbour at the cell ends
  float dive = balanced ? smoothstep(0.0, 0.22, along) * smoothstep(1.0, 0.78, along) : 1.0;
  vec3 Nd = normalize(N + C * (x / max(prof, 0.2)) * 0.9 + T * (along - 0.5) * (balanced ? 0.8 : 0.15));
  vec4 top = showWarp ? warp : weft;
  vec3 near = shade(top.rgb, top.a, T, Nd, L, V) * (0.55 + 0.45 * prof) * mix(0.6, 1.0, dive);
  if (!balanced) near *= 0.92 + 0.08 * step(0.5, fract(f.x * 2.0)); // faint warp ribs under packed weft

  // Analytic average when cells shrink below a pixel.
  vec3 far = balanced
    ? 0.5 * (shade(warp.rgb, warp.a, Tp, N, L, V) + shade(weft.rgb, weft.a, Tw, N, L, V)) * 0.86
    : shade(weft.rgb, weft.a, Tw, N, L, V) * 0.88;
  vec2 fw = fwidth(cell);
  float lod = smoothstep(0.1, 0.4, max(fw.x, fw.y));
  vec3 col = mix(near, far, lod);

  // zari glints: sparse, slow, per cell
  float g = hash(vec2(ci) + floor(uTime * 0.7));
  vec2 gp = f - vec2(0.3 + 0.4 * hash(vec2(ci) * 1.7), 0.5);
  float spark = mix(smoothstep(0.16, 0.0, length(gp)), 0.6, lod); // a pinpoint up close, a speck far away
  col += top.a * uGlint * step(0.993, g) * vec3(1.0, 0.93, 0.75) * spark;

  // the fell: the line where new weft meets the cloth during playback
  float fell = 1.0 - smoothstep(0.0, 2.5, uReveal - pick);
  col += vec3(0.95, 0.75, 0.35) * fell * 0.35;

  // filmic tone map (Reinhard-ish) + gamma
  col = col / (1.0 + col * 0.35);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(luma), col, 1.18), 0.0); // a touch of film saturation
  outColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;
