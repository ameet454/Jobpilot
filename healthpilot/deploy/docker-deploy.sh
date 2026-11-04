#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HealthPilot on a Docker + Traefik VPS (e.g. Hostinger's Docker template),
# with automatic updates from GitHub.
#
#   bash docker-deploy.sh medreglens.tech            # asks before replacing the old app
#   YES=1 bash docker-deploy.sh medreglens.tech      # no questions
#   bash docker-deploy.sh medreglens.tech --inspect  # only show what it finds
#   bash docker-deploy.sh medreglens.tech --status   # is the public site the new app? where does DNS point?
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

INSPECT=""; [ "${2:-}" = "--inspect" ] && INSPECT=1
[ -n "$DOMAIN" ] || die "Usage: bash docker-deploy.sh yourdomain.com [--inspect | --status]"
[ "$(id -u)" -eq 0 ] || die "Run as root (or with sudo)."
command -v docker >/dev/null || die "Docker is not installed on this server."
docker info >/dev/null 2>&1 || die "Docker is installed but not running."

# Where is the domain really served from, and is it the new app? (also runs at the end of a deploy)
public_check() {
  echo; echo "──── Live check for $DOMAIN ────"
  local rel ours myips dns
  rel="$(basename "$(readlink "$ROOT/www/current" 2>/dev/null || echo none)")"
  echo "New app installed on this server: $( [ "$rel" != none ] && echo "yes, release ${rel:0:7}" || echo "NO (the deploy has not completed here)")"
  echo "App container: $(docker inspect -f '{{.State.Status}}' "$NAME" 2>/dev/null | grep . || echo 'not found')"
  myips="$( (hostname -I 2>/dev/null; curl -s4 --max-time 5 https://api.ipify.org 2>/dev/null) | tr ' ' '\n' | grep -E '^[0-9]+\.' | sort -u | tr '\n' ' ' || true)"
  dns="$( (getent ahostsv4 "$DOMAIN" 2>/dev/null || true) | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  echo "This server's IPs:  $myips"
  echo "$DOMAIN points to: ${dns:-(no DNS answer)}"
  local here=""; for ip in $dns; do case " $myips " in *" $ip "*) here=1 ;; esac; done
  if [ -n "$dns" ] && [ -z "$here" ]; then
    printf '\033[31m✘ %s does NOT point to this server, so changes here cannot show up on the site.\033[0m\n' "$DOMAIN"
    echo "  Fix: hPanel → Domains → $DOMAIN → DNS records: set the A records for @ and www to $(printf '%s' "$myips" | awk '{print $NF}')"
    echo "  (or tell Claude where the site is hosted now)."
  fi
  ours="$( [ -f "$ROOT/www/current/index.html" ] && md5sum < "$ROOT/www/current/index.html" | cut -c1-32 || echo none)"
  local body hdr
  body="$(curl -s --max-time 15 "https://$DOMAIN/" 2>/dev/null || true)"
  hdr="$(curl -sI --max-time 15 "https://$DOMAIN/" 2>/dev/null | grep -iE '^(server|via|x-cache|cf-ray|x-hcdn|platform|x-litespeed|x-powered-by|age):' | tr -d '\r' | tr '\n' ' ' || true)"
  echo "Public https://$DOMAIN serves: $(printf '%s' "$body" | grep -oE '<title>[^<]*' | head -1 | sed 's/<title>//' || true) | $(printf '%s' "$body" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
  echo "Response headers: ${hdr:-(none)}"
  if [ "$(printf '%s' "$body" | md5sum | cut -c1-32)" = "$ours" ]; then
    printf '\033[32m✔ The public site is serving the NEW app. If your browser still shows the old one, press Ctrl+Shift+R (or close and reopen the app).\033[0m\n'
  else
    printf '\033[33m! The public site is serving something else than the new app installed here.\033[0m\n'
  fi
  echo "────────────────────────────────"
}
if [ "${2:-}" = "--status" ]; then public_check; exit 0; fi

# ── 1. Traefik ──────────────────────────────────────────────────────────────
TRAEFIK="$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' 'tolower($2) ~ /traefik/ {print $1; exit}')"
if [ -z "$TRAEFIK" ]; then
  c_warn "No Traefik container is running; using the plain nginx installer instead."
  SCRIPT="$(mktemp)"
  curl -fsSL "https://raw.githubusercontent.com/ameet454/Jobpilot/${BRANCH}/healthpilot/deploy/vps-setup.sh" -o "$SCRIPT"
  BRANCH="$BRANCH" OLD_APP="$OLD_APP" exec bash "$SCRIPT" "$DOMAIN"
fi
c_ok "Traefik found: $TRAEFIK"

# Printed when something does not fit, so the output shows how this server is set up.
diag() {
  echo; echo "──── Diagnosis (safe to share: no passwords or keys) ────"
  docker inspect -f 'traefik image={{.Config.Image}} network_mode={{.HostConfig.NetworkMode}} networks={{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$TRAEFIK" 2>/dev/null || true
  echo "traefik args: $(docker inspect -f '{{join .Args " "}}' "$TRAEFIK" 2>/dev/null | grep -oE -- '--(entrypoints|providers|certificatesresolvers)[^ =]*(=[^ ]*)?' | grep -viE 'email|token|key|password' | tr '\n' ' ' || true)"
  echo "traefik mounts: $(docker inspect -f '{{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}' "$TRAEFIK" 2>/dev/null)"
  echo "containers with Traefik routers:"
  for c in $(docker ps -a --format '{{.Names}}'); do
    r="$(label_rules "$c" | grep '\.rule=' | cut -d= -f2- | tr '\n' ';' || true)"
    if [ -n "$r" ]; then echo "  $c [$(docker inspect -f '{{.State.Status}} {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$c")] $r"; fi
  done
  echo "Traefik config files that mention $DOMAIN:"
  for m in $(docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$TRAEFIK" 2>/dev/null); do
    find "$m" -maxdepth 3 -type f \( -name '*.yml' -o -name '*.yaml' -o -name '*.toml' \) 2>/dev/null | while read -r f; do
      grep -n "$DOMAIN" "$f" 2>/dev/null | sed "s|^|  $f:|" || true
    done
  done
  echo "Something else on ports 80/443: $( (ss -ltnp 2>/dev/null || true) | grep -E ':(80|443) ' | grep -oE 'users:\(\("[^"]+' | cut -d'"' -f2 | sort -u | tr '\n' ' ')"
  echo "──────────────────────────────────────────────────────"
  return 0
}

# Entrypoints and certificate resolvers from a mounted static config file (traefik.yml / .toml).
static_conf() {
  command -v python3 >/dev/null || return 0
  for m in $(docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$TRAEFIK" 2>/dev/null); do
    for f in "$m" "$m/traefik.yml" "$m/traefik.yaml" "$m/traefik.toml"; do
      [ -f "$f" ] || continue
      case "$f" in *.yml|*.yaml|*.toml) ;; *) continue ;; esac
      python3 - "$f" <<'PY' 2>/dev/null || true
import re, sys
t = open(sys.argv[1]).read()
eps = re.findall(r'(?ms)^\s*\[?entryPoints\.?\]?\s*:?\s*$(.*?)(?=^\S|\Z)', t)
for name, port in re.findall(r'(?m)^\s*\[?(?:entryPoints\.)?([A-Za-z0-9_-]+)\]?\s*:?\s*\n\s*address\s*[:=]\s*["\']?[^"\'\n]*:(80|443)["\']?', t):
    print(f"ep{port}={name}")
m = re.search(r'(?ms)certificatesResolvers\]?\s*:?\s*\n\s*\[?(?:certificatesResolvers\.)?([A-Za-z0-9_-]+)', t)
if m: print(f"resolver={m.group(1)}")
PY
    done
  done
}
SCONF="$(static_conf | sort -u)"

# Containers whose Traefik rule serves this domain (except ours), plus any named like the old app.
label_rules() { docker inspect -f '{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$1" 2>/dev/null | grep '^traefik\.http\.routers\.' || true; }
# Does a router rule mention the domain? Accepts `x`, "x" or 'x' quoting and the www. variant.
DOM_RE="$(printf '%s' "$DOMAIN" | sed 's/\./\\./g')"
DOM_PAT="[\`\"'](www\\.)?${DOM_RE}[\`\"']"
serves_domain() { label_rules "$1" | grep '\.rule=' | grep -qE "$DOM_PAT"; }
OLD=()
while IFS= read -r c; do
  [ -z "$c" ] && continue
  [ "$c" = "$NAME" ] && continue
  if serves_domain "$c"; then OLD+=("$c"); continue; fi
  case "$c" in *"$OLD_APP"*) OLD+=("$c") ;; esac
done < <(docker ps -a --format '{{.Names}}')

# Router settings to copy: from the container serving the domain now (or ours, on a re-run).
SRC=""
for c in "${OLD[@]}" "$NAME"; do
  if serves_domain "$c"; then SRC="$c"; break; fi
done
RULE="Host(\`${DOMAIN}\`)"; EP=""; RESOLVER=""
if [ -n "$SRC" ]; then
  L="$(label_rules "$SRC")"
  # Of the routers serving the domain, copy the HTTPS one (it has a certificate resolver).
  router=""
  for rt in $(printf '%s\n' "$L" | grep '\.rule=' | grep -E "$DOM_PAT" | cut -d= -f1 | sed 's/\.rule$//'); do
    [ -z "$router" ] && router="$rt"
    if printf '%s\n' "$L" | grep -q "^${rt}\.tls\.certresolver="; then router="$rt"; break; fi
  done
  r="$(printf '%s\n' "$L" | grep "^${router}\.rule=" | head -1 | cut -d= -f2- || true)"
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
WEB_EP="$(printf '%s\n' $TARGS | grep -ioE 'entrypoints\.[a-z0-9_-]+\.address=:80$' | head -1 | cut -d. -f2 || true)"
TLS_EP="$(printf '%s\n' $TARGS | grep -ioE 'entrypoints\.[a-z0-9_-]+\.address=:443$' | head -1 | cut -d. -f2 || true)"
[ -z "$WEB_EP" ] && WEB_EP="$(printf '%s\n' "$SCONF" | grep '^ep80=' | head -1 | cut -d= -f2 || true)"
[ -z "$TLS_EP" ] && TLS_EP="$(printf '%s\n' "$SCONF" | grep '^ep443=' | head -1 | cut -d= -f2 || true)"
[ -z "$RESOLVER" ] && RESOLVER="$(printf '%s\n' "$SCONF" | grep '^resolver=' | head -1 | cut -d= -f2 || true)"
# Never put the HTTPS router on the port-80 entrypoint.
if [ -n "$EP" ] && [ "$EP" = "$WEB_EP" ] && [ -n "$TLS_EP" ]; then EP="$TLS_EP"; fi
EP="${EP:-${TLS_EP:-websecure}}"; RESOLVER="${RESOLVER:-letsencrypt}"

# Network shared with Traefik (prefer the one the old app used, then Traefik's own).
TMODE="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$TRAEFIK" 2>/dev/null || true)"
TNETS="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$TRAEFIK" 2>/dev/null || true)"
NET="$(printf '%s\n' $TARGS | grep -oE 'providers\.docker\.network=[^ ]+' | head -1 | cut -d= -f2 || true)"
if [ -n "$NET" ] && ! docker network inspect "$NET" >/dev/null 2>&1; then NET=""; fi
if [ -z "$NET" ] && [ -n "$SRC" ]; then
  for n in $(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$SRC"); do
    if printf ' %s ' "$TNETS" | grep -q " $n "; then NET="$n"; break; fi
  done
fi
if [ -z "$NET" ]; then
  NET="$(printf '%s\n' $TNETS | grep -vE '^(host|none|bridge)$' | head -1 || true)"
fi
if [ -z "$NET" ]; then
  # Traefik uses the host's network (or only the default bridge): give the app its own network.
  # With host networking Traefik reaches it directly; otherwise Traefik is also connected to it.
  NET="healthpilot_web"; OWN_NET=1
  c_ok "Traefik network mode: ${TMODE:-?}; the app gets its own network ($NET)"
fi
c_ok "Router: ${RULE} · entrypoint ${EP} · certificates ${RESOLVER} · network ${NET}"
if [ -n "$INSPECT" ]; then
  diag
  echo "Would replace: ${OLD[*]:-nothing}"; echo "(--inspect: nothing was changed)"; exit 0
fi

if [ -n "${OWN_NET:-}" ]; then
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
  if [ "$TMODE" != "host" ] && ! printf ' %s ' "$TNETS" | grep -q " $NET "; then
    docker network connect "$NET" "$TRAEFIK" || { diag; die "Could not connect Traefik to the network $NET."; }
  fi
fi

# ── 2. Retire the old app ───────────────────────────────────────────────────
STAMP="$(date +%Y%m%d-%H%M%S)"
if [ "${#OLD[@]}" -gt 0 ]; then
  echo
  c_info "These containers serve ${DOMAIN} today (or belong to ${OLD_APP}) and will be removed:"
  for c in "${OLD[@]}"; do printf '    %s  (%s)\n' "$c" "$(docker inspect -f '{{.Config.Image}}' "$c")"; done
  echo "  Their settings are saved first; images and data volumes are kept, so this can be undone."
  if [ "${YES:-}" != "1" ]; then
    ans=""
    { read -r -p "  Type DELETE to continue: " ans < /dev/tty; } 2>/dev/null || read -r -p "  Type DELETE to continue: " ans || true
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
  -v "$ROOT":/w "$NODE_IMAGE" bash /w/build.sh >> /var/log/healthpilot-update.log 2>&1 \\
  || { echo "\$(date -u +%FT%TZ) build failed; the previous release stays live" >> /var/log/healthpilot-update.log; exit 1; }
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
if FORCE=1 "$ROOT/update.sh"; then
  c_ok "Built $(basename "$(readlink "$ROOT/www/current")" | cut -c1-7)"
else
  tail -n 15 /var/log/healthpilot-update.log || true
  [ -e "$ROOT/www/current/index.html" ] || die "The build failed. Details: /var/log/healthpilot-update.log"
  c_warn "This build failed, so the previous release stays live. Details: /var/log/healthpilot-update.log"
fi

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
  -l "traefik.http.routers.$NAME.priority=10000"
  -l "traefik.http.services.$NAME.loadbalancer.server.port=80"
)
if [ -n "$WEB_EP" ]; then  # plain-http requests reach Apache, whose .htaccess redirects them to https
  LABELS+=(-l "traefik.http.routers.$NAME-http.rule=$RULE" -l "traefik.http.routers.$NAME-http.entrypoints=$WEB_EP" -l "traefik.http.routers.$NAME-http.service=$NAME" -l "traefik.http.routers.$NAME-http.priority=10000")
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
LIVE_OK=""
if command -v curl >/dev/null; then
  ours="$(md5sum < "$ROOT/www/current/index.html" | cut -c1-32)"
  for i in 1 2 3 4 5 6; do
    live="$(curl -sk --noproxy '*' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" | md5sum | cut -c1-32)"
    [ "$live" = "$ours" ] && { LIVE_OK=1; break; }
    sleep 5
  done
  if [ -n "$LIVE_OK" ]; then
    c_ok "https://$DOMAIN now serves the new HealthPilot (release $(basename "$(readlink "$ROOT/www/current")" | cut -c1-7))"
  else
    c_warn "https://$DOMAIN is NOT serving the new app yet. Something else still receives the traffic:"
    curl -sk --noproxy '*' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" -o /dev/null -w '    HTTP %{http_code}\n' "https://$DOMAIN/" || true
    curl -sk --noproxy '*' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" | grep -oE '<title>[^<]*|src="[^"]*\.js"' | head -3 | sed 's/^/    /' || true
    diag
    echo "  Send a screenshot of everything from the Diagnosis line down."
  fi
fi
public_check
echo
if [ -n "${LIVE_OK:-}" ]; then c_ok "Done. Open https://$DOMAIN (if your browser still shows the old app, reload the page once)"
else c_warn "The new app is installed and running, but $DOMAIN still points at the old one (see the Diagnosis above)."; fi
echo "  • Every push to '$BRANCH' goes live within ~$EVERY minutes."
echo "  • Deploy now:   FORCE=1 $ROOT/update.sh"
echo "  • Update log:   tail -f /var/log/healthpilot-update.log"
echo "  • Roll back:    ls $ROOT/www/releases, then: ln -sfn releases/<id> $ROOT/www/current"
