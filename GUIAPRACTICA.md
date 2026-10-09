# Laboratorio k6 resuelto — ejecución paso a paso

Esta versión contiene las pruebas completas para que el grupo se concentre en ejecutar, observar métricas e interpretar resultados.

## 1. Iniciar la aplicación

Abra PowerShell en esta carpeta y ejecute:

```powershell
docker compose up -d --build performance-app
```

Verifique:

```powershell
docker ps
```

Abra en el navegador:

```text
http://localhost:3000
```

## 2. Verificar k6

```powershell
docker compose --profile tools run --rm k6 version
```

## 3. Reiniciar el estado antes de una prueba importante

```powershell
Invoke-RestMethod -Method POST http://localhost:3000/api/admin/reset
```

También puede consultar las métricas internas de la aplicación en:

```text
http://localhost:3000/api/admin/stats
```

## 4. Ejecutar las pruebas en orden

### 01 — Autenticación y correlación

```powershell
docker compose --profile tools run --rm k6 run /scripts/01-auth-correlation.js
```

Observe: token, status, p95, checks y cache header.

### 02 — Cache HIT/MISS

```powershell
docker compose --profile tools run --rm k6 run /scripts/02-cache-analysis.js
```

Observe la diferencia de tiempo entre MISS y HIT.

### 03 — Mixed Workload

```powershell
docker compose --profile tools run --rm k6 run /scripts/03-mixed-workload.js
```

Observe los tres escenarios: navegación, búsqueda y órdenes.

### 04 — Rate Limiting

```powershell
docker compose --profile tools run --rm k6 run /scripts/04-rate-limit.js
```

Observe HTTP 429, rate_limited y el threshold.

### 05 — Idempotencia

```powershell
docker compose --profile tools run --rm k6 run /scripts/05-idempotency.js
```

Observe que dos solicitudes con la misma Idempotency-Key no creen dos órdenes.

### 06 — Exportación asíncrona

```powershell
docker compose --profile tools run --rm k6 run /scripts/06-async-export.js
```

Observe el jobId, polling y el tiempo end-to-end.

### 07 — Falla de dependencia

```powershell
docker compose --profile tools run --rm k6 run /scripts/07-dependency-failure.js
```

Observe payment_failures y los HTTP 502.

### 08 — Breaking Point

```powershell
docker compose --profile tools run --rm k6 run /scripts/08-breaking-point.js
```

Observe cuándo aumenta el p95, aparecen 503 o se supera el SLO.

### 09 — Spike y recuperación

```powershell
docker compose --profile tools run --rm k6 run /scripts/09-spike-recovery.js
```

Observe el comportamiento antes, durante y después del pico.

### 10 — Release Gate

```powershell
docker compose --profile tools run --rm k6 run /scripts/10-release-gate.js
```

La decisión debe ser GO o NO-GO según los thresholds.

## 5. Qué registrar en cada prueba

- VUs
- iterations
- http_reqs
- http_req_duration
- p(90)
- p(95)
- p(99)
- http_req_failed
- checks
- thresholds
- métricas personalizadas
- resultado PASS / FAIL

## 6. Después de cada prueba responda

1. ¿Qué escenario se simuló?
2. ¿Cuál fue el p95?
3. ¿Hubo errores?
4. ¿Qué threshold pasó o falló?
5. ¿Qué cuello de botella se observa?
6. ¿Qué cambiaría para mejorar el sistema?

## 7. Final

No basta con que k6 termine la ejecución. El objetivo es interpretar qué indican las métricas y decidir si el sistema cumple o no sus objetivos de rendimiento.
