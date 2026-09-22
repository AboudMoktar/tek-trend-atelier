// ============================================================
// SUIVI DE PRODUCTION — TEK-TREND ⇄ GADH TUNISIA (v3 : bons datés)
// ============================================================
// Logique validée avec le Responsable :
//  - chaque opération est un BON daté (Coupe/Envoi GADH, Retour GADH,
//    Contrôle, Emballage, Expédition) ; les totaux, restes et statuts
//    sont TOUJOURS calculés à partir des bons, jamais saisis à la main
//  - blocage : un bon ne peut pas dépasser ce qui est disponible à l'étape
//    précédente (seule la coupe peut dépasser la commande : marge de sécurité)
//  - contrôle : les non conformes partent au REBUT définitif
//  - expédition par référence/taille, prélevée sur l'emballé
//  - un bon erroné s'ANNULE (jamais d'écrasement), avec vérification
//    que les étapes suivantes ne l'ont pas déjà utilisé
//  - suivi par taille, aucun champ "opérateur"
//  - données partagées TEK-TREND/GADH, interface séparée par société

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

// --- Étapes ---
const PROD_ETAPES = ['coupe','retour','controle','emballage','expedition'];
const PROD_ETAPE_INFO = {
  coupe:      {label:'Coupe / Envoi GADH', court:'Coupé/Envoyé', site:'tek',  color:'#F59E0B'},
  retour:     {label:'Retour GADH',        court:'Retourné',     site:'gadh', color:'#8E2A5B'},
  controle:   {label:'Contrôle',           court:'Contrôlé',     site:'tek',  color:'#3B82F6'},
  emballage:  {label:'Emballage',          court:'Emballé',      site:'tek',  color:'#0EA5A4'},
  expedition: {label:'Expédition',         court:'Expédié',      site:'tek',  color:'#10B981'}
};

// --- Bons : { etape, commandeId, date, lignes:{refKey:{taille:qte}}, nc:{...} (contrôle), observation, createdBy, createdAt, annule } ---
function getProdBons(){ return getJSON('prod_bons', {}); }
function saveProdBons(b){ setJSON('prod_bons', b); }
function prodBonTotal(b){
  let s = 0;
  Object.values(b.lignes||{}).forEach(ts => Object.values(ts).forEach(q => { s += parseInt(q)||0; }));
  return s;
}
function prodBonNcTotal(b){
  let s = 0;
  Object.values(b.nc||{}).forEach(ts => Object.values(ts).forEach(q => { s += parseInt(q)||0; }));
  return s;
}
function prodBonsCommande(cmdId, includeAnnules){
  return Object.entries(getProdBons())
    .filter(([id,b]) => b.commandeId===cmdId && (includeAnnules || !b.annule))
    .sort((a,b)=> ((b[1].date||'')+(b[1].createdAt||'')).localeCompare((a[1].date||'')+(a[1].createdAt||'')));
}

// --- Cumuls par référence/taille, calculés à partir des bons non annulés ---
function prodEmptyCell(){ return {coupe:0, retour:0, controle:0, nc:0, emballage:0, expedition:0}; }
function prodCumuls(cmdId, excludeBonId, extraBon){
  const cmd = getProdCommandes()[cmdId];
  const res = {};
  const cell = (rk,t) => { if(!res[rk]) res[rk] = {}; if(!res[rk][t]) res[rk][t] = prodEmptyCell(); return res[rk][t]; };
  if(cmd) Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => cell(rk,t)));
  const add = (b) => {
    Object.entries(b.lignes||{}).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,q]) => { cell(rk,t)[b.etape] += parseInt(q)||0; }));
    if(b.etape==='controle') Object.entries(b.nc||{}).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,q]) => { cell(rk,t).nc += parseInt(q)||0; }));
  };
  Object.entries(getProdBons()).forEach(([id,b]) => {
    if(b.commandeId!==cmdId || b.annule || id===excludeBonId) return;
    add(b);
  });
  if(extraBon) add(extraBon);
  return res;
}
function prodCell(cum, rk, t){ return (cum[rk] && cum[rk][t]) || prodEmptyCell(); }

// Ce qui peut encore passer à une étape (plafond du bon). null = pas de plafond (coupe).
function prodDisponible(etape, c){
  if(etape==='retour') return c.coupe - c.retour;
  if(etape==='controle') return c.retour - c.controle;
  if(etape==='emballage') return (c.controle - c.nc) - c.emballage;
  if(etape==='expedition') return c.emballage - c.expedition;
  return null;
}
function prodRestes(c, qteCommandee){
  return {
    resteACouper: Math.max(0, qteCommandee - c.coupe),
    chezGadh: Math.max(0, c.coupe - c.retour),
    aControler: Math.max(0, c.retour - c.controle),
    rebut: c.nc,
    aEmballer: Math.max(0, (c.controle - c.nc) - c.emballage),
    pretAExpedier: Math.max(0, c.emballage - c.expedition),
    resteALivrer: Math.max(0, qteCommandee - c.expedition)
  };
}

// Incohérences (une étape qui dépasse la précédente). Normalement impossibles avec
// les bons, mais possibles dans les saisies reprises de l'ancienne version.
function prodViolations(cum){
  const v = [];
  Object.entries(cum).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,c]) => {
    if(c.retour > c.coupe) v.push({rk, t, code:'retour', msg:`retourné ${c.retour} > coupé/envoyé ${c.coupe}`});
    if(c.controle > c.retour) v.push({rk, t, code:'controle', msg:`contrôlé ${c.controle} > retourné ${c.retour}`});
    if(c.nc > c.controle) v.push({rk, t, code:'nc', msg:`non conformes ${c.nc} > contrôlé ${c.controle}`});
    if(c.emballage > c.controle - c.nc) v.push({rk, t, code:'emballage', msg:`emballé ${c.emballage} > conformes ${c.controle - c.nc}`});
    if(c.expedition > c.emballage) v.push({rk, t, code:'expedition', msg:`expédié ${c.expedition} > emballé ${c.emballage}`});
  }));
  return v;
}
function prodViolationKey(v){ return v.rk+'|'+v.t+'|'+v.code; }

// --- Statut automatique d'une commande (ou d'une seule référence de la commande) ---
const PROD_STATUTS = {
  RECUE:         {label:'Reçue',                  color:'#9CA3AF'},
  EN_PRODUCTION: {label:'En production',          color:'#3B82F6'},
  PRETE:         {label:'Prête à expédier',       color:'#0EA5A4'},
  PARTIELLE:     {label:'Partiellement expédiée', color:'#F59E0B'},
  EXPEDIEE:      {label:'Expédiée',               color:'#10B981'}
};
// Les quantités sont plafonnées taille par taille à la quantité commandée : un surplus
// sur une taille ne doit jamais masquer un manque sur une autre.
function prodSynthese(cmdId, refFilter, cumOpt){
  const cmd = getProdCommandes()[cmdId];
  if(!cmd) return null;
  const cum = cumOpt || prodCumuls(cmdId);
  const restes = {resteACouper:0, chezGadh:0, aControler:0, rebut:0, aEmballer:0, pretAExpedier:0, resteALivrer:0};
  let total=0, embCap=0, expCap=0, expRaw=0, activite=0;
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => {
    if(refFilter && rk!==refFilter) return;
    Object.entries(l.tailles||{}).forEach(([t,qRaw]) => {
      const q = parseInt(qRaw)||0;
      const c = prodCell(cum, rk, t);
      total += q;
      embCap += Math.min(c.emballage, q);
      expCap += Math.min(c.expedition, q);
      expRaw += c.expedition;
      activite += c.coupe + c.retour + c.controle + c.emballage + c.expedition;
      const r = prodRestes(c, q);
      Object.keys(restes).forEach(k => { restes[k] += r[k]; });
    });
  });
  let statut = 'RECUE';
  if(total>0 && expCap>=total) statut = 'EXPEDIEE';
  else if(expRaw>0) statut = 'PARTIELLE';
  else if(total>0 && embCap>=total) statut = 'PRETE';
  else if(activite>0) statut = 'EN_PRODUCTION';
  return {
    total, embCap, expCap, statut, restes,
    pctProd: total ? Math.min(100, Math.round(embCap/total*100)) : 0,
    pctExp: total ? Math.min(100, Math.round(expCap/total*100)) : 0
  };
}
function prodStatutBadge(statut, small){
  const s = PROD_STATUTS[statut] || PROD_STATUTS.RECUE;
  return `<span style="font-size:${small?'9.5':'10.5'}px;font-weight:800;color:#fff;background:${s.color};padding:3px 8px;border-radius:10px;white-space:nowrap;">${s.label}</span>`;
}

// --- Reprise des saisies faites avant les bons (version précédente du module) ---
// Chaque ancienne saisie cumulée devient UN bon "Reprise" par étape et par commande.
// Identifiant déterministe => jamais de doublon, même si deux téléphones le font en même temps.
function prodMigrerAnciennesSaisies(){
  const cmds = getProdCommandes();
  if(Object.keys(cmds).length===0) return;
  const bons = getProdBons();
  const sources = {
    coupe: getJSON('prod_stage_coupe', {}),
    retour: getJSON('prod_stage_assemble', {}),
    controle: getJSON('prod_stage_controle', {}),
    emballage: getJSON('prod_stage_emballage', {})
  };
  let changed = false;
  Object.keys(cmds).forEach(cmdId => {
    Object.entries(sources).forEach(([etape, src]) => {
      const bonId = 'reprise_'+cmdId+'_'+etape;
      if(bons[bonId]) return;
      const lignes = {}, nc = {};
      let total = 0;
      Object.entries(src||{}).forEach(([k,v]) => {
        const parts = k.split('|');
        if(parts.length!==3 || parts[0]!==cmdId) return;
        const rk = parts[1], t = parts[2];
        let q = 0, n = 0;
        if(etape==='controle'){ n = parseInt(v && v.nonConforme)||0; q = (parseInt(v && v.conforme)||0) + n; }
        else q = parseInt(v && v.quantite)||0;
        if(q<=0) return;
        (lignes[rk] = lignes[rk] || {})[t] = q;
        if(n>0) (nc[rk] = nc[rk] || {})[t] = n;
        total += q;
      });
      if(total>0){
        bons[bonId] = {
          etape, commandeId: cmdId, date: cmds[cmdId].dateCreation || getTodayISO(),
          lignes, nc, reprise: true,
          observation: 'Reprise des saisies faites avant la mise en place des bons',
          createdBy: 'Reprise automatique', createdAt: new Date().toISOString()
        };
        changed = true;
      }
    });
  });
  if(changed) saveProdBons(bons);
}

// ============================================================
// NAVIGATION DU MODULE (commune TEK-TREND / GADH)
// ============================================================
// site = 'tek' (onglet Chaîne de Gestion Rendement) ou 'gadh' (onglet Chaîne de GADH Tunisia)
const prodNav = { tek: {view:'list', cmdId:null}, gadh: {view:'list', cmdId:null} };
let prodListFilter = 'encours';
let prodBon = null; // état du bon en cours de saisie
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
window.prodOpenBon = (site, etape, cmdId) => {
  prodInitBonState(site, etape, cmdId);
  prodGo(site, 'bon');
};

function prodShell(main, site){
  prodMigrerAnciennesSaisies();
  const v = prodNav[site].view;
  const canEdit = prodCanEditSite(site);
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Chaîne de production</h2></div>
    <div class="card" style="padding:8px;display:flex;gap:6px;">
      <button class="btn ${v!=='bon'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 4px;font-size:12.5px;" onclick="prodGo('${site}','list')">Commandes</button>
      ${canEdit ? `<button class="btn ${v==='bon'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 4px;font-size:12.5px;" onclick="prodOpenBon('${site}', ${site==='gadh'?"'retour'":'null'}, null)">+ ${site==='gadh'?'Bon de retour':'Nouveau bon'}</button>` : ''}
    </div>
    <div id="prod-body-${site}"></div>
  `;
  const body = document.getElementById('prod-body-'+site);
  if(v==='fiche') renderProdFiche(body, site);
  else if(v==='bon') renderProdBonForm(body, site);
  else renderProdListe(body, site);
}
function renderProdChainTek(main){ prodShell(main, 'tek'); }
function renderProdChainGadh(main){ prodShell(main, 'gadh'); }

// ============================================================
// LISTE DES COMMANDES
// ============================================================
function renderProdListe(container, site){
  const canEdit = site==='tek' && canEditProdTek();
  const all = activeProdCommandes().map(([id,c]) => ({id, c, s: prodSynthese(id)}));
  const nbEnCours = all.filter(x=>x.s.statut!=='EXPEDIEE').length;
  const nbExp = all.length - nbEnCours;
  const rows = all.filter(x => prodListFilter==='toutes' || (prodListFilter==='encours' ? x.s.statut!=='EXPEDIEE' : x.s.statut==='EXPEDIEE'));
  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:14px;">Commandes</h3>
        ${canEdit ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddProdCommandeForm()">+ Nouvelle commande</button>` : ''}
      </div>
      <div id="prod-cmd-form-zone"></div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        ${[['encours','En cours ('+nbEnCours+')'],['expediees','Expédiées ('+nbExp+')'],['toutes','Toutes']].map(([k,l]) =>
          `<button class="btn ${prodListFilter===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:6px 4px;font-size:11px;" onclick="prodListFilter='${k}'; prodRerender('${site}')">${l}</button>`).join('')}
      </div>
      ${rows.length===0 ? buildEmptyState(all.length===0 ? "Aucune commande" : "Aucune commande dans ce filtre") : rows.map(({id,c,s}) => {
        const nbRef = Object.keys(c.lignes||{}).length;
        const r = s.restes;
        const pos = site==='gadh'
          ? `Chez GADH <b>${r.chezGadh}</b> · Reste à couper ${r.resteACouper}`
          : [r.chezGadh?`GADH ${r.chezGadh}`:'', r.aControler?`À contrôler ${r.aControler}`:'', r.aEmballer?`À emballer ${r.aEmballer}`:'', r.pretAExpedier?`<b>Prêt ${r.pretAExpedier}</b>`:''].filter(Boolean).join(' · ') || (s.statut==='EXPEDIEE' ? 'Commande livrée' : 'Aucune pièce en cours');
        return `
        <div class="session-row" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:5px;" onclick="prodGo('${site}','fiche','${id}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="min-width:0;">
              <b style="font-size:13px;">${esc(c.nom)} <span style="font-weight:600;color:var(--ink-soft);">— ${esc(c.ref)}</span></b>
              <div style="font-size:10.5px;color:var(--ink-faint);">${esc(c.client||'—')} · ${c.annee} · ${nbRef} réf. · ${s.total} pcs</div>
            </div>
            ${prodStatutBadge(s.statut, true)}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${s.pctProd}%;height:100%;background:#3B82F6;"></div></div>
            <span style="font-size:10.5px;font-weight:800;width:92px;text-align:right;">Emballé ${s.pctProd}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:6px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${s.pctExp}%;height:100%;background:#10B981;"></div></div>
            <span style="font-size:10.5px;font-weight:800;width:92px;text-align:right;">Expédié ${s.pctExp}%</span>
          </div>
          <div style="font-size:10.5px;color:var(--ink-soft);">${pos}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  if(canEdit) prodBindCommandeForm();
}

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
      // Une référence/taille déjà utilisée par des bons ne peut pas être retirée de la commande.
      const utilisees = new Set();
      prodBonsCommande(f.editId).forEach(([id,b]) => Object.entries(b.lignes||{}).forEach(([rk,ts]) => Object.keys(ts).forEach(t => utilisees.add(rk+'|'+t))));
      const retirees = [...utilisees].filter(k => { const [rk,t] = k.split('|'); return !(lignes[rk] && lignes[rk].tailles[t]); });
      if(retirees.length){
        showToast(`Impossible de retirer ${retirees.map(k=>{const [rk,t]=k.split('|'); return prodRefName(rk)+' '+t;}).slice(0,3).join(', ')} : des bons existent déjà dessus.`);
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
// FICHE COMMANDE
// ============================================================
let prodFicheShowAnnules = false;
function renderProdFiche(container, site){
  const cmdId = prodNav[site].cmdId;
  const cmd = getProdCommandes()[cmdId];
  if(!cmd){ prodNav[site].view = 'list'; renderProdListe(container, site); return; }
  const cum = prodCumuls(cmdId);
  const s = prodSynthese(cmdId, null, cum);
  const viol = prodViolations(cum);
  const canEdit = prodCanEditSite(site);
  const r = s.restes;
  const tuile = (val, lbl, color, bold) => `<div class="kpi-mini" style="min-height:62px;${bold?'border-color:'+color+';':''}"><div class="kpi-mini-val" style="color:${val>0?color:'var(--ink-faint)'};">${val}</div><div class="kpi-mini-lbl">${lbl}</div></div>`;
  const actions = site==='gadh'
    ? (canEdit ? `<button class="btn btn-primary" style="width:100%;padding:10px;" onclick="prodOpenBon('gadh','retour','${cmdId}')">+ Bon de retour vers TEK-TREND</button>` : '')
    : (canEdit ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${['coupe','controle','emballage','expedition'].map(et => `<button class="btn btn-ghost" style="padding:9px 4px;font-size:11.5px;border-color:${PROD_ETAPE_INFO[et].color};" onclick="prodOpenBon('tek','${et}','${cmdId}')">+ ${PROD_ETAPE_INFO[et].label}</button>`).join('')}
      </div>
      <button class="btn btn-ghost" style="width:100%;margin-top:6px;padding:7px;font-size:11.5px;" onclick="prodEditFromFiche('${cmdId}')">Modifier la commande</button>` : '');

  const bons = prodBonsCommande(cmdId, true).filter(([id,b]) => prodFicheShowAnnules || !b.annule);
  const nbAnnules = prodBonsCommande(cmdId, true).filter(([id,b]) => b.annule).length;

  container.innerHTML = `
    <style>.prod-table th,.prod-table td{padding:6px 2px !important;letter-spacing:0 !important;}.prod-table th{text-transform:none !important;font-size:10px !important;font-weight:800;}</style>
    <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;margin-bottom:8px;" onclick="prodGo('${site}','list')">← Commandes</button>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div><b style="font-size:15px;">${esc(cmd.nom)}</b><div style="font-size:11.5px;color:var(--ink-soft);">LOT ${esc(cmd.ref)} · ${esc(cmd.client||'—')} · ${cmd.annee}</div></div>
        ${prodStatutBadge(s.statut)}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <div style="flex:1;height:7px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${s.pctProd}%;height:100%;background:#3B82F6;"></div></div>
        <span style="font-size:11px;font-weight:800;width:118px;text-align:right;">Emballé ${s.embCap}/${s.total}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:5px;">
        <div style="flex:1;height:7px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${s.pctExp}%;height:100%;background:#10B981;"></div></div>
        <span style="font-size:11px;font-weight:800;width:118px;text-align:right;">Expédié ${s.expCap}/${s.total}</span>
      </div>
    </div>

    ${viol.length ? `
    <div class="card" style="border:1.5px solid var(--bad);">
      <b style="font-size:12.5px;color:var(--bad);">⚠️ ${viol.length} incohérence${viol.length>1?'s':''} à corriger</b>
      <p style="font-size:11px;color:var(--ink-soft);margin:4px 0 6px;">Des quantités ont été saisies à une étape sans passer par l'étape précédente (saisies faites avant les bons). Enregistrez les bons manquants ou annulez le bon en cause.</p>
      ${viol.slice(0,6).map(v => `<div style="font-size:11px;">• ${esc(prodRefName(v.rk))} ${v.t} : ${esc(v.msg)}</div>`).join('')}
      ${viol.length>6 ? `<div style="font-size:11px;color:var(--ink-faint);">… et ${viol.length-6} autre(s)</div>` : ''}
    </div>` : ''}

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">Où sont les pièces</h3>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px;">
        ${tuile(r.resteACouper,'Reste à couper','#F59E0B')}
        ${tuile(r.chezGadh,'Chez GADH','#8E2A5B')}
        ${tuile(r.aControler,'À contrôler','#3B82F6')}
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px;">
        ${tuile(r.aEmballer,'À emballer','#0EA5A4')}
        ${tuile(r.pretAExpedier,'Prêt à expédier','#10B981', r.pretAExpedier>0)}
        ${tuile(r.resteALivrer,'Reste à livrer','#DC2626')}
      </div>
      ${r.rebut>0 ? `<p style="font-size:11px;color:var(--bad);margin:2px 0 0;">Rebut (non conformes) : <b>${r.rebut}</b> pièce${r.rebut>1?'s':''}</p>` : ''}
    </div>

    ${actions ? `<div class="card">${actions}</div>` : ''}

    ${Object.entries(cmd.lignes||{}).map(([rk,l]) => {
      const sr = prodSynthese(cmdId, rk, cum);
      const tailles = PROD_TAILLES.filter(t => l.tailles && l.tailles[t]);
      let tot = {cmd:0, coupe:0, retour:0, controle:0, nc:0, emballage:0, expedition:0};
      const rowsHtml = tailles.map(t => {
        const q = prodCmdQty(cmd, rk, t), c = prodCell(cum, rk, t);
        tot.cmd+=q; tot.coupe+=c.coupe; tot.retour+=c.retour; tot.controle+=c.controle; tot.nc+=c.nc; tot.emballage+=c.emballage; tot.expedition+=c.expedition;
        const reste = Math.max(0, q - c.expedition);
        return `<tr>
          <td style="font-weight:800;">${t}</td><td>${q}</td><td>${c.coupe}</td><td>${c.retour}</td>
          <td>${c.controle}${c.nc?`<span style="color:var(--bad);font-size:9.5px;"> −${c.nc}</span>`:''}</td>
          <td>${c.emballage}</td><td>${c.expedition}</td>
          <td style="font-weight:800;color:${reste>0?'var(--bad)':'var(--good)'};">${reste}</td></tr>`;
      }).join('');
      return `
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <b style="font-size:13px;">${esc(prodRefName(rk))}</b>${prodStatutBadge(sr.statut, true)}
        </div>
        <div style="overflow-x:auto;">
          <table class="prod-table" style="width:100%;font-size:11px;border-collapse:collapse;text-align:center;">
            <thead><tr style="color:var(--ink-faint);"><th style="text-align:left;">T.</th><th>Cmd</th><th>Coupé</th><th>Retour</th><th>Ctrl</th><th>Emb.</th><th>Exp.</th><th>Reste</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr style="font-weight:800;border-top:1.5px solid var(--border);"><td style="text-align:left;">Total</td><td>${tot.cmd}</td><td>${tot.coupe}</td><td>${tot.retour}</td><td>${tot.controle}${tot.nc?`<span style="color:var(--bad);font-size:9.5px;"> −${tot.nc}</span>`:''}</td><td>${tot.emballage}</td><td>${tot.expedition}</td><td>${Math.max(0,tot.cmd-tot.expedition)}</td></tr></tfoot>
          </table>
        </div>
      </div>`;
    }).join('')}

    <div class="card">
      <div class="flex-header" style="margin-bottom:6px;"><h3 style="margin:0;font-size:13px;">Historique des bons</h3>
        ${nbAnnules ? `<button class="btn btn-ghost" style="padding:4px 8px;font-size:10.5px;" onclick="prodFicheShowAnnules=!prodFicheShowAnnules; prodRerender('${site}')">${prodFicheShowAnnules?'Masquer':'Voir'} les annulés (${nbAnnules})</button>` : ''}
      </div>
      ${bons.length===0 ? buildEmptyState("Aucun bon enregistré", canEdit ? "Utilisez les boutons ci-dessus pour enregistrer la première opération." : "") : bons.map(([id,b]) => {
        const info = PROD_ETAPE_INFO[b.etape] || {label:b.etape, color:'#999', site:'tek'};
        const canCancel = canEdit && !b.annule && info.site===site;
        const detail = Object.entries(b.lignes||{}).map(([rk,ts]) => `${esc(prodRefName(rk))} : ${Object.entries(ts).map(([t,q])=>`${t} ${q}`).join(' · ')}`).join('<br>');
        return `
        <div class="session-row" style="flex-direction:column;align-items:stretch;gap:3px;${b.annule?'opacity:.5;':''}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:10px;font-weight:800;color:#fff;background:${info.color};padding:2px 7px;border-radius:8px;">${info.label}</span>
            <span style="font-size:11px;color:var(--ink-faint);">${(b.date||'').split('-').reverse().join('/')}</span>
          </div>
          <div style="font-size:12px;"><b>${prodBonTotal(b)} pcs</b>${b.etape==='controle' && prodBonNcTotal(b) ? ` <span style="color:var(--bad);">(dont ${prodBonNcTotal(b)} rebut)</span>` : ''}${b.reprise?' <span style="font-size:10px;color:var(--warn);font-weight:700;">REPRISE</span>':''}${b.annule?' <span style="font-size:10px;color:var(--bad);font-weight:800;">ANNULÉ</span>':''}</div>
          <div style="font-size:10.5px;color:var(--ink-soft);line-height:1.5;">${detail}</div>
          ${b.observation ? `<div style="font-size:10.5px;color:var(--ink-faint);font-style:italic;">${esc(b.observation)}</div>` : ''}
          <div style="font-size:10px;color:var(--ink-faint);">Par ${esc(b.createdBy||'—')}${b.annule?` · annulé par ${esc(b.annulePar||'—')}`:''}</div>
          ${canCancel ? `<button class="btn btn-ghost" style="align-self:flex-start;padding:4px 9px;font-size:10.5px;color:var(--bad);" onclick="prodAnnulerBon('${id}','${site}')">Annuler ce bon</button>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}
window.prodEditFromFiche = (cmdId) => {
  prodGo('tek','list');
  if(typeof window.showEditProdCommandeForm === 'function') window.showEditProdCommandeForm(cmdId);
};
window.prodAnnulerBon = (bonId, site) => {
  const bons = getProdBons();
  const b = bons[bonId];
  if(!b || b.annule) return;
  // On refuse l'annulation si elle crée une incohérence nouvelle (les pièces ont déjà
  // été utilisées par une étape suivante) ; les incohérences déjà présentes ne bloquent pas.
  const avant = new Set(prodViolations(prodCumuls(b.commandeId)).map(prodViolationKey));
  const nouvelles = prodViolations(prodCumuls(b.commandeId, bonId)).filter(v => !avant.has(prodViolationKey(v)));
  if(nouvelles.length){
    const v = nouvelles[0];
    showToast(`Annulation impossible : ${prodRefName(v.rk)} ${v.t} — ${v.msg}. Annulez d'abord les bons des étapes suivantes.`);
    return;
  }
  if(!confirm(`Annuler ce bon ${PROD_ETAPE_INFO[b.etape].label} de ${prodBonTotal(b)} pièces ?\n\nIl restera visible dans l'historique (barré), mais ne comptera plus dans les quantités.`)) return;
  b.annule = true;
  b.annulePar = currentUser.nom;
  b.annuleLe = new Date().toISOString();
  saveProdBons(bons);
  showToast('Bon annulé');
  prodRerender(site);
};

// ============================================================
// SAISIE RAPIDE D'UN BON
// ============================================================
// 3 gestes : étape → commande (auto si une seule) → grille déjà remplie avec
// le disponible → Valider. On ne touche qu'aux cases qui diffèrent.
function prodBonEtapesPourSite(site){ return site==='gadh' ? ['retour'] : ['coupe','controle','emballage','expedition']; }
function prodBonCommandesEligibles(etape){
  return activeProdCommandes().filter(([id,c]) => {
    const cum = prodCumuls(id);
    if(etape==='coupe'){
      const s = prodSynthese(id, null, cum);
      return s.statut!=='EXPEDIEE' && s.restes.resteACouper>0;
    }
    return Object.values(cum).some(ts => Object.values(ts).some(cell => prodDisponible(etape, cell) > 0));
  });
}
function prodInitBonState(site, etape, cmdId){
  prodBon = {site, etape: etape||null, cmdId: null, date: getTodayISO(), observation: '', qty: {}, nc: {}};
  if(prodBon.etape){
    const elig = prodBonCommandesEligibles(prodBon.etape).map(([id])=>id);
    if(cmdId && elig.includes(cmdId)) prodBon.cmdId = cmdId;
    else if(!cmdId && elig.length===1) prodBon.cmdId = elig[0];
    else if(cmdId){ prodBon.cmdId = null; prodBon.cmdNonEligible = cmdId; }
  }
  prodBonPrefill('dispo');
}
// mode 'dispo' = tout le disponible ; 'zero' = tout à zéro
function prodBonPrefill(mode){
  prodBon.qty = {}; prodBon.nc = {};
  if(!prodBon.etape || !prodBon.cmdId) return;
  const cmd = getProdCommandes()[prodBon.cmdId];
  const cum = prodCumuls(prodBon.cmdId);
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => {
    const c = prodCell(cum, rk, t);
    const dispo = prodBon.etape==='coupe' ? Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe) : Math.max(0, prodDisponible(prodBon.etape, c));
    (prodBon.qty[rk] = prodBon.qty[rk] || {})[t] = mode==='zero' ? 0 : dispo;
    if(prodBon.etape==='controle') (prodBon.nc[rk] = prodBon.nc[rk] || {})[t] = 0;
  }));
}
// Vérifie le bon contre les cumuls À JOUR (un autre téléphone a pu enregistrer entre-temps).
function prodBonCheck(){
  const res = {total:0, totalNc:0, errors:[], cellErrors:{}};
  if(!prodBon || !prodBon.cmdId) return res;
  const cum = prodCumuls(prodBon.cmdId);
  Object.entries(prodBon.qty).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,raw]) => {
    const q = raw==='' || raw==null ? 0 : parseInt(raw);
    const k = rk+'|'+t;
    if(isNaN(q) || q<0){ res.errors.push(`${prodRefName(rk)} ${t} : quantité invalide`); res.cellErrors[k]='q'; return; }
    res.total += q;
    if(prodBon.etape!=='coupe'){
      const dispo = Math.max(0, prodDisponible(prodBon.etape, prodCell(cum, rk, t)));
      if(q > dispo){ res.errors.push(`${prodRefName(rk)} ${t} : ${q} demandé, ${dispo} disponible`); res.cellErrors[k]='q'; }
    }
    if(prodBon.etape==='controle'){
      const ncRaw = prodBon.nc[rk] && prodBon.nc[rk][t];
      const n = ncRaw==='' || ncRaw==null ? 0 : parseInt(ncRaw);
      if(isNaN(n) || n<0){ res.errors.push(`${prodRefName(rk)} ${t} : non conformes invalides`); res.cellErrors[k]='nc'; }
      else if(n > q){ res.errors.push(`${prodRefName(rk)} ${t} : ${n} non conformes pour ${q} contrôlées`); res.cellErrors[k]='nc'; }
      else res.totalNc += n;
    }
  }));
  return res;
}
// Mise à jour visuelle SANS redessiner (le clavier et le focus restent en place).
function prodBonRefresh(){
  const chk = prodBonCheck();
  document.querySelectorAll('#prod-bon-form-zone input.bon-q, #prod-bon-form-zone input.bon-nc').forEach(inp => {
    const k = inp.dataset.rk+'|'+inp.dataset.t;
    const bad = chk.cellErrors[k] === (inp.classList.contains('bon-nc') ? 'nc' : 'q');
    inp.style.borderColor = bad ? 'var(--bad)' : 'var(--border)';
    inp.style.background = bad ? '#FEF2F2' : '';
  });
  Object.keys(prodBon.qty).forEach(rk => {
    const el = document.getElementById('bon-reftot-'+rk.replace(/[^a-zA-Z0-9]/g,'_'));
    if(el) el.textContent = Object.values(prodBon.qty[rk]).reduce((s,v)=>s+(parseInt(v)||0),0) + ' pcs';
  });
  const tot = document.getElementById('bon-total');
  if(tot) tot.textContent = prodBon.etape==='controle'
    ? `${chk.total} contrôlées · ${chk.total - chk.totalNc} conformes · ${chk.totalNc} rebut`
    : `${chk.total} pièces`;
  const err = document.getElementById('bon-errors');
  if(err) err.innerHTML = chk.errors.length ? chk.errors.slice(0,4).map(e=>`<div>• ${esc(e)}</div>`).join('') + (chk.errors.length>4?`<div>… et ${chk.errors.length-4} autre(s)</div>`:'') : '';
  const btn = document.getElementById('bon-valider');
  if(btn){ const ok = chk.errors.length===0 && chk.total>0; btn.disabled = !ok; btn.style.opacity = ok ? '1' : '.45'; }
  return chk;
}
window.prodBonSet = (rk, t, field, val) => {
  const target = field==='nc' ? prodBon.nc : prodBon.qty;
  if(!target[rk]) target[rk] = {};
  target[rk][t] = val;
  prodBonRefresh();
};
window.prodBonChoisirEtape = (et) => { prodInitBonState(prodBon.site, et, prodBon.cmdId); prodRerender(prodBon.site); };
window.prodBonChoisirCommande = (id) => { prodBon.cmdId = id || null; prodBon.cmdNonEligible = null; prodBonPrefill('dispo'); prodRerender(prodBon.site); };
window.prodBonRemplir = (mode) => { prodBonPrefill(mode); prodRerender(prodBon.site); };
window.prodBonValider = () => {
  const chk = prodBonRefresh();
  if(chk.errors.length || chk.total<=0){ showToast(chk.total<=0 ? 'Le bon est vide' : 'Corrigez les cases en rouge'); return; }
  const lignes = {}, nc = {};
  Object.entries(prodBon.qty).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,raw]) => {
    const q = parseInt(raw)||0;
    if(q<=0) return;
    (lignes[rk] = lignes[rk] || {})[t] = q;
    if(prodBon.etape==='controle'){
      const n = parseInt(prodBon.nc[rk] && prodBon.nc[rk][t])||0;
      if(n>0) (nc[rk] = nc[rk] || {})[t] = n;
    }
  }));
  if(!prodBon.date){ showToast('Indiquez la date du bon'); return; }
  const bons = getProdBons();
  const id = 'bon'+Date.now()+Math.floor(Math.random()*1000);
  bons[id] = {
    etape: prodBon.etape, commandeId: prodBon.cmdId, date: prodBon.date, lignes,
    observation: (prodBon.observation||'').trim(),
    createdBy: currentUser.nom, createdAt: new Date().toISOString()
  };
  if(prodBon.etape==='controle') bons[id].nc = nc;
  saveProdBons(bons);
  const total = prodBonTotal(bons[id]);
  showToast(`${PROD_ETAPE_INFO[prodBon.etape].label} enregistré : ${total} pièces`);
  // On reste sur la même étape/commande pour enchaîner ; la grille se remplit avec le nouveau disponible.
  prodInitBonState(prodBon.site, prodBon.etape, prodBon.cmdId);
  prodRerender(prodBon.site);
};
window.prodBonQuitter = () => {
  const site = prodBon ? prodBon.site : 'tek';
  // Après le dernier bon d'une étape, la commande n'est plus « éligible » : on revient quand même sur sa fiche.
  const cmdId = prodBon && (prodBon.cmdId || prodBon.cmdNonEligible);
  prodBon = null;
  if(cmdId) prodGo(site, 'fiche', cmdId); else prodGo(site, 'list');
};

function renderProdBonForm(container, site){
  if(!prodCanEditSite(site)){ container.innerHTML = `<div class="card">${buildEmptyState("Lecture seule", "Votre rôle ne permet pas d'enregistrer des bons.")}</div>`; return; }
  if(!prodBon || prodBon.site!==site) prodInitBonState(site, site==='gadh' ? 'retour' : null, null);
  const etapes = prodBonEtapesPourSite(site);
  const elig = prodBon.etape ? prodBonCommandesEligibles(prodBon.etape) : [];
  const cmd = prodBon.cmdId ? getProdCommandes()[prodBon.cmdId] : null;
  const cum = cmd ? prodCumuls(prodBon.cmdId) : null;
  const info = prodBon.etape ? PROD_ETAPE_INFO[prodBon.etape] : null;
  const nonElig = prodBon.cmdNonEligible ? getProdCommandes()[prodBon.cmdNonEligible] : null;

  let nbMasquees = 0;
  const grille = !cmd ? '' : Object.entries(cmd.lignes||{}).map(([rk,l]) => {
    // Les tailles où rien n'est disponible sont masquées : la grille ne montre que ce qui peut être saisi.
    const tailles = PROD_TAILLES.filter(t => l.tailles && l.tailles[t]).filter(t => {
      if(prodBon.etape==='coupe') return true;
      const ok = prodDisponible(prodBon.etape, prodCell(cum, rk, t)) > 0;
      if(!ok) nbMasquees++;
      return ok;
    });
    if(tailles.length===0) return '';
    const rows = tailles.map(t => {
      const c = prodCell(cum, rk, t);
      const qc = prodCmdQty(cmd, rk, t);
      const dispo = prodBon.etape==='coupe' ? null : Math.max(0, prodDisponible(prodBon.etape, c));
      const bloque = dispo!==null && dispo<=0;
      const val = (prodBon.qty[rk] && prodBon.qty[rk][t]);
      const aide = prodBon.etape==='coupe'
        ? `cmd ${qc} · déjà ${c.coupe}`
        : (bloque ? 'rien de disponible' : `/ ${dispo} dispo`);
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-soft);">
          <span style="width:40px;font-weight:800;font-size:13px;">${t}</span>
          <input type="number" inputmode="numeric" enterkeyhint="next" min="0" class="bon-q" data-rk="${rk}" data-t="${t}" value="${bloque?0:(val==null?'':val)}" ${bloque?'disabled':''}
            onfocus="this.select()" oninput="prodBonSet('${rk}','${t}','q',this.value)"
            style="width:74px;padding:8px 6px;text-align:center;font-size:15px;font-weight:700;border:1.5px solid var(--border);border-radius:8px;${bloque?'opacity:.4;':''}">
          ${prodBon.etape==='controle' ? `
          <span style="font-size:10px;color:var(--bad);font-weight:800;">NC</span>
          <input type="number" inputmode="numeric" enterkeyhint="next" min="0" class="bon-nc" data-rk="${rk}" data-t="${t}" value="${(prodBon.nc[rk] && prodBon.nc[rk][t]) || 0}" ${bloque?'disabled':''}
            onfocus="this.select()" oninput="prodBonSet('${rk}','${t}','nc',this.value)"
            style="width:54px;padding:8px 4px;text-align:center;font-size:14px;border:1.5px solid var(--border);border-radius:8px;${bloque?'opacity:.4;':''}">` : ''}
          <span style="font-size:10.5px;color:var(--ink-faint);flex:1;text-align:right;">${aide}</span>
        </div>`;
    }).join('');
    return `
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <b style="font-size:13px;">${esc(prodRefName(rk))}</b>
          <span id="bon-reftot-${rk.replace(/[^a-zA-Z0-9]/g,'_')}" style="font-size:11.5px;font-weight:800;color:var(--ink-soft);"></span>
        </div>
        ${rows}
      </div>`;
  }).join('');

  container.innerHTML = `
    <div id="prod-bon-form-zone">
      <div class="card" style="padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin-bottom:6px;">1. ÉTAPE</div>
        ${site==='gadh'
          ? `<div style="font-weight:800;color:${PROD_ETAPE_INFO.retour.color};">Retour GADH → TEK-TREND (pièces assemblées)</div>`
          : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${etapes.map(et => `<button class="btn ${prodBon.etape===et?'btn-primary':'btn-ghost'}" style="padding:11px 4px;font-size:12px;${prodBon.etape===et?'background:'+PROD_ETAPE_INFO[et].color+';border-color:'+PROD_ETAPE_INFO[et].color+';':''}" onclick="prodBonChoisirEtape('${et}')">${PROD_ETAPE_INFO[et].label}</button>`).join('')}
            </div>`}
      </div>

      ${prodBon.etape ? `
      <div class="card" style="padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin-bottom:6px;">2. COMMANDE</div>
        ${nonElig ? `<p style="font-size:11px;color:var(--warn);margin:0 0 6px;">${esc(prodCmdLabel(nonElig))} : rien n'est disponible pour l'étape ${info.label}.</p>` : ''}
        ${elig.length===0
          ? `<p style="font-size:12px;color:var(--ink-soft);margin:0;">Aucune commande n'a de pièces disponibles pour l'étape <b>${info.label}</b>.</p>`
          : `<select onchange="prodBonChoisirCommande(this.value)" style="width:100%;">
              <option value="">— Choisir —</option>
              ${elig.map(([id,c]) => `<option value="${id}" ${prodBon.cmdId===id?'selected':''}>${esc(c.nom)} — ${esc(c.ref)} (${esc(c.client||'')})</option>`).join('')}
            </select>`}
      </div>` : ''}

      ${cmd ? `
      <div class="card" style="padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin-bottom:6px;">3. QUANTITÉS ${prodBon.etape==='controle' ? '(contrôlées + non conformes)' : ''}</div>
        <p style="font-size:11px;color:var(--ink-soft);margin:0 0 8px;">${prodBon.etape==='coupe'
          ? 'Pré-rempli avec le reste à couper. Vous pouvez couper plus que la commande (marge).'
          : prodBon.etape==='controle'
            ? 'Pré-rempli avec tout ce qui est à contrôler. Saisissez seulement les non conformes : ils partent au rebut.'
            : 'Pré-rempli avec tout le disponible. Corrigez seulement les cases qui diffèrent.'}</p>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="btn btn-ghost" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodBonRemplir('dispo')">Tout le disponible</button>
          <button class="btn btn-ghost" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="prodBonRemplir('zero')">Tout à zéro</button>
        </div>
        <div style="display:flex;gap:8px;">
          <div class="field" style="flex:1;margin:0;"><label>Date</label><input type="date" value="${prodBon.date}" max="${getTodayISO()}" onchange="prodBon.date=this.value"></div>
        </div>
      </div>
      ${grille}
      ${nbMasquees ? `<p style="font-size:10.5px;color:var(--ink-faint);text-align:center;margin:0 0 8px;">${nbMasquees} taille${nbMasquees>1?'s':''} sans pièce disponible à cette étape (masquée${nbMasquees>1?'s':''})</p>` : ''}
      <div class="card" style="padding:10px;position:sticky;bottom:78px;z-index:5;box-shadow:0 -4px 16px rgba(15,23,42,.10);">
        <div class="field" style="margin:0 0 8px;"><input placeholder="Observation (optionnel)" value="${esc(prodBon.observation)}" oninput="prodBon.observation=this.value"></div>
        <div id="bon-errors" style="font-size:11px;color:var(--bad);margin-bottom:6px;"></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;font-size:12.5px;font-weight:800;" id="bon-total"></div>
          <button class="btn btn-ghost" style="padding:10px 12px;" onclick="prodBonQuitter()">Fermer</button>
          <button class="btn btn-primary" id="bon-valider" style="padding:10px 16px;" onclick="prodBonValider()">Valider</button>
        </div>
      </div>` : `
      <div class="card" style="padding:10px;"><button class="btn btn-ghost" style="width:100%;" onclick="prodBonQuitter()">Fermer</button></div>`}
    </div>
  `;
  // Touche « Suivant » du clavier : passe à la case suivante au lieu de valider le formulaire.
  const zone = document.getElementById('prod-bon-form-zone');
  zone.addEventListener('keydown', (e) => {
    if(e.key!=='Enter' || e.target.tagName!=='INPUT' || e.target.type!=='number') return;
    e.preventDefault();
    const inputs = [...zone.querySelectorAll('input.bon-q:not([disabled]), input.bon-nc:not([disabled])')];
    const i = inputs.indexOf(e.target);
    if(i>=0 && i<inputs.length-1) inputs[i+1].focus(); else e.target.blur();
  });
  if(cmd) prodBonRefresh();
}
