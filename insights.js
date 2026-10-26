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

// "-5°"
function formatDegrees(value) {
  return `${roundDegrees(value)}°`;
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
function buildClothesAdvice(hours, currentTime) {
  const rest = getRestOfToday(hours, currentTime);
  const apparentValues = rest.map((hour) => hour.apparent).filter(isNumberValue);
  if (apparentValues.length === 0) {
    return []; // no data, so no advice
  }
  const coldest = minOf(apparentValues);
  const warmest = maxOf(apparentValues);

  const rows = [{ icon: chooseClothesIcon(coldest), text: `Что надеть: ${chooseClothes(coldest)}` }];

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
    const swing = roundDegrees(warmest - coldest);
    rows.push({ icon: "🧣", text: `Днём и вечером разница ${swing}°: одевайтесь слоями` });
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

function describeWalkWindow(walkWindow) {
  const weather = walkWindow.rainy ? `дождь ${Math.round(walkWindow.maxRain)}%` : "без дождя";
  return `${walkWindow.start}–${walkWindow.end} (${formatDegrees(walkWindow.temperature)}, ${weather})`;
}

// Returns one row { icon, text } or null when there is no good day hour at all
function buildWalkAdvice(hours, currentTime) {
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
      ? `Сегодня весь день дождь — лучшее окно: ${describeWalkWindow(best)}`
      : `Лучшее время для прогулки: ${describeWalkWindow(best)}`;
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
    ? `Завтра весь день дождь — лучшее окно: ${describeWalkWindow(best)}`
    : `Лучшее время для прогулки: завтра ${describeWalkWindow(best)}`;
  return { icon: "🚶", text: text };
}

// ---------- 3. Comparison with yesterday ----------

// Compares the temperature of this hour with the same hour yesterday.
// Returns one row { icon, text } or null when one of the two hours is missing.
function buildYesterdayComparison(hours, currentTime) {
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
  const size = formatDegrees(Math.abs(difference));
  const word = difference > 0 ? "теплее" : "холоднее";
  return { icon: "📊", text: `Сейчас на ${size} ${word}, чем вчера в это время` };
}

// ---------- All rows together ----------

// Returns a list of rows { icon, text }. An empty list means "nothing to show".
function buildInsights(hours, currentTime) {
  const rows = buildClothesAdvice(hours, currentTime);
  const walk = buildWalkAdvice(hours, currentTime);
  if (walk) {
    rows.push(walk);
  }
  const comparison = buildYesterdayComparison(hours, currentTime);
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

// -5 -> "минус 5 градусов"
function speakDegrees(value) {
  const rounded = roundDegrees(value);
  const sign = rounded < 0 ? "минус " : "";
  return `${sign}${Math.abs(rounded)} ${degreesWord(rounded)}`;
}

// Make a row text easier to say: "12°" -> "12 градусов", "13:00–15:00" -> "с 13:00 до 15:00"
function makeSpeakable(text) {
  return text
    .replace(/(-?\d+)°/g, (match, digits) => speakDegrees(Number(digits)))
    .replace(/(\d\d:\d\d)–(\d\d:\d\d)/g, "с $1 до $2")
    .replace(/ м\/с/g, " метров в секунду");
}

// One text for the speech engine: city, now, then every row as a sentence
function buildSpeechText(cityName, temperature, description, rows) {
  const sentences = [
    `${cityName}.`,
    `Сейчас ${speakDegrees(temperature)}, ${description.toLowerCase()}.`,
  ];
  for (const row of rows) {
    sentences.push(`${makeSpeakable(row.text)}.`);
  }
  return sentences.join(" ");
}
