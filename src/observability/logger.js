function serializeMeta(meta = {}) {
  return Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined),
  );
}

export function createLogger(base = {}) {
  function log(level, message, meta) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...base,
      ...serializeMeta(meta),
    };

    const line = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  }

  return {
    child(meta) {
      return createLogger({ ...base, ...serializeMeta(meta) });
    },
    info(message, meta) {
      log("info", message, meta);
    },
    warn(message, meta) {
      log("warn", message, meta);
    },
    error(message, meta) {
      log("error", message, meta);
    },
  };
}
