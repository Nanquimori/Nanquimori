import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const login = "Nanquimori";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
}

const now = new Date();
const from = new Date(now);
from.setUTCFullYear(from.getUTCFullYear() - 1);

const query = `
query ProfileDashboard($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER) {
      totalCount
      nodes { stargazerCount forkCount }
    }
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { contributionCount date weekday }
        }
      }
    }
  }
}`;

const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Nanquimori-profile-dashboard"
    },
    body: JSON.stringify({
        query,
        variables: { login, from: from.toISOString(), to: now.toISOString() }
    })
});

if (!response.ok) {
    throw new Error(`GitHub GraphQL returned ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const user = payload.data.user;
const calendar = user.contributionsCollection.contributionCalendar;
const repositories = user.repositories.nodes;
const stars = repositories.reduce((sum, repository) => sum + repository.stargazerCount, 0);
const forks = repositories.reduce((sum, repository) => sum + repository.forkCount, 0);
const weeks = calendar.weeks;
const counts = weeks.flatMap((week) => week.contributionDays.map((day) => day.contributionCount));
const max = Math.max(1, ...counts);

const colors = ["#211C19", "#4A1115", "#710C12", "#A40D15", "#D94A4F"];
const colorFor = (count) => {
    if (count === 0) return colors[0];
    const level = Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
    return colors[level];
};

const cell = 12;
const gap = 4;
const gridX = 184;
const gridY = 131;
const cells = [];
const labels = [];
let previousMonth = -1;

weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
        const date = new Date(`${day.date}T00:00:00Z`);
        const x = gridX + weekIndex * (cell + gap);
        const y = gridY + day.weekday * (cell + gap);
        cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colorFor(day.contributionCount)}"><title>${day.date}: ${day.contributionCount}</title></rect>`);
        if (day.weekday === 0 && date.getUTCMonth() !== previousMonth && weekIndex > 1) {
            previousMonth = date.getUTCMonth();
            const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date).toUpperCase();
            labels.push(`<text x="${x}" y="112" class="month">${month}</text>`);
        }
    });
});

const generated = now.toISOString().slice(0, 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="306" viewBox="0 0 1160 306" role="img" aria-labelledby="title desc">
<title id="title">Nanquimori activity dashboard</title>
<desc id="desc">${calendar.totalContributions} contributions over the last year, rendered in a black ink and crimson palette.</desc>
<style>
text{font-family:Consolas,'Courier New',monospace}.heading{fill:#F2EEE9;font-size:25px;font-weight:700}.eyebrow{fill:#D94A4F;font-size:13px;letter-spacing:3px}.stat{fill:#F2EEE9;font-size:30px;font-weight:700}.label{fill:#948A82;font-size:12px;letter-spacing:1px}.month{fill:#68615C;font-size:10px}.day{fill:#68615C;font-size:10px}
</style>
<rect x="1" y="1" width="1158" height="304" rx="18" fill="#14110F" stroke="#453A33" stroke-width="2"/>
<rect x="1" y="1" width="11" height="304" rx="6" fill="#C31922"/>
<text x="42" y="50" class="eyebrow">ACTIVITY // LAST 365 DAYS</text>
<text x="42" y="82" class="heading">Marcas deixadas no código</text>
<g transform="translate(42 124)">
  <text y="24" class="stat">${calendar.totalContributions}</text><text y="46" class="label">CONTRIBUTIONS</text>
  <text y="92" class="stat">${user.repositories.totalCount}</text><text y="114" class="label">PUBLIC REPOS</text>
  <text y="160" class="stat">${stars}</text><text y="182" class="label">STARS</text>
</g>
${labels.join("")}
<text x="151" y="151" class="day">SUN</text><text x="151" y="183" class="day">TUE</text><text x="151" y="215" class="day">THU</text><text x="151" y="247" class="day">SAT</text>
${cells.join("")}
<g transform="translate(915 268)"><text x="0" class="label">LESS</text>${colors.map((color, index) => `<rect x="${43 + index * 20}" y="-11" width="12" height="12" rx="3" fill="${color}"/>`).join("")}<text x="151" class="label">MORE</text></g>
<text x="184" y="280" class="label">UPDATED ${generated}  •  ${forks} PUBLIC FORKS</text>
</svg>`;

const here = dirname(fileURLToPath(import.meta.url));
await writeFile(resolve(here, "../assets/dashboard.svg"), svg, "utf8");
