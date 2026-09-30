import 'dotenv/config';
import { createApp } from './app';
import { parseRuntimeConfig } from './config/runtime-config';
import { configureAuthAttemptLimits } from './middleware/ip-rate-limit';

const config = parseRuntimeConfig(process.env);
configureAuthAttemptLimits(config.authLoginAttemptLimit, config.authSignupAttemptLimit);
const app = createApp(config.trustProxyHops, config.releaseSha);

app.listen(config.port, () => {
  console.log(`mini-erp API listening on http://localhost:${config.port}`);
});
