export type ReadinessResult = {
  status: 200 | 503;
  body: { status: "ready" | "not_ready"; database: "available" | "unavailable" };
};

/** DB driver also enforces query/connect timeouts; this bounds the HTTP response. */
export async function checkReadiness(probe: () => Promise<unknown>, timeoutMs = 3_000): Promise<ReadinessResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Readiness timeout")), timeoutMs);
      }),
    ]);
    return { status: 200, body: { status: "ready", database: "available" } };
  } catch {
    return { status: 503, body: { status: "not_ready", database: "unavailable" } };
  } finally {
    clearTimeout(timer);
  }
}
