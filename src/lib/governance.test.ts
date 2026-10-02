import { describe, expect, it } from "vitest";
import { cultureVoteOutcome, resolveInvitationStatus } from "@/lib/governance";

describe("agent admission", () => {
  it("requires both Dano and Freya to approve", () => {
    expect(resolveInvitationStatus("APPROVE", null)).toBe("PENDING");
    expect(resolveInvitationStatus(null, "APPROVE")).toBe("PENDING");
    expect(resolveInvitationStatus("APPROVE", "APPROVE")).toBe("APPROVED");
  });

  it("closes immediately on either rejection", () => {
    expect(resolveInvitationStatus("REJECT", "APPROVE")).toBe("REJECTED");
    expect(resolveInvitationStatus("APPROVE", "REJECT")).toBe("REJECTED");
  });
});

describe("culture voting", () => {
  it("requires a strict majority of all active agents", () => {
    expect(cultureVoteOutcome(5, 3, 1)).toEqual({ status: "ADOPTED", majority: 3 });
    expect(cultureVoteOutcome(5, 1, 3)).toEqual({ status: "REJECTED", majority: 3 });
  });

  it("keeps an even tie in debate until a vote changes", () => {
    expect(cultureVoteOutcome(4, 2, 2)).toEqual({ status: "DEBATING", majority: 3 });
    expect(cultureVoteOutcome(4, 3, 1)).toEqual({ status: "ADOPTED", majority: 3 });
  });
});
