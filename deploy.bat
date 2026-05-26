@echo off
chcp 65001 > nul
cd /d "C:\Users\wncks\my-homepage"
echo Deploying...
call "C:\Users\wncks\AppData\Roaming\npm\netlify.cmd" deploy --prod
echo.
echo Done! kh-alwaysbluehani.co.kr
pause