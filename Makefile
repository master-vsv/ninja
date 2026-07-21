# NDT-Ninja — Makefile для управления проектом.
# Клон Fruit Ninja в теме неразрушающего контроля (NDT).
# Стек: Phaser 3 + Matter.js + PolyK + Vite + TypeScript + Vitest.
#
# Использование:
#   make            — показать список целей (help)
#   make dev        — запустить dev-сервер (http://localhost:5173)
#   make build      — production-сборка в dist/
#   make test       — unit-тесты (watch-режим)
#   make check      — typecheck + test:run (один прогон)
#
# Все цели делегируют в npm-скрипты (package.json). Make — тонкая обёртка
# для удобного запуска и автодополнения в shell.

.PHONY: help install dev build preview test test-run typecheck check clean all

## 📖 help: список целей (по умолчанию)
help: ## Показать список целей
	@echo "NDT-Ninja — команды управления проектом"
	@echo ""
	@echo "Доступные цели:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Примеры:"
	@echo "  make dev      — запустить dev-сервер"
	@echo "  make check    — typecheck + тесты (один прогон)"
	@echo "  make all      — install + check + build"

## 📦 install: установить зависимости (npm install)
install: ## Установить npm-зависимости
	npm install

## 🚀 dev: запустить dev-сервер (vite, http://localhost:5173)
dev: ## Dev-сервер (Vite, http://localhost:5173)
	npm run dev

## 🏗️ build: production-сборка в dist/
build: ## Production-сборка (vite build → dist/)
	npm run build

## 👁️ preview: предпросмотр production-сборки
preview: ## Предпросмотр build (vite preview)
	npm run preview

## 🧪 test: unit-тесты в watch-режиме (vitest)
test: ## Unit-тесты (vitest, watch)
	npm test

## ✅ test-run: unit-тесты одним прогоном (vitest run)
test-run: ## Unit-тесты одним прогоном (vitest run)
	npm run test:run

## 🔍 typecheck: проверка типов TypeScript (tsc --noEmit)
typecheck: ## Проверка типов (tsc --noEmit)
	npm run typecheck

## 🛡️ check: typecheck + test:run (полная проверка перед коммитом)
check: typecheck test-run ## typecheck + test:run (один прогон)

## 🧹 clean: удалить артефакты сборки (dist/, кэш vite)
clean: ## Удалить dist/ и кэш Vite
	rm -rf dist
	rm -rf node_modules/.vite

## 🎯 all: install + check + build (полный CI-прогон локально)
all: install check build ## install + check + build (полный прогон)

# Цель по умолчанию.
.DEFAULT_GOAL := help
