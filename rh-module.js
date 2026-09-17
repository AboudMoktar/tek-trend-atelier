// ============================================================
// TEK-TREND — MODULE RESSOURCES HUMAINES (fichier séparé)
// ============================================================
// Chargé par index.html via <script src="./rh-module.js">. Réutilise les
// utilitaires déjà définis dans index.html (getJSON, setJSON, esc,
// showToast, buildEmptyState, getTodayISO, nav, ICONS, currentUser,
// activeModule, rhAttDate, rhFicheEmpId) — rien n'est dupliqué, rien n'est
// modifié dans le reste de l'application (Rendement inchangé).
//
// --- MODÈLE DE STATUT (source unique de vérité, priorité claire) ---
// Pour un employé et une date donnés, le statut effectif du jour est :
//   1) une PÉRIODE D'ABSENCE qui couvre cette date (Maladie / Congé /
//      Absence autorisée / Absence non justifiée / Autre) — saisie UNE
//      SEULE FOIS pour toute la période, jamais jour par jour ;
//   2) sinon, le POINTAGE du jour (Présent ou Absent) ;
//   3) sinon, NON RENSEIGNÉ.
// Un jour ne peut donc jamais être "malade" ET "absent non justifié" en
// même temps : resolveDayStatus() est le SEUL endroit qui tranche, et tout
// le module (Pointage, Tableau de bord, Fiche, Synthèse) passe par lui.
// Retard et durée d'autorisation ne sont JAMAIS saisis à la main : ils sont
// calculés automatiquement à partir des heures.

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
function getAbsencePeriods(){ return getJSON('absence_periods', {}); }
function saveAbsencePeriods(list){ setJSON('absence_periods', list); }

// Pointage journalier : seulement 2 choix (le reste passe par les périodes).
const ATT_STATUS = {
  present: {label:'Présent', cls:'good', icon:'✓'},
  absent:  {label:'Absent',  cls:'bad',  icon:'✕'}
};
// Types d'absence par période.
const ABSENCE_TYPES = {
  maladie:     {label:'Maladie',               cls:'bad',       justified:true},
  conge:       {label:'Congé',                 cls:'excellent', justified:true},
  autorisee:   {label:'Absence autorisée',     cls:'warn',      justified:true},
  injustifiee: {label:'Absence non justifiée', cls:'bad',       justified:false},
  autre:       {label:'Autre',                 cls:'warn',      justified:true}
};
// --- Horaires RÉELS (Params) vs BASE MENSUELLE (référence 48h/semaine) ---
// Ces deux notions sont volontairement distinctes et ne doivent jamais être
// confondues :
//  - Les horaires journaliers RÉELS (Lun-Ven 08:00-17:00 avec pause, Samedi
//    08:00-12:00 par défaut, modifiables dans Params) servent au pointage,
//    au calcul du retard et des heures travaillées. Ils viennent de
//    getScheduleSettings()/getSlotsForDate(), déjà utilisées par le
//    Rendement — aucune deuxième logique d'horaires n'est créée ici.
//  - La BASE MENSUELLE reste un régime de RÉFÉRENCE de 48h/semaine (mensualisé
//    à 48×52/12 = 208h), totalement indépendant du planning réel. Elle est
//    toujours saisie manuellement par le Responsable (jamais recalculée
//    automatiquement) ; seule une suggestion basée sur 48h/semaine est
//    proposée pour l'aider à la remplir.
const RH_BASE_REFERENCE_HEBDO = 48;
const RH_BASE_SUGGESTION = Math.round(RH_BASE_REFERENCE_HEBDO * 52/12); // 208 h
function getRefStartMin(dateISO){
  const sch = getScheduleSettings();
  const dow = new Date(dateISO+'T00:00:00').getDay();
  return timeToMin(dow===6 ? sch.saturdayStart : sch.weekdayStart);
}
function getPlannedHoursForDate(dateISO){
  return getSlotsForDate(dateISO).reduce((s,sl)=>s+sl.minutes, 0) / 60;
}

// --- PONT avec le module Rendement (Saisie) ---
// Détermine si un créneau horaire d'une opératrice doit être automatiquement
// exclu de l'objectif ce jour-là, d'après son statut RH — sans jamais rien
// écrire dans les données de Saisie. Une saisie manuelle (ex: "ABS" tapé à la
// main) garde toujours la priorité, ce pont ne s'applique qu'aux cases vides.
// Correspondance entre les deux modules : par NOM exact (insensible à la
// casse/aux espaces) entre la liste des opératrices (Rendement) et la liste
// des employés (RH) — s'il n'y a pas de correspondance ou pas de donnée RH
// ce jour-là, rien ne change (comportement Saisie inchangé).
function rhSlotExcluded(opName, dateISO, slotStartMin, slotEndMin){
  const emps = getEmployees();
  const entry = Object.entries(emps).find(([id,e]) => (e.nom||'').trim().toLowerCase() === (opName||'').trim().toLowerCase());
  if(!entry) return false;
  const [empId] = entry;
  const r = resolveDayStatus(empId, dateISO);
  if(r.source==='periode') return true; // maladie / congé / autorisée / injustifiée -> journée entière
  if(r.source==='pointage'){
    if(r.status==='absent') return true;
    if(r.status==='present'){
      if(r.in){
        const refMin = getRefStartMin(dateISO);
        const arriveeMin = hhmmToMin(r.in);
        if(arriveeMin > refMin && slotStartMin < arriveeMin && slotEndMin > refMin) return true; // retard chevauche ce créneau
      }
      for(const au of (r.autorisations||[])){
        if(au.sortie && au.retour){
          const s = hhmmToMin(au.sortie), e = hhmmToMin(au.retour);
          if(slotStartMin < e && slotEndMin > s) return true; // autorisation chevauche ce créneau
        }
      }
    }
  }
  return false;
}
// Version PROPORTIONNELLE (0 à 1) utilisée pour le calcul de l'objectif :
// un retard ou une autorisation ne réduit pas tout le créneau à zéro, mais
// seulement la part de temps réellement perdue sur ce créneau précis.
// Exemple : cadence 20 pièces/h, retard jusqu'à 08:15 sur un créneau
// 08:00-09:00 -> 15 min perdues sur 60 -> fraction 0,75 -> objectif 15 pièces.
function rhSlotFraction(opName, dateISO, slotStartMin, slotEndMin){
  const emps = getEmployees();
  const entry = Object.entries(emps).find(([id,e]) => (e.nom||'').trim().toLowerCase() === (opName||'').trim().toLowerCase());
  if(!entry) return 1; // pas de correspondance RH -> comportement inchangé
  const [empId] = entry;
  const r = resolveDayStatus(empId, dateISO);
  const slotDur = slotEndMin - slotStartMin;
  if(slotDur<=0) return 1;
  if(r.source==='periode') return 0; // absence totale sur toute la journée
  if(r.source==='pointage'){
    if(r.status==='absent') return 0;
    if(r.status==='present'){
      let lost = 0;
      if(r.in){
        const refMin = getRefStartMin(dateISO);
        const arriveeMin = hhmmToMin(r.in);
        if(arriveeMin > refMin){
          const oStart = Math.max(slotStartMin, refMin), oEnd = Math.min(slotEndMin, arriveeMin);
          if(oEnd > oStart) lost += (oEnd - oStart);
        }
      }
      (r.autorisations||[]).forEach(au => {
        if(au.sortie && au.retour){
          const s = hhmmToMin(au.sortie), e = hhmmToMin(au.retour);
          const oStart = Math.max(slotStartMin, s), oEnd = Math.min(slotEndMin, e);
          if(oEnd > oStart) lost += (oEnd - oStart);
        }
      });
      return Math.max(0, Math.min(1, 1 - lost/slotDur));
    }
  }
  return 1;
}
// Résumé RH du jour pour affichage en haut de Saisie — uniquement les
// opératrices ayant un statut RH particulier notable ce jour (rien si tout
// est normal/non renseigné, pour ne pas surcharger l'écran).
function rhDaySummaryForOps(opNames, dateISO){
  const emps = getEmployees();
  const out = [];
  opNames.forEach(opName => {
    const entry = Object.entries(emps).find(([id,e]) => (e.nom||'').trim().toLowerCase() === (opName||'').trim().toLowerCase());
    if(!entry) return;
    const [empId] = entry;
    const r = resolveDayStatus(empId, dateISO);
    if(r.source==='periode'){
      out.push({opName, label: ABSENCE_TYPES[r.type].label, cls: ABSENCE_TYPES[r.type].cls});
    } else if(r.source==='pointage'){
      if(r.status==='absent') out.push({opName, label:'Absent (RH)', cls:'bad'});
      else if(r.status==='present'){
        const retard = computeRetardHours(r);
        if(retard>0) out.push({opName, label:'Retard '+fmtH(retard), cls:'warn'});
        (r.autorisations||[]).forEach(au => { if(au.sortie && !au.retour) out.push({opName, label:'En sortie depuis '+au.sortie, cls:'warn'}); });
      }
    }
  });
  return out;
}

function currentMonthKey(){ return getTodayISO().slice(0,7); }
function monthLabel(monthKey){
  const [y,m] = monthKey.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
}
function daysInMonth(monthKey){
  const [y,m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function hhmmToMin(hhmm){ const [h,m] = hhmm.split(':').map(Number); return h*60+m; }
function minToHHMM(mins){ const h=Math.floor(mins/60), m=Math.round(mins%60); return String(h).padStart(2,'0')+'h'+String(m).padStart(2,'0'); }
// Affichage en heures décimales avec virgule (convention française), ex: 0,50 h
function fmtH(h){ return h.toFixed(2).replace('.', ',')+' h'; }

// Règle métier du retard : le temps de retard est découpé en tranches de
// 30 min à partir de 08h00. Chaque tranche entamée n'est comptée que si on
// dépasse 5 min dedans (tolérance). Exemples : 3 min de retard -> 0 (dans la
// tolérance) ; 7 min -> 1 tranche = 0,50 h ; 35 min -> 1 tranche = 0,50 h
// (5 min dans la 2e tranche, pas encore au-delà de la tolérance) ; 36 min ->
// 2 tranches = 1,00 h.
function computeRetardHours(a){
  if(!a || !a.in) return 0;
  const refMin = getRefStartMin(a.dateISO || getTodayISO());
  const minutesLate = hhmmToMin(a.in) - refMin;
  if(minutesLate <= 0) return 0;
  const blocsComplets = Math.floor(minutesLate/30);
  const reste = minutesLate % 30;
  const blocs = blocsComplets + (reste > 5 ? 1 : 0);
  return blocs * 0.5;
}
function autorisationDureeH(auth){
  if(!auth || !auth.sortie || !auth.retour) return 0;
  return Math.max(0, (hhmmToMin(auth.retour) - hhmmToMin(auth.sortie))/60);
}
function computeAutorisationsHours(a){
  if(!a || !Array.isArray(a.autorisations)) return 0;
  return a.autorisations.reduce((s,auth) => s + autorisationDureeH(auth), 0);
}
// Une autorisation "dépasse" si une heure de retour prévue a été indiquée et
// que le retour réel est plus tardif.
function autorisationDepassee(auth){
  return !!(auth.prevue && auth.retour && hhmmToMin(auth.retour) > hhmmToMin(auth.prevue));
}

// --- Résolution du statut effectif (SOURCE UNIQUE DE VÉRITÉ) ---
function findAbsencePeriod(empId, dateISO){
  const periods = getAbsencePeriods();
  return Object.entries(periods).find(([id,p]) => p.empId===empId && p.dateStart<=dateISO && dateISO<=p.dateEnd) || null;
}
function resolveDayStatus(empId, dateISO){
  const found = findAbsencePeriod(empId, dateISO);
  if(found){
    const [pid,p] = found;
    return {source:'periode', type:p.type, periodId:pid, dateStart:p.dateStart, dateEnd:p.dateEnd, motif:p.motif||'', dateISO};
  }
  const att = getAttendance(dateISO);
  const a = att[empId];
  if(a && a.status){
    return {source:'pointage', status:a.status, in:a.in||'', autorisations:a.autorisations||[], dateISO};
  }
  return {source:null, dateISO};
}

// Calcule les compteurs + heures travaillées d'un employé sur un mois donné.
// Calcule les compteurs + heures travaillées d'un employé sur une plage de
// dates QUELCONQUE (un seul jour, une semaine, une période personnalisée...).
// C'est la fonction générique ; computeMonthlyStats() n'est qu'un raccourci
// pratique pour un mois calendaire complet (avec en plus la base mensuelle).
function computeStatsForRange(empId, dateStart, dateEnd){
  const counts = {present:0, absent:0, maladie:0, conge:0, autorisee:0, injustifiee:0, autre:0, nonRenseigne:0};
  let presenceH=0, retardH=0, autorisationH=0, joursRetard=0, nbAutorisations=0;
  const days = [];
  let cur = new Date(dateStart+'T00:00:00');
  const end = new Date(dateEnd+'T00:00:00');
  let guard = 0;
  while(cur <= end && guard < 400){
    guard++;
    const dateISO = toISODateLocal(cur);
    const r = resolveDayStatus(empId, dateISO);
    if(r.source==='periode'){
      counts[r.type] = (counts[r.type]||0)+1;
      days.push({dateISO, source:'periode', type:r.type});
    } else if(r.source==='pointage'){
      if(r.status==='present'){
        counts.present++;
        presenceH += getPlannedHoursForDate(dateISO);
        const retard = computeRetardHours(r);
        if(retard>0) joursRetard++;
        retardH += retard;
        const auth = computeAutorisationsHours(r);
        nbAutorisations += (r.autorisations||[]).filter(x=>x.sortie && x.retour).length;
        autorisationH += auth;
        days.push({dateISO, source:'pointage', status:'present', in:r.in, retard, autorisations:r.autorisations, autorisationTotal:auth});
      } else if(r.status==='absent'){
        counts.absent++;
        days.push({dateISO, source:'pointage', status:'absent'});
      } else {
        counts[r.status] = (counts[r.status]||0)+1;
        days.push({dateISO, source:'pointage', status:r.status});
      }
    } else {
      counts.nonRenseigne++;
      days.push({dateISO, source:null});
    }
    cur.setDate(cur.getDate()+1);
  }
  const heuresTravaillees = Math.max(0, presenceH - retardH - autorisationH);
  const absencesJustifiees = (counts.maladie||0)+(counts.conge||0)+(counts.autorisee||0)+(counts.autre||0);
  const absencesNonJustifiees = (counts.absent||0) + (counts.injustifiee||0);
  return {counts, presenceH, retardH, autorisationH, joursRetard, nbAutorisations, heuresTravaillees, days, absencesJustifiees, absencesNonJustifiees};
}
function computeMonthlyStats(empId, monthKey){
  const nbDays = daysInMonth(monthKey);
  const stats = computeStatsForRange(empId, monthKey+'-01', monthKey+'-'+String(nbDays).padStart(2,'0'));
  const base = getMonthlyBase(monthKey);
  stats.base = base;
  stats.ecart = (base!=null) ? (stats.heuresTravaillees - base) : null;
  return stats;
}

function rhStatusSelect(id, current, onchangeFn){
  return `<select id="${id}" onchange="${onchangeFn}">
    <option value="">— Non renseigné —</option>
    ${Object.entries(ATT_STATUS).map(([k,v]) => `<option value="${k}" ${current===k?'selected':''}>${v.label}</option>`).join('')}
  </select>`;
}
function activeEmployees(){
  return Object.entries(getEmployees()).filter(([id,e])=>e.statut!=='inactif').sort((a,b)=>(a[1].nom||'').localeCompare(b[1].nom||''));
}

// --- Petite modale générique réutilisée par les indicateurs cliquables ---
function rhModal(title, bodyHtml){
  const zone = document.getElementById('rh-modal-zone');
  if(!zone) return;
  zone.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this) rhCloseModal()">
      <div class="modal-sheet">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="margin:0;">${title}</h3>
          <button class="icon-btn" onclick="rhCloseModal()">✕</button>
        </div>
        ${bodyHtml}
      </div>
    </div>
  `;
}
window.rhCloseModal = () => { const z = document.getElementById('rh-modal-zone'); if(z) z.innerHTML=''; };

// --- Formulaire "Nouvelle absence" (période) ---
function rhAbsenceForm(prefEmpId, editId){
  const emps = activeEmployees();
  const p = editId ? getAbsencePeriods()[editId] : null;
  const empOptions = emps.map(([id,e]) => `<option value="${id}" ${id===(p?p.empId:prefEmpId)?'selected':''}>${esc(e.nom)}</option>`).join('');
  return `
    <div class="field"><label>Salarié</label><select id="ab-emp" ${editId?'disabled':''}>${empOptions}</select></div>
    <div class="field"><label>Type</label><select id="ab-type">${Object.entries(ABSENCE_TYPES).map(([k,v])=>`<option value="${k}" ${p&&p.type===k?'selected':''}>${v.label}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>Date début</label><input type="date" id="ab-start" value="${p?p.dateStart:getTodayISO()}"></div>
      <div class="field" style="flex:1;"><label>Date fin</label><input type="date" id="ab-end" value="${p?p.dateEnd:getTodayISO()}"></div>
    </div>
    <div class="field"><label>Motif (optionnel)</label><input id="ab-motif" value="${p?esc(p.motif||''):''}" placeholder="Précisions..."></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="flex:1;" onclick="saveAbsenceForm('${editId||''}')">${editId?'Enregistrer les modifications':"Enregistrer l'absence"}</button>
      ${editId ? `<button class="btn btn-warning" onclick="deleteAbsencePeriod('${editId}')">Supprimer</button>` : ''}
    </div>
    ${!editId ? `<p style="font-size:10.5px;color:var(--ink-faint);margin-top:8px;">Une seule saisie couvre toute la période — inutile de repointer chaque jour.</p>` : ''}
  `;
}
window.showAbsenceForm = (empId) => { rhModal('Nouvelle absence', rhAbsenceForm(empId||'', null)); };
window.showEditAbsenceForm = (periodId) => { rhModal("Modifier l'absence", rhAbsenceForm(null, periodId)); };
window.saveAbsenceForm = (editId) => {
  const empId = document.getElementById('ab-emp').value;
  const type = document.getElementById('ab-type').value;
  const dateStart = document.getElementById('ab-start').value;
  const dateEnd = document.getElementById('ab-end').value;
  const motif = document.getElementById('ab-motif').value.trim();
  if(!empId){ showToast('Sélectionnez un salarié'); return; }
  if(!dateStart || !dateEnd){ showToast('Dates requises'); return; }
  if(new Date(dateEnd) < new Date(dateStart)){ showToast('La date de fin doit être après la date de début'); return; }
  const list = getAbsencePeriods();
  const id = editId || ('ab'+Date.now()+Math.floor(Math.random()*1000));
  list[id] = {empId, type, dateStart, dateEnd, motif};
  saveAbsencePeriods(list);
  showToast(editId ? 'Absence modifiée' : 'Absence enregistrée pour toute la période');
  rhCloseModal();
  nav(activeTabIsRH());
};
window.deleteAbsencePeriod = (id) => {
  if(!confirm("Supprimer cette période d'absence ? Le salarié redeviendra soumis au pointage normal sur ces dates.")) return;
  const list = getAbsencePeriods();
  delete list[id];
  saveAbsencePeriods(list);
  showToast('Période supprimée');
  rhCloseModal();
  nav(activeTabIsRH());
};
function activeTabIsRH(){ return (activeTab && activeTab.indexOf('rh-')===0) ? activeTab : 'rh-dashboard'; }

// ============================================================
// TABLEAU DE BORD RH
// ============================================================
function renderRHDashboard(container){
  if(!rhAttDate) rhAttDate = getTodayISO();
  if(!window.rhDashFilter) window.rhDashFilter = 'tous';
  const date = rhAttDate;
  const emps = activeEmployees();
  const isToday = date === getTodayISO();

  // Résolution du statut de chaque employé pour la date affichée (source unique de vérité).
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveDayStatus(id, date)}));

  const presents = resolved.filter(x => x.r.source==='pointage' && x.r.status==='present');
  const absentsPointage = resolved.filter(x => x.r.source==='pointage' && x.r.status==='absent');
  const absentsPeriode = resolved.filter(x => x.r.source==='periode');
  const nonRenseignes = resolved.filter(x => x.r.source===null);
  const retards = presents.filter(x => computeRetardHours(x.r) > 0);
  const enSortie = presents.filter(x => (x.r.autorisations||[]).some(a=>a.sortie && !a.retour));
  const maladies = absentsPeriode.filter(x => x.r.type==='maladie');
  const conges = absentsPeriode.filter(x => x.r.type==='conge');
  const autorisees = absentsPeriode.filter(x => x.r.type==='autorisee');
  const nonJustifieesPeriode = absentsPeriode.filter(x => x.r.type==='injustifiee');
  const justifiees = absentsPeriode.filter(x => ABSENCE_TYPES[x.r.type].justified);
  const nonJustifiees = [...nonJustifieesPeriode, ...absentsPointage];
  const totalAbsents = justifiees.length + nonJustifiees.length;

  // ② À TRAITER — anomalies nécessitant une action. "Retard non justifié" n'est pas
  // détectable (aucun champ de justification n'existe) : volontairement laissé de côté.
  const now = new Date();
  const nowMin = now.getHours()*60+now.getMinutes();
  // Pour aujourd'hui, on ne signale "oubli de pointage" qu'après l'heure de début réelle
  // de la journée (ex. 08:00) — avant, la journée n'a simplement pas encore commencé.
  const journeeCommencee = !isToday || nowMin >= getRefStartMin(date);
  const anomOubli = (date <= getTodayISO() && journeeCommencee) ? nonRenseignes : [];
  const anomSortiePasse = !isToday ? presents.filter(x => (x.r.autorisations||[]).some(a=>a.sortie && !a.retour)) : [];
  const anomDepassement = [];
  presents.forEach(x => (x.r.autorisations||[]).forEach(a => { if(autorisationDepassee(a)) anomDepassement.push({id:x.id, e:x.e, a}); }));
  const anomIncoherent = [];
  presents.forEach(x => (x.r.autorisations||[]).forEach(a => { if(a.retour && !a.sortie) anomIncoherent.push({id:x.id, e:x.e}); }));
  const nbAnomalies = anomOubli.length + anomSortiePasse.length + anomDepassement.length + anomIncoherent.length;

  // ④ Sorties en cours — retour dépassé = comparé à l'heure actuelle, seulement pour aujourd'hui.
  const sortiesEnCours = enSortie.map(x => {
    const au = (x.r.autorisations||[]).find(a=>a.sortie && !a.retour);
    const depasse = isToday && au.prevue && nowMin > hhmmToMin(au.prevue);
    return {x, au, depasse};
  });

  const effectif = emps.length;
  const tauxPresence = effectif>0 ? Math.round((presents.length/effectif)*100) : 0;

  const monthKey = rhMonthKey || currentMonthKey();
  rhMonthKey = monthKey;
  const base = getMonthlyBase(monthKey);
  let totalHeuresMois = 0;
  emps.forEach(([id]) => { totalHeuresMois += computeMonthlyStats(id, monthKey).heuresTravaillees; });

  const dateNav = (delta) => { const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()+delta); return toISODateLocal ? toISODateLocal(d) : d.toISOString().slice(0,10); };
  const jourNom = new Date(date+'T00:00:00').toLocaleDateString('fr-FR', {weekday:'long'});
  const heureActuelle = now.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

  // ⑤ Situation du personnel — filtres rapides
  const dashFiltered = {
    tous: resolved, presents, retards,
    absents: [...absentsPointage, ...nonJustifieesPeriode],
    maladie: maladies, conges, sorties: enSortie
  }[rhDashFilter] || resolved;

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="text-transform:capitalize;font-size:12.5px;color:var(--ink-soft);font-weight:700;">${jourNom} · ${heureActuelle}</div>
        <button class="btn btn-ghost" style="padding:5px 9px;font-size:11px;" onclick="nav('rh-dashboard')">${ICONS.clock} Actualiser</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="rhAttDate='${dateNav(-1)}'; nav('rh-dashboard')">‹</button>
        <div class="field" style="margin:0;flex:1;"><input type="date" value="${date}" max="${getTodayISO()}" onchange="rhAttDate=this.value; nav('rh-dashboard')"></div>
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="rhAttDate='${dateNav(1)}'; nav('rh-dashboard')" ${date>=getTodayISO()?'disabled':''}>›</button>
        ${!isToday ? `<button class="btn btn-ghost" style="padding:9px 10px;font-size:11px;flex-shrink:0;" onclick="rhAttDate=getTodayISO(); nav('rh-dashboard')">Aujourd'hui</button>` : ''}
      </div>
    </div>

    <div style="font-size:11px;color:var(--ink-faint);font-weight:800;text-transform:uppercase;letter-spacing:.4px;margin:10px 2px 6px;">① Situation du jour</div>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-blue" style="cursor:pointer;" onclick="rhShowEffectif()"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#4A9EFF,#0F62D6);">${ICONS.idBadge}</div><div class="kpi-mini-val">${effectif}</div><div class="kpi-mini-lbl">Effectif</div></div>
      <div class="kpi-mini tint-green" style="cursor:pointer;" onclick="rhShowPresents()"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#34D18C,#0E8F52);">${ICONS.check}</div><div class="kpi-mini-val">${presents.length}</div><div class="kpi-mini-lbl">Présents</div></div>
      <div class="kpi-mini" style="cursor:pointer;" onclick="rhShowRetards()"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FFC067,#D9822B);">${ICONS.clock}</div><div class="kpi-mini-val">${retards.length}</div><div class="kpi-mini-lbl">Retards</div></div>
    </div>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(2,1fr);">
      <div class="kpi-mini tint-red" style="cursor:pointer;" onclick="rhShowAbsents()"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#FF6B6B,#DC2E2E);">${ICONS.pause}</div><div class="kpi-mini-val">${totalAbsents}</div><div class="kpi-mini-lbl">Absents</div></div>
      <div class="kpi-mini" style="cursor:pointer;" onclick="document.getElementById('rh-sorties-zone').scrollIntoView({behavior:'smooth'})"><div class="kpi-mini-icon" style="background:linear-gradient(145deg,#B08CFF,#6C3FD4);">${ICONS.clock}</div><div class="kpi-mini-val">${enSortie.length}</div><div class="kpi-mini-lbl">En sortie</div></div>
    </div>

    <div class="card" style="border:1.5px solid ${nbAnomalies>0?'var(--bad)':'var(--border)'};">
      <h3 style="margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:6px;">⚠️ À traiter ${nbAnomalies>0?`<span class="badge red" style="font-size:9.5px;">${nbAnomalies}</span>`:''}</h3>
      ${nbAnomalies===0 ? `<p style="font-size:12px;color:var(--good);font-weight:700;margin:0;">✓ Aucune anomalie à traiter</p>` : `
        ${anomOubli.map(x=>`<div class="session-row" style="cursor:pointer;padding:6px 0;" onclick="rhFicheEmpId='${x.id}'; nav('rh-pointage')"><b style="font-size:12.5px;">${esc(x.e.nom)}</b><span class="hour-rend bad" style="font-size:10.5px;">Oubli de pointage</span></div>`).join('')}
        ${anomSortiePasse.map(x=>`<div class="session-row" style="cursor:pointer;padding:6px 0;" onclick="rhFicheEmpId='${x.id}'; nav('rh-pointage')"><b style="font-size:12.5px;">${esc(x.e.nom)}</b><span class="hour-rend bad" style="font-size:10.5px;">Oubli de sortie (non clôturée)</span></div>`).join('')}
        ${anomDepassement.map(x=>`<div class="session-row" style="cursor:pointer;padding:6px 0;" onclick="rhFicheEmpId='${x.id}'; nav('rh-pointage')"><b style="font-size:12.5px;">${esc(x.e.nom)}</b><span class="hour-rend warn" style="font-size:10.5px;">Autorisation dépassée (prévu ${x.a.prevue})</span></div>`).join('')}
        ${anomIncoherent.map(x=>`<div class="session-row" style="cursor:pointer;padding:6px 0;" onclick="rhFicheEmpId='${x.id}'; nav('rh-pointage')"><b style="font-size:12.5px;">${esc(x.e.nom)}</b><span class="hour-rend bad" style="font-size:10.5px;">Pointage incohérent</span></div>`).join('')}
      `}
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px;font-size:13px;">📅 Absences</h3>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(4,1fr);">
        <div class="kpi-mini tint-red" style="cursor:pointer;padding:8px 2px;" onclick="rhShowMaladies()"><div class="kpi-mini-val" style="font-size:15px;">${maladies.length}</div><div class="kpi-mini-lbl">Maladie</div></div>
        <div class="kpi-mini tint-gold" style="cursor:pointer;padding:8px 2px;" onclick="rhShowConges()"><div class="kpi-mini-val" style="font-size:15px;">${conges.length}</div><div class="kpi-mini-lbl">Congés</div></div>
        <div class="kpi-mini" style="cursor:pointer;padding:8px 2px;" onclick="rhShowAutorisees()"><div class="kpi-mini-val" style="font-size:15px;">${autorisees.length}</div><div class="kpi-mini-lbl">Autorisée</div></div>
        <div class="kpi-mini tint-red" style="cursor:pointer;padding:8px 2px;" onclick="rhShowAbsents()"><div class="kpi-mini-val" style="font-size:15px;">${nonJustifiees.length}</div><div class="kpi-mini-lbl">Non justif.</div></div>
      </div>
      ${currentUser.role==='admin' ? `<button class="btn btn-primary" style="width:100%;margin-top:8px;padding:9px;font-size:12.5px;" onclick="showAbsenceForm()">+ Nouvelle absence</button>` : ''}
    </div>

    <div class="card" id="rh-sorties-zone">
      <h3 style="margin:0 0 8px;font-size:13px;">🚪 Sorties en cours</h3>
      ${sortiesEnCours.length===0 ? `<p style="font-size:11.5px;color:var(--ink-faint);margin:0;">Personne en sortie actuellement</p>` : sortiesEnCours.map(s => `
        <div class="session-row" style="cursor:pointer;padding:7px 0;" onclick="rhFicheEmpId='${s.x.id}'; nav('rh-pointage')">
          <div><b style="font-size:12.5px;">${esc(s.x.e.nom)}</b><div style="font-size:10.5px;color:var(--ink-soft);">Sorti(e) ${s.au.sortie}${s.au.prevue?' · Retour prévu '+s.au.prevue:''}</div></div>
          <span class="hour-rend ${s.depasse?'bad':'warn'}" style="font-size:10.5px;">${s.depasse?'⚠️ Retour dépassé':'En sortie'}</span>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="flex-header" style="margin-bottom:8px;"><h3 style="margin:0;font-size:13px;">👥 Situation du personnel</h3></div>
      <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:8px;">
        ${[['tous','Tous'],['presents','Présents'],['retards','Retards'],['absents','Absents'],['maladie','Maladie'],['conges','Congés'],['sorties','Sorties']].map(([k,l]) =>
          `<button class="btn ${rhDashFilter===k?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11px;white-space:nowrap;flex-shrink:0;" onclick="rhDashFilter='${k}'; nav('rh-dashboard')">${l}</button>`
        ).join('')}
      </div>
      ${dashFiltered.length===0 ? buildEmptyState("Personne pour ce filtre") : dashFiltered.map(x => rhSituationRow(x)).join('')}
    </div>

    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;"><h3 style="margin:0;font-size:13px;">⏱️ Temps de travail — <span style="text-transform:capitalize;">${monthLabel(monthKey)}</span></h3>
        <input type="month" value="${monthKey}" style="max-width:140px;" onchange="rhMonthKey=this.value; nav('rh-dashboard')">
      </div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="label">Heures prévues (base)</div>
          <div class="value">${base!=null ? base+' h' : '—'}</div>
          ${currentUser.role==='admin' ? `<button class="btn btn-ghost" style="margin-top:6px;padding:5px 10px;font-size:11px;" onclick="showSetBaseForm('${monthKey}')">${base!=null?'Modifier':'Définir'} la base</button>` : ''}
        </div>
        <div class="kpi"><div class="label">Heures travaillées</div><div class="value">${totalHeuresMois.toFixed(1)} h</div></div>
      </div>
      <div id="rh-base-form"></div>
      <button class="btn btn-ghost" style="width:100%;margin-top:10px;" onclick="nav('rh-synthese')">Voir les statistiques complètes →</button>
      ${currentUser.role==='admin' ? `<button class="btn btn-primary" style="width:100%;margin-top:6px;" onclick="exportRHReport('${monthKey}')">${ICONS.idBadge} Télécharger le rapport (Excel)</button>` : ''}
    </div>

    <div class="card">
      <h3 style="margin:0 0 6px;font-size:13px;">📊 Statistiques</h3>
      <p style="font-size:11.5px;color:var(--ink-soft);margin:0;line-height:1.7;">
        Taux de présence : <b>${tauxPresence}%</b><br>
        Absences (justif. / non justif.) : <b>${justifiees.length}</b> / <b>${nonJustifiees.length}</b><br>
        Retards du jour : <b>${retards.length}</b><br>
        Heures travaillées (mois, total) : <b>${totalHeuresMois.toFixed(1)} h</b>
      </p>
    </div>
    <div id="rh-modal-zone"></div>
  `;

  window.showSetBaseForm = (mk) => {
    const zone = document.getElementById('rh-base-form');
    const cur = getMonthlyBase(mk);
    zone.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
        <div class="field" style="margin-bottom:6px;"><label>Base officielle de ${monthLabel(mk)} (heures)</label><input type="number" id="rh-base-input" value="${cur!=null?cur:''}" placeholder="Ex : 208" min="0" step="0.5"></div>
        <button type="button" class="btn btn-ghost" style="padding:5px 10px;font-size:10.5px;margin-bottom:8px;" onclick="document.getElementById('rh-base-input').value=${RH_BASE_SUGGESTION}">Suggestion régime ${RH_BASE_REFERENCE_HEBDO}h/semaine : ${RH_BASE_SUGGESTION} h</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveMonthlyBaseForm('${mk}')">Enregistrer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('rh-base-form').innerHTML=''">Annuler</button>
        </div>
        <p style="font-size:10px;color:var(--ink-faint);margin-top:8px;">La base reste indépendante des horaires réels planifiés (46h30/semaine) : elle se réfère toujours au régime officiel de ${RH_BASE_REFERENCE_HEBDO}h/semaine, à confirmer ou ajuster vous-même.</p>
      </div>
    `;
  };
  window.saveMonthlyBaseForm = (mk) => {
    const val = parseFloat(document.getElementById('rh-base-input').value);
    if(isNaN(val) || val<0){ showToast("Merci de saisir un nombre d'heures valide"); return; }
    setMonthlyBase(mk, val);
    showToast('Base mensuelle enregistrée');
    nav('rh-dashboard');
  };

  window.rhShowEffectif = () => rhModal(`Effectif (${effectif})`, resolved.map(x=>`
    <div class="session-row"><div><div style="font-weight:700;">${esc(x.e.nom)}</div><div style="font-size:11px;color:var(--ink-soft);">${esc(x.e.poste||'—')}</div></div>${rhBadgeFor(x.r)}</div>
  `).join('') || buildEmptyState('Aucun employé'));

  window.rhShowPresents = () => rhModal(`Présents (${presents.length})`, presents.length===0 ? buildEmptyState('Personne') : presents.map(x => {
    const retard = computeRetardHours(x.r);
    return `<div class="session-row" style="flex-direction:column;align-items:stretch;gap:2px;">
      <div style="display:flex;justify-content:space-between;"><b>${esc(x.e.nom)}</b>${retard>0?`<span class="hour-rend warn" style="font-size:10.5px;">Retard ${fmtH(retard)}</span>`:''}</div>
      <div style="font-size:11.5px;color:var(--ink-soft);">Arrivée ${x.r.in||'—'}</div>
    </div>`;
  }).join(''));

  window.rhShowRetards = () => rhModal(`Retards (${retards.length})`, retards.length===0 ? buildEmptyState('Aucun retard') : retards.map(x => {
    const retard = computeRetardHours(x.r);
    const refLabel = minToHHMM(getRefStartMin(x.r.dateISO||date));
    return `<div class="session-row"><div><b>${esc(x.e.nom)}</b><div style="font-size:11px;color:var(--ink-soft);">Prévue ${refLabel} · Réelle ${x.r.in}</div></div><span class="hour-rend warn" style="font-size:12px;">${fmtH(retard)}</span></div>`;
  }).join(''));

  window.rhShowAbsents = () => rhModal(`Absents (${totalAbsents})`, `
    <h3 style="font-size:12.5px;color:var(--good);margin:4px 0;">Justifiées (${justifiees.length})</h3>
    ${justifiees.length===0?'<p style="font-size:11.5px;color:var(--ink-faint);">Aucune</p>':justifiees.map(x=>`<div class="session-row"><div><b>${esc(x.e.nom)}</b></div><span class="hour-rend ${ABSENCE_TYPES[x.r.type].cls}" style="font-size:11px;">${ABSENCE_TYPES[x.r.type].label} · jusqu'au ${x.r.dateEnd.split('-').reverse().join('/')}</span></div>`).join('')}
    <h3 style="font-size:12.5px;color:var(--bad);margin:12px 0 4px;">Non justifiées (${nonJustifiees.length})</h3>
    ${nonJustifiees.length===0?'<p style="font-size:11.5px;color:var(--ink-faint);">Aucune</p>':nonJustifiees.map(x=>`<div class="session-row"><div><b>${esc(x.e.nom)}</b></div><span class="hour-rend bad" style="font-size:11px;">${x.r.source==='periode'?ABSENCE_TYPES[x.r.type].label:'Absent (non pointé justifié)'}</span></div>`).join('')}
  `);

  window.rhShowMaladies = () => rhModal(`Maladie (${maladies.length})`, maladies.length===0?buildEmptyState('Personne en maladie'):maladies.map(x => `
    <div class="session-row"><div><b>${esc(x.e.nom)}</b>${x.r.motif?`<div style="font-size:11px;color:var(--ink-soft);">${esc(x.r.motif)}</div>`:''}</div><span class="hour-rend bad" style="font-size:11px;">Jusqu'au ${x.r.dateEnd.split('-').reverse().join('/')}</span></div>
  `).join(''));
  window.rhShowConges = () => rhModal(`Congés (${conges.length})`, conges.length===0?buildEmptyState('Personne en congé'):conges.map(x => `
    <div class="session-row"><div><b>${esc(x.e.nom)}</b></div><span class="hour-rend excellent" style="font-size:11px;">Jusqu'au ${x.r.dateEnd.split('-').reverse().join('/')}</span></div>
  `).join(''));
  window.rhShowAutorisees = () => rhModal(`Absences autorisées (${autorisees.length})`, autorisees.length===0?buildEmptyState('Aucune'):autorisees.map(x => `
    <div class="session-row"><div><b>${esc(x.e.nom)}</b>${x.r.motif?`<div style="font-size:11px;color:var(--ink-soft);">${esc(x.r.motif)}</div>`:''}</div><span class="hour-rend warn" style="font-size:11px;">Jusqu'au ${x.r.dateEnd.split('-').reverse().join('/')}</span></div>
  `).join(''));

  window.rhShowSorties = () => rhModal(`En sortie (${enSortie.length})`, enSortie.length===0?buildEmptyState('Personne en sortie'):enSortie.map(x => {
    const au = (x.r.autorisations||[]).find(a=>a.sortie && !a.retour);
    return `<div class="session-row"><div><b>${esc(x.e.nom)}</b><div style="font-size:11px;color:var(--ink-soft);">Sorti(e) à ${au.sortie}${au.prevue?' · Retour prévu '+au.prevue:''}</div></div><button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;" onclick="rhCloseModal(); rhFicheEmpId='${x.id}'; nav('rh-pointage')">Ajuster</button></div>`;
  }).join(''));
}

function rhBadgeFor(r){
  if(r.source==='periode') return `<span class="hour-rend ${ABSENCE_TYPES[r.type].cls}" style="font-size:11px;">${ABSENCE_TYPES[r.type].label}</span>`;
  if(r.source==='pointage') return `<span class="hour-rend ${ATT_STATUS[r.status]?ATT_STATUS[r.status].cls:''}" style="font-size:11px;">${ATT_STATUS[r.status]?ATT_STATUS[r.status].label:r.status}</span>`;
  return `<span class="hour-rend" style="font-size:11px;color:var(--ink-faint);">Non renseigné</span>`;
}
function rhSituationRow(x){
  const r = x.r;
  let info = '—';
  if(r.source==='periode') info = `Jusqu'au ${r.dateEnd.split('-').reverse().join('/')}`;
  else if(r.source==='pointage' && r.status==='present'){
    const retard = computeRetardHours(r);
    const enSortieNow = (r.autorisations||[]).some(a=>a.sortie && !a.retour);
    info = retard>0 ? `Retard ${fmtH(retard)}` : (enSortieNow ? 'En sortie' : (r.in?'Arrivée '+r.in:'—'));
  }
  return `
    <div class="session-row" style="cursor:pointer;" onclick="rhFicheEmpId='${x.id}'; nav('rh-fiche')">
      <div style="min-width:0;"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(x.e.nom)}</div></div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${rhBadgeFor(r)}
        <span style="font-size:10.5px;color:var(--ink-soft);white-space:nowrap;">${info}</span>
      </div>
    </div>
  `;
}

// ============================================================
// PERSONNEL
// ============================================================
function renderRHPersonnel(container, canEdit){
  if(!window.rhPersonnelFilter) window.rhPersonnelFilter = {q:'', statut:'actif'};
  const f = window.rhPersonnelFilter;

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="rh-p-search" placeholder="Rechercher (nom, matricule, poste)…" value="${esc(f.q)}" style="flex:1;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:14px;" oninput="rhFilterPersonnelRows(this.value)">
        ${canEdit ? `<button class="btn btn-primary" style="padding:8px 12px;font-size:12px;flex-shrink:0;" onclick="showAddEmployeeForm()">+ Ajouter</button>` : ''}
      </div>
      ${canEdit ? `<button class="btn btn-ghost" style="width:100%;padding:7px;font-size:12px;margin-bottom:8px;" onclick="showImportForm()">${ICONS.idBadge} Importer une liste (matricule + nom)</button>` : ''}
      <div id="rh-import-zone"></div>
      <div style="display:flex;gap:6px;">
        ${[['actif','Actifs'],['inactif','Inactifs'],['tous','Tous']].map(([k,l]) => `<button class="btn ${f.statut===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:6px 4px;font-size:11.5px;" onclick="rhPersonnelFilter.statut='${k}'; renderRHPersonnel(document.getElementById('rh-body'), ${canEdit})">${l}</button>`).join('')}
      </div>
    </div>
    <div id="emp-form-zone"></div>
    <div id="rh-p-results"></div>
  `;
  // Construit TOUTE la liste une seule fois (chaque ligne porte les infos de
  // recherche en attribut). La frappe dans le champ ne reconstruit plus rien :
  // elle masque/affiche seulement les lignes déjà présentes dans le DOM, ce qui
  // évite tout clignotement et empêche le clavier de se fermer sur mobile.
  window.rhRenderPersonnelRows = (canEdit) => {
    const resZone = document.getElementById('rh-p-results');
    if(!resZone) return;
    const f = window.rhPersonnelFilter;
    const emps = getEmployees();
    let rows = Object.entries(emps);
    if(f.statut !== 'tous') rows = rows.filter(([id,e]) => (e.statut||'actif') === f.statut);
    rows.sort((a,b)=> (a[1].nom||'').localeCompare(b[1].nom||''));
    resZone.innerHTML = `
    <div class="card">
      <div style="font-size:11px;color:var(--ink-faint);font-weight:700;margin-bottom:6px;"><span id="rh-p-count">${rows.length}</span> <span id="rh-p-count-label">personne${rows.length>1?'s':''} affichée${rows.length>1?'s':''}</span></div>
      <div id="rh-p-empty" style="display:none;">${buildEmptyState("Aucun employé trouvé", canEdit ? "Ajoutez un membre du personnel ou modifiez la recherche." : "")}</div>
      ${rows.length===0 ? buildEmptyState("Aucun employé trouvé", canEdit ? "Ajoutez un membre du personnel ou modifiez la recherche." : "") : rows.map(([id,e]) => `
        <div class="session-row rh-row" data-search="${esc(((e.nom||'')+' '+(e.matricule||'')+' '+(e.poste||'')).toLowerCase())}" style="cursor:pointer;" onclick="rhFicheEmpId='${id}'; nav('rh-fiche')">
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
    if(f.q.trim()) rhFilterPersonnelRows(f.q);
  };
  window.rhFilterPersonnelRows = (q) => {
    window.rhPersonnelFilter.q = q;
    const qq = q.trim().toLowerCase();
    const rowsEls = document.querySelectorAll('#rh-p-results .rh-row');
    let shown = 0;
    rowsEls.forEach(el => {
      const match = !qq || (el.dataset.search||'').includes(qq);
      el.style.display = match ? '' : 'none';
      if(match) shown++;
    });
    const countEl = document.getElementById('rh-p-count');
    if(countEl) countEl.textContent = shown;
    const labelEl = document.getElementById('rh-p-count-label');
    if(labelEl) labelEl.textContent = 'personne'+(shown>1?'s':'')+' affichée'+(shown>1?'s':'');
  };
  rhRenderPersonnelRows(canEdit);


  window.showAddEmployeeForm = () => renderEmployeeForm('add', null);
  window.showImportForm = () => {
    const zone = document.getElementById('rh-import-zone');
    const prefill = [
      '2 dalel','3 khairedine hayet','4 sahraoui aida','5 younes hela','6 chaabane marwa',
      '9 manai chedia','14 hallouli hamida','101 LAAJIMI DORSAF','42620 GHRAIRI NEDIA',
      '65354 SALWA GHRAIRI','65364 MASOUDI FATHIA','65380 BESSMA AISAOUI','65390 SOUMAYA KOKI',
      '65400 bessma ajbouni','65408 Hadj Mansour Naima','65409 Fatima ben nejma','65410 Sahtout Mariem',
      '65415 ALI SAIDA','65416 Methneni Rahma','65418 Selmi Mounira','65421 KHATTAT NAIMA',
      '65423 JEMLI MABROUKA','65429 AISSAOUI NOUHA','65431 Aissaoui RANIA','65435 Sghaier Tasnime',
      '65437 daouthi WAHIDA','65441 Balgouthi Ameni','65442 MANSOURI INES','65443 Ajbouni Sabrine',
      '65444 Balgouthi zouhour','65445 FOUZIA HADJ MANSOUR','65447 Amene Jendoubi'
    ].join('\n');
    zone.innerHTML = `
      <div class="card" style="background:var(--surface-2);margin-bottom:8px;">
        <h3 style="margin-top:0;">Importer une liste</h3>
        <p style="font-size:11.5px;color:var(--ink-soft);">Une ligne par personne : matricule, un espace, puis nom. Les matricules déjà présents seront ignorés (pas de doublon).</p>
        <textarea id="rh-import-text" rows="10" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);font-family:var(--mono);font-size:12px;">PREFILL_PLACEHOLDER</textarea>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-primary" onclick="runImport()">Importer</button>
          <button class="btn btn-ghost" onclick="document.getElementById('rh-import-zone').innerHTML=''">Annuler</button>
        </div>
      </div>
    `.replace('PREFILL_PLACEHOLDER', esc(prefill));
  };
  window.runImport = () => {
    const text = document.getElementById('rh-import-text').value;
    const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
    const list = getEmployees();
    const existingMatricules = new Set(Object.values(list).map(e=>e.matricule).filter(Boolean));
    let added = 0, skipped = 0, invalid = 0;
    lines.forEach((line, i) => {
      const m = line.match(/^(\S+)\s+(.+)$/);
      if(!m){ invalid++; return; }
      const matricule = m[1];
      const nom = m[2].trim().toLowerCase().split(/\s+/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      if(existingMatricules.has(matricule)){ skipped++; return; }
      const id = 'e'+Date.now()+Math.floor(Math.random()*100000)+'_'+i;
      list[id] = {matricule, nom, poste:'', dateEmbauche:'', statut:'actif'};
      existingMatricules.add(matricule);
      added++;
    });
    saveEmployees(list);
    let msg = added+' employé(s) ajouté(s)';
    if(skipped) msg += ', '+skipped+" déjà existant(s) ignoré(s)";
    if(invalid) msg += ', '+invalid+' ligne(s) invalide(s)';
    showToast(msg);
    nav('rh-personnel');
  };

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
  if(!window.rhPointageFilter) window.rhPointageFilter = {q:'', chip:'tous'};
  const f = window.rhPointageFilter;
  const date = rhAttDate;
  const emps = activeEmployees();
  const resolved = emps.map(([id,e]) => ({id, e, r: resolveDayStatus(id, date)}));

  const present = resolved.filter(x=>x.r.source==='pointage'&&x.r.status==='present');
  const absent = resolved.filter(x=>x.r.source==='pointage'&&x.r.status==='absent');
  const periode = resolved.filter(x=>x.r.source==='periode');
  const nonRenseigne = resolved.filter(x=>x.r.source===null);
  const retard = present.filter(x=>computeRetardHours(x.r)>0);
  const autorisation = present.filter(x=>(x.r.autorisations||[]).length>0);
  const conges = periode.filter(x=>x.r.type==='conge');
  const maladies = periode.filter(x=>x.r.type==='maladie');

  let visible = resolved;
  if(f.chip==='presents') visible = present;
  else if(f.chip==='non_renseignes') visible = nonRenseigne;
  else if(f.chip==='absents') visible = absent;
  else if(f.chip==='retards') visible = retard;
  else if(f.chip==='autorisations') visible = autorisation;
  else if(f.chip==='conges') visible = conges;
  else if(f.chip==='maladies') visible = maladies;
  if(f.q.trim()){
    const q = f.q.trim().toLowerCase();
    visible = visible.filter(x => (x.e.nom||'').toLowerCase().includes(q) || (x.e.poste||'').toLowerCase().includes(q));
  }

  const nbRenseignes = emps.length - nonRenseigne.length;
  const journeeCommencee = date !== getTodayISO() || (new Date().getHours()*60+new Date().getMinutes()) >= getRefStartMin(date);
  const complete = nonRenseigne.length === 0 || !journeeCommencee;
  const dateNav = (delta) => { const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()+delta); return toISODateLocal ? toISODateLocal(d) : d.toISOString().slice(0,10); };

  const chips = [
    ['tous','Tous', resolved.length], ['presents','Présents', present.length], ['non_renseignes','Non renseignés', nonRenseigne.length],
    ['absents','Absents', absent.length], ['retards','Retards', retard.length], ['autorisations','Autorisations', autorisation.length],
    ['conges','Congés', conges.length], ['maladies','Maladies', maladies.length]
  ];

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="rhAttDate='${dateNav(-1)}'; nav('rh-pointage')">‹</button>
        <div class="field" style="margin:0;flex:1;"><input type="date" value="${date}" max="${getTodayISO()}" onchange="rhAttDate=this.value; nav('rh-pointage')"></div>
        <button class="btn btn-ghost" style="padding:9px 11px;" onclick="rhAttDate='${dateNav(1)}'; nav('rh-pointage')" ${date>=getTodayISO()?'disabled':''}>›</button>
      </div>
      ${canEdit ? `
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;padding:9px 6px;font-size:12px;" onclick="markAllPresent()">Tout marquer Présent</button>
        <button class="btn btn-ghost" style="flex:1;padding:9px 6px;font-size:12px;" onclick="resetDay()">Réinitialiser</button>
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;font-weight:700;color:${complete?'var(--good)':'var(--warn)'};">
        ${!journeeCommencee ? 'La journée n\'a pas encore commencé (début '+minToHHMM(getRefStartMin(date))+')' : (complete ? '✓ Journée complète' : '⚠ '+nonRenseigne.length+' salarié(s) non renseigné(s)')}
        <span style="color:var(--ink-faint);font-weight:600;">· ${nbRenseignes}/${emps.length} renseignés</span>
      </div>
    </div>

    <div class="card" style="padding:10px 12px;">
      <input id="rh-poi-search" placeholder="Rechercher un salarié…" value="${esc(f.q)}" style="width:100%;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface-2);font-size:14px;margin-bottom:8px;" oninput="rhFilterPointageRows(this.value)">
      <div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;">
        ${chips.map(([k,l,n]) => `<button class="btn ${f.chip===k?'btn-primary':'btn-ghost'}" style="padding:6px 10px;font-size:11px;white-space:nowrap;flex-shrink:0;" onclick="rhPointageFilter.chip='${k}'; nav('rh-pointage')">${l} (${n})</button>`).join('')}
      </div>
    </div>

    <div id="rh-poi-results"></div>
    <div id="rh-modal-zone"></div>
  `;
  window.rhRenderPointageRows = (canEdit) => {
    const resZone = document.getElementById('rh-poi-results');
    if(!resZone) return;
    const f = window.rhPointageFilter;
    let v = resolved;
    if(f.chip==='presents') v = present;
    else if(f.chip==='non_renseignes') v = nonRenseigne;
    else if(f.chip==='absents') v = absent;
    else if(f.chip==='retards') v = retard;
    else if(f.chip==='autorisations') v = autorisation;
    else if(f.chip==='conges') v = conges;
    else if(f.chip==='maladies') v = maladies;
    resZone.innerHTML = `
    <div class="card" style="padding:4px 12px;">
      ${v.length===0 ? buildEmptyState("Aucun salarié pour ce filtre") : v.map(x => `<div class="rh-poi-row" data-search="${esc(((x.e.nom||'')+' '+(x.e.poste||'')).toLowerCase())}">${rhPointageCard(x, canEdit)}</div>`).join('')}
    </div>
    `;
    if(f.q.trim()) rhFilterPointageRows(f.q);
  };
  window.rhFilterPointageRows = (q) => {
    window.rhPointageFilter.q = q;
    const qq = q.trim().toLowerCase();
    document.querySelectorAll('#rh-poi-results .rh-poi-row').forEach(el => {
      el.style.display = (!qq || (el.dataset.search||'').includes(qq)) ? '' : 'none';
    });
  };
  rhRenderPointageRows(canEdit);

  window.markAllPresent = () => {
    const cible = emps.filter(([id]) => { const r = resolveDayStatus(id, date); return r.source!=='periode'; });
    if(!confirm(`Marquer ${cible.length} salarié(s) comme Présent pour le ${date.split('-').reverse().join('/')} ?\n\n(Les salariés en congé/maladie/absence enregistrée ne sont pas modifiés.)`)) return;
    const a = getAttendance(date);
    cible.forEach(([id]) => { a[id] = {status:'present'}; });
    saveAttendance(date, a);
    showToast('Marqués Présent — ajustez les exceptions ci-dessous');
    nav('rh-pointage');
  };
  window.resetDay = () => {
    if(!confirm(`Réinitialiser complètement le pointage du ${date.split('-').reverse().join('/')} ?\n\nLes absences par période ne sont pas affectées.`)) return;
    saveAttendance(date, {});
    showToast('Journée réinitialisée');
    nav('rh-pointage');
  };
  window.setAttendanceStatus = (empId, status) => {
    const a = getAttendance(date);
    if(!status) delete a[empId]; else a[empId] = {status};
    saveAttendance(date, a);
    nav('rh-pointage');
  };
  window.setAttendanceField = (empId, field, value) => {
    const a = getAttendance(date);
    a[empId] = {...(a[empId]||{}), [field]:value};
    saveAttendance(date, a);
    nav('rh-pointage');
  };
  window.addAutorisation = (empId) => {
    const a = getAttendance(date);
    const cur = a[empId] || {status:'present'};
    cur.autorisations = [...(cur.autorisations||[]), {sortie:'', retour:'', prevue:''}];
    a[empId] = cur;
    saveAttendance(date, a);
    nav('rh-pointage');
  };
  window.removeAutorisation = (empId, idx) => {
    const a = getAttendance(date);
    const cur = a[empId] || {};
    cur.autorisations = (cur.autorisations||[]).filter((_,i)=>i!==idx);
    a[empId] = cur;
    saveAttendance(date, a);
    nav('rh-pointage');
  };
  window.setAutorisationField = (empId, idx, field, value) => {
    const a = getAttendance(date);
    const cur = a[empId] || {};
    cur.autorisations = (cur.autorisations||[]).map((au,i) => i===idx ? {...au, [field]:value} : au);
    a[empId] = cur;
    saveAttendance(date, a);
    nav('rh-pointage');
  };
}

function rhPointageCard(x, canEdit){
  const {id, e, r} = x;
  if(r.source==='periode'){
    const t = ABSENCE_TYPES[r.type];
    return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:4px;padding:9px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:700;font-size:13.5px;">${esc(e.nom)}</div>
        <span class="hour-rend ${t.cls}" style="font-size:11px;">${t.label}</span>
      </div>
      <div style="font-size:10.5px;color:var(--ink-soft);">Du ${r.dateStart.split('-').reverse().join('/')} au ${r.dateEnd.split('-').reverse().join('/')}${r.motif?' · '+esc(r.motif):''}</div>
      ${canEdit ? `<button class="btn btn-ghost" style="align-self:flex-start;padding:4px 9px;font-size:10.5px;" onclick="showEditAbsenceForm('${r.periodId}')">Modifier / supprimer l'absence</button>` : ''}
    </div>`;
  }
  const st = r.source==='pointage' ? r.status : '';
  const retard = st==='present' ? computeRetardHours(r) : 0;
  const auths = r.autorisations || [];
  return `
    <div class="session-row" style="flex-direction:column;align-items:stretch;gap:6px;padding:9px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div style="font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.nom)}</div>
        ${canEdit
          ? `<div style="flex-shrink:0;">${rhStatusSelect('att-status-'+id, st, `setAttendanceStatus('${id}', this.value)`)}</div>`
          : `<div class="hour-rend ${st?ATT_STATUS[st].cls:''}" style="font-size:11px;flex-shrink:0;">${st?ATT_STATUS[st].label:'—'}</div>`}
      </div>
      ${st==='present' ? (canEdit ? `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div class="field" style="margin:0;"><label style="font-size:10px;">Heure d'arrivée</label><input type="time" value="${r.in||''}" onchange="setAttendanceField('${id}','in',this.value)"></div>
        ${retard>0 ? `<div style="font-size:11px;color:var(--warn);font-weight:700;">Retard ${fmtH(retard)}</div>` : ''}
      </div>
      <div>
        ${auths.map((au,i) => `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;background:var(--surface-2);padding:6px 8px;border-radius:8px;flex-wrap:wrap;">
            <div class="field" style="margin:0;"><label style="font-size:9px;">Sortie</label><input type="time" value="${au.sortie||''}" onchange="setAutorisationField('${id}',${i},'sortie',this.value)"></div>
            <div class="field" style="margin:0;"><label style="font-size:9px;">Retour</label><input type="time" value="${au.retour||''}" onchange="setAutorisationField('${id}',${i},'retour',this.value)"></div>
            <div class="field" style="margin:0;"><label style="font-size:9px;">Retour prévu</label><input type="time" value="${au.prevue||''}" onchange="setAutorisationField('${id}',${i},'prevue',this.value)"></div>
            ${autorisationDureeH(au)>0 ? `<span style="font-size:10px;color:var(--warn);font-weight:700;">−${fmtH(autorisationDureeH(au))}</span>` : ''}
            ${autorisationDepassee(au) ? `<span class="hour-rend bad" style="font-size:9.5px;">Dépassée</span>` : ''}
            <button class="icon-btn" onclick="removeAutorisation('${id}',${i})" title="Retirer">✕</button>
          </div>
        `).join('')}
        <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;" onclick="addAutorisation('${id}')">+ Autorisation (sortie/retour)</button>
      </div>
      ` : `
      ${r.in ? `<div style="font-size:11px;color:var(--ink-soft);">Arrivée ${r.in}${retard>0?' · Retard '+fmtH(retard):''}</div>` : ''}
      ${auths.filter(au=>au.sortie&&au.retour).map(au => `<div style="font-size:11px;color:var(--ink-soft);">Autorisation ${au.sortie}→${au.retour} (${fmtH(autorisationDureeH(au))})</div>`).join('')}
      `) : ''}
    </div>
  `;
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
      ${canEdit ? `<button class="btn btn-ghost" style="margin-top:8px;padding:6px 10px;font-size:11.5px;" onclick="showAbsenceForm('${empId}')">+ Déclarer une absence</button>` : ''}
      <div id="fiche-edit-zone"></div>
      <div id="rh-modal-zone"></div>
    </div>

    <div class="card">
      <div class="flex-header" style="margin-bottom:10px;">
        <h3 style="margin:0;text-transform:capitalize;">${monthLabel(monthKey)}</h3>
        <input type="month" value="${monthKey}" style="max-width:140px;" onchange="rhMonthKey=this.value; nav('rh-fiche')">
      </div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px;">
        <div class="kpi-mini tint-green"><div class="kpi-mini-val">${c.present||0}</div><div class="kpi-mini-lbl">Présences</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${stats.absencesJustifiees}</div><div class="kpi-mini-lbl">Abs. justifiées</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${stats.absencesNonJustifiees}</div><div class="kpi-mini-lbl">Abs. non justif.</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${stats.joursRetard}</div><div class="kpi-mini-lbl">Jours en retard</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${stats.nbAutorisations}</div><div class="kpi-mini-lbl">Autorisations</div></div>
        <div class="kpi-mini tint-gold"><div class="kpi-mini-val">${c.conge||0}</div><div class="kpi-mini-lbl">Congés</div></div>
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
        ${stats.days.filter(d=>d.source).length===0 ? buildEmptyState("Aucune saisie ce mois-ci") : stats.days.filter(d=>d.source).reverse().map(d => `
          <div class="session-row" style="padding:7px 0;flex-direction:column;align-items:stretch;gap:3px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:12.5px;">${d.dateISO.split('-').reverse().join('/')}</div>
              ${d.source==='periode'
                ? `<span class="hour-rend ${ABSENCE_TYPES[d.type].cls}" style="font-size:11px;">${ABSENCE_TYPES[d.type].label}</span>`
                : `<span class="hour-rend ${ATT_STATUS[d.status]?ATT_STATUS[d.status].cls:''}" style="font-size:11px;">${ATT_STATUS[d.status]?ATT_STATUS[d.status].label:d.status}</span>`}
            </div>
            ${d.status==='present' && (d.in || d.retard>0 || d.autorisationTotal>0) ? `
            <div style="font-size:10.5px;color:var(--ink-soft);">
              ${d.in?'Arrivée '+d.in:''}${d.retard>0?' · Retard '+fmtH(d.retard):''}${d.autorisationTotal>0?' · Autorisation(s) −'+fmtH(d.autorisationTotal):''}
            </div>` : ''}
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

// ============================================================
// SYNTHÈSE MENSUELLE (tous les salariés actifs, vue d'ensemble)
// ============================================================
let rhStatsPeriod = 'mois'; // 'jour' | 'semaine' | 'mois' | 'perso'
let rhStatsDate = null;     // date de référence pour la vue "Jour"
let rhStatsStart = null;    // bornes pour la vue "Personnalisé"
let rhStatsEnd = null;
let rhStatsEmpId = null;    // null = "Tous les employés", sinon un id précis

function rhStatsRange(){
  const today = getTodayISO();
  if(rhStatsPeriod==='jour') return {start: rhStatsDate||today, end: rhStatsDate||today};
  if(rhStatsPeriod==='semaine'){
    const d = new Date(today+'T00:00:00'); d.setDate(d.getDate()-6);
    return {start: toISODateLocal(d), end: today};
  }
  if(rhStatsPeriod==='mois'){
    const mk = rhMonthKey || currentMonthKey();
    return {start: mk+'-01', end: mk+'-'+String(daysInMonth(mk)).padStart(2,'0')};
  }
  return {start: rhStatsStart||today, end: rhStatsEnd||today};
}
function rhStatsPeriodLabel(){
  const {start, end} = rhStatsRange();
  if(start===end) return start.split('-').reverse().join('/');
  return start.split('-').reverse().join('/')+' → '+end.split('-').reverse().join('/');
}

function renderRHSynthese(container){
  if(!window.rhStatsPeriod) window.rhStatsPeriod = 'mois';
  const {start, end} = rhStatsRange();
  const emps = activeEmployees();

  container.innerHTML = `
    <div class="card" style="padding:10px 12px;">
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        ${[['jour','Jour'],['semaine','7 jours'],['mois','Ce mois'],['perso','Personnalisé']].map(([k,l]) =>
          `<button class="btn ${rhStatsPeriod===k?'btn-primary':'btn-ghost'}" style="flex:1;padding:7px 4px;font-size:11.5px;" onclick="rhStatsPeriod='${k}'; nav('rh-synthese')">${l}</button>`
        ).join('')}
      </div>
      ${rhStatsPeriod==='jour' ? `<input type="date" value="${rhStatsDate||getTodayISO()}" max="${getTodayISO()}" onchange="rhStatsDate=this.value; nav('rh-synthese')">` : ''}
      ${rhStatsPeriod==='mois' ? `<input type="month" value="${rhMonthKey||currentMonthKey()}" onchange="rhMonthKey=this.value; nav('rh-synthese')">` : ''}
      ${rhStatsPeriod==='perso' ? `<div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;margin:0;"><label style="font-size:10px;">Du</label><input type="date" value="${rhStatsStart||getTodayISO()}" max="${getTodayISO()}" onchange="rhStatsStart=this.value; nav('rh-synthese')"></div>
        <div class="field" style="flex:1;margin:0;"><label style="font-size:10px;">Au</label><input type="date" value="${rhStatsEnd||getTodayISO()}" max="${getTodayISO()}" onchange="rhStatsEnd=this.value; nav('rh-synthese')"></div>
      </div>` : ''}
      <div style="margin-top:8px;"><select onchange="rhStatsEmpId=this.value||null; nav('rh-synthese')">
        <option value="">Tous les employés</option>
        ${emps.map(([id,e]) => `<option value="${id}" ${rhStatsEmpId===id?'selected':''}>${esc(e.nom)}</option>`).join('')}
      </select></div>
      <p style="font-size:10.5px;color:var(--ink-faint);margin:8px 0 0;">Période : ${rhStatsPeriodLabel()}</p>
      ${(currentUser.role==='admin' && rhStatsPeriod==='mois') ? `<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="exportRHReport('${rhMonthKey||currentMonthKey()}')">${ICONS.idBadge} Télécharger le rapport (Excel, mois en cours)</button>` : ''}
    </div>

    ${!rhStatsEmpId ? rhStatsGlobalHTML(emps, start, end) : rhStatsEmployeeHTML(rhStatsEmpId, start, end)}
  `;
}

// --- Vue "Tous les employés" : totaux d'ensemble + tableau compact un par un ---
function rhStatsGlobalHTML(emps, start, end){
  if(emps.length===0) return `<div class="card">${buildEmptyState("Aucun employé actif")}</div>`;
  const rows = emps.map(([id,e]) => ({id, e, s: computeStatsForRange(id, start, end)}));
  const tot = rows.reduce((acc,r) => ({
    present: acc.present + (r.s.counts.present||0),
    justif: acc.justif + r.s.absencesJustifiees,
    nonJustif: acc.nonJustif + r.s.absencesNonJustifiees,
    retard: acc.retard + r.s.joursRetard,
    auth: acc.auth + r.s.nbAutorisations,
    heures: acc.heures + r.s.heuresTravaillees
  }), {present:0, justif:0, nonJustif:0, retard:0, auth:0, heures:0});
  return `
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini tint-green"><div class="kpi-mini-val">${tot.present}</div><div class="kpi-mini-lbl">Présences (total)</div></div>
      <div class="kpi-mini"><div class="kpi-mini-val">${tot.retard}</div><div class="kpi-mini-lbl">Jours en retard</div></div>
      <div class="kpi-mini tint-red"><div class="kpi-mini-val">${tot.justif+tot.nonJustif}</div><div class="kpi-mini-lbl">Absences (total)</div></div>
    </div>
    <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-mini"><div class="kpi-mini-val">${tot.auth}</div><div class="kpi-mini-lbl">Autorisations</div></div>
      <div class="kpi-mini tint-gold"><div class="kpi-mini-val">${tot.heures.toFixed(1)}h</div><div class="kpi-mini-lbl">Heures travaillées</div></div>
      <div class="kpi-mini"><div class="kpi-mini-val">${emps.length>0?Math.round(tot.present/(emps.length*Math.max(1,rows[0]?rows[0].s.days.length:1))*100):0}%</div><div class="kpi-mini-lbl">Taux présence moy.</div></div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">Détail par employé</h3>
      ${rows.sort((a,b)=>(a.e.nom||'').localeCompare(b.e.nom||'')).map(r => `
        <div class="session-row" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:4px;" onclick="rhFicheEmpId='${r.id}'; nav('rh-fiche')">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <b style="font-size:13px;">${esc(r.e.nom)}</b>
            <span style="font-family:var(--mono);font-weight:800;font-size:13px;">${r.s.heuresTravaillees.toFixed(1)}h</span>
          </div>
          <div style="font-size:10.5px;color:var(--ink-soft);">Présences ${r.s.counts.present||0} · Retards ${r.s.joursRetard} · Autorisations ${r.s.nbAutorisations} · Abs. justif. ${r.s.absencesJustifiees} · Abs. non justif. ${r.s.absencesNonJustifiees}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// --- Vue "un employé précis" : ses stats détaillées sur la période choisie ---
function rhStatsEmployeeHTML(empId, start, end){
  const emps = getEmployees();
  const e = emps[empId];
  if(!e) return `<div class="card">${buildEmptyState("Employé introuvable")}</div>`;
  const s = computeStatsForRange(empId, start, end);
  const c = s.counts;
  return `
    <div class="card">
      <div class="flex-header" style="margin-bottom:6px;"><h3 style="margin:0;">${esc(e.nom)}</h3><button class="btn btn-ghost" style="padding:5px 10px;font-size:11.5px;" onclick="rhFicheEmpId='${empId}'; nav('rh-fiche')">Fiche complète</button></div>
      <div class="kpi-mini-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px;">
        <div class="kpi-mini tint-green"><div class="kpi-mini-val">${c.present||0}</div><div class="kpi-mini-lbl">Présences</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${s.absencesJustifiees}</div><div class="kpi-mini-lbl">Abs. justifiées</div></div>
        <div class="kpi-mini tint-red"><div class="kpi-mini-val">${s.absencesNonJustifiees}</div><div class="kpi-mini-lbl">Abs. non justif.</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${s.joursRetard}</div><div class="kpi-mini-lbl">Jours en retard</div></div>
        <div class="kpi-mini"><div class="kpi-mini-val">${s.nbAutorisations}</div><div class="kpi-mini-lbl">Autorisations</div></div>
        <div class="kpi-mini tint-gold"><div class="kpi-mini-val">${c.conge||0}</div><div class="kpi-mini-lbl">Congés</div></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Heures travaillées</div><div class="value">${s.heuresTravaillees.toFixed(1)} h</div></div>
        <div class="kpi"><div class="label">Retards / autorisations déduits</div><div class="value">−${(s.retardH+s.autorisationH).toFixed(1)} h</div></div>
      </div>
    </div>
    <div class="card">
      <h3 style="margin-top:0;font-size:13px;">Historique de la période</h3>
      <div style="max-height:340px;overflow-y:auto;">
        ${s.days.filter(d=>d.source).length===0 ? buildEmptyState("Aucune saisie sur cette période") : s.days.filter(d=>d.source).reverse().map(d => `
          <div class="session-row" style="padding:7px 0;flex-direction:column;align-items:stretch;gap:3px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-size:12.5px;">${d.dateISO.split('-').reverse().join('/')}</div>
              ${d.source==='periode'
                ? `<span class="hour-rend ${ABSENCE_TYPES[d.type].cls}" style="font-size:11px;">${ABSENCE_TYPES[d.type].label}</span>`
                : `<span class="hour-rend ${ATT_STATUS[d.status]?ATT_STATUS[d.status].cls:''}" style="font-size:11px;">${ATT_STATUS[d.status]?ATT_STATUS[d.status].label:d.status}</span>`}
            </div>
            ${d.status==='present' && (d.in || d.retard>0 || d.autorisationTotal>0) ? `
            <div style="font-size:10.5px;color:var(--ink-soft);">
              ${d.in?'Arrivée '+d.in:''}${d.retard>0?' · Retard '+fmtH(d.retard):''}${d.autorisationTotal>0?' · Autorisation(s) −'+fmtH(d.autorisationTotal):''}
            </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// --- Rapport Excel mensuel (téléchargement) ---
window.exportRHReport = async (monthKey) => {
  if(typeof ExcelJS === 'undefined'){
    showToast("Bibliothèque Excel indisponible — vérifiez votre connexion internet et réessayez.");
    return;
  }
  showToast('Génération du rapport…');
  const emps = activeEmployees();
  const base = getMonthlyBase(monthKey);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TEK-TREND';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Rapport RH');
  const headerFill = {type:'pattern', pattern:'solid', fgColor:{argb:'FF0F3D66'}};
  const headerFont = {bold:true, color:{argb:'FFFFFFFF'}};

  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'TEK-TREND — Rapport RH — ' + monthLabel(monthKey).replace(/^\w/, c=>c.toUpperCase());
  sheet.getCell('A1').font = {bold:true, size:14, color:{argb:'FF0F3D66'}};
  sheet.getCell('A2').value = 'Base mensuelle officielle : ' + (base!=null ? base+' h' : 'non définie');
  sheet.getCell('A2').font = {italic:true, size:10, color:{argb:'FF667085'}};

  const headers = ['Matricule','Nom','Poste','Présences','Abs. justifiées','Abs. non justifiées','Retards (j)','Heures retard','Autorisations (n)','Heures autorisation','Heures travaillées','Écart vs base'];
  const headerRow = sheet.getRow(4);
  headers.forEach((h,i) => { const c = headerRow.getCell(i+1); c.value = h; c.fill = headerFill; c.font = headerFont; c.alignment = {horizontal:'center', vertical:'middle', wrapText:true}; });
  headerRow.height = 32;

  let r = 5;
  emps.forEach(([id,e]) => {
    const s = computeMonthlyStats(id, monthKey);
    const row = sheet.getRow(r);
    const vals = [e.matricule||'', e.nom, e.poste||'', s.counts.present||0, s.absencesJustifiees, s.absencesNonJustifiees, s.joursRetard, Number(s.retardH.toFixed(2)), s.nbAutorisations, Number(s.autorisationH.toFixed(2)), Number(s.heuresTravaillees.toFixed(2)), s.ecart!=null?Number(s.ecart.toFixed(2)):'—'];
    vals.forEach((v,i) => { row.getCell(i+1).value = v; });
    if(r%2===0) row.eachCell(c => { c.fill = {type:'pattern', pattern:'solid', fgColor:{argb:'FFF3F5F8'}}; });
    r++;
  });
  sheet.columns = [{width:12},{width:22},{width:20},{width:11},{width:14},{width:16},{width:11},{width:13},{width:13},{width:15},{width:15},{width:13}];

  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `TEK-TREND_RH_${monthKey}.xlsx`; a.click();
  URL.revokeObjectURL(url);
  showToast('Rapport téléchargé');
};
