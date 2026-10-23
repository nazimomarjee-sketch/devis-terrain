'use strict';
/* ODICOLOR v30 : parcours d'accueil d'un garage, avec ou sans fiche.
 * Les garages nouveaux sont des PROSPECTS, sans commande ni CA inventés.
 * Réutilise IndexedDB 'clients', sans créer de nouvelle base.
 * Aucune géolocalisation ni identification automatique par proximité. */
(function(){
  const nomNet=(v,n=120)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
  const cle=v=>normNom(v);
  const chiffres=v=>{
    let n=String(v||'').replace(/\D/g,'');
    if(n.startsWith('0033')&&n.length===13)n='0'+n.slice(4);
    else if(n.startsWith('33')&&n.length===11)n='0'+n.slice(2);
    return n;
  };
  const btn=(href,title,cls='sec')=>h('a',{href,class:'btn '+cls},title);

  function doublons(cl,nom,tel,ville){
    const key=cle(nom),villeKey=cle(ville),phone=chiffres(tel);
    if(!key)return [];
    return cl.filter(c=>{
      const sameTel=phone.length>=8 && chiffres(c.tel)===phone;
      const sameName=cle(c.nom)===key;
      // Une même enseigne peut avoir des sites dans deux villes distinctes.
      const villeC=cle(c.villeProspection||'');
      const sameSite=!villeKey||!villeC||villeKey===villeC;
      return sameTel || (sameName && sameSite);
    });
  }
  const afficheGarage=c=>c.nom+(c.villeProspection?' · '+c.villeProspection:'');

  async function creerProspect(valeurs){
    const nom=nomNet(valeurs.nom,120),tel=nomNet(valeurs.tel,30),ville=nomNet(valeurs.ville,70);
    if(nom.length<2)throw new Error('Indique le nom du garage (au moins 2 caractères).');
    const existants=await getAll('clients');
    const conflicts=doublons(existants,nom,tel,ville);
    if(conflicts.length)return {doublon:conflicts};
    const nouveau={
      nom,tel,villeProspection:ville,statutCrm:'prospect',
      creeLe:new Date().toISOString(),origineCreation:'visite-terrain'
    };
    const id=await rq(st('clients','readwrite').add(nouveau));
    return {id,nom,cree:true};
  }

  async function pageNouveauGarage(mode='fiche'){
    const anciens=await getAll('clients');
    const champNom=h('input',{type:'text',maxlength:120,placeholder:'Nom du garage / carrosserie',
      autocomplete:'organization','aria-label':'Nom du garage'});
    const champTel=h('input',{type:'tel',maxlength:30,placeholder:'Téléphone (facultatif)',
      autocomplete:'tel','aria-label':'Téléphone du garage'});
    const champVille=h('input',{type:'text',maxlength:70,placeholder:'Ville (facultatif)',
      autocomplete:'address-level2','aria-label':'Ville du garage'});
    const resultats=h('div',{class:'v30-matches','aria-live':'polite'});
    const avertissement=h('p',{class:'v30-warning',role:'status'});
    const valider=h('button',{class:'btn gros v30-save',type:'button'},'Créer et vérifier le prospect');
    const infos=h('small',{class:'mut'},'Ce garage sera un prospect tant que son statut n’est pas confirmé. Aucun devis ni vente n’est créé automatiquement.');

    function afficheResultats(){
      const nom=nomNet(champNom.value);
      const tel=nomNet(champTel.value);
      const ville=nomNet(champVille.value);
      const conflits=doublons(anciens,nom,tel,ville);
      const possibles=nom.length>=3?anciens.filter(c=>cle(c.nom).includes(cle(nom))).slice(0,5):[];
      const ids=new Set([...conflits,...possibles].map(c=>c.id));
      const pertinents=anciens.filter(c=>ids.has(c.id)).slice(0,6);
      resultats.replaceChildren();
      if(pertinents.length){
        resultats.append(h('strong',{},conflits.length?'Une fiche existe peut-être déjà':'Garages proches du nom saisi'));
        pertinents.forEach(c=>resultats.append(
          h('a',{class:'v30-result',href:'#/client/'+c.id},
            h('span',{},h('strong',{},afficheGarage(c)),
              h('small',{class:'mut'},c.tel||'Téléphone non renseigné')),
            h('span',{},'Ouvrir ›'))));
      }
      avertissement.textContent=conflits.length?'Vérifie la fiche existante avant de créer un doublon.':'';
      valider.disabled=conflits.length>0;
      return conflits;
    }
    [champNom,champTel,champVille].forEach(el=>el.addEventListener('input',afficheResultats));
    let enCours=false;
    valider.addEventListener('click',async()=>{
      if(enCours)return;
      const n=nomNet(champNom.value),tel=nomNet(champTel.value),ville=nomNet(champVille.value);
      if(n.length<2){avertissement.textContent='Entre le nom du garage.';champNom.focus();return;}
      enCours=true;valider.disabled=true;
      try{
        const r=await creerProspect({nom:n,tel,ville});
        if(r.doublon){avertissement.textContent='Ce garage est déjà présent : ouvre sa fiche ci-dessus.';
          anciens.splice(0,anciens.length,...await getAll('clients'));
          afficheResultats();
          return;
        }
        toast('Prospect créé, sans commande ni chiffre d’affaires.');
        if(mode==='note') location.hash='#/note-terrain/'+r.id;
        else if(mode==='devis') await creerDevis({id:r.id,nom:r.nom});
        else location.hash='#/dossier-prospect/'+r.id;
      }catch(e){avertissement.textContent=e.message||String(e);toast('Impossible de créer la fiche.',true)}
      finally{enCours=false;afficheResultats();}
    });

    montrer('Nouveau garage',
      h('section',{class:'carte v30-intro'},
        h('small',{class:'etiq'},'PREMIER CONTACT'),
        h('strong',{},'Créer un prospect en quelques secondes'),
        h('p',{class:'mut'},'Nom obligatoire. Le reste peut être complété dans la fiche après la visite.')),
      h('section',{class:'carte v30-form'},
        h('label',{},'Nom du garage *'),champNom,
        h('label',{},'Téléphone'),champTel,
        h('label',{},'Ville'),champVille,
        resultats,avertissement,valider,infos),
      h('div',{class:'v30-bottom'},btn('#/clients','Revenir aux clients')));
    afficheResultats();
  }

  async function clientPourAction(){
    const moteur=window.__commercialAccueilV23&&window.__commercialAccueilV23.candidats;
    if(typeof moteur!=='function')return null;
    const [devis,clients,pc,tournees]=await Promise.all([
      getAll('devis'),getAll('clients'),lirePC(),lireTournees()
    ]);
    const action=moteur(devis,clients,pc,tournees)[0];
    if(!action||typeof action.url!=='string')return null;
    const p=action.url.match(/^#\/(client|devis)\/(\d+)$/);
    if(!p){
      // Plan PC : ne pré-sélectionner que si la source EBP est récente,
      // et qu'un nom de client explicite correspond à UNE seule fiche.
      const age=pc&&pc.arrete?ecartJours(pc.arrete,Date.now()):Infinity;
      if(action.url!=='#/pc'||!pc||pc.chiffre?.source!=='import'||
         age<0||age>7||!Array.isArray(pc.actions))return null;
      const auj=jourLocal(Date.now());
      const actif=pc.actions.filter(a=>a.prio===1&&a.statut!=='fait'&&a.statut!=='bloque'
        &&(!a.jourPrevu||a.jourPrevu<=auj)&&a.preuve&&a.source)[0];
      const nom=actif&&actif.client;
      if(!nom)return null;
      const correspondances=clients.filter(c=>cle(c.nom)===cle(nom));
      return correspondances.length===1?correspondances[0]:null;
    }
    let id;
    if(p[1]==='client')id=Number(p[2]);
    else{
      const d=devis.find(d=>d.id===Number(p[2]));
      id=d&&d.clientId;
    }
    return clients.find(c=>c.id===id)||null;
  }

  const avantRoute=route;
  route=async function(){
    const path=(location.hash||'#/').slice(2).split('/')[0];
    if(path==='nouveau-garage'){
      document.querySelectorAll('.onglets a')
        .forEach(a=>a.classList.toggle('on',a.dataset.p==='clients'));
      const mode=(location.hash||'#/').split('/')[2];
      return pageNouveauGarage(['note','devis'].includes(mode)?mode:'fiche');
    }
    const result=await avantRoute();
    // Dans le formulaire Note terrain sans client, ouvrir directement la création.
    if(path==='note-terrain' && !(location.hash||'').match(/^#\/note-terrain\/\d/)){
      const select=app.querySelector('select[aria-label="Garage concerné"]');
      if(select && !app.querySelector('.v30-add-from-note'))
        select.after(btn('#/nouveau-garage/note','+ Nouveau garage','v30-add-from-note'));
    }
    return result;
  };

  const avantAccueil=pageAccueil;
  pageAccueil=async function(){
    await avantAccueil();
    if((location.hash||'#/')!=='#/')return;
    const bloc=app.querySelector('.v23-prochaine');
    if(!bloc)return;
    const zone=bloc.querySelector('.v29-home-note');
    let c=null;
    try{c=await clientPourAction()}catch(e){/* Ne pas empêcher l'accueil en cas de données incomplètes. */}
    if((location.hash||'#/')!=='#/')return;
    if(zone && c){
      zone.href='#/note-terrain/'+c.id;
      zone.querySelector('small').textContent='Pour '+nomNet(c.nom,65);
    }
    const btnNouveau=h('a',{class:'v30-new-link',href:'#/nouveau-garage'},
      h('span',{},'+ Nouveau garage'),h('small',{},'Créer une fiche prospect'));
    if(zone)zone.after(btnNouveau);
    else bloc.append(btnNouveau);
  };

  const avantClients=pageClients;
  pageClients=async function(){
    await avantClients();
    if(location.hash!=='#/clients')return;
    const btnNouveau=h('a',{class:'v30-client-new',href:'#/nouveau-garage'},
      '+ Nouveau garage / prospect');
    app.prepend(btnNouveau);
  };

  const avantChoixClient=pageChoixClient;
  pageChoixClient=async function(){
    await avantChoixClient();
    if(location.hash!=='#/nouveau')return;
    // Remplacer la création implicite d'un client+devis par une création
    // contrôlée de prospect avec vérification des doublons.
    const h2=[...app.querySelectorAll('h2')].find(e=>e.textContent.trim()==='Nouveau client');
    if(!h2)return;
    if(h2.nextElementSibling&&h2.nextElementSibling.classList.contains('carte'))
      h2.nextElementSibling.remove();
    h2.replaceWith(h('a',{class:'v30-client-new',href:'#/nouveau-garage/devis'},
      '+ Nouveau garage (puis devis)'));
  };

  const avantClient=pageClient;
  pageClient=async function(id){
    await avantClient(id);
    if(location.hash!=='#/client/'+id)return;
    const c=await get('clients',id);
    if(!c || c.statutCrm!=='prospect')return;
    const bande=h('div',{class:'v30-prospect'},
      h('span',{class:'tag warn'},'PROSPECT'),
      h('small',{class:'mut'},(c.villeProspection?c.villeProspection+' · ':'')+
        'Premier contact enregistré. Aucune commande vérifiée par EBP.'));
    const trio=app.querySelector('.trio');
    if(trio)trio.before(bande);
  };

  const avantPlus=pagePlus;
  pagePlus=function(){
    avantPlus();
    app.prepend(h('a',{class:'v30-plus-new',href:'#/nouveau-garage'},
      '+ Nouveau prospect'));
  };

  const avantReglages=pageReglages;
  pageReglages=async function(){
    await avantReglages();
    const titre=app.querySelector('.v25-etat .v25-etat-titre strong');
    if(titre)titre.textContent='ODICOLOR Solution · v30';
  };

  window.__nouveauGarageV30={doublons,creerProspect,clientPourAction};
})();
