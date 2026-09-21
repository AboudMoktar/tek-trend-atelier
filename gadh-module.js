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
function renderGadhDashboard(container){
  const today = getTodayISO();
  const emps = activeGadhEmployees();
  const totals = gadhDayTotals(today);
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveGadhDayStatus(id, today)}));
  const present = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='present').length;
  const absent = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='absent').length
               + resolved.filter(x=>x.r.source==='periode').length;
  const retard = resolved.filter(x=>x.r.source==='pointage' && x.r.statut==='retard').length;
  const nonRenseignes = resolved.filter(x=>x.r.source===null);
  const alertes = [];
  if(!isGadhWorkingDay(today)) alertes.push("Aujourd'hui n'est pas un jour travaillé selon le planning actuel.");
  if(activeGadhReferences().length===0) alertes.push("Aucune référence/cadence n'est configurée — allez dans Paramètres.");
  if(nonRenseignes.length>0) alertes.push(nonRenseignes.length+" salarié(s) non renseigné(s) aujourd'hui.");

  container.innerHTML = `
    <p style="font-size:12px;color:var(--ink-soft);text-align:center;margin:0 0 10px;">${today.split('-').reverse().join('/')}</p>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-blue"><div class="kpi-mini-val">${totals.totalReel}</div><div class="kpi-mini-lbl">Production du jour</div></div>
      <div class="kpi-mini"><div class="kpi-mini-val">${totals.totalObj}</div><div class="kpi-mini-lbl">Objectif du jour</div></div>
      <div class="kpi-mini ${totals.rendement!=null && totals.rendement>=100?'tint-green':''}"><div class="kpi-mini-val">${totals.rendement!=null?Math.round(totals.rendement)+'%':'—'}</div><div class="kpi-mini-lbl">Rendement</div></div>
    </div>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-green" style="cursor:pointer;" onclick="nav('gadh-rh')"><div class="kpi-mini-val">${present}</div><div class="kpi-mini-lbl">Présents</div></div>
      <div class="kpi-mini tint-red" style="cursor:pointer;" onclick="nav('gadh-rh')"><div class="kpi-mini-val">${absent}</div><div class="kpi-mini-lbl">Absents</div></div>
      <div class="kpi-mini" style="cursor:pointer;" onclick="nav('gadh-rh')"><div class="kpi-mini-val">${retard}</div><div class="kpi-mini-lbl">Retards</div></div>
    </div>
    <div class="card" style="border:1.5px solid ${alertes.length>0?'var(--warn)':'var(--border)'};">
      <h3 style="margin:0 0 8px;font-size:13px;">⚠️ Alertes</h3>
      ${alertes.length===0 ? `<p style="font-size:12px;color:var(--good);font-weight:700;margin:0;">✓ Aucune anomalie</p>` : alertes.map(a=>`<p style="font-size:12px;color:var(--ink-soft);margin:4px 0;">${esc(a)}</p>`).join('')}
    </div>
  `;
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
