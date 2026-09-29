export async function register() {
  // Node only: the sweeper talks to the database, which the edge runtime can't.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startExpirySweeper } = await import("@/lib/expirySweeper");
    startExpirySweeper();
  }
}
