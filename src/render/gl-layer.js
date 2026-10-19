// Full-screen WebGL passes that work per pixel by inverting the projection:
//  - 'sky':    night-sky gradient, Milky Way and the tint of marked constellations
//  - 'ground': the landscape below the horizon, a forest edge, drawn above the stars
// Both read the same uniforms; each lives on its own canvas so the 2D star layer can
// sit between them.

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
uniform float uMilkyWayStrength;
uniform float uMaskStrength;

void main() {
  vec3 hor = uCamToHor * camDir();
  float alt = asin(clamp(hor.z, -1.0, 1.0));
  float h = clamp(alt / (0.5 * PI), 0.0, 1.0);
  vec3 zenith = vec3(0.010, 0.016, 0.042);
  vec3 horizon = vec3(0.045, 0.068, 0.130);
  vec3 col = mix(horizon, zenith, pow(h, 0.42));
  // Faint glow of distant towns and airglow low over the horizon.
  col += vec3(0.060, 0.050, 0.060) * exp(-max(alt, 0.0) * 16.0);

  vec3 eq = uHorToEq * hor;
  float ra = atan(eq.y, eq.x);
  float dec = asin(clamp(eq.z, -1.0, 1.0));
  vec2 uv = vec2(ra / (2.0 * PI), 0.5 - dec / PI);
  float extinction = smoothstep(-0.02, 0.25, alt);
  float mw = texture2D(uMilkyWay, uv).r;
  col += vec3(0.55, 0.62, 0.80) * mw * uMilkyWayStrength * mix(0.35, 1.0, extinction);
  vec4 tint = texture2D(uMask, uv);
  col += tint.rgb * uMaskStrength;
  gl_FragColor = vec4(col, 1.0);
}
`;

// The forest edge is periodic in azimuth so it joins up in the north. It is lower
// towards the south, where the view is kept open for the low southern constellations.
const GROUND_FRAG = COMMON + `
uniform float uGroundAlpha;

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
  vec3 col = mix(vec3(0.020, 0.034, 0.040), vec3(0.008, 0.012, 0.016), depth);
  if (alt > 0.0) col = vec3(0.006, 0.010, 0.014); // tree silhouettes
  float a = cover * uGroundAlpha;
  gl_FragColor = vec4(col * a, a);
}
`;

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
    for (const name of ['uRes', 'uScale', 'uCamToHor', 'uHorToEq', 'uMilkyWay', 'uMask',
      'uMilkyWayStrength', 'uMaskStrength', 'uGroundAlpha']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    if (mode === 'sky') {
      this.mwTex = this.createTexture(1, 1, new Uint8Array([0, 0, 0, 255]));
      this.maskTex = this.createTexture(1, 1, new Uint8Array([0, 0, 0, 0]));
      gl.uniform1i(this.u.uMilkyWay, 0);
      gl.uniform1i(this.u.uMask, 1);
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
   */
  render(p) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, width, height);
    gl.uniform1f(this.u.uScale, p.scale * p.dpr);
    gl.uniformMatrix3fv(this.u.uCamToHor, false, colMajor(p.camToHor));
    gl.uniformMatrix3fv(this.u.uHorToEq, false, colMajor(p.horToEq));
    if (this.mode === 'sky') {
      gl.uniform1f(this.u.uMilkyWayStrength, p.milkyWay ? 0.2 : 0);
      gl.uniform1f(this.u.uMaskStrength, 0.16);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mwTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    } else {
      gl.uniform1f(this.u.uGroundAlpha, p.groundAlpha);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
