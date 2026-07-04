# Editor Refactor Checks

Comandi utili da lanciare dalla root del progetto:

```powershell
PS C:\Users\w4k3\Desktop\ClaudDriftGame-Fable5>
```

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

