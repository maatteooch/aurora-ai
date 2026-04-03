import { useState, useCallback, useRef, useEffect, useReducer } from “react”;

/* ══ INDEXEDDB ══════════════════════════════════════════════ */
const DB_NAME = “aurora_v5”; let _db = null;
function openDB() {
if (_db) return Promise.resolve(*db);
return new Promise((res, rej) => {
const r = indexedDB.open(DB_NAME, 1);
r.onupgradeneeded = e => {
const d = e.target.result;
if (!d.objectStoreNames.contains(“imgs”))
d.createObjectStore(“imgs”, { keyPath: “id” }).createIndex(“ts”, “ts”);
};
r.onsuccess = e => { *db = e.target.result; res(*db); };
r.onerror = () => rej(r.error);
});
}
const dbSave = async rec => {
try {
const d = await openDB();
await new Promise((res, rej) => {
const t = d.transaction(“imgs”, “readwrite”);
t.objectStore(“imgs”).put(rec);
t.oncomplete = res; t.onerror = () => rej(t.error);
});
} catch(*) {}
};
const dbAll = async () => {
try {
const d = await openDB();
return new Promise((res, rej) => {
const t = d.transaction(“imgs”, “readonly”);
const r = t.objectStore(“imgs”).index(“ts”).getAll();
r.onsuccess = () => res((r.result || []).reverse());
r.onerror = () => rej(r.error);
});
} catch(*) { return []; }
};
const dbDel = async id => {
try {
const d = await openDB();
await new Promise((res, rej) => {
const t = d.transaction(“imgs”, “readwrite”);
t.objectStore(“imgs”).delete(id);
t.oncomplete = res; t.onerror = () => rej(t.error);
});
} catch(*) {}
};

/* ══ CONSTANTS ══════════════════════════════════════════════ */
const STYLES = [
{ id: “none”,  label: “Aucun”,     sfx: “” },
{ id: “real”,  label: “Réaliste”,  sfx: “, photorealistic, 8k, DSLR, sharp focus, ultra-detailed” },
{ id: “cine”,  label: “Cinéma”,    sfx: “, cinematic shot, dramatic lighting, film grain, anamorphic” },
{ id: “anime”, label: “Anime”,     sfx: “, anime style, Studio Ghibli, vibrant, manga art” },
{ id: “3d”,    label: “3D”,        sfx: “, 3D render, octane, Blender, volumetric lighting” },
{ id: “aqua”,  label: “Aquarelle”, sfx: “, watercolor, soft edges, artistic, fluid brushstrokes” },
{ id: “neon”,  label: “Néon”,      sfx: “, neon lights, cyberpunk, dark background, glowing” },
{ id: “vint”,  label: “Vintage”,   sfx: “, vintage photo, retro, film grain, faded colors, 35mm” },
{ id: “fant”,  label: “Fantasy”,   sfx: “, fantasy art, magical, ethereal lighting, epic, detailed” },
];

const FORMATS = [
{ id: “sq”,   label: “Carré”,    icon: “⬛”, w: 1024, h: 1024, tag: “Instagram”, ar: “1/1” },
{ id: “port”, label: “Portrait”, icon: “📱”, w: 768,  h: 1344, tag: “TikTok”,    ar: “9/16” },
{ id: “land”, label: “Paysage”,  icon: “🖥️”, w: 1344, h: 768,  tag: “YouTube”,   ar: “16/9” },
];

const FILTERS = [
{ id: “none”,  label: “Original”,   css: “none” },
{ id: “vivid”, label: “Vivid”,      css: “saturate(1.6) contrast(1.1)” },
{ id: “cool”,  label: “Cool”,       css: “hue-rotate(20deg) saturate(1.2)” },
{ id: “warm”,  label: “Chaud”,      css: “sepia(0.3) saturate(1.4) brightness(1.05)” },
{ id: “drama”, label: “Dramatique”, css: “contrast(1.5) brightness(0.88)” },
{ id: “fade”,  label: “Fade”,       css: “contrast(0.82) brightness(1.12) saturate(0.75)” },
{ id: “bw”,    label: “N&B”,        css: “grayscale(1) contrast(1.1)” },
{ id: “gold”,  label: “Doré”,       css: “sepia(0.45) saturate(1.7) hue-rotate(-12deg)” },
];

const PROMPTS = [
“Une cité néo-futuriste flottante dans les nuages au coucher de soleil”,
“Portrait d’une guerrière elfe en armure de cristal, forêt magique”,
“Marché nocturne de Tokyo sous la pluie, reflets de néons colorés”,
“Dragon mécanique en vol au-dessus d’un désert de sel, lever du soleil”,
“Bibliothèque infinie avec des escaliers en spirale, lumière ambrée”,
“Forêt bioluminescente de nuit, champignons lumineux et fées”,
];

/* ══ API — PROMPT ENHANCEMENT ══════════════════════════════ */
async function enhancePrompt(frenchPrompt, styleObj, signal) {
// Uses Claude API to build a rich English prompt
try {
const res = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
signal,
body: JSON.stringify({
model: “claude-sonnet-4-20250514”,
max_tokens: 500,
messages: [{
role: “user”,
content: `You are an AI image prompt engineer. Given this French image description, return ONLY a JSON object (no explanation, no markdown):

French: “${frenchPrompt}”
Style: ${styleObj.sfx || “none”}

Return this exact JSON structure:
{“en”:”[detailed English prompt 80-120 words with style]”,“title”:”[French title 4 words max]”,“mood”:”[3 French mood words]”,“colors”:[”#hex1”,”#hex2”,”#hex3”]}`
}]
})
});

```
if (!res.ok) throw new Error("API error");
const data = await res.json();
const text = data.content?.[0]?.text || "";

// Extract JSON robustly
const match = text.match(/\{[\s\S]*\}/);
if (!match) throw new Error("No JSON found");
return JSON.parse(match[0]);
```

} catch(e) {
// Fallback: use raw prompt + style suffix
return {
en: frenchPrompt + (styleObj.sfx || “”),
title: “Création IA”,
mood: “Créatif, Immersif, Unique”,
colors: [”#7c3aed”, “#2563eb”, “#0891b2”]
};
}
}

/* ══ BUILD IMAGE URL ════════════════════════════════════════ */
function buildUrl(englishPrompt, fmt, seed) {
const s = seed || Math.floor(Math.random() * 9_999_999);
const p = encodeURIComponent(englishPrompt);
return `https://image.pollinations.ai/prompt/${p}?model=flux&width=${fmt.w}&height=${fmt.h}&seed=${s}&nologo=true&enhance=true`;
}

/* ══ RATE LIMITER ═══════════════════════════════════════════ */
class Queue {
constructor(ms = 6000) { this.ms = ms; this.q = []; this.last = 0; this.t = null; }
run(fn) { return new Promise((res, rej) => { this.q.push({ fn, res, rej }); this._next(); }); }
_next() {
if (this.t || !this.q.length) return;
const wait = Math.max(0, this.ms - (Date.now() - this.last));
this.t = setTimeout(async () => {
this.t = null;
const { fn, res, rej } = this.q.shift();
this.last = Date.now();
try { res(await fn()); } catch(e) { rej(e); }
this._next();
}, wait);
}
cancel() { this.q.forEach(({ rej }) => rej(new Error(“Annulé”))); this.q = []; clearTimeout(this.t); this.t = null; }
get size() { return this.q.length; }
}
const Q = new Queue(6000);

/* ══ PWA INSTALL ════════════════════════════════════════════ */
function usePWA() {
const [prompt, setPrompt] = useState(null);
const [done, setDone] = useState(false);
useEffect(() => {
const h = e => { e.preventDefault(); setPrompt(e); };
window.addEventListener(“beforeinstallprompt”, h);
window.addEventListener(“appinstalled”, () => setDone(true));
return () => window.removeEventListener(“beforeinstallprompt”, h);
}, []);
const install = async () => {
if (!prompt) return;
prompt.prompt();
const { outcome } = await prompt.userChoice;
if (outcome === “accepted”) setDone(true);
setPrompt(null);
};
return { can: !!prompt && !done, install, done };
}

/* ══ STATE ══════════════════════════════════════════════════ */
const INIT = {
tab: “create”,
prompt: “”, style: “none”, format: “sq”, filter: “none”,
phase: “idle”, pct: 0, msg: “”,
result: null, gallery: [], kb: null, showPWA: false,
};

function reducer(s, a) {
switch (a.t) {
case “SET”:   return { …s, …a.p };
case “PHASE”: return { …s, phase: a.phase, pct: a.pct ?? s.pct, msg: a.msg ?? s.msg };
case “DONE”:  return { …s, phase: “done”, pct: 100, msg: “✓ Image générée !”, result: a.r, gallery: [a.r, …s.gallery].slice(0, 100) };
case “LOAD”:  return { …s, gallery: a.g };
case “DEL”:   return { …s, gallery: s.gallery.filter(x => x.id !== a.id) };
case “RESET”: return { …s, phase: “idle”, pct: 0, msg: “” };
default:      return s;
}
}

/* ══ COMPONENTS ═════════════════════════════════════════════ */
function Ring({ pct, size = 34, sw = 3, color = “#a78bfa” }) {
const r = (size - sw * 2) / 2, circ = 2 * Math.PI * r, dash = circ * pct / 100;
return (
<svg width={size} height={size} style={{ transform: “rotate(-90deg)”, flexShrink: 0 }}>
<circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={sw} />
<circle cx={size/2} cy={size/2} r={r} fill=“none” stroke={color} strokeWidth={sw}
strokeDasharray={`${dash} ${circ}`} strokeLinecap=“round”
style={{ transition: “stroke-dasharray .5s” }} />
</svg>
);
}

function ImageViewer({ url, ar, filter }) {
const [st, setSt] = useState(“loading”);
const [tries, setTries] = useState(0);
const filterCss = FILTERS.find(f => f.id === (filter || “none”))?.css || “none”;
useEffect(() => { setSt(“loading”); setTries(0); }, [url]);

return (
<div style={{ borderRadius: 18, overflow: “hidden”, position: “relative”, aspectRatio: ar, background: “#08080f”, width: “100%” }}>
{(st === “loading” || st === “retry”) && (
<div style={{ position: “absolute”, inset: 0, background: “linear-gradient(135deg,#1a1040,#0f1e3d,#0a2a3d)”, display: “flex”, flexDirection: “column”, alignItems: “center”, justifyContent: “center”, gap: 12 }}>
<div style={{ position: “absolute”, inset: 0, background: “linear-gradient(90deg,transparent 25%,rgba(139,92,246,.07) 50%,transparent 75%)”, backgroundSize: “200% 100%”, animation: “shim 1.8s ease-in-out infinite” }} />
<div style={{ position: “absolute”, left: 0, right: 0, height: 2, background: “linear-gradient(90deg,transparent,rgba(139,92,246,.55),transparent)”, animation: “scanl 2.5s linear infinite” }} />
<div style={{ width: 44, height: 44, border: “3px solid rgba(139,92,246,.2)”, borderTop: “3px solid #a78bfa”, borderRadius: “50%”, animation: “spin .8s linear infinite”, zIndex: 1 }} />
<div style={{ zIndex: 1, textAlign: “center” }}>
<div style={{ fontSize: “.75rem”, color: “rgba(255,255,255,.5)”, fontWeight: 600 }}>
{st === “retry” ? `Tentative ${tries}/3…` : “Génération en cours…”}
</div>
<div style={{ fontSize: “.62rem”, color: “rgba(255,255,255,.22)”, marginTop: 4 }}>Pollinations Flux · 10–30s</div>
</div>
</div>
)}
{st === “error” && (
<div style={{ position: “absolute”, inset: 0, background: “#0a0010”, display: “flex”, flexDirection: “column”, alignItems: “center”, justifyContent: “center”, gap: 10, padding: 24, textAlign: “center” }}>
<div style={{ fontSize: “2rem” }}>🌐</div>
<div style={{ fontSize: “.78rem”, color: “#f87171”, fontWeight: 600 }}>Serveur surchargé</div>
<div style={{ fontSize: “.66rem”, color: “#475569”, lineHeight: 1.5 }}>Pollinations.ai est temporairement indisponible.<br/>Réessayez dans quelques secondes.</div>
<a href={url} target=”_blank” rel=“noreferrer” style={{ fontSize: “.68rem”, color: “#a78bfa”, padding: “5px 12px”, borderRadius: 8, background: “rgba(124,58,237,.15)”, border: “1px solid rgba(124,58,237,.3)”, marginTop: 4, textDecoration: “none” }}>↗ Ouvrir directement</a>
</div>
)}
<img src={url} alt=“IA” crossOrigin=“anonymous”
onLoad={() => setSt(“ok”)}
onError={() => {
const next = tries + 1;
setTries(next);
if (next < 3) { setSt(“retry”); }
else setSt(“error”);
}}
style={{ width: “100%”, height: “100%”, objectFit: “cover”, display: st === “ok” ? “block” : “none”, filter: filterCss, transition: “filter .3s” }}
/>
{st === “ok” && (
<div style={{ position: “absolute”, top: 10, right: 10, display: “flex”, gap: 5 }}>
{[“✓ Flux”, “💾”].map((l, i) => (
<span key={i} style={{ fontSize: “.58rem”, padding: “2px 7px”, borderRadius: 7, background: “rgba(0,0,0,.7)”, color: i === 0 ? “#10b981” : “#a78bfa”, backdropFilter: “blur(10px)”, fontWeight: 700 }}>{l}</span>
))}
</div>
)}
</div>
);
}

function GCard({ item, onDel }) {
const [hov, setHov] = useState(false);
const fmt = FORMATS.find(f => f.id === item.format) || FORMATS[0];
const fc = FILTERS.find(f => f.id === (item.filter || “none”))?.css || “none”;
return (
<div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
style={{ borderRadius: 12, overflow: “hidden”, position: “relative”, aspectRatio: fmt.ar, background: “#0d0d1a”, cursor: “pointer”,
border: `1px solid ${hov ? "rgba(124,58,237,.5)" : "rgba(255,255,255,.06)"}`,
transform: hov ? “translateY(-4px)” : “none”, transition: “all .22s”,
boxShadow: hov ? “0 12px 32px rgba(0,0,0,.5)” : “none” }}>
<img src={item.url} alt={item.title} style={{ width: “100%”, height: “100%”, objectFit: “cover”, filter: fc }} />
{hov && (
<div style={{ position: “absolute”, inset: 0, background: “linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 55%)”, display: “flex”, flexDirection: “column”, justifyContent: “flex-end”, padding: 10 }}>
<p style={{ fontSize: “.6rem”, color: “rgba(255,255,255,.9)”, margin: “0 0 7px”, overflow: “hidden”, display: “-webkit-box”, WebkitLineClamp: 2, WebkitBoxOrient: “vertical”, lineHeight: 1.4 }}>{item.prompt}</p>
<div style={{ display: “flex”, gap: 4 }}>
<button onClick={e => { e.stopPropagation(); window.open(item.url, “_blank”); }}
style={{ flex: 1, padding: 5, borderRadius: 7, fontSize: “.6rem”, fontWeight: 700, background: “rgba(124,58,237,.8)”, color: “white”, border: “none”, cursor: “pointer” }}>↗ Voir</button>
<button onClick={e => { e.stopPropagation(); onDel(item.id); }}
style={{ padding: “5px 8px”, borderRadius: 7, fontSize: “.6rem”, fontWeight: 700, background: “rgba(239,68,68,.75)”, color: “white”, border: “none”, cursor: “pointer” }}>✕</button>
</div>
</div>
)}
<span style={{ position: “absolute”, top: 6, left: 6, fontSize: “.5rem”, padding: “2px 5px”, borderRadius: 5, background: “rgba(16,185,129,.75)”, color: “white”, fontWeight: 700 }}>💾</span>
</div>
);
}

/* ══ MAIN APP ═══════════════════════════════════════════════ */
export default function App() {
const [s, D] = useReducer(reducer, INIT);
const abort = useRef(null);
const tick = useRef(null);
const genN = useRef(0);
const pwa = usePWA();

const fmt = FORMATS.find(f => f.id === s.format) || FORMATS[0];
const stObj = STYLES.find(x => x.id === s.style) || STYLES[0];
const busy = [“thinking”, “generating”].includes(s.phase);
const hasSplit = s.result || busy || s.phase === “error”;

useEffect(() => {
(async () => {
try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch(_) {}
const g = await dbAll();
D({ t: “LOAD”, g });
if (navigator.storage?.estimate) {
const e = await navigator.storage.estimate();
D({ t: “SET”, p: { kb: Math.round((e.usage || 0) / 1024) } });
}
})();
}, []);

const animPct = (from, to, ms) => {
clearInterval(tick.current);
let cur = from;
const step = (to - from) / (ms / 120);
tick.current = setInterval(() => {
cur = Math.min(cur + step + Math.random() * step * .4, to);
D({ t: “PHASE”, phase: s.phase, pct: Math.round(cur) });
if (cur >= to) clearInterval(tick.current);
}, 120);
};

const generate = useCallback(async () => {
if (!s.prompt.trim() || busy) return;
if (abort.current) abort.current.abort();
abort.current = new AbortController();
genN.current++;

```
D({ t: "PHASE", phase: "thinking", pct: 5, msg: "Claude optimise votre prompt…" });
animPct(5, 40, 2500);

try {
  await Q.run(async () => {
    // Enhance prompt via Claude
    const meta = await enhancePrompt(s.prompt, stObj, abort.current.signal);
    clearInterval(tick.current);

    // Build image URL
    const seed = Math.floor(Math.random() * 9_999_999);
    const url = buildUrl(meta.en, fmt, seed);

    D({ t: "PHASE", phase: "generating", pct: 45, msg: "Génération via Pollinations Flux…" });
    animPct(45, 90, 20000);

    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const record = {
      id, url, prompt: s.prompt,
      title: meta.title || "Création IA",
      mood: meta.mood || "Créatif",
      colors: meta.colors || ["#7c3aed", "#2563eb", "#0891b2"],
      style: s.style, format: s.format, filter: "none",
      seed, ts: Date.now(),
    };

    clearInterval(tick.current);
    await dbSave(record);
    D({ t: "DONE", r: record });

    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      D({ t: "SET", p: { kb: Math.round((e.usage || 0) / 1024) } });
    }
    if (genN.current === 3 && pwa.can) setTimeout(() => D({ t: "SET", p: { showPWA: true } }), 1200);
  });
} catch(err) {
  clearInterval(tick.current);
  if (err.message === "Annulé" || err.name === "AbortError") { D({ t: "RESET" }); return; }
  D({ t: "PHASE", phase: "error", pct: 0, msg: `❌ ${err.message}` });
}
```

}, [s.prompt, s.style, s.format, stObj, fmt, busy, pwa.can]);

const dl = () => {
if (!s.result) return;
const a = document.createElement(“a”);
a.href = s.result.url; a.target = “_blank”;
a.download = `aurora-${Date.now()}.png`;
document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

const C = { // colors
bg: “#060610”, glass: “rgba(255,255,255,.028)”, border: “rgba(255,255,255,.07)”,
accent: “#7c3aed”, accentL: “#a78bfa”, blue: “#2563eb”,
};

const pill = (active) => ({
padding: “5px 11px”, borderRadius: 20, fontSize: “.62rem”, fontWeight: 700,
cursor: “pointer”, border: “1px solid transparent”, transition: “all .18s”,
fontFamily: “‘Sora’,sans-serif”,
background: active ? “rgba(124,58,237,.22)” : “rgba(255,255,255,.04)”,
borderColor: active ? “rgba(124,58,237,.55)” : “rgba(255,255,255,.07)”,
color: active ? “#c4b5fd” : “#475569”,
});

return (
<div style={{ minHeight: “100vh”, background: C.bg, fontFamily: “‘Sora’,sans-serif”, color: “#e2e8f0” }}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap'); @keyframes spin  { to { transform: rotate(360deg) } } @keyframes shim  { 0%{background-position:-200% center} 100%{background-position:200% center} } @keyframes scanl { 0%{top:-5%} 100%{top:105%} } @keyframes fadeU { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} } @keyframes glo   { 0%,100%{opacity:.55} 50%{opacity:1} } @keyframes grad  { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} } .gtitle { background: linear-gradient(270deg,#a78bfa,#60a5fa,#f472b6,#a78bfa); background-size:400% 400%; -webkit-background-clip:text; -webkit-text-fill-color:transparent; animation:grad 6s ease infinite; } .pbtn   { background:linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb); color:white; border:none; cursor:pointer; font-family:'Sora',sans-serif; font-weight:800; transition:all .3s; } .pbtn:hover:not(:disabled) { box-shadow:0 0 28px rgba(124,58,237,.55),0 0 56px rgba(37,99,235,.2); transform:translateY(-2px); } .pbtn:disabled { opacity:.35; cursor:not-allowed; transform:none !important; box-shadow:none !important; } .gbtn   { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); color:#64748b; cursor:pointer; transition:all .2s; font-family:'Sora',sans-serif; } .gbtn:hover { background:rgba(255,255,255,.1); color:#e2e8f0; } .glass  { background:rgba(255,255,255,.028); backdrop-filter:blur(22px); border:1px solid rgba(255,255,255,.07); } .ri     { animation:fadeU .4s ease forwards; } ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(124,58,237,.6);border-radius:2px} textarea:focus,input:focus{outline:none}`}</style>

```
  {/* PWA Banner */}
  {pwa.can && s.showPWA && (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "#0d0d1a", border: "1px solid rgba(124,58,237,.4)", borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,.6)", maxWidth: 340, width: "90%" }}>
      <span style={{ fontSize: "1.4rem" }}>📱</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: ".78rem", fontWeight: 700, marginBottom: 2 }}>Installer AURORA AI</div>
        <div style={{ fontSize: ".65rem", color: "#64748b" }}>Accès rapide depuis l'écran d'accueil</div>
      </div>
      <button onClick={() => D({ t: "SET", p: { showPWA: false } })} className="gbtn" style={{ padding: "4px 8px", borderRadius: 7, fontSize: ".64rem" }}>Plus tard</button>
      <button onClick={pwa.install} className="pbtn" style={{ padding: "5px 12px", borderRadius: 8, fontSize: ".7rem" }}>Installer</button>
    </div>
  )}

  {/* Header */}
  <header className="glass" style={{ position: "sticky", top: 0, zIndex: 40, borderBottom: "1px solid rgba(124,58,237,.12)" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ position: "relative", width: 36, height: 36, borderRadius: 11, background: "linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 0 20px rgba(124,58,237,.45)" }}>
          ✦
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "#10b981", border: "2px solid #060610", animation: "glo 2s infinite" }} />
        </div>
        <div>
          <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: "1.02rem", letterSpacing: "-.02em" }}>AURORA<span style={{ color: "#7c3aed" }}>AI</span></div>
          <div style={{ fontSize: ".52rem", color: "#374151", marginTop: -1 }}>v5 · Production</div>
        </div>
      </div>

      <nav style={{ display: "flex", gap: 2 }}>
        {[
          { id: "create",  label: "✦ Créer" },
          { id: "gallery", label: `🖼 Galerie${s.gallery.length ? ` (${s.gallery.length})` : ""}` },
          { id: "edit",    label: "✏️ Éditer" },
        ].map(t => (
          <button key={t.id} onClick={() => D({ t: "SET", p: { tab: t.id } })}
            style={{ padding: "5px 11px", borderRadius: 8, border: "none", fontSize: ".7rem", fontWeight: 600, cursor: "pointer", fontFamily: "'Sora',sans-serif", transition: "all .2s",
              background: s.tab === t.id ? "rgba(124,58,237,.18)" : "transparent",
              color: s.tab === t.id ? "#c4b5fd" : "#475569",
              borderBottom: s.tab === t.id ? "2px solid #7c3aed" : "2px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {s.kb !== null && (
          <span style={{ fontSize: ".58rem", color: "#475569", padding: "2px 7px", borderRadius: 6, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", fontFamily: "'Space Mono',monospace" }}>
            💾 {s.kb < 1024 ? `${s.kb}KB` : `${(s.kb / 1024).toFixed(1)}MB`}
          </span>
        )}
        {pwa.can && (
          <button onClick={pwa.install} className="gbtn" style={{ padding: "4px 9px", borderRadius: 7, fontSize: ".62rem", fontWeight: 700 }}>📱 Installer</button>
        )}
      </div>
    </div>
  </header>

  <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

    {/* CREATE */}
    {s.tab === "create" && (
      <div style={{ display: "grid", gridTemplateColumns: hasSplit ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>

        {/* Left: Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!hasSplit && (
            <div style={{ textAlign: "center", padding: "14px 0 4px", position: "relative" }}>
              <div style={{ position: "absolute", top: "-30%", left: "15%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(ellipse,rgba(124,58,237,.1) 0%,transparent 70%)", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 20, background: "rgba(124,58,237,.1)", border: "1px solid rgba(124,58,237,.3)", color: "#a78bfa", fontSize: ".68rem", fontWeight: 600, marginBottom: 14 }}>
                  <span style={{ animation: "glo 2s infinite" }}>●</span>
                  Claude + Flux · IndexedDB · PWA · Production Ready
                </div>
                <h1 style={{ fontSize: "clamp(1.9rem,5.5vw,3.4rem)", fontWeight: 800, lineHeight: 1.04, letterSpacing: "-.038em", marginBottom: 10 }}>
                  Créez en quelques<br /><span className="gtitle">secondes</span>
                </h1>
                <p style={{ fontSize: ".86rem", color: "#64748b", maxWidth: 400, margin: "0 auto", lineHeight: 1.75 }}>
                  Décrivez en français · Claude optimise · Flux génère
                </p>
              </div>
            </div>
          )}

          <div className="glass" style={{ borderRadius: 22, padding: 20 }}>

            {/* Prompt */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <label style={{ fontSize: ".63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em" }}>Votre idée</label>
                <button onClick={() => D({ t: "SET", p: { prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] } })}
                  className="gbtn" style={{ padding: "3px 9px", borderRadius: 7, fontSize: ".62rem", fontWeight: 600 }}>✦ Idée</button>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", inset: -1, borderRadius: 13, background: "linear-gradient(135deg,rgba(124,58,237,.3),rgba(37,99,235,.3))", opacity: s.prompt ? 1 : 0, transition: "opacity .35s", zIndex: 0 }} />
                <div style={{ position: "relative", background: "#0b0b18", borderRadius: 12, zIndex: 1 }}>
                  <textarea value={s.prompt}
                    onChange={e => D({ t: "SET", p: { prompt: e.target.value } })}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
                    placeholder="ex: Un château médiéval flottant dans les nuages au coucher de soleil, dragons dorés…"
                    style={{ width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: ".84rem", resize: "none", lineHeight: 1.7, fontFamily: "'Sora',sans-serif", padding: "14px 14px 44px", minHeight: 96, boxSizing: "border-box" }} />
                  <div style={{ position: "absolute", bottom: 9, left: 12, right: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: ".58rem", color: "#374151" }}>{s.prompt.length}/600 · ⌘↵</span>
                    {s.prompt && <button onClick={() => D({ t: "SET", p: { prompt: "" } })} style={{ fontSize: ".6rem", padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: "#64748b", cursor: "pointer", border: "none" }}>✕</button>}
                  </div>
                </div>
              </div>
            </div>

            {/* Style */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: ".63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 8 }}>Style</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {STYLES.map(st => (
                  <button key={st.id} onClick={() => D({ t: "SET", p: { style: st.id } })}
                    style={pill(s.style === st.id)}>{st.label}</button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: ".63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 8 }}>Format</label>
              <div style={{ display: "flex", gap: 8 }}>
                {FORMATS.map(f => (
                  <button key={f.id} onClick={() => D({ t: "SET", p: { format: f.id } })}
                    style={{ flex: 1, padding: "11px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", fontFamily: "'Sora',sans-serif",
                      background: s.format === f.id ? "rgba(37,99,235,.2)" : "rgba(255,255,255,.025)",
                      border: `1px solid ${s.format === f.id ? "rgba(37,99,235,.55)" : "rgba(255,255,255,.06)"}`,
                      color: s.format === f.id ? "#60a5fa" : "#64748b", transition: "all .2s" }}>
                    <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>{f.icon}</div>
                    <div style={{ fontSize: ".64rem", fontWeight: 700 }}>{f.label}</div>
                    <div style={{ fontSize: ".54rem", color: "#374151", marginTop: 2 }}>{f.tag}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Progress */}
            {(busy || s.phase === "done" || s.phase === "error") && (
              <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,.028)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                  {busy ? <Ring pct={s.pct} />
                    : s.phase === "done"
                      ? <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(16,185,129,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✓</div>
                      : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(239,68,68,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✕</div>
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".72rem", fontWeight: 600, marginBottom: 4, color: s.phase === "done" ? "#10b981" : s.phase === "error" ? "#f87171" : "#a78bfa" }}>{s.msg}</div>
                    <div style={{ height: 3, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.pct}%`, background: s.phase === "done" ? "linear-gradient(90deg,#10b981,#059669)" : s.phase === "error" ? "#f87171" : "linear-gradient(90deg,#7c3aed,#2563eb)", transition: "width .45s ease", borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Generate btn */}
            <button className="pbtn" onClick={generate} disabled={busy || !s.prompt.trim()}
              style={{ width: "100%", height: 52, borderRadius: 13, fontSize: ".88rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {busy
                ? <><div style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,.2)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin .75s linear infinite" }} />
                    {s.phase === "thinking" ? "Claude optimise…" : "Flux génère…"}</>
                : <>✦ Générer l'image · Flux</>
              }
            </button>

            {busy && (
              <button onClick={() => { abort.current?.abort(); clearInterval(tick.current); Q.cancel(); D({ t: "RESET" }); }}
                className="gbtn" style={{ width: "100%", marginTop: 7, padding: 9, borderRadius: 11, fontSize: ".74rem" }}>
                Annuler
              </button>
            )}
          </div>
        </div>

        {/* Right: Result */}
        {hasSplit && (
          <div className="ri" style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {busy && !s.result && (
              <div style={{ aspectRatio: fmt.ar, borderRadius: 18, overflow: "hidden", position: "relative", background: "#08080f" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.03) 75%)", backgroundSize: "200% 100%", animation: "shim 1.6s infinite" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,rgba(139,92,246,.55),transparent)", animation: "scanl 2.5s linear infinite" }} />
                  <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,.07)", borderTop: "3px solid #a78bfa", borderRadius: "50%", animation: "spin .9s linear infinite", zIndex: 1 }} />
                  <div style={{ zIndex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: ".75rem", color: "rgba(255,255,255,.45)", fontWeight: 600 }}>
                      {s.phase === "thinking" ? "Claude travaille…" : "Flux génère…"}
                    </div>
                    <div style={{ fontSize: ".62rem", color: "rgba(255,255,255,.2)", marginTop: 3 }}>10–30 secondes</div>
                  </div>
                </div>
              </div>
            )}

            {s.phase === "error" && !s.result && (
              <div style={{ padding: "28px 22px", textAlign: "center", borderRadius: 18, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.22)" }}>
                <div style={{ fontSize: "2rem", marginBottom: 10 }}>⚠️</div>
                <p style={{ color: "#f87171", fontSize: ".8rem", marginBottom: 14, lineHeight: 1.5 }}>{s.msg}</p>
                <button className="pbtn" onClick={generate} style={{ padding: "8px 20px", borderRadius: 10, fontSize: ".78rem" }}>Réessayer</button>
              </div>
            )}

            {s.result && <ImageViewer url={s.result.url} ar={fmt.ar} filter={s.filter} />}

            {s.result && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {[
                    { label: "⬇ Télécharger", pri: true,  fn: dl },
                    { label: "🔁 Variante",    pri: false, fn: generate },
                    { label: "↗ Ouvrir",       pri: false, fn: () => window.open(s.result.url, "_blank") },
                    { label: "📋 Copier URL",  pri: false, fn: () => navigator.clipboard?.writeText(s.result.url) },
                  ].map((b, i) => (
                    <button key={i} onClick={b.fn}
                      style={{ padding: "8px 3px", borderRadius: 9, fontSize: ".62rem", fontWeight: 700, cursor: "pointer", fontFamily: "'Sora',sans-serif",
                        background: b.pri ? "linear-gradient(135deg,#7c3aed,#2563eb)" : "rgba(255,255,255,.05)",
                        color: b.pri ? "white" : "#64748b",
                        border: b.pri ? "none" : "1px solid rgba(255,255,255,.07)" }}>
                      {b.label}
                    </button>
                  ))}
                </div>

                <div className="glass" style={{ borderRadius: 14, padding: "13px 15px" }}>
                  <label style={{ fontSize: ".62rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 8 }}>Filtres</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {FILTERS.map(f => (
                      <button key={f.id} onClick={() => D({ t: "SET", p: { filter: f.id } })}
                        style={pill((s.filter || "none") === f.id)}>{f.label}</button>
                    ))}
                  </div>
                </div>

                <div className="glass" style={{ borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-.02em", marginBottom: 3 }}>{s.result.title}</div>
                  <div style={{ fontSize: ".68rem", color: "#64748b", marginBottom: 10 }}>{s.result.mood}</div>
                  {s.result.colors && (
                    <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 10 }}>
                      {s.result.colors.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 15, height: 15, borderRadius: "50%", background: c, border: "1.5px solid rgba(255,255,255,.18)" }} />
                          <span style={{ fontSize: ".56rem", fontFamily: "'Space Mono',monospace", color: "#4b5563" }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: ".6rem", color: "#374151", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>Export rapide</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      {[{ l: "📱 TikTok", f: "port" }, { l: "⬛ Instagram", f: "sq" }, { l: "▶️ YouTube", f: "land" }].map(e => (
                        <button key={e.f} onClick={() => { D({ t: "SET", p: { format: e.f } }); setTimeout(generate, 80); }}
                          style={{ flex: 1, padding: "5px 4px", borderRadius: 8, fontSize: ".6rem", fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.06)", color: "#64748b", fontFamily: "'Sora',sans-serif" }}>
                          {e.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )}

    {/* GALLERY */}
    {s.tab === "gallery" && (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-.02em", marginBottom: 3 }}>Ma Galerie</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: ".72rem", color: "#475569" }}>{s.gallery.length} création{s.gallery.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: ".6rem", color: "#10b981", padding: "2px 7px", borderRadius: 6, background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.2)" }}>💾 Sauvegardées localement</span>
            </div>
          </div>
          {s.gallery.length > 0 && (
            <button onClick={async () => { await Promise.all(s.gallery.map(i => dbDel(i.id))); D({ t: "LOAD", g: [] }); }}
              className="gbtn" style={{ padding: "6px 13px", borderRadius: 8, fontSize: ".7rem" }}>Tout effacer</button>
          )}
        </div>
        {s.gallery.length === 0
          ? <div className="glass" style={{ borderRadius: 18, padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎨</div>
              <p style={{ color: "#475569", fontSize: ".82rem", marginBottom: 16, lineHeight: 1.6 }}>Votre galerie est vide.<br/>Vos créations apparaîtront ici même après rechargement.</p>
              <button onClick={() => D({ t: "SET", p: { tab: "create" } })} className="pbtn" style={{ padding: "9px 20px", borderRadius: 10, fontSize: ".8rem" }}>✦ Créer ma première image</button>
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: 10 }}>
              {s.gallery.map(item => <GCard key={item.id} item={item} onDel={async id => { await dbDel(id); D({ t: "DEL", id }); }} />)}
            </div>
        }
      </div>
    )}

    {/* EDIT */}
    {s.tab === "edit" && (
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, letterSpacing: "-.02em", marginBottom: 3 }}>Édition & Filtres</h2>
          <p style={{ fontSize: ".72rem", color: "#475569" }}>Filtres et exports pour les réseaux sociaux</p>
        </div>
        {!s.result
          ? <div className="glass" style={{ borderRadius: 18, padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>✏️</div>
              <p style={{ color: "#475569", fontSize: ".8rem", marginBottom: 14 }}>Générez d'abord une image.</p>
              <button onClick={() => D({ t: "SET", p: { tab: "create" } })} className="pbtn" style={{ padding: "8px 18px", borderRadius: 9, fontSize: ".78rem" }}>✦ Créer</button>
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
              <ImageViewer url={s.result.url} ar={fmt.ar} filter={s.filter} />
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div className="glass" style={{ borderRadius: 13, padding: "14px 16px" }}>
                  <label style={{ fontSize: ".63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 9 }}>Filtres</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
                    {FILTERS.map(f => (
                      <button key={f.id} onClick={() => D({ t: "SET", p: { filter: f.id } })}
                        style={{ padding: "8px 3px", borderRadius: 8, cursor: "pointer", textAlign: "center", fontFamily: "'Sora',sans-serif",
                          background: (s.filter || "none") === f.id ? "rgba(124,58,237,.2)" : "rgba(255,255,255,.03)",
                          border: `1px solid ${(s.filter || "none") === f.id ? "rgba(124,58,237,.5)" : "rgba(255,255,255,.06)"}`,
                          color: (s.filter || "none") === f.id ? "#c4b5fd" : "#64748b", fontSize: ".62rem", fontWeight: 700 }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="glass" style={{ borderRadius: 13, padding: "14px 16px" }}>
                  <label style={{ fontSize: ".63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".07em", display: "block", marginBottom: 9 }}>Export réseaux sociaux</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[{ l: "📱 TikTok / Reels (9:16)", f: "port" }, { l: "⬛ Instagram (1:1)", f: "sq" }, { l: "▶️ YouTube (16:9)", f: "land" }].map(e => (
                      <button key={e.f} onClick={() => { D({ t: "SET", p: { format: e.f, tab: "create" } }); setTimeout(generate, 80); }}
                        style={{ padding: "10px 13px", borderRadius: 9, fontSize: ".72rem", fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.06)", color: "#94a3b8", textAlign: "left", fontFamily: "'Sora',sans-serif" }}>
                        {e.l}<span style={{ float: "right", fontSize: ".6rem", color: "#475569" }}>→ Regénérer</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={dl} className="pbtn" style={{ width: "100%", padding: 12, borderRadius: 12, fontSize: ".84rem" }}>
                  ⬇ Télécharger {s.filter !== "none" ? "(avec filtre)" : "(original)"}
                </button>
              </div>
            </div>
        }
      </div>
    )}

  </main>

  <footer style={{ borderTop: "1px solid rgba(255,255,255,.04)", padding: 14, textAlign: "center", marginTop: 20 }}>
    <p style={{ fontSize: ".6rem", color: "#1e293b" }}>
      AURORA AI v5 · Claude + Pollinations Flux · IndexedDB · PWA · Fait avec ✦
    </p>
  </footer>
</div>
```

);
}
