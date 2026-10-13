// Starts the ClassQuiz UI Preview dev server (gallery + renderer).
//   node server.mjs            -> http://localhost:9999
import { createConfig, loadVite, PORT } from "./uip.config.mjs";
import { fileURLToPath } from "node:url";

export async function startServer() {
  const { createServer } = await loadVite();
  const server = await createServer(await createConfig());
  try {
    await server.listen();
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = await startServer();
  console.log(`\n  ClassQuiz UI Preview  ->  http://127.0.0.1:${PORT}/\n`);
  const close = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
