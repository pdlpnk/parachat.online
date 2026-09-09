export async function register() {
  // Builds are offline; actual Node server startup must reject missing/invalid env.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { getServerEnv } = await import("./server/env");
    getServerEnv();
  }
}
