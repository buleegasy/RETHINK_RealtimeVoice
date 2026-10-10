export interface RemoteWebRtcSetupResult {
  remoteSource: MediaStreamAudioSourceNode | null;
  audioElement: HTMLAudioElement | null;
}

export async function setupRemoteWebRtcStream(
  ctx: AudioContext,
  stream: MediaStream,
  speakerAnalyserNode: AnalyserNode | null,
  existingAudioElement: HTMLAudioElement | null,
): Promise<RemoteWebRtcSetupResult> {
  let remoteSource: MediaStreamAudioSourceNode | null = null;
  try {
    remoteSource = ctx.createMediaStreamSource(stream);
    // 仅将远端音频轨接入 speakerAnalyserNode 用于电平监控与打断检测，绝不连接到 outputGainNode 或 ctx.destination！
    // 声音由下方的 HTMLAudioElement 硬件直通播放，杜绝双重播放与混响！
    if (speakerAnalyserNode) {
      remoteSource.connect(speakerAnalyserNode);
    }
  } catch (e) {
    console.warn('[AudioGraph] Web Audio 媒体流路由警告:', e);
  }

  let audioElement = existingAudioElement;
  if (typeof document !== 'undefined') {
    try {
      if (!audioElement) {
        audioElement = new Audio();
        audioElement.autoplay = true;
        // @ts-expect-error playsInline
        audioElement.playsInline = true;
      }
      audioElement.srcObject = stream;
      await audioElement.play().catch(() => {});
    } catch {}
  }

  return { remoteSource, audioElement };
}
