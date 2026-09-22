// ============================================================
// SUIVI DE PRODUCTION — TEK-TREND ⇄ GADH TUNISIA
// ============================================================
// Fichier partagé, chargé par index.html. Les données ("prod_...") sont
// communes aux deux sociétés (c'est la traçabilité qui l'exige : une pièce
// transférée par TEK-TREND doit être vue par GADH, et inversement) mais
// l'INTERFACE est bien séparée : un onglet "Chaîne" dans Gestion Rendement
// pour la partie TEK-TREND, un onglet "Chaîne" dans GADH Tunisia pour la
// partie GADH — aucun des deux n'est mélangé aux écrans existants de l'autre.
// Aucun champ "opérateur" n'existe dans ce module (demande explicite).

// --- Références (15 fixes, pré-remplies, désactivables comme GADH) ---
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

// --- Commandes (une commande = plusieurs lignes référence + quantité prévue) ---
function getProdCommandes(){ return getJSON('prod_commandes', {}); }
function saveProdCommandes(list){ setJSON('prod_commandes', list); }
function activeProdCommandes(){
  return Object.entries(getProdCommandes()).sort((a,b)=> (b[1].dateCreation||'').localeCompare(a[1].dateCreation||''));
}

// --- Cadences par étape × référence (paramétrable, jamais codée en dur) ---
// clé = "<etape>|<refKey>" ; etapes avec cadence : gadh, confection, finition, emballage
const PROD_ETAPES_CADENCE = ['gadh','confection','finition','emballage'];
const PROD_ETAPE_LABEL = {gadh:'Assemblage (GADH)', confection:'Confection', finition:'Finition', emballage:'Emballage'};
function getProdCadences(){ return getJSON('prod_cadences', {}); }
function saveProdCadences(list){ setJSON('prod_cadences', list); }
function getProdCadence(etape, refKey){
  const c = getProdCadences()[etape+'|'+refKey];
  return c!=null ? c : null;
}

// --- Coupe (TEK-TREND, étape 1) : un enregistrement par commande+référence ---
function getProdCoupe(){ return getJSON('prod_coupe', {}); }
function saveProdCoupe(list){ setJSON('prod_coupe', list); }

// --- Transferts TEK-TREND -> GADH (plusieurs par commande/référence) ---
function getProdTransferts(){ return getJSON('prod_transferts', {}); }
function saveProdTransferts(list){ setJSON('prod_transferts', list); }

// --- Retours GADH -> TEK-TREND (plusieurs par commande/référence) ---
function getProdRetours(){ return getJSON('prod_retours', {}); }
function saveProdRetours(list){ setJSON('prod_retours', list); }

// --- Production horaire par étape (gadh / confection / finition / emballage) ---
// clé stockage : prod_horaire_<etape>_<date> = { "<commandeId>|<refKey>|<slotLabel>": {quantite} }
function getProdHoraire(etape, dateISO){ return getJSON('prod_horaire_'+etape+'_'+dateISO, {}); }
function saveProdHoraire(etape, dateISO, data){ setJSON('prod_horaire_'+etape+'_'+dateISO, data); }

// --- Contrôle (conforme / non conforme, pas de cadence) ---
function getProdControle(dateISO){ return getJSON('prod_controle_'+dateISO, {}); }
function saveProdControle(dateISO, data){ setJSON('prod_controle_'+dateISO, data); }

// ============================================================
// CUMULS — pour une commande+référence donnée, quantité totale à chaque étape
// ============================================================
function prodLineKey(commandeId, refKey){ return commandeId+'|'+refKey; }

function prodCumulCoupe(commandeId, refKey){
  const c = getProdCoupe()[prodLineKey(commandeId, refKey)];
  return c ? (parseInt(c.quantiteCoupee)||0) : 0;
}
function prodCumulTransfere(commandeId, refKey){
  return Object.values(getProdTransferts())
    .filter(t => t.commandeId===commandeId && t.refKey===refKey)
    .reduce((s,t)=>s+(parseInt(t.quantite)||0), 0);
}
function prodCumulRetourne(commandeId, refKey){
  return Object.values(getProdRetours())
    .filter(r => r.commandeId===commandeId && r.refKey===refKey)
    .reduce((s,r)=>s+(parseInt(r.quantiteRecue)||0), 0);
}
function prodCumulRetourneAssemble(commandeId, refKey){
  // quantite "assemblee" declaree au retour (peut differer de quantiteRecue -> ecart)
  return Object.values(getProdRetours())
    .filter(r => r.commandeId===commandeId && r.refKey===refKey)
    .reduce((s,r)=>s+(parseInt(r.quantiteAssemblee)||0), 0);
}
// Cumul générique pour une étape horaire (gadh/confection/finition/emballage)
function prodCumulHoraireEtape(etape, commandeId, refKey){
  // On doit parcourir tous les jours enregistrés ; pour rester simple et rapide,
  // on garde un index cumulatif séparé mis à jour à chaque saisie (plus fiable
  // et plus rapide qu'un scan de toutes les dates possibles).
  const idx = getJSON('prod_cumul_'+etape, {});
  return idx[prodLineKey(commandeId, refKey)] || 0;
}
function prodAddToCumulHoraireEtape(etape, commandeId, refKey, delta){
  const idx = getJSON('prod_cumul_'+etape, {});
  const k = prodLineKey(commandeId, refKey);
  idx[k] = Math.max(0, (idx[k]||0) + delta);
  setJSON('prod_cumul_'+etape, idx);
}
function prodCumulControle(commandeId, refKey){
  const idx = getJSON('prod_cumul_controle', {});
  const k = prodLineKey(commandeId, refKey);
  return idx[k] || {conforme:0, nonConforme:0};
}
function prodAddToCumulControle(commandeId, refKey, deltaConforme, deltaNonConforme){
  const idx = getJSON('prod_cumul_controle', {});
  const k = prodLineKey(commandeId, refKey);
  const cur = idx[k] || {conforme:0, nonConforme:0};
  idx[k] = {conforme: Math.max(0,cur.conforme+deltaConforme), nonConforme: Math.max(0,cur.nonConforme+deltaNonConforme)};
  setJSON('prod_cumul_controle', idx);
}

// Vue d'ensemble du parcours d'une ligne commande+référence (toutes les étapes)
function prodLineParcours(commandeId, refKey){
  const coupe = prodCumulCoupe(commandeId, refKey);
  const envoye = prodCumulTransfere(commandeId, refKey);
  const assemble = prodCumulHoraireEtape('gadh', commandeId, refKey);
  const retourne = prodCumulRetourne(commandeId, refKey);
  const confectionne = prodCumulHoraireEtape('confection', commandeId, refKey);
  const fini = prodCumulHoraireEtape('finition', commandeId, refKey);
  const ctrl = prodCumulControle(commandeId, refKey);
  const emballe = prodCumulHoraireEtape('emballage', commandeId, refKey);
  return {coupe, envoye, assemble, retourne, confectionne, fini, controle:ctrl.conforme+ctrl.nonConforme, conforme:ctrl.conforme, nonConforme:ctrl.nonConforme, emballe};
}

// ============================================================
// CÔTÉ TEK-TREND — Onglet "Chaîne" (Gestion Rendement)
// ============================================================
let prodTekSubTab = 'commandes'; // commandes | coupe | transfert | confection | finition | controle | emballage | suivi
function canEditProdTek(){ return currentUser.role === 'admin'; }

function renderProdChainTek(main){
  const subTabs = [
    ['commandes','Commandes'], ['coupe','Coupe'], ['transfert','Transfert GADH'],
    ['confection','Confection'], ['finition','Finition'], ['controle','Contrôle'],
    ['emballage','Emballage'], ['suivi','Suivi']
  ];
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Chaîne de production</h2></div>
    <div id="prod-tek-body"></div>
  `;
  const body = document.getElementById('prod-tek-body');
  body.innerHTML = `
    <div class="card" style="padding:8px;">
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;">
        ${subTabs.map(([k,l]) => `<button class="btn ${prodTekSubTab===k?'btn-primary':'btn-ghost'}" style="padding:7px 11px;font-size:12px;white-space:nowrap;flex-shrink:0;" onclick="prodTekSubTab='${k}'; renderProdChainTek(document.getElementById('main'))">${l}</button>`).join('')}
      </div>
    </div>
    <div id="prod-tek-sub"></div>
  `;
  const sub = document.getElementById('prod-tek-sub');
  if(prodTekSubTab==='commandes') renderProdCommandes(sub);
  else if(prodTekSubTab==='coupe') renderProdCoupeScreen(sub);
  else if(prodTekSubTab==='transfert') renderProdTransfertScreen(sub);
  else if(prodTekSubTab==='confection') renderProdHoraireEtapeScreen(sub, 'confection', 'Confection');
  else if(prodTekSubTab==='finition') renderProdHoraireEtapeScreen(sub, 'finition', 'Finition');
  else if(prodTekSubTab==='controle') renderProdControleScreen(sub);
  else if(prodTekSubTab==='emballage') renderProdHoraireEtapeScreen(sub, 'emballage', 'Emballage');
  else if(prodTekSubTab==='suivi') renderProdSuiviScreen(sub);
}

// --- Commandes ---
function renderProdCommandes(container){
  const canEdit = canEditProdTek();
  const commandes = activeProdCommandes();
  const refs = activeProdReferences();
  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:14px;">Commandes</h3>
        ${canEdit ? `<button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddProdCommandeForm()">+ Nouvelle commande</button>` : ''}
      </div>
      <div id="prod-cmd-form-zone"></div>
      ${commandes.length===0 ? buildEmptyState("Aucune commande") : commandes.map(([id,c]) => {
        const nbLignes = Object.keys(c.lignes||{}).length;
        return `
        <div class="session-row" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:3px;" onclick="prodSuiviCmdId='${id}'; prodTekSubTab='suivi'; renderProdChainTek(document.getElementById('main'))">
          <div style="display:flex;justify-content:space-between;"><b style="font-size:13px;">${esc(c.numero)}</b><span style="font-size:11px;color:var(--ink-faint);">${(c.dateCreation||'').split('-').reverse().join('/')}</span></div>
          <div style="font-size:11px;color:var(--ink-soft);">${nbLignes} référence${nbLignes>1?'s':''}</div>
        </div>`;
      }).join('')}
    </div>
  `;
  window.showAddProdCommandeForm = () => {
    const zone = document.getElementById('prod-cmd-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">Nouvelle commande</h3>
        <div class="field"><label>N° de commande</label><input id="pc-numero" placeholder="Ex : CMD-001"></div>
        <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:10px 0 6px;">RÉFÉRENCES (quantité commandée)</div>
        <div id="pc-lignes">
          ${refs.map(([k,r]) => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="flex:1;font-size:12px;">${esc(prodRefLabel(r.famille,r.variante))}</span>
              <input type="number" min="0" data-refkey="${k}" class="pc-qte" placeholder="0" style="width:90px;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;">
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-primary" onclick="saveProdCommandeForm()">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('prod-cmd-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  };
  window.saveProdCommandeForm = () => {
    const numero = document.getElementById('pc-numero').value.trim();
    if(!numero){ showToast('Le numéro de commande est obligatoire'); return; }
    const lignes = {};
    document.querySelectorAll('.pc-qte').forEach(inp => {
      const v = parseInt(inp.value);
      if(v>0) lignes[inp.dataset.refkey] = {quantitePrevue: v};
    });
    if(Object.keys(lignes).length===0){ showToast('Indiquez au moins une quantité'); return; }
    const list = getProdCommandes();
    const id = 'cmd'+Date.now()+Math.floor(Math.random()*1000);
    list[id] = {numero, dateCreation: getTodayISO(), lignes};
    saveProdCommandes(list);
    showToast('Commande créée');
    nav('prodchain');
  };
}

// --- Sélecteur de commande réutilisable (pour Coupe/Transfert/étapes horaires/Contrôle) ---
function prodCommandeSelector(selectedId, onchangeFn){
  const commandes = activeProdCommandes();
  return `<select onchange="${onchangeFn}(this.value)" style="width:100%;margin-bottom:10px;">
    <option value="">— Choisir une commande —</option>
    ${commandes.map(([id,c]) => `<option value="${id}" ${selectedId===id?'selected':''}>${esc(c.numero)}</option>`).join('')}
  </select>`;
}

// --- Coupe (TEK-TREND, étape 1) ---
let prodCoupeCmdId = null;
function renderProdCoupeScreen(container){
  const canEdit = canEditProdTek();
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">Coupe</h3>
    ${prodCommandeSelector(prodCoupeCmdId, 'setProdCoupeCmd')}
    <div id="prod-coupe-lignes"></div>
  </div>`;
  window.setProdCoupeCmd = (id) => { prodCoupeCmdId = id||null; renderProdCoupeScreen(document.getElementById('prod-tek-sub')); };
  if(!prodCoupeCmdId) return;
  const commande = getProdCommandes()[prodCoupeCmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const coupeData = getProdCoupe();
  const zone = document.getElementById('prod-coupe-lignes');
  zone.innerHTML = Object.entries(commande.lignes||{}).map(([refKey, ligne]) => {
    const r = refs[refKey];
    const c = coupeData[prodLineKey(prodCoupeCmdId, refKey)] || {quantiteCoupee:0, dateCoupe:''};
    const envoye = prodCumulTransfere(prodCoupeCmdId, refKey);
    const restant = Math.max(0, (c.quantiteCoupee||0) - envoye);
    return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><b style="font-size:12.5px;">${esc(prodRefLabel(r.famille,r.variante))}</b><span style="font-size:11px;color:var(--ink-faint);">Prévu ${ligne.quantitePrevue}</span></div>
      ${canEdit ? `
      <div style="display:flex;gap:8px;">
        <input type="number" min="0" max="${ligne.quantitePrevue}" value="${c.quantiteCoupee||''}" placeholder="Qté coupée" style="flex:1;padding:7px;border:1.5px solid var(--border);border-radius:8px;" onchange="setProdCoupeQty('${refKey}', this.value, ${ligne.quantitePrevue})">
        <input type="date" value="${c.dateCoupe||''}" style="flex:1;" onchange="setProdCoupeDate('${refKey}', this.value)">
      </div>` : ''}
      <div style="font-size:10.5px;color:var(--ink-soft);">Coupé ${c.quantiteCoupee||0} · Envoyé GADH ${envoye} · <b style="color:${restant>0?'var(--warn)':'var(--good)'};">Restant à envoyer ${restant}</b></div>
    </div>`;
  }).join('');
  window.setProdCoupeQty = (refKey, val, max) => {
    const q = parseInt(val)||0;
    if(q > max){ showToast('La quantité coupée ne peut pas dépasser la quantité prévue ('+max+')'); setTimeout(()=>renderProdCoupeScreen(document.getElementById('prod-tek-sub')), 0); return; }
    const data = getProdCoupe();
    const k = prodLineKey(prodCoupeCmdId, refKey);
    data[k] = {...(data[k]||{}), quantiteCoupee: q};
    saveProdCoupe(data);
    setTimeout(()=>renderProdCoupeScreen(document.getElementById('prod-tek-sub')), 0);
  };
  window.setProdCoupeDate = (refKey, val) => {
    const data = getProdCoupe();
    const k = prodLineKey(prodCoupeCmdId, refKey);
    data[k] = {...(data[k]||{}), dateCoupe: val};
    saveProdCoupe(data);
  };
}

// --- Transfert TEK-TREND -> GADH ---
let prodTransfertCmdId = null;
function renderProdTransfertScreen(container){
  const canEdit = canEditProdTek();
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">Transfert vers GADH</h3>
    ${prodCommandeSelector(prodTransfertCmdId, 'setProdTransfertCmd')}
    <div id="prod-transfert-body"></div>
  </div>`;
  window.setProdTransfertCmd = (id) => { prodTransfertCmdId = id||null; renderProdTransfertScreen(document.getElementById('prod-tek-sub')); };
  if(!prodTransfertCmdId) return;
  const commande = getProdCommandes()[prodTransfertCmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const zone = document.getElementById('prod-transfert-body');
  const transferts = Object.entries(getProdTransferts()).filter(([id,t])=>t.commandeId===prodTransfertCmdId).sort((a,b)=>b[1].date.localeCompare(a[1].date));
  zone.innerHTML = `
    ${canEdit ? `<button class="btn btn-primary" style="width:100%;margin-bottom:10px;" onclick="showAddProdTransfertForm()">+ Nouveau transfert</button>` : ''}
    <div id="prod-transfert-form-zone"></div>
    ${Object.keys(commande.lignes||{}).map(refKey => {
      const r = refs[refKey];
      const coupe = prodCumulCoupe(prodTransfertCmdId, refKey);
      const envoye = prodCumulTransfere(prodTransfertCmdId, refKey);
      return `<div style="font-size:10.5px;color:var(--ink-soft);padding:4px 0;">${esc(prodRefLabel(r.famille,r.variante))} — Coupé ${coupe} · Envoyé ${envoye} · Disponible <b>${Math.max(0,coupe-envoye)}</b></div>`;
    }).join('')}
    <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:10px 0 6px;">HISTORIQUE DES TRANSFERTS</div>
    ${transferts.length===0 ? buildEmptyState("Aucun transfert") : transferts.map(([id,t]) => `
      <div class="session-row"><div><b style="font-size:12px;">${esc(prodRefLabel(refs[t.refKey].famille, refs[t.refKey].variante))}</b><div style="font-size:10.5px;color:var(--ink-faint);">${t.date.split('-').reverse().join('/')}${t.observation?' · '+esc(t.observation):''}</div></div><b>${t.quantite}</b></div>
    `).join('')}
  `;
  window.showAddProdTransfertForm = () => {
    const zone2 = document.getElementById('prod-transfert-form-zone');
    zone2.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <div class="field"><label>Référence</label><select id="pt-ref">
          ${Object.keys(commande.lignes||{}).map(refKey => `<option value="${refKey}">${esc(prodRefLabel(refs[refKey].famille, refs[refKey].variante))}</option>`).join('')}
        </select></div>
        <div class="field"><label>Date d'envoi</label><input type="date" id="pt-date" value="${getTodayISO()}"></div>
        <div class="field"><label>Quantité envoyée</label><input type="number" min="1" id="pt-qte"></div>
        <div class="field"><label>Observation (optionnel)</label><input id="pt-obs"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveProdTransfertForm()">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('prod-transfert-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>`;
  };
  window.saveProdTransfertForm = () => {
    const refKey = document.getElementById('pt-ref').value;
    const date = document.getElementById('pt-date').value;
    const qte = parseInt(document.getElementById('pt-qte').value)||0;
    const observation = document.getElementById('pt-obs').value.trim();
    if(!date || qte<=0){ showToast('Date et quantité requises'); return; }
    const coupe = prodCumulCoupe(prodTransfertCmdId, refKey);
    const dejaEnvoye = prodCumulTransfere(prodTransfertCmdId, refKey);
    if(qte > (coupe - dejaEnvoye)){ showToast(`Impossible d'envoyer plus que la quantité coupée disponible (${coupe-dejaEnvoye} restant)`); return; }
    const list = getProdTransferts();
    const id = 'tr'+Date.now()+Math.floor(Math.random()*1000);
    list[id] = {date, commandeId:prodTransfertCmdId, refKey, quantite:qte, observation};
    saveProdTransferts(list);
    showToast('Transfert enregistré');
    nav('prodchain');
  };
}

// --- Fonction générique pour une étape horaire (Confection / Finition / Emballage / Assemblage GADH) ---
// "etapePrecedenteFn(commandeId, refKey)" renvoie la quantité disponible en amont
// (ce qui a déjà été produit à l'étape précédente, moins ce qui a déjà été
// consommé ici) — c'est ce qui empêche de produire plus que ce qui est disponible.
let prodHoraireCmdId = { confection:null, finition:null, emballage:null, gadh:null };
let prodHoraireDate = { confection:null, finition:null, emballage:null, gadh:null };
let prodHoraireContainer = { confection:null, finition:null, emballage:null, gadh:null };
function prodEtapeAmont(etape, commandeId, refKey){
  if(etape==='confection') return prodCumulRetourne(commandeId, refKey); // ce qui est revenu de GADH
  if(etape==='finition') return prodCumulHoraireEtape('confection', commandeId, refKey);
  if(etape==='emballage'){ const c = prodCumulControle(commandeId, refKey); return c.conforme; } // seul le conforme peut être emballé
  if(etape==='gadh') return prodCumulTransfere(commandeId, refKey); // ce qui a été envoyé par TEK-TREND
  return 0;
}
function renderProdHoraireEtapeScreen(container, etape, label){
  prodHoraireContainer[etape] = container;
  if(!prodHoraireDate[etape]) prodHoraireDate[etape] = getTodayISO();
  const canEdit = etape==='gadh' ? canEditGadh() : canEditProdTek();
  const date = prodHoraireDate[etape];
  const cmdId = prodHoraireCmdId[etape];
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">${esc(label)}</h3>
    <div class="field" style="margin-bottom:8px;"><label>Date</label><input type="date" value="${date}" max="${getTodayISO()}" onchange="setProdHoraireDate('${etape}', this.value)"></div>
    ${prodCommandeSelector(cmdId, `setProdHoraireCmd_${etape}`)}
    <div id="prod-horaire-${etape}-lignes"></div>
  </div>`;
  window['setProdHoraireCmd_'+etape] = (id) => { prodHoraireCmdId[etape] = id||null; renderProdHoraireEtapeScreen(prodHoraireContainer[etape], etape, label); };
  window.setProdHoraireDate = (et, val) => { prodHoraireDate[et] = val; renderProdHoraireEtapeScreen(prodHoraireContainer[et], et, PROD_ETAPE_LABEL[et]||et); };
  if(!cmdId) return;
  const commande = getProdCommandes()[cmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const slots = getSlotsForDate(date); // réutilise les créneaux TEK-TREND déjà configurés (horaires réels)
  const horaire = getProdHoraire(etape, date);
  const zone = document.getElementById('prod-horaire-'+etape+'-lignes');
  zone.innerHTML = Object.keys(commande.lignes||{}).map(refKey => {
    const r = refs[refKey];
    const amont = prodEtapeAmont(etape, cmdId, refKey);
    const dejaFait = prodCumulHoraireEtape(etape, cmdId, refKey);
    const disponible = Math.max(0, amont - dejaFait);
    const cadence = getProdCadence(etape, refKey);
    return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:4px;">
      <div style="display:flex;justify-content:space-between;"><b style="font-size:12.5px;">${esc(prodRefLabel(r.famille,r.variante))}</b><span style="font-size:10.5px;color:var(--ink-faint);">Disponible ${disponible}${cadence?' · Cadence '+cadence+'/h':' · Cadence non définie'}</span></div>
      ${slots.map(s => {
        const key = cmdId+'|'+refKey+'|'+s.label;
        const q = horaire[key] ? horaire[key].quantite : null;
        const obj = cadence ? Math.round(cadence*(s.minutes/60)) : null;
        const rend = (obj && q!=null) ? (q/obj*100) : null;
        return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
          <span style="font-size:11px;width:78px;flex-shrink:0;">${s.label}</span>
          ${canEdit ? `<input type="number" min="0" value="${q!=null?q:''}" placeholder="-" style="flex:1;padding:5px 7px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;" onchange="setProdHoraireQty('${etape}','${refKey}','${s.label}', this.value, ${disponible + (q||0)})">`
                    : `<span style="flex:1;font-size:11px;">${q!=null?q:'—'}</span>`}
          ${obj?`<span style="font-size:10px;color:var(--ink-faint);width:60px;text-align:right;">/${obj}${rend!=null?' · '+Math.round(rend)+'%':''}</span>`:''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
  window.setProdHoraireQty = (et, refKey, slotLabel, val, maxAvecActuel) => {
    const q = val==='' ? null : parseInt(val);
    if(q!=null && q>maxAvecActuel){ showToast('Quantité supérieure à la disponibilité en amont ('+maxAvecActuel+' max)'); setTimeout(()=>renderProdHoraireEtapeScreen(prodHoraireContainer[et], et, PROD_ETAPE_LABEL[et]||et), 0); return; }
    const dateEt = prodHoraireDate[et];
    const cmdEt = prodHoraireCmdId[et];
    const data = getProdHoraire(et, dateEt);
    const key = cmdEt+'|'+refKey+'|'+slotLabel;
    const oldQ = data[key] ? (data[key].quantite||0) : 0;
    const newQ = q||0;
    if(q==null) delete data[key]; else data[key] = {quantite:q};
    saveProdHoraire(et, dateEt, data);
    prodAddToCumulHoraireEtape(et, cmdEt, refKey, newQ - oldQ);
    setTimeout(()=>renderProdHoraireEtapeScreen(prodHoraireContainer[et], et, PROD_ETAPE_LABEL[et]||et), 0);
  };
}

// ============================================================
// CÔTÉ GADH — Onglet "Chaîne" (GADH Tunisia)
// ============================================================
let prodGadhSubTab = 'reception'; // reception | assemblage | retour
function renderProdChainGadh(main){
  const subTabs = [['reception','Réception'], ['assemblage','Assemblage'], ['retour','Retour TEK-TREND']];
  main.innerHTML = `
    <div class="flex-header"><h2>${ICONS.prodchain} Chaîne de production</h2></div>
    <div id="prod-gadh-body"></div>
  `;
  const body = document.getElementById('prod-gadh-body');
  body.innerHTML = `
    <div class="card" style="padding:8px;">
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;">
        ${subTabs.map(([k,l]) => `<button class="btn ${prodGadhSubTab===k?'btn-primary':'btn-ghost'}" style="padding:7px 11px;font-size:12px;white-space:nowrap;flex-shrink:0;" onclick="prodGadhSubTab='${k}'; renderProdChainGadh(document.getElementById('main'))">${l}</button>`).join('')}
      </div>
    </div>
    <div id="gadh-body-inner"></div>
  `;
  const sub = document.getElementById('gadh-body-inner');
  if(prodGadhSubTab==='reception') renderProdReceptionScreen(sub);
  else if(prodGadhSubTab==='assemblage') renderProdHoraireEtapeScreen(sub, 'gadh', 'Assemblage (GADH)');
  else if(prodGadhSubTab==='retour') renderProdRetourScreen(sub);
}

// --- Réception (vue des pièces reçues de TEK-TREND, lecture) ---
function renderProdReceptionScreen(container){
  const commandes = activeProdCommandes();
  const refs = getProdReferences();
  const rows = [];
  commandes.forEach(([cmdId,c]) => {
    Object.keys(c.lignes||{}).forEach(refKey => {
      const envoye = prodCumulTransfere(cmdId, refKey);
      if(envoye>0) rows.push({cmdId, cmdNumero:c.numero, refKey, envoye, assemble: prodCumulHoraireEtape('gadh', cmdId, refKey)});
    });
  });
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">Pièces reçues de TEK-TREND</h3>
    ${rows.length===0 ? buildEmptyState("Aucune réception pour le moment") : rows.map(row => {
      const r = refs[row.refKey];
      const disponible = Math.max(0, row.envoye - row.assemble);
      return `<div class="session-row"><div><b style="font-size:12.5px;">${esc(row.cmdNumero)}</b><div style="font-size:11px;color:var(--ink-soft);">${esc(prodRefLabel(r.famille,r.variante))}</div></div><div style="text-align:right;"><div style="font-weight:700;">${row.envoye}</div><div style="font-size:10px;color:var(--ink-faint);">Disponible ${disponible}</div></div></div>`;
    }).join('')}
  </div>`;
}

// --- Retour GADH -> TEK-TREND ---
let prodRetourCmdId = null;
function renderProdRetourScreen(container){
  const canEdit = canEditGadh();
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">Retour vers TEK-TREND</h3>
    ${prodCommandeSelector(prodRetourCmdId, 'setProdRetourCmd')}
    <div id="prod-retour-body"></div>
  </div>`;
  window.setProdRetourCmd = (id) => { prodRetourCmdId = id||null; renderProdRetourScreen(document.getElementById('gadh-body-inner')); };
  if(!prodRetourCmdId) return;
  const commande = getProdCommandes()[prodRetourCmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const zone = document.getElementById('prod-retour-body');
  const retours = Object.entries(getProdRetours()).filter(([id,r])=>r.commandeId===prodRetourCmdId).sort((a,b)=>b[1].date.localeCompare(a[1].date));
  zone.innerHTML = `
    ${canEdit ? `<button class="btn btn-primary" style="width:100%;margin-bottom:10px;" onclick="showAddProdRetourForm()">+ Nouveau retour</button>` : ''}
    <div id="prod-retour-form-zone"></div>
    ${Object.keys(commande.lignes||{}).map(refKey => {
      const r = refs[refKey];
      const assemble = prodCumulHoraireEtape('gadh', prodRetourCmdId, refKey);
      const retourne = prodCumulRetourneAssemble(prodRetourCmdId, refKey);
      return `<div style="font-size:10.5px;color:var(--ink-soft);padding:4px 0;">${esc(prodRefLabel(r.famille,r.variante))} — Assemblé ${assemble} · Déjà retourné ${retourne} · Disponible <b>${Math.max(0,assemble-retourne)}</b></div>`;
    }).join('')}
    <div style="font-size:11px;font-weight:700;color:var(--ink-faint);margin:10px 0 6px;">HISTORIQUE DES RETOURS</div>
    ${retours.length===0 ? buildEmptyState("Aucun retour") : retours.map(([id,r]) => `
      <div class="session-row"><div><b style="font-size:12px;">${esc(prodRefLabel(refs[r.refKey].famille, refs[r.refKey].variante))}</b><div style="font-size:10.5px;color:var(--ink-faint);">${r.date.split('-').reverse().join('/')}${r.observation?' · '+esc(r.observation):''}</div></div><div style="text-align:right;"><b>${r.quantiteRecue}</b>${r.ecart?`<div style="font-size:10px;color:var(--warn);">Écart ${r.ecart>0?'+':''}${r.ecart}</div>`:''}</div></div>
    `).join('')}
  `;
  window.showAddProdRetourForm = () => {
    document.getElementById('prod-retour-form-zone').innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <div class="field"><label>Référence</label><select id="pr-ref">
          ${Object.keys(commande.lignes||{}).map(refKey => `<option value="${refKey}">${esc(prodRefLabel(refs[refKey].famille, refs[refKey].variante))}</option>`).join('')}
        </select></div>
        <div class="field"><label>Date</label><input type="date" id="pr-date" value="${getTodayISO()}"></div>
        <div class="field"><label>Quantité assemblée (déclarée)</label><input type="number" min="0" id="pr-assemblee"></div>
        <div class="field"><label>Quantité envoyée à TEK-TREND</label><input type="number" min="0" id="pr-envoyee"></div>
        <div class="field"><label>Quantité reçue par TEK-TREND</label><input type="number" min="0" id="pr-recue"></div>
        <div class="field"><label>Observation (optionnel)</label><input id="pr-obs"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveProdRetourForm()">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('prod-retour-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>`;
  };
  window.saveProdRetourForm = () => {
    const refKey = document.getElementById('pr-ref').value;
    const date = document.getElementById('pr-date').value;
    const quantiteAssemblee = parseInt(document.getElementById('pr-assemblee').value)||0;
    const quantiteEnvoyee = parseInt(document.getElementById('pr-envoyee').value)||0;
    const quantiteRecue = parseInt(document.getElementById('pr-recue').value)||0;
    const observation = document.getElementById('pr-obs').value.trim();
    if(!date || quantiteAssemblee<=0){ showToast('Date et quantité assemblée requises'); return; }
    const dejaAssemble = prodCumulHoraireEtape('gadh', prodRetourCmdId, refKey);
    const dejaRetourne = prodCumulRetourneAssemble(prodRetourCmdId, refKey);
    if(quantiteAssemblee > (dejaAssemble - dejaRetourne)){ showToast(`Impossible de retourner plus que la quantité assemblée disponible (${dejaAssemble-dejaRetourne} max)`); return; }
    const ecart = quantiteRecue - quantiteEnvoyee;
    const list = getProdRetours();
    const id = 'rt'+Date.now()+Math.floor(Math.random()*1000);
    list[id] = {date, commandeId:prodRetourCmdId, refKey, quantiteAssemblee, quantiteEnvoyee, quantiteRecue, ecart, observation};
    saveProdRetours(list);
    showToast('Retour enregistré');
    nav('gadh-prodchain');
  };
}

// --- Contrôle (conforme / non conforme, pas de cadence) ---
let prodControleCmdId = null;
let prodControleDate = null;
function renderProdControleScreen(container){
  if(!prodControleDate) prodControleDate = getTodayISO();
  const canEdit = canEditProdTek();
  container.innerHTML = `<div class="card">
    <h3 style="margin-top:0;font-size:14px;">Contrôle</h3>
    ${prodCommandeSelector(prodControleCmdId, 'setProdControleCmd')}
    <div id="prod-controle-lignes"></div>
  </div>`;
  window.setProdControleCmd = (id) => { prodControleCmdId = id||null; renderProdControleScreen(document.getElementById('prod-tek-sub')); };
  if(!prodControleCmdId) return;
  const commande = getProdCommandes()[prodControleCmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const zone = document.getElementById('prod-controle-lignes');
  zone.innerHTML = Object.keys(commande.lignes||{}).map(refKey => {
    const r = refs[refKey];
    const fini = prodCumulHoraireEtape('finition', prodControleCmdId, refKey);
    const c = prodCumulControle(prodControleCmdId, refKey);
    const dejaControle = c.conforme + c.nonConforme;
    const disponible = Math.max(0, fini - dejaControle);
    const taux = dejaControle>0 ? (c.conforme/dejaControle*100) : null;
    return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:6px;">
      <div style="display:flex;justify-content:space-between;"><b style="font-size:12.5px;">${esc(prodRefLabel(r.famille,r.variante))}</b><span style="font-size:10.5px;color:var(--ink-faint);">Disponible ${disponible}</span></div>
      ${canEdit ? `
      <div style="display:flex;gap:8px;">
        <input type="number" min="0" id="ctrl-conf-${refKey}" placeholder="Conforme" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;">
        <input type="number" min="0" id="ctrl-nc-${refKey}" placeholder="Non conforme" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;">
        <button class="btn btn-primary" style="padding:6px 10px;font-size:11px;" onclick="addProdControle('${refKey}', ${disponible})">OK</button>
      </div>` : ''}
      <div style="font-size:10.5px;color:var(--ink-soft);">Conforme ${c.conforme} · Non conforme ${c.nonConforme}${taux!=null?' · Taux '+Math.round(taux)+'%':''}</div>
    </div>`;
  }).join('');
  window.addProdControle = (refKey, disponible) => {
    const conf = parseInt(document.getElementById('ctrl-conf-'+refKey).value)||0;
    const nc = parseInt(document.getElementById('ctrl-nc-'+refKey).value)||0;
    if(conf+nc<=0){ showToast('Indiquez au moins une quantité'); return; }
    if(conf+nc > disponible){ showToast('Le total dépasse la quantité disponible pour contrôle ('+disponible+' max)'); return; }
    prodAddToCumulControle(prodControleCmdId, refKey, conf, nc);
    showToast('Contrôle enregistré');
    renderProdControleScreen(document.getElementById('prod-tek-sub'));
  };
}

// --- Suivi global par commande (parcours complet + avancement) ---
let prodSuiviCmdId = null;
function renderProdSuiviScreen(container){
  const commandes = activeProdCommandes();
  container.innerHTML = `<div class="card">
    ${prodCommandeSelector(prodSuiviCmdId, 'setProdSuiviCmd')}
    <div id="prod-suivi-lignes"></div>
  </div>`;
  window.setProdSuiviCmd = (id) => { prodSuiviCmdId = id||null; renderProdSuiviScreen(document.getElementById('prod-tek-sub')); };
  if(!prodSuiviCmdId) return;
  const commande = getProdCommandes()[prodSuiviCmdId];
  if(!commande) return;
  const refs = getProdReferences();
  const zone = document.getElementById('prod-suivi-lignes');
  zone.innerHTML = Object.entries(commande.lignes||{}).map(([refKey, ligne]) => {
    const r = refs[refKey];
    const p = prodLineParcours(prodSuiviCmdId, refKey);
    const prevu = ligne.quantitePrevue;
    const pct = prevu>0 ? Math.min(100, Math.round(p.emballe/prevu*100)) : 0;
    const restant = Math.max(0, prevu - p.emballe);
    return `
    <div class="card" style="background:var(--surface-2);margin-bottom:10px;">
      <b style="font-size:13px;">${esc(prodRefLabel(r.famille,r.variante))}</b>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-soft);margin:4px 0 8px;"><span>${p.emballe} / ${prevu} pièces</span><span style="font-weight:800;">${pct}%</span></div>
      <div style="width:100%;height:8px;background:var(--border-soft);border-radius:5px;overflow:hidden;margin-bottom:10px;"><div style="width:${pct}%;height:100%;background:${pct>=100?'var(--good)':'#3B82F6'};"></div></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px;text-align:center;">
        <div><div style="font-weight:800;">${p.coupe}</div><div style="color:var(--ink-faint);">Coupé</div></div>
        <div><div style="font-weight:800;">${p.envoye}</div><div style="color:var(--ink-faint);">Envoyé</div></div>
        <div><div style="font-weight:800;">${p.assemble}</div><div style="color:var(--ink-faint);">Assemblé</div></div>
        <div><div style="font-weight:800;">${p.retourne}</div><div style="color:var(--ink-faint);">Retourné</div></div>
        <div><div style="font-weight:800;">${p.confectionne}</div><div style="color:var(--ink-faint);">Confection.</div></div>
        <div><div style="font-weight:800;">${p.fini}</div><div style="color:var(--ink-faint);">Fini</div></div>
        <div><div style="font-weight:800;">${p.conforme}</div><div style="color:var(--ink-faint);">Contrôlé</div></div>
        <div><div style="font-weight:800;">${p.emballe}</div><div style="color:var(--ink-faint);">Emballé</div></div>
      </div>
      <p style="text-align:center;font-size:11px;font-weight:700;margin:8px 0 0;color:${restant>0?'var(--warn)':'var(--good)'};">Reste à produire : ${restant} pièces</p>
    </div>`;
  }).join('');
}
