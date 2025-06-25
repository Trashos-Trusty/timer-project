@echo off
echo.
echo ===============================================
echo          BUILD TIMER PROJECT APP
echo ===============================================
echo.

echo 🔨 Installation des dependances...
call npm install

echo.
echo 🚀 Build de l'application...
call npm run dist

echo.
echo ✅ Build termine !
echo Les fichiers sont dans le dossier "dist":
echo - Timer Project Setup 1.0.0.exe (installateur)
echo - win-unpacked/ (version portable)
echo.

pause 