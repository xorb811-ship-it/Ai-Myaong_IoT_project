# Run Scripts

- `start-backend.bat`
- `start-frontend.bat`
- `start-raspberrypi.bat`
- `setup-python-venv.bat`
- `setup-toolchain.bat`
- `check-versions.bat`
- `rebuild-env.bat`
- `start-backend.sh`
- `start-frontend.sh`
- `allow-backend-firewall-windows.ps1`
- `setup-raspberrypi-wifi.sh`
- `start-raspberrypi.sh`
- `setup-dev-env.sh`
- `setup-toolchain.sh`
- `check-versions.sh`
- `rebuild-env.sh`

Recommended order on Windows:

```cmd
setup-toolchain.bat
setup-python-venv.bat -Target all
rebuild-env.bat all
check-versions.bat all
scripts\start-backend.bat
scripts\start-frontend.bat
scripts\start-raspberrypi.bat
```

Recommended order on macOS or Linux:

```bash
bash ./setup-toolchain.sh
bash ./setup-dev-env.sh -Target all
bash ./rebuild-env.sh all
bash ./check-versions.sh all
bash ./scripts/start-backend.sh
bash ./scripts/start-frontend.sh
bash ./scripts/start-raspberrypi.sh
```

Other Windows examples:

```cmd
scripts\start-backend.bat
scripts\start-frontend.bat
scripts\start-raspberrypi.bat
setup-python-venv.bat -Target all
setup-python-venv.bat -Target backend -SkipInstall
setup-python-venv.bat -Target frontend
setup-toolchain.bat
check-versions.bat desktop
rebuild-env.bat desktop
```

If Raspberry Pi cannot reach the desktop backend on port 8000, run PowerShell as Administrator:

```powershell
.\scripts\allow-backend-firewall-windows.ps1
```

Other macOS or Linux examples:

```bash
bash ./setup-dev-env.sh -Target all
bash ./setup-dev-env.sh -Target frontend
bash ./setup-toolchain.sh
bash ./check-versions.sh desktop
bash ./rebuild-env.sh desktop
bash ./scripts/start-backend.sh
bash ./scripts/start-frontend.sh
bash ./scripts/start-raspberrypi.sh
```
