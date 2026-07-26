/* ---------- CONSOLE LOG ---------- */
let logN = 0;
function log(text, isErr){
  logN++;
  document.getElementById('logCount').textContent = logN + " evenements";
  const el = document.getElementById('log');
  const p = document.createElement('p');
  if(isErr) p.className = 'err';
  const t = new Date().toLocaleTimeString('fr-FR');
  p.innerHTML = `<span class="tag2">[${t}]</span>${text}`;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

/* ---------- CLOCK ---------- */
function tickClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('fr-FR');
}
setInterval(tickClock, 1000); tickClock();

/* ---------- GLITCH BURST (Watch Dogs / DedSec style) ---------- */
function randomGlitchBurst(){
  const el = document.querySelector('.glitch-text');
  if(el){
    el.classList.add('burst');
    setTimeout(()=> el.classList.remove('burst'), 260);
  }
  setTimeout(randomGlitchBurst, 2600 + Math.random()*4200);
}
randomGlitchBurst();

/* ---------- NAV ---------- */
const heads = {
  profiler: ["Profileur — avis de recherche publics", "INTERPOL Notices API"],
  reseau: ["Reseau electrique — France en direct", "RTE eco2mix"],
  cameras: ["Cameras routieres en direct", "Digitraffic / Fintraffic (UE)"],
  signal: ["Signal — ouverture directe", "signal.me"],
  marches: ["Marches — taux de change reels", "Frankfurter / BCE"],
  carte: ["Carte mondiale — donnees en direct", "Leaflet / OSM + ISS + OpenSky + USGS + Open-Meteo"],
  solaire: ["Activite solaire", "NOAA SWPC — GOES rayons X"],
  satellite: ["Vue satellite — Terre en direct", "NOAA GOES-19/18 + NASA EPIC/DSCOVR"]
};
let satelliteOpened = false;
document.querySelectorAll('#navList li').forEach(li=>{
  li.addEventListener('click', ()=>{
    document.querySelectorAll('#navList li').forEach(x=>x.classList.remove('active'));
    li.classList.add('active');
    const target = li.dataset.target;
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.getElementById('sec-'+target).classList.add('active');
    const h = heads[target];
    document.getElementById('mainHead').innerHTML = h[0] + '<small>'+h[1]+'</small>';
    if(target === 'carte'){
      initMap();
      setTimeout(()=>{ if(map) map.invalidateSize(); }, 120);
    }
    if(target === 'satellite' && !satelliteOpened){
      satelliteOpened = true;
      loadGoesImages();
      loadEpic();
    }
  });
});

/* ---------- PROFILEUR (INTERPOL, appel direct navigateur) ---------- */
let profType = 'red';
document.querySelectorAll('.tag').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tag').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    profType = t.dataset.type;
  });
});

async function loadProfiler(){
  const box = document.getElementById('profResults');
  const name = document.getElementById('profNameFilter').value.trim();
  const country = (document.getElementById('profCountryFilter').value.trim() || 'FR').toUpperCase();
  box.innerHTML = '<p class="hint"><span class="loading">interrogation en cours...</span></p>';
  log(`Requete INTERPOL (${profType}, pays=${country}${name ? ', nom='+name : ''})...`);
  try{
    let url = `https://ws-public.interpol.int/notices/v1/${profType}?resultPerPage=8`;
    url += profType === 'red' ? `&arrestWarrantCountryId=${country}` : `&nationality=${country}`;
    if(name) url += '&name=' + encodeURIComponent(name);
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const notices = (data._embedded && data._embedded.notices) || [];
    log(`Reponse INTERPOL recue — ${notices.length} avis.`);
    if(notices.length === 0){
      box.innerHTML = '<p class="hint">Aucun avis correspondant actuellement publie par INTERPOL pour ce filtre.</p>';
      return;
    }
    box.innerHTML = '<div class="card-list">' + notices.map(n=>{
      const fullName = [n.forename, n.name].filter(Boolean).join(' ') || 'Identite non communiquee';
      const nat = (n.nationalities && n.nationalities.length) ? n.nationalities.join(', ') : '\u2014';
      const dob = n.date_of_birth || '\u2014';
      const link = (n._links && n._links.self) ? n._links.self.href : '#';
      const thumb = (n._links && n._links.thumbnail && n._links.thumbnail.href) ? n._links.thumbnail.href : null;
      const photo = thumb
        ? `<img src="${thumb}" alt="${fullName}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;photo-placeholder&quot;>\u{1F464}</div>'">`
        : `<div class="photo-placeholder">\u{1F464}</div>`;
      return `<div class="wanted-card">
        <div class="wanted-photo">${photo}</div>
        <div>
          <div class="name">${fullName}</div>
          <div class="meta">Nationalite(s) : ${nat} \u00b7 Ne(e) le ${dob}</div>
        </div>
        <a href="${link}" target="_blank" rel="noopener">Fiche INTERPOL</a>
      </div>`;
    }).join('') + '</div>';
  }catch(e){
    log('Echec de la requete INTERPOL : ' + e.message, true);
    box.innerHTML = `<div class="errbox">Impossible de joindre l'API INTERPOL depuis ce navigateur (${e.message}). Consultez directement <a href="https://www.interpol.int/en/How-we-work/Notices/View-Red-Notices" target="_blank" rel="noopener" style="color:var(--red)">les avis sur interpol.int</a>.</div>`;
  }
}
document.getElementById('profSearchBtn').addEventListener('click', loadProfiler);

/* ---------- RESEAU (RTE eco2mix) + graphique temps reel ---------- */
let reseauChartInstance;
async function loadReseau(){
  const box = document.getElementById('reseauResults');
  box.innerHTML = '<p class="hint"><span class="loading">chargement des donnees RTE...</span></p>';
  log('Requete API RTE / eco2mix...');
  try{
    const url = 'https://odre.opendatasoft.com/api/records/1.0/search/?dataset=eco2mix-national-tr&rows=1&sort=-date_heure';
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const f = data.records && data.records[0] && data.records[0].fields;
    if(!f) throw new Error('champ vide');
    log('Donnees RTE recues — horodatage ' + f.date_heure);
    const filieres = [
      ['Nucleaire', f.nucleaire], ['Eolien', f.eolien], ['Solaire', f.solaire],
      ['Hydraulique', f.hydraulique], ['Gaz', f.gaz], ['Charbon', f.charbon],
      ['Fioul', f.fioul], ['Bioenergies', f.bioenergies]
    ];
    box.innerHTML = `
      <div class="bignum">
        <div><div class="v">${f.consommation ? Math.round(f.consommation).toLocaleString('fr-FR') : '\u2014'}</div><div class="k">Consommation (MW)</div></div>
        <div><div class="v">${f.taux_co2 ?? '\u2014'}</div><div class="k">CO2 (g/kWh)</div></div>
      </div>
      <p class="hint" style="margin-top:12px;">Horodatage RTE : ${f.date_heure || '\u2014'}</p>
      <div class="mix-grid">
        ${filieres.map(([k,v])=>`<div class="mix-item"><div class="k">${k}</div><div class="v">${v!=null? Math.round(v).toLocaleString('fr-FR') : '\u2014'} MW</div></div>`).join('')}
      </div>`;
    loadReseauChart();
  }catch(e){
    log('Echec de la requete RTE : ' + e.message, true);
    box.innerHTML = `<div class="errbox">Impossible de charger les donnees RTE (${e.message}). Consultez <a href="https://www.rte-france.com/eco2mix" target="_blank" rel="noopener" style="color:var(--red)">rte-france.com/eco2mix</a>.</div>`;
  }
}
async function loadReseauChart(){
  try{
    const url = 'https://odre.opendatasoft.com/api/records/1.0/search/?dataset=eco2mix-national-tr&rows=20&sort=-date_heure';
    const res = await fetch(url);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const rows = (data.records || []).map(r=>r.fields).filter(f=>f && f.consommation != null).reverse();
    const labels = rows.map(f => new Date(f.date_heure).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}));
    const values = rows.map(f => f.consommation);
    const ctx = document.getElementById('reseauChart').getContext('2d');
    if(reseauChartInstance) reseauChartInstance.destroy();
    reseauChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: '#f2f2f2', backgroundColor:'rgba(242,242,242,.07)', pointRadius:0, borderWidth:1.5, fill:true, tension:.25 }] },
      options: {
        responsive:true,
        scales:{ y:{ ticks:{color:'#8a8a8a', font:{size:9}}, grid:{color:'#2b2b2b'} }, x:{ ticks:{color:'#8a8a8a', font:{size:8}, maxTicksLimit:8}, grid:{display:false} } },
        plugins:{ legend:{display:false} }
      }
    });
  }catch(e){
    log('Echec du graphique reseau : ' + e.message, true);
  }
}
document.getElementById('reseauBtn').addEventListener('click', loadReseau);

/* ---------- CAMERAS (Digitraffic, images directes) ---------- */
async function loadCameras(){
  const grid = document.getElementById('camGrid');
  grid.innerHTML = '<p class="hint"><span class="loading">chargement des cameras en direct...</span></p>';
  log('Requete API Digitraffic (cameras)...');
  try{
    const res = await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations', {
      headers: { 'Digitraffic-User': 'dedsec-terminal-static/1.0' }
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const features = data.features || [];
    const out = [];
    for(const f of features){
      const props = f.properties || {};
      if(props.state !== 'OK') continue;
      for(const p of (props.presets || [])){
        if(p.inCollection === false) continue;
        const id = p.presetId;
        if(!id) continue;
        out.push({ id, name: props.name || id, dir: p.presetName1 || '' });
        if(out.length >= 12) break;
      }
      if(out.length >= 12) break;
    }
    log(`Cameras recues — ${out.length} flux en direct.`);
    grid.innerHTML = out.map(c => `
      <div class="cam-card">
        <img src="https://weathercam.digitraffic.fi/${c.id}.jpg?t=${Date.now()}" alt="${c.name}" loading="lazy">
        <div class="cam-name">${c.name}</div>
        <div class="cam-src">${c.dir || 'Digitraffic'} \u00b7 ${c.id}</div>
      </div>
    `).join('');
  }catch(e){
    log('Echec de la requete cameras : ' + e.message, true);
    grid.innerHTML = `<div class="errbox">Impossible de charger les cameras (${e.message}). Voir <a href="https://www.digitraffic.fi/en/road-traffic/" target="_blank" rel="noopener" style="color:var(--red)">digitraffic.fi</a>.</div>`;
  }
}
document.getElementById('camBtn').addEventListener('click', loadCameras);

/* ---------- CAMERAS (NYCTMC, New York DOT, images directes) ---------- */
async function loadCamerasNyc(){
  const grid = document.getElementById('camGridNyc');
  grid.innerHTML = '<p class="hint"><span class="loading">chargement des cameras de New York...</span></p>';
  log('Requete API NYCTMC (cameras trafic New York)...');
  try{
    const res = await fetch('https://webcams.nyctmc.org/api/cameras');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    const online = list.filter(c => c.isOnline === 'true' || c.isOnline === true).slice(0, 12);
    log(`Cameras NYCTMC recues \u2014 ${online.length} flux en direct.`);
    if(online.length === 0){
      grid.innerHTML = '<p class="hint">Aucune camera en ligne actuellement cote NYCTMC.</p>';
      return;
    }
    grid.innerHTML = online.map(c => `
      <div class="cam-card">
        <img src="${c.imageUrl}?t=${Date.now()}" alt="${c.name}" loading="lazy">
        <div class="cam-name">${c.name}</div>
        <div class="cam-src">${c.area || 'NYCTMC'} \u00b7 New York</div>
      </div>
    `).join('');
  }catch(e){
    log('Echec de la requete cameras NYCTMC : ' + e.message, true);
    grid.innerHTML = `<div class="errbox">Impossible de charger les cameras de New York (${e.message}). Voir <a href="https://webcams.nyctmc.org/map" target="_blank" rel="noopener" style="color:var(--red)">webcams.nyctmc.org</a>.</div>`;
  }
}
document.getElementById('camNycBtn').addEventListener('click', loadCamerasNyc);

/* ---------- SIGNAL ---------- */
document.getElementById('signalBtn').addEventListener('click', ()=>{
  const raw = document.getElementById('signalNumber').value.trim();
  const out = document.getElementById('signalOut');
  const cleaned = raw.replace(/[^\d+]/g, '');
  if(!cleaned.startsWith('+') || cleaned.length < 8){
    out.textContent = "Entrez un numero au format international, ex: +33612345678";
    return;
  }
  const url = `https://signal.me/#p/${cleaned}`;
  log('Ouverture du lien signal.me pour ' + cleaned);
  window.open(url, '_blank');
  out.innerHTML = `Lien ouvert : <a href="${url}" target="_blank" rel="noopener" style="color:var(--white)">${url}</a>`;
});

/* ---------- MARCHES (Frankfurter / BCE) ---------- */
async function loadFx(){
  const box = document.getElementById('fxResults');
  box.innerHTML = '<p class="hint"><span class="loading">chargement des taux BCE...</span></p>';
  log('Requete API Frankfurter (BCE)...');
  try{
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,CHF,JPY,CAD');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    log('Taux BCE recus — date ' + data.date);
    box.innerHTML = `
      <p class="hint">1 EUR — taux de reference BCE du ${data.date}</p>
      <div class="fx-grid">
        ${Object.entries(data.rates).map(([k,v])=>`<div class="fx-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}
      </div>`;
  }catch(e){
    log('Echec de la requete marches : ' + e.message, true);
    box.innerHTML = `<div class="errbox">Impossible de charger les taux (${e.message}).</div>`;
  }
}
document.getElementById('fxBtn').addEventListener('click', loadFx);

/* ================= CARTE MONDIALE (Leaflet + OSM) ================= */
let map = null;
let issMarker = null, issInterval = null;
let flightMarkers = [], flightInterval = null;
let quakeMarkers = [];
let weatherMarkers = [];
let camMapMarkers = [];

function mapStatusMsg(html){
  const el = document.getElementById('mapStatus');
  el.innerHTML = html;
}

function initMap(){
  if(map) return;
  map = L.map('mapContainer', { worldCopyJump: true }).setView([25, 10], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; contributeurs OpenStreetMap',
    maxZoom: 18
  }).addTo(map);
  log('Carte mondiale initialisee (Leaflet / OpenStreetMap).');

  loadISS();
  issInterval = setInterval(()=>{ if(document.getElementById('layerIss').checked) loadISS(); }, 5000);

  loadQuakes();

  document.getElementById('layerIss').addEventListener('change', e=>{
    if(e.target.checked){ loadISS(); }
    else if(issMarker){ map.removeLayer(issMarker); issMarker = null; }
  });
  document.getElementById('layerFlights').addEventListener('change', e=>{
    if(e.target.checked){
      loadFlights();
      flightInterval = setInterval(loadFlights, 15000);
    }else{
      clearInterval(flightInterval);
      flightMarkers.forEach(m=>map.removeLayer(m)); flightMarkers = [];
    }
  });
  document.getElementById('layerQuakes').addEventListener('change', e=>{
    if(e.target.checked){ loadQuakes(); }
    else{ quakeMarkers.forEach(m=>map.removeLayer(m)); quakeMarkers = []; }
  });
  document.getElementById('layerWeather').addEventListener('change', e=>{
    if(e.target.checked){ loadWeatherLayer(); }
    else{ weatherMarkers.forEach(m=>map.removeLayer(m)); weatherMarkers = []; }
  });
  document.getElementById('layerCams').addEventListener('change', e=>{
    if(e.target.checked){ loadCamsLayer(); }
    else{ camMapMarkers.forEach(m=>map.removeLayer(m)); camMapMarkers = []; }
  });
}

async function loadISS(){
  try{
    const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if(issMarker) map.removeLayer(issMarker);
    issMarker = L.marker([d.latitude, d.longitude], {
      icon: L.divIcon({ className:'map-emoji-icon', html:'\u{1F6F0}\uFE0F', iconSize:[24,24] })
    }).addTo(map).bindPopup(`ISS \u2014 altitude ${Math.round(d.altitude)} km \u00b7 vitesse ${Math.round(d.velocity)} km/h`);
    log('Position ISS mise a jour (' + d.latitude.toFixed(2) + ', ' + d.longitude.toFixed(2) + ').');
  }catch(e){
    log('Echec ISS : ' + e.message, true);
  }
}

async function loadFlights(){
  try{
    const res = await fetch('https://opensky-network.org/api/states/all');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    flightMarkers.forEach(m=>map.removeLayer(m)); flightMarkers = [];
    const states = (d.states || []).filter(s => s[5] != null && s[6] != null).slice(0, 200);
    states.forEach(s=>{
      const callsign = (s[1] || '').trim();
      const lon = s[5], lat = s[6], track = s[10] || 0;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({ className:'map-emoji-icon', html:`<span style="display:inline-block; transform:rotate(${track}deg);">\u2708\uFE0F</span>`, iconSize:[18,18] })
      }).bindPopup(`Vol ${callsign || s[0] || '\u2014'} \u00b7 cap ${Math.round(track)}\u00b0`);
      marker.addTo(map); flightMarkers.push(marker);
    });
    log(`Trafic aerien OpenSky \u2014 ${states.length} appareils affiches.`);
  }catch(e){
    log('Echec OpenSky (quota public ou CORS) : ' + e.message, true);
    mapStatusMsg(`<div class="errbox">Trafic aerien indisponible (${e.message}). L'API publique OpenSky est fortement limitee en acces anonyme. Voir <a href="https://opensky-network.org/network/explorer" target="_blank" rel="noopener" style="color:var(--red)">opensky-network.org</a>.</div>`);
  }
}

async function loadQuakes(){
  try{
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    quakeMarkers.forEach(m=>map.removeLayer(m)); quakeMarkers = [];
    (d.features || []).forEach(f=>{
      const [lon, lat] = f.geometry.coordinates;
      const mag = f.properties.mag || 0;
      const marker = L.circleMarker([lat, lon], {
        radius: Math.max(3, mag * 2.2), color: '#ff2b2b', fillColor: '#ff2b2b', fillOpacity: .35, weight: 1
      }).bindPopup(`${f.properties.place || 'Localisation inconnue'} \u2014 M${mag}`);
      marker.addTo(map); quakeMarkers.push(marker);
    });
    log(`Seismes USGS (24h) \u2014 ${(d.features||[]).length} evenements.`);
  }catch(e){
    log('Echec USGS : ' + e.message, true);
  }
}

const WORLD_CITIES = [
  ['Paris', 48.8566, 2.3522], ['New York', 40.7128, -74.0060], ['Tokyo', 35.6762, 139.6503],
  ['Sydney', -33.8688, 151.2093], ['Moscou', 55.7558, 37.6173], ['Le Caire', 30.0444, 31.2357],
  ['Rio de Janeiro', -22.9068, -43.1729], ['Nairobi', -1.2921, 36.8219], ['Mumbai', 19.0760, 72.8777]
];
async function loadWeatherLayer(){
  weatherMarkers.forEach(m=>map.removeLayer(m)); weatherMarkers = [];
  log('Requete API Open-Meteo (meteo mondiale)...');
  for(const [name, lat, lon] of WORLD_CITIES){
    try{
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      if(!res.ok) continue;
      const d = await res.json();
      const t = d.current_weather.temperature;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({ className:'map-emoji-icon weather-pin', html:`${Math.round(t)}\u00b0C`, iconSize:[46,20] })
      }).bindPopup(`${name} \u2014 ${t}\u00b0C, vent ${d.current_weather.windspeed} km/h`);
      marker.addTo(map); weatherMarkers.push(marker);
    }catch(e){ /* ville ignoree en cas d'echec ponctuel */ }
  }
  log(`Meteo mondiale affichee \u2014 ${weatherMarkers.length}/${WORLD_CITIES.length} villes.`);
}

async function loadCamsLayer(){
  camMapMarkers.forEach(m=>map.removeLayer(m)); camMapMarkers = [];
  let count = 0;

  log('Requete API Digitraffic (webcams sur carte)...');
  try{
    const res = await fetch('https://tie.digitraffic.fi/api/weathercam/v1/stations', {
      headers: { 'Digitraffic-User': 'dedsec-terminal-static/1.0' }
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    for(const f of (data.features || [])){
      if(count >= 25) break;
      const props = f.properties || {};
      if(props.state !== 'OK') continue;
      const preset = (props.presets || []).find(p => p.inCollection !== false);
      if(!preset || !f.geometry || !f.geometry.coordinates) continue;
      const [lon, lat] = f.geometry.coordinates;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({ className:'map-emoji-icon', html:'\u{1F4F9}', iconSize:[20,20] })
      }).bindPopup(`<b>${props.name}</b><br><img src="https://weathercam.digitraffic.fi/${preset.presetId}.jpg?t=${Date.now()}" style="width:200px; filter:grayscale(1); margin-top:6px;">`);
      marker.addTo(map); camMapMarkers.push(marker); count++;
    }
  }catch(e){
    log('Echec webcams Digitraffic (carte) : ' + e.message, true);
  }

  log('Requete API NYCTMC (webcams sur carte)...');
  try{
    const res = await fetch('https://webcams.nyctmc.org/api/cameras');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = (Array.isArray(data) ? data : []).filter(c => (c.isOnline === 'true' || c.isOnline === true) && c.latitude && c.longitude).slice(0, 25);
    list.forEach(c=>{
      const marker = L.marker([parseFloat(c.latitude), parseFloat(c.longitude)], {
        icon: L.divIcon({ className:'map-emoji-icon', html:'\u{1F4F9}', iconSize:[20,20] })
      }).bindPopup(`<b>${c.name}</b><br><img src="${c.imageUrl}?t=${Date.now()}" style="width:200px; margin-top:6px;">`);
      marker.addTo(map); camMapMarkers.push(marker); count++;
    });
  }catch(e){
    log('Echec webcams NYCTMC (carte) : ' + e.message, true);
  }

  log(`Webcams affichees sur la carte \u2014 ${count}.`);
}

/* ================= ACTIVITE SOLAIRE (NOAA SWPC) ================= */
let solarChartInstance;
function classifyFlux(f){
  if(f >= 1e-4) return 'X';
  if(f >= 1e-5) return 'M';
  if(f >= 1e-6) return 'C';
  if(f >= 1e-7) return 'B';
  return 'A';
}
async function loadSolar(){
  const box = document.getElementById('solarResults');
  box.innerHTML = '<p class="hint"><span class="loading">chargement des donnees NOAA...</span></p>';
  log('Requete API NOAA SWPC (rayons X GOES)...');
  try{
    const res = await fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const longFlux = data.filter(d => d.energy === '0.1-0.8nm');
    if(!longFlux.length) throw new Error('donnees vides');
    const last = longFlux[longFlux.length - 1];
    const cls = classifyFlux(last.flux);
    log('Donnees NOAA recues \u2014 flux ' + last.flux.toExponential(2) + ' W/m2.');
    box.innerHTML = `
      <div class="bignum">
        <div><div class="v">${cls}</div><div class="k">Classe d'eruption (rayons X)</div></div>
        <div><div class="v">${last.flux.toExponential(2)}</div><div class="k">Flux (W/m\u00b2)</div></div>
      </div>
      <p class="hint" style="margin-top:12px;">Derniere mesure GOES : ${last.time_tag}</p>`;
    drawSolarChart(longFlux);
  }catch(e){
    log('Echec NOAA : ' + e.message, true);
    box.innerHTML = `<div class="errbox">Impossible de charger l'activite solaire (${e.message}). Voir <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener" style="color:var(--red)">swpc.noaa.gov</a>.</div>`;
  }
}
function drawSolarChart(points){
  const ctx = document.getElementById('solarChart').getContext('2d');
  const labels = points.map(p => new Date(p.time_tag).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }));
  const values = points.map(p => p.flux);
  if(solarChartInstance) solarChartInstance.destroy();
  solarChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: '#ff2b2b', backgroundColor: 'rgba(255,43,43,.08)', pointRadius: 0, borderWidth: 1.5, fill: true, tension: .25 }] },
    options: {
      responsive: true,
      scales: {
        y: { type: 'logarithmic', ticks: { color: '#8a8a8a', font: { size: 9 } }, grid: { color: '#2b2b2b' } },
        x: { ticks: { color: '#8a8a8a', font: { size: 8 }, maxTicksLimit: 8 }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}
document.getElementById('solarBtn').addEventListener('click', loadSolar);

/* ================= VUE SATELLITE (GOES + NASA EPIC/DSCOVR) ================= */
function imgFallback(imgEl, url, label){
  const div = document.createElement('div');
  div.className = 'errbox';
  div.innerHTML = `Image ${label} indisponible pour le moment. Voir <a href="${url}" target="_blank" rel="noopener" style="color:var(--red)">star.nesdis.noaa.gov</a>.`;
  if(imgEl.parentElement) imgEl.replaceWith(div);
}
function loadGoesImages(){
  log('Requete images satellite GOES-19 (Est) / GOES-18 (Ouest) — NOAA STAR...');
  const t = Date.now();
  const east = document.getElementById('goesEastImg');
  const west = document.getElementById('goesWestImg');
  east.onerror = () => imgFallback(east, 'https://www.star.nesdis.noaa.gov/goes/fulldisk.php?sat=G19', 'GOES-East');
  west.onerror = () => imgFallback(west, 'https://www.star.nesdis.noaa.gov/goes/fulldisk.php?sat=G18', 'GOES-West');
  east.src = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg?t=${t}`;
  west.src = `https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg?t=${t}`;
  log('Images satellite GOES demandees (mises a jour cote NOAA toutes les ~10 min).');
}
document.getElementById('goesBtn').addEventListener('click', loadGoesImages);

async function loadEpic(){
  const box = document.getElementById('epicResults');
  box.innerHTML = '<p class="hint"><span class="loading">chargement de la photo DSCOVR / EPIC...</span></p>';
  log('Requete API NASA EPIC (epic.gsfc.nasa.gov)...');
  try{
    const res = await fetch('https://epic.gsfc.nasa.gov/api/natural');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0) throw new Error('aucune image disponible');
    const latest = data[data.length - 1];
    const d = new Date(latest.date.replace(' ', 'T') + 'Z');
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const imgUrl = `https://epic.gsfc.nasa.gov/archive/natural/${yyyy}/${mm}/${dd}/jpg/${latest.image}.jpg`;
    log('Photo EPIC recue \u2014 prise le ' + latest.date + ' UTC.');
    box.innerHTML = `<div class="epic-card">
      <img src="${imgUrl}" alt="Terre vue par la camera EPIC (satellite DSCOVR)" loading="lazy">
      <div>
        <div class="name">Terre entiere \u2014 camera EPIC (satellite DSCOVR)</div>
        <div class="meta" style="margin-top:6px;">Prise le ${latest.date} UTC \u00b7 depuis le point de Lagrange L1 (\u2248 1,5 million km de la Terre)</div>
      </div>
    </div>`;
  }catch(e){
    log('Echec EPIC : ' + e.message, true);
    box.innerHTML = `<div class="errbox">Impossible de charger la photo EPIC (${e.message}). Voir <a href="https://epic.gsfc.nasa.gov/" target="_blank" rel="noopener" style="color:var(--red)">epic.gsfc.nasa.gov</a>.</div>`;
  }
}
document.getElementById('epicBtn').addEventListener('click', loadEpic);

/* ---------- REFRESH ALL ---------- */
document.getElementById('refreshAll').addEventListener('click', ()=>{
  loadProfiler(); loadReseau(); loadFx(); loadCameras(); loadCamerasNyc();
  if(map){ loadISS(); loadQuakes(); }
  loadSolar();
  if(satelliteOpened){ loadGoesImages(); loadEpic(); }
});

/* ---------- INIT ---------- */
log('Terminal initialise. Toutes les donnees sont issues de sources publiques reelles, appelees directement depuis ce navigateur.');
loadProfiler();
loadReseau();
loadFx();
loadCameras();
