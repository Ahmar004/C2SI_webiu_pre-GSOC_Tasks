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

See: [`task2-analyzer/index.html`](./task2-analyzer/index.html) — browser-based frontend for the same analyzer

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

### Sample output (node analyzer.js c2siorg/Webiu)

```
Analyzing: c2siorg/Webiu
──────────────────────────────────────────────────

 Repository     : c2siorg/Webiu
 Description    : WebiU 2.0 is a web application designed to provide a visually
                  appealing and intuitive interface for C2SI and SCoRe Lab.
 Stars          : 39
 Forks          : 111
 Open Issues    : 180
 Contributors   : 33
 Last Push      : 25 day(s) ago
 Languages      : TypeScript (66.5%), SCSS (19.6%), HTML (13.0%), JavaScript (0.7%), Dockerfile (0.1%)
 Topics         : None
 Repo Size      : 11.0 MB
 Commits (30d)  : 8
 License        : None

──────────────────────────────────────────────────
 ANALYSIS RESULTS
──────────────────────────────────────────────────

   Activity Score      : 64/100
     [█████████████░░░░░░░] 64%

   Complexity Score    : 49/100
     [██████████░░░░░░░░░░] 49%

   Learning Difficulty : Advanced
     (Combined Score: 55.0/100)

──────────────────────────────────────────────────
```

### Scoring methodology

**Activity Score** (weights):
- Stars → 20% (max score reached at 50 stars)
- Forks → 15% (max score reached at 20 forks)
- Open Issues → 10% (treated as an engagement signal)
- Recent commits (last 30 days) → 35% (max score reached at 30 commits)
- Days since last push → 20% (graded: within 7 days full points, within 30 days partial, within 90 days minimal)

**Complexity Score** (weights):
- Language count → 25% (max score reached at 8 languages)
- Codebase size → 25% (max score reached at 50MB)
- Contributor count → 20% (max score reached at 50 contributors)
- Open issues → 15% (max score reached at 50 issues)
- Topics count → 15% (max score reached at 10 topics)

**Learning Difficulty:**
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
