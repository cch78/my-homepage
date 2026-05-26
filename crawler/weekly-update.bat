@echo off
cd /d "C:\Users\wncks\my-homepage\crawler"
echo [%date% %time%] 리뷰 크롤링 시작 >> crawl-log.txt
node crawl-reviews.js >> crawl-log.txt 2>&1
echo [%date% %time%] 완료 >> crawl-log.txt
