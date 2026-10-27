// The "assistant" logic: what to wear, best time for a walk, comparison with
// yesterday and the text for reading aloud.
// These are PURE functions: they get data in and give data back.
// They never touch the page, so they are easy to test and to read.
//
// An "hour" is a simple object made by app.js:
//   { time: "2026-10-26T15:00", temperature, apparent, wind, rain, weatherCode, isDay }
// Any field except time may be null when the API had no good value.

// Weather codes with snow (WMO)
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

const RAIN_CHANCE_LIMIT = 50; // % of rain from which we say "take an umbrella"
const WALK_RAIN_LIMIT = 30; // % of rain from which a walk hour is "rainy"
const STRONG_WIND = 10; // m/s
const BIG_SWING = 10; // degrees between the warmest and the coldest hour
const WALK_TARGET = 20; // the temperature that is nicest for a walk
const SAME_TEMPERATURE_LIMIT = 1; // less than 1 degree difference = "the same"

function isNumberValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Round, and turn -0 into 0 (otherwise we would show "-0°")
function roundDegrees(value) {
  return Math.round(value) + 0;
}

// The units object comes from app.js (see units.js):
//   { code: "C" or "F", temp(celsius) -> shown number, delta(celsiusDifference) -> shown number }
// All data here stays in Celsius; only the numbers inside texts are converted.
const CELSIUS_UNITS = { code: "C", temp: (value) => value, delta: (value) => value };

// A temperature point as text: "-5°" (or "23°" in Fahrenheit)
function formatDegrees(value, units) {
  return `${roundDegrees(units.temp(value))}°`;
}

// A difference as text. It must use delta, not temp (a difference has no +32).
function formatDifference(value, units) {
  return `${roundDegrees(units.delta(value))}°`;
}

// "2026-10-26" + 1 -> "2026-10-27". We use UTC only to add days: it has no summer time.
function addDays(dateText, days) {
  const milliseconds = Date.parse(`${dateText}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

// Is this a text like "2026-10-26T15:45"?
function isLocalTime(text) {
  return typeof text === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text);
}

function hourNumber(hour) {
  return Number(hour.time.slice(11, 13));
}

// Hours of today from the current hour until the end of the day
function getRestOfToday(hours, currentTime) {
  if (!isLocalTime(currentTime)) {
    return [];
  }
  const today = currentTime.slice(0, 10);
  const nowHour = currentTime.slice(0, 13);
  return hours.filter((hour) => hour.time.slice(0, 10) === today && hour.time.slice(0, 13) >= nowHour);
}

// Smallest and biggest number in a list (null for an empty list)
function minOf(numbers) {
  return numbers.length > 0 ? Math.min(...numbers) : null;
}

function maxOf(numbers) {
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

// ---------- 1. What to wear ----------

// The coldest "feels like" temperature decides the clothes.
// We check the rules from the coldest to the warmest; the first match wins.
function chooseClothes(minApparent) {
  if (minApparent <= -10) return "тёплая куртка, шапка, шарф и перчатки";
  if (minApparent <= 0) return "зимняя куртка и шапка";
  if (minApparent <= 10) return "куртка";
  if (minApparent <= 18) return "лёгкая куртка или свитер";
  if (minApparent <= 25) return "футболка, можно взять кофту";
  return "лёгкая одежда, пейте воду";
}

// The icon should match the advice: a jacket for cold, a T-shirt for warm
function chooseClothesIcon(minApparent) {
  if (minApparent <= -10) return "🧤";
  if (minApparent <= 18) return "🧥";
  if (minApparent <= 25) return "👕";
  return "🩳";
}

// Returns a list of rows { icon, text }: the clothes first, then warnings.
function buildClothesAdvice(hours, currentTime, units) {
  const rest = getRestOfToday(hours, currentTime);
  const apparentValues = rest.map((hour) => hour.apparent).filter(isNumberValue);
  if (apparentValues.length === 0) {
    return []; // no data, so no advice
  }
  const coldest = minOf(apparentValues);
  const warmest = maxOf(apparentValues);

  // "kind" and "short" let the share button reuse the advice without parsing the text
  const rows = [
    {
      kind: "clothes",
      icon: chooseClothesIcon(coldest),
      short: chooseClothes(coldest),
      text: `Что надеть: ${chooseClothes(coldest)}`,
    },
  ];

  // The first hour with a high chance of rain or snow
  const wetHour = rest.find((hour) => isNumberValue(hour.rain) && hour.rain >= RAIN_CHANCE_LIMIT);
  if (wetHour) {
    const clock = wetHour.time.slice(11, 16);
    if (SNOW_CODES.includes(wetHour.weatherCode)) {
      rows.push({ icon: "❄️", text: `Будет снег около ${clock}` });
    } else {
      rows.push({ icon: "☂️", text: `Возьмите зонт: дождь около ${clock}` });
    }
  }

  const maxWind = maxOf(rest.map((hour) => hour.wind).filter(isNumberValue));
  if (maxWind !== null && maxWind >= STRONG_WIND) {
    rows.push({ icon: "💨", text: `Сильный ветер до ${Math.round(maxWind)} м/с` });
  }

  if (warmest - coldest >= BIG_SWING) {
    const swing = formatDifference(warmest - coldest, units);
    rows.push({ icon: "🧣", text: `Днём и вечером разница ${swing}: одевайтесь слоями` });
  }
  return rows;
}

// ---------- 2. Best time for a walk ----------

// All 2-hour windows of one day where both hours are daytime and follow each other
function buildWalkWindows(dayHours) {
  const windows = [];
  for (let index = 0; index + 1 < dayHours.length; index++) {
    const first = dayHours[index];
    const second = dayHours[index + 1];
    const followEachOther = hourNumber(second) === hourNumber(first) + 1;
    if (!followEachOther || first.isDay !== 1 || second.isDay !== 1) {
      continue;
    }
    // Use "feels like" when we have it, because that is what a walker feels
    const feels = [first, second]
      .map((hour) => (isNumberValue(hour.apparent) ? hour.apparent : hour.temperature))
      .filter(isNumberValue);
    if (feels.length === 0) {
      continue; // no temperature at all: skip this window
    }
    const rains = [first, second].map((hour) => hour.rain).filter(isNumberValue);
    const winds = [first, second].map((hour) => hour.wind).filter(isNumberValue);
    const temperatures = [first, second].map((hour) => hour.temperature).filter(isNumberValue);
    const maxRain = rains.length > 0 ? Math.max(...rains) : 0;

    windows.push({
      start: first.time.slice(11, 16),
      // The window ends one hour after its second hour starts
      end: `${String((hourNumber(second) + 1) % 24).padStart(2, "0")}:00`,
      temperature: temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : feels[0],
      maxRain: maxRain,
      rainy: maxRain >= WALK_RAIN_LIMIT,
      distance: Math.abs(feels.reduce((a, b) => a + b, 0) / feels.length - WALK_TARGET),
      wind: winds.length > 0 ? Math.max(...winds) : 0,
    });
  }
  return windows;
}

// Compare two windows. A negative number means "a is better".
// Order of importance: dry first (or the smallest rain chance), then
// the temperature closest to 20 degrees, then the weakest wind.
function compareWalkWindows(a, b) {
  if (a.rainy !== b.rainy) {
    return a.rainy ? 1 : -1;
  }
  if (a.rainy && a.maxRain !== b.maxRain) {
    return a.maxRain - b.maxRain;
  }
  const distanceA = Math.round(a.distance); // whole degrees: 0.3 degrees is not a real difference
  const distanceB = Math.round(b.distance);
  if (distanceA !== distanceB) {
    return distanceA - distanceB;
  }
  return a.wind - b.wind;
}

function pickBestWindow(windows) {
  return [...windows].sort(compareWalkWindows)[0];
}

function describeWalkWindow(walkWindow, units) {
  const weather = walkWindow.rainy ? `дождь ${Math.round(walkWindow.maxRain)}%` : "без дождя";
  return `${walkWindow.start}–${walkWindow.end} (${formatDegrees(walkWindow.temperature, units)}, ${weather})`;
}

// Returns one row { icon, text } or null when there is no good day hour at all
function buildWalkAdvice(hours, currentTime, units) {
  if (!isLocalTime(currentTime)) {
    return null;
  }
  const today = currentTime.slice(0, 10);
  const tomorrow = addDays(today, 1);

  const todayHours = getRestOfToday(hours, currentTime);
  const todayWindows = buildWalkWindows(todayHours);
  if (todayWindows.length > 0) {
    const best = pickBestWindow(todayWindows);
    const text = todayWindows.every((walkWindow) => walkWindow.rainy)
      ? `Сегодня весь день дождь — лучшее окно: ${describeWalkWindow(best, units)}`
      : `Лучшее время для прогулки: ${describeWalkWindow(best, units)}`;
    return { icon: "🚶", text: text };
  }

  // Less than 2 daytime hours left today: look at tomorrow
  const tomorrowHours = hours.filter((hour) => hour.time.slice(0, 10) === tomorrow);
  const tomorrowWindows = buildWalkWindows(tomorrowHours);
  if (tomorrowWindows.length === 0) {
    return null;
  }
  const best = pickBestWindow(tomorrowWindows);
  const text = tomorrowWindows.every((walkWindow) => walkWindow.rainy)
    ? `Завтра весь день дождь — лучшее окно: ${describeWalkWindow(best, units)}`
    : `Лучшее время для прогулки: завтра ${describeWalkWindow(best, units)}`;
  return { icon: "🚶", text: text };
}

// ---------- 3. Comparison with yesterday ----------

// Compares the temperature of this hour with the same hour yesterday.
// Returns one row { icon, text } or null when one of the two hours is missing.
function buildYesterdayComparison(hours, currentTime, units) {
  if (!isLocalTime(currentTime)) {
    return null;
  }
  const nowKey = currentTime.slice(0, 13);
  const yesterdayKey = `${addDays(currentTime.slice(0, 10), -1)}T${currentTime.slice(11, 13)}`;

  const now = hours.find((hour) => hour.time.slice(0, 13) === nowKey);
  const yesterday = hours.find((hour) => hour.time.slice(0, 13) === yesterdayKey);
  if (!now || !yesterday || !isNumberValue(now.temperature) || !isNumberValue(yesterday.temperature)) {
    return null;
  }

  const difference = now.temperature - yesterday.temperature;
  if (Math.abs(difference) < SAME_TEMPERATURE_LIMIT) {
    return { icon: "📊", text: "Так же, как вчера в это время" };
  }
  const size = formatDifference(Math.abs(difference), units);
  const word = difference > 0 ? "теплее" : "холоднее";
  return { icon: "📊", text: `Сейчас на ${size} ${word}, чем вчера в это время` };
}

// ---------- 4. Bad air ----------

// European AQI limits. They must stay the same as AIR_LEVELS in charts.js
// (up to 60 = "Умеренный", 61-80 = "Плохой", 81-100 = "Очень плохой", above = "Ужасный"),
// otherwise the advice and the air panel would disagree.
const AIR_MODERATE_MAX = 60;
const AIR_BAD_MAX = 80;
const AIR_VERY_BAD_MAX = 100;

// One row { icon, text } when the air is bad, otherwise null.
// aqi may be null (no air data): then there is no row.
function buildAirAdvice(aqi) {
  if (!isNumberValue(aqi)) {
    return null;
  }
  // The panel shows the rounded number, so we compare the rounded number too
  const shownAqi = Math.round(aqi);
  if (shownAqi <= AIR_MODERATE_MAX) {
    return null;
  }
  // "Воздух" is masculine in Russian here: "плохой", not "плохое"
  const word =
    shownAqi > AIR_VERY_BAD_MAX ? "ужасный" : shownAqi > AIR_BAD_MAX ? "очень плохой" : "плохой";
  return { icon: "😷", text: `Воздух ${word} (AQI ${shownAqi}): лучше не гулять долго` };
}

// ---------- All rows together ----------

// Returns a list of rows { icon, text }. An empty list means "nothing to show".
// airQuality (optional) is the European AQI number or null.
function buildInsights(hours, currentTime, airQuality = null, units = CELSIUS_UNITS) {
  const rows = buildClothesAdvice(hours, currentTime, units);
  const airAdvice = buildAirAdvice(airQuality);
  if (airAdvice) {
    rows.push(airAdvice);
  }
  const walk = buildWalkAdvice(hours, currentTime, units);
  if (walk) {
    rows.push(walk);
  }
  const comparison = buildYesterdayComparison(hours, currentTime, units);
  if (comparison) {
    rows.push(comparison);
  }
  return rows;
}

// ---------- 4. Text for reading aloud ----------

// "градус", "градуса" or "градусов" for a whole number
function degreesWord(number) {
  const abs = Math.abs(number);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "градусов";
  if (last === 1) return "градус";
  if (last >= 2 && last <= 4) return "градуса";
  return "градусов";
}

// A whole number that is ALREADY in the shown unit: -5 -> "минус 5 градусов".
// For Fahrenheit we add "по Фаренгейту", otherwise "63 градуса" would sound like Celsius.
function speakDegrees(shownValue, unitCode) {
  const rounded = roundDegrees(shownValue);
  const sign = rounded < 0 ? "минус " : "";
  const scale = unitCode === "F" ? " по Фаренгейту" : "";
  return `${sign}${Math.abs(rounded)} ${degreesWord(rounded)}${scale}`;
}

// Russian plural: 1 миллиметр, 2 миллиметра, 5 миллиметров (11-14 are "many")
function pluralWord(number, one, few, many) {
  const lastTwo = number % 100;
  const last = number % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

// Make a row text easier to say: "12°" -> "12 градусов", "13:00–15:00" -> "с 13:00 до 15:00"
// The numbers in a row text are already in the shown unit.
function makeSpeakable(text, unitCode) {
  return text
    .replace(/(-?\d+)°/g, (match, digits) => speakDegrees(Number(digits), unitCode))
    .replace(/(\d\d:\d\d)–(\d\d:\d\d)/g, "с $1 до $2")
    .replace(/ м\/с/g, " метров в секунду")
    .replace(/\+(?=\d)/g, "плюс ")
    .replace(/(\d+) мм(?![а-яё])/g, (match, digits) => `${digits} ${pluralWord(Number(digits), "миллиметр", "миллиметра", "миллиметров")}`)
    .replace(/(\d+) см(?![а-яё])/g, (match, digits) => `${digits} ${pluralWord(Number(digits), "сантиметр", "сантиметра", "сантиметров")}`);
}

// One text for the speech engine: city, now, then every row as a sentence
function buildSpeechText(cityName, temperature, description, rows, units = CELSIUS_UNITS) {
  const sentences = [
    `${cityName}.`,
    `Сейчас ${speakDegrees(units.temp(temperature), units.code)}, ${description.toLowerCase()}.`,
  ];
  for (const row of rows) {
    sentences.push(`${makeSpeakable(row.text, units.code)}.`);
  }
  return sentences.join(" ");
}

// ---------- 5. Text for the "share" button ----------

// "Бишкек: 9°, ясно. Ощущается как 6°. 🧥 Куртка. — Неоновая погода"
// rows: the list from buildInsights (the clothes row is optional).
function buildShareText(cityName, temperature, apparent, description, rows, units = CELSIUS_UNITS) {
  let text =
    `${cityName}: ${formatDegrees(temperature, units)}, ${description.toLowerCase()}. ` +
    `Ощущается как ${formatDegrees(apparent, units)}.`;
  const clothes = rows.find((row) => row.kind === "clothes");
  if (clothes) {
    const short = clothes.short.charAt(0).toUpperCase() + clothes.short.slice(1);
    text += ` ${clothes.icon} ${short}.`;
  }
  return `${text} — Неоновая погода`;
}

// ---------- 6. Weather warnings for the next 7 days ----------

// Limits for the warnings. "warning" = be careful, "danger" = really dangerous.
// All limits are in Celsius, m/s, mm and cm (the units of the API).
const FROST_LIMIT = 0; // at this minimum or lower the night is frosty
const HARD_FROST_LIMIT = -20; // very strong frost
const HEAT_WARNING = 33; // max temperature of a hot day
const HEAT_DANGER = 38;
const GUST_WARNING = 15; // wind gusts, m/s
const GUST_DANGER = 25;
const RAIN_WARNING = 20; // rain in one day, mm
const RAIN_DANGER = 50;
const SNOW_WARNING = 10; // new snow in one day, cm
const SNOW_DANGER = 25;
const STORM_FIRST_CODE = 95; // WMO codes 95 to 99 are thunderstorms
const STORM_LAST_CODE = 99;
const STORM_LOOK_AHEAD_DAYS = 2; // we look 48 hours ahead for a thunderstorm
const MAX_WARNING_ROWS = 4; // more rows would push the page down too much

// "warning" or "danger" for a value, or null when it is below both limits
function pickLevel(value, warningLimit, dangerLimit) {
  if (!isNumberValue(value) || value < warningLimit) {
    return null;
  }
  return value >= dangerLimit ? "danger" : "warning";
}

// The day with the biggest number in a field (the earlier day wins a tie)
function findPeakDay(days, field) {
  let peak = null;
  for (const day of days) {
    if (isNumberValue(day[field]) && (peak === null || day[field] > peak[field])) {
      peak = day;
    }
  }
  return peak;
}

// Frost. We warn about the FIRST frost (when today is still above zero),
// not about every cold day of the winter. A very hard frost is always shown.
function buildFrostWarning(days, todayDate, units) {
  let coldest = null;
  for (const day of days) {
    if (isNumberValue(day.min) && (coldest === null || day.min < coldest.min)) {
      coldest = day;
    }
  }
  if (coldest !== null && coldest.min <= HARD_FROST_LIMIT) {
    return {
      level: "danger", icon: "🥶", date: coldest.date,
      text: `Сильный мороз: до ${formatDegrees(coldest.min, units)} (${coldest.label})`,
    };
  }
  const today = days.find((day) => day.date === todayDate);
  if (!today || !isNumberValue(today.min) || today.min <= FROST_LIMIT) {
    return null; // frost is already here: no news
  }
  const firstFrost = days.find((day) => isNumberValue(day.min) && day.min <= FROST_LIMIT);
  if (!firstFrost) {
    return null;
  }
  // The coldest point of that night is what the user cares about
  return {
    level: "warning", icon: "⚠️", date: firstFrost.date,
    text: `Заморозки ночью: до ${formatDegrees(firstFrost.min, units)} (${firstFrost.label})`,
  };
}

// One warning from the day with the biggest value of a field.
// makeText(day, level) gives the sentence; null limits mean "no warning".
function buildPeakWarning(days, field, warningLimit, dangerLimit, icon, makeText) {
  const peak = findPeakDay(days, field);
  if (peak === null) {
    return null;
  }
  const level = pickLevel(peak[field], warningLimit, dangerLimit);
  if (level === null) {
    return null;
  }
  return { level: level, icon: icon, date: peak.date, text: makeText(peak, level) };
}

// "сегодня", "завтра" or "чт, 29 окт" for a date
function nameDate(date, todayDate, days) {
  if (date === todayDate) return "сегодня";
  if (date === addDays(todayDate, 1)) return "завтра";
  const day = days.find((item) => item.date === date);
  return day ? day.label : date;
}

// Thunderstorm: the first stormy hour in the next 48 hours
function buildStormWarning(days, hours, currentTime) {
  const todayDate = currentTime.slice(0, 10);
  const nowHour = currentTime.slice(0, 13);
  const endHour = `${addDays(todayDate, STORM_LOOK_AHEAD_DAYS)}T${currentTime.slice(11, 13)}`;
  const stormHour = hours.find(
    (hour) =>
      hour.weatherCode >= STORM_FIRST_CODE && hour.weatherCode <= STORM_LAST_CODE && hour.time.slice(0, 13) >= nowHour && hour.time.slice(0, 13) < endHour
  );
  if (!stormHour) {
    return null;
  }
  const when = nameDate(stormHour.time.slice(0, 10), todayDate, days);
  return {
    level: "warning", icon: "⛈️", date: stormHour.time.slice(0, 10),
    text: `Гроза: ${when} около ${stormHour.time.slice(11, 16)}`,
  };
}

// days: [{ date, label, min, max, gust, rain, snow }] from today on (label = "сегодня", "чт, 29 окт")
// hours: the list from app.js (see the top of this file)
// Returns [{ level, icon, text }]: danger first, then by date; at most 4 rows.
// An empty list means "no warnings".
function buildWarnings(days, hours, currentTime, units = CELSIUS_UNITS) {
  if (!isLocalTime(currentTime) || !Array.isArray(days) || !Array.isArray(hours)) {
    return [];
  }
  const todayDate = currentTime.slice(0, 10);
  const futureDays = days.filter((day) => day.date >= todayDate); // never warn about the past

  // At most one warning of each type
  const found = [
    buildFrostWarning(futureDays, todayDate, units),
    buildPeakWarning(futureDays, "max", HEAT_WARNING, HEAT_DANGER, "🔥", (day, level) =>
      `${level === "danger" ? "Сильная жара" : "Жара"}: до +${roundDegrees(units.temp(day.max))}° (${day.label})`
    ),
    buildStormWarning(futureDays, hours, currentTime),
    buildPeakWarning(futureDays, "gust", GUST_WARNING, GUST_DANGER, "💨", (day, level) =>
      `${level === "danger" ? "Штормовой ветер" : "Сильный ветер"}: порывы до ${Math.round(day.gust)} м/с (${day.label})`
    ),
    buildPeakWarning(futureDays, "rain", RAIN_WARNING, RAIN_DANGER, "🌧️", (day) =>
      `Ливень: ${Math.round(day.rain)} мм (${day.label})`
    ),
    buildPeakWarning(futureDays, "snow", SNOW_WARNING, SNOW_DANGER, "🌨️", (day) =>
      `Сильный снегопад: ${Math.round(day.snow)} см (${day.label})`
    ),
  ].filter((warning) => warning !== null);

  // Danger first; inside one level the earlier date goes first
  found.sort((a, b) => {
    if (a.level !== b.level) {
      return a.level === "danger" ? -1 : 1;
    }
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  return found
    .slice(0, MAX_WARNING_ROWS)
    .map((warning) => ({ level: warning.level, icon: warning.icon, text: warning.text }));
}
