package cli

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/spf13/cobra"
)

func newMemoCmd(service *memos.Service) *cobra.Command {
	if service == nil {
		service = memos.NewService(storage.GlobalRootPath())
	}

	cmd := &cobra.Command{Use: "memo", Short: "Manage global memos"}
	add := &cobra.Command{
		Use:   "add <content>",
		Short: "Add a memo",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			memo, err := service.Add(args[0])
			if err != nil {
				return fmt.Errorf("add memo: %w", err)
			}
			return writeMemoOutput(cmd, memo)
		},
	}

	list := &cobra.Command{
		Use:   "list",
		Short: "List memos",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			query, _ := cmd.Flags().GetString("search")
			items, err := service.List(query)
			if err != nil {
				return fmt.Errorf("list memos: %w", err)
			}
			if isJSON(cmd) {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(items)
			}
			for _, memo := range items {
				if err := writeMemoOutput(cmd, memo); err != nil {
					return err
				}
			}
			return nil
		},
	}
	list.Flags().String("search", "", "Search memo content")

	update := &cobra.Command{
		Use:   "update <id> <content>",
		Short: "Edit a memo",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			memo, err := service.Update(args[0], args[1])
			if err != nil {
				return fmt.Errorf("update memo: %w", err)
			}
			return writeMemoOutput(cmd, memo)
		},
	}

	remove := &cobra.Command{
		Use:   "delete <id>",
		Short: "Delete a memo",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := service.Delete(args[0]); err != nil {
				return fmt.Errorf("delete memo: %w", err)
			}
			if isJSON(cmd) {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(map[string]any{"id": args[0], "deleted": true})
			}
			_, err := fmt.Fprintf(cmd.OutOrStdout(), "deleted %s\n", args[0])
			return err
		},
	}

	cmd.AddCommand(add, list, update, remove)
	return cmd
}

func writeMemoOutput(cmd *cobra.Command, memo *models.Memo) error {
	if isJSON(cmd) {
		return json.NewEncoder(cmd.OutOrStdout()).Encode(memo)
	}
	_, err := fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\n", memo.ID, strings.ReplaceAll(memo.Content, "\n", " "))
	return err
}

func init() { rootCmd.AddCommand(newMemoCmd(nil)) }
