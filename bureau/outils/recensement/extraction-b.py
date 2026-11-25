"""Extraction B : noms des unités légales (entreprises) pour les SIREN des établissements retenus. Fichier officiel INSEE StockUniteLegale (Parquet, data.gouv.fr).
Lecture partielle, parallèle, reprenable. Résultats HORS dépôt."""
import sys, os, json, time, bisect, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pq_distant import Distant
SORTIE = os.environ.get('RECENSEMENT_SORTIE') or os.path.join(os.getcwd(), 'recensement-sortie')  # HORS dépôt (le dossier est ignoré par git)
OUT = SORTIE + '/export-annuaire/noms'; os.makedirs(OUT, exist_ok=True)
URL = "https://static.data.gouv.fr/resources/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/20261103-095402/stock-stockunitelegale-parquet.parquet"
U = Distant(URL, 717824037)
rows = json.load(open(SORTIE + '/export-annuaire/etablissements-brut.json'))
need = sorted(set(r['siren'] for r in rows))
COLS = ['siren', 'denominationUniteLegale', 'nomUniteLegale', 'prenomUsuelUniteLegale', 'sigleUniteLegale']
ci = U.noms.index('siren')
def utile(g):
    st = U.md.row_group(g).column(ci).statistics
    if st is None or not st.has_min_max: return True
    i = bisect.bisect_left(need, st.min); return i < len(need) and need[i] <= st.max
def traiter(g):
    f = f'{OUT}/n{g:03d}.json'
    if os.path.exists(f): return
    t = U.groupe(g, COLS); s = set(need); res = {}
    sir = t['siren'].to_pylist()
    idx = [i for i, v in enumerate(sir) if v in s]
    cols = {c: t[c].to_pylist() for c in COLS[1:]} if idx else {}
    for i in idx: res[sir[i]] = {c: cols[c][i] for c in COLS[1:]}
    json.dump({'groupe': g, 'lignes': t.num_rows, 'noms': res}, open(f + '.tmp', 'w')); os.replace(f + '.tmp', f)
if __name__ == '__main__':
    debut = time.time(); tous = list(range(U.md.num_row_groups)); gu = [g for g in tous if utile(g)]
    print('groupes de lignes :', len(tous), '| utiles (SIREN dans leurs bornes) :', len(gu), flush=True)
    a_faire = [g for g in gu if not os.path.exists(f'{OUT}/n{g:03d}.json')]; faits = 0
    with cf.ThreadPoolExecutor(40) as ex:
        for fu in cf.as_completed([ex.submit(traiter, g) for g in a_faire]):
            try: fu.result(); faits += 1
            except Exception as e: print('ERREUR :', e, flush=True); continue
            if faits % 20 == 0: print(f'  {faits}/{len(a_faire)} · {time.time() - debut:.0f} s · {U.octets / 1e6:.0f} Mo', flush=True)
    reste = [g for g in gu if not os.path.exists(f'{OUT}/n{g:03d}.json')]
    print('FINI-B', 'complet' if not reste else f'INCOMPLET : {len(reste)} groupes', f'· {time.time() - debut:.0f} s · {U.octets / 1e6:.0f} Mo', flush=True)
