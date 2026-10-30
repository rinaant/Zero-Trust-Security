const BOBOT = { A: 4, B: 3, C: 2, D: 1, E: 0 };

function toHuruf(angka) {
  if (angka === null || angka === undefined) return null;
  if (angka >= 85) return 'A';
  if (angka >= 70) return 'B';
  if (angka >= 60) return 'C';
  if (angka >= 50) return 'D';
  return 'E';
}

function hitungIpk(items) {
  let sks = 0;
  let mutu = 0;
  for (const it of items) {
    if (!(it.nilai_huruf in BOBOT)) continue;
    sks += it.sks;
    mutu += it.sks * BOBOT[it.nilai_huruf];
  }
  return { total_sks: sks, ipk: sks ? Math.round((mutu / sks) * 100) / 100 : 0 };
}

module.exports = { toHuruf, hitungIpk };
