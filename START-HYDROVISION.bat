@echo off
setlocal
cd /d "%~dp0"
title HYDROVISION - Iniciador
if not exist package.json (
  echo ERRO: package.json nao encontrado nesta pasta.
  echo Abra a pasta que contem package.json e execute novamente.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale Node.js 20 ou superior.
  pause
  exit /b 1
)
echo.
echo HYDROVISION - instalando dependencias...
echo.
call npm.cmd install
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Confira a conexao com a internet e tente npm.cmd install manualmente.
  pause
  exit /b 1
)
echo.
echo Iniciando frontend e API...
echo.
call npm.cmd run dev
pause
