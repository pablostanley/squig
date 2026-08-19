.PHONY: help install dev build build-xdc package clean

.DEFAULT_GOAL := help

PNPM ?= pnpm
APP_NAME := squig
OUT_DIR := out
DIST_DIR := dist
OUT_XDC := $(DIST_DIR)/$(APP_NAME).xdc

help:
	@echo "squig"
	@echo ""
	@echo "  make install     pnpm install"
	@echo "  make dev         Next.js dev server"
	@echo "  make build       Production Next.js build (server / squig.sh)"
	@echo "  make build-xdc   Static export + Webxdc archive → $(OUT_XDC)"
	@echo "  make package     Alias for make build-xdc"
	@echo "  make clean       Remove .next/, out/, dist/"

install:
	$(PNPM) install

dev:
	$(PNPM) dev

build:
	$(PNPM) build

# Fully offline Delta Chat mini-app: static HTML/JS/CSS + manifest at zip root.
# The out/ wipe matters: the export writes into whatever is already there, so a
# stale file from an earlier build would otherwise be sealed into the archive.
build-xdc:
	@command -v zip >/dev/null || { echo "zip is required to package .xdc"; exit 1; }
	rm -rf $(OUT_DIR)
	WEBXDC=1 $(PNPM) build
	@test -f $(OUT_DIR)/index.html || { echo "static export missing $(OUT_DIR)/index.html"; exit 1; }
	@test -f $(OUT_DIR)/manifest.toml || { echo "missing $(OUT_DIR)/manifest.toml (add public/manifest.toml)"; exit 1; }
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	# The host injects window.webxdc itself; a bundled copy would shadow it.
	# Nothing ships one today — this keeps it that way if a dev shim reappears.
	cd $(OUT_DIR) && zip -9 -r ../$(OUT_XDC) . -x webxdc.js
	@echo ""
	@echo "  → $(OUT_XDC)"
	@echo "  Send this file into a Delta Chat chat and tap Start."

package: build-xdc

clean:
	rm -rf .next out dist
