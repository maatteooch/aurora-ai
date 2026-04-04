import React, { useState, useCallback, useRef, useEffect, useReducer } from "react";

const STYLES = [
  { id: "none",  label: "Aucun",     sfx: "" },
  { id: "real",  label: "Realiste",  sfx: ", photorealistic, 8k, DSLR, sharp focus, ultra-detailed" },
  { id: "cine",  label: "Cinema",    sfx: ", cinematic shot, dramatic lighting, film grain, anamorphic" },
  { id: "anime", label: "Anime",     sfx: ", anime style, Studio Ghibli, vibrant, manga art" },
  { id: "3d",    label: "3D",        sfx: ", 3D render, octane, Blender, volumetric lighting" },
  { id: "aqua",  label: "Aquarelle", sfx: ", watercolor, soft edges, artistic, fluid brushstrokes" },
  { id: "neon",  label: "Neon",      sfx: ", neon lights, cyberpunk, dark background, glowing" },
  { id: "vint",  label: "Vintage",   sfx: ", vintage photo, retro, film grain, faded colors, 35mm" },
  { id: "fant",  label: "Fantasy",   sfx: ", fantasy art, magical, ethereal lighting, epic, detailed" },
];

const FORMATS = [
  { id: "sq",   label: "Carre",    w: 1024, h: 1024, tag: "Instagram", ar: "1/1" },
  { id: "port", label: "Portrait", w: 768,  h: 1344, tag: "TikTok",    ar: "9/16" },
  { id: "land", label: "Paysage",  w: 1344, h: 768,  tag: "YouTube",   ar: "16/9" },
];

const FILTERS = [
  { id: "none",  label: "Original",   css: "none" },
  { id: "vivid", label: "Vivid",      css: "saturate(1.6) contrast(1.1)" },
  { id: "cool",  label: "Cool",       css: "hue-rotate(20deg) saturate(1.2)" },
  { id: "warm",  label: "Chaud",      css: "sepia(0.3) saturate(1.4) brightness(1.05)" },
  { id: "drama", label: "Dramatique", css: "contrast(1.5) brightness(0.88)" },
  { id: "bw",    label: "N&B",        css: "grayscale(1) contrast(1.1)" },
  { id: "gold",  label: "Dore",       css: "sepia(0.45) saturate(1.7) hue-rotate(-12deg)" },
];

const PROMPTS = [
  "Une cite neo-futuriste flottante dans les nuages au coucher de soleil",
  "Portrait d une guerriere elfe en armure de cristal, foret magique",
  "Marche nocturne de Tokyo sous la pluie, reflets de neons colores",
  "Dragon mecanique en vol au-dessus d un desert de sel, lever du soleil",
];

async function enhancePrompt(frenchPrompt, styleObj, signal) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: "You are an AI image prompt engineer. Return ONLY a JSON object, no explanation, no markdown. French: " + frenchPrompt + " Style: " + (styleObj.sfx || "none") + " Return exactly: {\"en\":\"detailed English prompt\",\"title\":\"French title 4 words\",\"mood\":\"3 French mood words\",\"colors\":[\"#hex1\",\"#hex2\",\"#hex3\"]}" }]
      })
    });
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    return JSON.parse(match[0]);
  } catch(e) {
    return { en: frenchPrompt + (styleObj.sfx || ""), title: "Creation IA", mood: "Creatif, Immersif", colors: ["#7c3aed", "#2563eb", "#0891b2"] };
  }
}

function buildUrl(en, fmt, seed) {
  const s = seed || Math.floor(Math.random() * 9999999);
  return "https://image.pollinations.ai/prompt/" + encodeURIComponent(en) + "?model=flux&width=" + fmt.w + "&height=" + fmt.h + "&seed=" + s + "&nologo=true&enhance=true";
}

const INIT = {
  tab: "create", prompt: "", style: "none", format: "sq", filter: "none",
  phase: "idle", pct: 0, msg: "", result: null, gallery: [],
};

function reducer(s, a) {
  switch (a.t) {
    case "SET":   return { ...s, ...a.p };
    case "PHASE": return { ...s, phase: a.phase, pct: a.pct !== undefined ? a.pct : s.pct, msg: a.msg !== undefined ? a.msg : s.msg };
    case "DONE":  return { ...s, phase: "done", pct: 100, msg: "Image generee !", result: a.r, gallery: [a.r, ...s.gallery].slice(0, 50) };
    case "DEL":   return { ...s, gallery: s.gallery.filter(x => x.id !== a.id) };
    case "RESET": return { ...s, phase: "idle", pct: 0, msg: "" };
    default:      return s;
  }
}

export default function App() {
  const [s, D] = useReducer(reducer, INIT);
  const abort = useRef(null);
  const tick = useRef(null);
  const fmt = FORMATS.find(f => f.id === s.format) || FORMATS[0];
  const stObj = STYLES.find(x => x.id === s.style) || STYLES[0];
  const busy = s.phase === "thinking" || s.phase === "generating";
  const hasSplit = s.result || busy || s.phase === "error";

  const generate = useCallback(async () => {
    if (!s.prompt.trim() || busy) return;
    if (abort.current) abort.current.abort();
    abort.current = new AbortController();
    D({ t: "PHASE", phase: "thinking", pct: 5, msg: "Claude optimise votre prompt..." });
    try {
      const meta = await enhancePrompt(s.prompt, stObj, abort.current.signal);
      const seed = Math.floor(Math.random() * 9999999);
      const url = buildUrl(meta.en, fmt, seed);
      D({ t: "PHASE", phase: "generating", pct: 50, msg: "Flux genere l image..." });
      const id = Date.now() + "_" + Math.random().toString(36).slice(2);
      const record = {
        id, url, prompt: s.prompt,
        title: meta.title || "Creation IA",
        mood: meta.mood || "Creatif",
        colors: meta.colors || ["#7c3aed", "#2563eb", "#0891b2"],
        style: s.style, format: s.format, filter: "none", seed,
      };
      D({ t: "DONE", r: record });
    } catch(err) {
      clearInterval(tick.current);
      if (err.name === "AbortError") { D({ t: "RESET" }); return; }
      D({ t: "PHASE", phase: "error", pct: 0, msg: "Erreur: " + err.message });
    }
  }, [s.prompt, s.style, s.format, stObj, fmt, busy]);

  const pill = (active) => ({
    padding: "5px 11px", borderRadius: 20, fontSize: "0.62rem", fontWeight: 700,
    cursor: "pointer", border: "1px solid transparent", transition: "all .18s",
    background: active ? "rgba(124,58,237,.22)" : "rgba(255,255,255,.04)",
    borderColor: active ? "rgba(124,58,237,.55)" : "rgba(255,255,255,.07)",
    color: active ? "#c4b5fd" : "#475569",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#060610", fontFamily: "system-ui, sans-serif", color: "#e2e8f0" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeU { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glo { 0%,100%{opacity:.55} 50%{opacity:1} }
        .pbtn { background:linear-gradient(135deg,#7c3aed,#2563eb); color:white; border:none; cursor:pointer; font-weight:800; transition:all .3s; }
        .pbtn:hover { box-shadow:0 0 28px rgba(124,58,237,.55); transform:translateY(-2px); }
        .pbtn:disabled { opacity:.35; cursor:not-allowed; transform:none; box-shadow:none; }
        .gbtn { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); color:#64748b; cursor:pointer; transition:all .2s; }
        .gbtn:hover { background:rgba(255,255,255,.1); color:#e2e8f0; }
        .glass { background:rgba(255,255,255,.028); backdrop-filter:blur(22px); border:1px solid rgba(255,255,255,.07); }
        .ri { animation:fadeU .4s ease forwards; }
        textarea:focus { outline:none; }
      `}</style>

      <header className="glass" style={{ position: "sticky", top: 0, zIndex: 40, borderBottom: "1px solid rgba(124,58,237,.12)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#7c3aed,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 0 18px rgba(124,58,237,.4)" }}>✦</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>AURORA<span style={{ color: "#7c3aed" }}>AI</span></div>
              <div style={{ fontSize: "0.5rem", color: "#374151" }}>Image Studio</div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {[{ id: "create", label: "Creer" }, { id: "gallery", label: "Galerie" + (s.gallery.length ? " (" + s.gallery.length + ")" : "") }].map(t => (
              <button key={t.id} onClick={() => D({ t: "SET", p: { tab: t.id } })}
                style={{ padding: "5px 11px", borderRadius: 8, border: "none", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", transition: "all .2s", background: s.tab === t.id ? "rgba(124,58,237,.18)" : "transparent", color: s.tab === t.id ? "#c4b5fd" : "#475569", borderBottom: s.tab === t.id ? "2px solid #7c3aed" : "2px solid transparent" }}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        {s.tab === "create" && (
          <div style={{ display: "grid", gridTemplateColumns: hasSplit ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!hasSplit && (
                <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
                  <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.035em", marginBottom: 10 }}>
                    Creez en quelques<br />
                    <span style={{ background: "linear-gradient(90deg,#a78bfa,#60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>secondes</span>
                  </h1>
                  <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: 400, margin: "0 auto", lineHeight: 1.7 }}>
                    Decrivez en francais · Claude optimise · Flux genere
                  </p>
                </div>
              )}

              <div className="glass" style={{ borderRadius: 22, padding: 20 }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <label style={{ fontSize: "0.63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em" }}>Votre idee</label>
                    <button onClick={() => D({ t: "SET", p: { prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)] } })} className="gbtn" style={{ padding: "3px 9px", borderRadius: 7, fontSize: "0.62rem", fontWeight: 600 }}>Idee aleatoire</button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", inset: -1, borderRadius: 13, background: "linear-gradient(135deg,rgba(124,58,237,.3),rgba(37,99,235,.3))", opacity: s.prompt ? 1 : 0, transition: "opacity .35s", zIndex: 0 }} />
                    <div style={{ position: "relative", background: "#0b0b18", borderRadius: 12, zIndex: 1 }}>
                      <textarea value={s.prompt} onChange={e => D({ t: "SET", p: { prompt: e.target.value } })}
                        placeholder="ex: Un chateau medieval flottant dans les nuages..."
                        style={{ width: "100%", background: "transparent", border: "none", color: "#e2e8f0", fontSize: "0.84rem", resize: "none", lineHeight: 1.7, padding: "14px 14px 40px", minHeight: 96, boxSizing: "border-box" }} />
                      <div style={{ position: "absolute", bottom: 9, left: 12, right: 12, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.58rem", color: "#374151" }}>{s.prompt.length}/600</span>
                        {s.prompt && <button onClick={() => D({ t: "SET", p: { prompt: "" } })} style={{ fontSize: "0.6rem", padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.06)", color: "#64748b", cursor: "pointer", border: "none" }}>X</button>}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: "0.63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 8 }}>Style</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {STYLES.map(st => <button key={st.id} onClick={() => D({ t: "SET", p: { style: st.id } })} style={pill(s.style === st.id)}>{st.label}</button>)}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: "0.63rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 8 }}>Format</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {FORMATS.map(f => (
                      <button key={f.id} onClick={() => D({ t: "SET", p: { format: f.id } })}
                        style={{ flex: 1, padding: "10px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center", background: s.format === f.id ? "rgba(37,99,235,.2)" : "rgba(255,255,255,.025)", border: "1px solid " + (s.format === f.id ? "rgba(37,99,235,.55)" : "rgba(255,255,255,.06)"), color: s.format === f.id ? "#60a5fa" : "#64748b", transition: "all .2s" }}>
                        <div style={{ fontSize: "0.64rem", fontWeight: 700 }}>{f.label}</div>
                        <div style={{ fontSize: "0.52rem", color: "#374151", marginTop: 2 }}>{f.tag}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {(busy || s.phase === "done" || s.phase === "error") && (
                  <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,.028)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, marginBottom: 6, color: s.phase === "done" ? "#10b981" : s.phase === "error" ? "#f87171" : "#a78bfa" }}>{s.msg}</div>
                    <div style={{ height: 3, background: "rgba(255,255,255,.07)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: s.pct + "%", background: s.phase === "done" ? "#10b981" : s.phase === "error" ? "#f87171" : "linear-gradient(90deg,#7c3aed,#2563eb)", transition: "width .45s ease", borderRadius: 2 }} />
                    </div>
                  </div>
                )}

                <button className="pbtn" onClick={generate} disabled={busy || !s.prompt.trim()}
                  style={{ width: "100%", height: 50, borderRadius: 13, fontSize: "0.88rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {busy
                    ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.2)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin .75s linear infinite" }} />{s.phase === "thinking" ? "Claude optimise..." : "Flux genere..."}</>
                    : "Generer l image"
                  }
                </button>

                {busy && (
                  <button onClick={() => { if (abort.current) abort.current.abort(); clearInterval(tick.current); D({ t: "RESET" }); }}
                    className="gbtn" style={{ width: "100%", marginTop: 7, padding: 9, borderRadius: 11, fontSize: "0.74rem" }}>
                    Annuler
                  </button>
                )}
              </div>
            </div>

            {hasSplit && (
              <div className="ri" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {busy && !s.result && (
                  <div style={{ aspectRatio: fmt.ar, borderRadius: 18, background: "#0a0a18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,.07)", borderTop: "3px solid #a78bfa", borderRadius: "50%", animation: "spin .9s linear infinite" }} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,.4)", fontWeight: 600 }}>{s.phase === "thinking" ? "Claude travaille..." : "Flux genere..."}</div>
                      <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,.2)", marginTop: 3 }}>10-30 secondes</div>
                    </div>
                  </div>
                )}

                {s.phase === "error" && !s.result && (
                  <div style={{ padding: "28px 22px", textAlign: "center", borderRadius: 18, background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.22)" }}>
                    <p style={{ color: "#f87171", fontSize: "0.8rem", marginBottom: 14 }}>{s.msg}</p>
                    <button className="pbtn" onClick={generate} style={{ padding: "8px 20px", borderRadius: 10, fontSize: "0.78rem" }}>Reessayer</button>
                  </div>
                )}

                {s.result && (
                  <>
                    <div style={{ borderRadius: 18, overflow: "hidden", aspectRatio: fmt.ar, background: "#08080f", width: "100%", position: "relative" }}>
                      <img src={s.result.url} alt="IA" style={{ width: "100%", height: "100%", objectFit: "cover", filter: FILTERS.find(f => f.id === (s.filter || "none"))?.css || "none" }} />
                      <div style={{ position: "absolute", top: 10, right: 10 }}>
                        <span style={{ fontSize: "0.58rem", padding: "2px 7px", borderRadius: 7, background: "rgba(0,0,0,.7)", color: "#10b981", fontWeight: 700 }}>✓ Genere</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Telecharger", fn: () => { const a = document.createElement("a"); a.href = s.result.url; a.target = "_blank"; a.download = "aurora.png"; document.body.appendChild(a); a.click(); document.body.removeChild(a); } },
                        { label: "Variante", fn: generate },
                        { label: "Ouvrir", fn: () => window.open(s.result.url, "_blank") },
                      ].map((b, i) => (
                        <button key={i} onClick={b.fn} style={{ padding: "8px 4px", borderRadius: 9, fontSize: "0.62rem", fontWeight: 700, cursor: "pointer", background: i === 0 ? "linear-gradient(135deg,#7c3aed,#2563eb)" : "rgba(255,255,255,.05)", color: i === 0 ? "white" : "#64748b", border: i === 0 ? "none" : "1px solid rgba(255,255,255,.07)" }}>{b.label}</button>
                      ))}
                    </div>

                    <div className="glass" style={{ borderRadius: 14, padding: "13px 15px" }}>
                      <label style={{ fontSize: "0.62rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 8 }}>Filtres</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {FILTERS.map(f => <button key={f.id} onClick={() => D({ t: "SET", p: { filter: f.id } })} style={pill((s.filter || "none") === f.id)}>{f.label}</button>)}
                      </div>
                    </div>

                    <div className="glass" style={{ borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 3 }}>{s.result.title}</div>
                      <div style={{ fontSize: "0.68rem", color: "#64748b", marginBottom: 10 }}>{s.result.mood}</div>
                      {s.result.colors && (
                        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                          {s.result.colors.map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 14, height: 14, borderRadius: "50%", background: c, border: "1.5px solid rgba(255,255,255,.18)" }} />
                              <span style={{ fontSize: "0.55rem", fontFamily: "monospace", color: "#4b5563" }}>{c}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {s.tab === "gallery" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Galerie ({s.gallery.length})</h2>
              {s.gallery.length > 0 && <button onClick={() => D({ t: "SET", p: { gallery: [] } })} className="gbtn" style={{ padding: "6px 13px", borderRadius: 8, fontSize: "0.7rem" }}>Effacer</button>}
            </div>
            {s.gallery.length === 0
              ? <div className="glass" style={{ borderRadius: 18, padding: "56px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: "3rem", marginBottom: 12 }}>🎨</div>
                  <p style={{ color: "#475569", fontSize: "0.82rem", marginBottom: 16 }}>Galerie vide. Creez votre premiere image !</p>
                  <button onClick={() => D({ t: "SET", p: { tab: "create" } })} className="pbtn" style={{ padding: "9px 20px", borderRadius: 10, fontSize: "0.8rem" }}>Creer</button>
                </div>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                  {s.gallery.map(item => {
                    const f = FORMATS.find(x => x.id === item.format) || FORMATS[0];
                    return (
                      <div key={item.id} style={{ borderRadius: 12, overflow: "hidden", position: "relative", aspectRatio: f.ar, background: "#0d0d1a" }}>
                        <img src={item.url} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={() => D({ t: "DEL", id: item.id })} style={{ position: "absolute", top: 6, right: 6, padding: "3px 7px", borderRadius: 6, fontSize: "0.58rem", fontWeight: 700, background: "rgba(239,68,68,.75)", color: "white", border: "none", cursor: "pointer" }}>X</button>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}
      </main>

      <footer style={{ borderTop: "1px solid rgba(255,255,255,.04)", padding: 14, textAlign: "center", marginTop: 20 }}>
        <p style={{ fontSize: "0.6rem", color: "#1e293b" }}>AURORA AI · Claude + Pollinations Flux · Fait avec ✦</p>
      </footer>
    </div>
  );
}
