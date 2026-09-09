# Installation

Install the `knowns` CLI first. Installation only makes the command available; you still need to run `knowme init` inside each repository where you want Know-Me-managed project context.

## Requirements

- a supported terminal environment on macOS, Linux, or Windows
- Git if you want repository-aware init/setup behavior
- optional local model downloads if you plan to use semantic search

## Platform support

| Platform | CLI artifact | Bundled local ONNX |
| --- | --- | --- |
| macOS Apple Silicon | `darwin-arm64` | Yes |
| macOS Intel (x86_64) | `darwin-x64` | No |
| Linux x64 | `linux-x64` | Yes |
| Linux ARM64 | `linux-arm64` | Yes |
| Windows x64 | `win32-x64` | Yes |

On macOS Intel, the full CLI and keyword/BM25 search remain available. Local ONNX controls are disabled because ONNX Runtime no longer provides a compatible prebuilt macOS x86_64 library. For semantic search, use Ollama or an OpenAI-compatible API provider.

Advanced users can explicitly set `KNOWN_ORT_LIB` to a compatible x86_64 `libonnxruntime.dylib`; Know-Me will then enable the local ONNX provider.

## Homebrew

```bash
brew install knowns-dev/tap/knowns
```

Recommended on macOS and Linux when you want a packaged install.

## npm

```bash
npm install -g knowns
```

Useful when your environment already uses Node tooling.

## Shell installer (macOS/Linux)

```bash
curl -fsSL https://knowns.sh/script/install | sh
```

## PowerShell installer (Windows)

```powershell
irm https://knowns.sh/script/install.ps1 | iex
```

## Build from source

```bash
go build -o ./bin/knowme ./cmd/knowme
```

Best option when developing Know-Me itself.

## Manual binary install

Use this when you already downloaded a release archive or want to install one
without the installer script. The private repository requires a GitHub PAT
with read access to repository contents.

```bash
export GITHUB_PAT=ghp_...
VERSION=v1.0.1
PLATFORM=linux-x64 # darwin-arm64, darwin-x64, or linux-arm64
ARCHIVE="knowns-${PLATFORM}.tar.gz"
BASE_URL="https://github.com/hoangtrung1801/know-me/releases/download/${VERSION}"

mkdir -p "$HOME/.know-me/bin"
curl -fsSL -H "Authorization: Bearer $GITHUB_PAT" \
  -o "/tmp/$ARCHIVE" "$BASE_URL/$ARCHIVE"
curl -fsSL -H "Authorization: Bearer $GITHUB_PAT" \
  -o "/tmp/$ARCHIVE.sha256" "$BASE_URL/$ARCHIVE.sha256"

echo "$(awk '{print $1}' "/tmp/$ARCHIVE.sha256")  /tmp/$ARCHIVE" \
  | shasum -a 256 -c -
tar -xzf "/tmp/$ARCHIVE" -C "$HOME/.know-me/bin"
chmod +x "$HOME/.know-me/bin/knowme"
ln -sf "$HOME/.know-me/bin/knowme" "$HOME/.know-me/bin/kn"

export PATH="$HOME/.know-me/bin:$PATH"
knowme --version
```

For a binary already extracted, copy it directly:

```bash
mkdir -p "$HOME/.know-me/bin"
cp ./knowme "$HOME/.know-me/bin/knowme"
chmod +x "$HOME/.know-me/bin/knowme"
ln -sf "$HOME/.know-me/bin/knowme" "$HOME/.know-me/bin/kn"
export PATH="$HOME/.know-me/bin:$PATH"
knowme --version
```

## Verify

```bash
knowme --version
```

If the command prints a version, the CLI is installed. Next, move into the repository you want to manage and run the quick start.

## No-global-install option

If you do not want a global install, you can still run Know-Me through npm:

```bash
npx knowme init
```

## Next step

- [Quick start](./quick-start.md)
