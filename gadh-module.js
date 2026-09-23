// ============================================================
// GADH TUNISIA — MODULE INDÉPENDANT (fichier séparé)
// ============================================================
// Chargé par index.html via <script src="./gadh-module.js">. Réutilise les
// utilitaires déjà définis dans index.html (getJSON, setJSON, esc, showToast,
// buildEmptyState, getTodayISO, toISODateLocal, timeToMin, buildSlots, nav,
// ICONS, currentUser, activeModule) mais TOUTES les données (personnel,
// pointage, références, cadences, horaires, plannings, production) sont
// stockées sous des clés dédiées "gadh_..." — totalement indépendantes de
// TEK-TREND (Rendement) et du module RH principal. Rien n'est partagé.

const GADH_PRESS_IMG = "data:image/jpeg;base64,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";

function gadhSectionContainer(container, title){
  container.innerHTML = `<div class="flex-header"><h2>${ICONS.gadh} ${title}</h2></div><div id="gadh-body"></div>`;
  return document.getElementById('gadh-body');
}
function canEditGadh(){ return currentUser && currentUser.role === 'admin'; }

// --- Données : Personnel ---
function getGadhEmployees(){ return getJSON('gadh_employees', {}); }
function saveGadhEmployees(list){ setJSON('gadh_employees', list); }
function activeGadhEmployees(){
  return Object.entries(getGadhEmployees()).filter(([id,e])=>e.statut!=='inactif').sort((a,b)=>(a[1].nom||'').localeCompare(b[1].nom||''));
}

// --- Données : Pointage journalier ---
function getGadhAttendance(dateISO){ return getJSON('gadh_attendance_'+dateISO, {}); }
function saveGadhAttendance(dateISO, data){ setJSON('gadh_attendance_'+dateISO, data); }

// --- Données : Absences par période (Congé / Maladie) ---
function getGadhAbsences(){ return getJSON('gadh_absences', {}); }
function saveGadhAbsences(list){ setJSON('gadh_absences', list); }
const GADH_ABSENCE_TYPES = { conge: {label:'Congé', cls:'excellent'}, maladie: {label:'Maladie', cls:'bad'} };

// --- Données : Références / Cadences ---
function getGadhReferences(){ return getJSON('gadh_references', {}); }
function saveGadhReferences(list){ setJSON('gadh_references', list); }
function activeGadhReferences(){
  return Object.entries(getGadhReferences()).filter(([id,r])=>r.actif!==false).sort((a,b)=>(a[1].nom||'').localeCompare(b[1].nom||''));
}

// --- Données : Plannings (horaires dynamiques par période) ---
function getGadhPlannings(){ return getJSON('gadh_plannings', {}); }
function saveGadhPlannings(list){ setJSON('gadh_plannings', list); }
const GADH_JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const GADH_JOURS_LABEL = {dimanche:'Dimanche',lundi:'Lundi',mardi:'Mardi',mercredi:'Mercredi',jeudi:'Jeudi',vendredi:'Vendredi',samedi:'Samedi'};
function gadhDefaultHoraires(){
  const h = {};
  GADH_JOURS.forEach(j => {
    if(j==='dimanche') h[j] = {actif:false, debut:'', fin:'', pauseDebut:'', pauseFin:''};
    else if(j==='samedi') h[j] = {actif:true, debut:'08:00', fin:'12:00', pauseDebut:'', pauseFin:''};
    else h[j] = {actif:true, debut:'08:00', fin:'17:00', pauseDebut:'12:00', pauseFin:'12:30'};
  });
  return h;
}
// Le planning applicable à une date donnée (le plus récent dont la période couvre
// cette date) ; à défaut, un planning par défaut raisonnable est utilisé — mais
// TOUJOURS via une résolution par date : changer les horaires aujourd'hui ne
// modifie jamais un jour déjà passé.
function getGadhScheduleForDate(dateISO){
  const plannings = Object.values(getGadhPlannings()).filter(p => p.dateDebut<=dateISO && (!p.dateFin || dateISO<=p.dateFin));
  if(plannings.length===0) return gadhDefaultHoraires();
  const latest = plannings.reduce((a,b)=> b.dateDebut > a.dateDebut ? b : a);
  return latest.horaires;
}
function gadhDayKey(dateISO){ return GADH_JOURS[new Date(dateISO+'T00:00:00').getDay()]; }
function getGadhSlotsForDate(dateISO){
  const sched = getGadhScheduleForDate(dateISO);
  const conf = sched[gadhDayKey(dateISO)];
  if(!conf || !conf.actif || !conf.debut || !conf.fin) return [];
  return buildSlots(conf.debut, conf.fin, conf.pauseDebut||null, conf.pauseFin||null);
}
function isGadhWorkingDay(dateISO){ return getGadhSlotsForDate(dateISO).length > 0; }

// --- Données : Production (par jour, par créneau horaire) ---
// gadh_production_{date} = { "08:00 - 09:00": {refId, refNom, cadence, quantite}, ... }
// La cadence est TOUJOURS enregistrée au moment de la saisie (jamais recalculée
// après coup si la référence change de cadence plus tard).
function getGadhProduction(dateISO){ return getJSON('gadh_production_'+dateISO, {}); }
function saveGadhProduction(dateISO, data){ setJSON('gadh_production_'+dateISO, data); }

function gadhObjectifSlot(entry, slotMinutes){
  if(!entry || !entry.cadence) return 0;
  return Math.round(entry.cadence * (slotMinutes/60));
}
function gadhRendementSlot(entry, slotMinutes){
  const obj = gadhObjectifSlot(entry, slotMinutes);
  if(obj<=0 || !entry || entry.quantite==null) return null; // "pas encore commencé"
  return (entry.quantite/obj)*100;
}
// Totaux (production, objectif) pour un jour entier.
function gadhDayTotals(dateISO){
  const slots = getGadhSlotsForDate(dateISO);
  const prod = getGadhProduction(dateISO);
  let totalReel = 0, totalObj = 0, hasEntry = false;
  slots.forEach(s => {
    const e = prod[s.label];
    if(e){ hasEntry = true; totalReel += (parseInt(e.quantite)||0); totalObj += gadhObjectifSlot(e, s.minutes); }
  });
  const rendement = totalObj>0 ? (totalReel/totalObj*100) : null;
  return { totalReel, totalObj, rendement, hasEntry, slots };
}

// --- Résolution du statut du jour (RH/Pointage) ---
// Statuts quotidiens saisis directement : présent / absent / retard / sortie / autorisation.
// Congé et Maladie se déclarent UNE SEULE FOIS pour toute une période (date début/fin) et
// s'appliquent automatiquement à chaque jour concerné, sans re-saisie.
const GADH_ATT_STATUS = {
  present: {label:'Présent', cls:'good'},
  absent: {label:'Absent', cls:'bad'},
  retard: {label:'Retard', cls:'warn'},
  sortie: {label:'Sortie', cls:'warn'},
  autorisation: {label:'Autorisation', cls:'warn'}
};
function findGadhAbsencePeriod(empId, dateISO){
  const periods = getGadhAbsences();
  return Object.entries(periods).find(([id,p]) => p.empId===empId && p.dateStart<=dateISO && dateISO<=p.dateEnd) || null;
}
function resolveGadhDayStatus(empId, dateISO){
  const found = findGadhAbsencePeriod(empId, dateISO);
  if(found){
    const [pid,p] = found;
    return {source:'periode', type:p.type, periodId:pid, dateStart:p.dateStart, dateEnd:p.dateEnd, motif:p.motif||''};
  }
  const att = getGadhAttendance(dateISO);
  const a = att[empId];
  if(a && a.statut) return {source:'pointage', ...a, dateISO};
  return {source:null, dateISO};
}
function gadhBadgeFor(r){
  if(r.source==='periode') return `<span class="hour-rend ${GADH_ABSENCE_TYPES[r.type].cls}" style="font-size:11px;">${GADH_ABSENCE_TYPES[r.type].label}</span>`;
  if(r.source==='pointage') return `<span class="hour-rend ${GADH_ATT_STATUS[r.statut]?GADH_ATT_STATUS[r.statut].cls:''}" style="font-size:11px;">${GADH_ATT_STATUS[r.statut]?GADH_ATT_STATUS[r.statut].label:r.statut}</span>`;
  return `<span class="hour-rend" style="font-size:11px;color:var(--ink-faint);">Non renseigné</span>`;
}

// ============================================================
// PARAMÈTRES (Références/Cadences + Horaires/Plannings)
// ============================================================
function renderGadhParametres(container){
  if(!canEditGadh()){
    container.innerHTML = buildEmptyState("Accès réservé au Responsable", "Cette page n'est pas accessible avec votre rôle.");
    return;
  }
  const refs = activeGadhReferences();
  const refsInactives = Object.entries(getGadhReferences()).filter(([id,r])=>r.actif===false);
  const plannings = Object.entries(getGadhPlannings()).sort((a,b)=>b[1].dateDebut.localeCompare(a[1].dateDebut));

  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;"><h3 style="margin:0;">Références &amp; cadences</h3>
        <button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddGadhRefForm()">+ Ajouter</button>
      </div>
      <div id="gadh-ref-form-zone"></div>
      ${refs.length===0 ? buildEmptyState("Aucune référence active") : refs.map(([id,r]) => `
        <div class="session-row">
          <div><div style="font-weight:700;">${esc(r.nom)}</div><div style="font-size:11.5px;color:var(--ink-soft);">${r.cadence} pièces/heure</div></div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="showEditGadhRefForm('${id}')">Modifier</button>
            <button class="btn btn-warning" style="padding:6px 10px;font-size:12px;" onclick="toggleGadhRefActive('${id}', false)">Désactiver</button>
          </div>
        </div>
      `).join('')}
      ${refsInactives.length>0 ? `
        <div style="font-size:11px;color:var(--ink-faint);font-weight:700;margin:12px 0 6px;">DÉSACTIVÉES</div>
        ${refsInactives.map(([id,r]) => `
          <div class="session-row"><div><div style="font-weight:700;color:var(--ink-faint);">${esc(r.nom)}</div><div style="font-size:11px;color:var(--ink-faint);">${r.cadence} pièces/heure</div></div>
            <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="toggleGadhRefActive('${id}', true)">Réactiver</button>
          </div>
        `).join('')}
      ` : ''}
    </div>

    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;"><h3 style="margin:0;">Horaires de travail (plannings)</h3>
        <button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onclick="showAddGadhPlanningForm()">+ Nouveau planning</button>
      </div>
      <p style="font-size:11.5px;color:var(--ink-soft);margin-bottom:10px;">Un planning s'applique à une période précise. Modifier les horaires ne change jamais les jours déjà passés.</p>
      <div id="gadh-planning-form-zone"></div>
      ${plannings.length===0 ? `<p style="font-size:11.5px;color:var(--ink-faint);">Aucun planning personnalisé — horaires par défaut appliqués (Lun-Ven 08h-17h, pause 12h-12h30 ; Samedi 08h-12h ; Dimanche non travaillé).</p>` : plannings.map(([id,p]) => `
        <div class="session-row" style="flex-direction:column;align-items:stretch;gap:4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <b style="font-size:13px;">${esc(p.nom)}</b>
            <button class="btn btn-warning" style="padding:5px 9px;font-size:11px;" onclick="deleteGadhPlanning('${id}')">Suppr.</button>
          </div>
          <div style="font-size:11px;color:var(--ink-soft);">Du ${p.dateDebut.split('-').reverse().join('/')} ${p.dateFin?'au '+p.dateFin.split('-').reverse().join('/'):'(sans fin)'}</div>
        </div>
      `).join('')}
    </div>
  `;

  window.showAddGadhRefForm = () => renderGadhRefForm('add', null);
  window.showEditGadhRefForm = (id) => renderGadhRefForm('edit', id);
  function renderGadhRefForm(mode, id){
    const r = mode==='edit' ? getGadhReferences()[id] : {nom:'', cadence:''};
    const zone = document.getElementById('gadh-ref-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">${mode==='add'?'Nouvelle référence':'Modifier la référence'}</h3>
        <div class="field"><label>Nom / Modèle</label><input id="gr-nom" value="${esc(r.nom)}" placeholder="Ex : MODÈLE A"></div>
        <div class="field"><label>Cadence (pièces/heure)</label><input type="number" id="gr-cadence" value="${r.cadence||''}" min="0" step="1" placeholder="Ex : 80"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveGadhRefForm('${mode}','${id||''}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('gadh-ref-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  }
  window.saveGadhRefForm = (mode, id) => {
    const nom = document.getElementById('gr-nom').value.trim();
    const cadence = parseFloat(document.getElementById('gr-cadence').value);
    if(!nom){ showToast('Le nom de la référence est obligatoire'); return; }
    if(isNaN(cadence) || cadence<=0){ showToast('Cadence invalide'); return; }
    const list = getGadhReferences();
    if(mode==='add'){
      const newId = 'gr'+Date.now()+Math.floor(Math.random()*1000);
      list[newId] = {nom, cadence, actif:true};
    } else {
      list[id] = {...list[id], nom, cadence};
    }
    saveGadhReferences(list);
    showToast('Référence enregistrée');
    nav('gadh-parametres');
  };
  window.toggleGadhRefActive = (id, actif) => {
    const list = getGadhReferences();
    list[id] = {...list[id], actif};
    saveGadhReferences(list);
    nav('gadh-parametres');
  };

  window.showAddGadhPlanningForm = () => {
    const h = gadhDefaultHoraires();
    const zone = document.getElementById('gadh-planning-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">Nouveau planning</h3>
        <div class="field"><label>Nom</label><input id="gp-nom" placeholder="Ex : Planning normal"></div>
        <div style="display:flex;gap:8px;">
          <div class="field" style="flex:1;"><label>Du</label><input type="date" id="gp-start" value="${getTodayISO()}"></div>
          <div class="field" style="flex:1;"><label>Au (optionnel)</label><input type="date" id="gp-end"></div>
        </div>
        ${GADH_JOURS.filter(j=>j!=='dimanche').concat(['dimanche']).map(j => `
          <div style="border-top:1px solid var(--border-soft);padding-top:8px;margin-top:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:12.5px;">
              <input type="checkbox" id="gp-${j}-actif" ${h[j].actif?'checked':''} onchange="document.getElementById('gp-${j}-fields').style.display=this.checked?'flex':'none'"> ${GADH_JOURS_LABEL[j]}
            </label>
            <div id="gp-${j}-fields" style="display:${h[j].actif?'flex':'none'};gap:6px;margin-top:6px;flex-wrap:wrap;">
              <input type="time" id="gp-${j}-debut" value="${h[j].debut}" style="flex:1;min-width:90px;">
              <input type="time" id="gp-${j}-fin" value="${h[j].fin}" style="flex:1;min-width:90px;">
              <input type="time" id="gp-${j}-pausedebut" value="${h[j].pauseDebut}" placeholder="Pause début" style="flex:1;min-width:90px;">
              <input type="time" id="gp-${j}-pausefin" value="${h[j].pauseFin}" placeholder="Pause fin" style="flex:1;min-width:90px;">
            </div>
          </div>
        `).join('')}
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-primary" onclick="saveGadhPlanningForm()">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('gadh-planning-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  };
  window.saveGadhPlanningForm = () => {
    const nom = document.getElementById('gp-nom').value.trim();
    const dateDebut = document.getElementById('gp-start').value;
    const dateFin = document.getElementById('gp-end').value || null;
    if(!nom){ showToast('Le nom du planning est obligatoire'); return; }
    if(!dateDebut){ showToast('Date de début requise'); return; }
    const horaires = {};
    GADH_JOURS.forEach(j => {
      const actif = document.getElementById('gp-'+j+'-actif').checked;
      horaires[j] = {
        actif,
        debut: document.getElementById('gp-'+j+'-debut').value,
        fin: document.getElementById('gp-'+j+'-fin').value,
        pauseDebut: document.getElementById('gp-'+j+'-pausedebut').value,
        pauseFin: document.getElementById('gp-'+j+'-pausefin').value
      };
    });
    const list = getGadhPlannings();
    const id = 'gp'+Date.now()+Math.floor(Math.random()*1000);
    list[id] = {nom, dateDebut, dateFin, horaires};
    saveGadhPlannings(list);
    showToast('Planning enregistré à partir du '+dateDebut.split('-').reverse().join('/'));
    nav('gadh-parametres');
  };
  window.deleteGadhPlanning = (id) => {
    if(!confirm('Supprimer ce planning ? Les jours passés déjà enregistrés ne seront pas modifiés.')) return;
    const list = getGadhPlannings();
    delete list[id];
    saveGadhPlannings(list);
    nav('gadh-parametres');
  };
}

// ============================================================
// RH (Personnel + Pointage combinés, comme demandé)
// ============================================================
let gadhRHView = 'personnel'; // 'personnel' | 'pointage'
let gadhAttDate = null;
let gadhFicheEmpId = null;

function renderGadhRH(container){
  if(!gadhAttDate) gadhAttDate = getTodayISO();
  container.innerHTML = `
    <div class="card" style="padding:8px;display:flex;gap:6px;">
      <button class="btn ${gadhRHView==='personnel'?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px 4px;font-size:12.5px;" onclick="gadhRHView='personnel'; nav('gadh-rh')">Personnel</button>
      <button class="btn ${gadhRHView==='pointage'?'btn-primary':'btn-ghost'}" style="flex:1;padding:8px 4px;font-size:12.5px;" onclick="gadhRHView='pointage'; nav('gadh-rh')">Pointage</button>
    </div>
    <div id="gadh-rh-sub"></div>
  `;
  const sub = document.getElementById('gadh-rh-sub');
  if(gadhFicheEmpId && gadhRHView==='personnel'){ renderGadhFiche(sub); return; }
  if(gadhRHView==='personnel') renderGadhPersonnel(sub);
  else renderGadhPointage(sub);
}

// --- Personnel ---
function renderGadhPersonnel(container){
  if(!window.gadhPFilter) window.gadhPFilter = {q:'', statut:'actif'};
  const f = window.gadhPFilter;
  const canEdit = canEditGadh();
  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="gadh-p-search" placeholder="Rechercher (nom, matricule, poste)…" value="${esc(f.q)}" style="flex:1;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:14px;" oninput="gadhFilterPersonnelRows(this.value)">
        ${canEdit ? `<button class="btn btn-primary" style="padding:8px 12px;font-size:12px;flex-shrink:0;" onclick="showAddGadhEmpForm()">+ Ajouter</button>` : ''}
      </div>
      <div style="display:flex;gap:6px;">
        ${[['actif','Actifs'],['inactif','Inactifs'],['tous','Tous']].map(([k,l]) => `<button class="btn ${f.statut===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:6px 4px;font-size:11.5px;" onclick="gadhPFilter.statut='${k}'; renderGadhPersonnel(document.getElementById('gadh-rh-sub'))">${l}</button>`).join('')}
      </div>
    </div>
    <div id="gadh-emp-form-zone"></div>
    <div id="gadh-p-results"></div>
  `;
  window.gadhRenderPersonnelRows = () => {
    const resZone = document.getElementById('gadh-p-results');
    if(!resZone) return;
    const f = window.gadhPFilter;
    let rows = Object.entries(getGadhEmployees());
    if(f.statut!=='tous') rows = rows.filter(([id,e]) => (e.statut||'actif')===f.statut);
    rows.sort((a,b)=>(a[1].nom||'').localeCompare(b[1].nom||''));
    resZone.innerHTML = `
    <div class="card">
      <div style="font-size:11px;color:var(--ink-faint);font-weight:700;margin-bottom:6px;"><span id="gadh-p-count">${rows.length}</span> <span id="gadh-p-count-label">personne${rows.length>1?'s':''}</span></div>
      ${rows.length===0 ? buildEmptyState("Aucun employé trouvé") : rows.map(([id,e]) => `
        <div class="session-row gadh-p-row" data-search="${esc(((e.matricule||'')+' '+(e.nom||'')+' '+(e.prenom||'')+' '+(e.poste||'')).toLowerCase())}" style="cursor:pointer;" onclick="gadhFicheEmpId='${id}'; nav('gadh-rh')">
          <div style="min-width:0;">
            <div style="font-weight:700;display:flex;align-items:center;gap:7px;flex-wrap:wrap;">${esc(e.nom)} ${esc(e.prenom||'')} ${e.statut==='inactif'?'<span class="badge red" style="font-size:9px;">Inactif</span>':''}</div>
            <div style="font-size:11.5px;color:var(--ink-soft);">${e.matricule?'Mat. '+esc(e.matricule)+' · ':''}${esc(e.poste||'—')}</div>
          </div>
          <div class="rank-chevron">${ICONS.chevronRight}</div>
        </div>
      `).join('')}
    </div>`;
  };
  window.gadhFilterPersonnelRows = (q) => {
    window.gadhPFilter.q = q;
    const qq = q.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#gadh-p-results .gadh-p-row').forEach(el => {
      const match = !qq || (el.dataset.search||'').includes(qq);
      el.style.display = match ? '' : 'none';
      if(match) shown++;
    });
    const c = document.getElementById('gadh-p-count'); if(c) c.textContent = shown;
    const l = document.getElementById('gadh-p-count-label'); if(l) l.textContent = 'personne'+(shown>1?'s':'');
  };
  gadhRenderPersonnelRows();

  window.showAddGadhEmpForm = () => renderGadhEmpForm('add', null);
  window.showEditGadhEmpForm = (id) => { if(event) event.stopPropagation(); renderGadhEmpForm('edit', id); };
  function renderGadhEmpForm(mode, id){
    const e = mode==='edit' ? getGadhEmployees()[id] : {matricule:'', nom:'', prenom:'', poste:'', dateEmbauche:getTodayISO(), statut:'actif'};
    const zone = document.getElementById('gadh-emp-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">${mode==='add'?'Nouvel employé':"Modifier l'employé"}</h3>
        <div class="field"><label>Matricule</label><input id="ge-matricule" value="${esc(e.matricule||'')}" placeholder="Ex : 001"></div>
        <div class="field"><label>Nom</label><input id="ge-nom" value="${esc(e.nom)}"></div>
        <div class="field"><label>Prénom</label><input id="ge-prenom" value="${esc(e.prenom||'')}"></div>
        <div class="field"><label>Poste</label><input id="ge-poste" value="${esc(e.poste||'')}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" id="ge-embauche" value="${e.dateEmbauche||''}"></div>
        ${mode==='edit' ? `<div class="field"><label>Statut</label><select id="ge-statut"><option value="actif" ${e.statut!=='inactif'?'selected':''}>Actif</option><option value="inactif" ${e.statut==='inactif'?'selected':''}>Inactif</option></select></div>` : ''}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveGadhEmpForm('${mode}','${id||''}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('gadh-emp-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  }
  window.saveGadhEmpForm = (mode, id) => {
    const nom = document.getElementById('ge-nom').value.trim();
    if(!nom){ showToast('Le nom est obligatoire'); return; }
    const data = {
      matricule: document.getElementById('ge-matricule').value.trim(),
      nom, prenom: document.getElementById('ge-prenom').value.trim(),
      poste: document.getElementById('ge-poste').value.trim(),
      dateEmbauche: document.getElementById('ge-embauche').value
    };
    const list = getGadhEmployees();
    if(mode==='add'){ list['ge'+Date.now()+Math.floor(Math.random()*1000)] = {...data, statut:'actif'}; }
    else { list[id] = {...list[id], ...data, statut: document.getElementById('ge-statut').value}; }
    saveGadhEmployees(list);
    showToast('Employé enregistré');
    nav('gadh-rh');
  };
}

// --- Fiche employé ---
function renderGadhFiche(container){
  const emps = getGadhEmployees();
  const e = emps[gadhFicheEmpId];
  if(!e){ container.innerHTML = buildEmptyState("Employé introuvable"); return; }
  container.innerHTML = `
    <div class="card">
      <div class="flex-header"><h3 style="margin:0;">${esc(e.nom)} ${esc(e.prenom||'')}</h3>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="gadhFicheEmpId=null; nav('gadh-rh')">← Retour</button>
      </div>
      <p style="font-size:12px;color:var(--ink-soft);">${e.matricule?'Matricule '+esc(e.matricule)+' · ':''}${esc(e.poste||'—')}</p>
      ${e.dateEmbauche ? `<p style="font-size:11.5px;color:var(--ink-faint);">Embauché(e) le ${e.dateEmbauche.split('-').reverse().join('/')}</p>` : ''}
      ${canEditGadh() ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="showEditGadhEmpForm('${gadhFicheEmpId}')">Modifier</button>` : ''}
      <div id="gadh-emp-form-zone"></div>
    </div>
  `;
}

// --- Pointage ---
function renderGadhPointage(container){
  const date = gadhAttDate;
  const canEdit = canEditGadh();
  const emps = activeGadhEmployees();
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveGadhDayStatus(id, date)}));
  const nbRenseignes = resolved.filter(x=>x.r.source!==null).length;
  const journeeCommencee = date !== getTodayISO() || true; // simple, pas de règle d'heure de début stricte ici

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div class="field" style="margin:0;"><label>Date</label><input type="date" value="${date}" max="${getTodayISO()}" onchange="gadhAttDate=this.value; nav('gadh-rh')"></div>
      ${canEdit ? `<button class="btn btn-primary" style="width:100%;margin-top:8px;padding:9px;font-size:12.5px;" onclick="gadhMarkAllPresent()">Tout marquer Présent</button>` : ''}
      <div style="font-size:11px;color:var(--ink-faint);margin-top:8px;">${nbRenseignes}/${emps.length} renseigné(s)</div>
    </div>
    <div class="card" style="padding:4px 12px;">
      ${emps.length===0 ? buildEmptyState("Aucun employé actif") : resolved.map(x => gadhPointageCard(x, canEdit)).join('')}
    </div>
    <div id="gadh-modal-zone"></div>
  `;

  window.gadhMarkAllPresent = () => {
    const cible = emps.filter(([id]) => !findGadhAbsencePeriod(id, date));
    if(!confirm(`Marquer ${cible.length} salarié(s) comme Présent pour le ${date.split('-').reverse().join('/')} ?`)) return;
    const a = getGadhAttendance(date);
    cible.forEach(([id]) => { a[id] = {statut:'present'}; });
    saveGadhAttendance(date, a);
    showToast('Marqués Présent — ajustez les exceptions');
    nav('gadh-rh');
  };
  window.setGadhStatus = (empId, statut) => {
    if(statut==='conge' || statut==='maladie'){ showGadhAbsenceForm(empId, statut); return; }
    const a = getGadhAttendance(date);
    if(!statut) delete a[empId]; else a[empId] = {statut};
    saveGadhAttendance(date, a);
    nav('gadh-rh');
  };
  window.setGadhField = (empId, field, value) => {
    const a = getGadhAttendance(date);
    a[empId] = {...(a[empId]||{}), [field]:value};
    saveGadhAttendance(date, a);
  };
}
function gadhPointageCard(x, canEdit){
  const {id, e, r} = x;
  if(r.source==='periode'){
    const t = GADH_ABSENCE_TYPES[r.type];
    return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:4px;padding:9px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:700;font-size:13.5px;">${esc(e.nom)} ${esc(e.prenom||'')}</div>
        <span class="hour-rend ${t.cls}" style="font-size:11px;">${t.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--ink-soft);">Du ${r.dateStart.split('-').reverse().join('/')} au ${r.dateEnd.split('-').reverse().join('/')}${r.motif?' · '+esc(r.motif):''}</div>
      ${canEdit ? `<button class="btn btn-ghost" style="align-self:flex-start;padding:4px 9px;font-size:10.5px;" onclick="showEditGadhAbsence('${r.periodId}')">Modifier / supprimer</button>` : ''}
    </div>`;
  }
  const st = r.source==='pointage' ? r.statut : '';
  return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:6px;padding:9px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.nom)} ${esc(e.prenom||'')}</div>
        ${canEdit
          ? `<select style="flex-shrink:0;" onchange="setGadhStatus('${id}', this.value)">
              <option value="">— Non renseigné —</option>
              ${Object.entries(GADH_ATT_STATUS).map(([k,v])=>`<option value="${k}" ${st===k?'selected':''}>${v.label}</option>`).join('')}
              <option value="conge">Congé</option><option value="maladie">Maladie</option>
            </select>`
          : `<span class="hour-rend ${st?GADH_ATT_STATUS[st].cls:''}" style="font-size:11px;">${st?GADH_ATT_STATUS[st].label:'—'}</span>`}
      </div>
      ${canEdit && st==='retard' ? `<div class="field" style="margin:0;"><label style="font-size:10px;">Heure réelle d'arrivée</label><input type="time" value="${r.heureReelle||''}" onchange="setGadhField('${id}','heureReelle',this.value)"></div>` : ''}
      ${canEdit && st==='sortie' ? `<div style="display:flex;gap:8px;">
        <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Heure de sortie</label><input type="time" value="${r.heureSortie||''}" onchange="setGadhField('${id}','heureSortie',this.value)"></div>
        <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Heure de retour</label><input type="time" value="${r.heureRetour||''}" onchange="setGadhField('${id}','heureRetour',this.value)"></div>
      </div>` : ''}
      ${canEdit && st==='autorisation' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Début</label><input type="time" value="${r.heureDebut||''}" onchange="setGadhField('${id}','heureDebut',this.value)"></div>
        <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Fin</label><input type="time" value="${r.heureFin||''}" onchange="setGadhField('${id}','heureFin',this.value)"></div>
        <input placeholder="Motif (optionnel)" value="${esc(r.motif||'')}" style="flex:2;min-width:140px;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-size:12.5px;" onchange="setGadhField('${id}','motif',this.value)">
      </div>` : ''}
      ${!canEdit && st==='retard' && r.heureReelle ? `<div style="font-size:11px;color:var(--ink-soft);">Arrivée ${r.heureReelle}</div>` : ''}
      ${!canEdit && st==='sortie' ? `<div style="font-size:11px;color:var(--ink-soft);">${r.heureSortie||'—'} → ${r.heureRetour||'—'}</div>` : ''}
      ${!canEdit && st==='autorisation' ? `<div style="font-size:11px;color:var(--ink-soft);">${r.heureDebut||'—'} → ${r.heureFin||'—'}${r.motif?' · '+esc(r.motif):''}</div>` : ''}
    </div>
  `;
}

// --- Congé / Maladie (période) ---
function gadhModal(title, bodyHtml){
  const zone = document.getElementById('gadh-modal-zone');
  if(!zone) return;
  zone.innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this) gadhCloseModal()"><div class="modal-sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;"><h3 style="margin:0;">${title}</h3><button class="icon-btn" onclick="gadhCloseModal()">✕</button></div>
    ${bodyHtml}
  </div></div>`;
}
window.gadhCloseModal = () => { const z=document.getElementById('gadh-modal-zone'); if(z) z.innerHTML=''; };
window.showGadhAbsenceForm = (empId, type) => {
  gadhModal(type==='conge'?'Congé':'Maladie', `
    <div class="field"><label>Type</label><select id="ga-type"><option value="conge" ${type==='conge'?'selected':''}>Congé</option><option value="maladie" ${type==='maladie'?'selected':''}>Maladie</option></select></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>Du</label><input type="date" id="ga-start" value="${gadhAttDate}"></div>
      <div class="field" style="flex:1;"><label>Au</label><input type="date" id="ga-end" value="${gadhAttDate}"></div>
    </div>
    <div class="field"><label>Motif (optionnel)</label><input id="ga-motif"></div>
    <button class="btn btn-primary" style="width:100%;" onclick="saveGadhAbsence('${empId}')">Enregistrer</button>
  `);
};
window.showEditGadhAbsence = (periodId) => {
  const p = getGadhAbsences()[periodId];
  if(!p) return;
  gadhModal('Modifier', `
    <div class="field"><label>Type</label><select id="ga-type"><option value="conge" ${p.type==='conge'?'selected':''}>Congé</option><option value="maladie" ${p.type==='maladie'?'selected':''}>Maladie</option></select></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>Du</label><input type="date" id="ga-start" value="${p.dateStart}"></div>
      <div class="field" style="flex:1;"><label>Au</label><input type="date" id="ga-end" value="${p.dateEnd}"></div>
    </div>
    <div class="field"><label>Motif (optionnel)</label><input id="ga-motif" value="${esc(p.motif||'')}"></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="flex:1;" onclick="saveGadhAbsence('${p.empId}','${periodId}')">Enregistrer</button>
      <button class="btn btn-warning" onclick="deleteGadhAbsence('${periodId}')">Supprimer</button>
    </div>
  `);
};
window.saveGadhAbsence = (empId, editId) => {
  const type = document.getElementById('ga-type').value;
  const dateStart = document.getElementById('ga-start').value;
  const dateEnd = document.getElementById('ga-end').value;
  const motif = document.getElementById('ga-motif').value.trim();
  if(!dateStart || !dateEnd){ showToast('Dates requises'); return; }
  if(new Date(dateEnd) < new Date(dateStart)){ showToast('La date de fin doit être après la date de début'); return; }
  const list = getGadhAbsences();
  const id = editId || ('ga'+Date.now()+Math.floor(Math.random()*1000));
  list[id] = {empId, type, dateStart, dateEnd, motif};
  saveGadhAbsences(list);
  showToast('Absence enregistrée');
  gadhCloseModal();
  nav('gadh-rh');
};
window.deleteGadhAbsence = (id) => {
  if(!confirm('Supprimer cette absence ?')) return;
  const list = getGadhAbsences();
  delete list[id];
  saveGadhAbsences(list);
  gadhCloseModal();
  nav('gadh-rh');
};

// ============================================================
// PRODUCTION (saisie horaire par référence)
// ============================================================
let gadhProdDate = null;
function renderGadhProduction(container){
  if(!gadhProdDate) gadhProdDate = getTodayISO();
  const date = gadhProdDate;
  const canEdit = canEditGadh();
  const slots = getGadhSlotsForDate(date);
  const prod = getGadhProduction(date);
  const refs = activeGadhReferences();
  const totals = gadhDayTotals(date);
  const dateNav = (delta) => { const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()+delta); return toISODateLocal(d); };

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="gadhProdDate='${dateNav(-1)}'; nav('gadh-production')">‹</button>
        <div class="field" style="margin:0;flex:1;"><input type="date" value="${date}" max="${getTodayISO()}" onchange="gadhProdDate=this.value; nav('gadh-production')"></div>
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="gadhProdDate='${dateNav(1)}'; nav('gadh-production')" ${date>=getTodayISO()?'disabled':''}>›</button>
      </div>
    </div>
    ${slots.length===0 ? `<div class="card">${buildEmptyState("Jour non travaillé", "Aucun horaire n'est programmé ce jour-là.")}</div>` : `
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-blue"><div class="kpi-mini-val">${totals.totalReel}</div><div class="kpi-mini-lbl">Production</div></div>
      <div class="kpi-mini"><div class="kpi-mini-val">${totals.totalObj}</div><div class="kpi-mini-lbl">Objectif</div></div>
      <div class="kpi-mini ${totals.rendement!=null && totals.rendement>=100?'tint-green':''}"><div class="kpi-mini-val">${totals.rendement!=null?Math.round(totals.rendement)+'%':'—'}</div><div class="kpi-mini-lbl">Rendement</div></div>
    </div>
    <div class="card" style="padding:4px 12px;">
      ${slots.map(s => {
        const e = prod[s.label] || {};
        const obj = e.cadence ? gadhObjectifSlot(e, s.minutes) : null;
        const rend = gadhRendementSlot(e, s.minutes);
        return `
        <div class="session-row" style="flex-direction:column;align-items:stretch;gap:6px;padding:9px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <b style="font-size:13px;">${s.label}</b>
            ${rend!=null ? `<span class="hour-rend ${rend>=100?'good':(rend>=80?'warn':'bad')}" style="font-size:11px;">${Math.round(rend)}%</span>` : (obj!=null?'':'<span style="font-size:10.5px;color:var(--ink-faint);">Pas encore commencé</span>')}
          </div>
          ${canEdit ? `
          <div style="display:flex;gap:8px;">
            <select style="flex:1.4;" onchange="setGadhProdRef('${s.label}', this.value)">
              <option value="">Référence…</option>
              ${refs.map(([id,r])=>`<option value="${id}" ${e.refId===id?'selected':''}>${esc(r.nom)} (${r.cadence}/h)</option>`).join('')}
            </select>
            <input type="number" min="0" placeholder="Qté" value="${e.quantite!=null?e.quantite:''}" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;" onchange="setGadhProdQty('${s.label}', this.value)">
          </div>
          ${e.refNom ? `<div style="font-size:10.5px;color:var(--ink-soft);">${esc(e.refNom)} · Objectif ${obj||0} pièces (cadence ${e.cadence}/h)</div>` : ''}
          ` : `
          ${e.refNom ? `<div style="font-size:11.5px;color:var(--ink-soft);">${esc(e.refNom)} — ${e.quantite||0} / ${obj||0} pièces</div>` : `<div style="font-size:11px;color:var(--ink-faint);">Non renseigné</div>`}
          `}
        </div>`;
      }).join('')}
    </div>
    `}
  `;

  window.setGadhProdRef = (slotLabel, refId) => {
    const prod = getGadhProduction(date);
    const ref = refId ? getGadhReferences()[refId] : null;
    prod[slotLabel] = {...(prod[slotLabel]||{}), refId: refId||null, refNom: ref?ref.nom:null, cadence: ref?ref.cadence:null};
    saveGadhProduction(date, prod);
    nav('gadh-production');
  };
  window.setGadhProdQty = (slotLabel, val) => {
    const prod = getGadhProduction(date);
    const q = val==='' ? null : parseInt(val);
    prod[slotLabel] = {...(prod[slotLabel]||{}), quantite: (isNaN(q)?null:q)};
    saveGadhProduction(date, prod);
    nav('gadh-production');
  };
}

// ============================================================
// TABLEAU DE BORD
// ============================================================
// --- Aides visuelles pour le Dashboard ---
function gadhYesterdayISO(dateISO){ const d=new Date(dateISO+'T00:00:00'); d.setDate(d.getDate()-1); return toISODateLocal(d); }
function gadhTrendBadge(curr, prev){
  if(prev===0 && curr===0) return '';
  if(prev===0) return `<span style="font-size:11px;font-weight:800;color:#10B981;">▲ nouveau</span>`;
  const pct = Math.round(((curr-prev)/prev)*100);
  const up = pct>=0;
  return `<span style="font-size:11px;font-weight:800;color:${up?'#10B981':'#EF4444'};">${up?'▲':'▼'} ${Math.abs(pct)}% <span style="font-weight:600;color:var(--ink-faint);">vs hier</span></span>`;
}
// Donut à plusieurs segments (Bon / Moyen / Faible), façon anneau épais.
function gadhDonutMulti(segments, centerVal, centerLabel, size){
  size = size||150;
  const r=58, c=2*Math.PI*r, cx=75, cy=75;
  let offset=0;
  const total = segments.reduce((s,x)=>s+x.value,0) || 1;
  const arcs = segments.map(seg => {
    const frac = seg.value/total;
    const len = c*frac;
    const dash = `${len} ${c-len}`;
    const rot = (offset/total)*360 - 90;
    offset += seg.value;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dash}" transform="rotate(${rot} ${cx} ${cy})"/>`;
  }).join('');
  return `
    <div style="position:relative;width:${size}px;height:${size}px;margin:0 auto;">
      <svg width="${size}" height="${size}" viewBox="0 0 150 150">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-soft)" stroke-width="14"/>
        ${arcs}
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-size:24px;font-weight:800;">${centerVal}</div>
        <div style="font-size:10px;color:var(--ink-faint);font-weight:700;">${centerLabel}</div>
      </div>
    </div>`;
}
// Graphique barres (réel) + ligne (objectif) des derniers N jours, en SVG simple.
function gadhWeekChart(days){
  const W=300, H=140, pad=24;
  const maxV = Math.max(1, ...days.map(d=>Math.max(d.reel,d.obj)));
  const bw = (W-pad*2)/days.length;
  const bars = days.map((d,i) => {
    const x = pad + i*bw + bw*0.2;
    const bh = (d.reel/maxV)*(H-pad*1.5);
    const y = H-pad-bh;
    return `<rect x="${x}" y="${y}" width="${bw*0.6}" height="${bh}" rx="3" fill="#3B82F6"/>`;
  }).join('');
  const pts = days.map((d,i) => {
    const x = pad + i*bw + bw/2;
    const y = H-pad-(d.obj/maxV)*(H-pad*1.5);
    return `${x},${y}`;
  }).join(' ');
  const dots = days.map((d,i) => {
    const x = pad + i*bw + bw/2;
    const y = H-pad-(d.obj/maxV)*(H-pad*1.5);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="#10B981"/>`;
  }).join('');
  const labels = days.map((d,i) => {
    const x = pad + i*bw + bw/2;
    return `<text x="${x}" y="${H-4}" font-size="9" fill="var(--ink-faint)" text-anchor="middle">${d.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">
    ${bars}<polyline points="${pts}" fill="none" stroke="#10B981" stroke-width="2"/>${dots}${labels}
  </svg>`;
}
// Rythme à l'heure actuelle : compare la production réelle à l'objectif des
// créneaux ENTIÈREMENT écoulés (pas de calcul proportionnel à la minute en
// cours). Uniquement pertinent pour la journée en cours.
function gadhComputeRhythm(dateISO){
  if(dateISO !== getTodayISO()) return null;
  const slots = getGadhSlotsForDate(dateISO);
  if(slots.length===0) return null;
  const prod = getGadhProduction(dateISO);
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  let elapsedObj = 0, reelSoFar = 0;
  slots.forEach(s => {
    if(nowMin >= s.end){
      const e = prod[s.label];
      if(e && e.cadence){ elapsedObj += gadhObjectifSlot(e, s.minutes); reelSoFar += (parseInt(e.quantite)||0); }
    }
  });
  if(elapsedObj<=0) return null;
  const pct = reelSoFar/elapsedObj*100;
  let label, color;
  if(pct>=100){ label='En avance'; color='#5FE0A6'; }
  else if(pct>=80){ label='Bon'; color='#FFC067'; }
  else if(pct>=60){ label='Insuffisant'; color='#FF8177'; }
  else { label='Critique'; color='#FF8177'; }
  return {pct, label, color};
}

function renderGadhDashboard(container){
  if(!gadhAttDate) gadhAttDate = getTodayISO();
  const date = gadhAttDate;
  const isToday = date === getTodayISO();
  const emps = activeGadhEmployees();
  const totals = gadhDayTotals(date);
  const yTotals = gadhDayTotals(gadhYesterdayISO(date));
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveGadhDayStatus(id, date)}));
  const present = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='present').length;
  const absent = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='absent').length
               + resolved.filter(x=>x.r.source==='periode').length;
  const retard = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='retard').length;
  const nonRenseignes = resolved.filter(x=>x.r.source===null);
  const alertes = [];
  if(!isGadhWorkingDay(date)) alertes.push("Ce jour n'est pas travaillé selon le planning actuel.");
  if(activeGadhReferences().length===0) alertes.push("Aucune référence/cadence n'est configurée — allez dans Paramètres.");
  if(nonRenseignes.length>0) alertes.push(nonRenseignes.length+" salarié(s) non renseigné(s).");

  // Production par modèle (ce jour)
  const prod = getGadhProduction(date);
  const parRef = {};
  Object.values(prod).forEach(e => { if(e && e.refNom && e.quantite){ parRef[e.refNom] = (parRef[e.refNom]||0) + (parseInt(e.quantite)||0); } });
  const totalRefQty = Object.values(parRef).reduce((s,v)=>s+v,0) || 1;
  const refRanking = Object.entries(parRef).sort((a,b)=>b[1]-a[1]);
  const refColors = ['#3B82F6','#EC4899','#10B981','#6B7280','#F59E0B','#8B5CF6','#06B6D4'];

  // Qualité des créneaux (Bon >=80% / Moyen 60-79% / Faible <60%) parmi les créneaux saisis
  let bon=0, moyen=0, faible=0;
  totals.slots.forEach(s => { const e=prod[s.label]; if(!e || !e.refNom) return; const r=gadhRendementSlot(e,s.minutes); if(r==null) return; if(r>=80) bon++; else if(r>=60) moyen++; else faible++; });

  // Evolution des 6 derniers jours
  const chartDays = [];
  for(let i=5;i>=0;i--){ const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()-i); const iso=toISODateLocal(d); const t=gadhDayTotals(iso); chartDays.push({label:iso.split('-').reverse()[0]+'/'+iso.split('-')[1], reel:t.totalReel, obj:t.totalObj}); }

  const heureLabel = new Date().getHours()<12 ? 'Bonjour' : (new Date().getHours()<18?'Bon après-midi':'Bonsoir');

  container.innerHTML = `
    <div class="card" style="background:linear-gradient(120deg,#0B2C4D,#123B63);color:#fff;position:relative;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:150px;">
          <h2 style="margin:0;font-size:19px;">☀️ ${heureLabel} ${esc(currentUser.nom.split(' ')[0])}</h2>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.75);">Voici l'aperçu de la production ${isToday?"d'aujourd'hui":'du '+date.split('-').reverse().join('/')}</p>
          <input type="date" value="${date}" max="${getTodayISO()}" onchange="gadhAttDate=this.value; nav('gadh-dashboard')" style="margin-top:8px;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:9px;padding:7px 10px;font-size:12.5px;">
        </div>
        <div style="text-align:center;flex-shrink:0;">
          <img src="${GADH_PRESS_IMG}" alt="Presse GADH" style="width:78px;height:78px;object-fit:cover;border-radius:12px;border:2px solid rgba(255,255,255,.3);box-shadow:0 4px 14px rgba(0,0,0,.35);">
          <div style="font-size:10px;color:#FFC72C;font-weight:700;font-style:italic;margin-top:5px;max-width:96px;line-height:1.3;">Qualité et performance au quotidien</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.15);font-size:10.5px;color:rgba(255,255,255,.65);font-style:italic;">Ensemble pour une meilleure performance</div>
    </div>

    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini" style="background:linear-gradient(160deg,#EFF6FF,var(--surface));border-color:#BFDBFE;">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#60A5FA,#2563EB);">🏭</div>
        <div class="kpi-mini-val">${totals.totalReel}</div><div class="kpi-mini-lbl">Production</div>
        ${gadhTrendBadge(totals.totalReel, yTotals.totalReel)}
      </div>
      <div class="kpi-mini" style="background:linear-gradient(160deg,#ECFDF5,var(--surface));border-color:#A7F3D0;">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#34D399,#059669);">🎯</div>
        <div class="kpi-mini-val">${totals.totalObj}</div><div class="kpi-mini-lbl">Objectif</div>
        ${totals.totalObj>0?`<div style="width:80%;height:5px;background:var(--border-soft);border-radius:4px;margin-top:4px;overflow:hidden;"><div style="width:${Math.min(100,Math.round(totals.rendement||0))}%;height:100%;background:#10B981;"></div></div><span style="font-size:10.5px;color:var(--ink-faint);font-weight:700;">${Math.round(totals.rendement||0)}% atteint</span>`:''}
      </div>
      <div class="kpi-mini" style="background:linear-gradient(160deg,#F5F3FF,var(--surface));border-color:#DDD6FE;">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#A78BFA,#7C3AED);">📈</div>
        <div class="kpi-mini-val">${totals.rendement!=null?Math.round(totals.rendement)+'%':'—'}</div><div class="kpi-mini-lbl">Rendement</div>
        ${totals.rendement!=null && yTotals.rendement!=null ? gadhTrendBadge(Math.round(totals.rendement), Math.round(yTotals.rendement)) : ''}
      </div>
    </div>

    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini" style="cursor:pointer;background:linear-gradient(160deg,#ECFDF5,var(--surface));border-color:#A7F3D0;" onclick="nav('gadh-rh')">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#34D399,#059669);">✓</div>
        <div class="kpi-mini-val">${present}</div><div class="kpi-mini-lbl">Présents</div>
      </div>
      <div class="kpi-mini" style="cursor:pointer;background:linear-gradient(160deg,#FEF2F2,var(--surface));border-color:#FECACA;" onclick="nav('gadh-rh')">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#F87171,#DC2626);">✕</div>
        <div class="kpi-mini-val">${absent}</div><div class="kpi-mini-lbl">Absents</div>
      </div>
      <div class="kpi-mini" style="cursor:pointer;background:linear-gradient(160deg,#F5F3FF,var(--surface));border-color:#DDD6FE;" onclick="nav('gadh-rh')">
        <div class="kpi-mini-icon" style="background:linear-gradient(145deg,#A78BFA,#7C3AED);">🕐</div>
        <div class="kpi-mini-val">${retard}</div><div class="kpi-mini-lbl">Retards</div>
      </div>
    </div>
    ${(() => { const rythme = gadhComputeRhythm(date); return rythme ? `
    <div class="card" style="background:linear-gradient(120deg,#0B2C4D,#123B63);color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:rgba(255,255,255,.75);">⏱️ Rythme à cette heure</span>
        <b style="font-size:14px;color:${rythme.color};">${Math.round(rythme.pct)}% · ${rythme.label}</b>
      </div>
    </div>` : ''; })()}

    <div class="card" style="border:1.5px solid ${alertes.length>0?'var(--warn)':'var(--border)'};">
      <h3 style="margin:0 0 8px;font-size:13px;">⚠️ Alertes</h3>
      ${alertes.length===0 ? `<p style="font-size:12px;color:var(--good);font-weight:700;margin:0;">✓ Aucune anomalie détectée</p>` : alertes.map(a=>`<p style="font-size:12px;color:var(--ink-soft);margin:4px 0;">${esc(a)}</p>`).join('')}
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:13px;">📈 Évolution de la production (6 derniers jours)</h3>
      ${gadhWeekChart(chartDays)}
      <div style="display:flex;gap:14px;justify-content:center;margin-top:4px;font-size:10.5px;color:var(--ink-soft);">
        <span>🔵 Production</span><span>🟢 Objectif</span>
      </div>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:13px;">🧵 Production par modèle</h3>
      ${refRanking.length===0 ? buildEmptyState("Aucune saisie ce jour-là") : refRanking.map(([nom,qty],i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${refColors[i%refColors.length]};flex-shrink:0;"></span>
          <span style="flex:1;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nom)}</span>
          <span style="font-size:12px;font-weight:800;width:38px;text-align:right;">${qty}</span>
          <div style="flex:1.4;height:7px;background:var(--border-soft);border-radius:4px;overflow:hidden;"><div style="width:${Math.round(qty/totalRefQty*100)}%;height:100%;background:${refColors[i%refColors.length]};"></div></div>
          <span style="font-size:10.5px;color:var(--ink-faint);width:32px;text-align:right;">${Math.round(qty/totalRefQty*100)}%</span>
        </div>
      `).join('')}
    </div>

    <div class="card" style="text-align:center;">
      <h3 style="margin:0 0 10px;font-size:13px;">⏱️ Taux de rendement</h3>
      ${gadhDonutMulti([{value:bon||0.0001,color:'#10B981'},{value:moyen,color:'#F59E0B'},{value:faible,color:'#EF4444'}], (totals.rendement!=null?Math.round(totals.rendement):0)+'%', 'Rendement', 150)}
      <div style="display:flex;justify-content:center;gap:14px;margin-top:10px;font-size:10.5px;">
        <span style="color:#10B981;font-weight:700;">● Bon (≥80%)<br><span style="color:var(--ink-faint);font-weight:600;">${bon} créneau${bon>1?'x':''}</span></span>
        <span style="color:#F59E0B;font-weight:700;">● Moyen (60-79%)<br><span style="color:var(--ink-faint);font-weight:600;">${moyen} créneau${moyen>1?'x':''}</span></span>
        <span style="color:#EF4444;font-weight:700;">● Faible (&lt;60%)<br><span style="color:var(--ink-faint);font-weight:600;">${faible} créneau${faible>1?'x':''}</span></span>
      </div>
    </div>

    <div class="kpi-mini-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="kpi-mini" style="cursor:pointer;text-align:left;padding:12px;" onclick="nav('gadh-production')">
        <div style="font-weight:800;font-size:12.5px;">📝 Nouvelle saisie</div><div style="font-size:10.5px;color:var(--ink-faint);">Enregistrer une production</div>
      </div>
      <div class="kpi-mini" style="cursor:pointer;text-align:left;padding:12px;" onclick="nav('gadh-historique')">
        <div style="font-weight:800;font-size:12.5px;">🕐 Historique</div><div style="font-size:10.5px;color:var(--ink-faint);">Voir les productions passées</div>
      </div>
      <div class="kpi-mini" style="cursor:pointer;text-align:left;padding:12px;" onclick="nav('gadh-stats')">
        <div style="font-weight:800;font-size:12.5px;">📊 Stats</div><div style="font-size:10.5px;color:var(--ink-faint);">Voir les statistiques</div>
      </div>
      <div class="kpi-mini" style="cursor:pointer;text-align:left;padding:12px;" onclick="nav('gadh-parametres')">
        <div style="font-weight:800;font-size:12.5px;">⚙️ Paramètres</div><div style="font-size:10.5px;color:var(--ink-faint);">Configuration</div>
      </div>
    </div>
  `;
  if(typeof prodCarteResume === 'function') prodCarteResume(container, 'gadh');
}

// ============================================================
// HISTORIQUE (Production + RH, jour par jour)
// ============================================================
let gadhHistDate = null;
function renderGadhHistorique(container){
  if(!gadhHistDate) gadhHistDate = getTodayISO();
  const date = gadhHistDate;
  const totals = gadhDayTotals(date);
  const emps = activeGadhEmployees();
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveGadhDayStatus(id, date)}));

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div class="field" style="margin:0;"><label>Date</label><input type="date" value="${date}" max="${getTodayISO()}" onchange="gadhHistDate=this.value; nav('gadh-historique')"></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">Production — ${date.split('-').reverse().join('/')}</h3>
      ${totals.slots.length===0 ? `<p style="font-size:11.5px;color:var(--ink-faint);">Jour non travaillé.</p>` : `
      <div class="kpi-grid" style="margin-bottom:10px;">
        <div class="kpi"><div class="label">Réel / Objectif</div><div class="value" style="font-size:15px;">${totals.totalReel} / ${totals.totalObj}</div></div>
        <div class="kpi"><div class="label">Rendement</div><div class="value">${totals.rendement!=null?Math.round(totals.rendement)+'%':'—'}</div></div>
      </div>
      ${(() => {
        const prod = getGadhProduction(date);
        const withEntry = totals.slots.filter(s=>prod[s.label] && prod[s.label].refNom);
        if(withEntry.length===0) return buildEmptyState("Aucune saisie ce jour-là");
        return withEntry.map(s => {
          const e = prod[s.label]; const obj = gadhObjectifSlot(e, s.minutes); const rend = gadhRendementSlot(e, s.minutes);
          return `<div class="session-row"><div><b style="font-size:12.5px;">${s.label}</b><div style="font-size:11px;color:var(--ink-soft);">${esc(e.refNom)}</div></div><div style="text-align:right;"><div style="font-weight:700;">${e.quantite||0} / ${obj}</div>${rend!=null?`<div style="font-size:11px;color:var(--ink-soft);">${Math.round(rend)}%</div>`:''}</div></div>`;
        }).join('');
      })()}
      `}
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">RH — ${date.split('-').reverse().join('/')}</h3>
      ${resolved.length===0 ? buildEmptyState("Aucun employé actif") : resolved.map(x => `
        <div class="session-row" style="cursor:pointer;" onclick="gadhFicheEmpId='${x.id}'; gadhRHView='personnel'; nav('gadh-rh')">
          <div><b style="font-size:12.5px;">${esc(x.e.nom)} ${esc(x.e.prenom||'')}</b></div>
          ${gadhBadgeFor(x.r)}
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// STATISTIQUES
// ============================================================
let gadhStatsPeriod = 'mois';
let gadhStatsDate = null;
let gadhStatsStart = null;
let gadhStatsEnd = null;
function gadhStatsRange(){
  const today = getTodayISO();
  if(gadhStatsPeriod==='jour') return {start: gadhStatsDate||today, end: gadhStatsDate||today};
  if(gadhStatsPeriod==='semaine'){ const d=new Date(today+'T00:00:00'); d.setDate(d.getDate()-6); return {start: toISODateLocal(d), end: today}; }
  if(gadhStatsPeriod==='mois'){ const mk = today.slice(0,7); const [y,m]=mk.split('-').map(Number); const last=new Date(y,m,0).getDate(); return {start: mk+'-01', end: mk+'-'+String(last).padStart(2,'0')}; }
  return {start: gadhStatsStart||today, end: gadhStatsEnd||today};
}
function renderGadhStats(container){
  const {start, end} = gadhStatsRange();
  let curr = new Date(start+'T00:00:00'); const endD = new Date(end+'T00:00:00');
  let totReel=0, totObj=0, g=0;
  let present=0, absent=0, retard=0, conge=0, maladie=0, autorisation=0;
  const emps = activeGadhEmployees();
  while(curr<=endD && g<370){
    const iso = toISODateLocal(curr);
    const t = gadhDayTotals(iso);
    totReel += t.totalReel; totObj += t.totalObj;
    emps.forEach(([id]) => {
      const r = resolveGadhDayStatus(id, iso);
      if(r.source==='periode'){ if(r.type==='conge') conge++; else maladie++; }
      else if(r.source==='pointage'){
        if(r.statut==='present') present++;
        else if(r.statut==='absent') absent++;
        else if(r.statut==='retard') retard++;
        else if(r.statut==='autorisation') autorisation++;
      }
    });
    curr.setDate(curr.getDate()+1); g++;
  }
  const rendement = totObj>0 ? (totReel/totObj*100) : null;

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        ${[['jour','Jour'],['semaine','7 jours'],['mois','Ce mois'],['perso','Personnalisé']].map(([k,l]) =>
          `<button class="btn ${gadhStatsPeriod===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:7px 4px;font-size:11px;" onclick="gadhStatsPeriod='${k}'; nav('gadh-stats')">${l}</button>`
        ).join('')}
      </div>
      ${gadhStatsPeriod==='jour' ? `<input type="date" value="${gadhStatsDate||getTodayISO()}" max="${getTodayISO()}" onchange="gadhStatsDate=this.value; nav('gadh-stats')">` : ''}
      ${gadhStatsPeriod==='perso' ? `<div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;margin:0;"><label style="font-size:10px;">Du</label><input type="date" value="${gadhStatsStart||getTodayISO()}" onchange="gadhStatsStart=this.value; nav('gadh-stats')"></div>
        <div class="field" style="flex:1;margin:0;"><label style="font-size:10px;">Au</label><input type="date" value="${gadhStatsEnd||getTodayISO()}" onchange="gadhStatsEnd=this.value; nav('gadh-stats')"></div>
      </div>` : ''}
      <p style="font-size:10.5px;color:var(--ink-faint);margin:8px 0 0;">Période : ${start.split('-').reverse().join('/')} → ${end.split('-').reverse().join('/')}</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">Production</h3>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Réel / Objectif</div><div class="value" style="font-size:15px;">${totReel} / ${totObj}</div></div>
        <div class="kpi"><div class="label">Rendement</div><div class="value">${rendement!=null?Math.round(rendement)+'%':'—'}</div></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">RH</h3>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="kpi-mini tint-green"><div class="kpi-mini-val">${present}</div><div class="kpi-mini-lbl">Présences</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${absent}</div><div class="kpi-mini-lbl">Absences</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${retard}</div><div class="kpi-mini-lbl">Retards</div></div>
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="kpi-mini tint-gold"><div class="kpi-mini-val">${conge}</div><div class="kpi-mini-lbl">Congés</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${maladie}</div><div class="kpi-mini-lbl">Maladie</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${autorisation}</div><div class="kpi-mini-lbl">Autorisations</div></div>
      </div>
    </div>
  `;
}
