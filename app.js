// Weather app, step 3: current weather, next 24 hours and 7-day forecast.

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const searchButton = searchForm.querySelector("button");
const statusElement = document.getElementById("status");
const cityChoicesSection = document.getElementById("city-choices");
const todaySection = document.getElementById("today");
const assistantSection = document.getElementById("assistant");
const hourlySection = document.getElementById("hourly");
const dailySection = document.getElementById("daily");
const chartSection = document.getElementById("chart");
const sunSection = document.getElementById("sun");
const airSection = document.getElementById("air");
const locateButton = document.getElementById("locate-button");
const favouritesSection = document.getElementById("favourites");

const headerDate = document.getElementById("header-date");

// Write a date like "понедельник, 26 октября" under the title.
// dateText is the city's local date ("2026-10-26..."); without it we use the browser date.
function showHeaderDate(dateText) {
  let date = new Date();
  if (typeof dateText === "string") {
    // The time part makes the date local, not UTC
    const cityDate = new Date(`${dateText.slice(0, 10)}T00:00`);
    if (!Number.isNaN(cityDate.getTime())) {
      date = cityDate;
    }
  }
  headerDate.textContent = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
showHeaderDate(null);

// Favourite cities live here while the page is open (storage.js saves them)
let favourites = loadFavourites();
// True while something loads: then all buttons must stay disabled
let isBusy = false;

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

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

// Weather models we ask. They often disagree, so we show all of them.
const MODELS = [
  { id: "ecmwf_ifs025", label: "Европа (ECMWF)" },
  { id: "icon_seamless", label: "Германия (ICON)" },
  { id: "gfs_seamless", label: "США (GFS)" },
];

// Get the current weather of ONE model.
// Why one request per model: with several models in one request, the API
// gives "current" only for the first model (only "hourly" has all of them).
async function fetchModelCurrent(place, modelId) {
  // The real height of the city lets Open-Meteo correct the temperature
  const elevationPart = place.elevation === null ? "" : `&elevation=${place.elevation}`;
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,apparent_temperature,weather_code," +
    "wind_speed_10m,relative_humidity_2m,is_day" +
    `&models=${modelId}&timezone=auto&wind_speed_unit=ms` +
    elevationPart;
  const data = await fetchJson(url);

  if (!data || !data.current || typeof data.current !== "object") {
    throw new Error("Сервис погоды вернул неполные данные. Попробуйте позже.");
  }
  return data.current;
}

// Average of the numbers in a list. Returns null for an empty list.
function averageOf(numbers) {
  if (numbers.length === 0) {
    return null;
  }
  const sum = numbers.reduce((total, number) => total + number, 0);
  return sum / numbers.length;
}

// Take the field from the first model that has a real number for it.
// Returns null if no model has it.
function firstNumber(currents, field) {
  for (const current of currents) {
    if (isNumber(current[field])) {
      return current[field];
    }
  }
  return null;
}

// Get the current weather for a place from all models and combine it.
async function fetchForecast(place) {
  // allSettled waits for all requests; one failed model does not stop the rest
  const settled = await Promise.allSettled(
    MODELS.map((model) => fetchModelCurrent(place, model.id))
  );

  // Keep MODELS order, so "first model" rules are always the same
  const answers = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      answers.push({ model: MODELS[index], current: result.value });
    }
  });
  if (answers.length === 0) {
    // Every model failed: show the reason of the first one
    throw settled[0].reason;
  }

  // Only models with a real temperature go into the average
  const modelTemps = answers
    .filter((answer) => isNumber(answer.current.temperature_2m))
    .map((answer) => ({ label: answer.model.label, value: answer.current.temperature_2m }));
  const currents = answers.map((answer) => answer.current);

  const combined = {
    temperature: averageOf(modelTemps.map((item) => item.value)),
    apparentTemperature: averageOf(
      currents.map((c) => c.apparent_temperature).filter(isNumber)
    ),
    modelTemps: modelTemps,
    weatherCode: firstNumber(currents, "weather_code"),
    windSpeed: firstNumber(currents, "wind_speed_10m"),
    humidity: firstNumber(currents, "relative_humidity_2m"),
    isDay: firstNumber(currents, "is_day"),
    time: null,
  };
  const withTime = currents.find((c) => typeof c.time === "string");
  if (withTime) {
    combined.time = withTime.time;
  }

  if (
    combined.temperature === null ||
    combined.apparentTemperature === null ||
    combined.weatherCode === null ||
    combined.windSpeed === null ||
    combined.humidity === null ||
    combined.isDay === null
  ) {
    throw new Error("Сервис погоды вернул неполные данные. Попробуйте позже.");
  }
  return combined;
}

// Make a <div> with a class and text. textContent is safe: it never runs HTML.
function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// The block under the description: average info, chips per model, spread
function createModelsBlock(modelTemps) {
  const block = document.createElement("div");
  block.className = "models";

  const count = modelTemps.length;
  const countText = count === 1 ? "по 1 модели" : `по ${count} моделям`;
  block.append(createElement("div", "card-details", `Среднее ${countText}`));

  const chips = document.createElement("div");
  chips.className = "model-chips";
  for (const item of modelTemps) {
    chips.append(createElement("span", "model-chip", `${item.label} ${formatTemp(item.value)}`));
  }
  block.append(chips);

  // A spread needs at least two models to compare
  if (count >= 2) {
    const values = modelTemps.map((item) => item.value);
    // A difference, so formatDelta (x1.8 only), not formatTemp (x1.8 + 32)
    const spread = formatDelta(Math.max(...values) - Math.min(...values));
    block.append(createElement("div", "card-details", `Разброс: ${spread}`));
  }
  return block;
}

// The stencil digit font draws "°" like a small zero,
// so the degree sign gets its own span with a normal font.
function createTemperature(value) {
  const temperature = createElement("div", "card-temp", String(roundTemp(toDisplayTemp(value))));
  temperature.append(createElement("span", "card-deg", "°"));
  return temperature;
}

function renderToday(place, current) {
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  const title = place.country ? `${place.name}, ${place.country}` : place.name;
  const wind = Math.round(current.windSpeed * 10) / 10;

  const card = document.createElement("div");
  card.className = "card";

  const icon = createElement("div", "card-icon", info.icon);
  icon.setAttribute("aria-hidden", "true"); // the text below says the same

  card.append(
    createFavouriteToggle(place),
    createShareButton(),
    createElement("h2", "card-city", title),
    icon,
    createTemperature(current.temperature),
    createElement("div", "card-text", info.text),
    createModelsBlock(current.modelTemps),
    createElement(
      "div",
      "card-details",
      `Ощущается как ${formatTemp(current.apparentTemperature)} · ` +
        `Ветер ${wind} м/с · Влажность ${Math.round(current.humidity)}%`
    )
  );

  // "time" looks like "2026-10-26T15:45". It is local time of the city.
  // Skip the line if the API did not send a proper string.
  if (typeof current.time === "string" && current.time.includes("T")) {
    const clock = current.time.split("T")[1].slice(0, 5);
    card.append(createElement("div", "card-details", `Данные на ${clock} (местное время)`));
  }

  todaySection.replaceChildren(card);
  showHeaderDate(current.time); // the date of the city, not of the phone
  // The slim bar at the top shows the same city, temperature and icon (scroll.js)
  if (typeof updateStickyBar === "function") {
    updateStickyBar(place.name, formatTemp(current.temperature), info.icon);
  }
}

const FORECAST_ERROR_MESSAGE = "Не удалось загрузить прогноз";

// Names for the day list. getDay() gives 0 for Sunday.
const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

// We also ask for yesterday (past_days), to compare today with it.
// So the hourly and daily lists START YESTERDAY: index 0 is not today any more.
const PAST_DAYS = 1;
const HOURS_PER_DAY = 24;

// Get hourly + daily data of ALL models in one request.
// Here the field names have the model in the end, like temperature_2m_icon_seamless.
async function fetchHourlyDaily(place) {
  const elevationPart = place.elevation === null ? "" : `&elevation=${place.elevation}`;
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&hourly=temperature_2m,apparent_temperature,wind_speed_10m," +
    "weather_code,precipitation_probability,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max," +
    "sunrise,sunset" +
    `&models=${MODELS.map((model) => model.id).join(",")}` +
    `&forecast_days=7&past_days=${PAST_DAYS}&wind_speed_unit=ms` +
    `&timezone=auto${elevationPart}`;
  const data = await fetchJson(url);

  if (!data || !data.hourly || !data.daily) {
    throw new Error(FORECAST_ERROR_MESSAGE);
  }
  return data;
}

// Read one value (for example the temperature at hour 5) from all models.
// section is data.hourly or data.daily. A model with a bad array is skipped.
function valuesAt(section, field, index) {
  const values = [];
  for (const model of MODELS) {
    const list = section[`${field}_${model.id}`];
    if (Array.isArray(list) && list.length === section.time.length && isNumber(list[index])) {
      values.push(list[index]);
    }
  }
  return values;
}

// Temperatures: average of the models. Others: the first model that has a number.
function averageAt(section, field, index) {
  return averageOf(valuesAt(section, field, index));
}

function firstAt(section, field, index) {
  const values = valuesAt(section, field, index);
  return values.length > 0 ? values[0] : null;
}

// Turn the API answer into a simple list of the next 24 hours.
function buildHourlyItems(hourly, currentTime) {
  if (!Array.isArray(hourly.time)) {
    return [];
  }
  // Both are local times of the city like "2026-10-26T15:45".
  // Cutting to "2026-10-26T15" lets us compare them as plain text.
  const startHour = typeof currentTime === "string" ? currentTime.slice(0, 13) : "";
  // Without the current time we cannot find "now", so at least skip yesterday
  const firstIndex = startHour === "" ? PAST_DAYS * HOURS_PER_DAY : 0;

  const items = [];
  for (let index = firstIndex; index < hourly.time.length && items.length < 24; index++) {
    const time = hourly.time[index];
    if (typeof time !== "string" || time.slice(0, 13) < startHour) {
      continue;
    }
    const temperature = averageAt(hourly, "temperature_2m", index);
    const weatherCode = firstAt(hourly, "weather_code", index);
    if (temperature === null || weatherCode === null) {
      continue; // skip a broken hour
    }
    items.push({
      clock: time.slice(11, 16),
      temperature: temperature,
      weatherCode: weatherCode,
      isDay: firstAt(hourly, "is_day", index),
      rain: firstAt(hourly, "precipitation_probability", index),
    });
  }
  return items;
}

// Turn the API answer into a simple list of days.
function buildDailyItems(daily) {
  if (!Array.isArray(daily.time)) {
    return [];
  }
  const items = [];
  daily.time.forEach((date, index) => {
    // The first PAST_DAYS days are in the past: the list starts at "Сегодня"
    const dayNumber = index - PAST_DAYS;
    if (dayNumber < 0) {
      return;
    }
    const min = averageAt(daily, "temperature_2m_min", index);
    const max = averageAt(daily, "temperature_2m_max", index);
    const weatherCode = firstAt(daily, "weather_code", index);
    if (typeof date !== "string" || min === null || max === null || weatherCode === null) {
      return; // skip a broken day
    }
    items.push({
      date: date,
      dayNumber: dayNumber, // 0 = today, 1 = tomorrow
      min: min,
      max: max,
      weatherCode: weatherCode,
      rain: firstAt(daily, "precipitation_probability_max", index),
    });
  });
  return items;
}

// "Чт, 29 окт" from "2026-10-29". The time part makes the date local, not UTC.
function formatDayName(item) {
  if (item.dayNumber === 0) {
    return "Сегодня";
  }
  if (item.dayNumber === 1) {
    return "Завтра";
  }
  const day = new Date(`${item.date}T00:00`);
  if (Number.isNaN(day.getTime())) {
    return item.date;
  }
  return `${WEEKDAYS[day.getDay()]}, ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

function createIcon(className, weatherCode, isDay) {
  const icon = createElement("div", className, getWeatherInfo(weatherCode, isDay).icon);
  icon.setAttribute("aria-hidden", "true"); // decoration only
  return icon;
}

// A glass card with a title and some content (used by the hourly and 7-day lists)
function createPanel(title, content) {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.append(createElement("h2", "section-title", title), content);
  return panel;
}

function renderHourly(items) {
  const row = document.createElement("div");
  row.className = "hourly-row";
  items.forEach((item, index) => {
    const card = document.createElement("div");
    // The first card is "now": CSS highlights it
    card.className = index === 0 ? "hour-card is-now" : "hour-card";
    card.append(
      createElement("div", "hour-time", index === 0 ? "Сейчас" : item.clock),
      createIcon("hour-icon", item.weatherCode, item.isDay),
      createElement("div", "hour-temp", formatTemp(item.temperature))
    );
    // Show rain only when there is a chance of it
    if (item.rain !== null && item.rain > 0) {
      card.append(createElement("div", "rain", `💧 ${Math.round(item.rain)}%`));
    }
    row.append(card);
  });
  hourlySection.replaceChildren(createPanel("Ближайшие 24 часа", row));
}

function renderDaily(items) {
  // The bars are scaled to the coldest and the warmest value of the week
  const weekMin = Math.min(...items.map((item) => item.min));
  const weekMax = Math.max(...items.map((item) => item.max));
  const span = Math.max(weekMax - weekMin, 1); // never divide by zero

  const list = document.createElement("div");
  list.className = "daily-list";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "day-row";

    const bar = document.createElement("div");
    bar.className = "range-bar";
    const fill = document.createElement("div");
    fill.className = "range-fill";
    fill.style.left = `${((item.min - weekMin) / span) * 100}%`;
    const fillWidth = ((item.max - item.min) / span) * 100;
    fill.style.width = `${fillWidth}%`;
    // The colors belong to the whole week bar: stretch the gradient to the week
    // size and shift it, so this day shows its own slice (cool left, warm right)
    if (fillWidth > 0 && fillWidth < 100) {
      const fillLeft = ((item.min - weekMin) / span) * 100;
      fill.style.backgroundSize = `${10000 / fillWidth}% 100%`;
      fill.style.backgroundPosition = `${(fillLeft / (100 - fillWidth)) * 100}% 0`;
    }
    bar.append(fill);

    const rainText = item.rain !== null && item.rain > 0 ? `💧 ${Math.round(item.rain)}%` : "";

    row.append(
      createElement("div", "day-name", formatDayName(item)),
      createIcon("day-icon", item.weatherCode, 1),
      createElement("div", "rain day-rain", rainText),
      createElement("div", "day-temps", `${formatTemp(item.min)} / ${formatTemp(item.max)}`),
      bar
    );
    list.append(row);
  }
  dailySection.replaceChildren(createPanel("Прогноз на 7 дней", list));
}

// ---------- Chart, sun and air panels (the drawing is in charts.js) ----------

// Is this a text like "2026-10-26T07:28"?
function isLocalTimeText(text) {
  return typeof text === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text);
}

// Like firstAt, but for texts (sunrise and sunset are texts, not numbers)
function firstTextAt(section, field, index) {
  for (const model of MODELS) {
    const list = section[`${field}_${model.id}`];
    if (Array.isArray(list) && isLocalTimeText(list[index])) {
      return list[index];
    }
  }
  return null;
}

// Sunrise and sunset of TODAY. The list starts yesterday, so we look for today's
// date instead of using a fixed index. Returns null when something is missing
// (near the poles the sun may not rise or set at all).
function readSunTimes(daily, currentTime) {
  if (!Array.isArray(daily.time) || !isLocalTimeText(currentTime)) {
    return null;
  }
  const todayIndex = daily.time.indexOf(currentTime.slice(0, 10));
  if (todayIndex === -1) {
    return null;
  }
  const sunrise = firstTextAt(daily, "sunrise", todayIndex);
  const sunset = firstTextAt(daily, "sunset", todayIndex);
  if (sunrise === null || sunset === null) {
    return null;
  }
  // Tomorrow's sunrise is needed for "до восхода" after sunset
  return { sunrise, sunset, nextSunrise: firstTextAt(daily, "sunrise", todayIndex + 1) };
}

function renderChart(items) {
  chartSection.replaceChildren();
  const chart = buildTemperatureChart(items, getUnits());
  if (chart) {
    chartSection.append(createPanel("Температура на 24 часа", chart));
  }
}

function renderSun(daily, currentTime) {
  sunSection.replaceChildren();
  const content = buildSunContent(readSunTimes(daily, currentTime), currentTime);
  if (content) {
    sunSection.append(createPanel("Солнце", content));
  }
}

// Air quality has its own server. If it fails we simply show no air panel.
async function fetchAirQuality(place) {
  const url =
    `${AIR_QUALITY_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=european_aqi,pm2_5,pm10&timezone=auto";
  const data = await fetchJson(url);

  const current = data && data.current;
  if (!current || !isNumber(current.european_aqi)) {
    throw new Error("Нет данных о воздухе");
  }
  return {
    aqi: current.european_aqi,
    pm25: isNumber(current.pm2_5) ? current.pm2_5 : null,
    pm10: isNumber(current.pm10) ? current.pm10 : null,
  };
}

function renderAir(air) {
  airSection.replaceChildren();
  const content = buildAirContent(air);
  if (content) {
    airSection.append(createPanel("Воздух", content));
  }
}

// Small friendly message inside the forecast sections
function renderForecastError() {
  hourlySection.replaceChildren(createElement("p", "forecast-error", FORECAST_ERROR_MESSAGE));
  dailySection.replaceChildren();
}

// Returns true when the forecast was shown, false when it had to show an error
function renderForecast(data, currentTime) {
  const hourlyItems = buildHourlyItems(data.hourly, currentTime);
  const dailyItems = buildDailyItems(data.daily);
  if (hourlyItems.length === 0 || dailyItems.length === 0) {
    renderForecastError();
    return false;
  }
  renderHourly(hourlyItems);
  renderChart(hourlyItems); // same 24 hours as the cards: no new request
  renderSun(data.daily, currentTime);
  renderDaily(dailyItems);
  return true;
}

// ---------- Assistant panel (the advice itself is made in insights.js) ----------

// ALL hours of the answer (yesterday too), as simple objects for insights.js.
// Temperatures and wind: average of the models, like the rest of the app
// (one model with a strange value then matters less). Rain, code, day: first model.
function buildHourSeries(hourly) {
  if (!Array.isArray(hourly.time)) {
    return [];
  }
  const hours = [];
  hourly.time.forEach((time, index) => {
    const temperature = averageAt(hourly, "temperature_2m", index);
    if (typeof time !== "string" || temperature === null) {
      return; // skip a broken hour
    }
    hours.push({
      time: time,
      temperature: temperature,
      apparent: averageAt(hourly, "apparent_temperature", index),
      wind: averageAt(hourly, "wind_speed_10m", index),
      rain: firstAt(hourly, "precipitation_probability", index),
      weatherCode: firstAt(hourly, "weather_code", index),
      isDay: firstAt(hourly, "is_day", index),
    });
  });
  return hours;
}

// Speech works only in browsers that have it. We check it before we use it.
function canSpeak() {
  return "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

function stopSpeaking() {
  if (canSpeak()) {
    window.speechSynthesis.cancel();
  }
}

// One button: first press reads the text, second press stops it
function createSpeakButton(speechText) {
  const button = createElement("button", "speak-button", "🔊 Прочитать вслух");
  button.type = "button";
  button.dataset.speech = speechText; // handy to see what will be said

  const resetButton = () => {
    button.textContent = "🔊 Прочитать вслух";
  };

  button.addEventListener("click", () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel(); // second press = stop
      resetButton();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "ru-RU";
    utterance.onend = resetButton;
    utterance.onerror = resetButton;
    window.speechSynthesis.speak(utterance);
    button.textContent = "⏹ Остановить";
  });
  return button;
}

// air may be null (air request failed): then the assistant just skips the air row
function renderAssistant(place, current, data, air) {
  assistantSection.replaceChildren(); // start clean: no forecast = no assistant
  const rows = buildInsights(buildHourSeries(data.hourly), current.time, air ? air.aqi : null, getUnits());
  if (rows.length === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "assistant-list";
  for (const row of rows) {
    const rowElement = document.createElement("div");
    rowElement.className = "assistant-row";
    const icon = createElement("span", "assistant-icon", row.icon);
    icon.setAttribute("aria-hidden", "true"); // the text says the same
    rowElement.append(icon, createElement("span", "assistant-text", row.text));
    list.append(rowElement);
  }

  const panel = document.createElement("div");
  panel.className = "assistant-card";
  panel.append(createElement("h2", "section-title", "Помощник"), list);

  if (canSpeak()) {
    const info = getWeatherInfo(current.weatherCode, current.isDay);
    const speechText = buildSpeechText(place.name, current.temperature, info.text, rows, getUnits());
    panel.append(createSpeakButton(speechText));
  }
  assistantSection.append(panel);
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

// The last answers from the internet, all in Celsius (null = nothing on the screen).
// { place, current, forecast (or null), air (or null) }
let lastLoaded = null;

// Draw all weather panels from saved answers. No network here, so it is safe
// to call again when the unit changes.
function renderWeather(loaded) {
  stopSpeaking(); // the old speech text has the old unit
  renderToday(loaded.place, loaded.current);
  renderAir(loaded.air);
  if (loaded.forecast) {
    const forecastShown = renderForecast(loaded.forecast, loaded.current.time);
    if (forecastShown) {
      renderAssistant(loaded.place, loaded.current, loaded.forecast, loaded.air);
    }
  } else {
    renderForecastError(); // the current card is still useful, so keep it
  }
  if (typeof refreshScrollEffects === "function") {
    refreshScrollEffects(); // new panels fade in when they enter the screen
  }
}

// Load and show the weather for one chosen place.
async function loadWeather(place) {
  // Loading state
  setStatus("Загружаю погоду…");
  setBusy(true);
  clearResults(); // the choice is made, so the city list is hidden too
  todaySection.classList.add("is-loading"); // pulsing placeholder (CSS)

  try {
    // All requests run at the same time; allSettled lets one fail alone
    const [currentResult, forecastResult, airResult] = await Promise.allSettled([
      fetchForecast(place),
      fetchHourlyDaily(place),
      fetchAirQuality(place),
    ]);
    if (currentResult.status === "rejected") {
      throw currentResult.reason; // no current weather: this is a real error
    }

    // Success state
    // A failed air request is not an error for the user: the panel just stays away
    const air = airResult.status === "fulfilled" ? airResult.value : null;
    const forecast = forecastResult.status === "fulfilled" ? forecastResult.value : null;
    // Keep the answers (all in Celsius): the unit switch draws them again without a request
    lastLoaded = { place: place, current: currentResult.value, forecast: forecast, air: air };
    renderWeather(lastLoaded);
    saveLastPlace(place); // only a place that really loaded is worth remembering
    showBackground(currentResult.value);
    // The radar lives in radar.js and never throws; no await, the map loads on its own
    if (typeof showRadar === "function") {
      showRadar(place.latitude, place.longitude, place.name);
    }
    setStatus("");
  } catch (error) {
    // Error state
    setStatus(error.message);
    hideBackground();
    if (typeof hideStickyBar === "function") hideStickyBar();
  } finally {
    // Runs after success and after error, so the buttons never stay locked
    todaySection.classList.remove("is-loading");
    setBusy(false);
  }
}

// The live background lives in background.js. If that file failed to load,
// the app still works, just without the animation.
function showBackground(current) {
  if (typeof setWeatherBackground === "function") {
    setWeatherBackground(current.weatherCode, current.isDay === 1);
  }
}

function hideBackground() {
  if (typeof clearWeatherBackground === "function") {
    clearWeatherBackground();
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
  setBusy(true);
  // Remove old results so they do not look like the answer to this search
  clearResults();

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
    hideBackground();
  } finally {
    // Runs after success and after error, so the buttons never stay locked
    setBusy(false);
  }
}

// ---------- Busy state and clearing ----------

// Lock or unlock every button that starts a new load
function setBusy(busy) {
  isBusy = busy;
  searchButton.disabled = busy;
  locateButton.disabled = busy;
  for (const button of favouritesSection.querySelectorAll("button")) {
    button.disabled = busy;
  }
}

// Remove the old answer before a new one is loaded
function clearResults() {
  updateCardStar = null; // the card is going away
  lastLoaded = null; // nothing to redraw when the unit changes
  cityChoicesSection.replaceChildren();
  stopSpeaking();
  todaySection.replaceChildren();
  showHeaderDate(null); // no city on the screen: back to the phone's date
  assistantSection.replaceChildren();
  hourlySection.replaceChildren();
  chartSection.replaceChildren();
  sunSection.replaceChildren();
  airSection.replaceChildren();
  dailySection.replaceChildren();
  if (typeof hideRadar === "function") hideRadar();
}

// ---------- Share ----------

// The button on the weather card. The text is made when it is pressed,
// so it always uses the unit that is chosen at that moment.
function createShareButton() {
  const button = createElement("button", "share-button", "↗");
  button.type = "button";
  button.setAttribute("aria-label", "Поделиться погодой");
  button.addEventListener("click", handleShare);
  return button;
}

function handleShare() {
  if (lastLoaded === null) {
    return;
  }
  const { place, current, forecast, air } = lastLoaded;
  const units = getUnits();
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  // The clothes advice is optional: without a forecast the text is just shorter
  const rows = forecast
    ? buildInsights(buildHourSeries(forecast.hourly), current.time, air ? air.aqi : null, units)
    : [];
  const text = buildShareText(
    place.name,
    current.temperature,
    current.apparentTemperature,
    info.text,
    rows,
    units
  );
  shareWeather(`Погода: ${place.name}`, text, buildShareUrl(place));
}

// ---------- Unit switch (°C / °F) ----------

const unitButtons = document.querySelectorAll(".unit-button");

// Mark the chosen button. aria-pressed tells screen readers which one is on.
function showUnitButtons() {
  for (const button of unitButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.unit === currentUnit));
  }
}

function handleUnitClick(event) {
  if (!setUnit(event.currentTarget.dataset.unit)) {
    return;
  }
  showUnitButtons();
  // Draw the same answers again in the new unit: no new request
  if (lastLoaded !== null) {
    renderWeather(lastLoaded);
  }
}

// ---------- Favourites ----------

function isFavourite(place) {
  return favourites.some((saved) => isSamePlace(saved, place));
}

function toggleFavourite(place) {
  if (isFavourite(place)) {
    favourites = favourites.filter((saved) => !isSamePlace(saved, place));
  } else {
    // Newest first; slice drops the oldest when there are more than the maximum
    favourites = [place, ...favourites].slice(0, MAX_FAVOURITES);
  }
  saveFavourites(favourites);
  renderFavourites();
  if (updateCardStar !== null) {
    updateCardStar();
  }
}

// Redraws the star of the card that is on the screen (null = no card)
let updateCardStar = null;

// The star on the weather card. aria-pressed tells screen readers if it is on.
function createFavouriteToggle(place) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fav-toggle";

  const update = () => {
    const active = isFavourite(place);
    button.textContent = active ? "★" : "☆";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute(
      "aria-label",
      active ? "Убрать из избранного" : "Добавить в избранное"
    );
  };
  update();
  updateCardStar = update;

  button.addEventListener("click", () => toggleFavourite(place));
  return button;
}

function renderFavourites() {
  const chips = favourites.map((place) => {
    const chip = document.createElement("div");
    chip.className = "fav-chip";

    // Saved places already have coordinates: no geocoding needed
    const openButton = createElement("button", "fav-open", `★ ${place.name}`);
    openButton.type = "button";
    openButton.addEventListener("click", () => loadWeather(place));

    const removeButton = createElement("button", "fav-remove", "×");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Удалить ${place.name} из избранного`);
    removeButton.addEventListener("click", () => removeFavourite(place));

    openButton.disabled = isBusy;
    removeButton.disabled = isBusy;
    chip.append(openButton, removeButton);
    return chip;
  });
  // An empty row is hidden by CSS (:empty)
  favouritesSection.replaceChildren(...chips);
}

function removeFavourite(place) {
  favourites = favourites.filter((saved) => !isSamePlace(saved, place));
  saveFavourites(favourites);
  renderFavourites();
  // If this city is on the card, its star must turn empty again
  if (updateCardStar !== null) {
    updateCardStar();
  }
}

// ---------- "My location" ----------

const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false, // a rough position is enough and is faster
  timeout: 10000,
  maximumAge: 600000, // a position from the last 10 minutes is fine
};

const UNNAMED_PLACE = "Моё местоположение";
const REVERSE_GEOCODING_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

// getCurrentPosition uses callbacks (old style). A Promise wrapper lets us use await.
function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, GEOLOCATION_OPTIONS);
  });
}

// error.code: 1 = user said no, 2 = no position, 3 = too slow
function describeGeolocationError(error) {
  if (error && error.code === 1) {
    return "Доступ к местоположению запрещён. Разрешите его в настройках браузера или введите город.";
  }
  if (error && error.code === 3) {
    return "Не удалось определить местоположение вовремя. Попробуйте ещё раз или введите город.";
  }
  return "Не удалось определить местоположение. Попробуйте ещё раз или введите город.";
}

// Open-Meteo cannot turn coordinates into a name, so we ask another free service.
// This never throws: without a name we still show the weather.
async function lookupPlaceName(latitude, longitude) {
  const fallback = { name: UNNAMED_PLACE, country: "" };
  try {
    const url =
      `${REVERSE_GEOCODING_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=ru`;
    const data = await fetchJson(url);
    if (!data || typeof data !== "object") {
      return fallback;
    }
    // Take the first name that is a non-empty string
    const names = [data.city, data.locality, data.principalSubdivision];
    const name = names.find((value) => typeof value === "string" && value.trim() !== "");
    if (!name) {
      return fallback;
    }
    return {
      name: name,
      country: typeof data.countryName === "string" ? data.countryName : "",
    };
  } catch (error) {
    return fallback;
  }
}

async function handleLocate() {
  setStatus("Определяю ваше местоположение…");
  setBusy(true);
  clearResults();

  let place;
  try {
    const position = await getPosition();
    const latitude = position && position.coords ? position.coords.latitude : null;
    const longitude = position && position.coords ? position.coords.longitude : null;
    if (!isNumber(latitude) || !isNumber(longitude)) {
      throw new Error("bad position");
    }
    // 3 decimals is about 100 m: enough for weather, and we do not store more
    const roundedLatitude = Math.round(latitude * 1000) / 1000;
    const roundedLongitude = Math.round(longitude * 1000) / 1000;
    const found = await lookupPlaceName(roundedLatitude, roundedLongitude);
    place = {
      name: found.name,
      country: found.country,
      region: "",
      latitude: roundedLatitude,
      longitude: roundedLongitude,
      elevation: null, // unknown: Open-Meteo uses its own terrain data
    };
  } catch (error) {
    // Error state
    setStatus(describeGeolocationError(error));
    hideBackground();
    setBusy(false);
    return;
  }
  await loadWeather(place); // it unlocks the buttons itself
}

// ---------- Start ----------

searchForm.addEventListener("submit", handleSearch);

if ("geolocation" in navigator) {
  locateButton.addEventListener("click", handleLocate);
} else {
  locateButton.hidden = true; // this browser cannot do it
}

for (const button of unitButtons) {
  button.addEventListener("click", handleUnitClick);
}
showUnitButtons();

renderFavourites();

// Open the last city again. We do NOT ask for the location here:
// a permission popup right at the start would surprise the user.
// A shared link (?lat=..&lon=..&name=..) has priority over the last city.
const sharedPlace = readPlaceFromUrl();
cleanShareParamsFromUrl();
const lastPlace = loadLastPlace();
if (sharedPlace !== null) {
  loadWeather(sharedPlace);
} else if (lastPlace !== null) {
  loadWeather(lastPlace);
}

