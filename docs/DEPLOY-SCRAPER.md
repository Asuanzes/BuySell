# Desplegar el sidecar de scraping en el VPS (F1 · opción A)

> El sidecar (`scripts/scraper-service.mjs`) da a la API un **navegador real**
> (Playwright/Chromium) para cuando el fetch HTTP plano falla por JS/anti-bot
> ligero. Hoy en producción NO existe (solo local en `127.0.0.1:4201`), así que
> el recheck degradaba a `blocked`. Aquí lo alojamos en el **VPS** (Hetzner
> `167.233.16.6`, donde ya vive el gateway WS del chat) y lo exponemos por
> nginx con token.

```
Vercel (runner del recheck)
   │  POST https://ws.nidokey.es/scraper/fetch   (Authorization: Bearer <token>)
   ▼
nginx (ws.nidokey.es, certbot)
   │  proxy_pass http://127.0.0.1:4201/
   ▼
sidecar systemd (127.0.0.1:4201)  →  Playwright/Chromium
```

El sidecar solo escucha en `127.0.0.1`; nginx es la frontera pública y el token
protege el `/fetch` (el `/healthz` queda abierto para monitoreo).

---

## 1. En el VPS — código y dependencias

```bash
# El repo es público; clona solo la rama por defecto.
sudo mkdir -p /opt/nidokey-scraper
sudo git clone --depth 1 https://github.com/Asuanzes/Nidokey.git /opt/nidokey-scraper

# Crea un package.json MÍNIMO (el sidecar solo necesita playwright, no todo el repo).
sudo tee /opt/nidokey-scraper/package.json > /dev/null <<'EOF'
{ "name": "nidokey-scraper", "private": true, "dependencies": { "playwright": "^1.60.0" } }
EOF

cd /opt/nidokey-scraper
sudo npm install --omit=dev
# Descarga Chromium + dependencias de sistema (pide sudo por --with-deps).
sudo npx playwright install --with-deps chromium

# Prueba manual (debe imprimir "listening on http://127.0.0.1:4201").
sudo SCRAPER_PORT=4201 SCRAPER_HOST=127.0.0.1 node scripts/scraper-service.mjs
# Ctrl+C para pararla; ahora la montamos como servicio.
```

## 2. En el VPS — servicio systemd

```bash
# Entorno con el token (genera uno: openssl rand -hex 32).
sudo tee /etc/nidokey-scraper.env > /dev/null <<'EOF'
SCRAPER_PORT=4201
SCRAPER_HOST=127.0.0.1
SCRAPER_TOKEN=REEMPLAZA_POR_UN_HEX_32
EOF
sudo chmod 600 /etc/nidokey-scraper.env

# Crea el usuario de servicio si no existe (mismo que el gateway):
sudo useradd --system --no-create-home nidokey || true

# Instala el unit (el del repo, adaptado a tu despliegue):
sudo install -m 644 /opt/nidokey-scraper/gateway/nidokey-scraper.service \
  /etc/systemd/system/nidokey-scraper.service
sudo systemctl daemon-reload
sudo systemctl enable --now nidokey-scraper
sudo systemctl status nidokey-scraper   # active (running)

# Healthcheck local:
curl -s http://127.0.0.1:4201/healthz
# → {"ok":true,...}
```

## 3. En el VPS — nginx (server block de ws.nidokey.es)

Añade dentro del `server { ... }` que ya sirve `ws.nidokey.es` (el de certbot):

```nginx
location /scraper/ {
    proxy_pass http://127.0.0.1:4201/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Authorization $http_authorization;
    proxy_read_timeout 60s;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
# Prueba a través de nginx con el token:
curl -s https://ws.nidokey.es/scraper/healthz
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://fotocasa.es/","timeoutMs":20000}' \
  https://ws.nidokey.es/scraper/fetch | head -c 200
# → {"ok":true,"html":"<html...","status":200,...} (o un anti-bot razonable)
```

## 4. En Vercel — variables de entorno

En el proyecto (Production, y Previews si quieres):

| Variable | Valor |
|---|---|
| `SCRAPER_URL` | `https://ws.nidokey.es/scraper` |
| `SCRAPER_TOKEN` | el mismo `SCRAPER_TOKEN` de `/etc/nidokey-scraper.env` |

A partir de ahí, cuando `loadPage` detecte `blocked` en el fetch HTTP plano,
llamará al sidecar del VPS en vez de degradar. Sin redeploy de código: basta
redeploy de las env (o el próximo push).

## 5. Verificación end-to-end

- Recheck manual de un anuncio de Fotocasa/Pisos desde la app (botón de la
  ficha) → debería dejar de verse "No se pudo comprobar el anuncio".
- Con **F0 ya desplegado**, los `listing_recheck` con `outcome=ok` por portal en
  el dashboard (`docs/ANALITICA.md`) te dirán si la tasa sube tras el cambio.

## Notas y límites

- **IP fija española** (buena para portales ES) pero fija: mantener cadencia
  conservadora (el runner ya pausa 1 s por anuncio y `staleAfterHours=22`).
- **No usar contra DataDome** (Idealista/Milanuncios/Yaencontre siguen
  manual-only): no eludir sus protecciones.
- El `MemoryMax=2G` de systemd reinicia el proceso si Chromium se dispara; el
  idle-close (5 min) libera RAM.
- Si Chromium no arranca bajo el sandbox del unit, comenta
  `ProtectSystem=strict` / `ProtectHome=true` en `/etc/systemd/system/nidokey-scraper.service`.
- El runner sigue en Vercel (función de 300 s). **Siguiente paso (F1-parte 2)**:
  mover el runner entero al VPS con un timer de systemd + `DATABASE_URL` de Neon
  para quitar también el límite de tiempo.
