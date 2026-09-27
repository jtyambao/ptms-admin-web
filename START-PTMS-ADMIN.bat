@echo off
rem PTMS Admin Web - local launcher. Runs only on this PC (bound to 127.0.0.1),
rem so it cannot be opened from other computers or the internet.
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js 22 or newer is required. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing PTMS Admin Web - first run only, this can take a few minutes...
  call npm install || (pause & exit /b 1)
)
start "" cmd /c "timeout /t 10 >nul & start http://127.0.0.1:3200/login"
echo PTMS Admin Web is starting at http://127.0.0.1:3200 - keep this window open while using it.
call npx vinext dev --port 3200 --hostname 127.0.0.1
pause
