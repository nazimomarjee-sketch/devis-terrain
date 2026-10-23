'use strict';
/* ODICOLOR — Accueil commercial v23.
   Vue terrain uniquement : ne modifie aucun devis, client, paiement ou historique.
   Les opportunités EBP sont utilisées uniquement si leurs preuves sont recevables. */
(function () {
  const lim = (s, n=180) => String(s == null ? '' : s).slice(0,n);
  const lien = (url, label, cls='sec') => h('a',{href:url,class:'btn '+cls},label);
  const p = (txt, cls='mut') => h('p',{class:cls},txt);
  const dateValide = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'');
  const montant = n => eur(Number(n)||0);
  const compteBloque = c => Boolean(c && c.compte && c.compte.statut==='bloque');
  const dateExport = pc => pc && dateValide(pc.arrete) ? 'EBP du '+dateFr(pc.arrete+'T12:00:00') : 'EBP non synchronisé';

  function carteObjectif(dv, pc, now) {
    const sw=semaineObj(dv,now), objectif=Math.max(0,Number(sw.cible)||0);
    const pct=objectif?Math.min(100,Math.round(sw.ca/objectif*100)):0;
    const source=pc && pc.chiffre && pc.chiffre.source==='import';
    const jourPc=pc && dateValide(pc.arrete) ? ecartJours(pc.arrete,now.getTime()) : Infinity;
    const ligne=source && jourPc>=0 && jourPc<=7
      ? dateExport(pc)+' · montants EBP à consulter sur Mon travail'
      : 'Données EBP non validées ou anciennes · chiffre issu du téléphone';
    return h('section',{class:'carte v23-objectif'},
      h('div',{class:'v23-between'},h('small',{class:'etiq'},'OBJECTIF · COMMANDES ENVOYÉES HT'),h('small',{class:'mut'},'Cette semaine')),
      h('div',{class:'v23-argent'},h('strong',{},montant(sw.ca)),h('span',{class:'mut'},objectif?' / '+montant(objectif):' · objectif à régler')),
      objectif?h('div',{class:'piste',role:'progressbar','aria-valuenow':pct,'aria-valuemin':'0','aria-valuemax':'100','aria-label':'Avancement de l’objectif hebdomadaire'},
        h('div',{class:'rempli',style:'width:'+pct+'%'})):null,
      h('p',{class:'mut'},objectif?(pct+' % · reste '+montant(Math.max(0,objectif-sw.ca))+' à commander'):'Définir un objectif pour suivre les ventes de la semaine.'),
      h('small',{class:'v23-source'},'Source : commandes que tu déclares envoyées · '+ligne),
      !objectif?lien('#/reglages','Régler mon objectif'):null);
  }

  function candidats(dv,cl,pc,tours) {
    const out=[], maintenant=Date.now(), today=jourLocal(maintenant), map=new Map(cl.map(c=>[c.id,c]));
    const ajouter=x=>{if(x&&x.titre&&x.url)out.push(x)};
    // Recouvrement saisi : priorité de contrôle, jamais preuve d'un reste EBP.
    const fEnRetard=factures(cl).filter(f=>!f.regleLe&&enRetard(f,maintenant))
      .sort((a,b)=>ecartJours(b.echeance,maintenant)-ecartJours(a.echeance,maintenant));
    fEnRetard.slice(0,3).forEach(f=>ajouter({rang:0,age:ecartJours(f.echeance,maintenant),euros:0,
      categorie:'RÈGLEMENT À VÉRIFIER',titre:f.client.nom,
      description:'Facture '+(f.num||'sans numéro')+' notée échue depuis '+ecartJours(f.echeance,maintenant)+' j sur le téléphone.',
      justification:'Source : saisie locale. Vérifier le solde et le règlement dans EBP avant toute relance chiffrée.',
      url:'#/client/'+f.client.id,bouton:'Contrôler le règlement'}));

    // Actions validées du plan PC, uniquement si l'export a une date récente et n'est pas une démo.
    const fresh=pc&&pc.chiffre&&pc.chiffre.source==='import'&&dateValide(pc.arrete)
      &&ecartJours(pc.arrete,maintenant)>=0&&ecartJours(pc.arrete,maintenant)<=7;
    if(fresh&&Array.isArray(pc.actions))pc.actions.filter(a=>a.prio===1&&a.statut!=='fait'&&a.statut!=='bloque'
      &&(!a.jourPrevu||a.jourPrevu<=today)&&a.preuve&&a.source)
      .slice(0,3).forEach(a=>ajouter({rang:0.5,age:0,euros:0,categorie:'PRIORITÉ DU PC',
        titre:lim(a.t),description:lim(a.d)||'Action signalée par le PC.',
        justification:'Source : '+lim(a.source,70)+' · '+lim(a.preuve,180)+' · '+dateExport(pc),
        url:'#/pc',bouton:'Traiter cette action'}));

    dv.filter(d=>d.statut==='accepte'&&!d.commandeLe&&Array.isArray(d.lignes)&&d.lignes.length)
      .forEach(d=>{const c=map.get(d.clientId),bloque=compteBloque(c),total=totaux(d).ht;
        ajouter({rang:bloque?0.8:1,age:0,euros:total,categorie:bloque?'COMPTE BLOQUÉ':'VENTE À CONCRÉTISER',
          titre:d.clientNom,description:(bloque?'Compte bloqué : ne pas envoyer la commande sans vérification.':'Devis accepté '+numero(d)+' · '+montant(total)+' HT · commande non déclarée envoyée.'),
          justification:'Source : devis et statut enregistrés sur ce téléphone. Accepté ne signifie pas commandé.',
          url:bloque&&c?'#/client/'+c.id:'#/devis/'+d.id,
          bouton:bloque?'Vérifier le compte':'Préparer la commande'});});
    dv.filter(d=>d.statut==='envoye'&&Array.isArray(d.lignes)&&d.lignes.length).forEach(d=>{
      const age=relanceDue(d,maintenant);if(age==null)return;
      ajouter({rang:2,age,euros:totaux(d).ht,categorie:'DEVIS À RELANCER',titre:d.clientNom,
        description:numero(d)+' · '+montant(totaux(d).ht)+' HT · sans réponse depuis '+age+' j.',
        justification:'Source : devis envoyé sur ton téléphone. Seuil de relance : '+(S.relanceJours||3)+' j (réglable).',
        url:'#/devis/'+d.id,bouton:'Relancer le devis'});});

    const tour=prochaineTournee(cl,dv,{tournees:tours},maintenant);
    if(tour)ajouter({rang:3,age:0,euros:0,categorie:'PROCHAINE VISITE',titre:tour.c.nom,
      description:'Garage '+tour.rang+'/'+tour.total+' de ta tournée du jour.',
      justification:'Source : tournée que tu as préparée · '+(tour.pourquoi||[]).slice(0,2).join(' · '),
      url:'#/client/'+tour.c.id,bouton:'Préparer ma visite'});
    cl.forEach(c=>(Array.isArray(c.essais)?c.essais:[]).forEach(e=>{
      if(!e||e.statut!=='encours'||!dateValide(e.date))return;
      const age=ecartJours(e.date,maintenant);if(age<2)return;
      ajouter({rang:4,age,euros:0,categorie:'ESSAI PRODUIT À SUIVRE',titre:c.nom,
        description:'Essai de '+lim(e.produit||'consommable',70)+' enregistré depuis '+age+' j.',
        justification:'Source : essai enregistré sur le téléphone. J+2 / J+7 sont des seuils de suivi, pas des besoins prouvés.',
        url:'#/client/'+c.id,bouton:'Faire le point sur l’essai'});}));
    const v22=window.__commercialV22;
    if(v22&&pc&&v22.fiabilite(pc).ok)cl.forEach(c=>{
      if(compteBloque(c))return;
      v22.signauxClient(pc,c,cl).forEach(s=>ajouter({
        rang:5,age:0,euros:0,categorie:s.type==='reconquete'?'CLIENT À RECONQUÉRIR':'ACHATS EN BAISSE',
        titre:c.nom,description:lim(s.titre||'Vérifier les besoins en consommables du garage.'),
        justification:'Source : '+lim(s.source||'export EBP',70)+' · '+lim(s.preuve||'preuves sur la fiche client',200),
        url:'#/client/'+c.id,bouton:'Préparer le réassort'}));
    });
    cl.forEach(c=>{if(compteBloque(c))return;const e=echeance(c,maintenant);
      if(!e||!e.du)return;
      ajouter({rang:6,age:e.jours||0,euros:0,categorie:'VISITE À PRÉPARER',titre:c.nom,
        description:e.rappel?'Rappel prévu dans la fiche client.':e.jours==null?'Premier contact à préparer.':'Dernière visite il y a '+e.jours+' j.',
        justification:'Source : fréquence de visite définie dans la fiche. Aucune consommation ou rupture de stock déduite.',
        url:'#/client/'+c.id,bouton:'Préparer la visite'});
    });
    out.sort((a,b)=>a.rang-b.rang||b.age-a.age||b.euros-a.euros||a.titre.localeCompare(b.titre,'fr'));
    return out;
  }

  function carteAction(actions){
    const a=actions[0]||{categorie:'DÉVELOPPER LE PORTEFEUILLE',titre:'Préparer la prochaine vente',
      description:'Aucune relance urgente enregistrée. Contacte un garage et identifie son prochain besoin en consommables.',
      justification:'Aucune consommation client n’est déduite sans données de commandes vérifiées.',
      url:'#/clients',bouton:'Voir les garages'};
    return h('section',{class:'carte v23-prochaine'},
      h('div',{class:'v23-between'},h('small',{class:'etiq'},'TA PROCHAINE ACTION'),h('span',{class:'tag '+(a.rang<=0.8?'ko':'warn')},a.categorie)),
      h('div',{class:'v23-client'},a.titre),
      p(a.description,'v23-description'),h('details',{class:'v23-preuve'},
        h('summary',{},'Pourquoi cette priorité ?'),
        p(a.justification)),
      lien(a.url,a.bouton,'v23-primary'),
      actions.length>1?h('details',{class:'v23-suite'},h('summary',{},'Ensuite : '+Math.min(2,actions.length-1)+' autre(s) action(s)'),
        actions.slice(1,3).map(x=>h('a',{class:'v23-next',href:x.url},
          h('strong',{},x.titre),h('span',{},x.categorie),h('small',{},lim(x.description,120))))):null);
  }

  function rechercheProduits(rapport){
    const input=h('input',{type:'search','aria-label':'Chercher dans le catalogue',
      placeholder:'Code, vernis, mastic, abrasif…',autocomplete:'off',spellcheck:'false'});
    const sortie=h('div',{class:'v23-resultats','aria-live':'polite'});
    const dessiner=()=>{
      const q=input.value.trim();
      if(!q){sortie.replaceChildren(p('Recherche par référence ou désignation du catalogue.'));return;}
      const trouves=chercher(q,7);
      sortie.replaceChildren(...(trouves.length?trouves.map(a=>h('a',{href:'#/article/'+encodeURIComponent(a.code),class:'v23-produit'},
        h('span',{},h('strong',{},a.des),h('small',{class:'mut'},'Réf. '+a.code)),
        h('span',{class:'prix'},montant(a.pu)+' HT'))):
        [p('Aucun article trouvé pour « '+lim(q,45)+' » dans ton catalogue. Vérifier la référence ou importer les tarifs.')]));
    };
    input.addEventListener('input',dessiner);
    const categories=['Vernis','Mastic','Abrasif','Masquage','Apprêt'];
    const chips=h('div',{class:'v23-chips'},categories.map(c=>h('button',{class:'v23-chip',type:'button',
      onclick:()=>{input.value=c;dessiner();}},c)));
    dessiner();
    const date=rapport&&rapport.date&&Number.isFinite(Date.parse(rapport.date))
      ? 'Dernier import tarifs : '+dateFr(rapport.date)
      : 'Tarifs importés : date non disponible';
    return h('section',{class:'carte v23-produits'},
      h('div',{class:'v23-between'},h('strong',{},'Trouver un produit'),lien('#/catalogue','Catalogue')),
      p('Vernis, mastic, abrasifs, masquage, apprêts : recherche dans tes références réelles.'),
      CAT.length?[input,chips,sortie,h('small',{class:'v23-source'},CAT.length+' références · '+date)]
        :[p('Catalogue vide : importe tes références et tarifs avant de chiffrer.'),lien('#/catalogue','Importer les tarifs')]);
  }

  function raccourcis(dv,pc){
    const a=dv.filter(d=>d.statut==='accepte'&&!d.commandeLe).length;
    const r=dv.filter(d=>relanceDue(d,Date.now())!=null).length;
    const pcAge=pc&&dateValide(pc.arrete)?ecartJours(pc.arrete,Date.now()):Infinity;
    return h('section',{class:'carte v23-raccourcis'},
      h('strong',{},'Mon activité commerciale'),
      h('div',{class:'v23-grid'},
        h('a',{href:'#/devis/acceptes'},h('b',{},a),h('span',{},'Devis acceptés sans commande')),
        h('a',{href:'#/devis/relancer'},h('b',{},r),h('span',{},'Devis à relancer')),
        h('a',{href:'#/opportunites'},h('b',{},'↗'),h('span',{},'Clients à reconquérir'))),
      h('div',{class:'v23-liens'},lien('#/tournee','Tournée'),lien('#/travail','Mon travail'),lien('#/pc','Lien PC')),
      h('small',{class:'v23-source'},pcAge>=0&&pcAge<=7?dateExport(pc):'Plan PC absent ou ancien : vérifier les données EBP avant décision.'));
  }

  pageAccueil=async function (){
    const [dv,cl,pc,tours,rapport]=await Promise.all([
      getAll('devis'),getAll('clients'),lirePC(),lireTournees(),get('meta','rapport_articles')]);
    const now=new Date(), JN=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const actions=candidats(dv,cl,pc,tours);
    montrer('Bonjour, '+(S.accueilNom||'Mr Omarjee'),
      h('small',{class:'v23-surtitre'},'VENTE CARROSSERIE · ACCUEIL COMMERCIAL'),
      carteObjectif(dv,pc,now),
      carteAction(actions),
      rechercheProduits(rapport),
      raccourcis(dv,pc),
      h('div',{class:'fab noprint'},h('a',{class:'btn gros noir',href:'#/nouveau'},'+ Nouveau devis')),
      h('div',{style:'height:85px'}));
    const sous=$('#sous');if(sous)sous.textContent=JN[now.getDay()]+' '+now.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})+' · Accueil v23';
  };

  // Le numéro du noyau d'origine n'est pas falsifié : l'extension annonce sa version propre.
  const precedentReglages=pageReglages;
  pageReglages=async function(){
    await precedentReglages();
    app.append(h('p',{class:'mut',style:'font-weight:700;text-align:center'},'Accueil commercial v23 · moteur existant conservé'));
  };
  window.__commercialAccueilV23={candidats};
})();
