#!/usr/bin/env bash
# Prépare le graphe routier de La Réunion pour OSRM (profil voiture). Réseau requis une seule fois, ≈ 30 Mo de téléchargement.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p data vroom-conf
[ -s data/reunion-latest.osm.pbf ] || curl -fL --retry 3 -o data/reunion-latest.osm.pbf https://download.geofabrik.de/africa/reunion-latest.osm.pbf
IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-extract -p /opt/car.lua /data/reunion-latest.osm.pbf
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-partition /data/reunion-latest.osrm
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-customize /data/reunion-latest.osrm
cat > vroom-conf/config.yml <<'YML'
cliArgs:
  geometry: false
  planmode: false
  threads: 4
  explore: 5
  limit_number_jobs: 200
  port: 3000
routingServers:
  car:
    - host: osrm
      port: 5000
YML
echo "Graphe prêt. Lancer : docker compose up -d"
