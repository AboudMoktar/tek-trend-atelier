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
const PROD_ETAPES = ['coupe','retour','confection','controle','emballage','expedition'];
const PROD_ETAPE_INFO = {
  coupe:      {label:'Coupe',        long:'Coupe (envoyé à la GADH)', col:'Coupé',  site:'tek',  amont:null},
  retour:     {label:'Retour GADH',  long:'Retour GADH → TEK-TREND',  col:'Retour', site:'gadh', amont:'coupe'},
  confection: {label:'Confection',   long:'Confection',               col:'Conf.',  site:'tek',  amont:'retour'},
  controle:   {label:'Contrôle',     long:'Contrôle (conformes)',     col:'Ctrl',   site:'tek',  amont:'confection'},
  emballage:  {label:'Emballage',    long:'Emballage',                col:'Emb.',   site:'tek',  amont:'controle'},
  expedition: {label:'Expédition',   long:'Expédition',               col:'Exp.',   site:'tek',  amont:'emballage'}
};
function prodEtapesSite(site){ return PROD_ETAPES.filter(e => PROD_ETAPE_INFO[e].site===site); }

// --- Saisies journalières : prod_saisies_<cmdId> = { 'AAAA-MM-JJ': { etape: { refKey: { taille: qte } } } } ---
function getProdSaisies(cmdId){ return getJSON('prod_saisies_'+cmdId, {}); }
function saveProdSaisies(cmdId, s){ setJSON('prod_saisies_'+cmdId, s); }

// --- Cumuls à date, par référence/taille ---
function prodEmptyCell(){ return {coupe:0, retour:0, confection:0, controle:0, rebut:0, emballage:0, expedition:0}; }
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

// Quantité déjà passée à une étape (le contrôle compte conformes + rebut)
function prodSortieEtape(etape, c){ return etape==='controle' ? c.controle + c.rebut : c[etape]; }
// Ce qui reste disponible pour l'étape (null = pas de plafond : la coupe)
function prodDisponible(etape, c){
  const amont = PROD_ETAPE_INFO[etape].amont;
  if(!amont) return null;
  return c[amont] - prodSortieEtape(etape, c);
}
// Où sont les pièces
function prodRestes(c, q){
  return {
    resteACouper:  Math.max(0, q - c.coupe),
    aLaGadh:       Math.max(0, c.coupe - c.retour),
    enConfection:  Math.max(0, c.retour - c.confection),
    auControle:    Math.max(0, c.confection - c.controle - c.rebut),
    aEmballer:     Math.max(0, c.controle - c.emballage),
    pretAExpedier: Math.max(0, c.emballage - c.expedition),
    expedie:       c.expedition,
    resteALivrer:  Math.max(0, q - c.expedition),
    rebut:         c.rebut
  };
}
// Incohérences : une étape qui dépasse la précédente
function prodViolations(cum){
  const v = [];
  Object.entries(cum).forEach(([rk,ts]) => Object.entries(ts).forEach(([t,c]) => {
    if(c.retour > c.coupe) v.push({rk,t,code:'retour', msg:`retour ${c.retour} > coupé ${c.coupe}`});
    if(c.confection > c.retour) v.push({rk,t,code:'confection', msg:`confection ${c.confection} > retour ${c.retour}`});
    if(c.controle + c.rebut > c.confection) v.push({rk,t,code:'controle', msg:`contrôle ${c.controle}${c.rebut?' + rebut '+c.rebut:''} > confection ${c.confection}`});
    if(c.emballage > c.controle) v.push({rk,t,code:'emballage', msg:`emballé ${c.emballage} > conformes ${c.controle}`});
    if(c.expedition > c.emballage) v.push({rk,t,code:'expedition', msg:`expédié ${c.expedition} > emballé ${c.emballage}`});
  }));
  return v;
}
function prodViolationKey(v){ return v.rk+'|'+v.t+'|'+v.code; }

// --- Statut automatique : l'étape la plus avancée atteinte ---
const PROD_STATUTS = {
  TRAITEMENT: {label:'En traitement',          color:'#9CA3AF'},
  COUPE:      {label:'En coupe',               color:'#F59E0B'},
  GADH:       {label:'À la GADH',              color:'#8E2A5B'},
  RETOUR:     {label:'Retour à TEK-TREND',     color:'#7C3AED'},
  CONFECTION: {label:'En cours de confection', color:'#2563EB'},
  CONTROLE:   {label:'Contrôle',               color:'#0891B2'},
  EMBALLAGE:  {label:'Emballage',              color:'#0D9488'},
  PRET:       {label:'Prêt à expédier',        color:'#059669'},
  PARTIEL:    {label:'Expédié en partie',      color:'#65A30D'},
  EXPEDIE:    {label:'Expédié',                color:'#15803D'}
};
// items = [{c, q}] : une taille, un modèle ou toute une commande.
// Les fins d'étape (tout coupé, tout emballé, tout expédié) se vérifient taille par
// taille, plafonnées à la commande : un surplus sur une taille ne cache pas un manque ailleurs.
function prodStatut(items){
  let total=0, capCoupe=0, capEmb=0, capExp=0;
  const any = {coupe:0, retour:0, confection:0, controle:0, emballage:0, expedition:0};
  items.forEach(({c,q}) => {
    total += q;
    capCoupe += Math.min(c.coupe, q); capEmb += Math.min(c.emballage, q); capExp += Math.min(c.expedition, q);
    any.coupe += c.coupe; any.retour += c.retour; any.confection += c.confection;
    any.controle += c.controle + c.rebut; any.emballage += c.emballage; any.expedition += c.expedition;
  });
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
  const restes = {resteACouper:0, aLaGadh:0, enConfection:0, auControle:0, aEmballer:0, pretAExpedier:0, expedie:0, resteALivrer:0, rebut:0};
  let total=0, capExp=0, capEmb=0;
  items.forEach(({c,q}) => {
    total += q; capExp += Math.min(c.expedition, q); capEmb += Math.min(c.emballage, q);
    const r = prodRestes(c, q);
    Object.keys(restes).forEach(k => { restes[k] += r[k]; });
  });
  return {
    total, restes, statut: prodStatut(items),
    pctPret: total ? Math.min(100, Math.round(capEmb/total*100)) : 0,
    pctExp: total ? Math.min(100, Math.round(capExp/total*100)) : 0
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

// ============================================================
// NAVIGATION (commune TEK-TREND / GADH)
// ============================================================
const prodNav = { tek: {view:'list', cmdId:null}, gadh: {view:'list', cmdId:null} };
let prodListFilter = 'encours';
let prodSaisie = null; // saisie du jour en cours
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
      <button class="btn ${v!=='saisie'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 4px;font-size:12.5px;" onclick="prodGo('${site}','list')">Commandes</button>
      ${canEdit ? `<button class="btn ${v==='saisie'?'btn-primary':'btn-ghost'}" style="flex:1;padding:9px 4px;font-size:12.5px;" onclick="prodOuvrirSaisie('${site}', ${v==='fiche'&&prodNav[site].cmdId?`'${prodNav[site].cmdId}'`:'null'})">+ Saisie du jour</button>` : ''}
    </div>
    <div id="prod-body-${site}"></div>
  `;
  const body = document.getElementById('prod-body-'+site);
  if(v==='fiche') renderProdFiche(body, site);
  else if(v==='saisie') renderProdSaisie(body, site);
  else renderProdListe(body, site);
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
  return parts.join(' · ');
}
function renderProdListe(container, site){
  const canEdit = site==='tek' && canEditProdTek();
  const all = activeProdCommandes().map(([id,c]) => ({id, c, s: prodSynthese(id)}));
  const nbEnCours = all.filter(x => x.s.statut!=='EXPEDIE').length;
  const rows = all.filter(x => prodListFilter==='toutes' || (prodListFilter==='encours' ? x.s.statut!=='EXPEDIE' : x.s.statut==='EXPEDIE'));
  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:14px;">Commandes</h3>
        ${canEdit ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddProdCommandeForm()">+ Nouvelle commande</button>` : ''}
      </div>
      <div id="prod-cmd-form-zone"></div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        ${[['encours',`En cours (${nbEnCours})`],['expediees',`Expédiées (${all.length-nbEnCours})`],['toutes','Toutes']].map(([k,l]) =>
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
          <div style="font-size:10.5px;color:var(--ink-soft);">${prodPositionTexte(s.restes) || (s.statut==='EXPEDIE' ? 'Commande livrée' : 'Rien de commencé')}</div>
        </div>`).join('')}
    </div>
  `;
  if(canEdit) prodBindCommandeForm();
}

// ============================================================
// FICHE COMMANDE : tableau façon Excel (cumuls par modèle et par taille)
// ============================================================
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

  const tables = Object.entries(cmd.lignes||{}).map(([rk,l]) => {
    const tailles = PROD_TAILLES.filter(t => l.tailles && l.tailles[t]);
    const tot = {q:0, ...prodEmptyCell()};
    const rows = tailles.map(t => {
      const q = prodCmdQty(cmd, rk, t), c = prodCell(cum, rk, t);
      Object.keys(tot).forEach(k => { tot[k] += (k==='q' ? q : c[k]); });
      const st = prodStatut([{c,q}]); statutsVus.add(st);
      return `<tr>
        <td style="text-align:left;font-weight:800;white-space:nowrap;"><span title="${PROD_STATUTS[st].label}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PROD_STATUTS[st].color};margin-right:3px;"></span>${t}</td>
        <td style="color:var(--ink-soft);">${q}</td><td>${c.coupe||''}</td><td>${c.retour||''}</td><td>${c.confection||''}</td>
        <td>${c.controle||''}${c.rebut?`<div style="font-size:9px;color:var(--bad);line-height:1;">−${c.rebut}</div>`:''}</td>
        <td>${c.emballage||''}</td><td style="font-weight:800;">${c.expedition||''}</td></tr>`;
    }).join('');
    const stModele = prodStatut(tailles.map(t => ({c: prodCell(cum, rk, t), q: prodCmdQty(cmd, rk, t)})));
    return `
      <div class="card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <b style="font-size:13px;">${esc(prodRefName(rk))}</b>${prodStatutBadge(stModele, true)}
        </div>
        <table class="prod-xl">
          <thead><tr><th style="text-align:left;">Taille</th><th>Cmd</th><th>Coupé</th><th>Retour</th><th>Conf.</th><th>Ctrl</th><th>Emb.</th><th>Exp.</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td style="text-align:left;">Total</td><td>${tot.q}</td><td>${tot.coupe}</td><td>${tot.retour}</td><td>${tot.confection}</td>
            <td>${tot.controle}${tot.rebut?`<div style="font-size:9px;color:var(--bad);line-height:1;">−${tot.rebut}</div>`:''}</td><td>${tot.emballage}</td><td>${tot.expedition}</td></tr></tfoot>
        </table>
      </div>`;
  }).join('');

  // Journal : ce qui a été saisi, date par date (touchez une ligne pour corriger)
  const dates = Object.keys(saisies).sort().reverse();
  const journal = dates.map(d => {
    const jour = saisies[d] || {};
    const lignes = PROD_ETAPES.filter(e => jour[e]).map(e => {
      let tot = 0; Object.values(jour[e]).forEach(ts => Object.values(ts).forEach(q => { tot += parseInt(q)||0; }));
      let reb = 0; if(e==='controle' && jour.rebut) Object.values(jour.rebut).forEach(ts => Object.values(ts).forEach(q => { reb += parseInt(q)||0; }));
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
      </div>
      ${canEdit ? `<button class="btn btn-primary" style="width:100%;margin-top:10px;padding:10px;" onclick="prodOuvrirSaisie('${site}','${cmdId}')">+ Saisie du jour</button>` : ''}
      ${site==='tek' && canEdit ? `<button class="btn btn-ghost" style="width:100%;margin-top:6px;padding:7px;font-size:11.5px;" onclick="prodEditFromFiche('${cmdId}')">Modifier la commande</button>` : ''}
    </div>

    ${viol.length ? `
    <div class="card" style="border:1.5px solid var(--bad);">
      <b style="font-size:12.5px;color:var(--bad);">⚠️ ${viol.length} incohérence${viol.length>1?'s':''} à corriger</b>
      <p style="font-size:11px;color:var(--ink-soft);margin:4px 0 6px;">Une étape dépasse la précédente (saisies reprises de l'ancienne version). Complétez l'étape manquante dans une saisie du jour.</p>
      ${viol.slice(0,6).map(v => `<div style="font-size:11px;">• ${esc(prodRefName(v.rk))} ${v.t} : ${esc(v.msg)}</div>`).join('')}
      ${viol.length>6 ? `<div style="font-size:11px;color:var(--ink-faint);">… et ${viol.length-6} autre(s)</div>` : ''}
    </div>` : ''}

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">Où sont les pièces</h3>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px;">
        ${tuile(r.resteACouper,'Reste à couper','#F59E0B')}${tuile(r.aLaGadh,'À la GADH','#8E2A5B')}${tuile(r.enConfection,'En confection','#2563EB')}
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px;">
        ${tuile(r.auControle,'Au contrôle','#0891B2')}${tuile(r.aEmballer,'À emballer','#0D9488')}${tuile(r.pretAExpedier,'Prêt à expédier','#059669', r.pretAExpedier>0)}
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
        ${tuile(r.expedie,'Expédié','#15803D')}${tuile(r.resteALivrer,'Reste à livrer','#DC2626')}${tuile(r.rebut,'Rebut','#DC2626')}
      </div>
    </div>

    ${tables}
    <p style="font-size:10.5px;color:var(--ink-faint);margin:-4px 4px 12px;line-height:1.7;">Pastille = statut de la taille : ${[...statutsVus].map(st => `<span style="white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PROD_STATUTS[st].color};"></span> ${PROD_STATUTS[st].label}</span>`).join(' · ')}. En rouge sous Ctrl : le rebut.</p>

    <div class="card">
      <h3 style="margin:0 0 4px;font-size:13px;">Saisies par date</h3>
      <p style="font-size:10.5px;color:var(--ink-faint);margin:0 0 4px;">${canEdit ? 'Touchez une ligne pour la corriger.' : ''}</p>
      ${journal || buildEmptyState("Aucune saisie", canEdit ? "Commencez par « + Saisie du jour »." : "")}
    </div>
  `;
}
window.prodEditFromFiche = (cmdId) => {
  prodGo('tek','list');
  if(typeof window.showEditProdCommandeForm === 'function') window.showEditProdCommandeForm(cmdId);
};

// ============================================================
// SAISIE DU JOUR : date + étape + quantités du jour (par modèle et par taille)
// ============================================================
function prodCommandesSaisissables(){
  return activeProdCommandes().filter(([id]) => prodSynthese(id).statut!=='EXPEDIE');
}
function prodInitSaisie(site, cmdId, date, etape){
  const etapes = prodEtapesSite(site);
  prodSaisie = {site, cmdId, date: date || getTodayISO(), etape: (etape && etapes.includes(etape)) ? etape : etapes[0], vals:{}, rebut:{}};
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
  if(prodSaisie.etape==='controle') prodSaisie.rebut = copie(jour.rebut);
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
  if(prodSaisie.etape==='controle'){ const rb = nettoie(prodSaisie.rebut); if(rb) jour.rebut = rb; else delete jour.rebut; }
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
  if(prodSaisie.etape==='controle') check(prodSaisie.rebut, 'rebut');
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
  if(tot) tot.textContent = `${chk.totalJour} pcs ce jour${prodSaisie.etape==='controle' && chk.rebutJour ? ' + '+chk.rebutJour+' rebut' : ''}`;
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
window.prodSjToutDispo = () => {
  const cmd = getProdCommandes()[prodSaisie.cmdId];
  const cum = prodCumulsFrom(cmd, getProdSaisies(prodSaisie.cmdId));
  const jour = getProdSaisies(prodSaisie.cmdId)[prodSaisie.date] || {};
  Object.entries(cmd.lignes||{}).forEach(([rk,l]) => Object.keys(l.tailles||{}).forEach(t => {
    const c = prodCell(cum, rk, t);
    const deja = parseInt(jour[prodSaisie.etape] && jour[prodSaisie.etape][rk] && jour[prodSaisie.etape][rk][t])||0;
    const rbDeja = prodSaisie.etape==='controle' ? (parseInt(jour.rebut && jour.rebut[rk] && jour.rebut[rk][t])||0) : 0;
    const dispo = prodSaisie.etape==='coupe' ? Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe) : Math.max(0, prodDisponible(prodSaisie.etape, c));
    const rb = parseInt(prodSaisie.rebut[rk] && prodSaisie.rebut[rk][t])||0;
    const v = deja + rbDeja + dispo - rb;
    if(!prodSaisie.vals[rk]) prodSaisie.vals[rk] = {};
    prodSaisie.vals[rk][t] = v>0 ? v : '';
  }));
  prodRerender(prodSaisie.site);
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
        const dejaJour = (parseInt(jour[prodSaisie.etape] && jour[prodSaisie.etape][rk] && jour[prodSaisie.etape][rk][t])||0)
                       + (prodSaisie.etape==='controle' ? (parseInt(jour.rebut && jour.rebut[rk] && jour.rebut[rk][t])||0) : 0);
        let aide, bloque = false;
        if(prodSaisie.etape==='coupe'){ aide = `reste ${Math.max(0, prodCmdQty(cmd,rk,t) - c.coupe)}`; }
        else { const max = dejaJour + Math.max(0, prodDisponible(prodSaisie.etape, c)); aide = `max ${max}`; bloque = max<=0; }
        return `<div style="text-align:center;flex:1;min-width:0;">
          ${quoi==='vals' ? `<div style="font-size:10px;font-weight:800;color:var(--ink-soft);margin-bottom:2px;">${t}</div>` : ''}
          <input type="number" inputmode="numeric" enterkeyhint="next" min="0" class="sj" data-rk="${rk}" data-t="${t}" value="${val}" ${bloque?'disabled':''}
            onfocus="this.select()" oninput="prodSjSet('${quoi}','${rk}','${t}',this.value)"
            style="width:100%;max-width:52px;padding:7px 2px;text-align:center;font-size:14px;font-weight:700;border:1.5px solid var(--border);border-radius:7px;${bloque?'opacity:.35;':''}${quoi==='rebut'?'color:var(--bad);':''}">
          ${quoi==='vals' ? `<div style="font-size:9.5px;color:var(--ink-faint);margin-top:2px;white-space:nowrap;">${aide}</div>` : ''}
        </div>`;
      }).join('');
      return `
        <div class="card" style="padding:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <b style="font-size:13px;">${esc(prodRefName(rk))}</b>
            <span id="sj-tot-${rk.replace(/[^a-zA-Z0-9]/g,'_')}" style="font-size:11.5px;font-weight:800;color:var(--ink-soft);"></span>
          </div>
          ${prodSaisie.etape==='controle' ? `<div style="font-size:10px;font-weight:800;color:var(--ink-faint);margin-bottom:2px;">CONFORMES</div>` : ''}
          <div style="display:flex;gap:4px;">${ligne('vals')}</div>
          ${prodSaisie.etape==='controle' ? `<div style="font-size:10px;font-weight:800;color:var(--bad);margin:8px 0 2px;">REBUT (non conformes)</div><div style="display:flex;gap:4px;">${ligne('rebut')}</div>` : ''}
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
          ${etapes.map(e => `<button class="btn ${prodSaisie.etape===e?'btn-primary':'btn-ghost'}" style="padding:9px 2px;font-size:11.5px;" onclick="prodSjEtape('${e}')">${PROD_ETAPE_INFO[e].label}</button>`).join('')}
        </div>` : `<div style="font-weight:800;color:#8E2A5B;">${info.long}</div>`}
      </div>
      ${!cmd ? (choix.length ? '' : `<div class="card">${buildEmptyState("Aucune commande en cours")}</div>`) : `
      <p style="font-size:11px;color:var(--ink-soft);margin:0 4px 8px;">Quantités faites <b>ce jour-là</b> à l'étape ${info.long}. ${prodSaisie.etape==='coupe' ? 'Couper plus que la commande est permis (marge).' : 'Le maximum affiché est ce qui est disponible.'}</p>
      ${grille}
      <div class="card" style="padding:10px;position:sticky;bottom:78px;z-index:5;box-shadow:0 -4px 16px rgba(15,23,42,.10);">
        <div id="sj-erreurs" style="font-size:11px;color:var(--bad);margin-bottom:6px;"></div>
        <div style="font-size:13px;font-weight:800;margin-bottom:8px;" id="sj-total"></div>
        <div style="display:flex;align-items:center;gap:6px;">
          ${prodSaisie.etape!=='coupe' ? `<button class="btn btn-ghost" style="flex:1;padding:10px 4px;font-size:12px;" onclick="prodSjToutDispo()">Tout le dispo</button>` : ''}
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
