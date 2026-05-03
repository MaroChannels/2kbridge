@echo off
echo ============================================
echo    2KBridge - Installation des dependances
echo ============================================
echo.

echo [1/3] Installation du serveur...
cd server
call npm install
if %errorlevel% neq 0 ( echo ERREUR lors de l'install serveur & pause & exit /b 1 )
cd ..

echo.
echo [2/3] Installation du client Electron...
cd client
call npm install
if %errorlevel% neq 0 ( echo ERREUR lors de l'install client & pause & exit /b 1 )

echo.
echo [3/3] Recompilation de robotjs pour Electron...
call npx electron-rebuild -f -w robotjs
if %errorlevel% neq 0 (
  echo AVERTISSEMENT: robotjs n'a pas pu etre compile.
  echo La simulation d'input ne fonctionnera pas.
  echo Assure-toi d'avoir installe node-gyp et les Build Tools Visual Studio.
)
cd ..

echo.
echo ============================================
echo  Installation terminee !
echo.
echo  Pour lancer le serveur :   cd server ^& npm start
echo  Pour lancer le client :    cd client ^& npm start
echo ============================================
pause
