package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"

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
			tags, _ := cmd.Flags().GetStringSlice("tag")
			if cmd.Flags().Changed("tags") {
				extra, _ := cmd.Flags().GetStringSlice("tags")
				tags = append(tags, extra...)
			}
			if isRemote {
				var link models.Link
				body := map[string]any{"url": args[0], "note": note, "tags": tags}
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
			link, err := getService().AddWithTags(cmd.Context(), args[0], note, tags, image)
			if err != nil {
				return fmt.Errorf("add link: %w", err)
			}
			return writeLinkOutput(cmd, link)
		},
	}
	add.Flags().String("image", "", "Import a local image")
	add.Flags().String("note", "", "Add a note")
	add.Flags().StringSliceP("tag", "t", nil, "Tag for the link (repeatable or comma-separated)")
	add.Flags().StringSlice("tags", nil, "Alias for --tag")
	_ = add.Flags().MarkHidden("tags")
	list := &cobra.Command{
		Use:   "list",
		Short: "List saved links",
		RunE: func(cmd *cobra.Command, _ []string) error {
			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}

			searchQuery, _ := cmd.Flags().GetString("search")
			searchQuery = strings.TrimSpace(searchQuery)
			mode, _ := cmd.Flags().GetString("mode")
			if mode == "" {
				mode = "keyword"
			}

			if searchQuery != "" {
				var ranked []links.RankedLink
				if isRemote {
					searchPath := fmt.Sprintf("/api/links?q=%s&mode=%s", url.QueryEscape(searchQuery), url.QueryEscape(mode))
					var raw json.RawMessage
					if err := remote.GetJSON(searchPath, nil, &raw); err != nil {
						return fmt.Errorf("list links: %w", err)
					}
					trimmed := bytes.TrimSpace(raw)
					if len(trimmed) > 0 && trimmed[0] == '[' {
						var bare []models.Link
						if err := json.Unmarshal(trimmed, &bare); err != nil {
							return fmt.Errorf("decode links: %w", err)
						}
						for _, l := range bare {
							ranked = append(ranked, links.RankedLink{Link: l})
						}
					} else {
						var env struct {
							Links []links.RankedLink `json:"links"`
						}
						if err := json.Unmarshal(trimmed, &env); err != nil {
							return fmt.Errorf("decode links: %w", err)
						}
						ranked = env.Links
					}
				} else {
					var err error
					ranked, _, err = getService().Search(searchQuery, mode)
					if err != nil {
						return fmt.Errorf("list links: %w", err)
					}
				}

				if isJSON(cmd) {
					return json.NewEncoder(cmd.OutOrStdout()).Encode(ranked)
				}
				for _, link := range ranked {
					fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\n", link.ID, link.Title, link.URL)
				}
				return nil
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
	list.Flags().String("search", "", "Search links by title, url, description, note, or tag")
	list.Flags().String("mode", "keyword", "Search mode (keyword, semantic, hybrid)")

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
			var tags []string
			var hasTags bool
			if cmd.Flags().Changed("tag") {
				tags, _ = cmd.Flags().GetStringSlice("tag")
				hasTags = true
			}
			if cmd.Flags().Changed("tags") {
				extra, _ := cmd.Flags().GetStringSlice("tags")
				tags = append(tags, extra...)
				hasTags = true
			}

			remote, isRemote, remoteErr := RemoteForCommand(cmd)
			if remoteErr != nil {
				return remoteErr
			}
			if isRemote {
				var link models.Link
				body := map[string]any{
					"title":       title,
					"description": description,
					"note":        note,
				}
				if hasTags {
					body["tags"] = tags
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
			var updateTags []string
			if hasTags {
				updateTags = tags
			} else {
				updateTags = nil
			}
			link, err := getService().UpdateWithTags(cmd.Context(), args[0], title, description, note, updateTags, image)
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
	update.Flags().StringSlice("tag", nil, "New tags for the link (repeatable or comma-separated)")
	update.Flags().StringSlice("tags", nil, "Alias for --tag")
	_ = update.Flags().MarkHidden("tags")
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
