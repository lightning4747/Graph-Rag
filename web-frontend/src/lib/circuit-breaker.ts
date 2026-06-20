import CircuitBreaker from 'opossum';

interface CallBackendParams {
  path: string;
  body: any;
  token?: string;
}

const backendRequest = async ({ path, body, token }: CallBackendParams) => {
  const backendUrl = `${process.env.RAG_BACKEND_URL || 'http://rag-backend:8000'}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

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
};

const options = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
};

const breaker = new CircuitBreaker(backendRequest, options);

export async function callBackend(path: string, body: any, token?: string) {
  try {
    return await breaker.fire({ path, body, token });
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
