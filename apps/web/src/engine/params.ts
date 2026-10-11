/**
 * Every tunable number in the skill engine and recommender, in one place.
 *
 * v1 values are hand-set guesses. Phase 9 re-estimates them from logged
 * usage and ships a new version of this object; bump `version` whenever a
 * value changes so logged recommendations can be tied to the params that
 * produced them.
 */
export const PARAMS = {
  version: 'v1-handset-2026-10-11',

  elo: {
    /** Prior standard deviation of ability before any evidence. */
    priorSd: 1.5,
    /** Learning rate starts at kMax and decays toward kMin with practice. */
    kMax: 0.8,
    kMin: 0.15,
    kHalfLife: 8,
    /** Items move slower than people: they are shared across many responses. */
    itemK: 0.1,
    /** Drill item difficulty priors on the logit scale. */
    difficultyPrior: { easy: -1, medium: 0, hard: 1 },
  },

  lc: {
    /** Elo score per outcome: only unaided solves count fully. */
    outcomeScore: { unaided: 1, hints: 0.5, viewed: 0 },
    /** Full problems are harder than 60-second drills, so their priors sit higher. */
    difficultyPrior: { easy: 0, medium: 1, hard: 2 },
    /** Rough minutes to budget per problem. */
    minutes: { easy: 15, medium: 25, hard: 40 },
  },

  rec: {
    /** Target band for predicted success: hard enough to learn from. */
    targetP: [0.6, 0.75],
    /** A stretch pick is at least this much less likely than the main picks... */
    stretchGap: 0.1,
    /** ...but not below this. */
    stretchFloor: 0.2,
    /** Until FSRS lands, a pattern is due for review after this long without practice. */
    fadingMs: 7 * 24 * 60 * 60 * 1000,
    /** A practiced prerequisite below this mastery holds its dependants back. */
    weakPrereqMastery: 40,
    weights: { fit: 1.5, fading: 0.3, prereq: 0.5 },
    /** Uniform tie-breaking noise in [0, scale). Logged so propensities can be recovered. */
    noise: { drill: 0.25, lc: 0.1 },
  },

  select: {
    /** Don't repeat any of the last few drill items while others are available. */
    recentExclude: 8,
  },

  session: {
    /** Sessions this long (or unlimited) include one LeetCode problem... */
    lcTaskMinSession: 30,
    /** ...after this many warm-up drills... */
    lcTaskAfterDrills: 3,
    /** ...keeping this many minutes free afterwards. */
    lcTaskSlackMin: 2,
  },
} as const

export type Params = typeof PARAMS
