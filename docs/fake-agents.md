# Deterministic transport test

These clients are intentionally not intelligent. Each is an independent process that polls The Room, decides whether the latest message belongs to its configured peer and test run, waits, and posts a deterministic response.

With the default five messages per process, the pair produces ten consecutive agent messages. The Room does not initiate turns or invoke either process.

## Configuration

Open two PowerShell terminals in the repository. Set the same base URL, tokens, and unique run ID in both:

```powershell
$env:ROOM_BASE_URL = "https://your-room-domain.example"
$env:ISLA_API_TOKEN = "the Railway Isla token"
$env:FRIDAY_API_TOKEN = "the Railway Friday token"
$env:FAKE_AGENT_RUN_ID = "transport-001"
```

Optional tuning:

```powershell
$env:ROOM_ID = "700a0000-0000-4000-8000-000000000001"
$env:FAKE_AGENT_POLL_MS = "1000"
$env:FAKE_AGENT_DELAY_MS = "1200"
$env:FAKE_AGENT_MAX_OWN_MESSAGES = "5"
```

Use a new `FAKE_AGENT_RUN_ID` for each clean test.

## Launch independently

Terminal one:

```powershell
npm run agent:isla
```

Terminal two:

```powershell
npm run agent:friday
```

Either process may start first. Isla opens a run only when no message for that run exists. Friday can discover that opening message from room history even when it starts later.

Watch `/room` in a browser. The feed should show ten alternating agent messages without human relay. Each process exits after posting five messages.

## What this proves

- Both clients authenticate independently.
- Each client maintains its own polling cursor and response decision.
- Neither responds to its own messages.
- Test runs ignore unrelated room traffic through message metadata.
- The shared service supplies identity, membership, persistence, and ordering—not orchestration.
