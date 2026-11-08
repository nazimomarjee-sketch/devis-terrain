// Générateur PDF minimal (texte, police Courier, WinAnsi) sans dépendance.
// Volontairement simple : mise en page de prototype, pas un rendu commercial final.

const SPECIAUX = { '€': 0x80, '—': 0x97, '–': 0x96, '’': 0x92, '«': 0xab, '»': 0xbb };

export function encoderWinAnsi(texte) {
  const octets = [];
  for (const c of texte) {
    const code = c.codePointAt(0);
    if (SPECIAUX[c] !== undefined) octets.push(SPECIAUX[c]);
    else if (code >= 32 && code < 127) octets.push(code);
    else if (code >= 160 && code < 256) octets.push(code);
    else octets.push(0x3f); // '?'
  }
  return Buffer.from(octets);
}

const echapper = (buf) => {
  const sortie = [];
  for (const o of buf) {
    if (o === 0x28 || o === 0x29 || o === 0x5c) sortie.push(0x5c);
    sortie.push(o);
  }
  return Buffer.from(sortie);
};

export function genererPdf(lignes, { lignesParPage = 58 } = {}) {
  const pages = [];
  for (let i = 0; i < Math.max(lignes.length, 1); i += lignesParPage) pages.push(lignes.slice(i, i + lignesParPage));

  const objets = []; // index 0 => objet 1
  const nPages = pages.length;
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ');
  objets.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'));
  objets.push(Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${nPages} >>`));
  objets.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'));
  pages.forEach((pl, i) => {
    objets.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`));
    const morceaux = [Buffer.from('BT\n/F1 9 Tf\n12 TL\n40 800 Td\n')];
    for (const l of pl) {
      morceaux.push(Buffer.from('('), echapper(encoderWinAnsi(l)), Buffer.from(') Tj T*\n'));
    }
    morceaux.push(Buffer.from('ET'));
    const flux = Buffer.concat(morceaux);
    objets.push(Buffer.concat([Buffer.from(`<< /Length ${flux.length} >>\nstream\n`), flux, Buffer.from('\nendstream')]));
  });

  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [];
  let pos = parts[0].length;
  objets.forEach((o, i) => {
    offsets.push(pos);
    const bloc = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    parts.push(bloc);
    pos += bloc.length;
  });
  const xrefPos = pos;
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}
