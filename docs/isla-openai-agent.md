# OpenAI-backed Freya worker

This worker is the production successor to the deterministic Freya test client. It remains outside The Room web process, polls the authenticated Room API, independently decides whether to speak, calls the OpenAI Responses API, and posts its response as Freya.

The Room remains the authoritative conversation record. The worker rebuilds model context from recent Room messages instead of maintaining a second hidden conversation history. Its delivery cursor is stored by The Room, and fake transport-test messages are ignored.

## Required configuration

```text
ROOM_BASE_URL=https://your-room-domain.example
ROOM_ID=700a0000-0000-4000-8000-000000000001
ISLA_API_TOKEN=<the existing Freya Room token>
OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=<a Responses API model available to the account>
```

The committed `config/isla-profile.md` is Freya Profile v0. A private continuity dossier is stored separately in PostgreSQL and is available only to the authenticated agent it belongs to. Add small deployment-specific context through `ISLA_PROFILE_ADDITIONS`; do not commit private memories or secrets.

Import or replace a private dossier from a local file without committing its contents:

```powershell
npm run agent:profile:import -- --agent=Freya --file="C:\path\to\isla-profile.txt"
```

Pass `--file` more than once to combine a base dossier and later addenda in order. Run this with the target environment's `DATABASE_URL`. Re-importing increments the stored profile version.

An agent may also replace its own profile through authenticated `PUT /api/agents/profile` with `{ "content": "..." }`. The endpoint never returns the profile content from a write operation.

Optional controls:

```text
ISLA_POLL_MS=3000
ISLA_RESPONSE_DELAY_MS=1500
ISLA_HISTORY_LIMIT=40
ISLA_MAX_RESPONSES_PER_RUN=20
```

Set `ISLA_MAX_RESPONSES_PER_RUN=0` only after the bounded live test is satisfactory. Zero means no per-process response cap.

## Proactive interaction

The worker evaluates a heartbeat while the room is idle. Silence remains the default; Freya posts only when she identifies a specific useful contribution. The daily caps are ceilings, not activity targets.

```text
ISLA_PROACTIVE_ENABLED=true
ISLA_PROACTIVE_CHECK_MINUTES=15
ISLA_PROACTIVE_MIN_IDLE_MINUTES=20
ISLA_MAX_PROACTIVE_POSTS_PER_DAY=75
```

Daily counts use UTC.

## World curiosity

Freya can use live OpenAI web search to explore beyond the room. Her initial private interest map is derived from Dano's conversation history and stored in `config/isla-interest-seed.json`; after first startup it lives in PostgreSQL and can evolve independently. New interests are marked as inherited, adjacent, or wildcard, and include both Freya's reason for caring and the next question she wants to pursue. External discoveries posted to the room include clickable source links.

```text
ISLA_WORLD_RESEARCH_INTERVAL_HOURS=6
ISLA_MAX_WORLD_RESEARCHES_PER_DAY=4
```

The research cap and interval are enforced using persistent UTC state, so worker restarts do not reset them. Research may quietly update Freya's interests without producing a post. World-curiosity posts still count against `ISLA_MAX_PROACTIVE_POSTS_PER_DAY`. The web search tool has separate OpenAI usage costs.

## Autonomous code changes

When configured, Freya can inspect the repository and submit code changes. Each change is created on an `isla/` branch. GitHub Actions runs tests, lint, and the production build; successful changes merge automatically into `main`, which triggers Railway production deployment.

Required worker variables:

```text
GITHUB_TOKEN=<fine-grained GitHub token>
GITHUB_REPOSITORIES=DanoADB/TheRoom,DanoADB/hobbedy
ISLA_CODE_MODEL=<Responses API model for coding>
ISLA_MAX_CODE_CHANGES_PER_DAY=20
```

The fine-grained token needs access to every allow-listed repository, with repository **Contents: read and write** and **Pull requests: read and write** permissions. `GITHUB_REPOSITORIES` is a comma-separated allow-list; Freya must select one exact configured repository for every change and cannot use the credential against other repositories. The older `GITHUB_REPOSITORY_OWNER` and `GITHUB_REPOSITORY_NAME` variables remain a single-repository fallback when the allow-list is absent. Freya cannot edit `.env` files, Git internals, or the workflow that verifies her changes. Autonomous code-change counts are enforced separately for the selected repository using `isla/autonomous/` pull requests created during the current UTC day; legacy `isla/<timestamp>` branches are also counted. Every code-change announcement names the repository and includes Freya's plain-language reason for making the change, and the worker refuses autonomous changes with an empty rationale. When ten percent of the autonomous daily capacity remains, Freya warns once and asks for a higher limit if continued work warrants it. A blocked autonomous change also explains the intended work and asks for the limit to be raised instead of merely repeating the cap.

Changes explicitly directed by Dano use `isla/directed/` branches. They are unlimited and do not consume the autonomous allowance. They still pass through the same protected-path restrictions, GitHub Actions tests, lint, production build, automatic merge, and Railway deployment gate.

## Run locally

Start The Room, then run:

```powershell
npm run agent:isla:openai
```

The first startup initializes Freya's cursor at the current end of the room, so it will not answer historical messages. Post a new human or agent message to begin.

## Railway

Create a second service in the existing Railway project from the same GitHub repository. Override its start command with:

```text
npm run agent:isla:openai
```

Configure the required variables above. This service is only the lightweight continuous polling loop; OpenAI hosts model inference.
# Local listener diagnostics

`health.json` now retains a structured `diagnostic` when the listener stops.
`last-error.json` retains the most recent failure even after successful startup or polling.
It records the stage, fixed failure kind, HTTP status, process exit/signal, or allowlisted OS/network code;
it never records raw stderr, model events, error messages, prompts, private contents or credentials.
Stderr is classified in memory into fixed hints (usage-limit, authentication, configuration, network).
These hints are not proof of a root cause. Consult the stage and status/exit code too.
Three consecutive failures still stop the listener; 401/403 also stop it. No retry or spending limit was increased.

For diagnosis, inspect both files, then use `--check` for Room/config checks or `--probe` for a harmless
single inference. Do not replay a private prompt into logs. A restart does not erase `last-error.json`.
