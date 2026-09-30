const secureEnvironments = new Set(['staging', 'production']);

export const secureCookiesAndTransport = (environment = process.env.NODE_ENV) =>
  secureEnvironments.has(environment ?? '');
