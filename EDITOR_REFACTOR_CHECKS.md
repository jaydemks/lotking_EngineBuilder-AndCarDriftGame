# Editor Refactor Checks

Questi controlli vengono eseguiti dalla root del progetto.

## Controllare Node

```powershell
node -v
```

Output atteso:

```text
v22.14.0
```

Se stampa una versione, Node funziona.

## Controllare un singolo file JS

```powershell
node --check .\js\editor\editor.js
```

Output atteso se va tutto bene:

```text

```

Nota: nessun output significa "OK". Node stampa qualcosa solo se trova un errore sintattico.

Esempio con errore:

```text
SyntaxError: Unexpected token ...
```

## Controllare alcuni file specifici

```powershell
node --check .\js\editor\editor.js
node --check .\js\editor\loader.js
node --check .\js\editor\folder-manager.js
node --check .\js\editor\keyboard-shortcuts.js
```

Output atteso:

```text

```

Anche qui: niente output = tutto ok.

## Controllare tutti i moduli editor

```powershell
Get-ChildItem .\js\editor\*.js | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -eq 0) { Write-Host "OK $($_.Name)" }
}
```

Output atteso:

```text
OK asset-imports.js
OK asset-library.js
OK dialogs.js
OK editor.js
OK folder-manager.js
OK keyboard-shortcuts.js
OK level-manager.js
OK loader.js
OK playable-export.js
OK player-blueprints.js
OK sound-designer.js
OK status-ui.js
OK viewport-picking.js
```

Se un file ha un errore, Node stampa l'errore e non vedrai `OK nome-file.js` per quel file.

## Nota su npm

Per questi controlli `npm` non serve.

Se `npm -v` mostra un errore tipo:

```text
Impossibile eseguire lo script. Overflow della profondità delle chiamate.
```

puoi ignorarlo durante questo refactor. Per il controllo sintattico usiamo solo:

```powershell
node --check
```

## Dopo ogni pezzo di refactor

Consigliato:

1. Salva i file.
2. Lancia il controllo completo:

```powershell
Get-ChildItem .\js\editor\*.js | ForEach-Object {
  node --check $_.FullName
  if ($LASTEXITCODE -eq 0) { Write-Host "OK $($_.Name)" }
}
```

3. Se tutti i file stampano `OK`, ricarica completamente l'editor nel browser.
4. Prova rapidamente le parti toccate dal refactor.

## Verifica della release v0.7.2

La milestone corrente include Three.js r185, Logic Element, Pawn Studio, FBX, Character/Soccer, caricamento DEMO atomico e contesti input indipendenti. La matrice seguente viene eseguita nell’ambiente Node.js Windows:

```powershell
node .\tests\logic-core.test.js
node .\tests\character-core.test.js
node .\tests\soccer-core.test.js
node .\tests\pawn-studio.test.js
node .\tests\asset-imports-batch-delete.test.js
node .\tests\input-contexts.test.js
npm run verify:three
```

Poi un controllo sintattico rapido sui moduli principali aggiunti/toccati:

```powershell
node --check .\js\logic\logic-graph.js
node --check .\js\logic\logic-exporter.js
node --check .\js\logic\logic-runtime.js
node --check .\js\runtime\logic-elements-runner.js
node --check .\js\runtime\character-animation-set.js
node --check .\js\runtime\character-pawn-base.js
node --check .\js\runtime\soccer-locomotion.js
node --check .\js\editor\logic-elements-inspector.js
node --check .\js\editor\pawn-studio.js
node --check .\js\plugins\fbx-import-plugin.js
node --check .\js\editor\editor-menu-bar.js
node --check .\js\engine\scene-store.js
```

Browser mirato:

```powershell
npx playwright test tests/browser/three-r185.spec.js tests/browser/character-template.spec.js tests/browser/pawn-studio-preview.spec.js --project=desktop-chromium
```

Smoke test manuale consigliato:

1. Apri `engine_editor.html`.
2. Crea un Logic Element e apri il Logic Element Editor.
3. Verifica Graph/Viewport, Print, On Start/On Update, variabili esposte e salvataggio progetto.
4. Avvia Play Preview e controlla il Logic Profiler: timeline, Clear Timeline, breakpoint/step e detail JSON.
5. Salva, ricarica e verifica che Logic Element, musica e HUD Radio restino persistenti.
6. In Pawn Studio assegna una Main Mesh, prova un GLB/FBX Mixamo separato, verifica Play/Stop, scala, reset alla T-pose e cambio rapido tra slot.
7. Nel pannello Assets seleziona più import con Ctrl/Shift e verifica la cancellazione raggruppata.
