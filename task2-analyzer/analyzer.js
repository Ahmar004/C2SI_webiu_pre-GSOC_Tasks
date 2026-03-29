/**
 * GitHub Repository Intelligence Analyzer
 * Pre-GSoC Task 2 — WebiU / C2SI
 * Author: Ahmar Ali | github.com/Ahmar004
 *
 * Analyzes a GitHub repository and generates:
 *  - Activity Score
 *  - Project Complexity Score
 *  - Estimated Learning Difficulty
 */

const https = require("https");

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""; // optional but recommended
const REPO_INPUT = process.argv[2]; // e.g. "c2siorg/Webiu"

if (!REPO_INPUT || !REPO_INPUT.includes("/")) {
  console.error(
    '\nUsage: node analyzer.js <owner/repo>\nExample: node analyzer.js c2siorg/Webiu\n'
  );
  process.exit(1);
}

const [OWNER, REPO] = REPO_INPUT.split("/");

// ─── GITHUB API HELPER ───────────────────────────────────────────────────────

function githubRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path,
      method: "GET",
      headers: {
        "User-Agent": "webiu-gsoc-analyzer",
        Accept: "application/vnd.github.v3+json",
        ...(GITHUB_TOKEN && { Authorization: `token ${GITHUB_TOKEN}` }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ─── SCORING FUNCTIONS ───────────────────────────────────────────────────────

/**
 * ACTIVITY SCORE (0–100)
 * Based on: recent commits, open issues, stars, forks, last push date
 */
function calculateActivityScore(repo, recentCommits) {
  let score = 0;

  // Stars (max 20 pts)
  score += Math.min(repo.stargazers_count / 50, 1) * 20;

  // Forks (max 15 pts)
  score += Math.min(repo.forks_count / 20, 1) * 15;

  // Open issues as engagement signal (max 10 pts)
  score += Math.min(repo.open_issues_count / 30, 1) * 10;

  // Recent commits in last 30 days (max 35 pts)
  score += Math.min(recentCommits / 30, 1) * 35;

  // Last push recency (max 20 pts)
  const daysSinceLastPush =
    (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLastPush <= 7) score += 20;
  else if (daysSinceLastPush <= 30) score += 14;
  else if (daysSinceLastPush <= 90) score += 7;
  else score += 0;

  return Math.round(Math.min(score, 100));
}

/**
 * COMPLEXITY SCORE (0–100)
 * Based on: language count, codebase size, open issues, contributors, topics
 */
function calculateComplexityScore(repo, languages, contributors) {
  let score = 0;

  // Number of languages used (max 25 pts)
  const langCount = Object.keys(languages).length;
  score += Math.min(langCount / 8, 1) * 25;

  // Repo size in KB (max 25 pts)
  score += Math.min(repo.size / 50000, 1) * 25;

  // Contributors count (max 20 pts)
  score += Math.min(contributors / 50, 1) * 20;

  // Open issues (proxy for ongoing complexity) (max 15 pts)
  score += Math.min(repo.open_issues_count / 50, 1) * 15;

  // Topics as maturity signal (max 15 pts)
  score += Math.min((repo.topics?.length || 0) / 10, 1) * 15;

  return Math.round(Math.min(score, 100));
}

/**
 * LEARNING DIFFICULTY (derived from activity + complexity)
 * Returns: Beginner / Intermediate / Advanced / Expert
 */
function estimateLearningDifficulty(activityScore, complexityScore) {
  const combined = activityScore * 0.4 + complexityScore * 0.6;

  if (combined < 25) return { level: "Beginner", emoji: "🟢", combined };
  if (combined < 50) return { level: "Intermediate", emoji: "🟡", combined };
  if (combined < 75) return { level: "Advanced", emoji: "🟠", combined };
  return { level: "Expert", emoji: "🔴", combined };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function analyzeRepo() {
  console.log(`\n🔍 Analyzing: ${OWNER}/${REPO}\n${"─".repeat(50)}`);

  // Fetch all data in parallel where possible
  const [repoRes, langRes, contribRes, commitsRes] = await Promise.all([
    githubRequest(`/repos/${OWNER}/${REPO}`),
    githubRequest(`/repos/${OWNER}/${REPO}/languages`),
    githubRequest(`/repos/${OWNER}/${REPO}/contributors?per_page=100`),
    githubRequest(
      `/repos/${OWNER}/${REPO}/commits?since=${new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString()}&per_page=100`
    ),
  ]);

  if (repoRes.status === 404) {
    console.error(`❌ Repository "${REPO_INPUT}" not found.`);
    process.exit(1);
  }

  if (repoRes.status === 403) {
    console.error(
      `❌ Rate limit hit. Set GITHUB_TOKEN environment variable and try again.`
    );
    process.exit(1);
  }

  const repo = repoRes.data;
  const languages = langRes.data || {};
  const contributors = Array.isArray(contribRes.data) ? contribRes.data : [];
  const recentCommits = Array.isArray(commitsRes.data)
    ? commitsRes.data.length
    : 0;

  // Calculate scores
  const activityScore = calculateActivityScore(repo, recentCommits);
  const complexityScore = calculateComplexityScore(
    repo,
    languages,
    contributors.length
  );
  const difficulty = estimateLearningDifficulty(activityScore, complexityScore);

  // Top languages by bytes
  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0);
  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, bytes]) => `${lang} (${((bytes / totalBytes) * 100).toFixed(1)}%)`);

  // Days since last push
  const daysSince = Math.floor(
    (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // ─── OUTPUT REPORT ──────────────────────────────────────────────────────────
  console.log(`
📦 Repository     : ${repo.full_name}
📝 Description    : ${repo.description || "N/A"}
⭐ Stars          : ${repo.stargazers_count.toLocaleString()}
🍴 Forks          : ${repo.forks_count.toLocaleString()}
🐛 Open Issues    : ${repo.open_issues_count}
👥 Contributors   : ${contributors.length}
📅 Last Push      : ${daysSince} day(s) ago
🔤 Languages      : ${topLanguages.join(", ") || "N/A"}
📌 Topics         : ${repo.topics?.join(", ") || "None"}
📏 Repo Size      : ${(repo.size / 1024).toFixed(1)} MB
🔄 Commits (30d)  : ${recentCommits}
📄 License        : ${repo.license?.name || "None"}

${"─".repeat(50)}
📊 ANALYSIS RESULTS
${"─".repeat(50)}

  🚀 Activity Score      : ${activityScore}/100
     ${renderBar(activityScore)}

  🧠 Complexity Score    : ${complexityScore}/100
     ${renderBar(complexityScore)}

  🎓 Learning Difficulty : ${difficulty.emoji} ${difficulty.level}
     (Combined Score: ${difficulty.combined.toFixed(1)}/100)

${"─".repeat(50)}
`);
}

function renderBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${score}%`;
}

analyzeRepo().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
