'use strict';
/* ODICOLOR v24 — rappels produits déclarés, sans prédiction inventée. */
(function(){
  const ancienAccueil=pageAccueil;
  pageAccueil=async function(){
    await ancienAccueil();
    if(location.hash && location.hash!=='#/')return;
    const clients=await getAll('clients');
    const ajour=jourLocal(new Date());
    const rappels=clients.flatMap(c=>(Array.isArray(c.besoinsProduits)?c.besoinsProduits:[])
      .filter(b=>b&&b.statut==='ouvert'&&b.suite!=='aucun'
        &&/^\d{4}-\d{2}-\d{2}$/.test(b.suiviLe||'')&&b.suiviLe<=ajour)
      .map(b=>({c,b}))).sort((x,y)=>x.b.suiviLe.localeCompare(y.b.suiviLe));
    if(!rappels.length)return;
    const raccourcis=rappels.slice(0,3).map(({c,b})=>h('a',{href:'#/besoin/'+c.id},
      h('span',{},h('strong',{},c.nom),h('small',{},b.famille+' · '+String(b.detail||'').slice(0,100))),
      h('span',{class:'v24-due'},b.suiviLe===ajour?'Aujourd’hui':'En retard')));
    const card=h('section',{class:'carte v24-urgent'},h('strong',{},rappels.length+' suivi(s) produit à faire'),
      h('p',{class:'mut'},'Demandes et pistes réellement notées, non déduites des stocks clients.'),
      ...raccourcis);
    const next=app.querySelector('.v23-prochaine');
    if(next)next.after(card);else app.prepend(card);
  };
})();
