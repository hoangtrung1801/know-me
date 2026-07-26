@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "VERSION=dev"
for /f "usebackq delims=" %%i in (`git describe --tags 2^>NUL`) do (
  set "VERSION=%%i"
  goto :version_ready
)
:version_ready

set "ORT_GO_MOD_DIR=%USERPROFILE%\go\pkg\mod\github.com\yalue\onnxruntime_go@v1.27.0"
set "ORT_DLL=%ORT_GO_MOD_DIR%\test_data\onnxruntime.dll"

echo [1/4] Building UI...
pushd ui || exit /b 1
call bun install || exit /b 1
call bun run build || exit /b 1
popd

echo [2/4] Installing Windows runtime assets...
pushd sidecar || exit /b 1
call bun install --frozen-lockfile || exit /b 1
popd
if not exist "%ORT_DLL%" (
  echo Missing onnxruntime.dll for onnxruntime_go at %ORT_DLL%
  echo Run: go env GOPATH
  echo Then confirm github.com\yalue\onnxruntime_go@v1.27.0\test_data\onnxruntime.dll exists under that pkg\mod path.
  exit /b 1
)
if exist bin\onnxruntime*.dll del /q bin\onnxruntime*.dll >NUL 2>NUL

echo [3/4] Building Go binaries...
set "CGO_ENABLED=1"
if not defined LLVM_MINGW_BIN set "LLVM_MINGW_BIN=C:\tools\llvm-mingw\bin"
if exist "%LLVM_MINGW_BIN%\x86_64-w64-mingw32-clang.exe" (
  set "PATH=%LLVM_MINGW_BIN%;%PATH%"
  set "CC=%LLVM_MINGW_BIN%\x86_64-w64-mingw32-clang.exe"
) else if exist "%LLVM_MINGW_BIN%\clang.exe" (
  set "PATH=%LLVM_MINGW_BIN%;%PATH%"
  set "CC=%LLVM_MINGW_BIN%\clang.exe"
) else (
  echo Missing llvm-mingw compiler. Expected x86_64-w64-mingw32-clang.exe in %LLVM_MINGW_BIN%
  echo Install llvm-mingw to C:\tools\llvm-mingw or set LLVM_MINGW_BIN before running this script.
  exit /b 1
)
if not exist bin mkdir bin
go build -ldflags "-s -w -X github.com/howznguyen/knowns/internal/util.Version=%VERSION%" -o bin\knowns.exe .\cmd\knowns
if errorlevel 1 exit /b 1
go build -ldflags "-s -w -H windowsgui -X github.com/howznguyen/knowns/internal/util.Version=%VERSION%" -o bin\knowns-embed.exe .\cmd\knowns-embed
if errorlevel 1 exit /b 1

echo [4/4] Copying ONNX runtime DLL to bin...
copy /Y "%ORT_DLL%" bin\onnxruntime.dll >NUL
if errorlevel 1 exit /b 1

echo.
echo Build completed: bin\knowns.exe
echo Native sidecar built: bin\knowns-embed.exe
echo ONNX runtime copied from: %ORT_DLL%
echo.
echo PowerShell test command:
echo   .\bin\knowns.exe search --reindex
