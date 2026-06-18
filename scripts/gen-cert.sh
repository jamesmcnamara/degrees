#!/usr/bin/env bash
# Generate a self-signed TLS certificate for local HTTPS.
#
# The cert covers localhost, the loopback addresses, this machine's LAN IP
# (auto-detected), and any extra hostnames passed as arguments (e.g. a
# Tailscale MagicDNS name). Output goes to certs/cert.pem and certs/key.pem.
#
# Usage:
#   bun run cert                       # localhost + LAN IP
#   bun run cert my-host.ts.net        # also cover a Tailscale name
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/certs"
mkdir -p "$CERT_DIR"

# Detect the primary LAN IP (macOS first, then Linux fallback).
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "${LAN_IP:-}" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

# Build the subjectAltName list.
ALT="DNS:localhost,IP:127.0.0.1,IP:::1"
[ -n "${LAN_IP:-}" ] && ALT="$ALT,IP:$LAN_IP"
for host in "$@"; do
  ALT="$ALT,DNS:$host"
done

echo "Generating self-signed cert for: $ALT"

openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=Six Degrees Local" \
  -addext "subjectAltName=$ALT"

chmod 600 "$CERT_DIR/key.pem"

echo
echo "✓ Wrote $CERT_DIR/cert.pem and $CERT_DIR/key.pem"
echo "  Restart the server (bun dev) to serve over HTTPS."
[ -n "${LAN_IP:-}" ] && echo "  On your phone, open: https://$LAN_IP:3000 (accept the warning, or trust cert.pem)."
