'use strict';
/* ODICOLOR v24 — besoins produit réellement constatés.
 * Stockage uniquement dans les fiches clients IndexedDB :
 * les sauvegardes JSON existantes incluent déjà ces fiches.
 * Une piste vendeur n'est jamais présentée comme une demande client.
 */
(function () {
  const TYPES = ['Vernis','Durcisseur / diluant','Mastic','Abrasifs','Masquage','Apprêt','Polissage','Consommables atelier','Autre'];
  const SUITES = [['devis','Faire un devis'],['rappel','Rappeler le garage'],['essai','Organiser ou suivre un essai'],['aucun','Information seulement']];
  const texte = (v,n=300)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const jour = ()=>jourLocal(new Date());
  const actif = x=>x&&x.statut==='ouvert'&&x.suite!=='aucun';
  const needs = c=>Array.isArray(c.besoinsProduits)?c.besoinsProduits.filter(x=>x&&typeof x==='object'):[];
  const bouton = (url,t,cls='sec')=>h('a',{class:'btn '+cls,href:url},t);
  const legende = b => b.source==='client'?'Demande exprimée par le client':'Piste du vendeur · à qualifier';
  function datePropre(x){return /^\d{4}-\d{2}-\d{2}$/.test(x||'')?x:'';}
  function nombreOuverts(c){return needs(c).filter(actif).length;}
  function carteBesoin(b,c,termine){
    const n=h('div',{class:'v24-entry'},
      h('div',{class:'v24-between'},h('strong',{},b.famille||'Consommable'),h('small',{class:'mut'},datePropre(b.suiviLe)?'Prévu : '+dateFr(b.suiviLe+'T12:00:00'):'Sans date')),
      h('p',{},texte(b.detail,300)),
      h('small',{class:'mut'},legende(b)+' · saisi le '+(b.creeLe?dateFr(b.creeLe):'?')+(b.statut==='traite'?' · suivi traité':'')),
      h('div',{class:'actions'},bouton('#/client/'+c.id,'Fiche client')));
    if(termine&&actif(b)){
      const bt=h('button',{class:'btn sec',onclick:async()=>{
        const frais=await get('clients',c.id);
        if(!frais)return;
        const found=needs(frais).find(x=>x.id===b.id);
        if(!found||found.statut!=='ouvert')return;
        found.statut='traite';found.traiteLe=new Date().toISOString();
        await putMany('clients',[frais]);
        toast('Suivi marqué traité, sans déclarer de commande.');
        pageBesoinsClient(c.id);
      }},'Suivi traité');
      n.querySelector('.actions').append(bt);
    }
    return n;
  }

  async function pageBesoins(){
    const cl=(await getAll('clients')).sort((a,b)=>String(a.nom).localeCompare(String(b.nom),'fr'));
    const ouverts=cl.flatMap(c=>needs(c).filter(actif).map(b=>({c,b})))
      .sort((a,b)=>(a.b.suiviLe||'9999-12-31').localeCompare(b.b.suiviLe||'9999-12-31'));
    const rech=h('input',{type:'search',placeholder:'Chercher le nom d’un garage…','aria-label':'Chercher un client'});
    const zone=h('div',{'aria-live':'polite'});
    const rendre=()=>{
      const q=normNom(rech.value);
      const choix=cl.filter(c=>normNom(c.nom).includes(q)).slice(0,q?40:12);
      zone.replaceChildren(...choix.map(c=>h('a',{class:'v24-garage',href:'#/besoin/'+c.id},
        h('span',{},h('strong',{},c.nom),h('small',{class:'mut'},nombreOuverts(c)+' besoin(s) à suivre')),
        h('span',{class:'tag'},'Noter un besoin'))));
      if(!choix.length)zone.append(h('p',{class:'mut'},cl.length?'Aucun garage correspondant.':'Aucun client importé.'));
    };
    rech.addEventListener('input',rendre);
    montrer('Besoins produits',
      h('div',{class:'carte v24-intro'},h('strong',{},'Vendre des consommables, sans supposer les stocks des clients'),
        h('p',{class:'mut'},'Note la demande réelle du garage ou ta propre piste de vente. Une saisie vendeur ne devient jamais une preuve de besoin client.')),
      h('div',{class:'carte'},h('strong',{},'1. Choisir un garage'),rech,zone,
        !cl.length?bouton('#/clients','Importer mes clients'):null),
      h('h2',{},'2. Suivis produits en cours · '+ouverts.length),
      ouverts.length?ouverts.slice(0,15).map(({c,b})=>h('a',{class:'carte v24-follow',href:'#/besoin/'+c.id},
        h('div',{class:'v24-between'},h('strong',{},c.nom),h('span',{class:'tag warn'},b.famille)),
        h('p',{},texte(b.detail,160)),
        h('small',{class:'mut'},legende(b)+' · '+(b.suiviLe?'à suivre le '+dateFr(b.suiviLe+'T12:00:00'):'date à définir')))):
        h('p',{class:'mut'},'Aucun suivi produit ouvert pour le moment.'));
    rendre();
  }

  async function pageBesoinsClient(id) {
    const c=await get('clients',id);
    if(!c)return nonTrouve();
    const famille=h('select',{'aria-label':'Famille de produit'},TYPES.map(t=>h('option',{value:t},t)));
    const source=h('select',{'aria-label':'Origine du besoin'},
      h('option',{value:'client'},'Demande confirmée par le client'),
      h('option',{value:'vendeur'},'Piste envisagée par moi'));
    const detail=h('textarea',{rows:3,maxlength:300,placeholder:'Ex. Le carrossier demande un devis pour du mastic polyester en cartons.','aria-label':'Observation ou demande'});
    const suite=h('select',{'aria-label':'Prochaine action'},SUITES.map(([v,t])=>h('option',{value:v},t)));
    const suivi=h('input',{type:'date','aria-label':'Date de suivi'});
    const erreur=h('div',{role:'status',class:'mut'});
    const sauver=async()=>{
      const note=texte(detail.value);
      if(note.length<8){erreur.textContent='Décris précisément ce que tu as appris (8 caractères minimum).';return;}
      if(suite.value!=='aucun'&&!datePropre(suivi.value)){
        erreur.textContent='Choisis une date pour cette action, afin qu’elle ne soit pas oubliée.';return;
      }
      const rec=await get('clients',id);
      if(!rec){erreur.textContent='Garage introuvable.';return;}
      const historique=needs(rec);
      if(historique.length>=150){erreur.textContent='Historique important : exporte une sauvegarde avant de continuer.';return;}
      historique.push({id:nouvelUid(),creeLe:new Date().toISOString(),
        famille:famille.value,source:source.value,detail:note,suite:suite.value,
        suiviLe:datePropre(suivi.value),statut:suite.value==='aucun'?'traite':'ouvert'});
      rec.besoinsProduits=historique;
      await putMany('clients',[rec]);
      toast('Besoin enregistré dans la fiche du garage.');
      location.hash='#/besoin/'+id;
      pageBesoinsClient(id);
    };
    const ouverts=needs(c).filter(actif).sort((a,b)=>(a.suiviLe||'9999-12-31').localeCompare(b.suiviLe||'9999-12-31'));
    const clos=needs(c).filter(x=>!actif(x)).sort((a,b)=>String(b.creeLe||'').localeCompare(String(a.creeLe||'')));
    montrer('Vente produits · '+c.nom,
      h('div',{class:'carte'},h('small',{class:'etiq'},'GARAGE'),h('strong',{},c.nom),
        c.compte&&c.compte.statut==='bloque'?h('p',{class:'bandeau-ko'},'COMPTE BLOQUÉ : ne pas promettre de commande à crédit.'):null,
        h('div',{class:'actions'},bouton('#/client/'+id,'Ouvrir la fiche'),bouton('#/catalogue','Catalogue'))),
      h('div',{class:'carte v24-form'},
        h('strong',{},'Noter un besoin ou une possibilité de vente'),
        h('label',{},'Famille de produit'),famille,
        h('label',{},'Origine de l’information'),source,
        h('label',{},'Ce qui a été dit ou observé'),detail,
        h('label',{},'Prochaine action'),suite,
        h('label',{},'Quand la faire ?'),suivi,
        h('p',{class:'mut'},'La date est nécessaire si une action reste à faire. Elle n’est pas inventée automatiquement.'),
        erreur,
        h('div',{class:'actions'},h('button',{class:'btn',onclick:sauver},'Enregistrer le besoin'))),
      h('h2',{},'Actions produits à suivre · '+ouverts.length),
      ouverts.length?h('div',{class:'carte'},ouverts.map(b=>carteBesoin(b,c,true))):
        h('p',{class:'mut'},'Aucun suivi produit ouvert.'),
      clos.length?h('details',{class:'carte'},h('summary',{},'Historique traité · '+clos.length),
        clos.slice(0,20).map(b=>carteBesoin(b,c,false))):null,
      h('div',{class:'actions'},h('button',{class:'btn sec',onclick:()=>creerDevis(c)},'+ Créer un devis')) );
  }

  const avantRoute=route;
  route=async function(){
    const partie=(location.hash||'#/').slice(2).split('/');
    if(partie[0]==='besoins')return pageBesoins();
    if(partie[0]==='besoin'&&/^\d+$/.test(partie[1]||''))return pageBesoinsClient(Number(partie[1]));
    return avantRoute();
  };
  const avantAccueil=pageAccueil;
  pageAccueil=async function(){
    await avantAccueil();
    if(location.hash&&location.hash!=='#/')return;
    const cible=app.querySelector('.v23-prochaine');
    if(cible){
      const n=h('a',{class:'v24-cta',href:'#/besoins'},
        h('span',{},h('strong',{},'+ Besoin d’un garage'),h('small',{},'Vernis · Mastic · Abrasifs · Masquage · Apprêt')),
        h('span',{},'›'));
      cible.after(n);
    }
  };
  const avantClient=pageClient;
  pageClient=async function(id){
    await avantClient(id);
    const c=await get('clients',id);
    if(!c)return;
    const trio=app.querySelector('.trio');
    const bande=h('a',{href:'#/besoin/'+id,class:'v24-cta'},
      h('span',{},h('strong',{},'Préparer une vente de consommables'),h('small',{},nombreOuverts(c)+' besoin(s) produit à suivre')),
      h('span',{},'›'));
    if(trio)trio.before(bande);
  };
  const avantClients=pageClients;
  pageClients=async function(){
    await avantClients();
    const liens=h('a',{class:'v24-cta',href:'#/besoins'},
      h('span',{},h('strong',{},'Suivi des besoins produits'),h('small',{},'Créer un devis, rappeler, organiser un essai')),
      h('span',{},'›'));
    app.prepend(liens);
  };
  window.__suiviProduitsV24={actif,needs,datePropre};
})();