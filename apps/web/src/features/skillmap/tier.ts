import type { PatternSkill } from '../../engine/skill'

/** Shared by the skill graph cards and the share image, so their colours always agree. */
export type MasteryTier = 'none' | 'low' | 'mid' | 'high'

export function masteryTier(skill: PatternSkill): MasteryTier {
  if (skill.attempts === 0 && skill.lcLogged === 0) return 'none'
  if (skill.mastery < 40) return 'low'
  if (skill.mastery < 70) return 'mid'
  return 'high'
}
