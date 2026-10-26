// Live weather background. Styles are in background.css.
// Use: setWeatherBackground(weatherCode, isDay) and clearWeatherBackground().

// Keep the counts small so phones stay smooth
const MAX_DROPS = 50;
const MAX_FLAKES = 35;
const MAX_STARS = 50;

let backgroundElement = null;
let currentSceneKey = ""; // lets us skip rebuilding when nothing changed

// Turn a WMO weather code into a scene name (or "" if we do not know it)
function getSceneName(weatherCode) {
  if (weatherCode === 0 || weatherCode === 1) return "clear";
  if (weatherCode === 2 || weatherCode === 3) return "cloudy";
  if (weatherCode === 45 || weatherCode === 48) return "fog";
  if (weatherCode >= 51 && weatherCode <= 67) return "rain";
  if (weatherCode >= 80 && weatherCode <= 82) return "rain";
  if (weatherCode >= 71 && weatherCode <= 77) return "snow";
  if (weatherCode === 85 || weatherCode === 86) return "snow";
  if (weatherCode >= 95 && weatherCode <= 99) return "storm";
  return "";
}

// Random number between min and max
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Make the one fixed container the first time we need it
function getBackgroundElement() {
  if (backgroundElement) return backgroundElement;
  backgroundElement = document.createElement("div");
  backgroundElement.className = "weather-bg";
  backgroundElement.setAttribute("aria-hidden", "true");
  document.body.insertBefore(backgroundElement, document.body.firstChild);
  return backgroundElement;
}

// Create a small span; "vars" become inline CSS custom properties (--x, --delay ...)
function createParticle(className, vars) {
  const particle = document.createElement("span");
  particle.className = className;
  for (const name in vars) {
    particle.style.setProperty("--" + name, vars[name]);
  }
  return particle;
}

function addParticles(container, count, className, makeVars) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    fragment.appendChild(createParticle(className, makeVars()));
  }
  container.appendChild(fragment);
}

function addRain(container) {
  addParticles(container, MAX_DROPS, "bg-drop", () => ({
    x: randomBetween(0, 115).toFixed(1) + "%",
    duration: randomBetween(0.7, 1.3).toFixed(2) + "s",
    // Negative delay: drops are already falling when the scene appears
    delay: (-randomBetween(0, 1.3)).toFixed(2) + "s",
  }));
}

function addSnow(container) {
  addParticles(container, MAX_FLAKES, "bg-flake", () => ({
    x: randomBetween(0, 100).toFixed(1) + "%",
    size: randomBetween(4, 9).toFixed(1) + "px",
    drift: randomBetween(-60, 60).toFixed(0) + "px",
    duration: randomBetween(8, 16).toFixed(1) + "s",
    delay: (-randomBetween(0, 16)).toFixed(1) + "s",
  }));
}

function addStars(container) {
  addParticles(container, MAX_STARS, "bg-star", () => ({
    x: randomBetween(0, 100).toFixed(1) + "%",
    y: randomBetween(0, 85).toFixed(1) + "%",
    size: randomBetween(1.5, 3.5).toFixed(1) + "px",
    duration: randomBetween(1.5, 4).toFixed(1) + "s",
    delay: (-randomBetween(0, 4)).toFixed(1) + "s",
  }));
}

function addClouds(container, count) {
  addParticles(container, count, "bg-cloud", () => ({
    x: randomBetween(-5, 70).toFixed(0) + "%",
    y: randomBetween(8, 60).toFixed(0) + "%",
    scale: randomBetween(0.8, 1.6).toFixed(2),
    opacity: randomBetween(0.6, 1).toFixed(2),
    duration: randomBetween(40, 70).toFixed(0) + "s",
    delay: (-randomBetween(0, 40)).toFixed(0) + "s",
  }));
}

function addHaze(container) {
  addParticles(container, 4, "bg-haze", () => ({
    y: randomBetween(5, 75).toFixed(0) + "%",
    duration: randomBetween(20, 35).toFixed(0) + "s",
    delay: (-randomBetween(0, 20)).toFixed(0) + "s",
  }));
}

function addLightning(container) {
  addParticles(container, 1, "bg-lightning", () => ({
    delay: (-randomBetween(0, 9)).toFixed(1) + "s",
  }));
}

// Fill the container with the things this scene needs
function buildScene(container, sceneName, isDay) {
  if (sceneName === "clear") {
    if (isDay) {
      container.appendChild(createParticle("bg-sun", {}));
    } else {
      addStars(container);
      container.appendChild(createParticle("bg-moon", {}));
    }
  } else if (sceneName === "cloudy") {
    addClouds(container, 6);
  } else if (sceneName === "fog") {
    addClouds(container, 2);
    addHaze(container);
  } else if (sceneName === "rain") {
    addClouds(container, 3);
    addRain(container);
  } else if (sceneName === "snow") {
    addSnow(container);
  } else if (sceneName === "storm") {
    addClouds(container, 3);
    addRain(container);
    addLightning(container);
  }
}

function setWeatherBackground(weatherCode, isDay) {
  const sceneName = getSceneName(Number(weatherCode));
  if (sceneName === "") {
    clearWeatherBackground(); // unknown code: neutral look
    return;
  }

  const dayOrNight = isDay ? "day" : "night";
  const sceneKey = sceneName + "-" + dayOrNight;
  if (sceneKey === currentSceneKey) return; // same scene: keep the animation running

  const container = getBackgroundElement();
  container.replaceChildren();
  container.className = "weather-bg weather-bg--" + sceneName + " weather-bg--" + dayOrNight;
  buildScene(container, sceneName, Boolean(isDay));
  currentSceneKey = sceneKey;
}

function clearWeatherBackground() {
  if (!backgroundElement) return; // nothing was ever shown
  backgroundElement.replaceChildren();
  backgroundElement.className = "weather-bg";
  currentSceneKey = "";
}
