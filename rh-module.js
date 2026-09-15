// ============================================================
// TEK-TREND — MODULE RESSOURCES HUMAINES (fichier séparé)
// ============================================================
// Ce fichier est chargé par index.html via <script src="./rh-module.js">.
// Il réutilise les utilitaires déjà définis dans index.html (getJSON,
// setJSON, esc, showToast, buildEmptyState, getTodayISO, nav, ICONS,
// currentUser, activeModule, rhAttDate, rhFicheEmpId) — rien n'est
// dupliqué, rien n'est modifié dans le reste de l'application.
//
// Registre RH indépendant de la liste des 4 opératrices utilisée pour la
// production (celle-ci reste inchangée). Le registre RH couvre TOUT le
// personnel (opératrices, responsable, chef de chaîne, autres postes).

function rhSectionContainer(container, title){
  container.innerHTML = `<div class="flex-header"><h2>${ICONS.idBadge} ${title}</h2></div><div id="rh-body"></div>`;
  return document.getElementById('rh-body');
}

// --- Données ---
function getEmployees(){ return getJSON('employees', {}); }
function saveEmployees(list){ setJSON('employees', list); }
function getAttendance(dateISO){ return getJSON('attendance_'+dateISO, {}); }
function saveAttendance(dateISO, data){ setJSON('attendance_'+dateISO, data); }
function getMonthlyBase(monthKey){ return getJSON('rh_base_'+monthKey, null); }
function setMonthlyBase(monthKey, hours){ setJSON('rh_base_'+monthKey, hours); }

const ATT_STATUS = {
  present:       {label:'Présent',      cls:'good',      short:'P'},
  retard:        {label:'Retard',       cls:'warn',      short:'R'},
  autorisation:  {label:'Autorisation', cls:'warn',      short:'A'},
  conge:         {label:'Congé',        cls:'excellent', short:'C'},
  maladie:       {label:'Maladie',      cls:'bad',       short:'M'},
  absent:        {label:'Absent',       cls:'bad',       short:'—'}
};
const RH_REF_START_MIN = 8*60; // 08:00 — référence pour le calcul automatique du retard
const RH_FORFAIT_HOURS = 8;    // heures comptées pour une journée présente sans heure d'arrivée/départ saisie

function currentMonthKey(){ return getTodayISO().slice(0,7); } // "YYYY-MM"
function monthLabel(monthKey){
  const [y,m] = monthKey.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
}
function daysInMonth(monthKey){
  const [y,m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function dayHoursFromInOut(a){
  if(a.in && a.out){
    const [h1,m1] = a.in.split(':').map(Number);
    const [h2,m2] = a.out.split(':').map(Number);
    const mins = Math.max(0, (h2*60+m2) - (h1*60+m1));
    return mins/60;
  }
  return RH_FORFAIT_HOURS;
}
function computeRetardHours(a){
  if(!a.in) return 0;
  const [h,m] = a.in.split(':').map(Number);
  return Math.max(0, ((h*60+m) - RH_REF_START_MIN)/60);
}

// Calcule les compteurs + heures travaillées d'un employé sur un mois donné.
function computeMonthlyStats(empId, monthKey){
  const nbDays = daysInMonth(monthKey);
  const counts = {present:0, retard:0, autorisation:0, conge:0, maladie:0, absent:0, nonRenseigne:0};
  let presenceH = 0, retardH = 0, autorisationH = 0;
  const days = [];
  for(let d=1; d<=nbDays; d++){
    const dateISO = monthKey+'-'+String(d).padStart(2,'0');
    const att = getAttendance(dateISO);
    const a = att[empId];
    if(!a || !a.status){ counts.nonRenseigne++; days.push({dateISO, status:null}); continue; }
    counts[a.status] = (counts[a.status]||0) + 1;
    if(a.status==='present'){ presenceH += dayHoursFromInOut(a); }
    else if(a.status==='retard'){ presenceH += dayHoursFromInOut(a); retardH += computeRetardHours(a); }
    else if(a.status==='autorisation'){ presenceH += dayHoursFromInOut(a); autorisationH += (parseFloat(a.autorisationHeures)||0); }
    days.push({dateISO, status:a.status, in:a.in, out:a.out});
  }
  const heuresTravaillees = Math.max(0, presenceH - retardH - autorisationH);
  const base = getMonthlyBase(monthKey);
  const ecart = (base!=null) ? (heuresTravaillees - base) : null;
  return {counts, presenceH, retardH, autorisationH, heuresTravaillees, base, ecart, days};
}

function rhStatusSelect(id, current, onchangeFn){
  return `<select id="${id}" onchange="${onchangeFn}">
    <option value="">— Non renseigné —</option>
    ${Object.entries(ATT_STATUS).map(([k,v]) => `<option value="${k}" ${current===k?'selected':''}>${v.label}</option>`).join('')}
  </select>`;
}

// ============================================================
// TABLEAU DE BORD RH
// ============================================================
function renderRHDashboard(container){
  const emps = getEmployees();
  const empList = Object.entries(emps);
  const actifs = empList.filter(([id,e]) => e.statut !== 'inactif');
  const today = getTodayISO();
  const att = getAttendance(today);
  let present=0, absent=0, retard=0, conge=0, autorisation=0, maladie=0;
  actifs.forEach(([id]) => {
    const st = att[id] && att[id].status;
    if(st==='present') present++;
    else if(st==='absent') absent++;
    else if(st==='retard') retard++;
    else if(st==='conge') conge++;
    else if(st==='autorisation') autorisation++;
    else if(st==='maladie') maladie++;
  });
  const effectif = actifs.length;
  const tauxPresence = effectif>0 ? Math.round(((present+retard+autorisation)/effectif)*100) : 0;

  const monthKey = rhMonthKey || currentMonthKey();
  rhMonthKey = monthKey;
  const base = getMonthlyBase(monthKey);
  let totalHeuresMois = 0;
  actifs.forEach(([id]) => { totalHeuresMois += computeMonthlyStats(id, monthKey).heuresTravaillees; });

  container.innerHTML = `
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-blue"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#4A9EFF,#0F62D6);">${ICONS.idBadge}</div><div class="kpi-mini-val">${effectif}</div><div class="kpi-mini-lbl">Effectif actif</div></div>
      <div class="kpi-mini tint-green"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#34D18C,#0E8F52);">${ICONS.check}</div><div class="kpi-mini-val">${present}</div><div class="kpi-mini-lbl">Présents</div></div>
      <div class="kpi-mini tint-red"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FF6B6B,#DC2E2E);">${ICONS.pause}</div><div class="kpi-mini-val">${absent}</div><div class="kpi-mini-lbl">Absents</div></div>
    </div>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FFC067,#D9822B);">${ICONS.clock}</div><div class="kpi-mini-val">${retard}</div><div class="kpi-mini-lbl">Retards</div></div>
      <div class="kpi-mini"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FFCB4D,#D9930C);">${ICONS.plane}</div><div class="kpi-mini-val">${conge}</div><div class="kpi-mini-lbl">Congés</div></div>
      <div class="kpi-mini tint-gold"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FFCB4D,#D9930C);">${ICONS.target}</div><div class="kpi-mini-val">${tauxPresence}%</div><div class="kpi-mini-lbl">Taux présence</div></div>
    </div>
    <p style="font-size:11px;color:var(--ink-faint);text-align:center;margin:2px 0 12px;">Instantané du ${today.split('-').reverse().join('/')}</p>

    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;">
        <h3 style="margin:0;">Base &amp; heures — <span style="text-transform:capitalize;">${monthLabel(monthKey)}</span></h3>
        <input type="month" value="${monthKey}" style="max-width:140px;" onchange="rhMonthKey=this.value; nav('rh-dashboard')">
      </div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="label">Base mensuelle</div>
          <div class="value">${base!=null ? base+' h' : '—'}</div>
          ${currentUser.role==='admin' ? `<button class="btn btn-ghost" style="margin-top:6px;padding:5px 10px;font-size:11px;" onclick="showSetBaseForm('${monthKey}')">${base!=null?'Modifier':'Définir'} la base</button>` : ''}
        </div>
        <div class="kpi">
          <div class="label">Heures travaillées (total)</div>
          <div class="value">${totalHeuresMois.toFixed(1)} h</div>
        </div>
      </div>
      <div id="rh-base-form"></div>
      ${base==null ? `<p style="font-size:11.5px;color:var(--ink-soft);margin-top:8px;">Aucune base saisie pour ce mois — l'écart par salarié ne pourra pas être calculé tant qu'elle n'est pas définie.</p>` : ''}
    </div>
  `;

  window.showSetBaseForm = (mk) => {
    const zone = document.getElementById('rh-base-form');
    const cur = getMonthlyBase(mk);
    zone.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
        <div class="field" style="margin-bottom:8px;"><label>Base officielle de ${monthLabel(mk)} (heures)</label><input type="number" id="rh-base-input" value="${cur!=null?cur:''}" placeholder="Ex : 208" min="0" step="0.5"></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveMonthlyBaseForm('${mk}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('rh-base-form').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  };
  window.saveMonthlyBaseForm = (mk) => {
    const val = parseFloat(document.getElementById('rh-base-input').value);
    if(isNaN(val) || val<0){ showToast('Merci de saisir un nombre d\'heures valide'); return; }
    setMonthlyBase(mk, val);
    showToast('Base mensuelle enregistrée');
    nav('rh-dashboard');
  };
}

// ============================================================
// PERSONNEL
// ============================================================
function renderRHPersonnel(container, canEdit){
  if(!window.rhPersonnelFilter) window.rhPersonnelFilter = {q:'', statut:'actif'};
  const f = window.rhPersonnelFilter;
  const emps = getEmployees();
  let rows = Object.entries(emps);
  if(f.statut !== 'tous') rows = rows.filter(([id,e]) => (e.statut||'actif') === f.statut);
  if(f.q.trim()){
    const q = f.q.trim().toLowerCase();
    rows = rows.filter(([id,e]) => (e.nom||'').toLowerCase().includes(q) || (e.matricule||'').toLowerCase().includes(q) || (e.poste||'').toLowerCase().includes(q));
  }
  rows.sort((a,b)=> (a[1].nom||'').localeCompare(b[1].nom||''));

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="rh-p-search" placeholder="Rechercher (nom, matricule, poste)…" value="${esc(f.q)}" style="flex:1;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:14px;" oninput="rhPersonnelFilter.q=this.value; renderRHPersonnel(document.getElementById('rh-body'), ${canEdit})">
        ${canEdit ? `<button class="btn btn-primary" style="padding:8px 12px;font-size:12px;flex-shrink:0;" onclick="showAddEmployeeForm()">+ Ajouter</button>` : ''}
      </div>
      <div style="display:flex;gap:6px;">
        ${[['actif','Actifs'],['inactif','Inactifs'],['tous','Tous']].map(([k,l]) => `<button class="btn ${f.statut===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:6px 4px;font-size:11.5px;" onclick="rhPersonnelFilter.statut='${k}'; renderRHPersonnel(document.getElementById('rh-body'), ${canEdit})">${l}</button>`).join('')}
      </div>
    </div>
    <div id="emp-form-zone"></div>
    <div class="card">
      ${rows.length===0 ? buildEmptyState("Aucun employé trouvé", canEdit ? "Ajoutez un membre du personnel ou modifiez la recherche." : "") : rows.map(([id,e]) => `
        <div class="session-row" style="cursor:pointer;" onclick="rhFicheEmpId='${id}'; nav('rh-fiche')">
          <div style="min-width:0;">
            <div style="font-weight:700;display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
              ${esc(e.nom)}
              ${(e.statut==='inactif') ? `<span class="badge red" style="font-size:9px;">Inactif</span>` : ''}
            </div>
            <div style="font-size:11.5px;color:var(--ink-soft);">${esc(e.poste||'—')} ${e.matricule ? '· Matricule '+esc(e.matricule) : ''}</div>
          </div>
          <div class="rank-chevron" style="flex-shrink:0;">${ICONS.chevronRight}</div>
        </div>
      `).join('')}
    </div>
  `;

  window.showAddEmployeeForm = () => renderEmployeeForm('add', null);
  window.showEditEmployeeForm = (id) => { event.stopPropagation(); renderEmployeeForm('edit', id); };

  function renderEmployeeForm(mode, id){
    const e = mode==='edit' ? emps[id] : {matricule:'', nom:'', poste:'', dateEmbauche:getTodayISO(), statut:'actif'};
    const zone = document.getElementById('emp-form-zone');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <h3 style="margin-top:0;">${mode==='add' ? 'Nouvel employé' : "Modifier l'employé"}</h3>
        <div class="field"><label>Matricule</label><input id="ef-matricule" value="${esc(e.matricule||'')}" placeholder="Ex : EMP-014"></div>
        <div class="field"><label>Nom complet</label><input id="ef-nom" value="${esc(e.nom)}" placeholder="Ex : Salma Ben Ali"></div>
        <div class="field"><label>Poste / Fonction</label><input id="ef-poste" value="${esc(e.poste||'')}" placeholder="Ex : Opératrice couture, Responsable magasin..."></div>
        <div class="field"><label>Date d'embauche</label><input type="date" id="ef-embauche" value="${e.dateEmbauche||''}"></div>
        ${mode==='edit' ? `<div class="field"><label>Statut</label><select id="ef-statut"><option value="actif" ${e.statut!=='inactif'?'selected':''}>Actif</option><option value="inactif" ${e.statut==='inactif'?'selected':''}>Inactif</option></select></div>` : ''}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveEmployeeForm('${mode}','${id||''}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('emp-form-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  }
  window.saveEmployeeForm = (mode, id) => {
    const nom = document.getElementById('ef-nom').value.trim();
    const matricule = document.getElementById('ef-matricule').value.trim();
    const poste = document.getElementById('ef-poste').value.trim();
    const dateEmbauche = document.getElementById('ef-embauche').value;
    if(!nom){ showToast('Le nom est obligatoire'); return; }
    const list = getEmployees();
    if(mode==='add'){
      const newId = 'e'+Date.now()+Math.floor(Math.random()*1000);
      list[newId] = {matricule, nom, poste, dateEmbauche, statut:'actif'};
    } else {
      const statut = document.getElementById('ef-statut').value;
      list[id] = {...list[id], matricule, nom, poste, dateEmbauche, statut};
    }
    saveEmployees(list);
    showToast('Employé enregistré');
    nav('rh-personnel');
  };
}

// ============================================================
// POINTAGE (présence du jour)
// ============================================================
function renderRHPointage(container, canEdit){
  if(!rhAttDate) rhAttDate = getTodayISO();
  const emps = getEmployees();
  const empRows = Object.entries(emps).filter(([id,e])=>e.statut!=='inactif').sort((a,b)=> (a[1].nom||'').localeCompare(b[1].nom||''));
  const att = getAttendance(rhAttDate);

  container.innerHTML = `
    <div class="card">
      <div class="field" style="margin:0;"><label>Date</label><input type="date" value="${rhAttDate}" max="${getTodayISO()}" onchange="rhAttDate=this.value; nav('rh-pointage')"></div>
    </div>
    <div class="card">
      ${empRows.length===0 ? buildEmptyState("Aucun employé actif", "Ajoutez du personnel dans l'onglet Personnel.") : empRows.map(([id,e]) => {
        const a = att[id] || {};
        const st = a.status;
        const retard = st==='retard' ? computeRetardHours(a) : 0;
        return `
        <div class="session-row" style="flex-direction:column;align-items:stretch;gap:7px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:700;">${esc(e.nom)}</div>
            <div style="font-size:11px;color:var(--ink-soft);">${esc(e.poste||'')}</div>
          </div>
          ${canEdit ? `
          ${rhStatusSelect('att-status-'+id, st, `setAttendanceStatus('${id}', this.value)`)}
          ${(st==='present' || st==='retard') ? `
          <div style="display:flex;gap:8px;">
            <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Arrivée</label><input type="time" value="${a.in||''}" onchange="setAttendanceField('${id}','in',this.value)"></div>
            <div class="field" style="margin:0;flex:1;"><label style="font-size:10px;">Départ</label><input type="time" value="${a.out||''}" onchange="setAttendanceField('${id}','out',this.value)"></div>
          </div>
          ${st==='retard' ? `<div style="font-size:11px;color:var(--warn);font-weight:700;">Retard calculé : ${retard.toFixed(2)} h (réf. 08:00)</div>` : ''}
          ` : ''}
          ${st==='autorisation' ? `<div class="field" style="margin:0;"><label style="font-size:10px;">Durée de l'autorisation (heures)</label><input type="number" min="0" step="0.5" value="${a.autorisationHeures||''}" placeholder="Ex : 2" onchange="setAttendanceField('${id}','autorisationHeures',this.value)"></div>` : ''}
          ` : `
          <div class="hour-rend ${st?ATT_STATUS[st].cls:''}" style="font-size:12px;width:fit-content;">${st?ATT_STATUS[st].label:'Non renseigné'}</div>
          ${a.in || a.out ? `<div style="font-size:11px;color:var(--ink-soft);">${a.in||'—'} → ${a.out||'—'}</div>` : ''}
          `}
        </div>
      `;}).join('')}
    </div>
  `;

  window.setAttendanceStatus = (empId, status) => {
    const a = getAttendance(rhAttDate);
    a[empId] = status ? {...(a[empId]||{}), status} : undefined;
    if(!status) delete a[empId];
    saveAttendance(rhAttDate, a);
    nav('rh-pointage');
  };
  window.setAttendanceField = (empId, field, value) => {
    const a = getAttendance(rhAttDate);
    a[empId] = {...(a[empId]||{}), [field]:value};
    saveAttendance(rhAttDate, a);
    if(field==='in') nav('rh-pointage'); // rafraîchit le calcul de retard affiché
  };
}

// ============================================================
// FICHE SALARIÉ
// ============================================================
function renderRHFiche(container, canEdit, empId){
  if(!empId){
    container.innerHTML = buildEmptyState("Aucun employé sélectionné", "Ouvrez une fiche depuis l'onglet Personnel.");
    return;
  }
  const emps = getEmployees();
  const e = emps[empId];
  if(!e){
    container.innerHTML = buildEmptyState("Employé introuvable", "Il a peut-être été supprimé.");
    return;
  }
  const monthKey = rhMonthKey || currentMonthKey();
  rhMonthKey = monthKey;
  const stats = computeMonthlyStats(empId, monthKey);
  const c = stats.counts;

  container.innerHTML = `
    <div class="card">
      <div class="flex-header" style="margin-bottom:2px;">
        <div>
          <h3 style="margin:0;display:flex;align-items:center;gap:8px;">${esc(e.nom)} ${e.statut==='inactif'?'<span class="badge red" style="font-size:9px;">Inactif</span>':''}</h3>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">${esc(e.poste||'—')}${e.matricule?' · Matricule '+esc(e.matricule):''}</div>
        </div>
        ${canEdit ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="rhEditFromFiche('${empId}')">Modifier</button>` : ''}
      </div>
      ${e.dateEmbauche ? `<div style="font-size:11.5px;color:var(--ink-faint);margin-top:6px;">Embauché(e) le ${e.dateEmbauche.split('-').reverse().join('/')}</div>` : ''}
      <div id="fiche-edit-zone"></div>
    </div>

    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;">
        <h3 style="margin:0;text-transform:capitalize;">${monthLabel(monthKey)}</h3>
        <input type="month" value="${monthKey}" style="max-width:140px;" onchange="rhMonthKey=this.value; nav('rh-fiche')">
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px;">
        <div class="kpi-mini tint-green"><div class="kpi-mini-val">${c.present||0}</div><div class="kpi-mini-lbl">Présences</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${c.retard||0}</div><div class="kpi-mini-lbl">Retards</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${c.absent||0}</div><div class="kpi-mini-lbl">Absences</div></div>
        <div class="kpi-mini tint-gold"><div class="kpi-mini-val">${c.conge||0}</div><div class="kpi-mini-lbl">Congés</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${c.autorisation||0}</div><div class="kpi-mini-lbl">Autorisations</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${c.maladie||0}</div><div class="kpi-mini-lbl">Maladie</div></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Heures travaillées</div><div class="value">${stats.heuresTravaillees.toFixed(1)} h</div></div>
        <div class="kpi"><div class="label">Écart vs base</div><div class="value" style="color:${stats.ecart==null?'inherit':(stats.ecart>=0?'var(--good)':'var(--bad)')};">${stats.ecart==null?'— (base non définie)':(stats.ecart>=0?'+':'')+stats.ecart.toFixed(1)+' h'}</div></div>
      </div>
      <p style="font-size:10.5px;color:var(--ink-faint);margin-top:8px;">Présence : ${stats.presenceH.toFixed(1)} h · Retards déduits : −${stats.retardH.toFixed(1)} h · Autorisations déduites : −${stats.autorisationH.toFixed(1)} h</p>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">Historique du mois</h3>
      <div style="max-height:320px;overflow-y:auto;">
        ${stats.days.filter(d=>d.status).length===0 ? buildEmptyState("Aucune saisie ce mois-ci") : stats.days.filter(d=>d.status).reverse().map(d => `
          <div class="session-row" style="padding:7px 0;">
            <div style="font-size:12.5px;">${d.dateISO.split('-').reverse().join('/')}</div>
            <div class="hour-rend ${ATT_STATUS[d.status].cls}" style="font-size:11px;">${ATT_STATUS[d.status].label}${d.in?' · '+d.in+(d.out?'→'+d.out:''):''}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  window.rhEditFromFiche = (id) => {
    const zone = document.getElementById('fiche-edit-zone');
    zone.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
        <div class="field"><label>Matricule</label><input id="ef-matricule" value="${esc(e.matricule||'')}"></div>
        <div class="field"><label>Nom complet</label><input id="ef-nom" value="${esc(e.nom)}"></div>
        <div class="field"><label>Poste / Fonction</label><input id="ef-poste" value="${esc(e.poste||'')}"></div>
        <div class="field"><label>Date d'embauche</label><input type="date" id="ef-embauche" value="${e.dateEmbauche||''}"></div>
        <div class="field"><label>Statut</label><select id="ef-statut"><option value="actif" ${e.statut!=='inactif'?'selected':''}>Actif</option><option value="inactif" ${e.statut==='inactif'?'selected':''}>Inactif</option></select></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveEmployeeForm('edit','${id}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('fiche-edit-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `;
  };
  // saveEmployeeForm est défini dans renderRHPersonnel ; on le redéfinit ici au cas
  // où la Fiche est ouverte sans être passé par Personnel dans cette session.
  if(typeof window.saveEmployeeForm !== 'function'){
    window.saveEmployeeForm = (mode, id) => {
      const nom = document.getElementById('ef-nom').value.trim();
      if(!nom){ showToast('Le nom est obligatoire'); return; }
      const list = getEmployees();
      list[id] = {
        ...list[id],
        matricule: document.getElementById('ef-matricule').value.trim(),
        nom,
        poste: document.getElementById('ef-poste').value.trim(),
        dateEmbauche: document.getElementById('ef-embauche').value,
        statut: document.getElementById('ef-statut').value
      };
      saveEmployees(list);
      showToast('Employé enregistré');
      nav('rh-fiche');
    };
  }
}
