// Les mécanismes : ce qui se manipule dans une carte ouverte, et les scènes plein écran
// (drone, reptation, fuite du labo, réacteur, éjection). Chaque fonction reçoit l'api du moteur.
(function (G) {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const MIN = 60000;
  let ecouteurs = {}; // réponses des téléphones, par nom d'instrument
  const M = {};

  M.message = (id, d) => { const f = ecouteurs[d.t]; if (f) f(d, id); };

  M.monter = (meca, zone, A) => {
    const f = MECAS[meca.kind];
    if (f) f(meca, zone, A);
  };
  function arret(f) { const el = $("#carte-grande"); const ancien = el._arret; el._arret = () => { ancien && ancien(); f(); }; }

  const MECAS = {
    // ——— Vannes du sas
    vannes(m, z, A) {
      let ouvertes = [];
      z.appendChild(h(`<div class="m-vannes"><div class="m-indic"><span class="voyant ambre clignote"></span><span>Voyant</span><span class="mano">0,4 bar</span><span>Manomètre</span></div>
        <div class="m-volants">${["A", "B", "C", "D"].map(l => `<button class="volant" data-l="${l}"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24"/><path d="M30 6v48M6 30h48M13 13l34 34M47 13L13 47"/><circle cx="30" cy="30" r="6"/></svg><span>${l}</span></button>`).join("")}</div>
        <p class="m-aide">Touchez les volants dans l'ordre. Le manuel indique l'ordre selon le voyant et la pression.</p></div>`));
      $$(".volant", z).forEach(b => b.onclick = () => {
        const l = b.dataset.l; if (ouvertes.includes(l)) return;
        if (m.ordre[ouvertes.length] !== l) { Son.jouer("SFX_VANNE_ERR"); A.ajouterBruit(10); A.toast("La vanne siffle, très fort. Vous la refermez en catastrophe. Tout est à refaire."); ouvertes = []; $$(".volant", z).forEach(x => x.classList.remove("ouvert")); return; }
        ouvertes.push(l); b.classList.add("ouvert"); Son.bips([[180]], { duree: .25 });
        if (ouvertes.length === 4) { A.fermerCarte(); A.effets(m.effets); }
      });
    },

    // ——— Porte du sas
    porte(m, z, A) {
      const S = A.S;
      z.appendChild(h(`<ul class="m-etat"><li class="${S.flags.pression ? "ok" : ""}">Pression : ${S.flags.pression ? "nominale" : "insuffisante"}</li><li class="${S.flags.adn ? "ok" : ""}">Contrôle biologique : ${S.flags.adn ? "fait" : "à faire"}</li><li>Badge : glissez une carte d'accès sur la porte.</li></ul>`));
    },
    grille(m, z) { z.appendChild(h(`<p class="m-aide">Glissez une clé de servitude sur la grille.</p>`)); },

    // ——— Contrôle biologique : un pouce par joueur
    pouce(m, z, A) {
      const total = Math.max(2, A.S.noms.filter(Boolean).length); let faits = 0;
      const el = h(`<div class="m-pouce"><p class="m-compte"><b>0</b> / ${total} empreintes</p><p class="m-aide">${A.aDesTels() ? "Chacun pose le pouce sur le cercle d'un téléphone, et le garde jusqu'au bout. Avec deux téléphones pour trois, l'un des deux sert deux fois." : "Maintenez le bouton, une fois par joueur."}</p><button class="btn m-tenir">Maintenir ici</button></div>`);
      z.appendChild(el);
      const un = () => { faits++; $("b", el).textContent = faits; Son.jouer("SFX_BIP_OK"); if (faits >= total) { A.instrument("pouce", { on: false }); delete ecouteurs.pouce; A.fermerCarte(); setTimeout(() => A.effets(m.effets), 300); } };
      A.instrument("pouce", { on: true, total });
      ecouteurs.pouce = un;
      tenir($(".m-tenir", el), 2500, un, true);
      arret(() => { A.instrument("pouce", { on: false }); delete ecouteurs.pouce; });
    },

    // ——— Molettes (chiffres ou lettres)
    molettes(m, z, A) {
      const jeu = m.lettres ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "0123456789", n = m.reponse.length, val = Array(n).fill(0);
      const el = h(`<div class="m-molettes">${val.map((_, i) => `<div class="molette" data-i="${i}"><button class="haut" aria-label="Plus">▲</button><span>${jeu[0]}</span><button class="bas" aria-label="Moins">▼</button></div>`).join("")}<button class="btn btn-principal m-ok">Ouvrir</button></div>`);
      z.appendChild(el);
      $$(".molette", el).forEach(w => { const i = +w.dataset.i, maj = d => { val[i] = (val[i] + d + jeu.length) % jeu.length; $("span", w).textContent = jeu[val[i]]; Son.bips([[2400]], { duree: .02 }); };
        $(".haut", w).onclick = () => maj(1); $(".bas", w).onclick = () => maj(-1); w.addEventListener("wheel", e => { e.preventDefault(); maj(e.deltaY < 0 ? 1 : -1); }, { passive: false }); });
      $(".m-ok", el).onclick = () => { const v = val.map(k => jeu[k]).join(""); if (v === m.reponse) { A.fermerCarte(); A.effets(m.effets); } else A.echec("Le cadenas ne cède pas.", 4); };
    },

    // ——— Clavier de service à douze touches
    clavier(m, z, A) {
      clavier(z, m.reponse.length, v => { if (v === m.reponse) { A.fermerCarte(); A.effets(m.effets); return true; } A.echec("Code refusé.", 6); return false; });
    },

    // ——— Choix
    choix(m, z, A) {
      const el = h(`<div class="m-choix"></div>`);
      m.options.forEach(o => { const b = document.createElement("button"); b.className = "btn"; b.textContent = o.label; b.onclick = () => { A.fermerCarte(); A.effets(o.effets); }; el.appendChild(b); });
      z.appendChild(el);
    },

    // ——— Le dictaphone du commandant : sa voix, et le spectre des quatre bips
    dictaphone(m, z, A) {
      const el = h(`<div class="m-dicta"><div class="d-ecran"><p>15/11 · 22:04 · 0:41</p><div class="d-onde">${Array.from({ length: 48 }, (_, i) => `<i style="height:${8 + Math.abs(Math.sin(i * 1.7) * 26) + (i % 5) * 3}px"></i>`).join("")}</div></div>
        <button class="btn m-lire">Écouter l'enregistrement</button>
        <div class="d-bips">${m.bips.map((p, i) => `<figure class="bip"><figcaption>Bip ${i + 1}</figcaption><div class="bip-axe">${p.map(f => `<span class="pic" style="left:${(f - 600) / 1000 * 100}%"><b>${f} Hz</b></span>`).join("")}<span class="gr" style="left:0">600</span><span class="gr" style="left:50%">1100</span><span class="gr" style="left:100%">1600</span></div></figure>`).join("")}</div>
        <p class="m-aide">En parlant, le commandant compose un code : le dictaphone a enregistré les quatre bips du clavier et affiche leurs fréquences.</p></div>`);
      z.appendChild(el);
      $(".m-lire", el).onclick = async () => { await A.interphone(["LEMAIRE_01"]); Son.bips(m.bips, { ecart: .45 }); $$(".bip", el).forEach((b, i) => setTimeout(() => { b.classList.add("vu"); }, i * 450)); };
    },

    // ——— Morse de la balise
    morse(m, z, A) {
      const MORSE = { A: ".-", B: "-...", S: "...", 1: ".----", 2: "..---", 3: "...--", 4: "....-" };
      const el = h(`<div class="m-morse"><div class="lampe-morse"></div><p class="m-aide">Le signal se répète. Point = court, trait = long.</p></div>`);
      z.appendChild(el);
      const lampe = $(".lampe-morse", el), u = 260, seq = [];
      for (const mot of m.message.split(" ")) { for (const l of mot) { for (const s of MORSE[l]) seq.push([s === "." ? u : u * 3, u]); seq[seq.length - 1][1] = u * 3; } seq[seq.length - 1][1] = u * 7; }
      let actif = true, i = 0;
      const pas = () => { if (!actif) return; const [on, off] = seq[i % seq.length]; lampe.classList.add("on"); Son.bips([[880]], { duree: on / 1000 }); setTimeout(() => { lampe.classList.remove("on"); setTimeout(pas, off); }, on); i++; if (i > seq.length) A.S.flags.morseLu = true; };
      pas(); arret(() => { actif = false; });
    },

    // ——— La vitre embuée : souffler
    souffle(m, z, A) {
      const S = A.S;
      const el = h(`<div class="m-vitre"><div class="vitre"><span class="ecrit">5812</span><div class="buee"></div></div><p class="m-aide">${A.telAvecMicro() ? "Soufflez fort et longtemps sur le micro d'un téléphone." : "Maintenez le bouton pour souffler sur la vitre."}</p><button class="btn m-tenir">Souffler</button></div>`);
      z.appendChild(el);
      const vitre = $(".vitre", el); let net = S.flags.vitre ? 1 : 0;
      const maj = () => { vitre.style.setProperty("--net", net.toFixed(3)); if (net >= 1 && !S.flags.vitre) { S.flags.vitre = true; A.sauver(); } };
      maj();
      ecouteurs.souffle = d => { net = Math.min(1, net + (d.force || .35)); maj(); };
      A.instrument("souffle", { on: true });
      tenir($(".m-tenir", el), 3000, () => { net = 1; maj(); }, false, p => { net = Math.max(net, p); maj(); });
      // la buée revient si on attend
      const t = setInterval(() => { if (!S.flags.vitre) { net = Math.max(0, net - .02); maj(); } }, 300);
      arret(() => { clearInterval(t); delete ecouteurs.souffle; A.instrument("souffle", { on: false }); });
    },

    // ——— Le spectrogramme du chant
    spectre(m, z, A) {
      const el = h(`<div class="m-spectre"><canvas width="760" height="360"></canvas><button class="btn btn-petit m-lire">${A.AD ? "Décrire le son" : "Écouter"}</button></div>`);
      z.appendChild(el);
      dessinerSpectre($("canvas", el), [2, 6, 7, 3]);
      $(".m-lire", el).onclick = () => Son.chant();
    },

    // ——— L'incubateur : huit notes
    notes(m, z, A) {
      let seq = [];
      const el = h(`<div class="m-notes"><div class="touches">${[1, 2, 3, 4, 5, 6, 7, 8].map(k => `<button class="touche" data-k="${k}" style="--h:${20 + k * 7}px"><span>${k}</span></button>`).join("")}</div><p class="m-saisie"></p><p class="m-aide">Quatre notes. De la plus grave (1) à la plus aiguë (8).</p></div>`);
      z.appendChild(el);
      $$(".touche", el).forEach(b => b.onclick = () => {
        const k = +b.dataset.k; Son.note(k); seq.push(k); $(".m-saisie", el).textContent = seq.join(" · ");
        b.classList.add("frappe"); setTimeout(() => b.classList.remove("frappe"), 200);
        if (seq.length === 4) {
          if (seq.join() === m.reponse.join()) { A.fermerCarte(); M.grappe(A); }
          else { A.echec("Le verrou reste fermé. La grappe palpite plus vite.", 6); seq = []; setTimeout(() => { $(".m-saisie", el).textContent = ""; }, 600); }
        }
      });
    },

    // ——— Le dictaphone de Varek : six enregistrements
    ecouteVarek(m, z, A) {
      const el = h(`<ol class="m-clips">${[1, 2, 3, 4, 5, 6].map(i => `<li><button class="btn btn-petit" data-c="VAREK_D${i}">Écouter</button> <span class="c-num">${i}</span> ${A.J.VOIX["VAREK_D" + i][2]}</li>`).join("")}</ol>`);
      z.appendChild(el);
      $$("button", el).forEach(b => b.onclick = () => A.interphone([b.dataset.c], { journal: false }));
    },

    // ——— La porte de la Chambre : son écran dit où on en est (badge, voix) et ce qu'elle attend ; le montage de la voix de Varek
    montage(m, z, A) {
      const S = A.S, badge = !!S.flags.badgeCommandant, dicta = A.enMain(90);
      const etat = (ok, oui, non) => `<span class="pt-etat ${ok ? "ok" : ""}">${ok ? oui : non}</span>`;
      z.appendChild(h(`<div class="doc-ecran pt-ecran">CHAMBRE DE VIGIE — ACCÈS RESTREINT<br>DEUX AUTORISATIONS D'OFFICIER REQUISES<br><br>
        1. BADGE D'OFFICIER ${etat(badge, "ACCEPTÉ — H. LEMAIRE, OFFICIER N° 1", "EN ATTENTE")}<br>
        2. EMPREINTE VOCALE ${etat(false, "", "EN ATTENTE")}<br><br>
        PHRASE D'AUTHENTIFICATION :<br>NOM · FONCTION · « J'AUTORISE L'ACCÈS » · CODE DU JOUR<br>
        CODE DU JOUR : AFFICHÉ SUR L'ÉCRAN DE QUART (PASSERELLE)</div>`));
      if (!badge) z.appendChild(h(`<p class="m-aide">Badge : glissez la carte d'un officier sur la porte.</p>`));
      if (!dicta) { z.appendChild(h(`<p class="m-aide">Voix : il faut la voix enregistrée d'un officier. Le seul officier qui vous ait parlé, c'était Varek.</p>`)); return; }
      // Les mots se coupent aussi après une apostrophe : « qu'officier » donne « qu' » et « officier ».
      const clips = [1, 2, 3, 4, 5, 6].map(i => ({ i, mots: A.J.VOIX["VAREK_D" + i][2].replace(/[.,:]/g, "").split(/\s+/).filter(Boolean).flatMap(w => { const k = w.indexOf("'"); return k > 0 && k < w.length - 1 ? [w.slice(0, k + 1), w.slice(k + 1)] : [w]; }) }));
      let montage = [];
      const el = h(`<div class="m-montage"><p class="m-aide">Voix : avec les six enregistrements du dictaphone de Varek, montez la phrase mot à mot. Touchez les mots dans l'ordre.</p>
        <div class="mt-clips">${clips.map(c => `<div class="mt-clip"><span class="c-num">${c.i}</span>${c.mots.map((w, k) => `<button class="mot" data-c="${c.i}" data-k="${k}">${w}</button>`).join("")}</div>`).join("")}</div>
        <div class="mt-piste"><span class="mt-label">Montage</span><div class="mt-mots"></div></div>
        <p class="mt-guide"><span>nom</span><span>fonction</span><span>« j'autorise l'accès »</span><span>code du jour</span></p>
        <div class="mt-actions"><button class="btn btn-petit mt-annuler">Retirer le dernier</button><button class="btn btn-petit mt-vider">Tout effacer</button><button class="btn btn-principal mt-envoyer">Transmettre à la porte</button></div></div>`);
      z.appendChild(el);
      const maj = () => { $(".mt-mots", el).innerHTML = montage.map(x => `<span class="mot-pose"><i>${x.c}</i>${x.w}</span>`).join(""); };
      $$(".mot", el).forEach(b => b.onclick = () => { montage.push({ c: +b.dataset.c, w: b.textContent }); maj(); });
      $(".mt-annuler", el).onclick = () => { montage.pop(); maj(); };
      $(".mt-vider", el).onclick = () => { montage = []; maj(); };
      $(".mt-envoyer", el).onclick = async () => {
        const norme = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’]/g, "'");
        const phrase = norme(montage.map(x => x.w).join(" ").replace(/' /g, "'"));
        const ok = phrase === "ilan varek officier scientifique j'autorise l'acces quarante-sept";
        if (ok && !S.flags.badgeCommandant) { A.toast("La voix est bonne. Il manque la première autorisation : un badge d'officier."); return; }
        if (!ok) { await A.interphone(["VIGIE_23"]); A.ajouterBruit(5); return; }
        S.flags.chambre = true; A.fermerCarte(); Son.jouer("SFX_PORTE"); A.sauver();
        await A.interphone(["VAREK_MONTAGE", "VIGIE_22"]);
        A.aller("vigie");
      };
    },

    // ——— Le terminal de VIGIE
    terminal(m, z, A) {
      const S = A.S;
      const el = h(`<div class="m-terminal"><div class="t-sortie"></div><form class="t-ligne"><span>&gt;</span><input autocomplete="off" spellcheck="false" aria-label="Commande"></form></div>`);
      z.appendChild(el);
      const sortie = $(".t-sortie", el), champ = $("input", el);
      const ecrire = (t, cls = "") => { const p = document.createElement("pre"); p.className = cls; p.textContent = t; sortie.appendChild(p); sortie.scrollTop = 1e6; };
      ecrire("VIGIE — intelligence de bord du KERGUELEN\nTapez AIDE pour la liste des commandes.");
      if (!S.vus.vigieBonjour) { S.vus.vigieBonjour = true; A.interphone(["VIGIE_14"]); }
      setTimeout(() => champ.focus(), 100);
      $("form", el).onsubmit = async e => {
        e.preventDefault(); const brut = champ.value.trim(); champ.value = ""; if (!brut) return;
        ecrire("> " + brut, "t-cmd"); Son.bips([[1500]], { duree: .03 });
        const c = brut.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
        S.vus.commandes = (S.vus.commandes || 0) + 1;
        if (c === "AIDE") ecrire("REGISTRE PORTES jj/mm · JOURNAL OUTILS jj/mm · ORDRE numéro · CONVENTION article · DESIGNER");
        else if (/^REGISTRE PORTES 16\/11/.test(c)) { ecrire(texte(A.J.CARTES[106].texte)); A.reveler(106); A.rendu(); A.S.flags.registres = !!A.enMain(107) || A.S.flags.registres; }
        else if (/^JOURNAL OUTILS 16\/11/.test(c)) { ecrire(texte(A.J.CARTES[107].texte)); A.reveler(107); A.rendu(); }
        else if (/^(REGISTRE PORTES|JOURNAL OUTILS) \d\d\/\d\d/.test(c)) ecrire("Rien de notable ce jour-là.");
        else if (/^ORDRE 11/.test(c)) ecrire("ORDRE 11-Δ — 15/11 — Rapatrier l'organisme et son hôte vivant. Équipage : priorité secondaire. Ne pas informer.\nCONTESTATION : I. VAREK, 15/11 23:40 — « Je refuse de mettre l'équipage en danger. » — REJETÉE.");
        else if (/^CONVENTION 7/.test(c)) ecrire("CONVENTION DE TITAN, ARTICLE 7 — Contamination d'un humain vivant : quarantaine obligatoire.\nPièces : preuve biologique · deux autorisations d'officier · désignation de l'hôte (heure du contact, trois preuves).");
        else if (/^DESIGNER/.test(c)) {
          if (!A.enMain(89)) ecrire("Preuve biologique absente. Désignation impossible.");
          else { ecrire("Protocole Q ouvert. Désignez l'hôte dans le dossier."); A.fermerCarte(); A.ouvrirDossier("accuser"); return; }
        }
        else { ecrire("Syntaxe inconnue. Voir le manuel de bord, niveau 4."); }
        if (A.enMain(106) && A.enMain(107)) S.flags.registres = true;
        // La lumière tombe au troisième ordre
        if (S.vus.commandes === 3 && !S.flags.silenceVigie) {
          S.flags.silenceVigie = true; A.sauver();
          await A.attendre(700); document.body.classList.add("panne"); await A.interphone(["VIGIE_13"]);
          const avant = S.bete.pos; S.bete.pos = "passerelle";
          const ok = await A.silence({ duree: 22000 });
          document.body.classList.remove("panne");
          if (!ok) { A.fermerCarte(); A.rencontre({ fuir: false }); } else { S.bete.pos = avant === "passerelle" ? "condA" : avant; ecrire("Mouvement : pont A → pont B."); }
        }
      };
    },

    // ——— Le pupitre d'annonces : le leurre
    leurre(m, z, A) {
      const S = A.S;
      if (!S.autod) { z.appendChild(h(`<p class="m-aide">Le pupitre est verrouillé : diffusion réservée aux situations d'urgence.</p>`)); return; }
      if (S.flags.leurre) { z.appendChild(h(`<p class="m-aide">L'alarme hurle encore, très loin, à la salle de sport.</p>`)); return; }
      const sections = [["cantine", "Cantine"], ["cabLemaire", "Cabines"], ["labo", "Labo"], ["sport", "Salle de sport"], ["caissons", "Salle des caissons"], ["machines", "Machines"], ["soute", "Soute à minerai"], ["coursiveC", "Coursive C"]];
      const el = h(`<div class="m-leurre"><p class="m-aide">Choisissez la section où diffuser l'alarme.</p><div class="l-sections">${sections.map(([id, nom]) => `<label><input type="radio" name="sec" value="${id}"> ${nom}</label>`).join("")}</div><button class="btn btn-principal">Diffuser</button></div>`);
      z.appendChild(el);
      $("button", el).onclick = async () => {
        const v = ($("input:checked", el) || {}).value; if (!v) return;
        A.fermerCarte(); Son.jouer("SFX_ALARME"); await A.interphone(["VIGIE_26"]);
        S.bete.fixe = v; S.bete.pos = v;
        if (v === "sport") { S.flags.leurre = true; A.billet("Au détecteur, le point quitte la coursive D, file vers l'avant, monte d'un pont… et s'arrête tout au fond, à la salle de sport. Il ne bouge plus. Elle écoute l'alarme."); }
        else if (v === "machines") A.billet("Le point descend vers les machines. À l'interphone, Jo, très bas : « Pas ici… pas ici, bon sang. » Puis plus rien. Le point reste là, juste à côté de la coursive D.");
        else A.billet("Le point se déplace, puis s'arrête. Elle écoute. Regardez bien où elle est, maintenant.");
        A.sauver(); A.rendu();
      };
    },

    // ——— Le pupitre de lancement de la chaloupe
    lancement(m, z, A) {
      const S = A.S;
      if (!S.flags.cleInseree) { z.appendChild(h(`<p class="m-aide">Les caches sont verrouillés. Il faut d'abord la clé.</p>`)); return; }
      let seq = [];
      // Les interrupteurs portent leur nom, gravé sous le cache ; l'ordre est au manuel (niveau 1, « Lancement de la chaloupe »).
      const NOMS = ["Largage", "Alimentation", "Pressurisation"];
      const el = h(`<div class="m-lance"><div class="inters">${[0, 1, 2].map(i => `<button class="inter" data-i="${i}" aria-label="${NOMS[i]}"><span class="cache"></span><span class="levier"></span><span class="inter-nom">${NOMS[i]}</span></button>`).join("")}</div><p class="m-aide">L'ordre de la procédure est au manuel de bord, niveau 1 : « Lancement de la chaloupe ».</p><p class="m-aide l-code-titre" hidden>Dernière étape : le matricule du pilote.</p><div class="l-code" hidden></div></div>`);
      z.appendChild(el);
      $$(".inter", el).forEach(b => b.onclick = () => {
        const i = +b.dataset.i; if (seq.includes(i)) return;
        if (m.ordre[seq.length] !== i) { A.echec("Alarme de séquence. Les interrupteurs retombent.", 8); seq = []; $$(".inter", el).forEach(x => x.classList.remove("on")); return; }
        seq.push(i); b.classList.add("on"); Son.bips([[600]], { duree: .1 });
        if (seq.length === 3) { $(".l-code-titre", el).hidden = false; const c = $(".l-code", el); c.hidden = false; clavier(c, 4, v => { if (v === m.code) { A.fermerCarte(); M.lancer(A); return true; } A.echec("Matricule refusé.", 6); return false; }); }
      });
    },
    drone(m, z, A) {
      const b = h(`<button class="btn btn-principal">Lancer le drone dans la ventilation</button>`); z.appendChild(b);
      if (!A.S.flags.grille) { b.disabled = true; z.appendChild(h(`<p class="m-aide">La grille de ventilation est encore fermée.</p>`)); return; }
      // Une fois au labo (chapitre IV et après), la reptation est faite : on ne la rejoue pas, elle relancerait le chapitre IV et ferait reparler Varek.
      if (A.S.chap >= 3) { b.remove(); z.appendChild(h(`<p class="m-aide">Le drone a fait son travail : le chemin des conduits jusqu'au labo est connu.</p>`)); return; }
      if (A.S.flags.route) { b.textContent = "Ramper jusqu'au labo"; b.onclick = () => { A.fermerCarte(); M.ramper(A); }; return; }
      b.onclick = () => { A.fermerCarte(); M.drone(A); };
    }
  };

  // ——— Outils
  function texte(html) { const d = document.createElement("div"); d.innerHTML = html.replace(/<br>/g, "\n"); return d.textContent; }
  function clavier(z, n, valider) {
    const el = h(`<div class="m-clavier"><div class="k-ecran">${"_".repeat(n)}</div><div class="k-touches">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "OK"].map(t => `<button data-t="${t}">${t}</button>`).join("")}</div></div>`);
    z.appendChild(el);
    const DTMF = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336] };
    let v = "";
    const maj = () => { $(".k-ecran", el).textContent = (v + "_".repeat(n)).slice(0, n); };
    $$("button", el).forEach(b => b.onclick = () => {
      const t = b.dataset.t;
      if (t === "C") v = ""; else if (t === "OK") { if (v.length === n && !valider(v)) { v = ""; } } else if (v.length < n) { v += t; Son.bips([DTMF[t]], { duree: .12 }); }
      maj();
    });
    const touche = e => { if (!el.isConnected) { document.removeEventListener("keydown", touche); return; } if (/^[0-9]$/.test(e.key)) $(`button[data-t="${e.key}"]`, el).click(); else if (e.key === "Enter") $(`button[data-t="OK"]`, el).click(); else if (e.key === "Backspace") { v = v.slice(0, -1); maj(); } };
    document.addEventListener("keydown", touche);
  }
  function tenir(bouton, ms, fait, repetable, progres) {
    let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); bouton.style.setProperty("--p", 0); t0 = 0; };
    const boucle = () => { const p = (performance.now() - t0) / ms; bouton.style.setProperty("--p", Math.min(1, p)); progres && progres(Math.min(1, p)); if (p >= 1) { stop(); fait(); if (!repetable) bouton.disabled = true; return; } raf = requestAnimationFrame(boucle); };
    bouton.addEventListener("pointerdown", e => { e.preventDefault(); t0 = performance.now(); boucle(); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => bouton.addEventListener(ev, stop));
  }
  M.clavierPorte = (A, { titre, reponse, reussite }) => {
    const m = $("#m-carte"), el = $("#carte-grande");
    el.className = "carte-grande sans-visuel t-meca";
    el.innerHTML = `<div class="cg-corps"><h2>${titre}</h2><div class="cg-texte">Un clavier à quatre chiffres.</div><div class="cg-meca"></div></div><button class="icone cg-fermer" data-fermer aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    clavier($(".cg-meca", el), reponse.length, v => { if (v === reponse) { A.fermerCarte(); Son.jouer("SFX_PORTE"); reussite(); return true; } A.echec("Code refusé.", 6); return false; });
    m.hidden = false;
  };

  function dessinerSpectre(c, sequence) {
    const g = c.getContext("2d"), W = c.width, H = c.height, x0 = 56, y0 = 18, w = W - x0 - 14, hh = H - y0 - 34;
    const fMin = 100, fMax = 520, y = f => y0 + hh - (f - fMin) / (fMax - fMin) * hh;
    g.fillStyle = "#05070a"; g.fillRect(0, 0, W, H);
    // bruit de fond
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(80,140,255,${Math.random() * .12})`; g.fillRect(x0 + Math.random() * w, y0 + Math.random() * hh, 2, 2); }
    // grille
    g.font = "12px 'IBM Plex Mono', monospace"; g.textAlign = "right";
    for (let f = fMin; f <= fMax; f += 10) { const yy = y(f); g.strokeStyle = f % 50 === 0 ? "rgba(200,220,255,.28)" : "rgba(200,220,255,.08)"; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + w, yy); g.stroke(); if (f % 50 === 0) { g.fillStyle = "#9fb3c8"; g.fillText(f + " Hz", x0 - 6, yy + 4); } }
    g.textAlign = "center"; g.fillStyle = "#9fb3c8"; [0, 1, 2, 3, 4].forEach(s => g.fillText(s + " s", x0 + s / 4 * w, H - 12));
    // les quatre notes et leurs harmoniques
    sequence.forEach((k, i) => {
      const f = Son.NOTES[k - 1], xa = x0 + (i * .95 + .15) / 4 * w, xb = xa + .8 / 4 * w;
      [[1, .95], [2, .45], [3, .22]].forEach(([mul, a]) => { const ff = f * mul; if (ff > fMax) return; const grad = g.createLinearGradient(xa, 0, xb, 0); grad.addColorStop(0, `rgba(255,200,90,0)`); grad.addColorStop(.12, `rgba(255,200,90,${a})`); grad.addColorStop(.85, `rgba(255,160,60,${a * .8})`); grad.addColorStop(1, `rgba(255,140,40,0)`); g.fillStyle = grad; g.fillRect(xa, y(ff) - 2.5, xb - xa, 5); });
    });
    g.strokeStyle = "rgba(200,220,255,.4)"; g.strokeRect(x0, y0, w, hh);
  }

  // ——————————————————————————————————————————————— Scènes plein écran
  function scene(classe, html) { const sc = $("#speciale"); sc.className = "speciale " + classe; sc.innerHTML = html; sc.hidden = false; return sc; }
  function finScene() { const sc = $("#speciale"); sc.hidden = true; sc.innerHTML = ""; ecouteurs = {}; }

  // ——— Le drone dans les conduits
  M.drone = (A) => {
    const C = A.J.CONDUITS, S = A.S;
    let ici = C.depart, choix = null, uv = false, uvMode = null, tUv = 0, retour = [];
    const telMvt = A.telAvecMouvement();
    const sc = scene("s-drone", `<div class="dr-vue"><div class="dr-img"></div><div class="dr-plaques"></div><div class="dr-uv"></div><div class="dr-osd"><span>DRONE D'INSPECTION · CAM 1</span><span class="dr-pos"></span><span class="dr-rec">● REC</span></div><p class="dr-impasse" hidden></p></div>
      <div class="dr-commandes"><p class="dr-consigne">${telMvt ? "Celui qui tient le téléphone le pose à plat dans la main : penchez à gauche ou à droite pour choisir une branche, vers l'avant pour avancer (sans branche choisie : tout droit), vers vous pour reculer." : "Flèches du clavier ou boutons : gauche / droite pour choisir, haut pour avancer (sans branche choisie : tout droit), bas pour reculer."}</p>
      <div class="dr-boutons"><button class="btn" data-d="gauche">←</button><button class="btn" data-d="toutdroit">↑ tout droit</button><button class="btn" data-d="droite">→</button><button class="btn btn-principal" data-d="avancer">Avancer</button><button class="btn" data-d="reculer">Reculer</button></div>
      <div class="dr-outils"><span><button class="btn" id="dr-plan">Plan de ventilation</button> <button class="btn" id="dr-uv">Lampe UV</button></span><form class="pioche dr-pioche"><label>Prendre</label><input inputmode="numeric" maxlength="3" placeholder="n°"><button class="btn btn-petit">OK</button></form><button class="btn" id="dr-quitter">Rappeler le drone</button></div></div>`);
    const vue = $(".dr-vue", sc), img = $(".dr-img", sc), plaques = $(".dr-plaques", sc), uvL = $(".dr-uv", sc), imp = $(".dr-impasse", sc);
    const POS = { gauche: [23, 38], droite: [75, 38], toutdroit: [50, 47] };
    const afficher = () => {
      const j = C.jonctions[ici];
      imp.hidden = true; img.style.backgroundImage = `url('${A.RACINE}img/l-conduit-jonction.jpg')`;
      img.style.transform = { J1: "", J2: "scaleX(-1)", J3: "scale(1.08)", J4: "scaleX(-1) scale(1.12)", J5: "scale(1.15) translateY(2%)" }[ici] || "";
      plaques.innerHTML = Object.entries(j.branches).map(([d, [num]]) => `<span class="plaque ${d}${choix === d ? " choisie" : ""}" style="left:${POS[d][0]}%;top:${POS[d][1]}%">${num}<i>${{ gauche: "←", droite: "→", toutdroit: "↑" }[d]}</i></span>`).join("");
      $(".dr-pos", sc).textContent = `jonction ${Object.values(j.branches).map(b => b[0]).join(" · ")}`;
      $$("[data-d]", sc).forEach(b => { const d = b.dataset.d; if (POS[d]) b.disabled = !j.branches[d]; });
      majUv();
    };
    const majUv = () => {
      const j = C.jonctions[ici]; uvL.innerHTML = "";
      vue.classList.toggle("uv-on", uv); vue.classList.toggle("uv-camera", uv && uvMode === "camera");
      if (uv && j && j.uv) {
        uvL.innerHTML = `<svg viewBox="0 0 100 56" preserveAspectRatio="none"><path class="trace" d="M50 30 C 48 34, 40 40, 30 41 S 16 40, 10 46"/><path class="trace fine" d="M52 24 C 51 27, 50 28, 50 30"/></svg><span class="uv-num" style="left:16%;top:62%">${C.trace.nombre}</span>`;
      }
    };
    const aller = d => {
      if (!C.jonctions[ici]) return;
      const b = C.jonctions[ici].branches[d]; if (!b) return;
      const [, dest] = b; Son.jouer("SFX_FOUILLE");
      if (dest === C.arrivee) { arrivee(); return; }
      if (C.impasses[dest]) { imp.hidden = false; imp.textContent = C.impasses[dest]; img.style.backgroundImage = `url('${A.RACINE}img/l-conduit-long.jpg')`; plaques.innerHTML = ""; uvL.innerHTML = ""; if (dest === "V1") { A.ajouterBruit(14); Son.jouer("SFX_LOQUET"); } else A.ajouterBruit(3, true); setTimeout(() => { choix = null; afficher(); }, 3600); return; }
      retour.push(ici); ici = dest; choix = null; afficher();
    };
    const reculer = () => { if (retour.length) { ici = retour.pop(); choix = null; afficher(); } };
    const arrivee = () => {
      S.flags.route = true; A.sauver();
      img.style.backgroundImage = `url('${A.RACINE}img/l-labo.jpg')`; img.style.transform = "scale(1.4) translate(4%, -6%)"; plaques.innerHTML = ""; uvL.innerHTML = "";
      imp.hidden = false; imp.textContent = "Une grille, et derrière, de la lumière froide. Le labo. Le drone s'arrête là : la voie est libre pour vous.";
      $(".dr-commandes", sc).innerHTML = `<button class="btn btn-principal" id="dr-ramper">Ramper jusqu'au labo</button>`;
      $("#dr-ramper").onclick = () => { stop(); M.ramper(A); };
    };
    const commande = d => {
      if (d === "avancer") { const j = C.jonctions[ici]; if (choix) aller(choix); else if (j && j.branches.toutdroit) aller("toutdroit"); else A.toast("Choisissez d'abord une branche : gauche ou droite."); }
      else if (d === "reculer") reculer();
      else { choix = d; afficher(); Son.bips([[900]], { duree: .04 }); }
    };
    $$("[data-d]", sc).forEach(b => b.onclick = () => commande(b.dataset.d));
    const clavierDr = e => { const k = { ArrowLeft: "gauche", ArrowRight: "droite", ArrowUp: choix ? "avancer" : "toutdroit", ArrowDown: "reculer" }[e.key]; if (k) { e.preventDefault(); commande(k); } };
    document.addEventListener("keydown", clavierDr);
    // Inclinaison du téléphone
    let etatIncl = null, depuis = 0;
    ecouteurs.incl = d => {
      const g = d.g, b = d.b; let e = null;
      if (g < -18) e = "gauche"; else if (g > 18) e = "droite"; else if (b < -18) e = "avancer"; else if (b > 26) e = "reculer";
      if (e !== etatIncl) { etatIncl = e; depuis = performance.now(); return; }
      if (e && performance.now() - depuis > 650) { depuis = performance.now() + 900; if (e === "gauche" || e === "droite") { const j = C.jonctions[ici]; if (j && !j.branches[e] && j.branches.toutdroit) e = "toutdroit"; } commande(e); }
    };
    if (telMvt) A.instrument("drone", { on: true }, telMvt[0]);
    // Lampe UV : par la caméra d'un téléphone, ou à l'écran si aucun
    const basculeUv = (on, mode) => { uv = on; uvMode = mode; tUv = performance.now(); $("#dr-uv").classList.toggle("actif", on); majUv(); };
    ecouteurs.uv = d => basculeUv(!!d.on, "camera");
    $("#dr-uv").onclick = () => {
      if (A.aDesTels() && !uv) { A.instrument("uv", { on: true }); A.toast("La lampe UV est allumée. Sur un téléphone, touchez « Caméra UV » et filmez l'écran : la lumière UV n'apparaît qu'à travers lui."); basculeUv(true, "camera"); }
      else if (!uv) basculeUv(true, "ecran"); else { basculeUv(false, null); A.instrument("uv", { on: false }); }
    };
    const vu = setInterval(() => { if (uv && ici === C.trace.jonction && performance.now() - tUv > 1500 && !S.flags.uvVu) { S.flags.uvVu = true; A.sauver(); } }, 400);
    $(".dr-pioche", sc).onsubmit = e => { e.preventDefault(); const champ = $("input", e.target), n = parseInt(champ.value, 10); champ.value = ""; if (n === C.trace.nombre && S.flags.uvVu) { A.reveler(n); S.flags.trace = true; A.sauver(); A.rendu(); Son.jouer("SFX_BIP_OK"); A.toast("Carte 73 ramassée : le trajet de la larve."); } else { Son.jouer("SFX_BIP_NON"); A.ajouterBruit(3); } };
    const stop = () => { document.removeEventListener("keydown", clavierDr); clearInterval(vu); A.instrument("drone", { on: false }); A.instrument("uv", { on: false }); finScene(); };
    $("#dr-quitter").onclick = () => { stop(); A.rendu(); };
    // Le schéma de ventilation du manuel (niveau 2), aussi sur le grand écran dès que FULMAR a été tapé dans le manuel.
    $("#dr-plan").onclick = () => {
      const ouvert = $(".dr-plan", sc);
      if (ouvert) { ouvert.remove(); $("#dr-plan").classList.remove("actif"); return; }
      if (!S.flags.fulmar) { A.toast("Le schéma de ventilation est au manuel, niveau 2. Il faut d'abord trouver son mot de passe."); return; }
      const p = document.createElement("div"); p.className = "dr-plan";
      p.innerHTML = `<p class="dr-plan-titre">Manuel, niveau 2 — schéma de ventilation</p>${A.J.SCHEMA_CONDUITS}`;
      vue.appendChild(p); $("#dr-plan").classList.add("actif");
    };
    afficher();
  };

  // ——— Ramper jusqu'au labo
  M.ramper = async (A) => {
    const S = A.S;
    const sc = scene("s-ramper", `<div class="rp-img"></div><p class="rp-texte"></p>`);
    const img = $(".rp-img", sc), txt = $(".rp-texte", sc);
    const plan = async (image, texte, ms, transform = "") => { img.style.backgroundImage = `url('${A.RACINE}img/${image}.jpg')`; img.style.transform = transform; txt.textContent = texte; txt.classList.add("visible"); await A.attendre(ms); txt.classList.remove("visible"); };
    Son.ambiance("AMB_CONDUITS");
    await plan("l-conduit-long", "Vous rampez l'un derrière l'autre. Le métal est froid, mouillé. Vos genoux font un bruit terrible, à chaque mouvement.", 6000, "scale(1.05)");
    await plan("l-conduit-long", "Quelque chose, loin devant, gratte le métal. Puis se tait.", 4000, "scale(1.12)");
    Son.jouer("BETE_COURSE");
    const ok = await A.silence({ duree: 20000, video: "v-conduit" });
    if (!ok) { finScene(); await A.rencontre({ fuir: false }); if (A.S.etape !== "jeu") return; M.ramper2(A); return; }
    M.ramper2(A);
  };
  M.ramper2 = async (A) => {
    const sc = scene("s-ramper", `<div class="rp-img"></div><div class="rp-tete"></div><p class="rp-texte"></p>`);
    const img = $(".rp-img", sc), txt = $(".rp-texte", sc), tete = $(".rp-tete", sc);
    img.style.backgroundImage = `url('${A.RACINE}img/l-conduit-long.jpg')`; img.style.transform = "scale(1.1)";
    txt.textContent = "Le conduit 55. Tout au bout, une grille, et de la lumière froide : le labo."; txt.classList.add("visible");
    await A.attendre(3500);
    if (A.VIDEOS.has("v-tete")) { const m = A.media("v-tete"); m.classList.add("rp-video"); sc.appendChild(m); await A.attendre(4200); m.remove(); }
    else { tete.style.backgroundImage = `url('${A.RACINE}img/b-tete.jpg')`; tete.classList.add("passe"); Son.jouer("BETE_CLICS"); await A.attendre(1400); }
    txt.textContent = "Au bout du conduit, une tête sans yeux a traversé votre lumière. Elle ne s'est pas arrêtée. Vous ne bougez plus pendant une éternité.";
    await A.attendre(5200); txt.classList.remove("visible");
    finScene();
    if (A.S.chap < 3) A.chapitre(3); else A.rendreLieu("labo");   // jamais de retour en arrière d'un chapitre
  };

  // ——— La grappe, puis la mort de Varek et la fuite
  M.grappe = async (A) => {
    const S = A.S;
    A.defausser(87); A.reveler(89); S.flags.grappe = true; A.sauver(); A.rendu();
    Son.jouer("SFX_INCUBATEUR"); A.ajouterBruit(40);
    await A.attendre(1800);
    const sc = scene("s-fuite", `<div class="fu-media"></div><div class="fu-choix" hidden><p class="fu-titre">FUYEZ</p><div class="fu-boutons"><button class="btn" data-s="porte">La porte du labo</button><button class="btn" data-s="conduit">Le conduit</button></div><div class="fu-temps"><i></i></div></div>`);
    $(".fu-media", sc).appendChild(A.media(null, { image: "l-labo" }));
    await A.interphone(["VAREK_10"]);
    A.flash("#fff"); document.body.classList.add("secousse");
    $(".fu-media", sc).innerHTML = ""; $(".fu-media", sc).appendChild(A.media(A.VIDEOS.has("v-labo") ? "v-labo" : null, { image: "b-tete" }));
    Son.jouer("BETE_ATTAQUE"); sc.classList.add("strobo");
    await A.attendre(A.VIDEOS.has("v-labo") ? 4600 : 2200);
    document.body.classList.remove("secousse");
    S.flags.varekMort = true; A.sauver();
    const ch = $(".fu-choix", sc); ch.hidden = false;
    const barre = $(".fu-temps i", sc); barre.style.transition = "width 9s linear"; requestAnimationFrame(() => barre.style.width = "0%");
    const choix = await new Promise(r => { const t = setTimeout(() => r(null), 9000); $$("[data-s]", sc).forEach(b => b.onclick = () => { clearTimeout(t); r(b.dataset.s); }); });
    sc.classList.remove("strobo"); finScene();
    S.lieu = "coursiveC";
    if (choix !== "porte") await A.rencontre({ fuir: false });
    if (A.S.etape !== "jeu") return;
    A.billet(choix === "porte" ? "La porte du labo s'ouvre de l'intérieur. Vous déboulez dans la coursive C et vous courez jusqu'à ne plus pouvoir. Derrière vous, plus aucun bruit. C'est ça, le pire.<br><br>Dans la fuite, vous l'avez vu tomber : le <b>dictaphone de Varek</b> est resté par terre, au labo." : "Vous avez fini par sortir, sans savoir comment. Varek n'a plus jamais rien dit.<br><br>Dans la fuite, vous l'avez vu tomber : le <b>dictaphone de Varek</b> est resté par terre, au labo.");
    A.quandBilletsFinis(() => A.chapitre(4));
  };

  // ——— Accusation juste → chapitre VI
  M.accusationJuste = async (A) => {
    const S = A.S;
    Son.jouer("SFX_BIP_OK");
    await A.interphone(["VIGIE_16"]);
    await A.attendre(1200);
    await A.interphone(["BRANDT_08"]);
    S.autod = { restant: 15 * MIN, ecoule: 0 };
    A.sauver();
    await A.chapitre(5);
  };
  M.reprendreChaloupe = () => {};

  // ——— La chaloupe part
  M.lancer = async (A) => {
    const S = A.S;
    S.flags.lancee = true; A.sauver();
    Son.jouer("SFX_LARGAGE");
    if (S.rencontres >= 2) { const ok = await M.ejection(A); if (!ok) return; }
    await A.cine([{ video: "v-chaloupe", image: "c-chaloupe", texte: "La chaloupe se détache du Kerguelen. Par le hublot, la coque immense défile, puis s'éloigne." }]);
    if (S.flags.reacteurOk) { A.fin("quarantaine"); return; }
    // On attend le message de la Compagnie, au plus tard vingt-cinq secondes après le départ
    A.ecran("table"); A.rendreLieu("chaloupe");
    if (!S.autod.override) S.autod.ecoule = Math.max(S.autod.ecoule, 11 * MIN - 25000);
  };

  // ——— L'éjection du passager clandestin
  M.ejection = async (A) => {
    const sc = scene("s-ejection", `<div class="ej-img"></div><p class="ej-texte">Le détecteur se remet à biper. Ici. Dans trois mètres sur deux.</p>`);
    $(".ej-img", sc).style.backgroundImage = `url('${A.RACINE}img/l-chaloupe.jpg')`;
    Son.jouer("BETE_RESPIRE"); await A.attendre(3500);
    finScene();
    const ok = await A.silence({ duree: 16000 });
    if (!ok) { A.fin("silence"); return false; }
    const sc2 = scene("s-ejection", `<div class="ej-img"></div><p class="ej-texte">Elle s'est figée contre le sas extérieur, la tête tournée vers le bruit des moteurs. Maintenant.</p><button class="btn btn-danger ej-bouton">Maintenir : éjection d'urgence</button>`);
    $(".ej-img", sc2).style.backgroundImage = `url('${A.RACINE}img/l-chaloupe.jpg')`;
    await new Promise(r => tenir($(".ej-bouton", sc2), 5000, r, false));
    await A.interphone(["VIGIE_27"]);
    Son.jouer("BETE_CRI"); A.flash("#fff");
    $(".ej-texte", sc2).textContent = "Le sas s'ouvre. L'air part d'un coup, et elle avec, dans un dernier cri que le vide avale.";
    await A.attendre(4000); finScene();
    return true;
  };

  // ——— Le message de la Compagnie, et le réacteur
  M.override = async (A) => {
    const S = A.S;
    await A.interphone(["VIGIE_18"]);
    await A.interphone(["BRANDT_09"]);
    M.reacteur(A);
  };
  M.reacteur = (A) => {
    const S = A.S;
    const sc = scene("s-reacteur", `<div class="re-img"></div>
      <div class="re-jauges"><div class="re-aig" data-a="1"><b>1</b><span></span></div><div class="re-aig" data-a="2"><b>2</b><span></span></div><div class="re-aig" data-a="3"><b>3</b><span></span></div><div class="re-voyant"><b>Voyant</b><span></span></div></div>
      <div class="re-commandes"><div class="re-vanne"><b>Vanne</b><button class="btn" data-v="fermer">Fermer</button><button class="btn" data-v="ouvrir">Ouvrir</button></div>
      <div class="re-leviers"><b>Leviers</b>${[1, 2, 3, 4].map(k => `<button class="btn levier" data-l="${k}">${k}</button>`).join("")}</div>
      <div class="re-surcharge"><button class="btn btn-danger re-bouton">Surcharge (maintenir)</button></div></div>
      <div class="re-temps"><span>Jo</span><i></i></div>`);
    $(".re-img", sc).style.backgroundImage = `url('${A.RACINE}img/l-reacteur.jpg')`;
    // Le mot du niveau 5 n'est dit qu'une fois, par Jo : il reste affiché pendant toute la scène.
    sc.insertBefore(h(`<p class="re-mot"><span>Jo, à l'interphone</span> « Le manuel, dernier niveau. Le mot, c'est <b>DÉSOLATION</b>. »</p>`), $(".re-commandes", sc));
    let etape = 1, leviers = [], fini = false, debut = performance.now(), DUREE = 150000;
    const aig = { 1: "rouge", 2: "vert", 3: "vert" }, voy = "orange clignotant";
    const maj = () => { $$(".re-aig", sc).forEach(a => { const k = a.dataset.a; $("span", a).textContent = aig[k]; a.classList.toggle("rouge", aig[k] === "rouge"); }); $(".re-voyant span", sc).textContent = etape >= 2 ? voy : "—"; $(".re-voyant", sc).classList.toggle("clignote", etape >= 2); sc.dataset.etape = etape; };
    maj();
    A.interphone(["BRANDT_10", "BRANDT_11"]);
    const rate = (msg) => { A.interphone(["BRANDT_16"]); A.toast(msg); leviers = []; };
    $$("[data-v]", sc).forEach(b => b.onclick = () => {
      if (etape !== 1) return;
      if (b.dataset.v === "fermer") { etape = 2; Son.jouer("SFX_COFFRE"); maj(); A.interphone(["BRANDT_12"]); } else rate("Ce n'était pas ça.");
    });
    $$(".levier", sc).forEach(b => b.onclick = () => {
      if (etape !== 2) return;
      const ordre = [3, 1, 4, 2]; leviers.push(+b.dataset.l); b.classList.add("tire");
      if (leviers[leviers.length - 1] !== ordre[leviers.length - 1]) { $$(".levier", sc).forEach(x => x.classList.remove("tire")); rate("Les leviers retombent."); return; }
      Son.jouer("SFX_CASIER");
      if (leviers.length === 4) { etape = 3; maj(); Son.jouer("SFX_FOUR"); A.interphone(["BRANDT_13"]); setTimeout(() => { aig[2] = "rouge"; maj(); }, 7000); setTimeout(() => { aig[3] = "rouge"; maj(); A.interphone(["BRANDT_14"]); }, 15000); }
    });
    tenir($(".re-bouton", sc), 5000, () => {
      if (etape !== 3) return;
      if (aig[2] !== "rouge" || aig[3] !== "rouge") { rate("Trop tôt : une seule aiguille est dans le rouge."); return; }
      gagner();
    }, true);
    const barre = $(".re-temps i", sc);
    const t = setInterval(() => { const p = 1 - (performance.now() - debut) / DUREE; barre.style.width = Math.max(0, p * 100) + "%"; if (p <= .35 && !sc.dataset.proche) { sc.dataset.proche = 1; Son.jouer("BETE_RACLE"); } if (p <= 0 && !fini) { fini = true; clearInterval(t); finScene(); A.fin("gateway"); } }, 200);
    const gagner = async () => {
      if (fini) return; fini = true; clearInterval(t);
      await A.interphone(["BRANDT_15"]); Son.jouer("BETE_CRI"); await A.attendre(800);
      finScene(); S.flags.reacteurOk = true; A.sauver();
      await A.interphone(["VIGIE_28"]);
      if (S.flags.lancee) { A.fin("quarantaine"); return; }
      S.autod.restant = Math.min(S.autod.restant, 60000);
      A.billet("<b>Soixante secondes.</b> Le réacteur va sauter. Lancez la chaloupe.");
    };
  };

  G.Mecas = M;
})(window);
