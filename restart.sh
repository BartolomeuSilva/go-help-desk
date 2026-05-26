#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Determine script directory to resolve paths correctly
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DOCKER_DIR="${SCRIPT_DIR}/docker"
PID_FILE="${SCRIPT_DIR}/.dev_pids"

echo -e "${BLUE}=== Go Help Desk Manager porta 8080 ===${NC}"

# Parse options
MODE="docker"
BUILD=false
LOGS=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -b|--build) BUILD=true ;;
        -l|--logs) LOGS=true ;;
        -d|--dev) MODE="dev" ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  -b, --build    Rebuild Docker containers before starting (Docker mode only)"
            echo "  -l, --logs     Stream container logs after starting (Docker mode only)"
            echo "  -d, --dev      Run in local development mode (Go + Vite) instead of Docker"
            echo "  -h, --help     Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use -h or --help for usage."
            exit 1
            ;;
    esac
    shift
done

# Function to clean up local dev mode background processes
stop_local_dev() {
    if [ -f "$PID_FILE" ]; then
        echo -e "${BLUE}Stopping existing local development processes...${NC}"
        while read -r pid; do
            if ps -p "$pid" > /dev/null 2>&1; then
                echo -e "${YELLOW}Killing process $pid...${NC}"
                kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
        echo -e "${GREEN}Local development processes stopped.${NC}"
    fi
}

if [ "$MODE" = "dev" ]; then
    # Local Development Mode (Go backend + Vite frontend)
    echo -e "${BLUE}Starting application in Local Development mode...${NC}"
    
    # 1. Stop any existing dev processes
    stop_local_dev
    
    # Check dependencies
    if ! command -v go &> /dev/null; then
        echo -e "${RED}Error: go is not installed or not in PATH.${NC}"
        exit 1
    fi
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is not installed or not in PATH.${NC}"
        exit 1
    fi

    # Start Backend
    echo -e "${BLUE}Starting Go backend...${NC}"
    if [ ! -d "${SCRIPT_DIR}/backend" ]; then
        echo -e "${RED}Error: backend directory not found.${NC}"
        exit 1
    fi
    
    cd "${SCRIPT_DIR}/backend"
    # Run backend in background and log to a file
    go run ./cmd/server > "${SCRIPT_DIR}/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo "$BACKEND_PID" > "$PID_FILE"
    
    # Start Frontend
    echo -e "${BLUE}Starting Vite frontend...${NC}"
    if [ ! -d "${SCRIPT_DIR}/frontend" ]; then
        echo -e "${RED}Error: frontend directory not found.${NC}"
        exit 1
    fi
    
    cd "${SCRIPT_DIR}/frontend"
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}node_modules not found in frontend. Running npm install...${NC}"
        npm install
    fi
    
    npm run dev > "${SCRIPT_DIR}/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "$FRONTEND_PID" >> "$PID_FILE"

    echo -e "${GREEN}Go Help Desk started in Development mode!${NC}"
    echo -e "Backend PID: ${BLUE}$BACKEND_PID${NC} (logs: backend.log)"
    echo -e "Frontend PID: ${BLUE}$FRONTEND_PID${NC} (logs: frontend.log)"
    echo -e "Frontend available at: ${GREEN}http://localhost:5173${NC} (or as configured by Vite)"
    echo -e "To stop these processes, run: ${YELLOW}$0 --dev${NC} (will stop and restart) or kill them manually."

else
    # Docker Compose Mode
    echo -e "${BLUE}Starting application in Docker Compose mode...${NC}"
    
    # Stop local dev if running to avoid port conflicts (port 8080)
    stop_local_dev

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: docker is not installed. Please install Docker and try again.${NC}"
        exit 1
    fi

    # Check Docker Compose version
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        echo -e "${RED}Error: docker compose is not installed. Please install Docker Compose and try again.${NC}"
        exit 1
    fi

    # Ensure .env file exists
    if [ ! -f "${DOCKER_DIR}/.env" ]; then
        echo -e "${YELLOW}Warning: docker/.env not found.${NC}"
        if [ -f "${DOCKER_DIR}/.env.example" ]; then
            echo -e "${BLUE}Creating docker/.env from docker/.env.example...${NC}"
            cp "${DOCKER_DIR}/.env.example" "${DOCKER_DIR}/.env"
            echo -e "${YELLOW}Please configure your secrets in docker/.env if needed.${NC}"
        else
            echo -e "${RED}Error: docker/.env.example not found. Cannot bootstrap environment config.${NC}"
            exit 1
        fi
    fi

    cd "${DOCKER_DIR}"

    echo -e "${BLUE}Stopping existing containers...${NC}"
    $DOCKER_COMPOSE down --remove-orphans

    if [ "$BUILD" = true ]; then
        echo -e "${BLUE}Building and starting containers...${NC}"
        $DOCKER_COMPOSE up -d --build
    else
        echo -e "${BLUE}Starting containers...${NC}"
        $DOCKER_COMPOSE up -d
    fi

    echo -e "${GREEN}Docker containers started successfully!${NC}"
    $DOCKER_COMPOSE ps

    if [ "$LOGS" = true ]; then
        echo -e "${BLUE}Streaming logs (Press Ctrl+C to exit)...${NC}"
        $DOCKER_COMPOSE logs -f
    fi
fi
