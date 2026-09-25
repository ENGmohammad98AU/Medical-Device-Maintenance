import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosAdapter } from 'axios';
import api, { authService, SESSION_EXPIRED_MESSAGE, tokenIsCurrent } from './auth';

const token = (offsetSeconds = 1800, subject = 'engineer') =>
  `header.${btoa(JSON.stringify({sub: subject, exp: Math.floor(Date.now() / 1000) + offsetSeconds}))}.signature`;
const originalAdapter = api.defaults.adapter;
let unsubscribe: (() => void) | undefined;
let onExpired: ReturnType<typeof vi.fn>;

function respond(status: number, detail = 'Could not validate credentials') {
  const adapter = vi.fn<AxiosAdapter>(async config => {
    const response = {status, statusText: '', config, headers: {}, data: {detail}};
    if (status >= 400) throw new AxiosError(detail, 'ERR_BAD_RESPONSE', config, {}, response);
    return response;
  });
  api.defaults.adapter = adapter;
  return adapter;
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  onExpired = vi.fn();
  unsubscribe = authService.onSessionExpired(onExpired);
});
afterEach(() => {
  unsubscribe?.(); api.defaults.adapter = originalAdapter; vi.unstubAllGlobals();
});

describe('API session validation for local analysis', () => {
  it.each([null, 'invalid', 'a.b.c', token(-5), 'a.' + btoa('{}') + '.c'])(
    'rejects absent, corrupt or expired credentials before making a request: %s', async value => {
      if (value) authService.setAuthToken(value);
      localStorage.setItem('user', '{invalid JSON');
      const adapter = respond(200);
      await expect(authService.getCurrentUser()).rejects.toMatchObject({response: {status: 401, data: {detail: SESSION_EXPIRED_MESSAGE}}});
      expect(adapter).not.toHaveBeenCalled();
      expect(onExpired).toHaveBeenCalledOnce();
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });

  it('attaches the latest stored token to protected requests', async () => {
    const adapter = respond(200);
    authService.setAuthToken(token());
    await authService.getCurrentUser();
    const next = token(1800, 'other-engineer');
    authService.setAuthToken(next);
    await api.post('/api/intelligent-support/prepare-support', {});
    expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBe(`Bearer ${next}`);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('detects expiry while the local model was running', async () => {
    authService.setAuthToken(token(-1));
    const adapter = respond(200);
    await expect(api.post('/api/fault-reports/analyze', {})).rejects.toMatchObject({response: {status: 401}});
    expect(adapter).not.toHaveBeenCalled();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('invalidates a server-rejected token even when its local expiry is still valid', async () => {
    authService.setAuthToken(token());
    respond(401);
    await expect(authService.getCurrentUser()).rejects.toMatchObject({response: {status: 401, data: {detail: SESSION_EXPIRED_MESSAGE}}});
    expect(onExpired).toHaveBeenCalledOnce();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it.each([403, 500])('does not log out for a %s permission/server error', async status => {
    const current = token(); authService.setAuthToken(current); respond(status);
    await expect(api.get('/api/devices/')).rejects.toMatchObject({response: {status}});
    expect(localStorage.getItem('token')).toBe(current);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('keeps login errors separate from expired sessions', async () => {
    const adapter = respond(401, 'Incorrect username or password');
    await expect(authService.login({username: 'engineer', password: 'wrong'}))
      .rejects.toMatchObject({response: {data: {detail: 'Incorrect username or password'}}});
    expect(adapter.mock.calls[0][0].headers.get('Authorization')).toBeUndefined();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not let a delayed 401 erase a newer login', async () => {
    const old = token(), newer = token(1900);
    authService.setAuthToken(old);
    api.defaults.adapter = async config => {
      authService.setAuthToken(newer);
      throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, {}, {
        status: 401, statusText: '', config, headers: {}, data: {},
      });
    };
    await expect(authService.getCurrentUser()).rejects.toMatchObject({response: {status: 401}});
    expect(localStorage.getItem('token')).toBe(newer);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('does not treat decoded JWT claims as signature verification', () => {
    expect(tokenIsCurrent(token())).toBe(true);
    // Such a forged token must still be rejected by the real /me endpoint.
    expect(tokenIsCurrent(token(-1))).toBe(false);
  });
});
