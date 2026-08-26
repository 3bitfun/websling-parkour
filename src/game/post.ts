/** Comic-post shader: cel ink outlines + manga screentone + grain + speed lines. */

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform float uSpeed;   // 0..1 velocity rush
uniform float uHit;     // 0..1 damage flash
uniform float uSlowmo;  // 0..1 slow-motion mix
uniform float uAspect;
uniform float uOutline; // ink strength
uniform float uScreen;  // screentone strength
uniform float uDotSize; // screentone cell px
varying vec2 vUv;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const vec3 INK = vec3(0.012, 0.02, 0.05);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// NDC depth -> positive view distance
float dist(float d) {
  return -((uNear * uFar) / ((uFar - uNear) * d - uFar));
}

void main() {
  vec2 texel = 1.0 / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;
  float zC = dist(texture2D(tDepth, vUv).x);

  /* ---------- comic ink: sobel on depth + luminance ---------- */
  float dTL = dist(texture2D(tDepth, vUv + vec2(-texel.x,  texel.y)).x);
  float dT  = dist(texture2D(tDepth, vUv + vec2(     0.0,  texel.y)).x);
  float dTR = dist(texture2D(tDepth, vUv + vec2( texel.x,  texel.y)).x);
  float dL  = dist(texture2D(tDepth, vUv + vec2(-texel.x,      0.0)).x);
  float dR  = dist(texture2D(tDepth, vUv + vec2( texel.x,      0.0)).x);
  float dBL = dist(texture2D(tDepth, vUv + vec2(-texel.x, -texel.y)).x);
  float dB  = dist(texture2D(tDepth, vUv + vec2(     0.0, -texel.y)).x);
  float dBR = dist(texture2D(tDepth, vUv + vec2( texel.x, -texel.y)).x);
  float gx = dTR + 2.0 * dR + dBR - dTL - 2.0 * dL - dBL;
  float gy = dTL + 2.0 * dT + dTR - dBL - 2.0 * dB - dBR;
  float depthEdge = length(vec2(gx, gy)) * (5.0 / max(zC, 0.35));
  depthEdge = smoothstep(0.25, 1.0, depthEdge);

  float lTL = dot(texture2D(tColor, vUv + vec2(-texel.x,  texel.y)).rgb, LUMA);
  float lT  = dot(texture2D(tColor, vUv + vec2(     0.0,  texel.y)).rgb, LUMA);
  float lTR = dot(texture2D(tColor, vUv + vec2( texel.x,  texel.y)).rgb, LUMA);
  float lL  = dot(texture2D(tColor, vUv + vec2(-texel.x,      0.0)).rgb, LUMA);
  float lR  = dot(texture2D(tColor, vUv + vec2( texel.x,      0.0)).rgb, LUMA);
  float lBL = dot(texture2D(tColor, vUv + vec2(-texel.x, -texel.y)).rgb, LUMA);
  float lB  = dot(texture2D(tColor, vUv + vec2(     0.0, -texel.y)).rgb, LUMA);
  float lBR = dot(texture2D(tColor, vUv + vec2( texel.x, -texel.y)).rgb, LUMA);
  float lgx = lTR + 2.0 * lR + lBR - lTL - 2.0 * lL - lBL;
  float lgy = lTL + 2.0 * lT + lTR - lBL - 2.0 * lB - lBR;
  float lumaEdge = smoothstep(0.16, 0.55, length(vec2(lgx, lgy)) * 2.6);

  float ink = max(depthEdge, lumaEdge * 0.85) * uOutline;
  col = mix(col, INK, clamp(ink, 0.0, 1.0));

  /* ---------- manga screentone in the shadows ---------- */
  float lum = dot(col, LUMA);
  float shade = 1.0 - smoothstep(0.1, 0.72, lum);
  float ca = 0.35;
  mat2 rot = mat2(cos(ca), -sin(ca), sin(ca), cos(ca));
  vec2 st = rot * (gl_FragCoord.xy / uDotSize);
  float m = length(fract(st) - 0.5);
  float r = shade * uScreen * 0.5;
  float dots = 1.0 - smoothstep(r - 0.12, r, m);
  col *= 1.0 - dots * 0.32;

  /* ---------- paper grain + vignette ---------- */
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5) * 0.055;

  vec2 vc = vUv - 0.5;
  vc.x *= uAspect;
  float rad = length(vc);
  col *= mix(0.62, 1.0, smoothstep(1.05, 0.32, rad));

  /* ---------- speed lines when hauling ---------- */
  float sp = smoothstep(0.45, 0.95, uSpeed);
  if (sp > 0.001) {
    float ang = atan(vc.y, vc.x);
    float band = hash(vec2(floor(ang * 55.0), floor(rad * 6.0 - uTime * 14.0)));
    float lines = step(0.74, band) * smoothstep(0.22, 0.95, rad);
    col += vec3(0.85, 0.93, 1.0) * lines * sp * 0.28;
  }

  /* ---------- slow-mo: cool desaturation + letterbox ---------- */
  col = mix(col, vec3(lum) * vec3(0.9, 1.0, 1.18), uSlowmo * 0.55);
  float bar = uSlowmo * 0.075;
  if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);

  /* ---------- hit flash: red edge pulse ---------- */
  col = mix(col, vec3(0.9, 0.06, 0.06), uHit * 0.32 * smoothstep(0.15, 0.8, rad));

  gl_FragColor = vec4(col, 1.0);
}
`;
