import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callBackend } from './circuit-breaker';

describe('callBackend error forwarding tests', () => {
  beforeEach(() => {
    vi.stubEnv('RAG_BACKEND_URL', 'http://mock-backend:8000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should attach status and body on response failure', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Invalid parameters provided' }),
    };
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    try {
      await callBackend('/api/v1/test', {}, 'mock-token');
      expect.fail('Expected callBackend to throw');
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.body).toEqual({ detail: 'Invalid parameters provided' });
    }

    expect(fetchSpy).toHaveBeenCalled();
  });
});
