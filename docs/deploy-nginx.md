# Nginx + Node Deployment

This project is split into two deployable parts:

- `dist/`: static Vite frontend served by Nginx.
- `server-dist/`: compiled Node/Express API server used by `/api/proxy`.

## Build

```bash
npm install
npm run build:all
```

This produces:

```text
dist/
server-dist/
```

## Start API Server

Run the API server on localhost only:

```bash
PORT=8787 HOST=127.0.0.1 npm run start:api
```

With pm2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Health check:

```bash
curl -i http://127.0.0.1:8787/healthz
curl -i http://127.0.0.1:8787/api/proxy
```

`/api/proxy` should return `405 Method Not Allowed` for a GET request. That means the route exists and is waiting for POST requests from the frontend.

## Nginx

Point Nginx `root` to the frontend build directory and proxy `/api/proxy` to Node:

```nginx
server {
    listen 443 ssl http2;
    server_name sheny.zw-ai.com;

    root /www/wwwroot/sheny.zw-ai.com/dist;
    index index.html;

    client_max_body_size 30m;

    location /api/proxy {
        proxy_pass http://127.0.0.1:8787/api/proxy;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location /healthz {
        proxy_pass http://127.0.0.1:8787/healthz;
        proxy_http_version 1.1;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Reload Nginx:

```bash
nginx -t
nginx -s reload
```

Then verify:

```bash
curl -i https://sheny.zw-ai.com/api/proxy
```

Expected result:

```text
HTTP/2 405
```
