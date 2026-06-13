// PM2 ecosystem — production process manager config
// Start: pm2 start infra/aws/ecosystem.config.js --env production
// Restart: pm2 restart aiql-web
// Logs: pm2 logs aiql-web

module.exports = {
  apps: [
    {
      name: "aiql-web",
      cwd:  "/home/ubuntu/aiql-erp/apps/web",
      script: "node_modules/.bin/next",
      args:   "start",
      interpreter: "none",      // next start is already a Node script
      env_production: {
        NODE_ENV: "production",
        PORT:     "3000",
      },
      // Restart policy
      max_restarts:    10,
      min_uptime:      "5s",
      restart_delay:   3000,
      // Logging
      out_file:  "/home/ubuntu/logs/aiql-web-out.log",
      error_file: "/home/ubuntu/logs/aiql-web-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Memory limit — t2.micro has 1 GB RAM
      max_memory_restart: "700M",
      // Single instance on t2.micro (1 vCPU)
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
