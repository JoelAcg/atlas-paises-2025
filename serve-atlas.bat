@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================
echo   Atlas Mapas — servidor local
echo ============================================
echo.
echo  NO abras los HTML con doble clic.
echo  Usa la URL http que saldra abajo.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js.
  echo Instala Node desde https://nodejs.org y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

if not exist "data\index.json" (
  echo [AVISO] Falta data\index.json — generando...
  if exist "..\_build_atlas_v6.js" (
    node "..\_build_atlas_v6.js"
  ) else (
    echo [ERROR] No existe ..\_build_atlas_v6.js
    echo Ejecuta: node Documentos\Paises\_build_atlas_v6.js
    pause
    exit /b 1
  )
)

echo Abriendo navegador en unos segundos...
start "" "http://127.0.0.1:5500/index.html"

node serve-atlas.js
if errorlevel 1 (
  echo.
  echo Si el puerto esta ocupado, cierra otras ventanas del atlas
  echo o ejecuta: set PORT=5501 ^&^& node serve-atlas.js
  pause
)
