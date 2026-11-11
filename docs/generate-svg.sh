#!/usr/bin/env bash
# Gera um SVG por cada ficheiro .puml dentro de uma pasta puml/, na pasta svg/ irmã.
set -euo pipefail

DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "-l" ]]; then
    find "$DOCS" -path "*/puml/*.puml" | sort | sed "s|$DOCS/||"
    exit 0
fi

command -v plantuml >/dev/null || { echo "erro: plantuml não encontrado no PATH" >&2; exit 1; }

failed=0
while IFS= read -r f; do
    out="$(dirname "$(dirname "$f")")/svg"
    mkdir -p "$out"
    if plantuml -tsvg -o "$out" "$f"; then
        echo "ok      ${f#"$DOCS/"}"
    else
        echo "FALHOU  ${f#"$DOCS/"}" >&2
        failed=$((failed + 1))
    fi
done < <(find "$DOCS" -path "*/puml/*.puml" | sort)

[[ $failed -eq 0 ]] || { echo "$failed diagrama(s) com erro" >&2; exit 1; }
