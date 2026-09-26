import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3001);
const app = buildServer();
await app.listen({ port, host: "0.0.0.0" });
console.log(`sentinel api listening on :${port}`);
