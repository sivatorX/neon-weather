// Charts and small visual panels: 24-hour temperature chart, sun arc, air quality.
// This file only BUILDS elements from simple data. app.js gets the data and puts the
// elements on the page. Everything is drawn with plain SVG (no libraries).
//
// SVG basics for a beginner:
// - An <svg> is a picture made of shapes (path, circle, text) that stay sharp at any size.
// - viewBox="0 0 300 160" gives the picture its OWN coordinate system (300 wide, 160 high).
//   With width: 100% the browser scales the whole picture to the screen, so we can
//   always think in the same 300 x 160 "units", on a phone and on a desktop.
// - SVG elements must be created with createElementNS and the SVG namespace,
//   otherwise the browser treats them as unknown HTML tags and draws nothing.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Create an SVG element and set its attributes from a simple object
function makeSvg(tag, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    element.setAttribute(name, String(value));
  }
  return element;
}

// SVG text. textContent is safe: it never runs HTML.
function makeSvgText(text, attributes) {
  const element = makeSvg("text", attributes);
  element.textContent = text;
  return element;
}

// An HTML element with a class and (optional) text
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// units (from app.js, see units.js) converts a Celsius value to the shown number.
// The chart itself stays in Celsius; only the texts are converted.
const CHART_CELSIUS = { temp: (value) => value };

// Round, and turn -0 into 0 (otherwise we would show "-0°")
function chartDegrees(value, units) {
  return `${Math.round(units.temp(value)) + 0}°`;
}

// ---------- 1. Temperature chart ----------

const CHART_WIDTH = 300;
const CHART_HEIGHT = 160;
const CHART_SIDE = 18; // free space left and right, so labels do not touch the edge
const CHART_TOP = 32; // the line never goes higher: room for the "max" label
const CHART_BOTTOM = 120; // the line never goes lower: room for the "min" label and the time row
const CHART_TIME_STEP = 6; // a time label under every 6th hour

// Scaling data to pixels: a temperature becomes a y position.
// The warmest hour gets CHART_TOP, the coldest one CHART_BOTTOM, the rest is in between.
function scaleToY(value, min, max) {
  if (max === min) {
    return (CHART_TOP + CHART_BOTTOM) / 2; // a flat day: draw the line in the middle
  }
  const share = (max - value) / (max - min); // 0 for the max, 1 for the min
  return CHART_TOP + share * (CHART_BOTTOM - CHART_TOP);
}

// A smooth line through the points. Between two points the line leaves the first one
// horizontally and arrives at the next one horizontally ("S" shape). It can never
// swing above the max or below the min, so the labels stay true.
function buildSmoothPath(points) {
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1];
    const point = points[index];
    const middleX = (before.x + point.x) / 2;
    path +=
      ` C ${middleX.toFixed(1)} ${before.y.toFixed(1)},` +
      ` ${middleX.toFixed(1)} ${point.y.toFixed(1)},` +
      ` ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }
  return path;
}

// Text anchor for a label: near the left edge it starts at the point, near the right edge it
// ends at the point, otherwise it is centered. So a label never leaves the picture.
function pickAnchor(x) {
  if (x < 36) return "start";
  if (x > CHART_WIDTH - 36) return "end";
  return "middle";
}

// items: the hourly list from app.js, { clock: "15:00", temperature: 12.3 }, first item = now.
// Returns an <svg> or null when there are too few hours to draw a line.
function buildTemperatureChart(items, units = CHART_CELSIUS) {
  const hours = items.filter(
    (item) => item && typeof item.clock === "string" && Number.isFinite(item.temperature)
  );
  if (hours.length < 2) {
    return null;
  }

  const temperatures = hours.map((hour) => hour.temperature);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  const minIndex = temperatures.indexOf(min);
  const maxIndex = temperatures.indexOf(max);

  const stepX = (CHART_WIDTH - CHART_SIDE * 2) / (hours.length - 1);
  const points = hours.map((hour, index) => ({
    x: CHART_SIDE + index * stepX,
    y: scaleToY(hour.temperature, min, max),
  }));

  const summary =
    `Температура от ${chartDegrees(min, units)} до ${chartDegrees(max, units)}, ` +
    `максимум в ${hours[maxIndex].clock}`;
  const svg = makeSvg("svg", {
    class: "chart-svg",
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    role: "img",
    "aria-label": summary,
  });

  // The gradient under the line fades from the accent color to nothing.
  // "currentColor" is the CSS color of the svg, which is the accent (see charts.css).
  const defs = makeSvg("defs");
  const gradient = makeSvg("linearGradient", { id: "chart-fill", x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(
    makeSvg("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": 0.45 }),
    makeSvg("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": 0 })
  );
  defs.append(gradient);
  svg.append(defs);

  // Thin vertical guides and time labels under every 6th hour
  for (let index = 0; index < hours.length; index += CHART_TIME_STEP) {
    const x = points[index].x;
    if (index > 0) {
      svg.append(makeSvg("line", { class: "chart-guide", x1: x, y1: CHART_TOP - 8, x2: x, y2: CHART_BOTTOM + 10 }));
    }
    const label = index === 0 ? "Сейчас" : hours[index].clock;
    svg.append(
      makeSvgText(label, {
        class: index === 0 ? "chart-label chart-label-now" : "chart-label",
        x: x,
        y: CHART_HEIGHT - 8,
        "text-anchor": index === 0 ? "start" : "middle",
      })
    );
  }

  // The area under the line: the line, then down to the bottom and back to the start
  const linePath = buildSmoothPath(points);
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${CHART_BOTTOM + 10} L ${points[0].x.toFixed(1)} ${CHART_BOTTOM + 10} Z`;
  svg.append(makeSvg("path", { class: "chart-area", d: areaPath, fill: "url(#chart-fill)" }));
  svg.append(makeSvg("path", { class: "chart-line", d: linePath }));

  // Max (above the point) and min (below the point). A flat day has only one label.
  const marks = [{ index: maxIndex, above: true }];
  if (minIndex !== maxIndex) {
    marks.push({ index: minIndex, above: false });
  }
  for (const mark of marks) {
    const point = points[mark.index];
    svg.append(makeSvg("circle", { class: "chart-mark", cx: point.x, cy: point.y, r: 3 }));
    svg.append(
      makeSvgText(chartDegrees(hours[mark.index].temperature, units), {
        class: "chart-value",
        x: point.x,
        y: mark.above ? point.y - 10 : point.y + 18,
        "text-anchor": pickAnchor(point.x),
      })
    );
  }

  // "Now": a bright dot with a soft ring around it
  svg.append(makeSvg("circle", { class: "chart-now-ring", cx: points[0].x, cy: points[0].y, r: 9 }));
  svg.append(makeSvg("circle", { class: "chart-now", cx: points[0].x, cy: points[0].y, r: 5 }));

  return svg;
}

// ---------- 2. Sun panel ----------

// "2026-10-26T07:28" -> minutes since midnight (448)
function timeToMinutes(text) {
  return Number(text.slice(11, 13)) * 60 + Number(text.slice(14, 16));
}

// 612 -> "10 ч 12 мин"; less than an hour -> "45 мин"
function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours === 0 ? `${minutes} мин` : `${hours} ч ${minutes} мин`;
}

const SUN_WIDTH = 300;
const SUN_HEIGHT = 120;
const SUN_CENTER_X = 150;
const SUN_HORIZON_Y = 100;
const SUN_RADIUS_X = 120;
const SUN_RADIUS_Y = 78;

// A point on the arc. share: 0 = sunrise, 0.5 = noon, 1 = sunset.
function pointOnArc(share) {
  const angle = Math.PI * (1 - share); // from 180 degrees (left) to 0 (right)
  return {
    x: SUN_CENTER_X + SUN_RADIUS_X * Math.cos(angle),
    y: SUN_HORIZON_Y - SUN_RADIUS_Y * Math.sin(angle),
  };
}

// sun: { sunrise, sunset, nextSunrise } as local time texts ("2026-10-26T07:28"),
// nextSunrise may be null. currentTime: local time of the city (NOT the phone clock).
// Returns an element or null when the times are not usable.
function buildSunContent(sun, currentTime) {
  const isTime = (text) => typeof text === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text);
  if (!sun || !isTime(sun.sunrise) || !isTime(sun.sunset) || !isTime(currentTime)) {
    return null;
  }
  const riseMinutes = timeToMinutes(sun.sunrise);
  const setMinutes = timeToMinutes(sun.sunset);
  const nowMinutes = timeToMinutes(currentTime);
  if (setMinutes <= riseMinutes) {
    return null; // polar day or night: a plain arc would lie
  }
  const dayLength = setMinutes - riseMinutes;
  const riseClock = sun.sunrise.slice(11, 16);
  const setClock = sun.sunset.slice(11, 16);

  // Where is the sun now, and what do we say about it?
  let state = "day";
  let statusText = `До заката ${formatDuration(setMinutes - nowMinutes)}`;
  if (nowMinutes < riseMinutes) {
    state = "before";
    statusText = `Солнце ещё не взошло · до восхода ${formatDuration(riseMinutes - nowMinutes)}`;
  } else if (nowMinutes >= setMinutes) {
    state = "after";
    statusText = "Солнце зашло";
    if (isTime(sun.nextSunrise)) {
      const untilSunrise = 24 * 60 - nowMinutes + timeToMinutes(sun.nextSunrise);
      statusText = `Солнце зашло · до восхода ${formatDuration(untilSunrise)}`;
    }
  }

  const share = Math.min(Math.max((nowMinutes - riseMinutes) / dayLength, 0), 1);
  const svg = makeSvg("svg", {
    class: "sun-svg",
    viewBox: `0 0 ${SUN_WIDTH} ${SUN_HEIGHT}`,
    role: "img",
    "aria-label": `${statusText}. Восход в ${riseClock}, закат в ${setClock}`,
  });

  const start = pointOnArc(0);
  const end = pointOnArc(1);
  // "A" draws part of an ellipse: radii, rotation, large-arc flag, sweep flag, end point
  const fullArc = `M ${start.x} ${start.y} A ${SUN_RADIUS_X} ${SUN_RADIUS_Y} 0 0 1 ${end.x} ${end.y}`;
  svg.append(
    makeSvg("line", { class: "sun-horizon", x1: 10, y1: SUN_HORIZON_Y, x2: SUN_WIDTH - 10, y2: SUN_HORIZON_Y }),
    makeSvg("path", { class: "sun-arc", d: fullArc })
  );

  if (state === "day") {
    const sunPoint = pointOnArc(share);
    // The part of the way the sun has already done glows
    const passedArc = `M ${start.x} ${start.y} A ${SUN_RADIUS_X} ${SUN_RADIUS_Y} 0 0 1 ${sunPoint.x.toFixed(1)} ${sunPoint.y.toFixed(1)}`;
    svg.append(
      makeSvg("path", { class: "sun-arc-passed", d: passedArc }),
      makeSvg("circle", { class: "sun-halo", cx: sunPoint.x, cy: sunPoint.y, r: 16 }),
      makeSvg("circle", { class: "sun-body", cx: sunPoint.x, cy: sunPoint.y, r: 8 })
    );
  } else {
    // Night: the moon waits just above the horizon, where the sun left or will appear
    const moonPoint = state === "after" ? end : start;
    svg.append(
      makeSvgText("🌙", {
        class: "sun-moon",
        x: moonPoint.x,
        y: SUN_HORIZON_Y - 10,
        "text-anchor": "middle",
      })
    );
  }

  const content = makeElement("div", "sun-content");
  const facts = makeElement("div", "sun-facts");
  const fact = (label, value) => {
    const tile = makeElement("div", "sun-fact");
    tile.append(makeElement("div", "sun-fact-label", label), makeElement("div", "sun-fact-value", value));
    return tile;
  };
  facts.append(fact("Восход", riseClock), fact("Закат", setClock));

  content.append(
    svg,
    makeElement("p", "sun-status", statusText),
    facts,
    makeElement("p", "sun-length", `Световой день ${formatDuration(dayLength)}`)
  );
  return content;
}

// ---------- 3. Air quality ----------

// European Air Quality Index (EAQI). Each band has a text and a color.
// "upTo" is the highest value that still belongs to the band.
const AIR_LEVELS = [
  { upTo: 20, label: "Хороший", color: "#34f5a0", advice: "" },
  { upTo: 40, label: "Нормальный", color: "#b8f542", advice: "" },
  {
    upTo: 60,
    label: "Умеренный",
    color: "#ffd93d",
    advice: "Людям с аллергией и астмой лучше меньше быть на улице.",
  },
  {
    upTo: 80,
    label: "Плохой",
    color: "#ff8a4c",
    advice: "Лучше не гулять долго, закройте окна.",
  },
  {
    upTo: 100,
    label: "Очень плохой",
    color: "#ff2e88",
    advice: "Лучше остаться дома и закрыть окна. Если выходите, возьмите маску.",
  },
  {
    upTo: Infinity,
    label: "Ужасный",
    color: "#b46cff",
    advice: "Не выходите без необходимости, закройте окна. На улице нужна маска.",
  },
];

const AIR_SCALE_MAX = 120; // the right end of the scale bar

function getAirLevel(aqi) {
  return AIR_LEVELS.find((level) => aqi <= level.upTo) || AIR_LEVELS[AIR_LEVELS.length - 1];
}

// air: { aqi, pm25, pm10 } (pm values may be null). Returns an element or null.
function buildAirContent(air) {
  if (!air || !Number.isFinite(air.aqi)) {
    return null;
  }
  const aqi = Math.round(air.aqi);
  const level = getAirLevel(aqi);

  const content = makeElement("div", "air-content");
  // CSS reads the band color from this variable
  content.style.setProperty("--air-color", level.color);

  const main = makeElement("div", "air-main");
  const textColumn = makeElement("div", "air-main-text");
  textColumn.append(makeElement("div", "air-level", level.label), makeElement("div", "air-unit", "Европейский индекс AQI"));
  main.append(makeElement("div", "air-value", String(aqi)), textColumn);

  // The scale: colored bands and a marker where the air is now
  const scale = makeElement("div", "air-scale");
  scale.setAttribute("aria-hidden", "true"); // the level text says the same
  const marker = makeElement("div", "air-marker");
  marker.style.left = `${(Math.min(Math.max(aqi, 0), AIR_SCALE_MAX) / AIR_SCALE_MAX) * 100}%`;
  scale.append(marker);

  content.append(main, scale);

  // PM2.5 and PM10 are tiny dust particles in micrograms per cubic meter
  const particles = makeElement("div", "air-particles");
  const tile = (name, value) => {
    const box = makeElement("div", "air-particle");
    box.append(
      makeElement("div", "air-particle-name", name),
      makeElement("div", "air-particle-value", `${Math.round(value * 10) / 10} µg/m³`)
    );
    return box;
  };
  if (Number.isFinite(air.pm25)) particles.append(tile("PM2.5", air.pm25));
  if (Number.isFinite(air.pm10)) particles.append(tile("PM10", air.pm10));
  if (particles.children.length > 0) {
    content.append(particles);
  }

  if (level.advice !== "") {
    content.append(makeElement("p", "air-advice", level.advice));
  }
  return content;
}
