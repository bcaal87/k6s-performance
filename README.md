# Laboratorio Avanzado de Performance Engineering con k6

## Inicio

```powershell
docker compose up -d --build performance-app
docker compose --profile tools run --rm k6 version
```

La aplicación queda disponible en:

```text
http://localhost:3000
```

Dentro del contenedor k6 se usa:

```text
http://performance-app:3000
```

## Ejecución

Ejemplo:

```powershell
docker compose --profile tools run --rm k6 run /scripts/01-auth-correlation.js
```

Antes de cada prueba importante puede reiniciar el estado:

```powershell
Invoke-RestMethod -Method POST http://localhost:3000/api/admin/reset
```

Consulte métricas internas:

```text
http://localhost:3000/api/admin/stats
```

Los archivos contienen TODOs. No están resueltos.

Esta carpeta contiene soluciones de referencia para el docente.
