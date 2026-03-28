module.exports = {
  apps: [
    {
      name: "grist-guard-broker",
      script: "src/index.js",
      cwd: "/opt/grist-guard",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        BROKER_HOST: "127.0.0.1",
        BROKER_PORT: "8787",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      time: true,
    },
  ],
};
