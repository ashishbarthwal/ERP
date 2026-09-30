import 'dotenv/config';
import { createApp } from './app';
import { parseRuntimeConfig } from './config/runtime-config';

const config = parseRuntimeConfig(process.env);
const app = createApp();

app.listen(config.port, () => {
  console.log(`mini-erp API listening on http://localhost:${config.port}`);
});
