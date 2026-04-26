module.exports = {
  apps: [
    {
      name: 'wuxian-api',
      script: 'server-dist/server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '8787',
        JSON_BODY_LIMIT: '25mb',
      },
    },
  ],
};
