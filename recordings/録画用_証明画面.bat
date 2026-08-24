@echo off
chcp 65001 >nul
mode con: cols=110 lines=34
cd /d L:\10\claude_demo\mottainai
cls

echo.
echo   MOTTAINAI  --  the money path has no model in it
echo   ---------------------------------------------------------------
echo.
timeout /t 2 /nobreak >nul

echo   ^> npm test
echo.
call node core\selftest.js
echo.
timeout /t 4 /nobreak >nul

echo   ---------------------------------------------------------------
echo   ^> gcloud run services describe mottainai
echo.
set "PATH=%PATH%;L:\gcloud\google-cloud-sdk\bin"
call gcloud run services describe mottainai --region asia-northeast1 --format="value(status.url,status.conditions[0].type,status.conditions[0].status,spec.template.spec.containers[0].image)"
echo.
echo   ---------------------------------------------------------------
echo.
timeout /t 8 /nobreak >nul
