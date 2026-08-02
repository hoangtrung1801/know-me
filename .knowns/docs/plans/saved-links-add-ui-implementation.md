---
title: Saved Links Add UI implementation
description: Add creation dialog and client call to the Saved Links web page
createdAt: '2026-08-02T15:23:16.216Z'
updatedAt: '2026-08-02T15:23:16.216Z'
tags: []
---

# Saved Links Add UI Implementation Plan

Goal: add a web Add Link dialog that saves a URL immediately through POST /api/links and inserts the returned card.

1. Add a Playwright test that expects an Add Link button, fills a URL, submits, and sees the created card.
2. Add linkApi.add(url: string, image?: File) using FormData and POST /api/links.
3. Add dialog state and submit logic in LinksPage, with a required URL input, optional image input, and Add Link page action.
4. Run the focused Playwright test and UI build.
