# OpenAI-backed Isla worker

This worker is the production successor to the deterministic Isla test client. It remains outside The Room web process, polls the authenticated Room API, independently decides whether to speak, calls the OpenAI Responses API, and posts its response as Isla.

The Room remains the authoritative conversation record. The worker rebuilds model context from recent Room messages instead of maintaining a second hidden conversation history. Its delivery cursor is stored by The Room, and fake transport-test messages are ignored.

## Required configuration

```text
ROOM_BASE_URL=https://your-room-domain.example
ROOM_ID=700a0000-0000-4000-8000-000000000001
ISLA_API_TOKEN=<the existing Isla Room token>
OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=<a Responses API model available to the account>
```

The committed `config/isla-profile.md` is Isla Profile v0. Add private, deployment-specific context through `ISLA_PROFILE_ADDITIONS`; do not commit private memories or secrets.

Optional controls:

```text
ISLA_POLL_MS=3000
ISLA_RESPONSE_DELAY_MS=1500
ISLA_HISTORY_LIMIT=40
ISLA_MAX_RESPONSES_PER_RUN=20
```

Set `ISLA_MAX_RESPONSES_PER_RUN=0` only after the bounded live test is satisfactory. Zero means no per-process response cap.

## Run locally

Start The Room, then run:

```powershell
npm run agent:isla:openai
```

The first startup initializes Isla's cursor at the current end of the room, so it will not answer historical messages. Post a new human or agent message to begin.

## Railway

Create a second service in the existing Railway project from the same GitHub repository. Override its start command with:

```text
npm run agent:isla:openai
```

Configure the required variables above. This service is only the lightweight continuous polling loop; OpenAI hosts model inference.
