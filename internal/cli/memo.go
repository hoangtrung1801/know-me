package cli

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/hoangtrung1801/know-me/internal/memos"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/spf13/cobra"
)

func newMemoCmd(service *memos.Service) *cobra.Command {
	cmd := &cobra.Command{Use: "memo", Short: "Manage global memos"}

	getService := func() *memos.Service {
		if service != nil {
			return service
		}
		return memos.NewService(storage.GlobalRootPath())
	}

	add := &cobra.Command{
		Use:   "add <content>",
		Short: "Add a memo",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			if isRemote {
				var memo models.Memo
				body := map[string]string{"content": args[0]}
				if err := remote.DoJSON("POST", "/api/memos", nil, body, &memo); err != nil {
					return fmt.Errorf("add memo: %w", err)
				}
				return writeMemoOutput(cmd, &memo)
			}
			memo, err := getService().Add(args[0])
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
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}

			var items []*models.Memo
			if isRemote {
				q := url.Values{}
				if query != "" {
					q.Set("q", query)
				}
				if err := remote.GetJSON("/api/memos", q, &items); err != nil {
					return fmt.Errorf("list memos: %w", err)
				}
			} else {
				var err error
				items, err = getService().List(query)
				if err != nil {
					return fmt.Errorf("list memos: %w", err)
				}
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
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			if isRemote {
				var memo models.Memo
				body := map[string]string{"content": args[1]}
				if err := remote.DoJSON("PATCH", "/api/memos/"+url.PathEscape(args[0]), nil, body, &memo); err != nil {
					return fmt.Errorf("update memo: %w", err)
				}
				return writeMemoOutput(cmd, &memo)
			}
			memo, err := getService().Update(args[0], args[1])
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
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			if isRemote {
				if err := remote.DoJSON("DELETE", "/api/memos/"+url.PathEscape(args[0]), nil, nil, nil); err != nil {
					return fmt.Errorf("delete memo: %w", err)
				}
			} else {
				if err := getService().Delete(args[0]); err != nil {
					return fmt.Errorf("delete memo: %w", err)
				}
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
