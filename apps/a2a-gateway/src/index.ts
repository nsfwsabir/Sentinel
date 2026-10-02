import { buildGateway } from "./gateway.js";

const port = Number(process.env.A2A_PORT ?? 3002);
const app = buildGateway();
await app.listen({ port, host: "0.0.0.0" });
console.log(`sentinel a2a gateway listening on :${port}`);
