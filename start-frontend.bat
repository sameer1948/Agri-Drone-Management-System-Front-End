@echo off
title Sri Jagadeeswara AGRI Drone - Angular Frontend
color 0B

echo ====================================================
echo Starting Angular Frontend Server (Port 4200)...
echo ====================================================

:: Put your exact project directory path inside the quotes:
cd /d "F:\drone\Agri-Drone-Management-System-Front-End"

call npx ng serve --open

pause