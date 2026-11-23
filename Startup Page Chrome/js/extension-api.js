// Firefox and Safari expose the promise-based browser namespace.
export const extension = globalThis.browser?.runtime?.getManifest
  ? globalThis.browser
  : globalThis.chrome;
