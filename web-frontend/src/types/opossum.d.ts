declare module 'opossum' {
  class CircuitBreaker {
    constructor(action: Function, options?: any);
    fire(...args: any[]): Promise<any>;
    opened: boolean;
    fallback(func: Function): void;
  }
  export default CircuitBreaker;
}
