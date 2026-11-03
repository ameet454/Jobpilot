#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HealthPilot — one-shot setup for a Hostinger VPS (Ubuntu/Debian)
#
#   1. Finds the old "cdsco" app (nginx/apache sites, Docker containers, PM2
#      apps, systemd services, folders), BACKS IT UP to /root, then removes it
#      — only after you type DELETE.
#   2. Installs nginx + PHP-FPM + Node 20 + certbot.
#   3. Downloads and builds HealthPilot from GitHub, serves it on your domain.
#   4. Issues a free Let's Encrypt HTTPS certificate.
#
# Usage (run as root in hPanel → VPS → Browser terminal):
#   curl -fsSLo vps-setup.sh <raw URL of this file>   # download first (don't pipe into bash — it asks a question)
#   bash vps-setup.sh yourdomain.com                     # full setup
#   bash vps-setup.sh yourdomain.com --inspect           # only show what would be removed
#   OPENROUTER_API_KEY=sk-or-... bash vps-setup.sh yourdomain.com   # + AI features
#
# Re-run any time to update HealthPilot to the latest code (cdsco step is
# skipped once nothing matching it is left).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-}"
MODE="${2:-}"
OLD_APP="${OLD_APP:-cdsco}"
REPO="${REPO:-https://github.com/ameet454/Jobpilot.git}"
BRANCH="${BRANCH:-master}"
EMAIL="${EMAIL:-}"
SRC=/opt/healthpilot-src
WEBROOT=/var/www/healthpilot
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/root/${OLD_APP}-backup-${STAMP}

c_ok() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
c_info() { printf '\033[36m▸ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -n "$DOMAIN" ]] || die "Usage: bash vps-setup.sh yourdomain.com [--inspect]"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN#www.}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "'$DOMAIN' doesn't look like a domain name"
[[ $EUID -eq 0 ]] || die "Run as root (in hPanel's Browser terminal you already are, or use: sudo bash ...)"
command -v apt-get >/dev/null || die "This script supports Ubuntu/Debian VPS images only"

# ── 0. Refuse to fight a hosting control panel ───────────────────────────────
for p in /usr/local/cpanel /usr/local/psa /usr/local/CyberCP /home/clp /www/server/panel /usr/local/hestia /data/coolify /etc/dokploy /etc/easypanel; do
  if [[ -e "$p" ]]; then
    die "A hosting control panel is installed ($p). Add the site through that panel instead of this script, or ask me for panel-specific steps."
  fi
done

# ── 1. Find everything belonging to the old app ──────────────────────────────
c_info "Looking for '$OLD_APP' and anything already serving $DOMAIN…"
pattern="${OLD_APP}|${DOMAIN//./\\.}"
mapfile -t WEB_CONFS < <(grep -RlEi "$pattern" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d \
  /etc/apache2/sites-enabled /etc/apache2/sites-available /etc/httpd/conf.d 2>/dev/null | grep -v '/healthpilot$' | sort -u || true)
mapfile -t DIRS < <(find /var/www /opt /srv /root /home -maxdepth 3 -type d -iname "*${OLD_APP}*" 2>/dev/null | grep -v "^/root/${OLD_APP}-backup-" || true)
CONTAINERS=(); PM2_APPS=(); UNITS=()
if command -v docker >/dev/null; then
  mapfile -t CONTAINERS < <(docker ps -a --format '{{.Names}}\t{{.Image}}' 2>/dev/null | grep -i "$OLD_APP" | cut -f1 || true)
fi
if command -v pm2 >/dev/null; then
  mapfile -t PM2_APPS < <(pm2 jlist 2>/dev/null | grep -oE '"name":"[^"]+"' | cut -d'"' -f4 | grep -i "$OLD_APP" | sort -u || true)
fi
mapfile -t UNITS < <(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -i "$OLD_APP" || true)

found=$(( ${#WEB_CONFS[@]} + ${#DIRS[@]} + ${#CONTAINERS[@]} + ${#PM2_APPS[@]} + ${#UNITS[@]} ))
if (( found > 0 )); then
  echo
  echo "Found the following — these will be BACKED UP and then REMOVED:"
  for f in "${WEB_CONFS[@]}"; do echo "  web server config : $f"; done
  for d in "${DIRS[@]}"; do echo "  folder            : $d  ($(du -sh "$d" 2>/dev/null | cut -f1))"; done
  for c in "${CONTAINERS[@]}"; do echo "  docker container  : $c"; done
  for a in "${PM2_APPS[@]}"; do echo "  pm2 app           : $a"; done
  for u in "${UNITS[@]}"; do echo "  systemd service   : $u"; done
  echo
  c_warn "Web server configs are removed whole. If one of them also serves OTHER sites, stop now (Ctrl+C) and tell me."
else
  c_ok "Nothing named '$OLD_APP' or serving $DOMAIN was found."
fi

echo
echo "Ports 80/443 are currently used by:"
ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | awk '{print "  " $4 "  " $6}' || true
if [[ "$MODE" == "--inspect" ]]; then echo; c_info "Inspect mode — nothing was changed."; exit 0; fi

if (( found > 0 )); then
  echo
  read -r -p "Type DELETE to back up and remove the items above: " answer
  [[ "$answer" == "DELETE" ]] || die "Cancelled — nothing was changed."

  mkdir -p "$BACKUP_DIR"
  c_info "Backing up to $BACKUP_DIR …"
  for f in "${WEB_CONFS[@]}"; do mkdir -p "$BACKUP_DIR/conf$(dirname "$f")"; cp -aL "$f" "$BACKUP_DIR/conf$f" 2>/dev/null || true; done
  for d in "${DIRS[@]}"; do tar -czf "$BACKUP_DIR/$(echo "$d" | tr '/' '_').tar.gz" -C / "${d#/}" 2>/dev/null || c_warn "Could not fully archive $d"; done
  for c in "${CONTAINERS[@]}"; do docker inspect "$c" > "$BACKUP_DIR/docker-$c.json" 2>/dev/null || true; done
  for u in "${UNITS[@]}"; do systemctl cat "$u" > "$BACKUP_DIR/systemd-$u.txt" 2>/dev/null || true; done
  if (( ${#PM2_APPS[@]} > 0 )); then pm2 jlist > "$BACKUP_DIR/pm2.json" 2>/dev/null || true; fi
  c_ok "Backup saved"

  c_info "Removing $OLD_APP …"
  for c in "${CONTAINERS[@]}"; do docker rm -f "$c" >/dev/null && echo "  removed container $c"; done
  for a in "${PM2_APPS[@]}"; do pm2 delete "$a" >/dev/null 2>&1 && echo "  removed pm2 app $a"; done
  if (( ${#PM2_APPS[@]} > 0 )); then pm2 save >/dev/null 2>&1 || true; fi
  for u in "${UNITS[@]}"; do systemctl disable --now "$u" >/dev/null 2>&1 && echo "  stopped service $u"; done
  for f in "${WEB_CONFS[@]}"; do rm -f "$f" && echo "  removed config $f"; done
  for d in "${DIRS[@]}"; do rm -rf "$d" && echo "  removed folder $d"; done
  if systemctl is-active --quiet apache2 2>/dev/null; then systemctl reload apache2 2>/dev/null || true; fi
  if systemctl is-active --quiet nginx 2>/dev/null; then nginx -t >/dev/null 2>&1 && systemctl reload nginx || true; fi
  c_ok "$OLD_APP removed (Docker images and volumes were kept; delete them later with 'docker system prune' if you wish)"
fi

# ── 2. Make sure nothing other than nginx holds port 80/443 ──────────────────
blockers=$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v '"nginx"' || true)
if [[ -n "$blockers" ]]; then
  if echo "$blockers" | grep -qE '"(apache2|httpd)"' \
     && [[ -z "$(ls /etc/apache2/sites-enabled/ 2>/dev/null | grep -v '^000-default')" ]]; then
    c_info "Apache has no sites left — stopping and disabling it to free port 80"
    systemctl disable --now apache2 2>/dev/null || systemctl disable --now httpd 2>/dev/null || true
  else
    echo "$blockers"
    die "Another program is still using port 80/443 (shown above). Stop it, or send me this output and I'll adapt the script."
  fi
fi

# ── 3. Install packages ──────────────────────────────────────────────────────
c_info "Installing nginx, PHP-FPM, certbot, git…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx php-fpm php-curl php-mbstring certbot python3-certbot-nginx git curl rsync ca-certificates >/dev/null
if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 18 )); then
  c_info "Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
c_ok "Packages ready (node $(node -v), $(php -r 'echo "php ".PHP_VERSION;'))"

# ── 4. Download + build HealthPilot ──────────────────────────────────────────
c_info "Fetching HealthPilot ($BRANCH)…"
if [[ -d "$SRC/.git" ]]; then
  git -C "$SRC" fetch --depth 1 origin "$BRANCH" -q
  git -C "$SRC" checkout -q -B "$BRANCH" FETCH_HEAD
else
  rm -rf "$SRC"
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi
[[ -d "$SRC/healthpilot" ]] || die "Branch '$BRANCH' has no healthpilot/ folder yet. Merge the HealthPilot pull request, or run with BRANCH=claude/youthful-brown-hczlf7"
cd "$SRC/healthpilot"
c_info "Building…"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent >/dev/null
mkdir -p "$WEBROOT"
rsync -a --delete --exclude 'api/config.php' dist/ "$WEBROOT/"
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  printf "<?php\ndefine('OPENROUTER_API_KEY', '%s');\n" "$OPENROUTER_API_KEY" > "$WEBROOT/api/config.php"
  c_ok "AI key saved to $WEBROOT/api/config.php"
fi
chown -R www-data:www-data "$WEBROOT"
if [[ -f "$WEBROOT/api/config.php" ]]; then chmod 640 "$WEBROOT/api/config.php"; fi
c_ok "Built $(git -C "$SRC" rev-parse --short HEAD) → $WEBROOT"

# ── 5. nginx site ────────────────────────────────────────────────────────────
find_sock() { ls /run/php/php*-fpm.sock 2>/dev/null | sort -V | tail -1 || true; }
PHP_SOCK=$(find_sock)
if [[ -z "$PHP_SOCK" ]]; then
  FPM_UNIT=$(systemctl list-unit-files 'php*-fpm.service' --no-legend 2>/dev/null | awk '{print $1}' | sort -V | tail -1 || true)
  [[ -n "$FPM_UNIT" ]] && systemctl enable --now "$FPM_UNIT" >/dev/null 2>&1 || true
  sleep 2
  PHP_SOCK=$(find_sock)
fi
[[ -n "$PHP_SOCK" ]] || die "PHP-FPM socket not found in /run/php — check 'systemctl status php*-fpm'"
SERVER_IP=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
NAMES="$DOMAIN"
WWW_IP=$(getent ahostsv4 "www.$DOMAIN" | awk 'NR==1{print $1}' || true)
[[ "$WWW_IP" == "$SERVER_IP" ]] && NAMES="$DOMAIN www.$DOMAIN"

LISTEN6=""
[[ -s /proc/net/if_inet6 ]] && LISTEN6="listen [::]:80;"

cat > /etc/nginx/sites-available/healthpilot <<NGINX
# HealthPilot — generated by vps-setup.sh on $STAMP
server {
    listen 80;
    $LISTEN6
    server_name $NAMES;
    root $WEBROOT;
    index index.html;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    client_max_body_size 3m;

    # Optional AI endpoint (PHP). The key file and .htaccess are never served.
    location ~ ^/api/(config|config\.example)\.php\$ { return 404; }
    location ~ /\.ht { return 404; }
    location = /api/coach { rewrite ^ /api/coach.php last; }
    location = /api/coach.php {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_SOCK;
        fastcgi_read_timeout 60s;
    }
    location ~ \.php\$ { return 404; }

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files \$uri =404; }
    location = /sw.js { add_header Cache-Control "no-cache"; try_files \$uri =404; }
    location = /index.html { add_header Cache-Control "no-cache"; }

    # Single-page app
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX
ln -sf /etc/nginx/sites-available/healthpilot /etc/nginx/sites-enabled/healthpilot
# The stock "Welcome to nginx" placeholder is not needed.
if [[ -L /etc/nginx/sites-enabled/default && "$(readlink -f /etc/nginx/sites-enabled/default)" == /etc/nginx/sites-available/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx || systemctl restart nginx
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 'Nginx Full' >/dev/null; fi
c_ok "nginx is serving $NAMES"

# ── 6. HTTPS ─────────────────────────────────────────────────────────────────
DOMAIN_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [[ "$DOMAIN_IP" == "$SERVER_IP" ]]; then
  c_info "Requesting HTTPS certificate…"
  CERT_ARGS=(--nginx --redirect --agree-tos --non-interactive --keep-until-expiring)
  for n in $NAMES; do CERT_ARGS+=(-d "$n"); done
  if [[ -n "$EMAIL" ]]; then CERT_ARGS+=(-m "$EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi
  if certbot "${CERT_ARGS[@]}"; then URL="https://$DOMAIN"; c_ok "HTTPS enabled (auto-renews)"; else URL="http://$DOMAIN"; c_warn "Certificate request failed — the site works over HTTP; re-run this script to retry."; fi
else
  URL="http://$DOMAIN"
  c_warn "$DOMAIN points to ${DOMAIN_IP:-nothing}, but this VPS is $SERVER_IP."
  c_warn "In your domain's DNS, set an A record for @ (and www) to $SERVER_IP, wait a few minutes, then re-run this script to get HTTPS."
fi

echo
c_ok "HealthPilot is live at $URL"
if (( found > 0 )); then echo "   Old $OLD_APP backup: $BACKUP_DIR"; fi
echo "   Update later: re-run this same command."
