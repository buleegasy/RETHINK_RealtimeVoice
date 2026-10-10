import type { CbtCapsule } from './types';
import { SOMATIC_EMOTION_CAPSULES } from './capsules/somatic-emotion';
import { ACADEMIC_RELATIONAL_CAPSULES } from './capsules/academic-relational';

export const CBT_CAPSULES: CbtCapsule[] = [
  ...SOMATIC_EMOTION_CAPSULES,
  ...ACADEMIC_RELATIONAL_CAPSULES,
];

/**
 * 将核心 CBT 心理干预与应对策略胶囊提炼为高密度、精炼的系统提示词参考指南
 */
export function formatCbtCapsulesGuide(capsules: CbtCapsule[] = CBT_CAPSULES): string {
  const header =
    '【核心 CBT 心理干预与应对策略知识库】\n遇相关话题时融入日常自然口语回应，切忌生硬背诵：';
  const guidelines = capsules.map((c) => {
    const topic = c.title.replace(/^[^：]+：/, '');
    const taboos = c.tabooPhrases
      .slice(0, 2)
      .map((t) => `“${t}”`)
      .join('、');
    return `• [${c.category}] ${topic}：${c.content}（禁说：${taboos}）`;
  });
  return `${header}\n${guidelines.join('\n')}`;
}
