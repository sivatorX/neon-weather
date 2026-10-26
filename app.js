// Weather app, step 2: search a city and show the current weather.

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const searchButton = searchForm.querySelector("button");
const statusElement = document.getElementById("status");
const cityChoicesSection = document.getElementById("city-choices");
const todaySection = document.getElementById("today");

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const NETWORK_ERROR_MESSAGE =
  "Нет связи с интернетом. Проверьте подключение и попробуйте ещё раз.";

// WMO weather code -> text and emoji.
// "nightIcon" is used instead of "icon" when it is night (is_day = 0).
const WEATHER_CODES = {
  0: { text: "Ясно", icon: "☀️", nightIcon: "🌙" },
  1: { text: "Преимущественно ясно", icon: "🌤️", nightIcon: "🌙" },
  2: { text: "Переменная облачность", icon: "⛅" },
  3: { text: "Пасмурно", icon: "☁️" },
  45: { text: "Туман", icon: "🌫️" },
  48: { text: "Изморозь", icon: "🌫️" },
  51: { text: "Лёгкая морось", icon: "🌦️" },
  53: { text: "Морось", icon: "🌦️" },
  55: { text: "Сильная морось", icon: "🌧️" },
  56: { text: "Лёгкая ледяная морось", icon: "🌧️" },
  57: { text: "Ледяная морось", icon: "🌧️" },
  61: { text: "Небольшой дождь", icon: "🌦️" },
  63: { text: "Дождь", icon: "🌧️" },
  65: { text: "Сильный дождь", icon: "🌧️" },
  66: { text: "Лёгкий ледяной дождь", icon: "🌧️" },
  67: { text: "Ледяной дождь", icon: "🌧️" },
  71: { text: "Небольшой снег", icon: "🌨️" },
  73: { text: "Снег", icon: "❄️" },
  75: { text: "Сильный снег", icon: "❄️" },
  77: { text: "Снежные зёрна", icon: "❄️" },
  80: { text: "Небольшие ливни", icon: "🌦️" },
  81: { text: "Ливни", icon: "🌧️" },
  82: { text: "Сильные ливни", icon: "⛈️" },
  85: { text: "Небольшой снегопад", icon: "🌨️" },
  86: { text: "Сильный снегопад", icon: "🌨️" },
  95: { text: "Гроза", icon: "⛈️" },
  96: { text: "Гроза с небольшим градом", icon: "⛈️" },
  99: { text: "Гроза с сильным градом", icon: "⛈️" },
};

function getWeatherInfo(code, isDay) {
  const info = WEATHER_CODES[code];
  if (!info) {
    return { text: "Неизвестно", icon: "❔" };
  }
  const useNight = isDay === 0 && info.nightIcon;
  return { text: info.text, icon: useNight ? info.nightIcon : info.icon };
}

function setStatus(message) {
  statusElement.textContent = message;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Download JSON from a URL. Throws an Error with a message the user can read.
async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    // fetch only fails like this when the network is down
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  // fetch does not fail on 404/500, so we check response.ok ourselves
  if (!response.ok) {
    throw new Error("Сервис погоды сейчас недоступен. Попробуйте позже.");
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error("Сервис погоды вернул непонятный ответ. Попробуйте позже.");
  }
}

// Find all cities that match the name (up to 5). Bad results are skipped.
async function searchCities(name) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=5&language=ru`;
  const data = await fetchJson(url);

  // When nothing is found, the API has no "results" field at all
  const results = data && Array.isArray(data.results) ? data.results : [];

  const places = [];
  for (const item of results) {
    if (
      !item ||
      typeof item.name !== "string" ||
      !isNumber(item.latitude) ||
      !isNumber(item.longitude)
    ) {
      continue; // skip a broken result, maybe the others are fine
    }
    places.push({
      name: item.name,
      country: typeof item.country === "string" ? item.country : "",
      region: typeof item.admin1 === "string" ? item.admin1 : "",
      latitude: item.latitude,
      longitude: item.longitude,
      // null means "unknown": then we do not send elevation at all
      elevation: isNumber(item.elevation) ? item.elevation : null,
    });
  }

  if (places.length === 0) {
    throw new Error("Город не найден. Проверьте название и попробуйте ещё раз.");
  }
  return places;
}

// Get the current weather for a place.
async function fetchForecast(place) {
  // The real height of the city lets Open-Meteo correct the temperature
  const elevationPart = place.elevation === null ? "" : `&elevation=${place.elevation}`;
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,apparent_temperature,weather_code," +
    "wind_speed_10m,relative_humidity_2m,is_day" +
    "&timezone=auto&wind_speed_unit=ms" +
    elevationPart;
  const data = await fetchJson(url);

  const current = data && data.current;
  if (
    !current ||
    !isNumber(current.temperature_2m) ||
    !isNumber(current.apparent_temperature) ||
    !isNumber(current.weather_code) ||
    !isNumber(current.wind_speed_10m) ||
    !isNumber(current.relative_humidity_2m) ||
    !isNumber(current.is_day)
  ) {
    throw new Error("Сервис погоды вернул неполные данные. Попробуйте позже.");
  }

  return current;
}

// Make a <div> with a class and text. textContent is safe: it never runs HTML.
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderToday(place, current) {
  const info = getWeatherInfo(current.weather_code, current.is_day);
  const title = place.country ? `${place.name}, ${place.country}` : place.name;
  const wind = Math.round(current.wind_speed_10m * 10) / 10;

  const card = document.createElement("div");
  card.className = "card";

  const icon = createElement("div", "card-icon", info.icon);
  icon.setAttribute("aria-hidden", "true"); // the text below says the same

  card.append(
    createElement("h2", "card-city", title),
    icon,
    createElement("div", "card-temp", `${Math.round(current.temperature_2m)}°`),
    createElement("div", "card-text", info.text),
    createElement(
      "div",
      "card-details",
      `Ощущается как ${Math.round(current.apparent_temperature)}° · ` +
        `Ветер ${wind} м/с · Влажность ${Math.round(current.relative_humidity_2m)}%`
    )
  );

  // "time" looks like "2026-10-26T15:45". It is local time of the city.
  // Skip the line if the API did not send a proper string.
  if (typeof current.time === "string" && current.time.includes("T")) {
    const clock = current.time.split("T")[1].slice(0, 5);
    card.append(createElement("div", "card-details", `Данные на ${clock} (местное время)`));
  }

  todaySection.replaceChildren(card);
}

// "Париж — Франция, Иль-де-Франс": only the parts that exist
function describePlace(place) {
  const details = [place.country, place.region].filter((part) => part !== "");
  return details.length > 0 ? `${place.name} — ${details.join(", ")}` : place.name;
}

// Show one button per city, so the user picks the right one
function renderCityChoices(places) {
  const buttons = places.map((place) => {
    const button = createElement("button", "", describePlace(place));
    button.type = "button";
    button.addEventListener("click", () => loadWeather(place));
    return button;
  });
  cityChoicesSection.replaceChildren(...buttons);
}

// Load and show the weather for one chosen place.
async function loadWeather(place) {
  // Loading state
  setStatus("Загружаю погоду…");
  searchButton.disabled = true;
  cityChoicesSection.replaceChildren(); // the choice is made, hide the list
  todaySection.replaceChildren();

  try {
    const current = await fetchForecast(place);
    // Success state
    renderToday(place, current);
    setStatus("");
  } catch (error) {
    // Error state
    setStatus(error.message);
  } finally {
    // Runs after success and after error, so the button never stays locked
    searchButton.disabled = false;
  }
}

async function handleSearch(event) {
  event.preventDefault(); // stop the browser from reloading the page

  const name = cityInput.value.trim();
  if (name === "") {
    setStatus("Введите название города");
    return;
  }

  // Loading state
  setStatus("Ищу город…");
  searchButton.disabled = true;
  // Remove old results so they do not look like the answer to this search
  cityChoicesSection.replaceChildren();
  todaySection.replaceChildren();

  try {
    const places = await searchCities(name);
    if (places.length === 1) {
      await loadWeather(places[0]);
    } else {
      // Do not guess: wait until the user picks the right city
      renderCityChoices(places);
      setStatus("Найдено несколько городов. Выберите нужный:");
    }
  } catch (error) {
    // Error state
    setStatus(error.message);
  } finally {
    // Runs after success and after error, so the button never stays locked
    searchButton.disabled = false;
  }
}

searchForm.addEventListener("submit", handleSearch);
