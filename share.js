// Sharing: a link that opens a city, and the "Поделиться" button logic.
// Loaded before app.js. It does not know how the weather is drawn.

const MAX_SHARED_NAME_LENGTH = 80;

// ---------- Link: build it and read it back ----------

// The page address without "?..." and "#...", so old parameters never pile up
function getBaseUrl() {
  return window.location.href.split(/[?#]/)[0];
}

// "https://site/?lat=42.87&lon=74.59&name=Бишкек&country=Кыргызстан"
// encodeURIComponent makes spaces and non-Latin letters safe inside a link.
function buildShareUrl(place) {
  const lat = Math.round(place.latitude * 100) / 100; // 2 decimals = about 1 km: enough for a city
  const lon = Math.round(place.longitude * 100) / 100;
  let url = `${getBaseUrl()}?lat=${lat}&lon=${lon}&name=${encodeURIComponent(place.name)}`;
  if (place.country !== "") {
    url += `&country=${encodeURIComponent(place.country)}`;
  }
  return url;
}

// A plain decimal number like "42.87" or "-7". Number("") is 0 and Number("0x10") is 16,
// so we check the text with a pattern first.
function parseCoordinate(text, limit) {
  if (typeof text !== "string" || !/^-?\d{1,3}(\.\d+)?$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

// A link can be written by anyone, so this is untrusted input.
// Returns a clean place, or null when the link has no good city in it.
function readPlaceFromUrl() {
  const params = new URLSearchParams(window.location.search); // decodes %D0%91... for us
  const latitude = parseCoordinate(params.get("lat"), 90);
  const longitude = parseCoordinate(params.get("lon"), 180);
  const name = (params.get("name") || "").trim();
  const country = (params.get("country") || "").trim();
  if (latitude === null || longitude === null || name === "" || name.length > MAX_SHARED_NAME_LENGTH) {
    return null;
  }
  return {
    name: name,
    country: country.length <= MAX_SHARED_NAME_LENGTH ? country : "",
    region: "",
    latitude: latitude,
    longitude: longitude,
    elevation: null, // not in the link: Open-Meteo uses its own terrain data
  };
}

// Remove our parameters from the address bar.
// Why: if they stay, a reload (or a later "last city" visit) would jump back to the
// shared city even after the user searched for another one. The city is still saved
// as the "last city", so a reload shows the same place anyway.
function cleanShareParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!["lat", "lon", "name", "country"].some((key) => params.has(key))) {
    return;
  }
  try {
    window.history.replaceState(null, "", getBaseUrl()); // replaceState changes the address without a reload
  } catch (error) {
    // some browsers forbid it for local files: the app still works
  }
}

// ---------- Toast: a small message that disappears ----------

let toastTimer = null;

// message is shown with textContent. selectable = the user may copy it by hand.
function showToast(message, selectable) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }
  clearTimeout(toastTimer);
  const text = document.createElement("span");
  text.textContent = message;
  toast.replaceChildren(text);
  toast.classList.toggle("is-selectable", Boolean(selectable));
  toast.classList.add("is-shown");
  if (selectable) {
    // Pre-select the text: one long press and "copy" is enough
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // A link needs more time to be copied than "Скопировано!" needs to be read
  toastTimer = setTimeout(() => toast.classList.remove("is-shown"), selectable ? 10000 : 2000);
}

// ---------- The share action ----------

// Opens the phone share sheet when the browser has one. Otherwise copies the text.
async function shareWeather(title, text, url) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: title, text: text, url: url });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return; // the user closed the sheet: that is not an error
      }
      // another problem: try copying instead
    }
  }
  try {
    // navigator.clipboard is missing on insecure pages, so this may throw too
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showToast("Скопировано!", false);
  } catch (error) {
    showToast(`Скопируйте ссылку: ${url}`, true);
  }
}
