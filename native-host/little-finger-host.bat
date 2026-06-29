:: Little Finger Native Host wrapper for Windows
:: Chrome on Windows needs a Windows-executable path.
:: This batch file calls the Python host script via WSL.
@echo off
wsl.exe -d Ubuntu-24.04 -- python3 /home/eric/little-finger/native-host/little-finger-host.py
