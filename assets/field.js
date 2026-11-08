/* 3D: цветочное поле колышется от ветра и курсора, по кнопке цветы собираются в букет. Чистый WebGL, без библиотек. */
(function () {
  var cv = document.getElementById('field');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.PF = { gather: function () {}, scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };

  /* лепесток: растёт вдоль y, края загибаются к центру цветка, кончик отгибается наружу */
  function petal(g, o) {
    var F = function (u, v) {
      var s = u * 2 - 1, w = o.w * Math.pow(Math.sin(PI * (.08 + .86 * v)), o.sh || .6);
      var x = s * w, y = o.l * v, z = -o.cup * s * s * w + o.curl * v * v * v * o.l;
      y -= o.tipDip ? o.tipDip * s * s * v * v : 0;
      return [x, y, z, o.m === undefined ? v : o.m];
    };
    g.surf(F, o.nu || 7, o.nv || 8, chain(rotY(o.a), trans(0, o.y || 0, o.r), rotX(o.t)));
  }
  function disc(g, r, h, m, M) { // приплюснутая полусфера: серединка, чашелистик
    g.surf(function (u, v) { var a = u * 2 * PI, b = v * PI / 2; return [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * h, Math.sin(a) * Math.cos(b) * r, m]; }, 18, 5, M);
  }

  /* роза: тугой бутон внутри, раскрытые лепестки снаружи */
  var rose = new Geo(), GA = 2.39996;
  [[5, .14, .32, .5, .2, .25, .02], [5, .45, .42, .62, .3, .4, .06], [6, .8, .52, .72, .38, .5, .12], [6, 1.12, .6, .76, .44, .55, .22]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(rose, { a: k / L[0] * 2 * PI + li * .7, t: L[1], w: L[2], l: L[3], r: L[4] * .35, cup: L[5], curl: L[6], y: -li * .05 });
  });
  disc(rose, .34, -.28, .1, ident());
  var roseB = rose.upload();

  /* кустовая роза: маленькая и раскрытая */
  var spray = new Geo();
  [[5, .5, .3, .4, .2, .35, .05], [6, 1.0, .36, .46, .3, .3, .15]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(spray, { a: k / L[0] * 2 * PI + li * .6, t: L[1], w: L[2], l: L[3], r: L[4] * .3, cup: L[5], curl: L[6] });
  });
  disc(spray, .2, -.18, .1, ident());
  var sprayB = spray.upload();

  /* хризантема-ромашка: серединка и два ряда узких лепестков */
  var daisy = new Geo();
  [[18, 1.25, .1, .78, .02], [16, 1.5, .09, .7, .1]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(daisy, { a: (k + li * .5) / L[0] * 2 * PI, t: L[1], w: L[2], l: L[3], r: .18, cup: .5, curl: L[4], sh: .45, nu: 3, nv: 6, y: .04 - li * .03 });
  });
  disc(daisy, .24, .14, 2, trans(0, .02, 0));
  var daisyB = daisy.upload();

  /* лист эвкалипта/зелени */
  var leaf = new Geo();
  petal(leaf, { a: 0, t: 0, w: .26, l: 1.25, r: 0, cup: .25, curl: .25, sh: .9, nv: 9 });
  var leafB = leaf.upload();

  /* обёртка: два слоя бумаги с волнистым краем, спереди ниже, чтобы цветы были видны */
  function wrapGeo(rot, lift, waves, m) {
    var g = new Geo();
    g.surf(function (u, v) {
      var a = u * 2 * PI, t = v;
      var front = Math.max(0, Math.cos(a - PI / 2 + rot));
      var top = .55 + lift - 1.0 * front * front + .16 * Math.sin(a * waves);
      var y = -3.3 + (top + 3.3) * t;
      var r = (.32 + Math.pow(t, 1.25) * .98) * (1 + .05 * Math.sin(a * waves + 1) * t);
      return [Math.cos(a) * r, y, Math.sin(a) * r, m + t * .9];
    }, 72, 14);
    return g.upload();
  }
  var wrapA = wrapGeo(0, 0, 5, 0), wrapB = wrapGeo(.5, .22, 4, 0);
  var ribbon = new Geo();
  ribbon.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, R = .52, r = .07; return [Math.cos(a) * (R + Math.cos(b) * r), Math.sin(b) * r * 1.6, Math.sin(a) * (R + Math.cos(b) * r), 2]; }, 40, 8);
  [-1, 1].forEach(function (s) { // хвосты ленты
    ribbon.surf(function (u, v) { var x = s * (.1 + v * .5), y = -v * 1.2, z = .55 + Math.sin(v * 3) * .08; return [x + (u - .5) * .22, y, z + (u - .5) * .02 * s, 2]; }, 2, 8);
  });
  var ribbonB = ribbon.upload();
  var stem = new Geo();
  stem.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .05, -v * 1.1, Math.sin(a) * .05, .5]; }, 8, 1);
  var stemB = stem.upload();
  /* ---------- шейдеры: свет как в Цветочнице + дымка в цвет фона, низ стеблей тонет в траве ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uE;uniform vec3 uBg;uniform float uFade;uniform float uGF;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;' +
    'vec3 base=vM<1.5?uC1*mix(.62,1.,smoothstep(0.,.95,vM)):uC2;' +
    'vec3 L1=normalize(vec3(-.55,.85,.65));vec3 L2=normalize(vec3(.8,.15,.35));' +
    'float d1=max(0.,dot(N,L1)*.7+.3);float d2=max(0.,dot(N,L2))*.3;float bl=max(0.,dot(-N,L1))*.3;' +
    'float rim=pow(1.-max(dot(N,V),0.),2.5);vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.),36.)*.08;' +
    'vec3 c=base*(.42+d1*.72+d2)+base*bl*.8+vec3(sp)+base*rim*.22+vec3(1.,.95,.9)*rim*.1;' +
    'float fog=smoothstep(11.,26.,distance(uE,vW))*.85;float gf=(1.-smoothstep(-2.75,-1.55,vW.y))*uGF;' +
    'c=mix(min(c,vec3(1.)),uBg,max(fog,gf));' +
    'gl_FragColor=vec4(c*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uC2', 'uE', 'uBg', 'uFade', 'uGF'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });
  gl.uniform3f(U.uBg, .953, .925, .886);

  function draw(buf, W, c1, c2, gf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2 || c1); gl.uniform1f(U.uGF, gf === undefined ? 1 : gf);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- поле: цветы тех же оттенков, что в их букетах ---------- */
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var COLS = [[.97, .62, .74], [.9, .24, .52], [.99, .8, .67], [.98, .95, .87], [.97, .97, .95], [.84, .72, .92], [.99, .7, .62], [.82, .12, .2]];
  var PICK = [0, 2, 3, 0, 4, 1, 2, 5, 3, 0, 6, 4, 2, 0, 7, 3];
  var COL = { stem: [.36, .52, .3], yolk: [.95, .76, .2], g1: [.42, .58, .34], g2: [.55, .66, .42], g3: [.33, .47, .3], kraft: [.84, .74, .6], kraft2: [.97, .94, .89], rib: [.91, .64, .7] };
  var mobile = innerWidth < 760, N = mobile ? 40 : 66, G = mobile ? 60 : 110, Y0 = -2.6;
  var TYPES = [roseB, sprayB, daisyB, roseB, sprayB, sprayB, daisyB, roseB];
  var fl = [], gr = [], i;
  for (i = 0; i < N; i++) {
    var x = (rnd() * 2 - 1) * 9, z = -5.5 + rnd() * 8, h = 1.25 + rnd() * 1.35;
    fl.push({ x: x, z: z, h: h, b: TYPES[Math.floor(rnd() * TYPES.length)], c: COLS[PICK[i % PICK.length]], s: .62 + rnd() * .22, spin: rnd() * 6.3, ph: rnd() * 6.3, push: 0, g: 0, at: .25 + (x + 9) / 18 * .9 + rnd() * .25, grow: 0 });
  }
  for (i = 0; i < G; i++) gr.push({ x: (rnd() * 2 - 1) * 9.6, z: -5.8 + rnd() * 8.6, h: .7 + rnd() * .8, a: rnd() * 6.3, t: (rnd() - .5) * .5, c: [COL.g1, COL.g2, COL.g3][i % 3], ph: rnd() * 6.3, push: 0, at: .1 + rnd() * .6, grow: 0 });

  /* букет: те же цветы собираются по спирали в крафтовой обёртке */
  var RF = 2.05, K = mobile ? .78 : .64;
  fl.forEach(function (f, i) {
    var rho = RF * Math.sqrt((i + .35) / N), th = i * GA, k = rho / RF;
    f.bp = [Math.cos(th) * rho * K, (.25 + .95 * (1 - k * k)) * K, Math.sin(th) * rho * K];
    f.bd = norm([f.bp[0], f.bp[1] + 3.2 * K, f.bp[2]]);
    f.bs = (.78 + .2 * ((i * 7) % 5) / 4) * K;
    f.delay = (i / N) * .5;
  });

  /* ---------- кадр ---------- */
  var W = 0, H = 0, live = true, last = 0, time = 0, fade = 0, scr = 0, scrT = 0, gat = 0, gatT = 0;
  var px = 9, py = 9, vx = 0, ptT = 0, VP = null;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', function () { resize(); kick(); });
  function pt(cx, cy) {
    var r = cv.getBoundingClientRect(), nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
    if (px < 5) vx += (nx - px) * 6;
    px = nx; py = ny; ptT = time;
  }
  addEventListener('pointermove', function (e) { pt(e.clientX, e.clientY); }, { passive: true });
  addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) pt(t.clientX, t.clientY); }, { passive: true });

  function band() { var h = cv.parentNode.clientHeight; return cv.clientHeight < h * .8; }
  function center() { var asp = W / H; return band() ? [0, .1, .8] : [Math.min(4.2, 1.6 + asp * 1.1), .6, .6]; }
  function ndc(x, y, z) { if (!VP) return [9, 9]; var m = VP, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15]; return [cx / cw, cy / cw]; }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function step(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 3));
    scr += (scrT - scr) * k; gat += (gatT - gat) * (1 - Math.exp(-dt * (reduce ? 60 : 1.6)));
    vx *= Math.exp(-dt * 4);
    if (time - ptT > .25) px = 9;
    function gust(o, y) {
      var p = ndc(o.x, y, o.z), d = Math.hypot(p[0] - px, (p[1] - py) * .8), inf = Math.exp(-d * d / .025);
      o.push += (vx * inf * 1.6 - o.push) * (1 - Math.exp(-dt * (inf > .05 ? 6 : 1.8)));
    }
    fl.forEach(function (f) { if (time >= f.at) f.grow += (1 - f.grow) * (1 - Math.exp(-dt * 3.2)); if (!reduce) gust(f, Y0 + f.h); f.g = ease((gat * 1.5 - f.delay)); });
    gr.forEach(function (g) { if (time >= g.at) g.grow += (1 - g.grow) * (1 - Math.exp(-dt * 3)); if (!reduce) gust(g, Y0 + g.h * .7); });
  }
  function wind(x, z, ph) { return reduce ? 0 : Math.sin(time * 1.25 + x * .42 + z * .25 + ph * .3) * .16 + Math.sin(time * 2.3 + x * .9 + ph) * .04; }

  function render() {
    if (!W) resize();
    var asp = W / H, B = center();
    var bd = band(), d = (bd ? 14 : 13.2) * Math.max(1, (bd ? .95 : .7) / asp), tg = [0, (bd ? -.75 : 1.25) + scr * .4, 0];
    var az = (reduce ? 0 : Math.sin(time * .2) * .05), el = .2 + scr * .25 + gat * .06;
    var eye = [Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d];
    VP = mul(persp(.62, asp, 1, 80), lookAt(eye, tg));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3f(U.uE, eye[0], eye[1], eye[2]); gl.uniform1f(U.uFade, fade);

    /* трава */
    gr.forEach(function (g) {
      if (g.grow < .01) return;
      var w = wind(g.x, g.z, g.ph) + g.push, dir = norm([Math.sin(g.a) * g.t + w, 1, Math.cos(g.a) * g.t * .5]), s = g.grow;
      draw(leafB, chain(trans(g.x, Y0 - .1, g.z), basis(dir), rotY(g.a), scl(.32 * s, g.h * s, .32 * s)), g.c);
    });

    /* обёртка появляется, когда цветы почти собрались */
    var wg = ease((gat - .45) / .5), root = trans(B[0], B[1], B[2]);
    if (wg > .01) {
      var sx = (RF + .62) / 1.3, ws = wg * K;
      var Wm = chain(root, trans(0, -.4 * (1 - wg), 0), scl(sx * ws, ws, sx * ws));
      draw(wrapB, chain(Wm, scl(.97, 1, .97)), COL.kraft2, null, 0);
      draw(wrapA, chain(Wm, scl(1.05, 1, 1.05)), COL.kraft, null, 0);
      draw(ribbonB, chain(Wm, trans(0, -2.35, 0), scl(.86 + .1 / sx, 1, .86 + .1 / sx)), COL.rib, COL.rib, 0);
    }

    /* цветы: в поле – на стеблях до земли, в букете – по спирали к перевязке */
    fl.forEach(function (f, i) {
      if (f.grow < .01) return;
      var gw = f.g, e = ease(f.grow);
      var w = (wind(f.x, f.z, f.ph) + f.push) * (1 - gw);
      var fp = [f.x + w * f.h * .55, Y0 + f.h * e, f.z];
      var bp = [B[0] + f.bp[0], B[1] + f.bp[1], B[2] + f.bp[2]];
      var arc = Math.sin(gw * PI) * 1.4;
      var p = [fp[0] + (bp[0] - fp[0]) * gw, fp[1] + (bp[1] - fp[1]) * gw + arc, fp[2] + (bp[2] - fp[2]) * gw];
      var fd = norm([w * .9, 1, .12]), dir = norm([fd[0] + (f.bd[0] - fd[0]) * gw, fd[1] + (f.bd[1] - fd[1]) * gw, fd[2] + (f.bd[2] - fd[2]) * gw]);
      var sz = (f.s + (f.bs - f.s) * gw) * e;
      /* стебель: в поле до земли, в букете уходит в обёртку */
      var len = (f.h * e) * (1 - gw) + 2.6 * K * gw;
      draw(stemB, chain(trans(p[0], p[1], p[2]), basis(dir), scl(1 + gw * .2, len / 1.1, 1 + gw * .2)), COL.stem, null, 1 - gw);
      draw(f.b, chain(trans(p[0], p[1], p[2]), basis(dir), rotY(f.spin + (reduce ? 0 : time * .04)), scl(sz, sz, sz)), f.c, COL.yolk, 1 - gw);
    });
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    step(dt); render();
    if (live) requestAnimationFrame(frame);
  }
  var pending = false;
  function kick() {
    if (!reduce || pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; time += 10; for (var i = 0; i < 40; i++) step(.05); render(); });
  }
  window.PF = {
    gather: function (v) { gatT = v ? 1 : 0; kick(); },
    scroll: function (p) { scrT = Math.max(0, Math.min(1, p)); kick(); },
    live: function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame); } }
  };
  resize();
  if (reduce) { kick(); live = false; } else requestAnimationFrame(frame);
})();
