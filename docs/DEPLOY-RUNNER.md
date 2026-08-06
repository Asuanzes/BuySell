# Desplegar el runner autónomo de recheck en el VPS (F1 · parte 2)

> Sustituye el cron `listings-check` de GitHub Actions (`curl` a
> `POST /api/listings/check`, tope de **300 s** de función) por un proceso que
> corre **directamente en el VPS** contra Neon, sin reloj de Vercel ni límite de
> tiempo: una pasada puede barrer todo el corpus con pausas reales.
>
> El runner usa `checkAllActiveListings` (`src/features/scraping/runner.ts`)
> compilado a un único archivo (`dist/runner.cjs`) con esbuild; `@prisma/client`
> queda externo y se copia su runtime generado. No hace falta `npm install` en
> el VPS (nada nuevo se descarga salvo, opcionalmente, el engine de Prisma).

```
timer systemd (cada 2 h, jitter)
   ▼
nidokey-runner.service (oneshot, /opt/nidokey-runner)
   │  node dist/runner.cjs
   ├── DATABASE_URL → Neon (pooled)
   └── SCRAPER_URL=http://127.0.0.1:4201  →  sidecar local (mismo VPS, sin nginx)
```

---

## 1. En tu máquina — generar el bundle (una vez por cambio del runner)

```bash
npm run build:runner      # esbuild → dist/runner.cjs (commitear este archivo)
npm run typecheck         # puerta: el código debe seguir limpio
git add -A && git commit -m "F1 (B): runner autónomo para el VPS" && git push origin main
```

- `dist/runner.cjs` **se commitea** (patrón `git pull` del VPS: allí no hay
  toolchain de build).
- Tras tocar `src/features/scraping/runner.ts` o dependencias, **rebuild +
  commit del bundle**.
- El `binaryTargets` de `prisma/schema.prisma` incluye `native` +
  `debian-openssl-3.0.x` + `debian-openssl-4.0.x`: al hacer `npx prisma generate`
  en tu máquina, el cliente generado lleva los engines de Linux para copiar.

## 2. En el VPS — código, runtime de Prisma y entorno

```bash
# Código (repo público; igual que el sidecar).
sudo mkdir -p /opt/nidokey-runner
cd /opt/nidokey-runner
sudo git init -q && sudo git remote add origin https://github.com/Asuanzes/Nidokey.git
sudo git fetch -q origin main && sudo git checkout -q -b main origin/main
# (o: sudo git clone --depth 1 https://github.com/Asuanzes/Nidokey.git .)

# Runtime de Prisma: copia desde tu máquina (Windows) al VPS los 3 directorios
# bajo node_modules/ (son independientes de plataforma salvo el engine, que ya
# va dentro de .prisma). En el VPS:
sudo mkdir -p /opt/nidokey-runner/node_modules/@prisma /opt/nidokey-runner/node_modules/.prisma

# Desde tu máquina (PowerShell), con scp/rsync:
scp -r node_modules/@prisma/client nidoadmin@167.233.16.6:/tmp/prisma-client
scp -r node_modules/.prisma     nidoadmin@167.233.16.6:/tmp/prisma-dot
# y en el VPS:
sudo cp -r /tmp/prisma-client/* /opt/nidokey-runner/node_modules/@prisma/
sudo cp -r /tmp/prisma-dot/*    /opt/nidokey-runner/node_modules/.prisma/
sudo chown -R nidokey:nidokey /opt/nidokey-runner

# Entorno (token del sidecar = el de /etc/nidokey-scraper.env).
sudo tee /etc/nidokey-runner.env > /dev/null <<'EOF'
DATABASE_URL=postgresql://…  # la pooled de Neon (misma que Vercel usa)
SCRAPER_URL=http://127.0.0.1:4201
SCRAPER_TOKEN=REEMPLAZA_POR_EL_TOKEN_DEL_SIDECAR
RUNNER_MAX_PER_RUN=1000
RUNNER_BUDGET_MS=0
RUNNER_STALE_AFTER_HOURS=22
EOF
sudo chmod 600 /etc/nidokey-runner.env

# Usuario de servicio (mismo que el gateway/sidecar).
sudo useradd --system --no-create-home nidokey || true
```

### Si el engine de Prisma no carga (error "unable to require the query engine")

El engine `debian-openssl-3.0.x` cubre OpenSSL 3.x. Si la distro del VPS trae
OpenSSL 4.x (posible en Ubuntu 26.04+), regenera el engine **en el VPS**, donde
Prisma detecta la plataforma real (no hace falta npm; el CLI se copia igual):

```bash
# Copia también el CLI de Prisma y el schema, y genera ahí:
scp -r node_modules/prisma   nidoadmin@167.233.16.6:/tmp/prisma-cli
sudo cp -r /tmp/prisma-cli/* /opt/nidokey-runner/node_modules/prisma/
scp prisma/schema.prisma nidoadmin@167.233.16.6:/tmp/
sudo mkdir -p /opt/nidokey-runner/prisma && sudo cp /tmp/schema.prisma /opt/nidokey-runner/prisma/
cd /opt/nidokey-runner && sudo -u nidokey npx prisma generate --schema prisma/schema.prisma
```

Diagnóstico: si arranca y muere con un error de engine, míralo en
`sudo journalctl -u nidokey-runner -n 30 --no-pager`. Si `prisma generate` en el
VPS tampoco reconoce la plataforma (OpenSSL más nuevo que lo que soporta Prisma
6.19), la solución es subir Prisma — que requiere `npm`, aplazado por la política
de seguridad de dependencias; hasta entonces el runner no corre en ese VPS.

## 3. En el VPS — servicio + timer

```bash
sudo install -m 644 /opt/nidokey-runner/gateway/nidokey-runner.service /etc/systemd/system/
sudo install -m 644 /opt/nidokey-runner/gateway/nidokey-runner.timer  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nidokey-runner.timer
sudo systemctl status nidokey-runner.timer   # active (waiting)

# Primera pasada manual (debe conectar a Neon, usar el sidecar local y escribir):
sudo systemctl start nidokey-runner
sudo journalctl -u nidokey-runner -n 50 --no-pager
# → "[runner] Pasada iniciada …" · líneas [runner] [i/N] ✓/✗/⊘ … · "[runner] RESUMEN …"
```

## 4. Desactivar el cron de GitHub Actions

Una vez verificadas 2-3 pasadas del timer, retira el `schedule` de
`.github/workflows/listings-check.yml` (o borra el workflow) para no tener dos
relojes compitiendo (los dos son idempotentes gracias al guard optimista, pero
duplican descargas). Si quieres conservarlo como respaldo, deja el
`workflow_dispatch` manual.

## 5. Verificación

- `journalctl -u nidokey-runner` muestra pasadas con `RESUMEN` y sin
  `stoppedEarly` (con `RUNNER_BUDGET_MS=0` nunca corta por tiempo).
- F0: `listing_recheck` sigue creciendo en `AnalyticsEvent` (mismo canal que
  antes — el runner emite los mismos eventos server-side).
- Frescura: `lastCheckedAt` de los listings sube aunque el corpus exceda 80;
  con `RUNNER_MAX_PER_RUN` amplio, la cola drena en una pasada.

## Notas y límites

- **Misma IP fija** del VPS que el sidecar: cadencia conservadora (2 h) y pausa
  de 1 s/anuncio ya integradas en el runner. No bajar `RUNNER_STALE_AFTER_HOURS`.
- Los **efectos secundarios** (alertas, avisos a conversaciones, push, bot) se
  ejecutan desde el VPS: `ANTHROPIC_API_KEY`/`GROQ_API_KEY` se leen de las env
  del proceso — si no quieres que el bot responda desde el VPS, deja esas
  variables fuera de `/etc/nidokey-runner.env` (las alertas seguirán
  funcionando; solo no habrá respuesta del bot @Nidokey en ese aviso).
- El bundle es CJS y usa `fetch` global (Node ≥ 20 en el VPS).
