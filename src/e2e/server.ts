import { createServer } from "node:http";

const host = process.env.E2E_HOST ?? "127.0.0.1";
const port = parsePort(process.env.E2E_PORT);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", service: "pdp-behavior-e2e" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, host, () => {
  console.log(`[e2e] scaffold server listening on http://${host}:${port}`);
});

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 4173;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(
      `Invalid E2E_PORT: "${value}". Use an integer from 1 to 65535.`
    );
  }

  return parsed;
}
