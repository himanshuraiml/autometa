/**
 * GitHub OAuth Device Authorization Flow (RFC 8628) — public-client flow, no
 * client secret. Same mechanism GitHub's own `gh` CLI uses for a trusted
 * first-party desktop tool.
 *
 * The polling loop/timer is intentionally NOT owned by this file — callers
 * (useGithubAuth) drive it — so parseDeviceTokenResponse stays a pure
 * function that's trivial to unit test against fixture JSON.
 */

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type DeviceTokenPollResult =
  | { status: 'authorized'; accessToken: string }
  | { status: 'authorization_pending' }
  | { status: 'slow_down'; intervalSec: number }
  | { status: 'expired_token' }
  | { status: 'access_denied' }
  | { status: 'error'; message: string };

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export const requestDeviceCode = async (
  clientId: string,
  scope = 'repo read:user'
): Promise<DeviceCodeResponse> => {
  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId, scope }),
  });
  if (!response.ok) {
    throw new Error(`GitHub device code request failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as DeviceCodeResponse;
};

/**
 * One poll attempt against the access-token endpoint. Callers should wait
 * `interval` seconds (adjusting per `slow_down`) between calls, per GitHub's
 * device flow docs.
 */
export const pollDeviceToken = async (
  clientId: string,
  deviceCode: string
): Promise<DeviceTokenPollResult> => {
  const response = await fetch(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const json = await response.json().catch(() => null);
  return parseDeviceTokenResponse(json, /* previousIntervalSec */ undefined);
};

/** Pure — takes the parsed JSON body (or null on unparseable responses). */
export const parseDeviceTokenResponse = (
  json: unknown,
  previousIntervalSec?: number
): DeviceTokenPollResult => {
  if (!json || typeof json !== 'object') {
    return { status: 'error', message: 'GitHub returned an unreadable response.' };
  }
  const data = json as Record<string, unknown>;

  if (typeof data.access_token === 'string' && data.access_token) {
    return { status: 'authorized', accessToken: data.access_token };
  }

  const error = typeof data.error === 'string' ? data.error : null;
  switch (error) {
    case 'authorization_pending':
      return { status: 'authorization_pending' };
    case 'slow_down': {
      const nextInterval =
        typeof data.interval === 'number' ? data.interval : (previousIntervalSec ?? 5) + 5;
      return { status: 'slow_down', intervalSec: nextInterval };
    }
    case 'expired_token':
      return { status: 'expired_token' };
    case 'access_denied':
      return { status: 'access_denied' };
    case null:
      return { status: 'error', message: 'GitHub returned an unexpected response.' };
    default:
      // unsupported_grant_type, incorrect_client_credentials, incorrect_device_code,
      // device_flow_disabled, and any future/undocumented error codes.
      return {
        status: 'error',
        message: typeof data.error_description === 'string' ? data.error_description : error,
      };
  }
};
