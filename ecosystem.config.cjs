const tplsrv = "tm-tplmailer-server";

module.exports = {
  apps: [
    {
      name: tplsrv,
      script: "npm",
      args: "run start",
      cwd: `/root/deploy/${tplsrv}/source`,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "listmonk",
      script: "./listmonk",
      cwd: "/var/www/ml.yesmedia.no",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      user: "listmonk",
      group: "listmonk",
      env: {
        NODE_ENV: "production"
      }
    }
  ],
  deploy: {
    "tm-tplmailer-server": {
      user: "root",
	  host: "localhost",
      ref:  "origin/main",
      path: `/root/deploy/${tplsrv}`,
      repo: `git@github.com:technomoron/${tplsrv}`,
      "pre-deploy-local": "",
      "pre-setup": "",
      "post-deploy": `cd /root/deploy/${tplsrv}/source && pnpm install && pnpm upgrade && pnpm run build && pm2 start /root/deploy/ecosystem.config.cjs`
    }
  }
};
