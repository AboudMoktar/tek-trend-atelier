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

// --- Références produit : réutilise le catalogue du module Chaîne (lecture seule) ---
function cmdRefName(rk){ return (typeof prodRefName==='function') ? prodRefName(rk) : rk; }
function cmdActiveReferences(){ return (typeof activeProdReferences==='function') ? activeProdReferences() : []; }
const CMD_TAILLES = (typeof PROD_TAILLES!=='undefined') ? PROD_TAILLES : ['XS','S','M','L','XL','XXL','XXXL'];

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
window.cmdCloturerCommande = (cmdId) => {
  if(!canEditCmd()) return;
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

// --- Formulaire d'expédition (date/heure/quantité/cartons/transporteur/BL/observation) ---
let cmdExpForm = null; // {cmdId, date, heure, qty:{rk:{t:v}}, cartons, transporteur, bl, observation}
window.cmdOuvrirExpedition = (cmdId) => {
  const now = new Date();
  cmdExpForm = {
    cmdId, date: getTodayISO(), heure: String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'),
    qty:{}, cartons:'', transporteur:'', bl:'', observation:''
  };
  cmdGo('expedition', cmdId);
};
window.cmdExpSet = (field, val) => { if(cmdExpForm) cmdExpForm[field] = val; };
window.cmdExpQty = (rk, t, v) => { if(!cmdExpForm.qty[rk]) cmdExpForm.qty[rk] = {}; cmdExpForm.qty[rk][t] = v; };
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
  exps.push({ts:Date.now(), date:f.date, heure:f.heure||'', quantite:total, cartons:f.cartons||'', transporteur:f.transporteur||'', bl:f.bl||'', observation:f.observation||'', user:currentUser.nom});
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
  if(s.restes.resteAExpedier===0){
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
      ${Object.entries(imp.lignes).map(([rk,l]) => `
        <div style="padding:5px 0;border-bottom:1px solid var(--border-soft);">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:12px;">${esc(cmdRefName(rk))}</b><b style="font-size:12px;">${cmdLigneTotal(l)}</b></div>
          <div style="font-size:10.5px;color:var(--ink-soft);">${CMD_TAILLES.filter(t=>l.tailles[t]).map(t=>`${t} ${l.tailles[t]}`).join(' · ')}</div>
        </div>`).join('')}
      ${imp.ignorees.length ? `<details style="margin-top:8px;"><summary style="font-size:11px;color:var(--warn);cursor:pointer;">${imp.ignorees.length} ligne(s) ignorée(s)</summary><div style="font-size:10.5px;color:var(--ink-soft);margin-top:4px;line-height:1.5;">${imp.ignorees.slice(0,20).map(esc).join('<br>')}</div></details>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary" style="flex:1;" ${dejaExiste?'disabled':''} onclick="cmdImpCreer(${i})">Créer la commande</button>
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
    <div class="card" style="padding:8px;display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
      ${filtres.map(f => `<button class="btn ${cmdListFilter===f.k?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11.5px;" onclick="cmdSetFiltre('${f.k}')">${f.l}</button>`).join('')}
    </div>
    ${rows.length===0 ? `<div class="card">${buildEmptyState('Aucune commande', "Aucune commande ne correspond à ce filtre.")}</div>` :
      rows.sort((a,b)=>(b.cmd.createdAt||0)-(a.cmd.createdAt||0)).map(r => cmdCarte(r.id, r.cmd, r.s)).join('')}
  `;
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

    ${canEdit ? `<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
      ${!cloturee ? `<button class="btn btn-primary" style="flex:1;min-width:140px;" onclick="cmdOuvrirSaisie('${id}')">Saisir la production</button>` : ''}
      ${!cloturee && s.restes.aEmballer + s.restes.pretAExpedier + s.restes.expedie > 0 ? `<button class="btn btn-primary" style="flex:1;min-width:140px;background:var(--good);" onclick="cmdOuvrirExpedition('${id}')">Enregistrer une expédition</button>` : ''}
      ${!cloturee ? `<button class="btn btn-warning" style="flex:1;min-width:140px;" onclick="cmdCloturerCommande('${id}')">Valider et archiver</button>` : ''}
    </div>` : ''}

    ${expeditions.length ? `
    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Expéditions</h3></div>
    <div class="card">
      ${expeditions.map(e => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;">
          <b>${(e.date||'').split('-').reverse().join('/')} ${e.heure||''}</b> — ${e.quantite} pièce(s)
          ${e.cartons?` · ${esc(e.cartons)} carton(s)`:''}${e.transporteur?` · ${esc(e.transporteur)}`:''}${e.bl?` · BL ${esc(e.bl)}`:''}
          ${e.observation?`<div style="color:var(--ink-soft);">${esc(e.observation)}</div>`:''}
        </div>`).join('')}
    </div>` : ''}

    <div class="flex-header" style="margin-top:10px;"><h3 style="margin:0;font-size:14px;">Historique</h3></div>
    <div class="card">
      ${histo.length===0 ? `<div style="font-size:12px;color:var(--ink-faint);">Aucun événement enregistré.</div>` :
        histo.map(h => `<div style="padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:11.5px;"><b>${cmdDateHeureFR(h.ts)}</b> — ${esc(h.msg)}${h.user?` <span style="color:var(--ink-faint);">(${esc(h.user)})</span>`:''}</div>`).join('')}
    </div>
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
  const refs = cmdActiveReferences();
  zone.innerHTML = `
    <div class="card" style="background:var(--surface-2);">
      <h3 style="margin:0 0 8px;font-size:14px;">${f.editId?'Modifier la commande':'Nouvelle commande'}</h3>
      <div class="field"><label>Destination</label><div style="display:flex;gap:8px;">
        ${CMD_DESTINATIONS.map(d => `<button class="btn ${f.destination===d?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px;" onclick="cmdFormSet('destination','${d}');renderCmdForm();">${d}</button>`).join('')}
      </div></div>
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
            ${CMD_TAILLES.map(t => `<div><label style="font-size:9.5px;color:var(--ink-faint);">${t}</label><input type="number" inputmode="numeric" min="0" value="${(f.qty[rk]&&f.qty[rk][t])||''}" oninput="cmdFormQty('${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`).join('')}
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
        <div class="field" style="flex:1;"><label>Nombre de cartons</label><input type="number" inputmode="numeric" min="0" value="${esc(f.cartons)}" oninput="cmdExpSet('cartons',this.value)"></div>
        <div class="field" style="flex:1;"><label>Transporteur</label><input value="${esc(f.transporteur)}" oninput="cmdExpSet('transporteur',this.value)"></div>
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
function cmdInitSaisie(cmdId, date, etape){
  cmdSaisie = {cmdId: cmdId||null, date: date || getTodayISO(), etape: etape || CMD_ETAPES[0], vals:{}, rebut:{}};
  if(!cmdSaisie.cmdId){
    const dispo = cmdCommandesSaisissables();
    if(dispo.length===1) cmdSaisie.cmdId = dispo[0][0];
  }
  cmdChargerJourSaisie();
}
function cmdChargerJourSaisie(){
  cmdSaisie.vals = {}; cmdSaisie.rebut = {};
  if(!cmdSaisie.cmdId) return;
  const jour = getCmdSaisies(cmdSaisie.cmdId)[cmdSaisie.date] || {};
  const copie = (src) => { const o = {}; Object.entries(src||{}).forEach(([rk,ts]) => { o[rk] = {...ts}; }); return o; };
  cmdSaisie.vals = copie(jour[cmdSaisie.etape]);
  cmdSaisie.rebut = copie(jour[cmdRebutKey(cmdSaisie.etape)]);
}
window.cmdOuvrirSaisie = (cmdId, date, etape) => { cmdInitSaisie(cmdId||null, date||getTodayISO(), etape||null); cmdGo('saisie'); };
window.cmdSjDate = (d) => { cmdSaisie.date = d || getTodayISO(); cmdChargerJourSaisie(); cmdRerender(); };
window.cmdSjEtape = (e) => { cmdSaisie.etape = e; cmdChargerJourSaisie(); cmdRerender(); };
window.cmdSjCommande = (id) => { cmdSaisie.cmdId = id || null; cmdChargerJourSaisie(); cmdRerender(); };
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
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${CMD_ETAPES.map(e => `<button class="btn ${cmdSaisie.etape===e?'btn-primary':'btn-ghost'}" style="padding:6px 9px;font-size:11px;" onclick="cmdSjEtape('${e}')">${CMD_ETAPE_INFO[e].label}</button>`).join('')}
        </div>
      </div>
      ${Object.entries(cmd.lignes||{}).map(([rk,l]) => {
        const cum = cmdCumulsFrom(cmd, getCmdSaisies(cmdSaisie.cmdId));
        return `
        <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:8px;">
          <b style="font-size:12px;">${esc(cmdRefName(rk))}</b>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
            ${CMD_TAILLES.filter(t=>l.tailles[t]).map(t => {
              const c = cmdCell(cum, rk, t);
              const dispo2 = cmdSaisie.etape==='coupe' ? Math.max(0, l.tailles[t] - c.coupe) : Math.max(0, cmdDisponible(cmdSaisie.etape, c));
              return `<div><label style="font-size:9.5px;color:var(--ink-faint);">${t} (dispo ${dispo2})</label><input class="sj" data-quoi="vals" data-rk="${rk}" data-t="${t}" type="number" inputmode="numeric" min="0" value="${(cmdSaisie.vals[rk]&&cmdSaisie.vals[rk][t])||''}" oninput="cmdSjSet('vals','${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`;
            }).join('')}
          </div>
          <details style="margin-top:6px;"><summary style="font-size:10.5px;color:var(--warn);cursor:pointer;">Rebut à cette étape</summary>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px;">
              ${CMD_TAILLES.filter(t=>l.tailles[t]).map(t => `<div><label style="font-size:9.5px;color:var(--ink-faint);">${t}</label><input class="sj" data-quoi="rebut" data-rk="${rk}" data-t="${t}" type="number" inputmode="numeric" min="0" value="${(cmdSaisie.rebut[rk]&&cmdSaisie.rebut[rk][t])||''}" oninput="cmdSjSet('rebut','${rk}','${t}',this.value)" style="padding:6px;font-size:12px;"></div>`).join('')}
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
