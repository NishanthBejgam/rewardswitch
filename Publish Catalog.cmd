@echo off
title Reward Switch - publish catalogue
cd /d "%~dp0"

echo.
echo  Reward Switch - reading every known Amazon Pay reward from this PC
echo  -------------------------------------------------------------------
echo  GitHub does this every two hours on its own; run this when you have
echo  added ids to seed\catalog.json or want the site refreshed right now.
echo.

set RS_PACE=4
python tools\build_site.py _site
if errorlevel 1 goto :failed

git add seed/catalog.json seed/published.json
git diff --cached --quiet && goto :nochange

for /f "tokens=1-3 delims=/: " %%a in ("%time%") do set NOW=%%a:%%b
git commit -q -m "Catalogue swept from home %date% %NOW%"
git push -q origin main
if errorlevel 1 goto :failed

echo.
echo  Published. The site rebuilds and goes live in a few minutes:
echo  https://rewardswitch.yourcardjourney.store
echo.
pause
exit /b 0

:nochange
echo.
echo  Nothing changed - the published catalogue already matches this sweep.
echo.
pause
exit /b 0

:failed
echo.
echo  Something went wrong above. Nothing was published.
echo.
pause
exit /b 1
