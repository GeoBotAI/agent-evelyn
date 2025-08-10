import React, { useEffect, useRef, useState } from "react";

/********************************************
 * Agent Evelyn – Streamlined v3 (Portrait Mobile)
 * ------------------------------------------------
 * - AR removed
 * - Camera/photos added; saved to Case File (localStorage)
 * - Animated “bear commander” avatar (CSS/SVG)
 * - “Activate Mission” flow + voice confirmation
 * - Mission wording prefix: “Your next mission, Agent Evelyn, is …”
 * - Commander image introduces mission
 * - No parent PIN. No neon pattern choices.
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
      const swCode = `self.addEventListener('install', e=>{e.waitUntil(caches.open('ae-cache-v2').then(c=>c.addAll(['./'])))});self.addEventListener('fetch', e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})`;
      const swURL = URL.createObjectURL(new Blob([swCode], { type: 'text/javascript' }));
      navigator.serviceWorker.register(swURL, { scope: './' }).catch(()=>{});
    }
  } catch(e) { /* noop */ }
}

/**************** Utilities ****************/
const today = () => new Date().toLocaleDateString();

function speak(text, { rate = 1, pitch = 1, lang = "en-GB", voice = null } = {}) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = pitch; u.lang = lang; if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch(_){}
}

/**************** Persistence ****************/
const LS_KEY = "agent-evelyn-log-v2";
function loadLog(){ try { return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); } catch(_) { return []; } }
function saveLog(log){ try { localStorage.setItem(LS_KEY, JSON.stringify(log)); } catch(_){} }

const XP_PER_MISSION = 25;
const LEVELS = [0, 50, 125, 250, 400, 600];
function xpToLevel(xp){ let lvl=0; for(let i=0;i<LEVELS.length;i++){ if(xp>=LEVELS[i]) lvl=i; } return lvl; }

/**************** Animated Commander (SVG) ****************/
// Cute, generic, Octonauts-ish bear (original SVG + CSS animation)
function bearDataURL(){
  const svg =
`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
  <defs>
    <radialGradient id='f' cx='50%' cy='40%' r='60%'>
      <stop offset='0%' stop-color='#ffd7b3'/>
      <stop offset='100%' stop-color='#e9a86a'/>
    </radialGradient>
  </defs>
  <g>
    <!-- head -->
    <circle cx='100' cy='100' r='58' fill='url(#f)' stroke='#c27a3a' stroke-width='3'/>
    <!-- ears -->
    <circle cx='60' cy='60' r='16' fill='#e9a86a' stroke='#c27a3a' stroke-width='3'/>
    <circle cx='140' cy='60' r='16' fill='#e9a86a' stroke='#c27a3a' stroke-width='3'/>
    <!-- eyes -->
    <circle cx='80' cy='95' r='6' fill='#2b2b2b'/>
    <circle cx='120' cy='95' r='6' fill='#2b2b2b'/>
    <!-- muzzle -->
    <ellipse cx='100' cy='115' rx='22' ry='16' fill='#fff3e6' stroke='#c27a3a' stroke-width='2'/>
    <circle cx='100' cy='115' r='4.5' fill='#2b2b2b'/>
    <path d='M92 122 Q100 128 108 122' stroke='#2b2b2b' stroke-width='3' fill='none' stroke-linecap='round'/>
    <!-- hat (captain) -->
    <path d='M60 68 Q100 40 140 68 Q120 72 80 72 Z' fill='#1e90ff' stroke='#0e5aa8' stroke-width='3'/>
    <circle cx='100' cy='60' r='10' fill='#fff'/>
    <text x='100' y='63' text-anchor='middle' font-size='10' font-weight='700' fill='#1e90ff'>★</text>
    <!-- collar -->
    <path d='M60 140 Q100 150 140 140 Q140 148 100 154 Q60 148 60 140 Z' fill='#1e90ff' stroke='#0e5aa8' stroke-width='3'/>
  </g>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/**************** Commanders ****************/
const COMMANDERS = [
  { name: "Commander Barnaby", avatar: bearDataURL() }
];

/**************** Global Story + Backstory ****************/
function globalLore(lang = "en-GB"){
  if (lang.startsWith('fr')) {
    return (
      "Le monde a besoin d'Agent Evelyn. Des portails s'ouvrent, des tempêtes magnétiques brouillent nos cartes, " +
      "et des rivaux veulent capturer nos trésors naturels. L'Agence te charge de protéger la planète, de sauver ce qui compte, " +
      "et de guider la prochaine génération d'agents. Chaque mission est une pièce du grand puzzle."
    );
  }
  return (
    "The world needs Agent Evelyn. Strange portals flicker open, magnetic storms scramble our maps, " +
    "and rival operatives race to snatch Earth’s wonders. The Agency entrusts you to protect the planet, rescue what matters, " +
    "and light the path for the next generation. Every mission fits the bigger puzzle."
  );
}

// Always prefix as requested
function buildBackstory(task, commander, lang = "en-GB") {
  const prefix = lang.startsWith('fr')
    ? "Votre prochaine mission, Agent Evelyn, est "
    : "Your next mission, Agent Evelyn, is ";
  return `${commander.name}: ${prefix}${task}.`;
}

/**************** Phone Frame + Neon Border ****************/
function PhoneFrame({ children }) {
  return (
    <div className="min-h-screen bg-neutral-950 grid place-items-center p-4">
      <style>{`
        .phone { position: relative; width: 360px; height: 780px; max-width: 92vw; max-height: 90vh; background: #000; border-radius: 34px; box-shadow: 0 8px 40px rgba(0,0,0,0.6), inset 0 0 0 2px #111; overflow: hidden; }
        /* animated border dots (kept simple; no user choice) */
        .bulb { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 10px #22d3ee, 0 0 14px #ec4899, 0 0 10px #22c55e; opacity: .28; animation: bulbBlink 1.2s ease-in-out infinite; }
        @keyframes bulbBlink { 0%{ opacity:.2; transform: scale(1);} 50%{opacity:1; transform: scale(1.15);} 100%{opacity:.2; transform: scale(1);} }
        /* commander bob */
        .bob { animation: bob 2.4s ease-in-out infinite; transform-origin: 50% 100%; }
        @keyframes bob { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-6px) } }
        .titleBlock { text-transform: uppercase; letter-spacing: .35em; color: #67e8f9; text-shadow: 0 0 14px rgba(103,232,249,.9); font-weight: 800; font-size: 42px; }
        .subtitle { margin-top: -4px; font-family: cursive; color: #f472b6; text-shadow: 0 0 16px rgba(244,114,182,.95); font-size: 48px; }
        .btn { border-radius: 16px; padding: 12px 16px; font-weight: 700; }
      `}</style>
      <div className="phone">
        <NeonCircleBorder />
        <div className="absolute inset-0 text-white">{children}</div>
      </div>
    </div>
  );
}

function NeonCircleBorder() {
  const bulbs = [];
  const countTop = 36, countSide = 26;
  for (let i=0;i<countTop;i++) bulbs.push({ edge:'top', pos:i/(countTop-1) });
  for (let i=0;i<countTop;i++) bulbs.push({ edge:'bottom', pos:i/(countTop-1) });
  for (let i=0;i<countSide;i++) bulbs.push({ edge:'left', pos:i/(countSide-1) });
  for (let i=0;i<countSide;i++) bulbs.push({ edge:'right', pos:i/(countSide-1) });
  return (
    <div className="absolute inset-0 pointer-events-none">
      {bulbs.map((b, idx) => (
        <div
          key={idx}
          className="bulb"
          style={{
            top: b.edge==='top' ? 6 : b.edge==='bottom' ? undefined : `calc(${b.pos*100}% - 5px)`,
            bottom: b.edge==='bottom' ? 6 : undefined,
            left: b.edge==='left' ? 6 : b.edge==='right' ? undefined : `calc(${b.pos*100}% - 5px)`,
            right: b.edge==='right' ? 6 : undefined,
            animationDelay: `${idx*30}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**************** Screens ****************/
function Home({ onStart, onShowLore, onInstall, canInstall, xp }) {
  const level = xpToLevel(xp);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
      <div className="titleBlock">AGENT</div>
      <div className="subtitle">Evelyn</div>
      <div className="mt-2 text-xs text-zinc-400">Level {level} • XP {xp}</div>
      <div className="mt-6 grid gap-3 w-full">
        <button onClick={onStart} className="btn ripple bg-cyan-400 text-black">Create Mission</button>
        <button onClick={onShowLore} className="btn border border-zinc-700">Story</button>
        {canInstall && <button onClick={onInstall} className="btn bg-pink-500 text-black">Install App</button>}
      </div>
    </div>
  );
}

function Lore({ lang, onBack }){
  useEffect(()=>{ speak(globalLore(lang), { lang, rate: 1, pitch: 1.03 }); }, [lang]);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Agency Brief</div>
      <h2 className="text-xl font-bold">Why Agent Evelyn is Needed</h2>
      <div className="mt-3 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3 leading-relaxed">
        {globalLore(lang)}
      </div>
      <div className="mt-3 text-sm text-zinc-300">Every mission rescues, protects, and inspires. Ready to begin?</div>
      <button onClick={onBack} className="btn mt-auto bg-cyan-500 text-black">Back</button>
    </div>
  );
}

function Compose({ onCancel, onNext, rivalName, setRivalName }) {
  const [task, setTask] = useState("");
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Agent Evelyn Console • {today()}</div>
      <h2 className="mt-1 text-xl font-bold">Parent: Create Mission</h2>
      <label className="mt-4 text-sm text-zinc-300">What should the child do? (e.g., put on pyjamas and brush teeth)</label>
      <textarea value={task} onChange={(e)=>setTask(e.target.value)} rows={4} className="mt-2 rounded-xl bg-neutral-900 border border-zinc-700 p-3 outline-none" placeholder="Type the activity"/>
      <label className="mt-3 text-sm text-zinc-300">Optional rival agent name</label>
      <input value={rivalName} onChange={(e)=>setRivalName(e.target.value)} className="rounded-xl bg-neutral-900 border border-zinc-700 p-2 outline-none" placeholder="e.g., Agent Shadow"/>
      <div className="mt-auto grid grid-cols-2 gap-3">
        <button onClick={onCancel} className="btn border border-zinc-700">Back</button>
        <button onClick={()=>onNext(task.trim())} disabled={!task.trim()} className="btn bg-cyan-500 text-black disabled:opacity-50">Generate</button>
      </div>
    </div>
  );
}

function Approve({ mission, onEdit, onActivate }) {
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Review & Activate</div>

      <div className="flex items-start gap-3">
        <img alt="Commander bear" src={mission.commander.avatar} className="w-16 h-16 rounded-xl bob" />
        <div>
          <h2 className="text-xl font-bold">{mission.commander.name}</h2>
          <div className="text-sm text-zinc-300">Mission: {mission.task}</div>
        </div>
      </div>

      <div className="mt-3 text-sm text-zinc-300">What your child will hear:</div>
      <div className="mt-2 bg-neutral-900 border border-zinc-700 rounded-xl p-3 text-sm leading-relaxed">
        {mission.backstory}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2">
        <button onClick={onEdit} className="btn border border-zinc-700">Edit</button>
        <div />
        <button onClick={onActivate} className="btn bg-pink-500 text-black">Activate Mission</button>
      </div>
    </div>
  );
}

function Alert({ onAnswer, onDismiss, commander }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
      <img alt="Commander bear" src={commander.avatar} className="w-24 h-24 rounded-2xl bob" />
      <div className="mt-2 font-extrabold tracking-widest">INCOMING MISSION CALL</div>
      <div className="text-sm text-zinc-300 mt-1">from {commander.name}</div>
      <p className="text-zinc-300 text-sm mt-2">Tap to answer and receive your orders.</p>
      <button onClick={onAnswer} className="btn mt-5 w-full bg-pink-500 text-black">Answer</button>
      <button onClick={onDismiss} className="btn mt-2 w-full border border-zinc-700">Dismiss</button>
    </div>
  );
}

function Briefing({ mission, voiceCfg, onActivate }) {
  useEffect(() => { speak(mission.backstory, voiceCfg); }, [mission, voiceCfg]);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Mission Briefing</div>
      <div className="flex items-start gap-3">
        <img alt="Commander bear" src={mission.commander.avatar} className="w-14 h-14 rounded-xl bob" />
        <div>
          <div className="text-sm text-zinc-300">{mission.commander.name}</div>
          <h2 className="text-xl font-bold">Mission: {mission.task}</h2>
        </div>
      </div>
      <div className="mt-2 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3">{mission.backstory}</div>
      <button onClick={onActivate} className="btn mt-auto bg-cyan-500 text-black">Activate Mission</button>
    </div>
  );
}

/**************** Case File (photos + badges) ****************/
function TrophyRoom({ log, onClose }){
  const totalXP = log.length * XP_PER_MISSION; const level = xpToLevel(totalXP);
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Case File & Trophies</div>
      <div className="text-sm text-zinc-300">Level {level} • XP {totalXP}</div>
      <div className="grid gap-3 mt-3 overflow-auto" style={{maxHeight:'60vh'}}>
        {log.slice().reverse().map((e,idx)=> (
          <div key={idx} className="rounded-xl border border-zinc-700 p-3 bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="text-3xl" title="badge" style={{filter:'drop-shadow(0 0 6px rgba(255,255,255,.3))'}}>🏅</div>
              <div>
                <div className="font-bold text-emerald-400">Mission Complete</div>
                <div className="text-xs text-zinc-400">{e.date} • {e.task}</div>
              </div>
            </div>
            {e.photos?.length ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {e.photos.map((src,i)=> (
                  <img key={i} src={src} alt="case" className="w-full h-24 object-cover rounded-lg border border-zinc-700" />
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-400">No photos saved.</div>
            )}
          </div>
        ))}
        {log.length===0 && <div className="text-sm text-zinc-400">No missions yet. Complete one to earn a badge and save photos!</div>}
      </div>
      <button onClick={onClose} className="btn mt-auto border border-zinc-700">Back</button>
    </div>
  );
}

/**************** Settings (no PIN) ****************/
function Settings({ onClose, voiceCfg, setVoiceCfg, lang, setLang }){
  const [rate, setRate] = useState(voiceCfg.rate);
  const [pitch, setPitch] = useState(voiceCfg.pitch);
  function apply(){ setVoiceCfg(v => ({ ...v, rate, pitch })); onClose(); }
  return (
    <div className="h-full w-full flex flex-col px-5 py-6">
      <div className="text-xs text-zinc-400">Settings</div>
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
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <button onClick={apply} className="btn bg-cyan-500 text-black">Apply</button>
        <button onClick={onClose} className="btn border border-zinc-700">Close</button>
      </div>
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
          {["✨","🎉","⭐","💠","🔶","🔷"][Math.floor(Math.random()*6)]}
        </div>
      ))}
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: .9; } }`}</style>
    </div>
  );
}

/**************** App ****************/
export default function App() {
  useEffect(()=>{ installPWA(); }, []);

  const [phase, setPhase] = useState("home"); // home | lore | compose | approve | alert | briefing | active | success | trophies | settings
  const [mission, setMission] = useState(null);
  const [rivalName, setRivalName] = useState("Agent Shadow");
  const [log, setLog] = useState(loadLog());
  const totalXP = log.length * XP_PER_MISSION;

  // Commander for current mission
  const [commander] = useState(COMMANDERS[0]);

  // Voice config
  const [lang, setLang] = useState("en-GB");
  const [voiceCfg, setVoiceCfg] = useState({ rate: 1, pitch: 1.03, lang: "en-GB", voice: null });
  useEffect(()=>{ setVoiceCfg(v=>({ ...v, lang })); }, [lang]);

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
    const backstory = buildBackstory(trimmed, commander, lang);
    setMission({ task: trimmed, backstory, commander });
    setPhase("approve");
  }
  function handleActivateFromApprove(){ setPhase("alert"); }
  function handleAnswer(){ setPhase("briefing"); }
  function handleActivateFromBriefing(){
    speak(lang.startsWith('fr') ? "Mission activée" : "Mission activated", voiceCfg);
    setPhase("active");
  }
  function handleComplete(photos){
    const entry = { date: today(), task: mission.task, photos };
    const newLog = [...log, entry]; setLog(newLog); saveLog(newLog);
    setPhase("success");
  }
  function goHome(){ setMission(null); setPhase("home"); }

  return (
    <PhoneFrame>
      {/* Top bar actions */}
      <div className="absolute top-2 left-2 right-2 flex justify-between text-xs text-zinc-400">
        <button onClick={()=>setPhase("trophies")} className="btn border border-zinc-700">Case File</button>
        <div className="flex gap-2">
          <button onClick={()=>setPhase("settings")} className="btn border border-zinc-700">Settings</button>
        </div>
      </div>

      {phase === "home" && <Home onStart={toCompose} onShowLore={toLore} onInstall={handleInstall} canInstall={canInstall} xp={totalXP} />}
      {phase === "lore" && <Lore lang={lang} onBack={()=>setPhase("home")} />}
      {phase === "compose" && <Compose onCancel={goHome} onNext={handleGenerate} rivalName={rivalName} setRivalName={setRivalName} />}
      {phase === "approve" && mission && <Approve mission={mission} onEdit={()=>setPhase("compose")} onActivate={handleActivateFromApprove} />}
      {phase === "alert" && mission && <Alert onAnswer={handleAnswer} onDismiss={goHome} commander={mission.commander} />}
      {phase === "briefing" && mission && <Briefing mission={mission} voiceCfg={voiceCfg} onActivate={handleActivateFromBriefing} />}

      {phase === "active" && <ActiveMission mission={mission} onComplete={handleComplete} />}

      {phase === "success" && (
        <div className="h-full w-full flex flex-col items-center justify-center text-center px-6 relative">
          <Confetti />
          <div className="text-4xl">🏅</div>
          <div className="mt-2 text-xl font-bold">Mission Complete!</div>
          <div className="mt-2 text-sm bg-neutral-900 border border-zinc-700 rounded-xl p-3">Photos saved to Case File.</div>
          <button onClick={()=>setPhase("trophies")} className="btn mt-4 bg-cyan-500 text-black">Open Case File</button>
          <button onClick={goHome} className="btn mt-2 border border-zinc-700">Back to Home</button>
        </div>
      )}

      {phase === "trophies" && <TrophyRoom log={log} onClose={goHome} />}
      {phase === "settings" && <Settings onClose={goHome} voiceCfg={voiceCfg} setVoiceCfg={setVoiceCfg} lang={lang} setLang={setLang} />}
    </PhoneFrame>
  );
}

/**************** Active Mission (photos) ****************/
function ActiveMission({ mission, onComplete }){
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);

  function pickPhotos(){ inputRef.current?.click(); }
  function onFiles(e){
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // read each as dataURL
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setPhotos(p => [...p, reader.result]);
      reader.readAsDataURL(f);
    });
    // reset input so selecting same file again still fires change
    e.target.value = "";
  }

  return (
    <div className="h-full w-full flex flex-col items-center text-center px-6">
      <div className="mt-6 text-lg">Mission in progress…</div>
      <p className="text-zinc-300 text-sm mt-2">Take photos to add to the Case File.</p>

      <div className="mt-3 grid grid-cols-3 gap-2 w-full">
        {photos.map((src,i)=> (
          <img key={i} src={src} alt="captured" className="w-full h-24 object-cover rounded-lg border border-zinc-700" />
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onFiles}
      />

      <button onClick={pickPhotos} className="btn mt-5 w-full bg-pink-500 text-black">Take Photo</button>
      <button onClick={()=>onComplete(photos)} className="btn mt-2 w-full bg-emerald-400 text-black">Parent: Mark Complete</button>
    </div>
  );
}
