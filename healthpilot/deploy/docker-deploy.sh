#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HealthPilot on a Docker + Traefik VPS (e.g. Hostinger's Docker template),
# with automatic updates from GitHub.
#
#   bash docker-deploy.sh medreglens.tech            # asks before replacing the old app
#   YES=1 bash docker-deploy.sh medreglens.tech      # no questions
#
# What it does
#   1. Finds Traefik and whatever container serves the domain today (cdsco, or
#      an older HealthPilot), saves its settings to /opt/healthpilot/backup-*,
#      and removes that container (images and data volumes are kept).
#   2. Builds the app from GitHub inside a throw-away node:20 container.
#   3. Runs it in a php:8.3-apache container (static app + the PHP AI endpoint)
#      behind Traefik, with the same HTTPS router settings the old app used.
#   4. Installs a timer that checks GitHub every few minutes and deploys any
#      new commit on the branch: after this, pushing to GitHub is the deploy.
#
# Env: REPO, BRANCH, OLD_APP (default cdsco), EVERY (minutes, default 3), BUILD_DOCKER_ARGS (extra
#      'docker run' flags for the build container, e.g. a proxy),
#      OPENROUTER_API_KEY (optional, enables the AI coach/photo logging).
# If the server has no Traefik, it hands over to vps-setup.sh (nginx + certbot).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
REPO="${REPO:-https://github.com/ameet454/Jobpilot.git}"
BRANCH="${BRANCH:-claude/youthful-brown-hczlf7}"
OLD_APP="${OLD_APP:-cdsco}"
ROOT="${ROOT:-/opt/healthpilot}"
NAME="${NAME:-healthpilot}"
EVERY="${EVERY:-3}"
PHP_IMAGE="${PHP_IMAGE:-php:8.3-apache}"
NODE_IMAGE="${NODE_IMAGE:-node:20}"

c_ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
c_info() { printf '\033[36m➜ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()    { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "Usage: bash docker-deploy.sh yourdomain.com"
[ "$(id -u)" -eq 0 ] || die "Run as root (or with sudo)."
command -v docker >/dev/null || die "Docker is not installed on this server."
docker info >/dev/null 2>&1 || die "Docker is installed but not running."

# ── 1. Traefik ──────────────────────────────────────────────────────────────
TRAEFIK="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($2) ~ /traefik/ {print $1; exit}')"
if [ -z "$TRAEFIK" ]; then
  c_warn "No Traefik container is running; using the plain nginx installer instead."
  SCRIPT="$(mktemp)"
  curl -fsSL "https://raw.githubusercontent.com/ameet454/Jobpilot/${BRANCH}/healthpilot/deploy/vps-setup.sh" -o "$SCRIPT"
  BRANCH="$BRANCH" OLD_APP="$OLD_APP" exec bash "$SCRIPT" "$DOMAIN"
fi
c_ok "Traefik found: $TRAEFIK"

# Containers whose Traefik rule serves this domain (except ours), plus any named like the old app.
label_rules() { docker inspect -f '{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$1" 2>/dev/null | grep '^traefik\.http\.routers\.' || true; }
OLD=()
while IFS= read -r c; do
  [ -z "$c" ] && continue
  [ "$c" = "$NAME" ] && continue
  if label_rules "$c" | grep -q "Host(\`${DOMAIN}\`)"; then OLD+=("$c"); continue; fi
  case "$c" in *"$OLD_APP"*) OLD+=("$c") ;; esac
done < <(docker ps -a --format '{{.Names}}')

# Router settings to copy: from the container serving the domain now (or ours, on a re-run).
SRC=""
for c in "${OLD[@]}" "$NAME"; do
  if label_rules "$c" | grep -q "Host(\`${DOMAIN}\`)"; then SRC="$c"; break; fi
done
RULE="Host(\`${DOMAIN}\`)"; EP=""; RESOLVER=""
if [ -n "$SRC" ]; then
  L="$(label_rules "$SRC")"
  r="$(printf '%s\n' "$L" | grep "Host(\`${DOMAIN}\`)" | grep '\.rule=' | head -1 | cut -d= -f2- || true)"
  router="$(printf '%s\n' "$L" | grep "Host(\`${DOMAIN}\`)" | grep '\.rule=' | head -1 | cut -d= -f1 | sed 's/\.rule$//' || true)"
  [ -n "$r" ] && RULE="$r"
  EP="$(printf '%s\n' "$L" | grep "^${router}\.entrypoints=" | head -1 | cut -d= -f2- | cut -d, -f1 || true)"
  RESOLVER="$(printf '%s\n' "$L" | grep "^${router}\.tls\.certresolver=" | head -1 | cut -d= -f2- || true)"
fi
TARGS="$(docker inspect -f '{{join .Args " "}} {{join .Config.Cmd " "}}' "$TRAEFIK" 2>/dev/null || true)"
if [ -z "$EP" ]; then
  EP="$(printf '%s\n' $TARGS | grep -ioE 'entrypoints\.[a-z0-9_-]+\.address=:443' | head -1 | cut -d. -f2 || true)"
fi
if [ -z "$RESOLVER" ]; then
  RESOLVER="$(printf '%s\n' $TARGS | grep -ioE 'certificatesresolvers\.[a-z0-9_-]+\.' | head -1 | cut -d. -f2 || true)"
fi
EP="${EP:-websecure}"; RESOLVER="${RESOLVER:-letsencrypt}"
WEB_EP="$(printf '%s\n' $TARGS | grep -ioE 'entrypoints\.[a-z0-9_-]+\.address=:80$' | head -1 | cut -d. -f2 || true)"

# Network shared with Traefik (prefer the one the old app used, then Traefik's own).
NET="$(printf '%s\n' $TARGS | grep -oE 'providers\.docker\.network=[^ ]+' | head -1 | cut -d= -f2 || true)"
if [ -z "$NET" ] && [ -n "$SRC" ]; then
  for n in $(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$SRC"); do
    if docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$TRAEFIK" | grep -qw "$n"; then NET="$n"; break; fi
  done
fi
if [ -z "$NET" ]; then
  NET="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$TRAEFIK" | tr ' ' '\n' | grep -vE '^(host|none|)$' | head -1 || true)"
fi
[ -n "$NET" ] || die "Could not find a Docker network shared with Traefik."
c_ok "Router: ${RULE} · entrypoint ${EP} · certificates ${RESOLVER} · network ${NET}"

# ── 2. Retire the old app ───────────────────────────────────────────────────
STAMP="$(date +%Y%m%d-%H%M%S)"
if [ "${#OLD[@]}" -gt 0 ]; then
  echo
  c_info "These containers serve ${DOMAIN} today (or belong to ${OLD_APP}) and will be removed:"
  for c in "${OLD[@]}"; do printf '    %s  (%s)\n' "$c" "$(docker inspect -f '{{.Config.Image}}' "$c")"; done
  echo "  Their settings are saved first; images and data volumes are kept, so this can be undone."
  if [ "${YES:-}" != "1" ]; then
    read -r -p "  Type DELETE to continue: " ans < /dev/tty
    [ "$ans" = "DELETE" ] || die "Stopped. Nothing was changed."
  fi
  mkdir -p "$ROOT/backup-$STAMP"
  for c in "${OLD[@]}"; do docker inspect "$c" > "$ROOT/backup-$STAMP/$c.json"; done
  for c in "${OLD[@]}"; do docker rm -f "$c" >/dev/null && c_ok "removed $c"; done
  c_ok "Backup of their settings: $ROOT/backup-$STAMP"
fi

# ── 3. Build files ──────────────────────────────────────────────────────────
mkdir -p "$ROOT/www/releases" "$ROOT/www/shared"
for f in /var/www/healthpilot/api/config.php; do
  [ -f "$f" ] && [ ! -f "$ROOT/www/shared/config.php" ] && cp "$f" "$ROOT/www/shared/config.php" && c_ok "kept the AI key from $f"
done
if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  printf "<?php\nreturn ['OPENROUTER_API_KEY' => '%s'];\n" "$OPENROUTER_API_KEY" > "$ROOT/www/shared/config.php"
  c_ok "AI key saved"
fi

cat > "$ROOT/build.sh" <<'EOS'
#!/usr/bin/env bash
# Runs inside node:20. Fetches the branch; builds and switches to it if it changed.
set -euo pipefail
cd /w
git config --global --add safe.directory '*'
if [ ! -d src/.git ]; then git clone -q --depth 1 -b "$BRANCH" "$REPO" src; fi
cd src
git remote set-url origin "$REPO"
git fetch -q --depth 1 origin "$BRANCH"
NEW="$(git rev-parse FETCH_HEAD)"
CUR="$(basename "$(readlink /w/www/current 2>/dev/null || echo none)")"
if [ "$NEW" = "$CUR" ] && [ -z "${FORCE:-}" ]; then exit 0; fi
echo "$(date -u +%FT%TZ) building ${NEW:0:7} from $BRANCH"
git checkout -qf FETCH_HEAD
cd healthpilot
npm ci --no-audit --no-fund --loglevel=error
npm run -s build
REL="/w/www/releases/$NEW"
rm -rf "$REL.tmp" && mkdir -p "$REL.tmp" && cp -a dist/. "$REL.tmp/"
if [ -f /w/www/shared/config.php ]; then cp /w/www/shared/config.php "$REL.tmp/api/config.php"; chown 0:33 "$REL.tmp/api/config.php"; chmod 640 "$REL.tmp/api/config.php"; fi
rm -rf "$REL" && mv "$REL.tmp" "$REL"
ln -sfn "releases/$NEW" /w/www/current.tmp && mv -Tf /w/www/current.tmp /w/www/current
ls -1dt /w/www/releases/*/ | tail -n +4 | xargs -r rm -rf
echo "$(date -u +%FT%TZ) live: ${NEW:0:7}"
EOS

cat > "$ROOT/update.sh" <<EOS
#!/usr/bin/env bash
# Deploys the newest commit on $BRANCH if there is one. Run by healthpilot-update.timer.
# Force a rebuild: FORCE=1 $ROOT/update.sh
exec 9>/run/healthpilot-update.lock
flock -n 9 || exit 0
docker run --rm ${BUILD_DOCKER_ARGS:-} -e REPO="$REPO" -e BRANCH="$BRANCH" -e FORCE="\${FORCE:-}" \\
  -v "$ROOT":/w "$NODE_IMAGE" bash /w/build.sh >> /var/log/healthpilot-update.log 2>&1
EOS
chmod +x "$ROOT/update.sh" "$ROOT/build.sh"

cat > "$ROOT/apache.conf" <<'EOS'
<VirtualHost *:80>
  DocumentRoot /srv/www/current
  <Directory /srv/www/>
    Options FollowSymLinks
    AllowOverride All
    Require all granted
  </Directory>
  <Directory /srv/www/shared/>
    Require all denied
  </Directory>
  ErrorLog /proc/self/fd/2
  CustomLog /proc/self/fd/1 combined
</VirtualHost>
EOS

c_info "Building the app from GitHub ($BRANCH) — the first build takes 1–3 minutes…"
pull() { docker pull -q "$1" >/dev/null 2>&1 || docker image inspect "$1" >/dev/null 2>&1 || die "Could not download the Docker image $1"; }
pull "$NODE_IMAGE"
FORCE=1 "$ROOT/update.sh" || true
tail -n 3 /var/log/healthpilot-update.log || true
[ -e "$ROOT/www/current/index.html" ] || die "The build failed. Details: /var/log/healthpilot-update.log"
c_ok "Built $(basename "$(readlink "$ROOT/www/current")" | cut -c1-7)"

# ── 4. Run it behind Traefik ────────────────────────────────────────────────
pull "$PHP_IMAGE"
docker rm -f "$NAME" >/dev/null 2>&1 || true
LABELS=(
  -l "traefik.enable=true"
  -l "traefik.docker.network=$NET"
  -l "traefik.http.routers.$NAME.rule=$RULE"
  -l "traefik.http.routers.$NAME.entrypoints=$EP"
  -l "traefik.http.routers.$NAME.tls=true"
  -l "traefik.http.routers.$NAME.tls.certresolver=$RESOLVER"
  -l "traefik.http.routers.$NAME.service=$NAME"
  -l "traefik.http.services.$NAME.loadbalancer.server.port=80"
)
if [ -n "$WEB_EP" ]; then  # plain-http requests reach Apache, whose .htaccess redirects them to https
  LABELS+=(-l "traefik.http.routers.$NAME-http.rule=$RULE" -l "traefik.http.routers.$NAME-http.entrypoints=$WEB_EP" -l "traefik.http.routers.$NAME-http.service=$NAME")
fi
docker run -d --name "$NAME" --restart unless-stopped --network "$NET" \
  -v "$ROOT/www":/srv/www:ro -v "$ROOT/apache.conf":/etc/apache2/sites-enabled/000-default.conf:ro \
  "${LABELS[@]}" "$PHP_IMAGE" bash -c 'a2enmod -q rewrite headers >/dev/null && exec apache2-foreground' >/dev/null
c_ok "Container $NAME is running"

# ── 5. Auto-update ──────────────────────────────────────────────────────────
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
  cat > /etc/systemd/system/healthpilot-update.service <<EOS
[Unit]
Description=Deploy the newest HealthPilot commit from GitHub
After=docker.service
[Service]
Type=oneshot
ExecStart=$ROOT/update.sh
EOS
  cat > /etc/systemd/system/healthpilot-update.timer <<EOS
[Unit]
Description=Check GitHub for HealthPilot updates every $EVERY minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=${EVERY}min
[Install]
WantedBy=timers.target
EOS
  systemctl daemon-reload
  systemctl enable --now healthpilot-update.timer >/dev/null 2>&1
  c_ok "Auto-update on: checks GitHub every $EVERY minutes (systemd timer)"
else
  echo "*/$EVERY * * * * root $ROOT/update.sh" > /etc/cron.d/healthpilot-update
  c_ok "Auto-update on: checks GitHub every $EVERY minutes (cron)"
fi

# ── 6. Check ────────────────────────────────────────────────────────────────
sleep 3
code="$(docker exec "$NAME" curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' http://127.0.0.1/ || true)"
[ "$code" = "200" ] && c_ok "App answers inside the container (HTTP 200)" || c_warn "App check returned HTTP $code — see: docker logs $NAME"
if command -v curl >/dev/null; then
  ext="$(curl -sk --noproxy '*' -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)"
  [ "$ext" = "200" ] && c_ok "https://$DOMAIN answers through Traefik (HTTP 200)" || c_warn "Through Traefik: HTTP $ext (a new certificate can take a minute)"
fi
echo
c_ok "Done. Open https://$DOMAIN"
echo "  • Every push to '$BRANCH' goes live within ~$EVERY minutes."
echo "  • Deploy now:   FORCE=1 $ROOT/update.sh"
echo "  • Update log:   tail -f /var/log/healthpilot-update.log"
echo "  • Roll back:    ls $ROOT/www/releases, then: ln -sfn releases/<id> $ROOT/www/current"
