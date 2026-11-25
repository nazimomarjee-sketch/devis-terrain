"""Lecture PARTIELLE d'un fichier Parquet distant : en-tête + seulement les colonnes demandées, par blocs de 8 Mo avec reprises.
Aucune donnée n'est stockée : on garde en mémoire les morceaux utiles d'un groupe de lignes à la fois."""
import io, struct, subprocess, time, concurrent.futures as cf
import pyarrow.parquet as pq
BLOC = 8_000_000
def curl(url, a, b, essais=8):
    for i in range(essais):
        r = subprocess.run(['curl', '-sS', '-m', '90', '-r', f'{a}-{b}', url], capture_output=True)
        if r.returncode == 0 and len(r.stdout) == b - a + 1: return r.stdout
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'octets {a}-{b} illisibles après {essais} essais')
def plage(url, a, b, pool):
    morceaux = [(x, min(b, x + BLOC - 1)) for x in range(a, b + 1, BLOC)]
    if len(morceaux) == 1: return curl(url, *morceaux[0])      # pas de sous-groupe de fils pour un seul morceau
    return b''.join(pool.map(lambda m: curl(url, *m), morceaux))
class Eparse(io.RawIOBase):
    def __init__(s, taille, secours=None): s.t = taille; s.p = 0; s.r = {}; s.secours = secours
    def ajouter(s, a, data): s.r[a] = data
    def seekable(s): return True
    def readable(s): return True
    def seek(s, o, w=0): s.p = o if w == 0 else (s.p + o if w == 1 else s.t + o); return s.p
    def tell(s): return s.p
    def read(s, n=-1):
        n = s.t - s.p if n < 0 else n; a, b = s.p, min(s.t, s.p + n)
        for d, data in s.r.items():
            if d <= a and b <= d + len(data): s.p = b; return data[a - d:b - d]
        if s.secours:  # octets non prévus (pages de dictionnaire placées avant le premier décalage annoncé) : lus à la demande, jamais devinés
            data = s.secours(a, b - 1); s.r[a] = data; s.p = b; return data
        raise RuntimeError(f'octets {a}-{b} non chargés')
    def readinto(s, buf): d = s.read(len(buf)); buf[:len(d)] = d; return len(d)
def self_lire(d, a, b):
    d.octets += b - a + 1; d.secours_n = getattr(d, 'secours_n', 0) + 1; return plage(d.url, a, b, d.pool)
class Distant:
    def __init__(s, url, taille, fils=4):
        s.url, s.t = url, taille; s.pool = cf.ThreadPoolExecutor(fils)
        pied = curl(url, taille - 8, taille - 1); n = struct.unpack('<I', pied[:4])[0]
        s.pied = curl(url, taille - 8 - n, taille - 1); s.debut_pied = taille - 8 - n
        f = Eparse(taille); f.ajouter(s.debut_pied, s.pied); s.md = pq.read_metadata(f)
        s.noms = [s.md.schema.column(i).name for i in range(s.md.num_columns)]
        s.octets = 0
    def taille_colonne(s, nom):
        i = s.noms.index(nom); return sum(s.md.row_group(g).column(i).total_compressed_size for g in range(s.md.num_row_groups))
    def groupe(s, g, colonnes):
        """Table pyarrow d'un groupe de lignes, pour ces colonnes seulement."""
        f = Eparse(s.t, secours=lambda a, b: self_lire(s, a, b)); f.ajouter(s.debut_pied, s.pied)
        for c in colonnes:
            cc = s.md.row_group(g).column(s.noms.index(c))
            a = min(x for x in (cc.dictionary_page_offset, cc.data_page_offset) if x and x > 0)
            b = min(s.debut_pied - 1, a + cc.total_compressed_size - 1 + 8192)   # pyarrow lit quelques octets de plus que la taille annoncée
            f.ajouter(a, plage(s.url, a, b, s.pool)); s.octets += b - a + 1
        return pq.ParquetFile(f, metadata=s.md).read_row_group(g, columns=colonnes)
