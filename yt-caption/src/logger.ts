const PREFIX = "[YTC]";
const noop = () => {};

const bind = import.meta.env.DEV
  ? (fn: (...args: unknown[]) => void) => fn.bind(console, PREFIX)
  : () => noop;

export const debug = bind(console.debug);
export const log = bind(console.log);
export const warn = bind(console.warn);
export const error = bind(console.error);

const logger = { debug, log, warn, error };
export default logger;
