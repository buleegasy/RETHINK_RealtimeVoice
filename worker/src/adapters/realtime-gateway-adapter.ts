/**
 * Realtime 实时网关协议适配层 (RealtimeGatewayAdapter)
 * 向上保持 100% 静态方法与类型签名契约，底层委托至 gateway 子模块
 */

import type { Env } from '../types';
import type { RealtimeGatewayConfig } from './gateway/types';
import {
  isDirectLiveEndpoint,
  resolveGatewayConfig,
  buildUpstreamWsUrl,
  buildSidebandAttachWsUrl,
  buildUpstreamClientSecretsUrl,
  buildUpstreamWebRtcUrl,
  formatRealtimeError,
  safeClose,
} from './gateway/gateway-urls';
import { createEphemeralToken, negotiateWebRtcOffer } from './gateway/webrtc-negotiator';
import {
  DEFAULT_COMPANION_INSTRUCTIONS,
  resolveInstructionsWithMemory,
  resolveTurnDetection,
  buildSessionStartPayload,
  normalizeSessionUpdatePayload,
  buildUpstreamSessionPayload,
} from './gateway/session-payloads';
import { transformClientEvent, transformUpstreamEvent } from './gateway/event-transformer';

export type { RealtimeGatewayConfig };

export class RealtimeGatewayAdapter {
  public static readonly DEFAULT_COMPANION_INSTRUCTIONS = DEFAULT_COMPANION_INSTRUCTIONS;

  public static isDirectLiveEndpoint(url: string): boolean {
    return isDirectLiveEndpoint(url);
  }

  public static resolveGatewayConfig(env: Env, requestedModel?: string): RealtimeGatewayConfig {
    return resolveGatewayConfig(env, requestedModel);
  }

  public static buildUpstreamWsUrl(baseUrl: string, model: string): string {
    return buildUpstreamWsUrl(baseUrl, model);
  }

  public static buildSidebandAttachWsUrl(baseUrl: string, sessionId: string): string {
    return buildSidebandAttachWsUrl(baseUrl, sessionId);
  }

  public static buildUpstreamClientSecretsUrl(baseUrl: string): string {
    return buildUpstreamClientSecretsUrl(baseUrl);
  }

  public static createEphemeralToken(
    config: RealtimeGatewayConfig,
    sessionParams?: Record<string, unknown>,
  ) {
    return createEphemeralToken(config, sessionParams);
  }

  public static buildUpstreamWebRtcUrl(baseUrl: string, model: string): string {
    return buildUpstreamWebRtcUrl(baseUrl, model);
  }

  public static negotiateWebRtcOffer(
    config: RealtimeGatewayConfig,
    sdpOffer: string,
    sessionParams?: Record<string, unknown>,
  ) {
    return negotiateWebRtcOffer(config, sdpOffer, sessionParams);
  }

  public static resolveTurnDetection(incoming: any) {
    return resolveTurnDetection(incoming);
  }

  public static resolveInstructionsWithMemory(instructions: string, currentMemory?: any): string {
    return resolveInstructionsWithMemory(instructions, currentMemory);
  }

  public static buildSessionStartPayload(
    incoming: any,
    currentMemory?: any,
    upstreamModel?: string,
  ) {
    return buildSessionStartPayload(incoming, currentMemory, upstreamModel);
  }

  public static normalizeSessionUpdatePayload(incoming: any, currentMemory?: any) {
    return normalizeSessionUpdatePayload(incoming, currentMemory);
  }

  public static buildUpstreamSessionPayload(
    cleanSession: Record<string, unknown>,
    upstreamModel?: string,
  ) {
    return buildUpstreamSessionPayload(cleanSession, upstreamModel);
  }

  public static transformClientEvent(eventData: any, isDirectLive: boolean) {
    return transformClientEvent(eventData, isDirectLive);
  }

  public static transformUpstreamEvent(payload: any, isDirectLive: boolean) {
    return transformUpstreamEvent(payload, isDirectLive);
  }

  public static formatRealtimeError(code: string, message: string): string {
    return formatRealtimeError(code, message);
  }

  public static safeClose(ws: WebSocket, code?: number, reason?: string): void {
    safeClose(ws, code, reason);
  }
}
