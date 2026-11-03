import { mkdirSync, writeFileSync } from "node:fs";

const username = "Vikas-daddi";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required to generate the profile charts.");

const colors = {
  bg: "#0B1220",
  panel: "#101D31",
  grid: "#1E3554",
  text: "#DBEAFE",
  muted: "#93AFCF",
  blue: "#3B82F6",
  cyan: "#38BDF8",
  pale: "#BFDBFE",
};

async function githubJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}): ${url}`);
  return response.json();
}

const graphql = await githubJson("https://api.github.com/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
    }`,
    variables: { login: username },
  }),
});
if (graphql.errors?.length || !graphql.data?.user) {
  throw new Error(`Could not load contribution calendar: ${JSON.stringify(graphql.errors ?? [])}`);
}

const calendar = graphql.data.user.contributionsCollection.contributionCalendar;
const weekly = calendar.weeks.map((week) => ({
  date: week.contributionDays[0]?.date ?? "",
  count: week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0),
}));

const w = 960;
const h = 300;
const left = 58;
const right = 28;
const top = 66;
const bottom = 48;
const chartW = w - left - right;
const chartH = h - top - bottom;
const max = Math.max(1, ...weekly.map((item) => item.count));
const points = weekly.map((item, index) => ({
  ...item,
  x: left + index * (chartW / Math.max(weekly.length - 1, 1)),
  y: top + chartH - (item.count / max) * chartH,
}));
const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
const areaPath = `${linePath} L${points.at(-1).x.toFixed(1)},${(top + chartH).toFixed(1)} L${left},${(top + chartH).toFixed(1)} Z`;
const yGrid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
  const y = top + chartH - ratio * chartH;
  const label = Math.round(max * ratio);
  return `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="${colors.grid}"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" fill="${colors.muted}" font-size="12">${label}</text>`;
}).join("");
const xLabels = [0, 13, 26, 39, weekly.length - 1].map((index) => {
  const point = points[Math.min(index, points.length - 1)];
  const label = point?.date ? new Date(`${point.date}T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" }) : "";
  return `<text x="${point?.x ?? left}" y="${h - 17}" text-anchor="middle" fill="${colors.muted}" font-size="12">${label}</text>`;
}).join("");
const activitySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
<title id="title">GitHub activity</title><desc id="desc">${calendar.totalContributions} contributions over the past year, shown by week.</desc>
<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors.blue}" stop-opacity=".46"/><stop offset="100%" stop-color="${colors.blue}" stop-opacity="0"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="18" fill="${colors.bg}"/><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="17" fill="none" stroke="${colors.grid}"/>
<text x="28" y="34" fill="${colors.text}" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="700">Contribution activity</text>
<text x="${w - 28}" y="34" text-anchor="end" fill="${colors.pale}" font-family="Segoe UI,Arial,sans-serif" font-size="14">${calendar.totalContributions} contributions · last year</text>
${yGrid}<path d="${areaPath}" fill="url(#area)"/><path d="${linePath}" fill="none" stroke="${colors.cyan}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${points.filter((_, index) => index % 4 === 0).map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" fill="${colors.pale}"/>`).join("")}${xLabels}
</svg>`;

const dailyCounts = new Map();
for (const week of calendar.weeks) {
  for (const day of week.contributionDays) {
    const month = day.date.slice(0, 7);
    dailyCounts.set(month, (dailyCounts.get(month) ?? 0) + day.contributionCount);
  }
}
const lastDay = calendar.weeks.at(-1)?.contributionDays.at(-1)?.date;
const anchor = lastDay ? new Date(`${lastDay}T00:00:00Z`) : new Date();
const latestMonth = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
const monthly = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(latestMonth);
  date.setUTCMonth(date.getUTCMonth() - (11 - index));
  const key = date.toISOString().slice(0, 7);
  return {
    label: date.toLocaleString("en", { month: "short", timeZone: "UTC" }),
    count: dailyCounts.get(key) ?? 0,
  };
});
const monthW = 960;
const monthH = 300;
const chartLeft = 50;
const chartTop = 76;
const chartBottom = 50;
const chartRight = 26;
const monthChartH = monthH - chartTop - chartBottom;
const monthChartW = monthW - chartLeft - chartRight;
const monthMax = Math.max(1, ...monthly.map((item) => item.count));
const slot = monthChartW / monthly.length;
const monthBars = monthly.map((item, index) => {
  const barWidth = Math.min(40, slot * 0.58);
  const barHeight = (item.count / monthMax) * monthChartH;
  const x = chartLeft + index * slot + (slot - barWidth) / 2;
  const y = chartTop + monthChartH - barHeight;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(2, barHeight).toFixed(1)}" rx="6" fill="${index % 2 ? colors.blue : colors.cyan}"/><text x="${(x + barWidth / 2).toFixed(1)}" y="${monthH - 18}" text-anchor="middle" fill="${colors.muted}" font-family="Segoe UI,Arial,sans-serif" font-size="12">${item.label}</text>${item.count ? `<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" fill="${colors.pale}" font-family="Segoe UI,Arial,sans-serif" font-size="11">${item.count}</text>` : ""}`;
}).join("");
const monthGrid = [0, 0.5, 1].map((ratio) => {
  const y = chartTop + monthChartH - ratio * monthChartH;
  return `<line x1="${chartLeft}" y1="${y.toFixed(1)}" x2="${monthW - chartRight}" y2="${y.toFixed(1)}" stroke="${colors.grid}"/>`;
}).join("");
const monthSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${monthW}" height="${monthH}" viewBox="0 0 ${monthW} ${monthH}" role="img" aria-labelledby="title desc">
<title id="title">Monthly contributions</title><desc id="desc">GitHub contributions by month over the last year.</desc>
<rect width="${monthW}" height="${monthH}" rx="18" fill="${colors.bg}"/><rect x="1" y="1" width="${monthW - 2}" height="${monthH - 2}" rx="17" fill="none" stroke="${colors.grid}"/>
<text x="28" y="34" fill="${colors.text}" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="700">Monthly contributions</text>
<text x="${monthW - 28}" y="34" text-anchor="end" fill="${colors.muted}" font-family="Segoe UI,Arial,sans-serif" font-size="13">Last 12 months · GitHub activity</text>
${monthGrid}${monthBars}</svg>`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/profile-activity.svg", activitySvg);
writeFileSync("dist/profile-monthly.svg", monthSvg);
console.log(`Generated weekly and monthly contribution charts from ${calendar.totalContributions} contributions over the past year.`);
