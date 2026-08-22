/**
 * Next.js instrumentation entry point.
 *
 * Compiled for BOTH the Node.js and Edge runtimes. Everything the schedulers
 * need (Prisma, ioredis) is Node-only, so the import lives inside a positive
 * `NEXT_RUNTIME === "nodejs"` branch: the Edge build substitutes the literal
 * "edge" here, the branch becomes dead code, and the bundler drops the import
 * instead of trying — and failing — to resolve `stream`, `crypto`, `net` and
 * `dns` for the Edge target.
 *
 * See src/instrumentation-node.ts for what actually runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSchedulers } = await import("./instrumentation-node");
    await startSchedulers();
  }
}
