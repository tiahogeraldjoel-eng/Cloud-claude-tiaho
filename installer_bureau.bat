@echo off
chcp 65001 > nul
color 0E
title BRVM Analytics — Installation du raccourci bureau

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        BRVM Analytics — Installation Bureau         ║
echo  ║       « L'Étoile du Taureau d'Or »                  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set PYTHON=C:\Users\hp\AppData\Local\Programs\Python\Python312\python.exe
set PYTHONW=C:\Users\hp\AppData\Local\Programs\Python\Python312\pythonw.exe
set APPDIR=C:\Users\hp\TutoCom

REM Vérification Python
if not exist "%PYTHON%" (
    echo  [ERREUR] Python introuvable : %PYTHON%
    echo  Veuillez installer Python 3.12 depuis python.org
    pause
    exit /b 1
)

echo  [1/4] Installation de Pillow (generateur d'icones)...
"%PYTHON%" -m pip install Pillow --quiet --upgrade
if %ERRORLEVEL% neq 0 (
    echo  [AVERTISSEMENT] Pillow non installe, le logo PNG/ICO sera ignore.
) else (
    echo  [OK] Pillow installe.
)

echo.
echo  [2/4] Generation du logo BRVM Analytics...
"%PYTHON%" "%APPDIR%\logo_generator.py"
if %ERRORLEVEL% neq 0 (
    echo  [AVERTISSEMENT] Generation logo echouee - le raccourci utilisera l'icone par defaut.
) else (
    echo  [OK] Logo genere.
)

echo.
echo  [3/4] Creation du raccourci sur le Bureau...

REM Utiliser PowerShell pour creer le raccourci .lnk
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); ^
   $lnk = '$desktop\BRVM Analytics.lnk'; ^
   $ws  = New-Object -ComObject WScript.Shell; ^
   $sc  = $ws.CreateShortcut($lnk); ^
   $sc.TargetPath       = '%PYTHONW%'; ^
   $sc.Arguments        = '\"' + '%APPDIR%\lancer_brvm.pyw' + '\"'; ^
   $sc.WorkingDirectory = '%APPDIR%'; ^
   $sc.Description      = 'BRVM Analytics - Aide a la Decision - L''Etoile du Taureau d''Or'; ^
   $sc.WindowStyle      = 1; ^
   if (Test-Path '%APPDIR%\static\logo.ico') { ^
       $sc.IconLocation = '%APPDIR%\static\logo.ico,0'; ^
   }; ^
   $sc.Save(); ^
   Write-Host '  Raccourci cree :' $lnk"

if %ERRORLEVEL% neq 0 (
    echo  [ERREUR] Impossible de creer le raccourci via PowerShell.
    echo  Creez-le manuellement : clic droit sur lancer_brvm.pyw ^> Envoyer vers ^> Bureau
) else (
    echo  [OK] Raccourci bureau cree.
)

echo.
echo  [4/4] Demarrage du serveur pour verification...
start "" "%PYTHONW%" "%APPDIR%\lancer_brvm.pyw"

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   INSTALLATION TERMINEE ! (double-clic sur le       ║
echo  ║   raccourci "BRVM Analytics" sur votre bureau)      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
timeout /t 4 /nobreak > nul
