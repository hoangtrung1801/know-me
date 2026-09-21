package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

func newModelCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "model",
		Short: "Manage local embedding models",
	}

	download := &cobra.Command{
		Use:   "download [model-id]",
		Short: "Download a local ONNX embedding model",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			modelID := "multilingual-e5-small"
			if len(args) > 0 && strings.TrimSpace(args[0]) != "" {
				modelID = strings.TrimSpace(args[0])
			}
			force, _ := cmd.Flags().GetBool("force")
			return runSemanticSetup(modelID, force)
		},
	}
	download.Flags().BoolP("force", "f", false, "Force re-download even if model is already installed")

	list := &cobra.Command{
		Use:   "list",
		Short: "List supported embedding models and their installation status",
		RunE: func(cmd *cobra.Command, _ []string) error {
			for _, m := range supportedModels {
				status := "not installed"
				if isModelInstalled(&m) {
					status = "installed"
				}
				fmt.Fprintf(cmd.OutOrStdout(), "%-25s %-14s %d dims, %4d MB  (%s)\n", m.ID, status, m.Dimensions, m.SizeMB, m.Name)
			}
			return nil
		},
	}

	cmd.AddCommand(download)
	cmd.AddCommand(list)
	return cmd
}

func init() {
	rootCmd.AddCommand(newModelCmd())
}
