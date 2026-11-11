# Documentação

| Documento | Conteúdo |
|---|---|
| [backlog.md](backlog.md) | Product backlog, critérios de aceitação, plano de sprints e Definition of Done |
| [system-documentation/](system-documentation/README.md) | Artefactos de engenharia: glossário, DM, CD, casos de uso, SSD e SD |

Para regenerar os diagramas (requer `plantuml` no `PATH`):

```bash
./docs/generate-svg.sh        # gera todos os SVG
./docs/generate-svg.sh -l     # lista os .puml e o SVG correspondente
```
