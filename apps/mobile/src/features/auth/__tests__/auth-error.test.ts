import { ApiRequestError } from '../../../api/client';
import { authErrorMessage } from '../auth-error';

describe('authErrorMessage', () => {
  it('passes through a real API error message unchanged', () => {
    const err = new ApiRequestError(422, 'VALIDATION', 'That email is already registered.');
    expect(authErrorMessage(err, 'fallback')).toBe('That email is already registered.');
  });

  it('uses the fallback for anything that is not an ApiRequestError', () => {
    expect(authErrorMessage(new Error('boom'), 'Could not sign in.')).toBe('Could not sign in.');
    expect(authErrorMessage('boom', 'Could not sign in.')).toBe('Could not sign in.');
  });

  it('names the server as unreachable for a network error, not the raw message', () => {
    const err = new ApiRequestError(0, 'NETWORK_ERROR', 'Network request failed');
    expect(authErrorMessage(err, 'fallback')).toMatch(/cannot reach the server/i);
  });
});
