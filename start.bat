@echo off
powershell -Command "& { $Host.UI.RawUI.WindowTitle = 'INC GOREV' }"
color e
pause
cls
:a
node .
goto a