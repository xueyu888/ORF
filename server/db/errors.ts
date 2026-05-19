export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

export function isDatabaseUnavailableError(error: unknown) {
  const message = errorMessage(error);
  return /DrizzleQueryError|connect ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENOTFOUND|timeout exceeded|Connection terminated|database system is starting up|remaining connection slots are reserved/i.test(
    message,
  );
}

export function databaseUnavailablePayload() {
  return { error: "数据服务暂时不可用，请稍后重试。" };
}
