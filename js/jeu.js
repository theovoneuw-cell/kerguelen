// Le moteur de l'écran commun : partie, temps, bruit, bête, téléphones, enquête, récit.
import { Hote, nouveauCode, lienTelephone } from "./net.js";

// ——— Données (encodées pour ne rien divulgâcher dans le dépôt public)
function decode(s) {
  const b = Uint8Array.from(atob(s), c => c.charCodeAt(0)), k = new TextEncoder().encode("kerguelen-desolation-2131");
  for (let i = 0; i < b.length; i++) b[i] ^= k[i % k.length] ^ ((i * 13) & 255);
  return JSON.parse(new TextDecoder().decode(b));
}
const J = decode(window.__D);
Son.init(J);
const AD = Son.AD;
const RACINE = document.body.dataset.racine || "";
const VIDEOS = new Set(window.__VIDEOS || []);
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CLE_SAUVE = "kerguelen-partie-v1";
const MIN = 60000;

// ——————————————————————————————————————————————— État
let S = null;
function neuf(noms) {
  return { noms, chap: 0, lieu: "sas", precedent: null, ouverts: [], main: [], defausse: [], flags: {}, restant: 90 * MIN, autod: null,
    bruit: 0, bruitMax: 0, rencontres: 0, indices: {}, journal: [], bete: { pos: "condB", active: false, prochain: 30000 }, etape: "jeu", nouv: [], annonces: {}, vus: {} };
}
const sauver = () => { if (!S) return; try { localStorage.setItem(CLE_SAUVE, JSON.stringify(S)); } catch (_) {} };
const charger = () => { try { return JSON.parse(localStorage.getItem(CLE_SAUVE)); } catch (_) { return null; } };
const carte = n => J.CARTES[n];
const enMain = n => S.main.includes(+n);
const lieu = id => J.LIEUX[id];
const chap = () => J.CHAPITRES[S.chap];
const nbJoueurs = () => Math.max(2, S.noms.filter(Boolean).length);

// ——————————————————————————————————————————————— Écrans, billets, toasts
function ecran(id) { $$(".ecran").forEach(e => e.classList.toggle("actif", e.id === id)); document.body.classList.toggle("sur-titre", id === "titre"); majDetecteurEcran(); }
let tToast;
function toast(t, ms = 3200) { const el = $("#toast"); el.innerHTML = t; el.classList.add("visible"); clearTimeout(tToast); tToast = setTimeout(() => el.classList.remove("visible"), ms); }
const file = []; let billetOuvert = false, apres = [];
function billet(html) { file.push(html); if (!billetOuvert) suivantBillet(); }
function suivantBillet() {
  const m = $("#m-billet");
  if (!file.length) { m.hidden = true; billetOuvert = false; const f = apres; apres = []; f.forEach(x => x()); return; }
  billetOuvert = true; $("#billet-texte").innerHTML = file.shift(); m.hidden = false; $("#billet-ok").focus();
}
function quandBilletsFinis(f) { if (!billetOuvert && !file.length) f(); else apres.push(f); }
$("#billet-ok").onclick = suivantBillet;
function flash(couleur = "#fff") { const f = $("#flash"); f.style.background = couleur; f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); }

// ——————————————————————————————————————————————— Téléphones
const tels = new Map(); // id → { role, micro, mouvement, face, db, depasse }
let hote = null, codeSalle = null, sansTel = false;
function ouvrirLiaison() {
  if (hote) return;
  codeSalle = nouveauCode();
  hote = new Hote(codeSalle, {
    arrivee: (id, d) => { tels.set(id, { role: d.role || null, micro: false, mouvement: false, face: false, db: -90, depasse: false }); majTels(); envoyerEtat(id); },
    depart: id => { tels.delete(id); majTels(); },
    message: (id, d) => recevoir(id, d),
    erreur: () => {}
  });
  const url = lienTelephone(codeSalle);
  $("#url-tel").textContent = url.replace(/^https?:\/\//, "");
  $("#menu-url").textContent = url.replace(/^https?:\/\//, "");
  $("#qr").innerHTML = ""; new QRCode($("#qr"), { text: url, width: 180, height: 180, colorDark: "#000", colorLight: "#fff", correctLevel: QRCode.CorrectLevel.M });
}
function majTels() {
  const ul = $("#liste-tels"); if (!ul) return;
  ul.innerHTML = tels.size ? [...tels.values()].map((t, i) => `<li><b>Téléphone ${i + 1}</b> · ${({ manuel: "Manuel", detecteur: "Détecteur", deux: "Manuel + Détecteur" })[t.role] || "choisit son rôle…"} · micro ${t.micro ? "autorisé" : "non autorisé"} · mouvements ${t.mouvement ? "autorisés" : "non autorisés"}</li>`).join("") : `<li class="vide">Aucun téléphone pour l'instant.</li>`;
  $("#essai-micro").hidden = ![...tels.values()].some(t => t.micro);
  majDetecteurEcran();
}
function recevoir(id, d) {
  const t = tels.get(id); if (!t) return;
  switch (d.t) {
    case "role": t.role = d.role; majTels(); envoyerEtat(id); break;
    case "perm": t.micro = !!d.micro; t.mouvement = !!d.mouvement; majTels(); break;
    case "niveau": t.db = d.db; t.depasse = d.depasse; if ($("#essai-micro") && !$("#essai-micro").hidden) $("#jauge-micro").style.width = Math.max(0, Math.min(100, (d.db + 80) * 1.4)) + "%"; if (silenceEnCours && d.depasse) silenceEnCours.bruit(); break;
    case "face": t.face = !!d.bas; break;
    case "manuel": if (S) { S.flags["manuel" + d.niveau] = true; if (d.niveau >= 2) S.flags.fulmar = true; sauver(); } break;
    default: Mecas.message && Mecas.message(id, d);
  }
}
const telsDet = () => [...tels.entries()].filter(([, t]) => t.role === "detecteur" || t.role === "deux");
function envoyerEtat(id) {
  if (!hote) return;
  const m = { t: "etat", detecteur: !!(S && S.flags.detecteur), chap: S ? S.chap : -1, noms: S ? S.noms : [] };
  if (id) hote.envoyer(id, m); else hote.diffuser(m);
}
function instrument(nom, params = {}, cible = null) {
  if (!hote) return 0;
  const ids = cible ? [cible] : [...tels.keys()];
  ids.forEach(id => hote.envoyer(id, { t: "instrument", nom, ...params }));
  return ids.length;
}
const aDesTels = () => tels.size > 0;
const telAvecMicro = () => [...tels.values()].some(t => t.micro);
const telAvecMouvement = () => [...tels.entries()].find(([, t]) => t.mouvement);

// ——————————————————————————————————————————————— Temps
let dernier = performance.now(), enPause = false;
const tableActive = () => $("#table").classList.contains("actif");
function fmt(ms) { ms = Math.max(0, ms); const m = Math.floor(ms / MIN), s = Math.floor(ms % MIN / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
setInterval(() => {
  const t = performance.now(), dt = Math.min(1000, t - dernier); dernier = t;
  if (!S || S.etape !== "jeu" || enPause || document.hidden) return;
  const actif = tableActive() || !$("#speciale").hidden;
  if (!actif) return;
  if (S.autod) {
    S.autod.restant -= dt; S.autod.ecoule += dt;
    if (!S.autod.dix && S.autod.restant <= 10 * MIN) { S.autod.dix = true; Son.voix("VIGIE_24"); }
    if (!S.autod.override && S.autod.ecoule >= 11 * MIN) { S.autod.override = true; Mecas.override(api()); }
    if (S.autod.restant <= 0 && !S.flags.reacteurOk) { S.autod.restant = 0; fin(S.flags.lancee ? "gateway" : "silence"); return; }
  } else if (tableActive()) {
    S.restant -= dt;
    for (const [min, code] of [[60, "VIGIE_07"], [45, "VIGIE_08"], [30, "VIGIE_09"], [15, "VIGIE_10"], [5, "VIGIE_11"]])
      if (S.restant <= min * MIN && !S.annonces[code]) { S.annonces[code] = true; if (S.restant > (min - 1) * MIN) Son.voix(code); }
    if (S.restant <= 0) { fin("gateway"); return; }
  }
  // Le bruit retombe doucement.
  S.bruit = Math.max(0, S.bruit - dt / 1000 * 1.4);
  // Le détecteur face visible fait du bruit quand la bête est proche.
  const dist = distanceBete();
  if (S.flags.detecteur && S.bete.active && dist <= 1 && detecteurAudible()) ajouterBruit(dt / 1000 * 3, true);
  // La bête se déplace.
  if (S.bete.active && !silenceEnCours && tableActive() && !rencontreEnCours) {
    S.bete.prochain -= dt * (1 + S.bruit / 60);
    if (S.bete.prochain <= 0) { S.bete.prochain = 16000 + Math.random() * 16000; deplacerBete(); }
  }
  majHaut();
  if (Math.floor(t / 250) % 2 === 0) envoyerDetecteur();
  if (t % 8000 < 300) sauver();
}, 250);
document.addEventListener("visibilitychange", () => { dernier = performance.now(); if (document.hidden) sauver(); });
function retirerTemps(min, raison) { if (S.autod) return; S.restant -= min * MIN; if (raison) toast(raison); majHaut(); }

// ——————————————————————————————————————————————— Bruit
function ajouterBruit(n, discret) {
  S.bruit = Math.min(100, S.bruit + n); S.bruitMax = Math.max(S.bruitMax, S.bruit);
  if (!discret && n >= 8) { $(".bruit").classList.remove("pique"); void $(".bruit").offsetWidth; $(".bruit").classList.add("pique"); }
  majHaut();
}

// ——————————————————————————————————————————————— La bête
function chemin(de, a, filtre = () => true) {
  if (de === a) return [de];
  const prev = { [de]: null }, file = [de];
  while (file.length) {
    const x = file.shift();
    for (const v of lieu(x).voisins) {
      if (v in prev || !filtre(v)) continue;
      prev[v] = x; if (v === a) { const c = [a]; let y = x; while (y) { c.unshift(y); y = prev[y]; } return c; }
      file.push(v);
    }
  }
  return null;
}
const peutAllerBete = v => lieu(v).bete && (S.chap >= 5 || !["coursiveD", "machines", "soute"].includes(v) || S.chap === 5);
function distanceBete() {
  if (!S || !S.bete.active && !S.flags.detecteur) return 9;
  const c = chemin(S.lieu, S.bete.pos); return c ? c.length - 1 : 9;
}
function deplacerBete() {
  if (S.bete.fixe) return;
  const p = S.bete.pos, voisins = lieu(p).voisins.filter(peutAllerBete);
  if (!voisins.length) return;
  const versJoueurs = Math.random() < 0.14 + S.bruit / 100 * 0.7;
  let suivant;
  if (versJoueurs) { const c = chemin(p, S.lieu, v => peutAllerBete(v) || v === S.lieu); suivant = c && c[1]; }
  if (!suivant) { const choix = voisins.filter(v => v !== S.lieu || S.bruit > 70); suivant = choix[Math.floor(Math.random() * choix.length)]; }
  if (!suivant) return;
  if (suivant === S.lieu) { approche(); return; }
  S.bete.pos = suivant;
  const d = distanceBete();
  if (d === 1) Son.jouer(lieu(suivant).cache ? (Math.random() < .5 ? "BETE_RACLE" : "BETE_COURSE") : "BETE_CLICS");
  if (d <= 2 && lieu(suivant).pont === "C" && !S.vus["annonceC" + S.chap] && S.chap >= 1) { S.vus["annonceC" + S.chap] = true; Son.voix("VIGIE_12"); }
}
async function approcheAffut() {
  const ok = await silence({ duree: 15000 });
  if (!ok) rencontre(); else toast("Elle n'a rien entendu. Elle est toujours là, à côté.", 3600);
}
async function approche() {
  const ok = await silence({ duree: 16000 + Math.random() * 8000, raison: "approche" });
  if (ok) {
    const autres = lieu(S.lieu).voisins.filter(v => peutAllerBete(v) && v !== S.bete.pos);
    if (autres.length) S.bete.pos = autres[Math.floor(Math.random() * autres.length)];
    S.bruit = Math.max(0, S.bruit - 30); S.bete.prochain = 25000;
  } else rencontre();
}

// ——————————————————————————————————————————————— Le silence réel
let silenceEnCours = null;
function silence({ duree = 18000, raison = "", video = null, avant = null } = {}) {
  if (window.__rapide) duree = Math.min(duree, 1500);
  return new Promise(fin => {
    if (silenceEnCours) { fin(true); return; }
    const el = $("#silence"), jauge = $("#silence-jauge");
    let bruits = 0, fini = false;
    const micros = telAvecMicro();
    $("#silence-micro").textContent = micros ? "Les micros écoutent la pièce." : (aDesTels() ? "Aucun téléphone n'a autorisé le micro : ne touchez à rien, ne parlez pas." : "Ne touchez à rien.");
    el.classList.toggle("avec-video", !!video);
    el.querySelector(".silence-media") && el.querySelector(".silence-media").remove();
    if (video) { const m = media(video, { boucle: true }); m.classList.add("silence-media"); el.prepend(m); }
    el.hidden = false; requestAnimationFrame(() => el.classList.add("on"));
    Son.silence(true); Son.couperVoix();
    instrument("silence", { on: true, duree });
    const debut = performance.now();
    const passes = setInterval(() => { if (Math.random() < .5) Son.jouer(Math.random() < .5 ? "BETE_CLICS" : "BETE_RESPIRE"); }, 4200);
    Son.jouer("BETE_PASSE");
    const anim = setInterval(() => { jauge.style.width = Math.min(100, (performance.now() - debut) / duree * 100) + "%"; }, 100);
    const trahi = () => { if (fini) return; bruits++; if (bruits >= 1) terminer(false); };
    const clavier = e => { if (["Shift", "Meta", "Alt", "Control"].includes(e.key)) return; trahi(); };
    const clic = e => { e.preventDefault(); e.stopPropagation(); trahi(); };
    document.addEventListener("keydown", clavier, true); el.addEventListener("pointerdown", clic);
    silenceEnCours = { bruit: trahi };
    const t = setTimeout(() => terminer(true), duree);
    function terminer(ok) {
      if (fini) return; fini = true; clearTimeout(t); clearInterval(passes); clearInterval(anim);
      document.removeEventListener("keydown", clavier, true); el.removeEventListener("pointerdown", clic);
      silenceEnCours = null; instrument("silence", { on: false }); Son.silence(false);
      if (ok) { el.classList.remove("on"); setTimeout(() => { el.hidden = true; }, 700); toast("Elle s'éloigne.", 2600); }
      else { el.classList.remove("on"); el.hidden = true; }
      fin(ok);
    }
  });
}

// ——————————————————————————————————————————————— Rencontres
let rencontreEnCours = false;
async function rencontre({ fuir = true } = {}) {
  if (rencontreEnCours) return; rencontreEnCours = true;
  S.rencontres++;
  const el = $("#rencontre"); el.innerHTML = "";
  const m = media(VIDEOS.has("v-rencontre") ? "v-rencontre" : null, { image: "b-tete" }); el.appendChild(m);
  el.hidden = false; flash("#fff"); Son.jouer("BETE_CRI"); document.body.classList.add("secousse");
  await attendre(VIDEOS.has("v-rencontre") ? 3800 : 1600);
  document.body.classList.remove("secousse"); el.hidden = true; el.innerHTML = "";
  S.bruit = 0; retirerTemps(3);
  if (S.rencontres >= 3) { rencontreEnCours = false; fin("silence"); return; }
  if (fuir && S.precedent && S.precedent !== S.lieu) { S.lieu = S.precedent; S.precedent = null; }
  const loin = Object.keys(J.LIEUX).filter(v => peutAllerBete(v) && (chemin(S.lieu, v) || []).length > 3);
  if (loin.length) S.bete.pos = loin[Math.floor(Math.random() * loin.length)];
  S.bete.prochain = 40000;
  rendu(); sauver(); rencontreEnCours = false;
  billet(S.rencontres === 1 ? "Elle était là. Vous avez fui sans savoir comment, sans vous retourner, et vous vous êtes arrêtés quand vos jambes n'ont plus voulu.<br><br><b>Première rencontre.</b> Il n'y en aura pas beaucoup d'autres." : "Encore elle. Plus près, cette fois. Vous avez senti son souffle.<br><br><b>Deuxième rencontre.</b> Elle connaît votre odeur, maintenant. Elle ne vous lâchera plus.");
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

// ——————————————————————————————————————————————— Détecteur
function detecteurAudible() {
  const dets = telsDet();
  if (dets.length) return dets.some(([, t]) => !t.face);
  return !detEcranRetourne;
}
function donneesDetecteur() {
  if (!S || !S.flags.detecteur) return { actif: false };
  const [x0, y0] = lieu(S.lieu).pos, [x1, y1] = lieu(S.bete.pos).pos, d = distanceBete();
  const ang = Math.atan2(x1 - x0, -(y1 - y0));
  const visible = S.bete.active || d <= 3;
  return { actif: true, blips: visible && d <= 3 ? [{ a: ang, d: Math.min(1, (d + .3) / 3.6) }] : [], cadence: visible ? ({ 0: 280, 1: 420, 2: 900, 3: 1700 })[d] || 0 : 0 };
}
function envoyerDetecteur() {
  if (!S) return;
  const dd = donneesDetecteur();
  telsDet().forEach(([id]) => hote.envoyer(id, { t: "det", ...dd }));
  dessinerDetEcran(dd);
}
let detEcranRetourne = false;
function majDetecteurEcran() { $("#det-ecran").hidden = !(S && S.flags.detecteur && !telsDet().length && tableActive()); }
$("#det-retourner").onclick = () => { detEcranRetourne = !detEcranRetourne; $("#det-retourner").textContent = detEcranRetourne ? "Remettre à l'endroit" : "Retourner"; $("#det-ecran").classList.toggle("retourne", detEcranRetourne); };
let balayage = 0, prochainBip = 0;
function dessinerDetEcran(dd) {
  const box = $("#det-ecran"); if (box.hidden) return;
  const c = box.querySelector("canvas"), g = c.getContext("2d"), W = c.width, R = W / 2 - 6;
  g.clearRect(0, 0, W, W); g.save(); g.translate(W / 2, W / 2);
  g.strokeStyle = "rgba(124,242,154,.35)"; [1, .66, .33].forEach(r => { g.beginPath(); g.arc(0, 0, R * r, 0, 7); g.stroke(); });
  balayage = (balayage + .25) % (Math.PI * 2);
  g.strokeStyle = "rgba(124,242,154,.8)"; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(balayage) * R, -Math.cos(balayage) * R); g.stroke();
  (dd.blips || []).forEach(b => { g.fillStyle = "#b8ffc8"; g.beginPath(); g.arc(Math.sin(b.a) * R * b.d, -Math.cos(b.a) * R * b.d, 6, 0, 7); g.fill(); });
  g.restore();
  if (dd.cadence && performance.now() > prochainBip && !detEcranRetourne) { prochainBip = performance.now() + dd.cadence; Son.bips([[1200]], { duree: .07 }); }
}

// ——————————————————————————————————————————————— Effets
function effets(liste) {
  (liste || []).forEach(e => {
    if (e.son) Son.jouer(e.son);
    if (e.sursaut) { Son.jouer(e.sursaut); flash("#fff"); document.body.classList.add("secousse"); setTimeout(() => document.body.classList.remove("secousse"), 500); }
    if (e.defausser) e.defausser.forEach(defausser);
    if (e.reveler) e.reveler.forEach(reveler);
    if (e.flag) S.flags[e.flag] = true;
    if (e.bruit) ajouterBruit(e.bruit);
    if (e.temps) retirerTemps(-e.temps);
    if (e.texte) billet(e.texte);
    if (e.voix) { if (e.plusTard) quandBilletsFinis(() => interphone([e.voix])); else interphone([e.voix]); }
    if (e.detecteur) { S.flags.detecteur = true; envoyerEtat(); majDetecteurEcran(); }
    if (e.porteSas) ouvrirPorteSas();
    if (e.grille) ouvrirGrille();
  });
  rendu(); sauver();
}
function reveler(n) { n = +n; if (enMain(n)) return; S.defausse = S.defausse.filter(x => x !== n); S.main.push(n); S.nouv.push(n); }
function defausser(n) { n = +n; if (!enMain(n)) return; S.main = S.main.filter(x => x !== n); S.defausse.push(n); if (carteOuverte === n) fermerCarte(); }

// ——————————————————————————————————————————————— Interphone
let fileInterphone = Promise.resolve();
function interphone(codes, { journal = true } = {}) {
  fileInterphone = fileInterphone.then(async () => {
    Son.jouer("SFX_INTERPHONE"); await attendre(AD ? 300 : 500);
    for (const c of codes) {
      if (journal && !S.journal.includes(c) && J.VOIX[c] && !c.startsWith("VIGIE")) S.journal.push(c);
      await Son.voix(c);
    }
  });
  return fileInterphone;
}

// ——————————————————————————————————————————————— Rendu de la table
function majHaut() {
  if (!S) return;
  const c = chap();
  $("#chap-num").textContent = c.num; $("#chap-titre").textContent = c.titre;
  $("#objectif").textContent = S.objectif || c.objectif;
  $("#chrono").textContent = S.autod ? fmt(S.autod.restant) : fmt(S.restant);
  $("#chrono").classList.toggle("autod", !!S.autod);
  $("#chrono").classList.toggle("urgent", (S.autod ? S.autod.restant : S.restant) < 5 * MIN);
  $("#bruit").style.width = S.bruit + "%";
  $(".bruit").classList.toggle("haut", S.bruit > 60);
  $$("#rencontres i").forEach((i, k) => i.classList.toggle("plein", k < S.rencontres));
}
function rendu() {
  if (!S) return;
  majHaut(); renduScene(); renduMain(); majDetecteurEcran();
  $("#b-dossier").hidden = !S.flags.dossier;
}
function renduMain() {
  const zone = $("#cartes"); zone.innerHTML = "";
  S.main.forEach(n => zone.appendChild(elCarte(n)));
  $("#n-main").textContent = S.main.length;
  // Aperçu du sac dans la barre du bas ; le grand inventaire ne s'ouvre que par le bouton « Ramassé ».
  const mini = $("#mini-sac"); mini.innerHTML = "";
  S.main.forEach(n => {
    const c = carte(n), img = imageCarte(n), b = document.createElement("button");
    b.className = "mini-carte" + (S.nouv.includes(n) ? " nouvelle" : ""); b.title = `${n} · ${c.titre.replace(/<[^>]+>/g, "")}`;
    b.innerHTML = `<span class="mi-img${img ? "" : " vide"}"${img ? ` style="background-image:url('${img}')"` : ""}></span><span class="mi-num">${n}</span>`;
    b.onclick = () => ouvrirCarte(n);
    mini.appendChild(b);
  });
  if (S.nouv.length) { $("#b-main").classList.remove("nouvelle"); void $("#b-main").offsetWidth; $("#b-main").classList.add("nouvelle"); mini.scrollLeft = mini.scrollWidth; }
  S.nouv = [];
}
function ouvrirMain(on) {
  $("#main-joueur").classList.toggle("ouvert", on); document.body.classList.toggle("main-ouverte", on);
  if (on) $("#b-main").classList.remove("nouvelle");
  $("#b-main").setAttribute("aria-expanded", on);
}
$("#b-main").onclick = () => ouvrirMain(!$("#main-joueur").classList.contains("ouvert"));
$("#main-fermer").onclick = () => ouvrirMain(false);
$("#scene-boite").addEventListener("pointerdown", () => ouvrirMain(false));

// ——— Plein écran (sans la barre du navigateur)
function pleinEcran() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } }
}
$$(".b-plein").forEach(b => b.onclick = pleinEcran);
["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => {
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle("plein", on);
  $$(".b-plein").forEach(b => { b.title = on ? "Quitter le plein écran (F)" : "Plein écran (F)"; b.setAttribute("aria-label", on ? "Quitter le plein écran" : "Plein écran"); });
}));
document.addEventListener("keydown", e => {
  if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !silenceEnCours) pleinEcran();
});
function imageCarte(n) { const c = carte(n); return c.image ? `${RACINE}img/${c.image}.jpg` : null; }
const ICONE = { meca: "⚙", preuve: "◆", texte: "≡", objet: "" };
function elCarte(n) {
  const c = carte(n), el = document.createElement("div");
  el.className = `carte ${c.type}` + (S.nouv.includes(n) ? " nouvelle" : "");
  el.dataset.n = n;
  const img = imageCarte(n);
  el.innerHTML = `<span class="c-num">${n}</span>${ICONE[c.type] ? `<span class="c-type">${ICONE[c.type]}</span>` : ""}` +
    (img ? `<div class="c-img" style="background-image:url('${img}')"></div>` : `<div class="c-img vide"></div>`) + `<div class="c-titre">${c.titre}</div>`;
  glisser(el, n);
  return el;
}
function renduScene() {
  const L = lieu(S.lieu), img = $("#scene-img"), src = `${RACINE}img/${L.image}.jpg`;
  if (img.getAttribute("src") !== src) { img.src = src; $("#scene-fond").style.backgroundImage = `url('${src}')`; }
  $("#scene-titre").textContent = L.nom;
  $("#scene-texte").textContent = L.texte || "";
  // Numéros cachés
  const calques = $("#scene-calques"); calques.innerHTML = "";
  (J.NOMBRES[S.lieu] || []).forEach(([num, x, y, si]) => {
    if (si && !S.flags[si]) return;
    const s = document.createElement("span");
    s.className = "nombre-cache" + (enMain(num) || S.defausse.includes(num) ? " pris" : "");
    s.textContent = num; s.style.left = x + "%"; s.style.top = y + "%"; s.style.setProperty("--r", (((num * 13) % 9) - 4) + "deg");
    calques.appendChild(s);
  });
  // Sorties
  const z = $("#scene-sorties"); z.innerHTML = "";
  L.voisins.filter(v => !lieu(v).cache && visible(v)).forEach(v => {
    const b = document.createElement("button"); b.className = "btn btn-petit sortie";
    const ok = ouvert(v);
    b.innerHTML = `${lieu(v).nom}${ok === true ? "" : ` <span class="verrou">${ok}</span>`}`;
    b.onclick = () => aller(v);
    z.appendChild(b);
  });
}
const visible = v => S.ouverts.includes(v) || v === "sas" || (S.chap >= 1 && ["labo", "passerelle", "coursiveD"].includes(v));
function ouvert(v) {
  const L = lieu(S.lieu), porte = L.portes && L.portes[v];
  if (porte && !S.flags[porte]) return "fermé";
  if (!S.ouverts.includes(v)) return "fermé";
  const V = lieu(v).verrou;
  if (V === "codeBrandt" && !S.flags.codeBrandt) return "code";
  if (V === "chambre" && !S.flags.chambre) return "fermé";
  if (V === "cleChaloupe" && !enMain(115) && !S.flags.cle) return "verrouillé";
  return true;
}
function aller(v) {
  const o = ouvert(v);
  if (o !== true) {
    if (lieu(v).verrou === "codeBrandt" && S.ouverts.includes(v)) { Mecas.clavierPorte(api(), { titre: "Porte de la cabine de Brandt", reponse: "0308", reussite: () => { S.flags.codeBrandt = true; aller(v); } }); return; }
    const raisons = { porteB: "La porte coupe-feu du pont B est baissée. Verrouillée depuis le labo.", porteA: "L'escalier du pont A est fermé. VIGIE garde la passerelle.", porteD: "La porte du pont D ne s'ouvre pas.", porteSas: "La porte du sas est fermée." };
    const p = lieu(S.lieu).portes && lieu(S.lieu).portes[v];
    toast(p && raisons[p] ? raisons[p] : `${lieu(v).nom} : ${o}.`); Son.jouer("SFX_BIP_NON"); return;
  }
  if (S.bete.active && S.bete.pos === v) { S.precedent = S.lieu; S.lieu = v; rendu(); rencontre(); return; }
  S.precedent = S.lieu; S.lieu = v; ajouterBruit(2, true);
  rendu(); sauver();
  entree(v);
  if (S.bete.active && S.bete.fixe && lieu(v).voisins.includes(S.bete.pos)) setTimeout(approcheAffut, 900);
}
// Ce qui se passe à l'entrée d'un lieu
function entree(v) {
  const premiere = !S.vus["lieu-" + v]; S.vus["lieu-" + v] = true;
  ambianceLieu();
  if (v === "cabBrandt" && premiere) { interphone(["BRANDT_03", "BRANDT_FREDONNE"]).then(() => { reveler(66); rendu(); sauver(); }); }
  if (v === "labo" && S.chap === 3 && premiere) setTimeout(() => interphone(["VAREK_07"]), 1200);
}
function ambianceLieu() {
  const a = { sas: "AMB_SAS", vestiaire: "AMB_SAS", labo: "AMB_LABO", passerelle: "AMB_PASSERELLE", vigie: "AMB_VIGIE", chaloupe: "AMB_CHALOUPE" }[S.lieu] || "AMB_COURSIVE";
  Son.ambiance(a);
}

// ——— Lampe
(function lampe() {
  const boite = $("#scene-boite");
  const bouge = (x, y) => { const r = boite.getBoundingClientRect(); boite.style.setProperty("--lx", ((x - r.left) / r.width * 100) + "%"); boite.style.setProperty("--ly", ((y - r.top) / r.height * 100) + "%"); boite.style.setProperty("--rayon", Math.round(r.width * .12) + "px"); };
  boite.addEventListener("pointermove", e => bouge(e.clientX, e.clientY));
  boite.addEventListener("pointerdown", e => bouge(e.clientX, e.clientY));
})();
// L'image (16:9) couvre tout l'écran, sauf si le recadrage cachait un numéro sous une barre ou hors champ :
// on la réduit alors juste ce qu'il faut, et le fond flou comble les bandes.
const ETENDUE = (() => { const t = Object.values(J.NOMBRES).flat(); return { x0: Math.min(...t.map(n => n[1])), x1: Math.max(...t.map(n => n[1])), y0: Math.min(...t.map(n => n[2])), y1: Math.max(...t.map(n => n[2])) }; })();
function ajusterScene() {
  const table = $("#table"), cadre = $("#scene-cadre"), b = $("#scene-boite"); const W = cadre.clientWidth, H = cadre.clientHeight;
  if (!W || !H) return;
  const haut = $("#table > .barre-haut").offsetHeight, bas = $("#table > .barre-bas").offsetHeight, m = 10;
  table.style.setProperty("--haut", haut + "px"); table.style.setProperty("--bas", bas + "px");
  const { x0, x1, y0, y1 } = ETENDUE, demi = v => Math.max(.01, Math.abs(v / 100 - .5));
  // Centre de l'image au milieu de la zone libre entre les deux barres.
  const cy = haut + (H - haut - bas) / 2;
  let w = Math.max(W, H * 16 / 9);
  w = Math.min(w, (W / 2 - m) / demi(x0), (W / 2 - m) / demi(x1));
  w = Math.min(w, (cy - haut - m) / demi(y0) * 16 / 9, (H - bas - m - cy) / demi(y1) * 16 / 9);
  const h = w * 9 / 16;
  Object.assign(b.style, { width: w + "px", height: h + "px", left: (W - w) / 2 + "px", top: cy - h / 2 + "px" });
}
{ const ro = new ResizeObserver(ajusterScene); ["#scene-cadre", "#table > .barre-haut", "#table > .barre-bas"].forEach(q => ro.observe($(q))); }

// ——————————————————————————————————————————————— Glisser-déposer
function glisser(el, n) {
  el.addEventListener("pointerdown", e => {
    if (e.button) return;
    const x0 = e.clientX, y0 = e.clientY; let fantome = null, cible = null;
    el.setPointerCapture(e.pointerId);
    const bouge = ev => {
      if (!fantome && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { fantome = el.cloneNode(true); fantome.classList.add("fantome"); document.body.appendChild(fantome); el.classList.add("retient"); }
      if (!fantome) return;
      fantome.style.left = ev.clientX - 50 + "px"; fantome.style.top = ev.clientY - 66 + "px";
      fantome.style.display = "none"; const sous = document.elementFromPoint(ev.clientX, ev.clientY); fantome.style.display = "";
      const c = sous && sous.closest(".carte:not(.fantome)"), nv = c && +c.dataset.n !== n ? c : null;
      if (nv !== cible) { if (cible) cible.classList.remove("cible"); cible = nv; if (cible) cible.classList.add("cible"); }
    };
    const fin = ev => {
      el.removeEventListener("pointermove", bouge); el.removeEventListener("pointerup", fin); el.removeEventListener("pointercancel", fin); el.classList.remove("retient");
      if (fantome) { fantome.remove(); if (cible) { cible.classList.remove("cible"); assembler(n, +cible.dataset.n); } }
      else if (ev.type === "pointerup") ouvrirCarte(n);
    };
    el.addEventListener("pointermove", bouge); el.addEventListener("pointerup", fin); el.addEventListener("pointercancel", fin);
  });
}
function assembler(a, b) {
  if (!enMain(a) || !enMain(b)) return;
  const c = J.COMBOS.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (c) { if (c.unique && S.flags[c.unique]) { toast("C'est déjà fait."); return; } if (c.unique) S.flags[c.unique] = true; effets(c.effets); return; }
  Son.jouer("SFX_BIP_NON"); ajouterBruit(5); toast("Rien ne se passe. Vous avez fait du bruit pour rien.");
  $$(`.carte[data-n="${a}"], .carte[data-n="${b}"]`).forEach(e => { e.classList.add("secoue"); setTimeout(() => e.classList.remove("secoue"), 500); });
}

// ——————————————————————————————————————————————— Prendre (numéros cachés)
$("#pioche").addEventListener("submit", e => {
  e.preventDefault();
  const champ = $("#pioche-n"), n = parseInt(champ.value, 10); champ.value = "";
  if (isNaN(n)) return;
  if (enMain(n)) { toast("C'est déjà ramassé."); return; }
  if (S.defausse.includes(n)) { toast("Ça a déjà servi."); return; }
  if (piochable(n)) { prendre(n); return; }
  Son.jouer("SFX_BIP_NON"); ajouterBruit(4); toast("Rien, ici, ne porte ce numéro. Vous avez remué des choses pour rien.");
});
function piochable(n) {
  if (n === J.CONDUITS.trace.nombre) return !!S.flags.uvVu;
  return (J.NOMBRES[S.lieu] || []).some(([x, , , si]) => x === n && (!si || S.flags[si]));
}
function prendre(n) {
  reveler(n); Son.jouer("SFX_FOUILLE"); rendu(); sauver();
  if (n === 73) S.flags.trace = true;
  // La cantine : le dictaphone, et ce qui passe au-dessus.
  if (n === 40 && !S.flags.silenceCantine) { S.flags.silenceCantine = true; sceneCantine(); return; }
  setTimeout(() => ouvrirCarte(n), 250);
}
async function sceneCantine() {
  await attendre(900); Son.jouer("SFX_GOUTTE"); await attendre(1800);
  S.bete.pos = "condC"; Son.voix("VIGIE_12");
  await attendre(1500);
  const ok = await silence({ duree: 20000, video: "v-plafond" });
  if (!ok) { rencontre({ fuir: false }); return; }
  S.bete.pos = "condB"; S.bete.prochain = 45000;
  billet("Les clics s'éloignent dans le plafond, vers l'avant du vaisseau. Puis plus rien. Vous vous rendez compte que vous ne respiriez plus.");
  quandBilletsFinis(() => ouvrirCarte(40));
}

// ——————————————————————————————————————————————— Cartes ouvertes
let carteOuverte = null;
function ouvrirCarte(n) {
  const c = carte(n), m = $("#m-carte"), el = $("#carte-grande");
  carteOuverte = n;
  const img = imageCarte(n);
  el.className = "carte-grande" + (img ? "" : " sans-visuel") + ` t-${c.type}`;
  el.innerHTML = (img ? `<div class="cg-visuel"><span class="cg-num">${n}</span><div class="cg-img" style="background-image:url('${img}')"></div></div>` : "") +
    `<div class="cg-corps">${img ? "" : `<span class="cg-num">${n}</span>`}<h2>${c.titre}</h2><div class="cg-texte">${c.texte}</div>` +
    (c.ecoute ? `<button class="btn btn-petit cg-ecoute">Réécouter</button>` : "") + `<div class="cg-meca"></div></div>` +
    `<button class="icone cg-fermer" data-fermer aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  if (c.ecoute) $(".cg-ecoute", el).onclick = () => interphone(["BRANDT_03", c.ecoute], { journal: false });
  if (c.meca && enMain(n)) Mecas.monter(c.meca, $(".cg-meca", el), { ...api(), n });
  m.hidden = false;
}
function fermerCarte() { const el = $("#carte-grande"); if (el._arret) { el._arret(); el._arret = null; } $("#m-carte").hidden = true; carteOuverte = null; }
document.addEventListener("click", e => {
  const f = e.target.closest("[data-fermer]"); if (!f) return; const m = f.closest(".modale"); if (!m) return;
  if (m.id === "m-carte") fermerCarte(); else { m.hidden = true; if (m.id === "m-menu") reprendre(); }
});
document.addEventListener("keydown", e => { if (e.key !== "Escape" || silenceEnCours) return; if (!$("#m-carte").hidden) fermerCarte(); ["m-dossier", "m-plan", "m-journal", "m-indices", "m-aide", "m-menu"].forEach(id => { if (!$("#" + id).hidden) { $("#" + id).hidden = true; if (id === "m-menu") reprendre(); } }); });

// ——————————————————————————————————————————————— L'interface pour les mécanismes
function api() {
  return { J, get S() { return S; }, effets, reveler, defausser, rendu, sauver, toast, billet, quandBilletsFinis, interphone, ajouterBruit, retirerTemps, silence, rencontre, flash, attendre,
    instrument, tels, aDesTels, telAvecMicro, telAvecMouvement, fermerCarte, ouvrirCarte, enMain, media, chapitre, fin, aller, ecran, VIDEOS, RACINE, AD,
    echec: (msg, bruit = 6) => { Son.jouer("SFX_BIP_NON"); ajouterBruit(bruit); if (msg) toast(msg); },
    ouvrirDossier: (mode) => ouvrirDossier(mode), cine, rendreLieu: v => { S.lieu = v; rendu(); entree(v); } };
}

// ——————————————————————————————————————————————— Chapitres
async function chapitre(i, { reprise = false } = {}) {
  S.chap = i; const c = chap();
  S.objectif = null;
  if (!reprise) {
    S.ouverts = [...new Set([...(S.ouverts || []), ...(c.lieux || [])])];
    S.lieu = c.lieu;
    (c.cartes || []).forEach(reveler);
    S.main.filter(x => carte(x) && !carte(x).garde && i > 0 && !(c.cartes || []).includes(x)).forEach(defausser);
    S.bete = { pos: c.bete.depart, active: c.bete.active, prochain: 35000 };
    if (i === 4) { S.flags.porteB = true; S.flags.porteA = true; }
    if (i === 5) { S.flags.porteD = true; S.flags.porteA = true; S.bete.fixe = "coursiveD"; }
    const copie = JSON.parse(JSON.stringify(S)); delete copie.point; S.point = copie;
    S.etape = "jeu"; sauver();
    await cine([{ titre: c.num, texte: `<span class="cine-chap">${c.titre}</span><span class="cine-objectif">${c.objectif}</span>` }], { court: true, musique: c.musique });
  }
  entrerTable();
  if (reprise) return;
  // Ouvertures propres à chaque chapitre
  if (i === 0) setTimeout(() => interphone(["VIGIE_01"], { journal: false }), 900);
  if (i === 1) setTimeout(() => interphone(["VAREK_06", "BRANDT_02"]), 1500);
  if (i === 2) { if (!enMain(71)) setTimeout(() => interphone(["BRANDT_05"]), 900); else setTimeout(() => ouvrirCarte(71), 700); }
  if (i === 3) setTimeout(() => interphone(["VAREK_07"]), 1500);
  if (i === 4) setTimeout(() => interphone(["BRANDT_06", "BRANDT_FREDONNE", "BRANDT_07"]), 1500);
  if (i === 5) setTimeout(() => interphone(["VIGIE_17"], { journal: false }), 400);
}
function entrerTable() { ecran("table"); ambianceLieu(); Son.musique(null); rendu(); envoyerEtat(); dernier = performance.now(); }

function ouvrirPorteSas() {
  if (!S.flags.pression) { interphone(["VIGIE_04"], { journal: false }); Son.jouer("SFX_BIP_NON"); return; }
  if (!S.flags.adn) { interphone(["VIGIE_05"], { journal: false }); Son.jouer("SFX_BIP_NON"); return; }
  S.flags.porteSas = true; defausser(13); Son.jouer("SFX_PORTE"); rendu(); sauver();
  interphone(["VIGIE_06"], { journal: false }).then(finChapitre1);
}
async function finChapitre1() {
  S.etape = "recit"; sauver();
  await cine(J.RECIT.finCh1.map(v => ({ voix: v, texte: "", interphone: true })), { interphone: true });
  S.flags.dossier = true; S.etape = "jeu";
  await chapitre(1);
  billet(`<p>Le <b>Dossier</b> d'enquête est ouvert (en bas de l'écran) : les quatre membres d'équipage qui pourraient porter la larve.</p><p>Chaque preuve que vous trouverez s'y inscrira, sur la fiche de la personne qu'elle concerne et sur la frise de la nuit du 16 novembre.</p>`);
}
function ouvrirGrille() {
  Son.jouer("SFX_GRILLE"); defausser(36); S.flags.grille = true; rendu(); sauver();
  setTimeout(() => chapitre(2), 1600);
}

// ——————————————————————————————————————————————— Cinématiques
// Vidéos chargées d'avance (le prologue), pour qu'elles partent sans calage.
const PRECHARGEES = new Map();
function precharger(...noms) {
  noms.filter(n => VIDEOS.has(n) && !PRECHARGEES.has(n)).forEach(n => {
    const v = document.createElement("video"); v.src = `${RACINE}media/video/${n}.mp4`; v.muted = true; v.playsInline = true; v.preload = "auto"; v.load(); PRECHARGEES.set(n, v);
  });
}
function media(nom, { boucle = false, image = null } = {}) {
  const box = document.createElement("div"); box.className = "media";
  if (nom && VIDEOS.has(nom)) {
    const v = PRECHARGEES.get(nom) || document.createElement("video"); PRECHARGEES.delete(nom);
    if (!v.src) v.src = `${RACINE}media/video/${nom}.mp4`;
    v.muted = true; v.playsInline = true; v.autoplay = true; v.loop = boucle; box.appendChild(v);
    v.play().catch(() => {});
  } else if (image || (nom && nom.startsWith("c-"))) {
    const i = document.createElement("div"); i.className = "media-img"; i.style.backgroundImage = `url('${RACINE}img/${image || nom}.jpg')`; box.appendChild(i);
  }
  return box;
}
function cine(plans, { court = false, musique = null, interphone: inter = false } = {}) {
  return new Promise(fin => {
    ecran("cine");
    const zm = $("#cine-media"), txt = $("#cine-texte"), suite = $("#cine-suite");
    $("#cine").classList.toggle("interphone", inter);
    if (musique) Son.musique(musique);
    let i = 0, enCours = false;
    const montrer = async () => {
      const p = plans[i]; enCours = true; suite.classList.remove("visible");
      zm.innerHTML = ""; if (p.video || p.image) { const m = media(p.video, { image: p.image }); zm.appendChild(m); requestAnimationFrame(() => m.classList.add("visible")); }
      if (inter) zm.innerHTML = `<div class="interphone-onde"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
      txt.innerHTML = p.titre ? `<p class="cine-titre-chap">${p.titre}</p>${p.texte || ""}` : (p.texte ? `<p>${p.texte}</p>` : "");
      requestAnimationFrame(() => requestAnimationFrame(() => txt.classList.add("visible")));
      if (p.voix) { $("#cine").classList.add("parle"); await Son.voix(p.voix); $("#cine").classList.remove("parle"); if (!S.journal.includes(p.voix) && !p.voix.startsWith("VIGIE")) S.journal.push(p.voix); }
      else await attendre((court ? 1600 : 2400) * (window.__rapide ? .2 : 1));
      enCours = false; suite.classList.add("visible");
      suite.textContent = i < plans.length - 1 ? "Continuer" : (court ? "Commencer" : "Continuer");
      if (inter && p.voix && i < plans.length - 1) avancer();
    };
    const avancer = () => {
      if (enCours) { Son.couperVoix(); return; }
      i++;
      if (i >= plans.length) { document.removeEventListener("keydown", clavier); $("#cine").onclick = null; txt.classList.remove("visible"); fin(); return; }
      txt.classList.remove("visible"); setTimeout(montrer, 450);
    };
    const clavier = e => { if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); avancer(); } };
    document.addEventListener("keydown", clavier);
    $("#cine").onclick = avancer;
    montrer();
  });
}

// ——————————————————————————————————————————————— Dossier d'enquête
function preuvesConnues() { return [...S.main, ...S.defausse].filter(n => carte(n) && carte(n).preuve); }
function ouvrirDossier(mode) {
  const D = $("#dossier"), connues = preuvesConnues();
  const fiche = s => {
    const lignes = connues.filter(n => carte(n).preuve.qui.includes(s.id)).map(n => { const p = carte(n).preuve; return `<li><span class="d-num">${n}</span>${p.par ? p.par[s.id] : p.resume}</li>`; }).join("");
    return `<article class="fiche" data-id="${s.id}"><div class="f-photo" style="background-image:url('${RACINE}img/${s.photo}.jpg')"></div><div class="f-corps"><h3>${s.nom}</h3><p class="f-fonction">${s.fonction}</p><p class="f-note">${s.note}</p><ul>${lignes || `<li class="vide">Rien pour l'instant.</li>`}</ul></div></article>`;
  };
  const H = t => { const [h, m] = t.split(":").map(Number); return (h - 2) * 60 + m; }; // minutes depuis 2 h
  const ev = J.FRISE.filter(e => connues.includes(e.carte));
  const frise = `<div class="frise"><div class="frise-axe">${[0, 30, 60, 90, 120].map(m => `<span style="left:${m / 120 * 100}%">${2 + Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}</span>`).join("")}</div>` +
    ev.map((e, k) => `<div class="frise-ev${e.fin ? " duree" : ""}" style="left:${H(e.debut) / 120 * 100}%;${e.fin ? `width:${(H(e.fin) - H(e.debut)) / 120 * 100}%;` : ""}top:${k * 30 + 28}px"><span class="d-num">${e.carte}</span>${e.debut}${e.fin ? "–" + e.fin : ""} · ${e.texte}</div>`).join("") +
    `<div class="frise-hauteur" style="height:${ev.length * 30 + 40}px"></div></div>`;
  const ho = J.HORS_CAUSE;
  D.innerHTML = `<h2>Dossier d'enquête</h2><p class="petit">Qui porte la larve ? La Convention exige le nom de l'hôte, l'heure du contact, et trois éléments de preuve.</p>
    <div class="fiches">${J.SUSPECTS.map(fiche).join("")}</div>
    <p class="hors-cause"><b>Hors de cause :</b> ${ho.nom}, ${ho.fonction.toLowerCase()} (${ho.note.toLowerCase()}) ; l'équipe de raffinerie (contrôle biologique négatif).</p>
    <h3 class="frise-titre">La nuit du 16 novembre</h3>${ev.length ? frise : `<p class="petit vide">Aucune preuve datée pour l'instant.</p>`}
    ${mode === "accuser" ? formulaireAccusation(connues) : ""}
    <div class="dossier-actions"><button class="btn" data-fermer>Fermer</button></div>`;
  $("#m-dossier").hidden = false;
  if (mode === "accuser") brancherAccusation();
}
function formulaireAccusation(connues) {
  return `<form class="accusation" id="accusation"><h3>Protocole Q — désignation de l'hôte</h3>
    <label>Hôte vivant <select id="acc-qui"><option value="">—</option>${J.SUSPECTS.map(s => `<option value="${s.id}">${s.nom}</option>`).join("")}</select></label>
    <label>Heure du contact, le 16/11 <input id="acc-heure" placeholder="hh:mm" maxlength="5" inputmode="numeric"></label>
    <fieldset><legend>Trois éléments de preuve</legend>${connues.map(n => `<label class="acc-preuve"><input type="checkbox" value="${n}"> <span class="d-num">${n}</span>${carte(n).titre}</label>`).join("")}</fieldset>
    <button class="btn btn-principal" type="submit">Transmettre à VIGIE</button></form>`;
}
function brancherAccusation() {
  $("#accusation").onsubmit = e => {
    e.preventDefault();
    const qui = $("#acc-qui").value, h = $("#acc-heure").value.trim().replace("h", ":").replace(/^(\d):/, "0$1:"), cochees = $$("#accusation input:checked").map(i => +i.value);
    if (!qui || !/^\d\d:\d\d$/.test(h) || cochees.length !== 3) { toast("Il faut un nom, une heure (hh:mm) et exactement trois preuves."); return; }
    const A = J.ACCUSATION, ok = qui === A.suspect && h === A.heure && cochees.every(n => A.preuves.includes(n));
    $("#m-dossier").hidden = true;
    if (!ok) { interphone(["VIGIE_15"], { journal: false }); ajouterBruit(10); retirerTemps(5, "Cinq minutes perdues."); return; }
    S.flags.accuse = true; sauver(); Mecas.accusationJuste(api());
  };
}
$("#b-dossier").onclick = () => ouvrirDossier();

// ——————————————————————————————————————————————— Plan, journal, indices, aide, menu
// Schéma en coupe : quatre ponts, les lieux connus, et en grisé les portes qui mènent ailleurs.
const PLAN = {
  caissons: [62, 13], passerelle: [110, 13], vigie: [152, 13],
  labo: [122, 33], sport: [162, 33],
  cantine: [78, 51], cabLemaire: [108, 51], cabOkafor: [134, 51],
  sas: [40, 62], coursiveC: [78, 62], vestiaire: [40, 74], cabBrandt: [108, 74], cabAranda: [134, 74],
  chaloupe: [40, 91], coursiveD: [78, 91], machines: [114, 87], soute: [114, 96]
};
const PONTS = [["A", 3, 22], ["B", 25, 41], ["C", 44, 81], ["D", 84, 99]];
// Tracés à angle droit : les montées passent par la cage d'escalier (x 94), les cabines par la coursive.
function trace(a, b) {
  const [x1, y1] = PLAN[a], [x2, y2] = PLAN[b];
  if (x1 === x2 || y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
  const k = [a, b].sort().join("-");
  if (/coursiveC-(labo|passerelle)/.test(k)) { const [c, d] = a === "coursiveC" ? [PLAN[a], PLAN[b]] : [PLAN[b], PLAN[a]]; return `M${c[0]},${c[1]} H94 V${d[1]} H${d[0]}`; }
  if (/coursiveD-(machines|soute)/.test(k)) { const [c, d] = a === "coursiveD" ? [PLAN[a], PLAN[b]] : [PLAN[b], PLAN[a]]; return `M${c[0]},${c[1]} H96 V${d[1]} H${d[0]}`; }
  const [c, d] = /^coursive/.test(a) ? [PLAN[a], PLAN[b]] : [PLAN[b], PLAN[a]];
  return `M${c[0]},${c[1]} H${d[0]} V${d[1]}`;
}
$("#b-plan").onclick = () => {
  const connu = id => PLAN[id] && (visible(id) || id === S.lieu);
  const vis = Object.keys(PLAN).filter(connu);
  const devines = [...new Set(vis.flatMap(id => lieu(id).voisins))].filter(v => PLAN[v] && !connu(v) && !lieu(v).cache);
  const liens = [];
  vis.forEach(id => lieu(id).voisins.forEach(v => { if (PLAN[v] && (connu(v) || devines.includes(v)) && !liens.some(([x, y]) => x === v && y === id)) liens.push([id, v]); }));
  const nom = id => lieu(id).nom;
  $("#plan").innerHTML = `<svg viewBox="0 0 180 100" class="plan-svg" role="img" aria-label="Plan du Kerguelen">` +
    PONTS.map(([p, y0, y1]) => `<rect class="pont-bande" x="20" y="${y0}" width="158" height="${y1 - y0}" rx="1.5"/><text class="pont" x="2" y="${(y0 + y1) / 2 + 1}">Pont ${p}</text>`).join("") +
    liens.map(([a, b]) => `<path class="p-lien${devines.includes(b) || devines.includes(a) ? " devine" : ""}" d="${trace(a, b)}"/>`).join("") +
    devines.map(id => `<g class="p-lieu devine"><circle cx="${PLAN[id][0]}" cy="${PLAN[id][1]}" r="1.4"/><text x="${PLAN[id][0]}" y="${PLAN[id][1] - 3}">${nom(id)}</text></g>`).join("") +
    vis.map(id => `<g class="p-lieu${id === S.lieu ? " ici" : ""}">${id === S.lieu ? `<circle class="halo" cx="${PLAN[id][0]}" cy="${PLAN[id][1]}" r="4"/>` : ""}<circle cx="${PLAN[id][0]}" cy="${PLAN[id][1]}" r="${id === S.lieu ? 2.2 : 1.7}"/><text x="${PLAN[id][0]}" y="${PLAN[id][1] - 3.4}">${nom(id)}</text></g>`).join("") + `</svg>` +
    `<p class="plan-legende"><span><i class="l-ici"></i>Vous êtes ici</span><span><i class="l-connu"></i>Lieu connu</span><span><i class="l-devine"></i>Pas encore ouvert</span></p>`;
  $("#m-plan").hidden = false;
};
$("#b-journal").onclick = () => {
  const ol = $("#journal");
  ol.innerHTML = S.journal.length ? S.journal.map(c => { const [qui, , t] = J.VOIX[c]; return `<li><span class="st-qui st-${qui.toLowerCase()}">${({ VAREK: "Varek", BRANDT: "Jo", LEMAIRE: "Lemaire" })[qui] || qui}</span> ${t.length > 90 ? t.slice(0, 88) + "…" : t} <button class="lien" data-c="${c}">Réécouter</button></li>`; }).join("") : `<li class="vide">Aucun message.</li>`;
  $$("button[data-c]", ol).forEach(b => b.onclick = () => interphone([b.dataset.c], { journal: false }));
  $("#m-journal").hidden = false;
};
function enigmesOuvertes() { return J.ENIGMES.filter(e => enMain(e.si) && !(e.resolu && S.flags[e.resolu])); }
function ouvrirIndices() {
  const l = $("#indices"); l.innerHTML = "";
  const liste = enigmesOuvertes();
  if (!liste.length) l.innerHTML = `<p class="petit">Rien ne vous bloque pour l'instant. Fouillez les lieux à la lampe, et relisez l'objectif en haut de l'écran.</p>`;
  liste.forEach(e => {
    const k = S.indices[e.id] || 0, d = document.createElement("div"); d.className = "enigme";
    d.innerHTML = `<h3>${e.titre}</h3>` + (k ? `<ol>${e.indices.slice(0, k).map(t => `<li>${t}</li>`).join("")}</ol>` : "");
    if (k < e.indices.length) { const b = document.createElement("button"); b.className = "btn btn-petit"; b.textContent = k === e.indices.length - 1 ? "Voir la solution" : (k ? "Un autre indice" : "Un indice"); b.onclick = () => { S.indices[e.id] = k + 1; retirerTemps(2); sauver(); ouvrirIndices(); }; d.appendChild(b); }
    l.appendChild(d);
  });
  $("#m-indices").hidden = false;
}
$("#b-indices").onclick = ouvrirIndices;
$("#b-aide").onclick = () => { $("#aide").innerHTML = `<h2>Comment jouer</h2>${$(".regles").outerHTML}<p class="petit">Téléphones : ${$("#url-tel").textContent || "liaison non ouverte"}</p><button class="btn" data-fermer>Fermer</button>`; $("#m-aide").hidden = false; };
function pause() { enPause = true; }
function reprendre() { enPause = false; dernier = performance.now(); }
$("#b-menu").onclick = () => { pause(); $("#menu-info").textContent = `Chapitre ${chap().num} · ${chap().titre}. Rencontres : ${S.rencontres} sur 3. Indices : ${Object.values(S.indices).reduce((a, b) => a + b, 0)}.`; $("#m-menu").hidden = false; };
$("#b-couper").onclick = () => { const c = !Son.coupe; Son.couper(c); $("#b-couper").textContent = c ? "Remettre le son" : "Couper le son"; };
$("#vol-mus").oninput = e => Son.volumeMusique(+e.target.value);
$("#b-recommencer").onclick = () => { if (!confirm("Effacer la partie en cours et recommencer ?")) return; localStorage.removeItem(CLE_SAUVE); location.reload(); };

// ——————————————————————————————————————————————— Fins
async function fin(type) {
  if (S.etape === "fin") return;
  S.etape = "fin"; S.typeFin = type; sauver();
  $("#speciale").hidden = true; $("#silence").hidden = true; Son.couperVoix();
  const F = J.RECIT.fins[type];
  await cine(F.texte.map((t, k) => ({ texte: t, video: k === 0 ? F.video : null, image: k === 0 ? F.image : null })).concat([{ texte: "", voix: F.voix }]), { musique: type === "quarantaine" ? "MUS_FIN" : "MUS_ECHEC" });
  ecranFin();
}
function ecranFin() {
  ecran("fin"); const F = J.RECIT.fins[S.typeFin];
  $("#fin-titre").textContent = F.titre;
  $("#fin-rapport").innerHTML = J.RECIT.rapport.map(l => `<li>${l}</li>`).join("");
  const toutes = Object.entries(J.CARTES).filter(([, c]) => c.preuve).map(([n]) => +n), trouvees = toutes.filter(n => S.main.includes(n) || S.defausse.includes(n));
  $("#fin-trouve").textContent = `Preuves trouvées : ${trouvees.length} sur ${toutes.length}.` + (S.flags.accuse ? " Vous avez désigné l'hôte." : " L'hôte n'a pas été désigné.");
  const ecoule = 90 * MIN - S.restant;
  $("#fin-bilan").innerHTML = `<div><dt>Temps</dt><dd>${Math.round(ecoule / MIN)} min</dd></div><div><dt>Rencontres</dt><dd>${S.rencontres} / 3</dd></div><div><dt>Bruit maximal</dt><dd>${Math.round(S.bruitMax)} %</dd></div><div><dt>Indices</dt><dd>${Object.values(S.indices).reduce((a, b) => a + b, 0)}</dd></div>`;
  $("#fin-generique").innerHTML = J.RECIT.generique.map(([a, b]) => `<p><span>${a}</span>${b}</p>`).join("");
  $("#b-chapitre").hidden = S.typeFin !== "silence" || !S.point;
  Son.ambiance(null);
}
$("#b-titre").onclick = () => { ecran("titre"); $("#b-reprendre").hidden = true; };
$("#b-chapitre").onclick = () => { const p = S.point; S = JSON.parse(JSON.stringify(p)); S.point = p; S.rencontres = Math.min(S.rencontres, 1); S.etape = "jeu"; sauver(); chapitre(S.chap, { reprise: true }); };

// ——————————————————————————————————————————————— Démarrage
$("#titre-version").textContent = AD ? "version audiodescription" : "version son";
document.body.classList.add(AD ? "v-ad" : "v-son");
const sauve = charger();
if (sauve && sauve.etape !== "fin") $("#b-reprendre").hidden = false;
function etape(k) { $$(".accueil-etape").forEach(e => e.hidden = +e.dataset.etape !== k); $$("#accueil-etapes li").forEach(l => l.classList.toggle("ici", +l.dataset.e === k)); }
$$("[data-suite]").forEach(b => b.onclick = () => etape(+b.dataset.suite));
$("#b-nouvelle").onclick = () => {
  precharger(...J.RECIT.prologue.map(p => p.video).filter(Boolean));
  Son.demarrer();
  if (sauve && sauve.etape !== "fin" && !confirm("Une partie est en cours. La remplacer par une nouvelle ?")) return;
  ecran("accueil"); etape(1); ouvrirLiaison(); Son.ambiance("AMB_SAS");
};
$("#b-sans-tel").onclick = () => { sansTel = true; window.open(new URL("tel.html?seul=1", location.href).href.replace("/son-", "/son-"), "_blank", "noopener"); toast("Le manuel est ouvert dans une autre fenêtre. Les instruments seront simulés à l'écran."); };
$("#b-brief").onclick = () => {
  const noms = ["#nom-1", "#nom-2", "#nom-3"].map(s => $(s).value.trim());
  if (!noms[0] || !noms[1]) { toast("Il faut au moins deux techniciens."); return; }
  if (!aDesTels() && !sansTel) { toast("Aucun téléphone n'est relié. Scannez le code de l'étape 2, ou choisissez « Jouer sans »."); etape(2); return; }
  S = neuf(noms);
  $("#brief-doc").innerHTML = J.RECIT.brief + `<p class="brief-noms">Équipe : ${noms.filter(Boolean).join(", ")}.</p><p class="brief-signe">Direction des opérations, Harrow-Ikeda</p>`;
  ecran("brief");
};
$("#b-embarquer").onclick = async () => {
  S.etape = "recit"; sauver(); envoyerEtat();
  await cine(J.RECIT.prologue.map(p => ({ video: p.video, image: p.image, texte: p.texte })), { musique: "MUS_PROLOGUE" });
  await chapitre(0);
};
$("#b-reprendre").onclick = async () => {
  Son.demarrer(); S = sauve; ouvrirLiaison();
  if (S.etape === "fin") { ecranFin(); return; }
  S.etape = "jeu"; ecran("accueil"); etape(2);
  $("#b-brief").onclick = null;
  toast("Reliez les téléphones, puis reprenez.");
  const b = document.createElement("button"); b.className = "btn btn-principal"; b.textContent = "Reprendre la partie";
  b.onclick = () => { chapitre(S.chap, { reprise: true }); if (S.autod) Mecas.reprendreChaloupe(api()); };
  $(".accueil-etape[data-etape='2'] .accueil-nav").replaceChildren(b);
};

// Pour les tests
window.__jeu = { get S() { return S; }, set S(v) { S = v; }, J, effets, reveler, rendu, assembler, ouvrirCarte, prendre, aller, chapitre, fin, silence, rencontre, deplacerBete, distanceBete, tels, ouvrirDossier, api };
