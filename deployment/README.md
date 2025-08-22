# Luxe Staycations - Deployment Guide

This guide covers all deployment options for the Luxe Staycations API, from local development to production cloud deployments.

## 🚀 Quick Start

### 1. Local Development
```bash
cd luxe-api
npm install
npm run dev
```

### 2. Docker Deployment
```bash
./deployment/scripts/deploy.sh -t docker -e production
```

### 3. Kubernetes Deployment
```bash
./deployment/scripts/deploy.sh -t kubernetes -e production
```

### 4. AWS Deployment
```bash
./deployment/scripts/deploy.sh -t aws -e production
```

## 📋 Prerequisites

### General Requirements
- Node.js 18+ 
- npm 8+
- Git

### Docker Deployment
- Docker Desktop
- Docker Compose

### Kubernetes Deployment
- kubectl
- Docker Desktop or Minikube
- Kubernetes cluster

### AWS Deployment
- AWS CLI
- AWS account with appropriate permissions
- Domain name (for SSL certificate)

## 🐳 Docker Deployment

### Production Docker Compose
The production Docker Compose setup includes:
- **Luxe API**: Main application server
- **Redis**: Caching and session storage
- **Nginx**: Reverse proxy with SSL termination
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboard

### Configuration
1. Copy environment file:
   ```bash
   cp env.example .env.production
   ```

2. Update environment variables in `.env.production`

3. Deploy:
   ```bash
   docker-compose -f deployment/docker-compose.production.yml up -d
   ```

### SSL Configuration
1. Create SSL certificates:
   ```bash
   mkdir -p deployment/ssl
   # Add your cert.pem and key.pem files
   ```

2. Update Nginx configuration if needed

### Monitoring
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)

## ☸️ Kubernetes Deployment

### Cluster Setup
1. **Minikube (Local)**:
   ```bash
   minikube start --cpus 4 --memory 8192
   ```

2. **Production Cluster**:
   - Use managed Kubernetes service (EKS, GKE, AKS)
   - Ensure cluster has at least 4GB RAM and 2 CPUs

### Deployment Steps
1. **Create namespace and resources**:
   ```bash
   kubectl apply -f deployment/kubernetes/namespace.yaml
   ```

2. **Create secrets**:
   ```bash
   # Update secrets.yaml with actual values
   kubectl apply -f deployment/kubernetes/secrets.yaml
   ```

3. **Deploy application**:
   ```bash
   kubectl apply -f deployment/kubernetes/deployment.yaml
   ```

4. **Check status**:
   ```bash
   kubectl get pods -n luxe-staycations
   kubectl get services -n luxe-staycations
   ```

### Secrets Management
Update `deployment/kubernetes/secrets.yaml` with your actual values:
```bash
# Example: Create secrets from command line
kubectl create secret generic luxe-secrets \
  --from-literal=supabase-url="your-supabase-url" \
  --from-literal=supabase-service-key="your-service-key" \
  --from-literal=stripe-secret-key="your-stripe-key" \
  --from-literal=stripe-webhook-secret="your-webhook-secret" \
  --from-literal=jwt-secret="your-jwt-secret" \
  --from-literal=redis-password="your-redis-password" \
  --from-literal=grafana-admin-password="your-grafana-password" \
  -n luxe-staycations
```

### Ingress Configuration
The deployment includes:
- **Nginx Ingress Controller**
- **SSL termination with Let's Encrypt**
- **Rate limiting**
- **Health checks**

## ☁️ AWS Deployment

### Infrastructure Components
- **VPC** with public/private subnets
- **Application Load Balancer** with SSL termination
- **ECS Fargate** for containerized deployment
- **CloudWatch** for logging and monitoring
- **S3** for access logs
- **ACM** for SSL certificates

### Deployment Steps
1. **Configure AWS CLI**:
   ```bash
   aws configure
   ```

2. **Deploy CloudFormation stack**:
   ```bash
   aws cloudformation deploy \
     --template-file deployment/aws/cloudformation.yaml \
     --stack-name luxe-api-production \
     --parameter-overrides Environment=production \
     --capabilities CAPABILITY_NAMED_IAM
   ```

3. **Create secrets in AWS Secrets Manager**:
   ```bash
   aws secretsmanager create-secret \
     --name luxe/supabase-url \
     --secret-string "your-supabase-url"
   ```

### ECS Task Definition
The ECS deployment includes:
- **Fargate** for serverless container execution
- **Auto-scaling** based on CPU/memory usage
- **Health checks** and monitoring
- **Secrets management** via AWS Secrets Manager

### Monitoring and Logging
- **CloudWatch Logs**: Application logs
- **CloudWatch Metrics**: Performance metrics
- **Application Load Balancer**: Access logs to S3

## 🚂 Railway Deployment

### Setup
1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Deploy**:
   ```bash
   ./deployment/scripts/deploy.sh -t railway -e production
   ```

### Configuration
- Railway automatically detects your project
- Environment variables can be set via Railway dashboard
- Automatic deployments on Git push

## 🎨 Render Deployment

### Setup
1. **Connect Git repository** to Render
2. **Configure environment variables** in Render dashboard
3. **Set build command**: `npm install && npm run build`
4. **Set start command**: `npm start`

### Features
- **Automatic deployments** from Git
- **SSL certificates** included
- **Custom domains** support
- **Environment variables** management

## 🔧 Environment Configuration

### Required Environment Variables
```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Frontend
FRONTEND_URL=https://luxestaycations.com

# Payment Processing
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Security
JWT_SECRET=your_jwt_secret

# Redis (for caching)
REDIS_URL=redis://localhost:6379

# Monitoring
GRAFANA_PASSWORD=your_grafana_password
```

### Environment-Specific Configs
- **Development**: `.env.development`
- **Staging**: `.env.staging`
- **Production**: `.env.production`

## 📊 Monitoring and Health Checks

### Health Check Endpoint
```
GET /health
```
Returns service status and basic information.

### Metrics Endpoint
```
GET /metrics
```
Returns Prometheus-formatted metrics for monitoring.

### Monitoring Stack
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **CloudWatch**: AWS-specific monitoring
- **Application Load Balancer**: Health checks

## 🔒 Security Features

### Network Security
- **VPC isolation** (AWS)
- **Security groups** and firewall rules
- **Private subnets** for application servers
- **Public subnets** only for load balancers

### Application Security
- **HTTPS enforcement** with SSL termination
- **Security headers** (HSTS, CSP, XSS protection)
- **Rate limiting** to prevent abuse
- **Input validation** with Zod schemas

### Secrets Management
- **Environment variables** for non-sensitive config
- **AWS Secrets Manager** for production secrets
- **Kubernetes secrets** for containerized deployments
- **Docker secrets** for Swarm deployments

## 📈 Scaling and Performance

### Auto-scaling
- **ECS Fargate**: CPU/memory-based scaling
- **Kubernetes HPA**: Horizontal pod autoscaling
- **Load balancer**: Traffic distribution

### Performance Optimization
- **Redis caching** for frequently accessed data
- **Nginx caching** for static content
- **Gzip compression** for API responses
- **Connection pooling** for database connections

### Resource Limits
- **CPU**: 250m - 500m per container
- **Memory**: 256Mi - 512Mi per container
- **Storage**: 10Gi for logs, 20Gi for uploads

## 🚨 Troubleshooting

### Common Issues

#### Docker Deployment
```bash
# Check container status
docker-compose -f deployment/docker-compose.production.yml ps

# View logs
docker-compose -f deployment/docker-compose.production.yml logs -f

# Restart services
docker-compose -f deployment/docker-compose.production.yml restart
```

#### Kubernetes Deployment
```bash
# Check pod status
kubectl get pods -n luxe-staycations

# View logs
kubectl logs -f deployment/luxe-api -n luxe-staycations

# Describe resources
kubectl describe pod <pod-name> -n luxe-staycations
```

#### AWS Deployment
```bash
# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name luxe-api-production

# View ECS service status
aws ecs describe-services --cluster production-luxe-cluster --services production-luxe-api-service

# Check load balancer health
aws elbv2 describe-target-health --target-group-arn <target-group-arn>
```

### Health Check Failures
1. **Check application logs** for errors
2. **Verify environment variables** are set correctly
3. **Check database connectivity**
4. **Verify external service dependencies**

### Performance Issues
1. **Monitor resource usage** (CPU, memory, disk)
2. **Check Redis connection** and cache hit rates
3. **Review database query performance**
4. **Analyze load balancer metrics**

## 📚 Additional Resources

### Documentation
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)

### Tools
- **k9s**: Kubernetes CLI tool for management
- **Lens**: Kubernetes IDE
- **AWS Console**: Web-based AWS management
- **Docker Desktop**: Local container management

### Support
- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Comprehensive guides and examples
- **Community**: Developer community and discussions

## 🎯 Next Steps

1. **Choose deployment target** based on your needs
2. **Set up environment variables** and secrets
3. **Deploy using the provided scripts**
4. **Configure monitoring** and alerting
5. **Set up CI/CD** for automated deployments
6. **Monitor performance** and optimize as needed

For additional support or questions, please refer to the project documentation or create an issue on GitHub.
