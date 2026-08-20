# Production Deployment & Infrastructure Guide

## Overview

This document describes how to deploy the **Enterprise Attendance Integration Platform** across development, staging, and production environments using Docker Compose and Kubernetes.

---

## 1. Local Development Deployment (Docker Compose)

### A. Start Core Infrastructure (MySQL, Redis, Kafka, Kafka UI)

```powershell
pnpm run docker:up
```

### B. Start Monitoring Stack (Prometheus + Grafana)

```powershell
docker compose -f docker-compose.monitoring.yml up -d
```

- **Prometheus**: [http://localhost:9090](http://localhost:9090)
- **Grafana**: [http://localhost:3002](http://localhost:3002) (User: `admin` / `admin_password`)
- **Kafka UI**: [http://localhost:8080](http://localhost:8080)
- **Dashboard UI**: [http://localhost:3001](http://localhost:3001)
- **API Gateway**: [http://localhost:4000/docs](http://localhost:4000/docs)

---

## 2. Production Kubernetes Deployment

### Step 1: Create Namespace & Secrets

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml

# Create production secrets
kubectl create secret generic attendance-secrets \
  --namespace=attendance-platform \
  --from-literal=DB_PASSWORD="your-strong-db-password" \
  --from-literal=REDIS_PASSWORD="your-strong-redis-password" \
  --from-literal=JWT_SECRET="your-256bit-jwt-secret-key"
```

### Step 2: Apply Deployments, Services, and HPA

```bash
kubectl apply -f deploy/k8s/api-deployment.yaml
```

### Step 3: Verify Pod Health & Probes

```bash
kubectl get pods -n attendance-platform
kubectl get hpa -n attendance-platform
```

---

## 3. Zero-Downtime Rolling Update Strategy

The Kubernetes deployments use `strategy: RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0`.

When upgrading images:

```bash
kubectl set image deployment/attendance-api api=ghcr.io/techive/attendance-api:1.1.0 -n attendance-platform
kubectl rollout status deployment/attendance-api -n attendance-platform
```

Pods handle `SIGTERM` gracefully, draining in-flight biometric syncs and database transactions before shutting down.
