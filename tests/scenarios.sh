#!/usr/bin/env bash
# Uji otomatis skenario Zero Trust. Jalankan setelah `npm run seed` dan `npm run backend`.
# Catatan: skenario finalisasi mengubah data; jalankan `npm run seed` untuk mereset.
GW=${GW:-http://localhost:3000}
N=${N:-http://localhost:3001}
T=${T:-http://localhost:3002}
PASS=0; FAIL=0

req() { curl -s -o /tmp/zt_body -w "%{http_code}" "$@"; }
check() { # nama, status diharapkan, status aktual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  [PASS] %s (HTTP %s)\n" "$1" "$3"
  else FAIL=$((FAIL+1)); printf "  [FAIL] %s (diharapkan %s, dapat %s) -> %s\n" "$1" "$2" "$3" "$(cat /tmp/zt_body)"; fi
}
login() { # user pass device -> access token
  curl -s -X POST "$GW/auth/login" -H "Content-Type: application/json" -H "X-Device-ID: $3" \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" | sed -E 's/.*"access_token":"([^"]+)".*/\1/'
}
json() { echo "Content-Type: application/json"; }

echo "== Autentikasi & device =="
check "Login valid (dosen.a, device terdaftar)" 200 "$(req -X POST $GW/auth/login -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-A-01' -d '{"username":"dosen.a","password":"dosenA123"}')"
check "Login password salah" 401 "$(req -X POST $GW/auth/login -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-A-01' -d '{"username":"dosen.a","password":"salah"}')"
check "Login device tidak terdaftar" 403 "$(req -X POST $GW/auth/login -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-ASING' -d '{"username":"dosen.a","password":"dosenA123"}')"

DA=$(login dosen.a dosenA123 DEV-DOSEN-A-01); DB=$(login dosen.b dosenB123 DEV-DOSEN-B-01)
M1=$(login mhs1 mhs1123 DEV-MHS-1-01); AD=$(login admin admin123 DEV-ADMIN-01)

echo "== Gateway: token & device =="
check "Tanpa token" 401 "$(req $GW/nilai -H 'X-Device-ID: DEV-DOSEN-A-01')"
check "Token palsu" 401 "$(req $GW/nilai -H 'Authorization: Bearer abc.def.ghi' -H 'X-Device-ID: DEV-DOSEN-A-01')"
check "Device tidak terdaftar" 403 "$(req $GW/nilai -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-ASING')"
check "Device milik user lain" 403 "$(req $GW/nilai -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-B-01')"
check "Tanpa X-Device-ID" 403 "$(req $GW/nilai -H "Authorization: Bearer $DA")"

echo "== Kebijakan akses (ABAC) =="
check "Dosen A melihat nilai kelasnya" 200 "$(req "$GW/nilai?kelas_id=1" -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01')"
check "Dosen A melihat nilai kelas Y" 403 "$(req "$GW/nilai?kelas_id=2" -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01')"
check "Dosen A edit nilai kelas Y (id 3)" 403 "$(req -X PUT $GW/nilai/3 -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'Content-Type: application/json' -d '{"nilai_angka":95}')"
check "Dosen A edit nilai kelas X (id 1) jam 10:00" 200 "$(req -X PUT $GW/nilai/1 -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 10:00' -H 'Content-Type: application/json' -d '{"nilai_angka":90}')"
check "Dosen A edit nilai jam 23:30 (luar jam akses)" 403 "$(req -X PUT $GW/nilai/1 -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 23:30' -H 'Content-Type: application/json' -d '{"nilai_angka":91}')"
check "Dosen A finalisasi jam 05:00 (luar jam akses)" 403 "$(req -X POST $GW/kelas/1/finalisasi -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 05:00')"
check "Dosen A finalisasi kelas Y" 403 "$(req -X POST $GW/kelas/2/finalisasi -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 10:00')"
check "Mahasiswa edit nilai" 403 "$(req -X PUT $GW/nilai/1 -H "Authorization: Bearer $M1" -H 'X-Device-ID: DEV-MHS-1-01' -H 'X-Demo-Time: 10:00' -H 'Content-Type: application/json' -d '{"nilai_angka":100}')"
check "Mahasiswa melihat transkrip sendiri" 200 "$(req $GW/transkrip/2021001 -H "Authorization: Bearer $M1" -H 'X-Device-ID: DEV-MHS-1-01')"
check "Mahasiswa melihat transkrip NIM lain" 403 "$(req $GW/transkrip/2021002 -H "Authorization: Bearer $M1" -H 'X-Device-ID: DEV-MHS-1-01')"
check "Admin melihat transkrip semua NIM" 200 "$(req $GW/transkrip/2021002 -H "Authorization: Bearer $AD" -H 'X-Device-ID: DEV-ADMIN-01')"
check "Admin mengubah nilai" 403 "$(req -X PUT $GW/nilai/1 -H "Authorization: Bearer $AD" -H 'X-Device-ID: DEV-ADMIN-01' -H 'X-Demo-Time: 10:00' -H 'Content-Type: application/json' -d '{"nilai_angka":100}')"
check "Dosen melihat audit log" 403 "$(req $GW/audit -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01')"
check "Admin melihat audit log" 200 "$(req $GW/audit -H "Authorization: Bearer $AD" -H 'X-Device-ID: DEV-ADMIN-01')"

echo "== Inter-service auth =="
check "Sinkron dengan token user (dosen)" 403 "$(req -X POST $GW/transkrip/sinkron -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'Content-Type: application/json' -d '{}')"
check "Client service salah" 401 "$(req -X POST $GW/auth/service -H 'Content-Type: application/json' -d '{"client_id":"service-nilai","client_secret":"salah"}')"

echo "== Direct access blocked & double verification =="
check "Akses langsung Service Nilai tanpa secret" 403 "$(req $N/nilai)"
check "Akses langsung Service Transkrip tanpa secret" 403 "$(req $T/transkrip/2021001)"
check "Akses langsung dengan secret salah" 403 "$(req $N/nilai -H 'X-Gateway-Secret: salah')"
SECRET=${GATEWAY_SECRET:-dev-gateway-secret-ganti-di-produksi}
check "Secret benar tanpa token" 401 "$(req $N/nilai -H "X-Gateway-Secret: $SECRET")"
check "Secret benar + token palsu" 401 "$(req $T/transkrip/2021001 -H "X-Gateway-Secret: $SECRET" -H 'Authorization: Bearer palsu.palsu.palsu')"
check "Secret benar + token mahasiswa lain NIM" 403 "$(req $T/transkrip/2021002 -H "X-Gateway-Secret: $SECRET" -H "Authorization: Bearer $M1")"
check "Secret benar + token user ke /sinkron" 403 "$(req -X POST $T/transkrip/sinkron -H "X-Gateway-Secret: $SECRET" -H "Authorization: Bearer $DA" -H 'Content-Type: application/json' -d '{}')"

echo "== Finalisasi + sinkron transkrip =="
req -X PUT $GW/nilai/2 -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 10:00' -H 'Content-Type: application/json' -d '{"nilai_angka":75}' >/dev/null
check "Finalisasi kelas X oleh Dosen A" 200 "$(req -X POST $GW/kelas/1/finalisasi -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 10:00')"
check "Edit nilai yang sudah final" 403 "$(req -X PUT $GW/nilai/1 -H "Authorization: Bearer $DA" -H 'X-Device-ID: DEV-DOSEN-A-01' -H 'X-Demo-Time: 10:00' -H 'Content-Type: application/json' -d '{"nilai_angka":50}')"
check "Transkrip mhs1 memuat hasil sinkron" 200 "$(req $GW/transkrip/2021001 -H "Authorization: Bearer $M1" -H 'X-Device-ID: DEV-MHS-1-01')"
grep -q "Keamanan Informasi" /tmp/zt_body && echo "  [PASS] Mata kuliah hasil finalisasi muncul di transkrip" || { echo "  [FAIL] transkrip belum memuat hasil sinkron"; FAIL=$((FAIL+1)); }

echo "== Refresh & logout =="
RT=$(curl -s -X POST $GW/auth/login -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-1-01' -d '{"username":"mhs1","password":"mhs1123"}' | sed -E 's/.*"refresh_token":"([^"]+)".*/\1/')
check "Refresh dari device lain" 403 "$(req -X POST $GW/auth/refresh -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-ASING' -d "{\"refresh_token\":\"$RT\"}")"
check "Refresh valid" 200 "$(req -X POST $GW/auth/refresh -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-1-01' -d "{\"refresh_token\":\"$RT\"}")"
check "Refresh token lama (dirotasi) ditolak" 401 "$(req -X POST $GW/auth/refresh -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-1-01' -d "{\"refresh_token\":\"$RT\"}")"
RT2=$(curl -s -X POST $GW/auth/login -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-1-01' -d '{"username":"mhs1","password":"mhs1123"}' | sed -E 's/.*"refresh_token":"([^"]+)".*/\1/')
check "Logout mencabut refresh token" 200 "$(req -X POST $GW/auth/logout -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$RT2\"}")"
check "Refresh setelah logout ditolak" 401 "$(req -X POST $GW/auth/refresh -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-1-01' -d "{\"refresh_token\":\"$RT2\"}")"

echo; echo "Hasil: $PASS lulus, $FAIL gagal"; [ $FAIL -eq 0 ]
