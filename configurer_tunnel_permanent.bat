@echo off
chcp 65001 >nul
echo ============================================================
echo   CONFIGURATION TUNNEL CLOUDFLARE PERMANENT
echo   (A executer UNE SEULE FOIS)
echo ============================================================
echo.
echo PRE-REQUIS :
echo   1. Avoir cree un compte sur https://dash.cloudflare.com
echo   2. cloudflared.exe present dans C:\
echo.

set CLOUDFLARED=C:\cloudflared.exe

IF NOT EXIST "%CLOUDFLARED%" (
    echo [ERREUR] cloudflared.exe introuvable dans C:\
    echo Telechargez : https://github.com/cloudflare/cloudflared/releases/latest
    echo Renommez le fichier en cloudflared.exe et placez-le dans C:\
    pause & exit /b 1
)

echo Etape 1/3 : Authentification Cloudflare
echo [i] Votre navigateur va s ouvrir - connectez-vous et cliquez Autoriser
echo.
"%CLOUDFLARED%" tunnel login

echo.
echo Etape 2/3 : Creation du tunnel "brvm-analytics"
"%CLOUDFLARED%" tunnel create brvm-analytics

echo.
echo Etape 3/3 : Affichage du fichier de configuration a creer
echo.
echo Creez le fichier : C:\Users\%USERNAME%\.cloudflared\config.yml
echo avec le contenu suivant (remplacez VOTRE-ID par l ID affiche ci-dessus) :
echo.
echo ------- COPIER CE CONTENU -------
echo tunnel: brvm-analytics
echo credentials-file: C:\Users\%USERNAME%\.cloudflared\VOTRE-ID.json
echo.
echo ingress:
echo   - service: http://localhost:8000
echo ---------------------------------
echo.
echo Ensuite pour lancer : cloudflared.exe tunnel run brvm-analytics
echo.
echo Pour installer comme service Windows (demarrage auto) :
echo   C:\cloudflared.exe service install
echo   Puis copiez config.yml dans C:\Windows\System32\config\systemprofile\.cloudflared\
echo.
pause
