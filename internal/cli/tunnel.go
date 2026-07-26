package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/howznguyen/knowns/internal/tunnel/cloudflared"
)

var tunnelCmd = &cobra.Command{
	Use:   "tunnel",
	Short: "Manage Cloudflare Quick Tunnels for the local server",
}

var tunnelStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the current tunnel URL for a port",
	RunE: func(cmd *cobra.Command, args []string) error {
		port, _ := cmd.Flags().GetInt("port")
		d := cloudflared.NewDaemon(port)
		pid, err := d.ReadPID()
		if err != nil {
			fmt.Fprintln(cmd.OutOrStdout(), "no tunnel running for port", port)
			return nil
		}
		url, _ := d.PublicURL()
		fmt.Fprintf(cmd.OutOrStdout(), "pid=%d\nport=%d\nurl=%s\n", pid, port, url)
		return nil
	},
}

var tunnelStopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the cloudflared tunnel for a port",
	RunE: func(cmd *cobra.Command, args []string) error {
		port, _ := cmd.Flags().GetInt("port")
		if err := cloudflared.NewDaemon(port).Stop(); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "tunnel stopped for port %d\n", port)
		return nil
	},
}

func init() {
	tunnelStatusCmd.Flags().Int("port", defaultBrowserPort, "Local port the tunnel targets")
	tunnelStopCmd.Flags().Int("port", defaultBrowserPort, "Local port the tunnel targets")

	tunnelCmd.AddCommand(tunnelStatusCmd)
	tunnelCmd.AddCommand(tunnelStopCmd)
	rootCmd.AddCommand(tunnelCmd)
}
