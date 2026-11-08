"""Rassemble les fichiers de reprise de l'extraction A en un seul fichier (etablissements-brut.json) et écrit la description de la lecture (meta-lecture.json) :
nombre de lignes et de blocs LUS et ANNONCÉS par l'en-tête du fichier officiel. Le verdict de complétude est donné par bureau/recensement-assemblage.js (testé)."""
import sys, os, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pq_distant import Distant
SORTIE = os.environ.get('RECENSEMENT_SORTIE') or os.path.join(os.getcwd(), 'recensement-sortie')
URL = "https://static.data.gouv.fr/resources/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/20261103-101714/stock-stocketablissement-parquet.parquet"
E = Distant(URL, 2231588933); D = SORTIE + '/export-annuaire/'
fichiers = sorted(glob.glob(D + 'groupes/g*.json')); lignes = 0; rows = []
for f in fichiers:
    j = json.load(open(f)); lignes += j['vus']['lignes']; rows += j['lignes']
json.dump(rows, open(D + 'etablissements-brut.json', 'w'))
json.dump({'lignesAttendues': E.md.num_rows, 'groupesAttendus': E.md.num_row_groups, 'lignesLues': lignes, 'groupesLus': len(fichiers)}, open(D + 'meta-lecture.json', 'w'))
print(open(D + 'meta-lecture.json').read())
