// Temperature units: °C or °F.
// IDEA: the whole app keeps temperatures in Celsius (that is what the API gives).
// We convert ONLY at the moment we show a number. So there is one place to look
// at (this file), and switching units never needs a new request.
// Loaded before the other scripts.

const UNIT_KEY = "weather.unit";

// Saved data can be edited by anyone: only "C" and "F" are accepted
function loadUnit() {
  try {
    const saved = localStorage.getItem(UNIT_KEY);
    return saved === "F" ? "F" : "C";
  } catch (error) {
    return "C"; // storage blocked: use the default
  }
}

let currentUnit = loadUnit();

// Returns true when the unit was changed
function setUnit(unit) {
  if (unit !== "C" && unit !== "F") {
    return false;
  }
  currentUnit = unit;
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch (error) {
    // private mode: the choice just lives until the page is closed
  }
  return true;
}

// A temperature POINT (like 20 °C is 68 °F): multiply by 1.8 and add 32
function toDisplayTemp(celsius) {
  return currentUnit === "F" ? celsius * 1.8 + 32 : celsius;
}

// A DIFFERENCE between two temperatures (like "5 degrees warmer"):
// only multiply by 1.8. No +32, because the shift cancels out.
function toDisplayDelta(celsiusDifference) {
  return currentUnit === "F" ? celsiusDifference * 1.8 : celsiusDifference;
}

// Round, and turn -0 into 0 (otherwise we would show "-0°")
function roundTemp(value) {
  return Math.round(value) + 0;
}

// 17.4 -> "17°" in Celsius, "63°" in Fahrenheit
function formatTemp(celsius) {
  return `${roundTemp(toDisplayTemp(celsius))}°`;
}

// For differences: 5 -> "5°" or "9°"
function formatDelta(celsiusDifference) {
  return `${roundTemp(toDisplayDelta(celsiusDifference))}°`;
}

// The pure files (insights.js, charts.js) do not read globals. They get this
// small object from app.js instead.
function getUnits() {
  return { code: currentUnit, temp: toDisplayTemp, delta: toDisplayDelta };
}
