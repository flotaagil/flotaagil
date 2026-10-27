# infra/

Despliegue y operación de FlotaÁgil.

**Responsable:** Carlos Ortiz.

- `docker-compose` para desarrollo y producción (imágenes `ghcr.io/flotaagil/*`, todas con variante ARM64).
- Nginx + Certbot: TLS 1.2+ con HSTS.
- AWS: EC2 t4g.small (ARM64, us-east-1), EBS gp3 con snapshots DLM, S3, Route 53, CloudWatch y SSM Parameter Store para secretos.
- Monitoreo: Sentry y UptimeRobot.
- Runbook de operación e inventario de configuración.
