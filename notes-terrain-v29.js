'use strict';
/* ODICOLOR v29 — Note terrain. Source unique : fiches clients (IndexedDB).
   Chaque note est une déclaration ou observation, jamais une information EBP vérifiée.
   Les sauvegardes existantes incluent déjà les clients et donc les notes.
   Ne modifie pas les anciens signalements d'incident. */
(function () {
  const TYPES = [
    ['prix','Prix'], ['marque','Marque'], ['obstacle','Obstacle'],
    ['produit','Produit'], ['demande','Demande'], ['autre','Autre']
  ];
  const SUITES = [
    ['aucune','Information uniquement'],
    ['rappel','Rappeler le client'],
    ['devis','Préparer un devis / une offre'],
    ['essai','Proposer ou suivre un essai'],
    ['remonter','À transmettre à Mohamed']
  ];
  const SOURCE = [
    ['client','Propos rapporté du client'],
    ['vendeur','Observation personnelle']
  ];
  const aujourdhuiTerrain = () => jourLocal(new Date());
  const propre = (v, n=600) => String(v == null ? '' : v).replace(/\s+/g,' ').trim().slice(0,n);
  const valideDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const lib = (arr, v) => (arr.find(a=>a[0]===v)||['',String(v||'')])[1];
  const notesDe = c => Array.isArray(c&&c.infosTerrain) ?
    c.infosTerrain.filter(x=>x && x.nature==='note-commerciale' && x.id && x.texte) : [];
  const actionOuverte = n => n && n.suite && n.suite !== 'aucune' && n.statut !== 'fait';
  const noteDate = n => n.creeLe && !isNaN(Date.parse(n.creeLe)) ? dateFr(n.creeLe) : 'Date non renseignée';
  const estEchue = n => actionOuverte(n) && valideDate(n.suiviLe) && n.suiviLe<=aujourdhuiTerrain();
  const styleLien = (url, label) => h('a',{class:'btn sec',href:url},label);

  async function sauverNote(clientId, nouvelle, idEdition) {
    const c = await get('clients', clientId);
    if (!c) throw new Error('Client introuvable.');
    const all = notesDe(c);
    if (!nouvelle.texte || nouvelle.texte.length < 5)
      throw new Error('Écris au moins 5 caractères pour conserver une information exploitable.');
    if (!TYPES.some(([k])=>k===nouvelle.type)) throw new Error('Catégorie inconnue.');
    if (!SOURCE.some(([k])=>k===nouvelle.source)) throw new Error('Origine de l’information inconnue.');
    if (!SUITES.some(([k])=>k===nouvelle.suite)) throw new Error('Suite à donner inconnue.');
    if (nouvelle.suite!=='aucune' && !valideDate(nouvelle.suiviLe))
      throw new Error('Choisis une date pour cette action.');
    if (!idEdition && all.length>=180)
      throw new Error('Limite de notes atteinte : fais une sauvegarde avant de continuer.');

    if (idEdition) {
      const ancien=all.find(x=>x.id===idEdition);
      if (!ancien) throw new Error('La note à modifier n’existe plus.');
      Object.assign(ancien,nouvelle,{modifieLe:new Date().toISOString()});
      if(nouvelle.suite==='aucune')ancien.statut='information';
      else if(ancien.statut==='fait')ancien.statut='a_faire';
    } else {
      all.push({
        id:nouvelUid(),nature:'note-commerciale',creeLe:new Date().toISOString(),
        ...nouvelle,statut:nouvelle.suite==='aucune'?'information':'a_faire'
      });
    }
    c.infosTerrain=all;
    await putMany('clients',[c]);
    return c;
  }

  async function terminerAction(clientId, noteId) {
    const c=await get('clients',clientId);
    if(!c)throw new Error('Garage introuvable.');
    const n=notesDe(c).find(x=>x.id===noteId);
    if(!n || !actionOuverte(n))return;
    n.statut='fait';
    n.faitLe=new Date().toISOString();
    c.infosTerrain=notesDe(c);
    await putMany('clients',[c]);
  }

  async function copierTexte(texte) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText)
        throw new Error('Copie système non disponible');
      await navigator.clipboard.writeText(texte);
      toast('Information copiée. Rien n’a été envoyé automatiquement.');
    } catch (e) {
      const t=h('textarea',{rows:6,'aria-label':'Information à copier'},texte);
      const panneau=h('div',{class:'carte'},h('strong',{},'Copie manuelle'),t,
        h('p',{class:'mut'},'Sélectionne le texte ci-dessus puis copie-le. Aucun envoi automatique.'));
      app.prepend(panneau);
    }
  }

  function carteNote(client,n,avecActions=true) {
    const source=lib(SOURCE,n.source);
    const c=h('section',{class:'v29-note'},
      h('div',{class:'v29-ligne'},h('strong',{},lib(TYPES,n.type)),
        h('small',{class:'mut'},noteDate(n))),
      h('p',{},n.texte),
      n.reference?h('p',{class:'mut v29-lim'},'Marque / référence : '+n.reference):null,
      h('small',{class:'mut'},source+' · non vérifié par EBP'),
      n.suite!=='aucune'?h('div',{class:'v29-suivi'},h('strong',{},lib(SUITES,n.suite)),
        h('span',{class:'tag '+(n.statut==='fait'?'ok':estEchue(n)?'ko':'warn')},
          n.statut==='fait'?'Fait':estEchue(n)?'À traiter':n.suiviLe?'Prévu : '+dateFr(n.suiviLe+'T12:00:00'):'Sans date')):null);
    if(avecActions){
      const actions=h('div',{class:'v29-note-actions'});
      actions.append(h('a',{href:'#/note-terrain/'+client.id+'?modifier='+encodeURIComponent(n.id),class:'btn sec'},'Modifier'));
      if(actionOuverte(n)){
        const b=h('button',{type:'button',class:'btn sec',onclick:async()=>{
          try{await terminerAction(client.id,n.id);toast('Action terminée, aucune commande déclarée.');await pageNotesTerrainClient(client.id);}
          catch(e){toast(e.message,true)}
        }},'Action faite');
        actions.append(b);
      }
      if(n.suite==='remonter'){
        actions.append(h('button',{type:'button',class:'btn sec',onclick:()=>copierTexte(
          'INFORMATION COMMERCIALE · ODICOLOR\nClient : '+client.nom+'\nType : '+lib(TYPES,n.type)+
          '\nOrigine : '+source+'\nDate : '+noteDate(n)+'\nObservation : '+n.texte+
          (n.reference?'\nMarque / référence : '+n.reference:'')+
          '\nÀ vérifier avant décision commerciale.')},'Copier pour Mohamed'));
      }
      c.append(actions);
    }
    return c;
  }

  async function pageNoteTerrain(clientId, editId) {
    const clients=(await getAll('clients')).sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
    const c0=clients.find(c=>c.id===clientId);
    const edit=c0&&editId?notesDe(c0).find(n=>n.id===editId):null;

    const selector=h('select',{'aria-label':'Garage concerné'},
      h('option',{value:'',selected:!c0},'Choisir un garage…'),
      clients.map(c=>h('option',{value:String(c.id),selected:c.id===clientId},c.nom)));
    const choixType=h('select',{'aria-label':'Type d’information'},
      TYPES.map(([value,label])=>h('option',{value,selected:(edit?.type||'obstacle')===value},label)));
    const origine=h('select',{'aria-label':'Origine de l’information'},
      SOURCE.map(([value,label])=>h('option',{value,selected:(edit?.source||'client')===value},label)));
    const texte=h('textarea',{rows:3,maxlength:600,placeholder:'Ex. Le chef d’atelier trouve le vernis trop cher. Demande une proposition en bidon de 5 L.',
      'aria-label':'Remarque du client ou observation'},edit?.texte||'');
    const reference=h('input',{maxlength:100,placeholder:'Marque ou référence si connue (facultatif)',
      'aria-label':'Marque ou référence'},edit?.reference||'');
    const suite=h('select',{'aria-label':'Suite commerciale'},
      SUITES.map(([value,label])=>h('option',{value,selected:(edit?.suite||'aucune')===value},label)));
    const suivi=h('input',{type:'date','aria-label':'Date de l’action',value:edit?.suiviLe||''});
    const dateBox=h('div');
    const erreur=h('p',{role:'status',class:'v29-erreur'});
    const majDate=()=>{
      dateBox.replaceChildren(...(suite.value==='aucune'?[]:[
        h('label',{},'À faire le'),suivi,
        h('small',{class:'mut'},'Date obligatoire pour ne pas perdre la relance.')
      ]));
    };
    suite.addEventListener('change',majDate);majDate();
    const enregistrer=async()=>{
      const id=Number(selector.value);
      if(!Number.isSafeInteger(id)||id<1){erreur.textContent='Choisis le garage concerné.';return}
      if(edit&&id!==clientId){erreur.textContent='Pour modifier une note, garde le même garage.';return}
      const record={type:choixType.value,source:origine.value,texte:propre(texte.value),
        reference:propre(reference.value,100),
        suite:suite.value,suiviLe:suite.value==='aucune'?'':suivi.value};
      try{
        await sauverNote(id,record,edit?edit.id:null);
        toast(edit?'Note corrigée.':'Note terrain enregistrée.');
        location.hash='#/notes-client/'+id;
        if(location.hash==='#/notes-client/'+id)await pageNotesTerrainClient(id);
      }catch(e){erreur.textContent=e.message;toast(e.message,true)}
    };
    montrer(edit?'Corriger la note':'Note terrain',
      h('section',{class:'carte v29-form'},
        h('p',{class:'mut'},'Prix, marques, obstacles : garde les mots exacts du client. Un prix annoncé n’est jamais un prix concurrent vérifié.'),
        h('label',{},'Garage'),selector,
        h('label',{},'Information'),choixType,
        h('label',{},'Qui l’a signalée ?'),origine,
        h('label',{},'Note rapide (micro du clavier Samsung possible)'),texte,
        h('details',{class:'v29-option'},h('summary',{},'Marque / produit concerné (facultatif)'),
          reference),
        h('label',{},'Suite à donner'),suite,
        dateBox,erreur,
        h('button',{type:'button',class:'btn gros v29-save',onclick:enregistrer},
          edit?'Enregistrer les modifications':'Enregistrer la note')),
      h('div',{class:'v29-liens'},styleLien('#/notes-terrain','Voir toutes mes notes'),
        clientId?styleLien('#/client/'+clientId,'Fiche client'):null),
      h('p',{class:'mut'},'Pour un problème produit, teinte ou livraison nécessitant un suivi auprès de Mohamed, utilise plutôt « Signaler un problème ».'),
      h('div',{class:'actions'},styleLien('#/signaler'+(clientId?'/'+clientId:''),'Signaler un incident')));
  }

  async function pageNotesTerrainClient(id){
    const c=await get('clients',id);
    if(!c)return nonTrouve();
    const notes=notesDe(c).sort((a,b)=>String(b.creeLe).localeCompare(String(a.creeLe)));
    montrer('Notes · '+c.nom,
      h('div',{class:'carte'},h('strong',{},c.nom),
        h('p',{class:'mut'},notes.length+' information(s) terrain saisie(s), conservées dans cette fiche et dans la sauvegarde JSON.'),
        h('div',{class:'actions'},styleLien('#/note-terrain/'+id,'+ Note terrain'),styleLien('#/client/'+id,'Fiche client'))),
      notes.length?h('div',{class:'carte'},notes.slice(0,80).map(n=>carteNote(c,n))):
        h('p',{class:'mut'},'Aucune note. Enregistre ce que le garage te dit sur les prix, marques ou obstacles.'));
  }

  async function pageNotesTerrain() {
    const cl=await getAll('clients');
    const all=cl.flatMap(c=>notesDe(c).map(n=>({c,n})))
      .sort((a,b)=>String(b.n.creeLe).localeCompare(String(a.n.creeLe)));
    const enCours=all.filter(x=>actionOuverte(x.n));
    const echues=enCours.filter(x=>estEchue(x.n));
    const filtre=h('select',{'aria-label':'Filtrer les notes'},
      [['','Toutes les notes'],...TYPES].map(([value,label])=>h('option',{value},label)));
    const list=h('div');
    const render=()=>{
      const visible=all.filter(({n})=>!filtre.value||n.type===filtre.value);
      list.replaceChildren(...(visible.length?visible.slice(0,50).map(({c,n})=>
        h('a',{class:'v29-list-row',href:'#/notes-client/'+c.id},
          h('span',{},h('strong',{},c.nom),h('small',{class:'mut'},lib(TYPES,n.type)+' · '+noteDate(n)),
            h('small',{},propre(n.texte,130))),
          h('span',{class:'v29-chevron'},'›'))):
        [h('p',{class:'mut'},'Aucune information pour ce filtre.')]));
    };
    filtre.addEventListener('change',render);
    montrer('Informations terrain',
      h('div',{class:'carte v29-summary'},
        h('div',{class:'v29-ligne'},h('strong',{},'Informations de tes visites'),
          h('span',{class:'tag'},all.length+' notes')),
        h('p',{class:'mut'},enCours.length+' action(s) ouvertes · '+echues.length+' à traiter aujourd’hui ou en retard.'),
        h('div',{class:'actions'},styleLien('#/note-terrain','+ Noter une information'),
          styleLien('#/signalements','Incidents / signalements'))),
      echues.length?h('div',{class:'carte v29-alert'},h('strong',{},'Relances terrain à traiter'),
        echues.slice(0,5).map(({c,n})=>h('a',{class:'v29-list-row',href:'#/notes-client/'+c.id},
          h('span',{},h('strong',{},c.nom),h('small',{},lib(SUITES,n.suite)+' · '+lib(TYPES,n.type))),
          h('span',{class:'tag ko'},'À traiter')))):null,
      h('section',{class:'carte'},h('label',{},'Filtrer les informations'),filtre,list),
      h('p',{class:'mut'},'Notes saisies sur le téléphone. L’application ne vérifie pas les prix ou déclarations des clients dans EBP.'));
    render();
  }

  const ancienneRoute=route;
  route=async function(){
    const p=(location.hash||'#/').slice(2).split('/');
    if(p[0]==='note-terrain'){
      const morceau=String(p[1]||'').split('?')[0];
      const id=/^\d+$/.test(morceau)?Number(morceau):null;
      const m=/[?&]modifier=([^&]+)/.exec(location.hash||'');
      return pageNoteTerrain(id,m?decodeURIComponent(m[1]):null);
    }
    if(p[0]==='notes-terrain')return pageNotesTerrain();
    if(p[0]==='notes-client'&&/^\d+$/.test(p[1]||''))return pageNotesTerrainClient(Number(p[1]));
    return ancienneRoute();
  };

  const ancienAccueil=pageAccueil;
  pageAccueil=async function(){
    await ancienAccueil();
    if((location.hash||'#/')!=='#/')return;
    const bloc=app.querySelector('.v23-prochaine');
    if(!bloc)return;
    const n=h('a',{class:'v29-home-note',href:'#/note-terrain'},
      h('span',{},'✎ Note terrain'),h('small',{},'Prix · Marque · Obstacle · Client'));
    bloc.append(n);
  };

  const ancienClient=pageClient;
  pageClient=async function(id){
    await ancienClient(id);
    const c=await get('clients',id);
    if(!c)return;
    const nb=notesDe(c).length;
    const entree=h('div',{class:'carte v29-client-note'},
      h('div',{class:'v29-ligne'},h('strong',{},'Informations commerciales'),
        h('span',{class:'tag'},nb+' note'+(nb>1?'s':''))),
      h('p',{class:'mut'},'Prix, marques, objections et demandes entendus chez ce garage.'),
      h('div',{class:'actions'},styleLien('#/note-terrain/'+id,'+ Note terrain'),
        nb?styleLien('#/notes-client/'+id,'Voir les '+nb+' notes'):null));
    const trio=app.querySelector('.trio');
    if(trio)trio.after(entree);else app.prepend(entree);
  };

  const ancienPlus=pagePlus;
  pagePlus=function(){
    ancienPlus();
    app.prepend(h('a',{class:'v29-plus-entry',href:'#/notes-terrain'},
      h('span',{},h('strong',{},'Informations terrain'),
        h('small',{},'Prix, marques, obstacles et demandes des garages')),
      h('span',{},'›')));
  };

  const ancienReglages=pageReglages;
  pageReglages=async function(){
    await ancienReglages();
    const oldTitle=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(oldTitle)oldTitle.textContent='ODICOLOR Solution · v29';
    const oldDetail=app.querySelector('.v25-etat small.mut');
    if(oldDetail)oldDetail.textContent='Thème sombre permanent · notes terrain conservées dans les fiches clients.';
  };

  window.__notesTerrainV29={notesDe,actionOuverte,estEchue,sauverNote,terminerAction,
    categories:TYPES,suites:SUITES};
})();