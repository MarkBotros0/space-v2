import { createApp } from "./app";
import { config } from "./lib/config";

createApp().listen(config.port, () => {
  console.log(`space-v2 backend listening on :${config.port}`);
});
