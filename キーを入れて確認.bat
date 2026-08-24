@echo off
chcp 65001 >nul
cd /d L:\10\claude_demo\mottainai

echo.
echo  .env をメモ帳で開きます。
echo  GEMINI_API_KEY= の後ろにキーを貼って、上書き保存して閉じてください。
echo.
pause

notepad .env

echo.
echo  キーを確認しています...
echo.
node tools\check_key.js

echo.
pause
