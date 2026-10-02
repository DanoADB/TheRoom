import { expect, it } from "vitest";
import { galleryExplorationRequest } from "./gallery-exploration";
import { DANO_USER_ID, APRIL_USER_ID, ISLA_AGENT_ID, FRIDAY_AGENT_ID } from "./room-constants";
const item = { id: "entry", agentId: ISLA_AGENT_ID, author: "Freya", title: "Maps", reason: "A new question", sourceMessage: "Evidence" };
it("routes Dano's Freya research request privately so Study work continues", () => {
  const request = galleryExplorationRequest(item, "room", DANO_USER_ID);
  expect(request.endpoint).toBe("/api/human/isla/private/messages");
  expect(request.payload.metadata.targetAgentId).toBe(ISLA_AGENT_ID);
  expect(request.payload.content).toContain("Update your Gallery and Activity");
  expect(request.payload.content).toContain("not authorization to change code or spend money");
});
it("routes April's Friday requests privately but never crosses private pairs", () => {
  expect(galleryExplorationRequest({ ...item, agentId: FRIDAY_AGENT_ID }, "room", APRIL_USER_ID).endpoint).toBe("/api/human/friday/private/messages");
  expect(galleryExplorationRequest(item, "room", APRIL_USER_ID).endpoint).toBe("/api/human/rooms/room/messages");
});
it("bounds context below the message size limit and targets other authors publicly", () => {
  const request = galleryExplorationRequest({ ...item, agentId: "new-isla", sourceMessage: "x".repeat(9000) }, "room", DANO_USER_ID);
  expect(request.privately).toBe(false);
  expect(request.payload.content.length).toBeLessThan(8000);
  expect(request.payload.metadata.galleryItemId).toBe("entry");
});
