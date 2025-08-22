#!/bin/bash

# Luxe Staycations - Deployment Script
# This script handles deployment to multiple platforms

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="luxe-staycations"
API_NAME="luxe-api"
VERSION=$(node -p "require('./package.json').version")
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

# Default values
DEPLOY_TARGET="docker"
ENVIRONMENT="production"
SKIP_TESTS=false
SKIP_BUILD=false
FORCE_DEPLOY=false

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --target TARGET    Deployment target (docker, kubernetes, aws, railway, render)"
    echo "  -e, --environment ENV  Environment (development, staging, production)"
    echo "  --skip-tests           Skip running tests before deployment"
    echo "  --skip-build           Skip building the application"
    echo "  --force                Force deployment even if tests fail"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -t docker -e production"
    echo "  $0 -t kubernetes -e staging"
    echo "  $0 -t aws -e production --force"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--target)
            DEPLOY_TARGET="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate deployment target
case $DEPLOY_TARGET in
    docker|kubernetes|aws|railway|render)
        ;;
    *)
        echo -e "${RED}Error: Invalid deployment target '$DEPLOY_TARGET'${NC}"
        echo "Valid targets: docker, kubernetes, aws, railway, render"
        exit 1
        ;;
esac

# Validate environment
case $ENVIRONMENT in
    development|staging|production)
        ;;
    *)
        echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
        echo "Valid environments: development, staging, production"
        exit 1
        ;;
esac

echo -e "${BLUE}🚀 Luxe Staycations Deployment${NC}"
echo "=================================="
echo -e "Target: ${GREEN}$DEPLOY_TARGET${NC}"
echo -e "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo -e "Version: ${GREEN}$VERSION${NC}"
echo -e "Build Date: ${GREEN}$BUILD_DATE${NC}"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        exit 1
    fi
    
    # Check Docker (if needed)
    if [[ "$DEPLOY_TARGET" == "docker" || "$DEPLOY_TARGET" == "kubernetes" ]]; then
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}❌ Docker is not installed${NC}"
            exit 1
        fi
        
        if ! docker info &> /dev/null; then
            echo -e "${RED}❌ Docker is not running${NC}"
            exit 1
        fi
    fi
    
    # Check kubectl (if needed)
    if [[ "$DEPLOY_TARGET" == "kubernetes" ]]; then
        if ! command -v kubectl &> /dev/null; then
            echo -e "${RED}❌ kubectl is not installed${NC}"
            exit 1
        fi
    fi
    
    # Check AWS CLI (if needed)
    if [[ "$DEPLOY_TARGET" == "aws" ]]; then
        if ! command -v aws &> /dev/null; then
            echo -e "${RED}❌ AWS CLI is not installed${NC}"
            exit 1
        fi
        
        if ! aws sts get-caller-identity &> /dev/null; then
            echo -e "${RED}❌ AWS CLI is not configured${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        echo -e "${YELLOW}⚠️  Skipping tests${NC}"
        return 0
    fi
    
    echo -e "${BLUE}🧪 Running tests...${NC}"
    
    if npm test; then
        echo -e "${GREEN}✅ Tests passed${NC}"
    else
        if [[ "$FORCE_DEPLOY" == "true" ]]; then
            echo -e "${YELLOW}⚠️  Tests failed, but continuing due to --force flag${NC}"
        else
            echo -e "${RED}❌ Tests failed. Use --force to deploy anyway${NC}"
            exit 1
        fi
    fi
}

# Build application
build_application() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        echo -e "${YELLOW}⚠️  Skipping build${NC}"
        return 0
    fi
    
    echo -e "${BLUE}🔨 Building application...${NC}"
    
    # Install dependencies
    echo "Installing dependencies..."
    npm ci --only=production
    
    # Build Docker image (if needed)
    if [[ "$DEPLOY_TARGET" == "docker" || "$DEPLOY_TARGET" == "kubernetes" ]]; then
        echo "Building Docker image..."
        docker build -t $API_NAME:$VERSION .
        docker tag $API_NAME:$VERSION $API_NAME:latest
    fi
    
    echo -e "${GREEN}✅ Build completed${NC}"
}

# Deploy to Docker
deploy_docker() {
    echo -e "${BLUE}🐳 Deploying to Docker...${NC}"
    
    # Stop existing containers
    echo "Stopping existing containers..."
    docker-compose -f deployment/docker-compose.production.yml down || true
    
    # Start new containers
    echo "Starting new containers..."
    docker-compose -f deployment/docker-compose.production.yml up -d
    
    # Wait for health check
    echo "Waiting for health check..."
    sleep 30
    
    # Check health
    if curl -f http://localhost/health &> /dev/null; then
        echo -e "${GREEN}✅ Docker deployment successful${NC}"
    else
        echo -e "${RED}❌ Docker deployment failed${NC}"
        exit 1
    fi
}

# Deploy to Kubernetes
deploy_kubernetes() {
    echo -e "${BLUE}☸️  Deploying to Kubernetes...${NC}"
    
    # Create namespace if it doesn't exist
    echo "Creating namespace..."
    kubectl apply -f deployment/kubernetes/namespace.yaml
    
    # Create secrets (you'll need to update these with actual values)
    echo "Creating secrets..."
    kubectl apply -f deployment/kubernetes/secrets.yaml
    
    # Deploy application
    echo "Deploying application..."
    kubectl apply -f deployment/kubernetes/deployment.yaml
    
    # Wait for deployment
    echo "Waiting for deployment to complete..."
    kubectl rollout status deployment/luxe-api -n luxe-staycations --timeout=300s
    
    echo -e "${GREEN}✅ Kubernetes deployment successful${NC}"
}

# Deploy to AWS
deploy_aws() {
    echo -e "${BLUE}☁️  Deploying to AWS...${NC}"
    
    # Deploy CloudFormation stack
    echo "Deploying CloudFormation stack..."
    aws cloudformation deploy \
        --template-file deployment/aws/cloudformation.yaml \
        --stack-name luxe-api-$ENVIRONMENT \
        --parameter-overrides Environment=$ENVIRONMENT \
        --capabilities CAPABILITY_NAMED_IAM \
        --tags Project=$PROJECT_NAME Environment=$ENVIRONMENT
    
    # Get stack outputs
    echo "Getting stack outputs..."
    STACK_OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name luxe-api-$ENVIRONMENT \
        --query 'Stacks[0].Outputs' \
        --output json)
    
    echo -e "${GREEN}✅ AWS deployment successful${NC}"
    echo "Stack outputs:"
    echo "$STACK_OUTPUTS" | jq -r '.[] | "\(.OutputKey): \(.OutputValue)"'
}

# Deploy to Railway
deploy_railway() {
    echo -e "${BLUE}🚂 Deploying to Railway...${NC}"
    
    # Check if Railway CLI is installed
    if ! command -v railway &> /dev/null; then
        echo -e "${RED}❌ Railway CLI is not installed${NC}"
        echo "Install it with: npm install -g @railway/cli"
        exit 1
    fi
    
    # Login to Railway
    echo "Logging in to Railway..."
    railway login
    
    # Deploy
    echo "Deploying to Railway..."
    railway up
    
    echo -e "${GREEN}✅ Railway deployment successful${NC}"
}

# Deploy to Render
deploy_render() {
    echo -e "${BLUE}🎨 Deploying to Render...${NC}"
    
    # Render uses Git-based deployment
    echo "Render uses Git-based deployment."
    echo "Make sure your changes are committed and pushed to the main branch."
    echo "Render will automatically deploy from your Git repository."
    
    # Check if we're on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "main" && "$CURRENT_BRANCH" != "master" ]]; then
        echo -e "${YELLOW}⚠️  You're not on the main branch. Current branch: $CURRENT_BRANCH${NC}"
        echo "Consider switching to main branch for deployment."
    fi
    
    echo -e "${GREEN}✅ Render deployment instructions provided${NC}"
}

# Main deployment function
deploy() {
    echo -e "${BLUE}🚀 Starting deployment...${NC}"
    
    case $DEPLOY_TARGET in
        docker)
            deploy_docker
            ;;
        kubernetes)
            deploy_kubernetes
            ;;
        aws)
            deploy_aws
            ;;
        railway)
            deploy_railway
            ;;
        render)
            deploy_render
            ;;
        *)
            echo -e "${RED}❌ Unknown deployment target: $DEPLOY_TARGET${NC}"
            exit 1
            ;;
    esac
}

# Post-deployment verification
verify_deployment() {
    echo -e "${BLUE}🔍 Verifying deployment...${NC}"
    
    case $DEPLOY_TARGET in
        docker)
            # Check Docker containers
            if docker-compose -f deployment/docker-compose.production.yml ps | grep -q "Up"; then
                echo -e "${GREEN}✅ Docker containers are running${NC}"
            else
                echo -e "${RED}❌ Docker containers are not running${NC}"
                exit 1
            fi
            ;;
        kubernetes)
            # Check Kubernetes pods
            if kubectl get pods -n luxe-staycations | grep -q "Running"; then
                echo -e "${GREEN}✅ Kubernetes pods are running${NC}"
            else
                echo -e "${RED}❌ Kubernetes pods are not running${NC}"
                exit 1
            fi
            ;;
        aws)
            # Check CloudFormation stack
            if aws cloudformation describe-stacks --stack-name luxe-api-$ENVIRONMENT &> /dev/null; then
                echo -e "${GREEN}✅ CloudFormation stack is deployed${NC}"
            else
                echo -e "${RED}❌ CloudFormation stack deployment failed${NC}"
                exit 1
            fi
            ;;
        *)
            echo -e "${YELLOW}⚠️  Skipping verification for $DEPLOY_TARGET${NC}"
            ;;
    esac
}

# Main execution
main() {
    echo -e "${BLUE}🎯 Starting Luxe Staycations deployment process...${NC}"
    
    check_prerequisites
    run_tests
    build_application
    deploy
    verify_deployment
    
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
    echo ""
    echo -e "Deployment Summary:"
    echo -e "  Target: ${GREEN}$DEPLOY_TARGET${NC}"
    echo -e "  Environment: ${GREEN}$ENVIRONMENT${NC}"
    echo -e "  Version: ${GREEN}$VERSION${NC}"
    echo -e "  Build Date: ${GREEN}$BUILD_DATE${NC}"
    echo ""
    
    case $DEPLOY_TARGET in
        docker)
            echo -e "Your API is now available at: ${GREEN}http://localhost${NC}"
            echo -e "Health check: ${GREEN}http://localhost/health${NC}"
            ;;
        kubernetes)
            echo -e "Your API is now deployed to Kubernetes cluster"
            echo -e "Check status with: ${GREEN}kubectl get pods -n luxe-staycations${NC}"
            ;;
        aws)
            echo -e "Your API is now deployed to AWS"
            echo -e "Check CloudFormation console for details"
            ;;
        railway)
            echo -e "Your API is now deployed to Railway"
            echo -e "Check Railway dashboard for details"
            ;;
        render)
            echo -e "Your API is now deployed to Render"
            echo -e "Check Render dashboard for details"
            ;;
    esac
}

# Run main function
main "$@"
