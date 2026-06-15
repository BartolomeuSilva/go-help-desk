#!/bin/bash

# Script de Deploy do Go Help Desk para a VPS via Docker Hub
# Configurado para: https://gohelpdesk.ichatbot.com.br

# Cores para a saída
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sem cor

# Obter diretório do script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}"

# Variáveis padrão
DOCKERHUB_USER=""
IMAGE_TAG="latest"
DRY_RUN=false
PUSH_ONLY=false
IMAGE_NAME="go-help-desk"

# Função de ajuda
show_help() {
    echo "Uso: $0 [opções]"
    echo ""
    echo "Opções:"
    echo "  -u, --user USERNAME     Define o nome de usuário do Docker Hub"
    echo "  -t, --tag TAG           Define a tag da imagem (padrão: latest)"
    echo "  -p, --push-only         Apenas faz o push da imagem existente (pula o build)"
    echo "  -d, --dry-run           Modo de simulação (mostra os comandos sem executá-los)"
    echo "  -h, --help              Exibe esta mensagem de ajuda"
    echo ""
    echo "Exemplos:"
    echo "  $0 -u meuusuario"
    echo "  $0 -u meuusuario -t v1.0.0"
    echo "  $0 --user meuusuario --dry-run"
}

# Processar argumentos
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -u|--user) DOCKERHUB_USER="$2"; shift ;;
        -t|--tag) IMAGE_TAG="$2"; shift ;;
        -p|--push-only) PUSH_ONLY=true ;;
        -d|--dry-run) DRY_RUN=true ;;
        -h|--help) show_help; exit 0 ;;
        *) echo -e "${RED}Opção desconhecida: $1${NC}"; show_help; exit 1 ;;
    esac
    shift
done

echo -e "${BLUE}=== Go Help Desk VPS Deployment Tool ===${NC}"

# Verificar Docker localmente
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Erro: Docker não está instalado nesta máquina local.${NC}"
    exit 1
fi

# Solicitar usuário do Docker Hub se não fornecido
if [ -z "${DOCKERHUB_USER}" ]; then
    # Se estiver em modo não-interativo ou sem TTY (ex: no CI), falha
    if [ ! -t 0 ]; then
        echo -e "${RED}Erro: Usuário do Docker Hub não especificado. Use a flag -u ou --user.${NC}"
        exit 1
    fi
    echo -n "Digite seu usuário do Docker Hub: "
    read -r DOCKERHUB_USER
    if [ -z "${DOCKERHUB_USER}" ]; then
        echo -e "${RED}Erro: O usuário do Docker Hub não pode ser vazio.${NC}"
        exit 1
    fi
fi

FULL_IMAGE_NAME="${DOCKERHUB_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}Configuração:${NC}"
echo -e "  Imagem Docker Hub: ${GREEN}${FULL_IMAGE_NAME}${NC}"
echo -e "  Subdomínio VPS:    ${GREEN}https://gohelpdesk.ichatbot.com.br${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "  Modo:              ${YELLOW}Simulação (Dry Run)${NC}"
fi
echo ""

# Verificar se está logado no Docker Hub
if [ "$DRY_RUN" = false ]; then
    echo -e "${BLUE}Verificando login no Docker Hub...${NC}"
    # Tenta verificar se há credenciais configuradas para o docker hub no config.json do docker
    if ! grep -q "index.docker.io" ~/.docker/config.json 2>/dev/null; then
        echo -e "${YELLOW}Aviso: Não encontramos login ativo no Docker Hub em ~/.docker/config.json.${NC}"
        echo -e "${YELLOW}Tentando executar 'docker login' para garantir acesso...${NC}"
        docker login || { echo -e "${RED}Erro: Falha ao autenticar no Docker Hub.${NC}"; exit 1; }
    else
        echo -e "${GREEN}Login ativo detectado ou configurado.${NC}"
    fi
fi

# 1. Compilação da Imagem Docker (Build)
if [ "$PUSH_ONLY" = false ]; then
    echo -e "${BLUE}Compilando imagem Docker localmente...${NC}"
    BUILD_CMD="docker build -t ${FULL_IMAGE_NAME} -f backend/Dockerfile ."
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[Simulação] Executando:${NC} ${BUILD_CMD}"
    else
        echo -e "${GREEN}Executando:${NC} ${BUILD_CMD}"
        $BUILD_CMD
        if [ $? -ne 0 ]; then
            echo -e "${RED}Erro: Falha no build da imagem Docker.${NC}"
            exit 1
        fi
        echo -e "${GREEN}Imagem compilada com sucesso!${NC}"
    fi
else
    echo -e "${YELLOW}Pulando build da imagem (modo push-only)...${NC}"
fi

# 2. Push da Imagem para o Docker Hub
echo -e "${BLUE}Enviando imagem para o Docker Hub...${NC}"
PUSH_CMD="docker push ${FULL_IMAGE_NAME}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[Simulação] Executando:${NC} ${PUSH_CMD}"
else
    echo -e "${GREEN}Executando:${NC} ${PUSH_CMD}"
    $PUSH_CMD
    if [ $? -ne 0 ]; then
        echo -e "${RED}Erro: Falha no push da imagem para o Docker Hub. Verifique se o repositório existe ou se você tem permissão.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Imagem enviada com sucesso para o Docker Hub!${NC}"
fi

# 3. Instruções de Deployment
echo -e "\n${BLUE}========================================================================${NC}"
echo -e "${GREEN}Pronto! A imagem foi preparada e enviada.${NC}"
echo -e "Para subir o aplicativo na sua VPS usando o Portainer, siga estes passos:"
echo -e "${BLUE}========================================================================${NC}"
echo -e "1. Acesse o painel do seu Portainer na VPS."
echo -e "2. Vá em ${GREEN}Stacks${NC} -> ${GREEN}Add stack${NC}."
echo -e "3. Defina um nome para a Stack (ex: 'go-help-desk')."
echo -e "4. No editor web, cole o conteúdo do arquivo ${YELLOW}docker-compose.vps.yml${NC}."
echo -e "5. Em ${BLUE}Environment variables${NC} da stack, adicione as seguintes variáveis:"
echo -e "   - ${GREEN}DOCKERHUB_IMAGE${NC}=${FULL_IMAGE_NAME}"
echo -e "   - ${GREEN}POSTGRES_PASSWORD${NC}=<defina-uma-senha-forte-do-banco>"
echo -e "   - ${GREEN}SESSION_SECRET${NC}=$(openssl rand -base64 32 2>/dev/null || echo 'gerar-chave-com-openssl')"
echo -e "   - ${GREEN}JWT_SECRET${NC}=$(openssl rand -base64 32 2>/dev/null || echo 'gerar-chave-com-openssl')"
echo -e "6. Se for usar e-mail, configure as variáveis de SMTP adicionais (veja o arquivo docker/docker-compose.yml)."
echo -e "7. Clique em ${GREEN}Deploy the stack${NC}."
echo -e "${BLUE}========================================================================${NC}"
echo -e "Nota: Certifique-se de que a rede externa ${YELLOW}network_public${NC} existe na VPS."
echo -e "Caso ela não exista, crie-a no Portainer (Networks -> Add network com driver bridge e nome 'network_public') ou via SSH executando:"
echo -e "${YELLOW}docker network create network_public${NC}"
echo -e "${BLUE}========================================================================${NC}"
