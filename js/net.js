// Liaison entre la Station (hôte) et les téléphones.
// PeerJS ne sert qu'à la mise en relation ; ensuite tout passe en direct (WebRTC).
// Chaque téléphone a une identité stable (localStorage) : il retrouve son rôle après une coupure.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PREFIXE = 'kerguelen-2131-';
// Les relais TURN fournis par défaut avec PeerJS (eu-0/us-0.turn.peerjs.com) n'existent plus : on ne garde que deux STUN.
const OPTIONS = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } };

export function nouveauCode() {
  const a = new Uint32Array(4); crypto.getRandomValues(a);
  return [...a].map(n => ALPHABET[n % ALPHABET.length]).join('');
}

export function lienTelephone(code) {
  // La version son tourne en local : ses téléphones passent par la page publique.
  const u = new URL(document.body.dataset.tel || 'tel.html', location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('s', code);
  return u.href;
}

export class Hote {
  constructor(code, h) {
    this.code = code; this.h = h; this.liens = new Map();
    this.ouvrir();
  }
  ouvrir() {
    this.peer = new Peer(PREFIXE + this.code, OPTIONS);
    this.peer.on('open', () => this.h.ouvert && this.h.ouvert());
    this.peer.on('error', e => {
      if (e.type === 'unavailable-id') { setTimeout(() => { try { this.peer.destroy(); } catch (_) {} this.ouvrir(); }, 4000); return; }
      this.h.erreur && this.h.erreur(e);
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (_) {} });
    this.peer.on('connection', c => this.accepter(c));
  }
  accepter(c) {
    c.on('data', d => {
      if (d && d.t === 'bonjour') {
        const ancien = this.liens.get(d.id);
        if (ancien && ancien !== c) { try { ancien.close(); } catch (_) {} }
        c.ident = d.id; this.liens.set(d.id, c);
        this.h.arrivee && this.h.arrivee(d.id, d);
        return;
      }
      if (c.ident) this.h.message && this.h.message(c.ident, d);
    });
    const perdu = () => { if (c.ident && this.liens.get(c.ident) === c) { this.liens.delete(c.ident); this.h.depart && this.h.depart(c.ident); } };
    c.on('close', perdu); c.on('error', perdu);
  }
  envoyer(id, m) { const c = this.liens.get(id); if (c && c.open) { try { c.send(m); } catch (_) {} } }
  diffuser(m) { for (const id of this.liens.keys()) this.envoyer(id, m); }
  get ids() { return [...this.liens.keys()]; }
}

export class Client {
  constructor(code, h) {
    this.code = code; this.h = h; this.conn = null;
    let id = null;
    try { id = localStorage.getItem('krg-id'); } catch (_) {}
    if (!id) { id = 'T' + nouveauCode() + nouveauCode(); try { localStorage.setItem('krg-id', id); } catch (_) {} }
    this.id = id;
    this.relancer();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !this.ouvert) this.relancer(); });
  }
  get ouvert() { return !!(this.conn && this.conn.open); }
  relancer() {
    clearTimeout(this.minuteur);
    if (!this.peer || this.peer.destroyed) {
      this.peer = new Peer(OPTIONS);
      this.peer.on('open', () => this.appeler());
      this.peer.on('error', e => { if (e.type !== 'peer-unavailable') this.h.coupure && this.h.coupure(); this.plusTard(); });
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (_) {} });
      return;
    }
    if (this.peer.open) this.appeler(); else this.plusTard();
  }
  appeler() {
    if (this.ouvert) return;
    const c = this.peer.connect(PREFIXE + this.code, { reliable: true });
    c.on('open', () => { this.conn = c; c.send({ t: 'bonjour', id: this.id, ...(this.h.presentation ? this.h.presentation() : {}) }); this.h.connecte && this.h.connecte(); });
    c.on('data', d => this.h.message && this.h.message(d));
    const perdu = () => { if (this.conn === c) this.conn = null; this.h.coupure && this.h.coupure(); this.plusTard(); };
    c.on('close', perdu); c.on('error', perdu);
    this.plusTard(6000);
  }
  plusTard(ms = 3000) { clearTimeout(this.minuteur); this.minuteur = setTimeout(() => { if (!this.ouvert) this.relancer(); }, ms); }
  envoyer(m) { if (this.ouvert) { try { this.conn.send(m); } catch (_) {} } }
}
