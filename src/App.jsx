import React, { useEffect, useMemo, useRef, useState } from "react";

/********************************************
 * Agent Evelyn – Ultra Prototype v2 (Portrait Mobile)
 * ---------------------------------------------------
 * New in this version
 * - STORY page: global narrative about saving the planet & rescues; voice-read
 * - Each mission now has a COMMANDER (name + emblem) who assigns the mission
 * - AR Scan is now an optional step you can require per-mission (gate Begin)
 * - Android install flow: in-app "Install App" button using beforeinstallprompt
 * - PWA runtime manifest + service worker (works offline, full-screen)
 ********************************************/

/**************** PWA bootstrap ****************/
function installPWA(){
  try {
    const svgIcon = encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0%' stop-color='#22d3ee'/><stop offset='100%' stop-color='#ec4899'/></linearGradient></defs><rect width='512' height='512' fill='#000'/><circle cx='256' cy='256' r='210' fill='url(#g)' opacity='0.25'/><text x='256' y='294' font-size='180' text-anchor='middle' fill='#f472b6' font-family='Verdana' style='font-weight:700; letter-spacing:8px'>AE</text></svg>`);
    const iconData = `data:image/svg+xml;charset=utf-8,${svgIcon}`;
    const manifest = {
      name: "Agent Evelyn",
      short_name: "Agent",
      start_url: ".",
      display: "standalone",
      background_color: "#000000",
      theme_color: "#000000",
      icons: [
        { src: iconData, sizes: "192x192", type: "image/svg+xml", purpose:"any" },
        { src: iconData, sizes: "512x512", type: "image/svg+xml", purpose:"any" }
      ]
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const manifestURL = URL.createObjectURL(manifestBlob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link){ link = document.createElement('link'); link.rel='manifest'; document.head.appendChild(link); }
    link.href = manifestURL;

    const meta1 = document.createElement('meta'); meta1.name='apple-mobile-web-app-capable'; meta1.content='yes'; document.head.appendChild(meta1);
    const meta2 = document.createElement('meta'); meta2.name='apple-mobile-web-app-status-bar-style'; meta2.content='black'; document.head.appendChild(meta2);

    if ('serviceWorker' in navigator) {
      const swCode = `self.addEventListener('install', e=>{e.waitUntil(caches.open('ae-cache-v1').then(c=>c.addAll(['./'])))});self.addEventListener('fetch', e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})`;
      const swURL = URL.createObjectURL(new Blob([swCode], { type: 'text/javascript' }));
      navigator.serviceWorker.register(swURL, { scope: './' }).catch(()=>{});
    }
  } catch(e) { /* noop */ }
}

/**************** Utilities ****************/
const today = () => new Date().toLocaleDateString();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function speak(text, { rate = 1, pitch = 1, lang = "en-GB", voice = null } = {}) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = pitch; u.lang = lang; if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch(_){}
}

function playSiren(intensity = 1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    const base = 480 + 60*intensity;
    o.frequency.setValueAtTime(base, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(base*1.6, ctx.currentTime + 0.12);
    o.frequency.exponentialRampToValueAtTime(base, ctx.currentTime + 0.28);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.28*intensity, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.34);
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch(_) { }
}

/**************** Persistence ****************/
const LS_KEY = "agent-evelyn-log-v1";
function loadLog(){ try { return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); } catch(_) { return []; } }
function saveLog(log){ try { localStorage.setItem(LS_KEY, JSON.stringify(log)); } catch(_){} }

const XP_PER_MISSION = 25;
const LEVELS = [0, 50, 125, 250, 400, 600];
function xpToLevel(xp){ let lvl=0; for(let i=0;i<LEVELS.length;i++){ if(xp>=LEVELS[i]) lvl=i; } return lvl; }

/**************** Commanders ****************/
const COMMANDERS = [
  { name: "Commander Nova", emblem: "🌟" },
  { name: "Director Axiom", emblem: "🛰️" },
  { name: "Chief Tempest", emblem: "⚡" },
  { name: "Marshal Quill", emblem: "🛡️" },
  { name: "Admiral Mirage", emblem: "🎯" },
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**************** Global Story ****************/
function globalLore(lang = "en-GB"){
  if (lang.startsWith('fr')) {
    return (
      "Le monde a besoin d'Agent Evelyn. Des portails s'ouvrent, des tempêtes magnétiques brouillent nos cartes, " +
      "et des rivaux veulent capturer nos trésors naturels. L'Agence te charge de protéger la planète, de sauver ce qui compte, " +
      "et d'ouvrir la voie à la prochaine génération d'agents. Chaque mission est une pièce du grand puzzle."
    );
  }
  return (
    "The world needs Agent Evelyn. Strange portals flicker open, magnetic storms scramble our maps, " +
    "and rival operatives race to snatch Earth’s wonders. The Agency entrusts you to protect the planet, rescue what matters, " +
    "and light the path for the next generation of agents. Every mission is a piece of the bigger puzzle."
  );
}

/**************** Story Generator ****************/
const IMAGINED_ELEMENTS = [
  "the clocktower gears are spinning out of control",
  "a rival crew is racing you to the treasure chest",
  "storm clouds are gathering over the secret lagoon",
  "the last bridge before the volcano erupts is starting to crumble",
  "a swarm of golden fireflies is escaping into the night sky",
  "the frost giants are sealing the mountain pass with ice",
  "tidal waves are sweeping away the sandcastle kingdom",
  "a rival explorer is almost at the hidden cave entrance",
  "the drawbridge to the fortress is starting to rise",
  "sandstorms are closing in on the desert runway",
  "a rogue airship is circling above the harbour",
  "lava is creeping towards the crystal mines",
  "a meteor shower is heading for the jungle canopy",
  "the rainbow tunnel is fading into darkness",
  "the glacier path is melting in the midday sun",
  "pirates are surrounding the candy island",
  "giant whirlpools are forming in the coral sea",
  "the moonlight portal is about to vanish",
  "thunder cracks above the glass mountain",
  "a rival treasure hunter is just steps behind you",
  "the golden key is sinking into quicksand",
  "the ancient library doors are closing forever",
  "lightning is striking the tower beacon",
  "the last ferry is leaving the enchanted dock",
  "snow is burying the village gates",
  "the hidden passage is sealing shut",
  "a shadow army is marching towards the valley",
  "the crystal bridge is shattering beneath your feet"
];
const HAZARDS = [
  "storm incoming",
  "enemy drone spotted",
  "magnetic interference",
  "slippery route",
  "mysterious footprints",
  "low visibility",
  "echoes in the tunnel",
  "decoy signals",
];

function buildBackstory(task, rivalName = "a rival agent", commander, lang = "en-GB", includeHazard = true) {
  const chosen = pick(IMAGINED_ELEMENTS);
  const hazard = includeHazard ? (lang.startsWith('fr') ? ` Nos capteurs détectent ${pick(HAZARDS)}.` : ` Sensors report ${pick(HAZARDS)}.`) : "";
  if (lang.startsWith('fr')) {
    return `${commander.name}: Votre prochaine mission: ${task} avant que ${chosen}. Chaque instant compte — ${rivalName} se rapproche.` + hazard;
  }
  return `${commander.name}: For your next mission, you must ${task} before ${chosen}. Every moment counts — ${rivalName} is closing in.` + hazard;
}

/**************** Phone Frame + Neon Border ****************/
function PhoneFrame({ children, pattern = "wave" }) {
  return (
    <div className="min-h-screen bg-neutral-950 grid place-items-center p-4">
      <style>{`
        .phone { position: relative; width: 360px; height: 780px; max-width: 92vw; max-height: 90vh; background: #000; border-radius: 34px; box-shadow: 0 8px 40px rgba(0,0,0,0.6), inset 0 0 0 2px #111; overflow: hidden; }
        .bulb { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 10px #22d3ee, 0 0 14px #ec4899, 0 0 10px #22c55e; opacity: .25; }
        .wave { animation: bulbBlink 520ms steps(2,end) infinite; }
        .spiral { animation: bulbSpiral 900ms linear infinite; }
        .shift { animation: bulbShift 1200ms linear infinite; }
        @keyframes bulbBlink { 0%,49% { opacity:.25; transform: scale(1);} 50%,100% {opacity:1; transform: scale(1.15);} }
        @keyframes bulbSpiral { 0% { filter: hue-rotate(0deg); opacity:.35;} 50% { filter: hue-rotate(120deg); opacity:1;} 100% { filter: hue-rotate(240deg); opacity:.35;} }
        @keyframes bulbShift { 0% { box-shadow: 0 0 10px #22d3ee, 0 0 14px #ec4899, 0 0 10px #22c55e; }
                               33%{ box-shadow: 0 0 10px #ec4899, 0 0 14px #22c55e, 0 0 10px #22d3ee; }
                               66%{ box-shadow: 0 0 10px #22c55e, 0 0 14px #22d3ee, 0 0 10px #ec4899; }
                               100%{ box-shadow: 0 0 10px #22d3ee, 0 0 14px #ec4899, 0 0 10px #22c55e; } }
        .titleBlock { text-transform: uppercase; letter-spacing: .35em; color: #67e8f9; text-shadow: 0 0 14px rgba(103,232,249,.9); font-weight: 800; font-size: 42px; }
        .subtitle { margin-top: -4px; font-family: cursive; color: #f472b6; text-shadow: 0 0 16px rgba(244,114,182,.95); font-size: 48px; }
        .btn { border-radius: 16px; padding: 12px 16px; font-weight: 700; }
        .radar:before { content:''; position:absolute; inset:-30%; background: conic-gradient(from var(--a,0deg), rgba(34,211,238,.15), transparent 45%); filter: blur(3px); }
        .radar { --a:0deg; animation: sweep 5s linear infinite; }
        @keyframes sweep { to { --a:360deg; } }
        .fade-in { animation: fadeIn .35s ease-out; }
        @keyframes fadeIn { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }
        .ripple { position: relative; overflow: hidden; }
        .ripple:after { content:''; position:absolute; inset:auto; width:0; height:0; border-radius:9999px; left:50%; top:50%; transform: translate(-50%,-50%); background: rgba(103,232,249,.25); transition: width .4s, height .4s; }
        .ripple:active:after { width:160%; height:160%; }
      `}</style>
      <div className="phone">
        <NeonCircleBorder countTop={36} countSide={26} pattern={pattern} />
        <div className="absolute inset-0 text-white">{children}</div>
      </div>
    </div>
  );
}

function NeonCircleBorder({ countTop = 36, countSide = 26, pattern = "wave" }) {
  const bulbs = [];
  for (let i=0;i<countTop;i++) bulbs.push({ edge:'top', pos:i/(countTop-1) });
  for (let i=0;i<countTop;i++) bulbs.push({ edge:'bottom', pos:i/(countTop-1) });
  for (let i=0;i<countSide;i++) bulbs.push({ edge:'left', pos:i/(countSide-1) });
  for (let i=0;i<countSide;i++) bulbs.push({ edge:'right', pos:i/(countSide-1) });
  return (
    <div className="absolute inset-0 pointer-events-none">
      {bulbs.map((b, idx) => (
        <div
          key={idx}
          className={`bulb ${pattern}`}
          style={{
            top: b.edge==='top' ? 6 : b.edge==='bottom' ? undefined : `calc(${b.pos*100}% - 5px)`,
            bottom: b.edge==='bottom' ? 6 : undefined,
            left: b.edge==='left' ? 6 : b.edge==='right' ? undefined : `calc(${b.pos*100}% - 5px)`,
            right: b.edge==='right' ? 6 : undefined,
            animationDelay: `${idx*40}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**************** Screens ****************/
function Home({ onStart, onShowLore, onInstall, canInstall, pattern, setPattern, xp }) {
  const level = xpToLevel(xp);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 fade-in">
      <div className="titleBlock">AGENT</div>
      <div className="subtitle">Evelyn</div>
      <div className="mt-2 text-xs text-zinc-400">Level {level} • XP {xp}</div>
      <div className="mt-6 grid gap-3 w-full">
        <button onClick={onStart} className="btn ripple bg-cyan-400 text-black">Start Mission</button>
        <button onClick={onShowLore} className="btn border border-zinc-700">Story</button>
        {canInstall && <button onClick={onInstall} className="btn bg-pink-500 text-black">Install App</button>}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button onClick={()=>setPattern("wave")} className={`btn border ${pattern==='wave'?'border-cyan-400':'border-zinc-700'}`}>Wave</button>
          <button onClick={()=>setPattern("spiral")} className={`btn border ${pattern==='spiral'?'border-pink-400':'border-zinc-700'}`}>Spiral</button>
          <button onClick={()=>setPattern("shift")} className={`btn border ${pattern==='shift'?'border-emerald-400':'border-zinc-700'}`}>Shift</button>
        </div>
        <div className="text-xs text-zinc-500">Tap pattern to change the neon lights style</div>
      </div>
    </div>
  );
}

function Lore({ lang, onBack }){
  useEffect(()=>{ speak(globalLore(lang), { lang, rate: 1, pitch: 1.03 }); }, [lang]);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Agency Brief</div>
      <h2 className="text-xl font-bold">Why Agent Evelyn is Needed</h2>
      <div className="mt-3 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3 leading-relaxed">
        {globalLore(lang)}
      </div>
      <div className="mt-3 text-sm text-zinc-300">Every mission you run helps rescue wildlife, guard secret places, and keep the world safe. Ready to begin?</div>
      <button onClick={onBack} className="btn mt-auto bg-cyan-500 text-black">Back</button>
    </div>
  );
}

function Compose({ onCancel, onNext, rivalName, setRivalName, requireAR, setRequireAR }) {
  const [task, setTask] = useState("");
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Agent Evelyn Console • {today()}</div>
      <h2 className="mt-1 text-xl font-bold">Parent: Create Mission</h2>
      <label className="mt-4 text-sm text-zinc-300">What should the child do? (e.g., put on pyjamas and brush teeth)</label>
      <textarea value={task} onChange={(e)=>setTask(e.target.value)} rows={4} className="mt-2 rounded-xl bg-neutral-900 border border-zinc-700 p-3 outline-none" placeholder="Type the activity"/>
      <label className="mt-3 text-sm text-zinc-300">Optional rival agent name</label>
      <input value={rivalName} onChange={(e)=>setRivalName(e.target.value)} className="rounded-xl bg-neutral-900 border border-zinc-700 p-2 outline-none" placeholder="e.g., Agent Shadow"/>
      <label className="mt-3 text-sm text-zinc-300 flex items-center gap-2">
        <input type="checkbox" checked={requireAR} onChange={(e)=>setRequireAR(e.target.checked)} /> Require AR drone scan before mission begins
      </label>
      <div className="mt-auto grid grid-cols-2 gap-3">
        <button onClick={onCancel} className="btn border border-zinc-700">Back</button>
        <button onClick={()=>onNext(task.trim())} disabled={!task.trim()} className="btn bg-cyan-500 text-black disabled:opacity-50">Generate</button>
      </div>
    </div>
  );
}

function Approve({ mission, onEdit, onApprove, onShuffle }) {
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Review & Approve</div>
      <div className="flex items-start gap-3">
        <div className="text-4xl" title="Commander emblem">{mission.commander.emblem}</div>
        <div>
          <h2 className="text-xl font-bold">{mission.commander.name}</h2>
          <div className="text-sm text-zinc-300">Mission: {mission.task}</div>
        </div>
      </div>
      <div className="mt-3 text-sm text-zinc-300">Story (what your child will hear):</div>
      <div className="mt-2 bg-neutral-900 border border-zinc-700 rounded-xl p-3 text-sm leading-relaxed radar relative">{mission.backstory}</div>
      {mission.requireAR && <div className="mt-2 text-xs text-amber-400">This mission requires an AR scan to locate enemy drones before starting.</div>}
      <div className="mt-auto grid grid-cols-3 gap-2">
        <button onClick={onEdit} className="btn border border-zinc-700">Edit</button>
        <button onClick={onShuffle} className="btn border border-zinc-700">Shuffle Story</button>
        <button onClick={onApprove} className="btn bg-pink-500 text-black">Approve</button>
      </div>
    </div>
  );
}

function Alert({ onAnswer, onDismiss, intensity, commander }) {
  const timerRef = useRef(null); const tickRef = useRef(0);
  const [meter, setMeter] = useState(0);
  useEffect(() => {
    const loop = () => {
      const t = tickRef.current++;
      if (t % 2 === 0) { playSiren(intensity); } else { speak("INCOMING MISSION", { rate: 0.95+0.05*intensity, pitch: 1.0+0.05*intensity }); }
      setMeter(m => (m >= 100 ? 0 : m + 25));
    };
    loop();
    timerRef.current = setInterval(loop, clamp(900 - intensity*150, 450, 900));
    return () => { try { clearInterval(timerRef.current); } catch(_){} try { window.speechSynthesis.cancel(); } catch(_){} };
  }, [intensity]);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 fade-in">
      <div className="text-6xl mb-1">🚨</div>
      <div className="font-extrabold tracking-widest">INCOMING MISSION CALL</div>
      <div className="text-sm text-zinc-300 mt-1">{commander.emblem} {commander.name}</div>
      <div aria-label="urgency meter" className="w-full max-w-xs h-3 bg-zinc-800 rounded-full mt-3 overflow-hidden">
        <div style={{width:`${meter}%`}} className="h-full bg-gradient-to-r from-cyan-400 via-pink-400 to-emerald-400 transition-[width] duration-300"></div>
      </div>
      <p className="text-zinc-300 text-sm mt-2">Tap to answer and receive your orders.</p>
      <button onClick={onAnswer} className="btn mt-5 w-full bg-pink-500 text-black ripple">Answer</button>
      <button onClick={onDismiss} className="btn mt-2 w-full border border-zinc-700">Dismiss</button>
    </div>
  );
}

function Briefing({ mission, voiceCfg, onBegin, onOpenAR }) {
  useEffect(() => {
    // quick radio beep
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(800, ctx.currentTime); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.2);} catch(_){ }
    speak(mission.backstory, voiceCfg);
  }, [mission, voiceCfg]);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Mission Briefing</div>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{mission.commander.emblem}</div>
        <div>
          <div className="text-sm text-zinc-300">{mission.commander.name}</div>
          <h2 className="text-xl font-bold">Mission: {mission.task}</h2>
        </div>
      </div>
      <div className="mt-2 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3 radar relative">{mission.backstory}</div>
      {mission.requireAR ? (
        <>
          <div className="mt-2 text-xs text-amber-400">Before starting, scan the area and tag all enemy drones.</div>
          <button onClick={onOpenAR} className="btn mt-auto bg-pink-500 text-black">Open Scanner</button>
        </>
      ) : (
        <button onClick={onBegin} className="btn mt-auto bg-cyan-500 text-black">Begin Mission</button>
      )}
    </div>
  );
}

/**************** Badges & Trophy Room ****************/
const RARITY = [
  { name: "Bronze", color: "#a16207", chance: 0.5 },
  { name: "Silver", color: "#9ca3af", chance: 0.3 },
  { name: "Gold", color: "#f59e0b", chance: 0.18 },
  { name: "Ultra", color: "#8b5cf6", chance: 0.02 },
];
function rollRarity(){ const r=Math.random(); let acc=0; for(const t of RARITY){ acc+=t.chance; if(r<=acc) return t; } return RARITY[0]; }
function makeBadge(mission){ const tier=rollRarity(); const icons=["⭐","🛡️","⚡","🎯","🛰️","🧭","🗝️","🪪"]; return { id:Date.now(), title:`${tier.name} Agent`, color:tier.color, icon:pick(icons), rarity:tier.name, task:mission.task, date:today() }; }

function TrophyRoom({ log, onClose }){
  const totalXP = log.length * XP_PER_MISSION; const level = xpToLevel(totalXP);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Trophy Room</div>
      <div className="text-sm text-zinc-300">Level {level} • XP {totalXP}</div>
      <div className="grid gap-3 mt-3 overflow-auto" style={{maxHeight:'60vh'}}>
        {log.slice().reverse().map((e)=> (
          <div key={e.badge.id} className="rounded-xl border border-zinc-700 p-3 flex items-center gap-3 bg-neutral-900">
            <div className="text-3xl" style={{filter:`drop-shadow(0 0 10px ${e.badge.color})`}}>{e.badge.icon}</div>
            <div>
              <div className="font-bold" style={{color:e.badge.color}}>{e.badge.title}</div>
              <div className="text-xs text-zinc-400">{e.date} • {e.task}</div>
              <div className="text-xs">Rarity: {e.badge.rarity}</div>
            </div>
          </div>
        ))}
        {log.length===0 && <div className="text-sm text-zinc-400">No missions yet. Complete one to earn a badge!</div>}
      </div>
      <button onClick={onClose} className="btn mt-auto border border-zinc-700">Back</button>
    </div>
  );
}

/**************** AR Scan Mode ****************/
function ARScan({ onDone, onClose }){
  const videoRef = useRef(null);
  const [targets, setTargets] = useState(()=> Array.from({length:3}, (_,i)=>({ id:i+1, x: Math.random()*70+10, y: Math.random()*55+10, found:false, speed: 6+Math.random()*6 })) );
  const [found, setFound] = useState(0);
  useEffect(()=>{
    let stream; (async()=>{ try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (videoRef.current){ videoRef.current.srcObject = stream; await videoRef.current.play(); } } catch(_){} })();
    return ()=>{ try { stream && stream.getTracks().forEach(t=>t.stop()); } catch(_){} };
  },[]);
  function handleHit(id){ setTargets(ts => ts.map(t => t.id===id?{...t, found:true}:t)); setFound(f=>f+1); try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o=ctx.createOscillator(); const g=ctx.createGain(); o.type='triangle'; o.frequency.setValueAtTime(900, ctx.currentTime); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.18); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.18); if (navigator.vibrate) navigator.vibrate(60);} catch(_){ } }
  return (
    <div className="h-full w-full relative fade-in">
      <style>{`
        .drone { position:absolute; width:56px; height:56px; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; cursor:pointer; filter: drop-shadow(0 0 8px rgba(236,72,153,.8)); }
        .drift { animation: drift var(--t,7s) ease-in-out infinite alternate; }
        @keyframes drift { from { transform: translate(0,0) rotate(-8deg);} to { transform: translate(var(--dx,40px), var(--dy,40px)) rotate(8deg);} }
        .reticle { position:absolute; inset:0; pointer-events:none; }
        .reticle:after { content:''; position:absolute; left:50%; top:50%; width:160px; height:160px; transform:translate(-50%,-50%); border:2px dashed rgba(103,232,249,.6); border-radius:14px; box-shadow:0 0 20px rgba(103,232,249,.3) inset; }
      `}</style>
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      <div className="absolute inset-0 reticle" />
      {targets.map(t => (
        <div key={t.id} onClick={()=>!t.found && handleHit(t.id)} className="drone drift" style={{ left: `${t.x}%`, top: `${t.y}%`, background: t.found? 'rgba(16,185,129,.85)':'rgba(236,72,153,.75)', '--dx': `${(Math.random()*20+20)|0}px`, '--dy': `${(Math.random()*20+20)|0}px`, '--t': `${t.speed}s` }}>
          {t.found? 'TAGGED' : 'DRONE'}
        </div>
      ))}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-center text-xs">
        <div className="px-2 py-1 bg-black/50 rounded">Find the drones: <b>{found}</b>/3</div>
        <div className="flex gap-2">
          {found===3 && <button onClick={onDone} className="btn bg-emerald-400 text-black">Confirm</button>}
          <button onClick={onClose} className="btn border border-zinc-700">Close</button>
        </div>
      </div>
      {found===3 && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="rounded-2xl bg-black/70 border border-emerald-400 p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">All enemy drones tagged!</div>
            <div className="text-sm text-zinc-300 mt-1">Return to mission.</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**************** Settings (PIN) ****************/
function Settings({ onClose, voiceCfg, setVoiceCfg, lang, setLang, pinOk, setPinOk }){
  const [pin, setPin] = useState("");
  const [rate, setRate] = useState(voiceCfg.rate);
  const [pitch, setPitch] = useState(voiceCfg.pitch);
  const [style, setStyle] = useState("serious");
  function apply(){ const styles = { serious:{rate, pitch}, playful:{rate: rate+0.1, pitch: pitch+0.2}, robot:{rate: rate-0.05, pitch: 0.9}, alien:{rate: rate+0.05, pitch: 1.3} }; setVoiceCfg(v => ({ ...v, ...styles[style] })); onClose(); }
  return (
    <div className="h-full w-full flex flex-col px-5 py-6 fade-in">
      <div className="text-xs text-zinc-400">Settings</div>
      {!pinOk ? (
        <div className="mt-4">
          <div className="text-sm">Enter PIN to access parent settings:</div>
          <input value={pin} onChange={(e)=>setPin(e.target.value)} className="mt-2 rounded-xl bg-neutral-900 border border-zinc-700 p-3 outline-none" placeholder="e.g., 2468"/>
          <button onClick={()=>setPinOk(pin.trim().length>=4)} className="btn mt-3 bg-cyan-500 text-black">Unlock</button>
          <button onClick={onClose} className="btn mt-2 border border-zinc-700">Back</button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 mt-3 text-sm">
            <div>
              <div className="text-zinc-300">Language</div>
              <select value={lang} onChange={(e)=>setLang(e.target.value)} className="mt-1 w-full rounded-xl bg-neutral-900 border border-zinc-700 p-2">
                <option value="en-GB">English (UK)</option>
                <option value="fr-FR">Français</option>
              </select>
            </div>
            <div>
              <div className="text-zinc-300">Voice rate ({rate.toFixed(2)})</div>
              <input type="range" min="0.7" max="1.4" step="0.01" value={rate} onChange={(e)=>setRate(parseFloat(e.target.value))} className="w-full"/>
            </div>
            <div>
              <div className="text-zinc-300">Voice pitch ({pitch.toFixed(2)})</div>
              <input type="range" min="0.6" max="1.6" step="0.01" value={pitch} onChange={(e)=>setPitch(parseFloat(e.target.value))} className="w-full"/>
            </div>
            <div>
              <div className="text-zinc-300">Style</div>
              <select value={style} onChange={(e)=>setStyle(e.target.value)} className="mt-1 w-full rounded-xl bg-neutral-900 border border-zinc-700 p-2">
                <option value="serious">Serious Agent</option>
                <option value="playful">Playful Spy</option>
                <option value="robot">Robot</option>
                <option value="alien">Alien</option>
              </select>
            </div>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2">
            <button onClick={apply} className="btn bg-cyan-500 text-black">Apply</button>
            <button onClick={onClose} className="btn border border-zinc-700">Close</button>
          </div>
        </>
      )}
    </div>
  );
}

/**************** Celebration ****************/
function Confetti(){
  const [parts] = useState(()=> Array.from({length:36},(_,i)=>({ id:i, x: Math.random()*100, y:-10, r: Math.random()*360 })) );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {parts.map(p=> (
        <div key={p.id} style={{position:'absolute', left:`${p.x}%`, top:`${p.y}%`, transform:`rotate(${p.r}deg)`, fontSize:'18px', animation:'fall 1.6s ease-in forwards', filter:'drop-shadow(0 0 6px rgba(255,255,255,.6))'}}>
          {pick(["✨","🎉","⭐","💠","🔶","🔷"])}
        </div>
      ))}
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: .9; } }`}</style>
    </div>
  );
}

/**************** App ****************/
export default function App() {
  useEffect(()=>{ installPWA(); }, []);

  const [pattern, setPattern] = useState("wave");
  const [phase, setPhase] = useState("home"); // home | lore | compose | approve | alert | briefing | active | success | trophies | settings | ar
  const [mission, setMission] = useState(null);
  const [rivalName, setRivalName] = useState("Agent Shadow");
  const [requireAR, setRequireAR] = useState(true);
  const [arCleared, setArCleared] = useState(false);
  const [log, setLog] = useState(loadLog());
  const totalXP = log.length * XP_PER_MISSION;

  // Commander for current mission
  const [commander, setCommander] = useState(pick(COMMANDERS));

  // Voice config
  const [lang, setLang] = useState("en-GB");
  const [voiceCfg, setVoiceCfg] = useState({ rate: 1, pitch: 1.03, lang: "en-GB", voice: null });
  useEffect(()=>{ setVoiceCfg(v=>({ ...v, lang })); }, [lang]);

  // Settings PIN
  const [pinOk, setPinOk] = useState(false);

  // Android install prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(()=>{
    const handler = (e)=>{ e.preventDefault(); setDeferredPrompt(e); setCanInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return ()=> window.removeEventListener('beforeinstallprompt', handler);
  },[]);
  async function handleInstall(){ try { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); setCanInstall(false); } catch(_){} }

  // Flow helpers
  function toCompose(){ setPhase("compose"); }
  function toLore(){ setPhase("lore"); }
  function handleGenerate(task){
    const trimmed = task.trim(); if (!trimmed) return;
    const cmd = pick(COMMANDERS); setCommander(cmd);
    const backstory = buildBackstory(trimmed, rivalName || "a rival agent", cmd, lang, true);
    setMission({ task: trimmed, backstory, commander: cmd, requireAR });
    setArCleared(false);
    setPhase("approve");
  }
  function handleShuffle(){ if (!mission) return; const b = buildBackstory(mission.task, rivalName || "a rival agent", mission.commander, lang, true); setMission(m => ({ ...m, backstory: b })); }
  function handleApprove(){ setPhase("alert"); }
  function handleAnswer(){ setPhase("briefing"); }
  function handleOpenAR(){ setPhase("ar"); }
  function handleARDone(){ setArCleared(true); setPhase("briefing"); }
  function handleBegin(){ if (mission?.requireAR && !arCleared) return; setPhase("active"); }
  function handleComplete(){ const badge = makeBadge(mission); const entry = { date: today(), task: mission.task, badge }; const newLog = [...log, entry]; setLog(newLog); saveLog(newLog); setPhase("success"); }
  function goHome(){ setMission(null); setPhase("home"); }

  return (
    <PhoneFrame pattern={pattern}>
      {/* Top bar actions */}
      <div className="absolute top-2 left-2 right-2 flex justify-between text-xs text-zinc-400">
        <button onClick={()=>setPhase("trophies")} className="btn border border-zinc-700">Trophies</button>
        <div className="flex gap-2">
          <button onClick={()=>setPhase("ar")} className="btn border border-zinc-700">AR Scan</button>
          <button onClick={()=>setPhase("settings")} className="btn border border-zinc-700">Settings</button>
        </div>
      </div>

      {phase === "home" && <Home onStart={toCompose} onShowLore={toLore} onInstall={handleInstall} canInstall={canInstall} pattern={pattern} setPattern={setPattern} xp={totalXP} />}
      {phase === "lore" && <Lore lang={lang} onBack={()=>setPhase("home")} />}
      {phase === "compose" && <Compose onCancel={goHome} onNext={handleGenerate} rivalName={rivalName} setRivalName={setRivalName} requireAR={requireAR} setRequireAR={setRequireAR} />}
      {phase === "approve" && mission && <Approve mission={mission} onEdit={()=>setPhase("compose")} onApprove={handleApprove} onShuffle={handleShuffle} />}
      {phase === "alert" && mission && <Alert onAnswer={handleAnswer} onDismiss={goHome} intensity={1} commander={mission.commander} />}
      {phase === "briefing" && mission && <Briefing mission={mission} voiceCfg={voiceCfg} onBegin={handleBegin} onOpenAR={handleOpenAR} />}
      {phase === "ar" && <ARScan onDone={handleARDone} onClose={()=>setPhase("briefing")} />}
      {phase === "active" && (
        <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 fade-in">
          <div className="text-lg">Mission in progress…</div>
          <p className="text-zinc-300 text-sm mt-2">When the activity is finished, the parent can mark it complete.</p>
          <button onClick={handleComplete} className="btn mt-5 w-full bg-emerald-400 text-black ripple">Parent: Mark Complete</button>
        </div>
      )}
      {phase === "success" && (
        <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 fade-in relative">
          <Confetti />
          <div className="text-4xl">🏅</div>
          <div className="mt-2 text-xl font-bold">Mission Complete!</div>
          <div className="mt-2 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3">You earned a new badge.</div>
          <button onClick={()=>setPhase("trophies")} className="btn mt-4 bg-cyan-500 text-black">View Trophies</button>
          <button onClick={goHome} className="btn mt-2 border border-zinc-700">Back to Home</button>
        </div>
      )}
      {phase === "trophies" && <TrophyRoom log={log} onClose={goHome} />}
      {phase === "settings" && <Settings onClose={goHome} voiceCfg={voiceCfg} setVoiceCfg={setVoiceCfg} lang={lang} setLang={setLang} pinOk={pinOk} setPinOk={setPinOk} />}
    </PhoneFrame>
  );
}