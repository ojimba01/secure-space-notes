// PDF.js 5.x requires Promise.withResolvers, which Safari only added in 17.4.
// Polyfill it for older browsers (runs on the main thread and, via the worker
// entry, inside the PDF.js worker).
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
