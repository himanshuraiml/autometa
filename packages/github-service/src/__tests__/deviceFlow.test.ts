import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { parseDeviceTokenResponse, requestDeviceCode, pollDeviceToken } from '../deviceFlow';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseDeviceTokenResponse', () => {
  it('reports authorized with the access token on success', () => {
    const result = parseDeviceTokenResponse({ access_token: 'gho_abc', token_type: 'bearer', scope: 'repo' });
    expect(result).toEqual({ status: 'authorized', accessToken: 'gho_abc' });
  });

  it('reports authorization_pending while the user has not entered the code yet', () => {
    expect(parseDeviceTokenResponse({ error: 'authorization_pending' })).toEqual({ status: 'authorization_pending' });
  });

  it('reports slow_down and bumps the interval when GitHub echoes a new one', () => {
    expect(parseDeviceTokenResponse({ error: 'slow_down', interval: 10 })).toEqual({ status: 'slow_down', intervalSec: 10 });
  });

  it('reports slow_down and adds 5s to the previous interval when GitHub omits interval', () => {
    expect(parseDeviceTokenResponse({ error: 'slow_down' }, 5)).toEqual({ status: 'slow_down', intervalSec: 10 });
  });

  it('reports expired_token', () => {
    expect(parseDeviceTokenResponse({ error: 'expired_token' })).toEqual({ status: 'expired_token' });
  });

  it('reports access_denied when the user declines', () => {
    expect(parseDeviceTokenResponse({ error: 'access_denied' })).toEqual({ status: 'access_denied' });
  });

  it.each([
    'unsupported_grant_type',
    'incorrect_client_credentials',
    'incorrect_device_code',
    'device_flow_disabled',
    'some_future_error_code',
  ])('falls through to a generic error for "%s" without crashing', (error) => {
    const result = parseDeviceTokenResponse({ error, error_description: 'details' });
    expect(result).toEqual({ status: 'error', message: 'details' });
  });

  it('reports a generic error for an unreadable response', () => {
    expect(parseDeviceTokenResponse(null)).toEqual({ status: 'error', message: 'GitHub returned an unreadable response.' });
    expect(parseDeviceTokenResponse('not an object')).toEqual({ status: 'error', message: 'GitHub returned an unreadable response.' });
  });

  it('reports a generic error when the body has neither a token nor an error', () => {
    expect(parseDeviceTokenResponse({})).toEqual({ status: 'error', message: 'GitHub returned an unexpected response.' });
  });
});

describe('requestDeviceCode / pollDeviceToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('requests a device code from the documented endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ device_code: 'd', user_code: 'WDJB-MJHT', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
    );

    const result = await requestDeviceCode('client-id');

    expect(result.user_code).toBe('WDJB-MJHT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://github.com/login/device/code');
    expect(init.headers.Accept).toBe('application/json');
  });

  it('polls the access-token endpoint without a client secret', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'authorization_pending' }));

    const result = await pollDeviceToken('client-id', 'device-code');

    expect(result).toEqual({ status: 'authorization_pending' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://github.com/login/oauth/access_token');
    expect(String(init.body)).not.toContain('client_secret');
    expect(String(init.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code');
  });
});
