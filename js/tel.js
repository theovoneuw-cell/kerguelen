// Le téléphone : manuel de bord, détecteur de mouvement, et instruments demandés par l'écran.
import { Client } from "./net.js";

const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
function decode(s) {
  const b = Uint8Array.from(atob(s), c => c.charCodeAt(0)), k = new TextEncoder().encode("kerguelen-desolation-2131");
  for (let i = 0; i < b.length; i++) b[i] ^= k[i % k.length] ^ ((i * 13) & 255);
  return JSON.parse(new TextDecoder().decode(b));
}
const MANUEL = decode(window.__M);
const params = new URLSearchParams(location.search);
const code = params.get("s"), seul = params.has("seul");
let role = null, client = null, detecteurActif = false;
const norme = t => t.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z]/g, "");

// ——————————————————————————————————————————————— Manuel
let ouverts = [];
try { ouverts = JSON.parse(localStorage.getItem("krg-manuel") || "[]"); } catch (_) {}
function rendreManuel() {
  const z = $("#niveaux"); z.innerHTML = "";
  MANUEL.niveaux.forEach((n, i) => {
    const libre = !n.mot || ouverts.includes(i);
    const s = document.createElement("section"); s.className = "niveau" + (libre ? " ouvert" : "");
    s.innerHTML = `<h2>${n.titre}${n.mot ? `<span>${libre ? "ouvert" : "verrouillé"}</span>` : ""}</h2>` +
      (libre ? n.pages.map(p => `<details><summary>${p.titre}</summary><div class="page">${p.html}</div></details>`).join("")
        : `<form class="mdp"><input placeholder="Mot de passe" autocapitalize="characters" autocomplete="off" spellcheck="false"><button>Ouvrir</button></form>`);
    z.appendChild(s);
    const f = $("form", s);
    if (f) f.onsubmit = e => { e.preventDefault(); const v = norme($("input", f).value); if (v === n.mot) { ouverts.push(i); try { localStorage.setItem("krg-manuel", JSON.stringify(ouverts)); } catch (_) {} envoyer({ t: "manuel", niveau: i }); rendreManuel(); const d = $$(".niveau")[i].querySelector("details"); if (d) d.open = true; } else { $("input", f).value = ""; $("input", f).placeholder = "Refusé"; vibrer(80); } };
  });
}
rendreManuel();

// ——————————————————————————————————————————————— Vues
function vue(id) { $$(".vue").forEach(v => v.classList.toggle("on", v.id === id)); $$("#onglets button").forEach(b => b.setAttribute("aria-pressed", b.dataset.vue === id)); }
$$("#onglets button").forEach(b => b.onclick = () => vue(b.dataset.vue));
function choisirRole(r) {
  role = r;
  $("#tete").hidden = false; $("#onglets").hidden = r !== "deux";
  vue(r === "detecteur" ? "detecteur" : "manuel");
  envoyer({ t: "role", role: r });
}

// ——————————————————————————————————————————————— Liaison
function envoyer(m) { if (client) client.envoyer(m); }
function etatLiaison(ok) { const l = $("#liaison"); l.classList.toggle("ok", ok); $("span", l).textContent = ok ? "relié" : "hors liaison"; }
if (code && !seul) {
  client = new Client(code, {
    presentation: () => ({ role }),
    connecte: () => { etatLiaison(true); envoyer({ t: "perm", micro: !!micro, mouvement: mouvementOk }); if (role) envoyer({ t: "role", role }); },
    coupure: () => etatLiaison(false),
    message: recevoir
  });
}
function recevoir(d) {
  if (d.t === "etat") { detecteurActif = d.detecteur; majDetEtat(); }
  if (d.t === "det") { donneesDet = d; detecteurActif = d.actif; majDetEtat(); }
  if (d.t === "instrument") instrument(d);
}

// ——————————————————————————————————————————————— Permissions : micro, mouvements, écran allumé
let micro = null, analyseur = null, ctx = null, mouvementOk = false, verrouEcran = null;
async function activer() {
  const err = $("#debut-err"); err.textContent = "";
  // Sur iPhone, la permission des mouvements doit être demandée tout de suite dans le geste : après un await, iOS la refuse en silence
  // (c'est ce qui empêchait le détecteur de se taire face contre la table, et l'inclinaison du drone).
  const demandeMvt = typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission ? DeviceOrientationEvent.requestPermission().catch(() => "denied") : null;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch (_) {}
  try {
    micro = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = ctx.createMediaStreamSource(micro); analyseur = ctx.createAnalyser(); analyseur.fftSize = 2048; src.connect(analyseur);
  } catch (_) { err.textContent = "Micro refusé : les silences se joueront sans lui."; }
  try {
    if (demandeMvt) mouvementOk = (await demandeMvt) === "granted";
    else mouvementOk = "DeviceOrientationEvent" in window;
  } catch (_) { mouvementOk = false; }
  if (mouvementOk) window.addEventListener("deviceorientation", orientation);
  try { verrouEcran = await navigator.wakeLock.request("screen"); } catch (_) {}
  envoyer({ t: "perm", micro: !!micro, mouvement: mouvementOk });
}
document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && verrouEcran !== null) { try { verrouEcran = await navigator.wakeLock.request("screen"); } catch (_) {} } });
$$("[data-role]").forEach(b => b.onclick = async () => { await activer(); choisirRole(b.dataset.role); });
function vibrer(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

// ——————————————————————————————————————————————— Orientation : face contre table, drone
// Le détecteur se tait face contre la table, ou tant qu'un doigt reste posé sur l'écran (la main sur le haut-parleur).
let face = false, posFace = false, doigt = false, incl = { g: 0, b: 0 }, droneOn = false, dernierIncl = 0;
function majFace() { const muet = posFace || doigt; if (muet !== face) { face = muet; envoyer({ t: "face", bas: muet }); majDetEtat(); } }
const toucher = e => { doigt = e.touches.length > 0; majFace(); };
["touchstart", "touchend", "touchcancel"].forEach(ev => document.addEventListener(ev, toucher, { passive: true }));
function orientation(e) {
  const b = e.beta || 0, g = e.gamma || 0;
  incl = { g, b };
  posFace = Math.abs(b) > 150; majFace();
  if (droneOn) {
    const t = performance.now(); if (t - dernierIncl > 100) { dernierIncl = t; envoyer({ t: "incl", g, b }); }
    const bulle = $("#bulle"); bulle.style.transform = `translate(${Math.max(-1, Math.min(1, g / 35)) * 70}px, ${Math.max(-1, Math.min(1, b / 35)) * 70}px)`;
    $("#drone-ordre").textContent = g < -18 ? "← gauche" : g > 18 ? "droite →" : b < -18 ? "↑ avancer" : b > 26 ? "↓ reculer" : "";
  }
}

// ——————————————————————————————————————————————— Micro : niveau, silence, souffle
const tampon = new Float32Array(2048);
let historique = [], silenceOn = false, seuil = -40, depasses = 0, souffleOn = false, souffleFrames = 0, essaiFin = 0;
function niveau() { if (!analyseur) return -90; analyseur.getFloatTimeDomainData(tampon); let s = 0; for (let i = 0; i < tampon.length; i++) s += tampon[i] * tampon[i]; return 20 * Math.log10(Math.sqrt(s / tampon.length) + 1e-9); }
function fond() { const t = [...historique].sort((a, b) => a - b); return t.length ? t[Math.floor(t.length * .3)] : -60; }
setInterval(() => {
  if (!analyseur) return;
  const db = niveau();
  if (!silenceOn) { historique.push(db); if (historique.length > 60) historique.shift(); }
  let depasse = false;
  if (silenceOn) {
    if (db > seuil) depasses++; else depasses = 0;
    depasse = depasses >= 3;
    $("#silence-niveau").style.width = Math.max(0, Math.min(100, (db + 80) * 1.25)) + "%";
    if (depasse) vibrer(200);
  }
  if (souffleOn) {
    if (db > Math.max(fond() + 22, -32)) { souffleFrames++; envoyer({ t: "souffle", force: .06 }); } else souffleFrames = Math.max(0, souffleFrames - 1);
    $("#souffle-jauge").style.width = Math.min(100, souffleFrames * 6) + "%";
  }
  envoyer({ t: "niveau", db: Math.round(db), depasse });
}, 100);

// ——————————————————————————————————————————————— Instruments demandés par l'écran
function instrument(d) {
  const ins = $("#instrument");
  const montrer = (cls, on) => { $$(".instrument > div").forEach(x => x.hidden = !x.classList.contains(cls) || !on); ins.hidden = !$$(".instrument > div").some(x => !x.hidden); };
  if (d.nom === "pouce") { montrer("ins-pouce", d.on); pouceCompte = 0; $("#pouce-compte").textContent = ""; }
  if (d.nom === "souffle") { souffleOn = !!d.on; souffleFrames = 0; montrer("ins-souffle", d.on); }
  if (d.nom === "drone") { droneOn = !!d.on; montrer("ins-drone", d.on); if (!mouvementOk) $("#drone-ordre").textContent = "Mouvements non autorisés : utilisez les boutons de l'écran."; }
  if (d.nom === "uv" && !d.on) fermerCamera();
  if (d.nom === "silence") {
    silenceOn = !!d.on; depasses = 0;
    seuil = Math.max(fond() + 14, -58);
    $("#silence-seuil").style.left = Math.max(0, Math.min(100, (seuil + 80) * 1.25)) + "%";
    montrer("ins-silence", d.on); document.body.classList.toggle("en-silence", silenceOn);
    $("#sil-det").hidden = !(silenceOn && detecteurActif && (role === "detecteur" || role === "deux"));
  }
}
// Pouce
let pouceCompte = 0;
(function pad() {
  const p = $("#pad"); let t0 = 0, raf = 0;
  const charge = $(".charge", p), L = 2 * Math.PI * 54; charge.style.strokeDasharray = L; charge.style.strokeDashoffset = L;
  const stop = () => { cancelAnimationFrame(raf); t0 = 0; charge.style.strokeDashoffset = L; p.classList.remove("appui"); };
  const boucle = () => { const k = (performance.now() - t0) / 2600; charge.style.strokeDashoffset = L * (1 - Math.min(1, k)); if (k >= 1) { stop(); pouceCompte++; envoyer({ t: "pouce" }); vibrer(60); $("#pouce-compte").textContent = `Empreinte ${pouceCompte} enregistrée. Au suivant.`; return; } raf = requestAnimationFrame(boucle); };
  p.addEventListener("pointerdown", e => { e.preventDefault(); t0 = performance.now(); p.classList.add("appui"); vibrer(20); boucle(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => p.addEventListener(ev, stop));
})();

// ——————————————————————————————————————————————— Caméra UV
let fluxCam = null, rafCam = 0;
$("#b-uv").onclick = async () => {
  try { fluxCam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false }); }
  catch (_) { $("#drone-ordre").textContent = "Caméra refusée."; return; }
  const v = $("#flux"); v.srcObject = fluxCam; await v.play();
  $("#camera").hidden = false; envoyer({ t: "uv", on: true });
  const c = $("#uv"), g = c.getContext("2d", { willReadFrequently: true });
  const boucle = () => {
    if (!fluxCam) return;
    const w = 360, h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)); c.width = w; c.height = h;
    g.drawImage(v, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data, lum = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) lum[j] = (d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 2) / 10;
    // On étire l'histogramme entre les percentiles 5 et 99,5 : les écarts invisibles deviennent visibles.
    const hist = new Uint32Array(256); for (const x of lum) hist[x]++;
    let acc = 0, lo = 0, hi = 255; const n = lum.length;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc < n * .05) lo = k; if (acc < n * .995) hi = k; }
    const e = 255 / Math.max(4, hi - lo);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { const y = Math.max(0, Math.min(255, (lum[j] - lo) * e)); const k = Math.pow(y / 255, 1.6) * 255; d[i] = k * .78; d[i + 1] = k * .6; d[i + 2] = Math.min(255, k * 1.15 + 18); }
    g.putImageData(im, 0, 0);
    rafCam = requestAnimationFrame(boucle);
  };
  boucle();
};
function fermerCamera() { cancelAnimationFrame(rafCam); if (fluxCam) { fluxCam.getTracks().forEach(t => t.stop()); fluxCam = null; envoyer({ t: "uv", on: false }); } $("#camera").hidden = true; }
$("#cam-fermer").onclick = fermerCamera;

// ——————————————————————————————————————————————— Détecteur
let donneesDet = { actif: false, blips: [], cadence: 0 }, ang = 0, prochainBip = 0;
function majDetEtat() {
  const e = $("#det-etat");
  if (!detecteurActif) e.textContent = "Pas de batterie.";
  else if (face) e.textContent = doigt ? "Étouffé : silencieux." : "Face contre table : silencieux.";
  else e.textContent = donneesDet.cadence ? (donneesDet.cadence < 500 ? "Très proche." : donneesDet.cadence < 1200 ? "Mouvement." : "Mouvement lointain.") : "Rien.";
  document.body.classList.toggle("det-actif", detecteurActif);
}
function bip(f = 1180, d = .07) { if (!ctx || face) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + .02); }
(function radar() {
  const c = $("#radar"), g = c.getContext("2d"), W = c.width, R = W / 2 - 20;
  const dessin = () => {
    g.clearRect(0, 0, W, W);
    if (detecteurActif) {
      g.save(); g.translate(W / 2, W / 2);
      g.strokeStyle = "rgba(124,242,154,.28)"; g.lineWidth = 2;
      [1, .66, .33].forEach(r => { g.beginPath(); g.arc(0, 0, R * r, 0, 7); g.stroke(); });
      g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
      ang = (ang + .045) % (Math.PI * 2);
      const grad = g.createConicGradient ? g.createConicGradient(ang - Math.PI / 2 - .6, 0, 0) : null;
      if (grad) { grad.addColorStop(0, "rgba(124,242,154,0)"); grad.addColorStop(.095, "rgba(124,242,154,.28)"); grad.addColorStop(.1, "rgba(124,242,154,0)"); g.fillStyle = grad; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); }
      (donneesDet.blips || []).forEach(b => { const x = Math.sin(b.a) * R * b.d, y = -Math.cos(b.a) * R * b.d; const rg = g.createRadialGradient(x, y, 0, x, y, 30); rg.addColorStop(0, "rgba(200,255,214,1)"); rg.addColorStop(1, "rgba(124,242,154,0)"); g.fillStyle = rg; g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill(); });
      g.restore();
      if (donneesDet.cadence && performance.now() > prochainBip) { prochainBip = performance.now() + donneesDet.cadence; bip(donneesDet.cadence < 500 ? 1320 : 1180); if (donneesDet.cadence < 500) vibrer(30); }
    }
    requestAnimationFrame(dessin);
  };
  dessin();
})();

// Mode sans écran relié : le manuel seul
if (seul || !code) { $("#debut").classList.remove("on"); choisirRole("manuel"); $("#onglets").hidden = true; $("#liaison").hidden = true; }
