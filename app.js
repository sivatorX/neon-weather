// Weather app, step 3: current weather, next 24 hours and 7-day forecast.

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const searchButton = searchForm.querySelector("button");
const statusElement = document.getElementById("status");
const cityChoicesSection = document.getElementById("city-choices");
const todaySection = document.getElementById("today");
const hourlySection = document.getElementById("hourly");
const dailySection = document.getElementById("daily");

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
    chips.append(createElement("span", "model-chip", `${item.label} ${Math.round(item.value)}°`));
  }
  block.append(chips);

  // A spread needs at least two models to compare
  if (count >= 2) {
    const values = modelTemps.map((item) => item.value);
    const spread = Math.round(Math.max(...values) - Math.min(...values));
    block.append(createElement("div", "card-details", `Разброс: ${spread}°`));
  }
  return block;
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
    createElement("h2", "card-city", title),
    icon,
    createElement("div", "card-temp", `${Math.round(current.temperature)}°`),
    createElement("div", "card-text", info.text),
    createModelsBlock(current.modelTemps),
    createElement(
      "div",
      "card-details",
      `Ощущается как ${Math.round(current.apparentTemperature)}° · ` +
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
}

const FORECAST_ERROR_MESSAGE = "Не удалось загрузить прогноз";

// Names for the day list. getDay() gives 0 for Sunday.
const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

// Get hourly + daily data of ALL models in one request.
// Here the field names have the model in the end, like temperature_2m_icon_seamless.
async function fetchHourlyDaily(place) {
  const elevationPart = place.elevation === null ? "" : `&elevation=${place.elevation}`;
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&hourly=temperature_2m,weather_code,precipitation_probability,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    `&models=${MODELS.map((model) => model.id).join(",")}` +
    `&forecast_days=7&timezone=auto${elevationPart}`;
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

  const items = [];
  for (let index = 0; index < hourly.time.length && items.length < 24; index++) {
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
    const min = averageAt(daily, "temperature_2m_min", index);
    const max = averageAt(daily, "temperature_2m_max", index);
    const weatherCode = firstAt(daily, "weather_code", index);
    if (typeof date !== "string" || min === null || max === null || weatherCode === null) {
      return; // skip a broken day
    }
    items.push({
      date: date,
      dayNumber: index, // 0 = today, 1 = tomorrow
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

function renderHourly(items) {
  const row = document.createElement("div");
  row.className = "hourly-row";
  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "hour-card";
    card.append(
      createElement("div", "hour-time", index === 0 ? "Сейчас" : item.clock),
      createIcon("hour-icon", item.weatherCode, item.isDay),
      createElement("div", "hour-temp", `${Math.round(item.temperature)}°`)
    );
    // Show rain only when there is a chance of it
    if (item.rain !== null && item.rain > 0) {
      card.append(createElement("div", "rain", `💧 ${Math.round(item.rain)}%`));
    }
    row.append(card);
  });
  hourlySection.replaceChildren(createElement("h2", "section-title", "Ближайшие 24 часа"), row);
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
    fill.style.width = `${((item.max - item.min) / span) * 100}%`;
    bar.append(fill);

    const rainText = item.rain !== null && item.rain > 0 ? `💧 ${Math.round(item.rain)}%` : "";

    row.append(
      createElement("div", "day-name", formatDayName(item)),
      createIcon("day-icon", item.weatherCode, 1),
      createElement("div", "rain day-rain", rainText),
      createElement("div", "day-temps", `${Math.round(item.min)}° / ${Math.round(item.max)}°`),
      bar
    );
    list.append(row);
  }
  dailySection.replaceChildren(createElement("h2", "section-title", "Прогноз на 7 дней"), list);
}

// Small friendly message inside the forecast sections
function renderForecastError() {
  hourlySection.replaceChildren(createElement("p", "forecast-error", FORECAST_ERROR_MESSAGE));
  dailySection.replaceChildren();
}

function renderForecast(data, currentTime) {
  const hourlyItems = buildHourlyItems(data.hourly, currentTime);
  const dailyItems = buildDailyItems(data.daily);
  if (hourlyItems.length === 0 || dailyItems.length === 0) {
    renderForecastError();
    return;
  }
  renderHourly(hourlyItems);
  renderDaily(dailyItems);
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
  hourlySection.replaceChildren();
  dailySection.replaceChildren();

  try {
    // Both requests run at the same time; allSettled lets one fail alone
    const [currentResult, forecastResult] = await Promise.allSettled([
      fetchForecast(place),
      fetchHourlyDaily(place),
    ]);
    if (currentResult.status === "rejected") {
      throw currentResult.reason; // no current weather: this is a real error
    }

    // Success state
    renderToday(place, currentResult.value);
    if (forecastResult.status === "fulfilled") {
      renderForecast(forecastResult.value, currentResult.value.time);
    } else {
      renderForecastError(); // the current card is still useful, so keep it
    }
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
  hourlySection.replaceChildren();
  dailySection.replaceChildren();

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
