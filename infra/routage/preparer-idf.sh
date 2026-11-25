#!/usr/bin/env bash
# Prépare le graphe routier de l'Île-de-France (profil voiture) pour OSRM : couvre les secteurs 75, 77, 78, 91, 92, 93, 94, 95
# (tous les secteurs de la feuille de route de Laurent : 77, 91/92, 93, 94, 95), départ Massy–Palaiseau.
# Réseau requis UNE fois (extrait Geofabrik, plusieurs centaines de Mo). Calcul ensuite 100 % local, sans abonnement.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p data vroom-conf
PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf}"
IMG="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v5.27.1}"
[ -s data/ile-de-france-latest.osm.pbf ] || curl -fL --retry 3 -o data/ile-de-france-latest.osm.pbf "$PBF_URL"
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-extract -p /opt/car.lua /data/ile-de-france-latest.osm.pbf
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-partition /data/ile-de-france-latest.osrm
docker run --rm -v "$PWD/data:/data" "$IMG" osrm-customize /data/ile-de-france-latest.osrm
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
echo "Graphe Île-de-France prêt. Lancer : docker compose up -d  puis  node verifier-moteur.cjs"
