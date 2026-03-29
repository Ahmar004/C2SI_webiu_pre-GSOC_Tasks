# WebiU Pre-GSoC Tasks 2026
**Submitted by: Ahmar Ali**
**GitHub:** github.com/Ahmar004
**Email:** ahmarali2004@gmail.com

---

## Task 1 — Design: Scalable GitHub Data Aggregation System

See: [`task1-design/DESIGN.md`](./task1-design/DESIGN.md)

The design document covers:
- Full system architecture with component diagram
- Cache layer strategy with TTL breakdown per data type
- Rate limit handling using ETags, exponential backoff, and request batching
- Real-time update strategy using smart polling
- Scalability considerations for production

---

## Task 2 — Development: GitHub Repository Intelligence Analyzer

See: [`task2-analyzer/analyzer.js`](./task2-analyzer/analyzer.js)

### What it does

A Node.js CLI tool that analyzes any GitHub repository and generates three scores:

- **Activity Score (0–100):** Based on stars, forks, open issues, commits in the last 30 days, and recency of last push
- **Complexity Score (0–100):** Based on number of languages, codebase size, contributor count, open issues, and topics
- **Learning Difficulty:** Derived label — Beginner / Intermediate / Advanced / Expert

### How to run

```bash
# No dependencies — uses only Node.js built-in modules
node analyzer.js <owner/repo>

# Example
node analyzer.js c2siorg/Webiu

# With GitHub token (recommended to avoid rate limits)
GITHUB_TOKEN=your_token node analyzer.js c2siorg/Webiu
```

### Sample output

```
🔍 Analyzing: c2siorg/Webiu
──────────────────────────────────────────────────

📦 Repository     : c2siorg/Webiu
📝 Description    : Dynamic organization website fetching real-time GitHub data
⭐ Stars          : 87
🍴 Forks          : 134
🐛 Open Issues    : 23
👥 Contributors   : 28
📅 Last Push      : 2 day(s) ago
🔤 Languages      : JavaScript (44.1%), TypeScript (29.4%), CSS (11.8%), HTML (7.8%)
📏 Repo Size      : 12.1 MB
🔄 Commits (30d)  : 18

──────────────────────────────────────────────────
📊 ANALYSIS RESULTS
──────────────────────────────────────────────────

  🚀 Activity Score      : 84/100
     [█████████████████░░░] 84%

  🧠 Complexity Score    : 44/100
     [█████████░░░░░░░░░░░] 44%

  🎓 Learning Difficulty : 🟠 Advanced
     (Combined Score: 60.0/100)

──────────────────────────────────────────────────
```

### Scoring methodology

**Activity Score** (weights):
- Stars → 20% (capped at 1000 stars for max score)
- Forks → 15%
- Open Issues → 10% (engagement signal)
- Recent commits (30 days) → 35%
- Days since last push → 20%

**Complexity Score** (weights):
- Language count → 25%
- Codebase size → 25%
- Contributor count → 20%
- Open issues → 15%
- Topics count → 15%

**Learning Difficulty**:
```
Combined = (Activity × 0.4) + (Complexity × 0.6)

< 25  → Beginner
< 50  → Intermediate
< 75  → Advanced
≥ 75  → Expert
```

### Design decisions

- Zero external dependencies — uses only Node.js built-in `https` module
- All GitHub API calls run in parallel using `Promise.all` for speed
- Graceful error handling for 404 (repo not found) and 403 (rate limit hit)
- Optional GitHub token via environment variable to increase rate limit from 60/hr to 5,000/hr
