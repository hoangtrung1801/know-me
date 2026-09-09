package main

import (
	"os"

	"github.com/hoangtrung1801/know-me/internal/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		os.Exit(cli.ExitCode(err))
	}
}
