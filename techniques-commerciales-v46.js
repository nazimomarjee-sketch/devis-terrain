'use strict';
/* ODICOLOR Solution v46 — bibliothèque de techniques B2B et moteur terrain.
 * Données client et devis : lecture locale uniquement. Pas de requête IA/réseau.
 * Une proposition est une hypothèse à valider, jamais une preuve EBP.
 */
(function(){
  const FAMILLES=[
    ['Ciblage et territoire','Prospecter là où une visite peut produire un résultat',
      'Prospection géographique|Sectorisation|Méthode ABC|Scoring de prospects|Potentiel d’achat estimé|Segmentation du portefeuille|Cartographie commerciale|Tournées optimisées|Regroupement géographique|Analyse des concurrents|Identification des décideurs|Plan de compte|Loi de Pareto 80/20'],
    ['Prospection et acquisition','Obtenir une conversation pertinente avec une nouvelle carrosserie',
      'Porte-à-porte B2B|Visite spontanée|Prospection téléphonique|Appel à froid|Appel tiède|Approche multicanale|Email personnalisé|Social selling|Recommandation|Parrainage|Apporteur d’affaires|Réseau professionnel|Prescription|Prospection événementielle|Réactivation des anciens clients|Conquête des clients concurrents|Prospection par signaux d’achat'],
    ['Prise de contact et confiance','Ouvrir un dialogue sans forcer la vente',
      'Accroche commerciale|Pitch de 30 secondes|Elevator pitch|AIDA|Brise-glace|Entrée par le problème|Entrée par la valeur|Preuve de compétence|Écoute active|Reformulation|Question d’ouverture|Personnalisation|Synchronisation du langage|Communication non verbale|Contrat d’entretien|Permission marketing'],
    ['Découverte et diagnostic','Identifier les problèmes réels de l’atelier et les qualifier',
      'Questions ouvertes|Questions fermées|Questions alternatives|Entonnoir de questions|SPIN Selling|QQOQCCP|Méthode des 5 pourquoi|Analyse des irritants|Besoins explicites et implicites|Diagnostic technique|Audit de consommation|Analyse du processus d’achat|Écoute des objections spontanées|Quantification des pertes|Critères de choix|Analyse de l’existant'],
    ['Qualification commerciale','Évaluer faisabilité, acteur, potentiel et calendrier',
      'BANT|CHAMP|MEDDIC|MEDDPICC|NEAT|SPICED|Qualification du budget|Identification du décideur|Cartographie des acteurs|Identification de l’urgence|Qualification du potentiel|Critères de décision|Capacité d’achat|Qualification du calendrier|Détection du concurrent en place|Identification d’un allié interne'],
    ['Argumentation et démonstration','Prouver un bénéfice sans inventer de performance',
      'CAP|CAB|SONCAS|SONCASE|Storytelling|Démonstration produit|Essai comparatif|Preuve par les résultats|Calcul du coût d’utilisation|Argumentaire ROI|Value Selling|Selling by teaching|Challenger Sale|Comparaison concurrentielle documentée|Solution Selling|Personnalisation de l’offre|Proposition de valeur|Échantillonnage'],
    ['Objections','Faire émerger et traiter un frein réel',
      'Écoute des objections|Reformulation d’objection|LAER|Clarification de l’objection|Isolement de l’objection|Traitement par la preuve|Comparaison factuelle|Contre-question|Réponse par démonstration|Prix versus valeur|Fournisseur historique|Objection au changement|Boomerang|Concession conditionnelle|Validation de la réponse'],
    ['Négociation','Préserver marge et qualité de relation',
      'Ancrage de prix|BATNA|ZOPA|Négociation raisonnée|Échange de concessions|Contrepartie|Prix contre volume|Prix contre engagement|Offres à plusieurs niveaux|Packages|Négociation de services|Conditions de règlement|Silence stratégique|Gestion des limites|Refus d’une remise injustifiée'],
    ['Conclusion','Transformer l’accord de principe en action vérifiable',
      'Closing direct|Closing alternatif|Closing par synthèse|Closing conditionnel|Test de conclusion|Micro-engagement|Engagement progressif|Commande d’essai|Conclusion par preuve|Validation du décideur|Rendez-vous de décision|Confirmation écrite|Plan d’action mutuel|Prochaine étape datée|Gestion de l’indécision'],
    ['Fidélisation et comptes','Développer les achats récurrents de façon utile',
      'Suivi après-vente|Satisfaction client|Relance de réassort|Upselling|Cross-selling|Reconquête|Programme de fidélisation|Vente récurrente|Contrat-cadre|Revue périodique du compte|Accompagnement technique|Formation client|Suivi de consommation|Prévention du départ client|Land & Expand|Key Account Management'],
    ['Encaissement et risque','Vérifier et sécuriser les règlements',
      'Qualification des conditions de paiement|Vérification du statut du compte|Contrôle des encours|Prévention des retards|Confirmation des échéances|Relance préventive|Relance amiable|Suivi des promesses de paiement|Gestion des règlements partiels|Suivi des litiges|Escalade des comptes bloqués|Contrôle des impayés|Coordination avec la comptabilité'],
    ['Pilotage de la performance','Mesurer les résultats et apprendre sans confondre indicateurs',
      'CRM terrain|Tunnel de vente|Pipeline|Taux de conversion|Transformation des essais|CA additionnel|Marge brute|Panier moyen|Fréquence d’achat|Rétention|Coût d’acquisition|Valeur vie client|Analyse RFM|Analyse des ventes perdues|Prévision commerciale|Coaching|Tests A/B|Analyse des tournées|Priorisation des prochaines actions']
  ];
  const familles=FAMILLES.map((x,i)=>({
    id:'F'+String(i+1).padStart(2,'0'),titre:x[0],objectif:x[1],
    techniques:x[2].split('|').map((nom,j)=>({
      id:'T'+String(i+1).padStart(2,'0')+'-'+String(j+1).padStart(2,'0'),
      nom,famille:x[0],objectif:x[1]
    }))
  }));
  const techniques=familles.flatMap(x=>x.techniques);
  const index=new Map(techniques.map(t=>[t.nom,t]));
  // Chaque protocole fournit une raison traçable, une action et un contrôle humain.
  const PLAYBOOKS={
    verification_compte:{
      nom:'Sécuriser le compte avant toute vente',priorite:100,
      technique:['Vérification du statut du compte','Contrôle des encours','Escalade des comptes bloqués'],
      action:'Vérifier dans EBP le statut du compte et les conditions applicables avant de préparer une commande.',
      question:'Quel élément précis bloque le compte et qui peut confirmer sa levée ?',
      mesure:'Statut vérifié dans EBP et action autorisée ou non',controle:'Ne pas déclarer le compte ouvert ou débloqué sur la seule base de la fiche téléphone.'
    },
    reglement:{
      nom:'Vérifier et préparer une relance de règlement',priorite:98,
      technique:['Relance amiable','Suivi des promesses de paiement','Coordination avec la comptabilité'],
      action:'Contrôler le solde et la date d’échéance dans EBP ; seulement ensuite convenir d’une relance adaptée.',
      question:'Le règlement a-t-il déjà été reçu, partiel ou contesté ?',
      mesure:'Échéance et règlement confirmés par la comptabilité',controle:'Une facture notée non réglée sur le Samsung n’est pas une preuve d’impayé.'
    },
    devis_accepte:{
      nom:'Concrétiser un devis accepté',priorite:88,
      technique:['Closing par synthèse','Prochaine étape datée','Confirmation écrite'],
      action:'Vérifier la validation client, les conditions du compte puis convenir de la commande et de son échéance.',
      question:'Que manque-t-il concrètement pour passer de l’accord au bon de commande ?',
      mesure:'Commande confirmée dans EBP',controle:'Acceptation saisie dans le téléphone ≠ commande enregistrée, facturation ou paiement.'
    },
    relance_devis:{
      nom:'Relancer un devis sans réponse',priorite:82,
      technique:['LAER','Clarification de l’objection','Rendez-vous de décision'],
      action:'Contacter le décideur, identifier le frein et convenir d’une date de décision plutôt que répéter le prix.',
      question:'Quel critère manque pour vous décider : délai, résultat, prix ou accompagnement ?',
      mesure:'Réponse du décideur et prochaine action datée',controle:'Vérifier la date et le statut du devis dans EBP.'
    },
    essai:{
      nom:'Faire avancer un essai produit',priorite:78,
      technique:['Essai comparatif','Preuve par les résultats','Conclusion par preuve'],
      action:'Revoir avec le peintre les résultats de l’essai et les critères définis avant de proposer une suite.',
      question:'Quel résultat avez-vous constaté en conditions réelles et que faudrait-il améliorer ?',
      mesure:'Résultat de l’essai renseigné et décision de suite',controle:'Ne jamais inventer gain de temps, rendement ou supériorité technique.'
    },
    prochaine_action:{
      nom:'Exécuter l’engagement commercial prévu',priorite:77,
      technique:['Prochaine étape datée','Plan d’action mutuel','Écoute active'],
      action:'Relire l’engagement enregistré, réaliser le contact puis consigner son résultat exact.',
      question:'Cette action est-elle toujours prioritaire pour le garage ?',
      mesure:'Action réalisée, reportée ou annulée avec motif',controle:'La date et l’action proviennent d’une saisie locale.'
    },
    reconquete:{
      nom:'Reprendre contact et comprendre le désengagement',priorite:72,
      technique:['Reconquête','Méthode des 5 pourquoi','Value Selling'],
      action:'Demander ce qui a motivé la baisse ou l’arrêt et proposer un essai seulement si un besoin existe.',
      question:'Qu’est-ce qui vous a fait changer votre façon de vous approvisionner ?',
      mesure:'Cause de désengagement identifiée et prochaine étape',controle:'Ne pas affirmer une baisse d’achats sans export EBP récent.'
    },
    note_terrain:{
      nom:'Transformer une information terrain en prochaine action',priorite:70,
      technique:['Écoute active','Reformulation','Prochaine étape datée'],
      action:'Relire la note, distinguer propos du client et observation, puis rappeler selon la date prévue.',
      question:'Qu’avez-vous réellement constaté et quelle suite souhaitez-vous ?',
      mesure:'Suite confirmée et datée',controle:'Une note terrain est déclarative ; prix concurrents et commandes restent à vérifier.'
    },
    prospect:{
      nom:'Qualifier un nouveau garage avant de vendre',priorite:62,
      technique:['SPIN Selling','CHAMP','Identification du décideur','Micro-engagement'],
      action:'Obtenir un premier échange court ; identifier le décideur, la difficulté actuelle et un prochain rendez-vous.',
      question:'Aujourd’hui, qu’est-ce qui vous fait le plus perdre du temps en carrosserie ?',
      mesure:'Besoin et décideur qualifiés, rendez-vous convenu',controle:'Ne pas déduire le CA potentiel de la seule taille du garage.'
    },
    suivi_client:{
      nom:'Développer la relation client sans forcer une vente',priorite:45,
      technique:['Suivi après-vente','Relance de réassort','Land & Expand'],
      action:'Faire un point sur satisfaction, consommation et service ; proposer une catégorie utile après diagnostic.',
      question:'Quel consommable vous manque le plus souvent pour tenir vos délais ?',
      mesure:'Besoin confirmé, commande ou prochaine visite',controle:'Toute consommation ou fréquence d’achat doit être confirmée par le client ou EBP.'
    },
    manque_donnees:{
      nom:'Compléter la fiche pour choisir une stratégie fiable',priorite:15,
      technique:['Diagnostic technique','Questions ouvertes','Qualification du potentiel'],
      action:'Préparer une visite de découverte et noter un besoin confirmé, un décideur et une prochaine date.',
      question:'Quel problème concret souhaitez-vous résoudre dans votre atelier ?',
      mesure:'Trois informations qualifiées et horodatées',controle:'Ne pas inventer de difficulté ni de potentiel sans retour du terrain.'
    }
  };
  // Rendre le catalogue cohérent : toutes les techniques des recettes doivent exister.
  for(const [nom,p] of Object.entries(PLAYBOOKS)){
    const mauvaises=p.technique.filter(t=>!index.has(t));
    if(mauvaises.length)console.warn('Bibliothèque v46 : technique absente dans '+nom,mauvaises);
  }
  const propre=(v,n=100)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const aujourdHui=()=>jourLocal(new Date());
  const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
  const tableau=x=>Array.isArray(x)?x:[];
  function suggestion(c,dv,pc,tousClients=[]) {
    const lignes=[],nom=propre(c.nom,90)||'Garage';
    const retenir=(id,raison,source,controleEnPlus,score)=>{
      const p=PLAYBOOKS[id]; if(!p)return;
      lignes.push({id,nom,clientId:c.id,href:'#/client/'+c.id,
        titre:p.nom,priorite:score||p.priorite,raison:propre(raison,240),source:propre(source,100),
        techniques:p.technique.map(t=>({nom:t,id:index.get(t)?.id||''})),
        action:p.action,question:p.question,mesure:p.mesure,
        controle:[p.controle,controleEnPlus].filter(Boolean).join(' ')});
    };
    const etatCompte=c.compte&&c.compte.statut;
    if(etatCompte==='bloque'){
      retenir('verification_compte','Compte marqué « bloqué » dans la fiche locale','Statut saisi sur le Samsung');
      return lignes[0];
    }
    const fs=tableau(c.factures).filter(f=>!f.regleLe&&dateOK(f.echeance)&&f.echeance<=aujourdHui());
    if(fs.length)retenir('reglement',fs.length+' facture(s) saisie(s) avec échéance passée et règlement non déclaré','Fiche client locale');
    const quotes=tableau(dv).filter(d=>d.clientId===c.id);
    if(quotes.some(d=>d.statut==='accepte'&&!d.commandeLe))
      retenir('devis_accepte','Devis noté accepté sans commande déclarée envoyée','Devis saisi sur ce Samsung');
    if(quotes.some(d=>d.statut==='envoye'&&tableau(d.lignes).length&&typeof relanceDue==='function'&&relanceDue(d)!=null))
      retenir('relance_devis','Devis envoyé dont le délai local de relance est atteint','Suivi devis sur Samsung');
    if(tableau(c.essais).some(e=>e.statut==='encours'))
      retenir('essai','Un essai produit est marqué en cours','Essai saisi sur la fiche garage');
    if(c.etape && dateOK(c.etapeDate) && c.etapeDate<=aujourdHui())
      retenir('prochaine_action','Une prochaine action saisie est arrivée à échéance','Fiche garage locale');
    // Signaux de reconquête issus de l'export PC uniquement si la qualité
    // commerciale et l'identité du garage sont validées par le moteur v22.
    const sources=window.__commercialV22;
    if(pc&&sources&&Array.isArray(tousClients)&&tousClients.length&&
      typeof sources.fiabilite==='function'&&sources.fiabilite(pc).ok&&
      typeof sources.signauxClient==='function'){
      const signaux=sources.signauxClient(pc,c,tousClients)||[];
      if(signaux.some(x=>x.type==='reconquete'||x.type==='baisse'))
        retenir('reconquete','Un signal de reconquête ou de baisse est documenté dans le plan PC',
          'Plan EBP validé du '+pc.arrete,
          'Ce signal historique ne prouve pas la cause ; la vérifier auprès du garage.',75);
    }
    const besoins=tableau(c.besoinsProduits).filter(b=>b&&b.statut==='ouvert'&&b.suite!=='aucun');
    const demandes=besoins.filter(b=>b.source==='client');
    if(demandes.length)
      retenir('suivi_client',demandes.length+' besoin(s) produit déclaré(s) par le client et encore à suivre',
        'Fiche besoins produits · saisie locale',
        'Vérifier que le besoin reste actuel, puis confirmer tarif et disponibilité dans EBP.',80);
    else if(besoins.length)
      retenir('suivi_client',besoins.length+' piste(s) produits émises par le vendeur, non confirmées par le client',
        'Fiche besoins produits · hypothèse du vendeur',
        'Commencer par qualifier le besoin avec le client, sans présumer la commande.',60);
    if(c.conv==='refus'||c.ancienRoberlo===true||c.exRoberlo===true)
      retenir('reconquete','La fiche mentionne un refus ou un ancien client à qualifier','Qualification locale',
        'Vérifier le motif du refus avant toute nouvelle offre.');
    const notes=tableau(c.infosTerrain);
    if(notes.some(n=>n&&n.nature==='note-commerciale'&&n.suite&&n.suite!=='aucune'&&n.statut!=='fait'&&dateOK(n.suiviLe)&&n.suiviLe<=aujourdHui()))
      retenir('note_terrain','Une note terrain comporte un suivi arrivé à échéance','Notes déclaratives sur le téléphone');
    if(c.statutCrm==='prospect')
      retenir('prospect','La fiche est classée « prospect » sans vente EBP confirmée','Statut CRM local');
    else if(quotes.length||tableau(c.visites).length)
      retenir('suivi_client','Des interactions sont enregistrées sur cette fiche','Activité saisie sur le Samsung');
    else retenir('manque_donnees','Peu d’informations de qualification sont disponibles','Fiche garage locale');
    return lignes.sort((a,b)=>b.priorite-a.priorite)[0]||null;
  }
  function recommandations(clients,devis,pc,limite=3){
    const arr=tableau(clients).map(c=>suggestion(c,devis,pc,clients)).filter(Boolean)
      .sort((a,b)=>b.priorite-a.priorite||a.nom.localeCompare(b.nom,'fr'));
    return arr.slice(0,Math.max(0,Math.min(3,limite)));
  }
  function pourClaude(items,avecDetails=false){
    return tableau(items).slice(0,3).map((c,i)=>({
      ref:'TC'+String(i+1).padStart(2,'0'),
      scenario:c.id,techniques:c.techniques,
      garage:avecDetails?propre(c.nom,80):'Garage '+(i+1)+' (anonymisé)',
      preuve:avecDetails?c.raison:'Motif local masqué (confidentialité)',
      source:c.source,question:c.question,proposition:c.action,
      mesure:c.mesure,controle:c.controle
    }));
  }
  function ligneSuggestion(c){
    return h('div',{class:'v46-conseil'},
      h('div',{class:'v46-en-tete'},h('strong',{},c.nom),h('small',{},c.source)),
      h('strong',{class:'v46-conseil-titre'},c.titre),
      h('p',{},c.raison),
      h('p',{class:'v46-techniques'},'Méthodes : '+c.techniques.map(t=>t.nom).join(' · ')),
      h('p',{},'Idée terrain : '+c.action),
      h('p',{class:'v46-question'},'Question à poser : « '+c.question+' »'),
      h('details',{},h('summary',{},'Pourquoi et quoi vérifier ?'),
        h('p',{},'Résultat à mesurer : '+c.mesure),
        h('p',{},c.controle)),
      h('a',{href:c.href,class:'btn sec v46-go'},'Ouvrir le garage'));
  }
  const ancienClient=pageClient;
  pageClient=async function(id){
    await ancienClient(id);
    if(location.hash!=='#/client/'+id)return;
    const c=await get('clients',id);
    if(!c)return;
    const dv=await getAll('devis');
    if(location.hash!=='#/client/'+id)return;
    const pc=typeof lirePC==='function'?await lirePC():null;
    const tousClients=await getAll('clients');
    if(location.hash!=='#/client/'+id)return;
    const idee=suggestion(c,dv,pc,tousClients);
    if(!idee)return;
    const panneau=h('section',{class:'carte v46-fiche'},
      h('small',{class:'etiq'},'STRATÉGIE TERRAIN · SUGGESTION'),
      h('strong',{},idee.titre),
      h('p',{},idee.raison),
      h('p',{class:'v46-question'},'Question utile : « '+idee.question+' »'),
      h('details',{},h('summary',{},'Voir les méthodes et précautions'),
        h('p',{},'Techniques : '+idee.techniques.map(t=>t.nom).join(' · ')),
        h('p',{},'Proposition : '+idee.action),
        h('p',{},'Résultat à suivre : '+idee.mesure),
        h('p',{},'Contrôle : '+idee.controle)));
    const bloc=app.querySelector('.v36-prochaine')||app.querySelector('.v38-hero');
    if(bloc)bloc.after(panneau);else app.prepend(panneau);
  };
  window.__odicolorTechniquesV46={
    version:46,familles,techniques,playbooks:PLAYBOOKS,
    pourGarage:suggestion,recommandations,pourClaude,ligneSuggestion
  };
})();