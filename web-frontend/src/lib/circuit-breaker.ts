import CircuitBreaker from 'opossum';
import { withRetry } from './retry';

interface CallBackendParams {
  path: string;
  body?: any;
  method?: string;
  token?: string;
}

const backendRequest = async ({ path, body, method = 'POST', token }: CallBackendParams) => {
  // maxAttempts=1: retries must NOT happen inside the circuit breaker's timeout window.
  // If the request fails, the breaker counts it as a failure and handles backoff via resetTimeout.
  return await withRetry(async () => {
    const backendUrl = `${process.env.RAG_BACKEND_URL || 'http://rag-backend:8000'}${path}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(backendUrl, fetchOptions);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || errJson.error || '';
      } catch {
        // ignore
      }
      throw new Error(errorDetail || `Backend responded with status: ${response.status}`);
    }

    return await response.json();
  }, 1); // maxAttempts=1 — no retry inside the circuit window
};

const options = {
  // 30 s: LLM intent classification + response generation via OpenRouter takes 5–10 s.
  // The spec's original 5 s was written for fast local APIs — this overrides it for the hosted LLM.
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
};

const breaker = new CircuitBreaker(backendRequest, options);

export async function callBackend(path: string, body?: any, token?: string, method: string = 'POST') {
  try {
    return await breaker.fire({ path, body, method, token });
  } catch (error: any) {
    if (breaker.opened || error?.code === 'EOPENBREAKER' || error?.message === 'OpenCircuitError') {
      return {
        type: 'circuit_open',
        text: 'Backend is currently unavailable. Please try again in a moment.',
        facts: [],
      };
    }
    throw error;
  }
}

