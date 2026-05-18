@echo off
chcp 65001 >nul
echo ============================================================
echo   BRVM Analytics + Cloudflare Tunnel
echo   Acces local  : http://localhost:8000
echo   Acces distant: voir URL affichee ci-dessous
echo ============================================================
echo.

set PYTHON_CMD=C:\Users\hp\AppData\Local\Programs\Python\Python312\python.exe
set CLOUDFLARED=C:\cloudflared.exe

:: --- Verifications ---
IF NOT EXIST "%PYTHON_CMD%" (
    echo [ERREUR] Python introuvable. Lancez install.bat d'abord.
    pause & exit /b 1
)
IF NOT EXIST "%CLOUDFLARED%" (
    echo [ERREUR] cloudflared.exe introuvable dans C:\
    echo [INFO]   Telechargez-le sur :
    echo          https://github.com/cloudflare/cloudflared/releases/latest
    echo          Fichier : cloudflared-windows-amd64.exe  renommer en cloudflared.exe
    pause & exit /b 1
)

cd /d "%~dp0"

:: --- Demarrer le serveur BRVM en arriere-plan ---
echo [1/2] Demarrage serveur BRVM...
start "BRVM-Server" /min "%PYTHON_CMD%" run.py

:: --- Attendre que le serveur soit pret (5 secondes) ---
echo [i]   Attente demarrage serveur (5s)...
timeout /t 5 /nobreak >nul

:: --- Demarrer le tunnel Cloudflare ---
echo [2/2] Demarrage tunnel Cloudflare...
echo.
echo ============================================================
echo   REGARDEZ L URL "trycloudflare.com" CI-DESSOUS
echo   C est votre adresse accessible PARTOUT dans le monde
echo ============================================================
echo.

"%CLOUDFLARED%" tunnel --url http://localhost:8000

echo.
echo [i] Tunnel ferme. Le serveur BRVM tourne toujours en arriere-plan.
pause
