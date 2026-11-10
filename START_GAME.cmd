@echo off
setlocal
cd /d "%~dp0"
set "GAME_URL=http://127.0.0.1:5173/"
set "NODE_HOME="

for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_HOME set "NODE_HOME=%%~dpN"
if defined NODE_HOME if not exist "%NODE_HOME%npm.cmd" set "NODE_HOME="
if defined NODE_HOME (
  "%NODE_HOME%node.exe" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>nul
  if errorlevel 1 set "NODE_HOME="
)

if not defined NODE_HOME (
  set "NODE_HOME=%LOCALAPPDATA%\KingdomDefender\runtime\node-v22.23.4-win-x64\"
  if not exist "%NODE_HOME%node.exe" goto install_node
  goto check_dependencies
)

goto check_dependencies

:install_node
echo Node.js is not installed. Downloading the portable Node.js runtime...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $root = Join-Path $env:LOCALAPPDATA 'KingdomDefender\runtime'; $version = 'v22.23.4'; $zip = Join-Path $root 'node.zip'; New-Item -ItemType Directory -Force -Path $root | Out-Null; Invoke-WebRequest -Uri ('https://nodejs.org/dist/' + $version + '/node-' + $version + '-win-x64.zip') -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $root -Force; Remove-Item -LiteralPath $zip -Force"
if errorlevel 1 goto failed

:check_dependencies
set "PATH=%NODE_HOME%;%PATH%"
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing game dependencies. This may take a minute...
  call npm install
  if errorlevel 1 goto failed
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2; if ($response.Content -match 'Kingdom Defender') { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 goto open_game

echo Starting Kingdom Defender...
start "Kingdom Defender Server" "%ComSpec%" /k "cd /d ""%~dp0"" && set ""PATH=%NODE_HOME%;%PATH%"" && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(45); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2; if ($response.Content -match 'Kingdom Defender') { exit 0 } } catch {}; Start-Sleep -Milliseconds 750 } while ((Get-Date) -lt $deadline); exit 1" >nul 2>nul
if errorlevel 1 goto server_failed

:open_game
start "" "%GAME_URL%"
echo Kingdom Defender is open in your browser.
exit /b 0

:server_failed
echo Could not start the game. Check the Kingdom Defender Server window for errors.
pause
exit /b 1

:failed
echo Setup failed. Check your internet connection and try again.
pause
exit /b 1
