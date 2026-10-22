'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const HEAD_W = 210, COLORS = ['#3b8cff', '#ffb347', '#7bd88f', '#ff6b9d', '#b388ff', '#4dd0e1', '#ffd54f', '#ff8a65'];
const uid = () => Math.random().toString(36).slice(2, 9);
const db2g = d => Math.pow(10, d / 20), g2db = g => 20 * Math.log10(Math.max(g, 1e-6));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const mkTrack = (name, i) => ({ id: uid(), name, color: COLORS[i % COLORS.length], vol: 0, pan: 0, mute: false, solo: false, reverb: 0, eq: { low: 0, mid: 0, high: 0 }, comp: false, arm: false });
const newProject = () => ({ name: 'Nouveau morceau', bpm: 100, master: 0, tracks: [mkTrack('Instrumental', 0), mkTrack('Voix chantres', 1)], clips: [] });
const S = { p: newProject(), zoom: 80, head: 0, playing: false, recording: false, sel: null, selTrack: null, undo: [], bufs: {}, t0: 0, from: 0, nodes: [], rec: null, metro: false, countin: true, snap: true, latencyMs: 0, dirty: false };
let ctx = null, live = null, mTimer = null;

function toast(m, ms = 3500) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); } t.textContent = m; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms); }
async function api(path, opt) { const r = await fetch(path, opt); if (!r.ok) { let m = r.statusText; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); } return r.json(); }
const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
async function upload(blob, name) { const f = new FormData(); f.append('file', blob, name); return api('/api/upload', { method: 'POST', body: f }); }

/* ---------- Audio engine ---------- */
function getCtx() { if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive' }); live = makeGraph(ctx, ctx.destination); } return ctx; }
function makeIR(c, secs = 2.2, decay = 3) { const n = Math.floor(c.sampleRate * secs), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
function makeGraph(c, dest) {
  const G = { c, tracks: {} };
  G.master = c.createGain(); G.lim = c.createDynamicsCompressor();
  Object.entries({ threshold: -2, knee: 0, ratio: 20, attack: 0.003, release: 0.12 }).forEach(([k, v]) => G.lim[k].value = v);
  G.an = c.createAnalyser(); G.an.fftSize = 1024; G.master.connect(G.lim); G.lim.connect(G.an); G.an.connect(dest);
  G.sink = c.createGain(); G.sink.gain.value = 0; G.sink.connect(dest);
  G.conv = c.createConvolver(); G.conv.buffer = makeIR(c); G.conv.connect(G.master);
  G.track = t => {
    if (G.tracks[t.id]) return G.tracks[t.id];
    const n = {}, bq = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    n.inp = c.createGain(); n.low = bq('lowshelf', 120); n.mid = bq('peaking', 1200, 0.9); n.high = bq('highshelf', 6000);
    n.comp = c.createDynamicsCompressor(); n.pan = c.createStereoPanner(); n.out = c.createGain(); n.an = c.createAnalyser(); n.an.fftSize = 512; n.send = c.createGain();
    n.inp.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high); n.high.connect(n.comp); n.comp.connect(n.pan); n.pan.connect(n.out); n.out.connect(G.master);
    n.out.connect(n.an); n.an.connect(G.sink); n.pan.connect(n.send); n.send.connect(G.conv);
    return G.tracks[t.id] = n;
  };
  const set = (p, v) => p.setTargetAtTime(v, c.currentTime, 0.015);
  G.apply = (p) => {
    const solo = p.tracks.some(t => t.solo); set(G.master.gain, db2g(p.master));
    for (const id in G.tracks) if (!p.tracks.find(t => t.id === id)) { try { G.tracks[id].out.disconnect(); G.tracks[id].send.disconnect(); } catch (e) {} delete G.tracks[id]; }
    for (const t of p.tracks) {
      const n = G.track(t); set(n.inp.gain, db2g(t.vol)); set(n.out.gain, (t.mute || (solo && !t.solo)) ? 0 : 1); set(n.pan.pan, t.pan);
      set(n.low.gain, t.eq.low); set(n.mid.gain, t.eq.mid); set(n.high.gain, t.eq.high); set(n.send.gain, t.reverb * 0.9);
      n.comp.threshold.value = t.comp ? -24 : 0; n.comp.ratio.value = t.comp ? 4 : 1; n.comp.knee.value = t.comp ? 12 : 0;
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
const projectEnd = () => S.p.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);

async function renderMix({ from = 0, to = null, onlyTrack = null, sr = 44100 } = {}) {
  await ensureBuffers(); const end = (to ?? projectEnd()) + 2.5, len = Math.max(1, Math.ceil((end - from) * sr));
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
async function play(record = false) {
  const c = getCtx(); await c.resume(); stop(false); await ensureBuffers(); live.apply(S.p);
  const beat = 60 / S.p.bpm, lead = record && S.countin ? 4 * beat : 0, when = c.currentTime + 0.15 + lead;
  S.t0 = when; S.from = S.head; S.nodes = schedule(live, S.p, S.head, when); S.playing = true;
  let next = lead ? when - lead : when + (Math.ceil(S.head / beat - 1e-6) * beat - S.head), n = 0;
  clearInterval(mTimer); mTimer = setInterval(() => { while (next < c.currentTime + 0.15) { if (S.metro || next < when - 1e-3) click(next, n++ % 4 === 0); next += beat; } }, 30);
  if (record) { try { await startRec(when); } catch (e) { toast('Micro indisponible : ' + e.message); stop(false); return; } }
  $('#bPlay').textContent = '⏸'; requestAnimationFrame(tick);
}
function stop(rewind = true) {
  if (S.playing) S.head = Math.min(pos(), 1e6);
  S.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); S.nodes = []; S.playing = false; clearInterval(mTimer);
  if (S.recording) stopRec(); if (rewind) S.head = 0; $('#bPlay').textContent = '▶'; updHead();
}
const WK = `class R extends AudioWorkletProcessor{process(i){const c=i[0];if(c&&c[0])this.port.postMessage({t:currentTime,d:c[0].slice()});return true}}registerProcessor('rec',R)`;
async function startRec(t0) {
  const c = getCtx(); const tr = S.p.tracks.find(t => t.arm) || S.p.tracks[1] || S.p.tracks[0];
  if (!S.mic) S.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  if (!S.wk) { await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WK], { type: 'text/javascript' }))); S.wk = true; }
  const src = c.createMediaStreamSource(S.mic), node = new AudioWorkletNode(c, 'rec'), z = c.createGain(); z.gain.value = 0;
  const r = { src, node, z, chunks: [], first: null, t0, track: tr.id, from: S.head };
  node.port.onmessage = e => { if (r.first === null) r.first = e.data.t; r.chunks.push(e.data.d); };
  src.connect(node); node.connect(z); z.connect(c.destination); S.rec = r; S.recording = true; $('#bRec').classList.add('on');
}
async function stopRec() {
  const r = S.rec; S.rec = null; S.recording = false; $('#bRec').classList.remove('on'); if (!r) return;
  r.src.disconnect(); r.node.disconnect(); const sr = ctx.sampleRate; let len = r.chunks.reduce((a, b) => a + b.length, 0), all = new Float32Array(len), o = 0;
  r.chunks.forEach(c => { all.set(c, o); o += c.length; });
  all = all.slice(Math.max(0, Math.round((r.t0 - r.first) * sr)));
  if (all.length < sr * 0.2) return toast('Enregistrement trop court.');
  try {
    toast('Enregistrement du clip…'); const up = await upload(encodeWav([all], sr), 'voix.wav'); commit();
    let start = r.from - (S.latencyMs || Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * 1000)) / 1000, off = 0; if (start < 0) { off = -start; start = 0; }
    await loadBuf(up.url); S.p.clips.push({ id: uid(), track: r.track, src: up.url, start, offset: off, dur: up.duration - off, gain: 0, name: 'Enreg. ' + new Date().toLocaleTimeString() });
    render(); toast('Prise enregistrée sur la piste.');
  } catch (e) { toast('Erreur : ' + e.message); }
}
function tick() {
  if (!S.playing) return; const p = pos(); $('#clock').textContent = fmt(p); updHead(p); meters();
  if (!S.recording && p > projectEnd() + 0.2) return stop(false); requestAnimationFrame(tick);
}
function updHead(p = S.head) { $('#clock').textContent = fmt(p); const h = $('#playhead'); if (h) { h.style.left = (HEAD_W + p * S.zoom) + 'px'; } }
function meters() {
  const lv = an => { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const x of d) s += x * x; return Math.sqrt(s / d.length); };
  const m = $('#masterMeter').getContext('2d'); m.clearRect(0, 0, 120, 16); const l = clamp((g2db(lv(live.an)) + 60) / 60, 0, 1); m.fillStyle = l > .95 ? '#f44' : '#4c8'; m.fillRect(0, 0, 120 * l, 16);
  for (const t of S.p.tracks) { const el = $(`[data-meter="${t.id}"]`), n = live.tracks[t.id]; if (el && n) el.style.width = clamp((g2db(lv(n.an)) + 60) / 60, 0, 1) * 100 + '%'; }
}

/* ---------- Project / undo ---------- */
function commit() { S.undo.push(JSON.stringify(S.p)); if (S.undo.length > 60) S.undo.shift(); S.dirty = true; }
async function undo() { const s = S.undo.pop(); if (!s) return; S.p = JSON.parse(s); await ensureBuffers(); render(); }
const selClip = () => S.p.clips.find(c => c.id === S.sel);
const selTr = () => S.p.tracks.find(t => t.id === S.selTrack) || S.p.tracks[0];
const snapT = t => S.snap ? Math.round(t / (60 / S.p.bpm)) * (60 / S.p.bpm) : t;
function addTrack(name) { commit(); const t = mkTrack(name || 'Piste ' + (S.p.tracks.length + 1), S.p.tracks.length); S.p.tracks.push(t); render(); return t; }
function addClip(track, url, start, dur, name, offset = 0) { commit(); const c = { id: uid(), track, src: url, start, offset, dur, gain: 0, name }; S.p.clips.push(c); S.sel = c.id; render(); return c; }

/* ---------- Timeline rendering ---------- */
function drawWave(cv, buf, off, dur, color) {
  const w = cv.width = Math.min(3000, Math.max(20, Math.floor(dur * S.zoom))), h = cv.height = 60, g = cv.getContext('2d'), ch = buf.getChannelData(0);
  const s0 = Math.floor(off * buf.sampleRate), per = Math.max(1, Math.floor(dur * buf.sampleRate / w)); g.fillStyle = color + 'cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff';
  for (let x = 0; x < w; x++) { let mn = 1, mx = -1; const a = s0 + x * per, step = Math.max(1, per >> 6); for (let i = a; i < a + per && i < ch.length; i += step) { const v = ch[i]; if (v < mn) mn = v; if (v > mx) mx = v; } if (mx >= mn) g.fillRect(x, (1 - mx) * h / 2, 1, Math.max(1, (mx - mn) * h / 2)); }
}
function render() {
  const tl = $('#tlInner'), W = Math.max(projectEnd() + 30, ($('#tl').clientWidth - HEAD_W) / S.zoom + 5) * S.zoom, bar = 4 * 60 / S.p.bpm * S.zoom, beat = bar / 4;
  tl.style.width = (HEAD_W + W) + 'px'; tl.innerHTML = '';
  const ru = document.createElement('div'); ru.className = 'ruler'; ru.innerHTML = `<div class="hd"></div><div class="lane" style="width:${W}px"></div>`; tl.append(ru);
  for (let b = 0; b * bar < W; b++) { const l = document.createElement('div'); l.className = 'rl'; l.style.left = b * bar + 'px'; l.textContent = b + 1; ru.lastChild.append(l); }
  ru.lastChild.onpointerdown = e => { const r = ru.lastChild.getBoundingClientRect(); const mv = ev => { S.head = Math.max(0, snapT((ev.clientX - r.left) / S.zoom)); if (S.playing) { play(false); } updHead(); }; mv(e); };
  for (const t of S.p.tracks) {
    const row = document.createElement('div'); row.className = 'trow' + (t.id === S.selTrack ? ' sel' : '');
    row.innerHTML = `<div class="hd"><div class="nm"><span class="dot" style="background:${t.color}"></span><input value="${t.name.replace(/"/g, '&quot;')}"><button class="m ${t.mute ? 'on' : ''}">M</button><button class="s ${t.solo ? 'on' : ''}">S</button><button class="r ${t.arm ? 'on' : ''}" title="Armer pour l'enregistrement">●</button></div><div class="nm"><input type="range" min="-60" max="6" step="0.5" value="${t.vol}"><div style="width:50px;height:6px;background:#000"><div data-meter="${t.id}" style="height:6px;background:#4c8;width:0"></div></div></div></div><div class="lane" data-id="${t.id}" style="width:${W}px;background-image:linear-gradient(to right,rgba(255,255,255,.09) 1px,transparent 1px),linear-gradient(to right,rgba(255,255,255,.035) 1px,transparent 1px);background-size:${bar}px 100%,${beat}px 100%"></div>`;
    const [nm, bm, bs, br] = $$('.nm input,.nm button', row).slice(0, 4), vol = $('input[type=range]', row);
    nm.onchange = () => { commit(); t.name = nm.value; }; bm.onclick = () => { commit(); t.mute = !t.mute; render(); live && live.apply(S.p); };
    bs.onclick = () => { commit(); t.solo = !t.solo; render(); live && live.apply(S.p); }; br.onclick = () => { S.p.tracks.forEach(x => x.arm = false); t.arm = true; render(); };
    vol.oninput = () => { t.vol = +vol.value; live && live.apply(S.p); }; vol.onchange = commit;
    $('.hd', row).onpointerdown = e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { S.selTrack = t.id; render(); showInspector(); } };
    tl.append(row); const lane = $('.lane', row);
    for (const c of S.p.clips.filter(c => c.track === t.id)) lane.append(clipEl(c, t));
    lane.onpointerdown = e => { if (e.target === lane) { S.sel = null; S.selTrack = t.id; S.head = Math.max(0, snapT((e.clientX - lane.getBoundingClientRect().left) / S.zoom)); render(); showInspector(); } };
  }
  const ph = document.createElement('div'); ph.id = 'playhead'; tl.append(ph); updHead(); $('#bpm').value = S.p.bpm; $('#projName').value = S.p.name; $('#masterVol').value = S.p.master;
  live && live.apply(S.p); showInspector();
}
function clipEl(c, t) {
  const el = document.createElement('div'); el.className = 'clip' + (c.id === S.sel ? ' sel' : ''); el.style.left = c.start * S.zoom + 'px'; el.style.width = c.dur * S.zoom + 'px'; el.style.background = t.color + '55';
  el.innerHTML = `<canvas></canvas><span>${c.name}</span><i class="l"></i><i class="r"></i>`;
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

/* ---------- Inspector & tools ---------- */
function sl(label, min, max, step, val, fn, unit = '') { const d = document.createElement('div'); d.className = 'slider'; d.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span>${(+val).toFixed(step < 1 ? 1 : 0)}${unit}</span>`; const i = $('input', d), o = $('span:last-child', d); i.oninput = () => { fn(+i.value); o.textContent = (+i.value).toFixed(step < 1 ? 1 : 0) + unit; live && live.apply(S.p); }; i.onchange = () => { S.dirty = true; }; return d; }
function showInspector() {
  const el = $('#insp'); if (!el) return; el.innerHTML = ''; const t = selTr(), c = selClip(); if (!t) return;
  const h = document.createElement('div'); h.innerHTML = `<b style="color:${t.color}">● ${t.name}</b>`; el.append(h);
  el.append(sl('Volume', -60, 6, 0.5, t.vol, v => t.vol = v, ' dB'), sl('Pan', -1, 1, 0.1, t.pan, v => t.pan = v), sl('Réverb', 0, 1, 0.05, t.reverb, v => t.reverb = v),
    sl('Graves', -15, 15, 0.5, t.eq.low, v => t.eq.low = v, ' dB'), sl('Médiums', -15, 15, 0.5, t.eq.mid, v => t.eq.mid = v, ' dB'), sl('Aigus', -15, 15, 0.5, t.eq.high, v => t.eq.high = v, ' dB'));
  const cp = document.createElement('label'); cp.className = 'chk'; cp.innerHTML = `<input type="checkbox" ${t.comp ? 'checked' : ''}> Compresseur (voix)`; $('input', cp).onchange = e => { commit(); t.comp = e.target.checked; live && live.apply(S.p); }; el.append(cp);
  const b = document.createElement('div'); b.className = 'row wrap'; b.innerHTML = `<button data-a="del">Supprimer la piste</button><button data-a="dup">Dupliquer le clip</button>`; el.append(b);
  b.onclick = e => { const a = e.target.dataset.a; if (a === 'del' && S.p.tracks.length > 1) { commit(); S.p.clips = S.p.clips.filter(k => k.track !== t.id); S.p.tracks = S.p.tracks.filter(k => k.id !== t.id); S.selTrack = null; render(); } if (a === 'dup' && c) { commit(); const n = { ...c, id: uid(), start: c.start + c.dur }; S.p.clips.push(n); S.sel = n.id; render(); } };
  if (c) { const d = document.createElement('div'); d.innerHTML = `<hr><b>Clip : ${c.name}</b>`; d.append(sl('Gain clip', -24, 12, 0.5, c.gain || 0, v => c.gain = v, ' dB')); el.append(d); }
}
function splitAtHead() { const p = pos(), c = S.p.clips.find(k => k.id === S.sel) || S.p.clips.find(k => k.track === selTr().id && p > k.start && p < k.start + k.dur); if (!c || p <= c.start + .02 || p >= c.start + c.dur - .02) return toast('Placez le curseur à l\'intérieur d\'un clip.'); commit(); const d = p - c.start, n = { ...c, id: uid(), start: p, offset: c.offset + d, dur: c.dur - d }; c.dur = d; S.p.clips.push(n); render(); }
function delSel() { if (!S.sel) return; commit(); S.p.clips = S.p.clips.filter(c => c.id !== S.sel); S.sel = null; render(); }
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
function selectTab(n) { $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === n)); $$('.tab').forEach(t => t.hidden = t.id !== 't-' + n); }
async function loadSettings() {
  const s = await api('/api/settings'), sel = $('#sProv'); sel.innerHTML = Object.keys(s.providers).map(k => `<option>${k}</option>`).join(''); sel.value = s.provider || 'groq';
  $('#sEnabled').checked = !!s.enabled; $('#sModel').value = s.model || ''; $('#sBase').value = s.base_url || ''; $('#sKey').placeholder = s.key_set ? '(clé enregistrée — laisser vide pour conserver)' : 'Collez votre clé API gratuite';
  const st = await api('/api/status'), ok = x => x ? '✅' : '❌';
  $('#sysStatus').innerHTML = `Moteur : ${st.device.toUpperCase()} · torch ${ok(st.torch)} transformers ${ok(st.transformers)} ffmpeg ${ok(st.ffmpeg)} demucs ${ok(st.demucs)}<br>` + Object.entries(st.models).map(([k, v]) => `${ok(v.present)} ${k}`).join('<br>') + `<br>Dossier modèles : ${st.models_dir}`;
  $('#chatMode').textContent = 'Mode : ' + (s.enabled ? 'en ligne : ' + s.provider : 'local (hors-ligne)');
}
function init() {
  ['Gospel traditionnel', 'Bikutsi', 'Afrobeat', 'Worship lent', 'Rumba congolaise', 'Highlife', 'Chorale a cappella', 'Piano & basse', 'Percussions'].forEach(s => { const b = document.createElement('button'); b.textContent = s; b.onclick = () => $('#gPrompt').value += ($('#gPrompt').value ? ', ' : '') + s.toLowerCase(); $('#chips').append(b); });
  $$('#tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.t));
  $$('input[name=gsrc]').forEach(r => r.onchange = () => $('#gWhatBox').hidden = $('input[name=gsrc]:checked').value !== 'melody');
  $('#gWhat').onchange = () => { if ($('#gWhat').value === 'file') $('#gFile').click(); };
  $('#bPlay').onclick = () => S.playing ? stop(false) : play(); $('#bStop').onclick = () => stop(true); $('#bRew').onclick = () => { S.head = 0; updHead(); if (S.playing) play(); };
  $('#bRec').onclick = () => S.recording ? stop(false) : play(true); $('#bAddTrack').onclick = () => addTrack(); $('#bSplit').onclick = splitAtHead; $('#bDel').onclick = delSel; $('#bUndo').onclick = undo;
  $('#bpm').onchange = e => { commit(); S.p.bpm = clamp(+e.target.value, 40, 220); render(); }; $('#metro').onchange = e => S.metro = e.target.checked; $('#countin').onchange = e => S.countin = e.target.checked; $('#snap').onchange = e => S.snap = e.target.checked;
  $('#zoom').oninput = e => { S.zoom = +e.target.value; render(); }; $('#masterVol').oninput = e => { S.p.master = +e.target.value; live && live.apply(S.p); };
  $('#projName').onchange = e => S.p.name = e.target.value;
  $('#bImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { toast('Import en cours…'); const r = await upload(f, f.name); await loadBuf(r.url); addClip(selTr().id, r.url, S.head, r.duration, r.name); toast('Audio importé.'); } catch (x) { toast('Import : ' + x.message); } e.target.value = ''; };
  $('#bGen').onclick = () => generate(); $('#bStems').onclick = separate; $('#bAuto').onclick = autoMix;
  $('#bBpm').onclick = () => { const c = selClip(); if (!c || !S.bufs[c.src]) return toast('Sélectionnez un clip.'); const b = detectBpm(S.bufs[c.src]); commit(); S.p.bpm = Math.round(b); render(); toast('BPM détecté : ' + Math.round(b)); };
  $('#bExport').onclick = exportMix; $('#chatSend').onclick = chatSend; $('#chatIn').onkeydown = e => { if (e.key === 'Enter') chatSend(); };
  $('#bNew').onclick = () => { if (!S.dirty || confirm('Abandonner le projet courant ?')) { S.p = newProject(); S.undo = []; S.sel = S.selTrack = null; S.head = 0; S.dirty = false; render(); } };
  $('#bSave').onclick = async () => { await post('/api/projects/save', { name: S.p.name, project: S.p }); S.dirty = false; toast('Projet sauvegardé.'); };
  $('#bOpen').onclick = async () => { const l = await api('/api/projects'); if (!l.length) return toast('Aucun projet.'); const n = prompt('Projets : ' + l.join(', ') + '\nNom à ouvrir :', l[0]); if (!n) return; try { S.p = await api('/api/projects/' + encodeURIComponent(n)); S.undo = []; S.sel = null; await ensureBuffers(); render(); } catch (e) { toast(e.message); } };
  $('#sSave').onclick = async () => { await post('/api/settings', { enabled: $('#sEnabled').checked, provider: $('#sProv').value, model: $('#sModel').value, base_url: $('#sBase').value, api_key: $('#sKey').value }); $('#sKey').value = ''; S.latencyMs = +$('#sLat').value || 0; await loadSettings(); toast('Réglages enregistrés.'); };
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.code === 'Space') { e.preventDefault(); $('#bPlay').click(); } else if (e.key === 'r') $('#bRec').click(); else if (e.key === 's') splitAtHead(); else if (e.key === 'Delete') delSel(); else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo(); });
  addEventListener('resize', render); addEventListener('beforeunload', e => { if (S.dirty) e.preventDefault(); });
  S.selTrack = S.p.tracks[0].id; render(); loadSettings().catch(() => {});
  chatAdd('Bonjour ! Dites par ex. « baisse l\'instru de 3 dB », « mute la voix », « reverb voix 30% », « mixage auto » ou « génère un gospel 30 s ».');
}
init();
