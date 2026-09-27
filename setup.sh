#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Smart Attendance System — One-Shot Setup Script
# Usage: chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN='\033[0;32m'
TEAL='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${TEAL}╔══════════════════════════════════════════════╗${NC}"
echo -e "${TEAL}║   Smart Attendance System — Setup Script     ║${NC}"
echo -e "${TEAL}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Check dependencies ────────────────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 is not installed. Please install it first.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

echo "Checking prerequisites..."
check_cmd node
check_cmd npm
check_cmd python3

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ required (found $(node -v))${NC}"
  exit 1
fi

echo ""

# ── Backend setup ─────────────────────────────────────────────────────────────

echo -e "${TEAL}[1/4] Setting up backend...${NC}"
cd backend

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}  ⚠  Created backend/.env — edit your MONGODB_URI and JWT_SECRET!${NC}"
fi

npm install --silent
echo -e "${GREEN}  ✓ Backend dependencies installed${NC}"
cd ..

# ── Frontend setup ────────────────────────────────────────────────────────────

echo -e "${TEAL}[2/4] Setting up frontend...${NC}"
cd frontend

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${GREEN}  ✓ Created frontend/.env${NC}"
fi

npm install --silent
echo -e "${GREEN}  ✓ Frontend dependencies installed${NC}"
cd ..

# ── Python setup ──────────────────────────────────────────────────────────────

echo -e "${TEAL}[3/4] Setting up Python face recognition...${NC}"
cd face-recognition

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${YELLOW}  ⚠  Created face-recognition/.env — add your SERVICE_TOKEN after first login${NC}"
fi

if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo -e "${GREEN}  ✓ Python virtual environment created${NC}"
fi

source venv/bin/activate

echo "  Installing Python packages (this may take a few minutes — dlib compiles from source)..."
pip install -r requirements.txt --quiet
echo -e "${GREEN}  ✓ Python dependencies installed${NC}"

deactivate
cd ..

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${TEAL}[4/4] Setup complete!${NC}"
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 Smart Attendance System is ready!                    ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Next steps:                                             ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  1. Edit backend/.env with your MongoDB URI & JWT secret ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  2. Start backend:                                       ║${NC}"
echo -e "${GREEN}║     cd backend && npm run dev                            ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  3. Start frontend (new terminal):                       ║${NC}"
echo -e "${GREEN}║     cd frontend && npm start                             ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  4. Start Python service (new terminal):                 ║${NC}"
echo -e "${GREEN}║     cd face-recognition                                  ║${NC}"
echo -e "${GREEN}║     source venv/bin/activate                             ║${NC}"
echo -e "${GREEN}║     python recognize_face.py                             ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  5. (Optional) Seed demo data:                           ║${NC}"
echo -e "${GREEN}║     cd backend && node seed.js                           ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  App URLs:                                               ║${NC}"
echo -e "${GREEN}║    Frontend  → http://localhost:3000                     ║${NC}"
echo -e "${GREEN}║    Backend   → http://localhost:5000/api/health          ║${NC}"
echo -e "${GREEN}║    Python    → http://localhost:8000/status              ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Demo login (after seeding):                             ║${NC}"
echo -e "${GREEN}║    Admin   : admin@demo.com  / password123               ║${NC}"
echo -e "${GREEN}║    Student : aditya@demo.com / password123               ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
