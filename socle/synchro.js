/* ODICOLOR 2.0 — Socle 0 : synchronisation ordinateur ↔ téléphone (SIMULÉE en mémoire : aucun serveur, aucun réseau).
   Modèle « hors connexion d'abord » :
   - chaque appareil travaille seul et garde une file d'opérations ; il les envoie quand le réseau revient ;
   - le serveur contrôle chaque opération : appareil enregistré, auteur = titulaire de l'appareil, droits (droits.js),
     validité (modele.js) ; toute opération est tracée dans un journal d'audit en ajout seul ;
   - versions par champ : si le champ a changé ailleurs depuis la dernière synchronisation, c'est un CONFLIT :
     les deux valeurs sont conservées, rien n'est écrasé, un humain tranche ;
   - une opération reçue deux fois n'est appliquée qu'une fois (coupure réseau pendant l'envoi). */
(function (racine) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const M = node ? require('./modele.js') : racine.SocleModele;
  const D = node ? require('./droits.js') : racine.SocleDroits;

  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copie = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const nouvelId = () => (racine.crypto || require('node:crypto')).randomUUID();

  class Serveur {
    constructor({ horloge = () => new Date().toISOString(), genId = nouvelId } = {}) {
      this.objets = {}; this.appareils = new Map(); this.recus = new Map();
      this.flux = []; this.conflits = []; this.audit = []; this.seq = 0; this.horloge = horloge; this.genId = genId;
    }
    _obj(entite, uid) { return (this.objets[entite] || {})[uid] || null; }
    _utilisateur(uid) { const o = this._obj('utilisateur', uid); return o ? Object.assign({ uid }, o.valeurs) : null; }
    _tracer(e) { this.audit.push(Object.freeze(Object.assign({ n: this.audit.length + 1, le: this.horloge() }, e))); }

    // Mise en route : premiers comptes créés hors synchronisation (étape d'installation, tracée).
    initialiser(utilisateurs) {
      if (this.objets.utilisateur) throw new Error('Déjà initialisé.');
      for (const u of utilisateurs) {
        const err = M.valider('utilisateur', u); if (err.length) throw new Error('Compte invalide : ' + err.join(', '));
        this._ecrire('utilisateur', u.uid, Object.assign({}, u, { uid: undefined }), { auteur: 'installation', appareil: 'installation', opId: 'init-' + u.uid });
      }
    }
    // Un appareil est rattaché à UN compte ; le jeton n'est connu que de cet appareil.
    enregistrerAppareil(utilisateurUid, nom) {
      const u = this._utilisateur(utilisateurUid); if (!u || !u.actif) throw new Error('Compte absent ou désactivé.');
      const jeton = this.genId(); this.appareils.set(jeton, { utilisateurUid, nom, actif: true });
      this._tracer({ type: 'appareil', auteur: utilisateurUid, appareil: nom, statut: 'enregistre' });
      return jeton;
    }
    revoquerAppareil(jeton) { const a = this.appareils.get(jeton); if (a) { a.actif = false; this._tracer({ type: 'appareil', auteur: a.utilisateurUid, appareil: a.nom, statut: 'revoque' }); } }

    _ecrire(entite, uid, champs, meta) {
      if (!this.objets[entite]) this.objets[entite] = {};
      const o = this.objets[entite][uid] || (this.objets[entite][uid] = { valeurs: {}, versions: {} });
      const appliques = {};
      for (const [k, v] of Object.entries(champs)) { if (v === undefined) continue; o.valeurs[k] = copie(v); o.versions[k] = (o.versions[k] || 0) + 1; appliques[k] = copie(v); }
      this.seq++;
      this.flux.push({ seq: this.seq, entite, uid, champs: appliques, versions: Object.assign({}, o.versions), auteur: meta.auteur, opId: meta.opId });
      this._tracer({ type: 'ecriture', opId: meta.opId, auteur: meta.auteur, appareil: meta.appareil, entite, uid, champs: Object.keys(appliques), statut: 'applique' });
    }

    // op = { id, type: 'creer'|'modifier'|'importer', entite, uid, auteur, champs, base: { champ: version vue }, resout: [idConflit] }
    recevoir(jeton, op) {
      const app = this.appareils.get(jeton);
      const refus = motif => { const r = { statut: 'refuse', motif }; this._tracer({ type: 'refus', opId: op && op.id, auteur: op && op.auteur, appareil: app ? app.nom : 'inconnu', entite: op && op.entite, uid: op && op.uid, statut: 'refuse', motif }); if (op && op.id) this.recus.set(op.id, r); return r; };
      if (!app || !app.actif) return refus('Appareil inconnu ou révoqué.');
      if (!op || typeof op.id !== 'string') return refus('Opération illisible.');
      if (this.recus.has(op.id)) return Object.assign({}, this.recus.get(op.id), { dejaRecu: true });
      if (op.auteur !== app.utilisateurUid) return refus('L’auteur ne correspond pas au titulaire de l’appareil.');
      const u = this._utilisateur(op.auteur);
      const existant = this._obj(op.entite, op.uid);
      if ((op.type === 'creer' || op.type === 'importer') && existant) return refus('Objet déjà existant.');
      if (op.type === 'modifier' && !existant) return refus('Objet inconnu.');
      const avant = existant ? Object.assign({ uid: op.uid }, existant.valeurs) : null;
      const droit = D.peut(u, { type: op.type, entite: op.entite, avant, champs: op.champs });
      if (!droit.ok) return refus(droit.motif);

      // Détection des conflits champ par champ.
      const appliquer = {}, conflits = [];
      for (const [k, v] of Object.entries(op.champs || {})) {
        if (!existant) { appliquer[k] = v; continue; }
        const vue = (op.base || {})[k] || 0, actuelle = existant.versions[k] || 0;
        if (vue === actuelle || egal(existant.valeurs[k], v)) appliquer[k] = v;
        else {
          const c = { id: 'conflit-' + (this.conflits.length + 1), opId: op.id, entite: op.entite, uid: op.uid, champ: k, valeurServeur: copie(existant.valeurs[k]),
            valeurAppareil: copie(v), versionServeur: actuelle, auteur: op.auteur, appareil: app.nom, statut: 'ouvert' };
          this.conflits.push(c); conflits.push(c.id);
        }
      }
      const resultat = Object.assign({ uid: op.uid }, existant ? existant.valeurs : {}, appliquer);
      const err = M.valider(op.entite, resultat);
      if (err.length) return refus('Donnée invalide : ' + err.join(', '));
      if (Object.keys(appliquer).length) this._ecrire(op.entite, op.uid, appliquer, { auteur: op.auteur, appareil: app.nom, opId: op.id });
      for (const id of op.resout || []) { const c = this.conflits.find(x => x.id === id && x.uid === op.uid); if (c && c.statut === 'ouvert') { c.statut = 'resolu'; c.resoluPar = op.auteur; this._tracer({ type: 'conflit', opId: op.id, auteur: op.auteur, appareil: app.nom, uid: op.uid, statut: 'resolu', conflit: id }); } }
      if (conflits.length) this._tracer({ type: 'conflit', opId: op.id, auteur: op.auteur, appareil: app.nom, entite: op.entite, uid: op.uid, statut: 'ouvert', conflits });
      const r = { statut: conflits.length ? (Object.keys(appliquer).length ? 'partiel' : 'conflit') : 'applique', conflits, seq: this.seq };
      this.recus.set(op.id, r); return r;
    }

    // Changements depuis le curseur, filtrés selon les droits de lecture du titulaire de l'appareil.
    tirer(jeton, depuis = 0) {
      const app = this.appareils.get(jeton); if (!app || !app.actif) throw new Error('Appareil inconnu ou révoqué.');
      const u = this._utilisateur(app.utilisateurUid);
      return { curseur: this.seq, changements: this.flux.filter(f => f.seq > depuis).map(f => Object.assign({}, f, { champs: D.filtrerLecture(u, f.entite, f.champs) })).filter(f => f.champs) };
    }
    etatObjet(jeton, entite, uid) {
      const app = this.appareils.get(jeton); if (!app || !app.actif) throw new Error('Appareil inconnu ou révoqué.');
      const o = this._obj(entite, uid); return o ? { valeurs: copie(o.valeurs), versions: Object.assign({}, o.versions) } : null;
    }
    conflitsOuverts() { return this.conflits.filter(c => c.statut === 'ouvert').map(copie); }
  }

  class Appareil {
    constructor({ nom, jeton, auteur, genId = nouvelId }) { Object.assign(this, { nom, jeton, auteur, genId }); this.objets = {}; this.file = []; this.curseur = 0; this.alertes = []; }
    _obj(entite, uid, creer) { if (!this.objets[entite]) this.objets[entite] = {}; return this.objets[entite][uid] || (creer ? (this.objets[entite][uid] = { valeurs: {}, versions: {} }) : null); }
    lire(entite, uid) { const o = this._obj(entite, uid); return o ? Object.assign({ uid }, copie(o.valeurs)) : null; }
    liste(entite) { return Object.keys(this.objets[entite] || {}).map(uid => this.lire(entite, uid)); }
    _ajouter(type, entite, uid, champs) {
      const o = this._obj(entite, uid, true), base = {};
      for (const k of Object.keys(champs)) base[k] = o.versions[k] || 0;
      Object.assign(o.valeurs, copie(champs)); // effet immédiat sur l'appareil, même hors connexion
      // Plusieurs saisies hors connexion sur le même objet : regroupées dans l'opération en attente (sinon l'appareil
      // entrerait en conflit avec lui-même). La base reste celle vue avant la première saisie.
      const enAttente = type === 'modifier' && this.file.find(x => !x.envoyee && x.entite === entite && x.uid === uid && (x.type === 'creer' || x.type === 'modifier'));
      if (enAttente) {
        for (const k of Object.keys(champs)) if (!(k in enAttente.base)) enAttente.base[k] = base[k];
        Object.assign(enAttente.champs, copie(champs)); return enAttente;
      }
      const op = { id: this.genId(), type, entite, uid, auteur: this.auteur, champs: copie(champs), base };
      this.file.push(op); return op;
    }
    creer(entite, objet) { const { uid, ...champs } = objet; return this._ajouter('creer', entite, uid, champs); }
    importer(entite, objet) { const { uid, ...champs } = objet; return this._ajouter('importer', entite, uid, champs); }
    modifier(entite, uid, champs, resout) { const op = this._ajouter('modifier', entite, uid, champs); if (resout) op.resout = (op.resout || []).concat(resout); return op; }

    // reseau(n) : simule une coupure — renvoie false quand le réseau tombe avant l'envoi n, 'perdue' si la réponse se perd.
    synchroniser(serveur, reseau = () => true) {
      const bilan = { envoyees: 0, refusees: 0, conflits: 0, recues: 0 };
      while (this.file.length) {
        const op = this.file[0], etat = reseau(bilan.envoyees);
        if (etat === false) { bilan.interrompu = true; return bilan; }
        op.envoyee = true; // déjà parti : plus aucune saisie n'y sera regroupée (sinon perdue si renvoyée « déjà reçue »)
        const r = serveur.recevoir(this.jeton, op);
        if (etat === 'perdue') { bilan.interrompu = true; return bilan; } // envoyé mais réponse perdue : l'opération reste en file
        this.file.shift(); bilan.envoyees++;
        if (r.statut === 'refuse' || r.statut === 'conflit' || r.statut === 'partiel') {
          if (r.statut === 'refuse') bilan.refusees++; else bilan.conflits += r.conflits.length;
          this.alertes.push({ opId: op.id, entite: op.entite, uid: op.uid, statut: r.statut, motif: r.motif || '', conflits: r.conflits || [] });
          const vrai = serveur.etatObjet(this.jeton, op.entite, op.uid); // l'appareil reprend la valeur du serveur : rien n'est perdu (conflit conservé au serveur)
          if (vrai) this.objets[op.entite][op.uid] = vrai; else delete this.objets[op.entite][op.uid];
        }
      }
      const t = serveur.tirer(this.jeton, this.curseur);
      for (const c of t.changements) { const o = this._obj(c.entite, c.uid, true); Object.assign(o.valeurs, copie(c.champs)); o.versions = Object.assign({}, c.versions); bilan.recues++; }
      this.curseur = t.curseur; return bilan;
    }
  }

  const api = { Serveur, Appareil };
  if (node) module.exports = api;
  else racine.SocleSynchro = api;
})(typeof self !== 'undefined' ? self : this);
