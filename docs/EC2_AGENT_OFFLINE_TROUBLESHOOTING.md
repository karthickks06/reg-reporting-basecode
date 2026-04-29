# EC2 Agent Offline Troubleshooting Guide

## Overview
This guide provides step-by-step troubleshooting for fixing "Agent Offline" issues on EC2 Linux machines. The "Agent" refers to the Azure OpenAI LLM connectivity, which the system checks via health probes.

## Understanding Agent Status
- **Agent Online**: Azure OpenAI endpoint is reachable and API calls succeed
- **Agent Offline**: Azure OpenAI connection fails (configuration, network, or API issues)

The backend checks agent status through `/health` endpoint which probes Azure OpenAI with actual API calls.

---

## Quick Diagnostic Steps

### Step 1: Check Backend Service Status
```bash
# Check if backend service is running
sudo systemctl status fca-api
```

### Step 2: Check Health Endpoint
```bash
# Check the health endpoint (adjust port if different)
curl -sS http://localhost:8000/health | jq '.'

# Check the ready endpoint
curl -sS http://localhost:8000/ready | jq '.'
```

**What to look for:**
- `"llm_up": true` means agent is online
- `"llm_up": false` means agent is offline
- Check the `dependencies.llm` section for detailed error messages

### Step 3: Check Backend Logs
```bash
# If using systemd
sudo journalctl -u fca-api -n 100 --no-pager
```

---

## Common Causes and Fixes

### Issue 1: Missing or Invalid Azure OpenAI Configuration

**Symptoms:**
- Health check shows `"configured": false`
- Logs mention missing environment variables

**Diagnostic:**
```bash
# Check if environment file exists
ls -la /path/to/your/.env

# View environment variables (be careful with sensitive data)
grep AZURE_OPENAI /path/to/your/.env

# If using systemd, check the service file
sudo systemctl cat fca-api
```

**Fix:**
```bash
# Edit the .env file
sudo nano /path/to/your/.env

# Add or verify these variables:
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
# AZURE_OPENAI_API_KEY=your-api-key-here
# AZURE_OPENAI_DEPLOYMENT=your-deployment-name
# AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Restart the backend service
sudo systemctl restart fca-api
```

### Issue 2: Network Connectivity to Azure OpenAI

**Symptoms:**
- Health check shows timeout or connection refused
- `"ok": false` with connection error

**Diagnostic:**
```bash
# Test DNS resolution
nslookup your-resource.openai.azure.com

# Test network connectivity
curl -v https://your-resource.openai.azure.com

# Check outbound firewall rules
sudo iptables -L OUTPUT -n -v

# Check AWS Security Group (from AWS Console or CLI)
aws ec2 describe-security-groups --group-ids sg-xxxxx
```

**Fix:**
```bash
# AWS Security Group: Ensure outbound HTTPS (443) is allowed
# From AWS Console:
# 1. Go to EC2 → Security Groups
# 2. Select your instance's security group
# 3. Check "Outbound rules"
# 4. Ensure there's a rule allowing HTTPS (443) to 0.0.0.0/0

# Or via AWS CLI:
aws ec2 authorize-security-group-egress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Test connectivity after fixing
curl -v https://your-resource.openai.azure.com/openai/deployments?api-version=2024-02-15-preview \
  -H "api-key: your-api-key"
```

### Issue 3: Invalid Azure OpenAI Endpoint or Deployment

**Symptoms:**
- Connection succeeds but API calls fail
- 404 or 401 errors in logs

**Diagnostic:**
```bash
# Test the actual API endpoint
curl https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-15-preview \
  -H "Content-Type: application/json" \
  -H "api-key: your-api-key" \
  -d '{
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10
  }'
```

**Fix:**
```bash
# Verify your Azure OpenAI configuration in Azure Portal:
# 1. Go to Azure OpenAI Studio
# 2. Check your deployment name exactly
# 3. Verify the endpoint URL
# 4. Regenerate API key if needed

# Update .env with correct values
sudo nano /path/to/your/.env

# Restart service
sudo systemctl restart fca-api
```

### Issue 4: SSL/TLS Certificate Verification Issues

**Symptoms:**
- SSL certificate errors in logs
- `CERTIFICATE_VERIFY_FAILED` errors

**Diagnostic:**
```bash
# Check SSL certificate
openssl s_client -connect your-resource.openai.azure.com:443 -servername your-resource.openai.azure.com

# Check system CA certificates
ls -la /etc/ssl/certs/

# Check Python SSL
python3 -c "import ssl; print(ssl.get_default_verify_paths())"
```

**Fix:**
```bash
# Update CA certificates
sudo yum update ca-certificates
# OR for Debian/Ubuntu
sudo apt-get update && sudo apt-get install --reinstall ca-certificates

# If needed, disable SSL verification (NOT RECOMMENDED FOR PRODUCTION)
# Add to .env:
# AXET_LLM_VERIFY_SSL=false

# Restart service
sudo systemctl restart fca-api
```

### Issue 5: Process Not Running or Crashed

**Symptoms:**
- Health endpoint not responding
- Service status shows inactive or failed

**Diagnostic:**
```bash
# Check service status
sudo systemctl status fca-api

# Check for port conflicts
sudo netstat -tlnp | grep 8000
# OR
sudo ss -tlnp | grep 8000

# Check system resources
free -h
df -h
top -bn1 | head -20
```

**Fix:**
```bash
# Start the service
sudo systemctl start fca-api

# Enable auto-start on boot
sudo systemctl enable fca-api

# If port is in use, find and kill the process
sudo lsof -ti:8000 | xargs sudo kill -9

# Then restart
sudo systemctl restart fca-api

# Check logs for startup errors
sudo journalctl -u fca-api -n 50 --no-pager
```

### Issue 6: Database Connection Issues Affecting Overall Health

**Symptoms:**
- Backend shows degraded status
- Database probe fails in health check

**Diagnostic:**
```bash
# Check database connectivity
psql -h your-rds-endpoint.rds.amazonaws.com -U dbuser -d dbname -c "SELECT 1;"

# Check database in health endpoint
curl -sS http://localhost:8000/health | jq '.dependencies.database'
```

**Fix:**
```bash
# Verify DATABASE_URL in .env
sudo nano /path/to/your/.env

# Check RDS security group allows inbound from EC2
# From AWS Console:
# 1. Go to RDS → Databases → Your DB
# 2. Check "Security group rules"
# 3. Ensure inbound PostgreSQL (5432) from EC2 security group

# Test connection
telnet your-rds-endpoint.rds.amazonaws.com 5432

# Restart service after fixing
sudo systemctl restart fca-api
```

---

## Complete Health Check Script

Save this as `check-agent-health.sh`:

```bash
#!/bin/bash

echo "=== FCA Agent Health Check ==="
echo ""

# Check backend service
echo "1. Backend Service Status:"
sudo systemctl status fca-api --no-pager | grep "Active:"
echo ""

# Check if port is listening
echo "2. Port 8000 Status:"
sudo netstat -tlnp | grep 8000 || echo "Port 8000 not listening"
echo ""

# Check health endpoint
echo "3. Health Endpoint Response:"
HEALTH=$(curl -sS http://localhost:8000/health 2>&1)
if [ $? -eq 0 ]; then
    echo "$HEALTH" | jq '.status, .llm_up, .dependencies.llm' 2>/dev/null || echo "$HEALTH"
else
    echo "ERROR: Cannot reach health endpoint"
    echo "$HEALTH"
fi
echo ""

# Check environment configuration
echo "4. Azure OpenAI Configuration:"
if [ -f "/path/to/your/.env" ]; then
    grep "AZURE_OPENAI" /path/to/your/.env | grep -v "API_KEY" || echo "No Azure OpenAI config found"
else
    echo "ERROR: .env file not found"
fi
echo ""

# Check recent logs
echo "5. Recent Backend Logs (last 10 lines):"
sudo journalctl -u fca-api -n 10 --no-pager
echo ""

# Test Azure connectivity
echo "6. Azure OpenAI Connectivity:"
ENDPOINT=$(grep AZURE_OPENAI_ENDPOINT /path/to/your/.env | cut -d= -f2)
if [ -n "$ENDPOINT" ]; then
    curl -sS -o /dev/null -w "HTTP Status: %{http_code}\n" "$ENDPOINT" 2>&1
else
    echo "ERROR: AZURE_OPENAI_ENDPOINT not set"
fi
echo ""

echo "=== Health Check Complete ==="
```

Make it executable and run:
```bash
chmod +x check-agent-health.sh
sudo ./check-agent-health.sh
```

---

## Verification Steps

After applying fixes, verify the agent is online:

```bash
# 1. Check health endpoint
curl -sS http://localhost:8000/health | jq '.llm_up'
# Should return: true

# 2. Check the frontend
# Open your browser to: http://your-ec2-public-ip:3000
# Look for "Agent Online" with green indicator in the header

# 3. Test a complete workflow
# Upload a file and verify AI features work
```

---

## Preventive Measures

### 1. Set Up Monitoring
```bash
# Create a monitoring script: /usr/local/bin/monitor-agent.sh
#!/bin/bash
STATUS=$(curl -sS http://localhost:8000/health | jq -r '.llm_up')
if [ "$STATUS" != "true" ]; then
    echo "ALERT: Agent is offline at $(date)" | mail -s "FCA Agent Offline" admin@example.com
    sudo systemctl restart fca-api
fi

# Add to crontab
sudo crontab -e
# Add: */5 * * * * /usr/local/bin/monitor-agent.sh
```

### 2. Enable Auto-Restart on Failure
```bash
# Edit systemd service
sudo systemctl edit fca-api

# Add these lines:
[Service]
Restart=always
RestartSec=10s
```

### 3. Set Up Log Rotation
```bash
# Create /etc/logrotate.d/fca-api
sudo nano /etc/logrotate.d/fca-api

# Add:
/var/log/fca-api/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

---

## Getting Additional Help

If the issue persists:

1. **Collect diagnostic information:**
```bash
# Create a diagnostic bundle
mkdir -p /tmp/fca-diagnostics
curl -sS http://localhost:8000/health > /tmp/fca-diagnostics/health.json
curl -sS http://localhost:8000/ready > /tmp/fca-diagnostics/ready.json
sudo journalctl -u fca-api -n 500 > /tmp/fca-diagnostics/service.log
sudo systemctl status fca-api > /tmp/fca-diagnostics/status.txt
env | grep -i azure > /tmp/fca-diagnostics/env-vars.txt  # Remove sensitive data before sharing
tar -czf /tmp/fca-diagnostics.tar.gz -C /tmp fca-diagnostics/
```

2. **Check documentation:**
   - `docs/AGENT_STATUS_FIX.md` - Agent status detection details
   - `docs/18_AWS_DEPLOYMENT_APPROACH.md` - AWS deployment guide
   - `docs/19_STARTUP_TROUBLESHOOTING.md` - General startup issues

3. **Review backend implementation:**
   - `backend/app/services/runtime/probes.py` - Health check logic
   - `backend/app/llm_client.py` - Azure OpenAI client implementation

---

## Quick Reference Commands

```bash
# Service management
sudo systemctl status fca-api
sudo systemctl restart fca-api
sudo systemctl stop fca-api
sudo systemctl start fca-api

# Health checks
curl -sS http://localhost:8000/health | jq '.'
curl -sS http://localhost:8000/ready | jq '.'

# Logs
sudo journalctl -u fca-api -f  # Follow logs
sudo journalctl -u fca-api -n 100  # Last 100 lines

# Network testing
curl -v https://your-resource.openai.azure.com
telnet your-resource.openai.azure.com 443

# Process management
ps aux | grep uvicorn
sudo lsof -i :8000
```

---

## Summary

Most agent offline issues on EC2 are caused by:
1. Missing/incorrect Azure OpenAI credentials
2. Network connectivity (Security Groups, firewall)
3. Invalid endpoint or deployment name
4. Backend service not running

Follow the diagnostic steps in order, check the health endpoint responses, and apply the appropriate fix based on the error messages.
