// Draws the Activity card in README.md: one calendar heatmap of GitHub
// contributions + LeetCode submissions for the last 53 weeks, with totals and
// streaks, as a light and a dark SVG.
//
//   node scripts/activity-heatmap.mjs [output dir] [local activity.json]
//
// The data is the same activity.json the portfolio's Activity section uses
// (published to the `data` branch of rstushar_portfolio every 6 hours), so the
// two always agree. Runs in .github/workflows/profile-assets.yml.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_URL = "https://raw.githubusercontent.com/Tusharcode007/rstushar_portfolio/data/activity.json";
const OUT_DIR = process.argv[2] || "dist";
const LOCAL_DATA = process.argv[3];

const WEEKS = 53;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Same coordinate system as assets/header-*.svg so the cards line up in the README
const WIDTH = 1200;
const CARD = { x: 6, y: 6, w: 1170, r: 18, stroke: 6, shadow: 14 };
const INNER_X = 52;
const INNER_W = 1078;
const TILE = { y: 44, h: 92, gap: 18 };
const CELL = 16;
const STEP = 19.5;
const GRID = { x: 100, y: 188 };
const GRID_BOTTOM = GRID.y + 7 * STEP - (STEP - CELL);
const FOOT_Y = GRID_BOTTOM + 40;
const CARD_H = FOOT_Y + 30 - CARD.y;
const HEIGHT = CARD.y + CARD_H + CARD.shadow + 6;

const THEMES = {
  light: {
    card: "#FFF6E5",
    ink: "#111111",
    muted: "#3A3A3A",
    heat: ["#E8DEC9", "#B4EBCB", "#6BD6A0", "#23A266", "#0E6B42"],
  },
  dark: {
    card: "#1B1B1B",
    ink: "#F4EFE6",
    muted: "#CFC8BC",
    heat: ["#2F2F2F", "#164A33", "#1F7A50", "#34B577", "#7FEDB5"],
  },
};
// Stat tiles keep their colour in both themes; their text is always dark
const TILE_COLORS = ["#FFD23F", "#7FB2FF", "#FF8FC3", "#C3A6FF"];
const ON_TILE = "#111111";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const num = (n) => n.toLocaleString("en-IN");
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const longDate = (d) => `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/* ---------- Data ---------- */

async function load() {
  if (LOCAL_DATA) return JSON.parse(await readFile(LOCAL_DATA, "utf8"));
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`${DATA_URL} answered ${res.status}`);
  return res.json();
}

// Calendar days (UTC, like the data) from the Sunday 52 weeks back through today
function buildDays(data, now) {
  const gh = data.github?.days || {};
  const lc = data.leetcode?.days || {};
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - today.getUTCDay() - (WEEKS - 1) * 7);

  const days = [];
  for (const d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const g = gh[key] || 0;
    const l = lc[key] || 0;
    days.push({ date: new Date(d), gh: g, lc: l, total: g + l });
  }
  return days;
}

function summarize(days) {
  const values = days.map((d) => d.total);
  let longest = 0;
  let run = 0;
  for (const v of values) {
    run = v > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // A streak is still alive if today has no activity yet but yesterday did
  let i = values.length - 1;
  if (values[i] === 0) i--;
  let streak = 0;
  while (i >= 0 && values[i] > 0) {
    streak++;
    i--;
  }
  return {
    total: values.reduce((a, b) => a + b, 0),
    github: days.reduce((a, d) => a + d.gh, 0),
    leetcode: days.reduce((a, d) => a + d.lc, 0),
    active: values.filter((v) => v > 0).length,
    streak,
    longest,
    max: Math.max(0, ...values),
  };
}

// Square-root scale from 1 (level 1) to the busiest day (level 4), so a few
// busy days don't wash out the rest
function level(v, max) {
  if (v <= 0) return 0;
  if (max <= 1) return 4;
  const t = (Math.sqrt(v) - 1) / (Math.sqrt(max) - 1);
  return 1 + Math.round(t * 3);
}

/* ---------- Drawing ---------- */

function tiles(s, t) {
  const w = (INNER_W - 3 * TILE.gap) / 4;
  const items = [
    ["TOTAL ACTIVITY", num(s.total), ""],
    ["ACTIVE DAYS", num(s.active), ""],
    ["CURRENT STREAK", num(s.streak), s.streak === 1 ? "DAY" : "DAYS"],
    ["LONGEST STREAK", num(s.longest), s.longest === 1 ? "DAY" : "DAYS"],
  ];
  return items
    .map(([label, value, unit], i) => {
      const x = INNER_X + i * (w + TILE.gap);
      const unitSpan = unit ? `<tspan class="sm" font-size="16" dx="9">${unit}</tspan>` : "";
      return `
  <rect x="${x + 5}" y="${TILE.y + 5}" width="${w}" height="${TILE.h}" rx="10" fill="${t.ink}"/>
  <rect x="${x}" y="${TILE.y}" width="${w}" height="${TILE.h}" rx="10" fill="${TILE_COLORS[i]}" stroke="${t.ink}" stroke-width="4"/>
  <text class="sm" x="${x + 20}" y="${TILE.y + 34}" font-size="15.5" letter-spacing="0.6" fill="${ON_TILE}">${label}</text>
  <text class="sg" x="${x + 20}" y="${TILE.y + 75}" font-size="40" fill="${ON_TILE}">${value}${unitSpan}</text>`;
    })
    .join("");
}

function grid(days, s, t) {
  let out = "";

  // Month labels sit above the first week that contains the 1st of a month
  let lastLabelWeek = -4;
  days.forEach((day, i) => {
    if (day.date.getUTCDate() !== 1) return;
    const week = Math.floor(i / 7);
    if (week - lastLabelWeek < 3 || week > WEEKS - 2) return;
    const label = MONTHS[day.date.getUTCMonth()].toUpperCase();
    out += `\n  <text class="sm" x="${GRID.x + week * STEP}" y="${GRID.y - 12}" font-size="15" fill="${t.muted}">${label}</text>`;
    lastLabelWeek = week;
  });
  for (const row of [1, 3, 5]) {
    const label = WEEKDAYS[row].toUpperCase();
    out += `\n  <text class="sm" x="${INNER_X}" y="${GRID.y + row * STEP + 13.5}" font-size="14" fill="${t.muted}">${label}</text>`;
  }

  days.forEach((day, i) => {
    const x = GRID.x + Math.floor(i / 7) * STEP;
    const y = GRID.y + (i % 7) * STEP;
    const rect = `<rect class="l${level(day.total, s.max)}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3"`;
    // Tooltip for anyone who opens the SVG on its own
    out += day.total
      ? `\n  ${rect}><title>${esc(`${num(day.total)} on ${longDate(day.date)} (GitHub ${day.gh}, LeetCode ${day.lc})`)}</title></rect>`
      : `\n  ${rect}/>`;
  });
  return out;
}

function footer(data, s, t, updated) {
  const parts = [];
  if (data.github) parts.push(`GITHUB ${num(s.github)}`);
  if (data.leetcode) parts.push(`LEETCODE ${num(s.leetcode)}`);
  const solved = data.leetcode?.solved?.all;
  if (solved) parts.push(`${num(solved)} PROBLEMS SOLVED`);
  parts.push(`UPDATED ${updated.toUpperCase()}`);

  // Legend, right-aligned to the grid
  const right = GRID.x + WEEKS * STEP - (STEP - CELL);
  const swatch = 16;
  const gap = 5;
  const swatchesW = 5 * swatch + 4 * gap;
  const moreW = 44;
  const x0 = right - moreW - 8 - swatchesW;
  let legend = `\n  <text class="sm" x="${x0 - 8}" y="${FOOT_Y}" font-size="14" fill="${t.muted}" text-anchor="end">LESS</text>`;
  for (let i = 0; i < 5; i++) {
    legend += `\n  <rect class="l${i}" x="${x0 + i * (swatch + gap)}" y="${FOOT_Y - 13}" width="${swatch}" height="${swatch}" rx="3"/>`;
  }
  legend += `\n  <text class="sm" x="${right}" y="${FOOT_Y}" font-size="14" fill="${t.muted}" text-anchor="end">MORE</text>`;

  return `
  <text class="sm" x="${INNER_X}" y="${FOOT_Y}" font-size="15" letter-spacing="0.4" fill="${t.muted}">${esc(parts.join("  ·  "))}</text>${legend}`;
}

function render(data, days, s, t, fonts, updated) {
  const desc =
    `${plural(s.total, "activity", "activities")} in the last 12 months: ` +
    `${plural(s.github, "GitHub contribution", "GitHub contributions")} and ` +
    `${plural(s.leetcode, "LeetCode submission", "LeetCode submissions")} on ${plural(s.active, "active day", "active days")}. ` +
    `Current streak ${plural(s.streak, "day", "days")}, longest streak ${plural(s.longest, "day", "days")}. Updated ${updated}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="t d">
  <title id="t">GitHub and LeetCode activity, last 12 months</title>
  <desc id="d">${esc(desc)}</desc>
  <style>
@font-face{font-family:'SG';font-weight:700;src:url(data:font/woff2;base64,${fonts.sg}) format('woff2');}
@font-face{font-family:'SM';font-weight:700;src:url(data:font/woff2;base64,${fonts.sm}) format('woff2');}
.sg{font-family:'SG','Arial Black',Arial,sans-serif;font-weight:700;}
.sm{font-family:'SM',Menlo,Consolas,monospace;font-weight:700;}
${t.heat.map((color, i) => `.l${i}{fill:${color}}`).join("")}
  </style>

  <!-- card with hard shadow -->
  <rect x="${CARD.x + CARD.shadow}" y="${CARD.y + CARD.shadow}" width="${CARD.w}" height="${CARD_H}" rx="${CARD.r}" fill="${t.ink}"/>
  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD_H}" rx="${CARD.r}" fill="${t.card}" stroke="${t.ink}" stroke-width="${CARD.stroke}"/>

  <!-- totals and streaks -->${tiles(s, t)}

  <!-- one cell per day, oldest week on the left -->${grid(days, s, t)}

  <!-- sources and legend -->${footer(data, s, t, updated)}
</svg>
`;
}

/* ---------- Build ---------- */

const data = await load();
if (!data.github && !data.leetcode) throw new Error("activity.json has no GitHub or LeetCode data");

const now = new Date();
const days = buildDays(data, now);
const summary = summarize(days);
const generated = new Date(data.generatedAt);
const stamp = Number.isNaN(generated.getTime()) ? now : generated;
const updated = `${stamp.getUTCDate()} ${MONTHS[stamp.getUTCMonth()]} ${stamp.getUTCFullYear()}`;

const fontDir = new URL("../assets/fonts/", import.meta.url);
const fonts = {
  sg: (await readFile(new URL("SpaceGrotesk-Bold.woff2", fontDir))).toString("base64"),
  sm: (await readFile(new URL("SpaceMono-Bold.woff2", fontDir))).toString("base64"),
};

await mkdir(OUT_DIR, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  const file = join(OUT_DIR, `activity-${name}.svg`);
  await writeFile(file, render(data, days, summary, theme, fonts, updated));
  console.log(`Wrote ${file}`);
}
console.log(
  `${summary.total} total (GitHub ${summary.github}, LeetCode ${summary.leetcode}), ` +
    `${summary.active} active days, streak ${summary.streak}, longest ${summary.longest}`
);
