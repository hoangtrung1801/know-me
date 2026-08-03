# Link Auto-Tagging Design

## Goal

When a user saves a link, fetch its SEO metadata, classify it with an OpenAI-compatible chat-completions API, and persist up to three automatic tags.

## Data

Add `tags: []string` to a saved link. Tags are global only by virtue of being collected from all saved links; no tag store or tag-management UI is introduced.

## Flow

1. Validate and save the link URL using the existing safe metadata fetch path.
2. Use the fetched title and description, plus the URL, as classifier input.
3. Load tags already used by saved links and ask the model for a JSON list of at most three short tags. It should reuse a suitable existing tag and create one only when none fits.
4. Normalize, deduplicate, and save the returned tags with the link.
5. If metadata fetch or classification fails, save the link normally with an empty tag list.

## Configuration

Add Settings fields for an OpenAI-compatible base URL, API key, and chat model, including a connection test. The API key remains server-side and is never returned in link responses.

## UI

Show each link's tags as compact chips on the saved-link card. Editing link title, description, or image does not reclassify it.

## Safety and Limits

- Keep existing URL/SSRF protections and fetch limits.
- Send only the URL, title, and description to the classifier.
- Cap classifier output at three tags and reject empty values.
- Classification errors are non-fatal to link creation.

## Testing

- A valid classifier result is persisted and normalized.
- Existing tags are supplied to the classifier and new tags are accepted.
- A classifier error still creates the link with no tags.
- API and UI responses expose persisted tags.
