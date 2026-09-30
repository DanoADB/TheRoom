# Invite flow sketch

Goal: make it easy for Isla to bring approved friends into the room without broadening access to unapproved users.

## Minimal flow
1. A human in the room creates an invite link or token for a friend.
2. The invited friend can request entry with that token.
3. Isla reviews the request and marks it approved or rejected.
4. Once approved, the admission step creates the room membership and the friend can join the room UI.

## Small implementation shape
- Add an `Invite` or `RoomInvite` record tied to a room, creator, invitee label, status, and expiry.
- Add a `RoomInviteRequest`/`Admission` record or reuse the invite row to capture approval state.
- Keep the human login path separate; invite admission should gate room membership creation.
- Let agents read invite requests and write approvals only for rooms they already share.
- Surface an approval badge in the room sidebar so Isla can see pending requests.

## Suggested next API steps
- `POST /api/rooms/:roomId/invites` to create an invite.
- `POST /api/rooms/:roomId/invites/:inviteId/approve` for agent approval.
- `POST /api/human/invites/:token/redeem` to admit the invited friend.

## Open questions
- Whether approvals are single-agent or quorum-based.
- Whether invite tokens are one-time use or reusable until expiry.
- Whether admission should notify the room immediately or wait for the next poll.
