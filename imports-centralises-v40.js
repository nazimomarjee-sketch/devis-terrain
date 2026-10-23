'use strict';
/* ODICOLOR v40 — Centralisation des imports dans Réglages.
 * Aucun stockage supplémentaire : conserve le moteur EBP, le validateur
 * des plans PC et la bibliothèque PDF IndexedDB existants.
 */
(function(){
  const limite=(s,n=180)=>String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,n);
  let importZoneActive=null;
  const fiche=(nom,description,content,id,open=false)=>
    h('details',{class:'v40-import-detail',id,open},
      h('summary',{},
        h('span',{class:'v40-import-titre'},nom),
        h('small',{class:'v40-import-desc'},description)),
      h('div',{class:'v40-import-body'},content));

  function importEBP(kind,label){
    const zone=h('div',{class:'v40-import-resultat'});
    const bouton=h('button',{type:'button',class:'btn v40-import-action',
      onclick:()=>{
        if(importZoneActive&&importZoneActive!==zone)importZoneActive.replaceChildren();
        importZoneActive=zone;
        // Moteur d'import de l'application : choix des colonnes, rapport et validation inchangés.
        importUI(kind,zone);
        const file=zone.querySelector('input[type="file"]');
        if(file)file.focus();
      }},'Choisir un fichier '+label);
    return [h('p',{class:'mut'},kind==='articles'?
      'Importe les références et tarifs de vente réels issus d’EBP. Vérifie les colonnes et les prix avant utilisation.':
      'Ajoute ou rapproche tes clients à partir d’un Excel/CSV. Vérifie les doublons et les noms.'),
      bouton,zone];
  }

  function importPC(){
    const file=h('input',{type:'file',accept:'.json,application/json',
      'aria-label':'Plan PC à importer'});
    const resultat=h('p',{class:'v40-import-resultat',role:'status','aria-live':'polite'});
    const btn=h('button',{type:'button',class:'btn v40-import-action',onclick:async()=>{
      btn.disabled=true;
      resultat.textContent='Contrôle du plan PC en cours…';
      try{
        const p=await importerPlanPC(file.files&&file.files[0]);
        if(p){
          resultat.textContent='Plan du PC importé : '+p.actions.length+
            ' action(s). Source : fichier PC, pas une synchronisation EBP en direct.';
          toast('Plan PC enregistré.');
        } else {
          resultat.textContent='Import annulé : le plan actuel est conservé.';
        }
      }catch(e){resultat.textContent='Import refusé : '+limite(e.message,200);toast('Import PC impossible : '+e.message,true)}
      finally{btn.disabled=false}
    }},'Importer le plan PC');
    return [h('p',{class:'mut'},'Importe uniquement le plan JSON v2 produit sur ton ordinateur après analyse des exports EBP. Les anciennes actions sont conservées selon les règles de suivi existantes.'),
      h('label',{},'Sélectionner le fichier du PC'),file,btn,resultat,
      h('a',{class:'v40-secondaire',href:'#/pc'},'Voir le dernier plan reçu ›')];
  }

  function importPDF(){
    const fournisseur=h('input',{type:'text',maxlength:90,
      placeholder:'Carsystem, SIFA, autre…','aria-label':'Nom du fournisseur PDF'});
    const file=h('input',{type:'file',multiple:true,accept:'.pdf,application/pdf',
      'aria-label':'PDF fournisseurs à importer'});
    const res=h('p',{class:'v40-import-resultat',role:'status','aria-live':'polite'});
    const btn=h('button',{type:'button',class:'btn v40-import-action',onclick:async()=>{
      const files=Array.from(file.files||[]);
      if(!files.length){res.textContent='Sélectionne un ou plusieurs PDF.';return;}
      btn.disabled=true;
      let ok=0;const erreurs=[];
      try{
        const pdf=window.__cataloguesPDFV32;
        if(!pdf?.sauvegarderPDF)throw new Error('Bibliothèque PDF indisponible.');
        for(const item of files){
          try{
            const r=await pdf.sauvegarderPDF(item,fournisseur.value);
            if(!r.annule)ok++;
          }catch(e){erreurs.push(limite(item.name,60)+' : '+limite(e.message,110))}
        }
        res.textContent=ok+' catalogue(s) PDF enregistré(s) sur ce téléphone.'+
          (erreurs.length?' Erreurs : '+erreurs.join(' · '):'');
        if(ok){toast(ok+' catalogue(s) enregistré(s).');file.value='';}
      }catch(e){res.textContent='Import impossible : '+limite(e.message,200)}
      finally{btn.disabled=false}
    }},'Ajouter les PDF fournisseurs');
    return [h('p',{class:'mut'},'Fichiers techniques des fournisseurs : séparés des tarifs EBP. 60 Mo maximum par PDF, 25 documents sur ce téléphone.'),
      h('label',{},'Fournisseur'),fournisseur,
      h('label',{},'Sélectionner un ou plusieurs PDF'),file,btn,res,
      h('small',{class:'mut'},'Attention : les PDF sont stockés localement et ne sont pas inclus dans la sauvegarde JSON habituelle.'),
      h('a',{class:'v40-secondaire',href:'#/catalogues-pdf'},'Consulter mes catalogues ›')];
  }

  function construireHub(){
    return h('section',{class:'v40-import-hub'},
      h('div',{class:'v40-import-head'},
        h('span',{class:'v40-import-eyebrow'},'GESTION DES DONNÉES'),
        h('strong',{},'Imports & synchronisation'),
        h('p',{},'Tous les imports au même endroit. Les pages commerciales restent dédiées à la vente.')),
      fiche('Articles et tarifs EBP','Excel / CSV — prix à vérifier',
        importEBP('articles','articles EBP'),'v40-import-articles'),
      fiche('Liste clients','Excel / CSV — portefeuille garages',
        importEBP('clients','clients'),'v40-import-clients'),
      fiche('Plan commercial du PC','JSON — actions issues des analyses EBP',
        importPC(),'v40-import-pc'),
      fiche('Catalogues fournisseurs','PDF — notices et références techniques',
        importPDF(),'v40-import-pdf'),
      h('p',{class:'v40-import-rappel'},
        'Les imports ne mettent pas directement à jour EBP. Les factures, paiements et commandes doivent être vérifiés dans les outils de l’entreprise.'));
  }

  const anciensReglages=pageReglages;
  pageReglages=async function(){
    await anciensReglages();
    if(location.hash!=='#/reglages')return;
    importZoneActive=null;
    app.prepend(construireHub());
    const t=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(t)t.textContent='ODICOLOR Solution · v41';
  };

  window.__importsV40={importEBP,importPDF,importPC,construireHub};
})();