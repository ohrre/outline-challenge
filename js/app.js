// --- GLOBAL GAME STATE & DATASETS ---
let COUNTRIES_DB = [];
let worldGeoJson = null;
let currentTarget = null;
let foundNeighbors = [];
let toastTimeout = null;

let state = {
  phase: 1,
  p1Tries: 6,
  p3Tries: 3,
  p4Tries: 2
};

// Helper: Format 3-digit ISO strings for TopoJSON matching
function formatIso(code) {
  if (!code) return null;
  return String(code).padStart(3, '0');
}

// Math Helper: Distance calculation using Haversine Formula (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Math Helper: Bearing calculation
function calculateDirection(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  brng = (brng + 360) % 360;

  const arrows = ['⬆️ N', '↗️ NE', '➡️ E', '↘️ SE', '⬇️ S', '↙️ SW', '⬅️ W', '↖️ NW'];
  return arrows[Math.round(brng / 45) % 8];
}

// Managed Toast Notifications
function showToast(msg, type, duration = 3000) {
  const toast = document.getElementById("toast-message");
  if (!toast) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  toast.textContent = msg;
  toast.className = type === "success" ? "toast-success" : "toast-error";

  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      clearToast();
    }, duration);
  }
}

function clearToast() {
  const toast = document.getElementById("toast-message");
  if (toast) {
    toast.textContent = "";
    toast.className = "";
  }
  if (toastTimeout) clearTimeout(toastTimeout);
}

// Focus Helper
function focusInput(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.focus();
  }, 50);
}

// Aliases generator
function getAliases(country) {
  const aliases = new Set();
  
  if (country.name?.common) aliases.add(country.name.common.toLowerCase());
  if (country.name?.official) aliases.add(country.name.official.toLowerCase());
  
  const cca3 = country.cca3;
  if (cca3 === "USA") ["usa", "us", "america", "united states", "united states of america"].forEach(a => aliases.add(a));
  if (cca3 === "ARE") ["uae", "united arab emirates"].forEach(a => aliases.add(a));
  if (cca3 === "GBR") ["uk", "great britain", "britain", "united kingdom"].forEach(a => aliases.add(a));
  if (cca3 === "COD") ["dr congo", "drc", "congo kinshasa", "democratic republic of the congo"].forEach(a => aliases.add(a));
  if (cca3 === "COG") ["congo brazzaville", "republic of the congo"].forEach(a => aliases.add(a));
  if (cca3 === "CAF") ["car", "central african republic"].forEach(a => aliases.add(a));
  if (cca3 === "KNA") ["st kitts", "st kitts and nevis", "saint kitts"].forEach(a => aliases.add(a));
  if (cca3 === "VCT") ["st vincent", "st vincent and the grenadines", "saint vincent"].forEach(a => aliases.add(a));
  if (cca3 === "LCA") ["st lucia", "saint lucia"].forEach(a => aliases.add(a));

  if (Array.isArray(country.altSpellings)) {
    country.altSpellings.forEach(s => aliases.add(s.toLowerCase()));
  }

  return Array.from(aliases);
}

// --- INITIALIZATION ---
Promise.all([
  d3.json("data/countries.json"),
  d3.json("data/world-50m.json")
]).then(([rawCountries, topology]) => {
  
  const unCountries = rawCountries.filter(c => c.unMember === true || c.cca3 === "PSE" || c.cca3 === "VAT");

  const cca3ToCcn3 = {};
  unCountries.forEach(c => {
    if (c.cca3 && c.ccn3) {
      cca3ToCcn3[c.cca3] = formatIso(c.ccn3);
    }
  });

  COUNTRIES_DB = unCountries.map(c => {
    const numericIso = formatIso(c.ccn3);
    const cca2 = c.cca2 ? c.cca2.toLowerCase() : '';

    const neighborIsos = (c.borders || [])
      .map(borderCca3 => cca3ToCcn3[borderCca3])
      .filter(Boolean);

    return {
      name: c.name?.common || "Unknown",
      aliases: getAliases(c),
      iso: numericIso,
      cca2: cca2,
      cca3: c.cca3,
      lat: c.latlng ? c.latlng[0] : null,
      lon: c.latlng ? c.latlng[1] : null,
      capital: Array.isArray(c.capital) ? c.capital[0] : (c.capital || ""),
      neighbors: neighborIsos,
      flagPath: cca2 ? `data/flags/${cca2}.svg` : null,
      flagFallback: cca2 ? `https://flagcdn.com/${cca2}.svg` : null
    };
  }).filter(c => c.iso && c.lat !== null && c.lon !== null);

  worldGeoJson = topojson.feature(topology, topology.objects.countries);

  // Setup Datalists
  const countryDatalist = document.getElementById("country-list");
  const capitalDatalist = document.getElementById("capital-list");

  if (countryDatalist) {
    countryDatalist.innerHTML = "";
    [...COUNTRIES_DB]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.name;
        countryDatalist.appendChild(opt);
      });
  }

  if (capitalDatalist) {
    capitalDatalist.innerHTML = "";
    [...COUNTRIES_DB]
      .filter(c => c.capital)
      .sort((a, b) => a.capital.localeCompare(b.capital))
      .forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.capital;
        capitalDatalist.appendChild(opt);
      });
  }

  bindEnterKeys();
  startNewGame();
}).catch(err => {
  console.error("Initialization Error:", err);
  showToast("Error loading database or map assets.", "error", 0);
});

function findCountryInput(val) {
  const cleanVal = val.trim().toLowerCase();
  return COUNTRIES_DB.find(c => c.aliases.includes(cleanVal));
}

function bindEnterKeys() {
  const inputs = [
    { inputId: "p1-input", btnId: "p1-submit-btn" },
    { inputId: "p2-input", btnId: "p2-submit-btn" },
    { inputId: "p3-input", btnId: "p3-submit-btn" }
  ];

  inputs.forEach(({ inputId, btnId }) => {
    const el = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (el && btn) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          btn.click();
        }
      });
    }
  });
}

// --- D3 MAP RENDERING HELPERS ---
function renderTargetCountry(geoJson, targetIso) {
  const svg = d3.select("#map-svg");
  svg.selectAll("*").remove();

  const feature = geoJson.features.find(f => formatIso(f.id) === targetIso);
  if (!feature) return;

  const container = document.getElementById("map-container");
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 330;

  // 1. Create projection with enhanced precision
  const projection = d3.geoMercator().precision(0.1);

  // 2. Adjust projection rotation if country crosses the +180/-180 antimeridian
  const bounds = d3.geoBounds(feature);
  const lonDiff = Math.abs(bounds[1][0] - bounds[0][0]);
  if (lonDiff > 180) {
    const centroid = d3.geoCentroid(feature);
    projection.rotate([-centroid[0], 0]);
  }

  // 3. Fit target neatly inside box with safe padding
  projection.fitExtent([[40, 40], [width - 40, height - 40]], feature);

  const path = d3.geoPath().projection(projection);

  const g = svg.append("g");

  g.append("path")
    .datum(feature)
    .attr("class", "country-target")
    .attr("d", path);
}

function renderCountryAndNeighborsMap(geoJson, targetIso, neighborIsos) {
  const svg = d3.select("#map-svg");
  svg.selectAll("*").remove();

  const allRelevantIsos = [targetIso, ...neighborIsos];
  const relevantFeatures = geoJson.features.filter(f => allRelevantIsos.includes(formatIso(f.id)));

  if (relevantFeatures.length === 0) return;

  const container = document.getElementById("map-container");
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 330;

  const featureCollection = { type: "FeatureCollection", features: relevantFeatures };
  
  const projection = d3.geoMercator().precision(0.1);

  const bounds = d3.geoBounds(featureCollection);
  const lonDiff = Math.abs(bounds[1][0] - bounds[0][0]);
  if (lonDiff > 180) {
    const centroid = d3.geoCentroid(featureCollection);
    projection.rotate([-centroid[0], 0]);
  }

  projection.fitExtent([[40, 40], [width - 40, height - 40]], featureCollection);
  const path = d3.geoPath().projection(projection);

  const g = svg.append("g");

  g.selectAll("path.world")
    .data(geoJson.features)
    .enter()
    .append("path")
    .attr("class", f => {
      const iso = formatIso(f.id);
      if (iso === targetIso) return "country-target";
      if (neighborIsos.includes(iso)) return `neighbor-hidden iso-${iso}`;
      return "country-base";
    })
    .attr("d", path);
}

function revealNeighborOnMap(neighborIso) {
  d3.selectAll(`.iso-${neighborIso}`)
    .classed("neighbor-revealed", true);
}

// --- NEW GAME ---
function startNewGame() {
  clearToast();
  const validTargets = COUNTRIES_DB.filter(c => c.lat != null && c.lon != null);
  currentTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
  foundNeighbors = [];

  state = { phase: 1, p1Tries: 6, p3Tries: 3, p4Tries: 2 };
  
  document.getElementById("phase-badge").textContent = "Phase 1: Guess Country";
  document.getElementById("p1-tries").textContent = state.p1Tries;
  document.getElementById("p1-history").innerHTML = "";
  document.getElementById("p2-found-list").innerHTML = "";
  document.getElementById("p1-input").value = "";
  document.getElementById("game-over-screen").classList.add("hidden");

  document.querySelectorAll(".phase-section").forEach(el => el.classList.add("hidden"));
  document.getElementById("phase1-controls").classList.remove("hidden");

  renderTargetCountry(worldGeoJson, currentTarget.iso);
  focusInput("p1-input");
}

// --- PHASE 1 ---
document.getElementById("p1-submit-btn").addEventListener("click", () => {
  const input = document.getElementById("p1-input");
  const guessedCountry = findCountryInput(input.value);

  if (!guessedCountry) {
    showToast("Country not recognized or not a UN member state.", "error");
    focusInput("p1-input");
    return;
  }

  if (guessedCountry.iso === currentTarget.iso) {
    showToast("Correct! Moving to Phase 2...", "success", 1200);
    setTimeout(startPhase2, 1200);
  } else {
    state.p1Tries--;
    document.getElementById("p1-tries").textContent = state.p1Tries;

    const dist = calculateDistance(guessedCountry.lat, guessedCountry.lon, currentTarget.lat, currentTarget.lon);
    const prox = Math.max(0, Math.round(100 - (dist / 20000) * 100));
    const dir = calculateDirection(guessedCountry.lat, guessedCountry.lon, currentTarget.lat, currentTarget.lon);

    const historyEl = document.getElementById("p1-history");
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `<span>${guessedCountry.name}</span> <span>${prox}%</span> <span>${dir} (${dist.toLocaleString()} km)</span>`;
    historyEl.prepend(row);

    if (state.p1Tries <= 0) {
      triggerGameOver(false, `Out of tries! The country was ${currentTarget.name}.`);
    } else {
      showToast("Incorrect guess. Try again!", "error");
      focusInput("p1-input");
    }
  }
  input.value = "";
});

// --- PHASE 2 ---
function startPhase2() {
  clearToast();
  state.phase = 2;
  document.getElementById("phase-badge").textContent = "Phase 2: Guess Neighbors";
  document.getElementById("phase1-controls").classList.add("hidden");
  document.getElementById("phase2-controls").classList.remove("hidden");
  document.getElementById("p2-input").value = "";

  if (!currentTarget.neighbors || currentTarget.neighbors.length === 0) {
    showToast(`${currentTarget.name} has no UN-recognized land neighbors! Moving to Phase 3...`, "success", 1500);
    setTimeout(startPhase3, 1500);
    return;
  }

  renderCountryAndNeighborsMap(worldGeoJson, currentTarget.iso, currentTarget.neighbors);
  updateP2Progress();
  focusInput("p2-input");
}

function updateP2Progress() {
  document.getElementById("p2-progress").textContent = `${foundNeighbors.length} / ${currentTarget.neighbors.length}`;
}

document.getElementById("p2-submit-btn").addEventListener("click", () => {
  const input = document.getElementById("p2-input");
  const guessedCountry = findCountryInput(input.value);

  if (!guessedCountry) {
    showToast("Country not recognized or not a UN member state.", "error");
    input.value = "";
    focusInput("p2-input");
    return;
  }

  const guessedIso = guessedCountry.iso;

  if (currentTarget.neighbors.includes(guessedIso)) {
    if (!foundNeighbors.includes(guessedIso)) {
      foundNeighbors.push(guessedIso);
      
      revealNeighborOnMap(guessedIso);

      const tag = document.createElement("li");
      tag.textContent = guessedCountry.name;
      document.getElementById("p2-found-list").appendChild(tag);
      updateP2Progress();

      showToast(`Correct! ${guessedCountry.name} is a neighbor.`, "success");

      if (foundNeighbors.length === currentTarget.neighbors.length) {
        showToast("All neighbors found! Moving to Phase 3...", "success", 1200);
        setTimeout(startPhase3, 1200);
      } else {
        focusInput("p2-input");
      }
    } else {
      showToast("Already found that neighbor!", "error");
      focusInput("p2-input");
    }
  } else {
    showToast(`${guessedCountry.name} is not a neighbor of ${currentTarget.name}.`, "error");
    focusInput("p2-input");
  }

  input.value = "";
});

// --- PHASE 3: CAPITAL ---
function startPhase3() {
  clearToast();
  state.phase = 3;
  document.getElementById("phase-badge").textContent = "Phase 3: Guess Capital";
  document.getElementById("phase2-controls").classList.add("hidden");
  document.getElementById("phase3-controls").classList.remove("hidden");
  document.getElementById("p3-country-name").textContent = currentTarget.name;
  document.getElementById("p3-tries").textContent = state.p3Tries;
  document.getElementById("p3-input").value = "";
  focusInput("p3-input");
}

document.getElementById("p3-submit-btn").addEventListener("click", () => {
  const input = document.getElementById("p3-input");
  const val = input.value.trim().toLowerCase();
  if (!val) return;

  if (currentTarget.capital && val === currentTarget.capital.toLowerCase()) {
    showToast("Correct capital! Moving to final Flag Stage...", "success", 1200);
    setTimeout(startPhase4, 1200);
  } else {
    state.p3Tries--;
    document.getElementById("p3-tries").textContent = state.p3Tries;

    if (state.p3Tries <= 0) {
      triggerGameOver(false, `Out of tries! The capital was ${currentTarget.capital || "N/A"}.`);
    } else {
      showToast("Incorrect capital city.", "error");
      focusInput("p3-input");
    }
  }
  input.value = "";
});

// --- PHASE 4: FLAG SELECT ---
function startPhase4() {
  clearToast();
  state.phase = 4;
  document.getElementById("phase-badge").textContent = "Phase 4: Select Flag";
  document.getElementById("phase3-controls").classList.add("hidden");
  document.getElementById("phase4-controls").classList.remove("hidden");
  document.getElementById("p4-country-name").textContent = currentTarget.name;
  document.getElementById("p4-tries").textContent = state.p4Tries;

  let correctOption;
  if (currentTarget.neighbors && currentTarget.neighbors.length > 0) {
    const randomNeighborIso = currentTarget.neighbors[Math.floor(Math.random() * currentTarget.neighbors.length)];
    correctOption = COUNTRIES_DB.find(c => c.iso === randomNeighborIso);
  } else {
    correctOption = currentTarget;
  }

  const distractors = COUNTRIES_DB.filter(c => c.iso !== currentTarget.iso && !currentTarget.neighbors.includes(c.iso))
                                  .sort(() => 0.5 - Math.random())
                                  .slice(0, 5);

  const options = [correctOption, ...distractors].sort(() => 0.5 - Math.random());

  const grid = document.getElementById("flag-grid");
  grid.innerHTML = "";

  options.forEach(c => {
    const card = document.createElement("div");
    card.className = "flag-card";
    
    const img = document.createElement("img");
    img.src = c.flagPath;
    img.alt = `Flag option`;
    img.onerror = () => { img.src = c.flagFallback; };

    card.appendChild(img);
    card.addEventListener("click", () => handleFlagClick(c.iso === correctOption.iso));
    grid.appendChild(card);
  });
}

function handleFlagClick(isCorrect) {
  if (isCorrect) {
    triggerGameOver(true, `Victory! You mastered all stages for ${currentTarget.name}!`);
  } else {
    state.p4Tries--;
    document.getElementById("p4-tries").textContent = state.p4Tries;

    if (state.p4Tries <= 0) {
      triggerGameOver(false, "Out of tries on the flag choice!");
    } else {
      showToast("Wrong flag!", "error");
    }
  }
}

function triggerGameOver(isWin, msg) {
  clearToast();
  document.querySelectorAll(".phase-section").forEach(el => el.classList.add("hidden"));
  const screen = document.getElementById("game-over-screen");
  screen.classList.remove("hidden");

  document.getElementById("game-over-title").textContent = isWin ? "🎉 Round Won!" : "❌ Game Over";
  document.getElementById("game-over-msg").textContent = msg;
}

const restartBtn = document.getElementById("restart-btn");
if (restartBtn) {
  restartBtn.addEventListener("click", startNewGame);
}