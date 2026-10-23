'use strict';
/* ODICOLOR v31 : devis visible + contrôle officiel + transmission N+1.
 * Ne jamais créer un compte EBP, accepter des conditions de paiement
 * ou déclarer le dossier envoyé sans une action explicite du commercial.
 * Données stockées localement dans le client => sauvegarde JSON inchangée.
 */
(function(){
  const propre=(v,n=500)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const sirenValide=v=>/^\d{9}$/.test(v||'');
  const siretValide=v=>/^\d{14}$/.test(v||'');
  const cloture={A:'Active',C:'Cessée'};
  const ETATS={
    brouillon:'Brouillon · compte non ouvert',
    transmis:'Transmission déclarée · attente du N+1',
    complements:'Compléments demandés · compte non ouvert',
    accord_declare:'Accord N+1 déclaré · ouverture EBP à confirmer',
    refus_declare:'Refus N+1 déclaré · compte non ouvert'
  };
  const d0=c=>c&&c.demandeCompteN1&&typeof c.demandeCompteN1==='object'?
    {...c.demandeCompteN1}: {statut:'brouillon'};
  const dateAffiche=s=>{
    const x=Date.parse(s||'');return Number.isFinite(x)?new Date(x).toLocaleString('fr-FR'):'Date inconnue';
  };
  const etatEntreprise=c=>{
    const ent=c&&c.ent;
    if(!ent||!sirenValide(ent.siren))return {valide:false,libelle:'À vérifier',alerte:true};
    const v=c.verificationDossier;
    const preuve=v&&v.selectionParCommercial===true &&
      v.source==='API Recherche d’entreprises'&&v.siren===ent.siren &&
      ['A','C'].includes(v.etat)&&v.etat===ent.etat&&Number.isFinite(Date.parse(v.date));
    if(!preuve)return {valide:false,libelle:'Identité en fiche · à revérifier sur le registre',alerte:true};
    const age=(Date.now()-Date.parse(v.date))/86400000;
    if(age<0||age>30)return {valide:false,libelle:'Vérification ancienne · à renouveler',alerte:true};
    if(ent.etat==='A')return {valide:true,libelle:'Entreprise active au registre (à la date du contrôle)',alerte:false};
    if(ent.etat==='C')return {valide:true,libelle:'Entreprise cessée selon le registre',alerte:true};
    return {valide:false,libelle:'État administratif non déterminé',alerte:true};
  };

  function dossierTexte(client,details){
    const c=client||{},d=details||d0(c),ent=c.ent||{},etat=etatEntreprise(c);
    const source=etat.valide?'API Recherche d’entreprises (sélection explicite du commercial)':
      ent.siren?'Identité en fiche : à revérifier officiellement':'Aucune vérification enregistrée';
    return [
      'ODICOLOR — DEMANDE DE VALIDATION N+1 / OUVERTURE DE COMPTE',
      'Dossier préparé le : '+new Date().toLocaleString('fr-FR'),
      '',
      'PROSPECT — INFORMATIONS SAISIES SUR LE TERRAIN',
      'Garage : '+(propre(c.nom,120)||'Non renseigné'),
      'Ville : '+(propre(c.villeProspection,70)||'Non renseignée'),
      'Téléphone : '+(propre(c.tel,30)||'Non renseigné'),
      'Statut CRM : '+(c.statutCrm==='prospect'?'Prospect':'À contrôler dans le CRM'),
      '',
      'VÉRIFICATION ENTREPRISE — NE VAUT PAS SOLVABILITÉ',
      'Dénomination au registre : '+(propre(ent.nom,120)||'Non vérifiée'),
      'SIREN : '+(sirenValide(ent.siren)?ent.siren:'Non vérifié'),
      'SIRET : '+(siretValide(ent.siret)?ent.siret:'Non vérifié'),
      'État administratif : '+etat.libelle,
      'Activité / NAF : '+(propre(ent.naf,12)||'Non renseigné'),
      'Adresse au registre : '+(propre(ent.adresse,160)||'Non vérifiée'),
      'Source : '+source,
      'Date de consultation : '+(ent.lu?dateAffiche(ent.lu):'Non connue'),
      '',
      'DEMANDE COMMERCIALE',
      'Destinataire N+1 : '+(propre(d.destinataire,90)||'À renseigner'),
      'Motif / produits envisagés : '+(propre(d.motif,700)||'À compléter'),
      'Pièces reçues / manquantes : '+(propre(d.pieces,350)||'À confirmer selon la procédure ODICOLOR'),
      '',
      'CONTRÔLES ET DÉCISION',
      'Règles d’ouverture ODICOLOR : à appliquer par le N+1 (non paramétrées ici)',
      'Conditions de paiement et encours : NON VALIDÉS par cette application',
      'Décision et ouverture dans EBP : NON CONFIRMÉES par cette application',
      '',
      'Ce document est une transmission commerciale, pas une approbation ni une ouverture de compte.'
    ].join('\n');
  }
  function lien(href,label){
    return h('a',{href,class:'btn sec',target:href.startsWith('http')?'_blank':undefined,
      rel:href.startsWith('http')?'noopener noreferrer':undefined,
      referrerPolicy:href.startsWith('http')?'no-referrer':undefined},label);
  }
  async function lireClient(id){return await get('clients',id)}
  async function enregistrerDemande(id,fields){
    const c=await lireClient(id);
    if(!c)throw new Error('Fiche prospect introuvable.');
    const old=d0(c);
    c.demandeCompteN1={
      ...old,
      destinataire:propre(fields.destinataire,90),
      motif:propre(fields.motif,700),
      pieces:propre(fields.pieces,350),
      modifieLe:new Date().toISOString(),
      statut:ETATS[old.statut]?old.statut:'brouillon'
    };
    await putMany('clients',[c]);
    return c;
  }
  async function noterTransmission(id,fields){
    const c=await enregistrerDemande(id,fields);
    c.demandeCompteN1.statut='transmis';
    c.demandeCompteN1.transmisLe=new Date().toISOString();
    // Le statut 'transmis' est déclaré manuellement ; il ne provient pas
    // d'une confirmation WhatsApp, email ou serveur.
    await putMany('clients',[c]);return c;
  }
  async function retourN1(id,fields,etat,commentaire){
    if(!['complements','accord_declare','refus_declare'].includes(etat))
      throw new Error('Décision N+1 non reconnue.');
    if(propre(commentaire,700).length<5)
      throw new Error('Décris le retour du N+1 pour pouvoir le suivre.');
    const c=await enregistrerDemande(id,fields);
    c.demandeCompteN1={
      ...c.demandeCompteN1,statut:etat,
      retour:propre(commentaire,700),retourLe:new Date().toISOString()
    };
    // Pas de mutation de c.compte, statutCrm ou des commandes.
    await putMany('clients',[c]);return c;
  }
  async function associerEntreprise(id,entreprise){
    if(!entreprise||!sirenValide(entreprise.siren))
      throw new Error('SIREN invalide.');
    if(!['A','C'].includes(entreprise.etat))
      throw new Error('État administratif non documenté : contrôle manuel nécessaire.');
    const c=await lireClient(id);
    if(!c)throw new Error('Prospect introuvable.');
    const ancienSiren=c.ent&&c.ent.siren;
    c.ent={...entreprise,lu:new Date().toISOString()};
    c.verificationDossier={
      source:'API Recherche d’entreprises',
      date:c.ent.lu,siren:c.ent.siren,etat:c.ent.etat,
      selectionParCommercial:true
    };
    if(ancienSiren&&ancienSiren!==entreprise.siren){
      const d=d0(c);
      // Éviter qu'une transmission portant sur une autre société reste valide.
      c.demandeCompteN1={...d,statut:'brouillon',transmisLe:null,
        retour:null,retourLe:null,ancienSiren,
        avertissement:'Identité juridique modifiée : retransmission nécessaire.'};
    }
    await putMany('clients',[c]);return c;
  }
  async function copieManuelle(texte){
    try{
      if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Clipboard');
      await navigator.clipboard.writeText(texte);
      toast('Dossier copié. Aucune transmission automatique.');
    }catch(e){
      app.prepend(h('section',{class:'carte v31-copie'},
        h('strong',{},'Copie manuelle'),
        h('textarea',{rows:10,'aria-label':'Texte à sélectionner et copier'},texte),
        h('p',{class:'mut'},'Sélectionne le texte pour le copier puis l’envoyer à ton N+1.')));
    }
  }

  async function pageDossierProspect(id){
    const client=await lireClient(id);
    if(!client)return nonTrouve();
    const d=d0(client),e=etatEntreprise(client);
    const zoneResultats=h('div',{class:'v31-resultats','aria-live':'polite'});
    const zoneEtat=h('div');
    const err=h('p',{role:'status',class:'v31-erreur'});
    const destination=h('input',{type:'text',maxlength:90,
      'aria-label':'N+1 destinataire',placeholder:'Responsable destinataire (facultatif)',value:d.destinataire||''});
    const motif=h('textarea',{rows:3,maxlength:700,'aria-label':'Motif ouverture',
      placeholder:'Ex. Garage intéressé par nos vernis et abrasifs, demande ouverture d’un compte professionnel.'},d.motif||'');
    const pieces=h('textarea',{rows:2,maxlength:350,'aria-label':'Documents et pièces',
      placeholder:'Documents reçus ou à demander, selon les règles internes.'},d.pieces||'');
    const champs=()=>({destinataire:destination.value,motif:motif.value,pieces:pieces.value});
    const msg=()=>dossierTexte(client,{...d,...champs()});
    const action=async(fn)=>{
      try{err.textContent='';await fn();toast('Dossier mis à jour.');await pageDossierProspect(id)}
      catch(x){err.textContent=x.message||String(x);toast('Dossier non enregistré.',true)}
    };
    const inputRecherche=h('input',{type:'search',maxlength:120,
      'aria-label':'Rechercher l’entreprise',placeholder:'Nom du garage, SIREN ou SIRET',
      value:(client.ent&&client.ent.siren)||client.nom});
    const btnRechercher=h('button',{class:'btn',type:'button'},'Vérifier sur le registre');
    btnRechercher.addEventListener('click',async()=>{
      const q=propre(inputRecherche.value,120);
      if(q.length<2){zoneResultats.replaceChildren(h('p',{class:'mut'},'Saisis le nom ou un numéro SIREN/SIRET.'));return}
      btnRechercher.disabled=true;
      zoneResultats.replaceChildren(h('p',{class:'mut'},'Recherche officielle en cours…'));
      try{
        const hits=await chercherEntreprise(q);
        const visibles=hits.slice(0,5);
        zoneResultats.replaceChildren();
        if(!visibles.length){zoneResultats.append(h('p',{class:'mut'},
          'Aucune entreprise trouvée. Un résultat absent ne prouve pas que le garage est fermé.'));return;}
        zoneResultats.append(h('p',{class:'mut'},
          'Sélectionne uniquement la bonne société : vérifie son nom et son adresse.'));
        for(const info of visibles){
          const btn=h('button',{type:'button',class:'btn sec v31-choix'},'C’est cette entreprise');
          btn.addEventListener('click',async()=>{
            try{
              const old=client.ent&&client.ent.siren;
              if(old&&old!==info.siren&&
                !confirm('Changer de SIREN ? Le dossier transmis devra être revalidé.'))return;
              await associerEntreprise(id,info);
              toast('Identité sélectionnée depuis le registre.');
              await pageDossierProspect(id);
            }catch(x){err.textContent=x.message||String(x)}
          });
          zoneResultats.append(h('div',{class:'v31-candidat'},
            h('strong',{},propre(info.nom,120)),
            h('small',{},'SIREN '+info.siren+
              ' · '+(info.etat==='A'?'ACTIVE':info.etat==='C'?'CESSÉE':'ÉTAT INCONNU')),
            h('small',{class:'mut'},propre(info.adresse,160)||'Adresse non renseignée'),
            btn));
        }
      }catch(x){zoneResultats.replaceChildren(h('p',{class:'v31-erreur'},
        'Vérification impossible : '+(x.message||String(x))))}
      finally{btnRechercher.disabled=false}
    });
    const btnSiren=h('button',{type:'button',class:'btn sec',disabled:!sirenValide(client.ent?.siren)},
      'Copier le SIREN');
    btnSiren.addEventListener('click',()=>copieManuelle(client.ent.siren));
    const verifier=h('section',{class:'carte v31-verif'},
      h('strong',{},'1. Vérifier l’entreprise'),
      h('div',{class:'v31-etat'},
        h('span',{class:'tag '+(e.valide&&!e.alerte?'ok':'ko')},e.libelle)),
      client.ent&&sirenValide(client.ent.siren)?
        h('div',{class:'v31-identite'},
          h('strong',{},client.ent.nom||'Dénomination non indiquée'),
          h('small',{},'SIREN : '+client.ent.siren+
            (siretValide(client.ent.siret)?' · SIRET : '+client.ent.siret:'')),
          h('small',{class:'mut'},client.ent.adresse||'Adresse non renseignée'),
          h('small',{class:'mut'},(e.valide?'API officielle · contrôlé le ':'Données de la fiche · à recontrôler · datées du ')+dateAffiche(client.ent.lu))):
        h('p',{class:'mut'},'Non vérifiée : la seule présence du nom du garage ne prouve pas son immatriculation.'),
      h('label',{},'Rechercher une entreprise'),inputRecherche,btnRechercher,zoneResultats,
      h('div',{class:'actions'},btnSiren,lien('https://www.pappers.fr/recherche','Consulter Pappers')),
      h('p',{class:'mut'},'L’API publique vérifie l’identité et l’état administratif, pas la solvabilité. Pappers s’ouvre séparément : aucune donnée client n’est transmise automatiquement.'));

    const btnSauver=h('button',{type:'button',class:'btn sec'},'Enregistrer le brouillon');
    btnSauver.addEventListener('click',()=>action(()=>enregistrerDemande(id,champs())));
    const btnPartager=h('button',{type:'button',class:'btn v31-partage'},'Partager le dossier au N+1');
    btnPartager.addEventListener('click',()=>{
      // Le partage doit commencer dans le geste de l’utilisateur ;
      // ne pas attendre une écriture IndexedDB avant navigator.share().
      const contenu=msg();
      if(navigator.share){
        navigator.share({title:'ODICOLOR · validation ouverture de compte',text:contenu})
          .then(()=>toast('Fenêtre de partage refermée. Confirme manuellement la transmission.'))
          .catch(x=>{if(x&&x.name!=='AbortError')copieManuelle(contenu)});
      }else copieManuelle(contenu);
    });
    const btnCopie=h('button',{type:'button',class:'btn sec'},'Copier le dossier');
    btnCopie.addEventListener('click',()=>copieManuelle(msg()));
    const btnConfirmer=h('button',{type:'button',class:'btn sec'},'J’ai transmis au N+1');
    btnConfirmer.addEventListener('click',()=>{
      if(!confirm('Confirmer que tu as réellement transmis ce dossier au N+1 ?'))return;
      return action(()=>noterTransmission(id,champs()));
    });

    const retour=h('textarea',{rows:2,maxlength:700,
      'aria-label':'Retour du N+1',placeholder:'Retour exact du responsable, date ou pièces demandées.',
      },d.retour||'');
    const decision=h('select',{'aria-label':'Décision rapportée du N+1'},
      [['complements','Compléments demandés'],['accord_declare','Accord annoncé (à vérifier dans EBP)'],
        ['refus_declare','Refus annoncé']].map(([value,label])=>
          h('option',{value,selected:value===d.statut},label)));
    const boutonRetour=h('button',{class:'btn sec',type:'button'},'Enregistrer le retour');
    boutonRetour.addEventListener('click',()=>action(()=>retourN1(id,champs(),decision.value,retour.value)));

    const dossier=h('section',{class:'carte v31-dossier'},
      h('strong',{},'2. Préparer le dossier N+1'),
      h('p',{class:'mut'},'Le N+1 applique les règles internes ODICOLOR. Aucun document ni condition de crédit n’est imposé ici en attendant la procédure.'),
      h('div',{class:'v31-etat'},h('span',{class:'tag warn'},ETATS[d.statut]||ETATS.brouillon)),
      d.transmisLe?h('small',{class:'mut'},'Transmission déclarée le '+dateAffiche(d.transmisLe)):null,
      h('label',{},'N+1 destinataire'),destination,
      h('label',{},'Motif commercial / produits intéressants'),motif,
      h('label',{},'Pièces et informations à réunir'),pieces,
      h('div',{class:'v31-options'},btnSauver,btnPartager,btnCopie,btnConfirmer),
      err,
      h('details',{class:'v31-retour'},
        h('summary',{},'3. Renseigner le retour du N+1'),
        h('p',{class:'mut'},'Une décision rapportée ici ne valide ni le crédit ni l’ouverture du compte dans EBP.'),
        h('label',{},'Retour annoncé'),decision,
        h('label',{},'Preuve / commentaire du retour'),retour,boutonRetour));

    montrer('Prospect · Validation N+1',
      h('div',{class:'v31-entete'},
        h('small',{class:'etiq'},'OUVERTURE COMPTE ODICOLOR · À VALIDER'),
        h('strong',{},propre(client.nom,120)),
        h('p',{class:'mut'},'Création de compte soumise aux règles ODICOLOR et à la validation humaine. Cet écran n’ouvre pas le compte EBP.')),
      verifier,dossier,
      h('div',{class:'v31-bas'},lien('#/client/'+id,'Fiche du garage'),
        lien('#/note-terrain/'+id,'Note terrain'),
        h('button',{class:'btn sec',type:'button',onclick:()=>creerDevis(client)},'Créer un devis')),
      h('p',{class:'mut'},'Information importante : un établissement peut avoir cessé ou changé de SIREN. Ne préjuge pas des conditions de paiement.'));
  }

  const routeAvant=route;
  route=async function(){
    const p=(location.hash||'#/').slice(2).split('/');
    if(p[0]==='dossier-prospect'&&/^\d+$/.test(p[1]||'')){
      return pageDossierProspect(Number(p[1]));
    }
    return routeAvant();
  };

  const accueilAvant=pageAccueil;
  pageAccueil=async function(){
    await accueilAvant();
    if((location.hash||'#/')!=='#/')return;
    // Un seul bouton Nouveau devis, visible directement après l'objectif.
    const flottant=app.querySelector('.fab');
    if(flottant)flottant.remove();
    const premier=app.querySelector('.v23-prochaine');
    const btn=h('a',{class:'v31-nouveau-devis',href:'#/nouveau'},
      h('span',{class:'v31-plus'},'+'),
      h('span',{},h('strong',{},'NOUVEAU DEVIS'),
        h('small',{},'Choisir un garage ou créer un prospect')),
      h('span',{class:'v31-chevron'},'›'));
    if(premier)premier.before(btn);else app.prepend(btn);
  };

  const clientAvant=pageClient;
  pageClient=async function(id){
    await clientAvant(id);
    if(location.hash!=='#/client/'+id)return;
    const c=await lireClient(id);
    if(!c)return;
    const d=d0(c);
    // Un prospect créé sur le terrain n'a pas de preuve EBP d'ouverture :
    // éviter qu'un clic dans la fiche le présente comme compte ouvert.
    if(c.statutCrm==='prospect'&&c.origineCreation==='visite-terrain'){
      const statutCompte=app.querySelector('select[aria-label="Statut du compte"]');
      const optionOuvert=statutCompte&&statutCompte.querySelector('option[value="ouvert"]');
      if(optionOuvert&&!optionOuvert.selected){
        optionOuvert.disabled=true;
        optionOuvert.textContent='Ouvert (uniquement après confirmation EBP)';
      }
    }
    // Afficher le dossier en cours pour les prospects ou lorsqu'une
    // demande N+1 existe. Aucun faux badge 'compte ouvert'.
    if(c.statutCrm==='prospect'||c.demandeCompteN1){
      const carte=h('a',{class:'carte v31-client-dossier',href:'#/dossier-prospect/'+id},
        h('small',{class:'etiq'},'VALIDATION COMPTE ODICOLOR'),
        h('strong',{},'Vérification entreprise · dossier N+1'),
        h('small',{class:'mut'},ETATS[d.statut]||ETATS.brouillon));
      const trio=app.querySelector('.trio');
      if(trio)trio.before(carte);else app.prepend(carte);
    }
  };

  const plusAvant=pagePlus;
  pagePlus=function(){
    plusAvant();
    app.prepend(h('a',{class:'v31-plus-lien',href:'#/nouveau-garage'},
      'Nouveau prospect · vérification et N+1'));
  };

  const reglagesAvant=pageReglages;
  pageReglages=async function(){
    await reglagesAvant();
    const titre=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(titre)titre.textContent='ODICOLOR Solution · v31';
  };

  window.__dossierN1V31={
    etatEntreprise,dossierTexte,enregistrerDemande,noterTransmission,
    retourN1,associerEntreprise,etats:ETATS
  };
})();