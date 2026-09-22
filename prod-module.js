// ============================================================
// SUIVI DE PRODUCTION — TEK-TREND ⇄ GADH TUNISIA (v2, par taille)
// ============================================================
// Suite à la vérification avec le fichier réel de flux de commande, la
// structure a été simplifiée pour coller à l'usage réel :
//  - suivi par TAILLE (XS/S/M/L/XL/XXL/XXXL) pour chaque référence
//  - 4 étapes cumulatives (pas de détail horaire) : Coupé/Envoyé GADH,
//    Assemblé/Retourné, Contrôlé (conforme/non conforme), Emballé
//  - aucun blocage strict : une quantité peut dépasser l'étape précédente
//    (marge de sécurité à la coupe), un simple repère visuel suffit
//  - toujours aucun champ "opérateur"
//  - données partagées (traçabilité) mais interface séparée par société

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
function saveProdReferences(list){ setJSON('prod_references', list); }
function activeProdReferences(){
  return Object.entries(getProdReferences()).filter(([k,r])=>r.actif!==false)
    .sort((a,b)=> (a[1].famille+a[1].variante).localeCompare(b[1].famille+b[1].variante));
}

// --- Commandes : { numero, dateCreation, lignes: { refKey: { tailles: {taille: qte} } } } ---
function getProdCommandes(){ return getJSON('prod_commandes', {}); }
function saveProdCommandes(list){ setJSON('prod_commandes', list); }
function activeProdCommandes(){
  return Object.entries(getProdCommandes()).sort((a,b)=> (b[1].dateCreation||'').localeCompare(a[1].dateCreation||''));
}
function prodLigneTotal(ligne){
  return Object.values(ligne.tailles||{}).reduce((s,v)=>s+(parseInt(v)||0), 0);
}

// --- Les 4 étapes cumulatives, clé = "<commandeId>|<refKey>|<taille>" ---
function getProdStage(stage){ return getJSON('prod_stage_'+stage, {}); }
function saveProdStage(stage, data){ setJSON('prod_stage_'+stage, data); }
function prodKey(commandeId, refKey, taille){ return commandeId+'|'+refKey+'|'+taille; }
function prodStageQty(stage, commandeId, refKey, taille){
  const v = getProdStage(stage)[prodKey(commandeId,refKey,taille)];
  return v ? (parseInt(v.quantite)||0) : 0;
}
function prodSetStageQty(stage, commandeId, refKey, taille, qte){
  const data = getProdStage(stage);
  const k = prodKey(commandeId,refKey,taille);
  if(qte==null || qte==='') delete data[k]; else data[k] = {quantite: parseInt(qte)||0};
  saveProdStage(stage, data);
}
function getProdControleData(){ return getJSON('prod_stage_controle', {}); }
function prodControleQty(commandeId, refKey, taille){
  const v = getProdControleData()[prodKey(commandeId,refKey,taille)];
  return v || {conforme:0, nonConforme:0};
}
function prodSetControleQty(commandeId, refKey, taille, conforme, nonConforme){
  const data = getProdControleData();
  data[prodKey(commandeId,refKey,taille)] = {conforme: parseInt(conforme)||0, nonConforme: parseInt(nonConforme)||0};
  setJSON('prod_stage_controle', data);
}

// Parcours complet pour une ligne commande+référence+taille
function prodLineParcours(commandeId, refKey, taille){
  const coupeEnvoi = prodStageQty('coupe', commandeId, refKey, taille);
  const assembleRetour = prodStageQty('assemble', commandeId, refKey, taille);
  const ctrl = prodControleQty(commandeId, refKey, taille);
  const emballe = prodStageQty('emballage', commandeId, refKey, taille);
  return {coupeEnvoi, assembleRetour, conforme:ctrl.conforme, nonConforme:ctrl.nonConforme, controle:ctrl.conforme+ctrl.nonConforme, emballe};
}
// Repère visuel (jamais bloquant) : true si la quantité semble incohérente vs l'étape amont
function prodSeemsLow(val, amont){ return amont>0 && val < amont; }

// ============================================================
// CÔTÉ TEK-TREND — Onglet "Chaîne" (Gestion Rendement)
// ============================================================
let prodTekSubTab = 'commandes'; // commandes | suivi
function canEditProdTek(){ return currentUser.role === 'admin'; }

function renderProdChainTek(main){
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Chaîne de production</h2></div>
    <div id="prod-tek-body"></div>
  `;
  const body = document.getElementById('prod-tek-body');
  body.innerHTML = `
    <div class="card" style="padding:8px;display:flex;gap:6px;">
      <button class="btn ${prodTekSubTab==='commandes'?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px 4px;font-size:12.5px;" onclick="prodTekSubTab='commandes'; renderProdChainTek(document.getElementById('main'))">Commandes</button>
      <button class="btn ${prodTekSubTab==='suivi'?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px 4px;font-size:12.5px;" onclick="prodTekSubTab='suivi'; renderProdChainTek(document.getElementById('main'))">Suivi</button>
    </div>
    <div id="prod-tek-sub"></div>
  `;
  const sub = document.getElementById('prod-tek-sub');
  if(prodTekSubTab==='commandes') renderProdCommandes(sub);
  else renderProdSuiviScreen(sub, true);
}

// --- Commandes (sélection des références, puis quantité par taille) ---
let prodNewCmdRefs = [];
let prodNewCmdNom = '';
let prodNewCmdRef = '';
let prodNewCmdAnnee = new Date().getFullYear();
let prodNewCmdQty = {};
function renderProdCommandes(container){
  const canEdit = canEditProdTek();
  const commandes = activeProdCommandes();
  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:14px;">Commandes</h3>
        ${canEdit ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddProdCommandeForm()">+ Nouvelle commande</button>` : ''}
      </div>
      <div id="prod-cmd-form-zone"></div>
      ${commandes.length===0 ? buildEmptyState("Aucune commande") : commandes.map(([id,c]) => {
        const nbLignes = Object.keys(c.lignes||{}).length;
        const total = Object.values(c.lignes||{}).reduce((s,l)=>s+prodLigneTotal(l),0);
        return `
        <div class="session-row" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:3px;" onclick="prodSuiviCmdId='${id}'; prodTekSubTab='suivi'; renderProdChainTek(document.getElementById('main'))">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:13px;">${esc(c.nom)} <span style="font-weight:600;color:var(--ink-soft);">— ${esc(c.ref)}</span></b><span style="font-size:11px;color:var(--ink-faint);">${c.annee}</span></div>
          <div style="font-size:11px;color:var(--ink-soft);">${nbLignes} référence${nbLignes>1?'s':''} · ${total} pièces</div>
        </div>`;
      }).join('')}
    </div>
  `;
  window.showAddProdCommandeForm = () => {
    prodNewCmdRefs = [];
    prodNewCmdNom = '';
    prodNewCmdRef = '';
    prodNewCmdAnnee = new Date().getFullYear();
    prodNewCmdQty = {};
    renderProdCommandeForm();
  };
  function renderProdCommandeForm(){
    const refs = activeProdReferences();
    const zone = document.getElementById('prod-cmd-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">Nouvelle commande</h3>
        <div class="field"><label>Nom (ex : mois)</label><input id="pc-nom" value="${esc(prodNewCmdNom)}" oninput="prodNewCmdNom=this.value" placeholder="Ex : OCTOBRE"></div>
        <div style="display:flex;gap:8px;">
          <div class="field" style="flex:1.4;"><label>Référence / LOT</label><input id="pc-ref" value="${esc(prodNewCmdRef)}" oninput="prodNewCmdRef=this.value" placeholder="Ex : PK202610-1"></div>
          <div class="field" style="flex:1;"><label>Année</label><input id="pc-annee" type="number" value="${prodNewCmdAnnee}" oninput="prodNewCmdAnnee=this.value" placeholder="2026"></div>
        </div>
        <p style="font-size:10.5px;color:var(--ink-faint);margin:0 0 6px;">Plusieurs commandes peuvent partager le même nom (ex. deux commandes "OCTOBRE" pour deux clients différents) — c'est la référence/LOT qui les distingue.</p>
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:10px 0 6px;">RÉFÉRENCES CONCERNÉES</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
          ${refs.map(([k,r]) => `<button class="btn ${prodNewCmdRefs.includes(k)?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11px;" onclick="toggleProdNewCmdRef('${k}')">${esc(prodRefLabel(r.famille,r.variante))}</button>`).join('')}
        </div>
        ${prodNewCmdRefs.length===0 ? `<p style="font-size:11.5px;color:var(--ink-faint);">Sélectionnez au moins une référence pour saisir les quantités par taille.</p>` : prodNewCmdRefs.map(k => {
          const r = refs.find(x=>x[0]===k)[1];
          return `
          <div style="border-top:1px solid var(--border-soft);padding-top:8px;margin-top:8px;">
            <b style="font-size:12px;">${esc(prodRefLabel(r.famille,r.variante))}</b>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
              ${PROD_TAILLES.map(t => `<div style="text-align:center;"><div style="font-size:9.5px;color:var(--ink-faint);margin-bottom:2px;">${t}</div><input type="number" min="0" class="pc-qte" data-refkey="${k}" data-taille="${t}" value="${(prodNewCmdQty[k]&&prodNewCmdQty[k][t])||''}" oninput="setProdNewCmdQty('${k}','${t}',this.value)" placeholder="0" style="width:52px;padding:6px 4px;text-align:center;border:1.5px solid var(--border);border-radius:6px;font-size:12px;"></div>`).join('')}
            </div>
          </div>`;
        }).join('')}
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn btn-primary" onclick="saveProdCommandeForm()">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('prod-cmd-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  }
  window.toggleProdNewCmdRef = (k) => {
    const i = prodNewCmdRefs.indexOf(k);
    if(i>=0) prodNewCmdRefs.splice(i,1); else prodNewCmdRefs.push(k);
    renderProdCommandeForm();
  };
  window.setProdNewCmdQty = (refKey, taille, val) => {
    if(!prodNewCmdQty[refKey]) prodNewCmdQty[refKey] = {};
    prodNewCmdQty[refKey][taille] = val;
  };
  window.saveProdCommandeForm = () => {
    const nom = prodNewCmdNom.trim();
    const ref = prodNewCmdRef.trim();
    const annee = parseInt(prodNewCmdAnnee) || new Date().getFullYear();
    if(!nom){ showToast('Le nom de la commande est obligatoire'); return; }
    if(!ref){ showToast('La référence / LOT est obligatoire'); return; }
    const lignes = {};
    Object.entries(prodNewCmdQty).forEach(([rk, tailles]) => {
      Object.entries(tailles).forEach(([t, v]) => {
        const q = parseInt(v);
        if(q>0){
          if(!lignes[rk]) lignes[rk] = {tailles:{}};
          lignes[rk].tailles[t] = q;
        }
      });
    });
    if(Object.keys(lignes).length===0){ showToast('Indiquez au moins une quantité'); return; }
    const list = getProdCommandes();
    const id = 'cmd'+Date.now()+Math.floor(Math.random()*1000);
    list[id] = {nom, ref, annee, dateCreation: getTodayISO(), lignes};
    saveProdCommandes(list);
    showToast('Commande créée');
    nav('prodchain');
  };
}

// --- Sélecteur de commande réutilisable ---
function prodCommandeSelector(selectedId, onchangeFn){
  const commandes = activeProdCommandes();
  return `<select onchange="${onchangeFn}(this.value)" style="width:100%;margin-bottom:10px;">
    <option value="">— Choisir une commande —</option>
    ${commandes.map(([id,c]) => `<option value="${id}" ${selectedId===id?'selected':''}>${esc(c.nom)} — ${esc(c.ref)} (${c.annee})</option>`).join('')}
  </select>`;
}

// --- Suivi : tableau principal (Total, Coupé/Envoyé, Assemblé/Retourné, Contrôlé, Emballé) ---
// isTek=true : Coupé/Envoyé + Contrôlé + Emballé éditables, Assemblé/Retourné en lecture seule.
// isTek=false (GADH) : seul Assemblé/Retourné est éditable ici (les autres, en lecture, via Réception).
let prodSuiviCmdId = null;
function renderProdSuiviScreen(container, isTek){
  const commandes = activeProdCommandes();
  container.innerHTML = `<div class="card">
    ${prodCommandeSelector(prodSuiviCmdId, 'setProdSuiviCmd')}
    <div id="prod-suivi-lignes"></div>
  </div>`;
  window.setProdSuiviCmd = (id) => { prodSuiviCmdId = id||null; renderProdSuiviScreen(container, isTek); };
  if(!prodSuiviCmdId) return;
  const commande = getProdCommandes()[prodSuiviCmdId];
  if(!commande) return;
  const headerZone = document.getElementById('prod-suivi-lignes');
  headerZone.insertAdjacentHTML('beforebegin', `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 2px 10px;border-bottom:1px solid var(--border-soft);margin-bottom:10px;"><b style="font-size:13.5px;">${esc(commande.nom)}</b><span style="font-size:11px;color:var(--ink-faint);">LOT ${esc(commande.ref)} · ${commande.annee}</span></div>`);
  const refs = getProdReferences();
  const canEditTek = isTek && canEditProdTek();
  const canEditGadhSide = !isTek && canEditGadh();
  const zone = document.getElementById('prod-suivi-lignes');
  zone.innerHTML = Object.entries(commande.lignes||{}).map(([refKey, ligne]) => {
    const r = refs[refKey];
    const totalRef = prodLigneTotal(ligne);
    let sCoupe=0, sAssemble=0, sConf=0, sNC=0, sEmb=0;
    const rowsHtml = PROD_TAILLES.filter(t => ligne.tailles && ligne.tailles[t]).map(t => {
      const prevu = ligne.tailles[t];
      const p = prodLineParcours(prodSuiviCmdId, refKey, t);
      sCoupe+=p.coupeEnvoi; sAssemble+=p.assembleRetour; sConf+=p.conforme; sNC+=p.nonConforme; sEmb+=p.emballe;
      return `
      <tr>
        <td style="font-weight:700;">${t}</td>
        <td style="text-align:center;color:var(--ink-faint);">${prevu}</td>
        <td style="text-align:center;">${canEditTek ? `<input type="number" min="0" value="${p.coupeEnvoi||''}" style="width:54px;text-align:center;padding:4px;border:1.5px solid var(--border);border-radius:5px;" onchange="setProdStageVal('coupe','${refKey}','${t}',this.value)">` : `<span style="${prodSeemsLow(p.coupeEnvoi, prevu)?'color:var(--warn);':''}">${p.coupeEnvoi}</span>`}</td>
        <td style="text-align:center;">${canEditGadhSide ? `<input type="number" min="0" value="${p.assembleRetour||''}" style="width:54px;text-align:center;padding:4px;border:1.5px solid var(--border);border-radius:5px;" onchange="setProdStageVal('assemble','${refKey}','${t}',this.value)">` : `<span style="${prodSeemsLow(p.assembleRetour, p.coupeEnvoi)?'color:var(--warn);':''}">${p.assembleRetour}</span>`}</td>
        <td style="text-align:center;">${canEditTek ? `<div style="display:flex;gap:2px;"><input type="number" min="0" value="${p.conforme||''}" placeholder="C" title="Conforme" style="width:34px;text-align:center;padding:4px;border:1.5px solid var(--border);border-radius:5px;" onchange="setProdControleVal('${refKey}','${t}','conf',this.value)"><input type="number" min="0" value="${p.nonConforme||''}" placeholder="NC" title="Non conforme" style="width:34px;text-align:center;padding:4px;border:1.5px solid var(--border);border-radius:5px;" onchange="setProdControleVal('${refKey}','${t}','nc',this.value)"></div>` : `<span>${p.conforme}${p.nonConforme?' / '+p.nonConforme+' NC':''}</span>`}</td>
        <td style="text-align:center;">${canEditTek ? `<input type="number" min="0" value="${p.emballe||''}" style="width:54px;text-align:center;padding:4px;border:1.5px solid var(--border);border-radius:5px;" onchange="setProdStageVal('emballage','${refKey}','${t}',this.value)">` : `<span style="${prodSeemsLow(p.emballe, p.conforme)?'color:var(--warn);':''}">${p.emballe}</span>`}</td>
      </tr>`;
    }).join('');
    const pct = totalRef>0 ? Math.min(999, Math.round(sEmb/totalRef*100)) : 0;
    return `
    <div class="card" style="background:var(--surface-2);margin-bottom:12px;padding:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><b style="font-size:13px;">${esc(prodRefLabel(r.famille,r.variante))}</b><span style="font-size:11px;font-weight:800;">${sEmb} / ${totalRef} (${pct}%)</span></div>
      <div style="width:100%;height:6px;background:var(--border-soft);border-radius:4px;overflow:hidden;margin-bottom:8px;"><div style="width:${Math.min(100,pct)}%;height:100%;background:${pct>=100?'var(--good)':'#3B82F6'};"></div></div>
      <div style="overflow-x:auto;">
        <table style="width:100%;font-size:11px;border-collapse:collapse;">
          <thead><tr style="color:var(--ink-faint);"><th style="text-align:left;">Taille</th><th>Prévu</th><th>Coupé/Envoyé</th><th>Assemblé/Retourné</th><th>Contrôlé</th><th>Emballé</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr style="font-weight:800;border-top:1.5px solid var(--border);"><td>Total</td><td style="text-align:center;">${totalRef}</td><td style="text-align:center;">${sCoupe}</td><td style="text-align:center;">${sAssemble}</td><td style="text-align:center;">${sConf}${sNC?'/'+sNC:''}</td><td style="text-align:center;">${sEmb}</td></tr></tfoot>
        </table>
      </div>
    </div>`;
  }).join('');
  window.setProdStageVal = (stage, refKey, taille, val) => {
    prodSetStageQty(stage, prodSuiviCmdId, refKey, taille, val);
    setTimeout(()=>renderProdSuiviScreen(container, isTek), 0);
  };
  window.setProdControleVal = (refKey, taille, which, val) => {
    const cur = prodControleQty(prodSuiviCmdId, refKey, taille);
    const conf = which==='conf' ? (parseInt(val)||0) : cur.conforme;
    const nc = which==='nc' ? (parseInt(val)||0) : cur.nonConforme;
    prodSetControleQty(prodSuiviCmdId, refKey, taille, conf, nc);
    setTimeout(()=>renderProdSuiviScreen(container, isTek), 0);
  };
}

// ============================================================
// CÔTÉ GADH — Onglet "Chaîne" (GADH Tunisia)
// ============================================================
let prodGadhSubTab = 'assemblage'; // assemblage (seul onglet nécessaire : la vue est la même table, lecture/écriture inversée)
function renderProdChainGadh(main){
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Chaîne de production</h2></div>
    <div id="prod-gadh-body"></div>
  `;
  const body = document.getElementById('prod-gadh-body');
  body.innerHTML = `
    <p style="font-size:11.5px;color:var(--ink-soft);margin:0 0 10px;">Reçu de TEK-TREND (Coupé/Envoyé) en lecture ; saisissez ici les quantités Assemblées/Retournées.</p>
    <div id="gadh-body-inner"></div>
  `;
  renderProdSuiviScreen(document.getElementById('gadh-body-inner'), false);
}
