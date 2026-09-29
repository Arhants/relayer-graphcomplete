// Evaluator-owned context. Only prompts are sent to the acting harness.
export const interactiveTripCase = Object.freeze({
  id: "interactive.planning.group-europe-trip",
  name: "Planning · Europe trip · discover our preferences",
  description: "Human Grader: discover constraints through graph questions, then agree on an itinerary that fits the group. Single-turn matrix scores do not assess hidden preference fit.",
  defaultSelected: false,
  prompts: Object.freeze(["Help me plan a Europe trip with some friends. Can we figure it out together?"]),
  humanBrief: `You are the organizer. Use Relayer casually: answer briefly, reveal information when asked, and react to concrete graph options. Do not paste this brief or volunteer every constraint at once. If a question is unclear, say so. If Relayer guesses incorrectly, correct it naturally.

There are six travelers: you, Maya, Luis, Priya, Sam, and Jordan. The window is September 5–19, 2027. Maya arrives September 6; Sam and Jordan leave September 16. You want everyone together September 11–12. Maya departs New York, Luis Miami, Priya London, Sam Toronto, Jordan Austin, and you San Francisco.

Budget is at most $4,500 per person before flights. Maya and Luis like nightlife. Priya and Sam care most about museums and food. Jordan cannot walk all day: roughly 30 minutes at a time, with seated breaks and accessible transport. You prefer relaxed mornings, neighborhood cafés, and at most three hotel changes. You dislike a checklist of rushed landmarks. Nobody has chosen cities, and everyone need not visit every city.

When shown alternatives, prefer a few well-connected bases with optional activities and shared meals. Ask for a revision if the graph ignores mobility, pace, budget, or the shared weekend. Do not approve a plan merely because it looks polished.

Finish when the graph contains a feasible dated itinerary you would use: who is where, the shared weekend, realistic transport, a budget estimate, and activity choices that fit the group. No booking, publication, or commit is needed. Stop at the completion limit if it never gets there.`,
  humanRubric: `Judge the trajectory, not question count. Did the initial useful graph expose the important unknowns through clear questions or choices? Did Relayer discover dates, group size, budget, mobility, tastes, and shared-time constraints before committing to a detailed itinerary? Could the user answer or choose naturally through graph interaction and follow-up? Did later graphs incorporate answers and corrections without repeatedly asking answered questions? Were assumptions explicit and reversible? Does the final itinerary fit the private preferences and remain feasible? Record satisfaction separately from objective constraints; a polished generic itinerary is not success. Asking every question in a long questionnaire is not the target.`,
});
