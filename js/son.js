// Le son du jeu, et son double en audiodescription.
// Version « son » : joue media/son/CODE.mp3 s'il existe (liste dans window.__MEDIAS), sinon un son de synthèse provisoire.
// Version « ad » (audiodescription) : aucun son ; chaque son est décrit à l'écran, là d'où il viendrait, avec son code.
// Les voix sont toujours sous-titrées ; en audiodescription, le sous-titre porte aussi le ton.
(function (G) {
  "use strict";
  const AD = document.body.dataset.version !== "son";
  const RACINE = document.body.dataset.racine || "";
  const SONS = document.body.dataset.sons || `${RACINE}media/son/`;
  const MEDIAS = new Set(G.__MEDIAS || []);
  let ctx = null, maitre = null, busMus = null, busAmb = null, busSfx = null, busVoix = null, coupe = false;
  let J = null;
  // Le jeu signale quand il joue lui-même un son : le micro des téléphones ne doit pas le compter comme du bruit des joueurs.
  let occupeJusqu = 0;
  const occuper = ms => { occupeJusqu = Math.max(occupeJusqu, performance.now() + ms); };

  function demarrer() {
    if (AD || ctx) { if (ctx && ctx.state === "suspended") ctx.resume(); return; }
    ctx = new (G.AudioContext || G.webkitAudioContext)();
    maitre = ctx.createGain(); maitre.connect(ctx.destination);
    busMus = ctx.createGain(); busMus.gain.value = .5; busMus.connect(maitre);
    busAmb = ctx.createGain(); busAmb.gain.value = .7; busAmb.connect(maitre);
    busSfx = ctx.createGain(); busSfx.connect(maitre);
    busVoix = ctx.createGain(); busVoix.connect(maitre);
  }

  // ——— Fichiers
  const tampons = new Map();
  async function tampon(code) {
    if (!MEDIAS.has(code)) return null;
    if (tampons.has(code)) return tampons.get(code);
    const p = fetch(`${SONS}${code}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => ctx.decodeAudioData(b)).catch(() => null);
    tampons.set(code, p); return p;
  }
  function lireTampon(buf, bus, { gain = 1, boucle = false, pan = 0 } = {}) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.loop = boucle; g.gain.value = gain;
    let sortie = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); sortie = p; }
    s.connect(g); sortie.connect(bus); s.start(); return { s, g };
  }

  // ——— Synthèse provisoire (en attendant les sons des étudiants)
  function bruitBlanc(duree) {
    const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * duree), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  function ton(f, duree, { gain = .2, type = "sine", attaque = .01, bus = busSfx, quand = 0 } = {}) {
    const t = ctx.currentTime + quand, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attaque); g.gain.setValueAtTime(gain, t + duree - .03); g.gain.linearRampToValueAtTime(0, t + duree);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + duree + .05);
  }
  function souffle(duree, { gain = .3, f = 800, q = 1, bus = busSfx, quand = 0, monte = false } = {}) {
    const t = ctx.currentTime + quand, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = bruitBlanc(duree); fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(monte ? 0 : gain, t); if (monte) g.gain.linearRampToValueAtTime(gain, t + duree * .8);
    g.gain.linearRampToValueAtTime(0, t + duree);
    s.connect(fl); fl.connect(g); g.connect(bus); s.start(t);
  }
  function clics(n, { gain = .25, ecart = .07, quand = 0 } = {}) { for (let i = 0; i < n; i++) souffle(.012, { gain, f: 3500, q: 4, quand: quand + i * ecart * (0.7 + Math.random() * .6) }); }
  const SYNTH = {
    BETE_CLICS: () => clics(9, { gain: .3 }),
    BETE_RACLE: () => souffle(1.6, { gain: .25, f: 380, q: 3 }),
    BETE_RESPIRE: () => { souffle(1.2, { gain: .2, f: 300, q: .8, monte: true }); souffle(1.4, { gain: .15, f: 250, q: .8, quand: 1.4 }); },
    BETE_COURSE: () => { for (let i = 0; i < 14; i++) souffle(.05, { gain: .25, f: 900, q: 2, quand: i * .11 }); },
    BETE_CRI: () => { souffle(1.4, { gain: .7, f: 2600, q: 1.5 }); ton(1900, 1.3, { gain: .2, type: "sawtooth" }); ton(2350, 1.1, { gain: .15, type: "sawtooth", quand: .1 }); },
    BETE_CHANT: () => chant(),
    BETE_ATTAQUE: () => { souffle(.3, { gain: .8, f: 200, q: .5 }); souffle(.8, { gain: .5, f: 3000, q: .7, quand: .2 }); SYNTH.BETE_CRI(); },
    BETE_PASSE: () => { clics(6, { gain: .2 }); souffle(2.5, { gain: .12, f: 400, q: 2, quand: .5 }); },
    SFX_GOUTTE: () => { ton(1400, .06, { gain: .2 }); ton(1200, .06, { gain: .15, quand: .9 }); },
    SFX_MAZOUT: () => { souffle(.9, { gain: .6, f: 3000, q: .6 }); },
    SFX_MAZOUT_FEULE: () => souffle(.9, { gain: .4, f: 3000, q: .6 }),
    SFX_MAZOUT_MIAULE: () => { ton(700, .35, { gain: .1, type: "triangle" }); },
    SFX_VANNE_ERR: () => souffle(1.2, { gain: .5, f: 5000, q: 2 }),
    SFX_RECOMPRESSION: () => souffle(2.5, { gain: .35, f: 600, q: .4, monte: true }),
    SFX_CASIER: () => { souffle(.05, { gain: .5, f: 2000, q: 2 }); souffle(.08, { gain: .3, f: 900, q: 2, quand: .07 }); },
    SFX_FOUILLE: () => { for (let i = 0; i < 5; i++) souffle(.15, { gain: .15, f: 2500, q: 1, quand: i * .2 }); },
    SFX_FROTTE: () => { for (let i = 0; i < 4; i++) souffle(.25, { gain: .12, f: 1800, q: 1, quand: i * .28 }); },
    SFX_COFFRE: () => { souffle(1, { gain: .25, f: 500, q: .5 }); ton(90, .4, { gain: .3, quand: .1 }); },
    SFX_BIP_OK: () => { ton(1320, .08, { gain: .12, type: "square" }); ton(1760, .1, { gain: .12, type: "square", quand: .1 }); },
    SFX_BIP_NON: () => ton(220, .25, { gain: .15, type: "square" }),
    SFX_LOQUET: () => { souffle(.08, { gain: .9, f: 1500, q: 1 }); ton(180, .2, { gain: .4, quand: .02 }); },
    SFX_GRILLE: () => { for (let i = 0; i < 4; i++) souffle(.3, { gain: .2, f: 1200, q: 6, quand: i * .4 }); souffle(.2, { gain: .6, f: 600, q: 1, quand: 1.8 }); },
    SFX_PORTE: () => souffle(1.2, { gain: .3, f: 700, q: .6 }),
    SFX_INCUBATEUR: () => souffle(2.6, { gain: .7, f: 4000, q: .5 }),
    SFX_ANALYSE: () => { chant({ gain: .08 }); chant({ gain: .08, transposition: 2 }); },
    SFX_CLE: () => { souffle(.05, { gain: .4, f: 2500, q: 3 }); souffle(.06, { gain: .4, f: 1500, q: 3, quand: .15 }); },
    SFX_FOUR: () => { ton(55, 4, { gain: .4, type: "sawtooth", attaque: 2 }); souffle(4, { gain: .3, f: 120, q: .5, monte: true }); },
    SFX_EXPLOSION: () => { souffle(4, { gain: .9, f: 90, q: .3 }); ton(40, 3, { gain: .5 }); },
    SFX_LARGAGE: () => { for (let i = 0; i < 4; i++) souffle(.1, { gain: .6, f: 900, q: 1, quand: i * .25 }); souffle(2, { gain: .3, f: 300, q: .5, quand: 1 }); },
    SFX_INTERPHONE: () => { souffle(.25, { gain: .15, f: 2000, q: .5 }); ton(880, .06, { gain: .06, type: "square", quand: .25 }); },
    SFX_ALARME: () => { for (let i = 0; i < 6; i++) ton(i % 2 ? 660 : 880, .3, { gain: .08, type: "square", quand: i * .3 }); },
    DET_ALLUMAGE: () => ton(1046, .12, { gain: .15, type: "square" })
  };
  // Le chant : quatre notes du verrou (manuel niveau 3).
  const NOTES = [110, 123, 147, 165, 196, 220, 247, 294];
  function chant({ gain = .22, transposition = 0, sequence = [2, 6, 7, 3] } = {}) {
    sequence.forEach((k, i) => { const f = NOTES[k - 1] * Math.pow(2, transposition / 12); ton(f, .85, { gain, type: "triangle", attaque: .15, quand: i * .95 }); ton(f * 2, .85, { gain: gain * .3, attaque: .2, quand: i * .95 }); });
  }

  // ——— Audiodescription
  const zoneAD = () => document.getElementById("ad");
  function decrire(code, { duree } = {}) {
    const def = J && J.SONS[code]; if (!def) return;
    const z = zoneAD(); if (!z) return;
    if (def.ambiance) { const a = document.getElementById("ad-ambiance"); if (a) { a.innerHTML = `<span class="ad-code">${code}</span>${def.ad}`; a.classList.add("visible"); } return; }
    const el = document.createElement("div");
    el.className = `ad-son ou-${def.ou || "centre"}` + (def.fort ? " fort" : "");
    el.innerHTML = `<span class="ad-code">${code}</span><span class="ad-texte">[${def.ad}]</span>`;
    z.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    if (def.fort) { document.body.classList.add("secousse"); setTimeout(() => document.body.classList.remove("secousse"), 500); }
    setTimeout(() => { el.classList.remove("visible"); setTimeout(() => el.remove(), 600); }, duree || (def.fort ? 3200 : 4200));
  }

  // ——— API
  // Variantes : CODE_1, CODE_2… livrées à la place de CODE ; le jeu en tire une au hasard, jamais deux fois de suite la même.
  const derniere = new Map();
  function variante(code) {
    const v = [];
    for (let i = 1; MEDIAS.has(`${code}_${i}`); i++) v.push(`${code}_${i}`);
    if (!v.length) return code;
    const choix = v.length > 1 ? v.filter(x => x !== derniere.get(code)) : v;
    const c = choix[Math.floor(Math.random() * choix.length)]; derniere.set(code, c); return c;
  }
  async function jouer(code, opts = {}) {
    if (AD) { decrire(code, opts); return; }
    if (!ctx || coupe) return;
    const buf = await tampon(variante(code));
    if (buf) { occuper(buf.duration * 1000 + 400); lireTampon(buf, busSfx, opts); return; }
    if (SYNTH[code]) { occuper(1800); SYNTH[code](); }
  }
  let ambCourante = null, ambCode = null;
  async function ambiance(code, fondu = 2) {
    if (AD) { if (code) decrire(code); else { const a = document.getElementById("ad-ambiance"); if (a) a.classList.remove("visible"); } return; }
    if (!ctx || code === ambCode) return;
    ambCode = code;
    if (ambCourante) { const a = ambCourante; a.g.gain.linearRampToValueAtTime(0, ctx.currentTime + fondu); setTimeout(() => a.s.stop(), fondu * 1000 + 100); ambCourante = null; }
    if (!code) return;
    const buf = await tampon(code);
    if (buf && ambCode === code) { ambCourante = lireTampon(buf, busAmb, { boucle: true, gain: 0 }); ambCourante.g.gain.linearRampToValueAtTime(1, ctx.currentTime + fondu); }
  }
  let musCourante = null, musCode = null;
  async function musique(code, fondu = 3) {
    if (AD || !ctx || code === musCode) return;
    musCode = code;
    if (musCourante) { const m = musCourante; m.g.gain.linearRampToValueAtTime(0, ctx.currentTime + fondu); setTimeout(() => m.s.stop(), fondu * 1000 + 100); musCourante = null; }
    if (!code) return;
    const buf = await tampon(code);
    if (buf && musCode === code) { musCourante = lireTampon(buf, busMus, { boucle: true, gain: 0 }); musCourante.g.gain.linearRampToValueAtTime(1, ctx.currentTime + fondu); }
  }

  // Voix : sous-titre + fichier s'il existe. Renvoie une promesse résolue à la fin (ou à l'interruption).
  let voixCourante = null;
  function voix(code, { ton: avecTon } = {}) {
    couperVoix();
    const def = J && J.VOIX[code]; if (!def) return Promise.resolve();
    const [qui, tonV, texte] = def;
    const st = document.getElementById("sous-titre");
    const nomQui = { VIGIE: "VIGIE", VAREK: "Varek", BRANDT: "Jo", LEMAIRE: "Lemaire" }[qui] || qui;
    if (st) {
      st.innerHTML = `<span class="st-qui st-${qui.toLowerCase()}">${nomQui}</span>` + (AD && tonV ? `<span class="st-ton">${tonV}</span>` : "") + `<span class="st-texte">${texte}</span>` + (AD ? `<span class="ad-code">${code}</span>` : "");
      st.classList.add("visible");
    }
    return new Promise(async fin => {
      let fini = false; const terminer = () => { if (fini) return; fini = true; clearTimeout(t); if (voixCourante && voixCourante.fin === terminer) voixCourante = null; if (st) st.classList.remove("visible"); fin(); };
      // Durée de lecture si pas de fichier : environ 15 caractères par seconde, plus un temps de pose.
      const lecture = (1400 + texte.length * 62) * (G.__rapide ? .04 : 1);
      let t = setTimeout(terminer, lecture), source = null;
      voixCourante = { fin: terminer, arreter: () => { try { source && source.s.stop(); } catch (_) {} terminer(); } };
      if (!AD && ctx && !coupe) {
        const buf = await tampon(code);
        if (buf && !fini) { clearTimeout(t); source = lireTampon(buf, busVoix); voixCourante.joue = true; source.s.onended = () => setTimeout(terminer, 350); voixCourante.arreter = () => { try { source.s.stop(); } catch (_) {} terminer(); }; }
      }
    });
  }
  function couperVoix() { if (voixCourante) voixCourante.arreter(); }

  // Bips d'interface (claviers de service, détecteur de secours, notes du verrou) : toujours synthétisés.
  function bips(paires, { ecart = .32, duree = .18 } = {}) {
    if (AD || !ctx || coupe) return;
    occuper(paires.length * ecart * 1000 + 150);
    paires.forEach((p, i) => [].concat(p).forEach(f => ton(f, duree, { gain: .09, quand: i * ecart })));
  }
  function note(k) { if (!AD && ctx && !coupe) { occuper(700); ton(NOTES[k - 1], .6, { gain: .2, type: "triangle", attaque: .03 }); ton(NOTES[k - 1] * 2, .6, { gain: .06 }); } }

  // Silence : musique, ambiance et voix se taisent ; il ne reste que la bête, bas, pour que le micro du téléphone ne l'entende pas.
  function silence(on) {
    if (AD || !ctx) return;
    const t = ctx.currentTime;
    [[busMus, .5], [busAmb, .7], [busVoix, 1], [busSfx, 1]].forEach(([b, normal]) => { b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(b.gain.value, t); b.gain.linearRampToValueAtTime(on ? (b === busSfx ? .3 : 0) : normal, t + (on ? .4 : 2)); });
  }
  function couper(v) { coupe = v; if (maitre) maitre.gain.value = v ? 0 : 1; }
  function volumeMusique(v) { if (busMus) busMus.gain.value = v; }

  G.Son = { AD, init(j) { J = j; }, occupe: () => !AD && !!ctx && !coupe && (performance.now() < occupeJusqu || !!(voixCourante && voixCourante.joue)), demarrer, jouer, ambiance, musique, voix, couperVoix, bips, note, chant: o => (AD ? decrire("BETE_CHANT") : !o && MEDIAS.has("BETE_CHANT") ? jouer("BETE_CHANT") : ctx && !coupe && chant(o)), silence, couper, volumeMusique, decrire, get coupe() { return coupe; }, NOTES };
})(window);
