@echo off
chcp 65001 >nul
title BRVM Analytics - Acces Distant

echo.
echo  ============================================================
echo   BRVM Analytics  --  Acces Distant
echo  ============================================================
echo   URL PERMANENTE :
echo   https://stupor-rewind-spiritism.ngrok-free.dev
echo  ============================================================
echo.

set PYTHON=C:\Users\hp\AppData\Local\Programs\Python\Python312\python.exe
set NGROK=C:\Users\hp\TutoCom\ngrok.exe
set CONFIG=C:\Users\hp\TutoCom\ngrok-config.yml
set APP=C:\Users\hp\TutoCom\run.py

:: Fermer tout tunnel ngrok existant
taskkill /f /im ngrok.exe >nul 2>&1
echo  [i]  Attente fermeture tunnel precedent (10s)...
timeout /t 10 /nobreak >nul

:: Demarrer le serveur BRVM si pas encore actif
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo  [OK] Serveur BRVM deja en marche
) else (
    echo  [1/2] Demarrage serveur BRVM...
    start "BRVM-Serveur" /min "%PYTHON%" "%APP%"
    echo  [i]  Attente 6 secondes...
    timeout /t 6 /nobreak >nul
    echo  [OK] Serveur BRVM demarre
)

echo.
echo  [2/2] Ouverture du tunnel internet...
echo.
echo  ============================================================
echo   Votre site est accessible depuis PARTOUT :
echo.
echo   https://stupor-rewind-spiritism.ngrok-free.dev
echo.
echo   Envoyez ce lien par WhatsApp / email a vos contacts
echo   Cette URL ne change JAMAIS !
echo   Ne fermez pas cette fenetre !
echo  ============================================================
echo.

"%NGROK%" start brvm --config "%CONFIG%" --pooling-enabled

echo.
echo  [i] Tunnel ferme. Votre site n'est plus accessible a distance.
pause
