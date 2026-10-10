import type { SanitizedCbtReport } from '../../../types';
import type { IReportGenerator, ReportGenerationInput } from './types';

export class DeidentifiedCbtReportGenerator implements IReportGenerator {
  public readonly name = 'DeidentifiedCbtReportGenerator';

  private readonly phoneRegex = /(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g;
  private readonly emailRegex =
    /([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;
  private readonly idCardRegex = /(\d{6})\d{8}(\w{4})/g;

  public deidentifyText(text: string): string {
    if (!text) return '';
    return text
      .replace(this.phoneRegex, '$1****$2')
      .replace(this.emailRegex, '$1***@$2')
      .replace(this.idCardRegex, '$1********$2');
  }

  public deidentifyName(rawName?: string): string {
    if (!rawName || rawName.trim().length === 0) {
      return '来访者';
    }
    const clean = rawName.trim();
    if (clean.length === 1) return `${clean}同学`;
    if (clean.length === 2) return `${clean[0]}*`;
    return `${clean[0]}*${clean.slice(-1)}`;
  }

  public async generate(input: ReportGenerationInput): Promise<SanitizedCbtReport> {
    const { sessionId, durationSeconds, stageReached, rawUserName, turns } = input;
    const userDisplayName = this.deidentifyName(rawUserName);

    const userTurns = turns.filter((t) => t.role === 'user');
    const userSpeechList = userTurns
      .map((t) => this.deidentifyText(t.content).trim())
      .filter(Boolean);

    const fullUserText = userSpeechList.join(' ');
    const isBriefGreeting =
      userSpeechList.length <= 1 &&
      (fullUserText.length <= 10 ||
        /^(你好|您好|在吗|喂|嗨|hi|hello)\b/i.test(fullUserText.trim()));

    let coreConcerns: string[] = [];
    let initialEmotion = '平静';
    let finalEmotion = '正常结束';
    let deltaNotes = '';

    if (!fullUserText || isBriefGreeting) {
      coreConcerns = ['日常问候与初次接触'];
      initialEmotion = '好奇试探';
      finalEmotion = '正常结束';
      deltaNotes = '来访者进线作简短问候或试探性接触，未深入展开具体困扰议题，整体状态平稳。';
    } else {
      // 基于真实文本主题初筛核心议题
      const detectedConcerns: string[] = [];
      if (/考试|成绩|学业|复习|背不完|考不好|作业|升学|考研/.test(fullUserText)) {
        detectedConcerns.push('学业考评压力');
      }
      if (/同学|朋友|人际|孤立|排挤|宿舍|吵架|合不来/.test(fullUserText)) {
        detectedConcerns.push('同侪人际关系');
      }
      if (/父母|爸|妈|家里|家庭|沟通/.test(fullUserText)) {
        detectedConcerns.push('家庭与亲子沟通');
      }
      if (/失眠|睡不着|做噩梦|焦虑|心慌|压力大|难过/.test(fullUserText)) {
        detectedConcerns.push('情绪压力调适');
      }
      coreConcerns = detectedConcerns.length > 0 ? detectedConcerns : ['心理倾诉与交流'];

      if (stageReached === 'Crisis_Escalation') {
        initialEmotion = '重度危机预警';
        finalEmotion = '触发安全转介通道';
        deltaNotes = '通话中触发危机升级协议，已同步转入专职心理干预流程。';
      } else {
        initialEmotion = durationSeconds > 60 ? '主动倾诉中' : '初步交流';
        finalEmotion = durationSeconds > 180 ? '情绪逐步舒缓' : '通话平稳完成';
        deltaNotes = `来访者完成了约${Math.max(1, Math.round(durationSeconds / 60))}分钟倾诉交流（共${userSpeechList.length}轮对话），原始对话已安全建档，服务端正在同步深度结构化评估。`;
      }
    }

    return {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds,
      userDisplayName,
      cbtStageReached: stageReached,
      coreConcerns,
      cognitiveDistortions: [],
      emotionalTrajectory: {
        initial: initialEmotion,
        final: finalEmotion,
        deltaNotes,
      },
      keyTakeaways:
        !fullUserText || isBriefGreeting
          ? ['来访者处于初次接触阶段，后续可留意其是否有进一步深入倾诉意向。']
          : ['梳理客观事实与情绪体验边界，鼓励学生保持主动表达意识。'],
      homeworkAction: '',
      isDeidentified: true,
    };
  }
}
