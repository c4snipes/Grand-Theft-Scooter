const WARNED_MESSAGES = new Set();

function buildDetails(context) {
  if (!context) {
    return "";
  }
  if (typeof context === "string") {
    return ` ${context}`;
  }
  try {
    return ` ${JSON.stringify(context)}`;
  } catch (error) {
    return ` ${String(context)}`;
  }
}

export function invariant(condition, message, context) {
  if (condition) return;
  const error = new Error(`${message}${buildDetails(context)}`);
  error.name = "InvariantViolation";
  throw error;
}

export function assertDefined(value, message, context) {
  invariant(value !== undefined && value !== null, message, context);
  return value;
}

export function warnOnce(key, message, context) {
  const identifier = key ?? message;
  if (WARNED_MESSAGES.has(identifier)) return;
  WARNED_MESSAGES.add(identifier);
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    if (context !== undefined) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }
}

export function noop() {}
