// Neon animated weather icons (SVG).
// One global function: createWeatherIcon(weatherCode, isDay, size) -> <svg> element.
// Colors, glow and animation live in icons.css. Here we only draw the shapes
// and give each shape a CSS class.

const WX_ICON_NS = "http://www.w3.org/2000/svg";

// WMO weather code -> icon kind. "day/night" kinds are picked in wxIconPickKind.
const WX_ICON_KIND_BY_CODE = {
  0: "clear",
  1: "partly",
  2: "partly",
  3: "cloudy",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "freezing",
  57: "freezing",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "freezing",
  67: "freezing",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow",
  80: "showers",
  81: "showers",
  82: "showers",
  85: "snow",
  86: "snow",
  95: "thunder",
  96: "hail",
  99: "hail",
};

// Only these kinds look different at night.
const WX_ICON_NIGHT_KINDS = ["clear", "partly", "showers"];

// Small helper: create an SVG element, set its attributes, add it to a parent.
function wxIconMake(tag, attributes, parent) {
  const element = document.createElementNS(WX_ICON_NS, tag);
  for (const name in attributes) {
    element.setAttribute(name, attributes[name]);
  }
  if (parent) {
    parent.appendChild(element);
  }
  return element;
}

// Same as wxIconMake("g") but shorter to read.
function wxIconGroup(parent, className, transform) {
  const attributes = {};
  if (className) {
    attributes.class = className;
  }
  if (transform) {
    attributes.transform = transform;
  }
  return wxIconMake("g", attributes, parent);
}

// "x' = scale * x + dx": moves and shrinks a whole drawing.
function wxIconPlace(dx, dy, scale) {
  return `translate(${dx} ${dy}) scale(${scale})`;
}

// ---------- Small parts ----------

// Sun: a circle and 8 rays. Only the rays group rotates.
function wxIconSun(parent, transform) {
  const sun = wxIconGroup(parent, "wx-part", transform);
  const rays = wxIconGroup(sun, "wx-spin");
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    wxIconMake("line", {
      class: "wx-line wx-sun",
      x1: (32 + cos * 14).toFixed(2),
      y1: (32 + sin * 14).toFixed(2),
      x2: (32 + cos * 20).toFixed(2),
      y2: (32 + sin * 20).toFixed(2),
    }, rays);
  }
  wxIconMake("circle", { class: "wx-line wx-sun", cx: 32, cy: 32, r: 9 }, sun);
}

// Moon: a crescent drawn with two arcs.
function wxIconMoon(parent, transform) {
  const moon = wxIconGroup(parent, "wx-part", transform);
  wxIconMake("path", {
    class: "wx-line wx-moon",
    d: "M38 12 A19 19 0 1 0 54 40 A15 15 0 0 1 38 12 Z",
  }, moon);
}

// Four-point sparkle star at (x, y). "delay" is a CSS class to desync twinkles.
function wxIconStar(parent, x, y, delayClass) {
  const place = wxIconGroup(parent, "", `translate(${x} ${y})`);
  const star = wxIconGroup(place, `wx-twinkle ${delayClass}`);
  wxIconMake("path", {
    class: "wx-line wx-moon wx-star",
    d: "M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4 Z",
  }, star);
}

// Cloud outline. "tone" is "wx-cloud" or "wx-cloud wx-dim". The fill hides what is behind it.
function wxIconCloud(parent, transform, tone, extraClass) {
  const place = wxIconGroup(parent, "", transform);
  const drift = wxIconGroup(place, `wx-part ${extraClass || "wx-drift"}`);
  wxIconMake("path", {
    class: `wx-line wx-cloud-body ${tone}`,
    d: "M20 44 H46 A8 8 0 0 0 47 28.1 A12 12 0 0 0 24 26 A9 9 0 0 0 20 44 Z",
  }, drift);
}

// A falling rain drop: a short slanted line.
function wxIconDrop(parent, x, y, length, delayClass, tone) {
  wxIconMake("line", {
    class: `wx-line wx-drop ${tone || "wx-rain"} ${delayClass}`,
    x1: x,
    y1: y,
    x2: x - length * 0.35,
    y2: y + length,
  }, parent);
}

// Snowflake: three crossing lines (an asterisk) at (x, y).
function wxIconFlake(parent, x, y, delayClass, tone) {
  const place = wxIconGroup(parent, "", `translate(${x} ${y})`);
  const flake = wxIconGroup(place, `wx-fall ${delayClass}`);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3;
    const dx = Math.cos(angle) * 3.2;
    const dy = Math.sin(angle) * 3.2;
    wxIconMake("line", {
      class: `wx-line wx-thin ${tone || "wx-snow"}`,
      x1: -dx,
      y1: -dy,
      x2: dx,
      y2: dy,
    }, flake);
  }
}

// Lightning bolt. It flashes slowly (soft opacity, no strobe).
function wxIconBolt(parent, transform) {
  const place = wxIconGroup(parent, "", transform);
  const bolt = wxIconGroup(place, "wx-flash");
  wxIconMake("path", {
    class: "wx-line wx-bolt",
    d: "M35 40 L26 52 H32 L30 61 L41 47 H35 L38 40 Z",
  }, bolt);
}

// Small hail ball.
function wxIconHail(parent, x, y, delayClass) {
  const place = wxIconGroup(parent, "", `translate(${x} ${y})`);
  const ball = wxIconGroup(place, `wx-fall ${delayClass}`);
  wxIconMake("circle", { class: "wx-line wx-thin wx-ice", cx: 0, cy: 0, r: 2.3 }, ball);
}

// ---------- One builder per kind ----------

const WX_ICON_BUILDERS = {
  "clear-day": function (svg) {
    wxIconSun(svg);
  },

  "clear-night": function (svg) {
    wxIconMoon(svg);
    wxIconStar(svg, 48, 16, "wx-delay-0");
    wxIconStar(svg, 53, 31, "wx-delay-2");
  },

  "partly-day": function (svg) {
    wxIconSun(svg, wxIconPlace(0, 0, 0.7));
    wxIconCloud(svg, wxIconPlace(14, 18, 0.8), "wx-cloud");
  },

  "partly-night": function (svg) {
    wxIconMoon(svg, wxIconPlace(-2, -2, 0.7));
    wxIconCloud(svg, wxIconPlace(14, 18, 0.8), "wx-cloud");
  },

  cloudy: function (svg) {
    wxIconCloud(svg, wxIconPlace(23, 4, 0.7), "wx-cloud wx-dim", "wx-drift-back");
    wxIconCloud(svg, wxIconPlace(-1, 13, 0.85), "wx-cloud");
  },

  fog: function (svg) {
    wxIconCloud(svg, wxIconPlace(7, -2, 0.75), "wx-cloud");
    wxIconMake("line", { class: "wx-line wx-cloud wx-mist wx-delay-0", x1: 12, y1: 40, x2: 44, y2: 40 }, svg);
    wxIconMake("line", { class: "wx-line wx-cloud wx-mist wx-delay-1", x1: 20, y1: 48, x2: 52, y2: 48 }, svg);
    wxIconMake("line", { class: "wx-line wx-cloud wx-mist wx-delay-2", x1: 14, y1: 56, x2: 40, y2: 56 }, svg);
  },

  drizzle: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud");
    wxIconDrop(svg, 24, 46, 4, "wx-delay-0");
    wxIconDrop(svg, 34, 46, 4, "wx-delay-1");
    wxIconDrop(svg, 44, 46, 4, "wx-delay-2");
  },

  rain: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud");
    wxIconDrop(svg, 21, 46, 8, "wx-delay-0");
    wxIconDrop(svg, 30, 46, 8, "wx-delay-2");
    wxIconDrop(svg, 39, 46, 8, "wx-delay-1");
    wxIconDrop(svg, 48, 46, 8, "wx-delay-3");
  },

  freezing: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud");
    wxIconDrop(svg, 22, 46, 8, "wx-delay-0");
    wxIconFlake(svg, 34, 52, "wx-delay-1", "wx-ice");
    wxIconDrop(svg, 47, 46, 8, "wx-delay-2");
  },

  "showers-day": function (svg) {
    wxIconSun(svg, wxIconPlace(-2, -3, 0.55));
    wxIconCloud(svg, wxIconPlace(14, 9, 0.78), "wx-cloud");
    wxIconDrop(svg, 28, 47, 8, "wx-delay-0");
    wxIconDrop(svg, 38, 47, 8, "wx-delay-2");
    wxIconDrop(svg, 48, 47, 8, "wx-delay-1");
  },

  "showers-night": function (svg) {
    wxIconMoon(svg, wxIconPlace(-5, -6, 0.6));
    wxIconCloud(svg, wxIconPlace(14, 9, 0.78), "wx-cloud");
    wxIconDrop(svg, 28, 47, 8, "wx-delay-0");
    wxIconDrop(svg, 38, 47, 8, "wx-delay-2");
    wxIconDrop(svg, 48, 47, 8, "wx-delay-1");
  },

  snow: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud");
    wxIconFlake(svg, 22, 48, "wx-delay-0");
    wxIconFlake(svg, 33, 52, "wx-delay-2");
    wxIconFlake(svg, 44, 48, "wx-delay-1");
  },

  thunder: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud wx-dark");
    wxIconBolt(svg);
  },

  hail: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 0, 0.9), "wx-cloud wx-dark");
    wxIconBolt(svg, wxIconPlace(0, 0, 1));
    wxIconHail(svg, 20, 48, "wx-delay-0");
    wxIconHail(svg, 47, 50, "wx-delay-2");
    wxIconHail(svg, 22, 58, "wx-delay-1");
  },

  unknown: function (svg) {
    wxIconCloud(svg, wxIconPlace(2, 6, 0.9), "wx-cloud", "wx-drift");
    // The "?" is drawn as a path so it needs no font.
    wxIconMake("path", {
      class: "wx-line wx-thin wx-moon",
      d: "M28 26 A4 4 0 1 1 33 30 Q32 31 32 33 M32 38 L32 38.5",
    }, svg);
  },
};

// Decide which builder to use from the weather code and day/night.
function wxIconPickKind(weatherCode, isDay) {
  const baseKind = WX_ICON_KIND_BY_CODE[weatherCode];
  if (!baseKind) {
    return "unknown";
  }
  if (WX_ICON_NIGHT_KINDS.includes(baseKind)) {
    // The app uses 0/1 for isDay; only an explicit 0 or false means night.
    const isNight = isDay === 0 || isDay === false;
    return `${baseKind}-${isNight ? "night" : "day"}`;
  }
  return baseKind;
}

// Public function. size is in pixels (default 48).
function createWeatherIcon(weatherCode, isDay, size) {
  const pixels = Number(size) > 0 ? Number(size) : 48;
  const kind = wxIconPickKind(weatherCode, isDay);

  const svg = document.createElementNS(WX_ICON_NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", pixels);
  svg.setAttribute("height", pixels);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // Small icons get a tighter glow (see icons.css).
  const sizeClass = pixels <= 32 ? " wx-icon--small" : "";
  svg.setAttribute("class", `wx-icon wx-icon--${kind}${sizeClass}`);

  WX_ICON_BUILDERS[kind](svg);
  return svg;
}
