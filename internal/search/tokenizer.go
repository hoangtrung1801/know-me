package search

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Tokenizer is the interface for all tokenizer implementations.
type Tokenizer interface {
	Encode(text string, maxLength int) TokenizerOutput
}

// TokenizerOutput holds the result of tokenization, ready for ONNX input.
type TokenizerOutput struct {
	InputIDs      []int64
	AttentionMask []int64
	TokenTypeIDs  []int64
}

// tokenizerJSONHeader is used to detect model type before full parsing.
type tokenizerJSONHeader struct {
	Model struct {
		Type string `json:"type"`
	} `json:"model"`
	AddedTokens []struct {
		ID      int    `json:"id"`
		Content string `json:"content"`
		Special bool   `json:"special"`
	} `json:"added_tokens"`
}

// LoadTokenizer reads a tokenizer.json and returns the appropriate Tokenizer.
func LoadTokenizer(modelDir string) (Tokenizer, error) {
	path := filepath.Join(modelDir, "tokenizer.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("tokenizer: read %s: %w", path, err)
	}

	var header tokenizerJSONHeader
	if err := json.Unmarshal(data, &header); err != nil {
		return nil, fmt.Errorf("tokenizer: parse header: %w", err)
	}

	switch header.Model.Type {
	case "WordPiece":
		return loadWordPieceTokenizer(data, header)
	case "Unigram":
		return loadUnigramTokenizer(data, header)
	default:
		return nil, fmt.Errorf("tokenizer: unsupported model type %q", header.Model.Type)
	}
}

// ─── WordPiece Tokenizer ─────────────────────────────────────────────

// WordPieceTokenizer implements BERT-style WordPiece tokenization.
type WordPieceTokenizer struct {
	vocab    map[string]int
	idToTok  map[int]string
	unkToken string
	unkID    int
	clsID    int
	sepID    int
	padID    int
	prefix   string // continuing subword prefix, typically "##"

	maxInputChars int
	lowercase     bool
	stripAccents  bool
	cleanText     bool
	handleChinese bool
}

type wordPieceJSON struct {
	Model struct {
		Type                    string         `json:"type"`
		Vocab                   map[string]int `json:"vocab"`
		UnkToken                string         `json:"unk_token"`
		ContinuingSubwordPrefix string         `json:"continuing_subword_prefix"`
		MaxInputCharsPerWord    int            `json:"max_input_chars_per_word"`
	} `json:"model"`
	Normalizer *struct {
		Type              string `json:"type"`
		Lowercase         bool   `json:"lowercase"`
		StripAccents      *bool  `json:"strip_accents"`
		CleanText         bool   `json:"clean_text"`
		HandleChineseChar bool   `json:"handle_chinese_chars"`
	} `json:"normalizer"`
}

func loadWordPieceTokenizer(data []byte, header tokenizerJSONHeader) (*WordPieceTokenizer, error) {
	var tj wordPieceJSON
	if err := json.Unmarshal(data, &tj); err != nil {
		return nil, fmt.Errorf("tokenizer: parse: %w", err)
	}

	t := &WordPieceTokenizer{
		vocab:         tj.Model.Vocab,
		unkToken:      tj.Model.UnkToken,
		prefix:        tj.Model.ContinuingSubwordPrefix,
		maxInputChars: tj.Model.MaxInputCharsPerWord,
		lowercase:     true,
		stripAccents:  true,
		cleanText:     true,
		handleChinese: true,
	}

	if t.prefix == "" {
		t.prefix = "##"
	}
	if t.maxInputChars <= 0 {
		t.maxInputChars = 100
	}

	if tj.Normalizer != nil {
		t.lowercase = tj.Normalizer.Lowercase
		t.cleanText = tj.Normalizer.CleanText
		t.handleChinese = tj.Normalizer.HandleChineseChar
		if tj.Normalizer.StripAccents != nil {
			t.stripAccents = *tj.Normalizer.StripAccents
		} else {
			t.stripAccents = t.lowercase
		}
	}

	t.idToTok = make(map[int]string, len(t.vocab))
	for tok, id := range t.vocab {
		t.idToTok[id] = tok
	}

	t.unkID = t.vocab[t.unkToken]
	t.clsID = lookupSpecialToken("[CLS]", header.AddedTokens, t.vocab)
	t.sepID = lookupSpecialToken("[SEP]", header.AddedTokens, t.vocab)
	t.padID = lookupSpecialToken("[PAD]", header.AddedTokens, t.vocab)

	return t, nil
}

// Encode tokenizes text and returns model-ready tensors.
func (t *WordPieceTokenizer) Encode(text string, maxLength int) TokenizerOutput {
	if maxLength <= 0 {
		maxLength = 512
	}

	text = t.normalize(text)
	words := t.preTokenize(text)

	var tokenIDs []int64
	tokenIDs = append(tokenIDs, int64(t.clsID))

	for _, word := range words {
		ids := t.wordPiece(word)
		if len(tokenIDs)+len(ids)+1 > maxLength {
			remaining := maxLength - len(tokenIDs) - 1
			if remaining > 0 {
				tokenIDs = append(tokenIDs, ids[:remaining]...)
			}
			break
		}
		tokenIDs = append(tokenIDs, ids...)
	}

	tokenIDs = append(tokenIDs, int64(t.sepID))
	return buildOutput(tokenIDs)
}

func (t *WordPieceTokenizer) normalize(text string) string {
	if t.cleanText {
		text = cleanText(text)
	}
	if t.handleChinese {
		text = tokenizeChineseChars(text)
	}
	if t.lowercase {
		text = strings.ToLower(text)
	}
	if t.stripAccents {
		text = stripAccents(text)
	}
	return text
}

func (t *WordPieceTokenizer) preTokenize(text string) []string {
	var words []string
	var current strings.Builder

	for _, r := range text {
		if unicode.IsSpace(r) {
			if current.Len() > 0 {
				words = append(words, current.String())
				current.Reset()
			}
			continue
		}
		if isPunctuation(r) {
			if current.Len() > 0 {
				words = append(words, current.String())
				current.Reset()
			}
			words = append(words, string(r))
			continue
		}
		current.WriteRune(r)
	}
	if current.Len() > 0 {
		words = append(words, current.String())
	}

	return words
}

func (t *WordPieceTokenizer) wordPiece(word string) []int64 {
	if len([]rune(word)) > t.maxInputChars {
		return []int64{int64(t.unkID)}
	}

	runes := []rune(word)
	var tokens []int64
	start := 0

	for start < len(runes) {
		end := len(runes)
		found := false

		for end > start {
			substr := string(runes[start:end])
			if start > 0 {
				substr = t.prefix + substr
			}

			if id, ok := t.vocab[substr]; ok {
				tokens = append(tokens, int64(id))
				found = true
				break
			}
			end--
		}

		if !found {
			tokens = append(tokens, int64(t.unkID))
			start++
			continue
		}
		start = end
	}

	return tokens
}

// ─── Unigram (SentencePiece) Tokenizer ───────────────────────────────

// UnigramTokenizer implements SentencePiece Unigram tokenization using the
// Viterbi algorithm for optimal segmentation.
type UnigramTokenizer struct {
	vocab   map[string]int     // token -> id
	scores  map[string]float64 // token -> log probability
	unkID   int
	bosID   int // beginning of sequence (<s>)
	eosID   int // end of sequence (</s>)
	padID   int

	// maxPieceLen is the length of the longest token in the vocab (in runes).
	maxPieceLen int
}

type unigramJSON struct {
	Model struct {
		Type  string          `json:"type"`
		Vocab json.RawMessage `json:"vocab"`
	} `json:"model"`
}

func loadUnigramTokenizer(data []byte, header tokenizerJSONHeader) (*UnigramTokenizer, error) {
	var tj unigramJSON
	if err := json.Unmarshal(data, &tj); err != nil {
		return nil, fmt.Errorf("tokenizer: parse: %w", err)
	}

	// Parse vocab: array of [token, score] pairs. Index = token ID.
	var rawVocab [][]json.RawMessage
	if err := json.Unmarshal(tj.Model.Vocab, &rawVocab); err != nil {
		return nil, fmt.Errorf("tokenizer: parse vocab: %w", err)
	}

	t := &UnigramTokenizer{
		vocab:  make(map[string]int, len(rawVocab)),
		scores: make(map[string]float64, len(rawVocab)),
	}

	for i, entry := range rawVocab {
		if len(entry) < 2 {
			continue
		}
		var token string
		var score float64
		if err := json.Unmarshal(entry[0], &token); err != nil {
			continue
		}
		if err := json.Unmarshal(entry[1], &score); err != nil {
			continue
		}
		t.vocab[token] = i
		t.scores[token] = score
		runeLen := len([]rune(token))
		if runeLen > t.maxPieceLen {
			t.maxPieceLen = runeLen
		}
	}

	// Resolve special tokens.
	t.unkID = lookupSpecialToken("<unk>", header.AddedTokens, t.vocab)
	t.bosID = lookupSpecialToken("<s>", header.AddedTokens, t.vocab)
	t.eosID = lookupSpecialToken("</s>", header.AddedTokens, t.vocab)
	t.padID = lookupSpecialToken("<pad>", header.AddedTokens, t.vocab)

	return t, nil
}

// Encode tokenizes text and returns model-ready tensors.
func (t *UnigramTokenizer) Encode(text string, maxLength int) TokenizerOutput {
	if maxLength <= 0 {
		maxLength = 512
	}

	// Metaspace pre-tokenization: add leading ▁, replace spaces with ▁.
	text = strings.TrimSpace(text)
	text = "\u2581" + strings.ReplaceAll(text, " ", "\u2581")

	// Viterbi segmentation.
	pieces := t.viterbi(text)

	var tokenIDs []int64
	tokenIDs = append(tokenIDs, int64(t.bosID))

	for _, piece := range pieces {
		if len(tokenIDs)+2 > maxLength { // +1 for this token, +1 for EOS
			break
		}
		if id, ok := t.vocab[piece]; ok {
			tokenIDs = append(tokenIDs, int64(id))
		} else {
			tokenIDs = append(tokenIDs, int64(t.unkID))
		}
	}

	tokenIDs = append(tokenIDs, int64(t.eosID))
	return buildOutput(tokenIDs)
}

// viterbi finds the optimal segmentation using the Viterbi algorithm.
func (t *UnigramTokenizer) viterbi(text string) []string {
	runes := []rune(text)
	n := len(runes)
	if n == 0 {
		return nil
	}

	const negInf = -1e18

	// best[i] = best log-probability for text[0:i].
	best := make([]float64, n+1)
	// backPtr[i] = start index of the token ending at position i.
	backPtr := make([]int, n+1)

	best[0] = 0
	for i := 1; i <= n; i++ {
		best[i] = negInf
		backPtr[i] = -1
	}

	for i := 0; i < n; i++ {
		if best[i] == negInf {
			continue
		}
		// Try all possible tokens starting at position i.
		maxEnd := i + t.maxPieceLen
		if maxEnd > n {
			maxEnd = n
		}
		for end := i + 1; end <= maxEnd; end++ {
			piece := string(runes[i:end])
			score, ok := t.scores[piece]
			if !ok {
				// Single character fallback — treat as unknown with a penalty.
				if end == i+1 {
					score = -20.0 // heavy penalty for unknown single chars
				} else {
					continue
				}
			}
			candidate := best[i] + score
			if candidate > best[end] {
				best[end] = candidate
				backPtr[end] = i
			}
		}
	}

	// Handle unreachable end: fall back to single characters.
	if best[n] == negInf || (n > 0 && backPtr[n] == -1) {
		// Fallback: split into single characters.
		pieces := make([]string, n)
		for i, r := range runes {
			pieces[i] = string(r)
		}
		return pieces
	}

	// Trace back to find the optimal segmentation.
	var pieces []string
	pos := n
	for pos > 0 {
		start := backPtr[pos]
		if start < 0 {
			// Safety: shouldn't happen after the check above.
			pieces = append(pieces, string(runes[pos-1:pos]))
			pos--
			continue
		}
		pieces = append(pieces, string(runes[start:pos]))
		pos = start
	}

	// Reverse.
	for i, j := 0, len(pieces)-1; i < j; i, j = i+1, j-1 {
		pieces[i], pieces[j] = pieces[j], pieces[i]
	}

	return pieces
}

// ─── shared helpers ──────────────────────────────────────────────────

func lookupSpecialToken(token string, addedTokens []struct {
	ID      int    `json:"id"`
	Content string `json:"content"`
	Special bool   `json:"special"`
}, vocab map[string]int) int {
	for _, at := range addedTokens {
		if at.Content == token {
			return at.ID
		}
	}
	if id, ok := vocab[token]; ok {
		return id
	}
	return 0
}

func buildOutput(tokenIDs []int64) TokenizerOutput {
	seqLen := len(tokenIDs)
	attentionMask := make([]int64, seqLen)
	tokenTypeIDs := make([]int64, seqLen)
	for i := 0; i < seqLen; i++ {
		attentionMask[i] = 1
	}
	return TokenizerOutput{
		InputIDs:      tokenIDs,
		AttentionMask: attentionMask,
		TokenTypeIDs:  tokenTypeIDs,
	}
}

// ─── BERT normalizer helpers ─────────────────────────────────────────

func cleanText(text string) string {
	var b strings.Builder
	b.Grow(len(text))
	for _, r := range text {
		if r == 0 || r == 0xfffd || isControl(r) {
			continue
		}
		if unicode.IsSpace(r) {
			b.WriteRune(' ')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func stripAccents(text string) string {
	decomposed := norm.NFD.String(text)
	var b strings.Builder
	b.Grow(len(decomposed))
	for _, r := range decomposed {
		if !unicode.Is(unicode.Mn, r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func tokenizeChineseChars(text string) string {
	var b strings.Builder
	b.Grow(len(text) + len(text)/4)
	for _, r := range text {
		if isChineseChar(r) {
			b.WriteRune(' ')
			b.WriteRune(r)
			b.WriteRune(' ')
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isChineseChar(r rune) bool {
	return (r >= 0x4E00 && r <= 0x9FFF) ||
		(r >= 0x3400 && r <= 0x4DBF) ||
		(r >= 0x20000 && r <= 0x2A6DF) ||
		(r >= 0x2A700 && r <= 0x2B73F) ||
		(r >= 0x2B740 && r <= 0x2B81F) ||
		(r >= 0x2B820 && r <= 0x2CEAF) ||
		(r >= 0xF900 && r <= 0xFAFF) ||
		(r >= 0x2F800 && r <= 0x2FA1F)
}

func isPunctuation(r rune) bool {
	cp := int(r)
	if (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) ||
		(cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126) {
		return true
	}
	return unicode.IsPunct(r)
}

func isControl(r rune) bool {
	if r == '\t' || r == '\n' || r == '\r' {
		return false
	}
	return unicode.IsControl(r)
}

