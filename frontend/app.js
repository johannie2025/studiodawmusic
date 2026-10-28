'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const HEAD_W = 240, COLORS = ['#3b8cff', '#ffb347', '#7bd88f', '#ff6b9d', '#b388ff', '#4dd0e1', '#ffd54f', '#ff8a65'], GCOL = ['#c792ea', '#82aaff', '#f78c6c', '#89ddff'];
const uid = () => Math.random().toString(36).slice(2, 9);
const db2g = d => Math.pow(10, d / 20), g2db = g => 20 * Math.log10(Math.max(g, 1e-6));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem('wds.' + k); return v === null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('wds.' + k, v); } catch (e) {} } };

/* Canal (piste / groupe) : tous les réglages d'effets sont communs */
const mkCh = (name, color) => ({ id: uid(), name, color, vol: 0, pan: 0, mute: false, solo: false, reverb: 0, delay: 0, eq: { low: 0, mid: 0, high: 0 }, comp: false, compT: -24, compR: 4, fxOff: false });
const mkTrack = (name, i, ch = 'stereo') => ({ ...mkCh(name, COLORS[i % COLORS.length]), ch, arm: false, group: '' });
const mkGroup = (name, i) => mkCh(name, GCOL[i % GCOL.length]);
function fixProject(p) {
  p.groups = p.groups || []; p.bpm = p.bpm || 100; if (p.master == null) p.master = 0; p.clips = p.clips || [];
  const f = c => { const d = mkCh(c.name, c.color); for (const k in d) if (c[k] === undefined) c[k] = d[k]; c.eq = { ...d.eq, ...c.eq }; return c; };
  p.tracks.forEach(t => { f(t); t.ch = t.ch || 'stereo'; t.group = t.group || ''; t.arm = !!t.arm; }); p.groups.forEach(f); return p;
}
const newProject = () => fixProject({ name: 'Nouveau morceau', bpm: 100, master: 0, tracks: [mkTrack('Instrumental', 0), mkTrack('Voix chantres', 1, 'mono')], groups: [], clips: [] });
const S = { p: newProject(), zoom: 80, head: 0, playing: false, recording: false, sel: null, selTrack: null, undo: [], bufs: {}, t0: 0, from: 0, nodes: [], rec: null, pending: null, metro: false, countin: true, snap: true, follow: true, latencyMs: 0, dirty: false, laneSpan: 0 };
let ctx = null, live = null, mTimer = null;
const MASTER = { id: 'master', name: 'Master', color: '#ffffff', get vol() { return S.p.master; }, set vol(v) { S.p.master = v; } };
const chById = id => id === 'master' ? MASTER : (S.p.tracks.find(t => t.id === id) || S.p.groups.find(g => g.id === id));

function toast(m, ms = 3500) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); } t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); }
async function api(path, opt) { const r = await fetch(path, opt); if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); } return r.json(); }
const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
async function upload(blob, name) { const f = new FormData(); f.append('file', blob, name); return api('/api/upload', { method: 'POST', body: f }); }

/* ---------- Audio engine ---------- */
function getCtx() { if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); live = makeGraph(ctx, ctx.destination); } return ctx; }
function makeIR(c, secs = 2.2, decay = 3) { const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
function makeGraph(c, dest) {
  const G = { c, tracks: {}, groups: {} };
  G.master = c.createGain(); G.lim = c.createDynamicsCompressor();
  Object.entries({ threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.12 }).forEach(([k, v]) => G.lim[k].value = v);
  G.an = c.createAnalyser(); G.an.fftSize = 1024; G.master.connect(G.lim); G.lim.connect(G.an); G.an.connect(dest);
  G.sink = c.createGain(); G.sink.gain.value = 0; G.sink.connect(dest);
  G.conv = c.createConvolver(); G.conv.buffer = makeIR(c); G.conv.connect(G.master);
  // tranche de console : EQ 3 bandes → compresseur → pan → fader ; départs réverb + délai
  G.strip = () => {
    const n = {}, bq = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    n.inp = c.createGain(); n.low = bq('lowshelf', 120); n.mid = bq('peaking', 1200, 0.9); n.high = bq('highshelf', 6000);
    n.comp = c.createDynamicsCompressor(); n.pan = c.createStereoPanner(); n.out = c.createGain(); n.an = c.createAnalyser(); n.an.fftSize = 512;
    n.send = c.createGain(); n.dSend = c.createGain(); n.dly = c.createDelay(2); n.fb = c.createGain(); n.fb.gain.value = 0.38;
    n.inp.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high); n.high.connect(n.comp); n.comp.connect(n.pan); n.pan.connect(n.out);
    n.out.connect(n.an); n.an.connect(G.sink); n.pan.connect(n.send); n.send.connect(G.conv);
    n.pan.connect(n.dSend); n.dSend.connect(n.dly); n.dly.connect(n.fb); n.fb.connect(n.dly); n.dly.connect(G.master); n.dest = null;
    return n;
  };
  G.track = t => G.tracks[t.id] || (G.tracks[t.id] = G.strip());
  G.group = g => G.groups[g.id] || (G.groups[g.id] = G.strip());
  const set = (p, v) => c.currentTime === 0 ? (p.value = v) : p.setTargetAtTime(v, c.currentTime, 0.015);
  const kill = n => { for (const k of ['out', 'send', 'dSend', 'dly', 'fb', 'an']) try { n[k].disconnect(); } catch (e) {} };
  const route = (n, want) => { if (n.dest !== want) { if (n.dest) try { n.out.disconnect(n.dest); } catch (e) {} n.out.connect(want); n.dest = want; } };
  const fx = (n, ch, p, muted) => {
    const on = !ch.fxOff && !muted, cOn = !ch.fxOff && ch.comp;
    set(n.inp.gain, db2g(ch.vol)); set(n.pan.pan, ch.pan);
    set(n.low.gain, ch.fxOff ? 0 : ch.eq.low); set(n.mid.gain, ch.fxOff ? 0 : ch.eq.mid); set(n.high.gain, ch.fxOff ? 0 : ch.eq.high);
    set(n.send.gain, on ? ch.reverb * 0.9 : 0); set(n.dSend.gain, on ? (ch.delay || 0) * 0.8 : 0); n.dly.delayTime.value = clamp(60 / (p.bpm || 100) * 0.75, 0.05, 1.9);
    n.comp.threshold.value = cOn ? (ch.compT ?? -24) : 0; n.comp.ratio.value = cOn ? (ch.compR || 4) : 1; n.comp.knee.value = cOn ? 12 : 0;
  };
  G.apply = (p) => {
    const groups = p.groups || [], solo = p.tracks.some(t => t.solo); set(G.master.gain, db2g(p.master));
    for (const id in G.tracks) if (!p.tracks.find(t => t.id === id)) { kill(G.tracks[id]); delete G.tracks[id]; }
    for (const id in G.groups) if (!groups.find(g => g.id === id)) { kill(G.groups[id]); delete G.groups[id]; }
    for (const g of groups) { const n = G.group(g); fx(n, g, p, g.mute); set(n.out.gain, g.mute ? 0 : 1); route(n, G.master); }
    for (const t of p.tracks) {
      const n = G.track(t), gr = t.group && groups.find(g => g.id === t.group);
      n.inp.channelCount = t.ch === 'mono' ? 1 : 2; n.inp.channelCountMode = 'explicit'; n.inp.channelInterpretation = 'speakers';
      const off = t.mute || (solo && !t.solo) || (gr && gr.mute); fx(n, t, p, off); set(n.out.gain, off ? 0 : 1); route(n, gr ? G.groups[gr.id].inp : G.master);
    }
  };
  return G;
}
function schedule(G, p, from, when, onlyTrack) {
  const list = [];
  for (const cl of p.clips) {
    const buf = S.bufs[cl.src]; if (!buf || (onlyTrack && cl.track !== onlyTrack)) continue;
    const tr = p.tracks.find(t => t.id === cl.track); if (!tr) continue;
    const skip = Math.max(0, from - cl.start), dur = cl.dur - skip; if (dur <= 0.01) continue;
    const t0 = when + Math.max(0, cl.start - from), cg = db2g(cl.gain || 0);
    const src = G.c.createBufferSource(); src.buffer = buf; const g = G.c.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(cg, t0 + 0.006); g.gain.setValueAtTime(cg, t0 + Math.max(0.006, dur - 0.012)); g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(g); g.connect(G.track(tr).inp); src.start(t0, cl.offset + skip, dur); list.push(src);
  }
  return list;
}
async function loadBuf(url) { if (S.bufs[url]) return S.bufs[url]; const ab = await (await fetch(url)).arrayBuffer(); return S.bufs[url] = await getCtx().decodeAudioData(ab); }
const ensureBuffers = () => Promise.all([...new Set(S.p.clips.map(c => c.src))].map(loadBuf));
const clipsEnd = () => S.p.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const projectEnd = () => { const r = S.rec; return Math.max(clipsEnd(), r && ctx ? r.from + r.n / ctx.sampleRate : 0); };

async function renderMix({ from = 0, to = null, onlyTrack = null, sr = 44100 } = {}) {
  await ensureBuffers(); const end = (to ?? clipsEnd()) + 2.5, len = Math.max(1, Math.ceil((end - from) * sr));
  const oc = new OfflineAudioContext(2, len, sr), G = makeGraph(oc, oc.destination);
  const p = onlyTrack ? { ...S.p, tracks: S.p.tracks.map(t => t.id === onlyTrack ? { ...t, mute: false, solo: false } : t) } : S.p;
  G.apply(p); schedule(G, p, from, 0, onlyTrack); return oc.startRendering();
}
function encodeWav(chs, sr) {
  const n = chs[0].length, nc = chs.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { v.setInt16(o, clamp(chs[c][i], -1, 1) * 32767, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}
const bufToWav = (b, off = 0, dur = null) => { const s = Math.floor(off * b.sampleRate), e = dur == null ? b.length : Math.min(b.length, s + Math.floor(dur * b.sampleRate)); return encodeWav([...Array(b.numberOfChannels).keys()].map(c => b.getChannelData(c).slice(s, e)), b.sampleRate); };

/* ---------- Transport ---------- */
const pos = () => S.playing ? S.from + Math.max(0, ctx.currentTime - S.t0) : S.head;
function click(t, accent) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1600 : 1100; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.06); }
function setPlayUi() { $$('#bPlay,#fPlay').forEach(b => b.textContent = S.playing ? '⏸' : '▶'); $$('#bRec,#fRec').forEach(b => b.classList.toggle('on', S.recording)); }
// garde la tête de lecture visible (défilement par page, comme Cubase)
function follow(p, force = false) {
  if (!S.follow && !force) return; const tl = $('#tl'); if (!tl) return; const x = HEAD_W + p * S.zoom, l = tl.scrollLeft + HEAD_W, r = tl.scrollLeft + tl.clientWidth;
  if (x < l || x > r - 60) tl.scrollLeft = Math.max(0, x - HEAD_W - 80);
}
async function play(record = false) {
  const c = getCtx(); await c.resume(); stop(false); await ensureBuffers(); live.apply(S.p); follow(S.head);
  const beat = 60 / S.p.bpm, lead = record && S.countin ? 4 * beat : 0, when = c.currentTime + 0.15 + lead;
  S.t0 = when; S.from = S.head; S.nodes = schedule(live, S.p, S.head, when); S.playing = true;
  let next = lead ? when - lead : when + (Math.ceil(S.head / beat - 1e-6) * beat - S.head), n = 0;
  clearInterval(mTimer); mTimer = setInterval(() => { while (next < c.currentTime + 0.15) { if (S.metro || next < when - 1e-3) click(next, n++ % 4 === 0); next += beat; } }, 30);
  if (record) { try { await startRec(when); } catch (e) { toast('Micro indisponible : ' + e.message); stop(false); return; } }
  setPlayUi(); requestAnimationFrame(tick);
}
function stop(rewind = true) {
  if (S.playing) S.head = Math.min(pos(), 1e6);
  S.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); S.nodes = []; S.playing = false; clearInterval(mTimer);
  if (S.recording) stopRec(); if (rewind) { S.head = 0; follow(0, true); } setPlayUi(); updHead(); zeroMeters(); $$('.clip.playing').forEach(x => x.classList.remove('playing'));
}
const togglePlay = () => { if (S.playing) stop(false); else play(); };
async function seek(t) { const was = S.playing && !S.recording; if (was) stop(false); S.head = Math.max(0, t); updHead(); follow(S.head, true); if (was) await play(); }

/* Enregistrement : le signal s'affiche en direct dans un clip qui grandit pendant la prise */
const WK = `class R extends AudioWorkletProcessor{process(i){const c=i[0];if(c&&c.length)this.port.postMessage({t:currentTime,d:c.map(x=>x.slice())});return true}}registerProcessor('rec',R)`;
const BLK = 512;
async function startRec(t0) {
  const c = getCtx(); const tr = S.p.tracks.find(t => t.arm) || S.p.tracks[1] || S.p.tracks[0], nch = tr.ch === 'mono' ? 1 : 2;
  if (!S.mic) S.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } });
  if (!S.wk) { await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WK], { type: 'text/javascript' }))); S.wk = true; }
  const src = c.createMediaStreamSource(S.mic), z = c.createGain(); z.gain.value = 0;
  const node = new AudioWorkletNode(c, 'rec', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: nch, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  const r = { src, node, z, pieces: [], n: 0, pmin: [], pmax: [], bmin: 1, bmax: -1, bc: 0, level: 0, t0, track: tr.id, from: S.head, nch, el: null, cv: null };
  node.port.onmessage = e => recChunk(r, e.data);
  src.connect(node); node.connect(z); z.connect(c.destination); S.rec = r; S.recording = true; setPlayUi(); attachRecClip(r);
}
function recChunk(r, m) {
  const sr = ctx.sampleRate, L = m.d[0], R = m.d[1] || L, len = L.length;
  for (let i = 0; i < len; i += 4) r.level = Math.max(r.level, Math.abs(L[i]), Math.abs(R[i]));   // vu-mètre d'entrée (même pendant le décompte)
  let s0 = Math.round((r.t0 - m.t) * sr); if (s0 >= len) return; if (s0 < 0) s0 = 0;
  r.pieces.push(r.nch === 1 ? [L.subarray(s0)] : [L.subarray(s0), R.subarray(s0)]); r.n += len - s0;
  for (let i = s0; i < len; i++) {
    const a = L[i], b = R[i], mx = a > b ? a : b, mn = a < b ? a : b; if (mx > r.bmax) r.bmax = mx; if (mn < r.bmin) r.bmin = mn;
    if (++r.bc >= BLK) { r.pmin.push(r.bmin); r.pmax.push(r.bmax); r.bmin = 1; r.bmax = -1; r.bc = 0; }
  }
}
function attachRecClip(r) {
  const lane = $(`.lane[data-id="${r.track}"]`), t = S.p.tracks.find(x => x.id === r.track); if (!lane || !t) return;
  const el = document.createElement('div'); el.className = 'clip recclip'; el.style.left = Math.max(0, r.from) * S.zoom + 'px'; el.style.background = t.color + '33'; el.style.borderColor = '#ff4d5e';
  el.innerHTML = '<canvas></canvas><span>● REC</span>'; lane.append(el); r.el = el; r.cv = $('canvas', el); drawRec(r);
}
function drawRec(r) {
  if (!r || !r.el || !r.cv || !ctx) return; const px = Math.ceil(r.n / ctx.sampleRate * S.zoom); r.el.style.width = px + 'px'; r.el.style.display = px < 1 ? 'none' : '';
  if (px < 1) return; const W = r.cv.width = Math.min(px, 8000), H = r.cv.height = 60, g = r.cv.getContext('2d'), cols = r.pmin.length; if (!cols) return;
  const t = S.p.tracks.find(x => x.id === r.track); g.fillStyle = (t ? t.color : '#3b8cff') + 'aa'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  for (let x = 0; x < W; x++) { const a = Math.floor(x / W * cols), b = Math.max(a + 1, Math.floor((x + 1) / W * cols)); let mn = 1, mx = -1; for (let i = a; i < b && i < cols; i++) { if (r.pmin[i] < mn) mn = r.pmin[i]; if (r.pmax[i] > mx) mx = r.pmax[i]; } if (mx >= mn) g.fillRect(x, (1 - mx) * H / 2, 1, Math.max(1, (mx - mn) * H / 2)); }
}
async function stopRec() {
  const r = S.rec; S.rec = null; S.recording = false; setPlayUi(); if (!r) return; S.pending = r;
  r.src.disconnect(); r.node.disconnect(); const sr = ctx.sampleRate, done = () => { S.pending = null; render(); };
  if (r.n < sr * 0.2) { done(); return toast('Enregistrement trop court.'); }
  const chans = [...Array(r.nch).keys()].map(k => { const a = new Float32Array(r.n); let o = 0; for (const p of r.pieces) { a.set(p[k], o); o += p[k].length; } return a; });
  try {
    toast('Enregistrement du clip…'); const up = await upload(encodeWav(chans, sr), 'voix.wav'); commit();
    let start = r.from - (S.latencyMs || Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000)) / 1000, off = 0; if (start < 0) { off = -start; start = 0; }
    await loadBuf(up.url); S.p.clips.push({ id: uid(), track: r.track, src: up.url, start, offset: off, dur: up.duration - off, gain: 0, name: 'Enreg. ' + new Date().toLocaleTimeString() });
    done(); toast('Prise enregistrée sur la piste.');
  } catch (e) { done(); toast('Erreur : ' + e.message); }
}
function tick() {
  if (!S.playing) return; const p = pos(); updHead(p); follow(p); meters(); markPlaying(p);
  if (S.rec) { drawRec(S.rec); if (p + 8 > S.laneSpan) render(); }
  if (!S.recording && p > projectEnd() + 0.2) return stop(false); requestAnimationFrame(tick);
}
function markPlaying(p) { for (const el of $$('.clip[data-cid]')) { const s = +el.dataset.s, e = +el.dataset.e; el.classList.toggle('playing', p >= s && p < e); } }
function updHead(p = S.head) {
  const t = fmt(p); $('#clock').textContent = t; $('#fclock').textContent = t;
  const b = Math.floor(p / (60 / S.p.bpm) + 1e-6); $('#fbars').textContent = String(Math.floor(b / 4) + 1).padStart(3, '0') + '.' + (b % 4 + 1);
  const h = $('#playhead'); if (h) h.style.left = (HEAD_W + p * S.zoom) + 'px';
}
const lvl = an => { const d = an._b || (an._b = new Float32Array(an.fftSize)); an.getFloatTimeDomainData(d); let s = 0; for (const x of d) s += x * x; return Math.sqrt(s / d.length); };
const pct = l => clamp((g2db(l) + 60) / 60, 0, 1);
function setMeter(id, v) { $$(`[data-meter="${id}"]`).forEach(e => e.style.width = v * 100 + '%'); $$(`[data-vmeter="${id}"]`).forEach(e => e.style.height = v * 100 + '%'); }
function meters() {
  const m = $('#masterMeter').getContext('2d'), mv = pct(lvl(live.an)); m.clearRect(0, 0, 120, 16); m.fillStyle = mv > .95 ? '#f44' : '#4c8'; m.fillRect(0, 0, 120 * mv, 16); setMeter('master', mv);
  for (const t of S.p.tracks) { const n = live.tracks[t.id]; let v = n ? pct(lvl(n.an)) : 0; if (S.rec && S.rec.track === t.id) { v = Math.max(v, pct(S.rec.level)); } setMeter(t.id, v); }
  if (S.rec) S.rec.level *= 0.8;
  for (const g of S.p.groups) { const n = live.groups[g.id]; setMeter(g.id, n ? pct(lvl(n.an)) : 0); }
}
function zeroMeters() { const m = $('#masterMeter'); if (m) m.getContext('2d').clearRect(0, 0, 120, 16); $$('[data-meter]').forEach(e => e.style.width = '0'); $$('[data-vmeter]').forEach(e => e.style.height = '0'); }

/* ---------- Project / undo ---------- */
function commit() { S.undo.push(JSON.stringify(S.p)); if (S.undo.length > 60) S.undo.shift(); S.dirty = true; }
async function undo() { const s = S.undo.pop(); if (!s) return; S.p = fixProject(JSON.parse(s)); await ensureBuffers(); render(); }
const selClip = () => S.p.clips.find(c => c.id === S.sel);
const selTr = () => S.p.tracks.find(t => t.id === S.selTrack) || S.p.tracks[0];
const snapT = t => S.snap ? Math.round(t / (60 / S.p.bpm)) * (60 / S.p.bpm) : t;
function addTrack(name, ch = 'stereo') { commit(); const t = mkTrack(name || 'Piste ' + (S.p.tracks.length + 1), S.p.tracks.length, ch); S.p.tracks.push(t); S.selTrack = t.id; render(); return t; }
function addClip(track, url, start, dur, name, offset = 0) { commit(); const c = { id: uid(), track, src: url, start, offset, dur, gain: 0, name }; S.p.clips.push(c); S.sel = c.id; render(); return c; }
function newGroup(assignTo) {
  const nm = prompt('Nom du groupe d\'effets :', 'Groupe ' + (S.p.groups.length + 1)); if (!nm) return null;
  commit(); const g = mkGroup(nm, S.p.groups.length); S.p.groups.push(g); if (assignTo) assignTo.group = g.id; render(); return g;
}

/* ---------- Dialogues ---------- */
function modal(html, mount) { const m = $('#modal'); $('#modalBox').innerHTML = html; m.hidden = false; m.onpointerdown = e => { if (e.target === m) closeModal(); }; mount && mount($('#modalBox')); }
const closeModal = () => { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; };
function trackDialog() {
  modal(`<h3>Nouvelle piste audio</h3>
    <label>Nom<input id="ndName" value="Piste ${S.p.tracks.length + 1}"></label>
    <div class="opts"><label class="opt"><input type="radio" name="ndCh" value="stereo" checked><b>Stéréo</b><small>2 canaux — instrumentaux, claviers, mix</small></label>
    <label class="opt"><input type="radio" name="ndCh" value="mono"><b>Mono</b><small>1 canal — voix, micro, guitare</small></label></div>
    <label>Nombre de pistes<input id="ndN" type="number" min="1" max="16" value="1"></label>
    <div class="row"><button id="ndOk" class="accent">Ajouter</button><button id="ndCancel">Annuler</button></div>`, b => {
    const ok = () => { const ch = $('input[name=ndCh]:checked', b).value, n = clamp(+$('#ndN', b).value || 1, 1, 16), nm = $('#ndName', b).value.trim(); closeModal(); for (let i = 0; i < n; i++) addTrack(nm ? (n > 1 ? nm + ' ' + (i + 1) : nm) : null, ch); };
    $('#ndOk', b).onclick = ok; $('#ndCancel', b).onclick = closeModal; b.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    const i = $('#ndName', b); i.focus(); i.select();
  });
}
const SHORTCUTS = [['Espace', 'Lecture / Stop'], ['R', 'Enregistrer'], ['G', 'Zoom +'], ['H', 'Zoom −'], ['F', 'Ajuster le zoom au projet'], ['Début / Fin', 'Aller au début / à la fin'], ['← / →', 'Reculer / avancer d\'un temps (Maj = une mesure)'], ['↑ / ↓', 'Piste précédente / suivante'], ['S', 'Couper le clip au curseur'], ['Suppr', 'Supprimer le clip'], ['Ctrl+D', 'Dupliquer le clip'], ['M', 'Mute de la piste'], ['Maj+S', 'Solo de la piste'], ['C', 'Métronome'], ['T', 'Ajouter une piste (stéréo / mono)'], ['F3', 'Console de mixage'], ['F2', 'Barre de transport flottante'], ['B', 'Plier / déplier le panneau latéral'], ['Ctrl+Z', 'Annuler'], ['Ctrl+S', 'Sauvegarder'], ['Ctrl + molette', 'Zoom sur la timeline'], ['? / F1', 'Cette aide']];
const keysDialog = () => modal(`<h3>Raccourcis clavier</h3><div class="keys">${SHORTCUTS.map(([k, d]) => `<kbd>${k}</kbd><span>${d}</span>`).join('')}</div><div class="row"><button id="kOk" class="accent">Fermer</button></div>`, b => { $('#kOk', b).onclick = closeModal; });

/* ---------- Paramètres de canal (liés entre timeline, console, inspecteur, FX) ---------- */
const DEF = { vol: 0, pan: 0, reverb: 0, delay: 0, 'eq.low': 0, 'eq.mid': 0, 'eq.high': 0, compT: -24, compR: 4 };
const getP = (ch, k) => k.split('.').reduce((o, x) => o[x], ch);
const setP = (ch, k, v) => { const a = k.split('.'), l = a.pop(); a.reduce((o, x) => o[x], ch)[l] = v; };
const fmtP = (k, v) => k === 'pan' ? (Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)) : (k === 'reverb' || k === 'delay') ? Math.round(v * 100) + '%' : k === 'compR' ? v.toFixed(0) + ':1' : k === 'compT' ? v.toFixed(0) + ' dB' : v.toFixed(1) + ' dB';
const fxActive = ch => ch.comp || ch.reverb > 0 || ch.delay > 0 || ch.eq.low || ch.eq.mid || ch.eq.high;
const fxClass = (x, ch) => { x.classList.toggle('act', !!fxActive(ch) && !ch.fxOff); x.classList.toggle('byp', !!ch.fxOff); };
function refreshParam(id, k, src) {
  const ch = chById(id); if (!ch) return; const v = getP(ch, k);
  $$(`input[data-id="${id}"][data-k="${k}"]`).forEach(x => { if (x !== src) x.value = v; });
  $$(`[data-ro="${id}|${k}"]`).forEach(x => x.textContent = fmtP(k, v)); $$(`[data-fxbtn="${id}"]`).forEach(x => fxClass(x, ch));
}
function bindRange(inp, id, k) {
  inp.dataset.id = id; inp.dataset.k = k; inp.value = getP(chById(id), k);
  inp.oninput = () => { const ch = chById(id); if (!inp._c) { commit(); inp._c = true; } setP(ch, k, +inp.value); live && live.apply(S.p); refreshParam(id, k, inp); };
  inp.onchange = () => { inp._c = false; };
  inp.ondblclick = () => { if (DEF[k] == null) return; commit(); setP(chById(id), k, DEF[k]); live && live.apply(S.p); refreshParam(id, k); };
  return inp;
}
function sliderRow(label, id, k, min, max, step) {
  const d = document.createElement('div'); d.className = 'slider'; d.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><span class="ro" data-ro="${id}|${k}"></span>`;
  bindRange($('input', d), id, k); $('.ro', d).textContent = fmtP(k, getP(chById(id), k)); return d;
}

/* Fenêtre FX (insert / EQ / compresseur / départs) d'une piste ou d'un groupe, façon Cubase */
let fxOpen = null;
function closeFx() { const p = $('#fxpop'); if (p) p.remove(); fxOpen = null; }
function openFx(id, anchor) {
  if (fxOpen === id) return closeFx(); closeFx(); const ch = chById(id); if (!ch || id === 'master') return; fxOpen = id;
  const pop = document.createElement('div'); pop.id = 'fxpop';
  pop.innerHTML = `<div class="fxh"><span class="dot" style="background:${ch.color}"></span><b>${esc(ch.name)}</b><small>Effets</small><span class="grow"></span><label class="chk"><input type="checkbox" id="fxByp" ${ch.fxOff ? 'checked' : ''}>Bypass</label><button class="x">✕</button></div><div class="fxbody"></div>`;
  const body = $('.fxbody', pop), sec = t => { const h = document.createElement('div'); h.className = 'sec'; h.textContent = t; body.append(h); };
  sec('Panoramique'); body.append(sliderRow('Pan', id, 'pan', -1, 1, 0.01));
  sec('Égaliseur 3 bandes'); body.append(sliderRow('Graves', id, 'eq.low', -15, 15, 0.5), sliderRow('Médiums', id, 'eq.mid', -15, 15, 0.5), sliderRow('Aigus', id, 'eq.high', -15, 15, 0.5));
  sec('Compresseur'); const cl = document.createElement('label'); cl.className = 'chk'; cl.innerHTML = `<input type="checkbox" ${ch.comp ? 'checked' : ''}> Activer`; $('input', cl).onchange = e => { commit(); ch.comp = e.target.checked; live && live.apply(S.p); refreshParam(id, 'vol'); }; body.append(cl, sliderRow('Seuil', id, 'compT', -50, 0, 1), sliderRow('Ratio', id, 'compR', 1, 20, 0.5));
  sec('Départs d\'effets'); body.append(sliderRow('Réverb', id, 'reverb', 0, 1, 0.01), sliderRow('Délai', id, 'delay', 0, 1, 0.01));
  document.body.append(pop); $('#fxByp', pop).onchange = e => { commit(); ch.fxOff = e.target.checked; live && live.apply(S.p); refreshParam(id, 'vol'); }; $('.x', pop).onclick = closeFx;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = clamp(r.left, 6, innerWidth - w - 6) + 'px'; pop.style.top = clamp(r.bottom + 4 > innerHeight - h - 6 ? r.top - h - 4 : r.bottom + 4, 6, innerHeight - h - 6) + 'px';
}

/* ---------- Timeline rendering ---------- */
function drawWave(cv, buf, off, dur, color) {
  const w = cv.width = Math.min(3000, Math.max(20, Math.floor(dur * S.zoom))), h = cv.height = 60, g = cv.getContext('2d'), c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
  const s0 = Math.floor(off * buf.sampleRate), per = Math.max(1, Math.floor(dur * buf.sampleRate / w)); g.fillStyle = color + 'cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff';
  for (let x = 0; x < w; x++) { let mn = 1, mx = -1; const a = s0 + x * per, step = Math.max(1, per >> 6); for (let i = a; i < a + per && i < c0.length; i += step) { const v = c0[i], u = c1[i]; if (v < mn) mn = v; if (v > mx) mx = v; if (u < mn) mn = u; if (u > mx) mx = u; } if (mx >= mn) g.fillRect(x, (1 - mx) * h / 2, 1, Math.max(1, (mx - mn) * h / 2)); }
}
function setZoom(z, clientX) {
  z = clamp(z, 5, 600); if (Math.abs(z - S.zoom) < 1e-6) return; const tl = $('#tl'), old = S.zoom, hx = HEAD_W + S.head * old - tl.scrollLeft, bx = tl.getBoundingClientRect().left;
  let ax, at;   // point fixe pendant le zoom : souris, sinon curseur de lecture s'il est visible, sinon centre
  if (clientX != null) { ax = clientX - bx; at = (tl.scrollLeft + ax - HEAD_W) / old; }
  else if (hx > HEAD_W && hx < tl.clientWidth) { ax = hx; at = S.head; } else { ax = HEAD_W + (tl.clientWidth - HEAD_W) / 2; at = (tl.scrollLeft + ax - HEAD_W) / old; }
  S.zoom = z; $('#zoom').value = Math.round(z); render(); tl.scrollLeft = Math.max(0, HEAD_W + at * z - ax);
}
const zoomFit = () => { const tl = $('#tl'), end = Math.max(clipsEnd(), 8); setZoom((tl.clientWidth - HEAD_W - 30) / end); $('#tl').scrollLeft = 0; };
function groupSel(t) {
  const s = document.createElement('select'); s.className = 'grp'; s.title = 'Groupe d\'effets (bus)';
  s.innerHTML = `<option value="">Grp —</option>` + S.p.groups.map(g => `<option value="${g.id}" ${t.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('') + `<option value="__new">+ Nouveau groupe…</option>`;
  s.onchange = () => { if (s.value === '__new') { if (!newGroup(t)) s.value = t.group; return; } commit(); t.group = s.value; live && live.apply(S.p); render(); s.blur(); };
  return s;
}
function toggleCh(t) { commit(); t.ch = t.ch === 'mono' ? 'stereo' : 'mono'; live && live.apply(S.p); render(); }
function render() {
  const tl = $('#tlInner'), box = $('#tl'), sx = box.scrollLeft, sy = box.scrollTop, W = Math.max(projectEnd() + 30, (box.clientWidth - HEAD_W) / S.zoom + 5) * S.zoom, bar = 4 * 60 / S.p.bpm * S.zoom, beat = bar / 4;
  S.laneSpan = W / S.zoom; tl.style.width = (HEAD_W + W) + 'px'; tl.innerHTML = '';
  const ru = document.createElement('div'); ru.className = 'ruler'; ru.innerHTML = `<div class="hd"></div><div class="lane" style="width:${W}px"></div>`; tl.append(ru);
  for (let b = 0; b * bar < W; b++) { const l = document.createElement('div'); l.className = 'rl'; l.style.left = b * bar + 'px'; l.textContent = b + 1; ru.lastChild.append(l); }
  ru.lastChild.onpointerdown = e => {
    const ln = ru.lastChild, r = ln.getBoundingClientRect(), at = ev => Math.max(0, snapT((ev.clientX - r.left) / S.zoom)); ln.setPointerCapture(e.pointerId); S.head = at(e); updHead();
    ln.onpointermove = ev => { S.head = at(ev); updHead(); }; ln.onpointerup = () => { ln.onpointermove = ln.onpointerup = null; if (S.playing && !S.recording) { const h = S.head; S.head = pos(); seek(h); } };
  };
  for (const t of S.p.tracks) {
    const row = document.createElement('div'); row.className = 'trow' + (t.id === S.selTrack ? ' sel' : '');
    row.innerHTML = `<div class="hd">
      <div class="nm"><span class="dot" style="background:${t.color}"></span><input class="tn" value="${esc(t.name)}"><button class="m ${t.mute ? 'on' : ''}" title="Mute (M)">M</button><button class="s ${t.solo ? 'on' : ''}" title="Solo (Maj+S)">S</button><button class="r ${t.arm ? 'on' : ''}" title="Armer pour l'enregistrement">●</button></div>
      <div class="nm"><input type="range" class="vol" min="-60" max="6" step="0.5"><div class="mt"><div data-meter="${t.id}"></div></div></div>
      <div class="nm tb"><button class="fxb" data-fxbtn="${t.id}" title="Effets de la piste : EQ, compresseur, réverb, délai">FX</button><input type="range" class="pan" min="-1" max="1" step="0.01" title="Panoramique (double-clic = centre)"><span class="ro panro" data-ro="${t.id}|pan"></span><button class="cht" title="Mono / Stéréo">${t.ch === 'mono' ? 'MONO' : 'STÉRÉO'}</button></div>
    </div><div class="lane" data-id="${t.id}" style="width:${W}px;background-image:linear-gradient(to right,rgba(255,255,255,.09) 1px,transparent 1px),linear-gradient(to right,rgba(255,255,255,.035) 1px,transparent 1px);background-size:${bar}px 100%,${beat}px 100%"></div>`;
    const hd = $('.hd', row); $('.tb', row).append(groupSel(t));
    $('.tn', row).onchange = e => { commit(); t.name = e.target.value; renderConsole(); };
    $('.m', row).onclick = () => { commit(); t.mute = !t.mute; render(); live && live.apply(S.p); }; $('.s', row).onclick = () => { commit(); t.solo = !t.solo; render(); live && live.apply(S.p); };
    $('.r', row).onclick = () => { S.p.tracks.forEach(x => x.arm = false); t.arm = true; render(); };
    bindRange($('.vol', row), t.id, 'vol'); bindRange($('.pan', row), t.id, 'pan'); $('.panro', row).textContent = fmtP('pan', t.pan);
    const fb = $('.fxb', row); fxClass(fb, t); fb.onclick = () => openFx(t.id, fb); $('.cht', row).onclick = () => toggleCh(t);
    hd.onpointerdown = e => { if (!['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) { S.selTrack = t.id; render(); showInspector(); } };
    tl.append(row); const lane = $('.lane', row);
    for (const c of S.p.clips.filter(c => c.track === t.id)) lane.append(clipEl(c, t));
    lane.onpointerdown = e => { if (e.target !== lane) return; S.sel = null; S.selTrack = t.id; const h = Math.max(0, snapT((e.clientX - lane.getBoundingClientRect().left) / S.zoom)); if (S.playing && !S.recording) seek(h); else { S.head = h; } render(); showInspector(); };
  }
  const ph = document.createElement('div'); ph.id = 'playhead'; tl.append(ph); updHead(); $('#bpm').value = S.p.bpm; $('#projName').value = S.p.name; $('#masterVol').value = S.p.master;
  box.scrollLeft = sx; box.scrollTop = sy; const rr = S.rec || S.pending; if (rr) attachRecClip(rr);
  live && live.apply(S.p); showInspector(); renderConsole();
}
function clipEl(c, t) {
  const el = document.createElement('div'); el.className = 'clip' + (c.id === S.sel ? ' sel' : ''); el.dataset.cid = c.id; el.dataset.s = c.start; el.dataset.e = c.start + c.dur; el.style.left = c.start * S.zoom + 'px'; el.style.width = c.dur * S.zoom + 'px'; el.style.background = t.color + '55';
  el.innerHTML = `<canvas></canvas><span>${esc(c.name)}</span><i class="l"></i><i class="r"></i>`;
  if (S.bufs[c.src]) drawWave($('canvas', el), S.bufs[c.src], c.offset, c.dur, t.color);
  el.onpointerdown = e => {
    e.stopPropagation(); S.sel = c.id; S.selTrack = c.track; $$('.clip.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
    const mode = e.target.className === 'l' ? 'l' : e.target.className === 'r' ? 'r' : 'move', x0 = e.clientX, o = { ...c }, max = (S.bufs[c.src]?.duration || 1e9); let moved = false, lane = el.parentNode;
    el.setPointerCapture(e.pointerId);
    el.onpointermove = ev => {
      const dx = (ev.clientX - x0) / S.zoom; if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return;
      if (mode === 'move') { c.start = Math.max(0, snapT(o.start + dx)); el.style.left = c.start * S.zoom + 'px'; const ln = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.lane[data-id]'); if (ln && ln !== lane) { lane = ln; ln.append(el); c.track = ln.dataset.id; } }
      else if (mode === 'r') { c.dur = clamp(o.dur + dx, 0.05, max - o.offset); el.style.width = c.dur * S.zoom + 'px'; }
      else { const d = clamp(dx, -o.start, o.dur - 0.05); c.start = o.start + d; c.offset = o.offset + d; c.dur = o.dur - d; el.style.left = c.start * S.zoom + 'px'; el.style.width = c.dur * S.zoom + 'px'; }
    };
    el.onpointerup = () => { el.onpointermove = null; if (moved) { S.undo.push(JSON.stringify({ ...S.p, clips: S.p.clips.map(k => k.id === c.id ? o : k) })); S.dirty = true; } render(); };
  };
  return el;
}

/* ---------- Console de mixage ---------- */
function strip(ch, kind) {
  const el = document.createElement('div'), id = ch.id; el.className = 'strip ' + kind + (kind === 'track' && id === S.selTrack ? ' sel' : ''); el.dataset.sid = id;
  const mn = kind === 'master' ? -30 : -60;
  el.innerHTML = `<div class="sh" style="border-top:3px solid ${ch.color}"><input class="sname" value="${esc(ch.name)}" ${kind === 'master' ? 'readonly' : ''}></div>
    <div class="sr">${kind === 'track' ? `<button class="cht" title="Mono / Stéréo">${ch.ch === 'mono' ? 'MONO' : 'ST'}</button>` : ''}${kind !== 'master' ? `<button class="fxb" data-fxbtn="${id}" title="Effets">FX</button>` : ''}${kind === 'group' ? '<button class="gdel" title="Supprimer le groupe">🗑</button>' : ''}</div>
    ${kind === 'track' ? '<div class="sr gs"></div>' : ''}
    ${kind !== 'master' ? `<div class="eqs">${[['eq.high', 'HF'], ['eq.mid', 'MF'], ['eq.low', 'BF']].map(([k, l]) => `<div class="mini"><span>${l}</span><input type="range" min="-15" max="15" step="0.5" data-ek="${k}"><span class="ro" data-ro="${id}|${k}"></span></div>`).join('')}
    <div class="mini"><span>Rev</span><input type="range" min="0" max="1" step="0.01" data-ek="reverb"><span class="ro" data-ro="${id}|reverb"></span></div>
    <div class="mini"><span>Dly</span><input type="range" min="0" max="1" step="0.01" data-ek="delay"><span class="ro" data-ro="${id}|delay"></span></div>
    <div class="mini"><span>Pan</span><input type="range" min="-1" max="1" step="0.01" data-ek="pan"><span class="ro" data-ro="${id}|pan"></span></div></div>` : ''}
    <div class="sr ms">${kind !== 'master' ? `<button class="m ${ch.mute ? 'on' : ''}">M</button>` : ''}${kind === 'track' ? `<button class="s ${ch.solo ? 'on' : ''}">S</button><button class="r ${ch.arm ? 'on' : ''}">●</button>` : ''}</div>
    <div class="fw"><div class="fader"><input type="range" min="${mn}" max="6" step="0.1" data-ek="vol"></div><div class="vm"><div data-vmeter="${id}"></div></div></div>
    <div class="vro ro" data-ro="${id}|vol"></div>`;
  $$('input[data-ek]', el).forEach(i => { bindRange(i, id, i.dataset.ek); const r = $(`[data-ro="${id}|${i.dataset.ek}"]`, el); if (r) r.textContent = fmtP(i.dataset.ek, getP(ch, i.dataset.ek)); });
  const nm = $('.sname', el); nm.onchange = () => { commit(); ch.name = nm.value; render(); };
  const fb = $('.fxb', el); if (fb) { fxClass(fb, ch); fb.onclick = () => openFx(id, fb); }
  const mb = $('.m', el); if (mb) mb.onclick = () => { commit(); ch.mute = !ch.mute; render(); live && live.apply(S.p); };
  if (kind === 'track') { $('.gs', el).append(groupSel(ch)); $('.cht', el).onclick = () => toggleCh(ch); $('.s', el).onclick = () => { commit(); ch.solo = !ch.solo; render(); live && live.apply(S.p); }; $('.r', el).onclick = () => { S.p.tracks.forEach(x => x.arm = false); ch.arm = true; render(); }; $('.sh', el).onpointerdown = e => { if (e.target.tagName !== 'INPUT') { S.selTrack = id; render(); } }; }
  if (kind === 'group') $('.gdel', el).onclick = () => { if (!confirm('Supprimer le groupe « ' + ch.name + ' » ? Les pistes retournent au master.')) return; commit(); S.p.tracks.forEach(t => { if (t.group === id) t.group = ''; }); S.p.groups = S.p.groups.filter(g => g.id !== id); render(); };
  return el;
}
function renderConsole() {
  const c = $('#console'); if (!c || c.hidden) return; const box = $('#strips'), sx = box.scrollLeft; box.innerHTML = '';
  S.p.tracks.forEach(t => box.append(strip(t, 'track')));
  if (S.p.groups.length) { const sp = document.createElement('div'); sp.className = 'ssep'; sp.textContent = 'GROUPES'; box.append(sp); S.p.groups.forEach(g => box.append(strip(g, 'group'))); }
  const sp = document.createElement('div'); sp.className = 'grow'; box.append(sp); box.append(strip(MASTER, 'master')); box.scrollLeft = sx; fitFaders();
  if (!S.playing) zeroMeters();
}
function fitFaders() { const fw = $('#strips .fw'); if (fw) $('#strips').style.setProperty('--fh', Math.max(60, fw.clientHeight - 6) + 'px'); }
function toggleConsole(show) { const c = $('#console'); c.hidden = show == null ? !c.hidden : !show; $('#bConsole').classList.toggle('on', !c.hidden); store.set('console', c.hidden ? '0' : '1'); renderConsole(); }

/* ---------- Barre de transport flottante ---------- */
function placeFloat(x, y) { const f = $('#fbar'); f.style.left = clamp(x, 0, innerWidth - f.offsetWidth) + 'px'; f.style.top = clamp(y, 0, innerHeight - f.offsetHeight) + 'px'; }
function toggleFloat(show) {
  const f = $('#fbar'); f.hidden = show == null ? !f.hidden : !show; $('#bFloat').classList.toggle('on', !f.hidden); store.set('float', f.hidden ? '0' : '1');
  if (!f.hidden) { const sx = store.get('fx', null), sy = store.get('fy', null); placeFloat(sx == null ? (innerWidth - f.offsetWidth) / 2 : +sx, sy == null ? innerHeight - 130 : +sy); }
}
function initFloat() {
  const f = $('#fbar'); let d = null;
  f.onpointerdown = e => { if (['BUTTON', 'INPUT', 'LABEL'].includes(e.target.tagName)) return; const r = f.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; f.setPointerCapture(e.pointerId); f.classList.add('drag'); };
  f.onpointermove = e => { if (d) placeFloat(e.clientX - d.dx, e.clientY - d.dy); };
  f.onpointerup = () => { if (!d) return; d = null; f.classList.remove('drag'); store.set('fx', parseInt(f.style.left)); store.set('fy', parseInt(f.style.top)); };
  $('#fPlay').onclick = () => $('#bPlay').click(); $('#fStop').onclick = () => $('#bStop').click(); $('#fRew').onclick = () => $('#bRew').click(); $('#fRec').onclick = () => $('#bRec').click(); $('#fClose').onclick = () => toggleFloat(false);
  $('#fMetro').onchange = e => setMetro(e.target.checked);
}
function setMetro(v) { S.metro = v; $('#metro').checked = v; $('#fMetro').checked = v; }

/* ---------- Panneau latéral pliable ---------- */
const sideHidden = () => document.body.classList.contains('sidehid');
function setSide(open, noRender) { document.body.classList.toggle('sidehid', !open); $('#sideHandle').textContent = open ? '›' : '‹'; store.set('side', open ? '1' : '0'); if (!noRender) render(); }

/* ---------- Inspector & tools ---------- */
function showInspector() {
  const el = $('#insp'); if (!el) return; el.innerHTML = ''; const t = selTr(), c = selClip(); if (!t) return; const id = t.id;
  const h = document.createElement('div'); h.innerHTML = `<b style="color:${t.color}">● ${esc(t.name)}</b> <small class="muted">${t.ch === 'mono' ? 'mono' : 'stéréo'}</small>`; el.append(h);
  el.append(sliderRow('Volume', id, 'vol', -60, 6, 0.5), sliderRow('Pan', id, 'pan', -1, 1, 0.01), sliderRow('Réverb', id, 'reverb', 0, 1, 0.01), sliderRow('Délai', id, 'delay', 0, 1, 0.01),
    sliderRow('Graves', id, 'eq.low', -15, 15, 0.5), sliderRow('Médiums', id, 'eq.mid', -15, 15, 0.5), sliderRow('Aigus', id, 'eq.high', -15, 15, 0.5));
  const cp = document.createElement('label'); cp.className = 'chk'; cp.innerHTML = `<input type="checkbox" ${t.comp ? 'checked' : ''}> Compresseur (voix)`; $('input', cp).onchange = e => { commit(); t.comp = e.target.checked; live && live.apply(S.p); }; el.append(cp);
  const b = document.createElement('div'); b.className = 'row wrap'; b.innerHTML = `<button data-a="fx">FX…</button><button data-a="ch">${t.ch === 'mono' ? 'Passer en stéréo' : 'Passer en mono'}</button><button data-a="del">Supprimer la piste</button><button data-a="dup">Dupliquer le clip</button>`; el.append(b);
  b.onclick = e => { const a = e.target.dataset.a; if (a === 'fx') openFx(id, e.target); if (a === 'ch') toggleCh(t); if (a === 'del' && S.p.tracks.length > 1) { commit(); S.p.clips = S.p.clips.filter(k => k.track !== t.id); S.p.tracks = S.p.tracks.filter(k => k.id !== t.id); S.selTrack = null; render(); } if (a === 'dup' && c) { commit(); const n = { ...c, id: uid(), start: c.start + c.dur }; S.p.clips.push(n); S.sel = n.id; render(); } };
  if (c) { const d = document.createElement('div'); d.innerHTML = `<hr><b>Clip : ${esc(c.name)}</b>`; const s = document.createElement('div'); s.className = 'slider'; s.innerHTML = `<span>Gain clip</span><input type="range" min="-24" max="12" step="0.5" value="${c.gain || 0}"><span>${(c.gain || 0).toFixed(1)} dB</span>`; const i = $('input', s); i.oninput = () => { c.gain = +i.value; $('span:last-child', s).textContent = c.gain.toFixed(1) + ' dB'; }; i.onchange = () => { S.dirty = true; }; d.append(s); el.append(d); }
}
function splitAtHead() { const p = pos(), c = S.p.clips.find(k => k.id === S.sel) || S.p.clips.find(k => k.track === selTr().id && p > k.start && p < k.start + k.dur); if (!c || p <= c.start + .02 || p >= c.start + c.dur - .02) return toast('Placez le curseur à l\'intérieur d\'un clip.'); commit(); const d = p - c.start, n = { ...c, id: uid(), start: p, offset: c.offset + d, dur: c.dur - d }; c.dur = d; S.p.clips.push(n); render(); }
function delSel() { if (!S.sel) return; commit(); S.p.clips = S.p.clips.filter(c => c.id !== S.sel); S.sel = null; render(); }
function dupSel() { const c = selClip(); if (!c) return; commit(); const n = { ...c, id: uid(), start: c.start + c.dur }; S.p.clips.push(n); S.sel = n.id; render(); }
function rmsOf(t) { let s = 0, n = 0; for (const c of S.p.clips.filter(k => k.track === t.id)) { const b = S.bufs[c.src]; if (!b) continue; const d = b.getChannelData(0), a = Math.floor(c.offset * b.sampleRate), e = Math.min(d.length, a + Math.floor(c.dur * b.sampleRate)); for (let i = a; i < e; i += 7) { s += d[i] * d[i]; n++; } } return n ? g2db(Math.sqrt(s / n)) : null; }
function autoMix() {
  commit(); const isV = t => /voix|vocal|chant|lead|choeur|chœur/i.test(t.name); const hasV = S.p.tracks.some(t => isV(t) && rmsOf(t) != null);
  for (const t of S.p.tracks) { const r = rmsOf(t); if (r == null) continue; const target = isV(t) ? -18 : hasV ? -23 : -20; t.vol = clamp(Math.round((target - r) * 2) / 2, -24, 12);
    if (isV(t)) { t.comp = true; t.reverb = Math.max(t.reverb, 0.15); t.eq.low = -3; t.eq.high = 2; } else if (hasV) t.eq.mid = -2; t.mute = false; t.solo = false; }
  S.p.master = -1; render(); toast('Mixage automatique appliqué (point de départ à affiner).');
}
function detectBpm(buf) {
  const sr = buf.sampleRate, d = buf.getChannelData(0), hop = 512, n = Math.min(Math.floor(d.length / hop), 4000), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j += 2) s += Math.abs(d[i * hop + j]); env[i] = s; }
  const on = env.map((v, i) => i ? Math.max(0, v - env[i - 1]) : 0), fps = sr / hop; let best = 0, bb = 0;
  for (let bpm = 70; bpm <= 170; bpm += 0.5) { const lag = fps * 60 / bpm; let sc = 0; for (let i = 0; i + lag < n; i++) { const k = i + lag, f = k | 0; sc += on[i] * (on[f] * (1 - (k - f)) + (on[f + 1] || 0) * (k - f)); } if (sc > best) { best = sc; bb = bpm; } }
  return bb;
}

/* ---------- Generation ---------- */
async function runJob(path, body, onp) { const { job } = await post(path, body); for (;;) { await sleep(1000); const j = await api('/api/jobs/' + job); onp(j); if (j.status === 'done') return j.result; if (j.status === 'error') throw new Error(j.error); } }
function showProg(on, p = 0, m = '') { const b = $('#gProg'); b.hidden = !on; $('div', b).style.width = p * 100 + '%'; $('span', b).textContent = m ? `${m} ${Math.round(p * 100)}%` : ''; }
async function guideUrl(mode, what) {
  await ensureBuffers(); const c = selClip();
  if (mode === 'continue') { if (!c) throw new Error('Sélectionnez un clip à prolonger.'); const b = S.bufs[c.src], d = Math.min(12, c.dur); return (await upload(bufToWav(b, c.offset + c.dur - d, d), 'g.wav')).url; }
  if (what === 'file') { const f = $('#gFile').files[0]; if (!f) throw new Error('Choisissez un fichier audio.'); return (await upload(f, f.name)).url; }
  if (what === 'clip') { if (!c) throw new Error('Sélectionnez un clip (la voix ou la piste).'); return (await upload(bufToWav(S.bufs[c.src], c.offset, Math.min(c.dur, 90)), 'g.wav')).url; }
  const ab = await renderMix({ onlyTrack: what === 'track' ? selTr().id : null }); return (await upload(bufToWav(ab), 'g.wav')).url;
}
async function generate(a = {}) {
  const mode = a.mode || $('input[name=gsrc]:checked').value, what = $('#gWhat').value, prompt = a.prompt || $('#gPrompt').value, dur = +(a.duration || $('#gDur').value);
  const btn = $('#bGen'); btn.disabled = true; showProg(true, 0.01, 'Préparation');
  try {
    const sc = selClip(), guide = mode === 'free' ? null : await guideUrl(mode, what);
    const r = await runJob('/api/generate', { prompt, duration: dur, bpm: S.p.bpm, temperature: +$('#gTemp').value, guidance: +$('#gGuid').value, mode, guide_url: guide }, j => showProg(true, j.progress, j.message));
    await loadBuf(r.url); const pl = $('#gPlace').value; let tr = pl === 'sel' ? selTr() : pl === 'new' ? addTrack('Instru IA ' + (S.p.tracks.length + 1)) : S.p.tracks[0];
    addClip(tr.id, r.url, mode === 'continue' && sc ? sc.start + sc.dur : S.head, r.duration, (prompt || 'Instru IA').slice(0, 28)); toast('Instrumental généré et placé sur la piste.');
  } catch (e) { toast('Génération impossible : ' + e.message, 9000); $('#gStatus').textContent = e.message; } finally { btn.disabled = false; showProg(false); }
}
async function separate() {
  const c = selClip(); if (!c) return toast('Sélectionnez un clip.'); showProg(true, 0.02, 'Stems');
  try { const r = await runJob('/api/separate', { url: c.src }, j => showProg(true, j.progress, j.message)); commit();
    for (const s of r.stems) { await loadBuf(s.url); const t = mkTrack(s.name, S.p.tracks.length); S.p.tracks.push(t); S.p.clips.push({ id: uid(), track: t.id, src: s.url, start: c.start, offset: c.offset, dur: c.dur, gain: 0, name: s.name }); }
    S.p.tracks.find(t => t.id === c.track).mute = true; render(); toast('Stems créés (piste d\'origine coupée).'); } catch (e) { toast('Stems : ' + e.message, 9000); } finally { showProg(false); }
}

/* ---------- Export ---------- */
async function exportMix() {
  if (!S.p.clips.length) return toast('Rien à exporter.'); const fmtSel = (prompt('Format d\'export : wav ou mp3 ?', 'mp3') || '').toLowerCase(); if (!['wav', 'mp3'].includes(fmtSel)) return;
  toast('Rendu du mix en cours…', 60000);
  try { const ab = await renderMix(); const chs = [0, 1].map(i => ab.getChannelData(i)); let pk = 0; chs.forEach(c => { for (let i = 0; i < c.length; i += 3) pk = Math.max(pk, Math.abs(c[i])); });
    if (pk > 0) { const g = db2g(-1) / pk; chs.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= g; }); }   // normalisation -1 dBFS
    const f = new FormData(); f.append('file', encodeWav(chs, ab.sampleRate), 'mix.wav'); f.append('fmt', fmtSel); f.append('name', S.p.name);
    const r = await api('/api/export', { method: 'POST', body: f }); const a = document.createElement('a'); a.href = r.url; a.download = ''; a.click(); toast('Export terminé : ' + r.file, 9000);
  } catch (e) { toast('Export : ' + e.message, 9000); }
}

/* ---------- Assistant ---------- */
function findTrack(ref) { if (ref == null) return selTr(); const r = norm(ref); return S.p.tracks.find(t => t.id === ref) || S.p.tracks.find(t => norm(t.name) === r) || S.p.tracks.find(t => norm(t.name).includes(r)) || (/^\d+$/.test(r) ? S.p.tracks[+r - 1] : null); }
async function runAction(a) {
  switch (a.type) {
    case 'set_track': { const t = findTrack(a.track); if (!t) return `Piste « ${a.track} » introuvable`; commit();
      if (a.volume_db != null) t.vol = clamp(+a.volume_db, -60, 6); if (a.delta_db != null) t.vol = clamp(t.vol + +a.delta_db, -60, 6); if (a.pan != null) t.pan = clamp(+a.pan, -1, 1);
      ['mute', 'solo', 'comp'].forEach(k => { if (a[k] != null) t[k] = !!a[k]; }); if (a.reverb != null) t.reverb = clamp(+a.reverb, 0, 1); if (a.eq) Object.assign(t.eq, a.eq); render(); return `Piste « ${t.name} » ajustée`; }
    case 'set_master': commit(); S.p.master = clamp(+a.volume_db, -30, 6); render(); return 'Master ' + S.p.master + ' dB';
    case 'set_bpm': commit(); S.p.bpm = clamp(+a.bpm, 40, 220); render(); return 'BPM ' + S.p.bpm;
    case 'add_track': addTrack(a.name); return 'Piste ajoutée';
    case 'generate': selectTab('gen'); $('#gPrompt').value = a.prompt || $('#gPrompt').value; $('#gDur').value = a.duration || 30; generate({ prompt: a.prompt, duration: a.duration || 30, mode: a.mode || 'free' }); return 'Génération lancée';
    case 'automix': autoMix(); return 'Mixage auto';
    case 'transport': a.action === 'play' ? play() : a.action === 'record' ? play(true) : stop(false); return 'Transport : ' + a.action;
    case 'export': exportMix(); return 'Export';
    case 'select_tab': selectTab(a.tab); return 'Onglet ' + a.tab;
  } return 'Action ignorée : ' + a.type;
}
function chatAdd(txt, cls = '', sub = '') { const m = document.createElement('div'); m.className = 'msg ' + cls; m.textContent = txt; if (sub) { const s = document.createElement('small'); s.textContent = sub; m.append(s); } $('#chat').append(m); $('#chat').scrollTop = 1e9; }
async function chatSend() {
  const msg = $('#chatIn').value.trim(); if (!msg) return; $('#chatIn').value = ''; chatAdd(msg, 'u'); await ensureBuffers();
  const state = { bpm: S.p.bpm, master_db: S.p.master, tracks: S.p.tracks.map(t => ({ name: t.name, volume_db: t.vol, pan: t.pan, mute: t.mute, solo: t.solo, reverb: t.reverb, eq: t.eq, comp: t.comp, rms_db: rmsOf(t) == null ? null : Math.round(rmsOf(t)), clips: S.p.clips.filter(c => c.track === t.id).length })) };
  try { const r = await post('/api/assistant', { message: msg, state }); const res = []; for (const a of r.actions || []) res.push(await runAction(a)); chatAdd(r.reply || '…', '', res.join(' · ')); $('#chatMode').textContent = 'Mode : ' + r.mode; }
  catch (e) { chatAdd('Erreur : ' + e.message); }
}

/* ---------- UI wiring ---------- */
function selectTab(n) { if (sideHidden()) setSide(true); $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === n)); $$('.tab').forEach(t => t.hidden = t.id !== 't-' + n); }
async function loadSettings() {
  const s = await api('/api/settings'), sel = $('#sProv'); sel.innerHTML = Object.keys(s.providers).map(k => `<option>${k}</option>`).join(''); sel.value = s.provider || 'groq';
  $('#sEnabled').checked = !!s.enabled; $('#sModel').value = s.model || ''; $('#sBase').value = s.base_url || ''; $('#sKey').placeholder = s.key_set ? '(clé enregistrée — laisser vide pour conserver)' : 'Collez votre clé API gratuite';
  const st = await api('/api/status'), ok = x => x ? '✅' : '❌';
  $('#sysStatus').innerHTML = `Moteur : ${st.device.toUpperCase()} · torch ${ok(st.torch)} transformers ${ok(st.transformers)} ffmpeg ${ok(st.ffmpeg)} demucs ${ok(st.demucs)}<br>` + Object.entries(st.models).map(([k, v]) => `${ok(v.present)} ${k}`).join('<br>') + `<br>Dossier modèles : ${st.models_dir}`;
  $('#chatMode').textContent = 'Mode : ' + (s.enabled ? 'en ligne : ' + s.provider : 'local (hors-ligne)');
}
async function saveProject() { await post('/api/projects/save', { name: S.p.name, project: S.p }); S.dirty = false; toast('Projet sauvegardé.'); }
function moveSel(d) { const i = S.p.tracks.findIndex(t => t.id === selTr().id), t = S.p.tracks[clamp(i + d, 0, S.p.tracks.length - 1)]; S.selTrack = t.id; S.sel = null; render(); }
const stepHead = d => { const b = 60 / S.p.bpm * d, h = Math.max(0, (S.playing ? pos() : S.head) + b); if (S.playing && !S.recording) seek(h); else { S.head = h; updHead(); follow(h, true); } };

function onKey(e) {
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const t = e.target, tag = t.tagName, typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type)) || t.isContentEditable;
  if (typing) { if (e.key === 'Escape') t.blur(); return; }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space' && !mod) { e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); if (!e.repeat) togglePlay(); return; }
  if (mod) {
    if (k === 'z') { e.preventDefault(); undo(); } else if (k === 's') { e.preventDefault(); saveProject().catch(x => toast(x.message)); } else if (k === 'd') { e.preventDefault(); dupSel(); }
    return;
  }
  if (e.altKey) return;
  const hit = () => e.preventDefault();
  switch (k) {
    case 'g': hit(); setZoom(S.zoom * 1.25); break;
    case 'h': hit(); setZoom(S.zoom / 1.25); break;
    case 'f': hit(); zoomFit(); break;
    case 'r': hit(); $('#bRec').click(); break;
    case 's': hit(); if (e.shiftKey) { const tr = selTr(); commit(); tr.solo = !tr.solo; render(); } else splitAtHead(); break;
    case 'm': hit(); { const tr = selTr(); commit(); tr.mute = !tr.mute; render(); } break;
    case 'c': hit(); setMetro(!S.metro); break;
    case 't': hit(); trackDialog(); break;
    case 'b': hit(); setSide(sideHidden()); break;
    case 'delete': case 'backspace': hit(); delSel(); break;
    case 'home': hit(); seek(0); break;
    case 'end': hit(); seek(clipsEnd()); break;
    case 'arrowleft': hit(); stepHead(e.shiftKey ? -4 : -1); break;
    case 'arrowright': hit(); stepHead(e.shiftKey ? 4 : 1); break;
    case 'arrowup': hit(); moveSel(-1); break;
    case 'arrowdown': hit(); moveSel(1); break;
    case 'f1': case '?': hit(); keysDialog(); break;
    case 'f2': hit(); toggleFloat(); break;
    case 'f3': hit(); toggleConsole(); break;
    case 'escape': closeFx(); break;
  }
}
function init() {
  ['Gospel traditionnel', 'Bikutsi', 'Afrobeat', 'Worship lent', 'Rumba congolaise', 'Highlife', 'Chorale a cappella', 'Piano & basse', 'Percussions'].forEach(s => { const b = document.createElement('button'); b.textContent = s; b.onclick = () => $('#gPrompt').value += ($('#gPrompt').value ? ', ' : '') + s.toLowerCase(); $('#chips').append(b); });
  $$('#tabs button').forEach(b => b.onclick = () => { if (b.classList.contains('on') && !sideHidden()) setSide(false); else selectTab(b.dataset.t); });
  $('#sideHandle').onclick = () => setSide(sideHidden());
  $$('input[name=gsrc]').forEach(r => r.onchange = () => $('#gWhatBox').hidden = $('input[name=gsrc]:checked').value !== 'melody');
  $('#gWhat').onchange = () => { if ($('#gWhat').value === 'file') $('#gFile').click(); };
  $('#bPlay').onclick = togglePlay; $('#bStop').onclick = () => stop(true); $('#bRew').onclick = () => seek(0);
  $('#bRec').onclick = () => S.recording ? stop(false) : play(true); $('#bAddTrack').onclick = trackDialog; $('#bSplit').onclick = splitAtHead; $('#bDel').onclick = delSel; $('#bUndo').onclick = undo;
  $('#bConsole').onclick = () => toggleConsole(); $('#bConsoleClose').onclick = () => toggleConsole(false); $('#bFloat').onclick = () => toggleFloat(); $('#bKeys').onclick = keysDialog; $('#bAddGroup').onclick = () => newGroup();
  $('#bpm').onchange = e => { commit(); S.p.bpm = clamp(+e.target.value, 40, 220); render(); }; $('#metro').onchange = e => setMetro(e.target.checked); $('#countin').onchange = e => S.countin = e.target.checked; $('#snap').onchange = e => S.snap = e.target.checked; $('#follow').onchange = e => S.follow = e.target.checked;
  $('#zoom').oninput = e => setZoom(+e.target.value); bindRange($('#masterVol'), 'master', 'vol');
  $('#tl').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX); }, { passive: false });
  $('#projName').onchange = e => S.p.name = e.target.value;
  $('#bImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { toast('Import en cours…'); const r = await upload(f, f.name); await loadBuf(r.url); addClip(selTr().id, r.url, S.head, r.duration, r.name); toast('Audio importé.'); } catch (x) { toast('Import : ' + x.message); } e.target.value = ''; };
  $('#bGen').onclick = () => generate(); $('#bStems').onclick = separate; $('#bAuto').onclick = autoMix;
  $('#bBpm').onclick = () => { const c = selClip(); if (!c || !S.bufs[c.src]) return toast('Sélectionnez un clip.'); const b = detectBpm(S.bufs[c.src]); commit(); S.p.bpm = Math.round(b); render(); toast('BPM détecté : ' + Math.round(b)); };
  $('#bExport').onclick = exportMix; $('#chatSend').onclick = chatSend; $('#chatIn').onkeydown = e => { if (e.key === 'Enter') chatSend(); };
  $('#bNew').onclick = () => { if (!S.dirty || confirm('Abandonner le projet courant ?')) { S.p = newProject(); S.undo = []; S.sel = S.selTrack = null; S.head = 0; S.dirty = false; render(); } };
  $('#bSave').onclick = () => saveProject().catch(x => toast(x.message));
  $('#bOpen').onclick = async () => { const l = await api('/api/projects'); if (!l.length) return toast('Aucun projet.'); const n = prompt('Projets : ' + l.join(', ') + '\nNom à ouvrir :', l[0]); if (!n) return; try { S.p = fixProject(await api('/api/projects/' + encodeURIComponent(n))); S.undo = []; S.sel = null; S.selTrack = S.p.tracks[0]?.id; await ensureBuffers(); render(); } catch (e) { toast(e.message); } };
  $('#sSave').onclick = async () => { await post('/api/settings', { enabled: $('#sEnabled').checked, provider: $('#sProv').value, model: $('#sModel').value, base_url: $('#sBase').value, api_key: $('#sKey').value }); $('#sKey').value = ''; S.latencyMs = +$('#sLat').value || 0; await loadSettings(); toast('Réglages enregistrés.'); };
  // console redimensionnable
  const cr = $('#consoleResize'); cr.onpointerdown = e => { cr.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = $('#console').offsetHeight; cr.onpointermove = ev => { $('#console').style.height = clamp(h0 + (y0 - ev.clientY), 260, innerHeight - 260) + 'px'; fitFaders(); }; cr.onpointerup = () => { cr.onpointermove = cr.onpointerup = null; store.set('consoleH', parseInt($('#console').style.height)); }; };
  const chh = store.get('consoleH', null); if (chh) $('#console').style.height = chh + 'px';
  // clavier : écouteur global en phase de capture, actif même quand un curseur/bouton a le focus
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', e => { if (e.code === 'Space' && $('#modal').hidden && !/TEXTAREA|SELECT/.test(e.target.tagName) && !(e.target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(e.target.type))) e.preventDefault(); }, true);
  addEventListener('change', e => { if (e.target.tagName === 'SELECT' && !e.target.closest('#side')) e.target.blur(); }, true);
  document.addEventListener('pointerdown', e => { if (fxOpen && !e.target.closest('#fxpop') && !e.target.closest('[data-fxbtn]')) closeFx(); }, true);
  addEventListener('resize', () => { render(); if (!$('#fbar').hidden) placeFloat(parseInt($('#fbar').style.left) || 0, parseInt($('#fbar').style.top) || 0); }); addEventListener('beforeunload', e => { if (S.dirty) e.preventDefault(); });
  initFloat(); $('#zoom').value = S.zoom;
  S.selTrack = S.p.tracks[0].id; if (store.get('side', '1') === '0') setSide(false, true);
  render(); toggleFloat(store.get('float', '1') === '1'); if (store.get('console', '0') === '1') toggleConsole(true);
  loadSettings().catch(() => {});
  chatAdd('Bonjour ! Dites par ex. « baisse l\'instru de 3 dB », « mute la voix », « reverb voix 30% », « mixage auto » ou « génère un gospel 30 s ». Tapez ? pour voir les raccourcis clavier.');
}
init();
