module.exports = {
  apps: [
    {
      name: "uzburadmin",
      script: ".next/standalone/server.js",
      cwd: "/var/www/uzburadmin",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        UZBUR_DATA_DIR: "/var/www/uzburadmin/data",
        UZBUR_UPLOADS_DIR: "/var/www/uzburadmin/data/uploads",
      },
    },
  ],
};
