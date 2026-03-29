# Task 1 — Design: Scalable GitHub Data Aggregation System
**Pre-GSoC Task 2026 | WebiU / C2SI**
**Author: Ahmar Ali | github.com/Ahmar004 | ahmarali2004@gmail.com**

---

## Problem Statement

WebiU needs to fetch live data from multiple GitHub repositories and serve it efficiently to a website. The challenges are:

- GitHub's REST API enforces strict rate limits (60 req/hr unauthenticated, 5,000 req/hr authenticated)
- Fetching fresh data on every page load is too slow and will hit rate limits quickly
- Multiple repositories need to be tracked simultaneously
- Data should feel "real-time" to the end user without being expensive to serve

This document proposes a scalable architecture that solves all three problems cleanly.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│                  WebiU React/Angular Frontend                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP requests
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                       │
│              (Node.js / Express or Serverless)               │
│   • Rate limiting per client                                 │
│   • Request routing                                          │
│   • Auth validation                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐     ┌───────────────────────┐
│    CACHE LAYER       │     │   AGGREGATOR SERVICE   │
│  (Redis / In-Memory) │     │   (Node.js workers)    │
│                      │     │                         │
│  Stores pre-fetched  │◄────│  Fetches from GitHub   │
│  repo data with TTL  │     │  Handles rate limits   │
│                      │     │  Runs on schedule      │
└─────────────────────┘     └──────────┬────────────┘
                                        │
                                        ▼
                          ┌─────────────────────────┐
                          │     GITHUB REST API      │
                          │  api.github.com/repos/   │
                          │  (Authenticated requests) │
                          └─────────────────────────┘
```

---

## Component Breakdown

### 1. Aggregator Service

A background Node.js service that runs on a scheduled interval (e.g., every 15 minutes using a cron job or GitHub Actions workflow). It is responsible for:

- Fetching data for all tracked repositories
- Normalizing the GitHub API response into a consistent internal data format
- Writing the results to the cache layer

**Key design decisions:**
- Requests are batched — instead of fetching all repos simultaneously, they are processed in groups of 5 to stay within rate limits
- Each request uses exponential backoff if a rate limit (429) or server error (5xx) is returned
- A single authenticated GitHub token is used, giving 5,000 requests/hour — enough to track ~200 repos every 15 minutes

**Pseudocode:**

```javascript
async function aggregateAllRepos(repoList) {
  const BATCH_SIZE = 5;
  const results = {};

  for (let i = 0; i < repoList.length; i += BATCH_SIZE) {
    const batch = repoList.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(repo => fetchWithRetry(repo))
    );
    batchResults.forEach((data, idx) => {
      results[batch[idx]] = normalizeRepoData(data);
    });
    await delay(1000); // 1 second pause between batches
  }

  await cache.setAll(results, TTL_SECONDS);
}
```

---

### 2. Cache Layer

A lightweight in-memory cache (or Redis for production) sits between the API gateway and the aggregator. Every piece of data served to the frontend comes from the cache — the GitHub API is never called in real-time on a user request.

**Cache strategy:**

| Data type | TTL | Reason |
|---|---|---|
| Repo metadata (stars, forks, description) | 15 minutes | Changes infrequently |
| Recent commits | 10 minutes | Changes more often |
| Contributors list | 60 minutes | Rarely changes |
| Languages breakdown | 60 minutes | Rarely changes |

**Cache invalidation:**
- TTL-based expiry is the primary mechanism — data expires automatically
- A manual refresh endpoint (`POST /api/refresh/:owner/:repo`) allows forcing a fresh fetch for a specific repo
- On startup, the aggregator pre-warms the cache for all tracked repos before any client requests come in

---

### 3. API Gateway Layer

A thin Node.js/Express layer that:

- Receives requests from the WebiU frontend
- Checks the cache first — if a cache hit, returns immediately (< 50ms)
- If cache miss (cold start or expired TTL), triggers a fresh fetch and waits for the result
- Applies per-client rate limiting to prevent abuse

**Cache hit flow (typical):**
```
Client → Gateway → Cache HIT → Return data (< 50ms)
```

**Cache miss flow (rare):**
```
Client → Gateway → Cache MISS → Aggregator → GitHub API → Cache → Return data
```

---

### 4. Real-Time Updates Strategy

For a website like WebiU where data changes infrequently, true real-time updates are not necessary. The recommended approach is **polling with smart TTL**:

- The frontend polls the API every 5 minutes using `setInterval`
- The API returns a `Last-Updated` timestamp with every response
- The frontend only re-renders if the timestamp has changed since the last fetch
- This gives the appearance of real-time without expensive WebSocket connections

For truly time-sensitive data (like live commit counts), a WebSocket connection can be layered on top of the same cache — the aggregator broadcasts an event when it writes new data to the cache, and the gateway forwards that event to subscribed clients.

---

### 5. Handling GitHub Rate Limits

Three mechanisms work together:

**A. Authenticated requests** — Using a GitHub personal access token gives 5,000 requests/hour instead of 60. For an org with 50+ repos, this is essential.

**B. Conditional requests** — GitHub supports `If-Modified-Since` and `ETag` headers. If the data has not changed since the last fetch, GitHub returns a `304 Not Modified` response that does not count against the rate limit. The aggregator stores ETags and sends them with every request.

**C. Exponential backoff** — If a `403` (rate limit exceeded) or `429` response is received, the aggregator waits and retries with increasing delays:

```javascript
async function fetchWithRetry(repo, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    const res = await githubRequest(`/repos/${repo}`);
    if (res.status === 200) return res.data;
    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers['retry-after'] || delay * (i + 1);
      await wait(retryAfter * 1000);
    }
  }
  throw new Error(`Failed to fetch ${repo} after ${retries} attempts`);
}
```

---

## Scalability Considerations

**Horizontal scaling:** The aggregator service is stateless — it reads from and writes to the shared cache. Multiple instances can run in parallel, each handling a subset of repos, without conflict.

**Adding more repos:** The system scales linearly. Adding 10 more repos to track costs 10 more API calls per aggregation cycle — within budget as long as the authenticated rate limit (5,000/hour) is not exceeded.

**Production deployment:** For production, Redis replaces the in-memory cache, giving persistence across server restarts and shared state across multiple API gateway instances.

---

## Why This Design Fits WebiU Specifically

WebiU already fetches GitHub data to display project information dynamically. The current architecture likely calls GitHub on every page load, which is fragile under load and will hit rate limits with a moderate number of visitors. This architecture moves all GitHub API interaction to a background process, making the website fast and resilient regardless of how many users are browsing simultaneously.

This is also the same pattern I used when building OFR and OCR — two open-source platforms that automate GitHub Actions workflows for 2,200+ community members. The GitHub API, rate limits, token management, and caching considerations are problems I have dealt with practically, which is part of why I am applying for this project.

---

## Summary

| Component | Technology | Role |
|---|---|---|
| Aggregator | Node.js + cron | Background GitHub data fetcher |
| Cache | Redis (or in-memory) | Fast data serving, TTL management |
| API Gateway | Node.js / Express | Client-facing API, cache-first |
| Frontend | React / Angular | Polls API, renders data |
| Rate limit handling | ETags + backoff + batching | Stays within GitHub limits |
