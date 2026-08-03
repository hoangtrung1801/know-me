# Memo Hashtag Filter Design

## Goal

Let users filter Memos by hashtags written in memo content without changing memo storage or APIs.

## Tag Recognition

Recognize whitespace-started hashtag tokens such as `#work` and `#công_việc`. A Markdown heading such as `# Morning` remains a heading because the `#` is followed by whitespace. Tags are derived from current memo text, deduplicated, and sorted.

## UI Flow

Reuse the Saved Links compact tag-filter controls above the memo list. `All tags` clears the selection. Selecting one or more tags shows memos containing any selected tag. Existing text search remains active, so its server result is narrowed by the tag selection. No tag chips, tag management, backend filter parameter, or persistence schema is added.

## Testing

Extend the existing Memos browser flow to add tagged memos, select a tag, confirm only matching memos remain, and clear the filter.
