// Precipitation radar: a Leaflet map with animated RainViewer radar frames.
// app.js calls showRadar(lat, lon, cityName) after a search and hideRadar() when results are cleared.
// Nothing here ever throws to the caller: on any problem the panel shows a friendly message.
//
// How a map works (short): the map is a grid of small square pictures called "tiles".
// We stack "layers": the dark base map at the bottom, one transparent radar layer on top.

const RADAR_API_URL = "https://api.rainviewer.com/public/weather-maps.json";
const RADAR_ZOOM = 7;              // RainViewer gives no tiles above zoom 7 on the free plan
const RADAR_FRAME_DELAY_MS = 500;  // time between two frames while playing
const RADAR_OPACITY = 0.75;        // a little see-through, so the streets stay visible
const RADAR_COLOR_SCHEME = 2;      // "Universal Blue" from RainViewer
const RADAR_PATH_PATTERN = /^\/v2\/radar\/[A-Za-z0-9_-]+$/; // we check the path before using it in a URL

const radarSection = document.getElementById("radar");

// Everything that changes while the radar works lives in one object
const radarState = {
  built: false,
  map: null,
  marker: null,
  frames: [],          // [{ time, layer }]
  frameIndex: 0,
  timerId: null,
  requestNumber: 0,    // lets us ignore an old answer when a newer search started
  elements: {}
};

function prefersReducedMotionForRadar() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Build the panel one time; later calls only move the map
function buildRadarPanel() {
  const panel = document.createElement("div");
  panel.className = "panel radar-panel";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "Радар осадков";

  const message = document.createElement("p");
  message.className = "forecast-error radar-message";
  message.hidden = true;

  const mapBox = document.createElement("div");
  mapBox.className = "radar-map";

  const controls = document.createElement("div");
  controls.className = "radar-controls";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "radar-play";
  playButton.textContent = "▶";
  playButton.setAttribute("aria-label", "Запустить анимацию радара");
  playButton.addEventListener("click", toggleRadarPlay);

  const timeLabel = document.createElement("span");
  timeLabel.className = "radar-time";
  timeLabel.setAttribute("aria-live", "off");

  controls.append(playButton, timeLabel);

  // RainViewer asks for a visible credit with a link
  const credit = document.createElement("p");
  credit.className = "radar-credit";
  credit.append("Данные радара: ");
  const creditLink = document.createElement("a");
  creditLink.href = "https://www.rainviewer.com/";
  creditLink.target = "_blank";
  creditLink.rel = "noopener noreferrer";
  creditLink.textContent = "RainViewer";
  credit.append(creditLink);

  panel.append(title, message, mapBox, controls, credit);
  radarSection.append(panel);

  radarState.elements = { panel, message, mapBox, controls, playButton, timeLabel, credit };
  radarState.built = true;
}

// Create the Leaflet map (needs the library and a visible box)
function createRadarMap(latitude, longitude) {
  const { mapBox } = radarState.elements;
  const map = L.map(mapBox, {
    center: [latitude, longitude],
    zoom: RADAR_ZOOM,
    minZoom: 3,
    maxZoom: RADAR_ZOOM,
    scrollWheelZoom: false,   // the mouse wheel must keep scrolling the page
    dragging: !L.Browser.mobile, // on phones one finger scrolls the page, not the map
    tap: false,
    attributionControl: true
  });

  // Dark base map from Esri (no key needed). CARTO dark tiles now need a key, so we do not use them.
  // Note the URL order: Esri wants {z}/{y}/{x}, not {z}/{x}/{y}.
  const esriUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  L.tileLayer(esriUrl + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: RADAR_ZOOM,
    zIndex: 1,
    attribution: "© Esri, HERE, Garmin, OpenStreetMap"
  }).addTo(map);

  // Place names go ABOVE the radar (zIndex 20 > radar 10), so they stay readable under the rain
  L.tileLayer(esriUrl + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: RADAR_ZOOM,
    zIndex: 20
  }).addTo(map);

  map.attributionControl.setPrefix("Leaflet"); // shorter: no flag, so the credit fits in one line
  radarState.map = map;
}

// A glowing dot at the city. divIcon = a normal HTML element placed on the map (styled in radar.css).
function placeRadarMarker(latitude, longitude, cityName) {
  const icon = L.divIcon({ className: "radar-dot-wrap", html: "<span class=\"radar-dot\"></span>", iconSize: [20, 20] });
  if (radarState.marker) {
    radarState.marker.setLatLng([latitude, longitude]);
    return;
  }
  radarState.marker = L.marker([latitude, longitude], { icon, interactive: false, keyboard: false }).addTo(radarState.map);
  radarState.marker.getElement().setAttribute("title", cityName);
}

// Check the RainViewer answer before using it. Returns { host, frames } or null.
function readRadarAnswer(data) {
  if (!data || typeof data.host !== "string" || !data.host.startsWith("https://")) return null;
  const past = data.radar && data.radar.past;
  if (!Array.isArray(past)) return null;

  const frames = past.filter((frame) => {
    return frame
      && Number.isFinite(frame.time)
      && typeof frame.path === "string"
      && RADAR_PATH_PATTERN.test(frame.path);
  });
  if (frames.length === 0) return null;
  return { host: data.host.replace(/\/$/, ""), frames };
}

async function fetchRadarFrames() {
  // Without a timeout a stuck server would keep "Загружаем радар…" on the screen forever.
  // Very old browsers have no AbortSignal.timeout: then we use a plain fetch.
  const options =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? { signal: AbortSignal.timeout(15000) }
      : {};
  const response = await fetch(RADAR_API_URL, options);
  if (!response.ok) throw new Error("RainViewer answered " + response.status);
  const answer = readRadarAnswer(await response.json());
  if (!answer) throw new Error("Unexpected RainViewer answer");
  return answer;
}

// Remove the old radar layers from the map
function clearRadarFrames() {
  stopRadar();
  radarState.frames.forEach((frame) => frame.layer.remove());
  radarState.frames = [];
}

// One transparent layer per frame. All are added now with opacity 0 (so their pictures
// download early); showing a frame just means setting its opacity.
function addRadarFrames(host, frames) {
  clearRadarFrames();
  radarState.frames = frames.map((frame) => {
    // Tile URL: {host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
    const url = host + frame.path + "/256/{z}/{x}/{y}/" + RADAR_COLOR_SCHEME + "/1_1.png";
    const layer = L.tileLayer(url, {
      opacity: 0,
      maxZoom: RADAR_ZOOM,
      maxNativeZoom: RADAR_ZOOM,
      zIndex: 10
    }).addTo(radarState.map);
    return { time: frame.time, layer };
  });
  showRadarFrame(radarState.frames.length - 1); // start with the newest picture
}

function formatRadarAge(timestampSeconds) {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - timestampSeconds) / 60));
  if (minutes < 3) return "сейчас";
  if (minutes < 60) return minutes + " мин назад";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + " ч" + (rest > 0 ? " " + rest + " мин" : "") + " назад";
}

function showRadarFrame(index) {
  radarState.frames.forEach((frame, frameNumber) => {
    frame.layer.setOpacity(frameNumber === index ? RADAR_OPACITY : 0);
  });
  radarState.frameIndex = index;

  // Only the age: a clock time would be in the phone's time zone, not the city's
  radarState.elements.timeLabel.textContent = formatRadarAge(radarState.frames[index].time);
}

function playRadar() {
  if (radarState.timerId !== null || radarState.frames.length < 2) return;
  radarState.timerId = setInterval(() => {
    showRadarFrame((radarState.frameIndex + 1) % radarState.frames.length);
  }, RADAR_FRAME_DELAY_MS);
  radarState.elements.playButton.textContent = "⏸";
  radarState.elements.playButton.setAttribute("aria-label", "Остановить анимацию радара");
}

function stopRadar() {
  if (radarState.timerId !== null) {
    clearInterval(radarState.timerId);
    radarState.timerId = null;
  }
  if (radarState.built) {
    radarState.elements.playButton.textContent = "▶";
    radarState.elements.playButton.setAttribute("aria-label", "Запустить анимацию радара");
  }
}

function toggleRadarPlay() {
  if (radarState.timerId === null) playRadar();
  else stopRadar();
}

// Show a message instead of the map and controls
function showRadarMessage(text) {
  const { message, mapBox, controls, credit } = radarState.elements;
  message.textContent = text;
  message.hidden = false;
  mapBox.hidden = true;
  controls.hidden = true;
  credit.hidden = true;
}

function showRadarContent() {
  const { message, mapBox, controls, credit } = radarState.elements;
  message.hidden = true;
  mapBox.hidden = false;
  controls.hidden = false;
  credit.hidden = false;
}

async function showRadar(latitude, longitude, cityName) {
  // Declared before "try", so the catch can also see which request this is
  let myRequest = -1;
  try {
    if (!radarSection || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (!radarState.built) buildRadarPanel();
    radarSection.hidden = false;
    radarState.requestNumber += 1;
    myRequest = radarState.requestNumber;

    if (typeof L === "undefined") {
      showRadarMessage("Радар сейчас недоступен");
      return;
    }

    showRadarContent();
    radarState.elements.timeLabel.textContent = "Загружаем радар…";
    clearRadarFrames();

    if (!radarState.map) createRadarMap(latitude, longitude);
    else radarState.map.setView([latitude, longitude], RADAR_ZOOM);
    // The box was hidden or has just appeared: tell Leaflet to measure it again
    radarState.map.invalidateSize();
    placeRadarMarker(latitude, longitude, cityName || "");

    const answer = await fetchRadarFrames();
    if (myRequest !== radarState.requestNumber) return; // a newer search started, drop this answer
    addRadarFrames(answer.host, answer.frames);
    if (!prefersReducedMotionForRadar()) playRadar();
  } catch (error) {
    // An old request that failed late must not break the radar of the newer city
    if (myRequest !== -1 && myRequest !== radarState.requestNumber) return;
    console.error("Radar failed:", error);
    if (radarState.built) {
      stopRadar();
      showRadarMessage("Радар сейчас недоступен");
    }
  }
}

function hideRadar() {
  radarState.requestNumber += 1; // late answers must not wake the radar up
  stopRadar();
  if (radarSection) radarSection.hidden = true;
}
