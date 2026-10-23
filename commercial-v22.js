'use strict';
var pageOpportunites;
/* ODICOLOR v22 — couche commerciale prouvable.
 * Aucun accès réseau, aucune donnée fictive insérée dans IndexedDB.
 * Ne modifie ni les commandes ni la comptabilité. */
(function () {
  const ancienneLecturePlan = nettoyerPlan;
  const ancienneFichePC = blocPCClient;
  const ancienneAccueil = pageAccueil;
  const ancienneClients = pageClients;
  const ancienneTournee = pageTournee;
  const anciennePlus = pagePlus;

  const str = (s, n=350) => String(s == null ? '' : s).trim().slice(0,n);
  const iso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
  const uniq = arr => [...new Set(arr.filter(Boolean))];
  const tag = (s, classe='warn') => h('span',{class:'tag '+classe}, s);
  const link = (href,label,style='sec') => h('a',{class:'btn '+style,href},label);
  const m = s => normNom(s);

  // Conserver explicitement les preuves du PC lors de l'import, avec des bornes.
  nettoyerPlan = function (o) {
    const p = ancienneLecturePlan(o);
    const rawSources = o.sources && typeof o.sources === 'object' ? o.sources : {};
    const rawP = rawSources.preuvesCommerciales && typeof rawSources.preuvesCommerciales === 'object' ? rawSources.preuvesCommerciales : {};
    const stats = rawSources.importStats && rawSources.importStats.pieces || {};
    p.sources = {
      ebpDate: iso(rawSources.ebpDate),
      importIgnorees: Math.max(0,Number(stats.ignorees)||0),
      commercial: {fiable:rawP.fiable===true,restrictions:(Array.isArray(rawP.restrictions)?rawP.restrictions:[]).slice(0,8).map(x=>str(x,170)),signaux:Math.max(0,Number(rawP.signaux)||0)}
    };
    p.chiffre = {source: str(o.chiffre && o.chiffre.source,20)};
    const rawClients = (Array.isArray(o.clients) ? o.clients : []).slice(0,600);
    const index = new Map();
    rawClients.forEach(x => {const n = m(x && x.nom); if(n && !index.has(n)) index.set(n,x); else if(n) index.set(n,null)});
    p.clients.forEach(c => {
      const x=index.get(m(c.nom));
      c.signaux=x && Array.isArray(x.signaux) ? x.signaux.slice(0,4).filter(z=>z&&['reconquete','baisse'].includes(z.type)).map(z=>({
        type:z.type, titre:str(z.titre,120), preuve:str(z.preuve,650), source:str(z.source,130), dateDernier:iso(z.dateDernier),
        ca12:Number.isFinite(Number(z.ca12))?Math.max(0,Number(z.ca12)):null,
        pieces:uniq((Array.isArray(z.pieces)?z.pieces:[]).slice(0,15).map(v=>str(v,45))),
        seuil:str(z.seuil,130),actionId:str(z.actionId,160)
      })) : [];
    });
    return p;
  };

  function fiabilite(pc) {
    if (!pc) return {ok:false,raison:'Aucun plan du PC importé sur ce téléphone.'};
    if (!pc.arrete || !iso(pc.arrete)) return {ok:false,raison:'Date de l’export EBP absente.'};
    const jours=Math.floor((Date.now()-new Date(pc.arrete+'T12:00:00').getTime())/864e5);
    if(jours<0 || jours>7) return {ok:false,raison:'Export EBP daté de '+jours+' jours : les opportunités sont suspendues (seuil provisoire : 7 jours).'};
    if(pc.chiffre?.source!=='import') return {ok:false,raison:'Export réel EBP non déclaré : démonstration ou données incomplètes.'};
    if(pc.sources?.commercial?.fiable!==true || pc.sources.importIgnorees>0)
      return {ok:false,raison: (pc.sources?.commercial?.restrictions||[]).join(' ') || 'Preuves EBP insuffisantes pour conclure.'};
    return {ok:true,raison:'Commandes EBP : historique déclaré complet et export récent. Les seuils restent des hypothèses.'};
  }

  function signauxClient(pc, c, clients) {
    if(!fiabilite(pc).ok) return [];
    if(clients && clients.filter(x=>m(x.nom)===m(c.nom)).length!==1) return [];
    const lines=pc.clients.filter(x=>m(x.nom)===m(c.nom));
    if(lines.length!==1 || (c.code && lines[0].code && m(c.code)!==m(lines[0].code)))return [];
    if(c.compte && c.compte.statut==='bloque')return [];
    return Array.isArray(lines[0].signaux)?lines[0].signaux:[];
  }

  const ageStr = pc => pc&&pc.arrete?'Export EBP : '+dateFr(pc.arrete+'T12:00:00'):'Export EBP non disponible';
  const preuveNode = s => h('details',{class:'v22-proof'},h('summary',{},'Voir les preuves EBP'),
    h('p',{class:'mut'},s.preuve||'Preuve manquante'),
    s.pieces && s.pieces.length ? h('p',{class:'mut'},'Pièces sources : '+s.pieces.join(', ')):null,
    h('p',{class:'mut'},'Source : '+(s.source||'non précisée')),
    s.seuil ? h('p',{class:'mut'},'Règle de détection (hypothèse) : '+s.seuil):null);
  const typeTitre = s => s.type==='reconquete'?'Client à reconquérir':'Achats en baisse';

  function carteSignal(s,c,withAction=true){
    const n=h('div',{class:'carte v22-signal'},
      h('div',{class:'v22-between'},h('strong',{},c.nom),tag(typeTitre(s),s.type==='reconquete'?'ko':'warn')),
      h('p',{style:'margin:6px 0'},s.titre||'Comprendre la situation du client'),
      s.ca12!=null?h('p',{class:'mut'},'CA commandé observé sur 12 mois : '+Number(s.ca12).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})+' HT. Ce n’est pas du CA futur.'):null,
      preuveNode(s));
    if(withAction)n.append(h('div',{class:'actions'},link('#/client/'+c.id,'Préparer la visite')));
    return n;
  }

  pageOpportunites = async function () {
    const pc=await lirePC(),all=await getAll('clients'),devis=await getAll('devis'),f=fiabilite(pc);
    const accepte=devis.filter(d=>d.statut==='accepte'&&!d.commandeLe&&Array.isArray(d.lignes)&&d.lignes.length)
      .sort((a,b)=>totaux(b).ht-totaux(a).ht);
    const commerciaux=[];
    if(f.ok)for(const c of all){for(const s of signauxClient(pc,c,all))commerciaux.push({c,s})}
    commerciaux.sort((a,b)=>(a.s.type==='reconquete'?0:1)-(b.s.type==='reconquete'?0:1)||(b.s.ca12||0)-(a.s.ca12||0));
    montrer('Opportunités',
      h('div',{class:'carte v22-intro'},h('small',{class:'etiq'},'DÉVELOPPEMENT COMMERCIAL'),
        h('p',{},'Une recommandation = une source, une raison et une action. Aucun potentiel de vente inventé.'),
        h('small',{class:'mut'},ageStr(pc))),
      h('h2',{},'À transformer en commande · téléphone'),
      accepte.length ? accepte.slice(0,8).map(d=>h('div',{class:'carte v22-item'},h('strong',{},d.clientNom),
        h('p',{class:'mut'},'Devis '+numero(d)+' accepté, commande non déclarée envoyée · '+eur(totaux(d).ht)+' HT'),
        h('small',{class:'mut'},'Preuve : statut et historique enregistrés sur ce téléphone'),
        h('div',{class:'actions'},link('#/devis/'+d.id,'Ouvrir le devis')))):
        h('p',{class:'mut'},'Aucun devis accepté sans commande enregistré.'),
      h('h2',{},'Reconquête et baisse d’achats · EBP'),
      !f.ok ? h('div',{class:'carte alerte'},h('strong',{},'Données insuffisantes'),h('p',{},f.raison),
          h('p',{class:'mut'},'Importer un plan fondé sur un export EBP complet et récent. L’absence de signal ne signifie pas absence d’opportunités.'),link('#/pc','Lien avec le PC')) :
        commerciaux.length ? commerciaux.slice(0,15).map(x=>carteSignal(x.s,x.c)):
          h('div',{class:'carte'},'Aucun signal de reconquête vérifié pour les clients dont l’identité correspond exactement. Les clients absents du téléphone ne sont pas associés automatiquement.'),
      h('p',{class:'mut'},'Seuils de détection = hypothèses réglables sur le PC. Une baisse historique ne démontre ni la cause ni la probabilité d’une commande.')
    );
  };

  pageAccueil=async function (){
    await ancienneAccueil();
    if((location.hash||'#/')!=='#/')return;
    const pc=await lirePC(),all=await getAll('clients'),f=fiabilite(pc);
    const n=f.ok?all.reduce((sum,c)=>sum+signauxClient(pc,c,all).length,0):0;
    const card=h('a',{class:'carte v22-entry',href:'#/opportunites'},
      h('div',{class:'v22-between'},h('strong',{},'Opportunités commerciales'),tag(f.ok?(n+' signal'+(n>1?'s':'')):'À vérifier',f.ok?'ok':'warn')),
      h('p',{class:'mut'},f.ok?(n?'Des clients à reconquérir ou dont les achats baissent, avec les pièces EBP.':'Aucun signal validé pour les clients du téléphone.'):'Analyse EBP non disponible : voir les devis acceptés et les preuves manquantes.'),
      h('small',{class:'mut'},ageStr(pc)));
    const objectif=app.querySelector('.carte.obj');
    if(objectif && objectif.nextSibling)app.insertBefore(card,objectif.nextSibling);else app.prepend(card);
  };

  pageClients=async function (){
    await ancienneClients();
    if(location.hash!=='#/clients')return;
    const pc=await lirePC(),all=(await getAll('clients')).sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
    const f=fiabilite(pc);const count=f.ok?all.reduce((a,c)=>a+signauxClient(pc,c,all).length,0):0;
    const top=h('a',{class:'carte v22-entry',href:'#/opportunites'},h('strong',{},'Priorités commerciales · '+(f.ok?count+' signal(s) vérifiables':'EBP à vérifier')),
      h('p',{class:'mut'},'Voir les clients à reconquérir, leurs commandes et les actions proposées.'));
    app.insertBefore(top,app.children[1]||null);
    const lignes=Array.from(app.querySelectorAll(':scope > .ligne'));
    lignes.forEach((ligne,i)=>{const c=all[i];if(!c)return;const signals=signauxClient(pc,c,all);
      if(signals.length){const e=h('div',{class:'v22-client-label'},tag(typeTitre(signals[0]),'warn'),h('small',{class:'mut'},' · preuve EBP disponible sur la fiche'));
      const g=ligne.querySelector('.g');if(g)g.append(e);}
    });
  };

  blocPCClient=async function(c){
    const pc=await lirePC();if(!pc)return null;
    const f=fiabilite(pc),all=await getAll('clients'),signals=signauxClient(pc,c,all);
    if(signals.length)return h('div',{class:'carte v22-evidence'},h('small',{class:'etiq'},'PREUVES COMMERCIALES · '+ageStr(pc)),
      signals.map(s=>h('div',{class:'v22-signal-row'},h('div',{class:'v22-between'},h('strong',{},typeTitre(s)),tag('Pièces EBP','ok')),
        h('p',{},s.titre),preuveNode(s))),
      h('p',{class:'mut'},'Ces données montrent des commandes passées, pas un potentiel garanti. Vérifier la cause avec le client.'));
    if(!f.ok)return h('div',{class:'carte alerte'},h('strong',{},'Analyse PC à vérifier'),h('p',{class:'mut'},f.raison));
    return ancienneFichePC(c);
  };

  pageTournee=async function (){
    await ancienneTournee();
    if(location.hash!=='#/tournee')return;
    const pc=await lirePC(),all=await getAll('clients'),f=fiabilite(pc);
    const signals=f.ok?all.flatMap(c=>signauxClient(pc,c,all).map(s=>({c,s}))):[];
    const box=h('div',{class:'carte v22-entry'},h('div',{class:'v22-between'},h('strong',{},'Préparer les visites utiles'),tag(f.ok?signals.length+' signal(s) EBP':'Preuves manquantes','warn')),
      h('p',{class:'mut'},'Les signaux EBP aident à choisir un garage. Ils ne calculent ni l’itinéraire optimal ni le temps de trajet.'),
      h('div',{class:'actions'},link('#/opportunites','Voir les opportunités')));
    app.prepend(box);
  };
  pagePlus=function(){anciennePlus();app.prepend(h('a',{href:'#/opportunites',class:'carte v22-entry',style:'display:block;text-decoration:none;color:inherit'},
    h('strong',{},'Opportunités commerciales'),h('p',{class:'mut'},'Reconquête, baisse d’achats, devis acceptés : avec leurs preuves.')))};

  const ancienneRoute = route;
  route = async function () {
    const chemin = (location.hash || '#/').slice(2).split('/')[0];
    if (chemin === 'opportunites') {
      document.querySelectorAll('.onglets a').forEach(x => x.classList.toggle('on', x.dataset.p === 'plus'));
      await pageOpportunites();
    } else {
      await ancienneRoute();
    }
  };
  const ancienneReglages = pageReglages;
  pageReglages = async function () {
    await ancienneReglages();
    app.append(h('p', {class:'mut',style:'font-weight:600;text-align:center'}, 'Module commercial v22 · recommandations avec preuves EBP'));
  };
  window.__commercialV22={fiabilite,signauxClient};
})();
