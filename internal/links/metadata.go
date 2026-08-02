package links

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const (
	fetchTimeout = 8 * time.Second
	maxHTMLBytes = 2 << 20
	maxRedirects = 5
)

var (
	ErrInvalidURL = errors.New("invalid link URL")
	ErrUnsafeURL  = errors.New("unsafe link URL")
)

type Metadata struct {
	Title       string
	Description string
	Image       string
}

type lookupIPFunc func(context.Context, string) ([]net.IPAddr, error)

func isPublicIP(ip net.IP) bool {
	return ip != nil && !ip.IsLoopback() && !ip.IsPrivate() &&
		!ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() &&
		!ip.IsUnspecified() && !ip.IsMulticast()
}

func validatePublicURL(ctx context.Context, target *url.URL, lookup lookupIPFunc) error {
	if target == nil || target.User != nil || target.Hostname() == "" {
		return ErrInvalidURL
	}
	switch strings.ToLower(target.Scheme) {
	case "http", "https":
	default:
		return ErrInvalidURL
	}
	ips, err := lookup(ctx, target.Hostname())
	if err != nil {
		return err
	}
	if len(ips) == 0 {
		return fmt.Errorf("resolve %s: no addresses", target.Hostname())
	}
	for _, ip := range ips {
		if !isPublicIP(ip.IP) {
			return ErrUnsafeURL
		}
	}
	return nil
}

func checkRedirect(ctx context.Context, lookup lookupIPFunc) func(*http.Request, []*http.Request) error {
	return func(req *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			return fmt.Errorf("too many redirects")
		}
		requestContext := ctx
		if req.Context() != nil {
			requestContext = req.Context()
		}
		return validatePublicURL(requestContext, req.URL, lookup)
	}
}

func newSafeHTTPClient(lookup lookupIPFunc) *http.Client {
	dialer := &net.Dialer{Timeout: fetchTimeout}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			ips, err := lookup(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if !isPublicIP(ip.IP) {
					return nil, ErrUnsafeURL
				}
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("resolve %s: no addresses", host)
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}
	client := &http.Client{Transport: transport, Timeout: fetchTimeout}
	client.CheckRedirect = checkRedirect(context.Background(), lookup)
	return client
}

func FetchMetadata(ctx context.Context, rawURL string) (Metadata, error) {
	target, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return Metadata{}, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	lookup := func(ctx context.Context, host string) ([]net.IPAddr, error) {
		return net.DefaultResolver.LookupIPAddr(ctx, host)
	}
	if err := validatePublicURL(ctx, target, lookup); err != nil {
		return Metadata{}, err
	}
	return fetchMetadata(ctx, target, newSafeHTTPClient(lookup))
}

func fetchMetadata(ctx context.Context, target *url.URL, client *http.Client) (Metadata, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return Metadata{}, err
	}
	req.Header.Set("User-Agent", "Knowns Link Metadata/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return Metadata{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return Metadata{}, fmt.Errorf("metadata request returned %s", resp.Status)
	}
	if !strings.HasPrefix(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") {
		return Metadata{}, fmt.Errorf("metadata response is not HTML")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHTMLBytes+1))
	if err != nil {
		return Metadata{}, err
	}
	if len(body) > maxHTMLBytes {
		return Metadata{}, fmt.Errorf("metadata response exceeds %d bytes", maxHTMLBytes)
	}
	return parseMetadata(strings.NewReader(string(body)), target)
}

func parseMetadata(reader io.Reader, base *url.URL) (Metadata, error) {
	root, err := html.Parse(reader)
	if err != nil {
		return Metadata{}, err
	}
	values := map[string]string{}
	var title string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch strings.ToLower(node.Data) {
			case "title":
				if title == "" {
					title = strings.TrimSpace(nodeText(node))
				}
			case "meta":
				var key, value string
				for _, attr := range node.Attr {
					switch strings.ToLower(attr.Key) {
					case "name", "property":
						key = strings.ToLower(strings.TrimSpace(attr.Val))
					case "content":
						value = strings.TrimSpace(attr.Val)
					}
				}
				if key != "" && value != "" {
					if _, exists := values[key]; !exists {
						values[key] = value
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)

	titleValue := firstMetadata(values, "og:title", "twitter:title")
	if titleValue == "" {
		titleValue = title
	}
	result := Metadata{
		Title:       titleValue,
		Description: firstMetadata(values, "og:description", "description", "twitter:description"),
	}
	image := firstMetadata(values, "og:image", "twitter:image")
	if image != "" && base != nil {
		if resolved, err := url.Parse(image); err == nil {
			resolved = base.ResolveReference(resolved)
			if (resolved.Scheme == "http" || resolved.Scheme == "https") && resolved.Hostname() != "" {
				result.Image = resolved.String()
			}
		}
	}
	return result, nil
}

func firstMetadata(values map[string]string, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(values[key]); value != "" {
			return value
		}
	}
	return ""
}

func nodeText(node *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.TextNode {
			builder.WriteString(current.Data)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return builder.String()
}
