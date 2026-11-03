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

const repos = await githubJson(`https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated`);
const languageCounts = new Map();
for (const repo of repos.filter((item) => !item.private && !item.fork && !item.archived && item.language)) {
  languageCounts.set(repo.language, (languageCounts.get(repo.language) ?? 0) + 1);
}
const languages = [...languageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
const langW = 960;
const langH = 300;
const barX = 240;
const barW = 560;
const rowY = 82;
const rowGap = 32;
const langMax = Math.max(1, ...languages.map(([, count]) => count));
const rows = languages.length
  ? languages.map(([name, count], index) => {
      const y = rowY + index * rowGap;
      const width = Math.max(8, (count / langMax) * barW);
      const opacity = 1 - index * 0.09;
      return `<text x="38" y="${y + 15}" fill="${colors.text}" font-family="Segoe UI,Arial,sans-serif" font-size="15">${name}</text><rect x="${barX}" y="${y}" width="${barW}" height="18" rx="9" fill="${colors.panel}"/><rect x="${barX}" y="${y}" width="${width.toFixed(1)}" height="18" rx="9" fill="${colors.blue}" opacity="${opacity}"/><text x="${barX + barW + 24}" y="${y + 15}" fill="${colors.pale}" font-family="Segoe UI,Arial,sans-serif" font-size="14">${count} repos</text>`;
    }).join("")
  : `<text x="38" y="112" fill="${colors.muted}" font-family="Segoe UI,Arial,sans-serif" font-size="15">No public repositories with a detected primary language yet.</text>`;
const langSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${langW}" height="${langH}" viewBox="0 0 ${langW} ${langH}" role="img" aria-labelledby="title desc">
<title id="title">Public repository languages</title><desc id="desc">Repository counts by primary language across public, non-fork repositories.</desc>
<rect width="${langW}" height="${langH}" rx="18" fill="${colors.bg}"/><rect x="1" y="1" width="${langW - 2}" height="${langH - 2}" rx="17" fill="none" stroke="${colors.grid}"/>
<text x="28" y="34" fill="${colors.text}" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="700">Public repository languages</text>
<text x="${langW - 28}" y="34" text-anchor="end" fill="${colors.muted}" font-family="Segoe UI,Arial,sans-serif" font-size="13">Primary language · repo counts</text>
${rows}</svg>`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/profile-activity.svg", activitySvg);
writeFileSync("dist/profile-languages.svg", langSvg);
console.log(`Generated activity chart (${calendar.totalContributions} yearly contributions) and language chart (${languages.length} public languages).`);
