@echo off
:loop
  echo %date% %time%: Script baslatiliyor...
  
  node main.js
  
  REM Scriptin basariyla tamamlanip tamamlanmadigini kontrol et
  IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo HATA: Script calismayi durdurdu!
    echo.
  ) ELSE (
    echo.
    echo %date% %time%: Script basariyla tamamlandi.
  )
  
  REM 20-25 saniye arasi rastgele bir bekleme suresi hesapla
  SET /A "RANDOM_DELAY=(%RANDOM% %% 6) + 5"
  echo %RANDOM_DELAY% saniye bekleniyor...
  
  timeout /t %RANDOM_DELAY% /nobreak
goto loop