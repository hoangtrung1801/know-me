package main

import (
	"fmt"
	"github.com/howznguyen/knowns/internal/instructions/guidelines"
)

func main() {
	opts := guidelines.RenderOptions{CLI: true, MCP: false}

	rendered, err := guidelines.RenderFull(opts)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Println("=== RENDERED OUTPUT ===")
	fmt.Println(rendered)
	fmt.Println("=== END ===")
}
