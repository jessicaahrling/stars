// Full-screen WebGL passes that work per pixel by inverting the projection:
//  - 'sky':    night-sky gradient, Milky Way and the tint of marked constellations
//  - 'ground': the landscape below the horizon, a forest edge, drawn above the stars
// Both read the same uniforms; each lives on its own canvas so the 2D star layer can
// sit between them. Their colours are those of the sky's look.
import { DEFAULT_SKY_LOOK, SKY_LOOKS } from './palette.js';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uScale;
uniform mat3 uCamToHor;
uniform mat3 uHorToEq;
const float PI = 3.14159265;

// Inverse stereographic projection: camera-space unit vector for this pixel.
vec3 camDir() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uScale;
  float r2 = dot(q, q);
  float d = 4.0 + r2;
  return vec3(4.0 * q.x / d, 4.0 * q.y / d, (4.0 - r2) / d);
}
`;

const SKY_FRAG = COMMON + `
uniform sampler2D uMilkyWay;
uniform sampler2D uMask;
uniform sampler2D uNebula;
uniform float uMilkyWayStrength;
uniform float uMaskStrength;
// The colours of the sky's look (SKY_LOOKS in palette.js).
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uCurve;
uniform vec3 uHaze;
uniform float uHazeFall;
uniform float uClouds;
uniform vec3 uMilkyWayTint;
uniform float uVignette;

void main() {
  vec3 hor = uCamToHor * camDir();
  float alt = asin(clamp(hor.z, -1.0, 1.0));
  float h = clamp(alt / (0.5 * PI), 0.0, 1.0);
  // The night: darkest overhead, lighter toward the horizon.
  vec3 col = mix(uHorizon, uZenith, pow(h, uCurve));
  // Faint glow of distant towns and airglow low over the horizon.
  col += uHaze * exp(-max(alt, 0.0) * uHazeFall);

  vec3 eq = uHorToEq * hor;
  float ra = atan(eq.y, eq.x);
  float dec = asin(clamp(eq.z, -1.0, 1.0));
  vec2 uv = vec2(ra / (2.0 * PI), 0.5 - dec / PI);
  float extinction = smoothstep(-0.02, 0.25, alt);
  // Thin clouds of colour that turn with the stars, so that the night is not flat.
  col += texture2D(uNebula, uv).rgb * uClouds * mix(0.45, 1.0, extinction);
  float mw = texture2D(uMilkyWay, uv).r;
  col += uMilkyWayTint * mw * uMilkyWayStrength * mix(0.35, 1.0, extinction);
  vec4 tint = texture2D(uMask, uv);
  col += tint.rgb * uMaskStrength;
  // Darker toward the corners of the screen, as through an eyepiece.
  vec2 off = (gl_FragCoord.xy - 0.5 * uRes) / max(uRes.x, uRes.y);
  col *= 1.0 - uVignette * smoothstep(0.28, 0.78, length(off));
  // A grain of one step of colour, so that the slow gradients of a dark sky show no bands.
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

// The forest edge is periodic in azimuth so it joins up in the north. It is lower
// towards the south, where the view is kept open for the low southern constellations.
const GROUND_FRAG = COMMON + `
uniform float uGroundAlpha;
// The colours of the sky's look (SKY_LOOKS in palette.js).
uniform vec3 uGroundNear;
uniform vec3 uGroundFar;
uniform vec3 uTrees;

float hash(float n) { return fract(sin(n) * 43758.5453); }

float treeline(float azDeg) {
  float a = radians(azDeg);
  float hills = 0.42 + 0.22 * sin(2.0 * a + 0.5) + 0.16 * sin(5.0 * a + 1.9)
              + 0.08 * sin(11.0 * a + 0.3) + 0.04 * sin(23.0 * a + 2.2);
  float forest = smoothstep(-0.25, 0.35, 0.6 * sin(3.0 * a + 0.8) + 0.4 * sin(7.0 * a + 2.0));
  forest *= mix(0.3, 1.0, smoothstep(20.0, 55.0, abs(azDeg - 180.0)));
  const float CELL = 0.5;
  float c = floor(azDeg / CELL);
  float top = 0.0;
  for (int k = -2; k <= 2; k++) {
    float id = mod(c + float(k), 720.0);
    float r = hash(id * 1.731 + 3.1);
    if (r > forest * 1.15) continue;
    float center = (c + float(k) + 0.25 + 0.5 * hash(id * 3.37 + 1.0)) * CELL;
    float height = (0.55 + 1.5 * hash(id * 7.13 + 2.0)) * (0.55 + 0.45 * forest);
    float halfWidth = 0.05 + 0.2 * height;
    float s = height * (1.0 - abs(azDeg - center) / halfWidth);
    s -= 0.13 * height * fract(s * 5.0 / height);
    top = max(top, s);
  }
  return hills + top;
}

void main() {
  vec3 cam = camDir();
  vec3 hor = uCamToHor * cam;
  float alt = degrees(asin(clamp(hor.z, -1.0, 1.0)));
  float az = mod(degrees(atan(hor.x, hor.y)) + 360.0, 360.0);
  float edge = treeline(az);
  float pixelDeg = degrees((1.0 + cam.z) * 0.5 / uScale);
  float cover = smoothstep(edge + pixelDeg, edge - pixelDeg, alt);
  if (cover <= 0.0) discard;
  float depth = clamp(-alt / 25.0, 0.0, 1.0);
  vec3 col = mix(uGroundNear, uGroundFar, depth);
  if (alt > 0.0) col = uTrees; // tree silhouettes
  float a = cover * uGroundAlpha;
  gl_FragColor = vec4(col * a, a);
}
`;

/**
 * Size of the map of the sky's thin clouds of colour (powers of two, needed for REPEAT in
 * WebGL 1). Small: the clouds are smooth, and the map is made before the first frame.
 */
const NEBULA_W = 256;
const NEBULA_H = 128;

/**
 * The thin clouds of colour in the night sky: an equirectangular map (right ascension
 * across, declination down, as the Milky Way's) of the light they add, in blue, violet and
 * a little rose. Smooth noise over the sphere itself, so that the map has no seam and no
 * pinch at the poles, and always the same, so that the sky looks the same each time.
 * @returns {Uint8Array} RGBA
 */
export function makeNebula(w, h) {
  let seed = 88;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // A lattice of 32 x 32 x 32 values that repeats in every direction.
  const lattice = Float32Array.from({ length: 32 * 32 * 32 }, random);
  const at = (x, y, z) => lattice[((z & 31) << 10) | ((y & 31) << 5) | (x & 31)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, z) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const sx = smooth(x - x0);
    const sy = smooth(y - y0);
    const sz = smooth(z - z0);
    const row = (yy, zz) => at(x0, yy, zz) * (1 - sx) + at(x0 + 1, yy, zz) * sx;
    const face = (zz) => row(y0, zz) * (1 - sy) + row(y0 + 1, zz) * sy;
    return face(z0) * (1 - sz) + face(z0 + 1) * sz;
  };
  // Layers of noise, each twice as fine and half as strong, in 0 to 1.
  const clouds = (x, y, z, layers) => {
    let sum = 0;
    let weight = 1;
    let total = 0;
    for (let k = 0; k < layers; k++, weight /= 2) {
      const f = 2 ** k;
      sum += noise(x * f + 7.3 * k, y * f + 3.1 * k, z * f + 5.7 * k) * weight;
      total += weight;
    }
    return sum / total;
  };
  const step = (lo, hi, v) => smooth(Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    const dec = (0.5 - (j + 0.5) / h) * Math.PI;
    for (let i = 0; i < w; i++) {
      const ra = ((i + 0.5) / w) * 2 * Math.PI;
      const x = Math.cos(dec) * Math.cos(ra);
      const y = Math.cos(dec) * Math.sin(ra);
      const z = Math.sin(dec);
      const dense = step(0.36, 0.84, clouds(x * 1.5 + 11, y * 1.5 + 17, z * 1.5 + 23, 3));
      const hue = clouds(x * 1.3 + 31, y * 1.3 + 41, z * 1.3 + 53, 3);
      const rose = step(0.56, 0.8, hue);
      // Blue clouds, turning violet, and rose in a few places.
      const k = (i + j * w) * 4;
      // (Stored four times as strong as it is added, to keep the faint steps fine.)
      out[k] = Math.round(255 * 4 * dense * (0.016 + 0.034 * rose));
      out[k + 1] = Math.round(255 * 4 * dense * (0.022 - 0.006 * rose));
      out[k + 2] = Math.round(255 * 4 * dense * (0.066 - 0.012 * rose));
      out[k + 3] = 255;
    }
  }
  return out;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader: ${log}`);
  }
  return sh;
}

/** Row-major 3x3 -> column-major Float32Array for uniformMatrix3fv. */
function colMajor(m) {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

export class GlLayer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {'sky'|'ground'} mode
   */
  constructor(canvas, mode) {
    this.canvas = canvas;
    this.mode = mode;
    const gl = canvas.getContext('webgl', { alpha: mode === 'ground', premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL saknas');
    this.gl = gl;
    /**
     * Called once a context the browser took away (a tab long in the background on a
     * phone) is back and set up again: what was given from outside, the Milky Way and the
     * tints, must be given again, and the frame drawn.
     * @type {(() => void) | null}
     */
    this.onRestore = null;
    // Without preventDefault the browser never gives a lost context back.
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
      this.init();
      if (this.onRestore) this.onRestore();
    });
    this.init();
  }

  /** Sets up the program, the quad and the textures: at the start, and again after a lost context. */
  init() {
    const { gl, mode } = this;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, mode === 'sky' ? SKY_FRAG : GROUND_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const name of ['uRes', 'uScale', 'uCamToHor', 'uHorToEq', 'uMilkyWay', 'uMask', 'uNebula',
      'uMilkyWayStrength', 'uMaskStrength', 'uGroundAlpha', 'uZenith', 'uHorizon', 'uCurve', 'uHaze', 'uHazeFall',
      'uClouds', 'uMilkyWayTint', 'uVignette', 'uGroundNear', 'uGroundFar', 'uTrees']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    if (mode === 'sky') {
      this.mwTex = this.createTexture(1, 1, new Uint8Array([0, 0, 0, 255]));
      this.maskTex = this.createTexture(1, 1, new Uint8Array([0, 0, 0, 0]));
      this.nebulaTex = this.createTexture(NEBULA_W, NEBULA_H, makeNebula(NEBULA_W, NEBULA_H));
      gl.uniform1i(this.u.uMilkyWay, 0);
      gl.uniform1i(this.u.uMask, 1);
      gl.uniform1i(this.u.uNebula, 2);
    } else {
      gl.clearColor(0, 0, 0, 0);
    }
  }

  createTexture(w, h, data) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return tex;
  }

  /** Milky Way image (power-of-two size, needed for REPEAT in WebGL 1). */
  setMilkyWay(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.mwTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  /** RGBA tint for marked constellations, premultiplied (power-of-two size). */
  setMask(width, height, rgba) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * @param {object} p
   * @param {number} p.scale  projection scale in CSS px per unit
   * @param {number} p.dpr
   * @param {number[]} p.camToHor row-major
   * @param {number[]} p.horToEq  row-major, horizontal -> J2000
   * @param {boolean} p.milkyWay
   * @param {number} [p.milkyWayFade]  0-1: how much of the Milky Way a hazy or bright sky leaves
   * @param {object} [p.look]  the sky's look, one of SKY_LOOKS (the default one if left out)
   */
  render(p) {
    const gl = this.gl;
    const look = p.look || SKY_LOOKS[DEFAULT_SKY_LOOK];
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, width, height);
    gl.uniform1f(this.u.uScale, p.scale * p.dpr);
    gl.uniformMatrix3fv(this.u.uCamToHor, false, colMajor(p.camToHor));
    gl.uniformMatrix3fv(this.u.uHorToEq, false, colMajor(p.horToEq));
    if (this.mode === 'sky') {
      const { sky } = look;
      gl.uniform3fv(this.u.uZenith, sky.zenith);
      gl.uniform3fv(this.u.uHorizon, sky.horizon);
      gl.uniform1f(this.u.uCurve, sky.curve);
      gl.uniform3fv(this.u.uHaze, sky.haze);
      gl.uniform1f(this.u.uHazeFall, sky.hazeFall);
      gl.uniform1f(this.u.uClouds, sky.clouds);
      gl.uniform3fv(this.u.uMilkyWayTint, sky.milkyWay);
      gl.uniform1f(this.u.uVignette, sky.vignette);
      gl.uniform1f(this.u.uMilkyWayStrength, p.milkyWay ? 0.2 * (p.milkyWayFade ?? 1) : 0);
      gl.uniform1f(this.u.uMaskStrength, 0.16);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mwTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.nebulaTex);
    } else {
      const { ground } = look;
      gl.uniform3fv(this.u.uGroundNear, ground.near);
      gl.uniform3fv(this.u.uGroundFar, ground.far);
      gl.uniform3fv(this.u.uTrees, ground.trees);
      gl.uniform1f(this.u.uGroundAlpha, p.groundAlpha);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
