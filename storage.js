// Saving things in the browser (localStorage): favourite cities and the last city.
// Loaded before app.js. The app must also work when saving is impossible
// (for example in private mode), so every read and write is inside try/catch.

const FAVOURITES_KEY = "weather.favourites";
const LAST_PLACE_KEY = "weather.lastPlace";
const MAX_FAVOURITES = 8;

// A real number (not NaN, not Infinity, not a string like "5")
function isRealNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// The city search sends -9999 when it does not know the height.
// Passing that on makes the forecast absurd (+74° in Tromsø), so only
// real heights on Earth count: Dead Sea shore (-430 m) to Everest (8849 m).
function cleanElevation(value) {
  return isRealNumber(value) && value >= -430 && value <= 8849 ? value : null;
}

// Read and parse JSON. Returns null when nothing is saved or the data is broken.
function readStoredJson(key) {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch (error) {
    return null; // storage blocked or the text is not valid JSON
  }
}

// Returns true if saved, false if the browser did not allow it
function writeStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false; // private mode or the storage is full: the app still works
  }
}

// Saved data can be edited by anyone, so we never trust it.
// Returns a clean place object, or null if the item is not a good place.
function cleanStoredPlace(item) {
  if (
    !item ||
    typeof item !== "object" ||
    typeof item.name !== "string" ||
    item.name.trim() === "" ||
    !isRealNumber(item.latitude) ||
    !isRealNumber(item.longitude) ||
    Math.abs(item.latitude) > 90 ||
    Math.abs(item.longitude) > 180
  ) {
    return null;
  }
  return {
    name: item.name,
    country: typeof item.country === "string" ? item.country : "",
    region: typeof item.region === "string" ? item.region : "",
    latitude: item.latitude,
    longitude: item.longitude,
    elevation: cleanElevation(item.elevation),
  };
}

// Two places are the same if they are within about one kilometre
function isSamePlace(first, second) {
  return (
    first.latitude.toFixed(2) === second.latitude.toFixed(2) &&
    first.longitude.toFixed(2) === second.longitude.toFixed(2)
  );
}

// ---------- Favourites ----------

function loadFavourites() {
  const stored = readStoredJson(FAVOURITES_KEY);
  if (!Array.isArray(stored)) {
    return [];
  }
  const favourites = [];
  for (const item of stored) {
    const place = cleanStoredPlace(item);
    const isDuplicate = place !== null && favourites.some((saved) => isSamePlace(saved, place));
    if (place !== null && !isDuplicate) {
      favourites.push(place);
    }
  }
  return favourites.slice(0, MAX_FAVOURITES);
}

function saveFavourites(favourites) {
  writeStoredJson(FAVOURITES_KEY, favourites);
}

// ---------- Last city ----------

function loadLastPlace() {
  return cleanStoredPlace(readStoredJson(LAST_PLACE_KEY));
}

function saveLastPlace(place) {
  writeStoredJson(LAST_PLACE_KEY, place);
}
