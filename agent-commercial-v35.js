'use strict';
/* ODICOLOR v35 — Agent 01 (Claude web, sans API)
 * Local : collecte des prochaines actions et sources. Pas d'action automatique.
 * Transfert vers Claude : copier/coller explicite, anonymisé par défaut.
 */
(function(){
  const C='agent01Contexte', R='agent01Avis';
  const texte=(v,n=200)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const ISO=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
  const navigable=url=>/^(#\/(?:client|devis|notes-client)\/\d+)$/.test(url||'')?url:
    ['#/tournee','#/devis','#/clients','#/pc','#/signalements','#/opportunites','#/travail'].includes(url)?url:'#/clients';
  const bouton=(dest,nom)=>h('a',{class:'btn sec',href:dest},nom);

  async function collecte(){
    const [devis,clients,pc,tours]=await Promise.all([
      getAll('devis'),getAll('clients'),lirePC(),lireTournees()
    ]);
    let candidats=[];
    try{
      const calcul=window.__commercialAccueilV23&&window.__commercialAccueilV23.candidats;
      if(typeof calcul==='function')candidats=calcul(devis,clients,pc,tours)||[];
    }catch(err){console.warn('Agent 01 : priorités indisponibles',err)}
    const actions=candidats.slice(0,9).map((x,i)=>({
      ref:'A'+String(i+1).padStart(2,'0'),
      categorie:texte(x.categorie||x.tag||'Action commerciale',80),
      titre:texte(x.titre||x.t||'Action terrain',140),
      detail:texte(x.description||x.d||'',240),
      justification:texte(x.justification||x.preuve||'',300),
      source:texte(x.source||'Saisie téléphone / source à contrôler',95),
      href:navigable(x.url||x.href)
    }));
    // Les actions de suivi de notes terrain ne doivent pas être oubliées.
    const api=window.__notesTerrainV29;
    if(api&&typeof api.notesDe==='function'&&typeof api.estEchue==='function'){
      for(const c of clients){
        const due=api.notesDe(c).find(n=>api.estEchue(n));
        if(!due||actions.length>=12)continue;
        if(actions.some(a=>a.href==='#/client/'+c.id||a.href==='#/notes-client/'+c.id))continue;
        actions.push({ref:'A'+String(actions.length+1).padStart(2,'0'),
          categorie:'Note terrain à suivre',titre:'Relance · '+texte(c.nom,100),
          detail:'Suite prévue : '+texte(due.suite,40)+' · '+texte(due.suiviLe,20),
          justification:'Note du commercial ; aucune vérification EBP',
          source:'Saisie locale terrain',href:'#/notes-client/'+c.id});
      }
    }
    const valide=Boolean(pc&&pc.chiffre&&pc.chiffre.source==='import'&&ISO(pc.arrete)
      &&ecartJours(pc.arrete,Date.now())>=0&&ecartJours(pc.arrete,Date.now())<=7);
    return{
      date:jourLocal(new Date()),
      compteurs:{garages:clients.length,devis:devis.length,
        notes:clients.reduce((s,c)=>s+(Array.isArray(c.infosTerrain)?c.infosTerrain.length:0),0)},
      sourceEBP:valide?'Plan PC issu d’un export EBP récent — preuves à contrôler':
        'Plan EBP absent, ancien ou non validé',
      dateEBP:valide?pc.arrete:null,
      actions
    };
  }

  function briefing(etat,avecDetails){
    const id=nouvelUid();
    const actions=etat.actions.map(x=>({
      ref:x.ref,type:x.categorie,
      dossier:avecDetails?x.titre:x.ref+' (anonymisé)',
      contexte:avecDetails?x.detail:'Contexte masqué : consulter la fiche locale',
      preuve:avecDetails?x.justification:'Non transmise (confidentialité)',
      source:avecDetails?x.source:'Source téléphone / PC (détails masqués)'
    }));
    const contexte={
      protocole:'ODICOLOR-AGENT-01',version:1,id,
      date:etat.date,
      mode:avecDetails?'commercial nominatif autorisé':'anonymisé',
      ebp:etat.sourceEBP,
      dateEBP:etat.dateEBP,
      compteurs:etat.compteurs,
      actions
    };
    const exemple={
      protocole:'ODICOLOR-AVIS-01',version:1,id,
      propositions:[{ref:actions[0]?actions[0].ref:'A01',ordre:1,
        recommandation:'Action simple et vérifiable',
        motif:'Justification fondée sur les informations reçues',
        controle:'À vérifier avant exécution'}]
    };
    const texteBrief=[
      'ODICOLOR — AGENT COMMERCIAL 01',
      'Agis comme mon copilote commercial B2B fournitures et peinture carrosserie.',
      'Je travaille seul 7 heures par jour. Une tâche à la fois, maximum trois recommandations.',
      'Ne fabrique JAMAIS de prix, chiffres de vente, dettes, clients, stocks, disponibilités, décisions de mon responsable ou preuves EBP.',
      'Une note terrain et un devis accepté ne sont pas une preuve de paiement ou de commande EBP.',
      'Ne transmets rien, ne passe aucune commande et ne déclare aucun compte client ouvert : propose uniquement.',
      'Ne propose que les références présentes dans le contexte. Si les informations sont trop pauvres, rends zéro proposition ou écris À vérifier.',
      'Réponds UNIQUEMENT avec un objet JSON valide, sans bloc de code, selon cette forme :',
      JSON.stringify(exemple,null,2),
      'CONTEXTE DU JOUR :',
      JSON.stringify(contexte,null,2)
    ].join('\n\n');
    return {id,date:etat.date,etat,avecDetails,texte:texteBrief,actions};
  }

  function lireAvis(contenu,dernier){
    let s=String(contenu||'').trim();
    if(s.length>22000)throw new Error('Réponse trop longue.');
    // Accepter les blocs Markdown éventuels sans exécuter de code.
    const mark=String.fromCharCode(96).repeat(3);
    if(s.startsWith(mark)){
      const first=s.indexOf('\n');
      if(first>0)s=s.slice(first+1).trim();
      if(s.endsWith(mark))s=s.slice(0,-3).trim();
    }
    let obj;
    try{obj=JSON.parse(s)}catch(e){throw new Error('Copie uniquement le JSON complet fourni par Claude.')}
    if(!dernier||obj==null||obj.protocole!=='ODICOLOR-AVIS-01'||obj.version!==1
      ||obj.id!==dernier.id||!Array.isArray(obj.propositions)||obj.propositions.length>3)
      throw new Error('Réponse incompatible ou provenant d’un autre briefing.');
    const refs=new Set(dernier.actions.map(x=>x.ref)),vus=new Set();
    return obj.propositions.map(x=>{
      if(!x||!refs.has(x.ref)||vus.has(x.ref)||!Number.isInteger(x.ordre)
        ||x.ordre<1||x.ordre>3||typeof x.recommandation!=='string'
        ||typeof x.motif!=='string'||typeof x.controle!=='string')
        throw new Error('Claude a renvoyé une proposition ou une référence non autorisée.');
      vus.add(x.ref);
      if(!x.recommandation.trim())throw new Error('Une proposition est vide.');
      return{ref:x.ref,ordre:x.ordre,
        recommandation:texte(x.recommandation,240),
        motif:texte(x.motif,280),controle:texte(x.controle,240)};
    }).sort((a,b)=>a.ordre-b.ordre);
  }

  function montrerAvis(liste,contexte,zone){
    zone.replaceChildren(...liste.map(x=>{
      const a=contexte.etat.actions.find(y=>y.ref===x.ref);
      return h('div',{class:'v35-avis'},
        h('div',{class:'v35-line'},h('strong',{},'Priorité '+x.ordre+' · '+x.ref),
          h('small',{class:'mut'},a?a.categorie:'Action')),
        h('p',{},x.recommandation),
        h('small',{class:'mut'},'Motif : '+x.motif),
        h('small',{class:'mut'},'Contrôle : '+x.controle),
        bouton(a?navigable(a.href):'#/clients','Ouvrir la fiche / action'));
    }));
  }

  async function pageAssistant(){
    const etat=await collecte();
    const zoneAvis=h('div',{class:'v35-avis-list'});
    const status=h('p',{class:'v35-status',role:'status'});
    const sortie=h('textarea',{rows:5,maxlength:22000,
      placeholder:'Colle ici le JSON retourné par Claude',
      'aria-label':'Réponse JSON de Claude'});
    const consent=h('input',{type:'checkbox','aria-label':'Autoriser le briefing nominatif'});
    const secours=h('div');
    const instructionsProjet=[
      'TU ES : ODICOLOR — AGENT COMMERCIAL 01.',
      'Tu es mon assistant de travail B2B peinture et fournitures carrosserie, pas mon supérieur.',
      'Je suis commercial terrain, 7 heures par jour, une chose à la fois.',
      'Aide-moi à préparer mes visites, qualifier les besoins, relancer, suivre les commandes et les règlements.',
      'Les produits et marques restent neutres : diagnostic avant proposition.',
      'EBP seul confirme les tarifs, les commandes et les règlements ; le téléphone contient des saisies déclaratives.',
      'Ne fabrique jamais de prix, stocks, clients, ventes, dettes ni preuves EBP.',
      'Une commande préparée ne prouve pas une commande envoyée. Une note n’est pas une preuve de solvabilité.',
      'Aucune ouverture de compte sans les règles ODICOLOR et la décision du N+1.',
      'Tu proposes. Je décide. Tu ne déclares ni commande, ni règlement, ni compte ouvert.',
      'Quand le briefing contient ODICOLOR-AGENT-01, réponds uniquement au JSON demandé, avec 0 à 3 priorités existantes.',
      'Utilise les références du briefing sans en inventer et conserve son identifiant de lot.',
      'Quand une preuve manque, indique À vérifier. Français direct, concis et contradictoire.'
    ].join('\n');
    const preparerClaude=h('button',{type:'button',class:'btn sec v35-setup',onclick:async()=>{
      try{
        if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Copie impossible');
        await navigator.clipboard.writeText(instructionsProjet);
        secours.replaceChildren();
        status.textContent='Instructions copiées. Colle-les dans les instructions de ton projet Claude « ODICOLOR — Agent commercial ».';
      }catch(e){
        secours.replaceChildren(h('textarea',{rows:7,readOnly:true,'aria-label':'Instructions du projet Claude à copier'},instructionsProjet));
        status.textContent='Sélectionne le texte affiché puis colle-le dans ton projet Claude.';
      }
    }},'0. Copier les instructions de mon projet Claude');
    const precedent=await get('meta',R);
    if(precedent&&precedent.contexte&&precedent.contexte.date===etat.date&&Array.isArray(precedent.avis))
      montrerAvis(precedent.avis,precedent.contexte,zoneAvis);

    const copier=h('button',{type:'button',class:'btn v35-primary',onclick:async()=>{
      const avec=consent.checked===true;
      if(avec&&!confirm('Tu vas partager des informations de clients ODICOLOR avec Claude. As-tu une autorisation de l’entreprise ?'))return;
      const ctx=briefing(etat,avec);
      try{
        await put('meta',ctx,C);
        if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Presse-papiers inaccessible.');
        await navigator.clipboard.writeText(ctx.texte);
        secours.replaceChildren();
        status.textContent='Briefing copié. Ouvre le même projet Claude sur téléphone ou PC, puis colle le texte.';
      }catch(e){
        secours.replaceChildren(h('label',{},'Copie manuelle du briefing'),
          h('textarea',{rows:7,readOnly:true,'aria-label':'Briefing à copier'},ctx.texte));
        status.textContent='Copie automatique indisponible. Sélectionne le texte ci-dessous.';
      }
    }},'1. Copier le briefing pour Claude');

    const appliquer=h('button',{type:'button',class:'btn',onclick:async()=>{
      try{
        const ctx=await get('meta',C);
        const avis=lireAvis(sortie.value,ctx);
        await put('meta',{contexte:ctx,avis,date:new Date().toISOString()},R);
        montrerAvis(avis,ctx,zoneAvis);
        status.textContent=avis.length+' proposition(s) reçue(s). Aucune action n’a été exécutée automatiquement.';
      }catch(e){status.textContent=e.message;toast(e.message,true)}
    }},'3. Valider les propositions de Claude');

    montrer('Agent commercial · Claude',
      h('section',{class:'carte v35-tete'},
        h('small',{class:'etiq'},'ODICOLOR · AGENT 01'),
        h('strong',{},'Une seule priorité à la fois'),
        h('p',{class:'mut'},'Aujourd’hui '+dateFr(etat.date+'T12:00:00')+
          ' · '+etat.compteurs.garages+' garages · '+etat.compteurs.notes+' notes terrain'),
        h('p',{class:'mut'},'EBP : '+etat.sourceEBP),
        h('p',{class:'mut'},'Claude analyse uniquement ce que tu lui transmets. Aucune synchronisation automatique.')),
      h('section',{class:'carte'},
        h('strong',{},'Les actions repérées par ODICOLOR'),
        etat.actions.length?etat.actions.slice(0,6).map(a=>
          h('a',{class:'v35-action',href:a.href},
            h('span',{},h('strong',{},a.titre),
              h('small',{class:'mut'},a.categorie+' · '+a.source)),
            h('span',{},'›'))):
          h('p',{class:'mut'},'Pas encore d’action exploitable. Complète tes fiches, tournées ou exports.'),
        h('p',{class:'mut'},'Ces priorités locales ne sont pas un avis de Claude.')),
      h('section',{class:'carte v35-claude'},
        h('strong',{},'Faire travailler Claude sur ton briefing'),
        h('p',{class:'mut'},'Par défaut : aucun nom de garage, téléphone ou texte libre transmis.'),
        h('p',{class:'mut'},'Première utilisation : crée un projet Claude « ODICOLOR — Agent commercial » sur ton compte habituel. Il est accessible avec le même compte sur Samsung et PC.'),
        preparerClaude,
        h('label',{class:'v35-consent'},consent,
          'Inclure les détails clients (seulement avec autorisation ODICOLOR)'),
        copier,secours,
        h('a',{class:'btn sec v35-open',href:'https://claude.ai/',target:'_blank',
          rel:'noopener noreferrer'},'2. Ouvrir Claude'),
        h('label',{},'Réponse de Claude (JSON)'),sortie,
        appliquer,status),
      h('section',{class:'carte'},
        h('strong',{},'Propositions reçues · à décider'),
        zoneAvis,
        h('p',{class:'mut'},'L’agent propose. Tu décides des visites, devis, commandes et règlements.')),
      h('div',{class:'actions'},bouton('#/','Accueil'),bouton('#/pc','Lien PC')));
  }

  const routeAvant=route;
  route=async function(){
    if((location.hash||'#/').split('/')[1]==='agent')return pageAssistant();
    return routeAvant();
  };
  const accueilAvant=pageAccueil;
  pageAccueil=async function(){
    await accueilAvant();
    if((location.hash||'#/')!=='#/')return;
    const bloc=app.querySelector('.v23-prochaine');
    const link=h('a',{class:'v35-accueil',href:'#/agent'},
      h('span',{},h('strong',{},'Mon assistant · Agent 01'),
        h('small',{},'Actions du jour · Analyse Claude à la demande')),
      h('span',{},'›'));
    if(bloc)bloc.after(link);else app.prepend(link);
  };
  const plusAvant=pagePlus;
  pagePlus=function(){
    plusAvant();
    app.prepend(h('a',{class:'v35-plus',href:'#/agent'},'Agent 01 · Assistant commercial Claude ›'));
  };
  const reglagesAvant=pageReglages;
  pageReglages=async function(){
    await reglagesAvant();
    const version=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(version)version.textContent='ODICOLOR Solution · v37';
  };
  window.__odicolorAgent01={collecte,briefing,lireAvis};
})();