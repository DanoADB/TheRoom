import { z } from "zod";

const FEEDBACK_REACTION_VALUES = ["helpful", "interesting", "funny", "push_back_more", "go_deeper", "too_much", "too_meta", "missed_point"] as const;

export const FEEDBACK_REACTIONS = [
  { value: "helpful", label: "Helpful", emoji: "👍", kind: "positive" },
  { value: "interesting", label: "Interesting", emoji: "💡", kind: "positive" },
  { value: "funny", label: "Made me laugh", emoji: "😄", kind: "positive" },
  { value: "push_back_more", label: "Push back more", emoji: "🥊", kind: "positive" },
  { value: "go_deeper", label: "Go deeper", emoji: "🔎", kind: "positive" },
  { value: "too_much", label: "Too much / too long", emoji: "🪶", kind: "corrective" },
  { value: "too_meta", label: "Too meta", emoji: "🎭", kind: "corrective" },
  { value: "missed_point", label: "Missed the point", emoji: "👎", kind: "corrective" },
] as const;

export const FeedbackReactionValue = z.enum(FEEDBACK_REACTION_VALUES);
export type FeedbackReactionValue = z.infer<typeof FeedbackReactionValue>;

export const FEEDBACK_VALUE_TO_DB = {
  helpful: "HELPFUL",
  interesting: "INTERESTING",
  funny: "FUNNY",
  push_back_more: "PUSH_BACK_MORE",
  go_deeper: "GO_DEEPER",
  too_much: "TOO_MUCH",
  too_meta: "TOO_META",
  missed_point: "MISSED_POINT",
} as const;

export const FEEDBACK_DB_TO_VALUE = Object.fromEntries(
  Object.entries(FEEDBACK_VALUE_TO_DB).map(([value, databaseValue]) => [databaseValue, value]),
) as Record<(typeof FEEDBACK_VALUE_TO_DB)[FeedbackReactionValue], FeedbackReactionValue>;

export type FeedbackCounts = Partial<Record<FeedbackReactionValue, number>>;

export function formatFeedbackCounts(counts: FeedbackCounts) {
  return FEEDBACK_REACTIONS
    .filter((reaction) => (counts[reaction.value] ?? 0) > 0)
    .map((reaction) => `${counts[reaction.value]} ${reaction.label.toLowerCase()}`)
    .join(", ");
}
