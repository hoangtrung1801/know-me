package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"

	"github.com/hoangtrung1801/know-me/internal/links"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/spf13/cobra"
)

func newLinkCmd(service *links.Service) *cobra.Command {
	cmd := &cobra.Command{Use: "link", Short: "Manage saved links"}

	getService := func() *links.Service {
		if service != nil {
			return service
		}
		return links.NewService(storage.GlobalRootPath())
	}

	add := &cobra.Command{
		Use:   "add <url>",
		Short: "Save a link",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			note, _ := cmd.Flags().GetString("note")
			if isRemote {
				var link models.Link
				body := map[string]string{"url": args[0], "note": note}
				if err := remote.DoJSON("POST", "/api/links", nil, body, &link); err != nil {
					return fmt.Errorf("add link: %w", err)
				}
				return writeLinkOutput(cmd, &link)
			}

			var image io.Reader
			var imageFile *os.File
			path, _ := cmd.Flags().GetString("image")
			if path != "" {
				var err error
				imageFile, err = os.Open(path)
				if err != nil {
					return err
				}
				defer imageFile.Close()
				image = imageFile
			}
			link, err := getService().AddWithNote(cmd.Context(), args[0], note, image)
			if err != nil {
				return fmt.Errorf("add link: %w", err)
			}
			return writeLinkOutput(cmd, link)
		},
	}
	add.Flags().String("image", "", "Import a local image")
	add.Flags().String("note", "", "Add a note")

	list := &cobra.Command{
		Use:   "list",
		Short: "List saved links",
		RunE: func(cmd *cobra.Command, _ []string) error {
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}

			var items []*models.Link
			if isRemote {
				if err := remote.GetJSON("/api/links", nil, &items); err != nil {
					return fmt.Errorf("list links: %w", err)
				}
			} else {
				var err error
				items, err = getService().List()
				if err != nil {
					return fmt.Errorf("list links: %w", err)
				}
			}

			if isJSON(cmd) {
				return json.NewEncoder(cmd.OutOrStdout()).Encode(items)
			}
			for _, link := range items {
				fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\n", link.ID, link.Title, link.URL)
			}
			return nil
		},
	}

	update := &cobra.Command{
		Use:   "update <id>",
		Short: "Edit a saved link",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var title, description, note *string
			if cmd.Flags().Changed("title") {
				value, _ := cmd.Flags().GetString("title")
				title = &value
			}
			if cmd.Flags().Changed("description") {
				value, _ := cmd.Flags().GetString("description")
				description = &value
			}
			if cmd.Flags().Changed("note") {
				value, _ := cmd.Flags().GetString("note")
				note = &value
			}

			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			if isRemote {
				var link models.Link
				body := map[string]*string{
					"title":       title,
					"description": description,
					"note":        note,
				}
				if err := remote.DoJSON("PATCH", "/api/links/"+url.PathEscape(args[0]), nil, body, &link); err != nil {
					return fmt.Errorf("update link: %w", err)
				}
				return writeLinkOutput(cmd, &link)
			}

			var image io.Reader
			var imageFile *os.File
			path, _ := cmd.Flags().GetString("image")
			if path != "" {
				var err error
				imageFile, err = os.Open(path)
				if err != nil {
					return err
				}
				defer imageFile.Close()
				image = imageFile
			}
			link, err := getService().UpdateWithNote(cmd.Context(), args[0], title, description, note, image)
			if err != nil {
				return fmt.Errorf("update link: %w", err)
			}
			return writeLinkOutput(cmd, link)
		},
	}
	update.Flags().String("title", "", "New title")
	update.Flags().String("description", "", "New description")
	update.Flags().String("note", "", "New note")
	update.Flags().String("image", "", "Replace with a local image")

	cmd.AddCommand(add, list, update)
	return cmd
}

func writeLinkOutput(cmd *cobra.Command, link *models.Link) error {
	if isJSON(cmd) {
		return json.NewEncoder(cmd.OutOrStdout()).Encode(link)
	}
	fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\n", link.ID, link.URL)
	return nil
}

func init() { rootCmd.AddCommand(newLinkCmd(nil)) }
