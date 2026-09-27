// ============================================================
// GESTION DES COMMANDES — MODULE INDÉPENDANT (PERCKO → NEOLYS / ALLOGA)
// ============================================================
// Module séparé du suivi "Chaîne" existant (prod-module.js). Objectif : suivre
// une commande PERCKO depuis sa réception jusqu'à son expédition puis son
// archivage, avec traçabilité complète (historique horodaté).
//
// Décisions validées par l'utilisateur :
//  - Module vraiment indépendant (données, écrans, navigation séparés).
//  - Une même commande/lot PERCKO peut avoir 2 destinations (NEOLYS / ALLOGA) :
//    chacune est suivie comme une commande à part entière (quantités, statut,
//    historique propres), même si elles partagent le même numéro de lot.
//  - Pas de statut « Livrée » : Expédiée = terminée. Le bouton « Valider
//    l'expédition » peut archiver directement, même s'il reste un reliquat
//    définitivement manquant (rebut). Une expédition partielle peut être
//    complétée plus tard par une saisie complémentaire avant validation finale.
//  - Étapes fusionnées (plus simple) : Assemblage + Retour GADH → une seule
//    étape « Retour GADH ». Confection + Finition → une seule étape « Confection ».
//  - Aucune gestion de flèches, réception client, banque, comptabilité, salaires
//    ou suivi individuel d'opérateurs (interdit par le cahier des charges).
//
// Réutilise (en LECTURE SEULE) le catalogue de références produit et les
// lecteurs Excel/CSV déjà présents dans prod-module.js (mêmes vêtements,
// même usine) : getProdReferences/activeProdReferences/prodRefName,
// prodReconnaitreRef/prodReconnaitreTaille, prodLireXlsx/prodLireCsv, PROD_TAILLES.
// Les DONNÉES de commandes (quantités, statuts, historique) sont entièrement
// séparées, sous des clés cmd_*, jamais mélangées avec prod_* ni gadh_*.

// --- Destinations ---
const CMD_DESTINATIONS = ['NEOLYS', 'ALLOGA'];

// --- Étapes (6, fusionnées selon décision utilisateur) ---
const CMD_ETAPES = ['coupe','retour','confection','controle','emballage','expedition'];
const CMD_ETAPE_INFO = {
  coupe:      {label:'Coupe',          long:'Coupe (envoyée à la GADH)',            col:'Coupé',   amont:null},
  retour:     {label:'Retour GADH',    long:'Assemblage GADH + Retour TEK-TREND',   col:'Retour',  amont:'coupe'},
  confection: {label:'Confection',     long:'Confection + Finition',                col:'Conf.',   amont:'retour'},
  controle:   {label:'Contrôle',       long:'Contrôle (conformes)',                 col:'Ctrl',    amont:'confection'},
  emballage:  {label:'Emballage',      long:'Emballage',                            col:'Emb.',    amont:'controle'},
  expedition: {label:'Expédition',     long:'Expédition',                           col:'Exp.',    amont:'emballage'}
};
// Rebut (pièces non conformes / perdues) possible à CHAQUE étape.
const CMD_REBUT_KEY = {coupe:'rebut_coupe', retour:'rebut_retour', confection:'rebut_confection',
  controle:'rebut_controle', emballage:'rebut_emballage', expedition:'rebut_expedition'};
function cmdRebutKey(etape){ return CMD_REBUT_KEY[etape]; }

// --- Marge de coupe (règle métier) ---
// À la coupe, on coupe toujours un peu plus que la quantité commandée pour
// absorber les pertes lors des étapes suivantes (confection, contrôle...).
// Marge selon la quantité commandée (par référence/taille) :
//   < 100 pièces        → + 5 pièces
//   100 à 399 pièces    → +10 pièces
//   400 pièces et plus  → +20 pièces
// Exception : les références LYNE-PRO ajoutent toujours +3 pièces, quelle que
// soit la quantité commandée (remplace la règle par palier ci-dessus).
function cmdMargeCoupe(refKey, qteCommandee){
  const q = parseInt(qteCommandee) || 0;
  if(q <= 0) return 0;
  if(String(refKey||'').startsWith('LYNE-PRO')) return 3;
  if(q < 100) return 5;
  if(q < 400) return 10;
  return 20;
}

// --- Références produit : réutilise le catalogue du module Chaîne (lecture seule) ---
function cmdRefName(rk){ return (typeof prodRefName==='function') ? prodRefName(rk) : rk; }
function cmdActiveReferences(){ return (typeof activeProdReferences==='function') ? activeProdReferences() : []; }
const CMD_TAILLES = (typeof PROD_TAILLES!=='undefined') ? PROD_TAILLES : ['XS','S','M','L','XL','XXL','XXXL'];

// --- Restriction ALLOGA (même règle que l'ancien module Chaîne, confirmée par l'utilisateur) : ---
// ALLOGA n'autorise que 2 références précises — PHARMA-HOMME / Noir (tailles S à XXXL, pas de XS)
// et PHARMA-FEMME CV / Noir (tailles XS à XXL, pas de XXXL). NEOLYS n'a aucune restriction.
const CMD_ALLOGA_REFS = (typeof PROD_ALLOGA_REFS!=='undefined') ? PROD_ALLOGA_REFS : ['PHARMA-HOMME__Noir','PHARMA-FEMME CV__Noir'];
const CMD_ALLOGA_TAILLES = {
  'PHARMA-HOMME__Noir':    ['S','M','L','XL','XXL','XXXL'],
  'PHARMA-FEMME CV__Noir': ['XS','S','M','L','XL','XXL']
};
function cmdRefsAllowedFor(destination){
  const all = cmdActiveReferences();
  if(destination==='ALLOGA') return all.filter(([k]) => CMD_ALLOGA_REFS.includes(k));
  return all;
}
function cmdTaillesAllowedFor(destination, refKey){
  if(destination==='ALLOGA' && CMD_ALLOGA_TAILLES[refKey]) return CMD_ALLOGA_TAILLES[refKey];
  return CMD_TAILLES;
}
// Utilisé à l'import Excel (les lignes viennent du fichier, pas de boutons filtrés) :
// détecte toute référence/taille qui violerait la restriction ALLOGA ci-dessus.
function cmdLignesInterdites(destination, lignes){
  if(destination!=='ALLOGA') return [];
  const pb = [];
  Object.entries(lignes||{}).forEach(([rk,l]) => {
    if(!CMD_ALLOGA_REFS.includes(rk)){ pb.push(`${cmdRefName(rk)} n'est pas autorisée pour ALLOGA`); return; }
    const taillesOk = CMD_ALLOGA_TAILLES[rk] || [];
    Object.keys(l.tailles||{}).forEach(t => { if(!taillesOk.includes(t)) pb.push(`${cmdRefName(rk)} taille ${t} n'est pas autorisée pour ALLOGA`); });
  });
  return pb;
}

// --- Commandes : cmd_commandes = { id: {numero, lot, destination, client, annee, mois,
//      dateReception, lignes:{refKey:{tailles:{taille:qte}}}, cloturee, dateCloture,
//      clotureManuelle, cloturePar, createdBy, createdAt, importee} } ---
function getCmdCommandes(){ return getJSON('cmd_commandes', {}); }
function saveCmdCommandes(list){ setJSON('cmd_commandes', list); }
function listCmdCommandes(){
  return Object.entries(getCmdCommandes()).sort((a,b)=> (b[1].createdAt||0) - (a[1].createdAt||0));
}
function cmdLigneTotal(ligne){ return Object.values((ligne&&ligne.tailles)||{}).reduce((s,v)=>s+(parseInt(v)||0), 0); }
function cmdQteCommandee(cmd){ let t=0; Object.values(cmd.lignes||{}).forEach(l=>{ t+=cmdLigneTotal(l); }); return t; }
function cmdCmdQty(cmd, refKey, taille){
  return parseInt(cmd && cmd.lignes && cmd.lignes[refKey] && cmd.lignes[refKey].tailles && cmd.lignes[refKey].tailles[taille]) || 0;
}
// Le numéro d'une commande PERCKO = lot + destination (ex : PK202610-1-NEOLYS).
// Deux destinations d'un même lot sont donc deux commandes distinctes et uniques.
function cmdComposeNumero(lot, destination){ return String(lot||'').trim() + '-' + destination; }
function cmdNumeroIsUnique(numero, ignoreId){
  return !Object.entries(getCmdCommandes()).some(([id,c]) => id!==ignoreId && (c.numero||'').trim().toLowerCase()===String(numero||'').trim().toLowerCase());
}
function cmdMoisLabel(mois){
  const NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  if(!mois) return '—';
  const [y,m] = String(mois).split('-');
  const idx = parseInt(m)-1;
  return (NOMS[idx]||'—') + ' ' + y;
}

// --- Saisies journalières : cmd_saisies_<id> = {'AAAA-MM-JJ': {etape|rebutKey: {refKey:{taille:qte}}}} ---
function getCmdSaisies(cmdId){ return getJSON('cmd_saisies_'+cmdId, {}) || {}; }
function saveCmdSaisies(cmdId, s){ setJSON('cmd_saisies_'+cmdId, s); }

// --- Expéditions : cmd_expeditions_<id> = [{ts, date, heure, quantite, cartons, transporteur, bl, observation, user}] ---
function getCmdExpeditions(cmdId){ return getJSON('cmd_expeditions_'+cmdId, []) || []; }
function saveCmdExpeditions(cmdId, arr){ setJSON('cmd_expeditions_'+cmdId, arr); }

// --- Historique horodaté (traçabilité complète) : cmd_historique_<id> = [{ts, msg, user}] ---
function getCmdHistorique(cmdId){ return getJSON('cmd_historique_'+cmdId, []) || []; }
function saveCmdHistorique(cmdId, arr){ setJSON('cmd_historique_'+cmdId, arr); }
function cmdLog(cmdId, msg){
  const h = getCmdHistorique(cmdId);
  h.push({ts: Date.now(), msg, user: (typeof currentUser!=='undefined' && currentUser) ? currentUser.nom : ''});
  saveCmdHistorique(cmdId, h);
}
function cmdDateHeureFR(ts){
  const d = new Date(ts);
  const jj = String(d.getDate()).padStart(2,'0'), mm = String(d.getMonth()+1).padStart(2,'0'), aa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0'), mi = String(d.getMinutes()).padStart(2,'0');
  return `${jj}/${mm}/${aa} ${hh}:${mi}`;
}

// --- Cumuls à date, par référence/taille (même principe éprouvé que le module Chaîne) ---
function cmdEmptyCell(){
  const c = {};
  CMD_ETAPES.forEach(e => { c[e] = 0; c[CMD_REBUT_KEY[e]] = 0; });
  return c;
}
function cmdCumulsFrom(cmd, saisies){
  const res = {};
  const cell = (rk,t) => { if(!res[rk]) res[rk] = {}; if(!res[rk][t]) res[rk][t] = cmdEmptyCell(); return res[rk][t]; };
  if(cmd) Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => cell(rk,t)));
  Object.values(saisies||{}).forEach(jour => Object.entries(jour||{}).forEach(([etape, refs]) => {
    Object.entries(refs||{}).forEach(([rk, ts]) => Object.entries(ts||{}).forEach(([t,q]) => {
      const c = cell(rk,t);
      if(c[etape] !== undefined) c[etape] += parseInt(q)||0;
    }));
  }));
  return res;
}
function cmdCumuls(cmdId){ return cmdCumulsFrom(getCmdCommandes()[cmdId], getCmdSaisies(cmdId)); }
function cmdCell(cum, rk, t){ return (cum[rk] && cum[rk][t]) || cmdEmptyCell(); }
function cmdRebutEtape(etape, c){ return c[CMD_REBUT_KEY[etape]] || 0; }
function cmdRebutTotal(c){ return CMD_ETAPES.reduce((s,e) => s + cmdRebutEtape(e, c), 0); }
function cmdSortieEtape(etape, c){ return c[etape] + cmdRebutEtape(etape, c); }
function cmdDisponible(etape, c){
  const amont = CMD_ETAPE_INFO[etape].amont;
  if(!amont) return null;
  return c[amont] - cmdSortieEtape(etape, c);
}
function cmdRestes(c, q){
  const att = (e) => Math.max(0, cmdDisponible(e, c));
  return {
    resteACouper: Math.max(0, q - c.coupe),
    chezGadh: att('retour'), enConfection: att('confection'), auControle: att('controle'),
    aEmballer: att('emballage'), pretAExpedier: att('expedition'),
    expedie: c.expedition, resteAExpedier: Math.max(0, q - c.expedition),
    rebut: cmdRebutTotal(c)
  };
}
// Incohérences bloquantes : une étape qui dépasserait la précédente.
function cmdViolations(cum){
  const v = [];
  Object.entries(cum).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,c]) => {
    CMD_ETAPES.forEach(e => {
      const amont = CMD_ETAPE_INFO[e].amont;
      if(!amont) return;
      const sortie = cmdSortieEtape(e, c), rb = cmdRebutEtape(e, c);
      if(sortie > c[amont]) v.push({rk, t, code:e, msg:`${CMD_ETAPE_INFO[e].label.toLowerCase()} ${c[e]}${rb?' + rebut '+rb:''} > ${CMD_ETAPE_INFO[amont].col.toLowerCase().replace('.','')} ${c[amont]}`});
    });
  }));
  return v;
}
function cmdViolationKey(v){ return v.rk+'|'+v.t+'|'+v.code; }

// --- Statut automatique (cycle du cahier des charges, étapes fusionnées, sans « Livrée ») ---
const CMD_STATUTS = {
  A_TRAITER:  {label:'À traiter',              color:'#9CA3AF'},
  COUPE:      {label:'En cours de coupe',      color:'#F59E0B'},
  GADH:       {label:'À la GADH',              color:'#8E2A5B'},
  RETOUR:     {label:'Retour TEK-TREND',       color:'#7C3AED'},
  CONFECTION: {label:'En confection',          color:'#2563EB'},
  CONTROLE:   {label:'Contrôle',               color:'#0891B2'},
  EMBALLAGE:  {label:'Emballage',              color:'#0D9488'},
  PRET:       {label:'Prête à expédier',       color:'#059669'},
  PARTIEL:    {label:'Expédiée en partie',     color:'#65A30D'},
  EXPEDIEE:   {label:'Expédiée',               color:'#15803D'},
  ARCHIVEE:   {label:'Archivée',               color:'#4B5563'}
};
function cmdItems(cmd, cum, refFilter){
  const items = [];
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => {
    if(refFilter && rk!==refFilter) return;
    Object.entries(l.tailles||{}).forEach(([t,q]) => items.push({rk, t, q: parseInt(q)||0, c: cmdCell(cum, rk, t)}));
  });
  return items;
}
function cmdCalcStatut(items){
  let total=0, capCoupe=0, capEmb=0, capExp=0;
  const any = {}; CMD_ETAPES.forEach(e => { any[e] = 0; });
  items.forEach(({c,q}) => {
    total += q;
    capCoupe += Math.min(c.coupe, q); capEmb += Math.min(c.emballage, q); capExp += Math.min(c.expedition, q);
    CMD_ETAPES.forEach(e => { any[e] += cmdSortieEtape(e, c); });
  });
  if(total>0 && capExp>=total) return 'EXPEDIEE';
  if(any.expedition>0) return 'PARTIEL';
  if(total>0 && capEmb>=total) return 'PRET';
  if(any.emballage>0) return 'EMBALLAGE';
  if(any.controle>0) return 'CONTROLE';
  if(any.confection>0) return 'CONFECTION';
  if(any.retour>0) return 'RETOUR';
  if(any.coupe>0) return (total>0 && capCoupe>=total) ? 'GADH' : 'COUPE';
  return 'A_TRAITER';
}
function cmdSynthese(cmdId, refFilter, cumOpt){
  const cmd = getCmdCommandes()[cmdId];
  if(!cmd) return null;
  const cum = cumOpt || cmdCumuls(cmdId);
  const items = cmdItems(cmd, cum, refFilter);
  const restes = {resteACouper:0, chezGadh:0, enConfection:0, auControle:0, aEmballer:0, pretAExpedier:0, expedie:0, resteAExpedier:0, rebut:0};
  let total=0, capEmb=0, capExp=0;
  items.forEach(({c,q}) => {
    total += q; capEmb += Math.min(c.emballage, q); capExp += Math.min(c.expedition, q);
    const r = cmdRestes(c, q);
    Object.keys(restes).forEach(k => { restes[k] += r[k]; });
  });
  return {
    total, restes, statut: cmdCalcStatut(items),
    pctPret: total ? Math.min(100, Math.round(capEmb/total*100)) : 0,
    pctExp: total ? Math.min(100, Math.round(capExp/total*100)) : 0
  };
}
// Une commande est archivée si clôturée manuellement OU si 100% a été expédié.
function cmdEstCloturee(cmdId, sOpt){
  const cmd = getCmdCommandes()[cmdId];
  if(!cmd) return false;
  if(cmd.cloturee) return true;
  const s = sOpt || cmdSynthese(cmdId);
  return s.total>0 && s.restes.resteAExpedier===0;
}
function cmdStatutAffiche(cmdId, sOpt){
  const s = sOpt || cmdSynthese(cmdId);
  return cmdEstCloturee(cmdId, s) ? 'ARCHIVEE' : s.statut;
}
function cmdStatutBadge(statut, small){
  const s = CMD_STATUTS[statut] || CMD_STATUTS.A_TRAITER;
  return `<span style="font-size:${small?'9.5':'10.5'}px;font-weight:800;color:#fff;background:${s.color};padding:3px 8px;border-radius:10px;white-space:nowrap;">${s.label}</span>`;
}
// ============================================================
// PARCOURS VISUEL (avancement étape par étape)
// ============================================================
const CMD_PARCOURS = [
  {etape:'coupe',      titre:'Coupe',           recuLbl:'Commandé',          faitLbl:'Coupé',        attenteLbl:'À couper',        color:'#F59E0B', recu:(c,q)=>q},
  {etape:'retour',     titre:'Retour GADH',     recuLbl:'Envoyé à la GADH',  faitLbl:'Retourné',     attenteLbl:'Chez la GADH',    color:'#8E2A5B', recu:c=>c.coupe},
  {etape:'confection', titre:'Confection',      recuLbl:'Retourné GADH',     faitLbl:'Confectionné', attenteLbl:'À confectionner', color:'#2563EB', recu:c=>c.retour},
  {etape:'controle',   titre:'Contrôle',        recuLbl:'Confectionné',      faitLbl:'Conformes',    attenteLbl:'À contrôler',     color:'#0891B2', recu:c=>c.confection},
  {etape:'emballage',  titre:'Emballage',       recuLbl:'Conformes',         faitLbl:'Emballé',      attenteLbl:'À emballer',      color:'#0D9488', recu:c=>c.controle},
  {etape:'expedition', titre:'Expédition',      recuLbl:'Emballé',           faitLbl:'Expédié',      attenteLbl:'Prêt à expédier', color:'#15803D', recu:c=>c.emballage}
];
function cmdParcours(cmd, cum, refFilter){
  const items = cmdItems(cmd, cum, refFilter);
  let precedenteFinie = true;
  return CMD_PARCOURS.map(p => {
    let recu=0, fait=0, attente=0, rebut=0;
    const detail = {};
    items.forEach(({rk, t, q, c}) => {
      const r = p.recu(c, q), f = c[p.etape], rb = cmdRebutEtape(p.etape, c);
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
// Étape « en cours » d'une commande : la première étape (dans l'ordre du
// parcours coupe → retour → confection → contrôle → emballage → expédition),
// parmi celles saisissables depuis le contexte actuel (Commandes ou GADH —
// voir cmdEtapesAutorisees), où des pièces sont en attente d'y passer. Permet
// d'ouvrir directement la bonne étape de saisie (au lieu de toujours proposer
// la Coupe par défaut) et d'afficher le statut réellement actionnable sur la
// fiche, même si les quantités avancent de façon partielle référence par
// référence / taille par taille (jamais un seul bloc atomique).
function cmdEtapeCourante(cmdId, cumOpt){
  const cmd = getCmdCommandes()[cmdId];
  if(!cmd) return null;
  const cum = cumOpt || cmdCumuls(cmdId);
  const parcours = cmdParcours(cmd, cum);
  const autorisees = cmdEtapesAutorisees();
  const p = parcours.find(p => autorisees.includes(p.etape) && p.attente > 0);
  return p ? p.etape : null;
}

// ============================================================
// CRÉATION / MODIFICATION MANUELLE D'UNE COMMANDE
// ============================================================
let cmdForm = null; // {editId, lot, destination, client, annee, mois, dateReception, refs:[], qty:{rk:{t:v}}}
function cmdBlankForm(){
  const today = getTodayISO();
  return {editId:null, lot:'', destination:'NEOLYS', client:'PERCKO', annee:new Date().getFullYear(),
    mois: today.slice(0,7), dateReception: today, refs:[], qty:{}};
}
window.showAddCmdForm = () => { cmdForm = cmdBlankForm(); renderCmdForm(); };
window.showEditCmdForm = (id) => {
  const c = getCmdCommandes()[id];
  if(!c) return;
  const qty = {};
  Object.entries(c.lignes||{}).forEach(([rk,l]) => { qty[rk] = {...(l.tailles||{})}; });
  cmdForm = {editId:id, lot:c.lot||'', destination:c.destination||'NEOLYS', client:c.client||'PERCKO',
    annee:c.annee||new Date().getFullYear(), mois:c.mois||getTodayISO().slice(0,7),
    dateReception:c.dateReception||getTodayISO(), refs:Object.keys(c.lignes||{}), qty};
  renderCmdForm();
};
window.cmdFormSet = (field, val) => { if(cmdForm) cmdForm[field] = val; };
// Changer la destination doit retirer du formulaire toute référence/taille qui n'est
// plus autorisée (ex. passage à ALLOGA) — jamais l'inverse : on ne touche pas aux
// commandes déjà enregistrées, seulement à la saisie en cours dans le formulaire.
window.cmdFormSetDestination = (d) => {
  if(!cmdForm) return;
  cmdForm.destination = d;
  const clesAutorisees = cmdRefsAllowedFor(d).map(([k]) => k);
  cmdForm.refs = cmdForm.refs.filter(k => clesAutorisees.includes(k));
  cmdForm.refs.forEach(k => {
    const taillesAutorisees = cmdTaillesAllowedFor(d, k);
    if(cmdForm.qty[k]) Object.keys(cmdForm.qty[k]).forEach(t => { if(!taillesAutorisees.includes(t)) delete cmdForm.qty[k][t]; });
  });
  renderCmdForm();
};
window.toggleCmdFormRef = (k) => {
  const i = cmdForm.refs.indexOf(k);
  if(i>=0) cmdForm.refs.splice(i,1); else cmdForm.refs.push(k);
  renderCmdForm();
};
window.cmdFormQty = (rk, t, v) => { if(!cmdForm.qty[rk]) cmdForm.qty[rk] = {}; cmdForm.qty[rk][t] = v; };
window.cmdFormAnnuler = () => { cmdForm = null; const z = document.getElementById('cmd-form-zone'); if(z) z.innerHTML=''; };
window.cmdFormEnregistrer = () => {
  const f = cmdForm;
  const lot = String(f.lot||'').trim();
  if(!lot){ showToast('Le lot / numéro de commande PERCKO est obligatoire'); return; }
  if(!CMD_DESTINATIONS.includes(f.destination)){ showToast('Choisissez une destination'); return; }
  const numero = cmdComposeNumero(lot, f.destination);
  if(!cmdNumeroIsUnique(numero, f.editId)){ showToast(`La commande ${numero} existe déjà — une commande ne peut pas être créée deux fois`); return; }
  const lignes = {};
  f.refs.forEach(rk => {
    const tailles = {};
    Object.entries(f.qty[rk]||{}).forEach(([t,v]) => { const q = parseInt(v)||0; if(q>0) tailles[t] = q; });
    if(Object.keys(tailles).length) lignes[rk] = {tailles};
  });
  if(!Object.keys(lignes).length){ showToast('Ajoutez au moins une quantité'); return; }
  const cmds = getCmdCommandes();
  const id = f.editId || ('cmd'+Date.now()+Math.floor(Math.random()*1000));
  const isNew = !f.editId;
  cmds[id] = {
    ...(cmds[id]||{}), numero, lot, destination:f.destination, client:String(f.client||'PERCKO').trim()||'PERCKO',
    annee: parseInt(f.annee)||new Date().getFullYear(), mois: f.mois, dateReception: f.dateReception,
    lignes, createdBy: (cmds[id]&&cmds[id].createdBy) || currentUser.nom, createdAt: (cmds[id]&&cmds[id].createdAt) || Date.now()
  };
  saveCmdCommandes(cmds);
  if(isNew) cmdLog(id, `Commande reçue — ${numero} (${f.destination}) — ${cmdQteCommandee(cmds[id])} pièces commandées`);
  else cmdLog(id, `Commande modifiée — ${numero}`);
  showToast(isNew ? `Commande ${numero} créée` : `Commande ${numero} modifiée`);
  cmdForm = null;
  cmdGo('fiche', id);
};

// ============================================================
// CLÔTURE / RÉOUVERTURE / EXPÉDITION (sans statut « Livrée »)
// ============================================================
function canEditCmd(){ return currentUser && currentUser.role === 'admin'; }
// L'archivage d'une commande n'est permis que depuis le module Commandes lui-même :
// la GADH peut saisir la production (dont le Retour GADH) mais ne doit jamais pouvoir
// archiver une commande depuis son propre module.
function cmdPeutArchiver(){ return typeof activeModule === 'undefined' || activeModule !== 'gadh'; }
window.cmdCloturerCommande = (cmdId) => {
  if(!canEditCmd()) return;
  if(!cmdPeutArchiver()){ showToast("Archivage impossible depuis le module GADH — ouvrez le module Gestion des Commandes."); return; }
  const cmds = getCmdCommandes();
  const cmd = cmds[cmdId];
  if(!cmd || cmd.cloturee) return;
  const s = cmdSynthese(cmdId);
  const r = s.restes;
  const msg = r.resteAExpedier>0
    ? `Il reste ${r.resteAExpedier} pièce(s) non expédiée(s)${r.rebut?` (dont ${r.rebut} au rebut, définitivement perdue(s))`:''}.\n\nArchiver quand même cette commande ? Elle sortira des commandes en cours et passera en « Archivée ». Vous pourrez la rouvrir ensuite si besoin.`
    : `Archiver cette commande ?`;
  if(!confirm(msg)) return;
  cmds[cmdId] = {...cmd, cloturee:true, dateCloture:getTodayISO(), clotureManuelle:true, cloturePar:currentUser.nom};
  saveCmdCommandes(cmds);
  cmdLog(cmdId, `Commande archivée${r.resteAExpedier>0?` (reliquat de ${r.resteAExpedier} pièce(s) non expédiées, dont ${r.rebut} au rebut)`:''}`);
  showToast('Commande archivée');
  cmdGo('fiche', cmdId);
};
window.cmdRouvrirCommande = (cmdId) => {
  if(!canEditCmd()) return;
  const cmds = getCmdCommandes();
  const cmd = cmds[cmdId];
  if(!cmd || !cmd.cloturee) return;
  if(!confirm('Rouvrir cette commande ? Elle redevient une commande en cours.')) return;
  const { cloturee, dateCloture, clotureManuelle, cloturePar, ...reste } = cmd;
  cmds[cmdId] = reste;
  saveCmdCommandes(cmds);
  cmdLog(cmdId, 'Commande réouverte');
  showToast('Commande réouverte');
  cmdGo('fiche', cmdId);
};
// Suppression DÉFINITIVE d'une commande (différent de l'archivage, qui reste
// consultable) : retire la commande et toutes ses données associées (saisies
// journalières, historique, expéditions). Irréversible — double confirmation
// obligatoire. Comme pour l'archivage, interdit depuis le module GADH.
window.cmdSupprimerDefinitivement = (cmdId) => {
  if(!canEditCmd()) return;
  if(!cmdPeutArchiver()){ showToast("Suppression impossible depuis le module GADH — ouvrez le module Gestion des Commandes."); return; }
  const cmds = getCmdCommandes();
  const cmd = cmds[cmdId];
  if(!cmd) return;
  if(!confirm(`Supprimer DÉFINITIVEMENT la commande ${cmd.numero} ?\n\nToutes ses données (saisies de production, historique, expéditions) seront perdues pour toujours. Ce n'est pas un archivage : la commande disparaîtra complètement et ne pourra pas être rouverte.`)) return;
  if(!confirm(`Dernière confirmation — supprimer ${cmd.numero} pour toujours ?`)) return;
  delete cmds[cmdId];
  saveCmdCommandes(cmds);
  saveCmdSaisies(cmdId, {});
  saveCmdExpeditions(cmdId, []);
  saveCmdHistorique(cmdId, []);
  showToast(`Commande ${cmd.numero} supprimée définitivement`);
  cmdGo('list');
};

// --- Formulaire d'expédition (date/heure/quantité/cartons/transporteur/BL/observation) ---
let cmdExpForm = null; // {cmdId, date, heure, qty:{rk:{t:v}}, cartons, transporteur, bl, observation}
window.cmdOuvrirExpedition = (cmdId) => {
  const now = new Date();
  cmdExpForm = {
    cmdId, date: getTodayISO(), heure: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
    qty:{}, cartons:'', transporteur:'', bl:'', observation:'', poidsNet:'', poidsBrut:''
  };
  cmdGo('expedition', cmdId);
};
window.cmdExpSet = (field, val) => { if(cmdExpForm) cmdExpForm[field] = val; };
window.cmdExpQty = (rk, t, v) => { if(!cmdExpForm.qty[rk]) cmdExpForm.qty[rk] = {}; cmdExpForm.qty[rk][t] = v; cmdExpMajCartons(); };
function cmdExpLignesForm(f){
  const lignes = {};
  Object.entries(f.qty||{}).forEach(([rk,ts]) => Object.entries(ts||{}).forEach(([t,v]) => {
    const q = parseInt(v)||0; if(q>0){ if(!lignes[rk]) lignes[rk] = {}; lignes[rk][t] = q; }
  }));
  return lignes;
}
function cmdExpMajCartons(){
  const el = document.getElementById('exp-cartons-auto');
  if(!el || !cmdExpForm) return;
  const cmd = getCmdCommandes()[cmdExpForm.cmdId];
  const colis = cmdRepartirCartons(cmd && cmd.destination, cmdExpLignesForm(cmdExpForm));
  el.textContent = colis.length;
  const p = document.getElementById('exp-poids-auto');
  if(p) p.textContent = cmdPoidsBrutTotal(colis);
}
window.cmdExpToutDispo = () => {
  const cmd = getCmdCommandes()[cmdExpForm.cmdId];
  const cum = cmdCumuls(cmdExpForm.cmdId);
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => {
    const c = cmdCell(cum, rk, t);
    const dispo = Math.max(0, cmdDisponible('expedition', c));
    if(dispo>0){ if(!cmdExpForm.qty[rk]) cmdExpForm.qty[rk] = {}; cmdExpForm.qty[rk][t] = dispo; }
  }));
  cmdRerender();
};
window.cmdExpFermer = () => { const id = cmdExpForm ? cmdExpForm.cmdId : null; cmdExpForm = null; cmdGo('fiche', id); };
window.cmdExpEnregistrer = () => {
  const f = cmdExpForm;
  const cmd = getCmdCommandes()[f.cmdId];
  const cum = cmdCumuls(f.cmdId);
  let total = 0; const erreurs = [];
  Object.entries(f.qty).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
    const q = parseInt(v)||0; if(q<=0) return;
    const c = cmdCell(cum, rk, t);
    const dispo = Math.max(0, cmdDisponible('expedition', c));
    if(q > dispo) erreurs.push(`${cmdRefName(rk)} ${t} : impossible d'expédier ${q}, seulement ${dispo} disponible(s) (emballé non encore expédié)`);
    total += q;
  }));
  if(total<=0){ showToast('Saisissez au moins une quantité à expédier'); return; }
  if(erreurs.length){ showToast(erreurs[0]); return; }
  // Enregistrement dans les saisies (étape "expedition", comme les autres étapes)
  const saisies = getCmdSaisies(f.cmdId);
  const jour = {...(saisies[f.date] || {})};
  const existant = {...(jour.expedition||{})};
  Object.entries(f.qty).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
    const q = parseInt(v)||0; if(q<=0) return;
    if(!existant[rk]) existant[rk] = {};
    existant[rk][t] = (parseInt(existant[rk][t])||0) + q;
  }));
  jour.expedition = existant;
  saisies[f.date] = jour;
  saveCmdSaisies(f.cmdId, saisies);
  // Enregistrement de l'événement d'expédition (métadonnées transport)
  const exps = getCmdExpeditions(f.cmdId);
  const lignesExp = cmdExpLignesForm(f);
  const deja = {};
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => { const x = cmdCell(cum, rk, t).expedition; if(x>0){ if(!deja[rk]) deja[rk] = {}; deja[rk][t] = x; } }));
  const colis = cmdRepartirCartons(cmd.destination, lignesExp, {cmdId: f.cmdId, deja});
  if(colis.length){ // ALLOGA : cartons et poids brut calculés (60 pcs max, 1 taille par carton, 12 kg le carton plein)
    f.cartons = String(colis.length);
    f.poidsBrut = String(cmdPoidsBrutTotal(colis));
  }
  exps.push({ts:Date.now(), date:f.date, heure:f.heure||'', quantite:total, cartons:f.cartons||'', transporteur:f.transporteur||'', bl:f.bl||'', observation:f.observation||'', user:currentUser.nom,
    destination: cmd.destination, lignes: lignesExp, colis, poidsNet: f.poidsNet||'', poidsBrut: f.poidsBrut||''});
  saveCmdExpeditions(f.cmdId, exps);
  let msg = `${total} pièce(s) expédiée(s) le ${f.date.split('-').reverse().join('/')}`;
  if(f.cartons) msg += ` — ${f.cartons} carton(s)`;
  if(f.transporteur) msg += ` — ${f.transporteur}`;
  if(f.bl) msg += ` — BL ${f.bl}`;
  if(f.observation) msg += ` — ${f.observation}`;
  cmdLog(f.cmdId, msg);
  const s = cmdSynthese(f.cmdId);
  showToast(`Expédition enregistrée : ${total} pièce(s)`);
  cmdExpForm = null;
  if(s.restes.resteAExpedier===0 && cmdPeutArchiver()){
    // Tout est expédié : proposer l'archivage immédiat (pas obligatoire).
    cmdGo('fiche', f.cmdId);
    setTimeout(()=>{ if(confirm('Toutes les pièces ont été expédiées. Archiver la commande maintenant ?')) window.cmdCloturerCommande(f.cmdId); }, 150);
  } else {
    cmdGo('fiche', f.cmdId);
  }
};
// ============================================================
// IMPORT DE COMMANDES PERCKO DEPUIS UN FICHIER EXCEL (.xlsx / .csv)
// ============================================================
// Réutilise les lecteurs bas niveau du module Chaîne (prodLireZip / prodLireXlsx /
// prodLireCsv / prodReconnaitreRef / prodReconnaitreTaille) : aucune bibliothèque
// externe, fonctionne hors connexion. Le fichier PERCKO peut contenir deux
// feuilles : « COMMANDE NEOLYS » et « COMMANDE ALLOGA ». Chaque feuille devient
// une commande indépendante. Rien n'est créé sans passer par l'aperçu de
// vérification, et une commande déjà importée (même numéro = lot+destination)
// ne peut jamais être importée une seconde fois.

function cmdMoisFR(nom, annee){
  const NOMS = ['JANVIER','FEVRIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE','DÉCEMBRE'];
  const IDX  = {JANVIER:1,FEVRIER:2,'FÉVRIER':2,MARS:3,AVRIL:4,MAI:5,JUIN:6,JUILLET:7,AOUT:8,'AOÛT':8,SEPTEMBRE:9,OCTOBRE:10,NOVEMBRE:11,DECEMBRE:12,'DÉCEMBRE':12};
  const n = prodNorm(nom);
  const m = IDX[n];
  if(!m || !annee) return null;
  return annee + '-' + String(m).padStart(2,'0');
}
// Détecte la destination (NEOLYS/ALLOGA) à partir du nom de la feuille, sinon du contenu.
function cmdDetecterDestination(feuille){
  const nomFeuille = prodNorm(feuille.nom||'');
  if(nomFeuille.includes('ALLOGA')) return 'ALLOGA';
  if(nomFeuille.includes('NEOLYS')) return 'NEOLYS';
  for(const ligne of feuille.lignes||[]){
    for(const v of ligne||[]){
      const n = prodNorm(v);
      if(n.includes('ALLOGA')) return 'ALLOGA';
      if(n.includes('NEOLYS')) return 'NEOLYS';
    }
  }
  return 'NEOLYS';
}
// Analyse une feuille → { destination, lot, annee, mois, lignes, total, ignorees } ou null.
function cmdAnalyserFeuille(feuille){
  const L = feuille.lignes;
  const cell = (r,c) => (L[r] && L[r][c] !== undefined) ? L[r][c] : undefined;
  let lot = '', annee = null, moisNom = '', entete = -1;
  const valeurPres = (r,c) => { for(const [dr,dc] of [[1,0],[0,1],[0,2],[1,1]]){ const v = cell(r+dr,c+dc); if(v!==undefined && prodNorm(v)!=='') return v; } return undefined; };
  for(let r = 0; r < L.length; r++){
    if(!L[r]) continue;
    for(let c = 0; c < L[r].length; c++){
      const v = L[r][c]; if(v===undefined) continue;
      const n = prodNorm(v);
      if(/^COMMANDE\b/.test(n) && !moisNom){ const m = String(v).split(/:/); moisNom = (m[1]||'').trim(); }
      else if(/^(LOT|REF|LOT REF|REFERENCE|NUMERO|N°)$/.test(n) && !lot){ const x = valeurPres(r,c); if(x!==undefined) lot = String(x).trim(); }
      else if(/^(ANNEE|AN)$/.test(n) && !annee){ const x = parseInt(valeurPres(r,c)); if(x>2000) annee = x; }
      if(n==='TAILLE' && entete<0) entete = r;
    }
  }
  if(entete < 0) return null;
  if(!annee) annee = new Date().getFullYear();
  const destination = cmdDetecterDestination(feuille);
  const mois = cmdMoisFR(moisNom, annee) || getTodayISO().slice(0,7);
  const H = (L[entete]||[]).map(prodNorm);
  const col = (motif) => H.findIndex(h => h && motif.test(h));
  const cModele = col(/^MODELE?$|^MODEL$/), cLib = col(/LIBELLE|DESIGNATION|ARTICLE/), cTaille = col(/^TAILLE$/);
  let cQte = col(/^FR$/); if(cQte<0) cQte = col(/^(QTE|QTY|QUANTITE|QUANTITES|COMMANDE|COMMANDEE|NB|PIECES)$/);
  if(cQte<0) return null;
  const lignes = {}, ignorees = [];
  let modeleCourant = '', total = 0;
  for(let r = entete+1; r < L.length; r++){
    if(!L[r]) continue;
    if(cModele>=0 && cell(r,cModele)!==undefined) modeleCourant = cell(r,cModele);
    const tailleBrute = cell(r,cTaille), qte = parseInt(cell(r,cQte));
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
  }
  if(total===0) return null;
  return {
    feuille: feuille.nom, destination, client:'PERCKO', lot: lot || feuille.nom, annee, mois,
    dateReception: getTodayISO(), lignes, total, ignorees, cree:false
  };
}

// ============================================================
// ÉCRAN D'IMPORT (aperçu de vérification avant création — jamais automatique)
// ============================================================
let cmdImports = [];
window.cmdChoisirFichierExcel = () => {
  let inp = document.getElementById('cmd-import-file');
  if(!inp){
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = 'cmd-import-file'; inp.accept = '.xlsx,.csv'; inp.style.display = 'none';
    inp.addEventListener('change', () => { if(inp.files && inp.files[0]) cmdImporterFichier(inp.files[0]); inp.value = ''; });
    document.body.appendChild(inp);
  }
  inp.click();
};
async function cmdImporterFichier(fichier){
  const zone = document.getElementById('cmd-form-zone');
  if(zone) zone.innerHTML = `<div class="card" style="text-align:center;font-size:12.5px;color:var(--ink-soft);">Lecture de « ${esc(fichier.name)} »…</div>`;
  try{
    let feuilles;
    if(/\.csv$/i.test(fichier.name)) feuilles = prodLireCsv(await fichier.text());
    else if(/\.xls$/i.test(fichier.name)) throw new Error("Ancien format .xls : dans Excel, faites « Enregistrer sous » → Classeur Excel (.xlsx), puis réessayez");
    else feuilles = await prodLireXlsx(await fichier.arrayBuffer());
    cmdImports = feuilles.map(cmdAnalyserFeuille).filter(Boolean);
    if(!cmdImports.length) throw new Error("Aucune commande reconnue : il faut une colonne « Taille » et une colonne de quantité (« FR » ou « Quantité »)");
    renderCmdImports();
  } catch(e){
    console.error(e);
    if(zone) zone.innerHTML = `<div class="card" style="border:1.5px solid var(--bad);"><b style="color:var(--bad);font-size:12.5px;">Import impossible</b><p style="font-size:12px;margin:4px 0 8px;">${esc(e.message||String(e))}</p><button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="document.getElementById('cmd-form-zone').innerHTML=''">Fermer</button></div>`;
  }
}
window.cmdImpSet = (i, champ, val) => { if(cmdImports[i]) cmdImports[i][champ] = val; };
window.cmdImpDestination = (i, d) => { cmdImports[i].destination = d; renderCmdImports(); };
window.cmdImpFermer = () => { cmdImports = []; const z = document.getElementById('cmd-form-zone'); if(z) z.innerHTML = ''; };
function renderCmdImports(){
  const zone = document.getElementById('cmd-form-zone');
  if(!zone) return;
  zone.innerHTML = `<div class="card" style="background:var(--surface-2);margin-bottom:8px;"><b style="font-size:12.5px;">Vérifiez les données avant de créer la ou les commande(s)</b><p style="font-size:11px;color:var(--ink-soft);margin:4px 0 0;">Rien n'est enregistré tant que vous n'avez pas cliqué sur « Créer la commande ».</p></div>` +
  cmdImports.map((imp, i) => {
    if(imp.cree) return `<div class="card" style="border:1.5px solid var(--good);font-size:12.5px;">✓ Commande <b>${esc(imp.numeroApercu||imp.lot)}</b> créée.</div>`;
    const numero = cmdComposeNumero(imp.lot, imp.destination);
    const dejaExiste = !cmdNumeroIsUnique(numero);
    const interdites = cmdLignesInterdites(imp.destination, imp.lignes);
    return `
    <div class="card" style="background:var(--surface-2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <h3 style="margin:0;font-size:14px;">Import Excel${cmdImports.length>1?` (${i+1}/${cmdImports.length})`:''}</h3>
        <span style="font-size:10.5px;color:var(--ink-faint);">Feuille « ${esc(imp.feuille)} »</span>
      </div>
      <div class="field"><label>Destination</label><div style="display:flex;gap:8px;">
        ${CMD_DESTINATIONS.map(d => `<button class="btn ${imp.destination===d?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px;" onclick="cmdImpDestination(${i},'${d}')">${d}</button>`).join('')}
      </div></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1.4;"><label>Lot / N° commande PERCKO</label><input value="${esc(imp.lot)}" oninput="cmdImpSet(${i},'lot',this.value)" placeholder="Obligatoire"></div>
        <div class="field" style="flex:1;"><label>Année</label><input type="number" inputmode="numeric" value="${imp.annee}" oninput="cmdImpSet(${i},'annee',this.value)"></div>
      </div>
      <div class="field"><label>Date de réception</label><input type="date" value="${imp.dateReception}" max="${getTodayISO()}" onchange="cmdImpSet(${i},'dateReception',this.value)"></div>
      <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:6px 0;">N° commande : ${esc(numero)} · ${Object.keys(imp.lignes).length} MODÈLE(S) · ${imp.total} PIÈCES</div>
      ${dejaExiste ? `<p style="font-size:11.5px;color:var(--bad);font-weight:700;margin:4px 0 8px;">⚠ Cette commande existe déjà — import bloqué pour éviter un doublon.</p>` : ''}
      ${imp.destination==='ALLOGA' ? `<p style="font-size:10.5px;color:var(--warn);margin:4px 0 8px;">ALLOGA : seules PHARMA-HOMME / Noir (S à XXXL) et PHARMA-FEMME CV / Noir (XS à XXL) sont autorisées.</p>` : ''}
      ${interdites.length ? `<p style="font-size:11.5px;color:var(--bad);font-weight:700;margin:4px 0 8px;">⚠ Import bloqué : ${esc(interdites[0])}${interdites.length>1?` (+${interdites.length-1} autre(s))`:''}. Choisissez NEOLYS ou corrigez le fichier.</p>` : ''}
      ${Object.entries(imp.lignes).map(([rk,l]) => `
        <div style="padding:5px 0;border-bottom:1px solid var(--border-soft);">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:12px;">${esc(cmdRefName(rk))}</b><b style="font-size:12px;">${cmdLigneTotal(l)}</b></div>
          <div style="font-size:10.5px;color:var(--ink-soft);">${CMD_TAILLES.filter(t=>l.tailles[t]).map(t=>`${t} ${l.tailles[t]}`).join(' · ')}</div>
        </div>`).join('')}
      ${imp.ignorees.length ? `<details style="margin-top:8px;"><summary style="font-size:11px;color:var(--warn);cursor:pointer;">${imp.ignorees.length} ligne(s) ignorée(s)</summary><div style="font-size:10.5px;color:var(--ink-soft);margin-top:4px;line-height:1.5;">${imp.ignorees.slice(0,20).map(esc).join('<br>')}</div></details>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" ${(dejaExiste||interdites.length)?'disabled':''} onclick="cmdImpCreer(${i})">Créer la commande</button>
        <button class="btn btn-ghost" onclick="cmdImpFermer()">Annuler</button>
      </div>
    </div>`;
  }).join('');
  zone.scrollIntoView({behavior:'smooth', block:'start'});
}
window.cmdImpCreer = (i) => {
  const imp = cmdImports[i];
  if(!imp || imp.cree) return;
  const lot = String(imp.lot||'').trim();
  const annee = parseInt(imp.annee) || new Date().getFullYear();
  if(!lot){ showToast('Le lot / numéro de commande est obligatoire'); return; }
  const numero = cmdComposeNumero(lot, imp.destination);
  if(!cmdNumeroIsUnique(numero)){ showToast(`La commande ${numero} existe déjà — une commande ne peut pas être importée deux fois`); return; }
  const interdites = cmdLignesInterdites(imp.destination, imp.lignes);
  if(interdites.length){ showToast(`ALLOGA n'autorise pas : ${interdites[0]}`); return; }
  const cmds = getCmdCommandes();
  const id = 'cmd'+Date.now()+Math.floor(Math.random()*1000);
  cmds[id] = {
    numero, lot, destination: imp.destination, client:'PERCKO', annee, mois: imp.mois,
    dateReception: imp.dateReception, lignes: imp.lignes, createdBy: currentUser.nom, createdAt: Date.now(), importee:true
  };
  saveCmdCommandes(cmds);
  cmdLog(id, `Commande reçue (import Excel) — ${numero} (${imp.destination}) — ${imp.total} pièces commandées`);
  imp.cree = true; imp.numeroApercu = numero;
  showToast(`Commande ${numero} importée`);
  if(cmdImports.every(x => x.cree)){ cmdImports = []; cmdGo('fiche', id); }
  else renderCmdImports();
};
// ============================================================
// NAVIGATION DU MODULE (indépendante de tous les autres modules)
// ============================================================
const cmdNav = {view:'dash', id:null};
let cmdListFilter = 'toutes'; // toutes | NEOLYS | ALLOGA | encours | pretes | expediees | archivees
let cmdArchSearch = {q:'', destination:'', mois:'', annee:''};
function cmdRerender(){ const main = document.getElementById('main'); if(main) renderCmdModule(main); }
window.cmdGo = (view, id) => {
  cmdNav.view = view;
  if(id !== undefined) cmdNav.id = id;
  cmdRerender();
  window.scrollTo(0,0);
};

function canAccessCommandes(){ return currentUser && (currentUser.role === 'admin' || currentUser.role === 'viewer'); }

function renderCmdModule(main){
  if(!canAccessCommandes()){ main.innerHTML = `<div class="card">${buildEmptyState('Accès non autorisé', "Votre rôle ne permet pas d'ouvrir ce module.")}</div>`; return; }
  const v = cmdNav.view;
  const canEdit = currentUser.role === 'admin';
  main.innerHTML = `
    <div class="flex-header"><h2>📦 Gestion des Commandes <span style="font-size:11px;font-weight:600;color:var(--ink-faint);">PERCKO</span></h2></div>
    <div class="card" style="padding:8px;display:flex;gap:6px;flex-wrap:wrap;">
      <button class="btn ${v==='dash'?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;padding:9px 2px;font-size:12px;" onclick="cmdGo('dash')">Tableau de bord</button>
      <button class="btn ${v==='list'||v==='fiche'?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;padding:9px 2px;font-size:12px;" onclick="cmdGo('list')">Commandes</button>
      <button class="btn ${v==='archives'?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;padding:9px 2px;font-size:12px;" onclick="cmdGo('archives')">Archives</button>
      ${canEdit ? `<button class="btn ${v==='saisie'?'btn-primary':'btn-ghost'}" style="flex:1;min-width:90px;padding:9px 2px;font-size:12px;" onclick="cmdOuvrirSaisie(${cmdNav.id?`'${cmdNav.id}'`:'null'})">+ Saisie</button>` : ''}
    </div>
    <div id="cmd-view"></div>
  `;
  const c = document.getElementById('cmd-view');
  if(v==='dash') renderCmdDashboard(c);
  else if(v==='list') renderCmdList(c, canEdit);
  else if(v==='fiche') renderCmdFiche(c, canEdit);
  else if(v==='saisie') renderCmdSaisie(c, canEdit);
  else if(v==='expedition') renderCmdExpeditionForm(c, canEdit);
  else if(v==='archives') renderCmdArchives(c);
  else renderCmdDashboard(c);
}

// ============================================================
// TABLEAU DE BORD
// ============================================================
function renderCmdDashboard(container){
  const cmds = listCmdCommandes();
  const rows = cmds.map(([id,cmd]) => ({id, cmd, s: cmdSynthese(id)}));
  const actives = rows.filter(r => !cmdEstCloturee(r.id, r.s));
  const compte = (pred) => rows.filter(pred).length;
  const nbTotal = rows.length;
  const nbEnCoupe = compte(r => r.s.statut==='COUPE');
  const nbGadh = compte(r => r.s.statut==='GADH' || r.s.statut==='RETOUR');
  const nbConfection = compte(r => r.s.statut==='CONFECTION');
  const nbControle = compte(r => r.s.statut==='CONTROLE');
  const nbEmballage = compte(r => r.s.statut==='EMBALLAGE');
  const nbPretes = compte(r => r.s.statut==='PRET');
  const nbExpediees = compte(r => !cmdEstCloturee(r.id, r.s) && (r.s.statut==='EXPEDIEE' || r.s.statut==='PARTIEL'));
  const nbArchivees = compte(r => cmdEstCloturee(r.id, r.s));
  const rebutTotal = rows.reduce((s,r) => { let rb=0; Object.values(cmdCumuls(r.id)).forEach(ts=>Object.values(ts).forEach(c=>{rb+=cmdRebutTotal(c);})); return s+rb; }, 0);

  const kpi = (label, val, color) => `<div class="card" style="text-align:center;padding:12px 6px;"><div style="font-size:22px;font-weight:800;${color?`color:${color};`:''}">${val}</div><div style="font-size:10.5px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;">${label}</div></div>`;

  container.innerHTML = `
    <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:10px 0;">
      ${kpi('Total', nbTotal)}
      ${kpi('En coupe', nbEnCoupe, '#F59E0B')}
      ${kpi('À la GADH', nbGadh, '#8E2A5B')}
      ${kpi('Confection', nbConfection, '#2563EB')}
      ${kpi('Contrôle', nbControle, '#0891B2')}
      ${kpi('Emballage', nbEmballage, '#0D9488')}
      ${kpi('Prêtes', nbPretes, '#059669')}
      ${kpi('Expédiées', nbExpediees, '#15803D')}
      ${kpi('Archivées', nbArchivees, '#4B5563')}
    </div>
    ${rebutTotal>0 ? `<div class="card" style="border:1.5px solid var(--bad);background:#FEF2F2;margin-bottom:10px;"><b style="color:var(--bad);font-size:13px;">⚠ ${rebutTotal} pièce(s) au rebut au total</b></div>` : ''}
    <div class="flex-header" style="margin-top:6px;"><h3 style="margin:0;font-size:14px;">Commandes en cours</h3></div>
    ${actives.length===0 ? `<div class="card">${buildEmptyState('Aucune commande en cours', "Créez ou importez une commande pour commencer.")}</div>` :
      actives.sort((a,b)=>(b.cmd.createdAt||0)-(a.cmd.createdAt||0)).slice(0,8).map(r => cmdCarte(r.id, r.cmd, r.s)).join('')}
    ${actives.length>8 ? `<button class="btn btn-ghost" style="width:100%;margin-top:6px;" onclick="cmdGo('list')">Voir toutes les commandes en cours (${actives.length})</button>` : ''}
  `;
}
function cmdCarte(id, cmd, s){
  const statut = cmdStatutAffiche(id, s);
  const pct = s.pctExp;
  return `
  <div class="card" style="cursor:pointer;margin-bottom:8px;" onclick="cmdGo('fiche','${id}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <div>
        <b style="font-size:13.5px;">${esc(cmd.numero)}</b>
        <div style="font-size:11px;color:var(--ink-soft);">${esc(cmd.client||'PERCKO')} · ${esc(cmd.destination)} · ${cmdMoisLabel(cmd.mois)}</div>
      </div>
      ${cmdStatutBadge(statut, true)}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-soft);margin-top:8px;">
      <span>Total : <b style="color:var(--ink);">${cmdQteCommandee(cmd)}</b></span>
      <span>Expédié : <b style="color:var(--ink);">${s.restes.expedie}</b></span>
      <span>Restant : <b style="color:var(--ink);">${s.restes.resteAExpedier}</b></span>
    </div>
    <div style="height:8px;border-radius:5px;background:var(--surface-2);margin-top:6px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:${CMD_STATUTS[statut].color};border-radius:5px;"></div>
    </div>
    <div style="text-align:right;font-size:10px;color:var(--ink-faint);margin-top:2px;">${pct}% expédié</div>
  </div>`;
}

// ============================================================
// LISTE + FILTRES
// ============================================================
window.cmdSetFiltre = (f) => { cmdListFilter = f; cmdRerender(); };
function cmdMatchFiltre(id, cmd, s, filtre){
  const cloturee = cmdEstCloturee(id, s);
  switch(filtre){
    case 'NEOLYS': return cmd.destination==='NEOLYS';
    case 'ALLOGA': return cmd.destination==='ALLOGA';
    case 'encours': return !cloturee;
    case 'pretes': return !cloturee && s.statut==='PRET';
    case 'expediees': return !cloturee && (s.statut==='EXPEDIEE' || s.statut==='PARTIEL');
    case 'archivees': return cloturee;
    default: return true;
  }
}
function renderCmdList(container, canEdit){
  const filtres = [
    {k:'toutes', l:'Toutes'}, {k:'NEOLYS', l:'NEOLYS'}, {k:'ALLOGA', l:'ALLOGA'},
    {k:'encours', l:'En cours'}, {k:'pretes', l:'Prêtes'}, {k:'expediees', l:'Expédiées'}, {k:'archivees', l:'Archivées'}
  ];
  const rows = listCmdCommandes().map(([id,cmd]) => ({id, cmd, s: cmdSynthese(id)}))
    .filter(r => cmdMatchFiltre(r.id, r.cmd, r.s, cmdListFilter));
  container.innerHTML = `
    ${canEdit ? `
    <div class="card" style="display:flex;gap:8px;margin-bottom:10px;">
      <button class="btn btn-primary" style="flex:1;" onclick="showAddCmdForm()">+ Nouvelle commande</button>
      <button class="btn btn-ghost" style="flex:1;" onclick="cmdChoisirFichierExcel()">Importer Excel</button>
    </div>
    <div id="cmd-form-zone"></div>` : ''}
    <button class="btn btn-ghost" style="width:100%;padding:9px 4px;font-size:12.5px;margin-bottom:10px;" onclick="cmdOuvrirRapports()">📄 Rapports PDF / 📊 Excel</button>
    <div id="cmd-rapport-zone"></div>
    <div class="card" style="padding:8px;display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      ${filtres.map(f => `<button class="btn ${cmdListFilter===f.k?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11.5px;" onclick="cmdSetFiltre('${f.k}')">${f.l}</button>`).join('')}
    </div>
    ${rows.length===0 ? `<div class="card">${buildEmptyState('Aucune commande', "Aucune commande ne correspond à ce filtre.")}</div>` :
      rows.sort((a,b)=>(b.cmd.createdAt||0)-(a.cmd.createdAt||0)).map(r => cmdCarte(r.id, r.cmd, r.s)).join('')}
  `;
  // Le panneau de rapports reste ouvert si on change de filtre.
  if(cmdRapportSel) cmdAfficherRapports();
}

// ============================================================
// ARCHIVES + RECHERCHE
// ============================================================
window.cmdArchSet = (field, val) => { cmdArchSearch[field] = val; cmdRerender(); };
function renderCmdArchives(container){
  const all = listCmdCommandes().map(([id,cmd]) => ({id, cmd, s: cmdSynthese(id)})).filter(r => cmdEstCloturee(r.id, r.s));
  const q = prodNorm(cmdArchSearch.q||'');
  const filtered = all.filter(r => {
    if(cmdArchSearch.destination && r.cmd.destination !== cmdArchSearch.destination) return false;
    if(cmdArchSearch.annee && String(r.cmd.annee) !== String(cmdArchSearch.annee)) return false;
    if(cmdArchSearch.mois && r.cmd.mois !== cmdArchSearch.mois) return false;
    if(q){
      const hay = prodNorm(`${r.cmd.numero} ${r.cmd.lot} ${r.cmd.client} ${r.cmd.destination} ${Object.keys(r.cmd.lignes||{}).map(cmdRefName).join(' ')}`);
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const annees = [...new Set(all.map(r=>r.cmd.annee).filter(Boolean))].sort((a,b)=>b-a);
  container.innerHTML = `
    <div class="card" style="margin-bottom:10px;">
      <div class="field"><label>Recherche (numéro, lot, client, destination, référence)</label><input value="${esc(cmdArchSearch.q)}" oninput="cmdArchSet('q',this.value)" placeholder="Ex : PK202610, NEOLYS, PHARMA…"></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Destination</label><select onchange="cmdArchSet('destination',this.value)">
          <option value="">Toutes</option>${CMD_DESTINATIONS.map(d=>`<option value="${d}" ${cmdArchSearch.destination===d?'selected':''}>${d}</option>`).join('')}
        </select></div>
        <div class="field" style="flex:1;"><label>Année</label><select onchange="cmdArchSet('annee',this.value)">
          <option value="">Toutes</option>${annees.map(a=>`<option value="${a}" ${String(cmdArchSearch.annee)===String(a)?'selected':''}>${a}</option>`).join('')}
        </select></div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--ink-soft);font-weight:700;margin-bottom:6px;">${filtered.length} commande(s) archivée(s)</div>
    ${filtered.length===0 ? `<div class="card">${buildEmptyState('Aucun résultat', "Aucune commande archivée ne correspond à cette recherche.")}</div>` :
      filtered.sort((a,b)=>(b.cmd.createdAt||0)-(a.cmd.createdAt||0)).map(r => cmdCarte(r.id, r.cmd, r.s)).join('')}
  `;
}
// ============================================================
// FICHE DÉTAILLÉE D'UNE COMMANDE
// ============================================================
function renderCmdFiche(container, canEdit){
  const id = cmdNav.id;
  const cmd = id && getCmdCommandes()[id];
  if(!cmd){ container.innerHTML = `<div class="card">${buildEmptyState('Commande introuvable', "Elle a peut-être été supprimée.")}</div>`; return; }
  const cum = cmdCumuls(id);
  const s = cmdSynthese(id, null, cum);
  const statut = cmdStatutAffiche(id, s);
  const cloturee = cmdEstCloturee(id, s);
  const parcours = cmdParcours(cmd, cum);
  const violations = cmdViolations(cum);
  const histo = getCmdHistorique(id).slice().sort((a,b)=>b.ts-a.ts);
  const expeditions = getCmdExpeditions(id).slice().sort((a,b)=>b.ts-a.ts);
  // Étape « en cours » (dans le contexte actuel — Commandes ou GADH) : c'est
  // elle qu'on met en avant pour que l'ouverture de la fiche montre tout de
  // suite le statut réel et permette de valider directement vers l'étape
  // suivante, quantités déjà pré-remplies (rectifiables en cas de partialité).
  const etapeCourante = !cloturee ? cmdEtapeCourante(id, cum) : null;
  const pcCourante = etapeCourante ? parcours.find(p => p.etape===etapeCourante) : null;

  container.innerHTML = `
    <div class="flex-header">
      <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="cmdGo('list')">← Retour</button>
      ${canEdit && !cloturee ? `<button class="icon-btn" title="Modifier" onclick="showEditCmdForm('${id}')">✎</button>` : ''}
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <h2 style="margin:0;font-size:18px;">${esc(cmd.numero)}</h2>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">${esc(cmd.client||'PERCKO')} · Lot ${esc(cmd.lot)} · ${cmdMoisLabel(cmd.mois)}</div>
        </div>
        ${cmdStatutBadge(statut)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;font-size:12px;">
        <div><span style="color:var(--ink-faint);">Destination</span><br><b>${esc(cmd.destination)}</b></div>
        <div><span style="color:var(--ink-faint);">Réception</span><br><b>${(cmd.dateReception||'').split('-').reverse().join('/')}</b></div>
        <div><span style="color:var(--ink-faint);">Quantité totale</span><br><b>${s.total}</b></div>
        <div><span style="color:var(--ink-faint);">Restant à expédier</span><br><b>${s.restes.resteAExpedier}</b></div>
      </div>
      ${cloturee ? `<div class="card" style="background:var(--surface-2);margin-top:10px;padding:8px;font-size:11.5px;">
        ${cmd.clotureManuelle ? `Archivée le ${(cmd.dateCloture||'').split('-').reverse().join('/')} par ${esc(cmd.cloturePar||'')}${s.restes.resteAExpedier>0?` — reliquat ${s.restes.resteAExpedier} pièce(s) (dont ${s.restes.rebut} au rebut)`:''}` : 'Archivée automatiquement (100% expédiée)'}
        ${canEdit ? `<button class="btn btn-ghost" style="margin-top:6px;padding:6px 10px;font-size:11.5px;" onclick="cmdRouvrirCommande('${id}')">Rouvrir la commande</button>` : ''}
      </div>` : ''}
    </div>

    ${canEdit && !cloturee && etapeCourante ? `<div class="card" style="margin-top:10px;border:1.5px solid ${pcCourante.color};">
      <div style="font-size:10.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.03em;">Étape en cours</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
        <b style="font-size:16px;">${pcCourante.titre}</b>
        <span style="font-size:11.5px;color:var(--ink-soft);">${pcCourante.attente} pièce(s) en attente</span>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="cmdOuvrirSaisie('${id}', null, '${etapeCourante}')">Valider → ${pcCourante.titre}</button>
    </div>` : (canEdit && !cloturee ? `<div class="card" style="margin-top:10px;background:var(--surface-2);">
      <div style="font-size:11.5px;color:var(--ink-soft);">✓ Rien en attente pour l'instant sur les étapes de ce module.</div>
    </div>` : '')}

    ${violations.length ? `<div class="card" style="border:1.5px solid var(--bad);background:#FEF2F2;">
      <b style="color:var(--bad);font-size:12.5px;">⚠ ${violations.length} incohérence(s) de quantité</b>
      <div style="font-size:11px;margin-top:4px;">${violations.slice(0,6).map(v=>`${esc(cmdRefName(v.rk))} ${v.t} : ${esc(v.msg)}`).join('<br>')}</div>
    </div>` : ''}

    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Avancement</h3></div>
    <div class="card">
      ${parcours.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;${p.etape!=='expedition'?'border-bottom:1px solid var(--border-soft);':''}">
          <div style="width:10px;height:10px;border-radius:50%;background:${p.etat==='vide'?'#E5E7EB':p.color};flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;"><b style="font-size:12.5px;">${p.titre}</b><span style="font-size:11.5px;color:var(--ink-soft);">${p.fait} / ${p.recu}${p.rebut?` <span style="color:var(--bad);">(+${p.rebut} rebut)</span>`:''}</span></div>
            <div style="height:6px;border-radius:4px;background:var(--surface-2);margin-top:4px;overflow:hidden;"><div style="height:100%;width:${p.recu?Math.min(100,Math.round((p.fait+p.rebut)/p.recu*100)):0}%;background:${p.color};"></div></div>
          </div>
        </div>`).join('')}
    </div>

    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Références commandées</h3></div>
    <div class="card">
      ${Object.entries(cmd.lignes||{}).map(([rk,l]) => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border-soft);">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:12.5px;">${esc(cmdRefName(rk))}</b><b style="font-size:12.5px;">${cmdLigneTotal(l)}</b></div>
          <div style="font-size:10.5px;color:var(--ink-soft);">${CMD_TAILLES.filter(t=>l.tailles[t]).map(t=>`${t} ${l.tailles[t]}`).join(' · ')}</div>
        </div>`).join('')}
    </div>
    ${cmdEnGadh() && cloturee ? '' : `<div class="card" style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-ghost" style="flex:1;padding:8px 4px;font-size:12px;" onclick="cmdExporterPdf(['${id}'])">📄 Rapport PDF</button>
      <button class="btn btn-ghost" style="flex:1;padding:8px 4px;font-size:12px;" onclick="cmdExporterExcel(['${id}'])">📊 Rapport Excel</button>
    </div>`}

    ${canEdit ? `<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
      ${!cloturee ? `<button class="btn btn-primary" style="flex:1;min-width:140px;" onclick="cmdOuvrirSaisie('${id}')">Saisir la production</button>` : ''}
      ${!cloturee && s.restes.aEmballer + s.restes.pretAExpedier + s.restes.expedie > 0 ? `<button class="btn btn-primary" style="flex:1;min-width:140px;background:var(--good);" onclick="cmdOuvrirExpedition('${id}')">Enregistrer une expédition</button>` : ''}
      ${!cloturee && cmdPeutArchiver() ? `<button class="btn btn-warning" style="flex:1;min-width:140px;" onclick="cmdCloturerCommande('${id}')">Valider et archiver</button>` : ''}
    </div>` : ''}

    ${expeditions.length ? `
    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Expéditions</h3></div>
    <div class="card">
      ${expeditions.map(e => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">
          <b>${(e.date||'').split('-').reverse().join('/')} ${e.heure||''}</b> — ${e.quantite} pièce(s)
          ${e.cartons?` · ${esc(e.cartons)} carton(s)`:''}${e.transporteur?` · ${esc(e.transporteur)}`:''}${e.bl?` · BL ${esc(e.bl)}`:''}
          ${e.observation?`<div style="color:var(--ink-soft);">${esc(e.observation)}</div>`:''}
          ${cmdDocsExpDispo(id, e) ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
            <button class="btn btn-ghost" style="flex:1;min-width:80px;padding:6px 4px;font-size:11px;" onclick="cmdImprimerDocExp('${id}', ${e.ts}, 'cartons')">📦 Cartons</button>
            <button class="btn btn-ghost" style="flex:1;min-width:80px;padding:6px 4px;font-size:11px;" onclick="cmdImprimerDocExp('${id}', ${e.ts}, 'colisage')">📋 Colisage</button>
            <button class="btn btn-ghost" style="flex:1;min-width:80px;padding:6px 4px;font-size:11px;" onclick="cmdImprimerDocExp('${id}', ${e.ts}, 'total')">🧾 Liste total</button>
          </div>` : ''}
        </div>`).join('')}
      ${expeditions.some(e => cmdDocsExpDispo(id, e)) ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--ink-soft);">Étiquettes cartons par page :
        <select onchange="cmdSetEtqParPage(this.value)" style="padding:4px 6px;font-size:11px;width:auto;">${[1,2,4].map(n => `<option value="${n}" ${cmdEtqParPage===n?'selected':''}>${n}</option>`).join('')}</select></div>` : ''}
    </div>` : ''}

    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Historique</h3></div>
    <div class="card">
      ${histo.length===0 ? `<div style="font-size:12px;color:var(--ink-faint);">Aucun événement enregistré.</div>` :
        histo.map(h => `<div style="padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;"><b>${cmdDateHeureFR(h.ts)}</b> — ${esc(h.msg)}${h.user?` <span style="color:var(--ink-faint);">(${esc(h.user)})</span>`:''}</div>`).join('')}
    </div>

    ${canEdit && cmdPeutArchiver() ? `<div class="card" style="margin-top:10px;text-align:center;">
      <button class="btn btn-ghost" style="color:var(--bad);font-size:11.5px;padding:8px 10px;" onclick="cmdSupprimerDefinitivement('${id}')">🗑 Supprimer définitivement cette commande</button>
    </div>` : ''}
    <div id="cmd-form-zone"></div>
  `;
}

// ============================================================
// FORMULAIRE COMMANDE (création / modification) — rendu dans #cmd-form-zone
// ============================================================
function renderCmdForm(){
  const zone = document.getElementById('cmd-form-zone');
  if(!zone || !cmdForm) return;
  const f = cmdForm;
  const refs = cmdRefsAllowedFor(f.destination);
  zone.innerHTML = `
    <div class="card" style="background:var(--surface-2);">
      <h3 style="margin:0 0 8px;font-size:14px;">${f.editId?'Modifier la commande':'Nouvelle commande'}</h3>
      <div class="field"><label>Destination</label><div style="display:flex;gap:8px;">
        ${CMD_DESTINATIONS.map(d => `<button class="btn ${f.destination===d?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px;" onclick="cmdFormSetDestination('${d}')">${d}</button>`).join('')}
      </div></div>
      ${f.destination==='ALLOGA' ? `<p style="font-size:10.5px;color:var(--warn);margin:4px 0 8px;">ALLOGA : seules PHARMA-HOMME / Noir (tailles S à XXXL) et PHARMA-FEMME CV / Noir (tailles XS à XXL) sont autorisées.</p>` : ''}
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1.4;"><label>Lot / N° commande PERCKO</label><input value="${esc(f.lot)}" oninput="cmdFormSet('lot',this.value)" placeholder="Ex : PK202610-1"></div>
        <div class="field" style="flex:1;"><label>Année</label><input type="number" inputmode="numeric" value="${f.annee}" oninput="cmdFormSet('annee',this.value)"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Mois</label><input type="month" value="${f.mois}" onchange="cmdFormSet('mois',this.value)"></div>
        <div class="field" style="flex:1;"><label>Date de réception</label><input type="date" value="${f.dateReception}" max="${getTodayISO()}" onchange="cmdFormSet('dateReception',this.value)"></div>
      </div>
      <div class="field"><label>Client</label><input value="${esc(f.client)}" oninput="cmdFormSet('client',this.value)"></div>
      <div class="field"><label>Références</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${refs.map(([k,r]) => `<button class="btn ${f.refs.includes(k)?'btn-primary':'btn-ghost'}" style="padding:6px 9px;font-size:11px;" onclick="toggleCmdFormRef('${k}')">${esc(r.famille)} / ${esc(r.variante)}</button>`).join('')}
        </div>
      </div>
      ${f.refs.map(rk => `
        <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;">
          <b style="font-size:12px;">${esc(cmdRefName(rk))}</b>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
            ${cmdTaillesAllowedFor(f.destination, rk).map(t => `<div><label style="font-size:9.5px;color:var(--ink-faint);">${t}</label><input type="number" inputmode="numeric" min="0" value="${(f.qty[rk]&&f.qty[rk][t])||''}" oninput="cmdFormQty('${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`).join('')}
          </div>
        </div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" onclick="cmdFormEnregistrer()">Enregistrer</button>
        <button class="btn btn-ghost" onclick="cmdFormAnnuler()">Annuler</button>
      </div>
    </div>
  `;
  zone.scrollIntoView({behavior:'smooth', block:'start'});
}

// ============================================================
// ÉCRAN D'EXPÉDITION (quantité / cartons / transporteur / BL / observation)
// ============================================================
function renderCmdExpeditionForm(container, canEdit){
  if(!canEdit || !cmdExpForm){ container.innerHTML = `<div class="card">${buildEmptyState('Aucune expédition en cours', '')}</div>`; return; }
  const f = cmdExpForm;
  const cmd = getCmdCommandes()[f.cmdId];
  if(!cmd){ container.innerHTML = `<div class="card">${buildEmptyState('Commande introuvable','')}</div>`; return; }
  const cum = cmdCumuls(f.cmdId);
  container.innerHTML = `
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:14px;">Expédition — ${esc(cmd.numero)}</h3>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Date</label><input type="date" value="${f.date}" max="${getTodayISO()}" onchange="cmdExpSet('date',this.value)"></div>
        <div class="field" style="flex:1;"><label>Heure</label><input type="time" value="${f.heure}" onchange="cmdExpSet('heure',this.value)"></div>
      </div>
      <div style="display:flex;gap:8px;">
        ${CMD_COLISAGE[cmd.destination] ? `<div class="field" style="flex:1;"><label>Nombre de cartons</label>
          <div style="padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-weight:800;"><span id="exp-cartons-auto">${cmdRepartirCartons(cmd.destination, cmdExpLignesForm(f)).length}</span></div>
          <div style="font-size:9.5px;color:var(--ink-faint);margin-top:2px;">Calculé : ${CMD_COLISAGE[cmd.destination].parCarton} pcs max, une seule taille par carton</div></div>`
        : `<div class="field" style="flex:1;"><label>Nombre de cartons</label><input type="number" inputmode="numeric" min="0" value="${esc(f.cartons)}" oninput="cmdExpSet('cartons',this.value)"></div>`}
        <div class="field" style="flex:1;"><label>Transporteur</label><input value="${esc(f.transporteur)}" oninput="cmdExpSet('transporteur',this.value)"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Poids net (kg)</label><input type="number" inputmode="decimal" min="0" step="0.1" value="${esc(f.poidsNet)}" oninput="cmdExpSet('poidsNet',this.value)"></div>
        ${CMD_COLISAGE[cmd.destination] ? `<div class="field" style="flex:1;"><label>Poids brut (kg)</label>
          <div style="padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);font-weight:800;"><span id="exp-poids-auto">${cmdPoidsBrutTotal(cmdRepartirCartons(cmd.destination, cmdExpLignesForm(f)))}</span></div>
          <div style="font-size:9.5px;color:var(--ink-faint);margin-top:2px;">Calculé : ${CMD_COLISAGE[cmd.destination].poidsCartonPlein} kg le carton plein, au prorata sinon</div></div>`
        : `<div class="field" style="flex:1;"><label>Poids brut (kg)</label><input type="number" inputmode="decimal" min="0" step="0.1" value="${esc(f.poidsBrut)}" oninput="cmdExpSet('poidsBrut',this.value)"></div>`}
      </div>
      <div class="field"><label>N° Bon de Livraison (BL)</label><input value="${esc(f.bl)}" oninput="cmdExpSet('bl',this.value)"></div>
      <div class="field"><label>Observation</label><input value="${esc(f.observation)}" oninput="cmdExpSet('observation',this.value)"></div>
      <button class="btn btn-ghost" style="width:100%;margin:4px 0 8px;" onclick="cmdExpToutDispo()">Remplir avec tout le disponible</button>
      ${Object.entries(cmd.lignes||{}).map(([rk,l]) => {
        const dispoParTaille = CMD_TAILLES.filter(t=>l.tailles[t]).map(t => ({t, dispo: Math.max(0, cmdDisponible('expedition', cmdCell(cum,rk,t)))}));
        if(!dispoParTaille.some(x=>x.dispo>0 || (f.qty[rk]&&f.qty[rk][x.t]))) return '';
        return `
        <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;">
          <b style="font-size:12px;">${esc(cmdRefName(rk))}</b>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
            ${dispoParTaille.map(x => `<div><label style="font-size:9.5px;color:var(--ink-faint);">${x.t} (dispo ${x.dispo})</label><input type="number" inputmode="numeric" min="0" max="${x.dispo}" value="${(f.qty[rk]&&f.qty[rk][x.t])||''}" oninput="cmdExpQty('${rk}','${x.t}',this.value)" style="padding:6px;font-size:12px;"></div>`).join('')}
          </div>
        </div>`;
      }).join('')}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" onclick="cmdExpEnregistrer()">Enregistrer l'expédition</button>
        <button class="btn btn-ghost" onclick="cmdExpFermer()">Annuler</button>
      </div>
    </div>
  `;
}

// ============================================================
// SAISIE QUOTIDIENNE DE PRODUCTION (par étape, avec rebut)
// ============================================================
let cmdSaisie = null; // {cmdId, date, etape, vals:{}, rebut:{}}
function cmdCommandesSaisissables(){ return listCmdCommandes().filter(([id]) => !cmdEstCloturee(id)); }
// Restriction GADH (règle confirmée par l'utilisateur, même logique que cmdPeutArchiver
// ci-dessus) : le Retour GADH ne peut être saisi QUE depuis le module GADH, et c'est la
// SEULE étape saisissable depuis ce contexte — les autres étapes (Coupe, Confection,
// Contrôle, Emballage, Expédition) se saisissent depuis le module Gestion des Commandes.
function cmdEnGadh(){ return typeof activeModule !== 'undefined' && activeModule === 'gadh'; }
function cmdEtapesAutorisees(){ return cmdEnGadh() ? ['retour'] : CMD_ETAPES.filter(e => e !== 'retour'); }
function cmdInitSaisie(cmdId, date, etape){
  const autorisees = cmdEtapesAutorisees();
  cmdSaisie = {cmdId: cmdId||null, date: date || getTodayISO(), etape: 'coupe', vals:{}, rebut:{}};
  if(!cmdSaisie.cmdId){
    const dispo = cmdCommandesSaisissables();
    if(dispo.length===1) cmdSaisie.cmdId = dispo[0][0];
  }
  // Par défaut, on ouvre directement sur l'étape « en cours » de la commande
  // (première étape avec des pièces en attente) plutôt que de toujours revenir
  // à la Coupe — c'est ce qui permet, en ouvrant une commande, de voir tout de
  // suite son statut réel et de valider vers l'étape suivante.
  cmdSaisie.etape = (etape && autorisees.includes(etape)) ? etape
    : (cmdSaisie.cmdId && cmdEtapeCourante(cmdSaisie.cmdId)) || autorisees[0];
  cmdChargerJourSaisie();
}
function cmdChargerJourSaisie(){
  cmdSaisie.vals = {}; cmdSaisie.rebut = {};
  if(!cmdSaisie.cmdId) return;
  const jour = getCmdSaisies(cmdSaisie.cmdId)[cmdSaisie.date] || {};
  const copie = (src) => { const o = {}; Object.entries(src||{}).forEach(([rk,ts]) => { o[rk] = {...ts}; }); return o; };
  cmdSaisie.vals = copie(jour[cmdSaisie.etape]);
  cmdSaisie.rebut = copie(jour[cmdRebutKey(cmdSaisie.etape)]);
  // Pré-remplissage automatique, pour TOUTES les étapes : la quantité qui peut
  // passer à cette étape est déjà calculée par l'application (marge de coupe à la
  // Coupe, quantité disponible/« dispo » venant de l'étape précédente pour les
  // suivantes) — il n'y a donc plus qu'à vérifier, rectifier si besoin, et valider,
  // au lieu de retaper les quantités à la main. On n'écrase JAMAIS une quantité
  // déjà enregistrée ce jour-là pour cette étape (dejaEnregistre ci-dessous).
  const cmd = getCmdCommandes()[cmdSaisie.cmdId];
  if(cmd){
    const cum = cmdCumulsFrom(cmd, getCmdSaisies(cmdSaisie.cmdId));
    Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => {
      const dejaEnregistre = jour[cmdSaisie.etape] && jour[cmdSaisie.etape][rk] && jour[cmdSaisie.etape][rk][t] !== undefined;
      if(dejaEnregistre) return;
      const c = cmdCell(cum, rk, t);
      let suggestion;
      if(cmdSaisie.etape === 'coupe'){
        const qteCmd = cmdCmdQty(cmd, rk, t);
        if(qteCmd<=0) return;
        const cible = qteCmd + cmdMargeCoupe(rk, qteCmd);
        suggestion = Math.max(0, cible - c.coupe);
      } else {
        suggestion = Math.max(0, cmdDisponible(cmdSaisie.etape, c));
      }
      if(suggestion>0){ if(!cmdSaisie.vals[rk]) cmdSaisie.vals[rk] = {}; cmdSaisie.vals[rk][t] = suggestion; }
    }));
  }
}
window.cmdOuvrirSaisie = (cmdId, date, etape) => { cmdInitSaisie(cmdId||null, date||getTodayISO(), etape||null); cmdGo('saisie'); };
window.cmdSjDate = (d) => { cmdSaisie.date = d || getTodayISO(); cmdChargerJourSaisie(); cmdRerender(); };
window.cmdSjEtape = (e) => { if(!cmdEtapesAutorisees().includes(e)) return; cmdSaisie.etape = e; cmdChargerJourSaisie(); cmdRerender(); };
window.cmdSjCommande = (id) => {
  cmdSaisie.cmdId = id || null;
  if(cmdSaisie.cmdId) cmdSaisie.etape = cmdEtapeCourante(cmdSaisie.cmdId) || cmdEtapesAutorisees()[0];
  cmdChargerJourSaisie();
  cmdRerender();
};
window.cmdSjSet = (quoi, rk, t, v) => {
  const cible = quoi==='rebut' ? cmdSaisie.rebut : cmdSaisie.vals;
  if(!cible[rk]) cible[rk] = {};
  cible[rk][t] = v;
  cmdSaisieRafraichir();
};
function cmdSaisieNouvelles(){
  const saisies = getCmdSaisies(cmdSaisie.cmdId);
  const jour = {...(saisies[cmdSaisie.date] || {})};
  const nettoie = (src) => {
    const o = {};
    Object.entries(src).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
      const q = parseInt(v); if(q>0){ if(!o[rk]) o[rk] = {}; o[rk][t] = q; }
    }));
    return Object.keys(o).length ? o : null;
  };
  const v = nettoie(cmdSaisie.vals);
  if(v) jour[cmdSaisie.etape] = v; else delete jour[cmdSaisie.etape];
  const kRb = cmdRebutKey(cmdSaisie.etape), rb = nettoie(cmdSaisie.rebut);
  if(rb) jour[kRb] = rb; else delete jour[kRb];
  if(Object.keys(jour).length) saisies[cmdSaisie.date] = jour; else delete saisies[cmdSaisie.date];
  return saisies;
}
function cmdSaisieVerifier(){
  const res = {erreurs:[], cases:new Set(), totalJour:0, rebutJour:0};
  if(!cmdSaisie || !cmdSaisie.cmdId) return res;
  const cmd = getCmdCommandes()[cmdSaisie.cmdId];
  const check = (src, label) => Object.entries(src).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,v]) => {
    if(v==='' || v==null) return;
    const q = parseInt(v);
    if(isNaN(q) || q<0){ res.erreurs.push(`${cmdRefName(rk)} ${t} : ${label} invalide`); res.cases.add(rk+'|'+t); }
    else if(label==='rebut') res.rebutJour += q; else res.totalJour += q;
  }));
  check(cmdSaisie.vals, 'quantité');
  check(cmdSaisie.rebut, 'rebut');
  const avant = new Set(cmdViolations(cmdCumulsFrom(cmd, getCmdSaisies(cmdSaisie.cmdId))).map(cmdViolationKey));
  cmdViolations(cmdCumulsFrom(cmd, cmdSaisieNouvelles())).filter(v => !avant.has(cmdViolationKey(v))).forEach(v => {
    res.erreurs.push(`${cmdRefName(v.rk)} ${v.t} : ${v.msg}`);
    res.cases.add(v.rk+'|'+v.t);
  });
  return res;
}
function cmdSaisieRafraichir(){
  const chk = cmdSaisieVerifier();
  document.querySelectorAll('#cmd-saisie-zone input.sj').forEach(inp => {
    const bad = chk.cases.has(inp.dataset.rk+'|'+inp.dataset.t);
    inp.style.borderColor = bad ? 'var(--bad)' : 'var(--border)';
    inp.style.background = bad ? '#FEF2F2' : '';
  });
  const tot = document.getElementById('sj-total');
  if(tot) tot.textContent = `${chk.totalJour} pcs ce jour${chk.rebutJour ? ' + '+chk.rebutJour+' rebut' : ''}`;
  const err = document.getElementById('sj-erreurs');
  if(err) err.innerHTML = chk.erreurs.slice(0,4).map(e => `<div>• ${esc(e)}</div>`).join('') + (chk.erreurs.length>4 ? `<div>… et ${chk.erreurs.length-4} autre(s)</div>` : '');
  return chk;
}
window.cmdSjEnregistrer = () => {
  const chk = cmdSaisieRafraichir();
  if(chk.erreurs.length){ showToast('Corrigez les cases en rouge : ' + chk.erreurs[0]); return; }
  if(chk.totalJour===0 && chk.rebutJour===0){ showToast('Saisissez au moins une quantité'); return; }
  saveCmdSaisies(cmdSaisie.cmdId, cmdSaisieNouvelles());
  const cmd = getCmdCommandes()[cmdSaisie.cmdId];
  cmdLog(cmdSaisie.cmdId, `${CMD_ETAPE_INFO[cmdSaisie.etape].label} du ${cmdSaisie.date.split('-').reverse().join('/')} : ${chk.totalJour} pièce(s)${chk.rebutJour?` + ${chk.rebutJour} rebut`:''}`);
  showToast(`${cmd.numero} · ${CMD_ETAPE_INFO[cmdSaisie.etape].label} enregistré : ${chk.totalJour} pcs`);
  const cmdId = cmdSaisie.cmdId;
  cmdSaisie = null;
  cmdGo('fiche', cmdId);
};
window.cmdSjFermer = () => {
  const cmdId = cmdSaisie && cmdSaisie.cmdId;
  cmdSaisie = null;
  if(cmdId) cmdGo('fiche', cmdId); else cmdGo('list');
};
function renderCmdSaisie(container, canEdit){
  if(!canEdit){ container.innerHTML = `<div class="card">${buildEmptyState('Lecture seule', "Votre rôle ne permet pas de saisir.")}</div>`; return; }
  if(!cmdSaisie) cmdInitSaisie(cmdNav.id||null, getTodayISO(), null);
  const autorisees = cmdEtapesAutorisees();
  if(!autorisees.includes(cmdSaisie.etape)){ cmdSaisie.etape = autorisees[0]; cmdChargerJourSaisie(); }
  const dispo = cmdCommandesSaisissables();
  const cmd = cmdSaisie.cmdId ? getCmdCommandes()[cmdSaisie.cmdId] : null;
  container.innerHTML = `
    <div id="cmd-saisie-zone" class="card">
      <h3 style="margin:0 0 8px;font-size:14px;">Saisie de production</h3>
      <div class="field"><label>Commande</label>
        <select onchange="cmdSjCommande(this.value)">
          <option value="">— Choisir —</option>
          ${dispo.map(([id,c]) => `<option value="${id}" ${cmdSaisie.cmdId===id?'selected':''}>${esc(c.numero)}</option>`).join('')}
        </select>
      </div>
      ${!cmd ? `<div style="font-size:12px;color:var(--ink-faint);">Choisissez une commande pour saisir sa production.</div>` : `
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Date</label><input type="date" value="${cmdSaisie.date}" max="${getTodayISO()}" onchange="cmdSjDate(this.value)"></div>
      </div>
      <div class="field"><label>Étape</label>
        ${cmdEnGadh() ? `<div style="font-size:11.5px;color:var(--ink-soft);">Retour GADH — seule saisie autorisée depuis ce module.</div>` : `
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${autorisees.map(e => `<button class="btn ${cmdSaisie.etape===e?'btn-primary':'btn-ghost'}" style="padding:6px 9px;font-size:11px;" onclick="cmdSjEtape('${e}')">${CMD_ETAPE_INFO[e].label}</button>`).join('')}
        </div>`}
      </div>
      ${Object.entries(cmd.lignes||{}).map(([rk,l]) => {
        const cum = cmdCumulsFrom(cmd, getCmdSaisies(cmdSaisie.cmdId));
        // Cas particulier du Retour GADH : une taille déjà entièrement retournée
        // (rien de disponible chez la GADH) ne doit plus être proposée à la saisie ;
        // une taille partiellement retournée affiche le reste par rapport à la
        // quantité reçue de Tek-Trend (coupe) ; et on affiche toujours, pour la
        // référence entière, le cumul « retourné (assemblé) / reçu de Tek-Trend ».
        const estRetour = cmdSaisie.etape === 'retour';
        let taillesAffichees = CMD_TAILLES.filter(t=>l.tailles[t]);
        let recuTotal = 0, faitTotal = 0;
        if(estRetour){
          taillesAffichees.forEach(t => { const c = cmdCell(cum, rk, t); recuTotal += c.coupe; faitTotal += c.retour; });
          taillesAffichees = taillesAffichees.filter(t => Math.max(0, cmdDisponible('retour', cmdCell(cum, rk, t))) > 0);
        }
        if(estRetour && taillesAffichees.length===0){
          return `
          <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);">
            <b style="font-size:12px;">${esc(cmdRefName(rk))}</b>
            <div style="font-size:11px;color:var(--good);margin-top:4px;">✓ Entièrement retourné — ${faitTotal} / ${recuTotal} reçu(s) de Tek-Trend</div>
          </div>`;
        }
        return `
        <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;">
          <b style="font-size:12px;">${esc(cmdRefName(rk))}</b>
          ${estRetour ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">Retourné (assemblé) : <b>${faitTotal}</b> / ${recuTotal} reçu(s) de Tek-Trend</div>` : ''}
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
            ${taillesAffichees.map(t => {
              const c = cmdCell(cum, rk, t);
              // Le champ est déjà pré-rempli automatiquement (cmdChargerJourSaisie) avec la
              // bonne quantité à faire passer à cette étape : plus besoin d'afficher le
              // « dispo » à côté, il suffit de vérifier/rectifier la valeur proposée.
              let labelTaille;
              if(cmdSaisie.etape==='coupe'){
                const marge = cmdMargeCoupe(rk, l.tailles[t]);
                labelTaille = `${t} (cible ${l.tailles[t]+marge} = ${l.tailles[t]}+${marge})`;
              } else if(estRetour){
                const dispo = Math.max(0, cmdDisponible('retour', c));
                labelTaille = `${t} (reste ${dispo} / ${c.coupe} reçus)`;
              } else {
                labelTaille = t;
              }
              return `<div><label style="font-size:9.5px;color:var(--ink-faint);">${labelTaille}</label><input class="sj" data-quoi="vals" data-rk="${rk}" data-t="${t}" type="number" inputmode="numeric" min="0" value="${(cmdSaisie.vals[rk]&&cmdSaisie.vals[rk][t])||''}" oninput="cmdSjSet('vals','${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`;
            }).join('')}
          </div>
          <details style="margin-top:6px;"><summary style="font-size:10.5px;color:var(--warn);cursor:pointer;">Rebut à cette étape</summary>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
              ${taillesAffichees.map(t => `<div><label style="font-size:9.5px;color:var(--ink-faint);">${t}</label><input class="sj" data-quoi="rebut" data-rk="${rk}" data-t="${t}" type="number" inputmode="numeric" min="0" value="${(cmdSaisie.rebut[rk]&&cmdSaisie.rebut[rk][t])||''}" oninput="cmdSjSet('rebut','${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`).join('')}
            </div>
          </details>
        </div>`;
      }).join('')}
      <div id="sj-erreurs" style="color:var(--bad);font-size:11px;margin-top:8px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <span id="sj-total" style="font-size:12px;font-weight:700;">0 pcs ce jour</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="cmdSjEnregistrer()">Enregistrer</button>
        <button class="btn btn-ghost" onclick="cmdSjFermer()">Fermer</button>
      </div>
      `}
    </div>
  `;
  if(cmd) cmdSaisieRafraichir();
}

// ============================================================
// RAPPORTS PDF / EXCEL (toutes, en cours, archivées ou sélection)
// ============================================================
// Deux niveaux : une Synthèse (une ligne par commande) et le Détail (une ligne
// par commande × référence × taille), avec toutes les quantités du parcours.
// Fonctionne hors connexion et sans bibliothèque : réutilise le générateur XLSX
// (prodZip / prodStyles) et le principe d'impression PDF du module Chaîne.
// Les chiffres sont EXACTEMENT ceux de l'application (mêmes fonctions de calcul).
const CMD_RAPPORT_COLS = [
  {k:'commande',   titre:'Qté commandée'},
  {k:'cible',      titre:'Cible coupe (+ marge)'},
  {k:'coupe',      titre:'Coupées / envoyées GADH'},
  {k:'retour',     titre:'Assemblées / retournées Tek-Trend'},
  {k:'confection', titre:'Confectionnées'},
  {k:'controle',   titre:'Contrôlées (conformes)'},
  {k:'emballage',  titre:'Emballées'},
  {k:'expedition', titre:'Expédiées'},
  {k:'rebut',      titre:'Rebut'},
  {k:'reste',      titre:'Reste à expédier'}
];
function cmdRapportDateFR(iso){ return iso ? String(iso).split('-').reverse().join('/') : ''; }
function cmdRapportVals(q, c, rk){
  return {
    commande: q, cible: q>0 ? q + cmdMargeCoupe(rk, q) : 0,
    coupe: c.coupe, retour: c.retour, confection: c.confection, controle: c.controle,
    emballage: c.emballage, expedition: c.expedition,
    rebut: cmdRebutTotal(c), reste: cmdRestes(c, q).resteAExpedier
  };
}
function cmdRapportLibelle(rk){
  const ref = (typeof PROD_EXPORT_REFS!=='undefined') ? PROD_EXPORT_REFS.find(x => x.rk===rk) : null;
  return ref ? ref.libelle : cmdRefName(rk);
}
function cmdRapportOrdreRefs(rks){
  const ordre = (typeof PROD_EXPORT_REFS!=='undefined') ? PROD_EXPORT_REFS.map(x => x.rk) : [];
  const pos = rk => { const i = ordre.indexOf(rk); return i<0 ? 999 : i; };
  return rks.slice().sort((a,b) => pos(a)-pos(b) || cmdRefName(a).localeCompare(cmdRefName(b)));
}
function cmdRapportDonnees(cmdIds){
  const cmds = getCmdCommandes();
  const zero = () => { const o = {}; CMD_RAPPORT_COLS.forEach(c => { o[c.k] = 0; }); return o; };
  const ajoute = (a, b) => CMD_RAPPORT_COLS.forEach(c => { a[c.k] += b[c.k]||0; });
  const commandes = cmdIds.filter(id => cmds[id]).map(id => {
    const cmd = cmds[id], cum = cmdCumuls(id), s = cmdSynthese(id, null, cum);
    const lignes = [], tot = zero();
    cmdRapportOrdreRefs(Object.keys(cmd.lignes||{})).forEach(rk => {
      const l = cmd.lignes[rk];
      CMD_TAILLES.filter(t => l.tailles && l.tailles[t]).forEach(t => {
        const v = cmdRapportVals(parseInt(l.tailles[t])||0, cmdCell(cum, rk, t), rk);
        ajoute(tot, v);
        lignes.push({rk, ref: cmdRefName(rk), libelle: cmdRapportLibelle(rk), t, ...v});
      });
    });
    const statut = cmdStatutAffiche(id, s);
    return {id, cmd, lignes, tot, statut, statutLabel: (CMD_STATUTS[statut]||CMD_STATUTS.A_TRAITER).label, pctExp: s.pctExp};
  }).sort((a,b) => String(a.cmd.dateReception||'').localeCompare(String(b.cmd.dateReception||'')) || String(a.cmd.numero).localeCompare(String(b.cmd.numero)));
  const total = zero();
  commandes.forEach(c => ajoute(total, c.tot));
  return {commandes, total};
}
// Titre / nom de fichier selon ce qui est exporté (toutes, en cours, archivées, une, sélection)
function cmdRapportTitre(cmdIds){
  const toutes = listCmdCommandes().map(([id]) => id);
  const enCours = toutes.filter(id => !cmdEstCloturee(id));
  const archivees = toutes.filter(id => cmdEstCloturee(id));
  const pareil = (a) => a.length===cmdIds.length && a.every(id => cmdIds.includes(id));
  if(cmdIds.length===1){ const c = getCmdCommandes()[cmdIds[0]]; const n = c ? c.numero : ''; return {titre:`Commande ${n}`, fichier:`Commande_${n}`}; }
  if(pareil(toutes)) return {titre:'Toutes les commandes', fichier:'Rapport_toutes_commandes'};
  if(pareil(enCours)) return {titre:'Commandes en cours', fichier:'Rapport_commandes_en_cours'};
  if(pareil(archivees)) return {titre:'Commandes archivées', fichier:'Rapport_commandes_archivees'};
  return {titre:`Sélection de ${cmdIds.length} commandes`, fichier:`Rapport_${cmdIds.length}_commandes`};
}
function cmdRapportNomFichier(cmdIds, ext){
  return `${cmdRapportTitre(cmdIds).fichier}_${getTodayISO()}.${ext}`.replace(/[^\w.\-]+/g,'_');
}
function cmdRapportSousTitre(d){
  return `TEK-TREND · ${d.commandes.length} commande(s) · édité le ${cmdDateHeureFR(Date.now())}${currentUser && currentUser.nom ? ' par '+currentUser.nom : ''}`;
}

// --- Excel : une feuille tableau (titre, sous-titre, en-têtes, lignes, total en formules) ---
function cmdFeuilleTableauXml(opt, styles){
  const L = prodColLettre;
  const nb = opt.entetes.length, derniere = L(nb-1);
  const lignesXml = [];
  const cell = (col, r, val, st, formule) => {
    const ref = L(col) + r, s = styles.get(st);
    if(formule) return `<c r="${ref}" s="${s}"><f>${formule}</f><v>${val}</v></c>`;
    if(val===null || val===undefined || val==='') return `<c r="${ref}" s="${s}"/>`;
    if(typeof val==='number') return `<c r="${ref}" s="${s}"><v>${val}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${prodXmlEsc(val)}</t></is></c>`;
  };
  const bord = {all:'thin'};
  lignesXml.push(`<row r="1" ht="22" customHeight="1">${cell(0,1,opt.titre,{b:1,sz:14,color:'1F3864'})}</row>`);
  lignesXml.push(`<row r="2">${cell(0,2,opt.sousTitre,{sz:9,color:'595959'})}</row>`);
  lignesXml.push(`<row r="4" ht="42" customHeight="1">${opt.entetes.map((e,i) => cell(i,4,e.t,{b:1,sz:10,color:'FFFFFF',fill:'244061',h:'center',wrap:1,border:bord})).join('')}</row>`);
  const debut = 5;
  opt.lignes.forEach((vals, li) => {
    const r = debut + li, fill = opt.fonds ? opt.fonds[li] : null;
    lignesXml.push(`<row r="${r}">${vals.map((v,i) => {
      const e = opt.entetes[i];
      const st = e.num
        ? {sz:10, h:'center', border:bord, fill, b: e.gras?1:0, color: (e.k==='rebut' && v>0) ? 'C00000' : '000000'}
        : {sz:10, border:bord, fill};
      return cell(i, r, v, st);
    }).join('')}</row>`);
  });
  const fin = debut + opt.lignes.length - 1;
  let derniereLigne = Math.max(4, fin);
  if(opt.lignes.length){
    const r = fin + 1;
    derniereLigne = r;
    const stTot = {b:1, sz:10, fill:'D9E1F2', h:'center', border:bord};
    lignesXml.push(`<row r="${r}">${opt.entetes.map((e,i) => {
      if(i===0) return cell(0, r, 'TOTAL', {...stTot, h:'left'});
      if(!e.num || e.sansTotal) return cell(i, r, '', stTot);
      const somme = opt.lignes.reduce((s,vals) => s + (parseFloat(vals[i])||0), 0);
      return cell(i, r, somme, {...stTot, color: (e.k==='rebut' && somme>0) ? 'C00000' : '000000'}, `SUM(${L(i)}${debut}:${L(i)}${fin})`);
    }).join('')}</row>`);
  }
  const filtre = opt.lignes.length ? `<autoFilter ref="A4:${derniere}${fin}"/>` : '';
  return {
    filtre: opt.lignes.length ? `$A$4:$${derniere}$${fin}` : null,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${derniere}${derniereLigne}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${opt.entetes.map((e,i)=>`<col min="${i+1}" max="${i+1}" width="${e.w||12}" customWidth="1"/>`).join('')}</cols><sheetData>${lignesXml.join('')}</sheetData>${filtre}<mergeCells count="2"><mergeCell ref="A1:${derniere}1"/><mergeCell ref="A2:${derniere}2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
  };
}
function cmdRapportXlsxBlob(cmdIds){
  const d = cmdRapportDonnees(cmdIds), info = cmdRapportTitre(cmdIds), sous = cmdRapportSousTitre(d);
  const styles = prodStyles();
  const colsNum = CMD_RAPPORT_COLS.map(c => ({t:c.titre, w:12.5, num:true, k:c.k, gras: c.k==='commande' || c.k==='expedition'}));
  const synthese = cmdFeuilleTableauXml({
    titre: `Rapport des commandes — ${info.titre} — Synthèse`, sousTitre: sous,
    entetes: [{t:'N° commande',w:24},{t:'Lot',w:14},{t:'Destination',w:11},{t:'Client',w:10},{t:'Mois',w:15},{t:'Réception',w:11},{t:'Statut',w:19}, ...colsNum, {t:'% expédié',w:10,num:true,sansTotal:true}],
    lignes: d.commandes.map(c => [c.cmd.numero, c.cmd.lot||'', c.cmd.destination||'', c.cmd.client||'PERCKO', cmdMoisLabel(c.cmd.mois), cmdRapportDateFR(c.cmd.dateReception), c.statutLabel, ...CMD_RAPPORT_COLS.map(k => c.tot[k.k]), c.pctExp])
  }, styles);
  const lignesDetail = [], fonds = [];
  d.commandes.forEach((c, ci) => c.lignes.forEach(l => {
    lignesDetail.push([c.cmd.numero, c.cmd.destination||'', c.statutLabel, l.ref, l.libelle, l.t, ...CMD_RAPPORT_COLS.map(k => l[k.k])]);
    fonds.push(ci%2 ? 'F2F2F2' : null);
  }));
  const detail = cmdFeuilleTableauXml({
    titre: `Rapport des commandes — ${info.titre} — Détail par référence et taille`, sousTitre: sous,
    entetes: [{t:'N° commande',w:24},{t:'Destination',w:11},{t:'Statut',w:19},{t:'Référence',w:24},{t:'Libellé',w:34},{t:'Taille',w:7}, ...colsNum],
    lignes: lignesDetail, fonds
  }, styles);
  const feuilles = [{nom:'Synthèse', f:synthese}, {nom:'Détail', f:detail}];
  const noms = feuilles.map(x => x.nom);
  const defNoms = feuilles.map((x,i) => x.f.filtre ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x.nom}'!${x.f.filtre}</definedName>` : '').join('');
  const fichiers = [
    {nom:'[Content_Types].xml', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((f,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {nom:'_rels/.rels', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {nom:'xl/workbook.xml', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms.map((n,i)=>`<sheet name="${prodXmlEsc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${defNoms ? `<definedNames>${defNoms}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`},
    {nom:'xl/_rels/workbook.xml.rels', texte:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${noms.map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${noms.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`}
  ];
  feuilles.forEach((x,i) => fichiers.push({nom:`xl/worksheets/sheet${i+1}.xml`, texte:x.f.xml}));
  fichiers.push({nom:'xl/styles.xml', texte: styles.xml()});
  return prodZip(fichiers);
}
// Depuis le module GADH, les rapports ne portent QUE sur les commandes en cours
// (jamais les archivées), quelle que soit la façon dont l'export est lancé.
function cmdRapportIdsAutorises(cmdIds){
  const ids = (cmdIds||[]).filter(id => getCmdCommandes()[id]);
  return cmdEnGadh() ? ids.filter(id => !cmdEstCloturee(id)) : ids;
}
function cmdRapportListe(){
  const toutes = listCmdCommandes();
  return cmdEnGadh() ? toutes.filter(([id]) => !cmdEstCloturee(id)) : toutes;
}
function cmdRapportPret(cmdIds){
  if(!cmdIds || !cmdIds.length){ showToast(cmdEnGadh() ? 'Aucune commande en cours à exporter' : 'Sélectionnez au moins une commande'); return false; }
  if(typeof prodZip!=='function' || typeof prodStyles!=='function'){ showToast("Export indisponible (module Chaîne non chargé)"); return false; }
  return true;
}
window.cmdExporterExcel = (cmdIds) => {
  cmdIds = cmdRapportIdsAutorises(cmdIds);
  if(!cmdRapportPret(cmdIds)) return;
  try{
    const blob = cmdRapportXlsxBlob(cmdIds);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = cmdRapportNomFichier(cmdIds, 'xlsx');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(`Fichier Excel créé : ${a.download}`);
  } catch(e){ console.error(e); showToast("Échec de l'export Excel"); }
};

// --- PDF : page d'impression (Imprimer → Enregistrer au format PDF), A4 paysage ---
function cmdRapportHtml(cmdIds){
  const d = cmdRapportDonnees(cmdIds), info = cmdRapportTitre(cmdIds);
  const cols = CMD_RAPPORT_COLS;
  const nums = (o) => cols.map(c => `<td class="${c.k==='rebut'&&o[c.k]?'rr':''}${c.k==='commande'||c.k==='expedition'?' rg':''}">${o[c.k]||0}</td>`).join('');
  const thNums = cols.map(c => `<th>${c.titre}</th>`).join('');
  const synthese = d.commandes.length>1 ? `
    <h3>Synthèse par commande</h3>
    <table class="rtab">
      <colgroup><col style="width:12%"><col style="width:6%"><col style="width:7%"><col style="width:10%">${cols.map(()=>'<col style="width:6%">').join('')}<col style="width:5%"></colgroup>
      <thead><tr><th>N° commande</th><th>Dest.</th><th>Réception</th><th>Statut</th>${thNums}<th>% exp.</th></tr></thead>
      <tbody>${d.commandes.map(c => `<tr><td class="rl"><b>${esc(c.cmd.numero)}</b></td><td>${esc(c.cmd.destination||'')}</td><td>${cmdRapportDateFR(c.cmd.dateReception)}</td><td class="rl">${esc(c.statutLabel)}</td>${nums(c.tot)}<td>${c.pctExp}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="rl" colspan="4">TOTAL</td>${nums(d.total)}<td></td></tr></tfoot>
    </table>` : '';
  const detail = d.commandes.map(c => `
    <div class="rbloc">
      <div class="rbloc-t"><b>${esc(c.cmd.numero)}</b> · ${esc(c.cmd.destination||'')} · ${esc(c.cmd.client||'PERCKO')} · ${cmdMoisLabel(c.cmd.mois)} · réception ${cmdRapportDateFR(c.cmd.dateReception)} · <b>${esc(c.statutLabel)}</b> · ${c.pctExp}% expédié</div>
      <table class="rtab">
        <colgroup><col style="width:18%"><col style="width:5%">${cols.map(()=>'<col style="width:7.7%">').join('')}</colgroup>
        <thead><tr><th>Référence</th><th>Taille</th>${thNums}</tr></thead>
        <tbody>${c.lignes.map(l => `<tr><td class="rl">${esc(l.ref)}</td><td>${l.t}</td>${nums(l)}</tr>`).join('')}</tbody>
        <tfoot><tr><td class="rl" colspan="2">Total ${esc(c.cmd.numero)}</td>${nums(c.tot)}</tr></tfoot>
      </table>
    </div>`).join('');
  return `
    <div class="rtitre">Rapport des commandes — ${esc(info.titre)}</div>
    <div class="rsous">${esc(cmdRapportSousTitre(d))}</div>
    ${synthese}
    <h3>Détail par référence et taille</h3>
    ${detail || '<p>Aucune commande.</p>'}`;
}
window.cmdExporterPdf = (cmdIds) => {
  cmdIds = cmdRapportIdsAutorises(cmdIds);
  if(!cmdIds.length){ showToast(cmdEnGadh() ? 'Aucune commande en cours à exporter' : 'Sélectionnez au moins une commande'); return; }
  let zone = document.getElementById('cmd-print-zone');
  if(zone) zone.remove();
  zone = document.createElement('div');
  zone.id = 'cmd-print-zone';
  zone.innerHTML = `<style>
    @page { size: A4 landscape; margin: 9mm; }
    #cmd-print-zone { display:none; font-family: Arial, Helvetica, sans-serif; color:#000; }
    @media print {
      body > *:not(#cmd-print-zone) { display:none !important; }
      html, body { background:#fff !important; padding:0 !important; margin:0 !important; }
      #cmd-print-zone { display:block; }
    }
    #cmd-print-zone * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing:border-box; text-transform:none !important; letter-spacing:0 !important; }
    #cmd-print-zone .rtitre { font-size:14pt; font-weight:bold; color:#1F3864; border-bottom:2px solid #1F3864; padding-bottom:3px; }
    #cmd-print-zone .rsous { font-size:8pt; color:#555; margin:3px 0 8px; }
    #cmd-print-zone h3 { font-size:10.5pt; margin:10px 0 4px; color:#1F3864; }
    #cmd-print-zone table { border-collapse:collapse; width:100%; table-layout:fixed; }
    #cmd-print-zone thead { display:table-header-group; }
    #cmd-print-zone tr { break-inside:avoid; page-break-inside:avoid; }
    #cmd-print-zone .rtab th { background:#244061 !important; color:#fff !important; font-weight:bold; border:1px solid #000; padding:3px 2px; font-size:7pt; text-align:center; vertical-align:middle; line-height:1.15; overflow-wrap:anywhere; }
    #cmd-print-zone .rtab td { border:1px solid #000; text-align:center; padding:2px 3px; font-size:8pt; line-height:1.2; color:#000; }
    #cmd-print-zone .rtab .rl { text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #cmd-print-zone .rtab .rg { font-weight:bold; }
    #cmd-print-zone .rtab .rr { color:#C00000; font-weight:bold; }
    #cmd-print-zone .rtab tfoot td { background:#D9E1F2; font-weight:bold; }
    #cmd-print-zone .rbloc { margin-bottom:9px; }
    #cmd-print-zone .rbloc-t { font-size:8.5pt; background:#EEF2F8; border:1px solid #000; border-bottom:none; padding:3px 5px; break-after:avoid; page-break-after:avoid; }
  </style>` + cmdRapportHtml(cmdIds);
  document.body.appendChild(zone);
  // Le titre de la page sert de nom au fichier PDF enregistré.
  const titreAvant = document.title;
  const nettoyer = () => { const z = document.getElementById('cmd-print-zone'); if(z) z.remove(); document.title = titreAvant; window.removeEventListener('afterprint', nettoyer); };
  window.addEventListener('afterprint', nettoyer);
  document.title = cmdRapportNomFichier(cmdIds, 'pdf').replace(/\.pdf$/,'');
  setTimeout(() => { window.print(); }, 150);
};

// --- Panneau de choix (liste des commandes) : toutes, en cours, archivées ou sélection ---
let cmdRapportSel = null;
window.cmdOuvrirRapports = () => {
  const toutes = cmdRapportListe();
  if(!toutes.length){ showToast(cmdEnGadh() ? 'Aucune commande en cours à exporter' : 'Aucune commande à exporter'); return; }
  if(!cmdRapportSel){
    const enCours = toutes.filter(([id]) => !cmdEstCloturee(id)).map(([id]) => id);
    cmdRapportSel = new Set(enCours.length ? enCours : toutes.map(([id]) => id));
  }
  cmdAfficherRapports();
  const zone = document.getElementById('cmd-rapport-zone');
  if(zone) zone.scrollIntoView({behavior:'smooth', block:'start'});
};
function cmdAfficherRapports(){
  const zone = document.getElementById('cmd-rapport-zone');
  if(!zone || !cmdRapportSel) return;
  const toutes = cmdRapportListe();
  const rows = toutes.map(([id,c]) => ({id, c, s: cmdSynthese(id)}));
  const nbEnCours = rows.filter(r => !cmdEstCloturee(r.id, r.s)).length;
  const gadh = cmdEnGadh();
  const sel = cmdRapportSel;
  zone.innerHTML = `
    <div class="card" style="background:var(--surface-2);margin-bottom:10px;">
      <div class="flex-header" style="margin-bottom:6px;"><h3 style="margin:0;font-size:14px;">Rapports PDF / Excel</h3>
        <button class="btn btn-ghost" style="padding:5px 9px;font-size:11.5px;" onclick="cmdFermerRapports()">Fermer</button></div>
      <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">Synthèse (une ligne par commande) + détail par référence et taille : commandé, cible coupe, coupé, retour GADH, confection, contrôle, emballé, expédié, rebut, reste à expédier.</p>
      <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
        ${gadh ? '' : `<button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="cmdRapportChoix('toutes')">Toutes (${rows.length})</button>`}
        <button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="cmdRapportChoix('encours')">${gadh ? 'Toutes les commandes en cours' : 'En cours'} (${nbEnCours})</button>
        ${gadh ? '' : `<button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="cmdRapportChoix('archivees')">Archivées (${rows.length-nbEnCours})</button>`}
        <button class="btn btn-ghost" style="flex:1;padding:6px 4px;font-size:11px;" onclick="cmdRapportChoix('aucune')">Aucune</button>
      </div>
      <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface);">
        ${rows.map(r => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border-soft);cursor:pointer;">
            <input type="checkbox" class="cmd-rapport-chk" data-id="${r.id}" ${sel.has(r.id)?'checked':''} onchange="cmdRapportCocher('${r.id}', this.checked)" style="width:18px;height:18px;">
            <span style="flex:1;min-width:0;"><b style="font-size:12.5px;">${esc(r.c.numero)}</b> <span style="font-size:11px;color:var(--ink-soft);">${esc(r.c.destination||'')} · ${cmdQteCommandee(r.c)} pcs</span></span>
            ${cmdStatutBadge(cmdStatutAffiche(r.id, r.s), true)}
          </label>`).join('')}
      </div>
      <div id="cmd-rapport-compte" style="font-size:11.5px;font-weight:800;margin:8px 0;">${sel.size} commande(s) sélectionnée(s)</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;padding:10px 4px;" onclick="cmdExporterPdf([...cmdRapportSel])">📄 PDF</button>
        <button class="btn btn-primary" style="flex:1;padding:10px 4px;background:#1D6F42;border-color:#1D6F42;" onclick="cmdExporterExcel([...cmdRapportSel])">📊 Excel</button>
      </div>
    </div>`;
}
window.cmdRapportCocher = (id, ok) => {
  if(!cmdRapportSel) return;
  if(ok) cmdRapportSel.add(id); else cmdRapportSel.delete(id);
  const c = document.getElementById('cmd-rapport-compte');
  if(c) c.textContent = `${cmdRapportSel.size} commande(s) sélectionnée(s)`;
};
window.cmdRapportChoix = (mode) => {
  const toutes = cmdRapportListe();
  if(cmdEnGadh() && mode!=='aucune') mode = 'encours';
  cmdRapportSel = new Set(mode==='aucune' ? [] : toutes.filter(([id]) => mode==='toutes' || (mode==='encours' ? !cmdEstCloturee(id) : cmdEstCloturee(id))).map(([id]) => id));
  cmdAfficherRapports();
};
window.cmdFermerRapports = () => { cmdRapportSel = null; const z = document.getElementById('cmd-rapport-zone'); if(z) z.innerHTML = ''; };

// ============================================================
// DOCUMENTS D'EXPORT : LISTE DES CARTONS, LISTE DE COLISAGE, LISTE TOTAL
// ============================================================
// Règle ALLOGA (confirmée par l'utilisateur) : 60 pièces maximum par carton et
// une seule taille par carton (le reste d'une taille part dans son propre
// carton). NEOLYS sera défini plus tard (cartons mixtes) : pas de règle ici.
// Poids brut : un carton plein (60 pièces) pèse 12 kg ; un carton incomplet au prorata.
const CMD_COLISAGE = { ALLOGA: {parCarton:60, poidsCartonPlein:12} };
// Logo PERCKO (fichier fourni par l'utilisateur), intégré pour fonctionner hors connexion.
const CMD_LOGO_PERCKO = 'data:image/jpeg;base64,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';
const CMD_EXPEDITEUR = {nom:'TEK-TREND', lignes:['RUE SAKIET SIDI YOUSSEF', 'SAHLINE', '5012 MONASTIR'], pays:'TUNISIE'};
const CMD_DESTINATAIRES = {
  ALLOGA: {nom:'ALLOGA À ARRAS', lignes:['970 ALLÉE DE BELGIQUE -', 'ZAC ARTOIPÔLE', '62128 WANCOURT', 'France'], tel:'03 21 60 97 00'},
  NEOLYS: {nom:'PERCKO CHEZ NEOLYS', lignes:["Parc d'activités des Paris sud-jaune", 'Garonor 607/610', "Boulevard d'Italie", '77127 Lieu saint', 'France'], tel:''}
};
// Remplissage « premier entré, premier servi » : les pièces emballées en premier
// partent en premier. On rejoue l'emballage jour par jour ; pour chaque
// référence/taille un carton reste ouvert jusqu'à 60 pièces, puis un nouveau est
// ouvert. Les cartons sont numérotés dans l'ordre où ils ont été ouverts.
// ctx = {cmdId, deja:{rk:{t:q}}} : deja = pièces déjà expédiées avant cet envoi
// (elles consomment les emballages les plus anciens). Sans ctx : ordre modèle/taille.
function cmdEvenementsEmballage(cmdId){
  const saisies = getCmdSaisies(cmdId), ev = [];
  Object.keys(saisies).sort().forEach(date => {
    const emb = (saisies[date]||{}).emballage || {};
    cmdRapportOrdreRefs(Object.keys(emb)).forEach(rk => CMD_TAILLES.forEach(t => {
      const q = parseInt((emb[rk]||{})[t])||0;
      if(q>0) ev.push({date, rk, t, q});
    }));
  });
  return ev;
}
function cmdPoidsCarton(regle, q){ return Math.round((regle.poidsCartonPlein||0) * q / regle.parCarton * 10) / 10; }
function cmdRepartirCartons(destination, lignes, ctx){
  const regle = CMD_COLISAGE[destination];
  if(!regle) return [];
  const cle = (rk,t) => rk+'|'+t;
  const aPrendre = {};
  Object.entries(lignes||{}).forEach(([rk,ts]) => Object.entries(ts||{}).forEach(([t,v]) => { const q = parseInt(v)||0; if(q>0) aPrendre[cle(rk,t)] = q; }));
  const seq = [];
  if(ctx && ctx.cmdId){
    const aSauter = {};
    Object.entries(ctx.deja||{}).forEach(([rk,ts]) => Object.entries(ts||{}).forEach(([t,v]) => { aSauter[cle(rk,t)] = parseInt(v)||0; }));
    cmdEvenementsEmballage(ctx.cmdId).forEach(e => {
      const k = cle(e.rk, e.t);
      let q = e.q;
      const saut = Math.min(q, aSauter[k]||0); q -= saut; aSauter[k] = (aSauter[k]||0) - saut;
      const pris = Math.min(q, aPrendre[k]||0);
      if(pris>0){ seq.push({rk:e.rk, t:e.t, q:pris}); aPrendre[k] -= pris; }
    });
  }
  // Reste (pas de contexte, ou emballage insuffisant) : ordre modèle puis taille.
  cmdRapportOrdreRefs(Object.keys(lignes||{})).forEach(rk => CMD_TAILLES.forEach(t => {
    const k = cle(rk,t);
    if(aPrendre[k]>0){ seq.push({rk, t, q:aPrendre[k]}); aPrendre[k] = 0; }
  }));
  const colis = [], ouvert = {};
  seq.forEach(({rk, t, q}) => {
    const k = cle(rk,t);
    while(q > 0){
      let c = ouvert[k];
      if(!c || c.q >= regle.parCarton){ c = {n: colis.length+1, rk, t, q:0}; colis.push(c); ouvert[k] = c; }
      const n = Math.min(regle.parCarton - c.q, q);
      c.q += n; q -= n;
    }
  });
  colis.forEach(c => { c.poids = cmdPoidsCarton(regle, c.q); });
  return colis;
}
function cmdPoidsBrutTotal(colis){ return Math.round(colis.reduce((s,c) => s + (c.poids||0), 0) * 10) / 10; }
// Composition d'une expédition. Les expéditions enregistrées avant cette version
// ne mémorisaient pas leurs lignes : on les retrouve dans la saisie du jour quand
// c'est la seule expédition de cette date (sinon impossible de les séparer).
function cmdExpLignes(cmdId, e){
  if(e.lignes && Object.keys(e.lignes).length) return e.lignes;
  const memeJour = getCmdExpeditions(cmdId).filter(x => x.date===e.date);
  if(memeJour.length!==1) return null;
  const jour = getCmdSaisies(cmdId)[e.date];
  return (jour && jour.expedition) ? jour.expedition : null;
}
function cmdExpColis(cmdId, e){
  const cmd = getCmdCommandes()[cmdId];
  const regle = cmd && CMD_COLISAGE[cmd.destination];
  if(e.colis && e.colis.length) return e.colis.map(c => ({...c, poids: regle ? cmdPoidsCarton(regle, c.q) : c.poids}));
  const deja = {};
  getCmdExpeditions(cmdId).filter(x => x.ts < e.ts).forEach(x => {
    const l = cmdExpLignes(cmdId, x) || {};
    Object.entries(l).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,q]) => { if(!deja[rk]) deja[rk] = {}; deja[rk][t] = (deja[rk][t]||0) + (parseInt(q)||0); }));
  });
  return cmdRepartirCartons(cmd && cmd.destination, cmdExpLignes(cmdId, e) || {}, {cmdId, deja});
}
function cmdDocsExpDispo(cmdId, e){
  const cmd = getCmdCommandes()[cmdId];
  return !!(cmd && CMD_COLISAGE[cmd.destination] && cmdExpLignes(cmdId, e));
}
// « PHARMA_FEMME COL V NOIR » → « Pharma Femme Col V Noir »
function cmdNomModeleDoc(rk){
  return cmdRapportLibelle(rk).replace(/_/g,' ').toLowerCase().replace(/(^|\s)(\S)/g, (m,a,b) => a + b.toUpperCase());
}
function cmdTaillesDoc(cmd, rk){
  if(cmd.destination==='ALLOGA' && CMD_ALLOGA_TAILLES[rk]) return CMD_ALLOGA_TAILLES[rk];
  return CMD_TAILLES.filter(t => cmd.lignes && cmd.lignes[rk] && cmd.lignes[rk].tailles && cmd.lignes[rk].tailles[t]);
}
let cmdEtqParPage = 4;
window.cmdSetEtqParPage = (n) => { cmdEtqParPage = parseInt(n)||4; };

function cmdDestinataireHtml(dest){
  const d = CMD_DESTINATAIRES[dest] || {nom:dest, lignes:[], tel:''};
  return `Destinataire:<br><b>${esc(d.nom)}</b>${d.lignes.map(l => `<br><b>${esc(l)}</b>`).join('')}${d.tel ? `<br><b>TÉLÉPHONE :</b> ${esc(d.tel)}` : ''}`;
}
function cmdDocCartonsHtml(cmd, e, colis){
  const parPage = [1,2,4].includes(cmdEtqParPage) ? cmdEtqParPage : 4;
  const etiquette = (c) => `
    <div class="etq">
      <div class="etq-haut">
        <div class="etq-logo"><img src="${CMD_LOGO_PERCKO}" alt="PERCKO"></div>
        <div class="etq-dest">${cmdDestinataireHtml(cmd.destination)}</div>
      </div>
      <div class="etq-num">CARTON N°${c.n}</div>
      <table class="etq-tab"><thead><tr><th style="width:18%">Taille</th><th>Modèles</th><th style="width:20%">Quantité</th></tr></thead>
        <tbody><tr><td>T${esc(c.t)}</td><td>${esc(cmdNomModeleDoc(c.rk))}</td><td>${c.q}</td></tr></tbody></table>
    </div>`;
  const pages = [];
  for(let i=0; i<colis.length; i+=parPage) pages.push(colis.slice(i, i+parPage));
  return `<div class="etq-pages p${parPage}">${pages.map(pg => `<div class="etq-page">${pg.map(etiquette).join('')}</div>`).join('')}</div>`;
}
function cmdDocColisageHtml(cmd, e, colis){
  const tailles = CMD_TAILLES.filter(t => colis.some(c => c.t===t));
  const exp = CMD_EXPEDITEUR;
  const totT = {}; tailles.forEach(t => { totT[t] = colis.filter(c=>c.t===t).reduce((s,c)=>s+c.q,0); });
  const total = colis.reduce((s,c)=>s+c.q,0);
  const regle = CMD_COLISAGE[cmd.destination];
  const brut = regle ? cmdPoidsBrutTotal(colis) : (parseFloat(e.poidsBrut)||0);
  return `
    <div class="col-entete">
      <div>Expéditeur : <b>${esc(exp.nom)}</b>${exp.lignes.map(l=>`<br>${esc(l)}`).join('')} <b>${esc(exp.pays)}</b><br>Date d'export : le ${cmdRapportDateFR(e.date)}</div>
      <div>${cmdDestinataireHtml(cmd.destination)}</div>
    </div>
    <div class="col-info">Commande ${esc(cmd.numero)}${e.bl?` · BL ${esc(e.bl)}`:''}${e.transporteur?` · ${esc(e.transporteur)}`:''}</div>
    <table class="col-tab">
      <thead><tr><th>N° colis</th><th>Commande</th><th>Référence</th>${tailles.map(t=>`<th>${t}</th>`).join('')}<th>Total</th>${regle?'<th>Poids brut (kg)</th>':''}</tr></thead>
      <tbody>${colis.map(c => `<tr><td>${c.n}</td><td>${esc(cmd.client||'PERCKO')}</td><td class="gauche">${esc(cmdNomModeleDoc(c.rk))}</td>${tailles.map(t=>`<td>${c.t===t?c.q:''}</td>`).join('')}<td><b>${c.q}</b></td>${regle?`<td>${c.poids}</td>`:''}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="gauche">Total t-shirt pour export</td>${tailles.map(t=>`<td>${totT[t]}</td>`).join('')}<td>${total}</td>${regle?`<td>${brut}</td>`:''}</tr></tfoot>
    </table>
    <table class="col-pied">
      <tr><td>Nombre de colis</td><td>${colis.length}</td></tr>
      <tr><td>Poids net</td><td>${e.poidsNet ? esc(String(e.poidsNet))+' kg' : ''}</td></tr>
      <tr><td>Poids brut</td><td>${brut ? brut+' kg' : ''}</td></tr>
    </table>`;
}
function cmdDocTotalHtml(cmd, e, lignes){
  const refs = cmdRapportOrdreRefs(Object.keys(cmd.lignes||{}).concat(Object.keys(lignes).filter(rk => !(cmd.lignes||{})[rk])));
  let total = 0;
  const corps = refs.map(rk => {
    const nom = cmdNomModeleDoc(rk).toUpperCase();
    return `<tr class="tot-grp"><td>${esc(nom)}</td><td></td></tr>` + cmdTaillesDoc(cmd, rk).map(t => {
      const q = parseInt((lignes[rk]||{})[t])||0; total += q;
      return `<tr><td>${esc(nom)} ${t}</td><td>${q}</td></tr>`;
    }).join('');
  }).join('');
  return `
    <div class="tot-info">Commande ${esc(cmd.numero)} · export du ${cmdRapportDateFR(e.date)} · ${esc((CMD_DESTINATAIRES[cmd.destination]||{}).nom||cmd.destination)}</div>
    <table class="tot-tab">
      <thead><tr><th>MODELE</th><th>QUANTITE</th></tr></thead>
      <tbody>${corps}</tbody>
      <tfoot><tr><td>TOTAL</td><td>${total}</td></tr></tfoot>
    </table>`;
}
const CMD_DOC_CSS = `
  #cmd-doc-zone { display:none; font-family: Arial, Helvetica, sans-serif; color:#000; }
  @media print {
    body > *:not(#cmd-doc-zone) { display:none !important; }
    html, body { background:#fff !important; padding:0 !important; margin:0 !important; }
    #cmd-doc-zone { display:block; }
  }
  #cmd-doc-zone * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing:border-box; text-transform:none; letter-spacing:0; }
  #cmd-doc-zone table { border-collapse:collapse; }
  #cmd-doc-zone th, #cmd-doc-zone td { border:1px solid #000; font-size:inherit !important; color:#000 !important; background:transparent; line-height:1.25; }
  #cmd-doc-zone th { font-weight:bold !important; }
  /* Étiquettes cartons */
  #cmd-doc-zone .etq-page { display:grid; gap:6mm; break-after:page; page-break-after:always; }
  #cmd-doc-zone .etq-page:last-child { break-after:auto; page-break-after:auto; }
  #cmd-doc-zone .p1 .etq-page { grid-template-columns:1fr; }
  #cmd-doc-zone .p2 .etq-page { grid-template-columns:1fr; grid-template-rows:1fr 1fr; height:270mm; }
  #cmd-doc-zone .p4 .etq-page { grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; height:270mm; }
  #cmd-doc-zone .etq { border:1px dashed #999; padding:4mm; font-family: Georgia, 'Times New Roman', serif; }
  #cmd-doc-zone .etq-haut { display:flex; gap:4mm; align-items:flex-start; }
  #cmd-doc-zone .etq-logo { flex:0 0 38%; }
  #cmd-doc-zone .etq-logo img { display:block; height:auto; }
  #cmd-doc-zone .p4 .etq-logo img { width:24mm; } #cmd-doc-zone .p2 .etq-logo img { width:34mm; } #cmd-doc-zone .p1 .etq-logo img { width:50mm; }
  #cmd-doc-zone .etq-dest { flex:1; line-height:1.3; }
  #cmd-doc-zone .etq-num { border:1px solid #000; text-align:center; font-family: Arial, Helvetica, sans-serif; font-weight:bold; margin-top:3mm; padding:1mm; }
  #cmd-doc-zone .etq-tab { width:100%; font-family: Arial, Helvetica, sans-serif; }
  #cmd-doc-zone .etq-tab th { font-weight:bold; }
  #cmd-doc-zone .etq-tab th, #cmd-doc-zone .etq-tab td { text-align:center; padding:1.5mm; border-top:none; }
  #cmd-doc-zone .p4 .etq-logo { font-size:20pt; } #cmd-doc-zone .p4 .etq-dest { font-size:8.5pt; } #cmd-doc-zone .p4 .etq-num { font-size:13pt; } #cmd-doc-zone .p4 .etq-tab { font-size:9.5pt; }
  #cmd-doc-zone .p2 .etq-logo { font-size:30pt; } #cmd-doc-zone .p2 .etq-dest { font-size:11pt; } #cmd-doc-zone .p2 .etq-num { font-size:18pt; } #cmd-doc-zone .p2 .etq-tab { font-size:12pt; }
  #cmd-doc-zone .p1 .etq-logo { font-size:44pt; } #cmd-doc-zone .p1 .etq-dest { font-size:15pt; } #cmd-doc-zone .p1 .etq-num { font-size:26pt; } #cmd-doc-zone .p1 .etq-tab { font-size:16pt; }
  /* Liste de colisage */
  #cmd-doc-zone .col-entete { display:flex; justify-content:space-between; gap:10mm; font-family: Georgia, 'Times New Roman', serif; font-size:10pt; line-height:1.3; }
  #cmd-doc-zone .col-info { font-size:8.5pt; color:#333; margin:3mm 0 2mm; }
  #cmd-doc-zone .col-tab { width:100%; font-size:8.5pt; }
  #cmd-doc-zone .col-tab th { background:#eee !important; padding:1.5mm 1mm; }
  #cmd-doc-zone .col-tab td { text-align:center; padding:1mm; }
  #cmd-doc-zone .col-tab tr { break-inside:avoid; page-break-inside:avoid; }
  #cmd-doc-zone .col-tab thead { display:table-header-group; }
  #cmd-doc-zone .col-tab tfoot td { font-weight:bold; background:#eee; }
  #cmd-doc-zone .gauche { text-align:left !important; }
  #cmd-doc-zone .col-pied { margin-top:4mm; font-size:9pt; width:90mm; }
  #cmd-doc-zone .col-pied td { padding:1mm 2mm; } #cmd-doc-zone .col-pied td:first-child { width:55%; }
  /* Liste total */
  #cmd-doc-zone .tot-info { font-size:9pt; color:#333; margin-bottom:3mm; }
  #cmd-doc-zone .tot-tab { width:150mm; font-size:10pt; }
  #cmd-doc-zone .tot-tab th { font-weight:normal !important; padding:1.5mm; }
  #cmd-doc-zone .tot-tab td { padding:1mm 1.5mm; }
  #cmd-doc-zone .tot-tab td:last-child, #cmd-doc-zone .tot-tab th:last-child { width:35mm; }
  #cmd-doc-zone .tot-tab .tot-grp td { font-weight:bold; font-size:12.5pt !important; }
  #cmd-doc-zone .tot-tab tfoot td { font-weight:bold; }
  #cmd-doc-zone .tot-tab tr { break-inside:avoid; page-break-inside:avoid; }
`;
window.cmdImprimerDocExp = (cmdId, ts, type) => {
  const cmd = getCmdCommandes()[cmdId];
  const e = getCmdExpeditions(cmdId).find(x => x.ts===ts);
  if(!cmd || !e){ showToast('Expédition introuvable'); return; }
  const lignes = cmdExpLignes(cmdId, e);
  if(!lignes){ showToast("Composition de cette expédition inconnue (enregistrée avant cette version)"); return; }
  const colis = cmdExpColis(cmdId, e);
  let html, format, nom;
  if(type==='cartons'){ html = cmdDocCartonsHtml(cmd, e, colis); format = 'A4 portrait'; nom = 'Cartons'; }
  else if(type==='colisage'){ html = cmdDocColisageHtml(cmd, e, colis); format = 'A4 landscape'; nom = 'Colisage'; }
  else { html = cmdDocTotalHtml(cmd, e, lignes); format = 'A4 portrait'; nom = 'Liste_total'; }
  let zone = document.getElementById('cmd-doc-zone');
  if(zone) zone.remove();
  zone = document.createElement('div');
  zone.id = 'cmd-doc-zone';
  zone.dataset.type = type;
  zone.innerHTML = `<style>@page { size: ${format}; margin: ${type==='cartons' ? '8mm' : '10mm'}; }${CMD_DOC_CSS}</style>${html}`;
  document.body.appendChild(zone);
  const titreAvant = document.title;
  const nettoyer = () => { const z = document.getElementById('cmd-doc-zone'); if(z) z.remove(); document.title = titreAvant; window.removeEventListener('afterprint', nettoyer); };
  window.addEventListener('afterprint', nettoyer);
  document.title = `${nom}_${cmd.numero}_${e.date}`.replace(/[^\w.\-]+/g,'_');
  setTimeout(() => { window.print(); }, 150);
};
