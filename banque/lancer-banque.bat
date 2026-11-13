@echo off
rem Double-cliquez pour ouvrir Banque locale sur ce PC. Necessite Node.js (nodejs.org).
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installez-le depuis nodejs.org puis relancez. & pause & exit /b 1)
start "" http://127.0.0.1:8765/
node bureau.cjs
pause
