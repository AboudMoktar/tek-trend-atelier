// ============================================================
// SUIVI DE COMMANDE — TEK-TREND ⇄ GADH TUNISIA (v4 : tableau façon Excel)
// ============================================================
// Modèle du rapport journalier de la confection : pour chaque commande
// (clé = référence/LOT), par modèle et par taille, on saisit chaque jour la
// quantité faite à une étape ; l'écran montre les CUMULS comme un tableau Excel.
//   Coupé (= envoyé automatiquement à la GADH) → Retour GADH → Confection
//   → Contrôle (conformes + rebut) → Emballage (= prêt à expédier) → Expédition
// Tout peut se faire en partiel, sur plusieurs dates. Pour corriger, on rouvre
// la même date et la même étape et on change le chiffre.
// Règle : une étape ne dépasse jamais la précédente (sauf la coupe : marge).
// Données partagées TEK-TREND/GADH, interface séparée par société.

const PROD_TAILLES = ['XS','S','M','L','XL','XXL','XXXL'];

// --- Références (15 fixes, désactivables) ---
const PROD_REF_SEED = [
  ['PHARMA-HOMME','Noir'], ['PHARMA-HOMME','Sable'], ['PHARMA-HOMME','Gris'],
  ['PHARMA-FEMME CV','Noir'], ['PHARMA-FEMME CV','Rose'],
  ['PHARMA-FEMME CR','Noir'], ['PHARMA-FEMME CR','Rose'],
  ['SPORT','Homme'], ['SPORT','Femme'],
  ['GILET-NOIR','Homme'], ['GILET-NOIR','Femme'],
  ['LYNE-PRO','Homme'], ['LYNE-PRO','Femme'],
  ['LYNE-FLEX','Homme'], ['LYNE-FLEX','Femme']
];
function prodRefKey(famille, variante){ return famille+'__'+variante; }
function prodRefLabel(famille, variante){ return famille+' / '+variante; }
function getProdReferences(){
  const stored = getJSON('prod_references', null);
  if(stored) return stored;
  const seeded = {};
  PROD_REF_SEED.forEach(([f,v]) => { seeded[prodRefKey(f,v)] = {famille:f, variante:v, actif:true}; });
  setJSON('prod_references', seeded);
  return seeded;
}
function prodRefName(refKey){
  const r = getProdReferences()[refKey];
  return r ? prodRefLabel(r.famille, r.variante) : refKey.replace('__',' / ');
}
function activeProdReferences(){
  return Object.entries(getProdReferences()).filter(([k,r])=>r.actif!==false)
    .sort((a,b)=> (a[1].famille+a[1].variante).localeCompare(b[1].famille+b[1].variante));
}

// --- Commandes : { nom, ref, annee, client, dateCreation, lignes: { refKey: { tailles: {taille: qte} } } } ---
function getProdCommandes(){ return getJSON('prod_commandes', {}); }
function saveProdCommandes(list){ setJSON('prod_commandes', list); }
function activeProdCommandes(){
  return Object.entries(getProdCommandes()).sort((a,b)=> (b[1].dateCreation||'').localeCompare(a[1].dateCreation||''));
}
function prodLigneTotal(ligne){
  return Object.values(ligne.tailles||{}).reduce((s,v)=>s+(parseInt(v)||0), 0);
}
function prodCmdQty(cmd, refKey, taille){
  return parseInt(cmd && cmd.lignes && cmd.lignes[refKey] && cmd.lignes[refKey].tailles && cmd.lignes[refKey].tailles[taille]) || 0;
}
function prodCmdLabel(cmd){ return cmd ? `${cmd.nom} — ${cmd.ref}` : '—'; }

// --- Client (NEOLYS ou ALLOGA) ---
const PROD_CLIENTS = ['NEOLYS', 'ALLOGA'];
// ALLOGA n'autorise que ces 2 références ; NEOLYS n'a aucune restriction.
const PROD_ALLOGA_REFS = [prodRefKey('PHARMA-HOMME','Noir'), prodRefKey('PHARMA-FEMME CV','Noir')];
function prodRefsAllowedFor(client){
  const all = activeProdReferences();
  if(client==='ALLOGA') return all.filter(([k]) => PROD_ALLOGA_REFS.includes(k));
  return all;
}
// La référence/LOT d'une commande doit être unique (ignoreId = commande en cours de modification).
function prodRefIsUnique(ref, ignoreId){
  return !Object.entries(getProdCommandes()).some(([id,c]) => id!==ignoreId && (c.ref||'').trim().toLowerCase()===ref.trim().toLowerCase());
}


// --- Étapes (colonnes du tableau) ---
// 'rebut' n'est pas une étape à part : il se saisit avec le contrôle (non conformes).
const PROD_ETAPES = ['coupe','retour','confection','controle','emballage','expedition','livraison'];
const PROD_ETAPE_INFO = {
  coupe:      {label:'Coupe',        long:'Coupe (envoyé à la GADH)', col:'Coupé',  site:'tek',  amont:null},
  retour:     {label:'Retour GADH',  long:'Retour GADH → TEK-TREND',  col:'Retour', site:'gadh', amont:'coupe'},
  confection: {label:'Confection',   long:'Confection',               col:'Conf.',  site:'tek',  amont:'retour'},
  controle:   {label:'Contrôle',     long:'Contrôle (conformes)',     col:'Ctrl',   site:'tek',  amont:'confection'},
  emballage:  {label:'Emballage',    long:'Emballage',                col:'Emb.',   site:'tek',  amont:'controle'},
  expedition: {label:'Expédition',   long:'Expédition',               col:'Exp.',   site:'tek',  amont:'emballage'},
  livraison:  {label:'Livraison',    long:'Livraison au client',      col:'Liv.',   site:'tek',  amont:'expedition'}
};
// Rebut (pièces non conformes) possible à CHAQUE étape. Clé de saisie par étape ;
// le contrôle garde la clé historique 'rebut' pour ne rien perdre des saisies existantes.
const PROD_REBUT_KEY = {coupe:'rebut_coupe', retour:'rebut_retour', confection:'rebut_confection', controle:'rebut',
  emballage:'rebut_emballage', expedition:'rebut_expedition', livraison:'rebut_livraison'};
function prodRebutKey(etape){ return PROD_REBUT_KEY[etape]; }
function prodEtapesSite(site){ return PROD_ETAPES.filter(e => PROD_ETAPE_INFO[e].site===site); }

// --- Saisies journalières : prod_saisies_<cmdId> = { 'AAAA-MM-JJ': { etape|rebutKey: { refKey: { taille: qte } } } } ---
function getProdSaisies(cmdId){ return getJSON('prod_saisies_'+cmdId, {}) || {}; }
function saveProdSaisies(cmdId, s){ setJSON('prod_saisies_'+cmdId, s); }

// --- Cumuls à date, par référence/taille ---
function prodEmptyCell(){
  const c = {};
  PROD_ETAPES.forEach(e => { c[e] = 0; c[PROD_REBUT_KEY[e]] = 0; });
  return c;
}
function prodCumulsFrom(cmd, saisies){
  const res = {};
  const cell = (rk,t) => { if(!res[rk]) res[rk] = {}; if(!res[rk][t]) res[rk][t] = prodEmptyCell(); return res[rk][t]; };
  if(cmd) Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => cell(rk,t)));
  Object.values(saisies||{}).forEach(jour => Object.entries(jour||{}).forEach(([etape, refs]) => {
    Object.entries(refs||{}).forEach(([rk, ts]) => Object.entries(ts||{}).forEach(([t,q]) => {
      const c = cell(rk,t);
      if(c[etape] !== undefined) c[etape] += parseInt(q)||0;
    }));
  }));
  return res;
}
function prodCumuls(cmdId){ return prodCumulsFrom(getProdCommandes()[cmdId], getProdSaisies(cmdId)); }
function prodCell(cum, rk, t){ return (cum[rk] && cum[rk][t]) || prodEmptyCell(); }
function prodRebutEtape(etape, c){ return c[PROD_REBUT_KEY[etape]] || 0; }
function prodRebutTotal(c){ return PROD_ETAPES.reduce((s,e) => s + prodRebutEtape(e, c), 0); }

// Ce qui est sorti d'une étape : pièces passées + pièces mises au rebut à cette étape
function prodSortieEtape(etape, c){ return c[etape] + prodRebutEtape(etape, c); }
// Ce qui attend encore à l'étape (null = pas de plafond : la coupe)
function prodDisponible(etape, c){
  const amont = PROD_ETAPE_INFO[etape].amont;
  if(!amont) return null;
  return c[amont] - prodSortieEtape(etape, c);
}
// Où sont les pièces
function prodRestes(c, q){
  const att = (e) => Math.max(0, prodDisponible(e, c));
  return {
    resteACouper:  Math.max(0, q - c.coupe),
    aLaGadh:       att('retour'),
    enConfection:  att('confection'),
    auControle:    att('controle'),
    aEmballer:     att('emballage'),
    pretAExpedier: att('expedition'),
    enLivraison:   att('livraison'),
    expedie:       c.expedition,
    livre:         c.livraison,
    resteALivrer:  Math.max(0, q - c.livraison),
    rebut:         prodRebutTotal(c)
  };
}
// Incohérences : une étape qui dépasse la précédente
function prodViolations(cum){
  const v = [];
  Object.entries(cum).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,c]) => {
    PROD_ETAPES.forEach(e => {
      const amont = PROD_ETAPE_INFO[e].amont;
      if(!amont) return;
      const sortie = prodSortieEtape(e, c), rb = prodRebutEtape(e, c);
      if(sortie > c[amont]) v.push({rk, t, code:e, msg:`${PROD_ETAPE_INFO[e].label.toLowerCase()} ${c[e]}${rb?' + rebut '+rb:''} > ${PROD_ETAPE_INFO[amont].col.toLowerCase().replace('.','')} ${c[amont]}`});
    });
  }));
  return v;
}
function prodViolationKey(v){ return v.rk+'|'+v.t+'|'+v.code; }

// --- Statut automatique : l'étape la plus avancée atteinte ---
const PROD_STATUTS = {
  TRAITEMENT:    {label:'En traitement',          color:'#9CA3AF'},
  COUPE:         {label:'En coupe',               color:'#F59E0B'},
  GADH:          {label:'À la GADH',              color:'#8E2A5B'},
  RETOUR:        {label:'Retour à TEK-TREND',     color:'#7C3AED'},
  CONFECTION:    {label:'En cours de confection', color:'#2563EB'},
  CONTROLE:      {label:'Contrôle',               color:'#0891B2'},
  EMBALLAGE:     {label:'Emballage',              color:'#0D9488'},
  PRET:          {label:'Prêt à expédier',        color:'#059669'},
  PARTIEL:       {label:'Expédié en partie',      color:'#65A30D'},
  EXPEDIE:       {label:'Expédié',                color:'#15803D'},
  LIVRE_PARTIEL: {label:'Livré en partie',        color:'#0F766E'},
  LIVRE:         {label:'Livré',                  color:'#1E3A8A'}
};
// items = [{c, q}] : une taille, un modèle ou toute une commande.
// Les fins d'étape (tout coupé, emballé, expédié, livré) se vérifient taille par taille,
// plafonnées à la commande : un surplus sur une taille ne cache pas un manque ailleurs.
function prodStatut(items){
  let total=0, capCoupe=0, capEmb=0, capExp=0, capLiv=0;
  const any = {}; PROD_ETAPES.forEach(e => { any[e] = 0; });
  items.forEach(({c,q}) => {
    total += q;
    capCoupe += Math.min(c.coupe, q); capEmb += Math.min(c.emballage, q);
    capExp += Math.min(c.expedition, q); capLiv += Math.min(c.livraison, q);
    PROD_ETAPES.forEach(e => { any[e] += prodSortieEtape(e, c); });
  });
  if(total>0 && capLiv>=total) return 'LIVRE';
  if(any.livraison>0) return 'LIVRE_PARTIEL';
  if(total>0 && capExp>=total) return 'EXPEDIE';
  if(any.expedition>0) return 'PARTIEL';
  if(total>0 && capEmb>=total) return 'PRET';
  if(any.emballage>0) return 'EMBALLAGE';
  if(any.controle>0) return 'CONTROLE';
  if(any.confection>0) return 'CONFECTION';
  if(any.retour>0) return 'RETOUR';
  if(any.coupe>0) return (total>0 && capCoupe>=total) ? 'GADH' : 'COUPE';
  return 'TRAITEMENT';
}
function prodItems(cmd, cum, refFilter){
  const items = [];
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => {
    if(refFilter && rk!==refFilter) return;
    Object.entries(l.tailles||{}).forEach(([t,q]) => items.push({rk, t, q: parseInt(q)||0, c: prodCell(cum, rk, t)}));
  });
  return items;
}
function prodSynthese(cmdId, refFilter, cumOpt){
  const cmd = getProdCommandes()[cmdId];
  if(!cmd) return null;
  const cum = cumOpt || prodCumuls(cmdId);
  const items = prodItems(cmd, cum, refFilter);
  const restes = {resteACouper:0, aLaGadh:0, enConfection:0, auControle:0, aEmballer:0, pretAExpedier:0, enLivraison:0, expedie:0, livre:0, resteALivrer:0, rebut:0};
  let total=0, capExp=0, capEmb=0, capLiv=0;
  items.forEach(({c,q}) => {
    total += q; capExp += Math.min(c.expedition, q); capEmb += Math.min(c.emballage, q); capLiv += Math.min(c.livraison, q);
    const r = prodRestes(c, q);
    Object.keys(restes).forEach(k => { restes[k] += r[k]; });
  });
  return {
    total, restes, statut: prodStatut(items),
    pctPret: total ? Math.min(100, Math.round(capEmb/total*100)) : 0,
    pctExp: total ? Math.min(100, Math.round(capExp/total*100)) : 0,
    pctLiv: total ? Math.min(100, Math.round(capLiv/total*100)) : 0
  };
}
function prodStatutBadge(statut, small){
  const s = PROD_STATUTS[statut] || PROD_STATUTS.TRAITEMENT;
  return `<span style="font-size:${small?'9.5':'10.5'}px;font-weight:800;color:#fff;background:${s.color};padding:3px 8px;border-radius:10px;white-space:nowrap;">${s.label}</span>`;
}

// --- Reprise des saisies des versions précédentes (une seule fois par commande) ---
// Sources : bons (v3) ou tableaux cumulés (v2). Tout est rangé à la date d'origine.
// Ces versions n'avaient pas d'étape Confection : on la déduit du contrôle (une pièce
// contrôlée a forcément été confectionnée), sans jamais la mettre au-delà du retour.
function prodMigrerAnciennesSaisies(){
  // Attendre le premier chargement Firebase : sinon on travaillerait sur une copie locale périmée.
  if(typeof firebaseReady!=='undefined' && firebaseReady && typeof fbFirstLoad!=='undefined' && fbFirstLoad) return;
  const cmds = getProdCommandes();
  if(Object.keys(cmds).length===0) return;
  const faits = getJSON('prod_v4_migre', {});
  const bons = getJSON('prod_bons', {});
  const v2 = {
    coupe: getJSON('prod_stage_coupe', {}), retour: getJSON('prod_stage_assemble', {}),
    controle: getJSON('prod_stage_controle', {}), emballage: getJSON('prod_stage_emballage', {})
  };
  let changedFlag = false;
  Object.keys(cmds).forEach(cmdId => {
    if(faits[cmdId]) return;
    const s = getProdSaisies(cmdId);
    // Déjà des saisies (reprise faite sur un autre téléphone) : on ne double jamais.
    if(Object.keys(s).length){ faits[cmdId] = true; changedFlag = true; return; }
    const add = (date, etape, rk, t, q) => {
      if(!(q>0)) return;
      if(!s[date]) s[date] = {};
      if(!s[date][etape]) s[date][etape] = {};
      if(!s[date][etape][rk]) s[date][etape][rk] = {};
      s[date][etape][rk][t] = (parseInt(s[date][etape][rk][t])||0) + q;
    };
    let n = 0;
    const bonsCmd = Object.values(bons).filter(b => b && b.commandeId===cmdId && !b.annule);
    if(bonsCmd.length){
      bonsCmd.forEach(b => {
        const date = b.date || cmds[cmdId].dateCreation || getTodayISO();
        Object.entries(b.lignes||{}).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,raw]) => {
          const q = parseInt(raw)||0;
          if(b.etape==='controle'){
            const nc = parseInt(b.nc && b.nc[rk] && b.nc[rk][t])||0;
            add(date, 'controle', rk, t, q - nc); add(date, 'rebut', rk, t, nc);
          } else if(PROD_ETAPE_INFO[b.etape]) add(date, b.etape, rk, t, q);
          n++;
        }));
      });
    } else {
      const date = cmds[cmdId].dateCreation || getTodayISO();
      Object.entries(v2).forEach(([etape, src]) => Object.entries(src||{}).forEach(([k,v]) => {
        const p = k.split('|');
        if(p.length!==3 || p[0]!==cmdId) return;
        if(etape==='controle'){ add(date,'controle',p[1],p[2],parseInt(v&&v.conforme)||0); add(date,'rebut',p[1],p[2],parseInt(v&&v.nonConforme)||0); }
        else add(date, etape, p[1], p[2], parseInt(v&&v.quantite)||0);
        n++;
      }));
    }
    if(n>0){
      // Confection déduite du contrôle, à la date où le contrôle a été saisi
      const cumAvant = prodCumulsFrom(cmds[cmdId], s);
      Object.entries(s).forEach(([date, jour]) => {
        Object.entries(jour.controle||{}).forEach(([rk,ts]) => Object.keys(ts).forEach(t => {
          const c = prodCell(cumAvant, rk, t);
          const besoin = c.controle + c.rebut - c.confection;
          if(besoin>0){ add(date, 'confection', rk, t, Math.min(besoin, Math.max(0, c.retour - c.confection))); c.confection += besoin; }
        }));
      });
      saveProdSaisies(cmdId, s);
    }
    faits[cmdId] = true;
    changedFlag = true;
  });
  if(changedFlag) setJSON('prod_v4_migre', faits);
}

// --- Parcours d'une commande : pour chaque étape, ce qui a été REÇU de l'étape
// précédente, ce qui est FAIT, et ce qui reste À PASSER vers l'étape suivante. ---
const PROD_PARCOURS = [
  {etape:'coupe',      titre:'Coupe',             recuLbl:'Commandé',          faitLbl:'Coupé',        attenteLbl:'À couper',        color:'#F59E0B', recu:(c,q)=>q},
  {etape:'retour',     titre:'GADH (assemblage)', recuLbl:'Envoyé à la GADH',  faitLbl:'Retourné',     attenteLbl:'Chez la GADH',    color:'#8E2A5B', recu:c=>c.coupe},
  {etape:'confection', titre:'Confection',        recuLbl:'Retourné GADH',     faitLbl:'Confectionné', attenteLbl:'À confectionner', color:'#2563EB', recu:c=>c.retour},
  {etape:'controle',   titre:'Contrôle',          recuLbl:'Confectionné',      faitLbl:'Conformes',    attenteLbl:'À contrôler',     color:'#0891B2', recu:c=>c.confection},
  {etape:'emballage',  titre:'Emballage',         recuLbl:'Conformes',         faitLbl:'Emballé',      attenteLbl:'À emballer',      color:'#0D9488', recu:c=>c.controle},
  {etape:'expedition', titre:'Expédition',        recuLbl:'Emballé',           faitLbl:'Expédié',      attenteLbl:'Prêt à expédier', color:'#15803D', recu:c=>c.emballage},
  {etape:'livraison',  titre:'Livraison client',  recuLbl:'Expédié',           faitLbl:'Livré',        attenteLbl:'En livraison',    color:'#1E3A8A', recu:c=>c.expedition}
];
const PROD_ETAT_ETAPE = {
  vide:    {label:'Pas encore',   icone:'○', color:'#9CA3AF'},
  attente: {label:'À démarrer',   icone:'●', color:'#F59E0B'},
  encours: {label:'En cours',     icone:'◐', color:'#2563EB'},
  ajour:   {label:'À jour',       icone:'✓', color:'#0D9488'},
  fini:    {label:'Terminée',     icone:'✓', color:'#15803D'}
};
function prodParcours(cmd, cum, refFilter){
  const items = prodItems(cmd, cum, refFilter);
  let precedenteFinie = true;
  return PROD_PARCOURS.map(p => {
    let recu = 0, fait = 0, attente = 0, rebut = 0;
    const detail = {};
    items.forEach(({rk, t, q, c}) => {
      const r = p.recu(c, q), f = c[p.etape], rb = prodRebutEtape(p.etape, c);
      // Coupe : les pièces rebutées à la coupe sont à recouper, elles ne soldent pas la commande.
      const a = p.etape==='coupe' ? Math.max(0, r - f) : Math.max(0, r - f - rb);
      recu += r; fait += f; attente += a; rebut += rb;
      if(a>0){ if(!detail[rk]) detail[rk] = []; detail[rk].push({t, a}); }
    });
    let etat;
    if(recu===0) etat = 'vide';
    else if(attente===0) etat = precedenteFinie ? 'fini' : 'ajour';
    else if(fait + rebut===0) etat = 'attente';
    else etat = 'encours';
    precedenteFinie = (etat==='fini');
    return {...p, recu, fait, attente, rebut, detail, etat};
  });
}

// ============================================================
// NAVIGATION (commune TEK-TREND / GADH)
// ============================================================
const prodNav = { tek: {view:'dash', cmdId:null}, gadh: {view:'dash', cmdId:null} };
let prodListFilter = 'encours';
let prodSaisie = null; // saisie du jour en cours
let prodFicheMode = 'attente'; // tableau de la fiche : 'attente' (à passer) ou 'cumul'
const prodParcoursOuvert = {};
function canEditProdTek(){ return currentUser && currentUser.role === 'admin'; }
function prodCanEditSite(site){ return site==='gadh' ? (typeof canEditGadh==='function' && canEditGadh()) : canEditProdTek(); }
function prodRerender(site){
  const main = document.getElementById('main');
  if(!main) return;
  if(site==='gadh') renderProdChainGadh(main); else renderProdChainTek(main);
}
window.prodGo = (site, view, cmdId) => {
  prodNav[site].view = view;
  if(cmdId !== undefined) prodNav[site].cmdId = cmdId;
  prodRerender(site);
  window.scrollTo(0,0);
};
window.prodOuvrirSaisie = (site, cmdId, date, etape) => {
  prodInitSaisie(site, cmdId||null, date||getTodayISO(), etape||null);
  prodGo(site, 'saisie');
};
function prodShell(main, site){
  prodMigrerAnciennesSaisies();
  const v = prodNav[site].view;
  const canEdit = prodCanEditSite(site);
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Suivi des commandes</h2></div>
    <div class="card" style="padding:8px;display:flex;gap:6px;">
      <button class="btn ${v==='dash'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 2px;font-size:12px;" onclick="prodGo('${site}','dash')">Tableau de bord</button>
      <button class="btn ${v==='list'||v==='fiche'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 2px;font-size:12px;" onclick="prodGo('${site}','list')">Commandes</button>
      ${canEdit ? `<button class="btn ${v==='saisie'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 2px;font-size:12px;" onclick="prodOuvrirSaisie('${site}', ${v==='fiche'&&prodNav[site].cmdId?`'${prodNav[site].cmdId}'`:'null'})">+ Saisie</button>` : ''}
    </div>
    <div id="prod-body-${site}"></div>
  `;
  const body = document.getElementById('prod-body-'+site);
  if(v==='fiche') renderProdFiche(body, site);
  else if(v==='saisie') renderProdSaisie(body, site);
  else if(v==='list') renderProdListe(body, site);
  else renderProdDashboard(body, site);
}
function renderProdChainTek(main){ prodShell(main, 'tek'); }
function renderProdChainGadh(main){ prodShell(main, 'gadh'); }

// ============================================================
// LISTE DES COMMANDES
// ============================================================
function prodBarre(pct, color, label){
  return `<div style="display:flex;align-items:center;gap:8px;">
    <div style="flex:1;height:6px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${color};"></div></div>
    <span style="font-size:10.5px;font-weight:800;width:98px;text-align:right;">${label} ${pct}%</span></div>`;
}
function prodPositionTexte(r){
  const parts = [];
  if(r.resteACouper) parts.push(`À couper ${r.resteACouper}`);
  if(r.aLaGadh) parts.push(`GADH ${r.aLaGadh}`);
  if(r.enConfection) parts.push(`Confection ${r.enConfection}`);
  if(r.auControle) parts.push(`Contrôle ${r.auControle}`);
  if(r.aEmballer) parts.push(`À emballer ${r.aEmballer}`);
  if(r.pretAExpedier) parts.push(`<b>Prêt ${r.pretAExpedier}</b>`);
  if(r.enLivraison) parts.push(`En livraison ${r.enLivraison}`);
  if(r.rebut) parts.push(`<span style="color:var(--bad);">Rebut ${r.rebut}</span>`);
  return parts.join(' · ');
}
function renderProdListe(container, site){
  const canEdit = site==='tek' && canEditProdTek();
  const all = activeProdCommandes().map(([id,c]) => ({id, c, s: prodSynthese(id)}));
  const nbEnCours = all.filter(x => x.s.statut!=='LIVRE').length;
  const rows = all.filter(x => prodListFilter==='toutes' || (prodListFilter==='encours' ? x.s.statut!=='LIVRE' : x.s.statut==='LIVRE'));
  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:14px;">Commandes</h3></div>
      ${canEdit ? `<div style="display:flex;gap:6px;margin-bottom:8px;">
        <button class="btn btn-primary" style="flex:1;padding:8px 4px;font-size:12px;" onclick="showAddProdCommandeForm()">+ Nouvelle commande</button>
        <button class="btn btn-ghost" style="flex:1;padding:8px 4px;font-size:12px;" onclick="prodChoisirFichierExcel()">📥 Importer Excel</button>
      </div>` : ''}
      ${all.length ? `<button class="btn btn-ghost" style="width:100%;padding:8px 4px;font-size:12px;margin-bottom:8px;" onclick="prodOuvrirExport()">🖨️ Imprimer / Exporter (PDF, Excel)</button>` : ''}
      <div id="prod-cmd-form-zone"></div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        ${[['encours',`En cours (${nbEnCours})`],['livrees',`Livrées (${all.length-nbEnCours})`],['toutes','Toutes']].map(([k,l]) =>
          `<button class="btn ${prodListFilter===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:6px 4px;font-size:11px;" onclick="prodListFilter='${k}'; prodRerender('${site}')">${l}</button>`).join('')}
      </div>
      ${rows.length===0 ? buildEmptyState(all.length===0 ? "Aucune commande" : "Aucune commande dans ce filtre") : rows.map(({id,c,s}) => `
        <div class="session-row" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:5px;" onclick="prodGo('${site}','fiche','${id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="min-width:0;">
              <b style="font-size:13.5px;">${esc(c.ref)}</b> <span style="font-size:12px;color:var(--ink-soft);">${esc(c.nom)}</span>
              <div style="font-size:10.5px;color:var(--ink-faint);">${esc(c.client||'—')} · ${c.annee} · ${Object.keys(c.lignes||{}).length} modèle(s) · ${s.total} pcs</div>
            </div>
            ${prodStatutBadge(s.statut, true)}
          </div>
          ${prodBarre(s.pctPret, '#0D9488', 'Prêt')}
          ${prodBarre(s.pctExp, '#15803D', 'Expédié')}
          ${prodBarre(s.pctLiv, '#1E3A8A', 'Livré')}
          <div style="font-size:10.5px;color:var(--ink-soft);">${prodPositionTexte(s.restes) || (s.statut==='LIVRE' ? 'Commande livrée' : 'Rien de commencé')}</div>
        </div>`).join('')}
    </div>
  `;
  if(canEdit) prodBindCommandeForm();
}

// ============================================================
// FICHE COMMANDE : tableau façon Excel (cumuls par modèle et par taille)
// ============================================================
// Frise verticale : une ligne par étape, avec ce qui reste à passer vers l'étape suivante.
function prodParcoursHTML(cmd, cum, site, cmdId, canEdit, r){
  const etapes = prodParcours(cmd, cum);
  return `<div class="card" style="padding:12px 12px 2px;">
    <h3 style="margin:0 0 2px;font-size:13.5px;">Parcours de la commande</h3>
    <p style="font-size:10.5px;color:var(--ink-faint);margin:0 0 12px;">Pour chaque étape : ce qu'elle a reçu, ce qu'elle a déjà passé, et ce qui reste à passer.</p>
    ${etapes.map((e, i) => {
      const etat = PROD_ETAT_ETAPE[e.etat];
      const actif = e.etat!=='vide';
      const pct = e.recu>0 ? Math.min(100, Math.round((e.fait + (e.etape==='coupe'?0:e.rebut))/e.recu*100)) : 0;
      // Une étape terminée n'a plus rien à saisir (une correction se fait depuis « Saisies par date »).
      const saisissable = canEdit && PROD_ETAPE_INFO[e.etape].site===site && e.etat!=='fini' && (e.attente>0 || e.etape==='coupe');
      const cle = cmdId+'|'+e.etape;
      const ouvert = !!prodParcoursOuvert[cle];
      const dernier = i===etapes.length-1;
      const detail = Object.entries(e.detail).map(([rk,arr]) => `<div><b>${esc(prodRefName(rk))}</b> : ${arr.map(x => `${x.t} <b>${x.a}</b>`).join(' · ')}</div>`).join('');
      return `
      <div style="display:flex;gap:10px;">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div style="width:28px;height:28px;border-radius:50%;background:${actif?e.color:'var(--surface-2)'};color:${actif?'#fff':'var(--ink-faint)'};border:2px solid ${actif?e.color:'var(--border)'};display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;">${e.etat==='fini'?'✓':i+1}</div>
          ${dernier ? '' : `<div style="flex:1;width:2px;min-height:12px;background:${e.etat==='fini'?e.color:'var(--border)'};"></div>`}
        </div>
        <div style="flex:1;min-width:0;padding-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <b style="font-size:13.5px;${actif?'':'color:var(--ink-faint);'}">${e.titre}</b>
            <span style="font-size:10px;font-weight:800;color:${etat.color};white-space:nowrap;">${etat.label}</span>
          </div>
          ${actif ? `
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${e.recuLbl} <b>${e.recu}</b> · ${e.faitLbl} <b>${e.fait}</b>${e.rebut?` · <span style="color:var(--bad);">Rebut <b>${e.rebut}</b></span>`:''}</div>
          <div style="height:6px;background:var(--border-soft);border-radius:4px;overflow:hidden;margin:6px 0;"><div style="width:${pct}%;height:100%;background:${e.color};"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div ${e.attente>0 ? `onclick="prodToggleParcours('${site}','${cle}')" style="cursor:pointer;"` : ''}>
              <div style="font-size:10.5px;color:var(--ink-faint);font-weight:700;">${e.attenteLbl.toUpperCase()}</div>
              <div style="font-size:20px;font-weight:800;line-height:1.1;color:${e.attente>0?e.color:'var(--ink-faint)'};">${e.attente} <span style="font-size:11px;font-weight:600;">pcs</span>${e.attente>0 ? ` <span style="font-size:10.5px;font-weight:600;color:var(--ink-faint);">${ouvert?'▾ masquer':'▸ par taille'}</span>` : ''}</div>
            </div>
            ${saisissable ? `<button class="btn btn-primary" style="padding:8px 14px;font-size:12px;flex-shrink:0;background:${e.color};border-color:${e.color};" onclick="prodOuvrirSaisie('${site}','${cmdId}',null,'${e.etape}')">Saisir</button>` : ''}
          </div>
          ${ouvert && e.attente>0 ? `<div style="font-size:11px;background:var(--surface-2);border-radius:8px;padding:6px 8px;margin-top:6px;line-height:1.7;">${detail}</div>` : ''}
          ${e.etape==='livraison' ? `<div style="font-size:11.5px;margin-top:6px;">Reste à livrer au client : <b style="color:${r.resteALivrer?'var(--bad)':'var(--good)'};">${r.resteALivrer}</b></div>` : ''}
          ` : `<div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">Rien reçu pour l'instant</div>`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
window.prodToggleParcours = (site, cle) => { prodParcoursOuvert[cle] = !prodParcoursOuvert[cle]; prodRerender(site); };

function renderProdFiche(container, site){
  const cmdId = prodNav[site].cmdId;
  const cmd = getProdCommandes()[cmdId];
  if(!cmd){ prodNav[site].view = 'list'; renderProdListe(container, site); return; }
  const saisies = getProdSaisies(cmdId);
  const cum = prodCumulsFrom(cmd, saisies);
  const s = prodSynthese(cmdId, null, cum);
  const viol = prodViolations(cum);
  const canEdit = prodCanEditSite(site);
  const r = s.restes;
  const tuile = (val, lbl, color, fort) => `<div class="kpi-mini" style="min-height:58px;${fort?'border-color:'+color+';border-width:1.5px;':''}"><div class="kpi-mini-val" style="color:${val>0?color:'var(--ink-faint)'};">${val}</div><div class="kpi-mini-lbl">${lbl}</div></div>`;
  const statutsVus = new Set();

  const tables = `
    <div style="display:flex;gap:6px;margin:0 0 8px;">
      <button class="btn ${prodFicheMode==='attente'?'btn-primary':'btn-ghost'}" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodFicheMode='attente'; prodRerender('${site}')">Tableau : à passer</button>
      <button class="btn ${prodFicheMode==='cumul'?'btn-primary':'btn-ghost'}" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodFicheMode='cumul'; prodRerender('${site}')">Tableau : cumuls</button>
    </div>` + Object.entries(cmd.lignes||{}).map(([rk,l]) => {
    const tailles = PROD_TAILLES.filter(t => l.tailles && l.tailles[t]);
    const stModele = prodStatut(tailles.map(t => ({c: prodCell(cum, rk, t), q: prodCmdQty(cmd, rk, t)})));
    let entete, rows, pied;
    const dot = (st) => `<span title="${PROD_STATUTS[st].label}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PROD_STATUTS[st].color};margin-right:3px;"></span>`;
    if(prodFicheMode==='attente'){
      // Ce qui attend entre chaque étape (reçu de l'étape précédente, pas encore passé)
      const cols = [['resteACouper','À couper'],['aLaGadh','GADH'],['enConfection','À conf.'],['auControle','À ctrl'],['aEmballer','À emb.'],['pretAExpedier','Prêt'],['enLivraison','En livr.'],['resteALivrer','Reste liv.']];
      const tot = {};
      entete = `<tr><th style="text-align:left;">Taille</th>${cols.map(([k,lbl])=>`<th>${lbl}</th>`).join('')}</tr>`;
      rows = tailles.map(t => {
        const q = prodCmdQty(cmd, rk, t), c = prodCell(cum, rk, t), rr = prodRestes(c, q), st = prodStatut([{c,q}]);
        statutsVus.add(st);
        cols.forEach(([k]) => { tot[k] = (tot[k]||0) + rr[k]; });
        return `<tr><td style="text-align:left;font-weight:800;white-space:nowrap;">${dot(st)}${t}</td>${cols.map(([k]) => `<td style="${rr[k]?'font-weight:800;'+(k==='resteALivrer'?'color:var(--bad);':''):'color:var(--ink-faint);'}">${rr[k]||'·'}</td>`).join('')}</tr>`;
      }).join('');
      pied = `<tr><td style="text-align:left;">Total</td>${cols.map(([k]) => `<td>${tot[k]||0}</td>`).join('')}</tr>`;
    } else {
      const tot = {q:0, ...prodEmptyCell()};
      const cellule = (val, rb, fort) => `<td style="${fort?'font-weight:800;':''}">${val||''}${rb?`<div style="font-size:9px;color:var(--bad);line-height:1;font-weight:600;">−${rb}</div>`:''}</td>`;
      entete = `<tr><th style="text-align:left;">Taille</th><th>Cmd</th>${PROD_ETAPES.map(e => `<th>${PROD_ETAPE_INFO[e].col}</th>`).join('')}</tr>`;
      rows = tailles.map(t => {
        const q = prodCmdQty(cmd, rk, t), c = prodCell(cum, rk, t);
        Object.keys(tot).forEach(k => { tot[k] += (k==='q' ? q : c[k]); });
        const st = prodStatut([{c,q}]); statutsVus.add(st);
        return `<tr><td style="text-align:left;font-weight:800;white-space:nowrap;">${dot(st)}${t}</td><td style="color:var(--ink-soft);">${q}</td>${PROD_ETAPES.map(e => cellule(c[e], prodRebutEtape(e,c), e==='livraison')).join('')}</tr>`;
      }).join('');
      pied = `<tr><td style="text-align:left;">Total</td><td>${tot.q}</td>${PROD_ETAPES.map(e => cellule(tot[e]||0, prodRebutEtape(e,tot))).join('')}</tr>`;
    }
    return `
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <b style="font-size:13px;">${esc(prodRefName(rk))}</b>${prodStatutBadge(stModele, true)}
        </div>
        <table class="prod-xl"><thead>${entete}</thead><tbody>${rows}</tbody><tfoot>${pied}</tfoot></table>
      </div>`;
  }).join('');

  // Journal : ce qui a été saisi, date par date (touchez une ligne pour corriger)
  const dates = Object.keys(saisies).sort().reverse();
  const journal = dates.map(d => {
    const jour = saisies[d] || {};
    const lignes = PROD_ETAPES.filter(e => jour[e] || jour[prodRebutKey(e)]).map(e => {
      let tot = 0; Object.values(jour[e]||{}).forEach(ts => Object.values(ts).forEach(q => { tot += parseInt(q)||0; }));
      let reb = 0; Object.values(jour[prodRebutKey(e)]||{}).forEach(ts => Object.values(ts).forEach(q => { reb += parseInt(q)||0; }));
      const modifiable = canEdit && PROD_ETAPE_INFO[e].site===site;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;${modifiable?'cursor:pointer;':''}" ${modifiable?`onclick="prodOuvrirSaisie('${site}','${cmdId}','${d}','${e}')"`:''}>
        <span style="font-size:12px;">${PROD_ETAPE_INFO[e].label}</span>
        <span style="font-size:12px;font-weight:800;">${tot} pcs${reb?` <span style="color:var(--bad);font-weight:600;">+ ${reb} rebut</span>`:''}${modifiable?' <span style="color:var(--ink-faint);font-weight:400;">›</span>':''}</span></div>`;
    }).join('');
    return lignes ? `<div style="padding:6px 0;border-bottom:1px solid var(--border-soft);"><div style="font-size:11px;font-weight:800;color:var(--ink-faint);">${d.split('-').reverse().join('/')}</div>${lignes}</div>` : '';
  }).join('');

  container.innerHTML = `
    <style>
      .prod-xl{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11.5px;text-align:center;}
      .prod-xl th{font-size:10px !important;text-transform:none !important;letter-spacing:0 !important;color:var(--ink-faint);font-weight:800;padding:5px 1px !important;border-bottom:1.5px solid var(--border);}
      .prod-xl td{padding:6px 1px !important;border-bottom:1px solid var(--border-soft);}
      .prod-xl th:first-child,.prod-xl td:first-child{width:52px;}
      .prod-xl tfoot td{font-weight:800;border-top:1.5px solid var(--border);border-bottom:none;}
    </style>
    <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;margin-bottom:8px;" onclick="prodGo('${site}','list')">← Commandes</button>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div><b style="font-size:16px;">${esc(cmd.ref)}</b><div style="font-size:11.5px;color:var(--ink-soft);">${esc(cmd.nom)} · ${esc(cmd.client||'—')} · ${cmd.annee}</div></div>
        ${prodStatutBadge(s.statut)}
      </div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:5px;">
        ${prodBarre(s.pctPret, '#0D9488', 'Prêt')}
        ${prodBarre(s.pctExp, '#15803D', 'Expédié')}
        ${prodBarre(s.pctLiv, '#1E3A8A', 'Livré')}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button class="btn btn-ghost" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodExporterPdf(['${cmdId}'])">📄 PDF / Imprimer</button>
        <button class="btn btn-ghost" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodExporterExcel(['${cmdId}'])">📊 Excel</button>
      </div>
      ${canEdit ? `<button class="btn btn-primary" style="width:100%;margin-top:8px;padding:10px;" onclick="prodOuvrirSaisie('${site}','${cmdId}')">+ Saisie du jour</button>` : ''}
      ${site==='tek' && canEdit ? `<div style="display:flex;gap:6px;margin-top:6px;">
        <button class="btn btn-ghost" style="flex:1;padding:7px;font-size:11.5px;" onclick="prodEditFromFiche('${cmdId}')">Modifier la commande</button>
        <button class="btn btn-ghost" style="flex:1;padding:7px;font-size:11.5px;color:var(--bad);border-color:var(--bad);" onclick="prodSupprimerCommande('${cmdId}')">Supprimer la commande</button>
      </div>` : ''}
    </div>

    ${viol.length ? `
    <div class="card" style="border:1.5px solid var(--bad);">
      <b style="font-size:12.5px;color:var(--bad);">⚠️ ${viol.length} incohérence${viol.length>1?'s':''} à corriger</b>
      <p style="font-size:11px;color:var(--ink-soft);margin:4px 0 6px;">Une étape dépasse la précédente (saisies reprises de l'ancienne version). Complétez l'étape manquante dans une saisie du jour.</p>
      ${viol.slice(0,6).map(v => `<div style="font-size:11px;">• ${esc(prodRefName(v.rk))} ${v.t} : ${esc(v.msg)}</div>`).join('')}
      ${viol.length>6 ? `<div style="font-size:11px;color:var(--ink-faint);">… et ${viol.length-6} autre(s)</div>` : ''}
    </div>` : ''}

    ${prodParcoursHTML(cmd, cum, site, cmdId, canEdit, r)}

    ${tables}
    <p style="font-size:10.5px;color:var(--ink-faint);margin:-4px 4px 12px;line-height:1.7;">Pastille = statut de la taille : ${[...statutsVus].map(st => `<span style="white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PROD_STATUTS[st].color};"></span> ${PROD_STATUTS[st].label}</span>`).join(' · ')}.${prodFicheMode==='cumul' ? ' En rouge sous une case : le rebut de cette étape.' : ' Chaque colonne = pièces qui attendent à cette étape.'}</p>

    <div class="card">
      <h3 style="margin:0 0 4px;font-size:13px;">Saisies par date</h3>
      <p style="font-size:10.5px;color:var(--ink-faint);margin:0 0 4px;">${canEdit ? 'Touchez une ligne pour la corriger.' : ''}</p>
      ${journal || buildEmptyState("Aucune saisie", canEdit ? "Commencez par « + Saisie du jour »." : "")}
    </div>

    ${site==='tek' && canEditProdTek() ? `
    <div class="card" style="border:1.5px solid var(--bad);">
      <h3 style="margin:0 0 4px;font-size:13px;color:var(--bad);">Supprimer la commande</h3>
      <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">Supprime définitivement ${esc(cmd.ref)} et toutes ses saisies (${dates.length} date${dates.length>1?'s':''}), pour TEK-TREND comme pour la GADH. Impossible à annuler.</p>
      <button class="btn btn-warning" style="width:100%;padding:9px;" onclick="prodSupprimerCommande('${cmdId}')">Supprimer ${esc(cmd.ref)}</button>
    </div>` : ''}
  `;
}
window.prodSupprimerCommande = (cmdId) => {
  if(!canEditProdTek()) return;
  const list = getProdCommandes();
  const cmd = list[cmdId];
  if(!cmd) return;
  const nbDates = Object.keys(getProdSaisies(cmdId)).length;
  const saisie = prompt(`Suppression définitive de la commande ${cmd.ref} (${cmd.nom}, ${cmd.client||''})${nbDates ? ' et de ses ' + nbDates + ' date(s) de saisie' : ''}.\n\nPour confirmer, tapez la référence : ${cmd.ref}`);
  if(saisie===null) return;
  if(saisie.trim().toLowerCase() !== (cmd.ref||'').trim().toLowerCase()){ showToast('Référence incorrecte : la commande n\'a pas été supprimée'); return; }
  delete list[cmdId];
  saveProdCommandes(list);
  saveProdSaisies(cmdId, {});
  const migre = getJSON('prod_v4_migre', {});
  if(migre[cmdId]){ delete migre[cmdId]; setJSON('prod_v4_migre', migre); }
  ['tek','gadh'].forEach(site => { if(prodNav[site].cmdId===cmdId){ prodNav[site].cmdId = null; prodNav[site].view = 'list'; } });
  if(prodSaisie && prodSaisie.cmdId===cmdId) prodSaisie = null;
  showToast(`Commande ${cmd.ref} supprimée`);
  prodGo('tek', 'list');
};
// Suppression définitive : la commande ET toutes ses saisies. On fait retaper la
// référence pour éviter toute suppression par erreur d'un simple clic.
window.prodSupprimerCommande = (cmdId) => {
  if(!canEditProdTek()) return;
  const cmds = getProdCommandes();
  const cmd = cmds[cmdId];
  if(!cmd) return;
  const saisies = getProdSaisies(cmdId);
  const nbDates = Object.keys(saisies).length;
  let nbPieces = 0;
  Object.values(saisies).forEach(j => Object.values(j||{}).forEach(refs => Object.values(refs||{}).forEach(ts => Object.values(ts||{}).forEach(q => { nbPieces += parseInt(q)||0; }))));
  const detail = nbDates ? `\n\nElle contient ${nbDates} journée(s) de saisie (${nbPieces} pièces enregistrées), qui seront effacées aussi.` : '';
  const tape = prompt(`Supprimer définitivement la commande ${cmd.ref} (${cmd.nom}, ${cmd.client||''}) ?${detail}\n\nCette action est irréversible, pour TEK-TREND comme pour la GADH.\nPour confirmer, tapez la référence : ${cmd.ref}`);
  if(tape===null) return;
  if(tape.trim().toLowerCase() !== String(cmd.ref).trim().toLowerCase()){ showToast('Référence incorrecte — commande non supprimée'); return; }
  delete cmds[cmdId];
  saveProdCommandes(cmds);
  saveProdSaisies(cmdId, {});
  const faits = getJSON('prod_v4_migre', {});
  if(faits[cmdId]){ delete faits[cmdId]; setJSON('prod_v4_migre', faits); }
  ['tek','gadh'].forEach(site => { if(prodNav[site].cmdId===cmdId){ prodNav[site].cmdId = null; if(prodNav[site].view==='fiche') prodNav[site].view = 'list'; } });
  if(prodSaisie && prodSaisie.cmdId===cmdId) prodSaisie = null;
  showToast(`Commande ${cmd.ref} supprimée`);
  prodGo('tek', 'list');
};
window.prodEditFromFiche = (cmdId) => {
  prodGo('tek','list');
  if(typeof window.showEditProdCommandeForm === 'function') window.showEditProdCommandeForm(cmdId);
};

// ============================================================
// SAISIE DU JOUR : date + étape + quantités du jour (par modèle et par taille)
// ============================================================
function prodCommandesSaisissables(){
  return activeProdCommandes().filter(([id]) => prodSynthese(id).statut!=='LIVRE');
}
function prodInitSaisie(site, cmdId, date, etape){
  const etapes = prodEtapesSite(site);
  prodSaisie = {site, cmdId, date: date || getTodayISO(), etape: (etape && etapes.includes(etape)) ? etape : etapes[0], vals:{}, rebut:{}, rebutOuvert:{}};
  if(!prodSaisie.cmdId){
    const dispo = prodCommandesSaisissables();
    if(dispo.length===1) prodSaisie.cmdId = dispo[0][0];
  }
  prodChargerJour();
}
// Charge ce qui est déjà saisi pour cette date et cette étape (pour corriger).
function prodChargerJour(){
  prodSaisie.vals = {}; prodSaisie.rebut = {};
  if(!prodSaisie.cmdId) return;
  const jour = getProdSaisies(prodSaisie.cmdId)[prodSaisie.date] || {};
  const copie = (src) => { const o = {}; Object.entries(src||{}).forEach(([rk,ts]) => { o[rk] = {...ts}; }); return o; };
  prodSaisie.vals = copie(jour[prodSaisie.etape]);
  prodSaisie.rebut = copie(jour[prodRebutKey(prodSaisie.etape)]);
  prodSaisie.rebutOuvert = {};
}
function prodSaisieNouvellesSaisies(){
  const saisies = getProdSaisies(prodSaisie.cmdId);
  const jour = {...(saisies[prodSaisie.date] || {})};
  const nettoie = (src) => {
    const o = {};
    Object.entries(src).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
      const q = parseInt(v); if(q>0){ if(!o[rk]) o[rk] = {}; o[rk][t] = q; }
    }));
    return Object.keys(o).length ? o : null;
  };
  const v = nettoie(prodSaisie.vals);
  if(v) jour[prodSaisie.etape] = v; else delete jour[prodSaisie.etape];
  const kRb = prodRebutKey(prodSaisie.etape), rb = nettoie(prodSaisie.rebut);
  if(rb) jour[kRb] = rb; else delete jour[kRb];
  if(Object.keys(jour).length) saisies[prodSaisie.date] = jour; else delete saisies[prodSaisie.date];
  return saisies;
}
// Vérifie la journée : aucune étape ne doit dépasser la précédente après enregistrement.
// Les incohérences déjà présentes avant (anciennes saisies) ne bloquent pas.
function prodSaisieVerifier(){
  const res = {erreurs:[], cases:new Set(), totalJour:0, rebutJour:0};
  if(!prodSaisie || !prodSaisie.cmdId) return res;
  const cmd = getProdCommandes()[prodSaisie.cmdId];
  const check = (src, label) => Object.entries(src).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
    if(v==='' || v==null) return;
    const q = parseInt(v);
    if(isNaN(q) || q<0){ res.erreurs.push(`${prodRefName(rk)} ${t} : ${label} invalide`); res.cases.add(rk+'|'+t); }
    else if(label==='rebut') res.rebutJour += q; else res.totalJour += q;
  }));
  check(prodSaisie.vals, 'quantité');
  check(prodSaisie.rebut, 'rebut');
  const avant = new Set(prodViolations(prodCumulsFrom(cmd, getProdSaisies(prodSaisie.cmdId))).map(prodViolationKey));
  prodViolations(prodCumulsFrom(cmd, prodSaisieNouvellesSaisies())).filter(v => !avant.has(prodViolationKey(v))).forEach(v => {
    res.erreurs.push(`${prodRefName(v.rk)} ${v.t} : ${v.msg}`);
    res.cases.add(v.rk+'|'+v.t);
  });
  return res;
}
function prodSaisieRafraichir(){
  const chk = prodSaisieVerifier();
  document.querySelectorAll('#prod-saisie-form-zone input.sj').forEach(inp => {
    const bad = chk.cases.has(inp.dataset.rk+'|'+inp.dataset.t);
    inp.style.borderColor = bad ? 'var(--bad)' : 'var(--border)';
    inp.style.background = bad ? '#FEF2F2' : '';
  });
  Object.keys(prodSaisie.vals).concat(Object.keys(prodSaisie.rebut)).forEach(rk => {
    const el = document.getElementById('sj-tot-'+rk.replace(/[^a-zA-Z0-9]/g,'_'));
    if(el){
      const t = Object.values(prodSaisie.vals[rk]||{}).reduce((s,v)=>s+(parseInt(v)||0),0);
      const rb = Object.values(prodSaisie.rebut[rk]||{}).reduce((s,v)=>s+(parseInt(v)||0),0);
      el.textContent = t + ' pcs' + (rb ? ' + ' + rb + ' rebut' : '');
    }
  });
  const tot = document.getElementById('sj-total');
  if(tot) tot.textContent = `${chk.totalJour} pcs ce jour${chk.rebutJour ? ' + '+chk.rebutJour+' rebut' : ''}`;
  const err = document.getElementById('sj-erreurs');
  if(err) err.innerHTML = chk.erreurs.slice(0,4).map(e => `<div>• ${esc(e)}</div>`).join('') + (chk.erreurs.length>4 ? `<div>… et ${chk.erreurs.length-4} autre(s)</div>` : '');
  return chk;
}
window.prodSjSet = (quoi, rk, t, v) => {
  const cible = quoi==='rebut' ? prodSaisie.rebut : prodSaisie.vals;
  if(!cible[rk]) cible[rk] = {};
  cible[rk][t] = v;
  prodSaisieRafraichir();
};
window.prodSjDate = (d) => { prodSaisie.date = d || getTodayISO(); prodChargerJour(); prodRerender(prodSaisie.site); };
window.prodSjEtape = (e) => { prodSaisie.etape = e; prodChargerJour(); prodRerender(prodSaisie.site); };
window.prodSjCommande = (id) => { prodSaisie.cmdId = id || null; prodChargerJour(); prodRerender(prodSaisie.site); };
window.prodSjOuvrirRebut = (rk) => { if(!prodSaisie.rebutOuvert) prodSaisie.rebutOuvert = {}; prodSaisie.rebutOuvert[rk] = true; prodRerender(prodSaisie.site); };
window.prodSjToutDispo = () => {
  const cmd = getProdCommandes()[prodSaisie.cmdId];
  const cum = prodCumulsFrom(cmd, getProdSaisies(prodSaisie.cmdId));
  const jour = getProdSaisies(prodSaisie.cmdId)[prodSaisie.date] || {};
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => {
    const c = prodCell(cum, rk, t);
    const deja = parseInt(jour[prodSaisie.etape] && jour[prodSaisie.etape][rk] && jour[prodSaisie.etape][rk][t])||0;
    const kRb = prodRebutKey(prodSaisie.etape);
    const rbDeja = prodSaisie.etape==='coupe' ? 0 : (parseInt(jour[kRb] && jour[kRb][rk] && jour[kRb][rk][t])||0);
    const dispo = prodSaisie.etape==='coupe' ? Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe) : Math.max(0, prodDisponible(prodSaisie.etape, c));
    const rb = prodSaisie.etape==='coupe' ? 0 : (parseInt(prodSaisie.rebut[rk] && prodSaisie.rebut[rk][t])||0);
    const v = deja + rbDeja + dispo - rb;
    if(!prodSaisie.vals[rk]) prodSaisie.vals[rk] = {};
    prodSaisie.vals[rk][t] = v>0 ? v : '';
  }));
  prodRerender(prodSaisie.site);
};
function prodAttenteEtape(cmd, cmdId, etape){
  const cum = prodCumulsFrom(cmd, getProdSaisies(cmdId));
  let n = 0;
  prodItems(cmd, cum).forEach(({q, c}) => { n += etape==='coupe' ? Math.max(0, q - c.coupe) : Math.max(0, prodDisponible(etape, c)); });
  return n;
}
// Toucher « à passer N » remplit la case avec tout ce qui attend (en tenant compte du rebut saisi)
window.prodSjPasserTout = (rk, t) => {
  const cmd = getProdCommandes()[prodSaisie.cmdId];
  const saisies = getProdSaisies(prodSaisie.cmdId);
  const c = prodCell(prodCumulsFrom(cmd, saisies), rk, t);
  const jour = saisies[prodSaisie.date] || {};
  const deja = parseInt(jour[prodSaisie.etape] && jour[prodSaisie.etape][rk] && jour[prodSaisie.etape][rk][t])||0;
  const kRb = prodRebutKey(prodSaisie.etape);
  const rbDeja = prodSaisie.etape==='coupe' ? 0 : (parseInt(jour[kRb] && jour[kRb][rk] && jour[kRb][rk][t])||0);
  const dispo = prodSaisie.etape==='coupe' ? Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe) : Math.max(0, prodDisponible(prodSaisie.etape, c));
  const rb = prodSaisie.etape==='coupe' ? 0 : (parseInt(prodSaisie.rebut[rk] && prodSaisie.rebut[rk][t])||0);
  const v = Math.max(0, deja + rbDeja + dispo - rb);
  if(!prodSaisie.vals[rk]) prodSaisie.vals[rk] = {};
  prodSaisie.vals[rk][t] = v;
  const inp = document.querySelector(`#prod-saisie-form-zone input.sj[data-quoi="vals"][data-rk="${rk}"][data-t="${t}"]`);
  if(inp) inp.value = v;
  prodSaisieRafraichir();
};
window.prodSjEnregistrer = () => {
  const chk = prodSaisieRafraichir();
  if(chk.erreurs.length){ showToast('Corrigez les cases en rouge : ' + chk.erreurs[0]); return; }
  saveProdSaisies(prodSaisie.cmdId, prodSaisieNouvellesSaisies());
  const cmd = getProdCommandes()[prodSaisie.cmdId];
  showToast(`${cmd.ref} · ${PROD_ETAPE_INFO[prodSaisie.etape].label} du ${prodSaisie.date.split('-').reverse().join('/')} enregistré : ${chk.totalJour} pcs`);
  const site = prodSaisie.site, cmdId = prodSaisie.cmdId;
  prodSaisie = null;
  prodGo(site, 'fiche', cmdId);
};
window.prodSjFermer = () => {
  const site = prodSaisie ? prodSaisie.site : 'tek', cmdId = prodSaisie && prodSaisie.cmdId;
  prodSaisie = null;
  if(cmdId) prodGo(site, 'fiche', cmdId); else prodGo(site, 'list');
};

function renderProdSaisie(container, site){
  if(!prodCanEditSite(site)){ container.innerHTML = `<div class="card">${buildEmptyState("Lecture seule", "Votre rôle ne permet pas de saisir.")}</div>`; return; }
  if(!prodSaisie || prodSaisie.site!==site) prodInitSaisie(site, null, getTodayISO(), null);
  const etapes = prodEtapesSite(site);
  const cmd = prodSaisie.cmdId ? getProdCommandes()[prodSaisie.cmdId] : null;
  const choix = prodCommandesSaisissables();
  const info = PROD_ETAPE_INFO[prodSaisie.etape];
  let grille = '';
  if(cmd){
    const saisies = getProdSaisies(prodSaisie.cmdId);
    const cum = prodCumulsFrom(cmd, saisies);
    const jour = saisies[prodSaisie.date] || {};
    grille = Object.entries(cmd.lignes||{}).map(([rk,l]) => {
      const tailles = PROD_TAILLES.filter(t => l.tailles && l.tailles[t]);
      const ligne = (quoi) => tailles.map(t => {
        const c = prodCell(cum, rk, t);
        const src = quoi==='rebut' ? prodSaisie.rebut : prodSaisie.vals;
        const val = src[rk] && src[rk][t] !== undefined ? src[rk][t] : '';
        // Maximum de la journée = ce qui est déjà saisi ce jour + ce qui reste disponible
        const kRbJ = prodRebutKey(prodSaisie.etape);
        const dejaJour = (parseInt(jour[prodSaisie.etape] && jour[prodSaisie.etape][rk] && jour[prodSaisie.etape][rk][t])||0)
                       + (prodSaisie.etape==='coupe' ? 0 : (parseInt(jour[kRbJ] && jour[kRbJ][rk] && jour[kRbJ][rk][t])||0));
        // Ce qui attend encore à cette étape (hors ce qui est déjà saisi ce jour-là)
        let aPasser, bloque = false;
        if(prodSaisie.etape==='coupe') aPasser = Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe);
        else { aPasser = Math.max(0, prodDisponible(prodSaisie.etape, c)); bloque = (dejaJour + aPasser)<=0; }
        const aide = bloque ? `<span style="color:var(--ink-faint);">—</span>`
          : aPasser>0 ? `<span onclick="prodSjPasserTout('${rk}','${t}')" style="cursor:pointer;color:${PROD_ETAPE_INFO[prodSaisie.etape]===undefined?'':'var(--accent)'};font-weight:800;text-decoration:underline dotted;">${prodSaisie.etape==='coupe'?'reste':'à passer'} ${aPasser}</span>`
          : `<span style="color:var(--good);font-weight:700;">✓ ${prodSaisie.etape==='coupe'?'coupé':'passé'}</span>`;
        return `<div style="text-align:center;flex:1;min-width:0;">
          ${quoi==='vals' ? `<div style="font-size:10px;font-weight:800;color:var(--ink-soft);margin-bottom:2px;">${t}</div>` : ''}
          <input type="number" inputmode="numeric" enterkeyhint="next" min="0" class="sj" data-quoi="${quoi}" data-rk="${rk}" data-t="${t}" value="${val}" ${bloque?'disabled':''}
            onfocus="this.select()" oninput="prodSjSet('${quoi}','${rk}','${t}',this.value)"
            style="width:100%;max-width:52px;padding:7px 2px;text-align:center;font-size:14px;font-weight:700;border:1.5px solid var(--border);border-radius:7px;${bloque?'opacity:.35;':''}${quoi==='rebut'?'color:var(--bad);':''}">
          ${quoi==='vals' ? `<div style="font-size:9.5px;color:var(--ink-faint);margin-top:2px;white-space:nowrap;">${aide}</div>` : ''}
        </div>`;
      }).join('');
      // Rebut : toujours visible au contrôle ; ailleurs sur demande, ou s'il y en a déjà ce jour-là
      const voirRebut = prodSaisie.etape==='controle' || (prodSaisie.rebutOuvert||{})[rk] || Object.values(prodSaisie.rebut[rk]||{}).some(v => parseInt(v)>0);
      const attenteModele = tailles.reduce((sum,t) => { const c = prodCell(cum, rk, t); return sum + (prodSaisie.etape==='coupe' ? Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe) : Math.max(0, prodDisponible(prodSaisie.etape, c))); }, 0);
      return `
        <div class="card" style="padding:10px;${attenteModele===0 && prodSaisie.etape!=='coupe' ? 'opacity:.6;' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <b style="font-size:13px;">${esc(prodRefName(rk))}</b>
            <span id="sj-tot-${rk.replace(/[^a-zA-Z0-9]/g,'_')}" style="font-size:11.5px;font-weight:800;color:var(--ink-soft);"></span>
          </div>
          <div style="font-size:10.5px;color:var(--ink-soft);margin-bottom:6px;">${attenteModele>0 ? `${prodSaisie.etape==='coupe'?'Reste à couper':'À passer'} : <b>${attenteModele} pcs</b>` : (prodSaisie.etape==='coupe' ? 'Tout est coupé' : 'Rien en attente à cette étape')}</div>
          ${voirRebut ? `<div style="font-size:10px;font-weight:800;color:var(--ink-faint);margin-bottom:2px;">${prodSaisie.etape==='controle' ? 'CONFORMES' : 'PIÈCES PASSÉES'}</div>` : ''}
          <div style="display:flex;gap:4px;">${ligne('vals')}</div>
          ${voirRebut
            ? `<div style="font-size:10px;font-weight:800;color:var(--bad);margin:8px 0 2px;">REBUT (non conformes${prodSaisie.etape==='coupe' ? ', à recouper' : ''})</div><div style="display:flex;gap:4px;">${ligne('rebut')}</div>`
            : `<button class="btn btn-ghost" style="margin-top:8px;padding:5px 9px;font-size:11px;color:var(--bad);border-color:var(--border);" onclick="prodSjOuvrirRebut('${rk}')">＋ Déclarer du rebut</button>`}
        </div>`;
    }).join('');
  }
  container.innerHTML = `
    <div id="prod-saisie-form-zone">
      <div class="card" style="padding:10px;">
        ${cmd && prodNav[site].view==='saisie' && choix.length<=1 ? '' : `
        <div class="field" style="margin:0 0 8px;"><label>Commande</label>
          <select onchange="prodSjCommande(this.value)" style="width:100%;">
            <option value="">— Choisir la commande —</option>
            ${choix.map(([id,c]) => `<option value="${id}" ${prodSaisie.cmdId===id?'selected':''}>${esc(c.ref)} — ${esc(c.nom)} (${esc(c.client||'')})</option>`).join('')}
            ${cmd && !choix.some(([id])=>id===prodSaisie.cmdId) ? `<option value="${prodSaisie.cmdId}" selected>${esc(cmd.ref)} — ${esc(cmd.nom)}</option>` : ''}
          </select></div>`}
        ${cmd && choix.length<=1 ? `<div style="font-weight:800;font-size:14px;margin-bottom:8px;">${esc(cmd.ref)} <span style="font-weight:600;font-size:12px;color:var(--ink-soft);">${esc(cmd.nom)} · ${esc(cmd.client||'')}</span></div>` : ''}
        <div class="field" style="margin:0 0 8px;"><label>Date</label><input type="date" value="${prodSaisie.date}" max="${getTodayISO()}" onchange="prodSjDate(this.value)"></div>
        ${etapes.length>1 ? `
        <label style="font-size:11px;font-weight:700;color:var(--ink-faint);">ÉTAPE</label>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:4px;">
          ${etapes.map(e => { const n = cmd ? prodAttenteEtape(cmd, prodSaisie.cmdId, e) : null; return `<button class="btn ${prodSaisie.etape===e?'btn-primary':'btn-ghost'}" style="padding:7px 2px;font-size:11.5px;line-height:1.25;flex-direction:column;gap:1px;" onclick="prodSjEtape('${e}')"><span>${PROD_ETAPE_INFO[e].label}</span>${n===null?'':`<span style="font-size:10.5px;font-weight:800;${prodSaisie.etape===e?'':(n>0?'color:'+PROD_PARCOURS.find(x=>x.etape===e).color+';':'color:var(--ink-faint);')}">${n>0?n+' à passer':'—'}</span>`}</button>`; }).join('')}
        </div>` : `<div style="font-weight:800;color:#8E2A5B;">${info.long}</div>`}
      </div>
      ${!cmd ? (choix.length ? '' : `<div class="card">${buildEmptyState("Aucune commande en cours")}</div>`) : `
      <p style="font-size:11px;color:var(--ink-soft);margin:0 4px 8px;">Quantités faites <b>ce jour-là</b> à l'étape ${info.long}. ${prodSaisie.etape==='coupe' ? 'Sous chaque case : le reste à couper (couper plus que la commande est permis). Touchez-le pour remplir la case.' : 'Sous chaque case : ce qui attend à cette étape. Touchez « à passer » pour remplir la case, ou « Tout passer » pour tout remplir.'}</p>
      ${grille}
      <div class="card" style="padding:10px;position:sticky;bottom:78px;z-index:5;box-shadow:0 -4px 16px rgba(15,23,42,.10);">
        <div id="sj-erreurs" style="font-size:11px;color:var(--bad);margin-bottom:6px;"></div>
        <div style="font-size:13px;font-weight:800;margin-bottom:8px;" id="sj-total"></div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${prodSaisie.etape!=='coupe' ? `<button class="btn btn-ghost" style="flex:1;padding:10px 4px;font-size:12px;" onclick="prodSjToutDispo()">Tout passer</button>` : ''}
          <button class="btn btn-ghost" style="flex:1;padding:10px 4px;font-size:12px;" onclick="prodSjFermer()">Fermer</button>
          <button class="btn btn-primary" style="flex:1.3;padding:10px 4px;font-size:13px;" onclick="prodSjEnregistrer()">Enregistrer</button>
        </div>
      </div>`}
    </div>
  `;
  const zone = document.getElementById('prod-saisie-form-zone');
  zone.addEventListener('keydown', (e) => {
    if(e.key!=='Enter' || e.target.tagName!=='INPUT' || e.target.type!=='number') return;
    e.preventDefault();
    const inputs = [...zone.querySelectorAll('input.sj:not([disabled])')];
    const i = inputs.indexOf(e.target);
    if(i>=0 && i<inputs.length-1) inputs[i+1].focus(); else e.target.blur();
  });
  if(cmd) prodSaisieRafraichir();
}

// ============================================================
// TABLEAU DE BORD DES COMMANDES
// ============================================================
let prodDashClient = 'tous';
const PROD_FLUX = [
  {k:'resteACouper',  label:'À couper',        color:'#F59E0B'},
  {k:'aLaGadh',       label:'À la GADH',       color:'#8E2A5B'},
  {k:'enConfection',  label:'En confection',   color:'#2563EB'},
  {k:'auControle',    label:'Au contrôle',     color:'#0891B2'},
  {k:'aEmballer',     label:'À emballer',      color:'#0D9488'},
  {k:'pretAExpedier', label:'Prêt à expédier', color:'#059669'},
  {k:'enLivraison',   label:'En livraison',    color:'#1E3A8A'}
];
// Ordre des statuts pour la frise d'avancement de chaque commande
const PROD_FRISE = [
  {st:['COUPE'], label:'Coupe'}, {st:['GADH'], label:'GADH'}, {st:['RETOUR'], label:'Retour'},
  {st:['CONFECTION'], label:'Conf.'}, {st:['CONTROLE'], label:'Ctrl'}, {st:['EMBALLAGE'], label:'Emb.'},
  {st:['PRET'], label:'Prêt'}, {st:['PARTIEL','EXPEDIE'], label:'Exp.'}, {st:['LIVRE_PARTIEL','LIVRE'], label:'Livré'}
];
function prodFriseIndex(statut){ return PROD_FRISE.findIndex(f => f.st.includes(statut)); }
function prodJoursEntre(d1, d2){ return Math.round((new Date(d2+'T00:00:00') - new Date(d1+'T00:00:00')) / 86400000); }

function prodDashDonnees(client){
  prodMigrerAnciennesSaisies();
  const today = getTodayISO();
  const d7 = (() => { const d = new Date(today+'T00:00:00'); d.setDate(d.getDate()-6); return toISODateLocal(d); })();
  const lignes = activeProdCommandes()
    .filter(([id,c]) => client==='tous' || c.client===client)
    .map(([id,c]) => {
      const saisies = getProdSaisies(id);
      const cum = prodCumulsFrom(c, saisies);
      return {id, c, saisies, s: prodSynthese(id, null, cum), nbViol: prodViolations(cum).length};
    });
  const enCours = lignes.filter(x => x.s.statut!=='LIVRE');
  const tot = {commande:0, resteACouper:0, aLaGadh:0, enConfection:0, auControle:0, aEmballer:0, pretAExpedier:0, enLivraison:0, expedie:0, livre:0, resteALivrer:0, rebut:0};
  enCours.forEach(x => { tot.commande += x.s.total; Object.keys(x.s.restes).forEach(k => { tot[k] += x.s.restes[k]; }); });
  const parStatut = {};
  lignes.forEach(x => { parStatut[x.s.statut] = (parStatut[x.s.statut]||0) + 1; });
  const activite = {rebut:0}, activiteJour = {};
  PROD_ETAPES.forEach(e => { activite[e] = 0; activiteJour[e] = 0; });
  const recents = [];
  const alertes = [];
  lignes.forEach(x => {
    let dernierRetour = null, premiereCoupe = null;
    Object.entries(x.saisies).forEach(([date, jour]) => Object.entries(jour||{}).forEach(([etape, refs]) => {
      let q = 0;
      Object.values(refs||{}).forEach(ts => Object.values(ts||{}).forEach(v => { q += parseInt(v)||0; }));
      if(!q) return;
      if(etape==='retour' && (!dernierRetour || date>dernierRetour)) dernierRetour = date;
      if(etape==='coupe' && (!premiereCoupe || date<premiereCoupe)) premiereCoupe = date;
      const estRebut = /^rebut/.test(etape);
      if(date>=d7){ if(estRebut) activite.rebut += q; else if(activite[etape]!==undefined) activite[etape] += q; }
      if(date===today && !estRebut && activiteJour[etape]!==undefined) activiteJour[etape] += q;
      if(!estRebut) recents.push({date, id:x.id, ref:x.c.ref, etape, q});
    }));
    if(x.nbViol) alertes.push({niveau:'bad', id:x.id, txt:`${x.c.ref} : ${x.nbViol} incohérence${x.nbViol>1?'s':''} à corriger`});
    const r = x.s.restes;
    const depuis = dernierRetour || premiereCoupe;
    if(r.aLaGadh>0 && depuis){
      const j = prodJoursEntre(depuis, today);
      if(j>=7) alertes.push({niveau:'warn', id:x.id, txt:`${x.c.ref} : ${r.aLaGadh} pcs à la GADH, aucun retour depuis ${j} jours`});
    }
    if(r.pretAExpedier>0) alertes.push({niveau:'ok', id:x.id, txt:`${x.c.ref} : ${r.pretAExpedier} pcs prêtes à expédier`});
  });
  recents.sort((a,b) => b.date.localeCompare(a.date));
  return {lignes, enCours, tot, parStatut, activite, activiteJour, recents: recents.slice(0,8), alertes};
}

function prodKpi(val, lbl, color, bg, onclick){
  return `<div class="kpi-mini" style="background:linear-gradient(160deg,${bg},var(--surface));border-color:${color}33;${onclick?'cursor:pointer;':''}" ${onclick?`onclick="${onclick}"`:''}>
    <div class="kpi-mini-val" style="color:${color};">${val}</div><div class="kpi-mini-lbl">${lbl}</div></div>`;
}

function renderProdDashboard(container, site){
  const d = prodDashDonnees(prodDashClient);
  const t = d.tot;
  const fluxTotal = PROD_FLUX.reduce((s,f) => s + t[f.k], 0);
  const maxAct = Math.max(1, ...PROD_ETAPES.map(e => d.activite[e]));
  const couleurNiveau = {bad:'var(--bad)', warn:'var(--warn)', ok:'var(--good)'};
  const iconeNiveau = {bad:'⚠️', warn:'⏳', ok:'📦'};
  container.innerHTML = `
    <div class="card" style="background:linear-gradient(120deg,#0B2C4D,#123B63);color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <div style="font-size:17px;font-weight:800;">📦 Commandes</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,.75);">${d.enCours.length} en cours · ${d.lignes.length - d.enCours.length} livrée${d.lignes.length-d.enCours.length>1?'s':''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:800;">${t.resteALivrer}</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,.75);">pièces à livrer</div>
        </div>
      </div>
      ${site==='tek' && canEditProdTek() ? `<div style="display:flex;gap:6px;margin-top:10px;">
        <button class="btn" style="flex:1;padding:9px 4px;font-size:12px;background:#fff;color:#0B2C4D;border:none;font-weight:800;" onclick="prodNouvelleCommande()">+ Nouvelle commande</button>
        <button class="btn" style="flex:1;padding:9px 4px;font-size:12px;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);font-weight:800;" onclick="prodGo('tek','list'); prodChoisirFichierExcel()">📥 Importer Excel</button>
      </div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px;">
        ${['tous', ...PROD_CLIENTS].map(cl => `<button class="btn" style="flex:1;padding:6px 4px;font-size:11.5px;background:${prodDashClient===cl?'#fff':'rgba(255,255,255,.12)'};color:${prodDashClient===cl?'#0B2C4D':'#fff'};border:1px solid rgba(255,255,255,.25);" onclick="prodDashClient='${cl}'; prodRerender('${site}')">${cl==='tous'?'Tous clients':cl}</button>`).join('')}
      </div>
    </div>

    ${d.lignes.length===0 ? `<div class="card">${buildEmptyState("Aucune commande", site==='tek' && canEditProdTek() ? "Créez la première commande avec le bouton ci-dessus." : "")}</div>` : `

    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      ${prodKpi(d.enCours.length, 'Commandes en cours', '#1D4ED8', '#EFF6FF', `prodListFilter='encours'; prodGo('${site}','list')`)}
      ${prodKpi(t.aLaGadh, 'Pièces à la GADH', '#8E2A5B', '#FDF2F8')}
      ${prodKpi(t.pretAExpedier, 'Prêt à expédier', '#059669', '#ECFDF5')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 4px;font-size:13px;">Où sont les pièces</h3>
      <p style="font-size:10.5px;color:var(--ink-faint);margin:0 0 8px;">Commandes en cours · ${t.commande} pièces commandées</p>
      <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--border-soft);margin-bottom:10px;">
        ${fluxTotal ? PROD_FLUX.map(f => t[f.k] ? `<div title="${f.label} ${t[f.k]}" style="width:${t[f.k]/fluxTotal*100}%;background:${f.color};"></div>` : '').join('') : ''}
      </div>
      ${PROD_FLUX.map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <span style="width:9px;height:9px;border-radius:50%;background:${f.color};flex-shrink:0;"></span>
          <span style="flex:1;font-size:12px;">${f.label}</span>
          <b style="font-size:13px;color:${t[f.k]?f.color:'var(--ink-faint)'};">${t[f.k]}</b>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-soft);margin-top:6px;padding-top:6px;font-size:11.5px;">
        <span>Expédié <b>${t.expedie}</b></span><span>Livré <b>${t.livre}</b></span><span style="color:var(--bad);">Rebut <b>${t.rebut}</b></span>
      </div>
    </div>

    <div class="card" style="border:1.5px solid ${d.alertes.some(a=>a.niveau!=='ok')?'var(--warn)':'var(--border)'};">
      <h3 style="margin:0 0 6px;font-size:13px;">Points d'attention</h3>
      ${d.alertes.length===0 ? `<p style="font-size:12px;color:var(--good);font-weight:700;margin:0;">✓ Rien à signaler</p>` : d.alertes.map(a => `
        <div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border-soft);" onclick="prodGo('${site}','fiche','${a.id}')">
          <span>${iconeNiveau[a.niveau]}</span><span style="flex:1;font-size:12px;color:${couleurNiveau[a.niveau]};">${esc(a.txt)}</span><span style="color:var(--ink-faint);">›</span>
        </div>`).join('')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">Commandes en cours</h3>
      ${d.enCours.length===0 ? buildEmptyState("Toutes les commandes sont livrées") : d.enCours.map(x => {
        const idx = prodFriseIndex(x.s.statut);
        return `
        <div style="padding:9px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;" onclick="prodGo('${site}','fiche','${x.id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div style="min-width:0;"><b style="font-size:13px;">${esc(x.c.ref)}</b> <span style="font-size:11.5px;color:var(--ink-soft);">${esc(x.c.nom)}</span>
              <div style="font-size:10.5px;color:var(--ink-faint);">${esc(x.c.client||'—')} · ${x.s.total} pcs · reste à livrer ${x.s.restes.resteALivrer}</div></div>
            ${prodStatutBadge(x.s.statut, true)}
          </div>
          <div style="display:flex;gap:3px;margin-top:8px;">
            ${PROD_FRISE.map((f,i) => `<div style="flex:1;text-align:center;">
              <div style="height:5px;border-radius:3px;background:${i<=idx ? PROD_STATUTS[x.s.statut].color : 'var(--border-soft)'};"></div>
              <div style="font-size:8.5px;color:${i===idx?PROD_STATUTS[x.s.statut].color:'var(--ink-faint)'};font-weight:${i===idx?'800':'500'};margin-top:2px;">${f.label}</div></div>`).join('')}
          </div>
          <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;">
            ${prodBarre(x.s.pctPret, '#0D9488', 'Prêt')}${prodBarre(x.s.pctExp, '#15803D', 'Expédié')}${prodBarre(x.s.pctLiv, '#1E3A8A', 'Livré')}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">Activité des 7 derniers jours</h3>
      ${PROD_ETAPES.map(e => `
        <div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
          <span style="width:78px;font-size:11.5px;">${PROD_ETAPE_INFO[e].label}</span>
          <div style="flex:1;height:9px;background:var(--border-soft);border-radius:5px;overflow:hidden;"><div style="width:${d.activite[e]/maxAct*100}%;height:100%;background:#3B82F6;"></div></div>
          <b style="width:48px;text-align:right;font-size:12px;">${d.activite[e]}</b>
        </div>`).join('')}
      <p style="font-size:10.5px;color:var(--ink-faint);margin:6px 0 0;">Aujourd'hui : ${PROD_ETAPES.filter(e=>d.activiteJour[e]).map(e=>`${PROD_ETAPE_INFO[e].label} ${d.activiteJour[e]}`).join(' · ') || 'aucune saisie'}${d.activite.rebut?` · rebut 7 j : ${d.activite.rebut}`:''}</p>
    </div>

    <div class="card">
      <h3 style="margin:0 0 6px;font-size:13px;">Dernières saisies</h3>
      ${d.recents.length===0 ? buildEmptyState("Aucune saisie") : d.recents.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-soft);cursor:pointer;" onclick="prodGo('${site}','fiche','${r.id}')">
          <div><div style="font-size:12px;font-weight:700;">${esc(r.ref)} · ${PROD_ETAPE_INFO[r.etape] ? PROD_ETAPE_INFO[r.etape].label : r.etape}</div>
            <div style="font-size:10.5px;color:var(--ink-faint);">${r.date.split('-').reverse().join('/')}</div></div>
          <b style="font-size:12.5px;">${r.q} pcs</b>
        </div>`).join('')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">Commandes par statut</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${Object.keys(PROD_STATUTS).filter(st => d.parStatut[st]).map(st => `<span style="font-size:11px;font-weight:800;color:#fff;background:${PROD_STATUTS[st].color};padding:4px 9px;border-radius:10px;">${PROD_STATUTS[st].label} · ${d.parStatut[st]}</span>`).join('')}
      </div>
    </div>`}
  `;
}

// Carte résumé à afficher sur le Tableau principal (TEK-TREND) et le Dashboard GADH
function prodCarteResume(container, site){
  if(!container) return;
  let d;
  try { d = prodDashDonnees('tous'); } catch(e){ console.error(e); return; }
  if(d.lignes.length===0) return;
  const t = d.tot;
  const cible = site==='gadh' ? 'gadh-prodchain' : 'prodchain';
  const aller = `prodNav['${site}'].view='dash'; nav('${cible}')`;
  const alertesFortes = d.alertes.filter(a => a.niveau!=='ok').length;
  const html = `
    <div class="card" style="cursor:pointer;" onclick="${aller}">
      <div class="flex-header" style="margin-bottom:8px;">
        <h3 style="margin:0;font-size:14px;">📦 Suivi des commandes</h3>
        <span style="font-size:12px;font-weight:700;color:var(--accent);">Voir tout ›</span>
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px;">
        ${site==='gadh'
          ? prodKpi(t.aLaGadh, 'Pièces à la GADH', '#8E2A5B', '#FDF2F8') + prodKpi(d.activite.retour, 'Retournées 7 j', '#7C3AED', '#F5F3FF') + prodKpi(d.enCours.length, 'Commandes en cours', '#1D4ED8', '#EFF6FF')
          : prodKpi(d.enCours.length, 'Commandes en cours', '#1D4ED8', '#EFF6FF') + prodKpi(t.pretAExpedier, 'Prêt à expédier', '#059669', '#ECFDF5') + prodKpi(t.resteALivrer, 'Reste à livrer', '#DC2626', '#FEF2F2')}
      </div>
      ${d.enCours.slice(0,3).map(x => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border-soft);">
          <b style="font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(x.c.ref)} <span style="font-weight:500;color:var(--ink-faint);">${esc(x.c.client||'')}</span></b>
          ${prodStatutBadge(x.s.statut, true)}
          <span style="font-size:11px;font-weight:800;width:62px;text-align:right;">${site==='gadh' ? x.s.restes.aLaGadh+' pcs' : x.s.pctExp+'% exp.'}</span>
        </div>`).join('')}
      ${d.enCours.length>3 ? `<div style="font-size:11px;color:var(--ink-faint);padding-top:4px;">+ ${d.enCours.length-3} autre(s)</div>` : ''}
      ${alertesFortes ? `<div style="font-size:11.5px;color:var(--warn);font-weight:700;margin-top:6px;">⚠️ ${alertesFortes} point${alertesFortes>1?'s':''} d'attention</div>` : ''}
    </div>`;
  container.insertAdjacentHTML('beforeend', html);
}

window.prodNouvelleCommande = () => {
  prodGo('tek', 'list');
  if(typeof window.showAddProdCommandeForm === 'function') window.showAddProdCommandeForm();
};

// ============================================================
// IMPORT DE COMMANDES DEPUIS UN FICHIER EXCEL (.xlsx) OU CSV
// ============================================================
// Lecteur .xlsx intégré (un .xlsx est un zip de fichiers XML) : aucune bibliothèque
// externe, fonctionne hors connexion. Format reconnu = celui des fiches de commande :
//   « Commande: <nom> », « LOT/REF » (valeur dessous ou à droite), « ANNEE »,
//   puis un tableau Model · LIBELLE · Taille · FR (ou Quantité) [· colonnes d'avancement].
// Une feuille = une commande. On montre un aperçu : rien n'est créé sans validation.

async function prodLireZip(buffer){
  const dv = new DataView(buffer), u8 = new Uint8Array(buffer);
  let eocd = -1;
  for(let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--){ if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if(eocd < 0) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) valide");
  const nb = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const fichiers = {};
  const dec = new TextDecoder('utf-8');
  for(let k = 0; k < nb; k++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    const methode = dv.getUint16(p + 10, true), taille = dv.getUint32(p + 20, true);
    const lNom = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lCom = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nom = dec.decode(u8.subarray(p + 46, p + 46 + lNom));
    fichiers[nom] = {methode, taille, local};
    p += 46 + lNom + lExtra + lCom;
  }
  const lire = async (nom) => {
    const f = fichiers[nom];
    if(!f) return null;
    const debut = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
    const brut = u8.subarray(debut, debut + f.taille);
    if(f.methode === 0) return dec.decode(brut);
    if(f.methode !== 8) throw new Error('Compression non prise en charge');
    const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(flux).text();
  };
  return {noms: Object.keys(fichiers), lire};
}
function prodXml(txt){ return new DOMParser().parseFromString(txt, 'application/xml'); }
function prodTags(doc, tag){ return Array.from(doc.getElementsByTagNameNS('*', tag)); }
function prodColIndex(ref){ let n = 0; for(const ch of ref.replace(/\d+/g,'')) n = n*26 + (ch.charCodeAt(0) - 64); return n - 1; }

// Renvoie [{nom, lignes: [[cellule, ...], ...]}] pour chaque feuille
async function prodLireXlsx(buffer){
  const zip = await prodLireZip(buffer);
  const partages = [];
  const ss = await zip.lire('xl/sharedStrings.xml');
  if(ss) prodTags(prodXml(ss), 'si').forEach(si => partages.push(prodTags(si, 't').map(t => t.textContent).join('')));
  const wb = prodXml(await zip.lire('xl/workbook.xml') || '<x/>');
  const rels = prodXml(await zip.lire('xl/_rels/workbook.xml.rels') || '<x/>');
  const cible = {};
  prodTags(rels, 'Relationship').forEach(r => { cible[r.getAttribute('Id')] = r.getAttribute('Target'); });
  let feuilles = prodTags(wb, 'sheet').map(s => {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let t = cible[rid] || '';
    t = t.replace(/^\//, '');
    if(!t.startsWith('xl/')) t = 'xl/' + t;
    return {nom: s.getAttribute('name'), chemin: t};
  });
  if(!feuilles.length) feuilles = zip.noms.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort().map((c,i) => ({nom:'Feuille '+(i+1), chemin:c}));
  const res = [];
  for(const f of feuilles){
    const xml = await zip.lire(f.chemin);
    if(!xml) continue;
    const lignes = [];
    prodTags(prodXml(xml), 'c').forEach(c => {
      const ref = c.getAttribute('r'); if(!ref) return;
      const r = parseInt(ref.replace(/[A-Z]+/i, '')) - 1, col = prodColIndex(ref.toUpperCase());
      const type = c.getAttribute('t');
      const v = prodTags(c, 'v')[0];
      let val = null;
      if(type === 's' && v) val = partages[parseInt(v.textContent)];
      else if(type === 'inlineStr') val = prodTags(c, 't').map(t => t.textContent).join('');
      else if(v) val = (type === 'str' || type === 'b') ? v.textContent : (isNaN(Number(v.textContent)) ? v.textContent : Number(v.textContent));
      if(val === null || val === '') return;
      if(!lignes[r]) lignes[r] = [];
      lignes[r][col] = val;
    });
    res.push({nom: f.nom, lignes});
  }
  return res;
}
function prodLireCsv(texte){
  const sep = (texte.split('\n')[0].match(/;/g)||[]).length >= (texte.split('\n')[0].match(/,/g)||[]).length ? ';' : ',';
  return [{nom:'CSV', lignes: texte.split(/\r?\n/).map(l => l.split(sep).map(x => { const t = x.trim().replace(/^"|"$/g,''); return t==='' ? undefined : (isNaN(Number(t)) ? t : Number(t)); }))}];
}

// --- Reconnaissance des références (modèle + libellé → référence de l'application) ---
function prodNorm(x){ return String(x==null?'':x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[_\-\/]+/g,' ').replace(/\s+/g,' ').trim(); }
function prodReconnaitreRef(modele, libelle){
  const t = ' ' + prodNorm(modele) + ' ' + prodNorm(libelle) + ' ';
  const mot = (m) => t.includes(' '+m+' ');
  let famille = null;
  if(t.includes('PHARMA') && mot('HOMME')) famille = 'PHARMA-HOMME';
  else if(t.includes('PHARMA') && mot('FEMME')) famille = (t.includes('COL ROND') || mot('CR')) ? 'PHARMA-FEMME CR' : 'PHARMA-FEMME CV';
  else if(t.includes('SPORT')) famille = 'SPORT';
  else if(t.includes('GILET')) famille = 'GILET-NOIR';
  else if(t.includes('FLEX')) famille = 'LYNE-FLEX';
  else if(mot('PRO') || t.includes('LYNE PRO')) famille = 'LYNE-PRO';
  if(!famille) return null;
  let variante = null;
  if(famille.startsWith('PHARMA')){
    variante = mot('NOIR') ? 'Noir' : mot('SABLE') ? 'Sable' : mot('GRIS') ? 'Gris' : mot('ROSE') ? 'Rose' : null;
  } else {
    const m = prodNorm(modele);
    variante = mot('FEMME') ? 'Femme' : mot('HOMME') ? 'Homme' : (/(^| )F( |$)/.test(m) ? 'Femme' : /(^| )H( |$)/.test(m) ? 'Homme' : null);
  }
  const k = variante ? prodRefKey(famille, variante) : null;
  return k && getProdReferences()[k] ? k : null;
}
function prodReconnaitreTaille(x){
  const t = prodNorm(x).replace(/\s/g,'');
  const alias = {'2XL':'XXL', '3XL':'XXXL', 'XXXXL':null};
  const v = alias[t] !== undefined ? alias[t] : t;
  return PROD_TAILLES.includes(v) ? v : null;
}
const PROD_COL_AVANCEMENT = [
  {etape:'coupe', motif:/COUP/}, {etape:'retour', motif:/ASSEMBL|RETOURN/}, {etape:'confection', motif:/CONFECTION/},
  {etape:'controle', motif:/CONTROL/}, {etape:'emballage', motif:/EMBALL/}, {etape:'expedition', motif:/EXPED/},
  {etape:'livraison', motif:/LIVR/}, {etape:'rebut', motif:/REBUT/}
];

// Analyse d'une feuille → commande (ou null si ce n'est pas une fiche de commande)
function prodAnalyserFeuille(feuille){
  const L = feuille.lignes;
  const cell = (r,c) => (L[r] && L[r][c] !== undefined) ? L[r][c] : undefined;
  let nom = '', ref = '', annee = null, client = null, entete = -1;
  const valeurPres = (r,c) => { for(const [dr,dc] of [[1,0],[0,1],[0,2],[1,1]]){ const v = cell(r+dr,c+dc); if(v!==undefined && prodNorm(v)!=='') return v; } return undefined; };
  for(let r = 0; r < L.length; r++){
    if(!L[r]) continue;
    for(let c = 0; c < L[r].length; c++){
      const v = L[r][c]; if(v===undefined) continue;
      const n = prodNorm(v);
      if(/^COMMANDE\b/.test(n) && !nom){ const m = String(v).split(/:/); nom = (m[1]||'').trim() || String(valeurPres(r,c)||'').trim(); }
      else if(/^(LOT|REF|LOT REF|REFERENCE)$/.test(n) && !ref){ const x = valeurPres(r,c); if(x!==undefined) ref = String(x).trim(); }
      else if(/^(ANNEE|AN)$/.test(n) && !annee){ const x = parseInt(valeurPres(r,c)); if(x>2000) annee = x; }
      if(/ALLOGA/.test(n)) client = 'ALLOGA'; else if(/NEOLYS/.test(n) && !client) client = 'NEOLYS';
      if(n==='TAILLE' && entete<0) entete = r;
    }
  }
  if(entete < 0) return null;
  const H = (L[entete]||[]).map(prodNorm);
  const col = (motif) => H.findIndex(h => h && motif.test(h));
  const cModele = col(/^MODELE?$|^MODEL$/), cLib = col(/LIBELLE|DESIGNATION|ARTICLE/), cTaille = col(/^TAILLE$/);
  let cQte = col(/^FR$/); if(cQte<0) cQte = col(/^(QTE|QTY|QUANTITE|QUANTITES|COMMANDE|COMMANDEE|NB|PIECES)$/);
  if(cQte<0) return null;
  const cAv = PROD_COL_AVANCEMENT.map(a => ({...a, c: col(a.motif)})).filter(a => a.c>=0 && a.c!==cQte);
  const lignes = {}, avancement = {}, ignorees = [];
  let modeleCourant = '', total = 0;
  for(let r = entete+1; r < L.length; r++){
    if(!L[r]) continue;
    if(cModele>=0 && cell(r,cModele)!==undefined) modeleCourant = cell(r,cModele);
    const tailleBrute = cell(r,cTaille), qte = parseInt(cell(r,cQte));
    // Pas de taille = ligne de total ou ligne vide : on l'écarte sans la signaler.
    if(tailleBrute===undefined || prodNorm(tailleBrute)==='' || /^TOTAL/.test(prodNorm(tailleBrute))) continue;
    const lib = cLib>=0 ? cell(r,cLib) : '';
    const rk = prodReconnaitreRef(modeleCourant, lib), t = prodReconnaitreTaille(tailleBrute);
    const libelleLigne = `${prodNorm(modeleCourant) || '—'} ${lib ? '· '+String(lib).trim() : ''} · ${tailleBrute===undefined?'?':tailleBrute}`;
    if(!rk){ ignorees.push(`Ligne ${r+1} : référence non reconnue (${libelleLigne})`); continue; }
    if(!t){ ignorees.push(`Ligne ${r+1} : taille non reconnue (${libelleLigne})`); continue; }
    if(!(qte>0)) continue;
    if(!lignes[rk]) lignes[rk] = {tailles:{}};
    lignes[rk].tailles[t] = (lignes[rk].tailles[t]||0) + qte;
    total += qte;
    cAv.forEach(a => {
      const q = parseInt(cell(r,a.c));
      if(q>0){ if(!avancement[a.etape]) avancement[a.etape] = {}; if(!avancement[a.etape][rk]) avancement[a.etape][rk] = {}; avancement[a.etape][rk][t] = (avancement[a.etape][rk][t]||0) + q; }
    });
  }
  if(total===0) return null;
  const totAv = {};
  Object.entries(avancement).forEach(([e, refs]) => { totAv[e] = 0; Object.values(refs).forEach(ts => Object.values(ts).forEach(q => { totAv[e] += q; })); });
  return {
    feuille: feuille.nom, nom: nom || feuille.nom, ref, annee: annee || new Date().getFullYear(),
    client: client || 'NEOLYS', lignes, total, avancement, totAv, ignorees,
    importerAvancement: Object.keys(avancement).length>0, dateAvancement: getTodayISO(), cree: false
  };
}

// ============================================================
// ÉCRAN D'IMPORT (aperçu puis création)
// ============================================================
let prodImports = [];
window.prodChoisirFichierExcel = () => {
  let inp = document.getElementById('prod-import-file');
  if(!inp){
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'prod-import-file'; inp.accept = '.xlsx,.csv'; inp.style.display = 'none';
    inp.addEventListener('change', () => { if(inp.files && inp.files[0]) prodImporterFichier(inp.files[0]); inp.value = ''; });
    document.body.appendChild(inp);
  }
  inp.click();
};
async function prodImporterFichier(fichier){
  const zone = document.getElementById('prod-cmd-form-zone');
  if(zone) zone.innerHTML = `<div class="card" style="text-align:center;font-size:12.5px;color:var(--ink-soft);">Lecture de « ${esc(fichier.name)} »…</div>`;
  try{
    let feuilles;
    if(/\.csv$/i.test(fichier.name)) feuilles = prodLireCsv(await fichier.text());
    else if(/\.xls$/i.test(fichier.name)) throw new Error("Ancien format .xls : dans Excel, faites « Enregistrer sous » → Classeur Excel (.xlsx), puis réessayez");
    else feuilles = await prodLireXlsx(await fichier.arrayBuffer());
    prodImports = feuilles.map(prodAnalyserFeuille).filter(Boolean);
    if(!prodImports.length) throw new Error("Aucune commande reconnue : il faut une colonne « Taille » et une colonne de quantité (« FR » ou « Quantité »)");
    renderProdImports();
  } catch(e){
    console.error(e);
    if(zone) zone.innerHTML = `<div class="card" style="border:1.5px solid var(--bad);"><b style="color:var(--bad);font-size:12.5px;">Import impossible</b><p style="font-size:12px;margin:4px 0 8px;">${esc(e.message||String(e))}</p><button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="document.getElementById('prod-cmd-form-zone').innerHTML=''">Fermer</button></div>`;
  }
}
window.prodImpSet = (i, champ, val) => { if(prodImports[i]) prodImports[i][champ] = val; };
window.prodImpClient = (i, cl) => { prodImports[i].client = cl; renderProdImports(); };
window.prodImpFermer = () => { prodImports = []; const z = document.getElementById('prod-cmd-form-zone'); if(z) z.innerHTML = ''; };
function renderProdImports(){
  const zone = document.getElementById('prod-cmd-form-zone');
  if(!zone) return;
  zone.innerHTML = prodImports.map((imp, i) => {
    if(imp.cree) return `<div class="card" style="border:1.5px solid var(--good);font-size:12.5px;">✓ Commande <b>${esc(imp.ref)}</b> créée.</div>`;
    const autorisees = prodRefsAllowedFor(imp.client).map(([k])=>k);
    const interdites = Object.keys(imp.lignes).filter(k => !autorisees.includes(k));
    const labelsAv = {coupe:'coupé', retour:'retourné', confection:'confectionné', controle:'contrôlé', emballage:'emballé', expedition:'expédié', livraison:'livré', rebut:'rebut'};
    return `
    <div class="card" style="background:var(--surface-2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h3 style="margin:0;font-size:14px;">Import Excel${prodImports.length>1?` (${i+1}/${prodImports.length})`:''}</h3>
        <span style="font-size:10.5px;color:var(--ink-faint);">Feuille « ${esc(imp.feuille)} »</span>
      </div>
      <div class="field"><label>Client</label><div style="display:flex;gap:8px;">
        ${PROD_CLIENTS.map(cl => `<button class="btn ${imp.client===cl?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px;" onclick="prodImpClient(${i},'${cl}')">${cl}</button>`).join('')}
      </div></div>
      <div class="field"><label>Nom</label><input value="${esc(imp.nom)}" oninput="prodImpSet(${i},'nom',this.value)"></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1.4;"><label>Référence / LOT</label><input value="${esc(imp.ref)}" oninput="prodImpSet(${i},'ref',this.value)" placeholder="Obligatoire"></div>
        <div class="field" style="flex:1;"><label>Année</label><input type="number" inputmode="numeric" value="${imp.annee}" oninput="prodImpSet(${i},'annee',this.value)"></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:6px 0;">${Object.keys(imp.lignes).length} MODÈLE(S) · ${imp.total} PIÈCES</div>
      ${Object.entries(imp.lignes).map(([rk,l]) => `
        <div style="padding:5px 0;border-bottom:1px solid var(--border-soft);${interdites.includes(rk)?'color:var(--bad);':''}">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:12px;">${esc(prodRefName(rk))}</b><b style="font-size:12px;">${prodLigneTotal(l)}</b></div>
          <div style="font-size:10.5px;color:var(--ink-soft);">${PROD_TAILLES.filter(t=>l.tailles[t]).map(t=>`${t} ${l.tailles[t]}`).join(' · ')}</div>
        </div>`).join('')}
      ${interdites.length ? `<p style="font-size:11px;color:var(--bad);margin:6px 0 0;">ALLOGA n'autorise pas : ${interdites.map(prodRefName).join(', ')}. Choisissez NEOLYS ou corrigez le fichier.</p>` : ''}
      ${imp.ignorees.length ? `<details style="margin-top:8px;"><summary style="font-size:11px;color:var(--warn);cursor:pointer;">${imp.ignorees.length} ligne(s) ignorée(s)</summary><div style="font-size:10.5px;color:var(--ink-soft);margin-top:4px;line-height:1.5;">${imp.ignorees.slice(0,20).map(esc).join('<br>')}</div></details>` : ''}
      ${Object.keys(imp.avancement).length ? `
      <div style="margin-top:10px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);">
        <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;cursor:pointer;">
          <input type="checkbox" ${imp.importerAvancement?'checked':''} onchange="prodImpSet(${i},'importerAvancement',this.checked)" style="margin-top:2px;">
          <span>Importer aussi l'avancement du fichier : ${Object.entries(imp.totAv).map(([e,q])=>`${labelsAv[e]} ${q}`).join(' · ')}</span>
        </label>
        <div class="field" style="margin:6px 0 0;"><label style="font-size:10px;">Date de ces quantités</label><input type="date" value="${imp.dateAvancement}" max="${getTodayISO()}" onchange="prodImpSet(${i},'dateAvancement',this.value)"></div>
      </div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" onclick="prodImpCreer(${i})">Créer la commande</button>
        <button class="btn btn-ghost" onclick="prodImpFermer()">Annuler</button>
      </div>
    </div>`;
  }).join('');
  zone.scrollIntoView({behavior:'smooth', block:'start'});
}
window.prodImpCreer = (i) => {
  const imp = prodImports[i];
  if(!imp || imp.cree) return;
  const nom = String(imp.nom||'').trim(), ref = String(imp.ref||'').trim();
  const annee = parseInt(imp.annee) || new Date().getFullYear();
  if(!nom){ showToast('Le nom de la commande est obligatoire'); return; }
  if(!ref){ showToast('La référence / LOT est obligatoire'); return; }
  if(!prodRefIsUnique(ref)){ showToast(`La référence ${ref} existe déjà — une commande ne peut pas être importée deux fois`); return; }
  const autorisees = prodRefsAllowedFor(imp.client).map(([k])=>k);
  const interdites = Object.keys(imp.lignes).filter(k => !autorisees.includes(k));
  if(interdites.length){ showToast(`ALLOGA n'autorise pas ${prodRefName(interdites[0])}`); return; }
  const cmds = getProdCommandes();
  const id = 'cmd'+Date.now()+Math.floor(Math.random()*1000);
  cmds[id] = {nom, ref, annee, client: imp.client, dateCreation: getTodayISO(), lignes: imp.lignes, createdBy: currentUser.nom, importe: true};
  saveProdCommandes(cmds);
  let msgAv = '';
  if(imp.importerAvancement && Object.keys(imp.avancement).length){
    const date = imp.dateAvancement || getTodayISO();
    const jour = JSON.parse(JSON.stringify(imp.avancement));
    // Le fichier n'a pas de colonne Confection : une pièce contrôlée a forcément été confectionnée.
    if(!jour.confection && jour.controle){
      jour.confection = {};
      Object.entries(jour.controle).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,q]) => {
        const ret = (jour.retour && jour.retour[rk] && jour.retour[rk][t]) || 0;
        const rb = (jour.rebut && jour.rebut[rk] && jour.rebut[rk][t]) || 0;
        const v = Math.min(q + rb, ret);
        if(v>0){ if(!jour.confection[rk]) jour.confection[rk] = {}; jour.confection[rk][t] = v; }
      }));
    }
    saveProdSaisies(id, {[date]: jour});
    const nbViol = prodViolations(prodCumuls(id)).length;
    msgAv = nbViol ? ` — avancement importé, ${nbViol} incohérence(s) du fichier à vérifier` : ' avec son avancement';
  }
  const faits = getJSON('prod_v4_migre', {}); faits[id] = true; setJSON('prod_v4_migre', faits);
  imp.cree = true;
  showToast(`Commande ${ref} importée${msgAv}`);
  if(prodImports.every(x => x.cree)){ prodImports = []; prodGo('tek', 'fiche', id); }
  else renderProdImports();
};
// ============================================================
// FORMULAIRE COMMANDE (création / modification / import copier-coller)
// ============================================================
let prodCmdForm = null; // {editId, nom, ref, annee, client, refs:[], qty:{rk:{t:v}}, showImport}
function prodBindCommandeForm(){
  window.showAddProdCommandeForm = () => {
    prodCmdForm = {editId:null, nom:'', ref:'', annee:new Date().getFullYear(), client:'NEOLYS', refs:[], qty:{}, showImport:false};
    renderProdCommandeForm();
  };
  window.showEditProdCommandeForm = (id) => {
    const c = getProdCommandes()[id];
    if(!c) return;
    const qty = {};
    Object.entries(c.lignes||{}).forEach(([rk,l]) => { qty[rk] = {...(l.tailles||{})}; });
    prodCmdForm = {editId:id, nom:c.nom||'', ref:c.ref||'', annee:c.annee||new Date().getFullYear(), client:c.client||'NEOLYS', refs:Object.keys(c.lignes||{}), qty, showImport:false};
    renderProdCommandeForm();
    const z = document.getElementById('prod-cmd-form-zone');
    if(z) z.scrollIntoView({behavior:'smooth', block:'start'});
  };
  window.prodCmdFormSet = (field, val) => { if(prodCmdForm) prodCmdForm[field] = val; };
  window.setProdNewCmdClient = (cl) => {
    prodCmdForm.client = cl;
    if(cl==='ALLOGA') prodCmdForm.refs = prodCmdForm.refs.filter(k => PROD_ALLOGA_REFS.includes(k));
    renderProdCommandeForm();
  };
  window.toggleProdNewCmdRef = (k) => {
    const i = prodCmdForm.refs.indexOf(k);
    if(i>=0) prodCmdForm.refs.splice(i,1); else prodCmdForm.refs.push(k);
    renderProdCommandeForm();
  };
  window.setProdNewCmdQty = (rk, t, val) => {
    if(!prodCmdForm.qty[rk]) prodCmdForm.qty[rk] = {};
    prodCmdForm.qty[rk][t] = val;
  };
  window.toggleProdImportZone = () => { prodCmdForm.showImport = !prodCmdForm.showImport; renderProdCommandeForm(); };
  window.prodCancelCommandeForm = () => { prodCmdForm = null; const z=document.getElementById('prod-cmd-form-zone'); if(z) z.innerHTML=''; };
  window.runProdImport = () => {
    const text = document.getElementById('pc-import-text').value;
    const result = prodParseImportText(text, prodCmdForm.client);
    let n = 0;
    Object.entries(result.matched).forEach(([rk, tailles]) => {
      if(!prodCmdForm.refs.includes(rk)) prodCmdForm.refs.push(rk);
      if(!prodCmdForm.qty[rk]) prodCmdForm.qty[rk] = {};
      Object.entries(tailles).forEach(([t,q]) => { prodCmdForm.qty[rk][t] = q; n++; });
    });
    prodCmdForm.showImport = result.errors.length>0 && n===0;
    renderProdCommandeForm();
    if(result.errors.length){
      const zone = document.getElementById('pc-import-result');
      if(zone){ document.getElementById('pc-import-text').value = text; zone.innerHTML = `<div style="font-size:10.5px;color:var(--bad);">${result.errors.map(e=>esc(e)).join('<br>')}</div>`; }
    }
    showToast(n>0 ? `${n} ligne(s) importée(s)${result.errors.length?' — '+result.errors.length+' ignorée(s)':''}` : 'Aucune ligne importée');
  };
  window.saveProdCommandeForm = () => {
    const f = prodCmdForm;
    const nom = (f.nom||'').trim(), ref = (f.ref||'').trim();
    const annee = parseInt(f.annee) || new Date().getFullYear();
    if(!nom){ showToast('Le nom de la commande est obligatoire'); return; }
    if(!ref){ showToast('La référence / LOT est obligatoire'); return; }
    if(!prodRefIsUnique(ref, f.editId)){ showToast('Cette référence/LOT existe déjà — elle doit être unique'); return; }
    const allowed = prodRefsAllowedFor(f.client).map(([k])=>k);
    const lignes = {};
    f.refs.forEach(rk => {
      if(!allowed.includes(rk)) return;
      Object.entries(f.qty[rk]||{}).forEach(([t,v]) => {
        const q = parseInt(v);
        if(q>0){ if(!lignes[rk]) lignes[rk] = {tailles:{}}; lignes[rk].tailles[t] = q; }
      });
    });
    if(Object.keys(lignes).length===0){ showToast('Indiquez au moins une quantité'); return; }
    const list = getProdCommandes();
    if(f.editId){
      // Une référence/taille qui a déjà des saisies ne peut pas être retirée de la commande.
      const utilisees = new Set();
      Object.values(getProdSaisies(f.editId)).forEach(jour => Object.values(jour||{}).forEach(refs => Object.entries(refs||{}).forEach(([rk,ts]) => Object.entries(ts||{}).forEach(([t,q]) => { if(parseInt(q)>0) utilisees.add(rk+'|'+t); }))));
      const retirees = [...utilisees].filter(k => { const [rk,t] = k.split('|'); return !(lignes[rk] && lignes[rk].tailles[t]); });
      if(retirees.length){
        showToast(`Impossible de retirer ${retirees.map(k=>{const [rk,t]=k.split('|'); return prodRefName(rk)+' '+t;}).slice(0,3).join(', ')} : des quantités sont déjà saisies dessus.`);
        return;
      }
      list[f.editId] = {...list[f.editId], nom, ref, annee, client:f.client, lignes};
      saveProdCommandes(list);
      showToast('Commande modifiée');
    } else {
      const id = 'cmd'+Date.now()+Math.floor(Math.random()*1000);
      list[id] = {nom, ref, annee, client:f.client, dateCreation:getTodayISO(), lignes, createdBy: currentUser.nom};
      saveProdCommandes(list);
      showToast('Commande créée');
    }
    prodCmdForm = null;
    prodRerender('tek');
  };
}
function renderProdCommandeForm(){
  const f = prodCmdForm;
  const zone = document.getElementById('prod-cmd-form-zone');
  if(!zone || !f) return;
  const refs = prodRefsAllowedFor(f.client);
  zone.innerHTML = `
    <div class="card" style="background:var(--surface-2);">
      <h3 style="margin-top:0;">${f.editId ? 'Modifier la commande' : 'Nouvelle commande'}</h3>
      <div class="field"><label>Client</label>
        <div style="display:flex;gap:8px;">
          ${PROD_CLIENTS.map(cl => `<button class="btn ${f.client===cl?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px;" onclick="setProdNewCmdClient('${cl}')">${cl}</button>`).join('')}
        </div>
      </div>
      ${f.client==='ALLOGA' ? `<p style="font-size:10.5px;color:var(--warn);margin:4px 0 8px;">ALLOGA : seules PHARMA-HOMME / Noir et PHARMA-FEMME CV / Noir sont autorisées.</p>` : ''}
      <div class="field"><label>Nom (ex : mois)</label><input id="pc-nom" value="${esc(f.nom)}" oninput="prodCmdFormSet('nom', this.value)" placeholder="Ex : OCTOBRE"></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1.4;"><label>Référence / LOT (unique)</label><input id="pc-ref" value="${esc(f.ref)}" oninput="prodCmdFormSet('ref', this.value)" placeholder="Ex : PK202610-1"></div>
        <div class="field" style="flex:1;"><label>Année</label><input id="pc-annee" type="number" inputmode="numeric" value="${esc(String(f.annee))}" oninput="prodCmdFormSet('annee', this.value)"></div>
      </div>
      <button class="btn btn-ghost" style="width:100%;margin:4px 0 8px;font-size:11.5px;" onclick="toggleProdImportZone()">${f.showImport ? '▲ Masquer l\'import' : '▼ Importer depuis Excel (copier/coller)'}</button>
      ${f.showImport ? `
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px;">
        <p style="font-size:10.5px;color:var(--ink-soft);margin:0 0 6px;">Copiez une plage Excel : une ligne par taille, colonnes <b>Référence · Taille · Quantité</b>.<br>Ex : <code style="font-size:9.5px;">PHARMA-HOMME / Noir → XS → 60</code></p>
        <textarea id="pc-import-text" rows="6" style="width:100%;font-family:monospace;font-size:11px;padding:8px;border:1.5px solid var(--border);border-radius:8px;" placeholder="Collez ici…"></textarea>
        <button class="btn btn-primary" style="width:100%;margin-top:8px;padding:8px;font-size:12px;" onclick="runProdImport()">Analyser et remplir</button>
        <div id="pc-import-result" style="margin-top:8px;"></div>
      </div>` : ''}
      <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:6px 0;">RÉFÉRENCES CONCERNÉES</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        ${refs.map(([k,r]) => `<button class="btn ${f.refs.includes(k)?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11px;" onclick="toggleProdNewCmdRef('${k}')">${esc(prodRefLabel(r.famille,r.variante))}</button>`).join('')}
      </div>
      ${f.refs.filter(k => refs.some(x=>x[0]===k)).length===0 ? `<p style="font-size:11.5px;color:var(--ink-faint);">Sélectionnez au moins une référence pour saisir les quantités par taille.</p>` : f.refs.filter(k => refs.some(x=>x[0]===k)).map(k => `
        <div style="border-top:1px solid var(--border-soft);padding-top:8px;margin-top:8px;">
          <b style="font-size:12px;">${esc(prodRefName(k))}</b>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
            ${PROD_TAILLES.map(t => `<div style="text-align:center;"><div style="font-size:9.5px;color:var(--ink-faint);margin-bottom:2px;">${t}</div><input type="number" inputmode="numeric" min="0" class="pc-qte" data-refkey="${k}" data-taille="${t}" value="${(f.qty[k]&&f.qty[k][t])||''}" oninput="setProdNewCmdQty('${k}','${t}',this.value)" placeholder="0" style="width:52px;padding:6px 4px;text-align:center;border:1.5px solid var(--border);border-radius:6px;font-size:12px;"></div>`).join('')}
          </div>
        </div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="saveProdCommandeForm()">Enregistrer</button>
        <button class="btn btn-ghost" onclick="prodCancelCommandeForm()">Annuler</button>
      </div>
    </div>
  `;
}
function prodParseImportText(text, client){
  const refs = getProdReferences();
  const refByLabel = {};
  Object.entries(refs).forEach(([k,r]) => {
    const variants = [prodRefLabel(r.famille,r.variante), r.famille+' '+r.variante, r.famille+'/'+r.variante];
    variants.forEach(v => { refByLabel[v.toLowerCase().replace(/\s+/g,' ').trim()] = k; });
  });
  const allowedKeys = prodRefsAllowedFor(client).map(([k])=>k);
  const lines = (text||'').split('\n').map(l=>l.trim()).filter(l=>l);
  const matched = {}, errors = [];
  lines.forEach((line, i) => {
    const parts = line.split(/\t|;|,/).map(p=>p.trim()).filter(p=>p!=='');
    if(parts.length<3){ errors.push(`Ligne ${i+1} : format invalide ("${line}")`); return; }
    const [refText, tailleText, qtyText] = parts;
    const refKey = refByLabel[refText.toLowerCase().replace(/\s+/g,' ').trim()];
    const taille = PROD_TAILLES.find(t => t.toLowerCase()===tailleText.toLowerCase().trim());
    const qty = parseInt(qtyText);
    if(!refKey){ errors.push(`Ligne ${i+1} : référence inconnue ("${refText}")`); return; }
    if(client && !allowedKeys.includes(refKey)){ errors.push(`Ligne ${i+1} : "${refText}" n'est pas autorisée pour ${client}`); return; }
    if(!taille){ errors.push(`Ligne ${i+1} : taille inconnue ("${tailleText}")`); return; }
    if(isNaN(qty) || qty<=0){ errors.push(`Ligne ${i+1} : quantité invalide ("${qtyText}")`); return; }
    if(!matched[refKey]) matched[refKey] = {};
    matched[refKey][taille] = qty;
  });
  return {matched, errors};
}

// ============================================================
// EXPORT : fiche de commande en EXCEL (.xlsx) et en PDF (impression)
// ============================================================
// Reproduit la fiche « Flux d'une commande » : en-tête Commande / LOT-REF / ANNEE,
// tableau Model · LIBELLE · Taille · FR · Total, puis les quantités de chaque étape.
// Une commande seule, une sélection ou toutes : pour plusieurs commandes, une première
// feuille « Cumul » additionne tout, puis une feuille par commande.

// Modèles et libellés exactement comme dans la fiche de commande
const PROD_EXPORT_REFS = [
  ['PHARMA-HOMME','Noir',       'PHARMA-HOMME',          'PHARMA_HOMME COL V NOIR',            '595959'],
  ['PHARMA-HOMME','Gris',       'PHARMA-HOMME',          'PHARMA_HOMME COL V GRIS',            'BFBFBF'],
  ['PHARMA-HOMME','Sable',      'PHARMA-HOMME',          'PHARMA_HOMME COL V SABLE',           'FDE49B'],
  ['PHARMA-FEMME CV','Noir',    'PHARMA-FEMME COL V',    'PHARMA_FEMME COL V NOIR',            '595959'],
  ['PHARMA-FEMME CV','Rose',    'PHARMA-FEMME COL V',    'PHARMA_FEMME COL V ROSE POUDRE',     'FFABB5'],
  ['PHARMA-FEMME CR','Noir',    'PHARMA-FEMME COL ROND', 'PHARMA_FEMME COL ROND NOIR',         '595959'],
  ['PHARMA-FEMME CR','Rose',    'PHARMA-FEMME COL ROND', 'PHARMA_FEMME COL ROND ROSE POUDRE',  'FFABB5'],
  ['SPORT','Homme',             'Sport-H-Re-Mi',         'Tee-shirt Sport homme noir',         '595959'],
  ['SPORT','Femme',             'Sport-F-Re-Mi',         'Tee-shirt Sport femme noir',         '595959'],
  ['GILET-NOIR','Homme',        'Gilet-H-Noir',          'Gilet homme noir',                   '595959'],
  ['GILET-NOIR','Femme',        'Gilet-F-Noir',          'Gilet femme noir',                   '595959'],
  ['LYNE-PRO','Homme',          'Pro Homme',             'LYNE PRO homme gris',                '808080'],
  ['LYNE-PRO','Femme',          'Pro Femme',             'LYNE PRO femme gris',                '808080'],
  ['LYNE-FLEX','Homme',         'Flex Homme',            'LYNE FLEX homme gris',               'BFBFBF'],
  ['LYNE-FLEX','Femme',         'Flex Femme',            'LYNE FLEX femme gris',               'BFBFBF']
].map(([f,v,model,libelle,fill]) => ({rk: prodRefKey(f,v), model, libelle, fill}));
// Colonnes d'avancement (après FR et Total, séparées par une colonne étroite comme dans la fiche)
const PROD_EXPORT_COLS = [
  {k:'coupe',      titre:'Coupées/ envoyé à la Gadh'},
  {k:'retour',     titre:'Assemblées/ retournées Tektrend'},
  {k:'confection', titre:'Confectionnées'},
  {k:'controle',   titre:'Contrôlées (Conforme)'},
  {k:'emballage',  titre:'Emballées'},
  {k:'expedition', titre:'Expédiées'},
  {k:'livraison',  titre:'Livrées'},
  {k:'rebut',      titre:'Rebut'}
];

// Données d'une fiche : une commande, ou le cumul de plusieurs (additionné modèle par modèle, taille par taille)
function prodExportDonnees(cmdIds){
  const cmds = getProdCommandes();
  const ids = cmdIds.filter(id => cmds[id]);
  const somme = {}; // rk -> t -> {fr, coupe, ..., rebut}
  ids.forEach(id => {
    const cmd = cmds[id], cum = prodCumuls(id);
    Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.entries(l.tailles||{}).forEach(([t,q]) => {
      const c = prodCell(cum, rk, t);
      if(!somme[rk]) somme[rk] = {};
      if(!somme[rk][t]) somme[rk][t] = {fr:0, rebut:0};
      const o = somme[rk][t];
      o.fr += parseInt(q)||0;
      PROD_EXPORT_COLS.forEach(col => { if(col.k!=='rebut') o[col.k] = (o[col.k]||0) + (c[col.k]||0); });
      o.rebut += prodRebutTotal(c);
    }));
  });
  // Regroupement par modèle, dans l'ordre de la fiche
  const blocs = [];
  const connus = PROD_EXPORT_REFS.map(x => x.rk);
  const refsTriees = PROD_EXPORT_REFS.filter(x => somme[x.rk])
    .concat(Object.keys(somme).filter(rk => !connus.includes(rk)).map(rk => ({rk, model: prodRefName(rk).split(' / ')[0], libelle: prodRefName(rk), fill:'FFFFFF'})));
  refsTriees.forEach(ref => {
    let bloc = blocs.find(b => b.model===ref.model);
    if(!bloc){ bloc = {model: ref.model, libs: []}; blocs.push(bloc); }
    bloc.libs.push({...ref, rows: PROD_TAILLES.filter(t => somme[ref.rk][t]).map(t => ({t, ...somme[ref.rk][t]}))});
  });
  const un = ids.length===1 ? cmds[ids[0]] : null;
  const annees = [...new Set(ids.map(id => cmds[id].annee))].join(', ');
  const clients = [...new Set(ids.map(id => cmds[id].client).filter(Boolean))].join(', ');
  return {
    ids, blocs,
    nom: un ? un.nom : `Cumul (${ids.length} commandes)`,
    ref: un ? un.ref : ids.map(id => cmds[id].ref).join(', '),
    annee: annees, client: clients,
    feuille: un ? un.ref : 'Cumul'
  };
}

// ------------------------------------------------------------
// Générateur XLSX minimal (zip non compressé, valide pour Excel et LibreOffice)
// ------------------------------------------------------------
const PROD_CRC_TABLE = (() => { const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1); t[n]=c>>>0; } return t; })();
function prodCrc32(u8){ let c = 0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = PROD_CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function prodZip(fichiers){ // [{nom, texte}]
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  fichiers.forEach(f => {
    const nom = enc.encode(f.nom), data = enc.encode(f.texte), crc = prodCrc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,0,true); h.setUint16(12,0x21,true); h.setUint32(14,crc,true); h.setUint32(18,data.length,true); h.setUint32(22,data.length,true);
    h.setUint16(26,nom.length,true); h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer), nom, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0x0800,true); cd.setUint16(10,0,true);
    cd.setUint16(12,0,true); cd.setUint16(14,0x21,true); cd.setUint32(16,crc,true); cd.setUint32(20,data.length,true); cd.setUint32(24,data.length,true);
    cd.setUint16(28,nom.length,true); cd.setUint32(42,offset,true);
    central.push(new Uint8Array(cd.buffer), nom);
    offset += 30 + nom.length + data.length;
  });
  const tailleCd = central.reduce((s,p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0,0x06054b50,true); fin.setUint16(8,fichiers.length,true); fin.setUint16(10,fichiers.length,true);
  fin.setUint32(12,tailleCd,true); fin.setUint32(16,offset,true);
  return new Blob([...parts, ...central, new Uint8Array(fin.buffer)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function prodXmlEsc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function prodColLettre(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }

// Registre de styles : chaque combinaison police/fond/bordure/alignement devient un index de style Excel
function prodStyles(){
  const fonts = ['<font><sz val="10"/><name val="Arial"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const idx = (arr, x) => { let i = arr.indexOf(x); if(i<0){ arr.push(x); i = arr.length-1; } return i; };
  const cache = {};
  return {
    get(st){
      const cle = JSON.stringify(st);
      if(cache[cle]!==undefined) return cache[cle];
      const f = idx(fonts, `<font>${st.b?'<b/>':''}<sz val="${st.sz||10}"/><color rgb="FF${st.color||'000000'}"/><name val="Arial"/></font>`);
      const fi = st.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const b = st.border ? idx(borders, `<border>${['left','right','top','bottom'].map(side => { const w = (st.border[side]||st.border.all); return w ? `<${side} style="${w}"><color rgb="FF000000"/></${side}>` : `<${side}/>`; }).join('')}<diagonal/></border>`) : 0;
      const al = `<alignment horizontal="${st.h||'general'}" vertical="${st.v||'center'}"${st.wrap?' wrapText="1"':''}/>`;
      const x = idx(xfs, `<xf numFmtId="0" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${al}</xf>`);
      cache[cle] = x;
      return x;
    },
    xml(){
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    }
  };
}
// Une feuille au format de la fiche de commande
function prodFeuilleXml(d, styles){
  const lignes = {}; // r -> [xml cellules]
  const hauteurs = {1:16.5, 2:16.5, 3:16.5, 4:4.5, 5:39};
  const fusions = [];
  const nbCols = 6 + PROD_EXPORT_COLS.length; // A..F puis les étapes
  const derniere = prodColLettre(nbCols-1);
  const cel = (col, r, val, st, formule) => {
    const ref = prodColLettre(col) + r, s = styles.get(st);
    let x;
    if(formule) x = `<c r="${ref}" s="${s}"><f>${formule}</f><v>${val}</v></c>`;
    else if(val===null || val===undefined || val==='') x = `<c r="${ref}" s="${s}"/>`;
    else if(typeof val==='number') x = `<c r="${ref}" s="${s}"><v>${val}</v></c>`;
    else x = `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${prodXmlEsc(val)}</t></is></c>`;
    (lignes[r] = lignes[r] || []).push({col, x});
  };
  const fusion = (c1, r1, c2, r2, st) => {
    for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) if(!(r===r1 && c===c1)) cel(c, r, '', st);
    if(c1!==c2 || r1!==r2) fusions.push(`${prodColLettre(c1)}${r1}:${prodColLettre(c2)}${r2}`);
  };
  const bleu = '95B3D7', med = {all:'medium'};
  // En-tête
  cel(0,1,"Flux d'une commande",{b:1,sz:12,h:'center'}); fusion(0,1,nbCols-1,1,{b:1,sz:12,h:'center'});
  const stCmd = {b:1,sz:12,fill:bleu,h:'center',wrap:1,border:med};
  cel(0,2,`Commande: ${d.nom}`,stCmd); fusion(0,2,1,3,stCmd);
  const stLot = {b:1,sz:11,color:'C00000',fill:bleu,h:'center',border:med}, stRef = {b:1,sz:12,color:'3F3151',fill:bleu,h:'center',wrap:1,border:med};
  cel(2,2,'LOT/REF',stLot); fusion(2,2,7,2,stLot);
  cel(2,3,d.ref,stRef); fusion(2,3,7,3,stRef);
  const stAn = {b:1,sz:12,fill:bleu,h:'center',border:med};
  cel(8,2,'ANNEE',stAn); fusion(8,2,9,2,stAn);
  cel(8,3,d.annee,stAn); fusion(8,3,9,3,stAn);
  if(d.client){ cel(10,2,'CLIENT',stAn); fusion(10,2,nbCols-1,2,stAn); cel(10,3,d.client,stAn); fusion(10,3,nbCols-1,3,stAn); }
  // Ligne des titres de colonnes
  const stTitre = {b:1,sz:10,color:'FFFFFF',fill:'244061',h:'center',wrap:1,border:{all:'thin'}};
  ['Model','LIBELLE','Taille','FR','Total'].forEach((t,i) => cel(i,5,t,stTitre));
  cel(5,5,'',{});
  PROD_EXPORT_COLS.forEach((c,i) => cel(6+i,5,c.titre,{...stTitre, border:{all:'thin', left: i===0?'medium':'thin'}}));
  // Données
  let r = 6;
  const debut = 6;
  d.blocs.forEach(bloc => {
    const r0 = r;
    bloc.libs.forEach(lib => {
      const l0 = r;
      let totFr = 0;
      lib.rows.forEach(row => {
        cel(1, r, lib.libelle, {sz:10, fill:lib.fill, border:{all:'thin'}});
        cel(2, r, row.t, {sz:11, h:'center', border:{all:'thin'}});
        cel(3, r, row.fr, {sz:11, h:'center', border:{all:'thin'}});
        cel(5, r, '', {});
        PROD_EXPORT_COLS.forEach((c,i) => cel(6+i, r, row[c.k]||0, {sz:11, h:'center', color: c.k==='rebut' && row[c.k] ? 'C00000' : '000000', border:{all:'thin', left: i===0?'medium':'thin'}}));
        totFr += row.fr;
        r++;
      });
      const stTot = {b:1, sz:12, h:'center', border:{all:'thin'}};
      cel(4, l0, totFr, stTot, `SUM(D${l0}:D${r-1})`);
      fusion(4, l0, 4, r-1, stTot);
    });
    const stModel = {b:1, sz:11, h:'center', wrap:1, border:{all:'thin', left:'medium'}};
    cel(0, r0, bloc.model, stModel);
    fusion(0, r0, 0, r-1, stModel);
  });
  // Ligne des totaux
  const fin = r - 1;
  if(fin >= debut){
    const tot = (k) => d.blocs.reduce((s,b) => s + b.libs.reduce((s2,l) => s2 + l.rows.reduce((s3,row) => s3 + (row[k]||0), 0), 0), 0);
    const totFr = tot('fr');
    cel(2, r, 'Total', {b:1, sz:10, h:'center'});
    cel(3, r, totFr, {b:1, sz:10, h:'center'}, `SUM(D${debut}:D${fin})`);
    cel(4, r, totFr, {b:1, sz:11, color:'632423', h:'center'}, `SUM(E${debut}:E${fin})`);
    PROD_EXPORT_COLS.forEach((c,i) => { const L = prodColLettre(6+i); cel(6+i, r, tot(c.k), {b:1, sz:11, h:'center', color: c.k==='rebut' ? 'C00000' : '000000'}, `SUM(${L}${debut}:${L}${fin})`); });
  }
  const largeurs = [16.6, 42.1, 7.4, 6.5, 7.5, 1.6, 12, 13, 14.5, 12, 10.5, 10.5, 10.5, 9];
  const rows = Object.keys(lignes).map(Number).sort((a,b)=>a-b).map(rr => {
    const cs = lignes[rr].sort((a,b)=>a.col-b.col).map(c=>c.x).join('');
    const h = hauteurs[rr] ? ` ht="${hauteurs[rr]}" customHeight="1"` : '';
    return `<row r="${rr}"${h}>${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${derniere}${Math.max(r,5)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${largeurs.slice(0,nbCols).map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><mergeCells count="${fusions.length}">${fusions.map(f=>`<mergeCell ref="${f}"/>`).join('')}</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
function prodNomFeuille(n, pris){
  let base = String(n).replace(/[\[\]\*\?\/\\:]/g,'-').slice(0,31) || 'Feuille';
  let nom = base, i = 2;
  while(pris.has(nom.toLowerCase())){ nom = base.slice(0,28) + ' ' + (i++); }
  pris.add(nom.toLowerCase());
  return nom;
}
// Classeur : 1 commande = 1 feuille ; plusieurs = feuille « Cumul » + une feuille par commande
function prodExportXlsxBlob(cmdIds){
  const styles = prodStyles();
  const feuilles = [];
  if(cmdIds.length>1) feuilles.push(prodExportDonnees(cmdIds));
  cmdIds.forEach(id => feuilles.push(prodExportDonnees([id])));
  const pris = new Set();
  const noms = feuilles.map(f => prodNomFeuille(f.feuille, pris));
  const xmlFeuilles = feuilles.map(f => prodFeuilleXml(f, styles));
  const fichiers = [
    {nom:'[Content_Types].xml', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((f,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {nom:'_rels/.rels', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {nom:'xl/workbook.xml', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((n,i)=>`<sheet name="${prodXmlEsc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`},
    {nom:'xl/_rels/workbook.xml.rels', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${noms.map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${noms.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`}
  ];
  xmlFeuilles.forEach((x,i) => fichiers.push({nom:`xl/worksheets/sheet${i+1}.xml`, texte:x}));
  fichiers.push({nom:'xl/styles.xml', texte: styles.xml()});
  return prodZip(fichiers);
}
function prodNomFichier(cmdIds, ext){
  const cmds = getProdCommandes();
  const base = cmdIds.length===1 ? `Commande_${cmds[cmdIds[0]].ref}` : `Cumul_${cmdIds.length}_commandes`;
  return `${base}_${getTodayISO()}.${ext}`.replace(/[^\w.\-]+/g,'_');
}
window.prodExporterExcel = (cmdIds) => {
  if(!cmdIds || !cmdIds.length){ showToast('Sélectionnez au moins une commande'); return; }
  try{
    const blob = prodExportXlsxBlob(cmdIds);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = prodNomFichier(cmdIds, 'xlsx');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(`Fichier Excel créé : ${a.download}`);
  } catch(e){ console.error(e); showToast("Échec de l'export Excel"); }
};

// ------------------------------------------------------------
// PDF : page d'impression au même format (Imprimer → Enregistrer au format PDF)
// ------------------------------------------------------------
function prodFeuilleHtml(d){
  const cols = PROD_EXPORT_COLS;
  const tot = (k) => d.blocs.reduce((s,b) => s + b.libs.reduce((s2,l) => s2 + l.rows.reduce((s3,row) => s3 + (row[k]||0), 0), 0), 0);
  const corps = d.blocs.map(bloc => {
    const nbBloc = bloc.libs.reduce((s,l) => s + l.rows.length, 0);
    return bloc.libs.map((lib, li) => {
      const totFr = lib.rows.reduce((s,row) => s + row.fr, 0);
      return lib.rows.map((row, ri) => `<tr>
        ${li===0 && ri===0 ? `<td class="pm" rowspan="${nbBloc}">${esc(bloc.model)}</td>` : ''}
        <td class="pl" style="background:#${lib.fill};">${esc(lib.libelle)}</td>
        <td>${row.t}</td><td>${row.fr}</td>
        ${ri===0 ? `<td class="pt" rowspan="${lib.rows.length}">${totFr}</td>` : ''}
        <td class="ps"></td>
        ${cols.map((c,i) => `<td class="${i===0?'pg':''}${c.k==='rebut'&&row[c.k]?' pr':''}">${row[c.k]||0}</td>`).join('')}
      </tr>`).join('');
    }).join('');
  }).join('');
  return `
  <div class="pfeuille">
    <div class="ptitre">Flux d'une commande</div>
    <table class="pentete"><tr>
      <td class="pcmd" rowspan="2">Commande: ${esc(d.nom)}</td>
      <td class="plot">LOT/REF</td><td class="pan">ANNEE</td>${d.client ? '<td class="pan">CLIENT</td>' : ''}
    </tr><tr>
      <td class="pref">${esc(d.ref)}</td><td class="pan">${esc(String(d.annee))}</td>${d.client ? `<td class="pan">${esc(d.client)}</td>` : ''}
    </tr></table>
    <table class="ptab">
      <thead><tr><th>Model</th><th>LIBELLE</th><th>Taille</th><th>FR</th><th>Total</th><th class="ps"></th>${cols.map(c => `<th>${c.titre}</th>`).join('')}</tr></thead>
      <tbody>${corps}</tbody>
      <tfoot><tr><td></td><td></td><td><b>Total</b></td><td><b>${tot('fr')}</b></td><td class="ptt">${tot('fr')}</td><td class="ps"></td>${cols.map(c => `<td class="${c.k==='rebut'?'pr':''}"><b>${tot(c.k)}</b></td>`).join('')}</tr></tfoot>
    </table>
    <div class="ppied">Édité le ${getTodayISO().split('-').reverse().join('/')} · TEK-TREND</div>
  </div>`;
}
window.prodExporterPdf = (cmdIds) => {
  if(!cmdIds || !cmdIds.length){ showToast('Sélectionnez au moins une commande'); return; }
  const feuilles = [];
  if(cmdIds.length>1) feuilles.push(prodExportDonnees(cmdIds));
  cmdIds.forEach(id => feuilles.push(prodExportDonnees([id])));
  let zone = document.getElementById('prod-print-zone');
  if(zone) zone.remove();
  zone = document.createElement('div');
  zone.id = 'prod-print-zone';
  zone.innerHTML = `<style>
    @page { size: A4 landscape; margin: 10mm; }
    #prod-print-zone { display:none; font-family: Arial, Helvetica, sans-serif; color:#000; }
    @media print {
      body > *:not(#prod-print-zone) { display:none !important; }
      body { background:#fff !important; padding:0 !important; margin:0 !important; }
      #prod-print-zone { display:block; }
    }
    #prod-print-zone * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing:border-box; }
    #prod-print-zone .pfeuille { page-break-after: always; break-after: page; }
    #prod-print-zone .pfeuille:last-child { page-break-after: auto; break-after: auto; }
    #prod-print-zone .ptitre { text-align:center; font-weight:bold; font-size:12pt; border-bottom:2px solid #000; padding:2px 0 3px; margin-bottom:4px; }
    #prod-print-zone table { border-collapse:collapse; width:100%; }
    #prod-print-zone .pentete td { border:2px solid #000; background:#95B3D7; text-align:center; font-weight:bold; font-size:11pt; padding:2px 6px; }
    #prod-print-zone .pentete .pcmd { width:38%; font-size:12pt; }
    #prod-print-zone .pentete .plot { color:#C00000; }
    #prod-print-zone .pentete .pref { color:#3F3151; font-size:12pt; }
    #prod-print-zone .ptab { margin-top:6px; font-size:8.5pt; }
    #prod-print-zone .ptab th { background:#244061 !important; color:#fff !important; font-weight:bold !important; border:1px solid #000 !important; padding:3px 2px !important; font-size:7.5pt !important; text-transform:none !important; letter-spacing:0 !important; text-align:center !important; vertical-align:middle; line-height:1.15; }
    #prod-print-zone .ptab td { border:1px solid #000 !important; text-align:center; padding:1px 2px !important; font-size:8.5pt; line-height:1.2; letter-spacing:0; color:#000; }
    #prod-print-zone td, #prod-print-zone th { text-transform:none !important; }
    #prod-print-zone .ptab .pm { font-weight:bold; font-size:9.5pt; border-left:2px solid #000; }
    #prod-print-zone .ptab .pl { text-align:left; white-space:nowrap; }
    #prod-print-zone .ptab .pt { font-weight:bold; font-size:10pt; }
    #prod-print-zone .ptab .ps { border:none; width:6px; background:#fff; padding:0; }
    #prod-print-zone .ptab .pg { border-left:2px solid #000; }
    #prod-print-zone .ptab .pr { color:#C00000; }
    #prod-print-zone .ptab tfoot td { border:none; font-size:9pt; }
    #prod-print-zone .ptab .ptt { color:#632423; font-weight:bold; }
    #prod-print-zone .ppied { font-size:7.5pt; color:#555; text-align:right; margin-top:4px; }
  </style>` + feuilles.map(prodFeuilleHtml).join('');
  document.body.appendChild(zone);
  // Le titre de la page sert de nom au fichier PDF enregistré : on le garde jusqu'à la fin de l'impression.
  const titreAvant = document.title;
  const nettoyer = () => { const z = document.getElementById('prod-print-zone'); if(z) z.remove(); document.title = titreAvant; window.removeEventListener('afterprint', nettoyer); };
  window.addEventListener('afterprint', nettoyer);
  document.title = prodNomFichier(cmdIds, 'pdf').replace(/\.pdf$/,'');
  setTimeout(() => { window.print(); }, 150);
};

// ------------------------------------------------------------
// Panneau d'export (liste des commandes) : une, plusieurs ou toutes
// ------------------------------------------------------------
let prodExportSel = null;
window.prodOuvrirExport = () => {
  const toutes = activeProdCommandes();
  if(!toutes.length){ showToast('Aucune commande à exporter'); return; }
  if(!prodExportSel) prodExportSel = new Set(toutes.filter(([id]) => prodSynthese(id).statut!=='LIVRE').map(([id]) => id));
  const zone = document.getElementById('prod-cmd-form-zone');
  if(!zone) return;
  const sel = prodExportSel;
  zone.innerHTML = `
    <div class="card" style="background:var(--surface-2);">
      <div class="flex-header" style="margin-bottom:6px;"><h3 style="margin:0;font-size:14px;">Imprimer / exporter</h3>
        <button class="btn btn-ghost" style="padding:5px 9px;font-size:11.5px;" onclick="prodFermerExport()">Fermer</button></div>
      <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">Au format de la fiche de commande. Plusieurs commandes : une page « Cumul » qui additionne tout, puis une page par commande.</p>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="prodExportChoix('toutes')">Toutes (${toutes.length})</button>
        <button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="prodExportChoix('encours')">En cours</button>
        <button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="prodExportChoix('aucune')">Aucune</button>
      </div>
      <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface);">
        ${toutes.map(([id,c]) => { const s = prodSynthese(id); return `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border-soft);cursor:pointer;">
            <input type="checkbox" ${sel.has(id)?'checked':''} onchange="prodExportCocher('${id}', this.checked)" style="width:18px;height:18px;">
            <span style="flex:1;min-width:0;"><b style="font-size:12.5px;">${esc(c.ref)}</b> <span style="font-size:11px;color:var(--ink-soft);">${esc(c.nom)} · ${esc(c.client||'')} · ${s.total} pcs</span></span>
            ${prodStatutBadge(s.statut, true)}
          </label>`; }).join('')}
      </div>
      <div id="prod-export-compte" style="font-size:11.5px;font-weight:800;margin:8px 0;">${sel.size} commande(s) sélectionnée(s)</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;padding:10px 4px;" onclick="prodExporterPdf([...prodExportSel])">📄 PDF / Imprimer</button>
        <button class="btn btn-primary" style="flex:1;padding:10px 4px;background:#1D6F42;border-color:#1D6F42;" onclick="prodExporterExcel([...prodExportSel])">📊 Excel</button>
      </div>
    </div>`;
  zone.scrollIntoView({behavior:'smooth', block:'start'});
};
window.prodExportCocher = (id, ok) => { if(ok) prodExportSel.add(id); else prodExportSel.delete(id); const c = document.getElementById('prod-export-compte'); if(c) c.textContent = `${prodExportSel.size} commande(s) sélectionnée(s)`; };
window.prodExportChoix = (mode) => {
  const toutes = activeProdCommandes();
  prodExportSel = new Set(mode==='aucune' ? [] : toutes.filter(([id]) => mode==='toutes' || prodSynthese(id).statut!=='LIVRE').map(([id]) => id));
  prodOuvrirExport();
};
window.prodFermerExport = () => { prodExportSel = null; const z = document.getElementById('prod-cmd-form-zone'); if(z) z.innerHTML = ''; };
