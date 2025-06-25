@echo off
echo ========================================
echo    DEPLOIEMENT AVEC AUTO-UPDATE
echo ========================================
echo.

:: Vérifier si nous sommes dans le bon répertoire
if not exist "package.json" (
    echo Erreur: Ce script doit être exécuté depuis le répertoire racine du projet
    pause
    exit /b 1
)

:: Vérifier si Node.js est installé
node --version >nul 2>&1
if errorlevel 1 (
    echo Erreur: Node.js n'est pas installé ou n'est pas dans le PATH
    pause
    exit /b 1
)

:: Vérifier si npm est installé
npm --version >nul 2>&1
if errorlevel 1 (
    echo Erreur: npm n'est pas installé ou n'est pas dans le PATH
    pause
    exit /b 1
)

echo Étape 1: Installation/Mise à jour des dépendances...
echo.
call npm install
if errorlevel 1 (
    echo Erreur lors de l'installation des dépendances
    pause
    exit /b 1
)

echo.
echo Étape 2: Build de l'application React...
echo.
call npm run build
if errorlevel 1 (
    echo Erreur lors du build React
    pause
    exit /b 1
)

echo.
echo Étape 3: Choix du type de déploiement
echo.
echo 1. Build local (sans publication)
echo 2. Publication sur GitHub (avec auto-update)
echo 3. Publication draft (version de test)
echo.
set /p choice="Votre choix (1-3): "

if "%choice%"=="1" (
    echo.
    echo Build local en cours...
    call npm run dist
    if errorlevel 1 (
        echo Erreur lors du build local
        pause
        exit /b 1
    )
    echo.
    echo ✅ Build local terminé avec succès!
    echo Les fichiers se trouvent dans le dossier 'dist'
    
) else if "%choice%"=="2" (
    echo.
    echo ⚠️  ATTENTION: Ceci va publier sur GitHub et déclencher l'auto-update!
    echo Êtes-vous sûr de vouloir continuer? (y/N)
    set /p confirm=""
    if /i not "%confirm%"=="y" (
        echo Publication annulée
        pause
        exit /b 0
    )
    
    echo.
    echo Publication sur GitHub en cours...
    call npm run publish
    if errorlevel 1 (
        echo Erreur lors de la publication
        pause
        exit /b 1
    )
    echo.
    echo ✅ Publication réussie! L'auto-update est maintenant disponible.
    
) else if "%choice%"=="3" (
    echo.
    echo Publication draft en cours...
    call npm run publish-draft
    if errorlevel 1 (
        echo Erreur lors de la publication draft
        pause
        exit /b 1
    )
    echo.
    echo ✅ Publication draft réussie! Vous pouvez tester avant de publier officiellement.
    
) else (
    echo Choix invalide
    pause
    exit /b 1
)

echo.
echo ========================================
echo        DÉPLOIEMENT TERMINÉ
echo ========================================
echo.
echo Rappel:
echo - Les utilisateurs recevront automatiquement la notification de mise à jour
echo - La mise à jour sera téléchargée en arrière-plan
echo - L'installation nécessitera un redémarrage de l'application
echo.
pause 