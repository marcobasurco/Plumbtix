#!/usr/bin/env bash
# =============================================================================
# PlumbTix — Pre-deploy Validation
# =============================================================================
# Run before deploying to catch common configuration issues.
# Usage: bash scripts/pre-deploy-check.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PlumbTix Pre-Deploy Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Supabase CLI installed ──
if command -v supabase &>/dev/null; then
  echo -e "${GREEN}✓${NC} Supabase CLI found: $(supabase --version 2>/dev/null || echo 'unknown')"
else
  echo -e "${RED}✗ Supabase CLI not installed${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ── 2. Project linked ──
if supabase projects list 2>/dev/null | grep -q "●"; then
  PROJECT=$(supabase projects list 2>/dev/null | grep "●" | awk '{print $4}')
  REF=$(supabase projects list 2>/dev/null | grep "●" | awk '{print $4}')
  echo -e "${GREEN}✓${NC} Linked to project: $(supabase projects list 2>/dev/null | grep '●' | awk '{print $6}')"
else
  echo -e "${RED}✗ No project linked. Run: supabase link --project-ref <ref>${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ── 3. config.toml has verify_jwt = false ──
if [ -f supabase/config.toml ]; then
  JWT_COUNT=$(grep -c 'verify_jwt = false' supabase/config.toml 2>/dev/null || echo 0)
  FUNC_COUNT=$(find supabase/functions -maxdepth 1 -type d ! -name '_shared' ! -name 'functions' | wc -l | tr -d ' ')

  if [ "$JWT_COUNT" -ge "$FUNC_COUNT" ] 2>/dev/null; then
    echo -e "${GREEN}✓${NC} config.toml: verify_jwt = false for all $FUNC_COUNT functions"
  else
    echo -e "${YELLOW}⚠${NC} config.toml: verify_jwt = false found $JWT_COUNT times, but $FUNC_COUNT functions exist"
    echo "  This is OK if deploying with --no-verify-jwt flag"
  fi
else
  echo -e "${RED}✗ supabase/config.toml not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

# ── 4. No debug-auth function in production ──
if [ -d supabase/functions/debug-auth ]; then
  echo -e "${YELLOW}⚠${NC} debug-auth function exists — remove before production deploy"
else
  echo -e "${GREEN}✓${NC} No debug-auth function (good)"
fi

# ── 5. package.json deploy script uses --no-verify-jwt ──
if grep -q '"functions:deploy".*--no-verify-jwt' package.json 2>/dev/null; then
  echo -e "${GREEN}✓${NC} package.json: functions:deploy includes --no-verify-jwt"
else
  echo -e "${RED}✗ package.json: functions:deploy missing --no-verify-jwt flag${NC}"
  echo "  Fix: Update to \"functions:deploy\": \"supabase functions deploy --no-verify-jwt\""
  ERRORS=$((ERRORS + 1))
fi

# ── 6. .env.example has correct EDGE_BASE_URL format ──
if [ -f .env.example ]; then
  if grep -q 'VITE_EDGE_BASE_URL.*functions/v1' .env.example 2>/dev/null; then
    echo -e "${GREEN}✓${NC} .env.example: EDGE_BASE_URL includes /functions/v1"
  else
    echo -e "${YELLOW}⚠${NC} .env.example: Check VITE_EDGE_BASE_URL ends with /functions/v1"
  fi
fi

# ── 7. GitHub Actions workflow exists ──
if [ -f .github/workflows/deploy-functions.yml ]; then
  if grep -q '\-\-no-verify-jwt' .github/workflows/deploy-functions.yml; then
    echo -e "${GREEN}✓${NC} CI/CD: deploy-functions.yml uses --no-verify-jwt"
  else
    echo -e "${RED}✗ CI/CD: deploy-functions.yml missing --no-verify-jwt${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${YELLOW}⚠${NC} No GitHub Actions workflow for function deployment"
fi

# ── Summary ──
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  All checks passed. Safe to deploy.${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  Deploy functions:  npm run functions:deploy"
  echo "  Deploy everything: npm run deploy"
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  $ERRORS issue(s) found. Fix before deploying.${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
fi
