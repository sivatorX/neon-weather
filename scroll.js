// Scroll effects: reveal on scroll, slim sticky header, "up" button. Styles are in style.css.
// Everything uses IntersectionObserver: the browser tells us when something enters or
// leaves the screen, so we do not need a slow "scroll" listener.
// If the browser has no IntersectionObserver, the page simply works without these effects.

const canObserve = "IntersectionObserver" in window;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stickyBar = document.getElementById("sticky-bar");
const stickyCity = document.getElementById("sticky-city");
const stickyTemp = document.getElementById("sticky-temp");
const stickyIcon = document.getElementById("sticky-icon");
const toTopButton = document.getElementById("to-top");
const scrollMarker = document.getElementById("scroll-marker");

// Blocks that fade in when they reach the screen
const REVEAL_SELECTOR =
  ".assistant-card, #hourly .panel, #chart .panel, #sun .panel, #air .panel, #daily .panel, #daily .day-row, #radar .panel";

let revealObserver = null;
let temperatureObserver = null;

// Hide things only when we are sure we can show them again: JS works,
// the observer exists and the user does not want less motion.
const revealEnabled = canObserve && !prefersReducedMotion;
if (revealEnabled) {
  document.documentElement.classList.add("js-reveal");
}

function createRevealObserver() {
  return new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target); // one time is enough
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
  );
}

// Call after every render: finds the new blocks and starts watching them
function refreshScrollEffects() {
  if (!revealEnabled) return;
  if (!revealObserver) revealObserver = createRevealObserver();

  const blocks = document.querySelectorAll(REVEAL_SELECTOR);
  blocks.forEach((block) => {
    if (block.classList.contains("reveal")) return; // already handled
    block.classList.add("reveal");
    // The position of a day in its list sets a small delay (see style.css)
    const position = Array.from(block.parentElement.children).indexOf(block);
    block.style.setProperty("--i", String(position));
    revealObserver.observe(block);
  });
}

// Fill the slim bar and show it when the big temperature has scrolled out at the top
function updateStickyBar(cityName, temperatureText, iconText) {
  if (!stickyBar) return;
  stickyCity.textContent = cityName;
  stickyTemp.textContent = temperatureText;
  stickyIcon.textContent = iconText;

  if (!canObserve) return;
  const bigTemperature = document.querySelector("#today .card-temp");
  if (!bigTemperature) return;

  if (!temperatureObserver) {
    temperatureObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      // Show the bar only when the number left the screen through the TOP
      // (not when the card is still below the screen)
      const leftThroughTop = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      stickyBar.classList.toggle("is-shown", leftThroughTop);
    });
  }
  temperatureObserver.disconnect(); // forget the old card
  stickyBar.classList.remove("is-shown");
  temperatureObserver.observe(bigTemperature);
}

function hideStickyBar() {
  if (!stickyBar) return;
  if (temperatureObserver) temperatureObserver.disconnect();
  stickyBar.classList.remove("is-shown");
}

// "Up" button: appears after the marker (800px from the top) is scrolled past
function setupToTopButton() {
  if (!toTopButton) return;
  toTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0 }); // html { scroll-behavior: smooth } makes it glide
  });

  if (!canObserve || !scrollMarker) return;
  const markerObserver = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    toTopButton.classList.toggle("is-shown", scrolledPast);
  });
  markerObserver.observe(scrollMarker);
}

setupToTopButton();
