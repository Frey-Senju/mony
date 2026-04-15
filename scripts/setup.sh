#!/bin/bash
# Setup script for Mony development environment

set -e

echo "🚀 Setting up Mony development environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"

# Install root dependencies
echo -e "${BLUE}Installing root dependencies...${NC}"
npm install

# Setup frontend
echo -e "${BLUE}Setting up frontend...${NC}"
cd apps/web
npm install
cp .env.example .env.local 2>/dev/null || true
cd ../..

# Setup backend
echo -e "${BLUE}Setting up backend...${NC}"
cd apps/api
python -m venv venv
source venv/bin/activate || . venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env 2>/dev/null || true
cd ../..

# Setup shared packages
echo -e "${BLUE}Setting up shared packages...${NC}"
cd packages/shared
npm install
npm run build
cd ../..

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "1. Update .env files with your configuration"
echo "2. Run: npm run dev  (to start all services)"
echo "3. Frontend: http://localhost:3000"
echo "4. Backend API: http://localhost:8000"
echo "5. API Docs: http://localhost:8000/docs"
echo ""
echo "Documentation:"
echo "- Architecture: docs/ARCHITECTURE.md"
echo "- API: docs/API.md"
echo "- Deployment: docs/DEPLOYMENT.md"
