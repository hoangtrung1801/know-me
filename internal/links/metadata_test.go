package links

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func mustURL(raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		panic(err)
	}
	return u
}

func mustRequest(raw string) *http.Request {
	req, err := http.NewRequest(http.MethodGet, raw, nil)
	if err != nil {
		panic(err)
	}
	return req
}

func TestParseMetadataUsesApprovedPrecedenceAndResolvesImage(t *testing.T) {
	htmlBody := `<html><head>
		<title>HTML title</title>
		<meta name="twitter:title" content="Twitter title">
		<meta property="og:title" content="OG title">
		<meta name="description" content="Standard description">
		<meta property="og:description" content="OG description">
		<meta name="twitter:image" content="/twitter.png">
		<meta property="og:image" content="/cover.png">
	</head></html>`

	got, err := parseMetadata(strings.NewReader(htmlBody), mustURL("https://example.com/articles/1"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "OG title" || got.Description != "OG description" || got.Image != "https://example.com/cover.png" {
		t.Fatalf("metadata = %#v", got)
	}
}

func TestParseMetadataFallsBackToHTMLTitle(t *testing.T) {
	got, err := parseMetadata(strings.NewReader(`<html><head><title>HTML fallback</title></head></html>`), mustURL("https://example.com"))
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "HTML fallback" {
		t.Fatalf("title = %q, want HTML fallback", got.Title)
	}
}

func TestPublicIPRejectsNonPublicRanges(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "10.0.0.1", "169.254.1.1", "::1", "fc00::1", "0.0.0.0"} {
		if isPublicIP(net.ParseIP(raw)) {
			t.Fatalf("%s accepted", raw)
		}
	}
	if !isPublicIP(net.ParseIP("93.184.216.34")) {
		t.Fatal("public address rejected")
	}
}

func TestRedirectPolicyRejectsPrivateTargetsAndMoreThanFiveRedirects(t *testing.T) {
	privateLookup := func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}}, nil
	}
	if err := validatePublicURL(context.Background(), mustURL("http://internal.test"), privateLookup); !errors.Is(err, ErrUnsafeURL) {
		t.Fatalf("private target error = %v", err)
	}

	publicLookup := func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
	}
	via := make([]*http.Request, maxRedirects)
	if err := checkRedirect(context.Background(), publicLookup)(mustRequest("https://example.com"), via); err == nil {
		t.Fatal("sixth request was accepted")
	}
}
