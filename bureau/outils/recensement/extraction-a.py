"""Extraction A : établissements ACTIFS de code 45.20A (NAF rév. 2) des départements 95, 94, 91, 77, 93, depuis le fichier officiel INSEE StockEtablissement (Parquet, data.gouv.fr).
Lecture PARTIELLE (quelques colonnes), groupes de lignes en parallèle, reprenable : un fichier de reprise par groupe. Résultats HORS dépôt."""
import sys, os, json, time, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pq_distant import Distant
import pyarrow.compute as pc
SORTIE = os.environ.get('RECENSEMENT_SORTIE') or os.path.join(os.getcwd(), 'recensement-sortie')  # HORS dépôt (le dossier est ignoré par git)
OUT = SORTIE + '/export-annuaire/groupes'; os.makedirs(OUT, exist_ok=True)
URL = "https://static.data.gouv.fr/resources/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/20261103-101714/stock-stocketablissement-parquet.parquet"
DEP = ('95', '94', '91', '77', '93')
E = Distant(URL, 2231588933)
C1 = ['activitePrincipaleEtablissement', 'nomenclatureActivitePrincipaleEtablissement', 'etatAdministratifEtablissement', 'codeCommuneEtablissement']
C2 = ['siren', 'nic', 'codePostalEtablissement', 'enseigne1Etablissement', 'denominationUsuelleEtablissement', 'statutDiffusionEtablissement']
def traiter(g):
    f = f'{OUT}/g{g:03d}.json'
    if os.path.exists(f): return g, None
    t = E.groupe(g, C1)
    naf = pc.equal(t['activitePrincipaleEtablissement'], '45.20A'); etat = pc.equal(t['etatAdministratifEtablissement'], 'A')
    dep = pc.is_in(pc.utf8_slice_codeunits(t['codeCommuneEtablissement'], 0, 2), value_set=__import__('pyarrow').array(list(DEP)))
    nom = pc.equal(t['nomenclatureActivitePrincipaleEtablissement'], 'NAFRev2')
    vus = {'lignes': t.num_rows, 'naf_actifs_toutes_zones': pc.sum(pc.and_(naf, etat)).as_py() or 0}
    m = pc.and_(pc.and_(naf, etat), pc.and_(dep, nom))
    idx = [i for i, v in enumerate(m.to_pylist()) if v]
    # 45.20A actif dans nos départements mais hors NAFRev2 : compté à part (jamais mélangé)
    vus['hors_nomenclature'] = pc.sum(pc.and_(pc.and_(naf, etat), pc.and_(dep, pc.invert(nom)))).as_py() or 0
    lignes = []
    if idx:
        t2 = E.groupe(g, C2).take(idx); c1 = t.take(idx)
        for i in range(len(idx)):
            r = {k: t2[k][i].as_py() for k in C2}; r['commune'] = c1['codeCommuneEtablissement'][i].as_py(); r['naf'] = '45.20A'
            r['siret'] = (r['siren'] or '') + (r['nic'] or ''); lignes.append(r)
    json.dump({'groupe': g, 'vus': vus, 'lignes': lignes}, open(f + '.tmp', 'w')); os.replace(f + '.tmp', f)
    return g, len(lignes)
if __name__ == '__main__':
    debut = time.time(); faits = 0
    a_faire = [g for g in range(E.md.num_row_groups) if not os.path.exists(f'{OUT}/g{g:03d}.json')]
    print('groupes à lire :', len(a_faire), '/', E.md.num_row_groups, flush=True)
    with cf.ThreadPoolExecutor(int(sys.argv[1]) if len(sys.argv) > 1 else 12) as ex:
        futs = [ex.submit(traiter, g) for g in a_faire]
        for fu in cf.as_completed(futs):
            try: g, n = fu.result(); faits += 1
            except Exception as e: print('ERREUR groupe :', e, flush=True); continue
            if faits % 20 == 0: print(f'  {faits}/{len(a_faire)} groupes · {time.time() - debut:.0f} s · {E.octets / 1e6:.0f} Mo lus', flush=True)
    restants = [g for g in range(E.md.num_row_groups) if not os.path.exists(f'{OUT}/g{g:03d}.json')]
    print('FINI-A', 'complet' if not restants else f'INCOMPLET : {len(restants)} groupes à relancer', f'· {time.time() - debut:.0f} s · {E.octets / 1e6:.0f} Mo', flush=True)
