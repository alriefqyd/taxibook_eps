PROJECT_REF="usbnhupmmvbgsphopnig"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYm5odXBtbXZiZ3NwaG9wbmlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE0MTc1OCwiZXhwIjoyMDkxNzE3NzU4fQ.IyPYYPt_isNdBQzXuvlhZh1Hjb6Tlz3-RaJskeuXTOk"

declare -A USERS=(
  ["kemal.ernanto@vale.com"]="10610743|KEMAL ERNANTO"
  ["akhmad.khanif.khaidir@vale.com"]="10610671|AKHMAD KHANIF KHAIDIR"
  ["guntari.arifin@vale.com"]="10607398|GUNTARI ARIFIN"
  ["asep.suharto@vale.com"]="10607291|ASEP SUHARTO"
  ["sofyan@vale.com"]="10607764|SOFYAN"
  ["muhwahyu.majidab@vale.com"]="10610557|MUH. WAHYU MAJID AB."
  ["dedi.setiono@vale.com"]="10610649|DEDI SETIONO"
  ["ulfa.nurdianti.bardin@vale.com"]="10611493|ULFA NURDIANTI BARDIN"
  ["ayu.nurizza@vale.com"]="10611622|AYU NURIZZA"
  ["ibrahim.az@vale.com"]="10611602|IBRAHIM AZ"
  ["rachmat.putra@vale.com"]="10611507|RACHMAT SANNIA PUTRA"
  ["ichsan.sahlan@vale.com"]="10611690|ICHSAN SAHLAN"
  ["rio.gunawan@vale.com"]="10611651|RIO GUNAWAN"
  ["fajri.syah.allam@vale.com"]="10611133|FAJRI SYAH ALLAM"
  ["gloryyusuf@vale.com"]="10607635|GLORY YUSUF"
  ["hendra.amping@vale.com"]="10607638|HENDRA AMPING"
  ["awaluddin2@vale.com"]="10607640|AWALUDDIN"
  ["hengkylasampa@vale.com"]="10607642|HENGKY LASAMPA"
  ["oddangriu@vale.com"]="10607683|ODDANG RIU"
  ["derita@vale.com"]="10607719|DERITA"
  ["marthen.rangan@vale.com"]="10607911|MARTHEN RANGAN"
  ["hendrik.mendila@vale.com"]="10608857|HENDRIK MENDILA"
  ["andarias.giling@vale.com"]="10610031|ANDARIAS GILING"
  ["muh.harva@vale.com"]="10610039|MUH. HARVA"
  ["hamka.hamka@vale.com"]="10610040|HAMKA"
  ["victor.passa@vale.com"]="10610045|VICTOR PASSA"
  ["daniel.musu@vale.com"]="10610047|DANIEL GUSTI MUSU"
  ["yustinus.mokuna@vale.com"]="10610049|YUSTINUS MOKUNA"
  ["indaryadi.mustadir@vale.com"]="10610050|INDARYADI MUSTADIR"
  ["daniel.merrandan@vale.com"]="10610422|DANIEL MERRANDAN"
  ["yanto.patilang@vale.com"]="10611891|YANTO PATILANG"
  ["c0692306@vale.com"]="C031543|DEDY ADITYA JERWIS ALAMAKO"
  ["c0692370@vale.com"]="C035536|RACHMAT TIHAN"
  ["c0692307@vale.com"]="C015642|AL MUARIF MUNDU"
  ["c0692438@vale.com"]="C032809|MUHAMMAD AZHAR"
  ["c0692439@vale.com"]="C023196|MUH. ASSYDIQ AKBAR RAMDHANI"
  ["c0692305@vale.com"]="C023054|LAZUARDI IMAN"
  ["c0704447@vale.com"]="C039805|SYAHRIL"
  ["c0679398@vale.com"]="C036475|ASTRI IVO"
)

SUCCESS=0
FAILED=0

for EMAIL in "${!USERS[@]}"; do
  IFS='|' read -r BADGE NAME <<< "${USERS[$EMAIL]}"
  PASSWORD="${BADGE}@123"

  RESPONSE=$(curl -s -X POST \
    "https://${PROJECT_REF}.supabase.co/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${EMAIL}\",
      \"password\": \"${PASSWORD}\",
      \"email_confirm\": true,
      \"user_metadata\": {\"name\": \"${NAME}\"},
      \"app_metadata\": {\"provider\": \"email\", \"providers\": [\"email\"]}
    }")

  USER_ID=$(echo "$RESPONSE" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

  if [ -z "$USER_ID" ]; then
    ERR=$(echo "$RESPONSE" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('msg',d.get('message','unknown')))" 2>/dev/null)
    echo "❌ ${EMAIL}: ${ERR}"
    ((FAILED++))
  else
    curl -s -X POST \
      "https://${PROJECT_REF}.supabase.co/rest/v1/users" \
      -H "apikey: ${SERVICE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"id\":\"${USER_ID}\",\"name\":\"${NAME}\",\"email\":\"${EMAIL}\",\"role\":\"staff\",\"is_active\":true}" > /dev/null

    echo "✓ ${NAME} (${EMAIL})"
    ((SUCCESS++))
  fi

  sleep 0.3
done

echo ""
echo "Done! ✓ ${SUCCESS} created, ❌ ${FAILED} failed"
