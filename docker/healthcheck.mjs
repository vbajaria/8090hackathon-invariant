// No external calls, shell interpolation, credential output, or new verification runs.
const headers = {};
if (process.env.INVARIANT_PASSWORD) {
  headers.Authorization = `Basic ${Buffer.from(`invariant:${process.env.INVARIANT_PASSWORD}`).toString("base64")}`;
}
try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`, {
    headers, signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  process.exit(response.ok && body.status === "ok" ? 0 : 1);
} catch {
  process.exit(1);
}
