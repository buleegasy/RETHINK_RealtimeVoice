import app from '../../worker/src/index';

/**
 * Cloudflare Pages Functions 统一 API 网关
 * 职责：
 * 1. 本地直跑后端 Hono App（随 Cloudflare Pages 自动秒级构建发布，零脱节，零假数据）
 * 2. 对 WebSocket Upgrade 请求透明代理至语音流转网关
 */
export async function onRequest(context) {
  const { request, env } = context;

  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    if (!env.WORKER_ORIGIN) {
      return app.fetch(request, env, context);
    }
    const url = new URL(request.url);
    let targetOrigin = '';
    try {
      targetOrigin = new URL(env.WORKER_ORIGIN).origin;
    } catch {
      targetOrigin = '';
    }
    if (!targetOrigin || targetOrigin === url.origin) {
      return app.fetch(request, env, context);
    }
    const targetUrl = new URL(url.pathname + url.search, env.WORKER_ORIGIN);
    let upstreamRes;
    try {
      upstreamRes = await fetch(targetUrl.toString(), request);
    } catch (fetchErr) {
      console.warn('[PagesFunctions] 代理至上游网关异常，自动回退本地边缘执行:', fetchErr);
      return app.fetch(request, env, context);
    }
    if (upstreamRes.status === 101 && upstreamRes.webSocket) {
      const pair = new WebSocketPair();
      const [clientWs, serverWs] = Object.values(pair);
      serverWs.accept();
      const upstreamWs = upstreamRes.webSocket;
      upstreamWs.accept();

      serverWs.addEventListener('message', (event) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(event.data);
        }
      });
      upstreamWs.addEventListener('message', (event) => {
        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(event.data);
        }
      });
      serverWs.addEventListener('close', (event) => {
        try {
          upstreamWs.close(event.code, event.reason);
        } catch {}
      });
      upstreamWs.addEventListener('close', (event) => {
        try {
          serverWs.close(event.code, event.reason);
        } catch {}
      });
      serverWs.addEventListener('error', () => {
        try {
          upstreamWs.close(1011, 'Client socket error');
        } catch {}
      });
      upstreamWs.addEventListener('error', () => {
        try {
          serverWs.close(1011, 'Upstream socket error');
        } catch {}
      });

      return new Response(null, {
        status: 101,
        webSocket: clientWs,
      });
    }

    return upstreamRes;
  }

  return app.fetch(request, env, context);
}
