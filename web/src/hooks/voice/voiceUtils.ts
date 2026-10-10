export function formatAudioInitError(err: any): string {
  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
    return '麦克风权限已被拒绝，请在浏览器地址栏中允许使用麦克风后重试';
  }
  if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
    return '未检测到可用的麦克风输入设备，请连接麦克风后重试';
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '浏览器安全限制：语音通话需要 HTTPS 安全环境支持';
  }
  if (err?.message) {
    return `启动失败: ${err.message}`;
  }
  return '麦克风设备授权或初始化失败';
}
